import type { getApplicationDetail } from "@/server/applications";
import type { verificationCoverage } from "@/server/verification";

export type Detail = Awaited<ReturnType<typeof getApplicationDetail>>;
export type Coverage = Awaited<ReturnType<typeof verificationCoverage>>;
