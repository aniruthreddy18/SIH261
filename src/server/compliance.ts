// Compliance matrix: configurable requirements evaluated against submitted evidence, linked
// rule results from the latest run, and issuer verification. Documentary evidence only — this
// never asserts physical infrastructure compliance.
import { assertPermission, DomainError, type Actor } from "@/lib/auth/permissions";
import type { RuleResultStatus } from "@/lib/domain";
import { prisma, json } from "./db";
import { recordAudit } from "./audit";
import { getAccessibleApplication } from "./applications";

export type ComplianceStatus = "SATISFIED" | "DEFICIENT" | "REVIEW_REQUIRED" | "NOT_ASSESSED" | "NOT_APPLICABLE";

export async function listRequirements() {
  return prisma.complianceRequirement.findMany({ where: { active: true }, orderBy: { code: "asc" } });
}

export async function getComplianceMatrix(actor: Actor, applicationId: string) {
  const app = await getAccessibleApplication(actor, applicationId);
  const [reqs, checklist, docs, lastRun, verifs, notes] = await Promise.all([
    listRequirements(),
    prisma.requiredDocument.findMany({ where: { templateId: app.templateId } }),
    prisma.document.findMany({ where: { applicationId, state: "ACTIVE" }, include: { category: true, versions: { where: { isCurrent: true }, select: { id: true, originalName: true, mimeType: true, versionNo: true, metadataJson: true, processingStatus: true } } } }),
    prisma.validationRun.findFirst({ where: { applicationId, status: "COMPLETED" }, orderBy: { runNumber: "desc" }, include: { results: true } }),
    prisma.issuerVerification.findMany({ where: { applicationId }, orderBy: { requestedAt: "desc" } }),
    actor.role === "APPLICANT" ? Promise.resolve([]) : prisma.complianceNote.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
  ]);
  const rows = reqs
    .filter((r) => {
      const applies = json<string[]>(r.appliesToJson, []);
      return applies.length === 0 || applies.includes(app.template.code);
    })
    .map((r) => {
      const cats = json<string[]>(r.evidenceCategoriesJson, []);
      const ruleCodes = json<string[]>(r.linkedRuleCodesJson, []);
      const evidence = docs.filter((d) => cats.includes(d.categoryCode) && d.versions[0]);
      const mandatory = checklist.some((c) => cats.includes(c.categoryCode) && c.mandatory);
      const evidenceDocIds = new Set(evidence.map((d) => d.id));
      const results = (lastRun?.results ?? []).filter((x) => ruleCodes.includes(x.ruleCode) && (!x.documentId || evidenceDocIds.has(x.documentId) || (x.categoryCode && cats.includes(x.categoryCode))));
      const latestVerif = evidence.map((d) => verifs.find((v) => v.documentVersionId === d.versions[0].id)).filter(Boolean);
      const statuses = results.map((x) => x.status as RuleResultStatus);
      let status: ComplianceStatus;
      const deficiencies: string[] = [];
      if (evidence.length === 0 && !mandatory) status = "NOT_APPLICABLE";
      else if (!lastRun) status = "NOT_ASSESSED";
      else if (evidence.length === 0) {
        status = "DEFICIENT";
        deficiencies.push("No evidence submitted for a mandatory requirement.");
      } else if (statuses.includes("FAIL")) status = "DEFICIENT";
      else if (statuses.some((s) => s === "REVIEW_REQUIRED" || s === "PROCESSING_FAILED" || s === "PENDING") || latestVerif.some((v) => v!.status !== "VERIFIED")) status = "REVIEW_REQUIRED";
      else status = "SATISFIED";
      for (const x of results) if (x.status === "FAIL" || x.status === "REVIEW_REQUIRED") deficiencies.push(x.explanation);
      for (const v of latestVerif) if (v!.status !== "VERIFIED") deficiencies.push(`Issuer verification: ${v!.status.replace(/_/g, " ").toLowerCase()} (${v!.sourceName}).`);
      const imageEvidence = evidence
        .filter((d) => d.versions[0].mimeType.startsWith("image/"))
        .map((d) => {
          const m = json<{ width?: number; height?: number }>(d.versions[0].metadataJson, {});
          return `${d.versions[0].originalName}: image ${m.width ?? "?"}×${m.height ?? "?"} px. Preliminary evidence analysis only — physical compliance requires inspection.`;
        });
      return {
        requirement: r,
        evidence: evidence.map((d) => ({ id: d.id, category: d.category.name, file: d.versions[0].originalName, version: d.versions[0].versionNo })),
        linkedResults: results.map((x) => ({ ruleCode: x.ruleCode, ruleVersionNo: x.ruleVersionNo, status: x.status, subject: x.subjectLabel })),
        status,
        deficiencies: [...new Set(deficiencies)],
        imageEvidence,
        notes: notes.filter((n) => n.requirementCode === r.code),
      };
    });
  return { app, rows, lastRun: lastRun ? { runNumber: lastRun.runNumber, completedAt: lastRun.completedAt } : null };
}

export async function addComplianceNote(actor: Actor, applicationId: string, requirementCode: string, note: string) {
  assertPermission(actor, "compliance.note");
  const text = note.trim();
  if (text.length < 5 || text.length > 2000) throw new DomainError("Note must be 5–2000 characters.");
  await getAccessibleApplication(actor, applicationId);
  const req = await prisma.complianceRequirement.findUnique({ where: { code: requirementCode } });
  if (!req) throw new DomainError("Unknown requirement.");
  await prisma.$transaction(async (tx) => {
    await tx.complianceNote.create({ data: { applicationId, requirementCode, note: text, authorId: actor.userId, authorName: actor.name } });
    await recordAudit({ actor, eventType: "COMPLIANCE_NOTE_ADDED", action: `Compliance note on ${requirementCode}`, applicationId, reason: text }, tx);
  });
}
