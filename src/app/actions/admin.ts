"use server";
import { runAction } from "@/server/actions-util";
import { createUser, setIssuerSourceEnabled, sweepAlerts, updateSettings, updateUser } from "@/server/admin";
import { saveRuleVersion, setRuleActive, type RuleVersionInput } from "@/server/rules";

export async function saveRuleAction(input: RuleVersionInput) {
  return runAction((a) => saveRuleVersion(a, input), { success: (r) => `Saved version ${r.version}`, revalidate: ["/rules"] });
}
export async function setRuleActiveAction(ruleId: string, active: boolean, v: Record<string, string>) {
  return runAction((a) => setRuleActive(a, ruleId, active, v.reason ?? ""), { success: active ? "Rule activated" : "Rule deactivated", revalidate: ["/rules"] });
}
export async function createUserAction(input: { email: string; name: string; designation?: string; role: string; institutionId?: string; password: string }) {
  return runAction((a) => createUser(a, input as Parameters<typeof createUser>[1]), { success: "User created", revalidate: ["/admin/users"] });
}
export async function updateUserAction(userId: string, patch: { role?: string; active?: boolean }) {
  return runAction((a) => updateUser(a, userId, patch), { success: "User updated", revalidate: ["/admin/users"] });
}
export async function updateSettingsAction(values: Record<string, string>) {
  return runAction((a) => updateSettings(a, values), { success: (c) => (Object.keys(c).length ? `Updated ${Object.keys(c).length} setting(s)` : "No changes"), revalidate: ["/admin/settings"] });
}
export async function setIssuerSourceAction(sourceId: string, enabled: boolean) {
  return runAction((a) => setIssuerSourceEnabled(a, sourceId, enabled), { success: enabled ? "Source enabled" : "Source disabled", revalidate: ["/verification", "/admin/settings"] });
}
export async function sweepAlertsAction() {
  return runAction((a) => sweepAlerts(a), { success: (r) => `Alert sweep complete: ${r.aged} ageing finding(s), ${r.sent} new notification(s)`, revalidate: ["/admin/settings"] });
}
