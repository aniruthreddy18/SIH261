import Link from "next/link";
import { Building2, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

/** Two separate sign-in pages; this switch makes it obvious which one you are on. */
export function PortalSwitch({ current }: { current: "INSTITUTION" | "OFFICIAL" }) {
  const item = (key: "INSTITUTION" | "OFFICIAL", href: string, label: string, Icon: typeof Building2, activeCls: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={cn("flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors", current === key ? `${activeCls} text-white shadow-sm` : "text-ink-2 hover:bg-subtle")}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-surface p-1" role="navigation" aria-label="Choose sign-in portal">
      {item("INSTITUTION", "/institution/login", "Institution login", Building2, "bg-green")}
      {item("OFFICIAL", "/login", "AICTE official sign-in", Landmark, "bg-navy")}
    </div>
  );
}
