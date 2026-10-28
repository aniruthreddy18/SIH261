# Implemented features vs. future extensions

## Implemented and verified

| Area | Status | Notes |
|---|---|---|
| Authentication (scrypt, hashed session tokens, rate limiting) | ✅ | Integration and E2E tested |
| Server-side RBAC for 4 roles (applicant, scrutiny & verification officer, senior official, administrator), institution isolation | ✅ | Pages, actions, routes, exports; unit, integration and E2E tests |
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
| In-app notifications, ageing alert sweep | ✅ | No e-mail claimed |
| Admin: users, settings, issuer sources | ✅ | |
| Responsive layout (desktop, tablet, phone) | ✅ | Horizontal top navbar that scrolls sideways on small screens |

## Future extensions

- Integration with an authorised AICTE / issuing-authority verification API (the adapter is ready; access is required).
- Background job queue (BullMQ or similar) for large OCR workloads and scheduled alert sweeps.
- Table and multi-value field extraction (several programmes per letter); multilingual OCR (Hindi and regional languages).
- Cryptographic validation of PDF digital signatures (PAdES) and DSC certificates.
- Optional LLM-assisted summarisation and document-type classification, behind the safeguards in `ARCHITECTURE.md`; a multilingual extraction model (Hindi and regional languages).
- Image-forensics comparison for potential alteration (error-level analysis), presented as an indicator only.
- PostgreSQL deployment profile, object storage with encryption at rest, SSO (e.g. a government identity provider), e-mail and SMS notifications.
- Rule test harness ("dry-run this rule version against selected applications") and side-by-side comparison of rule versions.
- Authoritative regulation catalogue with clause-level citations, once verified sources are configured.
