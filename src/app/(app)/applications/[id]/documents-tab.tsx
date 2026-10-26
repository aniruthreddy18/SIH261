import Link from "next/link";
import { Download, Eye, Trash2 } from "lucide-react";
import { APPLICANT_EDITABLE_STATUSES, hasPermission, type Actor } from "@/lib/auth/permissions";
import type { ApplicationStatus } from "@/lib/domain";
import { withdrawDocumentAction } from "@/app/actions/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProcessingBadge } from "@/components/status";
import { ActionDialog } from "@/components/action-dialog";
import { UploadPanel } from "@/components/app/upload-panel";
import { UploadDialog } from "@/components/app/replace-dialog";
import { Notice } from "@/components/page-header";
import { formatBytes, formatDateTime, pct } from "@/lib/utils";
import type { Detail } from "./types";

export function DocumentsTab({ detail, actor, categories, maxMb }: { detail: Detail; actor: Actor; categories: { code: string; name: string }[]; maxMb: number }) {
  const { app, checklist, documents } = detail;
  const status = app.status as ApplicationStatus;
  const canUpload = hasPermission(actor.role, "document.upload") && (actor.role === "APPLICANT" ? APPLICANT_EDITABLE_STATUSES.includes(status) : !["PROCESSING", "READY_FOR_AUTHORIZED_REVIEW", "CLOSED"].includes(status));
  const canWithdraw = hasPermission(actor.role, "document.upload") && ["DRAFT", "RECTIFICATION_REQUIRED"].includes(status);
  const active = documents.filter((d) => d.state === "ACTIVE");
  const withdrawn = documents.filter((d) => d.state === "WITHDRAWN");
  const checklistCats = new Set(checklist.map((c) => c.categoryCode));
  const rows: { label: string; mandatory: boolean | null; categoryCode: string; docs: typeof active }[] = [
    ...checklist.map((c) => ({ label: c.label, mandatory: c.mandatory, categoryCode: c.categoryCode, docs: active.filter((d) => d.categoryCode === c.categoryCode) })),
    ...[...new Set(active.filter((d) => !checklistCats.has(d.categoryCode)).map((d) => d.categoryCode))].map((code) => ({ label: categories.find((c) => c.code === code)?.name ?? code, mandatory: null, categoryCode: code, docs: active.filter((d) => d.categoryCode === code) })),
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className={canUpload ? "xl:col-span-2" : "xl:col-span-3"}>
        <CardHeader title="Document checklist and uploads" description="Each document keeps its full version history. Replacements never overwrite earlier evidence." />
        <Table>
          <THead>
            <tr><TH>Requirement</TH><TH>Current file</TH><TH>Processing</TH><TH className="hidden lg:table-cell">Extraction</TH><TH className="text-right">Actions</TH></tr>
          </THead>
          <TBody>
            {rows.map((r) =>
              r.docs.length === 0 ? (
                <TR key={r.categoryCode}>
                  <TD className="font-medium text-ink">{r.label}{r.mandatory === false && <span className="ml-1 text-xs font-normal text-muted">(optional)</span>}</TD>
                  <TD colSpan={3}>{r.mandatory ? <Badge tone="bad">Missing — mandatory</Badge> : <span className="text-xs text-faint">Not submitted</span>}</TD>
                  <TD className="text-right">{canUpload && <UploadDialog applicationId={app.id} categories={categories} defaultCategory={r.categoryCode} maxMb={maxMb} label="Upload" variant={r.mandatory ? "default" : "outline"} />}</TD>
                </TR>
              ) : (
                r.docs.map((d, i) => {
                  const v = d.versions.find((x) => x.isCurrent)!;
                  const warnings = JSON.parse(v.warningsJson || "[]") as string[];
                  return (
                    <TR key={d.id}>
                      <TD className="font-medium text-ink">{i === 0 ? r.label : ""}{i === 0 && r.mandatory === false && <span className="ml-1 text-xs font-normal text-muted">(optional)</span>}{i === 0 && r.mandatory === null && <span className="ml-1 text-xs font-normal text-muted">(not in checklist)</span>}</TD>
                      <TD>
                        <Link href={`/documents/${d.id}`} className="font-medium text-accent hover:underline">{v.originalName}</Link>
                        <p className="text-[11px] text-muted">v{v.versionNo}{d.versions.length > 1 ? ` of ${d.versions.length}` : ""} · {formatBytes(v.sizeBytes)} · {formatDateTime(v.uploadedAt)}</p>
                      </TD>
                      <TD>
                        <ProcessingBadge status={v.processingStatus} />
                        {v.processingError && <p className="mt-1 max-w-xs text-[11px] text-bad">{v.processingError}</p>}
                      </TD>
                      <TD className="hidden lg:table-cell text-xs">
                        {v.extractionMethod ? <>{v.extractionMethod.replace("_", " ")}{v.ocrConfidence !== null && ` · OCR ${pct(v.ocrConfidence)}`} · {v.pageCount} page(s)</> : "—"}
                        {warnings.length > 0 && <p className="text-[11px] text-warn">{warnings.length} warning(s)</p>}
                      </TD>
                      <TD className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link href={`/documents/${d.id}`} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-subtle"><Eye className="size-3.5" /> View</Link>
                          <a href={`/api/documents/versions/${v.id}/file`} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-subtle"><Download className="size-3.5" /> File</a>
                          {canUpload && <UploadDialog applicationId={app.id} categories={categories} maxMb={maxMb} replace={{ documentId: d.id, categoryCode: d.categoryCode, label: `${d.category.name} — ${v.originalName} (v${v.versionNo})` }} />}
                          {canWithdraw && (
                            <ActionDialog label="Withdraw" icon={<Trash2 />} size="xs" variant="ghost" title="Withdraw document" description="The document is removed from evaluation but the file and its history are retained under the audit/retention policy." fields={[{ name: "reason", label: "Reason", type: "textarea" }]} action={withdrawDocumentAction.bind(null, d.id)} />
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                })
              ),
            )}
          </TBody>
        </Table>
        {withdrawn.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs font-semibold text-ink-2">Withdrawn (retained for audit)</p>
            <ul className="mt-1 space-y-1">
              {withdrawn.map((d) => <li key={d.id} className="text-xs text-muted">{d.category.name} — {d.versions[0]?.originalName} · withdrawn {formatDateTime(d.withdrawnAt)}: {d.withdrawnReason}</li>)}
            </ul>
          </div>
        )}
      </Card>
      {canUpload && (
        <div className="space-y-3">
          <Card>
            <CardHeader title="Upload a document" description="PDF text is extracted directly; scanned PDFs and images are processed with OCR." />
            <CardBody><UploadPanel applicationId={app.id} categories={categories} defaultCategory={rows.find((r) => r.mandatory && r.docs.length === 0)?.categoryCode} maxMb={maxMb} /></CardBody>
          </Card>
          <Notice tone="info">After uploading or replacing evidence, {actor.role === "APPLICANT" && status === "RECTIFICATION_REQUIRED" ? "submit your rectification" : "run validation"} so the rules evaluate the new versions.</Notice>
        </div>
      )}
    </div>
  );
}
