import { describe, expect, it } from "vitest";
import { academicYearStart, findDate, parseDate, parsePdfDate } from "@/lib/extraction/dates";
import { compareValues, normalizeAcademicYear, normalizeIdentifier, normalizeName, normalizeProgramme, shingleSimilarity } from "@/lib/extraction/normalize";
import { extractFields } from "@/lib/extraction/fields";
import { checkUpload, sanitizeFileName } from "@/lib/files/validate";
import type { PageText } from "@/lib/extraction/types";

describe("date parsing", () => {
  it("parses DD/MM/YYYY as day-first", () => {
    expect(parseDate("Valid Until: 05/03/2027")).toBe("2027-03-05");
    expect(parseDate("31-03-2026")).toBe("2026-03-31");
    expect(parseDate("31.03.2026")).toBe("2026-03-31");
  });
  it("parses textual and ISO dates", () => {
    expect(parseDate("15th June 2024")).toBe("2024-06-15");
    expect(parseDate("June 15, 2024")).toBe("2024-06-15");
    expect(parseDate("2024-06-15")).toBe("2024-06-15");
  });
  it("rejects impossible calendar dates instead of guessing", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(findDate("31/02/2026")?.raw).toBe("31/02/2026");
    expect(parseDate("no date here")).toBeNull();
  });
  it("parses PDF metadata dates with timezone", () => {
    expect(parsePdfDate("D:20240615120000+05'30'")).toBe("2024-06-15T06:30:00.000Z");
    expect(parsePdfDate("D:20261026053510Z")).toBe("2026-10-26T05:35:10.000Z");
    expect(parsePdfDate(undefined)).toBeNull();
  });
  it("derives academic year start", () => {
    expect(academicYearStart("2027-28")).toBe("2027-07-01");
    expect(academicYearStart("2026-27", 8, 15)).toBe("2026-08-15");
  });
});

describe("normalisation", () => {
  it("ignores case, punctuation and common abbreviations in names", () => {
    expect(normalizeName("Sunrise Inst. of Tech.")).toBe(normalizeName("SUNRISE INSTITUTE OF TECHNOLOGY"));
    expect(compareValues("name", "The Sunrise Institute of Technology", "Sunrise Institute of Technology").outcome).toBe("EQUIVALENT");
  });
  it("flags substantive name differences", () => {
    expect(compareValues("name", "Sunrise Institute of Technology", "Sunset Institute of Technology").outcome).not.toBe("EQUIVALENT");
    expect(compareValues("name", "Sunrise Institute of Technology", "Meridian College of Pharmacy").outcome).toBe("DIFFERENT");
  });
  it("normalises identifiers and academic years", () => {
    expect(normalizeIdentifier("prv-inst 1001")).toBe("PRVINST1001");
    expect(normalizeAcademicYear("2027-28")).toBe("2027-2028");
    expect(normalizeAcademicYear("2027/2028")).toBe("2027-2028");
    expect(normalizeAcademicYear("2027-29")).toBeNull();
  });
  it("normalises programme names", () => {
    expect(normalizeProgramme("B.Tech in Computer Science & Engineering")).toBe(normalizeProgramme("Bachelor of Technology Computer Science and Engineering"));
    expect(compareValues("programme", "B.Tech CSE", "B.Tech Computer Science and Engineering").outcome).toBe("EQUIVALENT");
  });
  it("computes shingle similarity", () => {
    const a = "this certificate is issued to the institution for the academic year";
    expect(shingleSimilarity(a, a)).toBe(1);
    expect(shingleSimilarity(a, "completely different content without overlap at all")).toBe(0);
  });
});

function page(lines: string[], method: PageText["method"] = "PDF_TEXT", confidence = 1): PageText {
  return { page: 1, method, width: 600, height: 800, confidence, lines: lines.map((text, i) => ({ text, bbox: [0.1, i * 0.05, 0.9, i * 0.05 + 0.04], confidence })) };
}

describe("field extraction", () => {
  it("extracts labelled fields with page evidence", () => {
    const { fields } = extractFields(
      [page(["FIRE SAFETY NOC", "Certificate No: FSD/NOC/2025/4471", "Name of the Institution: Meridian Institute of Management", "Date of Issue: 12/04/2025", "Valid Until: 31/03/2027"])],
      ["referenceNumber", "institutionName", "issueDate", "expiryDate"],
    );
    const by = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(by.referenceNumber.value).toBe("FSD/NOC/2025/4471");
    expect(by.institutionName.value).toBe("Meridian Institute of Management");
    expect(by.issueDate.normalizedValue).toBe("2025-04-12");
    expect(by.expiryDate.normalizedValue).toBe("2027-03-31");
    expect(by.expiryDate.page).toBe(1);
    expect(by.expiryDate.excerpt).toContain("Valid Until");
    expect(by.expiryDate.bbox).not.toBeNull();
    expect(by.expiryDate.method).toBe("PDF_TEXT_LABEL");
  });
  it("never fabricates missing values", () => {
    const { fields, warnings } = extractFields([page(["Some unrelated text"])], ["expiryDate"]);
    const f = fields.find((x) => x.key === "expiryDate")!;
    expect(f.value).toBeNull();
    expect(f.confidence).toBe(0);
    expect(f.method).toBe("NOT_FOUND");
    expect(warnings.join(" ")).toContain("Expiry date");
  });
  it("reduces confidence for OCR text and unparseable dates", () => {
    const { fields } = extractFields([page(["Valid Until: 31/02/2027"], "OCR", 0.8)], ["expiryDate"]);
    const f = fields.find((x) => x.key === "expiryDate")!;
    expect(f.normalizedValue).toBeNull();
    expect(f.confidence).toBeLessThanOrEqual(0.3);
    expect(f.method).toBe("OCR_LABEL");
  });
  it("prefers the most specific label", () => {
    const { fields } = extractFields([page(["Date: 01/01/2020", "Date of Issue: 15/06/2024"])], ["issueDate"]);
    expect(fields.find((x) => x.key === "issueDate")!.normalizedValue).toBe("2024-06-15");
  });
});

describe("upload validation", () => {
  const pdf = Buffer.from("%PDF-1.4\n...");
  it("accepts a real PDF", () => {
    const r = checkUpload({ fileName: "noc.pdf", declaredMime: "application/pdf", buffer: pdf, maxBytes: 1024 });
    expect(r.ok).toBe(true);
  });
  it("rejects spoofed extensions by content sniffing", () => {
    const r = checkUpload({ fileName: "noc.pdf", declaredMime: "application/pdf", buffer: Buffer.from("MZ\x90\x00 executable"), maxBytes: 1024 });
    expect(r.ok).toBe(false);
  });
  it("rejects unsupported types, oversize and empty files", () => {
    expect(checkUpload({ fileName: "x.docx", declaredMime: "", buffer: pdf, maxBytes: 1024 }).ok).toBe(false);
    expect(checkUpload({ fileName: "x.pdf", declaredMime: "application/pdf", buffer: pdf, maxBytes: 4 }).ok).toBe(false);
    expect(checkUpload({ fileName: "x.pdf", declaredMime: "application/pdf", buffer: Buffer.alloc(0), maxBytes: 4 }).ok).toBe(false);
  });
  it("rejects MIME/extension disagreement", () => {
    expect(checkUpload({ fileName: "x.pdf", declaredMime: "image/png", buffer: pdf, maxBytes: 1024 }).ok).toBe(false);
  });
  it("strips path traversal from file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\x\\evil<script>.pdf")).toBe("evil_script_.pdf");
  });
});
