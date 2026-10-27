import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass-card rounded-xl border", className)} {...props} />;
}

export function CardHeader({ className, title, description, actions, children }: { className?: string; title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3", className)}>
      <div className="min-w-0">
        {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
