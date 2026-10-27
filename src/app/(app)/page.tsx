import Link from "next/link";
import {
  AlertOctagon, ArrowRight, BadgeCheck, CalendarClock, ClipboardCheck, FileClock, FilePlus2, FileWarning, FolderOpen, Gavel, History, Inbox,
  ListChecks, Play, RadioTower, Settings, Upload, UserCheck, Users, Undo2,
} from "lucide-react";
import type { Actor } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/permissions";
import { ROLE_LABELS, type ApplicationStatus } from "@/lib/domain";
import { DECISION_OUTCOMES, findingTypeLabel, REVIEW_ACTION_LABELS, type DecisionOutcome } from "@/lib/findings";
import { ROLE_THEME } from "@/lib/role-theme";
import { getDashboard, getRoleExtras } from "@/server/dashboard";
import { requireActor } from "@/server/session";
import { prisma } from "@/server/db";
import { EmptyState } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { SeverityBadge } from "@/components/status";
import { ApplicationsTable } from "@/components/app/applications-table";
import { DashboardHero, HeroLink, TILE_TONES } from "@/components/dashboard-hero";
import { cn, formatDate, formatDateTime, relativeAge } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

type Dash = Awaited<ReturnType<typeof getDashboard>>;
type Extras = Awaited<ReturnType<typeof getRoleExtras>>;

function Hero({ actor, institution, actions }: { actor: Actor; institution?: string | null; actions: React.ReactNode }) {
  const theme = ROLE_THEME[actor.role];
  return (
    <DashboardHero
      band={theme.header}
      eyebrow={theme.portal}
      title={`Welcome, ${actor.name}`}
      subtitle={<>{ROLE_LABELS[actor.role]}{institution ? ` · ${institution}` : ""} — {theme.purpose}</>}
      actions={actions}
    />
  );
}

function Tiles({ tiles }: { tiles: { label: string; value: number | string; href: string; icon: React.ReactNode; hint: string }[] }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", tiles.length >= 5 ? "md:grid-cols-3 xl:grid-cols-5" : "md:grid-cols-4")}>
      {tiles.map((t, i) => (
        <Link key={t.label} href={t.href} title={t.hint} className="glass-card group flex items-center gap-3 rounded-xl border px-4 py-3.5 transition hover:-translate-y-0.5 hover:shadow-md">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-sm [&_svg]:size-5", TILE_TONES[i % TILE_TONES.length])}>{t.icon}</span>
          <span className="min-w-0">
            <span className="block text-2xl font-semibold leading-7 text-ink tabular">{t.value}</span>
            <span className="block truncate text-xs text-ink-2">{t.label}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function AttentionList({ items, actor, title, description }: { items: Dash["attention"]; actor: Actor; title: string; description: string }) {
  const reviewer = hasPermission(actor.role, "finding.review");
  return (
    <Card>
      <CardHeader title={title} description={description} actions={reviewer ? <Link href="/review" className="text-xs font-medium text-accent hover:underline">Open review queue</Link> : undefined} />
      {items.length === 0 ? (
        <EmptyState icon={<ClipboardCheck />} title="Nothing needs attention" description="There are no unresolved findings." />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((f) => (
            <li key={f.id}>
              <Link href={reviewer ? `/review/${f.id}` : `/applications/${f.application.id}?tab=findings`} className="flex items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                {f.outcomeClass === "FAIL" ? <AlertOctagon className="mt-0.5 size-4 shrink-0 text-bad" /> : <FileWarning className="mt-0.5 size-4 shrink-0 text-warn" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{actor.role === "APPLICANT" ? findingTypeLabel(f.type) : f.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {actor.role === "APPLICANT" ? f.recommendedAction : <><span className="font-mono">{f.application.reference}</span> · {f.application.institutionName}</>}
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
  );
}

function RecentActivity({ d }: { d: Dash }) {
  return (
    <Card>
      <CardHeader title="Recent activity" description="Latest validation runs and human actions." />
      <ul className="divide-y divide-border">
        {d.recentRuns.slice(0, 4).map((r) => (
          <li key={r.id} className="flex gap-2.5 px-4 py-2.5">
            <Play className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <div className="min-w-0 text-xs">
              <Link href={`/applications/${r.application.id}?tab=validation`} className="font-medium text-ink hover:underline">Validation run #{r.runNumber} · {r.application.reference}</Link>
              <p className="truncate text-muted">{r.application.institutionName} · {formatDateTime(r.startedAt)}</p>
            </div>
          </li>
        ))}
        {d.recentReviews.slice(0, 4).map((r) => (
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
  );
}

function RecentApplications({ d, title }: { d: Dash; title: string }) {
  return (
    <Card className="mt-4">
      <CardHeader title={title} actions={<Link href="/applications" className="text-xs font-medium text-accent hover:underline">All applications</Link>} />
      {d.recentApplications.length ? <ApplicationsTable rows={d.recentApplications} /> : <EmptyState icon={<FolderOpen />} title="No applications yet" />}
    </Card>
  );
}

const count = (d: Dash, statuses: ApplicationStatus[]) => d.statusBreakdown.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s.count, 0);

export default async function Dashboard() {
  const actor = await requireActor();
  const [d, extras, institution] = await Promise.all([
    getDashboard(actor),
    getRoleExtras(actor),
    actor.institutionId ? prisma.institution.findUnique({ where: { id: actor.institutionId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  if (actor.role === "APPLICANT") return <ApplicantDashboard actor={actor} d={d} extras={extras} institution={institution?.name} />;
  if (actor.role === "SENIOR_OFFICIAL") return <SeniorDashboard actor={actor} d={d} extras={extras} />;
  if (actor.role === "ADMIN") return <AdminDashboard actor={actor} d={d} extras={extras} />;
  return <OfficerDashboard actor={actor} d={d} />;
}

function ApplicantDashboard({ actor, d, extras, institution }: { actor: Actor; d: Dash; extras: Extras; institution?: string | null }) {
  const rect = extras.kind === "APPLICANT" ? extras.rectifications : [];
  return (
    <>
      <Hero
        actor={actor}
        institution={institution}
        actions={
          <>
            <HeroLink primary href="/applications/new" icon={<FilePlus2 />}>New application</HeroLink>
            <HeroLink href="/applications" icon={<Upload />}>Upload documents</HeroLink>
          </>
        }
      />
      <Tiles
        tiles={[
          { label: "My applications", value: d.metrics.total, href: "/applications", icon: <FolderOpen />, hint: "All applications submitted by your institution" },
          { label: "Need your action", value: count(d, ["DRAFT", "RECTIFICATION_REQUIRED", "AUTO_FAILED", "PROCESSING_FAILED"]), href: "/applications", icon: <FileWarning />, hint: "Drafts, failed checks or rectification requests" },
          { label: "Under AICTE review", value: count(d, ["PROCESSING", "REVIEW_REQUIRED", "AUTO_PASSED"]), href: "/applications", icon: <FileClock />, hint: "Being checked by officials" },
          { label: "Forwarded or decided", value: count(d, ["READY_FOR_AUTHORIZED_REVIEW", "CLOSED"]), href: "/applications", icon: <BadgeCheck />, hint: "With the competent authority, or outcome recorded" },
        ]}
      />
      {rect.length > 0 && (
        <Card className="mt-4 border-warn-line">
          <CardHeader title="Rectification requested" description="AICTE has returned these applications for correction." />
          <ul className="divide-y divide-border">
            {rect.map((r) => (
              <li key={r.id}>
                <Link href={`/applications/${r.application.id}?tab=rectification`} className="flex items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                  <Undo2 className="mt-0.5 size-4 shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink"><span className="font-mono">{r.application.reference}</span> — {r.message}</p>
                    <p className="mt-0.5 text-xs text-muted">Requested by {r.requestedBy} · {formatDate(r.createdAt)}</p>
                  </div>
                  {r.dueDate && <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-warn"><CalendarClock className="size-3.5" /> Due {formatDate(r.dueDate)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mt-4">
        <AttentionList items={d.attention} actor={actor} title="What you need to do" description="Issues found in your submissions, most serious first, with the correction required." />
      </div>
      <RecentApplications d={d} title="Your applications" />
    </>
  );
}

function OfficerDashboard({ actor, d }: { actor: Actor; d: Dash }) {
  const m = d.metrics;
  return (
    <>
      <Hero
        actor={actor}
        actions={
          <>
            <HeroLink primary href="/review" icon={<Inbox />}>Review queue ({m.openFindings})</HeroLink>
            <HeroLink href="/applications?status=DRAFT" icon={<Play />}>Awaiting validation</HeroLink>
            <HeroLink href="/verification" icon={<RadioTower />}>Issuer verification</HeroLink>
          </>
        }
      />
      <Tiles
        tiles={[
          { label: "Awaiting validation", value: m.awaitingValidation, href: "/applications?status=DRAFT", icon: <Play />, hint: "Draft or processing failed" },
          { label: "Need review", value: m.awaitingReview, href: "/applications?status=REVIEW_REQUIRED", icon: <Inbox />, hint: "Review required or automated checks failed" },
          { label: "With institution", value: m.rectification, href: "/applications?status=RECTIFICATION_REQUIRED", icon: <Undo2 />, hint: "Returned for rectification" },
          { label: "Verification pending", value: m.verificationPending, href: "/verification", icon: <RadioTower />, hint: "Verifiable documents without a verified result" },
          { label: "Forwarded to authority", value: m.readyForReview, href: "/applications?status=READY_FOR_AUTHORIZED_REVIEW", icon: <Gavel />, hint: "Ready for authorised review" },
        ]}
      />
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <AttentionList items={d.attention} actor={actor} title="Attention required" description="Highest-severity unresolved items across all applications." />
        </div>
        <RecentActivity d={d} />
      </div>
      <RecentApplications d={d} title="Recent applications" />
    </>
  );
}

function SeniorDashboard({ actor, d, extras }: { actor: Actor; d: Dash; extras: Extras }) {
  const awaiting = extras.kind === "SENIOR_OFFICIAL" ? extras.awaiting : [];
  const decisions = extras.kind === "SENIOR_OFFICIAL" ? extras.decisions : [];
  return (
    <>
      <Hero actor={actor} actions={<HeroLink primary href="/applications?status=READY_FOR_AUTHORIZED_REVIEW" icon={<Gavel />}>Applications awaiting your decision ({awaiting.length})</HeroLink>} />
      <Tiles
        tiles={[
          { label: "Awaiting your decision", value: awaiting.length, href: "/applications?status=READY_FOR_AUTHORIZED_REVIEW", icon: <Gavel />, hint: "Forwarded by the scrutiny officer" },
          { label: "Outcomes recorded", value: count(d, ["CLOSED"]), href: "/applications?status=CLOSED", icon: <BadgeCheck />, hint: "Applications closed with a recorded outcome" },
          { label: "In scrutiny", value: d.metrics.total - awaiting.length - count(d, ["CLOSED", "DRAFT"]), href: "/applications", icon: <FileClock />, hint: "Still being checked by the officer or institution" },
          { label: "Total applications", value: d.metrics.total, href: "/applications", icon: <FolderOpen />, hint: "All applications" },
        ]}
      />
      <Card className="mt-4">
        <CardHeader title="Awaiting your decision" description="Each has passed automated checks with no open findings and verified documents. Your decision is recorded as a human review action." />
        {awaiting.length === 0 ? (
          <EmptyState icon={<Gavel />} title="Nothing awaiting a decision" />
        ) : (
          <ul className="divide-y divide-border">
            {awaiting.map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}?tab=review`} className="flex flex-wrap items-start gap-3 px-4 py-3 hover:bg-subtle/60">
                  <Gavel className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{a.institutionName} <span className="font-mono text-xs font-normal text-muted">{a.reference}</span></p>
                    {a.reviewActions[0] && <p className="mt-0.5 text-xs text-muted">Forwarded by {a.reviewActions[0].actorName} on {formatDate(a.reviewActions[0].createdAt)}: “{a.reviewActions[0].reason}”</p>}
                  </div>
                  <span className="flex items-center gap-1 text-xs font-medium text-accent">Review <ArrowRight className="size-3.5" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-4">
        <CardHeader title="Recent decisions" />
        {decisions.length === 0 ? (
          <EmptyState title="No outcomes recorded yet" />
        ) : (
          <ul className="divide-y divide-border">
            {decisions.map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-xs">
                <Link href={`/applications/${r.application.id}?tab=review`} className="font-medium text-ink hover:underline">{r.application.reference} · {r.application.institutionName}</Link>
                <p className="text-muted">{DECISION_OUTCOMES[r.outcome as DecisionOutcome] ?? r.outcome} · {r.actorName} · {formatDateTime(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function AdminDashboard({ actor, d, extras }: { actor: Actor; d: Dash; extras: Extras }) {
  if (extras.kind !== "ADMIN") return null;
  const tasks = [
    { href: "/admin/users", icon: <Users />, title: "User Management", text: "Create accounts, assign roles, deactivate users." },
    { href: "/rules", icon: <ListChecks />, title: "Validation Rules", text: "Build rules and publish new versions." },
    { href: "/admin/settings", icon: <Settings />, title: "System Settings", text: "Thresholds, timeouts, verification sources, alerts." },
    { href: "/audit", icon: <History />, title: "Reports & Audit", text: "Who did what, and exports." },
  ];
  return (
    <>
      <Hero
        actor={actor}
        actions={
          <>
            <HeroLink primary href="/rules/new" icon={<ListChecks />}>New rule</HeroLink>
            <HeroLink href="/admin/users" icon={<Users />}>Manage users</HeroLink>
          </>
        }
      />
      <Tiles
        tiles={[
          { label: "Active users", value: `${extras.activeUsers}/${extras.totalUsers}`, href: "/admin/users", icon: <Users />, hint: "Active accounts out of all accounts" },
          { label: "Active rules", value: extras.activeRules, href: "/rules", icon: <ListChecks />, hint: `${extras.ruleVersions} rule versions in total` },
          { label: "Verification sources on", value: `${extras.sourcesEnabled}/${extras.sourcesTotal}`, href: "/admin/settings", icon: <RadioTower />, hint: "Enabled issuer sources" },
          { label: "Audit events (24 h)", value: extras.auditToday, href: "/audit", icon: <History />, hint: "Events recorded in the last 24 hours" },
          { label: "Applications", value: d.metrics.total, href: "/applications", icon: <FolderOpen />, hint: "All applications (read-only for administrators)" },
        ]}
      />
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Administration tasks" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {tasks.map((t) => (
              <Link key={t.href} href={t.href} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:border-accent-line hover:bg-subtle/50">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:size-4">{t.icon}</span>
                <span>
                  <span className="block text-[13px] font-medium text-ink">{t.title}</span>
                  <span className="block text-xs text-muted">{t.text}</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent configuration changes" />
          <ul className="divide-y divide-border">
            {extras.configChanges.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">No configuration changes yet.</li>}
            {extras.configChanges.map((e) => (
              <li key={e.id} className="px-4 py-2.5 text-xs">
                <p className="font-medium text-ink">{e.action}</p>
                <p className="truncate text-muted">{e.actorLabel} · {formatDateTime(e.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
