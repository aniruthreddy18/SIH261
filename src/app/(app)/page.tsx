import Link from "next/link";
import { AlertOctagon, ClipboardCheck, FilePlus2, FileWarning, Inbox, ListChecks, Play, Upload, UserCheck } from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { APPLICATION_STATUS_LABELS, ROLE_LABELS, type ApplicationStatus } from "@/lib/domain";
import { findingTypeLabel, REVIEW_ACTION_LABELS } from "@/lib/findings";
import { getDashboard } from "@/server/dashboard";
import { requireActor } from "@/server/session";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/status";
import { ApplicationsTable } from "@/components/app/applications-table";
import { formatDateTime, relativeAge } from "@/lib/utils";

export const metadata = { title: "Command Centre" };

const STATUS_COLOR: Record<string, string> = { DRAFT: "bg-slate-300", PROCESSING: "bg-sky-400", AUTO_PASSED: "bg-green-600", AUTO_FAILED: "bg-red-600", REVIEW_REQUIRED: "bg-amber-500", PROCESSING_FAILED: "bg-red-900", RECTIFICATION_REQUIRED: "bg-orange-400", READY_FOR_AUTHORIZED_REVIEW: "bg-blue-700", CLOSED: "bg-slate-500" };

export default async function CommandCentre() {
  const actor = await requireActor();
  const d = await getDashboard(actor);
  const m = d.metrics;
  const tiles = [
    { label: "Total applications", value: m.total, href: "/applications", hint: `${m.validationCompletion}% have at least one completed validation run` },
    { label: "Awaiting validation", value: m.awaitingValidation, href: "/applications?status=DRAFT", hint: "Draft or processing failed" },
    { label: "Requiring rectification", value: m.rectification, href: "/applications?status=RECTIFICATION_REQUIRED", hint: "Returned to institution" },
    { label: "Awaiting human review", value: m.awaitingReview, href: "/applications?status=REVIEW_REQUIRED", hint: "Review required or automated checks failed" },
    { label: "Issuer verification pending", value: m.verificationPending, href: "/verification", hint: "Verifiable documents without a verified result" },
    { label: "Ready for authorised review", value: m.readyForReview, href: "/applications?status=READY_FOR_AUTHORIZED_REVIEW", hint: "Forwarded to competent authority" },
  ];
  const total = d.statusBreakdown.reduce((n, s) => n + s.count, 0) || 1;
  return (
    <>
      <PageHeader
        title="Command Centre"
        description={actor.role === "APPLICANT" ? "Status of your institution's applications and outstanding deficiencies." : `Operational overview for ${ROLE_LABELS[actor.role].toLowerCase()}s. All figures are computed from stored records.`}
        actions={
          <>
            {hasPermission(actor.role, "application.create") && <Button asChild size="sm"><Link href="/applications/new"><FilePlus2 /> Create application</Link></Button>}
            {hasPermission(actor.role, "document.upload") && <Button asChild size="sm" variant="outline"><Link href="/applications"><Upload /> Upload documents</Link></Button>}
            {hasPermission(actor.role, "finding.review") && <Button asChild size="sm" variant="outline"><Link href="/review"><Inbox /> Open review queue</Link></Button>}
            {hasPermission(actor.role, "rules.manage") && <Button asChild size="sm" variant="outline"><Link href="/rules"><ListChecks /> Manage validation rules</Link></Button>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
            <p className="text-[11.5px] font-medium text-muted">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular">{t.value}</p>
            <p className="mt-1 text-[10.5px] leading-tight text-faint">{t.hint}</p>
          </Link>
        ))}
      </div>

      <Card className="mt-4">
        <CardBody className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-2">Status distribution</p>
            <p className="text-[11px] text-muted">{m.openFindings} open finding(s): {d.findingsBySource.map((s) => `${s.count} ${s.source.toLowerCase()}`).join(" · ")}</p>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-border" role="img" aria-label="Applications by status">
            {d.statusBreakdown.map((s) => <span key={s.status} className={STATUS_COLOR[s.status]} style={{ width: `${(s.count / total) * 100}%` }} title={`${APPLICATION_STATUS_LABELS[s.status]}: ${s.count}`} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {d.statusBreakdown.map((s) => (
              <Link key={s.status} href={`/applications?status=${s.status}`} className="flex items-center gap-1.5 text-[11px] text-muted hover:text-ink">
                <span className={`size-2 rounded-sm ${STATUS_COLOR[s.status]}`} /> {APPLICATION_STATUS_LABELS[s.status as ApplicationStatus]} <span className="tabular font-medium text-ink-2">{s.count}</span>
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Attention required" description="Highest-severity unresolved items, oldest first within each severity." actions={hasPermission(actor.role, "finding.review") ? <Link href="/review" className="text-xs font-medium text-accent hover:underline">View queue</Link> : undefined} />
          {d.attention.length === 0 ? (
            <EmptyState icon={<ClipboardCheck />} title="Nothing needs attention" description="There are no unresolved findings." />
          ) : (
            <ul className="divide-y divide-border">
              {d.attention.map((f) => (
                <li key={f.id}>
                  <Link href={hasPermission(actor.role, "finding.review") ? `/review/${f.id}` : `/applications/${f.application.id}?tab=findings`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-subtle/60">
                    {f.outcomeClass === "FAIL" ? <AlertOctagon className="mt-0.5 size-4 shrink-0 text-bad" /> : <FileWarning className="mt-0.5 size-4 shrink-0 text-warn" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{f.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="font-mono">{f.application.reference}</span> · {f.application.institutionName} · {findingTypeLabel(f.type)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <SeverityBadge severity={f.severity} />
                      <span className="text-[10.5px] text-faint">{relativeAge(f.createdAt)} open</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Validation activity" description="Recent runs and human review actions." />
          <ul className="divide-y divide-border">
            {d.recentRuns.map((r) => (
              <li key={r.id} className="flex gap-2.5 px-4 py-2.5">
                <Play className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <div className="min-w-0 text-xs">
                  <Link href={`/applications/${r.application.id}?tab=validation`} className="font-medium text-ink hover:underline">Run #{r.runNumber} · {r.application.reference}</Link>
                  <p className="text-muted">{r.status === "COMPLETED" ? `Outcome ${r.machineOutcome?.replace(/_/g, " ").toLowerCase()}` : r.status.toLowerCase()} · {formatDateTime(r.startedAt)}</p>
                </div>
              </li>
            ))}
            {d.recentReviews.map((r) => (
              <li key={r.id} className="flex gap-2.5 px-4 py-2.5">
                <UserCheck className="mt-0.5 size-3.5 shrink-0 text-ok" />
                <div className="min-w-0 text-xs">
                  <Link href={`/applications/${r.application.id}?tab=review`} className="font-medium text-ink hover:underline">{REVIEW_ACTION_LABELS[r.action] ?? r.action} · {r.application.reference}</Link>
                  <p className="truncate text-muted">{r.actorName} · {formatDateTime(r.createdAt)}</p>
                </div>
              </li>
            ))}
            {d.recentRuns.length + d.recentReviews.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">No activity yet.</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent applications" actions={<Link href="/applications" className="text-xs font-medium text-accent hover:underline">All applications</Link>} />
        {d.recentApplications.length ? <ApplicationsTable rows={d.recentApplications} /> : <EmptyState title="No applications yet" />}
      </Card>
    </>
  );
}
