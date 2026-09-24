# Phase 9 — Advanced Collection Processes · Closure

**Status: Phase 9 — ENGINEERING AND VALIDATION COMPLETE · READY FOR CLOSURE REVIEW.**
Production readiness still depends on QDB decisions that no Phase 9 code can supply (§5).

Branch `feat/dcp-phase9-advanced-processes` · base `81adc5a7` (`origin/main`, Phases 1–8) ·
Cloud runtime tested on `org5869857f` · **On-Prem: Compatible by Design; Runtime Validation Pending.**

**All browser evidence in this phase is System Administrator evidence** (`Mohammad Salman`). No
Collection Officer account was used, and no officer or security KI is closed on it.

---

## 1. What each process supports now

The same statement the workspace itself makes, on the case's *Workout & Legal* tab, derived from
live configuration (`describeAdvancedProcesses`).

| Process | Aspect | State | Basis |
|---|---|---|---|
| Legal | Record a recommendation | Available | Log action, P6-LEGALREC |
| Legal | Hand off to Legal | **Awaiting QDB decision** | KI-109 — no qualification rule; no officer hand-off exists in the product |
| Legal | Follow the Legal request | Read-only | Legal owns it; status passed through |
| Legal | Conclude | **Awaiting configuration** | KI-131 — 0 outcomes |
| Deceased review | Record a review | Available | Review card, idempotent at a derived id (Phase 8) |
| Deceased review | Conclude | **Awaiting configuration** | KI-131 |
| Deceased review | Change collection for the indication | **Awaiting QDB decision** | KI-124, KI-127 |
| Collection dispute | Record a dispute | Available | Log action, P6-DISPUTE — now says it is a dispute, not a complaint |
| Collection dispute | Conclude | **Awaiting configuration** | KI-131 |
| Collection dispute | Pause or change collection | **Awaiting QDB decision** | KI-119 |
| Customer complaint | Follow a complaint | Read-only | Native `incident`, Case Management owns it |
| Customer complaint | Raise one | **Awaiting QDB decision** | KI-120 |
| Insurance claims | — | **Deferred** | No authoritative process (KI-125) |
| Restructuring | — | **Parked by QDB** | KI-114–117; no effort spent |
| Field visit | — | **Parked by QDB** | Loggable as an action; nothing extended |

**"Delivered" is kept in four senses, as in Phase 8:** *Contract* (the domain rule), *Product* (the
screen), *Officer* (usable by a Collection Officer), *Harness* (a smoke performs it). Phase 9 delivers
Contract and Product for every row above. **Officer is not established for any row** (KI-100, 111,
120, 128). No Phase 9 capability exists only in a harness.

---

## 2. Work delivered, by package

| WP | Delivered | Commit(s) |
|---|---|---|
| WP1 | Baseline, reconciliation, Insurance Claims gate (deferred) | `49d972ab` |
| WP2 | One generic conclusion rule; completion refused where a type has no outcomes | `d246265a` |
| WP3 | Deceased card says why a review stays open; `useConcludability` | `77d7ad94` |
| WP4 | Legal card says what a blocked recommendation waits on; no control asserted on the rendered card | `5f41bba9`, `c524b48b` |
| WP5 | Log action says the combined type records a **Collection Dispute**, not a Complaint | `379e6610`, `7d1b9d5b` |
| WP6 | *Workout & Legal* tab delivered — capability matrix + the three cards; earlier-episode Legal rows labelled; Workout navigation made truthful; two commands for non-existent functionality removed | `41c0ae7a`, `79121798`, `d1fe62a0`, `5687c317`, `9e90234a` |
| WP7 | Source-level boundary: no write, bind or hand-off helper touches Legal or Complaint | `d4c8bc21` |
| WP8 | Case cards say when they hold only the most recent page | `4f43aa6e` |
| WP9 | Deployed ×3, live smoke, browser QA, fixtures seeded and cleaned | `bc509230` + fixes above |
| WP10 | Full regression | — |
| WP11 | This document, KI reconciliation, tracker | this commit |

**No new entity, column, relationship, choice or security role.** No write path was added: the only
advanced-process write is still Phase 8's idempotent deceased-review create.

---

## 3. Evidence

### Automated — run from the closure commit, nothing skipped

| Suite | Tests |
|---|---|
| `@dcp/domain` | **817** |
| `@dcp/web` | **636** |
| `@dcp/api` | **351** |
| `@dcp/dataverse-client` | **32** |
| `@dcp/auth-adapters` | **14** |
| Tooling (`node --test`) | **10** |
| C# plugins | **159** |
| **Total** | **2,019** (Phase 8 baseline 1,903) |

Skipped 0 · Todo 0 · Failed 0. `turbo run type-check` passes. The api count rose by 2 without an api
change: its portability guard sweeps every domain source file, and `advancedProcessState.ts` passed it.

**Every new guard was shown to fail with its defect reintroduced** — 26 in all, across WP4–WP9.
Two of my own guards were wrong on first run and were fixed rather than loosened: a phrase ban that
matched a negation, and a hand-off-helper sweep that matched the legitimate read-link property.

### Cloud runtime — `org5869857f`

- `deploy-workspace-webresource.mjs --publish` **11/11**, three times; stored content byte-identical.
- `smoke-phase9-advanced.mts` (read-only) **9/9**: live outcome counts `{legal 0, deceased 0,
  dispute 0}`; the matrix derived from them agrees; the hand-off is blocked. The card-page check was
  **NOT EXERCISED** while no case held such work, and exercised only on the *not more* side once
  fixtures existed — the *more* side is proven by component tests alone.
- Fixtures: `qa-phase9-fixtures.mts` + `smoke-deceased-review.mts --seed-only` on `DEMO-HL-1001`;
  **no Litigation Request and no incident created**. Cleaned by owned id and re-read as 404.
- Residue: `verify-phase8-residue.mts` **18/18**; **0** `QA-P9`/`QA-DECEASED` rows on the org.
- **ARR was only read.**

### Browser — System Administrator evidence

Cache-busted iframe, clean console throughout. Verified: all 15 matrix aspects; 0 controls in the
matrix and the Legal card; each card's wait/conclusion banner; `handoff=false`; the dispute notice
appears for the dispute type and leaves for another; Workout entries open on their own bucket; the
parked badge and notice; both commands absent. **The Log action dialog was opened and cancelled —
nothing was saved.**

**Browser QA found three defects that the green suite did not** — the dispute notice squeezed into
one grid cell, the Workout navigation promising Phase 9 work (KI-133), and a bucket surviving
navigation (KI-134). All fixed, guarded and re-verified live.

---

## 4. Not delivered, and why

- **Concluding** any Legal, Deceased or Dispute activity — no outcome taxonomy configured (KI-131).
  **None was invented.**
- **Legal hand-off** from the workspace — KI-109, and HL→BFD (KI-108) behind it.
- **Any effect** of a dispute or a deceased indication on collection — KI-119, KI-124, KI-127.
- **Raising a Complaint** — KI-120.
- **Insurance claims** — no process (KI-125).
- **Restructuring and Field Visit** — parked by QDB.

---

## 5. KI reconciliation

**Opened and closed in Phase 9:** KI-132 (silent page truncation), KI-133 (Workout navigation
promised Phase 9), KI-134 (bucket survived navigation).
**Opened and still open:** KI-131 (no outcomes — QDB), KI-135 (stale badges from earlier phases —
deferred, outside Phase 9 scope).

**Still open, unchanged, each with its own traceability:**

| Blocks | KIs |
|---|---|
| Legal | KI-108, KI-109, KI-111, KI-112 |
| Deceased | KI-124, KI-125, KI-126, KI-127, KI-128, KI-79 |
| Dispute / Complaint | KI-119, KI-120, KI-123 |
| Anyone holding collection work | KI-100 |
| Native audit | KI-99 |
| Restructuring (parked) | KI-114, KI-115, KI-116, KI-117 |

**KI-100 / 111 / 116 / 120 / 128 remain Open** — every browser result is administrator evidence.

---

## 6. Cloud vs On-Prem

Cloud: runtime tested as above. On-Prem: nothing Phase 9 added depends on a Cloud-only API — reads
through `Xrm.WebApi` and the existing adapter, no new schema, no new plugin. **Compatible by design;
no runtime evidence.**

---

## 7. Timing

| | |
|---|---|
| Start | 2026-09-22 21:30:19 +03 |
| Engineering complete | 2026-09-24 ~11:55 +03 — ahead of the 18:00 forecast |
| **Baseline** | **21.50 h — unchanged** |
| Effective, measured | **4.76 h** (transcript steps, gaps under 15 minutes counted) |
| Non-working, separate | 33.62 h, incl. the 14.06 h restart interruption |
| Blocked by a QDB decision | **0.00 h** — every dependent capability fails closed rather than waiting |

The measured figure and the estimate are different units; see the tracker. **Additional work inside
approved scope:** WP9 browser QA surfaced the Workout navigation and command-bar claims (KI-133),
which were fixed within WP6's approved "represent capability accurately" scope. No scope was added.

---

## 8. Repository

Branch `feat/dcp-phase9-advanced-processes`, **not merged, no PR**. Per the instruction, it is pushed
and local/remote equality verified before closure review; the SHA is recorded in the tracker.
