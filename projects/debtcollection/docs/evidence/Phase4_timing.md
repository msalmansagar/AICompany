# Phase 4 — effort estimate and time tracking

**Timezone:** `Asia/Qatar` (UTC+03:00). The machine's own timezone is already `Asia/Qatar`, so the
system clock and the reporting clock are the same — no conversion was applied.

Every timestamp in this file is captured from the machine clock at the moment it happened. **Nothing
here is reconstructed from memory**, and this file is written as the phase runs, not afterwards.

---

## Start

| | |
|---|---|
| **Start time (machine, UTC)** | `2026-09-18T12:23:35.294Z` |
| **Start time (Asia/Qatar)** | **Friday, 18 September 2026 at 15:23:35 GMT+03:00** |
| **Original estimated effort** | **19.0 hours** |
| **Original expected completion (Asia/Qatar)** | **Saturday, 19 September 2026 at 10:23:35 GMT+03:00** |
| Branch | `feat/dcp-phase4-mis-integration`, from the approved Phase 3 baseline `77ed073e` |
| Captured by | `node -e` against `Intl.DateTimeFormat` with `timeZone: 'Asia/Qatar'` |

---

## Effort breakdown — the estimate

Claude/AI execution hours, including coding, tests, Cloud deployment, runtime validation, regression
and documentation. Calibrated against Phase 3, which delivered ~4,100 insertions across 62 files with
live validation and a full documentation package.

| Work package | Hours | What is in it |
|---|---:|---|
| MIS Contract / Normalization | 1.5 | Canonical `ArrearDetailRaw` / `Derived` / `ArrearDetail`, `BucketCode`, freshness and provenance envelope; the normalization boundary that stops a raw MIS payload reaching Collection logic or React |
| MIS Service / Adapter | 2.0 | `IMisDelinquencyService`; `MockMisDelinquencyService` with the scenario switches; `ApiMisDelinquencyService` skeleton against the **unconfirmed** contract; provider switch from configuration |
| Background Synchronization | 2.0 | Incremental page → normalize → process → persist → checkpoint → next page; restart and replay after failure; run and batch identity |
| Server-Side Paging | 2.5 | The common paged query contract with **opaque** continuation tokens; extending `ICrmAdapter` without breaking its six existing callers; `@odata.nextLink` preserved, never reconstructed; MIS paging kept neutral across cursor / token / paging cookie |
| Filtering / Sorting | 1.0 | Server-side filter, sort and search in the same contract; changed-criteria reset semantics |
| Strategy Execution Integration | 1.0 | Eligibility → strategy → actions orchestration boundary on the Phase 3 facade, failing closed while KI-48 is open |
| Failure / Retry / Idempotency | 1.5 | Per-record isolation inside a batch; retry; replay producing no duplicate case, episode, snapshot or downstream action |
| Automated Testing | 3.0 | The paging correctness matrix (17 cases), normalization, malformed responses, resolution, fallback metadata, sync restart, duplicate prevention, large synthetic datasets, performance-oriented tests |
| Cloud Runtime Validation | 1.5 | A Phase 4 live smoke on `org5869857f`, including **real `@odata.nextLink` evidence** — mandatory under the KI-52 rule |
| Regression | 1.0 | Phase 1, 2 and 3 live regression plus any breakage from the `ICrmAdapter` change |
| Documentation / Gate Evidence | 2.0 | The 22-item gate, ADRs, API Contracts, Entity Dictionary, Known Issues, Risk Register, Change Log, Testing Strategy, Project Tracker, completion report |
| **TOTAL** | **19.0** | |

---

## Reusable from Phases 1–3 — why the estimate is not larger

The estimate assumes the following are reused rather than rebuilt. This was verified by inspection
before estimating, not assumed:

| Reused | Where | Consequence |
|---|---|---|
| The **whole synchronisation pipeline** | `DelinquencySyncService` — resolve → facility identity → eligibility → episode action → snapshot → exception | Phase 4 adds paging, batching and checkpointing *around* it, not a new pipeline |
| Canonical observation model | `MisDelinquencyRecord`, `FacilityIdentity`, `CustomerIdentity` | The normalization target already exists and is validated |
| Domain decisions | `decideCustomerResolution`, `decideEpisodeAction`, `composeSnapshotKey`, `caseLifecycle`, `eligibility` outcomes | No Collection rule is re-implemented |
| Rule Engine seam | `IRuleEngine`, `RuleEngineClient`, `StubRuleEngine` | Strategy execution plugs into an existing fail-closed facade |
| Strategy and assignment configuration | `StrategyRepository`/`Service`, `AssignmentService` | Execution reads configuration that is already live and proven |
| Platform access | `ICrmAdapter`, `DataverseCrmAdapter`, `DataverseClient` (retry, dual-platform URL) | Paging extends a working adapter |
| Repositories | case, snapshot, activity, identity exception | Persistence is done |
| Configuration | `PlatformConfigurationService`, `CollectionConfigurationService` | Provider switch and page-size bounds have somewhere to live |
| Technical logging | the `qdb_crmlogs` writer | No new log entity, no schema extension |
| Test and cleanup harness | `FakeCrmAdapter`, `collectionFixtures`, the live-smoke pattern, `clean-qdb-smoke-data.mjs` | A Phase 4 smoke is a new script, not new infrastructure |

**Genuinely new, and where the risk sits:** server-side paging as a cross-cutting contract, background
synchronisation with checkpointing, and the MIS adapter boundary against a contract QDB has not yet
supplied.

---

## Dependencies and TBDs identified at start

| # | Item | Owner | Effect on Phase 4 |
|---|---|---|---|
| 1 | **The actual MIS API contract** — endpoints, auth, paging mechanism, change feed, page-size limits, error and retry contract, whether cured records are returned | QDB / MIS | The interface, normalization model, adapter boundary and mock provider are built; the API provider is a skeleton marked **TBD — Actual MIS Contract Required**. Mock data will **not** be presented as live MIS runtime validation |
| 2 | **Rule Engine operations** (KI-48) | QDB | Eligibility and strategy orchestration fail closed. Test providers only in automated tests. No hard-coded eligibility logic substituted |
| 3 | **Smart Assignment contract** (KI-09) | QDB | Not expanded in Phase 4 beyond the approved scope |
| 4 | **Contact Hold authoritative source** (KI-44) | QDB | Does not block MIS processing; relevant when communication execution is built |
| 5 | **Snapshot idempotency composition** | QDB / MIS | Stays deployment configuration; the production composition is **not** frozen |
| 6 | **On-premises organisation** (KI-08 / KI-22) | project | Phase 4 stays *On-Prem Compatible by Design — Runtime Test Pending* |
| 7 | MIS source workbooks are **not in this repository** | project | The mock is seeded from the documented field contract and `HousingLoanDataAnalysis.md`, and says so |

## Risks at start

| Risk | Mitigation |
|---|---|
| Extending `ICrmAdapter` breaks its existing callers — six repositories and every Phase 1–3 test | Add a paged method beside `retrieveMultiple` rather than changing it; full regression before the gate |
| Paging built against a belief about `@odata.nextLink` rather than the platform's behaviour — exactly KI-52 | Treat the link as an **opaque** token; prove it live on `org5869857f` before the gate |
| Designing MIS paging around a mechanism MIS does not offer | Keep the abstraction neutral across continuation token, cursor and paging cookie; no hard-coded maximum dataset size |
| A checkpoint advancing past unprocessed data, silently losing Collection events | Checkpoint only after a page's records are persisted; restart and replay tests before the gate |
| Estimate variance from the MIS contract arriving mid-phase | Tracked here; a revised estimate is recorded rather than the original being edited |

---

---

## How time is counted

Two clocks, kept apart on purpose.

| | |
|---|---|
| **Wall-clock elapsed** | Start to finish on the calendar, including everything |
| **Effective Claude execution time** | Only the periods in which work was actually being produced |

A period is **not** effective execution time when the session is stopped, the machine sleeps, VS Code
is closed, execution is paused, approval or input is being waited on, or an external QDB dependency
prevents progress. Those are recorded as **inactive/blocked** with the reason.

Segment boundaries are taken from **git commit timestamps**, which are machine records written at the
moment the work landed. They are not reconstructed from memory.

### Segment ledger

Boundaries are **git commit timestamps** — machine records written when the work landed. Nothing here
is reconstructed from memory, and each work package is closed out as it finishes rather than at the end.

| # | From | To | Hours | Kind | Evidence |
|---|---|---|---:|---|---|
| 1 | 18 Sep 15:23:35 | 18 Sep 16:31:14 | **1.127** | Execution | `b0e483d9` 16:03:48 · `398dfc81` 16:14:49 · `bb818b37` 16:31:14 |
| — | 18 Sep 16:31:14 | 18 Sep 17:14:53 | 0.728 | **Blocked** | Awaiting gate approval after work package 1 |
| 2 | 18 Sep 17:14:53 | 18 Sep 18:06:40 | **0.863** | Execution | `192c902f` 17:37:27 · `55287e0a` 17:44:13 · `b73ff461`/`ee44da0a` 18:06:40 |
| — | 18 Sep 18:06:40 | 18 Sep 18:15:00 | 0.139 | **Blocked** | Awaiting approval of packages 2–4 |
| 3 | 18 Sep 18:15:00 | *open* | — | Execution | Background synchronisation onward |

**Running totals at 18 Sep 18:15:00 (+03:00):**

| | Hours |
|---|---:|
| Wall-clock elapsed | 2.857 |
| Inactive / blocked (approval waits) | 0.867 |
| **Effective Claude execution** | **1.990** |
| Original estimate | 19.0 |

### Effort by work package — estimate against actual effective execution

Actuals are taken from the commit boundaries above, captured as each package closed.

| Work package | Estimated | Actual effective | Variance | Status |
|---|---:|---:|---:|---|
| Server-Side Paging | 2.50 h | **1.127 h** | **−1.373 h** | complete — spike, contract, both fakes, 30 domain tests, 16/16 live |
| MIS Contract Analysis | *(inside Normalization's 1.5 h)* | **0.376 h** | — | complete — four documented claims corrected against real data |
| MIS Normalization | 1.50 h (shared with the above) | **0.113 h** | **−1.011 h** combined | complete — 46 tests |
| MIS Adapter / Fallback | 2.00 h | **0.374 h** | **−1.626 h** | complete — 3 providers, 25 tests |
| Background Sync | 2.00 h | — | — | in progress |
| Checkpoint / Restart | *(inside Background Sync)* | — | — | in progress |
| Idempotency / Replay | 1.50 h | — | — | not started |
| Eligibility / Strategy orchestration | 1.00 h | — | — | not started |
| Filtering / Sorting | 1.00 h | *(delivered inside paging)* | — | substantially complete |
| Performance / large volume | *(inside Automated Testing 3.0 h)* | — | — | not started |
| Regression | 1.00 h | — | — | ongoing each milestone |
| Cloud Runtime Validation | 1.50 h | *(0.2 h so far, inside paging)* | — | ongoing |
| Documentation / Gate Evidence | 2.00 h | — | — | ongoing |
| **Closed so far** | **6.50 h** | **1.990 h** | **−4.510 h** | 4 of 11 packages |

**The original 19.0-hour estimate stands unmodified.** Running at roughly 31 % of estimate on closed
packages. That is not yet a reason to re-estimate: the four closed packages leaned heavily on Phase 1–3
reuse, and the remaining ones — synchronisation, orchestration, large-volume testing and the 22-item
gate — are the parts with the least existing scaffolding.

### Estimate updates

*None issued.* An update will be recorded as a new row here, preserving the original, if remaining
scope changes materially.

### Development incidents, recorded rather than hidden

| When | Incident | Resolution |
|---|---|---|
| 18 Sep 18:06 | A milestone commit landed while `turbo type-check` was failing: `exactOptionalPropertyTypes` rejected a possibly-undefined continuation in a test. Vitest passed it, and the commit had been chained behind a `grep` whose exit status masked the compiler error. | Fixed in `ee44da0a`; turbo green at 13/13. **Process change: type-check, tests and build are now run as an explicit gate that must return success before any milestone commit — a commit is not evidence that the build was healthy.** |

---

## Completion

*Recorded at the end of the phase from the machine clock — not reconstructed.*

| | |
|---|---|
| Revised estimated hours | — |
| Revised expected completion | — |
| Actual completion time (Asia/Qatar) | — |
| Actual elapsed hours | — |
| Blocked time | — |
| Effective Claude execution time | — |
| Estimate variance | — |
