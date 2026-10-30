import { redirect } from "next/navigation";
import { getActor } from "@/server/session";
import { BrandMark } from "@/components/brand";
import { ROLE_THEME } from "@/lib/role-theme";
import { LoginForm } from "./login-form";
import { PortalSwitch } from "./portal-switch";
import { DECISION_SUPPORT_DISCLAIMER, ROLE_LABELS, type Role } from "@/lib/domain";

export const metadata = { title: "AICTE official sign-in" };

const DEMO_ACCOUNTS: { email: string; role: Role; note: string }[] = [
  { email: "scrutiny@pravah.demo", role: "SCRUTINY_OFFICER", note: "All Regions. Scrutiny: validation, issuer verification, findings, return for rectification, forwarding along the pathway." },
  { email: "ro.south@pravah.demo", role: "SCRUTINY_OFFICER", note: "Southern Region only — the same desk, scoped to one Region's institutions, pendency and alerts." },
  { email: "bureau@pravah.demo", role: "BUREAU_OFFICER", note: "Pendency across Regions, EVC scheduling, undertakings and document validity, escalations, consolidated reports." },
  { email: "committee@pravah.demo", role: "COMMITTEE_MEMBER", note: "EVC convenor: scheduled visits and reports; records SAC/SHC outcomes." },
  { email: "senior@pravah.demo", role: "SENIOR_OFFICIAL", note: "Competent authority: records the outcome, sees escalations, may revert a stage." },
  { email: "admin@pravah.demo", role: "ADMIN", note: "Users and Regions, workflow pathways and timelines, rules, issuer sources, settings." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  if (actor) redirect(actor.role === "APPLICANT" ? "/portal" : "/");
  const { next } = await searchParams;
  const demo = process.env.DEMO_MODE !== "false";
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-6 lg:flex-row lg:items-center lg:justify-center lg:gap-10 lg:px-10">
      <div className="app-backdrop app-backdrop-vivid" aria-hidden />
      <section className="glass order-2 w-full max-w-md overflow-hidden rounded-xl lg:order-1 lg:max-w-lg">
        <div className="glass-bar relative bg-navy/75 px-6 pb-4 pt-5 text-white">
          <div className="tri-rule-on-navy absolute inset-x-0 top-0 h-1.5" />
          <div className="flex items-center gap-3">
            <BrandMark inverted className="size-9" />
            <div>
              <p className="text-base font-semibold">Pravah AI</p>
              <p className="text-xs text-white/80">Approval Workflow, Compliance Monitoring &amp; Alerts</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <h1 className="text-xl font-semibold tracking-tight text-ink">One tracked workflow from submission to compliance</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            Applications move automatically through their configured stages — scrutiny, expert visit, SAC/SHC and the competent authority — with timelines, reminders and escalation. Undertakings and document validity are tracked after approval. Every decision stays with an authorised official, and every step is recorded.
          </p>
          <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink-2">
            {["Submission", "Scrutiny", "EVC", "SAC/SHC", "Decision", "Compliance"].map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-5 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">{DECISION_SUPPORT_DISCLAIMER} Prototype for SIH 2026 PS 26262; not an official AICTE system. Demo environment — all data is synthetic.</p>
        </div>
      </section>
      <div className="glass order-1 w-full max-w-md rounded-xl p-5 sm:p-6 lg:order-2">
        <PortalSwitch current="OFFICIAL" />
        <h2 className="mt-6 text-lg font-semibold text-ink">AICTE official sign-in</h2>
        <p className="mt-1 text-xs text-muted">For Regional and Bureau officers, committee members, competent authorities and administrators. Institutions use the <a href="/institution/login" className="font-medium text-green underline">Institution login</a>.</p>
        <LoginForm next={next ?? "/"} portal="OFFICIAL" />
        {demo && (
          <div className="mt-8 rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-xs font-semibold text-ink">Demo official accounts</p>
              <p className="text-[11px] text-muted">Password for all: <code className="rounded bg-subtle px-1 font-mono">Pravah@Demo2026</code>. Selecting an account fills the form; sign-in still goes through normal authentication.</p>
            </div>
            <ul className="divide-y divide-border">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button type="button" data-demo-email={a.email} className="demo-fill flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-subtle">
                    <span className={`mt-1 size-2.5 shrink-0 rounded-full ${ROLE_THEME[a.role].dot}`} aria-hidden />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">{ROLE_LABELS[a.role]} <span className="font-normal text-muted">· {ROLE_THEME[a.role].portal}</span></span>
                      <span className="block text-[11px] text-muted">{a.email} — {a.note}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
