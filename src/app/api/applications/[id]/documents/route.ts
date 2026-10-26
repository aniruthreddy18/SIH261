import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/auth/permissions";
import { uploadDocument } from "@/server/documents";
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
  const category = String(form.get("category") ?? "");
  const replaceDocumentId = String(form.get("replaceDocumentId") ?? "") || null;
  const reason = String(form.get("reason") ?? "") || null;
  if (!(file instanceof File)) throw new DomainError("No file was provided.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const version = await uploadDocument(actor, { applicationId: id, categoryCode: category, fileName: file.name, mimeType: file.type, buffer, replaceDocumentId, reason });
  revalidatePath(`/applications/${id}`);
  revalidatePath("/documents");
  return NextResponse.json({
    versionId: version.id,
    documentId: version.documentId,
    processingStatus: version.processingStatus,
    processingError: version.processingError,
    extractionMethod: version.extractionMethod,
    fieldsFound: version.fields.filter((f) => f.value !== null).length,
  });
});
