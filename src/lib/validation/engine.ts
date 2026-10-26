// Layer 2 — deterministic validation. Executes versioned, declarative rules against extracted
// values, application metadata and institutional records. Pure and side-effect free: the same
// context and rules always produce the same outcomes.
import { academicYearStart, formatIsoDate } from "@/lib/extraction/dates";
import { fieldLabel } from "@/lib/extraction/fields";
import { compareValues, normalizeIdentifier, normalizeProgramme, type NormalizationKind } from "@/lib/extraction/normalize";
import type { RuleResultStatus } from "@/lib/domain";
import { parseDefinition, type CheckType, type Definition } from "./definitions";
import type { ApplicationContext, DocumentContext, Evidence, FieldValue, RuleOutcome, RuleSpec } from "./types";

type Base = Omit<RuleOutcome, "status" | "subjectKey" | "subjectLabel" | "explanation" | "expected" | "observed" | "evidence" | "nextAction">;

function base(rule: RuleSpec): Base {
  return { ruleVersionId: rule.ruleVersionId, ruleCode: rule.code, ruleVersionNo: rule.version, ruleName: rule.name, severity: rule.severity };
}

function out(rule: RuleSpec, o: Partial<RuleOutcome> & Pick<RuleOutcome, "status" | "subjectKey" | "subjectLabel" | "explanation">): RuleOutcome {
  const defaultNext: Record<RuleResultStatus, string | null> = {
    PASS: null,
    NOT_APPLICABLE: null,
    FAIL: rule.remediation,
    REVIEW_REQUIRED: "Route to a reviewer to confirm the value against the source document.",
    PROCESSING_FAILED: "Retry document processing or replace the document, then rerun validation.",
    PENDING: "Wait for document processing to complete, then rerun validation.",
  };
  return {
    ...base(rule),
    expected: null,
    observed: null,
    evidence: [],
    nextAction: defaultNext[o.status],
    ...o,
  };
}

const docLabel = (d: DocumentContext) => `${d.categoryName} — ${d.fileName} (v${d.versionNo})`;

function fieldEvidence(d: DocumentContext, f: FieldValue, label = fieldLabel(f.key)): Evidence {
  return {
    kind: "FIELD",
    label: `${label}${f.corrected ? " (reviewer-corrected)" : ""}`,
    value: f.value,
    documentId: d.documentId,
    versionId: d.versionId,
    categoryCode: d.categoryCode,
    fileName: d.fileName,
    page: f.page,
    excerpt: f.excerpt,
    confidence: f.confidence,
    method: f.method,
  };
}

function docsIn(ctx: ApplicationContext, categories: string[]): DocumentContext[] {
  return ctx.documents.filter((d) => categories.length === 0 || categories.includes(d.categoryCode));
}

function usableField(d: DocumentContext, key: string): FieldValue | null {
  const f = d.fields[key];
  if (!f || f.value === null || f.value === "") return null;
  return f;
}

/** Outcome for documents whose extraction has not produced reliable fields. */
function processingGate(rule: RuleSpec, d: DocumentContext, subjectKey: string): RuleOutcome | null {
  if (d.processingStatus === "FAILED") {
    return out(rule, {
      status: "PROCESSING_FAILED",
      subjectKey,
      subjectLabel: docLabel(d),
      documentId: d.documentId,
      documentVersionId: d.versionId,
      categoryCode: d.categoryCode,
      explanation: `The document could not be processed, so this rule could not be evaluated. ${d.processingError ?? ""}`.trim(),
      evidence: [{ kind: "DOCUMENT", label: docLabel(d), documentId: d.documentId, versionId: d.versionId, fileName: d.fileName, value: d.processingError ?? null }],
    });
  }
  if (d.processingStatus === "PENDING" || d.processingStatus === "PROCESSING") {
    return out(rule, {
      status: "PENDING",
      subjectKey,
      subjectLabel: docLabel(d),
      documentId: d.documentId,
      documentVersionId: d.versionId,
      categoryCode: d.categoryCode,
      explanation: "Document processing has not completed.",
    });
  }
  return null;
}

const isLowConfidence = (ctx: ApplicationContext, f: FieldValue) => !f.corrected && f.confidence < ctx.settings.lowConfidenceThreshold;
const pct = (n: number) => `${Math.round(n * 100)}%`;

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

type Check<T extends CheckType> = (ctx: ApplicationContext, rule: RuleSpec, def: Definition<T>) => RuleOutcome[];

const requiredDocuments: Check<"REQUIRED_DOCUMENTS"> = (ctx, rule, def) =>
  ctx.checklist
    .filter((item) => item.mandatory || def.includeOptional)
    .map((item) => {
      const present = ctx.documents.filter((d) => d.categoryCode === item.categoryCode);
      const subjectKey = `${rule.code}|${item.categoryCode}`;
      const checklistEv: Evidence = { kind: "CHECKLIST", label: "Checklist requirement", value: `${item.label} (${item.mandatory ? "mandatory" : "optional"})`, categoryCode: item.categoryCode };
      if (present.length === 0) {
        return out(rule, {
          status: item.mandatory ? "FAIL" : "NOT_APPLICABLE",
          subjectKey,
          subjectLabel: item.label,
          categoryCode: item.categoryCode,
          explanation: item.mandatory
            ? `Mandatory document "${item.label}" has not been submitted.`
            : `Optional document "${item.label}" was not submitted.`,
          expected: `At least one document in category "${item.label}"`,
          observed: "No document submitted",
          evidence: [checklistEv],
          nextAction: item.mandatory ? `Upload the "${item.label}" document. ${rule.remediation}` : null,
        });
      }
      return out(rule, {
        status: "PASS",
        subjectKey,
        subjectLabel: item.label,
        categoryCode: item.categoryCode,
        explanation: `"${item.label}" is present (${present.length} document${present.length > 1 ? "s" : ""}).`,
        expected: `At least one document in category "${item.label}"`,
        observed: present.map((d) => d.fileName).join(", "),
        evidence: [checklistEv, ...present.map((d) => ({ kind: "DOCUMENT" as const, label: docLabel(d), documentId: d.documentId, versionId: d.versionId, fileName: d.fileName }))],
      });
    });

const requiredFields: Check<"REQUIRED_FIELDS"> = (ctx, rule, def) =>
  docsIn(ctx, def.documentCategories).map((d) => {
    const subjectKey = `${rule.code}|${d.documentId}`;
    const gate = processingGate(rule, d, subjectKey);
    if (gate) return gate;
    const missing: string[] = [];
    const low: FieldValue[] = [];
    const present: FieldValue[] = [];
    for (const key of def.fields) {
      const f = usableField(d, key);
      if (!f || (["issueDate", "expiryDate", "academicYear", "approvedIntake"].includes(key) && !f.normalized)) missing.push(key);
      else if (isLowConfidence(ctx, f)) low.push(f);
      else present.push(f);
    }
    const common = { subjectKey, subjectLabel: docLabel(d), documentId: d.documentId, documentVersionId: d.versionId, categoryCode: d.categoryCode, expected: `Fields present: ${def.fields.map(fieldLabel).join(", ")}` };
    const evidence = [...present, ...low].map((f) => fieldEvidence(d, f));
    if (missing.length) {
      return out(rule, {
        ...common,
        status: def.missingOutcome,
        explanation: `Required field(s) could not be located on the document: ${missing.map(fieldLabel).join(", ")}. The value may be absent or not machine-readable.`,
        observed: `Missing: ${missing.map(fieldLabel).join(", ")}`,
        evidence,
        nextAction: def.missingOutcome === "FAIL" ? rule.remediation : "A reviewer should confirm whether the field is present and record a correction, or request a clearer document.",
      });
    }
    if (low.length) {
      return out(rule, {
        ...common,
        status: "REVIEW_REQUIRED",
        explanation: `All required fields were located, but ${low.map((f) => `${fieldLabel(f.key)} (${pct(f.confidence)})`).join(", ")} were extracted with low confidence.`,
        observed: low.map((f) => `${fieldLabel(f.key)}: ${f.value}`).join("; "),
        evidence,
      });
    }
    return out(rule, { ...common, status: "PASS", explanation: "All required fields were extracted.", observed: present.map((f) => `${fieldLabel(f.key)}: ${f.value}`).join("; "), evidence });
  });

function referenceDate(ctx: ApplicationContext, def: Definition<"DATE_VALID_ON">): { iso: string; label: string } | null {
  let iso: string | null;
  let label: string;
  if (def.reference === "ACADEMIC_YEAR_START") {
    iso = academicYearStart(ctx.academicYear, ctx.settings.academicYearStartMonth, ctx.settings.academicYearStartDay);
    label = `start of academic year ${ctx.academicYear}`;
  } else if (def.reference === "RUN_DATE") {
    iso = ctx.runDate;
    label = "validation date";
  } else {
    iso = def.fixedDate ?? null;
    label = "configured date";
  }
  if (!iso) return null;
  if (def.offsetDays) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + def.offsetDays);
    iso = d.toISOString().slice(0, 10);
    label += ` ${def.offsetDays > 0 ? "+" : ""}${def.offsetDays} days`;
  }
  return { iso, label };
}

const dateValidOn: Check<"DATE_VALID_ON"> = (ctx, rule, def) => {
  const ref = referenceDate(ctx, def);
  return docsIn(ctx, def.documentCategories).map((d) => {
    const subjectKey = `${rule.code}|${d.documentId}`;
    const gate = processingGate(rule, d, subjectKey);
    if (gate) return gate;
    const common = { subjectKey, subjectLabel: docLabel(d), documentId: d.documentId, documentVersionId: d.versionId, categoryCode: d.categoryCode };
    if (!ref) {
      return out(rule, { ...common, status: "PROCESSING_FAILED", explanation: `Reference date could not be derived from academic year "${ctx.academicYear}".` });
    }
    const expected = `${fieldLabel(def.field)} on or after ${formatIsoDate(ref.iso)} (${ref.label})`;
    const f = usableField(d, def.field);
    if (!f || !f.normalized) {
      return out(rule, {
        ...common,
        status: "REVIEW_REQUIRED",
        explanation: `${fieldLabel(def.field)} could not be reliably extracted, so validity cannot be determined automatically.`,
        expected,
        observed: f?.value ? `Unparseable value "${f.value}"` : "Not found",
        evidence: f ? [fieldEvidence(d, f)] : [],
        nextAction: "A reviewer should read the validity date from the document and record a correction, or request a clearer copy.",
      });
    }
    const evidence = [fieldEvidence(d, f), { kind: "APPLICATION" as const, label: `Reference date (${ref.label})`, value: formatIsoDate(ref.iso) }];
    if (isLowConfidence(ctx, f)) {
      return out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: `${fieldLabel(def.field)} "${f.value}" was extracted with low confidence (${pct(f.confidence)}); a reviewer must confirm it before validity can be decided.`, expected, observed: formatIsoDate(f.normalized), evidence });
    }
    if (f.normalized < ref.iso) {
      return out(rule, {
        ...common,
        status: "FAIL",
        explanation: `Validity does not cover the required date: the document is valid until ${formatIsoDate(f.normalized)}, but must remain valid on ${formatIsoDate(ref.iso)} (${ref.label}).`,
        expected,
        observed: `Valid until ${formatIsoDate(f.normalized)}${f.page ? ` (page ${f.page})` : ""}`,
        evidence,
        nextAction: `Submit currently valid evidence covering ${formatIsoDate(ref.iso)}, or route for authorised review. ${rule.remediation}`,
      });
    }
    return out(rule, { ...common, status: "PASS", explanation: `Valid until ${formatIsoDate(f.normalized)}, which covers ${formatIsoDate(ref.iso)}.`, expected, observed: `Valid until ${formatIsoDate(f.normalized)}`, evidence });
  });
};

const dateOrder: Check<"DATE_ORDER"> = (ctx, rule, def) =>
  docsIn(ctx, def.documentCategories).flatMap((d) => {
    const subjectKey = `${rule.code}|${d.documentId}`;
    const gate = processingGate(rule, d, subjectKey);
    if (gate) return [gate];
    const a = usableField(d, def.earlierField);
    const b = usableField(d, def.laterField);
    const common = { subjectKey, subjectLabel: docLabel(d), documentId: d.documentId, documentVersionId: d.versionId, categoryCode: d.categoryCode, expected: `${fieldLabel(def.earlierField)} ≤ ${fieldLabel(def.laterField)}` };
    if (!a?.normalized || !b?.normalized) {
      return [out(rule, { ...common, status: "NOT_APPLICABLE", explanation: "Both dates are not available on this document; order check not applicable." })];
    }
    const evidence = [fieldEvidence(d, a), fieldEvidence(d, b)];
    const observed = `${formatIsoDate(a.normalized)} → ${formatIsoDate(b.normalized)}`;
    if (isLowConfidence(ctx, a) || isLowConfidence(ctx, b)) {
      return [out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: "One of the dates was extracted with low confidence.", observed, evidence })];
    }
    if (a.normalized > b.normalized) {
      return [out(rule, { ...common, status: "FAIL", explanation: `${fieldLabel(def.earlierField)} (${formatIsoDate(a.normalized)}) is after ${fieldLabel(def.laterField)} (${formatIsoDate(b.normalized)}).`, observed, evidence })];
    }
    return [out(rule, { ...common, status: "PASS", explanation: "Dates are in a consistent order.", observed, evidence })];
  });

const dateNotFuture: Check<"DATE_NOT_FUTURE"> = (ctx, rule, def) =>
  docsIn(ctx, def.documentCategories).map((d) => {
    const subjectKey = `${rule.code}|${d.documentId}`;
    const gate = processingGate(rule, d, subjectKey);
    if (gate) return gate;
    const f = usableField(d, def.field);
    const common = { subjectKey, subjectLabel: docLabel(d), documentId: d.documentId, documentVersionId: d.versionId, categoryCode: d.categoryCode, expected: `${fieldLabel(def.field)} on or before ${formatIsoDate(ctx.runDate)}` };
    if (!f?.normalized) return out(rule, { ...common, status: "NOT_APPLICABLE", explanation: `${fieldLabel(def.field)} not available on this document.` });
    const evidence = [fieldEvidence(d, f)];
    if (isLowConfidence(ctx, f)) return out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: "Date extracted with low confidence.", observed: formatIsoDate(f.normalized), evidence });
    if (f.normalized > ctx.runDate) {
      return out(rule, { ...common, status: "FAIL", explanation: `${fieldLabel(def.field)} ${formatIsoDate(f.normalized)} is later than the validation date ${formatIsoDate(ctx.runDate)}.`, observed: formatIsoDate(f.normalized), evidence });
    }
    return out(rule, { ...common, status: "PASS", explanation: `${fieldLabel(def.field)} is not in the future.`, observed: formatIsoDate(f.normalized), evidence });
  });

const KIND_BY_FIELD: Record<string, NormalizationKind> = {
  institutionName: "name",
  institutionCode: "identifier",
  academicYear: "academicYear",
  programmeName: "programme",
  approvedIntake: "integer",
};

const crossDocumentMatch: Check<"CROSS_DOCUMENT_MATCH"> = (ctx, rule, def) => {
  const kind = KIND_BY_FIELD[def.field];
  const docs = docsIn(ctx, def.documentCategories);
  const results: RuleOutcome[] = [];
  for (const d of docs) {
    const subjectKey = `${rule.code}|${d.documentId}`;
    if (d.processingStatus !== "PROCESSED") {
      const gate = processingGate(rule, d, subjectKey);
      if (gate) results.push(gate);
      continue;
    }
    const f = usableField(d, def.field);
    if (!f) continue; // Not every document states every field.
    const common = { subjectKey, subjectLabel: docLabel(d), documentId: d.documentId, documentVersionId: d.versionId, categoryCode: d.categoryCode };
    // Determine the application value this document must agree with.
    let appValue: string | null = null;
    let appLabel = "";
    if (def.field === "institutionName") { appValue = ctx.institutionName; appLabel = "Institution name (application)"; }
    else if (def.field === "institutionCode") { appValue = ctx.institutionCode; appLabel = "Institution identifier (application)"; }
    else if (def.field === "academicYear") { appValue = ctx.academicYear; appLabel = "Academic year (application)"; }
    else if (def.field === "programmeName") {
      const match = ctx.programmes.find((p) => compareValues("programme", p.name, f.value!).outcome !== "DIFFERENT");
      appValue = match ? match.name : ctx.programmes.map((p) => p.name).join(" | ");
      appLabel = match ? "Programme (application)" : "Programmes in application";
    } else if (def.field === "approvedIntake") {
      const docProg = usableField(d, "programmeName");
      const prog = (docProg && ctx.programmes.find((p) => compareValues("programme", p.name, docProg.value!).outcome !== "DIFFERENT")) || (ctx.programmes.length === 1 ? ctx.programmes[0] : null);
      if (!prog) {
        results.push(out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: "The intake on this document could not be associated with a programme in the application.", observed: f.value, evidence: [fieldEvidence(d, f)] }));
        continue;
      }
      appValue = String(prog.intake);
      appLabel = `Intake for ${prog.name} (application)`;
    }
    if (appValue === null) continue;
    const cmp = compareValues(kind, appValue, f.value!);
    const evidence: Evidence[] = [{ kind: "APPLICATION", label: appLabel, value: appValue }, fieldEvidence(d, f)];
    const expected = `${fieldLabel(def.field)} = "${appValue}"`;
    if (cmp.outcome === "EXACT" || cmp.outcome === "EQUIVALENT") {
      results.push(out(rule, { ...common, status: "PASS", explanation: cmp.outcome === "EXACT" ? `${fieldLabel(def.field)} matches the application.` : `${fieldLabel(def.field)} matches the application after normalisation (formatting differences only).`, expected, observed: f.value, evidence }));
    } else if (cmp.outcome === "SIMILAR") {
      results.push(out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: `${fieldLabel(def.field)} "${f.value}" is similar but not identical to the application value "${appValue}" (similarity ${pct(cmp.similarity)}). A reviewer should decide whether the difference is substantive.`, expected, observed: f.value, evidence }));
    } else if (isLowConfidence(ctx, f)) {
      results.push(out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: `${fieldLabel(def.field)} "${f.value}" differs from the application, but was extracted with low confidence (${pct(f.confidence)}).`, expected, observed: f.value, evidence }));
    } else {
      results.push(out(rule, {
        ...common,
        status: "FAIL",
        explanation: `${fieldLabel(def.field)} mismatch: the document states "${f.value}"${f.page ? ` (page ${f.page})` : ""}, but the application states "${appValue}".`,
        expected,
        observed: f.value,
        evidence,
      }));
    }
  }
  if (results.length === 0) {
    results.push(out(rule, { status: "NOT_APPLICABLE", subjectKey: `${rule.code}|none`, subjectLabel: "All documents", explanation: `No submitted document states ${fieldLabel(def.field).toLowerCase()}.` }));
  }
  return results;
};

const recordMatch: Check<"RECORD_MATCH"> = (ctx, rule, def) => {
  const rec = ctx.institutionRecord;
  if (!rec) {
    return [out(rule, { status: "REVIEW_REQUIRED", subjectKey: `${rule.code}|record`, subjectLabel: "Institutional record", explanation: "No institutional record is available for comparison.", nextAction: "Confirm institution details manually." })];
  }
  const recEv = (label: string, value: string): Evidence => ({ kind: "RECORD", label, value });
  if (def.aspect === "INSTITUTION_IDENTITY") {
    const res: RuleOutcome[] = [];
    const name = compareValues("name", rec.name, ctx.institutionName);
    res.push(out(rule, {
      status: name.outcome === "DIFFERENT" ? "FAIL" : name.outcome === "SIMILAR" ? "REVIEW_REQUIRED" : "PASS",
      subjectKey: `${rule.code}|name`,
      subjectLabel: "Institution name vs record",
      explanation: name.outcome === "DIFFERENT" ? `Application institution name "${ctx.institutionName}" does not match the institutional record "${rec.name}".` : name.outcome === "SIMILAR" ? `Application institution name is similar to, but not the same as, the record (${pct(name.similarity)}).` : "Institution name matches the institutional record.",
      expected: rec.name,
      observed: ctx.institutionName,
      evidence: [recEv("Institutional record — name", rec.name), { kind: "APPLICATION", label: "Application — institution name", value: ctx.institutionName }],
    }));
    const code = ctx.institutionCode ? normalizeIdentifier(ctx.institutionCode) === normalizeIdentifier(rec.code) : null;
    res.push(out(rule, {
      status: code === null ? "REVIEW_REQUIRED" : code ? "PASS" : "FAIL",
      subjectKey: `${rule.code}|code`,
      subjectLabel: "Institution identifier vs record",
      explanation: code === null ? "The application does not state an institution identifier." : code ? "Institution identifier matches the institutional record." : `Application identifier "${ctx.institutionCode}" does not match the institutional record "${rec.code}".`,
      expected: rec.code,
      observed: ctx.institutionCode,
      evidence: [recEv("Institutional record — identifier", rec.code), { kind: "APPLICATION", label: "Application — identifier", value: ctx.institutionCode }],
    }));
    return res;
  }
  return ctx.programmes.map((p) => {
    const match = rec.programmes.find((rp) => normalizeProgramme(rp.name) === normalizeProgramme(p.name) || compareValues("programme", rp.name, p.name).outcome === "SIMILAR");
    const subjectKey = `${rule.code}|${normalizeProgramme(p.name)}`;
    const appEv: Evidence = { kind: "APPLICATION", label: `Application — ${p.name}`, value: `Intake ${p.intake}` };
    if (!match) {
      return out(rule, { status: "REVIEW_REQUIRED", subjectKey, subjectLabel: p.name, explanation: `Programme "${p.name}" was not found in the institutional record.`, expected: "Programme present in institutional record", observed: "Not found", evidence: [appEv] });
    }
    const ev = [appEv, recEv(`Institutional record — ${match.name}`, `Approved intake ${match.approvedIntake} (last approved ${match.lastApprovedYear})`)];
    if (p.intake > match.approvedIntake) {
      return out(rule, { status: "FAIL", subjectKey, subjectLabel: p.name, explanation: `Intake applied for (${p.intake}) exceeds the approved intake in the institutional record (${match.approvedIntake}).`, expected: `≤ ${match.approvedIntake}`, observed: String(p.intake), evidence: ev });
    }
    return out(rule, { status: "PASS", subjectKey, subjectLabel: p.name, explanation: `Intake (${p.intake}) is within the institutional record (${match.approvedIntake}).`, expected: `≤ ${match.approvedIntake}`, observed: String(p.intake), evidence: ev });
  });
};

const duplicateFile: Check<"DUPLICATE_FILE"> = (ctx, rule, def) => {
  const groups = new Map<string, DocumentContext[]>();
  for (const d of ctx.documents) groups.set(d.sha256, [...(groups.get(d.sha256) ?? []), d]);
  const dups = [...groups.entries()].filter(([, ds]) => ds.length > 1);
  if (dups.length === 0) {
    return [out(rule, { status: "PASS", subjectKey: `${rule.code}|none`, subjectLabel: "All documents", explanation: `No identical files among ${ctx.documents.length} submitted documents.` })];
  }
  return dups.map(([sha, ds]) =>
    out(rule, {
      status: def.outcome,
      subjectKey: `${rule.code}|${sha}`,
      subjectLabel: `Identical file ×${ds.length}`,
      documentId: ds[0].documentId,
      explanation: `The same file (SHA-256 ${sha.slice(0, 12)}…) was submitted as ${ds.length} documents: ${ds.map((d) => `${d.categoryName} (“${d.fileName}”)`).join(", ")}. A duplicate may be legitimate, but the checklist expects distinct evidence for each item.`,
      expected: "Distinct evidence for each checklist item",
      observed: `${ds.length} documents with identical content hash`,
      evidence: ds.map((d) => ({ kind: "DOCUMENT" as const, label: docLabel(d), documentId: d.documentId, versionId: d.versionId, fileName: d.fileName, value: `SHA-256 ${sha}` })),
      nextAction: "Confirm whether the same evidence legitimately serves both requirements; otherwise request the correct document.",
    }),
  );
};

const duplicateReference: Check<"DUPLICATE_REFERENCE"> = (ctx, rule, def) => {
  const groups = new Map<string, { d: DocumentContext; f: FieldValue }[]>();
  for (const d of docsIn(ctx, def.documentCategories)) {
    const f = usableField(d, "referenceNumber");
    if (!f) continue;
    const key = normalizeIdentifier(f.value!);
    if (key.length < 4) continue;
    groups.set(key, [...(groups.get(key) ?? []), { d, f }]);
  }
  const dups = [...groups.entries()].filter(([, xs]) => new Set(xs.map((x) => x.d.sha256)).size > 1);
  if (dups.length === 0) {
    return [out(rule, { status: "PASS", subjectKey: `${rule.code}|none`, subjectLabel: "All documents", explanation: "No reference number is repeated across different documents." })];
  }
  return dups.map(([key, xs]) =>
    out(rule, {
      status: def.outcome,
      subjectKey: `${rule.code}|${key}`,
      subjectLabel: `Reference ${xs[0].f.value}`,
      documentId: xs[0].d.documentId,
      explanation: `Reference number "${xs[0].f.value}" appears on ${xs.length} different documents (${xs.map((x) => x.d.categoryName).join(", ")}). Reference numbers are normally unique to one document.`,
      expected: "Unique reference number per document",
      observed: `${xs.length} documents share the reference`,
      evidence: xs.map((x) => fieldEvidence(x.d, x.f)),
      nextAction: "Check whether the documents are genuinely distinct and whether the reference was copied in error.",
    }),
  );
};

const fieldCondition: Check<"FIELD_CONDITION"> = (ctx, rule, def) =>
  docsIn(ctx, def.documentCategories).map((d) => {
    const subjectKey = `${rule.code}|${d.documentId}`;
    const gate = processingGate(rule, d, subjectKey);
    if (gate) return gate;
    const f = usableField(d, def.field);
    const expected = `${fieldLabel(def.field)} ${def.operator.replace("_", " ")}${def.value !== undefined ? ` ${def.value}` : ""}`;
    const common = { subjectKey, subjectLabel: docLabel(d), documentId: d.documentId, documentVersionId: d.versionId, categoryCode: d.categoryCode, expected };
    if (!f) {
      return out(rule, { ...common, status: def.missingOutcome, explanation: `${fieldLabel(def.field)} could not be located on the document.`, observed: "Not found" });
    }
    const evidence = [fieldEvidence(d, f)];
    if (isLowConfidence(ctx, f)) return out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: `${fieldLabel(def.field)} was extracted with low confidence (${pct(f.confidence)}).`, observed: f.value, evidence });
    const v = (f.normalized ?? f.value!).toLowerCase();
    const target = (def.value ?? "").toLowerCase().trim();
    let pass: boolean;
    switch (def.operator) {
      case "exists": pass = true; break;
      case "equals": pass = v === target; break;
      case "not_equals": pass = v !== target; break;
      case "contains": pass = v.includes(target); break;
      case "one_of": pass = target.split(",").map((s) => s.trim()).filter(Boolean).includes(v); break;
      case "gte":
      case "lte": {
        const n = Number(f.normalized ?? NaN);
        if (Number.isNaN(n)) return out(rule, { ...common, status: "REVIEW_REQUIRED", explanation: `${fieldLabel(def.field)} "${f.value}" is not numeric.`, observed: f.value, evidence });
        pass = def.operator === "gte" ? n >= Number(def.value) : n <= Number(def.value);
        break;
      }
    }
    return out(rule, {
      ...common,
      status: pass ? "PASS" : "FAIL",
      explanation: pass ? `Condition satisfied: ${expected}.` : `Condition not satisfied: expected ${expected}, document states "${f.value}".`,
      observed: f.value,
      evidence,
    });
  });

const CHECKS: { [K in CheckType]: Check<K> } = {
  REQUIRED_DOCUMENTS: requiredDocuments,
  REQUIRED_FIELDS: requiredFields,
  DATE_VALID_ON: dateValidOn,
  DATE_ORDER: dateOrder,
  DATE_NOT_FUTURE: dateNotFuture,
  CROSS_DOCUMENT_MATCH: crossDocumentMatch,
  RECORD_MATCH: recordMatch,
  DUPLICATE_FILE: duplicateFile,
  DUPLICATE_REFERENCE: duplicateReference,
  FIELD_CONDITION: fieldCondition,
};

/** Evaluate every rule against the application context. Never throws. */
export function evaluateRules(ctx: ApplicationContext, rules: RuleSpec[]): RuleOutcome[] {
  const results: RuleOutcome[] = [];
  for (const rule of rules) {
    if (rule.appliesTo.length > 0 && !rule.appliesTo.includes(ctx.templateCode)) {
      results.push(out(rule, { status: "NOT_APPLICABLE", subjectKey: `${rule.code}|template`, subjectLabel: "Application template", explanation: `Rule does not apply to template ${ctx.templateCode}.` }));
      continue;
    }
    const parsed = parseDefinition(rule.checkType, rule.definition);
    if (!parsed.ok) {
      results.push(out(rule, { status: "PROCESSING_FAILED", subjectKey: `${rule.code}|definition`, subjectLabel: "Rule definition", explanation: `Rule definition is invalid: ${parsed.error}`, nextAction: "A rules administrator must correct the rule definition." }));
      continue;
    }
    try {
      const check = CHECKS[rule.checkType as CheckType] as Check<CheckType>;
      results.push(...check(ctx, rule, parsed.value as never));
    } catch (err) {
      results.push(out(rule, { status: "PROCESSING_FAILED", subjectKey: `${rule.code}|error`, subjectLabel: "Rule execution", explanation: `Rule could not be evaluated due to a technical error${err instanceof Error ? `: ${err.message}` : ""}.` }));
    }
  }
  return results;
}
