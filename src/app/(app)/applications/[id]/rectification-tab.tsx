import { Send, Undo2 } from "lucide-react";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { submitRectificationAction } from "@/app/actions/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/page-header";
import { ActionDialog } from "@/components/action-dialog";
import { RectificationRequestForm } from "@/components/app/rectification-form";
import { UploadDialog } from "@/components/app/replace-dialog";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Detail } from "./types";

const ACTIVE = ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"];

export function RectificationTab({ detail, actor, categories, maxMb }: { detail: Detail; actor: Actor; categories: { code: string; name: string }[]; maxMb: number }) {
  const { app, rectifications, findings, documents } = detail;
  const open = rectifications.find((r) => r.status === "OPEN");
  const canRequest = hasPermission(actor.role, "application.requestRectification") && ["AUTO_FAILED", "REVIEW_REQUIRED", "AUTO_PASSED", "PROCESSING_FAILED", "READY_FOR_AUTHORIZED_REVIEW"].includes(app.status);
  const canSubmit = hasPermission(actor.role, "application.submitRectification") && app.status === "RECTIFICATION_REQUIRED" && !!open;
  const activeFindings = findings.filter((f) => ACTIVE.includes(f.status));
  const requested = findings.filter((f) => f.status === "RECTIFICATION_REQUESTED");
  const changedSince = open ? documents.flatMap((d) => d.versions.filter((v) => v.uploadedAt > open.createdAt).map((v) => ({ doc: d, v }))) : [];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {canSubmit && open && (
          <Card className="border-amber-300">
            <CardHeader title="Rectification requested" description={`Requested by ${open.requestedBy} on ${formatDateTime(open.createdAt)}${open.dueDate ? ` · due ${formatDate(open.dueDate)}` : ""}`} />
            <CardBody className="space-y-3">
              <Notice tone="warn">{open.message}</Notice>
              <p className="text-xs font-semibold text-ink-2">Deficiencies to correct</p>
              <ul className="space-y-2">
                {requested.map((f) => {
                  const doc = f.documentId ? documents.find((d) => d.id === f.documentId) : null;
                  const cur = doc?.versions.find((v) => v.isCurrent);
                  return (
                    <li key={f.id} className="rounded-md border border-border px-3 py-2 text-[13px]">
                      <p className="font-medium text-ink">{f.title}</p>
                      <p className="mt-0.5 text-xs text-ink-2">{f.description}</p>
                      <p className="mt-1 text-xs"><span className="font-semibold">Required correction: </span>{f.recommendedAction}</p>
                      <div className="mt-2">
                        {doc && cur ? (
                          <UploadDialog applicationId={app.id} categories={categories} maxMb={maxMb} replace={{ documentId: doc.id, categoryCode: doc.categoryCode, label: `${doc.category.name} — ${cur.originalName} (v${cur.versionNo})` }} label="Upload replacement" variant="default" />
                        ) : (
                          <UploadDialog applicationId={app.id} categories={categories} maxMb={maxMb} label="Upload missing document" variant="default" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-md border border-border bg-subtle/50 px-3 py-2 text-xs">
                <p className="font-semibold text-ink-2">Changes since the request</p>
                {changedSince.length ? changedSince.map(({ doc, v }) => <p key={v.id} className="text-ink-2">{doc.category.name}: {v.originalName} (v{v.versionNo}) — {v.processingStatus.toLowerCase()}</p>) : <p className="text-muted">No documents uploaded yet.</p>}
              </div>
              <ActionDialog
                label="Submit corrections and revalidate"
                icon={<Send />}
                variant="default"
                title="Submit rectification"
                description="Validation is re-run on the current document versions. Findings clear only if their checks now pass — uploading a document does not clear unrelated findings."
                fields={[{ name: "note", label: "Response to the scrutiny officer", type: "textarea" }]}
                action={submitRectificationAction.bind(null, app.id)}
              />
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Rectification history" description="All requests and responses are retained." />
          {rectifications.length === 0 ? (
            <EmptyState title="No rectification requests" />
          ) : (
            <ul className="divide-y divide-border">
              {rectifications.map((r) => {
                const ids = JSON.parse(r.findingIdsJson) as string[];
                return (
                  <li key={r.id} className="px-4 py-3 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.status === "OPEN" ? "warn" : r.status === "SUBMITTED" ? "info" : "neutral"}>{r.status.toLowerCase()}</Badge>
                      <span className="font-medium text-ink">Requested by {r.requestedBy}</span>
                      <span className="text-xs text-muted">{formatDateTime(r.createdAt)}{r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}</span>
                    </div>
                    <p className="mt-1 text-ink-2">{r.message}</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-muted">{ids.map((id) => <li key={id}>{findings.find((f) => f.id === id)?.title ?? id} — {findings.find((f) => f.id === id)?.status.replace(/_/g, " ").toLowerCase()}</li>)}</ul>
                    {r.submittedAt && <p className="mt-1 text-xs text-ink-2"><span className="font-medium">Response ({formatDateTime(r.submittedAt)}): </span>{r.responseNote}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <div>
        {canRequest ? (
          <Card>
            <CardHeader title="Return for rectification" description="Select the findings the institution must address." />
            <CardBody>
              {activeFindings.length ? <RectificationRequestForm applicationId={app.id} findings={activeFindings.map((f) => ({ id: f.id, title: f.title, severity: f.severity }))} /> : <p className="text-xs text-muted">There are no open findings to return.</p>}
            </CardBody>
          </Card>
        ) : (
          <Notice tone="info" title="How rectification works">
            <span className="flex items-start gap-2"><Undo2 className="mt-0.5 size-4 shrink-0" />An officer returns specific findings; the institution replaces or adds evidence and submits; validation re-runs and the comparison with the previous run is shown on the Validation tab.</span>
          </Notice>
        )}
      </div>
    </div>
  );
}
