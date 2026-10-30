import { redirect } from "next/navigation";
import { getActor } from "@/server/session";
import { BrandMark } from "@/components/brand";
import { ROLE_THEME } from "@/lib/role-theme";
import { DEMO_OFFICIALS, DEMO_PASSWORD, isDemoMode } from "@/lib/demo-accounts";
import { LoginForm } from "./login-form";
import { DemoAccess } from "./demo-access";
import { PortalSwitch } from "./portal-switch";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/domain";

export const metadata = { title: "AICTE official sign-in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  if (actor) redirect(actor.role === "APPLICANT" ? "/portal" : "/");
  const { next } = await searchParams;
  const demo = isDemoMode();
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
        {demo && (
          <div className="mt-4">
            <DemoAccess portal="OFFICIAL" next={next ?? "/"} cards={DEMO_OFFICIALS.map((a) => ({ email: a.email, title: a.title, subtitle: a.scope, note: a.note, dot: ROLE_THEME[a.role].dot }))} />
            <p className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-faint"><span className="h-px flex-1 bg-border" />or sign in with email<span className="h-px flex-1 bg-border" /></p>
          </div>
        )}
        <LoginForm next={next ?? "/"} portal="OFFICIAL" defaultEmail={demo ? DEMO_OFFICIALS[0].email : undefined} defaultPassword={demo ? DEMO_PASSWORD : undefined} />
        {demo && <p className="mt-3 text-[11px] text-muted">Demo password for every account: <code className="rounded bg-subtle px-1 font-mono">{DEMO_PASSWORD}</code>. Sign-in still goes through normal authentication, and all data is synthetic.</p>}
      </div>
    </div>
  );
}
