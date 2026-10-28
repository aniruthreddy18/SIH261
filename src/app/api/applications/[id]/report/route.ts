import { buildReportData } from "@/server/reports";
import { renderReportPdf } from "@/lib/report/pdf";
import { contentDisposition, withActor } from "@/server/route-util";

export const runtime = "nodejs";

export const GET = withActor<{ params: Promise<{ id: string }> }>(async (req, actor, { params }) => {
  const { id } = await params;
  const data = await buildReportData(actor, id);
  if (req.nextUrl.searchParams.get("format") === "json") {
    return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": contentDisposition("attachment", `pravah-report-${data.app.reference}.json`), "cache-control": "private, no-store" } });
  }
  const pdf = await renderReportPdf(data);
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": contentDisposition("attachment", `pravah-report-${data.app.reference}.pdf`), "cache-control": "private, no-store" } });
});
