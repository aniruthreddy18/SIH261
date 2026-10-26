import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";
import { hasPermission, NotFoundError } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type FindingStatus } from "@/lib/domain";
import { getAccessibleDocument } from "@/server/documents";
import { prisma, json } from "@/server/db";
import { requireActor } from "@/server/session";
import { reprocessAction } from "@/app/actions/workflow";
import { PageHeader, Notice } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-dialog";
import { FindingStatusBadge, ProcessingBadge, SeverityBadge } from "@/components/status";
import { formatBytes, formatDateTime, pct } from "@/lib/utils";
import { DocumentViewer } from "./viewer";

export const metadata = { title: "Document" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; page?: string }> }) {
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
  const version = doc.versions.find((v) => v.id === sp.version) ?? doc.versions.find((v) => v.isCurrent) ?? doc.versions[0];
  const correctorIds = [...new Set(version.fields.map((f) => f.correctedById).filter(Boolean))] as string[];
  const [findings, correctors] = await Promise.all([
    prisma.finding.findMany({ where: { documentId: doc.id }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ where: { id: { in: correctorIds } }, select: { id: true, name: true } }),
  ]);
  const warnings = json<string[]>(version.warningsJson, []);
  const meta = json<Record<string, unknown>>(version.metadataJson, {});
  const canReprocess = hasPermission(actor.role, "document.reprocess") && version.isCurrent && doc.state === "ACTIVE" && !["CLOSED", "READY_FOR_AUTHORIZED_REVIEW"].includes(doc.application.status);
  const canCorrect = hasPermission(actor.role, "document.correctField") && doc.application.status !== "CLOSED";
  const isApplicant = actor.role === "APPLICANT";

  return (
    <>
      <PageHeader
        title={version.originalName}
        crumbs={[{ label: "Applications", href: "/applications" }, { label: doc.application.reference, href: `/applications/${doc.applicationId}?tab=documents` }, { label: doc.category.name }]}
        meta={
          <>
            <span className="text-xs text-muted">{doc.category.name} · version {version.versionNo}{version.isCurrent ? " (current)" : " (superseded)"}</span>
            <ProcessingBadge status={version.processingStatus} />
            {doc.state === "WITHDRAWN" && <span className="text-xs font-medium text-bad">Withdrawn</span>}
          </>
        }
        actions={
          <>
            {canReprocess && <ActionButton label={version.processingStatus === "FAILED" ? "Retry processing" : "Reprocess"} pendingLabel="Processing…" icon={<RefreshCw />} variant="outline" action={reprocessAction.bind(null, doc.id)} />}
            <Button asChild variant="outline" size="sm"><a href={`/api/documents/versions/${version.id}/file`}><Download /> Download original</a></Button>
          </>
        }
      />
      {!version.isCurrent && <div className="mb-4"><Notice tone="info">You are viewing a superseded version retained as historical evidence. <Link className="underline" href={`/documents/${doc.id}`}>View current version</Link>.</Notice></div>}
      {version.processingStatus === "FAILED" && <div className="mb-4"><Notice tone="bad" title="Processing failed">{version.processingError}</Notice></div>}
      {warnings.length > 0 && (
        <div className="mb-4">
          <Notice tone="warn" title="Extraction warnings"><ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Notice>
        </div>
      )}
      {version.processingStatus === "PROCESSED" && (
        <DocumentViewer
          versionId={version.id}
          pageCount={version.pageCount ?? 1}
          initialPage={Number(sp.page ?? 1)}
          isCurrent={version.isCurrent}
          isImage={version.mimeType.startsWith("image/")}
          canCorrect={canCorrect}
          fields={version.fields.map((f) => ({
            id: f.id, key: f.key, label: f.label, value: f.value, normalizedValue: f.normalizedValue, confidence: f.confidence, page: f.page, excerpt: f.excerpt,
            bbox: f.bboxJson ? (JSON.parse(f.bboxJson) as [number, number, number, number]) : null, method: f.method,
            correctedValue: f.correctedValue, correctedAt: f.correctedAt?.toISOString() ?? null, correctionReason: f.correctionReason, correctedBy: correctors.find((c) => c.id === f.correctedById)?.name ?? null,
          }))}
        />
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="File and processing" />
          <CardBody className="space-y-1 text-xs">
            <p><span className="text-muted">Type:</span> {version.mimeType} · {formatBytes(version.sizeBytes)} · {version.pageCount ?? "?"} page(s)</p>
            <p><span className="text-muted">Extraction:</span> {version.extractionMethod ?? "—"}{version.ocrConfidence !== null && ` · OCR confidence ${pct(version.ocrConfidence)}`}</p>
            <p className="break-all"><span className="text-muted">SHA-256:</span> <span className="font-mono">{version.sha256}</span></p>
            <p><span className="text-muted">Uploaded:</span> {formatDateTime(version.uploadedAt)} · processed {formatDateTime(version.processedAt)}</p>
            {Object.keys(meta).length > 0 && (
              <details className="pt-1">
                <summary className="cursor-pointer text-muted">File metadata</summary>
                <dl className="mt-1 space-y-0.5">{Object.entries(meta).filter(([, v]) => v !== null && v !== false).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-muted">{k}</dt><dd className="font-mono text-[11px] break-all">{String(v)}</dd></div>)}</dl>
              </details>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Version history" description="Replacements never overwrite earlier evidence." />
          <ul className="divide-y divide-border">
            {doc.versions.map((v) => (
              <li key={v.id} className="px-4 py-2 text-xs">
                <Link href={`/documents/${doc.id}?version=${v.id}`} className={v.id === version.id ? "font-semibold text-ink" : "text-accent hover:underline"}>v{v.versionNo} — {v.originalName}</Link>
                <p className="text-muted">{formatDateTime(v.uploadedAt)}{v.isCurrent ? " · current" : v.supersededAt ? ` · superseded ${formatDateTime(v.supersededAt)}` : ""}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Findings linked to this document" />
          <ul className="divide-y divide-border">
            {findings.length === 0 && <li className="px-4 py-3 text-xs text-muted">No findings reference this document.</li>}
            {findings.map((f) => (
              <li key={f.id} className="px-4 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5"><SeverityBadge severity={f.severity} /><FindingStatusBadge status={f.status} /></div>
                {isApplicant || !ACTIVE_FINDING_STATUSES.includes(f.status as FindingStatus) ? <p className="mt-1 text-ink-2">{f.title}</p> : <Link href={`/review/${f.id}`} className="mt-1 block text-accent hover:underline">{f.title}</Link>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
