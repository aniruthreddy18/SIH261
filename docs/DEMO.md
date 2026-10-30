# Demo script (SIH judges) — PS 26262

Preparation: `npm run db:reset && npm run dev` and open http://localhost:3000. Password for every account: `Pravah@Demo2026`. Keep the `samples/` folder open. The demo has three institutions — **Meridian** (Western Region), **Northfield** (Northern) and **Greenfield** (Southern) — and six applications: one per institution through the real document pipeline, plus workflow cases with backdated timelines (see the README). Pathways and timelines are sample configuration, not APH values — say so once.

## Part 1 — Approval workflow, monitoring and alerts (about 6 minutes)

**0:00 — Framing (20 s).** Sign in as `bureau@pravah.demo`. The system routes, tracks and reminds; every stage is completed and every outcome recorded by an authorised official.

**0:20 — Bureau Command Centre and Pendency (60 s).** KPI tiles, the Region × stage matrix with overdue counts, open escalations. Pendency: Meridian's application has been at scrutiny for 20 days (overdue, escalated to level 2); ageing, workload by desk, bottlenecks; consolidated PDF.

**1:20 — Electronic case summary (40 s).** Greenfield's change-of-site application (PRV-2027-000005) → **Workflow**: pathway *Only EVC*, preliminary checks completed **automatically** by the workflow engine, EVC due date, **Return to institution** and **Revert to earlier stage**.

**2:00 — EVC (60 s).** **EVC**: the same Greenfield visit is 9 days late for scheduling (escalated). **Schedule visit** → today, convenor *Prof. Meera Pillai*. Sign in as `committee@pravah.demo`: Northfield's intake visit was held three days ago — **Workflow** → **Submit report** (Satisfactory); the application moves to the competent authority by itself.

**3:00 — Institution compliance (60 s).** As `applicant.greenfield@pravah.demo` (Institution login): *Document renewal due · Lease deed* → **Compliance** → upload a PDF as the renewed deed with a new *Valid until* date → submit. As `bureau@pravah.demo` → **Compliance** → **Verify**: the register moves to the new date. Mention Meridian's overdue faculty undertaking from last year's approval (escalated).

**4:00 — Alerts, Region scoping and audit (60 s).** **Alerts**: the escalation ladder with recipients and timestamps; acknowledge one as `senior@pravah.demo`. `ro.south@pravah.demo` sees only Greenfield (Southern Region). **Audit Trail** and **Reports** (CSV, consolidated PDF).

## Part 2 — Scrutiny-stage document intelligence


**0:00 — Framing (20 s).** Sign in as `scrutiny@pravah.demo`. Point to the royal-blue *Regional Office · Scrutiny Desk* header (each role has its own colour), the *Demo environment* label and the disclaimer: decision support, not an approval engine. All data is synthetic, and issuer sources are simulated and labelled.

**0:20 — Command Centre (20 s).** Live tiles computed from the database and "Attention required" sorted by severity. (Each role has its own dashboard: green Institution Portal, royal-blue officer desk, saffron Competent Authority Desk, dark-blue Administration Console.) Click the **Meridian** expired-certificate item.

**0:40 — Demo A: automatic validation with evidence (50 s).** Open **Findings**: *"Validity does not cover the required date: valid until 31 Mar 2027, must remain valid on 01 Jul 2027 (start of AY 2027-28)"*, with rule `DATE-VAL-001 v2`, the page reference and the source excerpt. Click the document link: the server-rendered page with the **highlighted extraction region**. Show the confidence values and the "Correct value" action (machine value retained, correction audited). Note the rule is a *sample* rule with two immutable versions (Validation Rules).

**1:30 — Demo B: issuer verification (60 s).** Open **Northfield → Issuer verification**: the **SIMULATED SOURCE** label, field-by-field comparison with the registry, the mismatched expiry date, source timestamp and response reference. Open the **Overview**: the *Before this application can be forwarded* panel names the blocker (*Accreditation: issuer verification result is "Mismatch detected"*), and **Forward** is disabled. Resolving the finding alone does not verify the document. Back on **Issuer verification**, use **Manual confirmation** (Verified, with a reference such as an email number); it is stored as MANUAL, never as an automated response. The panel turns into **Ready to forward**. Forward it.

**2:30 — Demo C: rectification (60 s).** On **Meridian → Rectification**: select the finding, write instructions, **Return for rectification**. Sign in on the **Institution login** (`/institution/login`) as `applicant.meridian@pravah.demo`. The green Institution Portal shows *Correction requested* with its due date. Open the application → **Upload replacement** → `samples/meridian-fire-noc-renewed.pdf` (it processes instantly), then **Submit corrections and revalidate**. Open **Check results**: *"What changed since run #1 — improved"*; run #1 is preserved. Status: *Automated checks passed (not an approval)*.

**3:30 — Close the loop (40 s).** As `scrutiny@pravah.demo` on Meridian: **Run issuer verification** (the new NOC is verified by the simulated source), and the panel shows **Ready to forward**; then **Forward for authorised review**. As `senior@pravah.demo`: both forwarded applications wait on the dashboard. **Record review outcome** with reasons and a file reference, labelled as a recorded human action. The status becomes *Closed*.

**4:10 — Demo D: auditability (30 s).** Open **Reports & Audit**, filtered to Meridian: who uploaded, `RULE_FAILED` with rule version, verification attempts with source, rectification, decision, and the before/after values. Download the **PDF validation report**: disclaimer, extracted values with page references, rule versions, verification source types and human decisions. The audit table is append-only, enforced by database triggers.

**Optional — Demo E: upload to closing (90 s).** As `applicant.greenfield@pravah.demo`: open the Greenfield draft → Documents → upload `samples/greenfield-faculty-statement.pdf` and `samples/greenfield-built-up-area.pdf` into their checklist items → **Run checks** (all pass). Then follow the same officer → senior steps as above.

**Optional — Demo F: local AI extraction (60 s; needs `npm run ai:setup` once).** As `applicant.greenfield@pravah.demo`: **New application** → Documents → *Fire & building safety NOC* → **Upload** → `samples/ai-demo-noc-prose.pdf`. This certificate states everything in sentences, with no "Label: value" lines. Open the document: the certificate number, issue date, expiry date and issuing authority carry an **AI suggestion** badge, with the source sentence highlighted. The model is local, extractive (it can only quote the document) and capped at 75% confidence. As `scrutiny@pravah.demo`, **Run validation**: the date rules say *REVIEW — suggested by the local AI model and not confirmed*, never PASS or FAIL. **Confirm AI suggestion** on the expiry date → **Run validation** again: *"Valid until 02 Mar 2029, which covers 01 Jul 2027."* The audit trail shows "Confirmed AI suggestion for Expiry date".

Backup talking points: the two sign-in pages (an institution account is refused on the AICTE sign-in and vice versa), rule builder (Validation Rules → New rule), applicant isolation (an applicant opening another institution's URL gets "not found"), invalid upload (`samples/invalid-renamed-file.pdf` is rejected by content sniffing), the outage switch in System Settings. For cross-document mismatches, OCR of scanned documents and anomaly indicators, reset with `DEMO_DATASET=full npm run db:reset` (nine applications).
