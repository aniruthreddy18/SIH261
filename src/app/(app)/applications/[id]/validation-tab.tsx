import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { getRunComparison } from "@/server/validation";
import { json } from "@/server/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { RuleStatusBadge, SeverityBadge } from "@/components/status";
import { EvidenceList } from "@/components/evidence";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import type { Evidence } from "@/lib/validation/types";
import type { Detail } from "./types";

const ORDER: Record<string, number> = { FAIL: 0, PROCESSING_FAILED: 1, REVIEW_REQUIRED: 2, PENDING: 3, PASS: 4, NOT_APPLICABLE: 5 };

export async function ValidationTab({ applicationId, runs, selectedRunId, canSeeOther }: { applicationId: string; runs: Detail["runs"]; selectedRunId?: string; canSeeOther: boolean }) {
  if (runs.length === 0) return <Card><EmptyState icon={<ListChecks />} title="No validation runs yet" description="Upload the required documents, then run validation. Every run records the rule versions it used and is kept as history." /></Card>;
  const selected = runs.find((r) => r.id === selectedRunId) ?? runs[0];
  const cmp = await getRunComparison(applicationId, selected.id);
  const results = (cmp?.run.results ?? []).slice().sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.ruleCode.localeCompare(b.ruleCode));
  const summary = json<Record<string, number>>(selected.summaryJson, {});
  const ruleVersions = json<{ code: string; version: number }[]>(selected.ruleVersionsJson, []);
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      <Card className="xl:col-span-1 self-start">
        <CardHeader title="Run history" description="Earlier runs are retained, never overwritten." />
        <ul className="divide-y divide-border">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`?tab=validation&run=${r.id}`} scroll={false} className={cn("block px-4 py-2.5 hover:bg-subtle", r.id === selected.id && "bg-accent-soft")}>
                <p className="text-[13px] font-medium text-ink">Run #{r.runNumber} <span className="font-normal text-muted">· {r.trigger.toLowerCase()}</span></p>
                <p className="text-[11px] text-muted">{formatDateTime(r.startedAt)} · {r.startedByLabel}</p>
                <p className="mt-0.5 text-[11px] text-ink-2">{r.status === "COMPLETED" ? `Outcome: ${r.machineOutcome?.replace(/_/g, " ").toLowerCase()}` : r.status === "FAILED" ? `Failed: ${r.errorMessage}` : "Running"}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4 xl:col-span-3">
        <Card>
          <CardHeader title={`Run #${selected.runNumber}`} description={`${formatDateTime(selected.startedAt)} → ${formatDateTime(selected.completedAt)} · correlation ${selected.correlationId.slice(0, 8)}`} />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="ok">{summary.pass ?? 0} passed</Badge>
              <Badge tone="bad">{summary.fail ?? 0} failed</Badge>
              <Badge tone="warn">{summary.review ?? 0} need review</Badge>
              <Badge tone="neutral">{summary.notApplicable ?? 0} not applicable</Badge>
              {(summary.processingFailed ?? 0) > 0 && <Badge tone="bad">{summary.processingFailed} processing failures</Badge>}
              <Badge tone="info">{summary.anomalies ?? 0} anomaly indicators</Badge>
            </div>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer select-none text-ink-2">Rule versions used ({ruleVersions.length})</summary>
              <p className="mt-1 font-mono text-[11px]">{ruleVersions.map((r) => `${r.code}@v${r.version}`).join("  ")}</p>
            </details>
          </CardBody>
        </Card>
        {cmp?.previous && (
          <Card>
            <CardHeader title={`What changed since run #${cmp.previous.runNumber}`} description="Result-by-result comparison keyed by rule and subject." />
            {cmp.changes.length === 0 ? (
              <CardBody><p className="text-xs text-muted">No result changed between these runs.</p></CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {cmp.changes.map((c) => (
                  <li key={c.subjectKey} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
                    <Badge tone={c.kind === "IMPROVED" ? "ok" : c.kind === "REGRESSED" || c.kind === "NEW" ? "bad" : "neutral"}>{c.kind.toLowerCase()}</Badge>
                    <span className="font-mono text-[11px] text-muted">{c.ruleCode}</span>
                    <span className="text-ink">{c.subjectLabel}</span>
                    <span className="ml-auto flex items-center gap-1.5">{c.before ? <RuleStatusBadge status={c.before} /> : <span className="text-xs text-faint">—</span>}<ArrowRight className="size-3 text-faint" />{c.after ? <RuleStatusBadge status={c.after} /> : <span className="text-xs text-faint">removed</span>}</span>
                    {(c.observedBefore || c.observedAfter) && c.observedBefore !== c.observedAfter && <p className="w-full text-[11px] text-muted">Observed: {c.observedBefore ?? "—"} → {c.observedAfter ?? "—"}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card>
          <CardHeader title="Rule results" description="Each result states what was checked, the evidence used, the rule applied and the next action." />
          <ul className="divide-y divide-border">
            {results.map((r) => (
              <li key={r.id}>
                <details className="group px-4 py-2.5" open={r.status === "FAIL" || r.status === "PROCESSING_FAILED"}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                    <RuleStatusBadge status={r.status} />
                    <span className="font-mono text-[11px] text-muted">{r.ruleCode} v{r.ruleVersionNo}</span>
                    <span className="text-[13px] font-medium text-ink">{r.ruleName}</span>
                    <span className="text-xs text-muted">— {r.subjectLabel}</span>
                    {r.status !== "PASS" && r.status !== "NOT_APPLICABLE" && <span className="ml-auto"><SeverityBadge severity={r.severity} /></span>}
                  </summary>
                  <div className="mt-2 space-y-2 pl-1 text-[13px]">
                    <p className="text-ink-2">{r.explanation}</p>
                    {(r.expected || r.observed) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {r.expected && <div className="rounded border border-border px-2.5 py-1.5 text-xs"><span className="text-muted">Expected: </span>{r.expected}</div>}
                        {r.observed && <div className="rounded border border-border px-2.5 py-1.5 text-xs"><span className="text-muted">Observed: </span>{r.observed}</div>}
                      </div>
                    )}
                    <EvidenceList items={json<Evidence[]>(r.evidenceJson, [])} canSeeOtherApplications={canSeeOther} />
                    {r.nextAction && <p className="text-xs"><span className="font-medium text-ink">Next action: </span><span className="text-ink-2">{r.nextAction}</span></p>}
                    <p className="text-[11px] text-faint">Executed {formatDateTime(r.executedAt)}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
