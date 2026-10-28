import { assertPermission } from "@/lib/auth/permissions";
import { listAuditEvents, toCsv } from "@/server/audit-log";
import { recordAudit } from "@/server/audit";
import { contentDisposition, withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<unknown>(async (req, actor) => {
  assertPermission(actor, "audit.export");
  const sp = req.nextUrl.searchParams;
  const filters = { applicationId: sp.get("applicationId") ?? undefined, eventType: sp.get("eventType") ?? undefined, actor: sp.get("actor") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, take: 1000 };
  const { events } = await listAuditEvents(actor, filters);
  await recordAudit({ actor, eventType: "AUDIT_EXPORTED", action: `Exported ${events.length} audit event(s) as CSV`, after: filters });
  const csv = toCsv(events, ["id", "createdAt", "actorLabel", "actorRole", "applicationReference", "documentId", "eventType", "action", "reason", "beforeJson", "afterJson", "validationRunId", "ruleVersion", "verificationRef", "correlationId"]);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": contentDisposition("attachment", "pravah-audit.csv"), "cache-control": "private, no-store" } });
});
