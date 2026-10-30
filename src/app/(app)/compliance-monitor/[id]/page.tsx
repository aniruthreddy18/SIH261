import { CheckCircle2, Ban, Undo2 } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { reviewSubmissionAction, waiveItemAction } from "@/app/actions/monitoring";
import { getComplianceItem } from "@/server/compliance-monitor";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { pageGuard } from "@/server/session";
import { PageHeader, Notice } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { ActionDialog } from "@/components/action-dialog";
import { Card, CardHeader } from "@/components/ui/card";
import { ComplianceFacts, SubmissionList } from "@/components/workflow/compliance-detail";
import { ALERT_KIND_LABELS } from "@/lib/workflow/stages";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Compliance item" };

export default async function ComplianceItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, denied } = await pageGuard(["compliance.verify", "compliance.manage"]);
  const crumbs = [{ label: "Compliance Monitor", href: "/compliance-monitor" }, { label: "Item" }];
  if (denied) return (<><PageHeader title="Compliance item" crumbs={crumbs} /><AccessDenied /></>);
  const { id } = await params;
  const [item, settings, alerts] = await Promise.all([getComplianceItem(actor, id), getSettings(), prisma.alert.findMany({ where: { subjectId: id }, orderBy: { createdAt: "desc" }, take: 20 })]);
  const canVerify = hasPermission(actor.role, "compliance.verify");
  const canManage = hasPermission(actor.role, "compliance.manage");
  const warnDays = item.kind === "DOCUMENT_VALIDITY" ? settings.documentExpiryFirstAlertDays : settings.undertakingReminderDays;
  const closed = item.status === "FULFILLED" || item.status === "WAIVED";
  return (
    <>
      <PageHeader
        title={item.title}
        crumbs={[{ label: "Compliance Monitor", href: `/compliance-monitor?kind=${item.kind}` }, { label: item.institution.name }]}
        description="Verification is a human action: accept only evidence you have checked. Every decision is recorded with your remarks."
        actions={canManage && !closed ? (
          <ActionDialog label="Waive" icon={<Ban />} variant="outline" title="Waive this item" description="Use only where the competent authority has relaxed the condition. The reason is recorded in the audit trail." fields={[{ name: "reason", label: "Reason and authority reference", type: "textarea", minLength: 10 }]} action={waiveItemAction.bind(null, item.id)} />
        ) : undefined}
      />
      {item.status === "SUBMITTED" && <div className="mb-4"><Notice tone="warn" title="Evidence awaiting your verification">Open the file, check it against the condition, then verify or return it with remarks.</Notice></div>}
      <ComplianceFacts item={item} warnDays={warnDays} applicationHref={item.application ? `/applications/${item.application.id}?tab=workflow` : undefined} />
      <SubmissionList
        item={item}
        renderActions={(s) => (s.review === "PENDING" && canVerify ? (
          <>
            <ActionDialog label="Verify" icon={<CheckCircle2 />} size="xs" variant="default" title="Verify submission" description={item.kind === "DOCUMENT_VALIDITY" ? "The register will show the renewed validity date and the reminders restart from it." : "The undertaking will be recorded as fulfilled."} fields={[{ name: "remarks", label: "Verification remarks", type: "textarea", placeholder: "What you checked and how" }]} action={reviewSubmissionAction.bind(null, s.id, true)} />
            <ActionDialog label="Return" icon={<Undo2 />} size="xs" variant="outline" title="Return to the institution" description="The institution is notified with your remarks and can resubmit." fields={[{ name: "remarks", label: "What is missing or wrong", type: "textarea" }]} action={reviewSubmissionAction.bind(null, s.id, false)} />
          </>
        ) : null)}
      />
      <Card className="mt-4">
        <CardHeader title="Alerts raised" description="Reminders, overdue alerts and escalations for this item (in-app notifications)." />
        {alerts.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted">No alerts yet.</p> : (
          <ul className="divide-y divide-border text-[13px]">
            {alerts.map((a) => <li key={a.id} className="px-4 py-2"><span className="font-medium text-ink">{ALERT_KIND_LABELS[a.kind]}{a.kind === "ESCALATION" ? ` L${a.level}` : ""}</span> · {a.title}<span className="block text-[11px] text-muted">{formatDateTime(a.createdAt)} · {a.recipients} recipient(s){a.resolvedAt ? ` · resolved ${formatDateTime(a.resolvedAt)}` : ""}</span></li>)}
          </ul>
        )}
      </Card>
    </>
  );
}
