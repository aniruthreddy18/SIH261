import { ClipboardCheck } from "lucide-react";
import type { Actor } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, SEVERITY_RANK, type FindingStatus, type Severity } from "@/lib/domain";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { FindingCard } from "@/components/app/finding-card";
import { FindingStatusBadge } from "@/components/status";
import { formatDateTime } from "@/lib/utils";
import type { Detail } from "./types";

export function FindingsTab({ findings, actor }: { findings: Detail["findings"]; actor: Actor }) {
  const active = findings.filter((f) => ACTIVE_FINDING_STATUSES.includes(f.status as FindingStatus)).sort((a, b) => SEVERITY_RANK[b.severity as Severity] - SEVERITY_RANK[a.severity as Severity]);
  const closed = findings.filter((f) => !ACTIVE_FINDING_STATUSES.includes(f.status as FindingStatus));
  return (
    <div className="space-y-4">
      {active.length === 0 ? (
        <Card><EmptyState icon={<ClipboardCheck />} title="No open findings" description="Findings appear here after validation runs, anomaly analysis and issuer verification." /></Card>
      ) : (
        active.map((f) => <FindingCard key={f.id} f={f} actor={actor} showLink={actor.role !== "APPLICANT"} />)
      )}
      {closed.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-ink">Closed and historical findings ({closed.length}) — preserved for audit</summary>
            <ul className="divide-y divide-border border-t border-border">
              {closed.map((f) => (
                <li key={f.id} className="flex flex-wrap items-start gap-2 px-4 py-2.5 text-[13px]">
                  <FindingStatusBadge status={f.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{f.title}</p>
                    <p className="text-xs text-muted">{f.resolutionNote}</p>
                  </div>
                  <span className="text-[11px] text-faint">{formatDateTime(f.resolvedAt ?? f.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}
