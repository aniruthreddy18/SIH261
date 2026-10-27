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
    <nav className="flex gap-1 overflow-x-auto" aria-label="Institution portal">
      {LINKS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(href) ? "page" : undefined}
          className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium", active(href) ? "border-white text-white" : "border-transparent text-white/75 hover:text-white")}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
