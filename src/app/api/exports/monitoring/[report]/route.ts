import { NotFoundError } from "@/lib/auth/permissions";
import { recordAudit } from "@/server/audit";
import { toCsv } from "@/server/audit-log";
import { buildMonitoringReport, isReportKind } from "@/server/monitoring-reports";
import { contentDisposition, withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<{ params: Promise<{ report: string }> }>(async (_req, actor, { params }) => {
  const { report } = await params;
  if (!isReportKind(report)) throw new NotFoundError();
  const t = await buildMonitoringReport(actor, report);
  await recordAudit({ actor, eventType: "REPORT_GENERATED", action: `Exported report: ${t.title} (${t.rows.length} row(s), CSV)` });
  const csv = toCsv(t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c.label, r[c.key] ?? ""]))), t.columns.map((c) => c.label));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": contentDisposition("attachment", `pravah-${report}-${new Date().toISOString().slice(0, 10)}.csv`), "cache-control": "private, no-store" } });
});
