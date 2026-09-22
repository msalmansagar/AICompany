# DCP — MIS Integration (Phase 0)

**Status:** proposal for discussion with the QDB MIS team · 2026-09-17. Implements Correction Prompt
§10–39, §45–47. **Nothing in this document invents a production endpoint, URL, authentication
mechanism, SLA or frequency.** Every unconfirmed element is marked `TBD — Requires QDB Confirmation`.

Evidence base: `HousingLoanArrearReport.xlsx` (sheets *Breakdown*, *Collection & Growth*, *Deceased*)
and `HousingLoanArrearReportDetailed.xlsx` (sheet *Detailed*, 4,357 rows), both dated **30/06/2026**,
in `D:\QDB\Projects\Debt Collection Platform\`.

---

## 1. Boundary (CP §32)

| Owner | Owns |
|---|---|
| **MIS** | DPD / arrear days, arrear bucket, loan balance, total arrears, instalment, first arrear date, arrear %, exemption facts, deceased status from QCB, account status — *the current financial delinquency position* |
| **HL / BFD CRM** | customer master (contact / account), facility master |
| **Debt Collection CRM** | case, activities, PTP, strategy, assignment, process, communications, status, history, snapshots |
| **React** | unified experience; presents live MIS beside CRM Collection data with freshness metadata |

DCP never re-computes DPD, buckets or arrears (MP §17).

---

## 2. Two access patterns (CP §12)

| | A. Live MIS access | B. Background synchronisation |
|---|---|---|
| Trigger | user opens workspace / dashboard / bucket / customer / facility / case; manual Refresh; configured critical-action revalidation | scheduler (frequency `TBD`), incremental where MIS supports it |
| Reads | breakdown, details (paged), facility position | changes since watermark, or full pull |
| Writes to CRM | **none** (CP §19) | case create/update, snapshots, identity exceptions, cached position, technical log (qdb_crmlogs) |
| Drives automation | no | yes — strategy, assignment, activities, comms, Process Engine, SLA (CP §31) |
| Fallback | last cached position, labelled *not live* (CP §29) | retry / partial-failure handling / replay |
| Runs in | Integration Service (server-side; CP §35) | Integration Service (pg-boss for job state only) |

Both consume `IMisDelinquencyService` and the same canonical model (§4). Switching Mock ↔ API
changes configuration only (CP §22–23).

```
 React ── IMisDelinquencyService ──▶ Integration Service ──┬─▶ MockMisDelinquencyService (dev)
                                                          └─▶ ApiMisDelinquencyService  (QDB MIS API — TBD)
                                                                        │
                                                          normalise → Canonical MIS Model
```

---

## 3. Required MIS API capabilities (proposal — names illustrative, CP §34)

| Capability | Purpose | Inputs | Output | Status |
|---|---|---|---|---|
| `GetArrearBreakdown()` | Dashboard: current bucket aggregates without pulling detail rows | as-of (optional) | `ArrearBreakdown` | **Supported by supplied data** (Breakdown sheet) · API `TBD` |
| `GetArrearDetails(filters, paging, sorting)` | Drill-down and work lists | bucket, customer id, account no., national id, loan type, DPD range, deceased status, account status; page/pageSize/sort | `ArrearDetail[]` + paging | **Supported by supplied data** (Detailed sheet) · server-side paging `TBD` |
| `GetFacilityArrearPosition(facilityId)` | Case / customer / facility screen; critical-action revalidation | account no. | `ArrearDetail` | Derivable from detail · facility query `TBD` |
| `GetCustomerArrearPositions(customerId)` | Customer 360 (one customer, many facilities) | customer no. or national id | `ArrearDetail[]` | Derivable · `TBD` |
| `GetArrearChanges(sinceTimestamp)` | Incremental background sync | watermark | `ArrearDetail[]` + new watermark | **Not evidenced** — `TBD — Requires QDB Confirmation` (change feed / push) |
| `GetArrearTrend(bucket?)` | Monthly balance/collection growth by bucket | months | `ArrearTrend[]` | Supported by *Collection & Growth* sheet (Jan-25 → Jun-26) · optional |
| `GetDeceasedList()` | Deceased handling queue | — | `DeceasedRecord[]` | Supported by *Deceased* sheet (724 rows) · optional |

Cross-cutting requirements (CP §21): correlation id on every call, batch id on sync pulls, idempotent
re-runs, retry with backoff, timeout, rate-limit awareness, MIS as-of timestamp **returned by MIS**
(never synthesised client-side, CP §16).

---

## 4. Canonical MIS domain contract (CP §24–25)

### 4.1 `ArrearDetail` — one row per delinquent **account/facility**

| Canonical field | Type | From supplied report | Normalisation / note |
|---|---|---|---|
| `customerId` | string | Customer Number | business id; not a CRM GUID |
| `customerName` | string | Customer Name | Arabic in the sample |
| `customerType` | enum Individual·SME·Corporate | — (HL ⇒ Individual) | derived from org/product until BFD contract exists — `TBD` for BFD |
| `facilityId` | string | Account Number | business key → `qdb_facilitynumber`; unique per row (4,357 distinct) |
| `loanTypeCode` | string | Loan Type Code | 9 codes seen: 1001,1002,1003,1004,1006,1008,1010,1011,1013 |
| `loanTypeDescription` | string | Loan Type Description | e.g. Building Housing, Demolishing, Land loan… |
| `nationalId` | string | ID Number | QID — 11 digits; **1:1 with Customer Number across all 3,778 customers**; 6 seven-digit legacy values + 1 blank (`HousingLoanDataAnalysis.md` F4) |
| `qcbDeceasedStatus` | enum \| null | QCB Deceased Status | value `DEAD` (724 rows) → boolean `isDeceasedPerQcb` |
| `loanBalance` | decimal(QAR) | Loan Balance | |
| `accountStatusCode` | string | Account Status | values `7` (547 accts, median DPD 197) and `8` (3,810, median DPD 77) — carried as a code; meaning `TBD — Requires QDB Confirmation` (F7) |
| `deceasedFlag` | bool | Deceased Flag | `Deceased` → true (385 rows) |
| `deceasedNotAppliedFlag` | bool | Deceased & Not Applied Flag | 81 rows |
| `exemption20Flag` | bool | Exemption 20 Flag | 81 rows |
| `noExemptionFlag` | bool | No Exemption Flag | 3,800 rows |
| `firstArrearDate` | date | First Arrear Date | `dd/MM/yyyy` string in Excel → ISO date |
| `arrearDays` (DPD) | int | Arrear Days | **= days since First Arrear Date + 16 for 4,349/4,357 rows** — DPD appears stamped ~16 days after the balance date; 8 anomalies. Adds `dpdAsOfDate` (F3) |
| `dpdAsOfDate` | date | — (inferred) | the date the DPD counter is measured at, if different from `misAsOfDate` — `TBD — Requires QDB Confirmation` |
| `totalArrears` | decimal | Total Arrears | |
| `installmentAmount` | decimal | Installment Amount | |
| `lastArrearAmount` | decimal | Last Arrear Amount | **derived**: = instalment (3,512 rows) or = total arrears when below one instalment (F8) |
| `instalmentCoverageRatio` (was `arrearPercentage`) | decimal(0–1) | Arrear % | **derived** = `min(1, totalArrears ÷ installmentAmount)` — matches 4,280/4,309; it is *not* arrears ÷ balance (F8) |
| `exemptionPercentage` | decimal \| null | Exemption Percentage | values 0, 0.2, 0.5 |
| `exemptionAmount` | decimal \| null | Exemption Amount | **negative** in the report (−472,313.64) — sign convention `TBD` |
| `arrearBucket` | enum (10 codes) | Arrear Buckets | **Excel mangles `1-30` into the date `2026-01-30`** — the adapter must map it back; codes: `1-30, 31-60, 61-90, 91-180, 181-270, 271-360, 361-500, 501-1000, 1001-2000, >2000` |
| `mobileNumber` | string | Mobile Number | PII — masked by role; 49 blank; 36 numbers shared by 2–3 customers (family) → recipient validation, never identity (F11) |
| `misAsOfDate` | date | report title (30/06/2026) | must come from MIS in the API |
| `sourceTimestamp` | datetime | — | `TBD` |

### 4.2 `ArrearBreakdown` — aggregate per bucket

Per bucket: `bucketCode`, `customerCount`, `loanBalance`, `totalArrears`, `collectionMtd`,
`disbursementMtd`, and four **segments** each with `customerCount`, `loanBalance`, `arrears`,
`collectionMtd`, `disbursementMtd`: *Deceased & Applied*, *Deceased & Need to Apply*, *Exemption 20 %*,
*No Exemption*. Plus totals. Baseline totals from the report (for mock validation only, never constants):
customers **3,905**, loan balance **QAR 3,416,552,487.22**, total arrears **QAR 213,037,773.69**.
The bucket-customer count (3,905) exceeds distinct customers (3,777) — a customer with accounts in two
buckets counts in both; the mock must reproduce this.

### 4.3 `ArrearTrend` (optional) — per bucket, per month: `loanBalance`, `collection`, `growthPct`.

---

## 5. Identity and facility resolution (CP §38; Facility clarification 2026-09-18)

```
 ArrearDetail ── nationalId (QID, primary) ──▶ configured customer master ──▶ contact (HL) | account (BFD)
              ── customerNumber (cross-check, where mapped)
              ── facilityNumber + sourceSystem ──▶ VALIDATED, NOT LOOKED UP ──▶ this is the facility
        customer found, facility identity valid → eligibility (§5a) → case matching (§6)
        customer not found / duplicate / mismatch → qdb_identityexception — no case, no master created
        facility identity missing / malformed      → qdb_identityexception (InvalidIdentifier) — no case
```

**The facility is its MIS business identity.** `facilityNumber` plus `sourceSystem` identifies the
facility on the Collection Case and the snapshot, and nothing in the pipeline asks the organisation
for a facility record. BFD's *Facility Limit* and HL's *Customer Product* are not consulted, are not
required, and are not the source of any delinquency value; a missing row in either is not an
exception. They remain available as **optional enrichment and navigation** once a business requirement
for it is demonstrated, and any relationship to them would be a per-deployment extension outside the
shared schema.

A Facility Exception therefore means exactly one thing: the MIS identity itself could not be
processed — the number is empty, contains whitespace or control characters, exceeds the column, or the
source system is missing. Whether the final uniqueness composition needs a further MIS identifier is
`TBD` against the actual MIS contract and is not guessed.

Customer identity follows F4: the national id is primary, the MIS customer number cross-checks it where
the deployment maps a column for it, a disagreement is an `IdentifierMismatch` exception rather than a
choice, and a mobile number is never an input — `CustomerIdentitySchema` is strict.

Stable business ids are used, never GUIDs alone (MP §18).

---

## 5a. Collection Eligibility / Grace evaluation (ADR-DCP-11)

A MIS delinquency record **does not equal a Collection Case**. After identity and facility resolution, a
configurable evaluation runs through `IRuleEngine` against the ruleset named by
`qdb_platformconfiguration.qdb_eligibilityrulesetcode`.

```
 MIS Delinquency ▶ Identity Resolution ▶ Facility Identity (MIS, validated) ▶ ELIGIBILITY / GRACE ▶ Strategy Evaluation
                                                                      │
   ┌──────────────────┬──────────────────┬──────────────────┬─────────┴────────┬──────────────────┐
   ▼                  ▼                  ▼                  ▼                  ▼                  ▼
 EligibleCreateCase  ExistingEpisode   GraceMonitor    ExcludedSpecial    IdentityException  FacilityException
 create episode      Update case       no case yet     Handling           → qdb_identityexception
```

Criteria available to the ruleset: DPD · arrears amount · arrears relative to instalment · product ·
facility/customer status · special handling · existing case · cure/grace period · any other approved Rule
Engine criterion. **Nothing is hard-coded** — neither `arrears < 1 instalment` nor `DPD < N`. The Housing
Loan evidence (F2: 769 accounts below one instalment, ~1,600 month-end churn records, 305 % cure in 1-30)
is a *sample configuration and a recommendation*; the final thresholds are
`TBD — Requires QDB Confirmation` and may differ materially between HL and BFD.

The decision is recorded on `qdb_delinquencysnapshot` (`qdb_eligibilityoutcome`, `qdb_eligibilityreason`,
`qdb_eligibilityrulesetcode`, `qdb_eligibilityrulesetversion`, `qdb_eligibilityevaluatedon`), so a record
that produced no case is still auditable; `qdb_snapshotpolicy` (`AllReceived` · `EligibleOnly` ·
`ChangedOnly`) governs which records are persisted — **its production default is `TBD`, see §7.2**.
An `IdentityException` or `FacilityException` observation must persist on its **source identifiers alone**
and must **not** require a resolved CRM facility, customer or case GUID (gate correction 8).
`ExcludedSpecialHandling` may reuse the existing `qdb_exclude_customer` table —
`TBD — Requires QDB Confirmation`. **No new entity, no new engine.**

## 6. Case matching and episode rules (CP §39, MP §21)

These rules run **after** the eligibility evaluation in §5a and only for records it admits.

| Incoming position | Existing state | Action |
|---|---|---|
| DPD > 0, no active case for facility, **eligible** | — | **create** case (episode n+1), snapshot, strategy/assignment triggers |
| DPD > 0, no active case, **GraceMonitor** | — | **no case**; snapshot per `qdb_snapshotpolicy`; re-evaluated on the next sync |
| DPD > 0, active case exists | same episode | **update** cached position; snapshot if changed; bucket-movement trigger if bucket changed |
| DPD = 0 / cleared, active case exists | — | mark **cure** candidate (`qdb_curedate`), configured rule decides closure |
| DPD > 0 after cure | closed case exists | **new episode** unless approved reopening rule applies |
| Record missing from feed | active case | *no automatic closure* — flag for review (feed may omit cured records — `TBD`) |

"One active case per facility per episode" is enforced by the sync logic and guarded by a plugin
uniqueness check on `qdb_facilitynumber` + active status.

---

## 7. Snapshot creation and idempotency (CP §27–28)

- Snapshots are written **only** by background sync (and, optionally, by a configured business rule such
  as "snapshot at case creation" or "snapshot at critical action").
- A live read, a Refresh click, a re-opened case or several users viewing the same facility create
  **no** snapshot.
- Immutability is enforced by the existing `ImmutabilityGuard` (retargeted).

### 7.1 Idempotency — logical requirement, physical key `TBD`

**Requirement:** snapshot uniqueness/idempotency must be based on **stable Facility/Account identity plus
authoritative MIS observation/source identity**. Whatever composition is chosen, the implementation
**must guarantee replay idempotency**: re-running a batch, a duplicate delivery, or reprocessing after a
partial failure must never create a second snapshot for the same observation.

Candidate inputs — final composition `TBD — Requires QDB/MIS Confirmation`:

- facility/account business identifier (`qdb_facilitynumber`)
- MIS financial as-of date (`qdb_snapshotdate`)
- DPD as-of date where materially distinct (`qdb_dpdasofdate`)
- MIS source timestamp (`qdb_missourcetimestamp`)
- source record / version identifier, if MIS exposes one
- integration batch / run identifier (`qdb_integrationbatchid`)

🔴 The earlier formula `facilityNumber | misAsOfDate | integrationBatchId` is **a candidate, not the
approved final key**. Two reasons it cannot be frozen now: (a) §4.1/F3 shows DPD carries a *different*
effective date from the financial balance date and `dpdAsOfDate` is itself `TBD`, so "the" as-of date is
not yet defined; (b) including the batch id unconditionally would make a **re-run produce a new key for
the same observation**, defeating replay idempotency. The final rule is settled once MIS confirms its
timestamp and change-feed semantics (§12).

`qdb_snapshotkey` remains the alternate-key column; its **composition is provisional and configured at
provisioning time**, so the confirmed rule can be applied without a schema change.

### 7.2 Snapshot policy — no production default yet

`qdb_platformconfiguration.qdb_snapshotpolicy` (`AllReceived` · `EligibleOnly` · `ChangedOnly`) is
approved as an architectural concept. **`AllReceived` is NOT established as the universal production
default** on Phase 0 evidence (gate correction 3): the HL extract shows MIS may repeatedly deliver a very
large technical-delinquency population (~1,600 month-end churn records), so `AllReceived` could generate
unnecessary historical volume even though unnecessary *cases* are already prevented by the eligibility
gate.

**Deployment default: `TBD — Requires QDB Confirmation` / performance-volume validation** — or a
conservative default chosen during MIS implementation once real MIS behaviour and volumes are known, per
organisation.

**Binding constraint:** a `GraceMonitor` decision must remain **auditable without forcing every unchanged
MIS record to generate a new snapshot forever**. A policy that re-persists an identical, unchanged
observation on every sync is not acceptable as a default; change detection or an equivalent mechanism must
keep the history meaningful rather than merely voluminous.

---

## 8. Fallback, freshness, revalidation (CP §17–18, §29–30)

| Situation | Behaviour |
|---|---|
| MIS success | show live values; badge **Live · MIS as of {misAsOfDate}** |
| MIS failure / timeout | show `qdb_collectioncase` cached position or last snapshot; badge **MIS unavailable — showing last synchronised position from {qdb_misasofdate}**; never silently as live |
| Refresh | re-query live; update UI; no snapshot |
| Critical action (cure closure, legal escalation, restructuring, significant PTP) | revalidation is a **Rule Engine / configuration** decision per activity type (`qdb_collectionactivitytype.qdb_requiresmisrevalidation`, proposed), not hard-coded |

Freshness metadata surfaced: Live / MIS as-of / last successful refresh / last successful background
sync / stale-fallback indicator (from the existing `qdb_crmlogs` technical log).

---

## 9. Background sync design (CP §20–21)

```
 scheduler (frequency TBD) ─▶ job: misSync
   1. read watermark (last successful sourceTimestamp / as-of) from qdb_crmlogs (existing)
   2. pull: GetArrearChanges(since) if supported else full GetArrearDetails (paged)
   3. normalise → canonical rows; validate; dedupe by facilityId within batch
   4. resolve identity & facility (§5) → exceptions
   4a. evaluate Collection Eligibility / Grace via IRuleEngine (§5a) → one of six outcomes
   5. match cases (§6) for admitted records → creates / updates / cure flags
   6. write snapshots (idempotent key)
   7. trigger automation (strategy, assignment, activities, comms) via configuration
   8. log batch: counts, failures, partial-failure detail; advance watermark only on success
   retries with backoff; per-row isolation so one bad row does not fail the batch; replay by batch id
```

Operating models to confirm: periodic · incremental · scheduled batch · near-real-time · push
(`TBD — Requires QDB Confirmation: frequency and change-feed/push capability`).

---

## 10. Mock MIS provider (CP §23, §37)

`MockMisDelinquencyService` seeds from the supplied workbooks (normalised) and exposes scenario switches:

Individual/HL · SME/BFD (synthetic until a BFD contract exists) · new delinquency · existing active case ·
each of the 10 buckets · bucket movement · increasing/decreasing DPD and arrears · partial payment · cure ·
re-delinquency · new episode · existing PTP · broken PTP · missing customer · missing facility · invalid
customer id · invalid facility id · duplicate record · duplicate batch · zero/cleared arrears · MIS
unavailable · timeout · retry · idempotency · identity exception · stale response · live success · live
failure with fallback · background success · background partial failure.

Mock and API providers return **identical** canonical types; contract tests run against both.

---

## 11. Security and topology (CP §35)

React never calls MIS directly. The Integration Service holds MIS credentials, enforces caller
authorisation (user token via `IAuthAdapter`), rate-limits, audits and monitors. Topology is the same
container on both targets; only network placement and the auth adapter differ. Whether QDB's on-prem
estate expects Windows-integrated or AD FS bearer auth from the browser is `TBD — Requires QDB Confirmation`.

---

## 12. Confirmed vs proposed vs TBD (CP §45–46)

**Confirmed from supplied data:** field list in §4.1; bucket taxonomy; aggregate breakdown shape incl.
four segments; monthly trend shape; deceased list shape; as-of date convention; volumes.

**Proposed:** the capability set in §3; canonical names; idempotency key; episode rules; fallback
behaviour; mock scenarios.

**TBD — Requires QDB Confirmation:** final endpoints · authentication/security mechanism · refresh
frequency · live/on-demand support · aggregate endpoint · paging/filtering/sorting · facility-specific
query · incremental "changed since" · push/events · source/as-of timestamp availability · timeout/SLA ·
rate limits · max page/batch size · BFD field contract · BFD customer/facility identifiers · error/retry
contract · whether cured records are returned or exposed as changes · meaning of Account Status 7/8 ·
sign convention of Exemption Amount · **from the data analysis (`HousingLoanDataAnalysis.md` §5):** the
date DPD is stamped on (constant +16 days vs balances) · why a 50 % exemption carries ≈ 100 % of balance ·
Deceased-sheet *Unique / Duplicate / Legal* semantics · whether sub-instalment 1-30 accounts are returned and
any bank-side grace convention · 7-digit ID numbers · rescheduling flag · BFD identifiers.

None of these block Mock MIS development.
