import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/auth/permissions";
import { getComplianceItem } from "@/server/compliance-monitor";
import { getSettings } from "@/server/settings";
import { requireActor } from "@/server/session";
import { PageHeader, Notice } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ComplianceFacts, SubmissionList } from "@/components/workflow/compliance-detail";
import { EvidenceForm } from "@/components/portal/evidence-form";

export const metadata = { title: "Compliance item" };

export default async function PortalComplianceItemPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let item;
  try {
    item = await getComplianceItem(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const settings = await getSettings();
  const isDoc = item.kind === "DOCUMENT_VALIDITY";
  const returned = item.status === "OPEN" ? item.submissions.find((s) => s.review === "RETURNED") : undefined;
  return (
    <>
      <PageHeader title={item.title} crumbs={[{ label: "Home", href: "/portal" }, { label: "Compliance", href: "/portal/compliance" }, { label: item.title }]} />
      <ComplianceFacts item={item} warnDays={isDoc ? settings.documentExpiryFirstAlertDays : settings.undertakingReminderDays} applicationHref={item.application ? `/portal/applications/${item.application.id}` : undefined} />
      {item.status === "OPEN" && (
        <Card className="mt-4">
          <CardHeader title={isDoc ? "Submit the renewed document" : "Submit evidence of compliance"} description="Your file is stored with its SHA-256 hash. Submitting does not close the item — an official verifies it first." />
          <CardBody className="space-y-3">
            {returned && <Notice tone="warn" title="Your previous submission was returned">{returned.reviewRemarks}</Notice>}
            <EvidenceForm itemId={item.id} isDocument={isDoc} maxMb={settings.maxUploadMb} />
          </CardBody>
        </Card>
      )}
      {item.status === "SUBMITTED" && <div className="mt-4"><Notice title="Awaiting verification">Your submission is with the official for verification. You will be notified of the result.</Notice></div>}
      <SubmissionList item={item} />
    </>
  );
}
