import { openAttachmentDownload } from "@/lib/download";
import { describeDownloadResponse, readDownloadPart } from "@/lib/download-plan";
import { readObjectRange } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const opened = await openAttachmentDownload(id);
    if (!opened.ok) return json(opened.status, opened.error);

    const part = new URL(request.url).searchParams.get("part");
    const planned = readDownloadPart(part, opened.size);
    if (!planned.ok) return json(planned.status, planned.error);

    const bytes = await readObjectRange(opened.path, planned.start, planned.end, opened.size);
    if (!bytes) return json(404, "找不到檔案。");

    const described = describeDownloadResponse({
      mime: opened.mime,
      fileName: opened.fileName,
      start: planned.start,
      end: planned.end,
      bytes,
    });
    if (!described.ok) return json(described.status, described.error);
    return new Response(Buffer.from(described.body), { status: 200, headers: described.headers });
  } catch (error) {
    console.error("download request failed", error instanceof Error ? error.name : "error");
    return json(500, "未能開啟檔案。");
  }
}
