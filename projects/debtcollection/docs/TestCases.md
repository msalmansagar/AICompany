# DCP — Test Case Baseline Catalogue (Phase 0)

**Status:** baseline · 2026-09-17. `Exists` = an automated or scripted test exists today and its result is
recorded in `TestingStrategy.md` §1. Everything else is `Not Started`. Platform column: C = cloud,
O = on-prem, B = both. Types: U unit · F functional · T technical · S security · P portability · E E2E.

## A. Existing live smoke checks (cloud org, `smoke-plugins.mjs`)

| ID | Area | Scenario | Type | Platform | Status |
|---|---|---|---|---|---|
| TC-001 | Smoke | customer created | F | C | Exists — pass |
| TC-002 | Smoke | case created | F | C | Exists — pass |
| TC-003 | Smoke | invalid transition New → Settled rejected | F | C | Exists — pass |
| TC-004 | Smoke | valid transition New → Assigned accepted | F | C | Exists — pass |
| TC-005 | Smoke | valid transition Assigned → In Progress accepted | F | C | Exists — pass |
| TC-006 | Smoke | second case parked in Assigned before flag flip | F | C | Exists — pass |
| TC-007 | Smoke | stop-contact flag set | F | C | Exists — pass |
| TC-008 | Smoke | guard rejects In Progress → Pending Customer Response when stop-contact | F | C | Exists — pass |
| TC-009 | Smoke | carve-out allows → Deceased/Insurance Review | F | C | Exists — pass |
| TC-010 | Smoke | flag flip auto-moves parked case to Deceased/Insurance Review | F | C | Exists — **fail** (`IsValidForQueue=false`) |
| TC-011 | Smoke | case Delete blocked (sysadmin included) | S | C | Exists — pass |
| TC-012 | Smoke | audit rows written for the case (async) | F | C | Exists — pass |
| TC-013 | Smoke | audit row immutable | S | C | Exists — pass |
| TC-014 | Smoke | snapshot created | F | C | Exists — pass |
| TC-015 | Smoke | snapshot immutable | S | C | Exists — pass |
| TC-016 | Smoke | same smoke suite on an on-prem 9.1 org | P | O | Not Started (no org, Entra-only auth) |

## B. Plugin behaviour (unit, retarget to `qdb_` in Phase 1)

| ID | Area | Scenario | Type | Platform | Status |
|---|---|---|---|---|---|
| TC-020 | Status matrix | every legal transition in the matrix accepted | U | B | Exists (92 C#) |
| TC-021 | Status matrix | every illegal transition rejected with a named reason | U | B | Exists |
| TC-022 | Status matrix | Deceased/Insurance Review reachable from **every** non-terminal state | U | B | Exists |
| TC-023 | Status matrix | terminal states (Closed, Written Off) reject all transitions except Reopened path | U | B | Exists |
| TC-024 | Stop-contact guard | move into a contact-bearing state refused when customer flagged | U | B | Exists (reads `msst_dcpcustomer`) |
| TC-025 | Stop-contact guard | guard reads flag from `contact` (HL) and `account` (BFD) via PreImage | U | B | Not Started |
| TC-026 | Immutability | snapshot Update/Delete blocked | U | B | Exists |
| TC-027 | Immutability | completed activity Update/Delete blocked; open activity allowed | U | B | Exists |
| TC-028 | Immutability | case Delete blocked for every caller | U | B | Exists |
| TC-029 | Default status | new case gets New/Open, new PTP activity gets Active | U | B | Exists (case, PTP entity) |
| TC-030 | Subject composer | subject composed from activity-type **lookup name** + customer | U | B | Not Started (today: option-set label) |
| TC-031 | Queue mover | flag flip moves every active non-terminal case to Deceased & Insurance queue | U | B | Exists |
| TC-032 | Queue mover | per-case isolation — one refusal does not strand the rest | U | B | Exists |
| TC-033 | Queue mover | **smoke asserts the queue item exists** after the move (the missing assertion) | F | B | Not Started |
| TC-034 | Queue | `IsValidForQueue = true` on `qdb_collectioncase` at creation — regression | T | B | Not Started |
| TC-035 | Episode rule | plugin rejects a second active case for the same `qdb_facilitynumber` | U | B | Not Started |
| TC-036 | Technical log | a DCP `qdb_crmlogs` row is append-only once written, and DCP rows are identifiable by `qdb_source` among the 1,295 pre-existing rows | U | B | Not Started |

## C. MIS scenarios (Correction Prompt §37 — Mock and API providers)

| ID | Scenario | Type | Platform | Status |
|---|---|---|---|---|
| TC-100 | Individual / HL customer resolves to contact | F | B | Not Started |
| TC-101 | SME / Corporate / BFD customer resolves to account | F | B | Not Started |
| TC-102 | New delinquency → case created, episode 1, snapshot written | F | B | Not Started |
| TC-103 | Existing active case → position updated, no new case | F | B | Not Started |
| TC-104–113 | One scenario per bucket: 1-30, 31-60, 61-90, 91-180, 181-270, 271-360, 361-500, 501-1000, 1001-2000, >2000 | F | B | Not Started |
| TC-114 | Bucket movement → same case, snapshot appended, bucket-change trigger | F | B | Not Started |
| TC-115 | Increasing DPD | F | B | Not Started |
| TC-116 | Increasing arrears | F | B | Not Started |
| TC-117 | Decreasing arrears | F | B | Not Started |
| TC-118 | Partial payment | F | B | Not Started |
| TC-119 | Cure → cure date set, closure by configured rule | F | B | Not Started |
| TC-120 | Re-delinquency after cure → new episode | F | B | Not Started |
| TC-121 | New delinquency episode numbering | F | B | Not Started |
| TC-122 | Existing PTP on case when position changes | F | B | Not Started |
| TC-123 | Broken PTP detection from MIS position | F | B | Not Started |
| TC-124 | Missing customer → identity exception, no case, no master created | F | B | Not Started |
| TC-125 | Missing facility → identity exception | F | B | Not Started |
| TC-126 | Invalid customer id | T | B | Not Started |
| TC-127 | Invalid facility id | T | B | Not Started |
| TC-128 | Duplicate MIS record within a batch → deduped | T | B | Not Started |
| TC-129 | Duplicate MIS batch → no duplicate snapshots, under the **confirmed** key composition (the physical composition is `TBD — Requires QDB/MIS Confirmation`; see TC-520–528) | T | B | Not Started |
| TC-130 | Zero / cleared arrears | F | B | Not Started |
| TC-131 | MIS unavailable → fallback shown, labelled not live | T | B | Not Started |
| TC-132 | Timeout | T | B | Not Started |
| TC-133 | Retry with backoff | T | B | Not Started |
| TC-134 | Idempotent re-run of the same batch | T | B | Not Started |
| TC-135 | Identity exception lifecycle (open → reviewed → resolved) | F | B | Not Started |
| TC-136 | Stale MIS response (older as-of than cached) | T | B | Not Started |
| TC-137 | Live MIS success → Live badge with MIS as-of | F | B | Not Started |
| TC-138 | Live MIS failure with fallback | T | B | Not Started |
| TC-139 | Background sync success → watermark advanced | T | B | Not Started |
| TC-140 | Background sync partial failure → per-row isolation, watermark not advanced | T | B | Not Started |
| TC-141 | Mock and API providers return identical canonical types (contract test) | T | B | Not Started |
| TC-142 | Excel bucket artifact `2026-01-30` normalised to `1-30` | U | B | Not Started |
| TC-143 | Live dashboard read creates **zero** CRM writes | T | B | Not Started |
| TC-144 | Refresh click creates no snapshot | T | B | Not Started |
| TC-145 | Breakdown totals from mock tie to detailed rows (3,905 / 3,777 / 4,357 rule) | U | B | Not Started |
| TC-146 | `accountStatusCode` (`'7'`, `'8'`) passes through uninterpreted — no branch, no derived meaning (F7) | U | B | Not Started |
| TC-147 | `instalmentCoverageRatio` carries `sourceField: 'Arrear %'`; never computed as arrears ÷ balance (F8) | U | B | Not Started |
| TC-148 | `lastArrearAmount` handled as a raw fact — no assumption that it equals the instalment (F8) | U | B | Not Started |
| TC-149 | `dpdAsOfDate` carried separately from `misAsOfDate`; the +16-day observation is not hard-coded (F3) | U | B | Not Started |
| TC-150 | Mobile number never participates in identity resolution — a number shared by many customers merges nothing (F4, F11) | U | B | Not Started |
| TC-151 | Legacy 7-digit identifier preserved verbatim and routed by configuration, not rejected on length (F4) | F | B | Not Started |
| TC-152 | `nationalId` disagrees with `customerNumber` → `InconsistentWithCustomerNumber` exception, never a silent pick (F4) | F | B | Not Started |

## D. Communication chain

| ID | Scenario | Type | Platform | Status |
|---|---|---|---|---|
| TC-200 | Manual SMS → fax row created via Communication Service | F | B | Not Started |
| TC-201 | Manual WhatsApp → fax row | F | B | Not Started |
| TC-202 | Manual Email → email row | F | B | Not Started |
| TC-203 | System-initiated send uses the same service and validation path | F | B | Not Started |
| TC-204 | Stop-contact customer blocked (manual and background); block reason logged | S | B | Not Started |
| TC-205 | Deceased restriction; heir communication requires approval | S | B | Not Started |
| TC-206 | Consent missing for channel → blocked | S | B | Not Started |
| TC-207 | Free text without privilege → blocked | S | B | Not Started |
| TC-208 | Template not approved / out of effective window → blocked | F | B | Not Started |
| TC-209 | Unified timeline shows activities + fax + email + process events chronologically | F | B | Not Started |
| TC-210 | Arabic / English template selection by customer language | F | B | Not Started |
| TC-211 | Contact Hold evaluated server-side for a **manual** React send and an **automated** strategy send — identical refusal, identical code path (F6) | S | B | Not Started |
| TC-212 | Contact Hold cannot be bypassed by calling the operation or HTTP route directly — UI hiding is not the control (F6) | S | B | Not Started |
| TC-213 | A confirmed deceased indicator triggers Contact Hold **evaluation**; the hold result comes from the ruleset and is not asserted as `QCB DEAD ⇒ hold` (F6) | S | B | Not Started |
| TC-214 | Contact Hold refusal recorded with reason, ruleset code and ruleset version | F | B | Not Started |

| TC-215 | Unified history returns SMS/WhatsApp from `fax`, Email from `email` and Warning Letters from the approved document source, merged in one chronological page | F | B | Not Started |
| TC-216 | **No DCP communication entity exists**: the schema contains no `qdb_communication`, no per-channel table, and the history is produced without writing to any DCP table | F | B | Not Started |
| TC-217 | Only DCP-originated communications appear: a `fax` on the same customer with no Collection correlation is absent from the history | F | B | Not Started |
| TC-218 | A user without Read on `fax` sees the Email and Letter entries but not the SMS/WhatsApp ones — aggregation confers no access (SecurityModel §5b) | S | B | Not Started |
| TC-219 | Filtering by channel, date range and status is applied at the source: rows outside the filter are never returned to the caller | S | B | Not Started |
| TC-220 | An entry whose source reports no delivery status renders as "unknown"; the history never implies delivery | F | B | Not Started |
| TC-221 | A send creates exactly one native record and **no** mirror `qdb_collectionactivity`, unless the configured collection process requires an action record | F | B | Not Started |
| TC-222 | From a history entry the officer can navigate Collection Case ↔ Collection Activity ↔ fax/email/letter | F | B | Not Started |

## E. Security

| ID | Scenario | Type | Platform | Status |
|---|---|---|---|---|
| TC-300 | Collection Officer: create/read/update own-BU case; no delete anywhere | S | B | Not Started |
| TC-301 | Unauthorised CRM user opens the direct web-resource URL → no Collection data | S | B | Not Started |
| TC-302 | Record-id manipulation in URL → CRM security refuses | S | B | Not Started |
| TC-303 | API manipulation (call `Xrm.WebApi` for another BU's case) → refused | S | B | Not Started |
| TC-304 | Field security masks mobile/email/address on contact/account for roles without View Sensitive PII | S | B | Not Started |
| TC-305 | Team / BU scoping of queues and views | S | B | Not Started |
| TC-306 | Approval actions only for Process-Engine-authorised roles | S | B | Not Started |
| TC-307 | Audit/Compliance role read-only on everything | S | B | Not Started |
| TC-308 | No secrets in `qdb_platformconfiguration` (static scan) | S | B | Not Started |

## F. Portability

| ID | Scenario | Type | Platform | Status |
|---|---|---|---|---|
| TC-400 | Same build artefact deployed to cloud and on-prem; only config/package differ | P | B | Not Started |
| TC-401 | Web API version resolved from runtime context (`v9.1` / `v9.2`), no literal in Collection code | P | B | Not Started |
| TC-402 | Operation call via `Xrm.WebApi.online.execute` works for Custom API (cloud) and Process Action (on-prem) | P | B | Not Started |
| TC-403 | `AdfsAdapter` against a real AD FS 2019 endpoint (COND-008) | P | O | Not Started |
| TC-404 | `AzureAdAdapter` against Entra ID | P | C | Exists (mock issuer only) |
| TC-405 | Static scan: no `if (cloud)` / `if (onPrem)` in services, SDK, React | P | B | Not Started |
| TC-406 | Customer lookup `qdb_customerid` provisioned via `CreateCustomerRelationships` on both targets | P | B | Not Started |
| TC-407 | Provisioning tooling runs against on-prem with AD/AD FS auth | P | O | Not Started |
| TC-408 | Solution import into on-prem 9.1 (package version 9.0) | P | O | Not Started |

## G. Collection Eligibility / Grace and configuration-driven behaviour (F1, F2, F9)

Eligibility is a Rule Engine ruleset, not code (`APIContracts.md` §3A.2, ADR-DCP-11). Per
`TestingStrategy.md` §2A, **no case below may assert a threshold as a literal constant** — thresholds come
from a fixture ruleset and the assertion is on behaviour given that configuration.

| ID | Scenario | Type | Platform | Status |
|---|---|---|---|---|
| TC-500 | `EligibleCreateCase` → case created, episode opened, decision recorded on the snapshot | F | B | Not Started |
| TC-501 | `ExistingEpisodeUpdate` → existing active case updated; **no second case** for the same facility | F | B | Not Started |
| TC-502 | `GraceMonitor` → **no Collection Case created**, yet traceable history is written per `qdb_snapshotpolicy` | F | B | Not Started |
| TC-503 | `ExcludedSpecialHandling` → no case; exclusion reason and ruleset version recorded | F | B | Not Started |
| TC-504 | `IdentityException` → `qdb_identityexception` row; no case, no customer or facility master created | F | B | Not Started |
| TC-505 | `FacilityException` → `qdb_identityexception` row; no case | F | B | Not Started |
| TC-506 | Ordering: eligibility is evaluated **after** identity and facility resolution and **before** case creation | T | B | Not Started |
| TC-507 | Grace threshold changed in configuration alters the outcome for the same input with **no code change** | T | B | Not Started |
| TC-508 | HL and BFD rulesets with **materially different** criteria and thresholds both pass on the same build | P | B | Not Started |
| TC-509 | Exposure enabled as a strategy criterion for BFD and disabled for HL — identical code path (F9) | F | B | Not Started |
| TC-510 | Review/static check: no DPD number, arrears ratio, bucket boundary or segmentation cut-off asserted as a literal in any test or Collection source file | P | B | Not Started |
| TC-511 | Decision audit complete: `qdb_eligibilityoutcome`, reason, ruleset code, ruleset version, evaluated-on | F | B | Not Started |
| TC-512 | `qdb_snapshotpolicy` = `AllReceived` / `EligibleOnly` / `ChangedOnly` each persist as specified | T | B | Not Started |
| TC-513 | Mock and API providers yield identical eligibility decisions from identical canonical input (contract test) | T | B | Not Started |
| TC-514 | Eligibility invoked through the same operation surface on cloud (Custom API) and on-prem (Process Action) | P | B | Not Started |
| TC-515 | A record that yields no case never advances the episode counter and never creates a queue item | T | B | Not Started |

### G1. Snapshot idempotency and snapshot policy (gate corrections 2, 3, 8)

The physical `qdb_snapshotkey` composition is `TBD`; these cases test the **requirement**, not a formula.
No case here may assert a specific composition as the approved one.

| ID | Scenario | Type | Platform | Status |
|---|---|---|---|---|
| TC-520 | Replayed batch → **no second snapshot** for the same observation (candidate key: facility + financial as-of) | T | B | Not Started |
| TC-521 | Replayed batch → no duplicate (candidate key: facility + financial as-of + DPD as-of) | T | B | Not Started |
| TC-522 | Replayed batch → no duplicate (candidate key: facility + MIS source timestamp) | T | B | Not Started |
| TC-523 | Replayed batch → no duplicate (candidate key: facility + source record/version identifier) | T | B | Not Started |
| TC-524 | Candidate key **including batch id unconditionally** is shown to break replay idempotency (expected failure, documented) | T | B | Not Started |
| TC-525 | Duplicate row within one batch → single snapshot | T | B | Not Started |
| TC-526 | Reprocess after partial failure → no duplicate, watermark only advances on success | T | B | Not Started |
| TC-527 | Two distinct observations of the same facility (different as-of) both persist — idempotency must not collapse genuine history | T | B | Not Started |
| TC-528 | DPD as-of distinct from financial as-of is preserved on the snapshot (`qdb_dpdasofdate`) and does not corrupt the key | T | B | Not Started |
| TC-530 | Same feed under `AllReceived` / `EligibleOnly` / `ChangedOnly`: record volume compared and reported | T | B | Not Started |
| TC-531 | …auditability compared — every `GraceMonitor` decision still explainable under each policy | F | B | Not Started |
| TC-532 | …replay behaviour compared — no duplicates under any policy | T | B | Not Started |
| TC-533 | …storage growth projected over 12 months at HL volumes under each policy | P | B | Not Started |
| TC-534 | …case-creation behaviour **identical** under all three (policy affects history only) | F | B | Not Started |
| TC-535 | …change detection: a genuine bucket/DPD/arrears movement is detected and correctly dated under each policy | F | B | Not Started |
| TC-536 | A `GraceMonitor` record that is unchanged across many syncs does **not** accumulate a new snapshot on every sync under the chosen policy | T | B | Not Started |
| TC-537 | No production default is assumed: the suite fails if a policy value is hard-coded rather than read from `qdb_platformconfiguration` | P | B | Not Started |
| TC-540 | `IdentityException` observation persists with **source identifiers only** — no resolved CRM customer, facility or case | F | B | Not Started |
| TC-541 | `FacilityException` observation persists **without a resolved CRM Facility GUID** | F | B | Not Started |
| TC-542 | Source-identity columns (`qdb_customerbusinessid`, `qdb_facilitynumber`, `qdb_snapshotdate`, `qdb_receivedon`, `qdb_integrationbatchid`) are present on every persisted observation | T | B | Not Started |
| TC-543 | An unresolved observation can be **reprocessed later** from its stored source identifiers alone, after the customer/facility is created in CRM | F | B | Not Started |
| TC-544 | No CRM lookup on `qdb_delinquencysnapshot` is mandatory (metadata check) | T | B | Not Started |
