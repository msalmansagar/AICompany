# Phase 9 — Advanced Collection Processes · Closure

**Phase 9 — CLOSED · Production Readiness Dependencies Outstanding**

| | |
|---|---|
| Cloud | **Cloud Runtime Tested** (`org5869857f`) |
| Browser | **System Administrator Runtime Validated · Collection Officer Runtime Validation Pending** |
| On-Prem | **Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Phase 9 Runtime Validation Pending** |

Branch `feat/dcp-phase9-advanced-processes`, based on `main` @ `81adc5a7`. Closed after the formal
closure review of 2026-09-24 (§9). **Not merged, no PR.**

**Not claimed:** Restructuring delivered · Field Visit delivered · Insurance Claims delivered · Legal
hand-off operational · formal Complaint creation operational · verified-deceased workflow complete ·
Collection Officer validated · production ready.

---

## 1. What each process supports now

As the case's *Workout & Legal* tab states it (`describeAdvancedProcesses`). **How each state is
decided matters, so it is recorded:** *derived* states are computed from live configuration or from
the same policy constant the Legal card uses, and change without code when those change; *stated*
states are fixed descriptions of what the product does or of a QDB decision, and change only with
code.

| Process | Aspect | State | How decided | Basis |
|---|---|---|---|---|
| Legal | Record a recommendation | Available | stated | Log action, P6-LEGALREC |
| Legal | Hand off to Legal | **Awaiting QDB decision** | derived — `isQualificationConfigured(LEGAL_QUALIFICATION_POLICY)` | KI-109. Even with a rule it can never become Available: no officer hand-off exists |
| Legal | Follow the Legal request | Read-only | stated | Legal owns it; status passed through |
| Legal | Conclude | **Awaiting configuration** | derived — live outcome count | KI-131 |
| Deceased review | Record a review | Available | stated | Review card, idempotent at a derived id (Phase 8) |
| Deceased review | Conclude | **Awaiting configuration** | derived | KI-131 |
| Deceased review | Change collection for the indication | **Awaiting QDB decision** | stated | KI-124, KI-127 |
| Collection dispute | Record a dispute | Available | stated | Log action, P6-DISPUTE — says it is a dispute, not a Complaint |
| Collection dispute | Conclude | **Awaiting configuration** | derived | KI-131 |
| Collection dispute | Pause or change collection | **Awaiting QDB decision** | stated | KI-119 |
| Customer complaint | Follow a complaint | Read-only | stated | Native `incident`; Case Management owns it |
| Customer complaint | Raise one | **Awaiting QDB decision** | stated | KI-120 |
| Insurance claims | — | **Deferred** | stated | Deferred Pending Authoritative QDB Process / Integration Contract (KI-125) |
| Restructuring / Workout | — | **Parked** | stated | PARKED by QDB · Downstream Integration Deferred (KI-114–117) |
| Field visit | — | **Parked** | stated | PARKED by QDB · Discovery & Implementation Deferred |

**Warning Letters — OUT OF SCOPE / DEFERRED BY QDB.** None of the parked or deferred areas received
implementation effort, and none blocks Phase 9 engineering closure.

"Delivered" keeps Phase 8's four senses — *Contract*, *Product*, *Officer*, *Harness*. Phase 9
delivers Contract and Product for every row. **Officer is not established for any row.** No Phase 9
capability exists only in a harness.

---

## 2. Work delivered

| WP | Delivered | Commit(s) |
|---|---|---|
| WP1 | Baseline, reconciliation, Insurance Claims gate (deferred) | `49d972ab` |
| WP2 | One generic conclusion rule — `planCompleteActivity` refuses `CompletionUnavailable` on a zero-outcome type; the dialog passes the live count | `d246265a` |
| WP3 | Deceased card says why a review stays open; `useConcludability` | `77d7ad94` |
| WP4 | Legal card says what a blocked recommendation waits on; no control, asserted on the rendered card | `5f41bba9`, `c524b48b` |
| WP5 | Log action says the combined type records a **Collection Dispute** | `379e6610`, `7d1b9d5b` |
| WP6 | *Workout & Legal* tab; earlier-episode Legal rows labelled; Workout navigation opens the queue per process; Restructuring shown parked; *Propose restructure* and *Refer to legal* removed | `41c0ae7a` (pure move, verified), `79121798`, `d1fe62a0`, `5687c317`, `9e90234a` |
| WP7 | Source sweep: no write, bind or hand-off helper touches Legal or Complaint | `d4c8bc21` |
| WP8 | Case cards say when they hold only the most recent 100 | `4f43aa6e` |
| WP9 | Deploys, live smoke, browser QA, fixtures seeded and cleaned | `bc509230` |
| WP10–11 | Regression; closure documentation and KI reconciliation | `1bf3bf89` |
| Review | KI-136 fix; 100-row bound asserted | `1259f6ee`, `94eb2fa5` |

**Nothing structural:** no entity, column, relationship, choice, security role, plugin, C# or
provisioning change. **No write path was added** — the only advanced-process write remains Phase 8's
idempotent deceased-review create; the only Dataverse-writing Phase 9 file is the QA fixture script.

---

## 3. Evidence

### Automated — at the closure candidate, nothing skipped

| Suite | Tests |
|---|---|
| `@dcp/domain` | **817** |
| `@dcp/web` | **644** |
| `@dcp/api` | **351** |
| `@dcp/dataverse-client` | **32** |
| `@dcp/auth-adapters` | **14** |
| Tooling (`node --test`) | **10** |
| C# plugins | **159** |
| **Total** | **2,027** — 0 failed · 0 skipped (Phase 8 baseline 1,903) |

`turbo run type-check` passes. The engineering candidate `1bf3bf89` held 2,019; the closure review
added 8 web tests (§9). The api count rose by 2 with no api change: its portability guard sweeps every
domain source file, and `advancedProcessState.ts` passed it.

**Guards shown to fail with their defect restored:** 26 during WP4–WP9, and 4 more in the review. The
review re-ran the WP4 and WP6 batteries (8/8) and KI-134's regression test against the final code.

### Cloud runtime — `org5869857f`

- Web resource deployed and published **11/11** four times; each stored copy byte-identical to its
  build, the last one built from the closure candidate's code.
- `smoke-phase9-advanced.mts`, read-only: **9/9** with the QA fixtures present; **7/7 plus 2 NOT
  EXERCISED** after cleanup (no case holds Legal or dispute work). Live outcome counts
  `{legal 0, deceased 0, dispute 0}`, re-read in the review.
- Fixtures on `DEMO-HL-1001` only — no Litigation Request, no incident. Removed by owned id and re-read
  as 404. `verify-phase8-residue.mts` **18/18**; **0** `QA-P9`/`QA-DECEASED` rows remain.
- **ARR was only read.**

### Browser — System Administrator evidence (`Mohammad Salman`)

Cache-busted iframe. Verified: all 15 matrix aspects; no control in the matrix or the Legal card; each
card's wait and conclusion banners; `handoff=false`; the dispute notice; each Workout entry opening on
its own bucket, including after navigating between them; the parked badge and notice; both commands
absent; and, after the review fix, a Call activity dialog sampled 142 times from opening with no false
banner and Complete enabled. Dialogs were opened and cancelled — **nothing was saved**. No console
errors were recorded from the point console tracking began.

### Automated only

- **KI-132 >100 behaviour: Automated validation only — live >100-record runtime evidence unavailable.**
- The KI-131 domain refusal on a zero-outcome type (the UI never offers the path live).
- The KI-136 *unreadable catalogue* branch.

---

## 4. Not delivered, and why

Concluding any Legal, Deceased or Dispute activity (KI-131 — **no taxonomy invented**) · Legal
hand-off (KI-109, and KI-108 behind it) · any effect of a dispute or a deceased indication on
collection (KI-119, KI-124, KI-127) · raising a Complaint (KI-120) · Insurance claims (KI-125) ·
Restructuring and Field Visit (parked) · Warning Letters (out of scope).

---

## 5. Known issues

| | |
|---|---|
| Opened and closed in Phase 9 | KI-132, KI-133, KI-134, KI-136 |
| Open — QDB | **KI-131** (outcome catalogue). It is additive: it does not replace or close KI-109, KI-119 or KI-124 |
| Open — LOW, carried | **KI-137** (card reads order by `createdon` alone; pre-existing from Phase 8) |
| Open — deferred | **KI-135** (pre-existing Phase 7/8 labelling debt; verified present on `main` @ `81adc5a7`) |

Still open and unchanged: Legal KI-108, 109, 111, 112 · Deceased KI-124–128, KI-79 · Dispute/Complaint
KI-119, 120, 123 · KI-100 · KI-99 · Restructuring KI-114–117. **KI-100 / 111 / 116 / 120 / 128 remain
Open — every browser result is administrator evidence, and no role or privilege workaround exists.**

---

## 6. Cloud vs On-Prem

Nothing Phase 9 added depends on a Cloud-only API: reads go through `Xrm.WebApi` and the existing
adapter, with no new schema or plugin. **Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Phase 9
Runtime Validation Pending.**

---

## 7. Timing

| | |
|---|---|
| Start | 2026-09-22 21:30:19 +03 |
| Engineering complete | 2026-09-24 ~11:55 +03 |
| Closure review | 2026-09-24 ~11:55 – ~12:45 +03 |
| **Baseline** | **21.50 effective hours — unchanged** |
| Effective engineering, measured | **4.80 h** to 11:55 (4.76 h was reported at 11:52) |
| Closure review, measured | ~0.6 h |
| Idle / non-working | 19.56 h, **separate** |
| Restart gap | **14.06 h, separate** (09-23 18:22 → 09-24 08:26) |
| Blocked by a QDB decision | **0.00 h** — independent work never waited; the QDB dependencies are **not** resolved |
| **Variance** | **−16.70 h (−77.7%)** measured engineering against the baseline |

The variance is reported, not explained away — but the two figures are different units: the baseline
was an estimate of effort, the actual is measured AI-assisted session time (transcript steps, gaps under
15 minutes counted). Phase 8 recorded estimate-shaped actuals, so the phases are not directly
comparable. Idle and restart time are not engineering effort.

---

## 8. Repository

`feat/dcp-phase9-advanced-processes`, 0 merge commits, 0 behind `main`, no history rewrite; every
changed file under `projects/debtcollection/`. `git merge-tree` against `origin/main` yields exactly the
branch's own tree — **merges cleanly**. Pushed with local == remote verified; the final SHA is the
commit that adds this document.

---

## 9. Closure review — 2026-09-24

| # | Finding | Severity | Outcome |
|---|---|---|---|
| F1 | The activity dialog said *no outcomes are configured* before the outcome catalogue answered, and after a failed read — on every activity, including a Call with seven outcomes (KI-136, introduced in WP2) | **MEDIUM** | **Fixed** (`1259f6ee`), 3 guards bite, re-verified live |
| F2 | The Legal and dispute card reads order by `createdon` alone, so the 100-row boundary is not deterministic under ties (KI-137, pre-existing) | LOW | **Carried** as technical debt |
| F3 | No test asserted the 100-row bound itself; the KI-132 tests proved only the notice | LOW | **Fixed** (`94eb2fa5`), bites |
| F4 | This document said the tab was derived from live configuration without distinguishing stated aspects; quoted only the 9/9 smoke; used shortened status wording | LOW | **Corrected** here |
| O1 | *Available* and QDB-decision aspects are stated, not derived; they can drift from the product only through code, which the WP6 tests pin | Observation | Recorded (§1) |
| O2 | *Restructuring Recommendation* remains a loggable activity type and a queue bucket — Phase 8's approved recommendation-only fallback, unchanged | Observation | Recorded |
| O3 | Console errors were observed only from when tracking began, not from page load | Observation | Recorded (§3) |

**Verified with no finding:** Git state and merge-tree; scope (no Restructuring, Field Visit, Warning
Letter, claims, Legal or Complaint lifecycle; no invented qualification, deceased confirmation, dispute
effect or outcome; no HL→BFD mapping, suppression, MIS write, security change or facility dependency —
searched in the added code, not only the docs); no alternate reachable copy of the removed commands;
KI-131 against live configuration; KI-133/134 regression; KI-135 pre-existing; security; the regression
totals and their arithmetic.

**Unresolved: 0 BLOCKER · 0 HIGH · 0 MEDIUM · 1 LOW (F2, carried).** The closure gate is met.
