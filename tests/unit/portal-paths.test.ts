import { describe, expect, it } from "vitest";
import { institutionLink, portalPathFor } from "@/lib/portal-paths";
import { APPLICANT_GUIDANCE } from "@/lib/applicant-guidance";
import { APPLICATION_STATUSES } from "@/lib/domain";

describe("institution portal routing", () => {
  it("maps official-area paths to their portal equivalents", () => {
    expect(portalPathFor("/applications/abc")).toBe("/portal/applications/abc");
    expect(portalPathFor("/applications/abc/anything")).toBe("/portal/applications/abc");
    expect(portalPathFor("/applications/new")).toBe("/portal/applications/new");
    expect(portalPathFor("/applications")).toBe("/portal/applications");
    expect(portalPathFor("/documents/d1")).toBe("/portal/documents/d1");
    expect(portalPathFor("/admin/users")).toBe("/portal");
    expect(portalPathFor("/")).toBe("/portal");
  });
  it("rewrites notification links for institutions, dropping official-only tabs", () => {
    expect(institutionLink("/applications/abc?tab=findings")).toBe("/portal/applications/abc");
    expect(institutionLink("/portal/applications/abc")).toBe("/portal/applications/abc");
    expect(institutionLink(undefined)).toBeUndefined();
  });
  it("has plain-language guidance and an increasing step for every status", () => {
    for (const s of APPLICATION_STATUSES) expect(APPLICANT_GUIDANCE[s].text.length).toBeGreaterThan(20);
    expect(APPLICANT_GUIDANCE.DRAFT.step).toBeLessThan(APPLICANT_GUIDANCE.AUTO_FAILED.step);
    expect(APPLICANT_GUIDANCE.AUTO_FAILED.step).toBeLessThan(APPLICANT_GUIDANCE.REVIEW_REQUIRED.step);
    expect(APPLICANT_GUIDANCE.REVIEW_REQUIRED.step).toBeLessThan(APPLICANT_GUIDANCE.READY_FOR_AUTHORIZED_REVIEW.step);
  });
});
