// Append-only audit log. This module only ever INSERTs; a database trigger additionally rejects
// UPDATE/DELETE on AuditEvent. Never pass secrets, passwords, tokens or raw document text here.
import type { Actor } from "@/lib/auth/permissions";
import { prisma, type Tx } from "./db";

export const AUDIT_EVENT_TYPES = [
  "AUTH_LOGIN",
  "AUTH_LOGIN_FAILED",
  "AUTH_LOGOUT",
  "APPLICATION_CREATED",
  "APPLICATION_STATUS_CHANGED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_REPLACED",
  "DOCUMENT_WITHDRAWN",
  "DOCUMENT_UPLOAD_REJECTED",
  "EXTRACTION_COMPLETED",
  "EXTRACTION_FAILED",
  "FIELD_CORRECTED",
  "VALIDATION_RUN_STARTED",
  "VALIDATION_RUN_COMPLETED",
  "VALIDATION_RUN_FAILED",
  "RULE_FAILED",
  "ANOMALY_FLAGGED",
  "ISSUER_VERIFICATION_ATTEMPTED",
  "ISSUER_SOURCE_UNAVAILABLE",
  "MANUAL_VERIFICATION_RECORDED",
  "FINDING_NOTE_ADDED",
  "FINDING_INFO_REQUESTED",
  "FINDING_ESCALATED",
  "FINDING_RESOLVED",
  "FINDING_DISMISSED",
  "RECTIFICATION_REQUESTED",
  "RECTIFICATION_SUBMITTED",
  "FORWARDED_FOR_AUTHORIZED_REVIEW",
  "HUMAN_DECISION_RECORDED",
  "COMPLIANCE_NOTE_ADDED",
  "RULE_VERSION_CREATED",
  "RULE_STATUS_CHANGED",
  "USER_CREATED",
  "USER_UPDATED",
  "SETTINGS_UPDATED",
  "ISSUER_SOURCE_UPDATED",
  "ALERT_SWEEP_RUN",
  "REPORT_GENERATED",
  "AUDIT_EXPORTED",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditInput {
  actor: Actor | { label: string; role?: string | null } | null;
  eventType: AuditEventType;
  action: string;
  applicationId?: string | null;
  documentId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  validationRunId?: string | null;
  ruleVersion?: string | null;
  verificationRef?: string | null;
  correlationId?: string | null;
}

export async function recordAudit(input: AuditInput, tx: Tx = prisma): Promise<void> {
  const a = input.actor;
  const isUser = a !== null && "userId" in a;
  await tx.auditEvent.create({
    data: {
      actorId: isUser ? a.userId : null,
      actorLabel: isUser ? `${a.name} <${a.email}>` : a?.label ?? "system:pravah",
      actorRole: isUser ? a.role : a?.role ?? "SYSTEM",
      applicationId: input.applicationId ?? null,
      documentId: input.documentId ?? null,
      eventType: input.eventType,
      action: input.action,
      beforeJson: input.before === undefined ? null : JSON.stringify(input.before),
      afterJson: input.after === undefined ? null : JSON.stringify(input.after),
      reason: input.reason ?? null,
      validationRunId: input.validationRunId ?? null,
      ruleVersion: input.ruleVersion ?? null,
      verificationRef: input.verificationRef ?? null,
      correlationId: input.correlationId ?? null,
    },
  });
}

export const SYSTEM = {
  validation: { label: "system:validation-engine", role: "SYSTEM" },
  extraction: { label: "system:extraction-pipeline", role: "SYSTEM" },
  verification: { label: "system:issuer-verification", role: "SYSTEM" },
  anomaly: { label: "system:anomaly-detector", role: "SYSTEM" },
  alerts: { label: "system:alerting", role: "SYSTEM" },
};
