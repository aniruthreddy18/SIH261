import Link from "next/link";
import { ScanText } from "lucide-react";
import { listDocuments } from "@/server/documents";
import { prisma } from "@/server/db";
import { requireActor } from "@/server/session";
import { getOcrEngine } from "@/lib/extraction/ocr";
import { PageHeader, EmptyState, Notice } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ProcessingBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, pct } from "@/lib/utils";

export const metadata = { title: "Document Intelligence" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string; q?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [docs, categories] = await Promise.all([listDocuments(actor, sp), prisma.documentCategory.findMany({ orderBy: { sortOrder: "asc" } })]);
  const ocr = getOcrEngine().status();
  const counts = { total: docs.length, ocr: docs.filter((d) => d.extractionMethod === "OCR" || d.extractionMethod === "MIXED").length, failed: docs.filter((d) => d.processingStatus === "FAILED").length };
  return (
    <>
      <PageHeader
        title="Document Intelligence"
        crumbs={[{ label: "Command Centre", href: "/" }, { label: "Document Intelligence" }]}
        description="Current versions of submitted documents with extraction method, confidence and processing state. Open a document to inspect extracted fields against their source location."
        meta={<><Badge tone="neutral">{counts.total} documents</Badge><Badge tone="info">{counts.ocr} via OCR</Badge>{counts.failed > 0 && <Badge tone="bad">{counts.failed} failed</Badge>}</>}
      />
      <div className="mb-4">
        {ocr.available ? (
          <Notice tone="info">OCR engine available: Tesseract (tesseract.js, bundled English language data, runs locally — no document is sent to an external service).</Notice>
        ) : (
          <Notice tone="warn" title="OCR is not available">{ocr.reason} Text-layer PDFs are still processed; scanned documents will be marked as failed with this message.</Notice>
        )}
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-border p-3" role="search">
          <Input name="q" defaultValue={sp.q} placeholder="File name, application ID or institution" className="w-72" aria-label="Search documents" />
          <Select name="category" defaultValue={sp.category ?? ""} className="w-64" aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-48" aria-label="Processing status">
            <option value="">Any processing status</option>
            {["PROCESSED", "FAILED", "PENDING", "PROCESSING"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </Select>
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
        </form>
        {docs.length === 0 ? (
          <EmptyState icon={<ScanText />} title="No documents found" description="Documents are uploaded from an application's Documents tab." />
        ) : (
          <Table>
            <THead><tr><TH>Document</TH><TH>Application</TH><TH>Processing</TH><TH className="hidden md:table-cell">Method</TH><TH className="hidden lg:table-cell">Fields</TH><TH className="hidden lg:table-cell">Low confidence</TH><TH className="hidden md:table-cell">Uploaded</TH></tr></THead>
            <TBody>
              {docs.map((v) => {
                const found = v.fields.filter((f) => f.value !== null || f.correctedValue !== null).length;
                const low = v.fields.filter((f) => f.value !== null && f.correctedValue === null && f.confidence < 0.6).length;
                return (
                  <TR key={v.id}>
                    <TD>
                      <Link href={`/documents/${v.documentId}`} className="font-medium text-accent hover:underline">{v.originalName}</Link>
                      <p className="text-[11px] text-muted">{v.document.category.name} · v{v.versionNo}</p>
                    </TD>
                    <TD><Link href={`/applications/${v.document.application.id}?tab=documents`} className="font-mono text-xs hover:underline">{v.document.application.reference}</Link><p className="text-[11px] text-muted">{v.document.application.institutionName}</p></TD>
                    <TD><ProcessingBadge status={v.processingStatus} /></TD>
                    <TD className="hidden md:table-cell text-xs">{v.extractionMethod?.replace("_", " ") ?? "—"}{v.ocrConfidence !== null && <span className="text-muted"> · {pct(v.ocrConfidence)}</span>}</TD>
                    <TD className="hidden lg:table-cell tabular">{found}/{v.fields.length}</TD>
                    <TD className={`hidden lg:table-cell tabular ${low ? "text-warn font-medium" : "text-faint"}`}>{low}</TD>
                    <TD className="hidden md:table-cell text-xs whitespace-nowrap">{formatDateTime(v.uploadedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
