import Link from "next/link";
import { FileText, Database, ClipboardList, Building2, Fingerprint, Radio, FileSearch } from "lucide-react";
import { methodLabel } from "@/lib/extraction/methods";
import type { Evidence } from "@/lib/validation/types";

const ICON = { FIELD: FileSearch, DOCUMENT: FileText, APPLICATION: ClipboardList, RECORD: Database, CHECKLIST: ClipboardList, OTHER_APPLICATION: Building2, METADATA: Fingerprint, SOURCE: Radio };

/** Renders evidence references; cross-application references are redacted when the viewer may not see them. */
export function EvidenceList({ items, canSeeOtherApplications }: { items: Evidence[]; canSeeOtherApplications: boolean }) {
  if (!items.length) return <p className="text-xs text-muted">No evidence references recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((e, i) => {
        const Icon = ICON[e.kind] ?? FileText;
        return (
          <li key={i} className="flex gap-2 rounded border border-border bg-subtle/40 px-2.5 py-1.5 text-xs">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" />
            <div className="min-w-0">
              <div className="text-ink-2">
                <span className="font-medium text-ink">{e.label}</span>
                {e.kind === "OTHER_APPLICATION" ? (
                  canSeeOtherApplications && e.applicationId ? (
                    <> — <Link className="text-accent hover:underline" href={`/applications/${e.applicationId}`}>{e.applicationReference}</Link></>
                  ) : (
                    <> — another application (reference withheld)</>
                  )
                ) : (
                  e.value && <>: <span className="break-words">{e.value}</span></>
                )}
              </div>
              {(e.fileName || e.page || e.confidence !== undefined) && e.kind !== "OTHER_APPLICATION" && (
                <div className="mt-0.5 text-[11px] text-muted">
                  {e.documentId ? <Link href={`/documents/${e.documentId}${e.page ? `?page=${e.page}` : ""}`} className="text-accent hover:underline">{e.fileName ?? "document"}</Link> : e.fileName}
                  {e.page ? ` · page ${e.page}` : ""}
                  {e.confidence !== undefined ? ` · confidence ${Math.round(e.confidence * 100)}%` : ""}
                  {e.method ? ` · ${methodLabel(e.method)}` : ""}
                </div>
              )}
              {e.excerpt && <div className="mt-1 rounded bg-surface px-1.5 py-1 font-mono text-[11px] text-ink-2">“{e.excerpt}”</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
