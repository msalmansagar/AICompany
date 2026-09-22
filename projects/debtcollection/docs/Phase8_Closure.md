# Phase 8 — closure pack

**Debt Collection Platform (DCP-001) · Strategy Automation and Operational Work Management**
**Closed for development 2026-09-22** · Branch `feat/dcp-phase8-strategy-automation` ·
Organisation `org5869857f` (Cloud sandbox) — the only authorised organisation.

---

## 1. What closure claims, and what it does not

Phase 8 closure answers **two separate questions**, and the whole structure of this pack exists to
keep them apart:

**A. Is the implemented software internally complete and regression-safe?**
Yes. 1,872 automated tests pass with none skipped, the full live regression passes against the real
organisation, the integrated browser regression passes, and zero synthetic residue remains.

**B. What must QDB decide before every capability can be switched on in production?**
Sixteen production dependencies, consolidated in `Phase8_KIRegister.md`. Five of them are the same
security finding arriving from five directions, consolidated in
`CollectionOfficerSecurityReadiness.md`.

**Neither answer weakens the other.** An unresolved QDB decision is not unfinished code — and code
that safely fails closed has not resolved the decision it is waiting on. Turn-around times are the
clearest example: the software is finished, correct and tested, and **no deadline exists anywhere
in the portfolio** because nobody has said when the clock starts.

---

## 2. Capability status matrix

No single "Complete" label is used, because it would hide per-capability readiness.

| Capability | Development | Cloud runtime | Officer security | Overall |
|---|---|---|---|---|
| **Strategy automation** | Complete | **Cloud Runtime Tested** — 13/13 | Pending (KI-100) | Development Complete · Security Validation Pending |
| **Re-evaluation** | Complete | **Cloud Runtime Tested** — 18/18, no duplication | Pending (KI-100) | Development Complete · regeneration policy held (KI-98) |
| **Assignment** | Complete | **Cloud Runtime Tested** — 18/18, native ownership, application user only | **Not validated — no principal can hold collection work** | Development Complete · **Security Validation Pending (KI-100)** |
| **TAT** | Complete | **Cloud Runtime Tested** — 18/18: proves no deadline is invented | Pending | **Fail-Closed Pending QDB Decision (KI-101, KI-102)** |
| **Escalation** | Complete (surfaced, never inferred) | **Cloud Runtime Tested** — no action performed, 0 policies configured | Pending | **Fail-Closed Pending QDB Decision (KI-104)** |
| **Action Plan** | Complete | **Cloud Runtime Tested** — 25/25; browser-verified | Pending (KI-100) | Development Complete · Runtime Validated |
| **Collection Dispute** | Complete | **Cloud Runtime Tested**; browser-verified | Pending (KI-120) | Development Complete · **effect policy pending (KI-119)** |
| **Customer Complaint** | Complete | **Cloud Runtime Tested** — 19/19; browser-verified, real Case numbers | **Not validated** (KI-120) | Development Complete · **Security Validation Pending** |
| **Legal Recommendation** | Complete | **Cloud Runtime Tested** — 21/21 | **Not validated** (KI-111) | Development Complete · **Security Validation Pending** |
| **Legal hand-off** | Complete | **Cloud Runtime Tested** — 32/32, idempotency proven | Pending (KI-111) | **Fail-Closed Pending QDB Decision (KI-109)**; HL blocked (KI-108) |
| **Deceased Review** | Complete | **Cloud Runtime Tested** — 22/22; browser-verified | **Not validated** (KI-128) | Development Complete · **handling policy pending (KI-124, KI-127)** |
| **Insurance Claims** | **Not built** | — | — | **Deferred — no process exists to build against (KI-125)** |
| **Restructuring** | Discovery only | — | Pending (KI-116) | **Discovery Complete — Integration Parked** |
| **Operational Queues** | Complete | **Cloud Runtime Tested** — 11/11 at volume; browser-verified | Pending (KI-100) | Development Complete · Runtime Validated |

### Deployment runtime status

**Cloud — Cloud Runtime Tested.** Every claim above was exercised against `org5869857f`.

**On-premises — Dynamics 365 CE 9.1 On-Prem: Compatible by Design; Phase 8 Runtime Validation
Pending.** No Phase 8 capability has ever been executed on an on-premises organisation. This is
**not** "On-Prem Runtime Validated" and must not be shortened to it. The known on-premises
dependencies are KI-02, KI-03, KI-05, KI-14 and KI-22.

---

## 3. Automated regression

Run from the closure commit, all suites, nothing skipped.

| Suite | Files | Tests |
|---|---|---|
| `@dcp/domain` | 35 | **766** |
| `@dcp/web` | 30 | **542** |
| `@dcp/api` | 16 | **349** |
| `@dcp/dataverse-client` | 4 | **32** |
| `@dcp/auth-adapters` | 2 | **14** |
| Tooling / schema guards (`node --test`) | 3 suites | **10** |
| C# plugins (`Qdb.DebtCollection.Plugins.Tests`) | 1 assembly | **159** |
| **Total** | | **1,872** |

**Skipped: 0. Todo: 0. Failed: 0.** `turbo run type-check` passes across all 10 tasks.

Coverage spans every phase Phase 8 touches: Phase 1 foundation and schema, Phase 2 collection
domain, Phase 3 strategy and configuration, Phase 4 MIS, Phase 5 React workspace, Phase 6
activities and PTP, Phase 7 communications, and Phase 8 strategy automation, assignment,
TAT/escalation, Action Plan, Complaint/Dispute, Legal, Deceased Review and operational queues —
together with the architectural guards (snapshot immutability, navigation shape, style contract,
large-data rules) and the C# plugin guards.

**Intentional exclusions:** none. No test is skipped, quarantined or excluded.

---

## 4. Live Dataverse regression

Bounded, synthetic **DEMO** writes only; ARR data read-only throughout.

| Script | Checks | Result |
|---|---|---|
| `smoke-qdb-phase5` | 45/45 | Query modules against the real organisation |
| `smoke-domain-operations` | 59/59 | Lifecycle, concurrency, idempotency, Action Plan |
| `smoke-strategy-idempotency` | 13/13 | Deterministic strategy-generated work |
| `smoke-strategy-reevaluation` | 18/18 | Re-evaluation creates no duplicate |
| `smoke-assignment-ownership` | 18/18 | Native ownership; **Smart Assignment not validated (KI-09)** |
| `smoke-tat-escalation` | 18/18 | **No fake deadline, no fake escalation** — 0 policies configured |
| `smoke-action-plan` | 25/25 | Provenance; Activity-Type inference proven removed with a real look-alike |
| `smoke-complaint-contract` | 19/19 | Complaint link survives; dispute produces no collection effect |
| `smoke-legal-handoff` | 32/32 | Fail-closed qualification; idempotency; no unauthorised hand-off |
| `smoke-legal-visibility` | 21/21 | Existing Legal reference and status; 403 ≠ 404 |
| `smoke-deceased-review` | 22/22 | QCB indication stays an indication; no case, comms, Legal or MIS effect |
| `smoke-queue-paging` | 11/11 | Classification, paging, counts, current/history |
| `smoke-activity-provenance` | 9/9 | Provenance guard |
| `smoke-bulk-concurrency` | 23/23 | Worker coordination against the real platform |
| **Total** | **333/333** | |

### Residue and invariants — proven independently

`verify-phase8-residue.mts` is **new at closure** and deliberately not part of any smoke: a script
that both creates and checks can agree with itself about a marker it never used. It sweeps 11
entities for four synthetic prefixes, plus the two records that reach QDB-owned processes.

**18/18 — zero residue**, and it is **proven non-vacuous**: seeded fixtures were deliberately left
in place, the sweep reported **16/18 with 3 rows found**, the fixtures were cleaned, and it returned
to 18/18.

It also proves the two things a residue count alone would miss:

- **The immutability guards are armed** — 14 `ImmutabilityGuardPlugin` steps registered, **none
  left disabled** by a cleanup. ADR-05 is intact and was never weakened.
- **The demonstration data survives** — 5 `DEMO-` cases, the historical MIS snapshots, and 30
  activity outcomes. Zero residue was not achieved by deleting the evidence.

---

## 5. Browser regression

Chrome, the verified QDB profile, no pairing prompt broadcast. Workspace loaded through
`main.aspx?pagetype=webresource` so `parent.Xrm` resolves.

- **Work Queues** — all 11 buckets render with three distinct count states: real numbers (`My work
  6`), real zeroes (`Legal 0`) and explained unknowns (`Due soon —`). The overlap banner is present.
- **Counts are honest** — the three unserveable buckets explain themselves (*"Due dates are not
  configured yet…"*), while genuinely empty buckets say *"Nothing in this list right now."*
- **Search** — narrowed 6 rows to 4 at the source; the Recorded **time** column distinguishes four
  otherwise identical rows.
- **Navigation to Collection Case** — selecting a row opens the case. *(Wired during this
  regression; see §7.)*
- **Action Plan** — planned actions, work attributed by provenance, and unattributed history
  labelled *"Not recorded — predates provenance"*.
- **Dispute and Complaint** — render as **two separate cards** on one case: one collection dispute
  (*"Recording one changes nothing about collection"*) and two customer complaints carrying real
  Case numbers, for both an HL contact and a BFD account.
- **Deceased Review** — *"QCB deceased indication — verification required"*, source *Qatar Central
  Bank, via the MIS extract*, *Awaiting review*, with the statement that collection, messages and
  legal action are unchanged. *(Invisible before this regression; see §7.)*
- **Refresh persistence** — reloading the workspace restored the same case and the same fragment.
  A **top-level** reload still returns to the default view — KI-97, open and unchanged.
- **Paging / infinite scroll** — **162 distinct cases** streamed while the DOM never held more than
  **26 rows**. Virtualisation and continuation both hold.
- **Console** — clean across all 13 screens; no errors, no exceptions, no `[object Object]`.

**Administrator runtime, not officer runtime.** Every result above was produced as System
Administrator. **No Collection Officer validation exists for any capability.** KI-100, KI-111,
KI-116, KI-120 and KI-128 all remain open, and four of the five predict that an officer would fail
where the administrator succeeded.

---

## 6. Scale and paging evidence

Read-only, against the real ARR population.

| Claim | Evidence |
|---|---|
| Multi-page walk genuinely exercised | **44 pages** |
| Rows walked | **4,373** |
| Duplicate rows | **0** |
| Missing rows | **0** — reconciled against the platform's own `@odata.count` |
| Narrowed population | **724**, exactly the indicated set |
| Ordering stable across page boundaries | Two-part sort; page two shares no row with page one |
| A filter change starts a new walk | Proven, not a continuation under new terms |
| Page bound respected | No page exceeded the requested size |
| Downstream state cost | **One request per page**, via `$expand` on the navigation property — not N+1 |
| Browser-side memory | 162 rows streamed, 26 in the DOM |

---

## 7. Defects found and fixed during closure

Closure was not a formality. Nine defects were found — **two by the automated regression, five by
the browser, two by the new tests themselves** — and all nine were fixed at root cause, each with a
guard proven to bite.

### Found by the live regression

1. **`smoke-qdb-phase5` had been broken since Phase 7 and nobody had re-run it.** The KI-96 fix
   moved counts onto the write transport; this read-only smoke builds its adapter without one, so
   it aborted. Fixed with a genuinely read-only transport — GET works, every write verb refuses.
   **45/45 restored.**
2. **`smoke-domain-operations` still asserted the pre-WP8 Action Plan contract.** It called
   `plan.length` on an object and compared `undefined === 1`. Rewritten to the provenance contract,
   including the stronger negative: a look-alike activity **of the very type the action plans** must
   not be attributed, and must survive as unattributed history. **59/59.**

### Found by the browser

3. **The workspace denied capability it had.** *"Disputes and complaints are Phase 9. No entity
   exists for them yet"* — on a product that records disputes and raises complaints as Cases. The
   same denial appeared on the case's own Workout tab. Four route summaries and the tab corrected.
4. **Selecting a piece of work did nothing.** `MyWorkView` documented that a row opens its case and
   never wired it. Every test passed because none of them clicked.
5. **A working screen announced itself unimplemented.** `PendingPhaseNotice` was doing two jobs:
   *this screen does not work* and *this screen is not finished*. Printed above four rows of live
   data it read *"No data is shown here, because none would be real."* Split into two components.
6. **The Deceased Review card was invisible on every case.** Its read is by derived id, so *no
   review recorded* answers **not found** — and `nullIfNotFound` checked only `error.status`, which
   the client API **never sets**. The real rejection carries `errorCode: 2147746327` (`0x80040217`)
   and is not even an `Error`. Every absent record surfaced as a failure. Read from the platform,
   not assumed, and fixed at the adapter.
7. **`[object Object]` was back.** Phase 7 built `describeFailure` for exactly this and documented
   it as the only permitted way; five later sites hand-rolled
   `x instanceof Error ? x.message : String(x)` anyway. All five replaced, and the pattern is now
   banned by a source sweep.

### Found by the closure tests themselves

8. **A count that could not be obtained had no rejection handler** — two unhandled rejections, and
   in the browser a failing count would have thrown rather than degrading. Counts now fall back to
   *unknown*, per bucket, so one failure cannot blank the rest.
9. **A guard that could not fail.** The row-navigation test rendered `MyWorkView` directly, so
   removing the handler in `QueuesView` left it green — the same vacuity that WP8's G1 and WP10's V3
   had. A second test now renders through `QueuesView`.

**Guards proven to bite at closure: 9.** Each defect was reintroduced, the suite observed to fail,
and the file restored from an in-memory copy. With WP17's 12, **21 guards have been proven to bite
across WP17 and closure.**

---

## 8. Explicitly **not** delivered

Stated so the accepted architectural boundaries are not later misread as missing work.

Phase 8 does **not** deliver:

- **Downstream Restructuring / Facility Amendment integration** — PARKED; discovery complete.
- **Insurance Claim processing** — no credit-life or death-benefit process exists to integrate with
  (KI-125). The claims capability on the organisation is guarantee and programme claims, a
  different product family.
- **Automatic treatment of a QCB deceased indication as verified death** — it is shown as an
  indication requiring verification, and nothing acts on it.
- **Automatic communication suppression** for deceased or disputed cases — no pause, no channel
  suppression, no hold. `creditonhold`, `qdb_collectionpaused`, the MIS deceased flag and activities
  are **never** used as a generic communication hold.
- **An enabled Legal hand-off** — no qualification policy exists (KI-109), so no enabled officer
  action offers *Send to Legal*, *Raise Litigation*, *Submit to Legal* or *Create Litigation
  Request*, for anyone.
- **An autonomous Smart Assignment or routing algorithm** — native Dynamics ownership only.
- **An invented Complaint lifecycle** — the Case belongs to QDB's complaints process; DCP links to
  it and reads it.
- **An invented Legal lifecycle** — `qdb_qdblegal` remains entirely owned by QDB's Legal process.
- **An invented escalation policy** — escalation is surfaced where the platform records it, never
  inferred from lateness.
- **A Work Item entity, queue entity, workflow engine, assignment engine, escalation engine or
  persisted operational lifecycle.** The 11 operational buckets are **read models** over records
  that already exist.

---

## 9. Timing

**The original 36.50-hour baseline is preserved exactly and is not rewritten to match the expanded
scope.**

| | Hours |
|---|---|
| **Original Phase 8 baseline** (16 work packages) | **36.50** |
| Approved scope additions — Disputes & Complaints, Deceased & Insurance (two functional modules the original 16 packages did not contain) | **+9.50** |
| **Latest approved revised forecast** | **46.00** |

### Revised-forecast history

| Date | Event | Forecast |
|---|---|---|
| Phase 8 start | Original baseline, 16 WPs | 36.50 |
| 2026-09-21 | QDB sequencing decision: Restructuring parked; Disputes & Complaints and Deceased & Insurance added as functional modules | 46.00 |

### Actuals

| Work package | Estimate | Actual | Variance |
|---|---|---|---|
| WP17 — Operational queues and work management UI | 3.00 | **3.50** | **+0.50** — snapshot immutability guard and the `$expand` investigation |
| WP18–WP21 — validation, browser QA, hardening, documentation and closure | 8.50 | **10.00** | **+1.50** — nine defects found and fixed at root cause during closure, with guards |
| WP1–WP16 | 24.00 | *not separately recorded* | — |

**Blocked / waiting time: 0.00.** No open QDB decision blocked development at any point, because
every dependent capability fails closed rather than waiting.

**Variance against the original 36.50 baseline: +11.50** — of which **+9.50 is approved additional
scope** and **+2.00 is execution variance**.
**Variance against the latest approved revised forecast of 46.00: +2.00.**

Per-work-package actuals for WP1–WP16 were not separately recorded; the tracker holds their
estimates. That is stated rather than reconstructed.

---

## 10. Repository and branch state

| | |
|---|---|
| Branch | `feat/dcp-phase8-strategy-automation` |
| Closure commit | **`c09ee67d4f60b25b6d3a66fe797320955bf958d3`** |
| Working tree | clean at closure |
| Generated artefacts committed | none — build output, logs and fixtures are excluded |
| Remote | **Verified 2026-09-22.** `origin/feat/dcp-phase8-strategy-automation` resolves to `c09ee67d`; local and remote HEAD identical (0 ahead, 0 behind); all 18 accepted commits present on the remote ref; 24 commits ahead of the Phase 7 closure point |

**History was not rewritten and nothing was force-pushed.**

---

## 11. Recommendation

**Phase 8 development can be formally closed.** The software is complete, regression-safe at 1,872
automated tests, validated live against the organisation, validated in the browser, and leaves zero
residue.

**Phase 8 cannot be deployed to production officers**, and no part of this pack should be read as
saying otherwise. Sixteen production dependencies remain, five of them one recurring security
question. Every one of them is a QDB decision, none is outstanding development, and every dependent
capability fails closed until answered.
