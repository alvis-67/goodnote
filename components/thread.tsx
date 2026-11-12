import { AttachmentFile } from "@/components/attachment-file";
import { MessageBody } from "@/components/message-body";
import type { MessageRow } from "@/lib/database.types";
import type { ThreadAttachment } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

type ThreadFile = Pick<ThreadAttachment, "id" | "message_id" | "file_name" | "mime_type" | "size_bytes">;

export function Thread({
  messages,
  attachments,
}: {
  messages: MessageRow[];
  attachments: ThreadFile[];
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
              {message.body ? <MessageBody text={message.body} mine={mine} /> : null}
              {files.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {files.map((file) => (
                    <li key={file.id} className={`rounded-xl p-2 ${mine ? "bg-white/10" : "bg-paper"}`}>
                      <AttachmentFile
                        id={file.id}
                        fileName={file.file_name}
                        mimeType={file.mime_type}
                        sizeBytes={file.size_bytes}
                        mine={mine}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
