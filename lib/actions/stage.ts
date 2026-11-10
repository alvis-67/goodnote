"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin, requireClient } from "@/lib/auth";
import { dbErrorCode, sql } from "@/lib/db";
import { isTopicId } from "@/lib/domain";
import { hasDatabaseEnv } from "@/lib/env";
import { adminRequestPath, clientHomePath, clientRequestPath } from "@/lib/paths";
import { isStageId, nextRequestStage } from "@/lib/request-stage";
import { isUuid } from "@/lib/tokens";

export async function advanceClientRequestStage(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!isUuid(requestId)) redirect(clientHomePath);
  if (!hasDatabaseEnv()) redirect("/client/login");
  const client = await requireClient();
  const back = clientRequestPath(requestId);
  const moved = await moveRequestStage(requestId, client.id);
  if (!moved.ok) redirect(`${back}?error=stage`);
  revalidateStage(requestId);
  redirect(`${back}?notice=stage`);
}

export async function advanceAdminRequestStage(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!isUuid(requestId)) redirect("/admin");
  if (!hasDatabaseEnv()) redirect("/admin/login");
  await requireAdmin();
  const back = adminRequestPath(requestId);
  const moved = await moveRequestStage(requestId, null);
  if (!moved.ok) redirect(`${back}?error=stage`);
  revalidateStage(requestId);
  redirect(`${back}?notice=stage`);
}

/**
 * Moves the same request one stage forward. The caller chooses the row;
 * the next stage comes from the row's topic and current stage, not from
 * the form. Messages, files, and the work location are not copied anywhere.
 */
async function moveRequestStage(
  requestId: string,
  clientId: string | null,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const rows = await sql()`
      select topic, stage
      from requests
      where id = ${requestId}
        and (${clientId}::uuid is null or client_id = ${clientId})
      limit 1
    `;
    const row = rows[0];
    const topic = row ? String(row.topic ?? "") : "";
    const stage = row ? String(row.stage ?? "") : "";
    if (!row || !isTopicId(topic) || !isStageId(stage)) return { ok: false };
    const next = nextRequestStage(topic, stage);
    if (!next) return { ok: false };

    const updated = await sql()`
      update requests
      set stage = ${next},
          status = 'pending',
          admin_unread = true
      where id = ${requestId}
        and stage = ${stage}
        and (${clientId}::uuid is null or client_id = ${clientId})
      returning id
    `;
    if (updated[0]) return { ok: true };

    const current = await sql()`
      select stage
      from requests
      where id = ${requestId}
        and (${clientId}::uuid is null or client_id = ${clientId})
      limit 1
    `;
    return { ok: String(current[0]?.stage ?? "") === next };
  } catch (error) {
    if (isRedirect(error)) throw error;
    console.error("stage update failed", dbErrorCode(error));
    return { ok: false };
  }
}

function revalidateStage(requestId: string): void {
  revalidatePath(clientRequestPath(requestId));
  revalidatePath(clientHomePath);
  revalidatePath(adminRequestPath(requestId));
  revalidatePath("/admin");
}

function isRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT"),
  );
}
