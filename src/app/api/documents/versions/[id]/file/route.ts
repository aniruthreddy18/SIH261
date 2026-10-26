import { getVersionFile } from "@/server/documents";
import { contentDisposition, withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<{ params: Promise<{ id: string }> }>(async (_req, actor, { params }) => {
  const { id } = await params;
  const f = await getVersionFile(actor, id);
  return new Response(new Uint8Array(f.buffer), {
    headers: {
      "content-type": f.mimeType,
      "content-disposition": contentDisposition("attachment", f.fileName),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
});
