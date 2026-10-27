import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Dashboard welcome panel. It sits on the project artwork (see .app-backdrop in globals.css):
 * a frosted panel on the left keeps the text readable while the artwork shows on the right.
 * `band` is the role colour (top stripe and dot), so each user type stays recognisable.
 */
export function DashboardHero({ band, eyebrow, title, subtitle, actions, footer }: { band: string; eyebrow: string; title: string; subtitle: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="dash-hero mb-5 flex min-h-[180px] items-center md:min-h-[230px]">
      <div className="glass relative w-full max-w-xl overflow-hidden rounded-xl px-5 pb-5 pt-6">
        <div className={cn("absolute inset-x-0 top-0 h-1.5", band)} />
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
          <span className={cn("size-2 rounded-full", band)} aria-hidden />
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        {footer}
      </div>
    </section>
  );
}

export function HeroLink({ href, icon, primary = false, children }: { href: string; icon: React.ReactNode; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-medium shadow-sm [&_svg]:size-4",
        primary ? "bg-accent text-white hover:bg-accent-hover" : "border border-border-strong bg-white text-accent hover:border-accent-line hover:bg-accent-soft",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/** Icon-chip gradients for the stat tiles, cycled in order so neighbouring tiles differ. */
export const TILE_TONES = [
  "from-navy to-navy-light",
  "from-saffron to-saffron-bright",
  "from-teal to-teal-bright",
  "from-green to-green-bright",
  "from-navy-deep to-navy",
];
