# Aegis — AICTE Application Validation & Compliance Intelligence

**Prototype for Smart India Hackathon 2026 · Problem Statement 26261**
*AI-Powered Application Validation, Document Authentication and Regulatory Compliance Verification*

Aegis helps authorised personnel validate institutional applications and their supporting documents against configurable requirements, institutional records and issuing-authority sources. Every finding states **what was checked, the evidence used, the rule applied and the action required**.

> **Decision support only.** Aegis's outputs are not an official AICTE approval, not a definitive finding of fraud, and not a substitute for inspection or statutory scrutiny. Final regulatory decisions remain with competent authorities. "Aegis" is a prototype name; it is not an official AICTE product. **All data is synthetic** and no official verification source is connected.

---

## Contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Demo accounts](#demo-accounts)
4. [Demo scenarios](#demo-scenarios)
5. [Architecture](#architecture)
6. [Tech stack](#tech-stack)
7. [Environment variables](#environment-variables)
8. [Documents, extraction and OCR](#documents-extraction-and-ocr)
9. [Validation rules engine](#validation-rules-engine)
10. [Issuer verification adapters](#issuer-verification-adapters)
11. [Tests](#tests)
12. [Security](#security)
13. [Troubleshooting](#troubleshooting)
14. [Known limitations](#known-limitations)

See also: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/FEATURES.md`](docs/FEATURES.md) (implemented vs. future) · [`docs/DEMO.md`](docs/DEMO.md) (5-minute demo script).

---

## What it does

Workflow: **Application → Documents → Validation → Verification → Review**

| Capability | How |
|---|---|
| Document intelligence | Upload PDF/PNG/JPEG (type, size and **content** validated). Embedded PDF text is extracted with line-level bounding boxes; scanned PDFs and images are OCR'd locally with Tesseract. Structured fields are saved with confidence, page, excerpt, bounding box and method. Unknown values stay unknown. |
| Deterministic validation | Versioned, declarative rules: completeness, mandatory fields, validity dates, date order, cross-document consistency (normalised), institutional-record matching, duplicate files/references, configurable field conditions. Results: `PASS`, `FAIL`, `REVIEW_REQUIRED`, `NOT_APPLICABLE`, `PROCESSING_FAILED`, `PENDING`. |
| Anomaly indicators | Separate heuristic layer: files reused across applications, repeated reference numbers, PDF metadata inconsistencies, editing-software producers, near-duplicate content with different identifiers. Always labelled as *indicators*, never as fraud. |
| Issuer verification | Pluggable adapters with timeouts and bounded retries. Clearly labelled **SIMULATED** demo sources; a configurable official-provider adapter (inactive without credentials); manual confirmation recorded as **MANUAL**. Unsupported categories are recorded as `NOT_SUPPORTED`, never as verified. |
| Human review | Review queue, resolve / dismiss / request information / escalate / internal notes. Every action requires a reason and is audited. |
| Rectification | Officers return specific findings; institutions replace evidence (versions retained) and resubmit; validation re-runs and shows a result-by-result diff. Replacing one document never clears an unrelated finding. |
| Recorded decisions | Senior officials record an outcome with reasons and a reference, labelled as a *recorded human review action*. |
| Audit, reports, alerts | Append-only audit log (DB triggers block UPDATE/DELETE), CSV exports, PDF/JSON validation report, in-app notifications. |

### Look and feel

Three brand colours, taken from the dashboard artwork, are used across the site: **royal blue `#15509A`**, **saffron `#B85A00`** and **green `#1D7A45`**, on sky-tinted neutrals (page background `#EEF5FD`). Brighter shades of saffron and green (`#F59F25`, `#4CC26A`) appear only in decorative stripes, never as text; all text colours meet WCAG AA contrast on white. Red appears only for failures and errors, so a failure is never confused with a warning. Each role has its own colour and its own dashboard:

| Role | Colour | Portal name | Dashboard focus |
|---|---|---|---|
| Institution Applicant | Green | Institution Portal | My applications, rectification requests with due dates, "What you need to do" |
| Scrutiny & Verification Officer | Royal blue | Scrutiny & Verification Desk | Work queues (validation, review, verification), attention list, recent activity |
| Senior Official | Saffron | Competent Authority Desk | Applications awaiting a decision (with the forwarding note), recent decisions |
| Administrator | Dark blue + saffron | Administration Console | Users, rules, sources, audit volume, configuration changes |

Every page, including both sign-in pages, sits on the project artwork (`public/backgrounds/aegis-backdrop.webp`: a campus, a map of India and a document being checked, with a tricolour wave). Dashboards and the sign-in pages show it clearly behind frosted panels; other pages fade it under a light scrim so tables stay readable. The artwork contains no state emblem or seal: the emblem in the source image was replaced with the Aegis shield-and-check mark, because the State Emblem of India may not be used without authorisation and the prototype must not look like an official government product.

## Quick start

**Prerequisites:** Node.js 20+ (tested on 22) and npm. No external services, API keys or system OCR packages are needed. OCR language data ships with the npm package `@tesseract.js-data/eng`.

```bash
npm install            # .npmrc sets legacy-peer-deps (works around an npm peer-resolution bug)
cp .env.example .env   # defaults work as-is for the local demo
npm run db:reset       # create the local SQLite DB, apply migrations, seed the demo dataset (~15 s)
npm run dev            # http://localhost:3000
```

Production mode:

```bash
npm run build && npm start
```

Other commands:

| Command | Purpose |
|---|---|
| `npm run db:deploy` | Apply migrations only |
| `npm run db:seed` | Seed an **empty** database (refuses if data exists) |
| `npm run db:reset` | Delete the **local SQLite file**, migrate and seed. Refuses to run against non-SQLite URLs. |
| `npm run samples` | Regenerate the synthetic upload files in `samples/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; starts its own server on port 3100 with an isolated DB) |

## Demo accounts

There are **two separate sign-in pages**, and the server only accepts each account on its own page:

| Who | Sign in at | Lands in |
|---|---|---|
| Institutions | **http://localhost:3000/institution/login** (green) | the **Institution Portal** (`/portal`) |
| AICTE officials and administrators | **http://localhost:3000/login** (royal blue) | the official workspace (Command Centre) |

A switch at the top of each page links to the other. An institution account used on the official page (or a staff account on the institution page) is refused with a message pointing to the right page, and the attempt is audited.

Password for every account: **`Aegis@Demo2026`** (stored as scrypt hashes; each sign-in page lists its demo accounts when `DEMO_MODE=true`).

| Role | Email | Use it to… |
|---|---|---|
| Scrutiny & Verification Officer | `scrutiny@aegis.demo` | run validation and issuer verification, record manual confirmation, review all findings (rules, anomalies, verification), request rectification, forward |
| Senior Official / Competent Authority | `senior@aegis.demo` | record the authorised review outcome |
| System / Rules Administrator | `admin@aegis.demo` | users, versioned rules, issuer sources, settings |
| Institution Applicant | `applicant.<slug>@aegis.demo` | upload / replace documents, view results, submit rectification |

One officer role handles both scrutiny and issuer verification: the system checks every document automatically, and the officer only reviews the exceptions it cannot decide. Separation of duties is kept between the institution (submits), the officer (checks and forwards), the senior official (decides) and the administrator (configures).

Applicant slugs: `sunrise`, `lakeview`, `meridian`, `coastal`, `northfield`, `riverside`, `highland`, `greenfield`, `valley`. Each applicant can only see their own institution's records.

### Institution Portal

Institution users get their own simpler area (green, top navigation, no official sidebar):

| Page | What it does |
|---|---|
| **Home** (`/portal`) | Welcome banner, counts, **Action required** (correction requests with due dates, information requests, drafts, failed checks), application cards with a five-step tracker (Submitted → Documents → Automatic checks → AICTE review → Outcome) |
| **My applications** | Every application as a card with its status and next step |
| **New application** | Details pre-filled from the institutional record; then goes straight to document upload |
| **Application page** | Plain-language status and next step. **Overview**: recorded outcome (if any), correction request with "Upload replacement" and **Submit corrections and revalidate**, issues to fix with "What you need to do", verification status (labelled simulated). **Documents**: checklist with upload / replace / withdraw. **Check results**: failed and passed checks with "What changed since" the previous check. **History**: status timeline, correction requests and AICTE actions (internal notes hidden) |
| **Document page** | What the system read from the document, highlighted on the page; replace or download |
| **Help** | How the process works, what each status means, required documents per application type, FAQ |

Institution users who open an official-area link (for example from an old notification) are sent to the matching portal page; officials cannot open the portal.

## Demo scenarios

The seed builds every application **through the real pipeline** (rendered synthetic PDFs/PNG → upload → extraction/OCR → rules → anomaly analysis → simulated verification → workflow), so results are reproducible after `npm run db:reset`.

| Ref | Institution (fictional) | Scenario | Seeded status | Why |
|---|---|---|---|---|
| AEG-2027-000001 | Sunrise Institute of Technology | Clean application | Automated checks passed | All evidence present, consistent and verified by simulated sources |
| AEG-2027-000002 | Lakeview College of Engineering | Missing document | Rectification required | Fire NOC (mandatory) not submitted; officer returned the application |
| AEG-2027-000003 | Meridian Institute of Management | Expired certificate | Automated checks failed | NOC valid until 31/03/2027 does not cover AY 2027-28 start (01/07/2027) — demo rule `DATE-VAL-001` v2 |
| AEG-2027-000004 | Coastal Institute of Pharmacy | Cross-document mismatch | Automated checks failed | Affidavit ID `AEG-INST-1044` ≠ `AEG-INST-1040`; previous-approval intake 60 ≠ 100. The abbreviated name "Coastal Inst. of Pharmacy" is correctly treated as consistent |
| AEG-2027-000005 | Northfield School of Architecture | Issuer mismatch | Review required | Simulated registry validity (09/01/2028) ≠ certificate (09/01/2031) |
| AEG-2027-000006 | Riverside Polytechnic Institute | Manual review | Review required | Scanned NOC (OCR); issuer pending; accreditation source unavailable; fee receipt not found |
| AEG-2027-000007 | Highland Institute of Technology | Duplicate & suspicious metadata | Review required | Same file used for two checklist items; receipt reuses another institution's reference; PDF metadata indicators |
| AEG-2027-000008 | Greenfield College of Engineering | Awaiting validation | Draft | Documents processed, validation not yet run |
| AEG-2027-000009 | Valley Institute of Technology | Ready for authorised review | Ready for authorised review | Clean, verified and forwarded by the scrutiny officer |

Files for live uploads are in [`samples/`](samples/): `meridian-fire-noc-renewed.pdf` (fixes AEG-…003), `lakeview-fire-noc.pdf` (fixes AEG-…002), `coastal-affidavit-corrected.pdf`, `scanned-noc-sample.png` (OCR), `greenfield-*.pdf` (complete the draft), and `invalid-renamed-file.pdf` (a text file renamed to `.pdf`, which is rejected).

## Architecture

```
src/
  lib/                      Pure domain logic — no DB, no Next.js (unit-tested)
    extraction/             PDF text + bboxes (unpdf/pdf.js), OCR adapter (tesseract.js), field extractor, dates, normalisation
    validation/             Rule definition schemas (Zod), deterministic engine, status derivation, run diff
    anomaly/                Heuristic anomaly indicators (separate from rules)
    verification/           Issuer adapter interface, synthetic/registry/official adapters, timeout+retry executor
    auth/                   RBAC permission matrix, scrypt password hashing
    workflow/               Application state machine
    report/                 PDF report renderer (pdfkit)
  server/                   DB-backed services; every function takes an explicit Actor and enforces permissions
    applications, documents, validation, verification, findings, workflow, rules, compliance,
    dashboard, reports, audit, audit-log, notifications, admin, settings, storage, auth, session
  app/                      Next.js App Router: pages, server actions (thin), route handlers (upload/download/report/CSV)
  components/               UI primitives (shadcn-style), shell, domain components
prisma/                     Schema, migrations (incl. append-only audit triggers)
scripts/                    Seed, safe local reset, sample generator, synthetic document renderer
tests/                      unit/, integration/ (real SQLite), e2e/ (Playwright)
```

The four intelligence layers are independent: **(1) extraction → (2) deterministic validation → (3) issuer verification → (4) evidence-linked findings and human review.** No layer can clear another layer's failure; only an authorised human can resolve or dismiss a finding, with a reason. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tech stack

Next.js 15 (App Router, React 19, TypeScript) · Tailwind CSS v4 with hand-written shadcn-style components on Radix primitives · Lucide icons · Prisma 6 + SQLite (portable to PostgreSQL) · Zod · unpdf (pdf.js) · tesseract.js + `@tesseract.js-data/eng` · `@napi-rs/canvas` (page rasterisation for OCR and previews) · pdfkit · Vitest · Playwright.

No language model is used. The anomaly layer is deterministic and testable; an LLM was not added because it offered no clear, testable benefit over the heuristics and would require sending documents to an external service.

## Environment variables

See [`.env.example`](.env.example). Placeholders only — never commit real secrets.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite file (relative to `prisma/`). For PostgreSQL, change `provider` in `prisma/schema.prisma` and regenerate migrations. |
| `STORAGE_DIR` | `./storage` | Private document store (outside `public/`). |
| `MAX_UPLOAD_MB` | `15` | Default per-file limit (also adjustable in System Settings). |
| `SESSION_TTL_HOURS` | `12` | Session lifetime. |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS. |
| `DEMO_MODE` | `true` | Show demo accounts on the sign-in page. |
| `OCR_ENABLED` | `true` | `false` disables OCR (scanned documents then fail with an explicit message). |
| `OCR_LANG_PATH` | — | Override Tesseract language-data directory. |
| `OFFICIAL_ISSUER_API_URL`, `OFFICIAL_ISSUER_API_KEY`, `OFFICIAL_ISSUER_NAME`, `OFFICIAL_ISSUER_CATEGORIES`, `OFFICIAL_ISSUER_SOURCE_TYPE` | blank | Official verification provider. Inactive unless URL, key and categories are all set. |

## Documents, extraction and OCR

- **Accepted:** PDF, PNG, JPEG up to the configured limit. Extension, declared MIME type and magic bytes must agree; the original filename is sanitised and files are stored under random 48-hex-character names with no extension.
- **Pipeline:** validate → store privately → create version → extract the PDF text layer (lines plus normalised bounding boxes) → rasterise and OCR any page with no text layer (up to 10 pages) → normalise → extract fields → save with confidence, page, excerpt, bbox and method → mark `PROCESSED` or `FAILED` with an actionable message.
- **Fields:** institution name, institution identifier, issuing authority, reference number, issue date, expiry date, programme, approved intake, academic year, accreditation details, built-up area, faculty count, amount, and signature/seal indicator (a text cue or PDF signature field — **not** a cryptographic validation). Dates are parsed day-first (Indian convention); impossible dates are rejected, never guessed.
- **Confidence:** about 0.95 for labelled embedded text; OCR line confidence × 0.9 for OCR; lower for heuristics or values found on the line after their label. Values below the low-confidence threshold (default 0.6) go to human review.
- **Corrections:** authorised officers can correct a field. The machine value is kept; the correction, its reason and the reviewer are audited, and the next validation run uses it.
- **OCR runs locally** (WebAssembly; no external service). If the language data is missing or `OCR_ENABLED=false`, the UI says so explicitly and scanned documents fail with that reason. OCR never silently "succeeds".
- **Previews:** PDF pages are rasterised server-side to PNG, so no active PDF content is rendered in the browser. Highlights are drawn from stored bounding boxes.

## Validation rules engine

Rules are declarative `{checkType, definition}` pairs validated by Zod. Administrators build them from supported check types in **Validation Rules** — arbitrary code and regular expressions are never accepted. Each save creates an **immutable version** with an effective date, change note, severity, template scope and remediation guidance. Every validation run stores the exact rule versions used, and every result stores rule ID and version, status, explanation, expected value, observed value, evidence references (document, page, excerpt, confidence), severity, next action and timestamp.

Insufficient evidence (missing or low-confidence values) yields `REVIEW_REQUIRED`, not `FAIL`; technical failures yield `PROCESSING_FAILED`.

**All seeded rules are sample/demonstration rules**, not verified AICTE regulations (for example, the 4,000 m² built-up-area threshold is explicitly a sample). No regulatory citation is recorded unless an administrator enters a verified source reference.

Application statuses follow an explicit state machine (`src/lib/workflow/transitions.ts`); the server rejects invalid transitions. `AUTO_PASSED` means only that the applicable machine-checkable rules passed.

## Issuer verification adapters

Interface: `src/lib/verification/types.ts` (`IssuerAdapter.supports(category)`, `verify(request, signal)` → normalised `VerificationResponse` with status, source timestamp, returned fields, per-field comparisons, limitation/error, response reference).

| Adapter | Type | Behaviour |
|---|---|---|
| `synthetic-demo-issuer` | **SIMULATED** | Fictional records (NOCs, accreditation, fee receipts) with configurable behaviours: match, mismatch, expired, no record, pending, unavailable. A "simulate outage" switch lives in System Settings. |
| `demo-institution-registry` | **SIMULATED** | Compares previous-approval letters with the synthetic institutional records. |
| `official-provider` | SANDBOX/REAL | HTTP adapter for a future authorised API. Inactive until configured. |
| Manual confirmation | **MANUAL** | Officer-recorded outcome with mandatory reason and reference. |

The executor applies a per-attempt timeout and bounded retries (at most 5 attempts in total, default 3) with exponential backoff for transient failures.

**To integrate a real authorised API:** obtain authorised access → align `OfficialResponseSchema` and the request body in `createOfficialProviderAdapter` (`src/lib/verification/adapters.ts`) with the provider's specification → set `OFFICIAL_ISSUER_*` variables (keep the key in a secret manager) → set `OFFICIAL_ISSUER_SOURCE_TYPE=SANDBOX` until production approval → verify that responses appear with the correct source label. No other code changes are needed: the orchestrator picks the first enabled adapter that supports a category.

## Tests

| Suite | Command | What it covers |
|---|---|---|
| Unit (49) | `npm test` | Date parsing, normalisation, field extraction, upload validation, every rule check type, status derivation, transitions, run diff, verification adapters (all outcomes, timeout, bounded retries), permissions, anomaly detection |
| Integration (24) | `npm test` | Real SQLite DB seeded through the real pipeline: auth and rate limiting, isolation, application creation, upload rejection, PDF/PNG/scanned-PDF processing, validation persistence, corrections, verification (outage, unsupported, manual), review reasons, rectification (unrelated findings preserved, corrected findings cleared), forward/decision, append-only audit, report redaction |
| E2E (4) | `npm run test:e2e` | Sign-in failures, server-side RBAC and cross-institution isolation, upload rejection, and the full journey: findings → rectification → replacement → revalidation diff → simulated verification → forward → recorded decision → audit trail → PDF report |

## Security

- Server-side RBAC on every page, server action, route handler, download and export (`src/lib/auth/permissions.ts`). The UI only hides controls as a convenience. Applicants are isolated by institution; out-of-scope records return "not found".
- Passwords use scrypt (salted, memory-hard). Sessions are opaque random tokens stored only as SHA-256 hashes, in `HttpOnly`, `SameSite=Lax` cookies (`Secure` when `COOKIE_SECURE=true`). Sign-in is rate-limited per IP and account.
- CSRF: server actions use Next.js's built-in origin check; mutating route handlers reject cross-origin requests.
- Uploads: size, extension, MIME and magic-byte checks; random storage names; path-traversal-safe storage keys; private storage outside the web root; downloads sent as attachments with `nosniff` and a sandbox CSP.
- Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`); safe, generic error messages (no stack traces or paths shown); CSV exports neutralise formula injection.
- The audit log is append-only in the service layer and enforced by SQLite triggers. It never contains passwords, tokens or document text.
- Secrets live only in environment variables. Nothing secret is sent to the browser.

**Deployment notes:** replace local disk storage (`src/server/storage.ts`) with an encrypted object store; use PostgreSQL with an equivalent trigger or REVOKE on the audit table; move the in-memory rate limiter to a shared store; serve over HTTPS with `COOKIE_SECURE=true`; disable `DEMO_MODE`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm install` fails with `Cannot read properties of null (reading 'edgesOut')` | Make sure the repo's `.npmrc` (`legacy-peer-deps=true`) is present, or run `npm install --legacy-peer-deps`. |
| Seed says "Database already contains data" | Use `npm run db:reset`. |
| Scanned documents fail with "OCR is unavailable" | Reinstall dependencies (`@tesseract.js-data/eng`), check `OCR_ENABLED`, or set `OCR_LANG_PATH`. |
| `@napi-rs/canvas` load error | Your platform needs the matching prebuilt binary: delete `node_modules` and reinstall on the target OS. |
| Uploads rejected as too large | Raise the limit in System Settings (maximum 50 MB). |
| Port in use | `npm run dev -- -p 3001`. |

## Known limitations

- **No official verification is connected.** All automated verification results come from simulated sources with fictional records and are labelled as such.
- Field extraction is label-anchored and heuristic. It works on typical certificate layouts, not arbitrary free-form documents; tables and multi-value fields (several programmes on one letter) are not parsed.
- OCR is English-only and processes at most 10 scanned pages per document. Handwriting and stamps are not interpreted.
- Signature/seal detection is a text or structure cue only; there is no cryptographic signature validation.
- Image analysis is limited to a preliminary evidence note (dimensions/resolution); physical infrastructure compliance is not assessed.
- Processing is synchronous, which is suitable for prototype-sized files; the services are structured so a job queue can be added later.
- Database-level immutability of the audit log relies on SQLite triggers, which a DB administrator could still drop. Production should add access controls and/or write-once storage.
- The in-memory login rate limiter is per process. E-mail notifications are not implemented; notifications are in-app only.
