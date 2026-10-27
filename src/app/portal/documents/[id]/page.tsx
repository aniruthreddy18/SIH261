import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { APPLICANT_EDITABLE_STATUSES, NotFoundError } from "@/lib/auth/permissions";
import type { ApplicationStatus } from "@/lib/domain";
import { getAccessibleDocument } from "@/server/documents";
import { prisma, json } from "@/server/db";
import { getSettings } from "@/server/settings";
import { requireActor } from "@/server/session";
import { PageHeader, Notice } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ProcessingBadge } from "@/components/status";
import { DocumentViewer } from "@/components/app/document-viewer";
import { UploadDialog } from "@/components/app/replace-dialog";

export const metadata = { title: "Document" };

/** Shows the institution exactly what the system read from its document, and where. */
export default async function PortalDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  let doc;
  try {
    doc = await getAccessibleDocument(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const version = doc.versions.find((v) => v.isCurrent) ?? doc.versions[0];
  const [settings, categories] = await Promise.all([getSettings(), prisma.documentCategory.findMany({ orderBy: { sortOrder: "asc" } })]);
  const warnings = json<string[]>(version.warningsJson, []);
  const editable = doc.state === "ACTIVE" && APPLICANT_EDITABLE_STATUSES.includes(doc.application.status as ApplicationStatus);
  return (
    <>
      <PageHeader
        title={version.originalName}
        crumbs={[{ label: "Home", href: "/portal" }, { label: doc.application.reference, href: `/portal/applications/${doc.applicationId}?view=documents` }, { label: doc.category.name }]}
        meta={<><span className="text-xs text-muted">{doc.category.name} · version {version.versionNo}</span><ProcessingBadge status={version.processingStatus} /></>}
        actions={
          <>
            <Button asChild variant="ghost" size="sm"><Link href={`/portal/applications/${doc.applicationId}?view=documents`}><ArrowLeft /> Back to documents</Link></Button>
            {editable && <UploadDialog applicationId={doc.applicationId} categories={categories.map((c) => ({ code: c.code, name: c.name }))} maxMb={settings.maxUploadMb} replace={{ documentId: doc.id, categoryCode: doc.categoryCode, label: `${doc.category.name} — ${version.originalName} (v${version.versionNo})` }} label="Replace this document" variant="outline" />}
            <Button asChild variant="outline" size="sm"><a href={`/api/documents/versions/${version.id}/file`}><Download /> Download</a></Button>
          </>
        }
      />
      <div className="mb-4 space-y-2">
        <Notice tone="info">This is what the system read from your document. Each value is highlighted where it was found. If something was read wrongly or could not be found, replace the document with a clearer copy — AICTE officials can also correct values during review.</Notice>
        {version.processingStatus === "FAILED" && <Notice tone="bad" title="This document could not be read">{version.processingError} Replace it with a clearer scan or the original PDF.</Notice>}
        {warnings.length > 0 && <Notice tone="warn" title="Notes from reading this document"><ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Notice>}
      </div>
      {version.processingStatus === "PROCESSED" && (
        <DocumentViewer
          versionId={version.id}
          pageCount={version.pageCount ?? 1}
          initialPage={Number(sp.page ?? 1)}
          isCurrent={version.isCurrent}
          isImage={version.mimeType.startsWith("image/")}
          canCorrect={false}
          fields={version.fields.map((f) => ({
            id: f.id, key: f.key, label: f.label, value: f.value, normalizedValue: f.normalizedValue, confidence: f.confidence, page: f.page, excerpt: f.excerpt,
            bbox: f.bboxJson ? (JSON.parse(f.bboxJson) as [number, number, number, number]) : null, method: f.method,
            correctedValue: f.correctedValue, correctedAt: f.correctedAt?.toISOString() ?? null, correctionReason: f.correctionReason, correctedBy: f.correctedValue ? "AICTE reviewer" : null,
          }))}
        />
      )}
    </>
  );
}
