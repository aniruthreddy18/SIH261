import { pageGuard } from "@/server/session";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { RuleForm } from "../rule-form";

export const metadata = { title: "New rule" };

export default async function NewRulePage() {
  const { denied } = await pageGuard("rules.manage");
  const crumbs = [{ label: "Validation Rules", href: "/rules" }, { label: "New rule" }];
  if (denied) return (<><PageHeader title="New rule" crumbs={crumbs} /><AccessDenied /></>);
  const [categories, templates] = await Promise.all([prisma.documentCategory.findMany({ orderBy: { sortOrder: "asc" } }), prisma.applicationTemplate.findMany()]);
  return (
    <>
      <PageHeader title="New validation rule" crumbs={crumbs} description="Build a rule from supported conditions. It takes effect for validation runs on or after its effective date." />
      <RuleForm
        categories={categories.map((c) => ({ code: c.code, name: c.name }))}
        templates={templates.map((t) => ({ code: t.code, name: t.name }))}
        initial={{ code: "", name: "", description: "", category: "POLICY", checkType: "FIELD_CONDITION", definition: { documentCategories: [], field: "builtUpArea", operator: "gte", value: "", missingOutcome: "REVIEW_REQUIRED" }, severity: "MEDIUM", appliesTo: [], remediation: "", sourceReference: "", isSample: true }}
      />
    </>
  );
}
