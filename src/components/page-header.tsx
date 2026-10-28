import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({ title, description, crumbs = [], actions, meta }: { title: React.ReactNode; description?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="mb-5">
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-faint" />}
              {c.href ? <Link href={c.href} className="hover:text-ink hover:underline">{c.label}</Link> : <span className="text-ink-2">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink [text-shadow:0_1px_8px_rgb(255_255_255/0.9)]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[13px] text-ink-2 [text-shadow:0_1px_6px_rgb(255_255_255/0.9)]">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint [&_svg]:size-8">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "ok"; title?: string; children: React.ReactNode }) {
  const cls = { info: "border-info-line bg-info-soft text-info-ink", warn: "border-warn-line bg-warn-soft text-warn-ink", bad: "border-bad-line bg-bad-soft text-bad-ink", ok: "border-ok-line bg-ok-soft text-ok-ink" }[tone];
  return (
    <div className={`rounded-md border px-3.5 py-2.5 text-[13px] ${cls}`} role={tone === "bad" ? "alert" : "note"}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}
