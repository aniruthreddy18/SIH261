import { z } from "zod";
import { assertPermission, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { RULE_CATEGORIES, SEVERITIES, type RuleCategory, type Severity } from "@/lib/domain";
import { CHECK_TYPES, parseDefinition } from "@/lib/validation/definitions";
import type { RuleSpec } from "@/lib/validation/types";
import { prisma, json } from "./db";
import { recordAudit } from "./audit";

/** Active rules with the latest version already in effect at `asOf`. */
export async function getActiveRuleSpecs(asOf = new Date()): Promise<RuleSpec[]> {
  const rules = await prisma.validationRule.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    include: { versions: { where: { effectiveFrom: { lte: asOf } }, orderBy: { version: "desc" }, take: 1 } },
  });
  return rules
    .filter((r) => r.versions.length > 0)
    .map((r) => {
      const v = r.versions[0];
      return {
        ruleVersionId: v.id,
        code: r.code,
        name: r.name,
        version: v.version,
        category: r.category as RuleCategory,
        checkType: v.checkType,
        definition: json(v.definitionJson, {}),
        severity: v.severity as Severity,
        remediation: v.remediation,
        appliesTo: json<string[]>(v.appliesToJson, []),
      };
    });
}

export async function listRules() {
  return prisma.validationRule.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }], include: { versions: { orderBy: { version: "desc" } } } });
}

export async function getRule(ruleId: string) {
  const rule = await prisma.validationRule.findUnique({ where: { id: ruleId }, include: { versions: { orderBy: { version: "desc" } } } });
  if (!rule) throw new NotFoundError();
  const usage = await prisma.ruleResult.groupBy({ by: ["ruleVersionNo", "status"], where: { ruleCode: rule.code }, _count: true });
  return { rule, usage };
}

export const RuleVersionSchema = z.object({
  ruleId: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, "Code: 3–30 characters, letters, digits and hyphens"),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(1000),
  category: z.enum(RULE_CATEGORIES),
  checkType: z.enum(CHECK_TYPES as [string, ...string[]]),
  definition: z.record(z.string(), z.unknown()),
  severity: z.enum(SEVERITIES),
  appliesTo: z.array(z.string()).default([]),
  effectiveFrom: z.coerce.date(),
  remediation: z.string().trim().min(5).max(1000),
  sourceReference: z.string().trim().max(300).optional().transform((v) => v || null),
  isSample: z.boolean().default(true),
  changeNote: z.string().trim().min(5, "Describe the change (min 5 characters)").max(500),
});
export type RuleVersionInput = z.input<typeof RuleVersionSchema>;

/** Create a rule, or a new immutable version of an existing rule. Prior versions are never edited. */
export async function saveRuleVersion(actor: Actor, input: RuleVersionInput) {
  assertPermission(actor, "rules.manage");
  const data = RuleVersionSchema.parse(input);
  const parsed = parseDefinition(data.checkType, data.definition);
  if (!parsed.ok) throw new DomainError(parsed.error);
  return prisma.$transaction(async (tx) => {
    let rule = data.ruleId ? await tx.validationRule.findUnique({ where: { id: data.ruleId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } }) : null;
    if (data.ruleId && !rule) throw new NotFoundError();
    if (!rule) {
      if (await tx.validationRule.findUnique({ where: { code: data.code } })) throw new DomainError(`A rule with code ${data.code} already exists.`);
      rule = { ...(await tx.validationRule.create({ data: { code: data.code, name: data.name, description: data.description, category: data.category, isSample: data.isSample, currentVersion: 0 } })), versions: [] };
    }
    const prev = rule.versions[0] ?? null;
    const version = (prev?.version ?? 0) + 1;
    const v = await tx.ruleVersion.create({
      data: {
        ruleId: rule.id,
        version,
        checkType: data.checkType,
        definitionJson: JSON.stringify(parsed.value),
        severity: data.severity,
        appliesToJson: JSON.stringify(data.appliesTo),
        effectiveFrom: data.effectiveFrom,
        remediation: data.remediation,
        sourceReference: data.sourceReference,
        changeNote: data.changeNote,
        createdById: actor.userId,
      },
    });
    await tx.validationRule.update({ where: { id: rule.id }, data: { name: data.name, description: data.description, category: data.category, isSample: data.isSample, currentVersion: version } });
    await recordAudit({
      actor,
      eventType: "RULE_VERSION_CREATED",
      action: `${rule.code} v${version} saved`,
      ruleVersion: `${rule.code}@v${version}`,
      before: prev ? { version: prev.version, checkType: prev.checkType, definition: json(prev.definitionJson, {}), severity: prev.severity } : undefined,
      after: { version, checkType: data.checkType, definition: parsed.value, severity: data.severity, effectiveFrom: data.effectiveFrom },
      reason: data.changeNote,
    }, tx);
    return { ruleId: rule.id, versionId: v.id, version };
  });
}

export async function setRuleActive(actor: Actor, ruleId: string, active: boolean, reason: string) {
  assertPermission(actor, "rules.manage");
  if (reason.trim().length < 5) throw new DomainError("A reason of at least 5 characters is required.");
  const rule = await prisma.validationRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new NotFoundError();
  await prisma.$transaction(async (tx) => {
    await tx.validationRule.update({ where: { id: ruleId }, data: { active } });
    await recordAudit({ actor, eventType: "RULE_STATUS_CHANGED", action: `${rule.code} ${active ? "activated" : "deactivated"}`, before: { active: rule.active }, after: { active }, reason: reason.trim(), ruleVersion: `${rule.code}@v${rule.currentVersion}` }, tx);
  });
}
