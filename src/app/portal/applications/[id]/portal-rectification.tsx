import { CalendarClock, Send } from "lucide-react";
import { submitRectificationAction } from "@/app/actions/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionDialog } from "@/components/action-dialog";
import { UploadDialog } from "@/components/app/replace-dialog";
import { Notice } from "@/components/page-header";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Detail } from "@/app/(app)/applications/[id]/types";

/** Shown while AICTE has asked the institution to correct deficiencies. */
export function PortalRectification({ detail, categories, maxMb }: { detail: Detail; categories: { code: string; name: string }[]; maxMb: number }) {
  const { app, rectifications, findings, documents } = detail;
  const open = rectifications.find((r) => r.status === "OPEN");
  if (app.status !== "RECTIFICATION_REQUIRED" || !open) return null;
  const requested = findings.filter((f) => f.status === "RECTIFICATION_REQUESTED");
  const changed = documents.flatMap((d) => d.versions.filter((v) => v.uploadedAt > open.createdAt).map((v) => ({ d, v })));
  return (
    <Card className="border-warn-line">
      <CardHeader
        title="Correction requested by AICTE"
        description={`Requested by ${open.requestedBy} on ${formatDateTime(open.createdAt)}`}
        actions={open.dueDate ? <span className="flex items-center gap-1 text-xs font-semibold text-warn"><CalendarClock className="size-4" /> Due {formatDate(open.dueDate)}</span> : undefined}
      />
      <CardBody className="space-y-3">
        <Notice tone="warn">{open.message}</Notice>
        <ol className="space-y-2">
          {requested.map((f, i) => {
            const doc = f.documentId ? documents.find((d) => d.id === f.documentId) : null;
            const cur = doc?.versions.find((v) => v.isCurrent);
            return (
              <li key={f.id} className="rounded-md border border-border px-3 py-2.5 text-[13px]">
                <p className="font-medium text-ink">{i + 1}. {f.title}</p>
                <p className="mt-0.5 text-xs text-ink-2">{f.description}</p>
                <p className="mt-1 text-xs"><span className="font-semibold">What to do: </span>{f.recommendedAction}</p>
                <div className="mt-2">
                  {doc && cur ? (
                    <UploadDialog applicationId={app.id} categories={categories} maxMb={maxMb} replace={{ documentId: doc.id, categoryCode: doc.categoryCode, label: `${doc.category.name} — ${cur.originalName} (v${cur.versionNo})` }} label="Upload replacement" variant="default" />
                  ) : (
                    <UploadDialog applicationId={app.id} categories={categories} maxMb={maxMb} defaultCategory={(JSON.parse(f.evidenceJson || "[]") as { categoryCode?: string }[]).find((e) => e.categoryCode)?.categoryCode} label="Upload missing document" variant="default" />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="rounded-md border border-border bg-subtle/50 px-3 py-2 text-xs">
          <p className="font-semibold text-ink-2">Uploaded since the request</p>
          {changed.length ? changed.map(({ d, v }) => <p key={v.id} className="text-ink-2">{d.category.name}: {v.originalName} (v{v.versionNo}) — {v.processingStatus.toLowerCase()}</p>) : <p className="text-muted">Nothing uploaded yet.</p>}
        </div>
        <ActionDialog
          label="Submit corrections and revalidate"
          icon={<Send />}
          variant="default"
          size="default"
          title="Submit your corrections"
          description="The automatic checks run again on your latest documents. Issues clear only if their checks now pass."
          fields={[{ name: "note", label: "Message to the AICTE officer", type: "textarea" }]}
          action={submitRectificationAction.bind(null, app.id)}
        />
      </CardBody>
    </Card>
  );
}
