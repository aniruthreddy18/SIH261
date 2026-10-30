import { ROLE_LABELS } from "@/lib/domain";
import { renderMonitoringPdf } from "@/lib/report/monitoring-pdf";
import { recordAudit } from "@/server/audit";
import { prisma } from "@/server/db";
import { buildMonitoringReport, REPORT_KINDS, type ReportKind } from "@/server/monitoring-reports";
import { getPendency } from "@/server/pendency";
import { contentDisposition, withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<unknown>(async (_req, actor) => {
  const now = new Date();
  const kinds = Object.keys(REPORT_KINDS) as ReportKind[];
  const tables = [];
  for (const k of kinds) tables.push(await buildMonitoringReport(actor, k, now));
  const p = await getPendency(actor, {}, now);
  const region = actor.regionId ? await prisma.region.findUnique({ where: { id: actor.regionId } }) : null;
  const pdf = await renderMonitoringPdf({
    generatedAt: now,
    generatedBy: `${actor.name} (${ROLE_LABELS[actor.role]})`,
    scope: region ? `${region.name} only` : "All Regions",
    summary: [
      { label: "In process", value: p.totals.inProcess },
      { label: "Overdue at stage", value: p.totals.overdue },
      { label: "Due within reminder window", value: p.totals.dueSoon },
      { label: "Escalated (level 2+)", value: p.totals.escalated },
      { label: "With institution (rectification)", value: p.totals.withInstitution },
      { label: "Avg days in current stage", value: p.totals.avgDaysInStage },
    ],
    tables,
  });
  await recordAudit({ actor, eventType: "REPORT_GENERATED", action: "Generated the consolidated monitoring report (PDF)" });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": contentDisposition("attachment", `pravah-monitoring-${now.toISOString().slice(0, 10)}.pdf`), "cache-control": "private, no-store" } });
});
