import { readSubmissionFile } from "@/server/compliance-monitor";
import { contentDisposition, withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<{ params: Promise<{ id: string }> }>(async (_req, actor, { params }) => {
  const { id } = await params;
  const { sub, buffer } = await readSubmissionFile(actor, id);
  return new Response(new Uint8Array(buffer), { headers: { "content-type": sub.mimeType, "content-disposition": contentDisposition("inline", sub.fileName), "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
});
