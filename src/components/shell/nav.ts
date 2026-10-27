import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the horizontal navbar. */
  short?: string;
  icon: string;
  permission?: Permission;
  hideForApplicant?: boolean;
  adminSection?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Command Centre", icon: "gauge" },
  { href: "/applications", label: "Applications", icon: "folder" },
  { href: "/documents", label: "Document Intelligence", short: "Documents", icon: "scan" },
  { href: "/rules", label: "Validation Rules", short: "Rules", icon: "list" },
  { href: "/verification", label: "Issuer Verification", short: "Verification", icon: "badge", permission: "application.viewAll" },
  { href: "/review", label: "Review Queue", icon: "inbox", permission: "finding.review" },
  { href: "/compliance", label: "Compliance", icon: "shield" },
  { href: "/audit", label: "Reports & Audit", icon: "history", permission: "audit.view" },
  { href: "/admin/users", label: "User Management", short: "Users", icon: "users", permission: "users.manage", adminSection: true },
  { href: "/admin/settings", label: "System Settings", short: "Settings", icon: "settings", permission: "settings.manage", adminSection: true },
];
