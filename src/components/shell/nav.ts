import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the horizontal navbar. */
  short?: string;
  icon: string;
  /** Shown when the user has any of these permissions. */
  permission?: Permission | Permission[];
  hideForApplicant?: boolean;
  adminSection?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Command Centre", icon: "gauge" },
  { href: "/applications", label: "Applications", icon: "folder" },
  { href: "/pendency", label: "Pendency Monitor", short: "Pendency", icon: "clock", permission: "workflow.monitor" },
  { href: "/evc", label: "EVC Scheduling", short: "EVC", icon: "calendar", permission: ["evc.schedule", "evc.report"] },
  { href: "/compliance-monitor", label: "Compliance Monitor", short: "Compliance", icon: "shield", permission: ["compliance.verify", "compliance.manage"] },
  { href: "/alerts", label: "Alerts & Escalations", short: "Alerts", icon: "bell", permission: "alerts.view" },
  { href: "/review", label: "Review Queue", short: "Review", icon: "inbox", permission: "finding.review" },
  { href: "/reports", label: "Reports", icon: "chart", permission: "reports.view" },
  { href: "/audit", label: "Audit Trail", short: "Audit", icon: "history", permission: "audit.view" },
  { href: "/documents", label: "Document Intelligence", short: "Documents", icon: "scan" },
  { href: "/rules", label: "Validation Rules", short: "Rules", icon: "list" },
  { href: "/verification", label: "Issuer Verification", short: "Verification", icon: "badge", permission: "verification.run" },
  { href: "/admin/workflow", label: "Workflow & Timelines", short: "Workflow", icon: "route", permission: "workflow.configure", adminSection: true },
  { href: "/admin/users", label: "User Management", short: "Users", icon: "users", permission: "users.manage", adminSection: true },
  { href: "/admin/settings", label: "System Settings", short: "Settings", icon: "settings", permission: "settings.manage", adminSection: true },
];

export function navAllowed(item: NavItem, has: (p: Permission) => boolean): boolean {
  if (!item.permission) return true;
  return (Array.isArray(item.permission) ? item.permission : [item.permission]).some(has);
}
