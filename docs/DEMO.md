# Five-minute demo script (SIH judges)

Preparation: `npm run db:reset && npm run dev` and open http://localhost:3000. Password for all accounts: `Aegis@Demo2026`. Keep the `samples/` folder open.

**0:00 — Framing (20 s).** Sign in as `scrutiny@aegis.demo`. Point to the *DEMO ENVIRONMENT* badge and the disclaimer: decision support, not an approval engine. All data is synthetic, and issuer sources are simulated and labelled.

**0:20 — Command Centre (30 s).** Six live metrics computed from the database, the status distribution, and "Attention required" sorted by severity. Click the **Meridian** expired-certificate item.

**0:50 — Demo A: automatic validation with evidence (50 s).** Open **Findings**: *"Validity does not cover the required date: valid until 31 Mar 2027, must remain valid on 01 Jul 2027 (start of AY 2027-28)"*, with rule `DATE-VAL-001 v2`, the page reference and the source excerpt. Click the document link: the server-rendered page with the **highlighted extraction region**. Show the confidence values and the "Correct value" action (machine value retained, correction audited). Note the rule is a *sample* rule with two immutable versions (Validation Rules).

**1:40 — Demo B: cross-document inconsistency (40 s).** Open **Coastal Institute of Pharmacy → Findings**: affidavit identifier `AEG-INST-1044` vs `AEG-INST-1040`, and previous-approval intake 60 vs 100. Point out that the abbreviated name "Coastal Inst. of Pharmacy" was **not** flagged: normalisation ignores formatting and abbreviations.

**2:20 — Demo C: issuer verification (40 s).** Still as `scrutiny@aegis.demo` (the same officer handles verification), open **Northfield → Issuer verification**: a **SIMULATED SOURCE** label, field-by-field comparison, mismatched expiry date, source timestamp and response reference. Open **Riverside**: *pending*, *source unavailable* (bounded retries) and *no record* → manual review. Record a **Manual confirmation** with a reference: it is stored as MANUAL, never as an automated response. Optional: **Highland**, showing anomaly indicators (receipt reused from another institution, PDF metadata), phrased as indicators, not fraud.

**3:00 — Demo D: rectification (60 s).** As `scrutiny@aegis.demo` on **Meridian → Rectification**: select the finding, write instructions, **Return for rectification**. Sign in as `applicant.meridian@aegis.demo` → **Upload replacement** → `samples/meridian-fire-noc-renewed.pdf` (it processes instantly), then **Submit corrections and revalidate**. Open **Validation**: run #2 with *"What changed since run #1 — improved"*. Run #1 is preserved. Status: *Automated checks passed (not an approval)*.

**4:00 — Close the loop (40 s).** As `scrutiny@aegis.demo`: **Run issuer verification** (the new NOC is verified by the simulated source), then **Forward for authorised review**. The server refuses if findings are open, verification is incomplete, or evidence changed since the last run. As `senior@aegis.demo`: **Record review outcome** with reasons and a file reference, labelled as a recorded human action.

**4:40 — Demo E: auditability (20 s).** Open **Reports & Audit**, filtered to Meridian: who uploaded, `RULE_FAILED` with rule version, verification attempts with source, rectification, decision, and the before/after values. Download the **PDF validation report**: disclaimer, extracted values with page references, rule versions, verification source types, and human decisions. Mention that the audit table is append-only, enforced by database triggers.

Backup talking points: rule builder (Validation Rules → New rule), applicant isolation (an applicant opening another institution's URL gets "not found"), invalid upload (`samples/invalid-renamed-file.pdf` is rejected by content sniffing), the outage switch in System Settings.
