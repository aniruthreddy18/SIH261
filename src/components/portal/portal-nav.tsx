"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus2, FolderOpen, HelpCircle, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/portal", label: "Home", Icon: Home },
  { href: "/portal/applications", label: "My applications", Icon: FolderOpen },
  { href: "/portal/applications/new", label: "New application", Icon: FilePlus2 },
  { href: "/portal/help", label: "Help", Icon: HelpCircle },
];

export function PortalNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/portal" ? pathname === "/portal" : href === "/portal/applications" ? pathname.startsWith("/portal/applications") && pathname !== "/portal/applications/new" : pathname.startsWith(href);
  return (
    <nav className="flex items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none]" aria-label="Institution portal">
      {LINKS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors", active(href) ? "bg-accent text-white shadow-sm" : "text-ink-2 hover:bg-accent-soft hover:text-accent")}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
