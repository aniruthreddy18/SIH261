"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, ChevronsLeft, ChevronsRight, FolderOpen, Gauge, History, Inbox, ListChecks, Menu, ScanText, Settings, ShieldCheck, Users, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

const ICONS: Record<string, typeof Gauge> = { gauge: Gauge, folder: FolderOpen, scan: ScanText, list: ListChecks, badge: BadgeCheck, inbox: Inbox, shield: ShieldCheck, history: History, users: Users, settings: Settings };

export function Sidebar({ items, reviewCount }: { items: NavItem[]; reviewCount: number }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("aegis.sidebar") === "collapsed");
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("aegis.sidebar", c ? "expanded" : "collapsed");
      } catch {}
      return !c;
    });
  };
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const main = items.filter((i) => !i.adminSection);
  const admin = items.filter((i) => i.adminSection);
  const link = (i: NavItem) => {
    const Icon = ICONS[i.icon];
    const active = isActive(i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        title={collapsed ? i.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
          active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-subtle hover:text-ink",
          collapsed && "lg:justify-center lg:px-0",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className={cn("truncate", collapsed && "lg:hidden")}>{i.label}</span>
        {i.href === "/review" && reviewCount > 0 && <span className={cn("ml-auto rounded bg-warn-soft px-1.5 text-[11px] font-semibold text-warn tabular", collapsed && "lg:hidden")}>{reviewCount}</span>}
      </Link>
    );
  };
  return (
    <>
      <button className="fixed left-3 top-2.5 z-40 rounded-md border border-border bg-surface p-1.5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <Menu className="size-5" />
      </button>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[60px]" : "lg:w-60",
        )}
        aria-label="Main navigation"
      >
        <div className={cn("flex h-14 items-center gap-2.5 border-b border-border px-4", collapsed && "lg:justify-center lg:px-0")}>
          <BrandMark />
          <div className={cn("min-w-0", collapsed && "lg:hidden")}>
            <p className="text-sm font-semibold leading-4 text-ink">Aegis</p>
            <p className="truncate text-[10.5px] text-muted">Validation &amp; Compliance Intelligence</p>
          </div>
          <button className="ml-auto rounded p-1 text-muted lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {main.map(link)}
          {admin.length > 0 && (
            <>
              <p className={cn("px-2.5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-wider text-faint", collapsed && "lg:hidden")}>Administration</p>
              {collapsed && <div className="mx-2 my-3 hidden h-px bg-border lg:block" />}
              {admin.map(link)}
            </>
          )}
        </nav>
        <div className="hidden border-t border-border p-2 lg:block">
          <button onClick={toggle} className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-xs text-muted hover:bg-subtle hover:text-ink", collapsed && "justify-center px-0")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
          </button>
        </div>
      </aside>
    </>
  );
}
