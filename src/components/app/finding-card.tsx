import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleOff, MessageSquarePlus, Send, ShieldQuestion } from "lucide-react";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, ROLE_LABELS, type FindingStatus } from "@/lib/domain";
import { findingTypeLabel } from "@/lib/findings";
import type { Evidence } from "@/lib/validation/types";
import { reviewFindingAction } from "@/app/actions/workflow";
import { ActionDialog } from "@/components/action-dialog";
import { EvidenceList } from "@/components/evidence";
import { FindingStatusBadge, OutcomeClassBadge, SeverityBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, relativeAge } from "@/lib/utils";

export interface FindingView {
  id: string;
  source: string;
  type: string;
  title: string;
  description: string;
  severity: string;
  outcomeClass: string;
  isDeterministic: boolean;
  confidence: number | null;
  method: string | null;
  evidenceJson: string;
  recommendedAction: string;
  status: string;
  assignedRole: string | null;
  createdAt: Date;
  resolutionNote: string | null;
  resolvedAt: Date | null;
}

const SOURCE_LABEL: Record<string, string> = { RULE: "Deterministic rule", ANOMALY: "Anomaly indicator", VERIFICATION: "Issuer verification" };

export function FindingActions({ finding, actor }: { finding: { id: string; status: string }; actor: Actor }) {
  if (!hasPermission(actor.role, "finding.review")) return null;
  const active = ACTIVE_FINDING_STATUSES.includes(finding.status as FindingStatus);
  const reason = (label = "Reason") => [{ name: "reason", label, type: "textarea" as const }];
  return (
    <div className="flex flex-wrap gap-1.5">
      {active && (
        <>
          <ActionDialog label="Resolve" icon={<CheckCircle2 />} size="xs" title="Resolve finding" description="Record why this finding no longer requires action (e.g. evidence confirmed, explanation accepted). A reason is mandatory and audited." fields={reason("Resolution reason")} action={reviewFindingAction.bind(null, finding.id, "RESOLVE")} />
          <ActionDialog label="Dismiss" icon={<CircleOff />} size="xs" title="Dismiss finding" description="Dismiss a finding you judge not to be a genuine issue (e.g. a legitimate duplicate). A reason is mandatory and audited." fields={reason("Why is this not an issue?")} action={reviewFindingAction.bind(null, finding.id, "DISMISS")} />
          <ActionDialog label="Request info" icon={<Send />} size="xs" title="Request additional information" description="The institution is notified. Use Rectification to formally return the application." fields={reason("Information requested")} action={reviewFindingAction.bind(null, finding.id, "REQUEST_INFO")} />
          <ActionDialog
            label="Escalate"
            icon={<ArrowUpRight />}
            size="xs"
            title="Escalate finding"
            fields={[{ name: "escalateTo", label: "Escalate to", type: "select", options: (["SCRUTINY_OFFICER", "SENIOR_OFFICIAL"] as const).map((r) => ({ value: r, label: ROLE_LABELS[r] })) }, ...reason("Reason for escalation")]}
            action={reviewFindingAction.bind(null, finding.id, "ESCALATE")}
          />
        </>
      )}
      <ActionDialog label="Internal note" icon={<MessageSquarePlus />} size="xs" variant="ghost" title="Add internal note" description="Internal notes are visible to officials only, never to the institution." fields={[{ name: "reason", label: "Note", type: "textarea" }]} action={reviewFindingAction.bind(null, finding.id, "NOTE")} />
    </div>
  );
}

export function FindingCard({ f, actor, showLink = true }: { f: FindingView; actor: Actor; showLink?: boolean }) {
  const evidence = JSON.parse(f.evidenceJson || "[]") as Evidence[];
  const active = ACTIVE_FINDING_STATUSES.includes(f.status as FindingStatus);
  const isApplicant = actor.role === "APPLICANT";
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">{f.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={f.severity} />
            {!isApplicant && <OutcomeClassBadge outcomeClass={f.outcomeClass} deterministic={f.isDeterministic} />}
            {!isApplicant && <Badge tone="outline">{SOURCE_LABEL[f.source] ?? f.source}</Badge>}
            <Badge tone="neutral">{findingTypeLabel(f.type)}</Badge>
            <FindingStatusBadge status={f.status} />
            {f.confidence !== null && <span className="text-[11px] text-muted">confidence {Math.round(f.confidence * 100)}%</span>}
          </div>
        </div>
        <div className="text-right text-[11px] text-muted">
          <p>Raised {formatDateTime(f.createdAt)}</p>
          {active && <p>Open {relativeAge(f.createdAt)}{f.assignedRole && !isApplicant ? ` · ${ROLE_LABELS[f.assignedRole as keyof typeof ROLE_LABELS]}` : ""}</p>}
        </div>
      </div>
      <div className="space-y-3 px-4 py-3 text-[13px]">
        <p className="text-ink-2">{f.description}</p>
        {f.source === "ANOMALY" && <p className="text-[11px] text-muted">Investigative indicator from deterministic heuristics. It does not establish that the document is fraudulent.</p>}
        <EvidenceList items={evidence} canSeeOtherApplications={!isApplicant} />
        <div className="rounded-md border border-accent-line bg-accent-soft/60 px-3 py-2 text-xs"><span className="font-semibold text-ink">{isApplicant ? "What you need to do: " : "Recommended action: "}</span><span className="text-ink-2">{f.recommendedAction}</span></div>
        {f.method && <p className="text-[11px] text-muted">Detection method: {f.method}</p>}
        {f.resolutionNote && <p className="text-xs text-muted"><span className="font-medium text-ink-2">Resolution{f.resolvedAt ? ` (${formatDateTime(f.resolvedAt)})` : ""}: </span>{f.resolutionNote}</p>}
      </div>
      {(!isApplicant || showLink) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <FindingActions finding={f} actor={actor} />
          {showLink && !isApplicant && <Link href={`/review/${f.id}`} className="text-xs font-medium text-accent hover:underline">Open full review <ShieldQuestion className="inline size-3" /></Link>}
        </div>
      )}
    </div>
  );
}
