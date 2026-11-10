import { decideAuthRoute } from "@/lib/auth/guard";
import { isAllowlisted } from "@/lib/auth";
import { getAuth } from "@/lib/auth/server";
import { hasAuthEnv, hasDatabaseEnv } from "@/lib/env";

type RouteContext = { params: Promise<{ path: string[] }> };

function json(status: number, error: string) {
  return Response.json({ message: error }, { status });
}

async function handle(request: Request, context: RouteContext) {
  if (!hasAuthEnv() || !hasDatabaseEnv()) return json(503, "系統尚未完成設定。");

  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.clone().text();
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
    }
  }

  const decision = decideAuthRoute(request.method, new URL(request.url).pathname, body);
  if (decision.action === "reject") return json(decision.status, decision.error);
  if (decision.action === "allowlist" && !(await isAllowlisted(decision.email))) {
    return json(403, "這個電郵不在管理員允許清單內。");
  }

  const handlers = getAuth().handler();
  const method = request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  const handler = handlers[method];
  if (!handler) return json(405, "不支援這個操作。");
  return handler(request, context);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
