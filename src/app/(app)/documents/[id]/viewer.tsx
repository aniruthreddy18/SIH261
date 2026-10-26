"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { correctFieldAction } from "@/app/actions/workflow";
import { ActionDialog } from "@/components/action-dialog";
import { ConfidenceMeter } from "@/components/status";
import { cn } from "@/lib/utils";

export interface ViewerField {
  id: string;
  key: string;
  label: string;
  value: string | null;
  normalizedValue: string | null;
  confidence: number;
  page: number | null;
  excerpt: string | null;
  bbox: [number, number, number, number] | null;
  method: string;
  correctedValue: string | null;
  correctedAt: string | null;
  correctionReason: string | null;
  correctedBy: string | null;
}

export function DocumentViewer({ versionId, pageCount, fields, initialPage, canCorrect, isCurrent, isImage }: { versionId: string; pageCount: number; fields: ViewerField[]; initialPage: number; canCorrect: boolean; isCurrent: boolean; isImage: boolean }) {
  const [page, setPage] = useState(Math.min(Math.max(1, initialPage), pageCount));
  const [active, setActive] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const onPage = fields.filter((f) => f.page === page && f.bbox);
  const select = (f: ViewerField) => {
    setActive(f.id);
    if (f.page && f.page !== page) {
      setLoaded(false);
      setPage(f.page);
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-ink-2">Source preview {isImage ? "(image)" : "(rendered server-side)"}</p>
          <div className="flex items-center gap-1 text-xs">
            <button className="rounded p-1 hover:bg-subtle disabled:opacity-40" disabled={page <= 1} onClick={() => { setLoaded(false); setPage(page - 1); }} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
            <span className="tabular text-muted">Page {page} / {pageCount}</span>
            <button className="rounded p-1 hover:bg-subtle disabled:opacity-40" disabled={page >= pageCount} onClick={() => { setLoaded(false); setPage(page + 1); }} aria-label="Next page"><ChevronRight className="size-4" /></button>
          </div>
        </div>
        <div className="bg-subtle p-3">
          <div className="relative mx-auto w-full max-w-[640px] overflow-hidden border border-border bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/documents/versions/${versionId}/preview?page=${page}`} alt={`Page ${page} of the document`} className="block w-full" onLoad={() => setLoaded(true)} />
            {loaded && onPage.map((f) => (
              <span
                key={f.id}
                className={cn("highlight-box", active === f.id && "active")}
                style={{ left: `${f.bbox![0] * 100}%`, top: `${f.bbox![1] * 100}%`, width: `${(f.bbox![2] - f.bbox![0]) * 100}%`, height: `${(f.bbox![3] - f.bbox![1]) * 100}%` }}
                title={`${f.label}: ${f.value}`}
              />
            ))}
            {!loaded && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">Rendering page…</div>}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">Highlighted regions show where each extracted value was found. Select a field to locate it.</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold text-ink">Extracted fields</p>
          <p className="text-xs text-muted">Unknown values are shown as unknown — never guessed. Corrections are audited and do not overwrite the machine value.</p>
        </div>
        <ul className="divide-y divide-border">
          {fields.map((f) => {
            const found = f.value !== null;
            return (
              <li key={f.id} className={cn("px-4 py-2.5 text-[13px]", active === f.id && "bg-accent-soft/60")}>
                <div className="flex flex-wrap items-start gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => select(f)} disabled={!f.page}>
                    <p className="text-xs font-medium text-muted">{f.label}</p>
                    {f.correctedValue !== null ? (
                      <p className="text-ink"><span className="font-medium">{f.correctedValue}</span> <span className="text-xs text-muted line-through">{f.value ?? "unknown"}</span></p>
                    ) : found ? (
                      <p className="font-medium text-ink">{f.value}{f.normalizedValue && f.normalizedValue !== f.value && ["issueDate", "expiryDate", "academicYear"].includes(f.key) && <span className="ml-1 text-xs font-normal text-muted">→ {f.normalizedValue}</span>}</p>
                    ) : (
                      <p className="italic text-faint">Unknown — not located on the document</p>
                    )}
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {(found || f.correctedValue !== null) && <ConfidenceMeter value={f.confidence} corrected={f.correctedValue !== null} />}
                    <span className="text-[10.5px] text-faint">{f.page ? `page ${f.page} · ` : ""}{f.method.replace(/_/g, " ").toLowerCase()}</span>
                  </div>
                </div>
                {f.excerpt && <p className="mt-1 truncate rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink-2" title={f.excerpt}>“{f.excerpt}”</p>}
                {f.correctedValue !== null && <p className="mt-1 text-[11px] text-accent">Corrected by {f.correctedBy ?? "reviewer"}{f.correctedAt ? ` on ${new Date(f.correctedAt).toLocaleDateString("en-GB")}` : ""}: {f.correctionReason}</p>}
                {canCorrect && isCurrent && (
                  <div className="mt-1.5">
                    <ActionDialog
                      label={f.correctedValue !== null ? "Revise correction" : found ? "Correct value" : "Record value"}
                      icon={<Pencil />}
                      size="xs"
                      variant="ghost"
                      title={`Correct “${f.label}”`}
                      description={`Machine value: ${f.value ?? "unknown"}${found ? ` (confidence ${Math.round(f.confidence * 100)}%)` : ""}. The original is retained and the correction is audited. Rerun validation to apply it.`}
                      fields={[
                        { name: "value", label: "Correct value (leave empty to record as absent)", defaultValue: f.correctedValue ?? f.value ?? "", required: false, minLength: 0, hint: ["issueDate", "expiryDate"].includes(f.key) ? "Dates: DD/MM/YYYY" : undefined },
                        { name: "reason", label: "Reason / basis for correction", type: "textarea" },
                      ]}
                      action={correctFieldAction.bind(null, f.id)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
