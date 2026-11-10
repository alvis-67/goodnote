import "server-only";

import { insertMessage, type ActionFailure } from "@/lib/actions/shared";
import { dbErrorCode, sql } from "@/lib/db";
import { chainDuplicateError } from "@/lib/document-chain";
import { isTopicId } from "@/lib/domain";

export type LinkedChild = { id: string; topic: string };

export type LinkedInsertResult =
  | { ok: true; requestId: string; messageId: string }
  | { ok: false; reason: "duplicate"; child: LinkedChild }
  | { ok: false; reason: "message"; error: string; requestId: string }
  | { ok: false; reason: "insert"; error: string };

export async function findLinkedChild(clientId: string, parentRequestId: string): Promise<LinkedChild | null> {
  const rows = await sql()`
    select id, topic
    from requests
    where parent_request_id = ${parentRequestId}
      and client_id = ${clientId}
    limit 1
  `;
  const row = rows[0];
  if (!row?.id) return null;
  return { id: String(row.id), topic: String(row.topic ?? "") };
}

export function duplicateFollowUpError(child: LinkedChild, redirectTo: string): ActionFailure {
  const topic = isTopicId(child.topic) ? child.topic : null;
  return {
    ok: false,
    error: topic ? chainDuplicateError(topic) : "已經有下一張單，不會再開一張。",
    redirectTo,
  };
}

/** Inserts the later document only. The parent request is not updated. */
export async function insertLinkedRequest(input: {
  clientId: string;
  topic: string;
  workLocation: string;
  parentRequestId: string;
  body: string;
}): Promise<LinkedInsertResult> {
  let requestId: string | null = null;
  try {
    const rows = await sql()`
      insert into requests (client_id, topic, work_location, parent_request_id)
      values (${input.clientId}, ${input.topic}, ${input.workLocation}, ${input.parentRequestId})
      returning id
    `;
    const id = rows[0]?.id;
    requestId = id ? String(id) : null;
  } catch (error) {
    if (dbErrorCode(error) === "23505") {
      const child = await findLinkedChild(input.clientId, input.parentRequestId);
      if (child) return { ok: false, reason: "duplicate", child };
    }
    console.error("linked request insert failed", dbErrorCode(error));
    return { ok: false, reason: "insert", error: "未能建立請求。" };
  }
  if (!requestId) return { ok: false, reason: "insert", error: "未能建立請求。" };

  const message = await insertMessage({
    requestId,
    authorRole: "client",
    body: input.body,
  });
  if (!message.ok) return { ok: false, reason: "message", error: message.error, requestId };
  return { ok: true, requestId, messageId: message.id };
}
