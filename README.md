# Pravah AI — Integrated AICTE Approval Workflow, Compliance Monitoring & Alerts

**Prototype for Smart India Hackathon 2026 · Problem Statement 26262**
*Integrated AICTE Approval Workflow Automation, Compliance Monitoring and Alert Management System*

Pravah AI tracks every approval application from submission to the recorded outcome, and every approved institution's obligations afterwards. Applications move automatically through their configured stage combination (Only Scrutiny, Scrutiny + EVC, EVC + SAC/SHC, Only EVC); each stage visit has a timeline, reminders and an escalation ladder; Regional, Bureau, committee and competent-authority users each get a dashboard of what is pending, ageing or overdue; Expert Visit Committees are scheduled and tracked; time-bound undertakings and document validity (lease deed, fire NOC, …) are monitored with online submission and official verification; and every movement, alert and decision is in an append-only audit trail. The document-scrutiny tooling — extraction, OCR, versioned validation rules and issuer verification, where every finding states **what was checked, the evidence used, the rule applied and the action required** — supports the scrutiny stage.

> **Decision support only.** Automation routes, tracks and reminds; it never replaces statutory scrutiny or a regulatory decision. Every stage is completed, every application returned or reverted, and every outcome recorded by an authorised official. Pravah AI's outputs are not an official AICTE approval, not a definitive finding of fraud, and not a substitute for inspection. "Pravah AI" is a prototype name; it is not an official AICTE product. **All data is synthetic**, no official verification source is connected, and the pathways, timelines and escalation thresholds are **sample configuration, not values taken from the AICTE Approval Process Handbook (APH)** — configure them per the applicable APH before any real use.

---

## Contents

1. [What it does](#what-it-does)
   - [Approval workflow and monitoring (PS 26262)](#approval-workflow-and-monitoring-ps-26262)
   - [Scrutiny-stage document intelligence](#scrutiny-stage-document-intelligence)
2. [Quick start](#quick-start)
3. [Deploy (Render or Railway)](#deploy-render-or-railway)
4. [Demo accounts](#demo-accounts)
5. [Demo scenarios](#demo-scenarios)
6. [Architecture](#architecture)
7. [Tech stack](#tech-stack)
8. [Environment variables](#environment-variables)
9. [Documents, extraction and OCR](#documents-extraction-and-ocr)
10. [Validation rules engine](#validation-rules-engine)
11. [Issuer verification adapters](#issuer-verification-adapters)
12. [Tests](#tests)
13. [Security](#security)
14. [Troubleshooting](#troubleshooting)
15. [Known limitations](#known-limitations)

See also: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/FEATURES.md`](docs/FEATURES.md) (PS 26262 coverage, implemented vs. future) · [`docs/DEMO.md`](docs/DEMO.md) (demo script).

---

## What it does

### Approval workflow and monitoring (PS 26262)

Pathway: **Submission → (Preliminary checks | Scrutiny) → EVC → SAC/SHC → Competent authority → Compliance monitoring**, with only the stages the application type's pathway prescribes.

| PS 26262 area | How Pravah AI does it |
|---|---|
| **A. Workflow automation** | Each application type is routed to a processing pathway (*Workflow & Timelines*, admin-editable). On submission the engine stores the pathway, opens the first stage with its due date (shorter timelines for new institutions) and notifies the responsible desk and the institution in standard wording. Completing a stage (forward, EVC report, SAC/SHC outcome) moves the application to the next prescribed stage automatically; pathways without a scrutiny desk leave **preliminary checks by themselves** when the automated checks pass and issuer verification is complete. Authorised officials can **return** an application to the institution from any stage (re-entry is at **re-scrutiny**, and stages already completed are not repeated) or **revert** it to an earlier stage, always with recorded reasons. Each application's **Workflow** tab is its electronic case summary: pathway tracker, stage history (entered, due, completed by, outcome, days, remarks), EVC report and compliance items. |
| **B. Dashboards and pendency** | **Pendency Monitor**: Region × stage matrix (overdue highlighted), ageing buckets per stage, workload by desk, bottlenecks (average days and share within timeline per stage), Region-wise performance, and a filterable case list with days in stage and days left. Role dashboards: Regional officer (own Region only), Approval Bureau (all Regions, EVC queue, escalations), committee member (my visits, reports due, SAC/SHC cases), competent authority (decisions awaiting, escalations). Every number is computed from stored stage visits. |
| **C. EVC scheduling** | Applications entering the EVC stage join the **EVC queue** with a schedule-by date. The Bureau or Regional office schedules the visit (date, convenor, members; rescheduling needs a reason); the convenor and the institution are told. The convenor files the report on or after the visit; *satisfactory / not satisfactory* moves the application on, *deficiencies* returns it to the institution. Reminders before the visit, overdue alerts for unscheduled visits and late reports, and escalation. |
| **D. Time-bound undertakings** | The competent authority can attach an undertaking (condition, evidence expected, due date) when recording the outcome, or any time from the Compliance Monitor. The institution sees it in its portal, uploads evidence online (type-checked, hashed), and an official verifies or returns it with remarks. Reminders at two thresholds before the due date, overdue alerts and escalation. |
| **E. Lease / document validity** | A register of prescribed documents (lease deed, fire NOC, building stability, occupancy, accreditation) with validity dates; fire NOC and accreditation dates are added automatically from the extracted certificates when an outcome is recorded. Advance alerts at two thresholds, renewal upload with the new validity date, official verification that moves the register forward, and escalation once expired. |
| **F. Notifications, escalation, reports** | An idempotent **alert sweep** (on a schedule, or on demand by an administrator) raises reminders, overdue alerts and escalations — responsible desk → Approval Bureau (level 2) → competent authority (level 3) — and closes them once the work is done. Every alert is stored (who it went to, when, resolved when), escalations can be acknowledged with the action taken, and consolidated **reports** (pendency, overdue, EVC, undertakings, document validity, Region-wise, alert log) are available on screen, as CSV and as one PDF. |
| **Key requirements** | Timelines, reminder and escalation thresholds and type → pathway routing are configurable and audited; RBAC is enforced on the server for every page, action and download, with Regional officers scoped to their Region; files are stored privately with SHA-256 hashes; the audit trail is append-only at the database level. |

### Scrutiny-stage document intelligence

Scrutiny tooling: **Documents → Validation → Verification → Review**

| Capability | How |
|---|---|
| Document intelligence | Upload PDF/PNG/JPEG (type, size and **content** validated). Embedded PDF text is extracted with line-level bounding boxes; scanned PDFs and images are OCR'd locally with Tesseract. Structured fields are saved with confidence, page, excerpt, bounding box and method. Unknown values stay unknown. |
| Deterministic validation | Versioned, declarative rules: completeness, mandatory fields, validity dates, date order, cross-document consistency (normalised), institutional-record matching, duplicate files/references, configurable field conditions. Results: `PASS`, `FAIL`, `REVIEW_REQUIRED`, `NOT_APPLICABLE`, `PROCESSING_FAILED`, `PENDING`. |
| Anomaly indicators | Separate heuristic layer: files reused across applications, repeated reference numbers, PDF metadata inconsistencies, editing-software producers, near-duplicate content with different identifiers. Always labelled as *indicators*, never as fraud. |
| Issuer verification | Pluggable adapters with timeouts and bounded retries. Clearly labelled **SIMULATED** demo sources; a configurable official-provider adapter (inactive without credentials); manual confirmation recorded as **MANUAL**. Unsupported categories are recorded as `NOT_SUPPORTED`, never as verified. |
| Human review | Review queue, resolve / dismiss / request information / escalate / internal notes. Every action requires a reason and is audited. |
| Rectification | Officers return specific findings; institutions replace evidence (versions retained) and resubmit; validation re-runs and shows a result-by-result diff. Replacing one document never clears an unrelated finding. |
| Recorded decisions | Senior officials record an outcome with reasons and a reference, labelled as a *recorded human review action*. |
| Audit, reports, notifications | Append-only audit log (DB triggers block UPDATE/DELETE), CSV exports, PDF/JSON validation report, in-app notifications. |

### Look and feel

Three brand colours, taken from the dashboard artwork, are used across the site: **royal blue `#15509A`**, **saffron `#B85A00`** and **green `#1D7A45`**, on sky-tinted neutrals (page background `#EEF5FD`). Brighter shades of saffron and green (`#F59F25`, `#4CC26A`) appear only in decorative stripes, never as text; all text colours meet WCAG AA contrast on white. Red appears only for failures and errors, so a failure is never confused with a warning. Each role has its own colour and its own dashboard:

| Role | Colour | Portal name | Dashboard focus |
|---|---|---|---|
| Institution Applicant | Green | Institution Portal | My applications, corrections and compliance deadlines, EVC visit dates, "What you need to do" |
| Regional Officer (Scrutiny & Verification) | Royal blue | Regional Office · Scrutiny Desk | Work queues, approaching and overdue stages, escalations (own Region when assigned one) |
| Approval Bureau Officer | Teal | Approval Bureau · Monitoring | Pendency KPIs, Region × stage matrix, EVC queue, escalations, approaching/overdue cases |
| EVC / Committee Member | Blue | Committee Desk (EVC · SAC/SHC) | My expert visits, reports due, cases before SAC/SHC |
| Competent Authority | Saffron | Competent Authority Desk | Applications awaiting a decision, Region × stage matrix, escalations, recent decisions |
| Administrator | Dark blue + saffron | Administration Console | Users and Regions, workflow pathways and timelines, rules, sources, configuration changes |

Navigation is a horizontal top bar: a gradient header in the role's colour (brand, search, notifications, account) above a frosted row of section links; the active section is a filled pill. Statistic tiles use colour-gradient icons (blue, saffron, teal, green). Every page, including both sign-in pages, sits on the project artwork (`public/backgrounds/pravah-backdrop.webp`: a campus, a map of India and a document being checked, with a tricolour wave). Pages use the full screen width. Cards, panels, menus and both header rows are translucent frosted glass in the style of macOS/iOS materials (light white fill, heavy blur with a gentle saturation boost, bright hairline edge), so the artwork stays visible everywhere while text keeps its contrast. The artwork contains no state emblem or seal: the emblem in the source image was replaced with a neutral shield-and-check mark, because the State Emblem of India may not be used without authorisation and the prototype must not look like an official government product.

## Quick start

**Prerequisites:** Node.js 20+ (tested on 22) and npm. No external services, API keys or system OCR packages are needed. OCR language data ships with the npm package `@tesseract.js-data/eng`.

```bash
npm install            # .npmrc sets legacy-peer-deps (works around an npm peer-resolution bug)
cp .env.example .env   # defaults work as-is for the local demo
npm run db:reset       # create the local SQLite DB, apply migrations, seed the demo dataset (~15 s)
npm run ai:setup       # optional, once: download the local AI model (~119 MB, checksum-verified)
npm run dev            # http://localhost:3000
```

Everything works without `npm run ai:setup`; it only enables the [local AI extraction fallback](#local-ai-extraction-optional).

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
| `npm run ai:setup` | Download and verify the optional local AI model into `models/` (one time; offline afterwards) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; starts its own server on port 3100 with an isolated DB) |

## Deploy (Render or Railway)

Pravah AI is one long-running Node server with a SQLite database and an upload folder on disk, so it needs a host that runs a container; a **persistent volume** keeps the data across restarts. Serverless hosts such as Vercel or Netlify are not suitable. The repository is ready for **[Render](https://render.com)** and **[Railway](https://railway.com)** (both build the same `Dockerfile`).

**Render:** New → **Blueprint** → this repository (Render reads `render.yaml`). The free instance works for a demo — it sleeps when idle and re-creates the demo data on every restart; a paid instance with a disk at `/data` keeps data. See [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md).

**Railway:**

1. New Project → **Deploy from GitHub repo** → this repository (Railway reads `railway.json` and builds the `Dockerfile`).
2. Add a **Volume** to the service with mount path **`/data`** (database and uploads live there).
3. Settings → Networking → **Generate Domain**, then open the URL.

On first start the container applies migrations and seeds the demo data; later deploys keep existing data. No variables are required. See [`docs/DEPLOY_RAILWAY.md`](docs/DEPLOY_RAILWAY.md) for details, optional settings and how to reset the demo. Note that with `DEMO_MODE=true` anyone with the link can sign in with the demo accounts: use synthetic data only.

## Demo accounts

There are **two separate sign-in pages**, and the server only accepts each account on its own page:

| Who | Sign in at | Lands in |
|---|---|---|
| Institutions | **http://localhost:3000/institution/login** (green) | the **Institution Portal** (`/portal`) |
| AICTE officials and administrators | **http://localhost:3000/login** (royal blue) | the official workspace (Command Centre) |

A switch at the top of each page links to the other. An institution account used on the official page (or a staff account on the institution page) is refused with a message pointing to the right page, and the attempt is audited.

Password for every account: **`Pravah@Demo2026`** (stored as scrypt hashes; each sign-in page lists its demo accounts when `DEMO_MODE=true`).

| Role | Email | Use it to… |
|---|---|---|
| Regional Officer (all Regions) | `scrutiny@pravah.demo` | scrutiny: run validation and issuer verification, record manual confirmation, review findings, return for rectification, forward along the pathway; schedule EVCs; verify compliance evidence |
| Regional Officer (Southern Region) | `ro.south@pravah.demo` | the same desk, limited to the Southern Region's institutions, pendency and alerts |
| Approval Bureau Officer | `bureau@pravah.demo` | pendency across Regions, EVC scheduling, undertakings and document validity, return or revert, escalations, consolidated reports |
| EVC / Committee Member | `committee@pravah.demo` (convenor), `committee2@pravah.demo` | submit the EVC report for visits they convene; record SAC/SHC outcomes |
| Competent Authority | `senior@pravah.demo` | record the outcome (optionally with a time-bound undertaking), revert to an earlier stage, acknowledge escalations |
| Administrator | `admin@pravah.demo` | users and Regions, workflow pathways and timelines, rules, issuer sources, settings, alert sweep |
| Institution Applicant | `applicant.<slug>@pravah.demo` | upload / replace documents, view results, submit rectification, submit compliance evidence |

Separation of duties: the institution submits; the Regional officer scrutinises and forwards; the Bureau schedules visits, monitors and verifies compliance; the committee reports and recommends; the competent authority decides; the administrator configures. Nothing in the workflow takes a regulatory decision on its own.

The compact demo has **10 accounts**: the 7 staff accounts above and 3 institution accounts — `applicant.meridian@pravah.demo`, `applicant.northfield@pravah.demo` and `applicant.greenfield@pravah.demo`. Each can only see its own institution's records.

### Institution Portal

Institution users get their own simpler area (green-to-teal header, fewer sections):

| Page | What it does |
|---|---|
| **Home** (`/portal`) | Welcome banner, counts, **Action required** (correction requests with due dates, information requests, drafts, failed checks), application cards with a five-step tracker (Submitted → Documents → Automatic checks → AICTE review → Outcome) |
| **My applications** | Every application as a card with its status and next step |
| **New application** | Details pre-filled from the institutional record; then goes straight to document upload |
| **Application page** | Plain-language status and next step. **Overview**: recorded outcome (if any), correction request with "Upload replacement" and **Submit corrections and revalidate**, issues to fix with "What you need to do", verification status (labelled simulated). **Documents**: checklist with upload / replace / withdraw. **Check results**: failed and passed checks with "What changed since" the previous check. **History**: status timeline, correction requests and AICTE actions (internal notes hidden) |
| **Document page** | What the system read from the document, highlighted on the page; replace or download |
| **Compliance** (`/portal/compliance`) | Undertakings and document validity for the institution: what is due, online upload of evidence or the renewed document (with its new validity date), verification result and remarks |
| **Help** | How the process works, what each status means, required documents per application type, FAQ |

Institution users who open an official-area link (for example from an old notification) are sent to the matching portal page; officials cannot open the portal.

## Demo scenarios

The seed builds every application **through the real pipeline** (rendered synthetic PDFs → upload → extraction/OCR → rules → anomaly analysis → simulated verification → workflow), so results are reproducible after `npm run db:reset`. The default **compact demo** has three applications, one per main story:

| Ref | Institution (fictional) | Story | Seeded status | What to do with it |
|---|---|---|---|---|
| PRV-2027-000001 | Meridian Institute of Management | Expired certificate | Automated checks failed | NOC valid until 31/03/2027 does not cover the AY 2027-28 start (01/07/2027): demo rule `DATE-VAL-001` v2. Return it for rectification; the institution uploads `samples/meridian-fire-noc-renewed.pdf`; revalidation passes; verify, forward, decide |
| PRV-2027-000002 | Northfield School of Architecture | Issuer mismatch | Review required | The simulated registry's validity (09/01/2028) differs from the certificate (09/01/2031). Review the finding, then record a **manual confirmation** on Issuer verification before forwarding |
| PRV-2027-000003 | Greenfield College of Engineering | Draft | Draft | The institution uploads `greenfield-faculty-statement.pdf` and `greenfield-built-up-area.pdf`, runs the checks (all pass), then officer → issuer verification → forward → senior official → closed |

**Workflow cases.** The same three institutions also have applications that show the rest of the workflow, driven through the real stage engine with backdated times (they carry no uploaded documents):

| Ref | Institution | Type → pathway | State |
|---|---|---|---|
| PRV-2027-000004 | Northfield | Increase in intake → Scrutiny + EVC | Expert visit held three days ago; the convenor's report is due |
| PRV-2027-000005 | Greenfield | Change of site → Only EVC | Preliminary checks routed automatically; visit not scheduled, 9 days late, escalated to level 3 |
| PRV-2026-000001 | Meridian | Extension of approval (last year) | Closed; its undertaking (faculty appointments) is 10 days overdue and escalated |

Meridian's current application has been at scrutiny for 20 days (overdue, escalated to level 2). Compliance items: Greenfield's lease deed is due for renewal (renew it from the portal), Northfield's undertaking evidence awaits verification, and Meridian's occupancy certificate expires soon. The seed finishes with an alert sweep; dates are relative to the day you seed.

`DEMO_DATASET=full npm run db:reset` (used by the automated tests) seeds a larger dataset instead: thirteen background institutions spread across the four Regions and every stage, plus six more document scenarios — a clean application, a missing document, a cross-document mismatch, a scanned (OCR) NOC with pending/unavailable sources, duplicate and suspicious-metadata indicators, and an application ready for authorised review. The automated tests always use the full dataset.

Files for live uploads are in [`samples/`](samples/): `meridian-fire-noc-renewed.pdf`, `greenfield-*.pdf`, `ai-demo-noc-prose.pdf` (AI extraction demo), `scanned-noc-sample.png` (OCR), and `invalid-renamed-file.pdf` (a text file renamed to `.pdf`, which is rejected).

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

AI: the optional extraction fallback uses **BERT-SQuAD int8** (ONNX Model Zoo, Apache-2.0) on `onnxruntime-node`, entirely on the local machine. It is an *extractive* question-answering model: it can only point at text in the document. No generative language model is used, and no document leaves the machine. Validation, anomaly analysis and status decisions remain deterministic rules.

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
| `ALERT_SWEEP_INTERVAL_MINUTES` | `60` | Minutes between automatic alert sweeps in the server process; `0` disables the scheduler (administrators can still run a sweep from Alerts). |
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

### Local AI extraction (optional)

Label-anchored extraction needs a label such as "Valid Until:". When a document states an expected field only in prose ("…shall remain in force until 2 March 2029"), a local AI model suggests the value:

1. **Only as a fallback:** it runs only for *expected* fields of the document category that the label extractor could not locate. Labelled documents never touch it.
2. **Local and offline:** BERT-SQuAD int8 (119 MB) on ONNX Runtime (CPU). Install it once with `npm run ai:setup`, which verifies the file's size and SHA-256. About 0.2–0.4 s per question on a laptop CPU, plus ~2 s to load the model on first use.
3. **Grounded:** extractive question answering can only return a span of the document text. Each suggestion keeps its page, the highlighted line(s) and an excerpt centred on the answer.
4. **Checked before acceptance:** the model always returns *some* span, so each answer must also parse as the field's type (a real date, a plain number, an identifier with digits, a name containing "College"/"Institute", an authority naming an organisation). It must not reuse text already assigned to another field, and it must reach a minimum score. Rejections are recorded as processing notes. Confidence is capped at 75%.
5. **Never decisive on its own:** values are stored with method `AI_QA`. Validation rules treat an unconfirmed AI suggestion like a low-confidence value: REVIEW REQUIRED, never PASS or FAIL. An officer checks the highlighted text and clicks **Confirm AI suggestion** (or corrects it). This is audited as "Confirmed AI suggestion for …", and the next validation run decides on the confirmed value.
6. **Transparent:** the field list shows an *AI suggestion* badge (institutions see "an AICTE reviewer will confirm it"). The PDF report marks unconfirmed AI values, and System Settings shows whether the model is active.

The seeded demo always runs with the fallback off (`AI_EXTRACTION_ENABLED=false` inside the seed), so seeded results are identical on every machine. Try it with `samples/ai-demo-noc-prose.pdf`; see `docs/DEMO.md`. Set `AI_EXTRACTION_ENABLED=false` to disable it.

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
| Unit (76) | `npm test` | Pathway stages (preliminary step, the four stage combinations, next stage skipping completed stages, re-entry, revert targets, re-scrutiny label), due states, ageing buckets and the escalation ladder; date parsing, normalisation, field extraction, upload validation, every rule check type, status derivation, transitions, run diff, verification adapters (all outcomes, timeout, bounded retries), permissions, anomaly detection, AI fallback (tokenizer ids/offsets, each acceptance safeguard, rules treating AI values as unconfirmed, and the real model on the sample PDFs — skipped if the model is not installed) |
| Integration (45) | `npm test` | Real SQLite DB seeded through the real pipeline. Workflow and monitoring: pathway assignment, new-institution timelines, Region scoping, automatic routing out of preliminary checks, EVC scheduling and report rules, SAC/SHC outcome, decision with a tracked undertaking, return and re-scrutiny, revert, renewed-document submission and verification, returned evidence, idempotent and escalating alert sweeps, configurable timelines. Scrutiny tooling: auth and rate limiting, isolation, application creation, upload rejection, PDF/PNG/scanned-PDF processing, validation persistence, corrections, verification (outage, unsupported, manual), review reasons, rectification (unrelated findings preserved, corrected findings cleared), forward/decision, append-only audit, report redaction |
| E2E (10) | `npm run test:e2e` | Runs against a production build. Approval monitoring (Bureau pendency → EVC scheduling → escalation visible → convenor files the report and the application moves on → institution renews its lease deed online → Bureau verifies it). Sign-in failures, separate sign-in portals, section tabs navigating on click in both portals, server-side RBAC and cross-institution isolation, upload rejection, the full journey (findings → rectification → replacement → revalidation diff → simulated verification → forward → recorded decision → audit trail → PDF report), upload to closing (Greenfield draft → uploads → checks → verification → forward → decision → closed), issuer mismatch (forward blocked until a manual confirmation, then closed), and the AI fallback (prose certificate → AI suggestions → review → officer confirmation → PASS; skipped without the model) |

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
- Field extraction is label-anchored and heuristic. The optional local AI fallback covers fields stated in prose, but every AI value needs reviewer confirmation, and the model is English-only with a 256-token window per pass (long documents are scanned in overlapping windows). Tables and multi-value fields (several programmes on one letter) are not parsed.
- OCR is English-only and processes at most 10 scanned pages per document. Handwriting and stamps are not interpreted.
- Signature/seal detection is a text or structure cue only; there is no cryptographic signature validation.
- Image analysis is limited to a preliminary evidence note (dimensions/resolution); physical infrastructure compliance is not assessed.
- Processing is synchronous, which is suitable for prototype-sized files; the services are structured so a job queue can be added later.
- Database-level immutability of the audit log relies on SQLite triggers, which a DB administrator could still drop. Production should add access controls and/or write-once storage.
- The in-memory login rate limiter is per process. E-mail and SMS are not implemented; notifications and alerts are in-app only.
- **Workflow configuration is sample data.** Pathways, application-type routing, stage timelines, reminder and escalation thresholds are illustrative and not taken from the APH; Regions and their states are demo groupings. EVC report-overdue and scheduling escalation thresholds (3 and 5 days) are fixed in code.
- The alert sweep runs inside the web server process (one replica); a production deployment would run it as a scheduled job.
- Background monitoring cases have no uploaded documents; officers can open them but running validation on them reports the missing documents.
