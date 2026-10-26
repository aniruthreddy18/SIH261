import { listApplications } from "@/server/applications";
import { toCsv } from "@/server/audit-log";
import { contentDisposition, withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<unknown>(async (req, actor) => {
  const sp = req.nextUrl.searchParams;
  const rows = await listApplications(actor, { status: sp.get("status") ?? undefined, q: sp.get("q") ?? undefined });
  const csv = toCsv(
    rows.map((r) => ({ reference: r.reference, institution: r.institutionName, institutionCode: r.institutionCode, template: r.templateName, academicYear: r.academicYear, status: r.status, submittedAt: r.submittedAt, openFindings: r.openFindings, lastRun: r.lastRun?.runNumber ?? "", checksPassed: r.lastRun ? `${r.lastRun.passed}/${r.lastRun.total}` : "" })),
    ["reference", "institution", "institutionCode", "template", "academicYear", "status", "submittedAt", "openFindings", "lastRun", "checksPassed"],
  );
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": contentDisposition("attachment", "aegis-applications.csv"), "cache-control": "private, no-store" } });
});
