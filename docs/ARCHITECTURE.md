# Aegis architecture

## Principles

1. **Separate intelligence from decisions.** Extraction, deterministic validation, anomaly analysis and issuer verification each produce evidence. None of them approves anything, and none can clear another layer's failure. Only an authorised human resolves or dismisses a finding, and always with a reason.
2. **Pure core, thin edges.** `src/lib` contains side-effect-free domain logic with no database or framework imports. `src/server` services take an explicit `Actor`, enforce permissions and persist results. `src/app` (pages, server actions, route handlers) authenticates, delegates and renders.
3. **Never fake success.** OCR, verification, tests and processing report what actually happened. Unknown values stay unknown, an unsupported source is `NOT_SUPPORTED`, and a technical failure is `PROCESSING_FAILED`.
4. **History is evidence.** Document versions, rule versions, validation runs, rule results, findings, verifications, review actions and audit events are retained, never overwritten.

## Layers

```
            ┌─────────────────────────── Layer 1: Extraction (src/lib/extraction) ───────────────────────────┐
 upload ──► │ checkUpload (ext+MIME+magic) → private storage → pdf.js text layer with line bboxes            │
            │ → OCR (tesseract.js) for pages without text → field extractor (label-anchored, typed, scored)    │
            └────────────────────────────── ExtractedField{value, confidence, page, excerpt, bbox, method} ───┘
                                                     │  (+ reviewer corrections, audited)
            ┌──────────────── Layer 2: Deterministic validation (src/lib/validation) ───────────────┐
            │ ApplicationContext (application, checklist, current doc versions, institutional record) │
            │ × active RuleVersions (declarative, Zod-validated) → RuleOutcome[] with evidence        │
            │ Anomaly heuristics (src/lib/anomaly) run alongside as investigative indicators          │
            └─────────────────────────────────────────────────────────────────────────────────────────┘
                                                     │
            ┌──────────────── Layer 3: Issuer verification (src/lib/verification) ─────────────────┐
            │ IssuerAdapter.supports/verify → executeVerification (timeout, bounded retries)          │
            │ SIMULATED demo sources · official-provider (configurable) · MANUAL confirmation          │
            └─────────────────────────────────────────────────────────────────────────────────────────┘
                                                     │
            ┌──────────────── Layer 4: Findings & human review (src/server) ───────────────────────┐
            │ Findings keyed by fingerprint → review queue → resolve/dismiss/escalate/request info     │
            │ → rectification → revalidation diff → forward → recorded human decision → audit         │
            └─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Data model (Prisma)

- **Identity:** `User` (role, optional institution), `Session` (hashed token).
- **Records:** `Institution`, `InstitutionProgramme` (the "available institutional records").
- **Configuration:** `DocumentCategory` (expected fields, verification required), `ApplicationTemplate`, `RequiredDocument` (checklist), `ValidationRule` + immutable `RuleVersion`, `ComplianceRequirement`, `IssuerSource`, `SyntheticIssuerRecord`, `SystemSetting`.
- **Applications:** `Application`, `ApplicationProgramme`, `StatusChange`, `Counter` (server-generated references).
- **Evidence:** `Document` (logical slot) → `DocumentVersion` (file, hash, processing state, page text JSON, metadata) → `ExtractedField` (machine value and correction kept side by side).
- **Results:** `ValidationRun` (rule versions used, machine outcome, summary) → `RuleResult`; `Finding` (source RULE / ANOMALY / VERIFICATION, outcome class, status lifecycle); `IssuerVerification`.
- **Workflow:** `ReviewAction`, `RectificationRequest`, `ComplianceNote`, `Notification`, `AuditEvent` (append-only; SQLite triggers block UPDATE/DELETE).

## Finding lifecycle

Fingerprint = `RULE|<rule>|<subject>`, `ANOMALY|<type>|<doc>`, or `VERIFY|<doc>`.

- A failing result with no active finding creates one (`OPEN`). If an active finding already exists, it is updated in place.
- A later run where the check passes marks the finding `AUTO_CLEARED` (kept as history).
- A reviewer `RESOLVED`/`DISMISSED` a finding: it stays closed while the evidence is unchanged (same document version and observed value). New failing evidence opens a fresh finding.
- Replacing a document clears only that document's verification finding (re-verification is required). Rule findings change only when the checks re-run, so an unrelated finding is never cleared.

## Application status

`deriveApplicationStatus(openFindings, lastMachineOutcome)`: any open `PROCESSING_FAILED` finding gives `PROCESSING_FAILED`; else any open `FAIL` gives `AUTO_FAILED`; else any open finding gives `REVIEW_REQUIRED`; otherwise `AUTO_PASSED`, but only if the last machine outcome was a clean pass (exceptions resolved by humans never count as an automated pass). Human workflow states (`RECTIFICATION_REQUIRED`, `READY_FOR_AUTHORIZED_REVIEW`, `CLOSED`) are never overridden automatically. Forwarding requires no open findings, verification coverage of every verifiable document, and no evidence changed since the last run. All transitions are checked against `TRANSITIONS`.

## Request flow example — "Run validation"

`page.tsx` → `<ActionButton action={runValidationAction.bind(null, id)}>` → server action `runAction` (session → Actor) → `runValidation(actor, id)`:

1. Permission and access checks.
2. Refuse if any document is still processing, or a run is already in progress.
3. Atomically move the application to `PROCESSING` and create the run.
4. Build the context and load the active rule versions in effect.
5. `evaluateRules` and `detectAnomalies`.
6. In one transaction: persist results, upsert or clear findings, audit `RULE_FAILED` and `ANOMALY_FLAGGED`, complete the run, transition the status, notify.
7. On error: mark the run `FAILED` and the application `PROCESSING_FAILED`, with an audited reason.

## Extensibility points

- **New check type:** add a Zod schema in `definitions.ts`, a function in `engine.ts`, and a form block in `rule-form.tsx`.
- **New issuer:** implement `IssuerAdapter` and register it in `server/verification.ts#getAdapters`.
- **New field:** add a `FieldDefinition` (labels and type) and add the key to a category's expected fields.
- **Background jobs:** `processVersion` and `runValidation` are already self-contained, so they can be queued without changing callers.
- **Local AI extraction fallback (implemented, optional):** `src/lib/extraction/ai/`. After label-anchored extraction, expected fields that are still `NOT_FOUND` are put as questions to BERT-SQuAD int8 (ONNX Runtime, local CPU, no network). The WordPiece tokenizer keeps character offsets, so every answer is an exact span of the page text and maps back to page, lines and bounding box. Answers must pass type checks, must not reuse another field's text, and must reach a minimum score. Accepted values are stored as `AI_QA` with confidence capped at 0.75. The rules engine's `needsConfirmation` treats unconfirmed AI values like low-confidence values (REVIEW_REQUIRED). A reviewer confirmation (`correctField`, audited as "Confirmed AI suggestion") is what lets a rule decide. The model never changes rules, verification results or statuses.
- **Generative LLM assistance (future):** e.g. summaries for reviewers. It would take extracted text as untrusted input, produce schema-validated output with the model and version recorded, and never alter rules, verification results or statuses.
