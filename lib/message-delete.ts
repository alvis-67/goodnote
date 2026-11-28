/** An admin may delete any conversation message. Status and stage rows are not conversation messages. */
export function canDeleteConversationMessage(input: {
  actorRole: string | null | undefined;
  kind: string;
}): boolean {
  return input.actorRole === "admin" && input.kind === "message";
}
