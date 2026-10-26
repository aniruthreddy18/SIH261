import { redirect } from "next/navigation";
import { getActor } from "@/server/session";
import { BrandMark } from "@/components/brand";
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
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <div className="flex flex-1 flex-col justify-between border-b border-border bg-surface px-6 py-8 lg:max-w-[46%] lg:border-b-0 lg:border-r lg:px-12 lg:py-10">
        <div>
          <div className="flex items-center gap-3">
            <BrandMark className="size-9" />
            <div>
              <p className="text-base font-semibold text-ink">Aegis</p>
              <p className="text-xs text-muted">Application Validation &amp; Compliance Intelligence</p>
            </div>
            <span className="ml-auto rounded border border-amber-300 bg-warn-soft px-2 py-0.5 text-[10px] font-semibold tracking-wider text-warn">DEMO ENVIRONMENT</span>
          </div>
          <div className="mt-10 max-w-md lg:mt-20">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Evidence-linked validation of institutional applications</h1>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              Document extraction, versioned deterministic rules, issuer verification and an auditable human-review workflow — in one place.
            </p>
            <ol className="mt-6 space-y-2 text-[13px] text-ink-2">
              {["Application", "Documents", "Validation", "Verification", "Review"].map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full border border-border-strong text-[11px] font-semibold text-muted">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="mt-10 max-w-md text-[11px] leading-relaxed text-muted">{DECISION_SUPPORT_DISCLAIMER} Prototype for SIH 2026 PS 26261; not an official AICTE system. All data is synthetic.</p>
      </div>
      <div className="flex flex-1 items-start justify-center px-6 py-10 lg:items-center">
        <div className="w-full max-w-md">
          <h2 className="text-lg font-semibold text-ink">Sign in</h2>
          <p className="mt-1 text-xs text-muted">Use your Aegis account.</p>
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
                    <button type="button" data-demo-email={a.email} className="demo-fill w-full px-4 py-2 text-left hover:bg-subtle">
                      <span className="block text-[13px] font-medium text-ink">{ROLE_LABELS[a.role]}</span>
                      <span className="block text-[11px] text-muted">{a.email} — {a.note}</span>
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
