import { RadioTower, RotateCcw, UserCheck } from "lucide-react";
import { hasPermission, type Actor } from "@/lib/auth/permissions";
import { runVerificationAction, manualVerificationAction } from "@/app/actions/workflow";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice, EmptyState } from "@/components/page-header";
import { ActionButton, ActionDialog } from "@/components/action-dialog";
import { VerificationCard } from "@/components/app/verification-card";
import type { Coverage, Detail } from "./types";

export function VerificationTab({ detail, coverage, actor }: { detail: Detail; coverage: Coverage; actor: Actor }) {
  const { app, documents, verifications } = detail;
  const canRun = hasPermission(actor.role, "verification.run") && !["PROCESSING", "CLOSED"].includes(app.status);
  const canManual = hasPermission(actor.role, "verification.manual") && app.status !== "CLOSED";
  const verifiedDocIds = new Set(verifications.map((v) => v.documentId));
  const docs = documents.filter((d) => d.state === "ACTIVE" && (verifiedDocIds.has(d.id) || coverage.some((c) => c.documentId === d.id)));
  return (
    <div className="space-y-4">
      <Notice tone="warn" title="About verification sources in this environment">
        No authorised AICTE or issuing-authority API is connected. Verification uses clearly labelled <strong>simulated</strong> sources with fictional records, plus manual confirmation by an authorised officer. A simulated result is never presented as an official verification, and an unsupported document type is recorded as <em>Not supported</em> — never as verified.
      </Notice>
      {docs.length === 0 && <Card><EmptyState icon={<RadioTower />} title="No verifiable documents" description="Documents in categories that require issuer verification will appear here once uploaded." /></Card>}
      {docs.map((d) => {
        const current = d.versions.find((v) => v.isCurrent)!;
        const history = verifications.filter((v) => v.documentId === d.id);
        const forCurrent = history.filter((v) => v.documentVersionId === current.id);
        const cov = coverage.find((c) => c.documentId === d.id);
        return (
          <Card key={d.id}>
            <CardHeader
              title={`${d.category.name} — ${current.originalName} (v${current.versionNo})`}
              description={cov ? (cov.covered ? "Current version verified." : forCurrent.length ? "Current version not yet verified." : "Verification has not been run for the current version.") : "Verification optional for this category."}
              actions={
                <>
                  {canRun && <ActionButton label={forCurrent.length ? "Retry" : "Verify"} pendingLabel="Verifying…" icon={forCurrent.length ? <RotateCcw /> : <RadioTower />} size="xs" variant="outline" action={runVerificationAction.bind(null, app.id, d.id)} />}
                  {canManual && (
                    <ActionDialog
                      label="Manual confirmation"
                      icon={<UserCheck />}
                      size="xs"
                      title="Record manual verification"
                      description="Use after confirming directly with the issuing authority (e.g. by letter or official email). Recorded as MANUAL confirmation with your name — never as an automated source response."
                      fields={[
                        { name: "outcome", label: "Outcome", type: "select", options: [{ value: "VERIFIED", label: "Confirmed authentic and matching" }, { value: "MISMATCH_DETECTED", label: "Mismatch confirmed with issuer" }] },
                        { name: "reference", label: "Confirmation reference (letter no., email ref.)", minLength: 3 },
                        { name: "reason", label: "Details of confirmation", type: "textarea" },
                      ]}
                      action={manualVerificationAction.bind(null, d.id)}
                    />
                  )}
                </>
              }
            />
            <CardBody className="space-y-2">
              {history.length === 0 && <p className="text-xs text-muted">No verification attempts yet.</p>}
              {history.map((v) => (
                <div key={v.id} className={v.documentVersionId !== current.id ? "opacity-60" : ""}>
                  {v.documentVersionId !== current.id && <p className="mb-1 text-[11px] text-muted">Earlier document version — historical</p>}
                  <VerificationCard v={v} />
                </div>
              ))}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
