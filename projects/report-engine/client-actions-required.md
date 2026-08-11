# RPT-ENG-001 — Client Actions Required (QDB)

**Date:** 2026-07-19 · **For:** QDB IT Director / Data Protection Officer / Reporting programme sponsor
**Re:** V2-Dashboard increment — two decisions needed from QDB before build can be authorised

## Background (1 paragraph)
The **Dashboard Composer** (the Customer-360-style dashboard capability, validated in the interactive prototype) has been **approved by the CEO checkpoint as "V2-Dashboard"** — a fast-follow that does **not** delay the core V1 report engine. That approval is **conditional on four pre-build gates**. Two are being cleared by the Maqsad team (DC-3 charting library — **done**; DC-1 fan-out/performance spike — **in progress**). **The remaining two need a decision from QDB.** Until both are answered, V2-Dashboard build is not authorised.

---

## ACTION 1 — DC-2 · PDPPL data-residency sign-off (HARD gate)

**What we need from QDB:** a **written confirmation** of the data-residency requirement for a Customer-360 dashboard, and sign-off that our deployment plan meets it — specifically:
1. Where **PII may reside and be processed** (in-country only? which region/tenant? on-prem only for certain data?), and
2. Acknowledgement that **no Customer-360 dashboard goes to production** until PDPPL data-residency compliance is signed off.

**Why this is required:** The Customer-360 dashboard **aggregates personal data (PII) across five or more CRM entities** (customer profile, shareholders, facilities, collaterals, contacts) into a single view. **C-2 (data-residency)** has been an open condition since the Phase-1 CEO approval. Because the Customer-360 is the primary use case, the CEO made C-2 a **hard production gate**.

**Decision owner:** QDB IT Director + Data Protection Officer / Compliance.
**Deadline:** Written acknowledgement of the production gate is needed **before build begins**; full data-residency sign-off is needed **before production go-live** (non-negotiable).
**If not provided:** build may proceed for **non-production/UAT only**; **production is blocked**. This does not affect V1.

---

## ACTION 2 — DC-4 · Dashboard governance model (has a 5-day default)

**The question (ADD-OQ-1):** Does the **governed / ungoverned** distinction that applies to *reports* also apply to *dashboards*? (For reports: draft → publish → approval by an approver who is not the author, plus immutable version snapshots.)

**Options:**
| Option | Meaning | Implication |
|---|---|---|
| **A — Same as reports** | Dashboards follow full maker-checker + versioning | Adds governance tables/logic to the dashboard schema; safest for regulated content |
| **B — Lightweight** | Dashboards are personal/ad-hoc; no approval workflow | Faster authoring; not suitable for official/regulatory dashboards |
| **C — Configurable per dashboard** | Author marks a dashboard "governed" or not | Most flexible; slightly more build |

**Decision owner:** QDB reporting/governance sponsor.
**Deadline:** **5 business days.** If no response, the CEO-approved **default applies: governance optional, off by default** — and this default will be reported before it enters the schema.
**Why it matters now:** the answer determines whether the dashboard schema includes governance tables (`qdb_dashboardsecurity`, version history) and affects the build estimate.

---

## Summary

| Gate | Decision needed | Owner | Deadline | Blocks if unanswered |
|---|---|---|---|---|
| **DC-2** | PDPPL data-residency: where PII may reside + production-gate acknowledgement | IT Director + DPO | Ack **before build**; sign-off **before prod** | V2-Dashboard **production** |
| **DC-4** | Dashboard governance model (A / B / C) | Reporting sponsor | **5 business days** | Nothing — default (B, off) applies, then reported |

**Not blocked by these:** the core **V1 report engine** and non-production build work.
**Being handled by Maqsad (no QDB action):** DC-3 (charting library — cleared), DC-1 (fan-out/performance spike — in progress).

_Related: `ceo-checkpoint-dashboard-composer.md` (the ruling and all four gates), `scope-addendum-dashboard-composer.md` (BA scope)._
