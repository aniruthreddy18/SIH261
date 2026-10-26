// Issuer verification adapters (Layer 3).
//
//  * synthetic-demo-issuer      — SIMULATED. Answers from a clearly fictional record set.
//  * demo-institution-registry  — SIMULATED. Compares previous-approval letters with the demo
//                                  institutional records held in Aegis.
//  * official-provider          — REAL/SANDBOX. A configurable HTTP adapter for a future
//                                  authorised API. Disabled unless credentials are configured.
//
// No adapter ever reports a simulated answer as coming from AICTE, an issuing authority or a
// government portal.
import { z } from "zod";
import { compareValues, normalizeProgramme } from "@/lib/extraction/normalize";
import type { SourceType } from "@/lib/domain";
import type { FieldComparison, IssuerAdapter, VerificationRequest, VerificationResponse } from "./types";

export interface SyntheticRecord {
  referenceNumber: string;
  categoryCode: string;
  issuerName: string;
  institutionName: string;
  institutionCode: string;
  issueDate: string | null;
  expiryDate: string | null;
  recordStatus: string;
  behaviour: string;
  extra: Record<string, string>;
}

function compare(field: string, label: string, submitted: string | null, returned: string | null, kind: "name" | "identifier" | "text" | "programme"): FieldComparison {
  if (returned === null || returned === undefined) return { field, label, submitted, returned: null, match: null, note: "Not held by source" };
  if (submitted === null) return { field, label, submitted: null, returned, match: null, note: "Not extracted from submitted document" };
  const c = compareValues(kind, submitted, returned);
  return { field, label, submitted, returned, match: c.outcome === "EXACT" || c.outcome === "EQUIVALENT", note: c.outcome === "SIMILAR" ? `Similar (${Math.round(c.similarity * 100)}%)` : undefined };
}

function decide(comparisons: FieldComparison[], expiry: string | null, asOf: string): VerificationResponse["status"] {
  if (comparisons.some((c) => c.match === false)) return "MISMATCH_DETECTED";
  if (expiry && expiry < asOf) return "EXPIRED";
  return "VERIFIED";
}

export function createSyntheticIssuerAdapter(opts: {
  lookup: (referenceNumber: string) => Promise<SyntheticRecord | null>;
  categories: string[];
  simulateOutage?: boolean;
  latencyMs?: number;
}): IssuerAdapter {
  return {
    id: "synthetic-demo-issuer",
    name: "Synthetic Demo Issuer Registry",
    sourceType: "SIMULATED",
    description: "Simulated issuing-authority registry with fictional records, used to demonstrate verification outcomes. Not connected to any real authority.",
    supports: (c) => opts.categories.includes(c),
    async verify(req, signal) {
      if (opts.latencyMs) await sleep(opts.latencyMs, signal);
      const now = new Date().toISOString();
      if (opts.simulateOutage) {
        return { status: "SOURCE_UNAVAILABLE", sourceTimestamp: null, returned: null, comparisons: [], error: "Simulated outage enabled in System Settings.", retryable: true };
      }
      if (!req.referenceNumber) {
        return { status: "MANUAL_REVIEW_REQUIRED", sourceTimestamp: now, returned: null, comparisons: [], limitation: "No reference number could be extracted from the document, so the source could not be queried.", retryable: false };
      }
      const rec = await opts.lookup(req.referenceNumber);
      if (!rec || rec.categoryCode !== req.categoryCode) {
        return { status: "MANUAL_REVIEW_REQUIRED", sourceTimestamp: now, returned: null, comparisons: [], limitation: `No matching record for reference "${req.referenceNumber}" at the simulated source. Confirm manually with the issuer.`, responseRef: `SIM-NORECORD-${req.referenceNumber}`, retryable: false };
      }
      if (rec.behaviour === "UNAVAILABLE") {
        return { status: "SOURCE_UNAVAILABLE", sourceTimestamp: null, returned: null, comparisons: [], error: "Simulated source did not respond (configured record behaviour: UNAVAILABLE).", retryable: true };
      }
      if (rec.behaviour === "PENDING") {
        return { status: "VERIFICATION_PENDING", sourceTimestamp: now, returned: null, comparisons: [], limitation: "Simulated source accepted the request but has not yet returned a result.", responseRef: `SIM-PENDING-${rec.referenceNumber}`, retryable: false };
      }
      const returned = { referenceNumber: rec.referenceNumber, issuerName: rec.issuerName, institutionName: rec.institutionName, institutionCode: rec.institutionCode, issueDate: rec.issueDate, expiryDate: rec.expiryDate, recordStatus: rec.recordStatus, ...rec.extra };
      const comparisons: FieldComparison[] = [
        compare("institutionName", "Institution name", req.submitted.institutionName, rec.institutionName, "name"),
        compare("institutionCode", "Institution identifier", req.submitted.institutionCode, rec.institutionCode, "identifier"),
        compare("issueDate", "Issue date", req.submitted.issueDate, rec.issueDate, "text"),
        compare("expiryDate", "Expiry date", req.submitted.expiryDate, rec.expiryDate, "text"),
      ];
      if (rec.recordStatus === "REVOKED") {
        comparisons.push({ field: "recordStatus", label: "Record status", submitted: "ACTIVE (implied)", returned: "REVOKED", match: false });
      }
      return { status: decide(comparisons, rec.expiryDate, req.asOf), sourceTimestamp: now, returned, comparisons, responseRef: `SIM-${rec.referenceNumber}-${now.slice(0, 10)}`, retryable: false };
    },
  };
}

export interface RegistryInstitution {
  code: string;
  name: string;
  programmes: { name: string; approvedIntake: number; lastApprovedYear: string }[];
}

export function createInstitutionRegistryAdapter(opts: { lookup: (institutionCode: string) => Promise<RegistryInstitution | null>; categories: string[] }): IssuerAdapter {
  return {
    id: "demo-institution-registry",
    name: "Demo Institutional Records Registry",
    sourceType: "SIMULATED",
    description: "Compares previous-approval evidence with the synthetic institutional records seeded in Aegis. Not an AICTE system.",
    supports: (c) => opts.categories.includes(c),
    async verify(req) {
      const now = new Date().toISOString();
      if (!req.submitted.institutionCode) {
        return { status: "MANUAL_REVIEW_REQUIRED", sourceTimestamp: now, returned: null, comparisons: [], limitation: "No institution identifier was extracted, so the registry could not be queried.", retryable: false };
      }
      const inst = await opts.lookup(req.submitted.institutionCode);
      if (!inst) {
        return { status: "MANUAL_REVIEW_REQUIRED", sourceTimestamp: now, returned: null, comparisons: [], limitation: `No institutional record for identifier "${req.submitted.institutionCode}".`, retryable: false };
      }
      const prog = req.submitted.programmeName ? inst.programmes.find((p) => normalizeProgramme(p.name) === normalizeProgramme(req.submitted.programmeName!) || compareValues("programme", p.name, req.submitted.programmeName!).outcome === "SIMILAR") : undefined;
      const comparisons: FieldComparison[] = [
        compare("institutionName", "Institution name", req.submitted.institutionName, inst.name, "name"),
        compare("institutionCode", "Institution identifier", req.submitted.institutionCode, inst.code, "identifier"),
        compare("programmeName", "Programme", req.submitted.programmeName, prog?.name ?? null, "programme"),
        compare("approvedIntake", "Approved intake", req.submitted.approvedIntake, prog ? String(prog.approvedIntake) : null, "text"),
      ];
      if (req.submitted.programmeName && !prog) {
        comparisons[2] = { field: "programmeName", label: "Programme", submitted: req.submitted.programmeName, returned: null, match: false, note: "Programme not present in institutional record" };
      }
      const returned = { institutionName: inst.name, institutionCode: inst.code, programmeName: prog?.name ?? null, approvedIntake: prog ? String(prog.approvedIntake) : null, lastApprovedYear: prog?.lastApprovedYear ?? null };
      return { status: decide(comparisons, null, req.asOf), sourceTimestamp: now, returned, comparisons, responseRef: `REG-${inst.code}-${now.slice(0, 10)}`, retryable: false };
    },
  };
}

const OfficialResponseSchema = z.object({
  status: z.enum(["FOUND", "NOT_FOUND", "PENDING"]),
  reference: z.string().optional(),
  record: z.record(z.string(), z.string().nullable()).optional(),
  timestamp: z.string().optional(),
});

/**
 * Adapter for a future authorised verification API. The request/response contract here is a
 * placeholder to be aligned with the provider's specification. Disabled unless configured.
 */
export function createOfficialProviderAdapter(cfg: { url?: string; apiKey?: string; name?: string; categories: string[]; sourceType: SourceType }): IssuerAdapter & { configured: boolean } {
  const configured = Boolean(cfg.url && cfg.apiKey && cfg.categories.length);
  return {
    id: "official-provider",
    name: cfg.name || "Official verification provider (not configured)",
    sourceType: cfg.sourceType,
    description: configured ? "Configured HTTP verification provider." : "Placeholder for an authorised issuing-authority API. No credentials are configured, so it is inactive.",
    configured,
    supports: (c) => configured && cfg.categories.includes(c),
    async verify(req, signal) {
      if (!configured) return { status: "NOT_SUPPORTED", sourceTimestamp: null, returned: null, comparisons: [], limitation: "Official provider is not configured.", retryable: false };
      let res: Response;
      try {
        res = await fetch(cfg.url!, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({ category: req.categoryCode, reference: req.referenceNumber }),
          signal,
        });
      } catch (err) {
        return { status: "SOURCE_UNAVAILABLE", sourceTimestamp: null, returned: null, comparisons: [], error: (err as Error).name === "AbortError" ? "Request timed out." : "Network error contacting provider.", retryable: true };
      }
      if (res.status === 429 || res.status >= 500) return { status: "SOURCE_UNAVAILABLE", sourceTimestamp: null, returned: null, comparisons: [], error: `Provider returned HTTP ${res.status}.`, retryable: true };
      if (!res.ok) return { status: "MANUAL_REVIEW_REQUIRED", sourceTimestamp: null, returned: null, comparisons: [], error: `Provider returned HTTP ${res.status}.`, retryable: false };
      const parsed = OfficialResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return { status: "MANUAL_REVIEW_REQUIRED", sourceTimestamp: null, returned: null, comparisons: [], error: "Provider response did not match the expected schema.", retryable: false };
      const body = parsed.data;
      const ts = body.timestamp ?? new Date().toISOString();
      if (body.status === "PENDING") return { status: "VERIFICATION_PENDING", sourceTimestamp: ts, returned: null, comparisons: [], responseRef: body.reference, retryable: false };
      if (body.status === "NOT_FOUND" || !body.record) return { status: "MANUAL_REVIEW_REQUIRED", sourceTimestamp: ts, returned: null, comparisons: [], limitation: "No matching record at provider.", responseRef: body.reference, retryable: false };
      const r = body.record;
      const comparisons = [
        compare("institutionName", "Institution name", req.submitted.institutionName, r.institutionName ?? null, "name"),
        compare("institutionCode", "Institution identifier", req.submitted.institutionCode, r.institutionCode ?? null, "identifier"),
        compare("issueDate", "Issue date", req.submitted.issueDate, r.issueDate ?? null, "text"),
        compare("expiryDate", "Expiry date", req.submitted.expiryDate, r.expiryDate ?? null, "text"),
      ];
      return { status: decide(comparisons, r.expiryDate ?? null, req.asOf), sourceTimestamp: ts, returned: r, comparisons, responseRef: body.reference, retryable: false };
    },
  };
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

/**
 * Execute a verification with a timeout per attempt and a bounded number of retries for
 * transient failures. Never retries indefinitely.
 */
export async function executeVerification(
  adapter: IssuerAdapter,
  request: VerificationRequest,
  opts: { timeoutMs: number; maxRetries: number; backoffMs?: number },
): Promise<{ response: VerificationResponse; attempts: number }> {
  let attempts = 0;
  let last: VerificationResponse | null = null;
  const maxAttempts = Math.max(1, Math.min(opts.maxRetries + 1, 5));
  while (attempts < maxAttempts) {
    attempts++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      last = await adapter.verify(request, controller.signal);
    } catch (err) {
      last = {
        status: "SOURCE_UNAVAILABLE",
        sourceTimestamp: null,
        returned: null,
        comparisons: [],
        error: (err as Error)?.name === "AbortError" ? `Request timed out after ${opts.timeoutMs} ms.` : "Unexpected adapter error.",
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
    if (!last.retryable) break;
    if (attempts < maxAttempts) await new Promise((r) => setTimeout(r, (opts.backoffMs ?? 150) * 2 ** (attempts - 1)));
  }
  return { response: last!, attempts };
}
