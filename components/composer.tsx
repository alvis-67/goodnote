"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { finalizeAdminUploads, prepareAdminReply } from "@/lib/actions/admin";
import { finalizeClientUploads, prepareClientReply, prepareClientRequest } from "@/lib/actions/client";
import { TOPICS, type TopicId } from "@/lib/domain";
import { formatBytes } from "@/lib/format";
import { acceptAttribute, MAX_FILES, validateFiles, type FileMeta } from "@/lib/files";

type Audience = "client" | "admin";

export function Composer({
  audience,
  mode,
  token,
  requestId,
}: {
  audience: Audience;
  mode: "create" | "reply";
  token?: string;
  requestId?: string;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [continueHref, setContinueHref] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, MAX_FILES));
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
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!body.trim() && files.length === 0) {
      setError("請填寫內容，或上載至少一個檔案。");
      return;
    }

    setPending(true);
    const prepared =
      audience === "admin"
        ? await prepareAdminReply({ requestId: requestId ?? "", body, files: metas })
        : mode === "create"
          ? await prepareClientRequest({ token: token ?? "", topic: topic ?? "", body, files: metas })
          : await prepareClientReply({ token: token ?? "", requestId: requestId ?? "", body, files: metas });

    if (!prepared.ok) {
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
          if (!ticket || !file) {
            failed = true;
            break;
          }
          setProgress(`正在上載 ${index + 1} / ${prepared.uploads.length}`);
          const response = await fetch(ticket.url, {
            method: ticket.method,
            headers: ticket.headers,
            body: file,
          });
          if (!response.ok) {
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
              token: token ?? "",
              requestId: requestIdFromPath(prepared.redirectTo, uploaded[0]?.path),
              messageId: messageIdFromPath(uploaded[0]?.path),
              files: uploaded,
            });
      if (!saved.ok) {
        setPending(false);
        setProgress(null);
        setError(saved.error);
        setContinueHref(saved.redirectTo ?? prepared.redirectTo);
        return;
      }
    }

    if (failed) {
      setPending(false);
      setProgress(null);
      setError("有檔案未能上載。文字已經送出，你可以開啟請求再補上檔案。");
      setContinueHref(prepared.redirectTo);
      return;
    }

    router.push(prepared.redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                    onChange={() => setTopic(item.id)}
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

      <label className="flex flex-col gap-2 text-sm font-semibold">
        內容
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="例如：請根據附件的工程單出報價，抬頭用公司全名。"
          className="rounded-2xl border border-line bg-white px-3 py-3 font-normal leading-7"
        />
      </label>

      <div>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold">
          上載檔案
          <input
            type="file"
            multiple
            accept={acceptAttribute()}
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-sm text-muted">可上載相片、PDF 或 Word / Excel。每個檔案上限 20MB，最多 {MAX_FILES} 個。</p>
        {files.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-sm">
                <span className="truncate">
                  {file.name}
                  <span className="ml-2 text-muted">{formatBytes(file.size)}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 font-semibold text-stamp"
                  onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-bg px-3 py-3 text-sm text-danger">
          {error}
          {continueHref ? (
            <>
              {" "}
              <a href={continueHref} className="font-semibold underline">
                開啟請求
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-2xl bg-stamp px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {pending ? progress ?? "正在送出…" : mode === "create" ? "提交請求" : audience === "admin" ? "回覆客戶" : "送出"}
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
