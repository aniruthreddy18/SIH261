import { BellRing, Power } from "lucide-react";
import { getSettings, SETTING_DEFS } from "@/server/settings";
import { prisma } from "@/server/db";
import { pageGuard } from "@/server/session";
import { getOcrEngine } from "@/lib/extraction/ocr";
import { setIssuerSourceAction, sweepAlertsAction } from "@/app/actions/admin";
import { PageHeader, Notice } from "@/components/page-header";
import { AccessDenied } from "@/components/access-denied";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-dialog";
import { SourceTypeBadge } from "@/components/status";
import { SettingsForm, type SettingRow } from "./settings-form";

export const metadata = { title: "System Settings" };

export default async function SettingsPage() {
  const { denied } = await pageGuard("settings.manage");
  const crumbs = [{ label: "Administration" }, { label: "System Settings" }];
  if (denied) return (<><PageHeader title="System Settings" crumbs={crumbs} /><AccessDenied /></>);
  const [settings, sources] = await Promise.all([getSettings(), prisma.issuerSource.findMany({ orderBy: { name: "asc" } })]);
  const ocr = getOcrEngine().status();
  const rows: SettingRow[] = Object.entries(SETTING_DEFS).map(([key, d]) => ({ key, label: d.label, help: d.help, type: d.type, value: settings[key as keyof typeof settings], min: "min" in d ? d.min : undefined, max: "max" in d ? d.max : undefined }));
  const officialConfigured = Boolean(process.env.OFFICIAL_ISSUER_API_URL && process.env.OFFICIAL_ISSUER_API_KEY);
  return (
    <>
      <PageHeader title="System Settings" crumbs={crumbs} description="Runtime configuration for processing, validation thresholds, issuer verification and alerting. Every change is audited." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Processing, validation and alerting" />
          <CardBody><SettingsForm rows={rows} /></CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Environment" description="Read-only. Secrets are never displayed." />
            <CardBody className="space-y-2 text-xs">
              <p className="flex items-center justify-between gap-2"><span className="text-muted">OCR engine</span>{ocr.available ? <Badge tone="ok">Available (Tesseract)</Badge> : <Badge tone="bad">Unavailable</Badge>}</p>
              {!ocr.available && <p className="text-bad">{ocr.reason}</p>}
              <p className="flex items-center justify-between gap-2"><span className="text-muted">Official issuer provider</span>{officialConfigured ? <Badge tone="ok">Configured</Badge> : <Badge tone="neutral">Not configured</Badge>}</p>
              <p className="flex items-center justify-between gap-2"><span className="text-muted">Document storage</span><span className="font-mono">private local disk</span></p>
              <p className="flex items-center justify-between gap-2"><span className="text-muted">E-mail delivery</span><Badge tone="neutral">Not configured — in-app only</Badge></p>
              <p className="flex items-center justify-between gap-2"><span className="text-muted">Demo mode</span><span>{process.env.DEMO_MODE !== "false" ? "on" : "off"}</span></p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Issuer sources" description="Enable or disable verification adapters." />
            <ul className="divide-y divide-border">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-4 py-2.5 text-xs">
                  <div className="min-w-0 flex-1"><p className="font-medium text-ink">{s.name}</p><SourceTypeBadge type={s.sourceType} /></div>
                  <ActionButton label={s.enabled ? "Disable" : "Enable"} icon={<Power />} size="xs" variant={s.enabled ? "outline" : "default"} action={setIssuerSourceAction.bind(null, s.id, !s.enabled)} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Alerting" description={`Creates in-app alerts for HIGH/CRITICAL findings unresolved for more than ${settings.highSeverityAlertDays} day(s). Deduplicated per finding.`} />
            <CardBody><ActionButton label="Run alert sweep now" icon={<BellRing />} variant="outline" action={sweepAlertsAction} /></CardBody>
          </Card>
          <Notice tone="info">Retention: documents and audit events are never physically deleted by the application. Withdrawn documents are retained and marked as withdrawn.</Notice>
        </div>
      </div>
    </>
  );
}
