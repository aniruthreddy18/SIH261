"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, FolderOpen, Gauge, History, Inbox, ListChecks, ScanText, Settings, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

const ICONS: Record<string, typeof Gauge> = { gauge: Gauge, folder: FolderOpen, scan: ScanText, list: ListChecks, badge: BadgeCheck, inbox: Inbox, shield: ShieldCheck, history: History, users: Users, settings: Settings };

/** Horizontal section bar under the role header. Scrolls sideways on narrow screens. */
export function TopNav({ items, reviewCount }: { items: NavItem[]; reviewCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const link = (i: NavItem) => {
    const Icon = ICONS[i.icon];
    const active = isActive(i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
          active ? "bg-accent text-white shadow-sm" : "text-ink-2 hover:bg-accent-soft hover:text-accent",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {i.short ?? i.label}
        {i.href === "/review" && reviewCount > 0 && (
          <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular", active ? "bg-white/25 text-white" : "bg-saffron-bright text-white")}>{reviewCount}</span>
        )}
      </Link>
    );
  };
  const main = items.filter((i) => !i.adminSection);
  const admin = items.filter((i) => i.adminSection);
  return (
    <nav className="flex items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none]" aria-label="Main navigation">
      {main.map(link)}
      {admin.length > 0 && <span className="mx-1.5 h-5 w-px shrink-0 bg-border-strong" aria-hidden />}
      {admin.map(link)}
      <span className="ml-auto hidden shrink-0 rounded-full border border-border bg-white/60 px-2.5 py-0.5 text-[11px] text-muted xl:inline" title="All data is synthetic; issuer verification uses simulated sources.">
        Demo environment · synthetic data
      </span>
    </nav>
  );
}
