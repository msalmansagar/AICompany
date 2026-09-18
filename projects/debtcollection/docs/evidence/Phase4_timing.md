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
