import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/auth/permissions";
import { REVIEW_ACTION_LABELS } from "@/lib/findings";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import { getFindingDetail } from "@/server/findings";
import { pageGuard } from "@/server/session";
import { PageHeader } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplicationStatusBadge } from "@/components/status";
import { FindingCard } from "@/components/app/finding-card";
import { VerificationCard } from "@/components/app/verification-card";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Review finding" };

export default async function ReviewFindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, denied } = await pageGuard("finding.review");
  if (denied) return (<><PageHeader title="Review finding" crumbs={[{ label: "Review Queue", href: "/review" }]} /><AccessDenied /></>);
  const { id } = await params;
  let f;
  try {
    f = await getFindingDetail(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader
        title="Review finding"
        crumbs={[{ label: "Review Queue", href: "/review" }, { label: f.application.reference, href: `/applications/${f.application.id}?tab=findings` }, { label: "Finding" }]}
        meta={<><Link href={`/applications/${f.application.id}`} className="text-[13px] font-medium text-accent hover:underline">{f.application.institutionName}</Link><ApplicationStatusBadge status={f.application.status} /></>}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <FindingCard f={f} actor={actor} showLink={false} />
          {f.verification && (
            <Card>
              <CardHeader title="Issuer verification evidence" />
              <CardBody><VerificationCard v={f.verification} /></CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {f.document && (
            <Card>
              <CardHeader title="Document" />
              <CardBody className="text-[13px]">
                <p className="text-ink">{f.document.category.name}</p>
                {f.document.versions[0] && <Link href={`/documents/${f.document.id}`} className="text-accent hover:underline">{f.document.versions[0].originalName} (v{f.document.versions[0].versionNo})</Link>}
                <p className="mt-1 text-xs text-muted">Open the document to compare extracted values with the highlighted source region.</p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Review history" description="Reason required for every action." />
            <ul className="divide-y divide-border">
              {f.reviewActions.length === 0 && <li className="px-4 py-3 text-xs text-muted">No actions recorded yet.</li>}
              {f.reviewActions.map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5"><Badge tone={r.action === "NOTE" ? "neutral" : "outline"}>{REVIEW_ACTION_LABELS[r.action] ?? r.action}</Badge>{r.outcome && <span className="text-muted">{r.outcome.replace(/_/g, " ").toLowerCase()}</span>}</div>
                  <p className="mt-1 text-ink-2">{r.reason}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{r.actorName} · {ROLE_LABELS[r.actorRole as Role]} · {formatDateTime(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
