"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, RotateCcw, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { cn, formatBytes } from "@/lib/utils";

type Phase = { kind: "idle" } | { kind: "uploading"; progress: number } | { kind: "processing" } | { kind: "done"; ok: boolean; message: string; documentId?: string } | { kind: "error"; message: string };

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

export function UploadPanel({
  applicationId,
  categories,
  defaultCategory,
  replace,
  maxMb,
  onDone,
}: {
  applicationId: string;
  categories: { code: string; name: string }[];
  defaultCategory?: string;
  replace?: { documentId: string; categoryCode: string; label: string };
  maxMb: number;
  onDone?: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(replace?.categoryCode ?? defaultCategory ?? categories[0]?.code ?? "");
  const [reason, setReason] = useState("");
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "processing";

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "png", "jpg", "jpeg"].includes(ext)) {
      setPhase({ kind: "error", message: `Unsupported file type ".${ext}". Upload a PDF, PNG or JPEG file.` });
      return;
    }
    if (f.size > maxMb * 1048576) {
      setPhase({ kind: "error", message: `The file is ${formatBytes(f.size)}, which exceeds the ${maxMb} MB limit.` });
      return;
    }
    setFile(f);
    setPhase({ kind: "idle" });
  };

  const upload = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    if (replace) {
      fd.append("replaceDocumentId", replace.documentId);
      fd.append("reason", reason);
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/applications/${applicationId}/documents`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPhase(e.loaded >= e.total ? { kind: "processing" } : { kind: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onload = () => {
      let body: { error?: string; processingStatus?: string; processingError?: string; fieldsFound?: number; extractionMethod?: string; documentId?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        if (body.processingStatus === "PROCESSED") {
          const msg = `Uploaded and processed via ${body.extractionMethod?.replace("_", " ").toLowerCase()} — ${body.fieldsFound} field(s) extracted.`;
          setPhase({ kind: "done", ok: true, message: msg, documentId: body.documentId });
          toast.success(msg);
        } else {
          const msg = `Uploaded, but processing failed: ${body.processingError ?? "unknown error"}. You can retry processing from the document page.`;
          setPhase({ kind: "done", ok: false, message: msg, documentId: body.documentId });
          toast.error("Document processing failed");
        }
        setFile(null);
        router.refresh();
        onDone?.();
      } else {
        setPhase({ kind: "error", message: body.error ?? `Upload failed (HTTP ${xhr.status}).` });
      }
    };
    xhr.onerror = () => setPhase({ kind: "error", message: "Network error during upload. Check your connection and retry." });
    setPhase({ kind: "uploading", progress: 0 });
    xhr.send(fd);
  };

  return (
    <div className="space-y-3">
      {!replace ? (
        <Field label="Document category" htmlFor="upload-category" hint="Requirements come from the application checklist.">
          <Select id="upload-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
      ) : (
        <p className="text-xs text-muted">Replacing <span className="font-medium text-ink">{replace.label}</span>. The current version is retained as history; it is never overwritten.</p>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a file or drag it here"
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        className={cn("flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center transition-colors", drag ? "border-accent bg-accent-soft" : "border-border-strong bg-subtle/40 hover:bg-subtle")}
      >
        <UploadCloud className="size-6 text-muted" />
        {file ? (
          <p className="mt-2 text-[13px] font-medium text-ink">{file.name} <span className="font-normal text-muted">({formatBytes(file.size)})</span></p>
        ) : (
          <p className="mt-2 text-[13px] text-ink-2"><span className="font-medium text-accent">Browse files</span> or drag and drop</p>
        )}
        <p className="mt-1 text-[11px] text-muted">PDF, PNG or JPEG · up to {maxMb} MB · scanned documents are processed with OCR</p>
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="upload-input" />
      </div>
      {replace && (
        <Field label="Reason for replacement" htmlFor="replace-reason">
          <Input id="replace-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Renewed certificate submitted" />
        </Field>
      )}
      {phase.kind === "uploading" && (
        <div aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-accent transition-all" style={{ width: `${phase.progress}%` }} /></div>
          <p className="mt-1 text-[11px] text-muted">Uploading… {phase.progress}%</p>
        </div>
      )}
      {phase.kind === "processing" && <p className="flex items-center gap-2 text-xs text-info" aria-live="polite"><Loader2 className="size-3.5 animate-spin" /> Validating file and extracting text/fields (OCR may take a few seconds)…</p>}
      {phase.kind === "error" && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-bad-soft px-3 py-2 text-xs text-bad">
          <XCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="flex-1">{phase.message}</span>
          {file && <button className="flex items-center gap-1 font-medium underline" onClick={upload}><RotateCcw className="size-3" /> Retry</button>}
        </div>
      )}
      {phase.kind === "done" && (
        <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs", phase.ok ? "border-green-200 bg-ok-soft text-ok" : "border-amber-200 bg-warn-soft text-warn")} aria-live="polite">
          {phase.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <XCircle className="mt-0.5 size-3.5 shrink-0" />}
          <span className="flex-1">{phase.message} {phase.documentId && <a className="font-medium underline" href={`/documents/${phase.documentId}`}>View extraction</a>}</span>
        </div>
      )}
      <Button onClick={upload} disabled={!file || busy || (replace && reason.trim().length < 5)} className="w-full" data-testid="upload-submit">
        {busy ? <Loader2 className="animate-spin" /> : <FileUp />} {replace ? "Upload replacement" : "Upload document"}
      </Button>
      {replace && reason.trim().length < 5 && file && <p className="text-[11px] text-muted">Enter a reason (min 5 characters) to enable replacement.</p>}
    </div>
  );
}
