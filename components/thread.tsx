import type { MessageRow } from "@/lib/database.types";
import type { ThreadAttachment } from "@/lib/data";
import { formatBytes, formatDateTime } from "@/lib/format";

const previewable = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function Thread({
  messages,
  attachments,
  urls,
}: {
  messages: MessageRow[];
  attachments: ThreadAttachment[];
  urls: Map<string, string>;
}) {
  const visible = messages.filter((message) => message.kind === "message");
  if (visible.length === 0) {
    return <p className="text-sm text-muted">這條紀錄還沒有訊息。</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {visible.map((message) => {
        const files = attachments.filter((file) => file.message_id === message.id);
        const mine = message.author_role === "admin";
        return (
          <li key={message.id} className={mine ? "flex justify-end" : "flex justify-start"}>
            <article
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                mine ? "bg-navy text-white" : "border border-line bg-card text-ink"
              }`}
            >
              <p className={`text-xs font-medium ${mine ? "text-white/70" : "text-muted"}`}>
                {message.author_role === "admin" ? "管理員" : "客戶"}
                <span className="mx-1">·</span>
                <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
              </p>
              {message.body ? <p className="mt-2 whitespace-pre-wrap text-base leading-7">{message.body}</p> : null}
              {files.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {files.map((file) => {
                    const href = urls.get(file.storage_path);
                    return (
                      <li key={file.id} className={`rounded-xl p-2 ${mine ? "bg-white/10" : "bg-paper"}`}>
                        {previewable.has(file.mime_type) && href ? (
                          // Signed URLs expire and are unique, so the image optimizer would not help.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={href} alt={file.file_name} className="max-h-64 w-full rounded-lg object-contain" />
                        ) : null}
                        <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="truncate font-medium underline">
                              {file.file_name}
                            </a>
                          ) : (
                            <span className="truncate">{file.file_name}</span>
                          )}
                          <span className={mine ? "text-white/70" : "text-muted"}>{formatBytes(file.size_bytes)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
