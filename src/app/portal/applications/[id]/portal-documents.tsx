import Link from "next/link";
import { CheckCircle2, Circle, Download, Eye, Trash2, XCircle } from "lucide-react";
import { APPLICANT_EDITABLE_STATUSES } from "@/lib/auth/permissions";
import type { ApplicationStatus } from "@/lib/domain";
import { withdrawDocumentAction } from "@/app/actions/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionDialog } from "@/components/action-dialog";
import { UploadDialog } from "@/components/app/replace-dialog";
import { UploadPanel } from "@/components/app/upload-panel";
import { ProcessingBadge } from "@/components/status";
import { formatBytes, formatDateTime } from "@/lib/utils";
import type { Detail } from "@/app/(app)/applications/[id]/types";

/** Checklist-first document view for institutions. */
export function PortalDocuments({ detail, categories, maxMb }: { detail: Detail; categories: { code: string; name: string }[]; maxMb: number }) {
  const { app, checklist, documents } = detail;
  const status = app.status as ApplicationStatus;
  const editable = APPLICANT_EDITABLE_STATUSES.includes(status);
  const canWithdraw = ["DRAFT", "RECTIFICATION_REQUIRED"].includes(status);
  const active = documents.filter((d) => d.state === "ACTIVE");
  const mandatory = checklist.filter((c) => c.mandatory);
  const done = mandatory.filter((c) => active.some((d) => d.categoryCode === c.categoryCode)).length;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className={editable ? "lg:col-span-2" : "lg:col-span-3"}>
        <CardHeader title="Required documents" description={`${done} of ${mandatory.length} mandatory documents uploaded. Replacing a file keeps the earlier version on record.`} />
        <ul className="divide-y divide-border">
          {checklist.map((c) => {
            const docs = active.filter((d) => d.categoryCode === c.categoryCode);
            return (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  {docs.length ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : c.mandatory ? <XCircle className="mt-0.5 size-4 shrink-0 text-bad" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{c.label} {!c.mandatory && <span className="text-xs font-normal text-muted">(optional)</span>}</p>
                    {c.guidance && <p className="text-xs text-muted">{c.guidance}</p>}
                    {docs.length === 0 && c.mandatory && <Badge tone="bad" className="mt-1">Missing — required</Badge>}
                    {docs.map((d) => {
                      const v = d.versions.find((x) => x.isCurrent)!;
                      return (
                        <div key={d.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-subtle/40 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <Link href={`/portal/documents/${d.id}`} className="text-[13px] font-medium text-accent hover:underline">{v.originalName}</Link>
                            <p className="text-[11px] text-muted">Version {v.versionNo} · {formatBytes(v.sizeBytes)} · uploaded {formatDateTime(v.uploadedAt)}{v.extractionMethod ? ` · read via ${v.extractionMethod === "OCR" ? "OCR (scan)" : "PDF text"}` : ""}</p>
                            {v.processingError && <p className="text-[11px] text-bad">{v.processingError}</p>}
                          </div>
                          <ProcessingBadge status={v.processingStatus} />
                          <Link href={`/portal/documents/${d.id}`} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-subtle"><Eye className="size-3.5" /> What we read</Link>
                          <a href={`/api/documents/versions/${v.id}/file`} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-subtle"><Download className="size-3.5" /> File</a>
                          {editable && <UploadDialog applicationId={app.id} categories={categories} maxMb={maxMb} replace={{ documentId: d.id, categoryCode: d.categoryCode, label: `${c.label} — ${v.originalName} (v${v.versionNo})` }} />}
                          {editable && canWithdraw && <ActionDialog label="Withdraw" icon={<Trash2 />} size="xs" variant="ghost" title="Withdraw document" description="It will no longer be evaluated. The file stays on record for audit." fields={[{ name: "reason", label: "Reason", type: "textarea" }]} action={withdrawDocumentAction.bind(null, d.id)} />}
                        </div>
                      );
                    })}
                  </div>
                  {editable && docs.length === 0 && <UploadDialog applicationId={app.id} categories={categories} defaultCategory={c.categoryCode} maxMb={maxMb} label="Upload" variant={c.mandatory ? "default" : "outline"} />}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {editable && (
        <Card className="self-start">
          <CardHeader title="Upload a document" description="Files are checked for type and content. Scanned documents are read with OCR." />
          <CardBody><UploadPanel applicationId={app.id} categories={categories} defaultCategory={checklist.find((c) => c.mandatory && !active.some((d) => d.categoryCode === c.categoryCode))?.categoryCode} maxMb={maxMb} /></CardBody>
        </Card>
      )}
    </div>
  );
}
