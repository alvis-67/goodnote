"use client";

import { useEffect, useState, type MouseEvent } from "react";

import { loadAttachmentBytes } from "@/lib/download-client";
import { attachmentFilePath, canPreviewInline, opensInBrowser, UPLOAD_CHUNK_BYTES } from "@/lib/download-plan";
import { displayFileName, MAX_FILE_BYTES } from "@/lib/files";
import { formatBytes } from "@/lib/format";

function objectUrl(bytes: Uint8Array, mimeType: string): string {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy], { type: mimeType }));
}

export function AttachmentFile({
  id,
  fileName,
  mimeType,
  sizeBytes,
  mine,
}: {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  mine: boolean;
}) {
  const href = attachmentFilePath(id);
  const name = displayFileName(fileName);
  const singleResponse = sizeBytes > 0 && sizeBytes <= UPLOAD_CHUNK_BYTES;
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    href && singleResponse && canPreviewInline(mimeType) ? href : null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!href || !canPreviewInline(mimeType) || singleResponse || sizeBytes > MAX_FILE_BYTES) return;
    const controller = new AbortController();
    let cancelled = false;
    let created = "";
    loadAttachmentBytes(id, sizeBytes, (input, init) => fetch(input, { ...init, signal: controller.signal }))
      .then((bytes) => {
        if (cancelled) return;
        if (!bytes) {
          setNote("未能顯示圖片。");
          return;
        }
        created = objectUrl(bytes, mimeType);
        setPreviewUrl(created);
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) setNote("未能顯示圖片。");
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [href, id, mimeType, singleResponse, sizeBytes]);

  async function onOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!href || singleResponse || opening) {
      if (opening) event.preventDefault();
      return;
    }
    event.preventDefault();
    const popup = opensInBrowser(mimeType) ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    setOpening(true);
    setNote("正在開啟檔案…");
    try {
      const bytes = await loadAttachmentBytes(id, sizeBytes);
      if (!bytes) {
        popup?.close();
        setNote("未能開啟檔案。");
        return;
      }
      const url = objectUrl(bytes, mimeType);
      if (popup && !popup.closed) popup.location.href = url;
      else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.rel = "noopener";
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNote(null);
    } catch {
      popup?.close();
      setNote("未能開啟檔案。");
    } finally {
      setOpening(false);
    }
  }

  return (
    <>
      {previewUrl ? (
        // Authenticated file bytes are not a static asset the image optimizer can cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={name}
          className="max-h-64 w-full rounded-lg object-contain"
          onError={() => {
            setPreviewUrl(null);
            setNote("未能顯示圖片。");
          }}
        />
      ) : null}
      {note ? (
        <p className={`text-xs ${mine ? "text-white/80" : "text-danger"}`} role="status">
          {note}
        </p>
      ) : null}
      <div className="mt-1 flex items-center justify-between gap-3 text-sm">
        {href ? (
          <a
            href={href}
            target={singleResponse ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="truncate font-medium underline"
            aria-busy={opening || undefined}
            onClick={onOpen}
          >
            {name}
          </a>
        ) : (
          <span className="truncate">{name}</span>
        )}
        <span className={mine ? "text-white/70" : "text-muted"}>{formatBytes(sizeBytes)}</span>
      </div>
    </>
  );
}
