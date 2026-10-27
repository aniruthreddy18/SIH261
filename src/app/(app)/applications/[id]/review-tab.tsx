import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/page-header";
import { DECISION_OUTCOMES, REVIEW_ACTION_LABELS, type DecisionOutcome } from "@/lib/findings";
import { DECISION_SUPPORT_DISCLAIMER, ROLE_LABELS, type Role } from "@/lib/domain";
import { formatDateTime } from "@/lib/utils";
import type { Detail } from "./types";

export function ReviewTab({ detail }: { detail: Detail }) {
  const decision = detail.reviewActions.find((r) => r.action === "DECISION");
  return (
    <div className="space-y-4">
      {decision && (
        <Card className="border-accent-line">
          <CardHeader title="Recorded human review outcome" description={`${decision.actorName} (${ROLE_LABELS[decision.actorRole as Role]}) · ${formatDateTime(decision.createdAt)} · Ref ${decision.reference}`} />
          <div className="space-y-2 px-4 py-3 text-[13px]">
            <p className="font-semibold text-ink">{DECISION_OUTCOMES[decision.outcome as DecisionOutcome] ?? decision.outcome}</p>
            <p className="text-ink-2">{decision.reason}</p>
            <Notice tone="info">Recorded human review action — not an automatically generated regulatory approval. {DECISION_SUPPORT_DISCLAIMER}</Notice>
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title="Human review actions" description="Every action records the reviewer, role, reason and time. Internal notes are hidden from institutions." />
        {detail.reviewActions.length === 0 ? (
          <EmptyState title="No review actions yet" />
        ) : (
          <ul className="divide-y divide-border">
            {detail.reviewActions.map((r) => {
              const finding = r.findingId ? detail.findings.find((f) => f.id === r.findingId) : null;
              return (
                <li key={r.id} className="px-4 py-2.5 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.action === "DECISION" ? "accent" : r.action === "NOTE" ? "neutral" : "outline"}>{REVIEW_ACTION_LABELS[r.action] ?? r.action}</Badge>
                    {r.outcome && <span className="text-xs text-muted">{r.outcome in DECISION_OUTCOMES ? DECISION_OUTCOMES[r.outcome as DecisionOutcome] : r.outcome.replace(/_/g, " ").toLowerCase()}</span>}
                    <span className="ml-auto text-[11px] text-muted">{r.actorName} · {ROLE_LABELS[r.actorRole as Role]} · {formatDateTime(r.createdAt)}</span>
                  </div>
                  {finding && <p className="mt-1 text-xs text-muted">Finding: {finding.title}</p>}
                  <p className="mt-1 text-ink-2">{r.reason}</p>
                  {r.reference && <p className="text-[11px] text-muted">Reference: {r.reference}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
