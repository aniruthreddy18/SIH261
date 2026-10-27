import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Download, Forward, Gavel, Play, RadioTower } from "lucide-react";
import { hasPermission, NotFoundError } from "@/lib/auth/permissions";
import { APPLICATION_STATUS_DESCRIPTIONS, DECISION_SUPPORT_DISCLAIMER, type ApplicationStatus } from "@/lib/domain";
import { DECISION_OUTCOMES } from "@/lib/findings";
import { getApplicationDetail } from "@/server/applications";
import { verificationCoverage } from "@/server/verification";
import { getSettings } from "@/server/settings";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/session";
import { runValidationAction, runVerificationAction, forwardAction, decisionAction } from "@/app/actions/workflow";
import { PageHeader, Notice } from "@/components/page-header";
import { ApplicationStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { ActionButton, ActionDialog } from "@/components/action-dialog";
import { cn, formatDate } from "@/lib/utils";
import { OverviewTab } from "./overview-tab";
import { DocumentsTab } from "./documents-tab";
import { ValidationTab } from "./validation-tab";
import { FindingsTab } from "./findings-tab";
import { VerificationTab } from "./verification-tab";
import { ComplianceTab } from "./compliance-tab";
import { RectificationTab } from "./rectification-tab";
import { ReviewTab } from "./review-tab";
import { HistoryTab } from "./history-tab";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await prisma.application.findUnique({ where: { id }, select: { reference: true } });
  return { title: app?.reference ?? "Application" };
}

const ACTIVE = ["OPEN", "INFO_REQUESTED", "ESCALATED", "RECTIFICATION_REQUESTED"];

export default async function ApplicationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; run?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const { tab = "overview", run } = await searchParams;
  let detail;
  try {
    detail = await getApplicationDetail(actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [coverage, settings, categories] = await Promise.all([verificationCoverage(id), getSettings(), prisma.documentCategory.findMany({ orderBy: { sortOrder: "asc" } })]);
  const { app, checklist, documents, runs, findings } = detail;
  const status = app.status as ApplicationStatus;
  const openFindings = findings.filter((f) => ACTIVE.includes(f.status));
  const activeDocs = documents.filter((d) => d.state === "ACTIVE");
  const lastRun = runs.find((r) => r.status === "COMPLETED");
  const changedSinceRun = lastRun ? activeDocs.some((d) => d.versions.find((v) => v.isCurrent)!.uploadedAt > lastRun.startedAt) : false;
  const mandatory = checklist.filter((c) => c.mandatory);
  const mandatoryPresent = mandatory.filter((c) => activeDocs.some((d) => d.categoryCode === c.categoryCode)).length;
  const verified = coverage.filter((c) => c.covered).length;
  const isApplicant = actor.role === "APPLICANT";

  const canValidate = hasPermission(actor.role, "validation.run") && !["PROCESSING", "READY_FOR_AUTHORIZED_REVIEW", "CLOSED"].includes(status) && !(isApplicant && status === "RECTIFICATION_REQUIRED");
  const canVerify = hasPermission(actor.role, "verification.run") && !["PROCESSING", "CLOSED"].includes(status);
  const canForward = hasPermission(actor.role, "application.forward") && ["AUTO_PASSED", "REVIEW_REQUIRED"].includes(status);
  const canDecide = hasPermission(actor.role, "application.decide") && status === "READY_FOR_AUTHORIZED_REVIEW";

  const steps = [
    { label: "Application", done: true, detail: `Created ${formatDate(app.createdAt)}` },
    { label: "Documents", done: mandatoryPresent === mandatory.length, detail: `${mandatoryPresent}/${mandatory.length} mandatory present` },
    { label: "Validation", done: !!lastRun && lastRun.machineOutcome === "AUTO_PASSED" && !changedSinceRun, detail: lastRun ? `Run #${lastRun.runNumber}: ${lastRun.machineOutcome?.replace(/_/g, " ").toLowerCase()}` : "Not run" },
    { label: "Verification", done: coverage.length > 0 && verified === coverage.length, detail: coverage.length ? `${verified}/${coverage.length} verified` : "None required" },
    { label: "Review", done: status === "READY_FOR_AUTHORIZED_REVIEW" || status === "CLOSED", detail: status === "CLOSED" ? "Outcome recorded" : status === "READY_FOR_AUTHORIZED_REVIEW" ? "With authorised reviewer" : `${openFindings.length} open finding(s)` },
  ];

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "documents", label: "Documents", count: activeDocs.length },
    { key: "validation", label: "Validation", count: runs.length },
    { key: "findings", label: "Findings", count: openFindings.length, warn: openFindings.length > 0 },
    { key: "verification", label: "Issuer verification", count: coverage.length ? `${verified}/${coverage.length}` : undefined },
    { key: "compliance", label: "Compliance" },
    { key: "rectification", label: "Rectification", count: detail.rectifications.length || undefined, warn: status === "RECTIFICATION_REQUIRED" },
    { key: "review", label: "Review & decisions" },
    { key: "history", label: "History" },
  ];

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{app.institutionName}</span>}
        crumbs={[{ label: "Applications", href: "/applications" }, { label: app.reference }]}
        meta={
          <>
            <span className="font-mono text-xs text-ink-2">{app.reference}</span>
            <span className="text-faint">·</span>
            <span className="text-xs text-muted">{app.template.name} · AY {app.academicYear}</span>
            <span data-testid="app-status"><ApplicationStatusBadge status={status} /></span>
          </>
        }
        actions={
          <>
            {canValidate && <ActionButton label="Run validation" pendingLabel="Validating…" icon={<Play />} action={runValidationAction.bind(null, app.id)} />}
            {canVerify && <ActionButton label="Run issuer verification" pendingLabel="Verifying…" icon={<RadioTower />} variant="outline" action={runVerificationAction.bind(null, app.id, undefined)} />}
            {canForward && (
              <ActionDialog
                label="Forward for authorised review"
                icon={<Forward />}
                title="Forward for authorised review"
                description="Requires: no open findings, issuer verification complete for every verifiable document, and no evidence changed since the last validation run. The server re-checks all of these."
                fields={[{ name: "reason", label: "Scrutiny note / reason", type: "textarea", minLength: 10 }]}
                action={forwardAction.bind(null, app.id)}
              />
            )}
            {canDecide && (
              <ActionDialog
                label="Record review outcome"
                icon={<Gavel />}
                variant="default"
                title="Record human review outcome"
                description="This records your decision as a human review action in Aegis. It is not an automatically generated regulatory approval."
                notice={<Notice tone="warn">{DECISION_SUPPORT_DISCLAIMER}</Notice>}
                fields={[
                  { name: "outcome", label: "Outcome", type: "select", options: Object.entries(DECISION_OUTCOMES).map(([value, label]) => ({ value, label })) },
                  { name: "reason", label: "Reasons", type: "textarea", minLength: 10 },
                  { name: "reference", label: "Decision reference (file / minute no.)", minLength: 3 },
                ]}
                submitLabel="Record outcome"
                action={decisionAction.bind(null, app.id)}
              />
            )}
            <Button asChild variant="outline" size="sm"><a href={`/api/applications/${app.id}/report`}><Download /> Validation report</a></Button>
          </>
        }
      />

      <ol className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Workflow progress">
        {steps.map((s, i) => (
          <li key={s.label} className={cn("flex items-start gap-2.5 rounded-lg border bg-surface px-3 py-2.5", s.done ? "border-ok-line" : "border-border")}>
            <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", s.done ? "bg-ok text-white" : "border border-border-strong text-muted")}>{s.done ? <Check className="size-3" /> : i + 1}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{s.label}</p>
              <p className="truncate text-[11px] text-muted">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mb-4 space-y-2">
        <Notice tone={status === "AUTO_PASSED" || status === "READY_FOR_AUTHORIZED_REVIEW" ? "ok" : status === "AUTO_FAILED" || status === "PROCESSING_FAILED" ? "bad" : status === "DRAFT" || status === "CLOSED" ? "info" : "warn"}>
          <span className="font-medium">{APPLICATION_STATUS_DESCRIPTIONS[status]}</span>
          {status === "AUTO_PASSED" && " Automated results support — but do not replace — authorised review."}
        </Notice>
        {changedSinceRun && status !== "CLOSED" && <Notice tone="warn" title="Evidence changed since the last validation run">Run #{lastRun!.runNumber} did not evaluate the latest document versions. {canValidate ? "Run validation to update the results." : isApplicant && status === "RECTIFICATION_REQUIRED" ? "Submit your rectification on the Rectification tab to trigger revalidation." : ""}</Notice>}
      </div>

      <nav className="glass-card mb-4 flex gap-1 overflow-x-auto rounded-xl border px-2" aria-label="Application sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/applications/${app.id}?tab=${t.key}`}
            scroll={false}
            className={cn("my-1.5 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors", tab === t.key ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--color-accent-line)]" : "text-ink-2 hover:bg-subtle hover:text-ink")}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
            {t.count !== undefined && <span className={cn("rounded px-1.5 text-[11px] tabular", t.warn ? "bg-warn-soft text-warn" : "bg-subtle text-muted")}>{t.count}</span>}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab detail={detail} coverage={coverage} isApplicant={isApplicant} />}
      {tab === "documents" && <DocumentsTab detail={detail} actor={actor} categories={categories.map((c) => ({ code: c.code, name: c.name }))} maxMb={settings.maxUploadMb} />}
      {tab === "validation" && <ValidationTab applicationId={app.id} runs={runs} selectedRunId={run} canSeeOther={!isApplicant} />}
      {tab === "findings" && <FindingsTab findings={findings} actor={actor} />}
      {tab === "verification" && <VerificationTab detail={detail} coverage={coverage} actor={actor} />}
      {tab === "compliance" && <ComplianceTab applicationId={app.id} actor={actor} />}
      {tab === "rectification" && <RectificationTab detail={detail} actor={actor} categories={categories.map((c) => ({ code: c.code, name: c.name }))} maxMb={settings.maxUploadMb} />}
      {tab === "review" && <ReviewTab detail={detail} />}
      {tab === "history" && <HistoryTab detail={detail} actor={actor} />}
    </>
  );
}
