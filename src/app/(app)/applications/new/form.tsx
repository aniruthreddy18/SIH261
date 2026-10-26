"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createApplicationAction } from "@/app/actions/workflow";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";

interface Inst { id: string; code: string; name: string; category: string; programmes: { name: string; level: string; intake: number }[] }

export function NewApplicationForm({ institutions, templates, defaultContact }: { institutions: Inst[]; templates: { code: string; name: string; description: string }[]; defaultContact: { name: string; email: string } | null }) {
  const router = useRouter();
  const [instId, setInstId] = useState(institutions.length === 1 ? institutions[0].id : "");
  const inst = useMemo(() => institutions.find((i) => i.id === instId), [instId, institutions]);
  const [template, setTemplate] = useState(templates[0]?.code ?? "");
  const [programmes, setProgrammes] = useState(inst?.programmes ?? [{ name: "", level: "UG", intake: 60 }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectInst = (id: string) => {
    setInstId(id);
    const i = institutions.find((x) => x.id === id);
    if (i) setProgrammes(i.programmes.length ? i.programmes : [{ name: "", level: "UG", intake: 60 }]);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r = await createApplicationAction({
      institutionId: instId,
      templateCode: template,
      institutionName: String(fd.get("institutionName")),
      institutionCode: String(fd.get("institutionCode")),
      institutionCategory: String(fd.get("institutionCategory")),
      academicYear: String(fd.get("academicYear")),
      contactName: String(fd.get("contactName")),
      contactEmail: String(fd.get("contactEmail")),
      contactPhone: String(fd.get("contactPhone")),
      programmes,
    });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      toast.error(r.error);
      return;
    }
    toast.success(r.message);
    router.push(`/applications/${(r.data as { id: string }).id}?tab=documents`);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader title="Institution" description="Select the institution; details are pre-filled from the institutional record." />
          <CardBody className="grid gap-3 md:grid-cols-2">
            <Field label="Institution" htmlFor="inst" className="md:col-span-2">
              <Select id="inst" value={instId} onChange={(e) => selectInst(e.target.value)} required>
                <option value="" disabled>Select an institution…</option>
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
              </Select>
            </Field>
            <Field label="Institution name (as in application)" htmlFor="institutionName">
              <Input id="institutionName" name="institutionName" key={`n-${instId}`} defaultValue={inst?.name} required minLength={3} />
            </Field>
            <Field label="Institution identifier" htmlFor="institutionCode" hint="Optional if not yet assigned.">
              <Input id="institutionCode" name="institutionCode" key={`c-${instId}`} defaultValue={inst?.code} />
            </Field>
            <Field label="Institution category" htmlFor="institutionCategory">
              <Input id="institutionCategory" name="institutionCategory" key={`k-${instId}`} defaultValue={inst?.category} required />
            </Field>
            <Field label="Academic year" htmlFor="academicYear" hint="Format 2027-28">
              <Input id="academicYear" name="academicYear" defaultValue="2027-28" pattern="\d{4}-\d{2}" required />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Programmes and intake" description="Intake applied for is compared against previous approval letters and institutional records." actions={<Button type="button" size="xs" variant="outline" onClick={() => setProgrammes([...programmes, { name: "", level: "UG", intake: 60 }])}><Plus /> Add programme</Button>} />
          <CardBody className="space-y-2">
            {programmes.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_90px_36px] items-end gap-2">
                <Field label={i === 0 ? "Programme" : ""}><Input value={p.name} onChange={(e) => setProgrammes(programmes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} required aria-label="Programme name" /></Field>
                <Field label={i === 0 ? "Level" : ""}>
                  <Select value={p.level} onChange={(e) => setProgrammes(programmes.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))} aria-label="Level">
                    {["UG", "PG", "Diploma", "PhD"].map((l) => <option key={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label={i === 0 ? "Intake" : ""}><Input type="number" min={1} value={p.intake} onChange={(e) => setProgrammes(programmes.map((x, j) => (j === i ? { ...x, intake: Number(e.target.value) } : x)))} required aria-label="Intake" /></Field>
                <Button type="button" variant="ghost" size="icon" disabled={programmes.length === 1} onClick={() => setProgrammes(programmes.filter((_, j) => j !== i))} aria-label="Remove programme"><Trash2 /></Button>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Application type" />
          <CardBody className="space-y-3">
            <Field label="Template" htmlFor="template">
              <Select id="template" value={template} onChange={(e) => setTemplate(e.target.value)}>
                {templates.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </Select>
            </Field>
            <p className="text-xs text-muted">{templates.find((t) => t.code === template)?.description}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Authorised contact" />
          <CardBody className="space-y-3">
            <Field label="Name" htmlFor="contactName"><Input id="contactName" name="contactName" defaultValue={defaultContact?.name} required /></Field>
            <Field label="Email" htmlFor="contactEmail"><Input id="contactEmail" name="contactEmail" type="email" defaultValue={defaultContact?.email} required /></Field>
            <Field label="Phone (optional)" htmlFor="contactPhone"><Input id="contactPhone" name="contactPhone" /></Field>
          </CardBody>
        </Card>
        {error && <p role="alert" className="rounded-md border border-red-200 bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending || !instId}>{pending && <Loader2 className="animate-spin" />} Create application</Button>
      </div>
    </form>
  );
}
