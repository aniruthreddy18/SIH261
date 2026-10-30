import { redirect } from "next/navigation";
import { CheckCircle2, FileUp, ListChecks, RotateCcw } from "lucide-react";
import { getActor } from "@/server/session";
import { prisma } from "@/server/db";
import { BrandMark } from "@/components/brand";
import { LoginForm } from "@/app/login/login-form";
import { PortalSwitch } from "@/app/login/portal-switch";
import { DemoAccess } from "@/app/login/demo-access";
import { DEMO_INSTITUTIONS, DEMO_PASSWORD, isDemoMode } from "@/lib/demo-accounts";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/domain";

export const metadata = { title: "Institution login" };

const STEPS = [
  { Icon: FileUp, title: "Submit", text: "Create your application and upload the required documents (PDF, PNG or JPEG)." },
  { Icon: ListChecks, title: "Automatic checks", text: "Documents are read and checked against the checklist and rules within seconds." },
  { Icon: RotateCcw, title: "Fix what's flagged", text: "Every issue says what was found, on which page, and what to correct." },
  { Icon: CheckCircle2, title: "Track progress", text: "Follow your application through verification and review to the recorded outcome." },
];

export default async function InstitutionLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  if (actor) redirect(actor.role === "APPLICANT" ? "/portal" : "/");
  const { next } = await searchParams;
  const demo = isDemoMode();
  // Only list demo institutions that exist in this database (the compact demo seeds three).
  const existing = demo ? new Set((await prisma.user.findMany({ where: { role: "APPLICANT", active: true }, select: { email: true } })).map((u) => u.email)) : new Set<string>();
  const demoInstitutions = DEMO_INSTITUTIONS.filter((a) => existing.has(a.email));
  return (
    <div className="theme-green flex min-h-screen flex-col items-center gap-6 px-4 py-6 lg:flex-row lg:items-center lg:justify-center lg:gap-10 lg:px-10">
      <div className="app-backdrop app-backdrop-vivid" aria-hidden />
      <section className="glass order-2 w-full max-w-md overflow-hidden rounded-xl lg:order-1 lg:max-w-lg">
        <div className="glass-bar relative bg-green/75 px-6 pb-4 pt-5 text-white">
          <div className="tri-rule-on-green absolute inset-x-0 top-0 h-1.5" />
          <div className="flex items-center gap-3">
            <BrandMark inverted className="size-9" />
            <div>
              <p className="text-base font-semibold">Pravah AI · Institution Portal</p>
              <p className="text-xs text-white/85">For institutions applying for approval</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Submit, track and fix your application in one place</h1>
          <ul className="mt-4 space-y-3">
            {STEPS.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon className="size-4" /></span>
                <span>
                  <span className="block text-[13.5px] font-semibold text-ink">{title}</span>
                  <span className="block text-[12.5px] text-ink-2">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">{DECISION_SUPPORT_DISCLAIMER} Prototype for SIH 2026 PS 26262; not an official AICTE system. Demo environment — all data is synthetic.</p>
        </div>
      </section>
      <div className="glass order-1 w-full max-w-md rounded-xl p-5 sm:p-6 lg:order-2">
        <PortalSwitch current="INSTITUTION" />
        <h2 className="mt-6 text-lg font-semibold text-ink">Institution login</h2>
        <p className="mt-1 text-xs text-muted">Sign in with your institution&rsquo;s authorised account. You will only see your own institution&rsquo;s applications.</p>
        {demo && demoInstitutions.length > 0 && (
          <div className="mt-4">
            <DemoAccess portal="INSTITUTION" next={next ?? "/portal"} cards={demoInstitutions.map((a) => ({ email: a.email, title: a.institution, note: a.note, dot: "bg-green" }))} />
            <p className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-faint"><span className="h-px flex-1 bg-border" />or sign in with email<span className="h-px flex-1 bg-border" /></p>
          </div>
        )}
        <LoginForm next={next ?? "/portal"} portal="INSTITUTION" defaultEmail={demo ? demoInstitutions[0]?.email : undefined} defaultPassword={demo && demoInstitutions.length ? DEMO_PASSWORD : undefined} />
        {demo && demoInstitutions.length > 0 && <p className="mt-3 text-[11px] text-muted">Demo password for every account: <code className="rounded bg-subtle px-1 font-mono">{DEMO_PASSWORD}</code>. Sign-in still goes through normal authentication, and all data is synthetic.</p>}
      </div>
    </div>
  );
}
