import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-border bg-neutral-soft text-ink-2",
      ok: "border-ok-line bg-ok-soft text-ok",
      warn: "border-warn-line bg-warn-soft text-warn",
      bad: "border-bad-line bg-bad-soft text-bad",
      info: "border-info-line bg-info-soft text-info",
      accent: "border-accent-line bg-accent-soft text-accent",
      outline: "border-border-strong bg-surface text-ink-2",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
