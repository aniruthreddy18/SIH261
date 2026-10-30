import { FileText } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EscalationBadge } from "@/components/workflow/stage-ui";
import { ComplianceTiming } from "@/components/workflow/compliance-ui";
import { complianceTypeLabel, COMPLIANCE_STATUS_LABELS } from "@/lib/workflow/stages";
import { formatBytes, formatDate, formatDateTime } from "@/lib/utils";

interface Submission {
  id: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  note: string;
  newValidUntil: Date | null;
  newReference: string | null;
  submittedByName: string;
  submittedAt: Date;
  review: string;
  reviewerName: string | null;
  reviewRemarks: string | null;
  reviewedAt: Date | null;
}

export interface ComplianceItemView {
  id: string;
  kind: string;
  typeCode: string;
  title: string;
  description: string;
  reference: string | null;
  dueDate: Date;
  status: string;
  escalationLevel: number;
  createdByName: string;
  createdAt: Date;
  closedNote: string | null;
  institution: { name: string; region?: { name: string } | null };
  application: { id: string; reference: string } | null;
  submissions: Submission[];
}

const REVIEW_TONE: Record<string, "info" | "ok" | "warn"> = { PENDING: "info", ACCEPTED: "ok", RETURNED: "warn" };
const REVIEW_LABEL: Record<string, string> = { PENDING: "Awaiting verification", ACCEPTED: "Verified", RETURNED: "Returned" };

export function ComplianceFacts({ item, warnDays, applicationHref }: { item: ComplianceItemView; warnDays: number; applicationHref?: string }) {
  const isDoc = item.kind === "DOCUMENT_VALIDITY";
  return (
    <Card>
      <CardHeader title={item.title} description={`${isDoc ? "Document validity" : "Time-bound undertaking"} · ${complianceTypeLabel(item.typeCode)}`} actions={<div className="flex gap-1"><ComplianceTiming status={item.status} dueDate={item.dueDate} kind={item.kind} warnDays={warnDays} /><EscalationBadge level={item.escalationLevel} /></div>} />
      <CardBody>
        <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Institution</dt><dd className="text-ink">{item.institution.name}{item.institution.region ? <span className="text-muted"> · {item.institution.region.name}</span> : null}</dd></div>
          <div><dt className="text-xs text-muted">{isDoc ? "Valid until" : "Due date"}</dt><dd className="font-medium text-ink tabular">{formatDate(item.dueDate)}</dd></div>
          {item.reference && <div><dt className="text-xs text-muted">Reference</dt><dd className="font-mono text-ink">{item.reference}</dd></div>}
          <div><dt className="text-xs text-muted">Status</dt><dd className="text-ink">{COMPLIANCE_STATUS_LABELS[item.status] ?? item.status}{item.closedNote ? <span className="text-muted"> — {item.closedNote}</span> : null}</dd></div>
          {item.application && applicationHref && <div><dt className="text-xs text-muted">Linked application</dt><dd><a href={applicationHref} className="font-mono text-accent hover:underline">{item.application.reference}</a></dd></div>}
          <div><dt className="text-xs text-muted">Recorded</dt><dd className="text-ink-2">{item.createdByName} · {formatDate(item.createdAt)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted">{isDoc ? "Notes" : "Condition and evidence expected"}</dt><dd className="text-ink-2">{item.description}</dd></div>
        </dl>
      </CardBody>
    </Card>
  );
}

export function SubmissionList({ item, renderActions }: { item: ComplianceItemView; renderActions?: (s: Submission) => React.ReactNode }) {
  return (
    <Card className="mt-4">
      <CardHeader title="Submissions" description="Every submission is kept with its SHA-256 hash and the verifying official's remarks." />
      {item.submissions.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted">Nothing submitted yet.</p> : (
        <ul className="divide-y divide-border">
          {item.submissions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <FileText className="mt-0.5 size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="flex flex-wrap items-center gap-2"><a href={`/api/compliance/submissions/${s.id}/file`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{s.fileName}</a><span className="text-xs text-muted">{formatBytes(s.sizeBytes)}</span><Badge tone={REVIEW_TONE[s.review] ?? "neutral"}>{REVIEW_LABEL[s.review] ?? s.review}</Badge></p>
                <p className="mt-0.5 text-ink-2">{s.note}</p>
                {s.newValidUntil && <p className="text-xs text-ink-2">Renewed document valid until <strong className="tabular">{formatDate(s.newValidUntil)}</strong>{s.newReference ? <> · ref <span className="font-mono">{s.newReference}</span></> : null}</p>}
                <p className="mt-0.5 text-[11px] text-muted">Submitted by {s.submittedByName} · {formatDateTime(s.submittedAt)} · SHA-256 <span className="font-mono">{s.sha256.slice(0, 16)}…</span></p>
                {s.reviewedAt && <p className="mt-1 rounded-md bg-subtle/70 px-2 py-1 text-xs text-ink-2"><strong>{s.reviewerName}</strong> · {formatDateTime(s.reviewedAt)}: {s.reviewRemarks}</p>}
              </div>
              {renderActions && <div className="flex shrink-0 gap-1.5">{renderActions(s)}</div>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
