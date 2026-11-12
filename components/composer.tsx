"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteReplyPreset, finalizeAdminUploads, prepareAdminReply, saveReplyPreset } from "@/lib/actions/admin";
import { finalizeClientUploads, prepareClientRequest } from "@/lib/actions/client";
import { CreateRequestInsights } from "@/components/create-request-insights";
import { InstantLink } from "@/components/instant-link";
import { ReplyPresetPicker } from "@/components/reply-preset-picker";
import { useCacheScope } from "@/components/view-cache-provider";
import { navigationAfterCreate } from "@/lib/client-nav";
import { TOPICS } from "@/lib/domain";
import { parseRequestText } from "@/lib/request-text";
import type { ReplyPresetRecord } from "@/lib/reply-presets";
import {
  classifySchedule,
  classifyTopicWithRules,
  initialTopicSelection,
  nextWorksiteValue,
  selectTopicManually,
  topicSelectionAfterMatch,
  type TopicPhraseRule,
  type TopicSelection,
} from "@/lib/topic-rules";
import { formatBytes } from "@/lib/format";
import {
  acceptAttribute,
  appendPickedFiles,
  displayFileName,
  MAX_FILES,
  validateFiles,
  type FileMeta,
} from "@/lib/files";
import { sameOriginCompletePlan, sameOriginPartPlan, type UploadTicket } from "@/lib/upload-plan";
import { isUuid } from "@/lib/tokens";
import { browserViewStorage, rememberProvisionalClientRequest } from "@/lib/view-cache";
import { MAX_WORK_LOCATION_LENGTH, parseWorkLocation } from "@/lib/work-location";

type ComposerProps =
  | { audience: "client"; mode: "create"; topicRules: readonly TopicPhraseRule[] }
  | { audience: "admin"; mode: "reply"; requestId: string; presets?: readonly ReplyPresetRecord[] };

async function sendPreparedFile(
  file: File,
  ticket: UploadTicket,
  onProgress: (label: string) => void,
  fileNumber: number,
  fileCount: number,
): Promise<boolean> {
  if (file.size !== ticket.size) return false;
  const parts = sameOriginPartPlan(file.size, ticket);
  const complete = sameOriginCompletePlan(ticket);
  if (!parts || !complete) return false;
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    if (!part) return false;
    const label =
      parts.length > 1
        ? `正在上載 ${fileNumber} / ${fileCount}，第 ${partIndex + 1} / ${parts.length} 段`
        : `正在上載 ${fileNumber} / ${fileCount}`;
    onProgress(label);
    const response = await fetch(part.url, {
      method: part.method,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: part.headers,
      body: file.slice(part.start, part.end),
    });
    if (!response.ok) return false;
  }
  onProgress(`正在上載 ${fileNumber} / ${fileCount}`);
  const completed = await fetch(complete.url, {
    method: complete.method,
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
    headers: complete.headers,
    body: JSON.stringify(complete.body),
  });
  return completed.ok;
}

export function Composer(props: ComposerProps) {
  const { audience, mode } = props;
  const requestId = props.audience === "admin" ? props.requestId : undefined;
  const presets = props.audience === "admin" ? (props.presets ?? []) : [];
  const topicRules = props.audience === "client" ? props.topicRules : [];
  const router = useRouter();
  const scope = useCacheScope();
  const [selection, setSelection] = useState<TopicSelection>(() => initialTopicSelection());
  const [workLocation, setWorkLocation] = useState("");
  const [body, setBody] = useState("");
  const [settledBody, setSettledBody] = useState("");
  const topic = selection.topic;
  const worksiteEdited = useRef(false);
  const pastedRef = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [continueHref, setContinueHref] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const pickedRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const target = error ? errorRef.current : pickedRef.current;
    target?.scrollIntoView({ block: "nearest" });
  }, [error, files]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  function settleDraft(nextBody: string) {
    setSettledBody(nextBody);
    const match = classifyTopicWithRules(nextBody, topicRules);
    setSelection((current) => topicSelectionAfterMatch(current, match));
    const parsedSite = parseRequestText(nextBody).worksite;
    setWorkLocation((current) => nextWorksiteValue(current, parsedSite, worksiteEdited.current));
  }

  function scheduleDraft(nextBody: string, reason: "input" | "paste") {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const delay = classifySchedule(reason).delay;
    if (delay === 0) {
      settleDraft(nextBody);
      return;
    }
    draftTimer.current = setTimeout(() => settleDraft(nextBody), delay);
  }

  function onBodyChange(value: string) {
    setBody(value);
    if (mode !== "create") return;
    const reason = pastedRef.current ? "paste" : "input";
    pastedRef.current = false;
    scheduleDraft(value, reason);
  }

  function onWorkLocationChange(value: string) {
    if (!value.trim()) {
      worksiteEdited.current = false;
      const parsedSite = parseRequestText(settledBody).worksite;
      setWorkLocation(nextWorksiteValue("", parsedSite, false));
      return;
    }
    worksiteEdited.current = true;
    setWorkLocation(value);
  }

  function addPickedFiles(picked: readonly File[]) {
    if (picked.length === 0) return;
    const next = appendPickedFiles(files, picked);
    setFiles(next.files);
    setError(next.error);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setContinueHref(null);
    const metas: FileMeta[] = files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    }));
    const invalid = validateFiles(metas);
    if (mode === "create" && !topic) {
      setError("請選擇事項。");
      return;
    }
    let workLocationValue = "";
    if (mode === "create") {
      const parsedLocation = parseWorkLocation(workLocation);
      if (!parsedLocation.ok) {
        setError(parsedLocation.error);
        return;
      }
      workLocationValue = parsedLocation.value;
    }
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!body.trim() && files.length === 0) {
      setError("請填寫內容，或上載至少一個檔案。");
      return;
    }

    setPending(true);
    function rememberCreated(redirectTo: string) {
      if (audience !== "client" || mode !== "create" || !scope || !topic) return;
      const requestId = redirectTo.split("?")[0]?.split("/").pop() ?? "";
      if (!isUuid(requestId)) return;
      rememberProvisionalClientRequest(browserViewStorage(), scope, {
        requestId,
        topic,
        workLocation: workLocationValue,
        body,
        files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
      });
    }

    const prepared =
      audience === "admin"
        ? await prepareAdminReply({ requestId: requestId ?? "", body, files: metas })
        : await prepareClientRequest({
            topic: topic ?? "",
            body,
            files: metas,
            workLocation: workLocationValue,
          });

    if (!prepared.ok) {
      if (prepared.redirectTo) rememberCreated(prepared.redirectTo);
      setPending(false);
      setError(prepared.error);
      setContinueHref(prepared.redirectTo ?? null);
      return;
    }

    const uploaded: { path: string; fileName: string }[] = [];
    let failed = false;
    if (prepared.uploads.length > 0) {
      try {
        for (let index = 0; index < prepared.uploads.length; index += 1) {
          const ticket = prepared.uploads[index];
          const file = files[index];
          if (!ticket || !file || file.size !== ticket.size) {
            failed = true;
            break;
          }
          const delivered = await sendPreparedFile(
            file,
            ticket,
            setProgress,
            index + 1,
            prepared.uploads.length,
          );
          if (!delivered) {
            failed = true;
            break;
          }
          uploaded.push({ path: ticket.path, fileName: ticket.fileName });
        }
      } catch {
        failed = true;
      }
    }

    if (uploaded.length > 0) {
      const saved =
        audience === "admin"
          ? await finalizeAdminUploads({
              requestId: requestId ?? "",
              messageId: messageIdFromPath(uploaded[0]?.path),
              files: uploaded,
            })
          : await finalizeClientUploads({
              requestId: requestIdFromPath(prepared.redirectTo, uploaded[0]?.path),
              messageId: messageIdFromPath(uploaded[0]?.path),
              files: uploaded,
            });
      if (!saved.ok) {
        rememberCreated(saved.redirectTo ?? prepared.redirectTo);
        setPending(false);
        setProgress(null);
        setError(saved.error);
        setContinueHref(saved.redirectTo ?? prepared.redirectTo);
        return;
      }
    }

    if (failed) {
      rememberCreated(prepared.redirectTo);
      setPending(false);
      setProgress(null);
      setError(
        audience === "admin"
          ? "有檔案未能上載。文字已經送出，你可以開啟請求再補上檔案。"
          : "有檔案未能上載。文字已經送出。",
      );
      setContinueHref(prepared.redirectTo);
      return;
    }

    if (audience === "client" && mode === "create") {
      rememberCreated(prepared.redirectTo);
      const navigation = navigationAfterCreate(prepared.redirectTo);
      router.replace(navigation.href);
      return;
    }

    router.push(prepared.redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "reply" ? (
        <ReplyPresetPicker
          presets={presets}
          body={body}
          onFill={setBody}
          savePreset={saveReplyPreset}
          deletePreset={deleteReplyPreset}
        />
      ) : null}

      <label className="flex flex-col gap-2 text-sm font-semibold">
        內容
        <textarea
          value={body}
          onPaste={() => {
            pastedRef.current = true;
          }}
          onChange={(event) => onBodyChange(event.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="例如：請根據附件的工程單出報價，抬頭用公司全名。"
          className="rounded-2xl border border-line bg-white px-3 py-3 font-normal leading-7"
        />
      </label>

      {mode === "create" ? <CreateRequestInsights body={settledBody} rules={topicRules} topic={topic} /> : null}

      {mode === "create" ? (
        <fieldset>
          <legend className="text-sm font-semibold">事項</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TOPICS.map((item) => {
              const selected = topic === item.id;
              return (
                <label
                  key={item.id}
                  className={`min-h-20 cursor-pointer rounded-2xl border px-3 py-3 ${
                    selected ? "border-stamp bg-stamp text-white" : "border-line bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="topic"
                    value={item.id}
                    checked={selected}
                    onChange={() =>
                      setSelection(selectTopicManually(item.id, classifyTopicWithRules(body, topicRules)))
                    }
                    className="sr-only"
                  />
                  <span className="block text-base font-semibold">{item.label}</span>
                  <span className={`mt-1 block text-sm ${selected ? "text-white/80" : "text-muted"}`}>{item.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {mode === "create" ? (
        <label className="flex flex-col gap-2 text-sm font-semibold">
          工作地點
          <input
            value={workLocation}
            onChange={(event) => onWorkLocationChange(event.target.value)}
            type="text"
            name="workLocation"
            inputMode="text"
            maxLength={MAX_WORK_LOCATION_LENGTH}
            autoComplete="off"
            aria-required="true"
            placeholder="例如：九龍灣宏開道地盤"
            className="rounded-2xl border border-line bg-white px-3 py-3 font-normal"
          />
        </label>
      ) : null}

      <div>
        <label className="relative inline-flex min-h-11 cursor-pointer items-center overflow-hidden rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold focus-within:border-stamp">
          <span className="pointer-events-none">上載檔案</span>
          <input
            type="file"
            multiple
            accept={acceptAttribute()}
            className="absolute inset-0 z-10 block h-full w-full cursor-pointer opacity-0"
            onChange={(event) => {
              const input = event.currentTarget;
              const picked = Array.from(input.files ?? []);
              input.value = "";
              addPickedFiles(picked);
            }}
          />
        </label>
        {files.length > 0 ? (
          <div ref={pickedRef} className="mt-3 scroll-mb-4">
            <p role="status" className="text-sm font-semibold">
              已選擇 {files.length} 個檔案
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {files.map((file, index) => {
                const name = displayFileName(file.name);
                return (
                  <li
                    key={`${name}-${file.size}-${file.lastModified}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 break-all">
                      <span className="font-semibold">{name}</span>
                      <span className="mt-0.5 block text-muted">{formatBytes(file.size)}</span>
                    </span>
                    <button
                      type="button"
                      className="min-h-11 shrink-0 px-2 font-semibold text-stamp"
                      onClick={() => removeFile(index)}
                    >
                      移除
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {error ? (
          <p ref={errorRef} role="alert" className="mt-3 scroll-mb-4 whitespace-pre-line rounded-xl bg-danger-bg px-3 py-3 text-sm text-danger">
            {error}
            {continueHref ? (
              <>
                {" "}
                <InstantLink href={continueHref} className="font-semibold underline">
                  開啟請求
                </InstantLink>
              </>
            ) : null}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted">可上載相片、PDF 或 Word / Excel。每個檔案上限 20MB，最多 {MAX_FILES} 個。</p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-2xl bg-stamp px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? progress ?? "正在送出…" : mode === "reply" ? "回覆客戶" : "提交請求"}
      </button>
    </form>
  );
}

function requestIdFromPath(redirectTo: string, storagePath: string | undefined): string {
  const fromRedirect = redirectTo.split("/").pop();
  if (fromRedirect) return fromRedirect;
  return storagePath?.split("/")[1] ?? "";
}

function messageIdFromPath(storagePath: string | undefined): string {
  return storagePath?.split("/")[2] ?? "";
}
