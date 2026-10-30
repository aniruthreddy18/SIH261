"use client";
import { useActionState, useState } from "react";
import { ArrowRight, Loader2, MousePointerClick } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

export interface DemoCard { email: string; title: string; subtitle?: string; note: string; dot: string }

/**
 * Evaluator quick access: one click signs in as a demo account. Each card is a plain form, so it
 * also works before the page has finished loading its scripts.
 */
export function DemoAccess({ cards, portal, next }: { cards: DemoCard[]; portal: "INSTITUTION" | "OFFICIAL"; next: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <section aria-labelledby="demo-access-title" className="rounded-xl border border-accent-line bg-accent-soft/40 p-3">
      <div className="mb-2.5 flex items-start gap-2 px-1">
        <MousePointerClick className="mt-0.5 size-4 shrink-0 text-accent" />
        <div>
          <h2 id="demo-access-title" className="text-sm font-semibold text-ink">Evaluator quick access</h2>
          <p className="text-[11.5px] text-ink-2">One click — no typing. Each button signs in as a synthetic demo account with its own role and dashboard.</p>
        </div>
      </div>
      <ul className="grid gap-1.5">
        {cards.map((c) => (
          <li key={c.email}>
            <form action={action} onSubmit={() => setChosen(c.email)}>
              <input type="hidden" name="email" value={c.email} />
              <input type="hidden" name="portal" value={portal} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="demo" value="1" />
              <button
                type="submit"
                disabled={pending}
                data-testid="demo-enter"
                aria-label={`Enter as ${c.title}${c.subtitle ? ` (${c.subtitle})` : ""}`}
                className={cn("group flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left transition hover:border-accent-line hover:shadow-sm disabled:opacity-70", chosen === c.email && pending && "border-accent-line")}
              >
                <span className={cn("mt-1.5 size-2.5 shrink-0 self-start rounded-full", c.dot)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{c.title}{c.subtitle ? <span className="font-normal text-muted"> · {c.subtitle}</span> : null}</span>
                  <span className="line-clamp-2 block text-[11px] leading-snug text-muted">{c.note}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                  {chosen === c.email && pending ? <Loader2 className="size-3.5 animate-spin" /> : <>Enter <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></>}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      {state?.error && <p role="alert" className="mt-2 rounded-md border border-bad-line bg-bad-soft px-3 py-2 text-xs text-bad">{state.error}</p>}
    </section>
  );
}
