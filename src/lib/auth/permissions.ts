// Role-based access control. Pure functions so they can be unit-tested and reused by every
// server-side handler. The UI may consult these to hide controls, but enforcement always
// happens on the server (see src/server/*).
import type { ApplicationStatus, Role } from "@/lib/domain";

export const PERMISSIONS = [
  "application.create",
  "application.viewAll",
  "document.upload",
  "document.correctField",
  "document.reprocess",
  "validation.run",
  "verification.run",
  "verification.manual",
  "finding.review",
  "application.requestRectification",
  "application.submitRectification",
  "application.forward",
  "application.decide",
  "compliance.note",
  "audit.view",
  "audit.export",
  "rules.manage",
  "users.manage",
  "settings.manage",
  "issuers.manage",
  // Approval workflow and monitoring (PS 26262)
  "workflow.monitor",
  "workflow.revert",
  "workflow.configure",
  "evc.schedule",
  "evc.report",
  "committee.record",
  "compliance.manage",
  "compliance.verify",
  "compliance.submit",
  "alerts.view",
  "alerts.acknowledge",
  "alerts.run",
  "reports.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  APPLICANT: [
    "application.create",
    "document.upload",
    "document.reprocess",
    "validation.run",
    "application.submitRectification",
    "compliance.submit",
  ],
  SCRUTINY_OFFICER: [
    "application.create",
    "application.viewAll",
    "document.upload",
    "document.correctField",
    "document.reprocess",
    "validation.run",
    "verification.run",
    "verification.manual",
    "finding.review",
    "application.requestRectification",
    "application.forward",
    "compliance.note",
    "audit.view",
    "audit.export",
    "workflow.monitor",
    "evc.schedule",
    "compliance.verify",
    "alerts.view",
    "alerts.acknowledge",
    "reports.view",
  ],
  BUREAU_OFFICER: [
    "application.viewAll",
    "finding.review",
    "application.requestRectification",
    "compliance.note",
    "audit.view",
    "audit.export",
    "workflow.monitor",
    "workflow.revert",
    "evc.schedule",
    "compliance.manage",
    "compliance.verify",
    "alerts.view",
    "alerts.acknowledge",
    "alerts.run",
    "reports.view",
  ],
  COMMITTEE_MEMBER: [
    "application.viewAll",
    "evc.report",
    "committee.record",
    "alerts.view",
  ],
  SENIOR_OFFICIAL: [
    "application.viewAll",
    "finding.review",
    "application.decide",
    "application.requestRectification",
    "compliance.note",
    "audit.view",
    "audit.export",
    "workflow.monitor",
    "workflow.revert",
    "compliance.manage",
    "alerts.view",
    "alerts.acknowledge",
    "reports.view",
  ],
  ADMIN: [
    "application.viewAll",
    "audit.view",
    "audit.export",
    "rules.manage",
    "users.manage",
    "settings.manage",
    "issuers.manage",
    "workflow.monitor",
    "workflow.configure",
    "alerts.view",
    "alerts.run",
    "reports.view",
  ],
};

export interface Actor {
  userId: string;
  name: string;
  email: string;
  role: Role;
  institutionId: string | null;
  /** Regional officers are limited to one Region; null/undefined means all Regions. */
  regionId?: string | null;
}

/** A system actor is used by background services (seed, validation engine). */
export const SYSTEM_LABEL = "system:pravah";

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Whether the actor may see an application belonging to `institutionId`. */
export function canAccessInstitution(actor: Actor, institutionId: string, institutionRegionId: string | null): boolean {
  if (hasPermission(actor.role, "application.viewAll")) {
    // A Regional officer sees only the institutions of their Region.
    if (actor.role === "SCRUTINY_OFFICER" && actor.regionId) return institutionRegionId === actor.regionId;
    return true;
  }
  return actor.role === "APPLICANT" && actor.institutionId !== null && actor.institutionId === institutionId;
}

/** Statuses in which the institution may change its evidence. */
export const APPLICANT_EDITABLE_STATUSES: ApplicationStatus[] = [
  "DRAFT",
  "AUTO_FAILED",
  "REVIEW_REQUIRED",
  "AUTO_PASSED",
  "PROCESSING_FAILED",
  "RECTIFICATION_REQUIRED",
];

export class AuthorizationError extends Error {
  constructor(message = "You are not authorised to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertPermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor.role, permission)) throw new AuthorizationError();
}

export function assertInstitutionAccess(actor: Actor, institutionId: string, institutionRegionId: string | null): void {
  if (!canAccessInstitution(actor, institutionId, institutionRegionId)) {
    // Do not reveal whether the record exists.
    throw new NotFoundError();
  }
}

export class NotFoundError extends Error {
  constructor(message = "The requested record was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Business-rule violation with a message that is safe to show to the user. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
