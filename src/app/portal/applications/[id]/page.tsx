import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardCheck, Download, Play } from "lucide-react";
import { APPLICANT_EDITABLE_STATUSES, NotFoundError } from "@/lib/auth/permissions";
import { ACTIVE_FINDING_STATUSES, type ApplicationStatus, type FindingStatus } from "@/lib/domain";
import { APPLICANT_GUIDANCE } from "@/lib/applicant-guidance";
import { DECISION_OUTCOMES, REVIEW_ACTION_LABELS, type DecisionOutcome } from "@/lib/findings";
import { getApplicationDetail } from "@/server/applications";
import { verificationCoverage } from "@/server/verification";
import { getRunComparison } from "@/server/validation";
import { getSettings } from "@/server/settings";
import { prisma, json } from "@/server/db";
import { requireActor } from "@/server/session";
import { runValidationAction } from "@/app/actions/workflow";
import { PageHeader, Notice, EmptyState } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-dialog";
import { ApplicationStatusBadge, RuleStatusBadge, SourceTypeBadge, VerificationStatusBadge } from "@/components/status";
import { FindingCard } from "@/components/app/finding-card";
import { StepTracker } from "@/components/portal/application-card";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { PortalDocuments } from "./portal-documents";
import { PortalRectification } from "./portal-rectification";

export const metadata = { title: "Application" };

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "results", label: "Check results" },
  { key: "history", label: "History" },
] as const;

export default async function PortalApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const { view = "overview" } = await searchParams;
  let detail;
  try {
    detail = await getApplicationDetail(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [coverage, settings, categories] = await Promise.all([verificationCoverage(id), getSettings(), prisma.documentCategory.findMany({ orderBy: { sortOrder: "asc" } })]);
  const cats = categories.map((c) => ({ code: c.code, name: c.name }));
  const { app, runs, findings, documents, statusChanges, reviewActions, rectifications } = detail;
  const status = app.status as ApplicationStatus;
  const g = APPLICANT_GUIDANCE[status];
  const open = findings.filter((f) => ACTIVE_FINDING_STATUSES.includes(f.status as FindingStatus));
  const lastRun = runs.find((r) => r.status === "COMPLETED");
  const active = documents.filter((d) => d.state === "ACTIVE");
  const changedSinceRun = lastRun ? active.some((d) => d.versions.find((v) => v.isCurrent)!.uploadedAt > lastRun.startedAt) : false;
  const canRunChecks = APPLICANT_EDITABLE_STATUSES.includes(status) && status !== "RECTIFICATION_REQUIRED";
  const decision = reviewActions.find((r) => r.action === "DECISION");
  const missing = detail.checklist.filter((c) => c.mandatory && !active.some((d) => d.categoryCode === c.categoryCode));

  return (
    <>
      <PageHeader
        title={app.institutionName}
        crumbs={[{ label: "Home", href: "/portal" }, { label: "My applications", href: "/portal/applications" }, { label: app.reference }]}
        meta={
          <>
            <span className="font-mono text-xs text-ink-2">{app.reference}</span>
            <span className="text-xs text-muted">{app.template.name} · AY {app.academicYear}</span>
            <span data-testid="app-status"><ApplicationStatusBadge status={status} /></span>
          </>
        }
        actions={
          <>
            {canRunChecks && <ActionButton label="Run checks" pendingLabel="Checking…" icon={<Play />} action={runValidationAction.bind(null, app.id)} />}
            <Button asChild variant="outline" size="sm"><a href={`/api/applications/${app.id}/report`}><Download /> Validation report</a></Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardBody className="space-y-4">
          <StepTracker status={status} />
          <Notice tone={g.tone} title={g.title}>{g.text}</Notice>
          {missing.length > 0 && status !== "CLOSED" && <p className="text-xs text-bad">Missing mandatory documents: {missing.map((m) => m.label).join(", ")}. <Link href="?view=documents" className="underline">Upload them</Link>.</p>}
          {changedSinceRun && status !== "CLOSED" && (
            <p className="text-xs text-warn">
              You changed documents after the last check (check #{lastRun!.runNumber}). {status === "RECTIFICATION_REQUIRED" ? "Submit your corrections to run the checks again." : canRunChecks ? "Press “Run checks” to check them again." : ""}
            </p>
          )}
        </CardBody>
      </Card>

      <nav className="glass-card mb-4 flex gap-1 overflow-x-auto rounded-xl border px-2" aria-label="Application sections">
        {VIEWS.map((v) => (
          <Link key={v.key} href={`?view=${v.key}`} scroll={false} aria-current={view === v.key ? "page" : undefined} className={cn("my-1.5 flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium transition-colors", view === v.key ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--color-accent-line)]" : "text-ink-2 hover:bg-subtle hover:text-ink")}>
            {v.label}
            {v.key === "overview" && open.length > 0 && <span className="ml-1.5 rounded bg-warn-soft px-1.5 text-[11px] text-warn tabular">{open.length}</span>}
          </Link>
        ))}
      </nav>

      {view === "overview" && (
        <div className="space-y-4">
          {decision && (
            <Card className="border-accent-line">
              <CardHeader title="Recorded review outcome" description={`${decision.actorName} · ${formatDateTime(decision.createdAt)} · Ref ${decision.reference}`} />
              <CardBody className="space-y-1 text-[13px]">
                <p className="font-semibold text-ink">{DECISION_OUTCOMES[decision.outcome as DecisionOutcome] ?? decision.outcome}</p>
                <p className="text-ink-2">{decision.reason}</p>
                <p className="text-[11px] text-muted">Recorded human review action in Aegis — not an automatically generated regulatory approval.</p>
              </CardBody>
            </Card>
          )}
          <PortalRectification detail={detail} categories={cats} maxMb={settings.maxUploadMb} />
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Issues to fix {open.length > 0 && <span className="font-normal text-muted">({open.length})</span>}</h2>
            {open.length === 0 ? (
              <Card><EmptyState icon={<ClipboardCheck />} title={lastRun ? "No open issues" : "No checks run yet"} description={lastRun ? "Nothing is outstanding from the automatic checks." : "Upload your documents and press “Run checks”."} /></Card>
            ) : (
              <div className="space-y-3">{open.map((f) => <FindingCard key={f.id} f={f} actor={actor} showLink={false} />)}</div>
            )}
          </div>
          <Card>
            <CardHeader title="Verification with issuing authorities" description="Officials check certificates with the bodies that issued them. In this demo the sources are simulated." />
            <ul className="divide-y divide-border">
              {coverage.length === 0 && <li className="px-4 py-3 text-xs text-muted">No documents that need issuer verification yet.</li>}
              {coverage.map((c) => (
                <li key={c.documentId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                  <span className="text-ink-2">{c.categoryName}</span>
                  <span className="flex items-center gap-2">
                    {c.latestSourceType && <SourceTypeBadge type={c.latestSourceType} />}
                    {c.latestStatus ? <VerificationStatusBadge status={c.latestStatus} /> : <span className="text-xs text-faint">Not yet verified</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {view === "documents" && <PortalDocuments detail={detail} categories={cats} maxMb={settings.maxUploadMb} />}

      {view === "results" && <PortalResults applicationId={app.id} lastRunId={lastRun?.id ?? null} />}

      {view === "history" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Status timeline" />
            <ol className="px-4 py-3">
              {statusChanges.map((s) => (
                <li key={s.id} className="relative border-l border-border pb-4 pl-4 last:pb-0">
                  <span className="absolute -left-[5px] top-1 size-2.5 rounded-full border-2 border-surface bg-accent" />
                  <ApplicationStatusBadge status={s.toStatus} />
                  <p className="mt-1 text-[11px] text-muted">{formatDateTime(s.createdAt)}</p>
                  {s.reason && <p className="mt-0.5 text-xs text-ink-2">{s.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Correction requests" />
              {rectifications.length === 0 ? <CardBody><p className="text-xs text-muted">None.</p></CardBody> : (
                <ul className="divide-y divide-border">
                  {rectifications.map((r) => (
                    <li key={r.id} className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-2"><Badge tone={r.status === "OPEN" ? "warn" : "neutral"}>{r.status.toLowerCase()}</Badge><span className="text-muted">{formatDate(r.createdAt)}{r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}</span></div>
                      <p className="mt-1 text-ink-2">{r.message}</p>
                      {r.responseNote && <p className="mt-1 text-muted">Your response: {r.responseNote}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Actions by AICTE" description="Internal notes of officials are not shown." />
              {reviewActions.length === 0 ? <CardBody><p className="text-xs text-muted">None yet.</p></CardBody> : (
                <ul className="divide-y divide-border">
                  {reviewActions.map((r) => (
                    <li key={r.id} className="px-4 py-2.5 text-xs">
                      <p className="font-medium text-ink">{REVIEW_ACTION_LABELS[r.action] ?? r.action}</p>
                      <p className="text-ink-2">{r.reason}</p>
                      <p className="text-[11px] text-faint">{r.actorName} · {formatDateTime(r.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

async function PortalResults({ applicationId, lastRunId }: { applicationId: string; lastRunId: string | null }) {
  if (!lastRunId) return <Card><EmptyState icon={<ClipboardCheck />} title="No checks run yet" description="Upload your documents and press “Run checks”." /></Card>;
  const cmp = await getRunComparison(applicationId, lastRunId);
  if (!cmp) return null;
  const results = cmp.run.results;
  const notPassed = results.filter((r) => r.status !== "PASS" && r.status !== "NOT_APPLICABLE");
  const passed = results.filter((r) => r.status === "PASS");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`Check #${cmp.run.runNumber}`} description={`Completed ${formatDateTime(cmp.run.completedAt)}`} />
        <CardBody className="flex flex-wrap gap-2 text-xs">
          <Badge tone="ok">{passed.length} passed</Badge>
          <Badge tone="bad">{notPassed.filter((r) => r.status === "FAIL").length} failed</Badge>
          <Badge tone="warn">{notPassed.filter((r) => r.status !== "FAIL").length} being reviewed by AICTE</Badge>
        </CardBody>
      </Card>
      {cmp.previous && cmp.changes.length > 0 && (
        <Card>
          <CardHeader title={`What changed since run #${cmp.previous.runNumber}`} />
          <ul className="divide-y divide-border">
            {cmp.changes.map((c) => (
              <li key={c.subjectKey} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
                <Badge tone={c.kind === "IMPROVED" ? "ok" : c.kind === "REGRESSED" || c.kind === "NEW" ? "bad" : "neutral"}>{c.kind.toLowerCase()}</Badge>
                <span className="text-ink">{c.ruleName}: {c.subjectLabel}</span>
                <span className="ml-auto flex items-center gap-1.5">{c.before && <RuleStatusBadge status={c.before} />}<ArrowRight className="size-3 text-faint" />{c.after ? <RuleStatusBadge status={c.after} /> : <span className="text-xs text-faint">removed</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Checks that did not pass" />
        {notPassed.length === 0 ? <CardBody><p className="text-xs text-muted">Every applicable check passed.</p></CardBody> : (
          <ul className="divide-y divide-border">
            {notPassed.map((r) => (
              <li key={r.id} className="space-y-1 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2"><RuleStatusBadge status={r.status} /><span className="font-medium text-ink">{r.ruleName}</span><span className="text-xs text-muted">— {r.subjectLabel}</span></div>
                <p className="text-ink-2">{r.explanation}</p>
                {r.nextAction && <p className="text-xs"><span className="font-semibold">What to do: </span>{r.nextAction}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <details>
          <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-ink">Checks that passed ({passed.length})</summary>
          <ul className="divide-y divide-border border-t border-border">
            {passed.map((r) => <li key={r.id} className="px-4 py-2 text-xs text-ink-2"><span className="font-medium text-ink">{r.ruleName}</span> — {r.explanation}</li>)}
          </ul>
        </details>
      </Card>
      <p className="text-[11px] text-muted">Rules used: {json<{ code: string; version: number }[]>(cmp.run.ruleVersionsJson, []).map((r) => `${r.code} v${r.version}`).join(", ")}.</p>
    </div>
  );
}
