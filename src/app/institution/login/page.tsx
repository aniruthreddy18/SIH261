import { redirect } from "next/navigation";
import { CheckCircle2, FileUp, ListChecks, RotateCcw } from "lucide-react";
import { getActor } from "@/server/session";
import { BrandMark } from "@/components/brand";
import { LoginForm } from "@/app/login/login-form";
import { PortalSwitch } from "@/app/login/portal-switch";
import { DECISION_SUPPORT_DISCLAIMER } from "@/lib/domain";

export const metadata = { title: "Institution login" };

const DEMO_INSTITUTIONS = [
  { email: "applicant.meridian@aegis.demo", institution: "Meridian Institute of Management", note: "Expired fire NOC — fix it via rectification" },
  { email: "applicant.lakeview@aegis.demo", institution: "Lakeview College of Engineering", note: "Returned for rectification — missing NOC" },
  { email: "applicant.greenfield@aegis.demo", institution: "Greenfield College of Engineering", note: "Draft — upload documents and run checks" },
  { email: "applicant.coastal@aegis.demo", institution: "Coastal Institute of Pharmacy", note: "Mismatched identifier and intake" },
  { email: "applicant.sunrise@aegis.demo", institution: "Sunrise Institute of Technology", note: "All automated checks passed" },
  { email: "applicant.valley@aegis.demo", institution: "Valley Institute of Technology", note: "Forwarded to the competent authority" },
  { email: "applicant.northfield@aegis.demo", institution: "Northfield School of Architecture", note: "Under review — issuer mismatch" },
  { email: "applicant.riverside@aegis.demo", institution: "Riverside Polytechnic Institute", note: "Under review — scanned document, issuer pending" },
  { email: "applicant.highland@aegis.demo", institution: "Highland Institute of Technology", note: "Under review — duplicate evidence" },
];

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
  const demo = process.env.DEMO_MODE !== "false";
  return (
    <div className="theme-green flex min-h-screen flex-col items-center gap-6 px-4 py-6 lg:flex-row lg:items-center lg:justify-center lg:gap-10 lg:px-10">
      <div className="app-backdrop app-backdrop-vivid" aria-hidden />
      <section className="glass order-2 w-full max-w-md overflow-hidden rounded-xl lg:order-1 lg:max-w-lg">
        <div className="glass-bar relative bg-green/75 px-6 pb-4 pt-5 text-white">
          <div className="tri-rule-on-green absolute inset-x-0 top-0 h-1.5" />
          <div className="flex items-center gap-3">
            <BrandMark inverted className="size-9" />
            <div>
              <p className="text-base font-semibold">Aegis · Institution Portal</p>
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
          <p className="mt-5 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">{DECISION_SUPPORT_DISCLAIMER} Prototype for SIH 2026 PS 26261; not an official AICTE system. Demo environment — all data is synthetic.</p>
        </div>
      </section>
      <div className="glass order-1 w-full max-w-md rounded-xl p-5 sm:p-6 lg:order-2">
        <PortalSwitch current="INSTITUTION" />
        <h2 className="mt-6 text-lg font-semibold text-ink">Institution login</h2>
        <p className="mt-1 text-xs text-muted">Sign in with your institution&rsquo;s authorised account. You will only see your own institution&rsquo;s applications.</p>
        <LoginForm next={next ?? "/portal"} portal="INSTITUTION" />
        {demo && (
          <div className="mt-8 rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-xs font-semibold text-ink">Demo institution accounts</p>
              <p className="text-[11px] text-muted">Password for all: <code className="rounded bg-subtle px-1 font-mono">Aegis@Demo2026</code>. Selecting one fills the form.</p>
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {DEMO_INSTITUTIONS.map((a) => (
                <li key={a.email}>
                  <button type="button" data-demo-email={a.email} className="demo-fill flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-subtle">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-green" aria-hidden />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">{a.institution}</span>
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
