import Link from "next/link";
import { AlarmClock, Download, FileText, Timer } from "lucide-react";
import { applicationTypeLabel, APPLICATION_TYPES, DUE_STATE_LABELS, stageLabel } from "@/lib/workflow/stages";
import { getPendency } from "@/server/pendency";
import { pageGuard } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DueBadge, EscalationBadge } from "@/components/workflow/stage-ui";
import { cn, formatDate } from "@/lib/utils";
import { reportCsvPath } from "@/server/monitoring-reports";

export const metadata = { title: "Pendency Monitor" };

function Kpi({ label, value, tone, hint }: { label: string; value: number | string; tone?: "bad" | "warn" | "ok"; hint: string }) {
  return (
    <div className="glass-card rounded-2xl border px-4 py-3" title={hint}>
      <p className={cn("text-2xl font-semibold tabular", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</p>
      <p className="text-xs text-ink-2">{label}</p>
    </div>
  );
}

export default async function PendencyPage({ searchParams }: { searchParams: Promise<{ region?: string; stage?: string; type?: string; state?: string }> }) {
  const { actor, denied } = await pageGuard("workflow.monitor");
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "Pendency Monitor" }];
  if (denied) return (<><PageHeader title="Pendency Monitor" crumbs={crumbs} /><AccessDenied /></>);
  const sp = await searchParams;
  const p = await getPendency(actor, { regionId: sp.region || undefined, stage: sp.stage || undefined, type: sp.type || undefined, state: sp.state || undefined });
  const scopedRegion = actor.role === "SCRUTINY_OFFICER" && actor.regionId ? p.regions.find((r) => r.id === actor.regionId) : null;
  const filtered = Boolean(sp.region || sp.stage || sp.type || sp.state);
  return (
    <>
      <PageHeader
        title="Pendency Monitor"
        crumbs={crumbs}
        description={<>Where every application is, how long it has been there and what is overdue — across Regions, stages and desks. Timelines are sample configuration (Workflow &amp; Timelines), not values from the Approval Process Handbook.{scopedRegion ? <> Showing <strong>{scopedRegion.name}</strong> only.</> : null}</>}
        actions={<>
          <Button asChild size="sm" variant="outline"><a href={reportCsvPath("pendency")}><Download /> CSV</a></Button>
          <Button asChild size="sm" variant="outline"><a href="/api/reports/monitoring"><FileText /> Consolidated PDF</a></Button>
        </>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="In process at a stage" value={p.totals.inProcess} hint="Applications with an active processing stage." />
        <Kpi label="Overdue at their stage" value={p.totals.overdue} tone={p.totals.overdue ? "bad" : "ok"} hint="Past the stage timeline." />
        <Kpi label="Due within reminder window" value={p.totals.dueSoon} tone={p.totals.dueSoon ? "warn" : undefined} hint="Reminders have been (or will be) sent." />
        <Kpi label="Escalated (level 2+)" value={p.totals.escalated} tone={p.totals.escalated ? "bad" : undefined} hint="Escalated to the Bureau or the competent authority." />
        <Kpi label="With institution (rectification)" value={p.totals.withInstitution} hint="Returned for deficiencies; not counted against AICTE stages." />
        <Kpi label="Average days in current stage" value={p.totals.avgDaysInStage} hint="Across all applications in process." />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Region × stage pendency" description="Applications currently at each stage; red = overdue, amber = due soon. Click a cell to filter the case list." />
          <Table>
            <THead><tr><TH>Region</TH>{p.stages.map((s) => <TH key={s} className="text-center">{stageLabel(s)}</TH>)}<TH className="text-center">Total</TH></tr></THead>
            <TBody>
              {p.matrix.filter((r) => !scopedRegion || r.regionId === scopedRegion.id).map((r) => {
                const total = r.cells.reduce((n, c) => n + c.total, 0);
                const over = r.cells.reduce((n, c) => n + c.overdue, 0);
                return (
                  <TR key={r.regionId}>
                    <TD className="font-medium text-ink">{r.regionName}</TD>
                    {r.cells.map((c) => (
                      <TD key={c.stage} className="text-center">
                        {c.total ? (
                          <Link href={`/pendency?region=${r.regionId}&stage=${c.stage}`} className="inline-flex flex-col items-center rounded-md px-2 py-0.5 hover:bg-accent-soft">
                            <span className="text-sm font-semibold tabular text-ink">{c.total}</span>
                            {(c.overdue > 0 || c.dueSoon > 0) && <span className="text-[10.5px] tabular">{c.overdue > 0 && <span className="text-bad">{c.overdue} overdue</span>}{c.overdue > 0 && c.dueSoon > 0 && " · "}{c.dueSoon > 0 && <span className="text-warn">{c.dueSoon} soon</span>}</span>}
                          </Link>
                        ) : <span className="text-faint">·</span>}
                      </TD>
                    ))}
                    <TD className="text-center"><span className="font-semibold tabular text-ink">{total}</span>{over > 0 && <p className="text-[10.5px] text-bad tabular">{over} overdue</p>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Workload by desk" description="Active cases per desk, overdue and the oldest case." />
          {p.workload.length === 0 ? <EmptyState icon={<Timer />} title="No cases in process" /> : (
            <ul className="divide-y divide-border">
              {p.workload.map((w) => (
                <li key={w.desk} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-ink">{w.desk}</span>
                  {w.overdue > 0 && <span className="text-xs text-bad tabular">{w.overdue} overdue</span>}
                  <span className="text-xs text-muted tabular">oldest {w.oldest} d</span>
                  <span className="w-8 text-right font-semibold tabular text-ink">{w.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Ageing in current stage" description="How long the applications now at each stage have been there." />
          <Table>
            <THead><tr><TH>Stage</TH>{p.ageing[0]?.buckets.map((b) => <TH key={b.key} className="text-center">{b.label}</TH>)}</tr></THead>
            <TBody>
              {p.ageing.map((a) => (
                <TR key={a.stage}>
                  <TD className="font-medium text-ink">{stageLabel(a.stage)}</TD>
                  {a.buckets.map((b, i) => <TD key={b.key} className={cn("text-center tabular", b.count > 0 && i >= 2 && "font-semibold text-bad", b.count > 0 && i === 1 && "text-warn")}>{b.count || "·"}</TD>)}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Bottlenecks" description="Average and longest days per stage visit, and how many completed within the timeline." />
          <Table>
            <THead><tr><TH>Stage</TH><TH className="text-right">Timeline</TH><TH className="text-right">Avg days</TH><TH className="text-right">Longest</TH><TH className="text-right">Within timeline</TH><TH className="text-right">Pending (overdue)</TH></tr></THead>
            <TBody>
              {p.bottlenecks.map((b) => (
                <TR key={b.stage}>
                  <TD className="font-medium text-ink">{stageLabel(b.stage)}</TD>
                  <TD className="text-right tabular">{b.slaDays} d</TD>
                  <TD className={cn("text-right tabular", b.avgDays !== null && b.avgDays > b.slaDays && "font-semibold text-bad")}>{b.avgDays ?? "—"}</TD>
                  <TD className="text-right tabular">{b.maxDays ?? "—"}</TD>
                  <TD className="text-right tabular">{b.withinTimeline === null ? "—" : `${b.withinTimeline}%`}</TD>
                  <TD className="text-right tabular">{b.pending}{b.pendingOverdue ? <span className="text-bad"> ({b.pendingOverdue})</span> : ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card className="mt-4">
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3">
          <p className="mr-2 text-sm font-semibold text-ink">Cases in process</p>
          {!scopedRegion && <Select name="region" defaultValue={sp.region ?? ""} className="w-48" aria-label="Region"><option value="">All Regions</option>{p.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}
          <Select name="stage" defaultValue={sp.stage ?? ""} className="w-48" aria-label="Stage"><option value="">All stages</option>{p.stages.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}</Select>
          <Select name="type" defaultValue={sp.type ?? ""} className="w-56" aria-label="Application type"><option value="">All application types</option>{APPLICATION_TYPES.map((t) => <option key={t} value={t}>{applicationTypeLabel(t)}</option>)}</Select>
          <Select name="state" defaultValue={sp.state ?? ""} className="w-40" aria-label="Timeline state"><option value="">Any timeline state</option>{Object.entries(DUE_STATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
          {filtered && <Link href="/pendency" className="text-xs text-accent hover:underline">Clear filters</Link>}
          <span className="ml-auto text-xs text-muted">{p.cases.length} case(s), most urgent first</span>
        </form>
        {p.cases.length === 0 ? <EmptyState icon={<AlarmClock />} title="No cases match these filters" /> : (
          <Table>
            <THead><tr><TH>Application</TH><TH>Region</TH><TH>Stage</TH><TH className="hidden lg:table-cell">Desk</TH><TH className="text-right">In stage</TH><TH className="text-right hidden md:table-cell">Total age</TH><TH>Due</TH><TH>Timeline</TH></tr></THead>
            <TBody>
              {p.cases.map((c) => (
                <TR key={c.instanceId}>
                  <TD><Link href={`/applications/${c.applicationId}?tab=workflow`} className="font-mono text-xs hover:underline">{c.reference}</Link><p className="text-[11px] text-muted">{c.institutionName} · {applicationTypeLabel(c.applicationType)}</p></TD>
                  <TD className="text-xs">{c.regionName}</TD>
                  <TD className="text-xs font-medium text-ink">{c.stageLabel}</TD>
                  <TD className="hidden lg:table-cell text-xs">{c.desk}</TD>
                  <TD className="text-right text-xs tabular">{c.daysInStage} d</TD>
                  <TD className="text-right text-xs tabular hidden md:table-cell">{c.totalAgeDays} d</TD>
                  <TD className="text-xs tabular">{formatDate(c.dueAt)}</TD>
                  <TD><div className="flex flex-wrap gap-1"><DueBadge state={c.state} daysLeft={c.daysLeft} /><EscalationBadge level={c.escalationLevel} /></div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
