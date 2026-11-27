import { parseMessageBody } from "@/lib/clients";

/** The original request text is the earliest client message, even when it is blank. */
export function originalClientContent(
  messages: readonly { kind: string; author_role: string; body: string | null }[],
): string {
  for (const message of messages) {
    if (message.kind !== "message" || message.author_role !== "client") continue;
    return message.body ?? "";
  }
  return "";
}

/**
 * A signed-in client may edit their own request at every status and stage.
 * Status and stage are accepted so the caller records that they were not used as a gate.
 */
export function canClientEditRequestContent(input: {
  actorClientId: string | null | undefined;
  ownerClientId: string;
  status: string;
  stage: string;
}): boolean {
  const actor = input.actorClientId?.trim() ?? "";
  const owner = input.ownerClientId.trim();
  return actor.length > 0 && actor === owner && typeof input.status === "string" && typeof input.stage === "string";
}

/**
 * A signed-in admin may edit request content at every status and stage.
 * A client session cannot. Status and stage are accepted so the caller records that they were not used as a gate.
 */
export function canAdminEditRequestContent(input: {
  actorRole: string | null | undefined;
  status: string;
  stage: string;
}): boolean {
  return input.actorRole === "admin" && typeof input.status === "string" && typeof input.stage === "string";
}

/** Only the original message body is writable. Topic, worksite, files, status, and stage are not. */
export const CLIENT_CONTENT_EDIT_FIELDS = ["body"] as const;

/** The admin editor writes the same single field as the client editor. */
export const ADMIN_CONTENT_EDIT_FIELDS = ["body"] as const;

export function adminContentEditTouchesOnlyBody(fields: readonly string[]): boolean {
  return (
    fields.length === ADMIN_CONTENT_EDIT_FIELDS.length &&
    fields.every((field, index) => field === ADMIN_CONTENT_EDIT_FIELDS[index])
  );
}

export function clientContentEditTouchesOnlyBody(fields: readonly string[]): boolean {
  return (
    fields.length === CLIENT_CONTENT_EDIT_FIELDS.length &&
    fields.every((field, index) => field === CLIENT_CONTENT_EDIT_FIELDS[index])
  );
}

export function parseRequestContent(body: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof body !== "string") return { ok: false, error: "請填寫內容。" };
  return parseMessageBody(body);
}
