import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/auth/permissions";
import { submitEvidence } from "@/server/compliance-monitor";
import { withActor } from "@/server/route-util";

export const runtime = "nodejs";
// Hard ceiling for the request body; the configurable per-file limit is enforced in the service.
const HARD_LIMIT = 55 * 1048576;

export const POST = withActor<{ params: Promise<{ id: string }> }>(async (req, actor, { params }) => {
  const { id } = await params;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > HARD_LIMIT) throw new DomainError("Request too large.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new DomainError("No file was provided.");
  const sub = await submitEvidence(actor, id, {
    fileName: file.name,
    mimeType: file.type,
    buffer: Buffer.from(await file.arrayBuffer()),
    note: String(form.get("note") ?? ""),
    newValidUntil: String(form.get("newValidUntil") ?? "") || undefined,
    newReference: String(form.get("newReference") ?? "") || undefined,
  });
  for (const p of ["/portal", "/portal/compliance", "/compliance-monitor"]) revalidatePath(p, "layout");
  return NextResponse.json({ submissionId: sub.id });
});
