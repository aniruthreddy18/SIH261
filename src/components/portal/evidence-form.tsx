"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatBytes } from "@/lib/utils";

/** Online submission of compliance evidence (undertaking proof or a renewed document) by the institution. */
export function EvidenceForm({ itemId, isDocument, maxMb }: { itemId: string; isDocument: boolean; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Choose the file to upload.");
    if (file.size > maxMb * 1048576) return setError(`The file is ${formatBytes(file.size)}, which exceeds the ${maxMb} MB limit.`);
    const fd = new FormData(e.currentTarget);
    fd.set("file", file);
    setBusy(true);
    try {
      const res = await fetch(`/api/compliance/items/${itemId}/evidence`, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status}).`);
      toast.success("Evidence submitted. An official will verify it.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={isDocument ? "Renewed document (PDF, PNG or JPEG)" : "Evidence of compliance (PDF, PNG or JPEG)"} htmlFor="evidence-file">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} id="evidence-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}><UploadCloud /> Choose file</Button>
          <span className="text-xs text-muted">{file ? `${file.name} · ${formatBytes(file.size)}` : `No file chosen · up to ${maxMb} MB`}</span>
        </div>
      </Field>
      {isDocument && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valid until (renewed document)" htmlFor="evidence-valid"><Input id="evidence-valid" name="newValidUntil" type="date" required /></Field>
          <Field label="Reference / certificate number" htmlFor="evidence-ref"><Input id="evidence-ref" name="newReference" placeholder="Optional" /></Field>
        </div>
      )}
      <Field label="Note to the verifying official" htmlFor="evidence-note"><Textarea id="evidence-note" name="note" required minLength={5} placeholder={isDocument ? "e.g. Lease renewed for a further 30 years; registered deed attached." : "e.g. Faculty appointed; appointment orders and joining reports attached."} /></Field>
      {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? <><Loader2 className="animate-spin" /> Submitting…</> : "Submit for verification"}</Button>
    </form>
  );
}
