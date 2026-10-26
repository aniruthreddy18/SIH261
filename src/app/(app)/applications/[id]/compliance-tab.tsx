import type { Actor } from "@/lib/auth/permissions";
import { getComplianceMatrix } from "@/server/compliance";
import { ComplianceMatrix } from "@/components/app/compliance-matrix";

export async function ComplianceTab({ applicationId, actor }: { applicationId: string; actor: Actor }) {
  const matrix = await getComplianceMatrix(actor, applicationId);
  return <ComplianceMatrix matrix={matrix} actor={actor} />;
}
