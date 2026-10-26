import { getVersionPreview } from "@/server/documents";
import { withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<{ params: Promise<{ id: string }> }>(async (req, actor, { params }) => {
  const { id } = await params;
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
  const p = await getVersionPreview(actor, id, page);
  return new Response(new Uint8Array(p.buffer), {
    headers: { "content-type": p.mimeType, "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", "cache-control": "private, max-age=300" },
  });
});
