import { redirect } from "next/navigation";
import { getActor } from "@/server/session";
import { BrandMark, ValidationIllustration } from "@/components/brand";
import { ROLE_THEME } from "@/lib/role-theme";
import { LoginForm } from "./login-form";
import { DECISION_SUPPORT_DISCLAIMER, ROLE_LABELS, type Role } from "@/lib/domain";

export const metadata = { title: "Sign in" };

const DEMO_ACCOUNTS: { email: string; role: Role; note: string }[] = [
  { email: "scrutiny@aegis.demo", role: "SCRUTINY_OFFICER", note: "Validation, issuer verification, manual confirmation, findings, rectification, forwarding." },
  { email: "senior@aegis.demo", role: "SENIOR_OFFICIAL", note: "Records the authorised review outcome." },
  { email: "admin@aegis.demo", role: "ADMIN", note: "Users, versioned rules, issuer sources, settings." },
  { email: "applicant.meridian@aegis.demo", role: "APPLICANT", note: "Meridian Institute of Management — expired NOC (rectification demo)." },
  { email: "applicant.lakeview@aegis.demo", role: "APPLICANT", note: "Lakeview College — rectification requested." },
  { email: "applicant.greenfield@aegis.demo", role: "APPLICANT", note: "Greenfield College — draft awaiting validation." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getActor()) redirect("/");
  const { next } = await searchParams;
  const demo = process.env.DEMO_MODE !== "false";
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex flex-col justify-between overflow-hidden bg-navy px-6 py-8 text-white lg:w-[46%] lg:px-12 lg:py-10">
        <div className="tri-rule-on-navy absolute inset-x-0 top-0 h-1.5" />
        <ValidationIllustration className="pointer-events-none absolute bottom-40 -right-12 hidden h-60 text-white/15 lg:block" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <BrandMark inverted className="size-9" />
            <div>
              <p className="text-base font-semibold">Aegis</p>
              <p className="text-xs text-white/75">Application Validation &amp; Compliance Intelligence</p>
            </div>
          </div>
          <div className="mt-10 max-w-md lg:mt-16">
            <h1 className="text-2xl font-semibold tracking-tight">Evidence-linked validation of institutional applications</h1>
            <p className="mt-3 text-[13px] leading-relaxed text-white/85">
              Documents are read automatically, checked against versioned rules and issuing sources, and only the exceptions go to a human — with every step recorded.
            </p>
            <ol className="mt-6 space-y-2 text-[13px]">
              {["Application", "Documents", "Validation", "Verification", "Review"].map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full border border-white/40 text-[11px] font-semibold">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="relative mt-10 max-w-md text-[11px] leading-relaxed text-white/70">{DECISION_SUPPORT_DISCLAIMER} Prototype for SIH 2026 PS 26261; not an official AICTE system. Demo environment — all data is synthetic.</p>
      </div>
      <div className="flex flex-1 items-start justify-center px-6 py-10 lg:items-center">
        <div className="w-full max-w-md">
          <h2 className="text-lg font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-xs text-muted">One sign-in for everyone. Your role decides what you see — each role has its own colour.</p>
          <LoginForm next={next ?? "/"} />
          {demo && (
            <div className="mt-8 rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5">
                <p className="text-xs font-semibold text-ink">Demo accounts</p>
                <p className="text-[11px] text-muted">Password for all: <code className="rounded bg-subtle px-1 font-mono">Aegis@Demo2026</code>. Selecting an account fills the form; sign-in still goes through normal authentication.</p>
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
    </div>
  );
}
