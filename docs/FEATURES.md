# Implemented features vs. future extensions

## PS 26262 coverage

| PS 26262 requirement | Status | Where |
|---|---|---|
| A. Routing through stage combinations (Only Scrutiny, Scrutiny + EVC, EVC + SAC/SHC, Only EVC) | ✅ | `src/lib/workflow/stages.ts`, `src/server/stage-engine.ts`; type → pathway routing in *Workflow & Timelines* |
| A. Automatic movement to the next stage after preliminary processing | ✅ | Every completion advances the pathway; clean preliminary checks route without human action (integration tested) |
| A. Authorised return / revert with reasons | ✅ | Return to institution from any stage (re-entry at re-scrutiny, completed stages not repeated); revert to an earlier stage |
| A. Standardised communications | ✅ | Stage entry, EVC intimation, returns, undertakings and alerts use fixed wording, in-app (no e-mail/SMS) |
| A. Electronic case summary | ✅ | Application **Workflow** tab: pathway tracker, stage history with timelines and outcomes, EVC report, compliance items |
| B. Dashboards across Regions, stages, institutions, officers/committees | ✅ | Pendency Monitor; role dashboards for Regional officer, Bureau, committee member, competent authority, administrator |
| B. Ageing, timelines, workload, bottlenecks, approaching/overdue | ✅ | Ageing buckets, workload by desk, bottleneck table, due-soon and overdue badges |
| B. Audit trail | ✅ | Append-only (DB triggers); every stage movement, EVC action, compliance decision and acknowledgement |
| C. EVC queue, scheduling, completion tracking, reminders, escalation | ✅ | EVC page; schedule-by dates; visit reminders; report-overdue alerts; shorter timelines for new institutions |
| D. Undertakings: conditions, evidence, due dates, online submission, verification, reminders, escalation | ✅ | Compliance Monitor (officials) and portal Compliance (institutions) |
| E. Lease / document validity: advance alerts, renewal submission and verification, overdue escalation | ✅ | Validity register; fire NOC and accreditation auto-registered from extracted dates when an outcome is recorded |
| F. Configurable notifications and automatic escalation | ✅ | Timelines and thresholds configurable; ladder responsible desk → Bureau → competent authority; idempotent sweep |
| F. Consolidated reports (pendency, EVC, undertakings, document validity, overdue, Region-wise) and audit of alerts | ✅ | Reports page, CSV per report, consolidated PDF, stored alert log with recipients and resolution |
| Key requirement: configurable rules and timelines aligned with the APH | ⚠️ | Fully configurable; the shipped values are **samples**, not APH values |
| Key requirement: secure storage, RBAC, human oversight | ✅ | Private hashed storage, server-side RBAC with Region scoping, every decision by an authorised official |
| Regulatory safeguard | ✅ | No automated approval, rejection or regulatory decision anywhere in the code path |

## Implemented and verified

| Area | Status | Notes |
|---|---|---|
| Authentication (scrypt, hashed session tokens, rate limiting) | ✅ | Integration and E2E tested |
| Server-side RBAC for 6 roles (applicant, Regional officer, Approval Bureau officer, committee member, competent authority, administrator), institution isolation, Region scoping | ✅ | Pages, actions, routes, exports; unit, integration and E2E tests |
| Command Centre with DB-derived metrics | ✅ | No hard-coded numbers |
| Separate Institution login and Institution Portal (home, applications, application page, document view, help) | ✅ | Server refuses accounts on the wrong sign-in page; E2E tested |
| Application creation (server reference), templates, programmes | ✅ | Two configurable demo templates |
| Explicit status state machine | ✅ | Invalid transitions rejected |
| Secure upload (type, size, magic bytes), private storage, versioning, withdrawal | ✅ | Replacements retain history |
| PDF text extraction with bounding boxes | ✅ | unpdf / pdf.js |
| OCR for images and scanned PDFs (local Tesseract) | ✅ | Explicit message if unavailable |
| Structured fields with confidence, page, excerpt, bbox, method | ✅ | Unknown stays unknown |
| Local AI extraction fallback (BERT-SQuAD int8, ONNX, offline) for fields stated in prose | ✅ | Optional (`npm run ai:setup`); grounded spans, type checks, reviewer confirmation required; unit + E2E tested |
| Audited field corrections (machine value retained) | ✅ | |
| Server-rendered previews with evidence highlighting | ✅ | |
| Versioned deterministic rules engine (10 check types) + rule builder | ✅ | No user code executed |
| Cross-document consistency with normalisation | ✅ | Abbreviations, case, punctuation |
| Institutional-record matching | ✅ | |
| Duplicate detection (hash, reference) | ✅ | |
| Anomaly indicators (cross-app reuse, metadata, near-duplicate) | ✅ | Investigative language only |
| Issuer verification adapters: synthetic, registry, official (configurable), manual | ✅ | Timeouts, bounded retries, outage simulation |
| Findings lifecycle, review queue, reasoned actions, escalation, internal notes | ✅ | |
| Rectification request / submission / revalidation diff | ✅ | Unrelated findings preserved (tested) |
| Forward for authorised review with guard conditions | ✅ | |
| Recorded human decision with reason and reference | ✅ | Labelled as human action |
| Compliance matrix (sample requirements) with notes | ✅ | Documentary evidence only |
| Append-only audit trail with filters and CSV export | ✅ | DB triggers |
| PDF / JSON validation report, applications CSV | ✅ | Applicant redaction |
| In-app notifications; scheduled alert and escalation sweep | ✅ | No e-mail or SMS claimed |
| Admin: users, settings, issuer sources | ✅ | |
| Responsive layout (desktop, tablet, phone) | ✅ | Horizontal top navbar that scrolls sideways on small screens |

## Future extensions

- Integration with an authorised AICTE / issuing-authority verification API (the adapter is ready; access is required).
- Background job queue (BullMQ or similar) for large OCR workloads, and the alert sweep as a separate scheduled job.
- APH-aligned pathways and timelines, once the applicable handbook values are confirmed by the Regulation Bureau; per-Region holidays and working-day timelines.
- E-mail / SMS delivery of the standardised communications, and calendar invitations for EVC visits.
- Table and multi-value field extraction (several programmes per letter); multilingual OCR (Hindi and regional languages).
- Cryptographic validation of PDF digital signatures (PAdES) and DSC certificates.
- Optional LLM-assisted summarisation and document-type classification, behind the safeguards in `ARCHITECTURE.md`; a multilingual extraction model (Hindi and regional languages).
- Image-forensics comparison for potential alteration (error-level analysis), presented as an indicator only.
- PostgreSQL deployment profile, object storage with encryption at rest, SSO (e.g. a government identity provider), e-mail and SMS notifications.
- Rule test harness ("dry-run this rule version against selected applications") and side-by-side comparison of rule versions.
- Authoritative regulation catalogue with clause-level citations, once verified sources are configured.
