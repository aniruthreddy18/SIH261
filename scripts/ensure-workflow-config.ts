// Upgrades a database seeded before the approval-workflow release (PS 26262) without touching
// its data: adds the Regions, the sample stage timelines, pathways and type routing, assigns
// institutions to Regions by state, and creates the new demo staff accounts. Idempotent — it
// does nothing once the workflow configuration exists. Existing applications get a pathway the
// next time they are validated or forwarded.
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/lib/auth/password";
import { DEMO_PASSWORD } from "./lib/demo-data";
import { MONITORING_STAFF, regionForState, seedWorkflowConfig } from "./lib/monitoring-seed";

export async function ensureWorkflowConfig() {
  if ((await prisma.stageConfig.count()) > 0) return false;
  const regionIds = await seedWorkflowConfig();
  for (const i of await prisma.institution.findMany({ where: { regionId: null } })) {
    const regionId = regionForState(i.state, regionIds);
    if (regionId) await prisma.institution.update({ where: { id: i.id }, data: { regionId } });
  }
  for (const s of MONITORING_STAFF) {
    const region = (s as { region?: string }).region;
    const regionId = region ? regionIds.get(region) ?? null : null;
    const existing = await prisma.user.findUnique({ where: { email: s.email } });
    if (existing) {
      if (!existing.regionId && regionId && existing.role === s.role) await prisma.user.update({ where: { id: existing.id }, data: { regionId } });
      continue;
    }
    await prisma.user.create({ data: { email: s.email, name: s.name, role: s.role, designation: s.designation, regionId, passwordHash: await hashPassword(DEMO_PASSWORD) } });
  }
  return true;
}
