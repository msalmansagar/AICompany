# MIS contract — what is actually evidenced, and what is not

**Produced:** 2026-09-18, Phase 4, before any MIS implementation.
**Sources inspected:** the whole `projects/debtcollection` repository; the wider `AICompany` repository;
`D:/QDB/Projects/` including **`Debt Collection Platform/`** (37 files) and `IntegrationEngine/`.
**Primary evidence:** `HousingLoanArrearReportDetailed.xlsx` and `HousingLoanArrearReport.xlsx`, read
directly — 4,359 detail rows, as-of **30/06/2026**.

Every row below is classified. Nothing moves from a lower bucket to a higher one without QDB.

| Bucket | Meaning |
|---|---|
| **C — Confirmed** | Read from the supplied MIS data itself |
| **D — DCP abstraction** | Something this platform decided; not an MIS fact |
| **M — Mock assumption** | True only of the test provider. **Never a production contract** |
| **T — TBD** | Requires the actual QDB MIS contract |

---

## 0. The finding that frames everything else

> **T — There is no MIS API in evidence.** Not an endpoint, not a schema, not an auth mechanism, not a
> paging mechanism, not a change feed. The only MIS evidence that exists anywhere on this machine is
> **two spreadsheet report exports**.

Everything the architecture says about MIS *transport* — `getArrearDetails`, paging, `getArrearChanges`,
watermarks, retry semantics — is therefore **D** (our abstraction) or **T** (unconfirmed), never **C**.
What the spreadsheets do confirm is the **field contract and its data quality**, which is the part
normalization has to get right, and that is a great deal more than nothing.

---

## 1. The field contract — C, confirmed from the data

`Housing Loan Arrear Detailed`, header on row 2, 23 columns, 4,359 data rows.

| # | Column as supplied | Type in the file | Evidence |
|---:|---|---|---|
| 1 | Customer Number | int | present on every row |
| 2 | Customer Name | string | present |
| 3 | Account Number | int | **the facility identifier** |
| 4 | Loan Type Code | int | 10 distinct: 1001, 1002, 1003, 1004, 1006, 1008, 1010, 1011, 1013 (+2 blank) |
| 5 | Loan Type Description | string | 10 distinct, paired 1:1 with the code |
| 6 | ID Number | int | the national identifier |
| 7 | QCB Deceased Status | string | **exactly 2 values**: `DEAD` (724) or blank (3,635) |
| 8 | Loan Balance | decimal / int | present |
| 9 | Account Status | **int** | **exactly 3**: `8` (3,810), `7` (547), blank (2) |
| 10 | Deceased Flag | string | `Deceased` (385) or blank |
| 11 | Deceased & Not Applied Flag | string | `Deceased not applied` (81) or blank |
| 12 | Exemption 20 Flag | string | `Exemption 20` (**81**) or blank |
| 13 | No Exemption Flag | string | `No Exemption` (3,800) or blank (559) |
| 14 | First Arrear Date | **string** | `DD/MM/YYYY`, **not** a date type |
| 15 | Arrear Days | int | the DPD counter |
| 16 | Total Arrears | int / decimal | no negative value anywhere |
| 17 | Installment Amount | int | **48 rows are zero** |
| 18 | Last Arrear Amount | int | |
| 19 | Arrear % | decimal / int | |
| 20 | Exemption Percentage | decimal | ~95 % blank |
| 21 | Exemption Amount | decimal | ~95 % blank |
| 22 | Arrear Buckets | **date / string** | see §3 |
| 23 | Mobile Number | int | contact data only |

The `Deceased` sheet (724 rows) carries the same shape plus **Unique**, **Duplicate**, **Legal** and a
`Deceased Status` column in place of `Deceased Flag`.

### The ten buckets — C, and they match the approved taxonomy exactly

`1-30` · `31-60` · `61-90` · `91-180` · `181-270` · `271-360` · `361-500` · `501-1000` · `1001-2000` ·
`>2000`. Counts: 1,670 · 311 · 227 · 318 · 203 · 123 · 142 · 391 · 424 · 548.

---

## 2. Where the documented contract disagrees with the data

These are corrections to `APIContracts.md` §3, found by reading the file rather than the document.

| Documented | Actually | Consequence |
|---|---|---|
| `accountStatusCode: string` | **integer** (`7`, `8`) | Normalization must not assume a string. It stays an **opaque code** either way — no meaning is encoded, mapping still **T** |
| `lastArrearAmount` "equals `installmentAmount` in the supplied dataset" | true in **81.0 %** (3,529/4,357), not all | The relationship is **not** a rule even within this dataset. Keep both as independent raw facts |
| `instalmentCoverageRatio` = `min(1, totalArrears ÷ installmentAmount)` | holds in **99.4 %** (4,283/4,309); **26 rows disagree and 5 exceed 1** | Correctly modelled as **derived with a `sourceField`**, never as an authoritative input. The exceptions prove it is MIS's number, not ours to recompute |
| `customerType` in `ArrearDetailRaw` | **absent from the data entirely** | Cannot be normalized from this feed. **T** |
| `misAsOfDate` as a per-row field | **absent** — the as-of date lives in the *report title* (`- 30/06/2026`) | The as-of is a property of the **run**, not the row. **T** for how an API would supply it |
| `dpdAsOfDate`, `sourceTimestamp`, any source record id | **absent** | Snapshot idempotency cannot depend on them yet. **T** |

---

## 3. Data-quality facts normalization must handle — C

| Fact | Count | Why it matters |
|---|---:|---|
| **`Arrear Buckets` arrives as a DATE for the `1-30` bucket** | **1,670** rows | Excel coerced `1-30` into `2026-01-30`. **38 % of the population.** A normalizer that expects a string silently loses the largest bucket |
| `First Arrear Date` is a `DD/MM/YYYY` **string** | 4,348 of 4,359 non-ISO | Day-first must be explicit. Parsed as month-first, 30/06 becomes invalid and 06/07 becomes the wrong date |
| `Installment Amount` of zero | 48 | Division-by-zero risk. These rows carry **no** `Arrear %`: 4,359 − 4,309 comparable − 2 blank = the same 48. MIS itself declines to divide |
| `ID Number` shorter than 8 digits | 6 | Numeric typing has already destroyed leading zeros at the source |
| `Mobile Number` shorter than 8 digits | 50 | Same. Contact data only — **never identity** |
| Fully blank rows | 2 | The feed contains rows that are not records |
| `QCB Deceased Status = DEAD` | 724 (16.6 %) | Must **not** be read as Contact Hold (KI-44) |

---

## 4. Existing DCP abstraction — D

Already built and proven in Phases 1–3; MIS does not dictate these and they are not MIS facts.

| Abstraction | Where |
|---|---|
| `MisDelinquencyRecord` — the canonical normalized observation | `packages/domain/src/misObservation.ts` |
| `FacilityIdentity` = facility number + source system, validated never looked up | `misObservation.ts` |
| `CustomerIdentity`, strict — mobile can never be identity | `misObservation.ts` |
| Eligibility outcome vocabulary (6 values) | `eligibility.ts`, ADR-DCP-11 |
| Episode decisions, snapshot key composition, case lifecycle | `episode.ts`, `snapshot.ts`, `caseLifecycle.ts` |
| Paged query contract, opaque continuation, query fingerprint | `paging.ts` (Phase 4) |
| `qdb_crmlogs` technical logging | Phase 1 |

---

## 5. Mock assumption — M. **None of this is a production contract**

| Assumption | Status |
|---|---|
| That a `getArrearDetails`-shaped operation exists at all | **M** — modelled on the report's shape |
| Any endpoint path, verb, auth header or error body | **M** |
| That MIS pages at all, and how | **M** — the abstraction is kept neutral across cursor / token / paging cookie precisely because this is unknown |
| That a "changed since" feed exists | **M** |
| Scenario switches (cure, re-delinquency, timeout, partial failure) | **M** — test fixtures |
| Synthetic BFD/SME records | **M** — no BFD contract exists |

---

## 6. TBD — Actual MIS Contract Required

1. Endpoints, verbs, payloads, auth, TLS and network topology.
2. **Paging: whether it exists, and its mechanism.** Do not assume it behaves like Dataverse.
3. Incremental / changed-since capability, and its token semantics.
4. Per-row `misAsOfDate`, `dpdAsOfDate`, `sourceTimestamp`, source record id.
5. `customerType` — absent from the feed; needed to distinguish Individual from Corporate.
6. Meaning of **Account Status `7` and `8`**.
7. Sign convention of `Exemption Amount`; relationship between the three deceased/exemption flags.
8. `Deceased` sheet **Unique / Duplicate / Legal** semantics.
9. Whether cured records are returned, or surfaced as changes, or simply absent.
10. Timeout, SLA, rate limits, maximum page/batch size, error and retry contract.
11. The BFD field contract and its customer/facility identifiers.
12. Why 1,670 accounts share `First Arrear Date = 30/06/2026`, and any bank-side grace convention.
13. The date `Arrear Days` is stamped on, versus the balance date.

---

## 7. What Phase 4 therefore builds

- **Normalization against the evidenced field contract** — C above — including every data-quality fact
  in §3, because those are real and will recur.
- **A mock provider seeded from the supplied workbooks' actual shape**, labelled as a mock.
- **An API provider skeleton** whose every transport assumption is marked
  **TBD — Actual MIS Contract Required**, failing closed rather than guessing.
- **A paging abstraction neutral to the source's mechanism**, so confirming MIS later is a provider
  change and not a domain change.

**Mock output is never reported as live MIS runtime validation.**
