// Workflow & timelines configuration (administrator). Stage timelines and the application-type
// → pathway mapping are sample values; changes apply to stage visits opened afterwards and are
// audited with before/after values.
import { z } from "zod";
import { assertPermission, DomainError, NotFoundError, type Actor } from "@/lib/auth/permissions";
import { prisma, json } from "./db";
import { recordAudit } from "./audit";

export async function getWorkflowConfig() {
  const [stages, pathways, routes] = await Promise.all([
    prisma.stageConfig.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pathwayConfig.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.applicationTypeRoute.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return { stages, pathways: pathways.map((p) => ({ ...p, stages: json<string[]>(p.stagesJson, []) })), routes };
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const StagePatch = z.object({
  slaDays: int(1, 365),
  newInstitutionSlaDays: z.union([z.literal(""), int(1, 365)]).optional(),
  reminderDaysBefore: int(0, 60),
  escalateL2AfterDays: int(0, 180),
  escalateL3AfterDays: int(1, 365),
});

export async function updateStageConfig(actor: Actor, code: string, input: z.input<typeof StagePatch>) {
  assertPermission(actor, "workflow.configure");
  const data = StagePatch.parse(input);
  if (data.escalateL3AfterDays <= data.escalateL2AfterDays) throw new DomainError("Level-3 escalation must come after level-2 escalation.");
  const before = await prisma.stageConfig.findUnique({ where: { code } });
  if (!before) throw new NotFoundError();
  const after = { slaDays: data.slaDays, newInstitutionSlaDays: data.newInstitutionSlaDays === "" || data.newInstitutionSlaDays === undefined ? null : data.newInstitutionSlaDays, reminderDaysBefore: data.reminderDaysBefore, escalateL2AfterDays: data.escalateL2AfterDays, escalateL3AfterDays: data.escalateL3AfterDays };
  await prisma.$transaction(async (tx) => {
    await tx.stageConfig.update({ where: { code }, data: after });
    await recordAudit({ actor, eventType: "WORKFLOW_CONFIG_UPDATED", action: `Stage timeline updated: ${before.name}`, before: { slaDays: before.slaDays, newInstitutionSlaDays: before.newInstitutionSlaDays, reminderDaysBefore: before.reminderDaysBefore, escalateL2AfterDays: before.escalateL2AfterDays, escalateL3AfterDays: before.escalateL3AfterDays }, after }, tx);
  });
}

export async function updateTypeRoute(actor: Actor, applicationType: string, pathwayCode: string) {
  assertPermission(actor, "workflow.configure");
  const [route, pathway] = await Promise.all([prisma.applicationTypeRoute.findUnique({ where: { applicationType } }), prisma.pathwayConfig.findUnique({ where: { code: pathwayCode } })]);
  if (!route || !pathway) throw new NotFoundError();
  if (route.pathwayCode === pathwayCode) return;
  await prisma.$transaction(async (tx) => {
    await tx.applicationTypeRoute.update({ where: { applicationType }, data: { pathwayCode } });
    await recordAudit({ actor, eventType: "WORKFLOW_CONFIG_UPDATED", action: `Routing changed: ${route.name} → ${pathway.name}`, before: { pathway: route.pathwayCode }, after: { pathway: pathwayCode }, reason: "Applies to applications submitted from now on; applications already in process keep their pathway." }, tx);
  });
}
