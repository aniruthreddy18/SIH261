import Link from "next/link";
import { BarChart3, Download, FileText } from "lucide-react";
import { buildMonitoringReport, isReportKind, REPORT_KINDS, type ReportKind } from "@/server/monitoring-reports";
import { pageGuard } from "@/server/session";
import { PageHeader, EmptyState, Notice } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { actor, denied } = await pageGuard("reports.view");
  const crumbs = [{ label: "Command Centre", href: "/" }, { label: "Reports" }];
  if (denied) return (<><PageHeader title="Reports" crumbs={crumbs} /><AccessDenied /></>);
  const sp = await searchParams;
  const kind: ReportKind = sp.r && isReportKind(sp.r) ? sp.r : "pendency";
  const t = await buildMonitoringReport(actor, kind);
  return (
    <>
      <PageHeader
        title="Reports"
        crumbs={crumbs}
        description="Consolidated reports on application pendency, EVC status, undertaking compliance, document validity, overdue cases and Region-wise processing performance — computed live from stored records. Validation reports for single applications are on each application page; the audit trail is under Audit."
        actions={<>
          <Button asChild size="sm" variant="outline"><a href={`/api/exports/monitoring/${kind}`}><Download /> This report (CSV)</a></Button>
          <Button asChild size="sm"><a href="/api/reports/monitoring"><FileText /> Consolidated report (PDF)</a></Button>
        </>}
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(REPORT_KINDS) as ReportKind[]).map((k) => (
          <Link key={k} href={`/reports?r=${k}`} className={cn("rounded-full border px-3 py-1.5 text-[13px]", k === kind ? "border-accent-line bg-accent-soft font-medium text-accent" : "border-border bg-white/50 text-ink-2 hover:bg-subtle")}>{REPORT_KINDS[k]}</Link>
        ))}
      </div>
      {t.note && <div className="mb-3"><Notice>{t.note}</Notice></div>}
      <Card>
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold text-ink">{t.title}</p>
          <p className="text-xs text-muted">{t.rows.length} row(s){actor.role === "SCRUTINY_OFFICER" && actor.regionId ? " · your Region only" : ""}</p>
        </div>
        {t.rows.length === 0 ? <EmptyState icon={<BarChart3 />} title="No records" /> : (
          <Table>
            <THead><tr>{t.columns.map((c) => <TH key={c.key}>{c.label}</TH>)}</tr></THead>
            <TBody>
              {t.rows.map((r, i) => (
                <TR key={i}>{t.columns.map((c) => <TD key={c.key} className={cn("text-xs", typeof r[c.key] === "number" && "tabular", typeof r[c.key] === "number" && (r[c.key] as number) < 0 && "font-semibold text-bad")}>{String(r[c.key] ?? "")}</TD>)}</TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
