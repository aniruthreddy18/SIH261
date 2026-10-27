import { MessageSquarePlus } from "lucide-react";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import type { getComplianceMatrix } from "@/server/compliance";
import { complianceNoteAction } from "@/app/actions/workflow";
import { ActionDialog } from "@/components/action-dialog";
import { Badge } from "@/components/ui/badge";
import { RuleStatusBadge } from "@/components/status";
import { formatDateTime } from "@/lib/utils";

type Matrix = Awaited<ReturnType<typeof getComplianceMatrix>>;
const TONE = { SATISFIED: "ok", DEFICIENT: "bad", REVIEW_REQUIRED: "warn", NOT_ASSESSED: "neutral", NOT_APPLICABLE: "outline" } as const;
const LABEL = { SATISFIED: "Evidence satisfactory", DEFICIENT: "Deficient", REVIEW_REQUIRED: "Review required", NOT_ASSESSED: "Not assessed", NOT_APPLICABLE: "Not applicable" } as const;

export function ComplianceMatrix({ matrix, actor }: { matrix: Matrix; actor: Actor }) {
  const canNote = hasPermission(actor.role, "compliance.note") && matrix.app.status !== "CLOSED";
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Evaluated against {matrix.lastRun ? `validation run #${matrix.lastRun.runNumber} (${formatDateTime(matrix.lastRun.completedAt)})` : "no completed validation run"} and the latest issuer verification of each current document. This assesses <strong>documentary evidence only</strong>; it does not establish physical infrastructure compliance, which requires inspection.
      </p>
      {matrix.rows.map((r) => (
        <div key={r.requirement.code} className="glass-card rounded-2xl border">
          <div className="flex flex-wrap items-start gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink"><span className="mr-2 font-mono text-[11px] font-normal text-muted">{r.requirement.code}</span>{r.requirement.name}</p>
              <p className="mt-0.5 text-xs text-muted">{r.requirement.area} · {r.requirement.description}</p>
            </div>
            <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
          </div>
          <div className="grid gap-4 px-4 py-3 text-xs md:grid-cols-3">
            <div>
              <p className="mb-1 font-semibold text-ink-2">Current evidence</p>
              {r.evidence.length ? r.evidence.map((e) => <p key={e.id}><a className="text-accent hover:underline" href={`/documents/${e.id}`}>{e.file}</a> <span className="text-muted">(v{e.version})</span></p>) : <p className="text-muted">None submitted</p>}
              {r.imageEvidence.map((t, i) => <p key={i} className="mt-1 text-[11px] text-warn">{t}</p>)}
            </div>
            <div>
              <p className="mb-1 font-semibold text-ink-2">Linked rule results</p>
              {r.linkedResults.length ? (
                <ul className="space-y-1">{r.linkedResults.map((x, i) => <li key={i} className="flex flex-wrap items-center gap-1.5"><RuleStatusBadge status={x.status} /><span className="font-mono text-[10.5px] text-muted">{x.ruleCode} v{x.ruleVersionNo}</span></li>)}</ul>
              ) : <p className="text-muted">—</p>}
            </div>
            <div>
              <p className="mb-1 font-semibold text-ink-2">Outstanding deficiency</p>
              {r.deficiencies.length ? <ul className="list-disc space-y-1 pl-4 text-ink-2">{r.deficiencies.map((d, i) => <li key={i}>{d}</li>)}</ul> : <p className="text-muted">None</p>}
              {r.status !== "SATISFIED" && r.status !== "NOT_APPLICABLE" && <p className="mt-1 text-muted">Remediation: {r.requirement.remediation}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-[11px] text-muted">
            <span>Rule source: {r.requirement.ruleSource}{r.requirement.sourceReference ? ` (${r.requirement.sourceReference})` : ""}</span>
            {r.requirement.isSample && <Badge tone="warn">Sample requirement</Badge>}
            <span className="ml-auto" />
            {canNote && <ActionDialog label="Add review note" icon={<MessageSquarePlus />} size="xs" variant="ghost" title={`Review note — ${r.requirement.code}`} fields={[{ name: "note", label: "Note", type: "textarea" }]} action={complianceNoteAction.bind(null, matrix.app.id, r.requirement.code)} />}
          </div>
          {r.notes.length > 0 && (
            <ul className="space-y-1 border-t border-border px-4 py-2 text-xs">
              {r.notes.map((n) => <li key={n.id} className="text-ink-2"><span className="font-medium">{n.authorName}</span> <span className="text-faint">{formatDateTime(n.createdAt)}</span> — {n.note}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
