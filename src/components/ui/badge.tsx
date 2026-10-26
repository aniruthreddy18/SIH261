import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-slate-200 bg-neutral-soft text-ink-2",
      ok: "border-green-200 bg-ok-soft text-ok",
      warn: "border-amber-200 bg-warn-soft text-warn",
      bad: "border-red-200 bg-bad-soft text-bad",
      info: "border-sky-200 bg-info-soft text-info",
      accent: "border-blue-200 bg-accent-soft text-accent",
      outline: "border-border-strong bg-surface text-ink-2",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
