"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveRuleAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CHECK_TYPE_LABELS, CHECK_TYPES, CONDITION_OPERATORS, CROSS_FIELDS, describeDefinition, type CheckType } from "@/lib/validation/definitions";
import { RULE_CATEGORIES, RULE_CATEGORY_LABELS, SEVERITIES } from "@/lib/domain";
import { FIELD_DEFINITIONS } from "@/lib/extraction/fields";

export interface RuleFormInitial {
  ruleId?: string;
  code: string;
  name: string;
  description: string;
  category: string;
  checkType: string;
  definition: Record<string, unknown>;
  severity: string;
  appliesTo: string[];
  remediation: string;
  sourceReference: string;
  isSample: boolean;
}

function Multi({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-ink-2">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border p-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={value.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function RuleForm({ initial, categories, templates }: { initial: RuleFormInitial; categories: { code: string; name: string }[]; templates: { code: string; name: string }[] }) {
  const router = useRouter();
  const [checkType, setCheckType] = useState(initial.checkType as CheckType);
  const [def, setDef] = useState<Record<string, unknown>>(initial.definition);
  const [appliesTo, setAppliesTo] = useState(initial.appliesTo);
  const [pending, setPending] = useState(false);
  const set = (k: string, v: unknown) => setDef({ ...def, [k]: v });
  const cats = (def.documentCategories as string[] | undefined) ?? [];
  const catOptions = categories.map((c) => ({ value: c.code, label: c.name }));
  const fieldOptions = FIELD_DEFINITIONS.map((f) => ({ value: f.key, label: f.label }));
  const preview = useMemo(() => {
    try {
      return describeDefinition(checkType, def, (c) => categories.find((x) => x.code === c)?.name ?? c);
    } catch {
      return "";
    }
  }, [checkType, def, categories]);

  const changeType = (t: CheckType) => {
    setCheckType(t);
    const defaults: Record<CheckType, Record<string, unknown>> = {
      REQUIRED_DOCUMENTS: { includeOptional: false },
      REQUIRED_FIELDS: { documentCategories: [], fields: [], missingOutcome: "REVIEW_REQUIRED" },
      DATE_VALID_ON: { documentCategories: [], field: "expiryDate", reference: "ACADEMIC_YEAR_START", offsetDays: 0 },
      DATE_ORDER: { documentCategories: [], earlierField: "issueDate", laterField: "expiryDate" },
      DATE_NOT_FUTURE: { documentCategories: [], field: "issueDate" },
      CROSS_DOCUMENT_MATCH: { field: "institutionName", documentCategories: [] },
      RECORD_MATCH: { aspect: "INSTITUTION_IDENTITY" },
      DUPLICATE_FILE: { outcome: "REVIEW_REQUIRED" },
      DUPLICATE_REFERENCE: { documentCategories: [], outcome: "REVIEW_REQUIRED" },
      FIELD_CONDITION: { documentCategories: [], field: "builtUpArea", operator: "gte", value: "", missingOutcome: "REVIEW_REQUIRED" },
    };
    setDef(defaults[t]);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const clean = { ...def };
    if (clean.fixedDate === "") delete clean.fixedDate;
    if (clean.value === "" && clean.operator === "exists") delete clean.value;
    const r = await saveRuleAction({
      ruleId: initial.ruleId,
      code: String(fd.get("code")),
      name: String(fd.get("name")),
      description: String(fd.get("description")),
      category: String(fd.get("category")) as "POLICY",
      checkType,
      definition: clean,
      severity: String(fd.get("severity")) as "MEDIUM",
      appliesTo,
      effectiveFrom: String(fd.get("effectiveFrom")) as unknown as Date, // coerced server-side
      remediation: String(fd.get("remediation")),
      sourceReference: String(fd.get("sourceReference")),
      isSample: fd.get("isSample") === "on",
      changeNote: String(fd.get("changeNote")),
    });
    setPending(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    router.push(`/rules/${(r.data as { ruleId: string }).ruleId}`);
    router.refresh();
  };

  const outcomeSelect = (key: string, label: string) => (
    <Field label={label}><Select value={String(def[key] ?? "REVIEW_REQUIRED")} onChange={(e) => set(key, e.target.value)}><option value="REVIEW_REQUIRED">Route to human review</option><option value="FAIL">Fail</option></Select></Field>
  );

  return (
    <form onSubmit={submit} className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader title="Rule" description="Saving always creates a new immutable version; earlier versions and the runs that used them are preserved." />
          <CardBody className="grid gap-3 md:grid-cols-2">
            <Field label="Rule code" htmlFor="code" hint="e.g. POL-INF-002"><Input id="code" name="code" defaultValue={initial.code} required readOnly={!!initial.ruleId} pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,29}" /></Field>
            <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={initial.name} required minLength={3} /></Field>
            <Field label="Description" htmlFor="description" className="md:col-span-2"><Textarea id="description" name="description" defaultValue={initial.description} required minLength={5} /></Field>
            <Field label="Category" htmlFor="category"><Select id="category" name="category" defaultValue={initial.category}>{RULE_CATEGORIES.map((c) => <option key={c} value={c}>{RULE_CATEGORY_LABELS[c]}</option>)}</Select></Field>
            <Field label="Severity" htmlFor="severity"><Select id="severity" name="severity" defaultValue={initial.severity}>{SEVERITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Condition" description="Choose a supported check and its parameters. Arbitrary code and regular expressions are not accepted." />
          <CardBody className="space-y-3">
            <Field label="Check type" htmlFor="checkType"><Select id="checkType" value={checkType} onChange={(e) => changeType(e.target.value as CheckType)}>{CHECK_TYPES.map((t) => <option key={t} value={t}>{CHECK_TYPE_LABELS[t]}</option>)}</Select></Field>
            {checkType === "REQUIRED_DOCUMENTS" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(def.includeOptional)} onChange={(e) => set("includeOptional", e.target.checked)} /> Also report optional checklist items</label>}
            {["REQUIRED_FIELDS", "DATE_VALID_ON", "DATE_ORDER", "DATE_NOT_FUTURE", "CROSS_DOCUMENT_MATCH", "DUPLICATE_REFERENCE", "FIELD_CONDITION"].includes(checkType) && (
              <Multi label="Document categories (none selected = all)" options={catOptions} value={cats} onChange={(v) => set("documentCategories", v)} />
            )}
            {checkType === "REQUIRED_FIELDS" && (<><Multi label="Required fields" options={fieldOptions} value={(def.fields as string[]) ?? []} onChange={(v) => set("fields", v)} />{outcomeSelect("missingOutcome", "If a field cannot be located")}</>)}
            {checkType === "DATE_VALID_ON" && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Date field"><Select value={String(def.field)} onChange={(e) => set("field", e.target.value)}><option value="expiryDate">Expiry date</option><option value="issueDate">Issue date</option></Select></Field>
                <Field label="Must be on or after"><Select value={String(def.reference)} onChange={(e) => set("reference", e.target.value)}><option value="ACADEMIC_YEAR_START">Start of the academic year</option><option value="RUN_DATE">Validation date</option><option value="FIXED">A fixed date</option></Select></Field>
                {def.reference === "FIXED" && <Field label="Fixed date"><Input type="date" value={String(def.fixedDate ?? "")} onChange={(e) => set("fixedDate", e.target.value)} /></Field>}
                <Field label="Offset (days)"><Input type="number" value={Number(def.offsetDays ?? 0)} onChange={(e) => set("offsetDays", Number(e.target.value))} /></Field>
              </div>
            )}
            {checkType === "DATE_ORDER" && <p className="text-xs text-muted">Checks that the issue date is not later than the expiry date.</p>}
            {checkType === "DATE_NOT_FUTURE" && <Field label="Date field"><Select value={String(def.field)} onChange={(e) => set("field", e.target.value)}><option value="issueDate">Issue date</option><option value="expiryDate">Expiry date</option></Select></Field>}
            {checkType === "CROSS_DOCUMENT_MATCH" && <Field label="Field compared with the application"><Select value={String(def.field)} onChange={(e) => set("field", e.target.value)}>{CROSS_FIELDS.map((f) => <option key={f} value={f}>{fieldOptions.find((o) => o.value === f)?.label}</option>)}</Select></Field>}
            {checkType === "RECORD_MATCH" && <Field label="Aspect"><Select value={String(def.aspect)} onChange={(e) => set("aspect", e.target.value)}><option value="INSTITUTION_IDENTITY">Institution name & identifier</option><option value="PROGRAMME_INTAKE">Programme intake</option></Select></Field>}
            {(checkType === "DUPLICATE_FILE" || checkType === "DUPLICATE_REFERENCE") && outcomeSelect("outcome", "When a duplicate is found")}
            {checkType === "FIELD_CONDITION" && (
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Field"><Select value={String(def.field)} onChange={(e) => set("field", e.target.value)}>{fieldOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
                <Field label="Operator"><Select value={String(def.operator)} onChange={(e) => set("operator", e.target.value)}>{CONDITION_OPERATORS.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}</Select></Field>
                {def.operator !== "exists" && <Field label="Value" hint={def.operator === "one_of" ? "Comma-separated" : undefined}><Input value={String(def.value ?? "")} onChange={(e) => set("value", e.target.value)} required maxLength={200} /></Field>}
                <div className="md:col-span-3">{outcomeSelect("missingOutcome", "If the field cannot be located")}</div>
              </div>
            )}
            <div className="rounded-md border border-blue-100 bg-accent-soft/60 px-3 py-2 text-xs text-ink-2"><span className="font-semibold">Preview: </span>{preview}</div>
          </CardBody>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Scope and governance" />
          <CardBody className="space-y-3">
            <Multi label="Applies to templates (none = all)" options={templates.map((t) => ({ value: t.code, label: t.name }))} value={appliesTo} onChange={setAppliesTo} />
            <Field label="Effective from" htmlFor="effectiveFrom"><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
            <Field label="Remediation guidance" htmlFor="remediation"><Textarea id="remediation" name="remediation" defaultValue={initial.remediation} required minLength={5} /></Field>
            <Field label="Regulatory source reference" htmlFor="sourceReference" hint="Only cite a real regulation (document, clause, date) that you have verified. Leave blank for sample rules."><Input id="sourceReference" name="sourceReference" defaultValue={initial.sourceReference} /></Field>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="isSample" defaultChecked={initial.isSample} /> Sample / demonstration rule (not an authoritative regulation)</label>
            <Field label="Change note" htmlFor="changeNote"><Textarea id="changeNote" name="changeNote" required minLength={5} placeholder="What changed and why" /></Field>
            <Button type="submit" className="w-full" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />} {initial.ruleId ? "Save new version" : "Create rule"}</Button>
          </CardBody>
        </Card>
      </div>
    </form>
  );
}
