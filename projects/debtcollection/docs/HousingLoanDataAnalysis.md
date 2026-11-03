# DCP — Housing Loan Arrear Data Analysis (Phase 0)

**Status:** Phase 0 evidence · 2026-09-17 · read-only analysis of the two supplied workbooks in
`D:\QDB\Projects\Debt Collection Platform\` — `HousingLoanArrearReport.xlsx` (sheet *Breakdown*) and
`HousingLoanArrearReportDetailed.xlsx` (sheets *Detailed* 4,357 accounts, *Collection & Growth* Jan-25 →
Jun-26, *Deceased* 724 rows). Report title date **30/06/2026**. Script: session scratchpad `analyze-hl.js`.
Purpose: turn generic `TBD — Requires QDB Confirmation` items into specific questions, and let the data —
not assumptions — shape the case model, identity rules, strategy segmentation, deceased handling and the
Mock MIS provider.

---

## 1. The book in numbers

| Measure | Value |
|---|---|
| Delinquent **accounts** (unit of record) | **4,357** (all account numbers unique) |
| Distinct **customers** (Customer Number = QID, strictly 1:1) | **3,778** |
| Bucket-customer count (a customer counted once per bucket) | **3,905** — 125 customers sit in more than one bucket |
| Loan balance | **QAR 3,416.6 M** |
| Total arrears | **QAR 213.0 M** (6.2 % of balance) |
| Monthly instalments due | QAR 10.8 M |
| Deceased (QCB) | **724 accounts / 556 customers** — 16.6 % of accounts, **24.4 % of arrears** |
| Tie-out with the Breakdown sheet | balance Δ 0.01, arrears Δ 0, per-bucket customer counts identical |

## 2. By bucket

| Bucket | Accts | Customers | Balance (M) | Arrears (M) | Share | Cum. | Avg DPD | Avg arrears | Months in arrears* | Deceased | Coll. Jun-26 vs arrears |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1-30 | 1,670 | 1,594 | 1,404.3 | 2.44 | 1.1 % | 1.1 % | 16 | 1,461 | 0.5 | 97 | **305 %** |
| 31-60 | 311 | 290 | 257.3 | 1.77 | 0.8 % | 2.0 % | 46 | 5,679 | 2.1 | 24 | 42 % |
| 61-90 | 227 | 211 | 182.9 | 1.92 | 0.9 % | 2.9 % | 77 | 8,439 | 3.1 | 23 | 22 % |
| 91-180 | 318 | 288 | 256.2 | 4.01 | 1.9 % | 4.8 % | 134 | 12,618 | 4.9 | 48 | 17 % |
| 181-270 | 203 | 178 | 141.5 | 3.65 | 1.7 % | 6.5 % | 225 | 17,956 | 7.9 | 40 | 11 % |
| 271-360 | 123 | 113 | 92.7 | 3.40 | 1.6 % | 8.1 % | 315 | 27,634 | 10.9 | 22 | 8 % |
| 361-500 | 142 | 133 | 117.1 | 5.32 | 2.5 % | 10.6 % | 410 | 37,450 | 14.3 | 21 | 5 % |
| 501-1000 | 391 | 335 | 285.1 | 21.68 | 10.2 % | 20.7 % | 726 | 55,447 | 24.5 | 116 | 4 % |
| 1001-2000 | 424 | 357 | 305.9 | 43.75 | 20.5 % | 41.3 % | 1,440 | 103,174 | 48.2 | 123 | 1.6 % |
| **>2000** | **548** | **406** | 373.6 | **125.12** | **58.7 %** | 100 % | **3,313 (9.1 yrs)** | 228,313 | 127 | **210 (38 %)** | 0.6 % |

\* arrears ÷ instalments in the bucket. Every account's DPD falls inside its labelled bucket (0 mismatches).

## 2a. Status of these findings after the F1–F11 review (2026-09-17)

The user reviewed F1–F11 and issued binding decisions. **Everything below is evidence and
recommendation, not policy.** Three statements in the original issue of this document were framed too
strongly and are corrected here:

| Original wording | Corrected status |
|---|---|
| "the >2000 tail is a recovery programme, not a dunning target" / "automated dunning above 2000 DPD is pointless and a conduct risk" | A **data-supported strategy recommendation for QDB confirmation**. The boundary and the permitted treatment are business policy. `>2000 DPD = Recovery` is **not** encoded anywhere; whether automated contact is prohibited above 2000 DPD is `TBD — Requires QDB Confirmation`. |
| "stop-contact must default from QCB DEAD (all 724)" | A confirmed deceased indicator must be **capable of immediately triggering a Contact Hold / Special Handling rule**, enforced server-side. Whether **QCB DEAD alone** establishes that hold is `TBD — Requires QDB Confirmation`. |
| "exposure ranks nothing … MP §41's optional exposure criteria stay unused" | Exposure is **retained as an optional configurable Strategy criterion**. The observation holds for *this* HL population only; BFD SME/Corporate may need it. HL statistics must not become cross-platform policy. |

Likewise the F2 grace rule is a **sample configuration**, never a hard-coded `arrears < 1 instalment` or
`DPD < N`. See `TargetArchitecture.md` §4.1 and ADR-DCP-11.

## 2b. 🔴 BINDING — these findings are evidence, never application constants

**Everything in this document is a measurement of one extract of one portfolio on one date
(30/06/2026).** It may legitimately be used as:

- **HL configuration evidence** — proposed default values for HL rulesets and configuration rows
- **Test data** — Mock MIS seeding, fixtures, contract tests, volume tests
- **Strategy recommendations** — put to QDB for confirmation
- **Dashboard requirements** — which metrics must exist and how they must be labelled
- **Normalisation requirements** — what the MIS adapter must absorb
- **Data-model requirements** — which fields must exist and which must stay configurable

It may **never** be used as a constant in application source, a plugin, a compiled rule, or a test
assertion. **None of the following may be hard-coded anywhere:**

| Value | Why it is not a constant |
|---|---|
| `2000 DPD` | segmentation / recovery boundary — business policy, `TBD` |
| `1000 DPD` | the "operational vs recovery" split is a *recommendation*, not an approved boundary |
| `360 DPD` | bucket-group boundary used for analysis only |
| one-instalment grace (`arrears < 1 instalment`) | candidate eligibility rule — sample configuration only |
| the 16-day DPD offset | an observation about *this extract*; MIS semantics are `TBD` |
| current product distributions (60 % Building Housing, 9.2 % LLD-Real Estate …) | a snapshot of one month's portfolio |
| current collection yield (0.24 %/month, 0.11 % for >2000) | historical performance, not a target or a rule |
| current deceased percentages (16.6 % of accounts, 24.4 % of arrears) | population statistics, not a threshold |
| current account-status interpretation (7 vs 8) | meaning is unknown and stays opaque — F7 |
| 3,778 / 4,357 / 3,905 customer and account counts | report observations used for label definitions only |
| bucket population counts, avg arrears, avg DPD per bucket | mock-seeding inputs and analysis only |

Each threshold reaches the running system **only** through a Rule Engine ruleset or a configuration row
named by `qdb_platformconfiguration`, so HL and BFD can differ materially on the same build. The testing
rule in `TestingStrategy.md` enforces this from the other side: **no test may assert a threshold literal**,
so a hard-coded value fails the suite rather than silently passing it.

## 3. Findings and what each changes

**F1 — Concentration is extreme; the active collections book is small.** 892 accounts (20.5 %) hold 80 % of
arrears; buckets 1–360 DPD are 66 % of accounts but 8.1 % of arrears; the >2000 bucket alone is 58.7 % of
arrears, averages 9.1 years delinquent and is 38 % deceased. → The extract *suggests* two populations with
different economics: one where contact and PTP plausibly recover money, and a long tail where legal,
insurance, deceased-estate and provisioning dominate. Drawing the line at 1000 DPD separates them into
roughly 2,800 and 970 accounts — **an illustrative cut of this extract, not a proposed boundary**. The
architectural consequence is only that strategy, queues, dashboards and KPIs must be *able* to treat
populations differently, by configuration.
**Status after review (F1 ACCEPTED as a need, not as a boundary):** differentiated strategy is architecture;
the boundaries and permitted treatment are **business policy**, configured in the Strategy Engine over DPD,
bucket, product, arrears, **exposure**, customer type, facility type, deceased/special-handling status,
previous outcomes, PTP history and other Rule Engine criteria. `>2000 DPD = Recovery` is **not encoded**.
The operational/recovery split stands as a **data-supported recommendation for QDB confirmation**. Whether
automated contact is prohibited above 2000 DPD is `TBD — Requires QDB Confirmation`; BRD FR-033's
"no automated contact" strategy rule is the mechanism once answered. 🔴 BRD **FR-026 / FR-132** hard-code
2000 DPD as a *display* segregation — acceptable as a default view, but they must read as configuration.

**F2 — The 1-30 bucket is monthly instalment churn, not delinquency.** All 1,670 accounts have *First
Arrear Date = 30/06/2026*; **769 accounts (17.6 % of the whole book) owe less than one instalment — QAR
83,646 in total (0.04 % of arrears)**; June collections in this bucket were 305 % of its arrears (it cures
itself). → On this evidence MIS is likely to deliver ~1,600 accounts at each month-end whose delinquency is
technical rather than behavioural — whether any of them warrants collection action is a business judgement.
The architectural consequence is that case creation must pass a **Collection Eligibility / Grace
evaluation** first, whatever that evaluation is configured to decide.
**Status after review (F2 ACCEPTED):** background sync must not create a case for every MIS record. A
configurable eligibility/grace stage (ADR-DCP-11) sits between facility resolution and case creation and
runs through the **Rule Engine**. `arrears < 1 instalment` and `DPD < N` are **sample configuration, not
permanent rules**; final thresholds are `TBD — Requires QDB Confirmation` and HL and BFD may differ.

**F3 — DPD is measured 16 days after the sheet's date.** For 4,349 of 4,357 accounts, *Arrear Days* =
days between *First Arrear Date* and 30/06/2026 **+ 16**. Either DPD is as of ~16/07/2026 while balances are
as of 30/06, or the counter starts before the instalment date. Eight accounts deviate by +132, +309, −41,
−44, −161, −191 days (rescheduled loans?). → The canonical model needs **two as-of dates** (`misAsOfDate` for
positions, `dpdAsOfDate` for the counter) or a confirmed single convention; snapshot idempotency must key on
the date MIS actually stamps. Specific question for MIS, see §5.

**F4 — QID is a safe identity key for HL.** Customer Number ↔ ID Number is strictly 1:1 across 3,778
customers (0 conflicts either way). Six IDs are 7-digit legacy values (all starting `4…`) and one row is
blank. **Status after review (F4 ACCEPTED as the HL candidate):** canonical resolution = **QID / ID Number**
primary, **Customer Number** cross-check, **Contact GUID** as the CRM relationship. Records that are
missing, ambiguous, conflicting, invalid, or QID/Customer-Number-inconsistent route to
`qdb_identityexception` — never silently resolved to the nearest customer. **Mobile is never identity.**
The six 7-digit legacy IDs are **preserved as source identifiers and not rejected on length**; validation
rules are configurable and `TBD — Requires QDB Confirmation`. **BFD identity is a separate contract**
built from its own stable identifier (CR / UEN / TRN or another approved one) — `TBD`.

**F5 — The unit of delinquency is the account, and multi-account customers matter.** 546 customers
(14.5 %) hold 2–4 accounts; they carry **30.7 % of arrears**; 125 customers span more than one bucket. →
**Status after review (F5 ACCEPTED):** one active Collection Case per facility/account per delinquency
episode; Customer 360 aggregates. Dashboards must **never** label a single number "Customers": the metric
model distinguishes **Distinct Customers**, **Delinquent Facilities / Accounts** and **Customer-Bucket
Count** (the last where reconciliation with the MIS Breakdown report requires it), each with its
aggregation definition explicit. For this extract: 3,778 / 4,357 / 3,905 — **report observations, not
application constants**.

**F6 — Deceased is a population, not a flag.** 724 accounts (556 customers), 24.4 % of arrears, 38 % of the
>2000 bucket. Three states coexist: *Deceased QDB* — exemption applied at 50 % (385 accounts, `Exemption
Percentage = 0.5`); *Deceased not applied* (81, exemption pending); *No Exemption* despite QCB DEAD (246). The
Deceased sheet adds *Unique 557 / Duplicate 327 / Legal 72* (QAR 14.2 M in legal). Exemption Amount is
always **negative** (a credit) and its magnitude is ≈ the *whole* loan balance (median 1.01×) although the
percentage says 50 % — definition unknown. **Status after review (F6 ACCEPTED as a population; the policy is NOT hard-coded):** deceased customers are
a distinct Collection population. Supported facts: QCB deceased status, QDB deceased status where
available, exemption state, legal state, insurance/estate processing, special handling, contact
restriction/hold, dedicated strategy/process routing — the snapshot carries `qcbDeceasedStatus`,
`deceasedFlag`, `deceasedNotAppliedFlag` and exemption percentage/amount as distinct facts.
🔴 **`QCB DEAD = Stop Contact` is not encoded.** Architecturally a confirmed deceased indicator must be
**capable of immediately triggering a Contact Hold / Special Handling rule** before any automated *or*
manual communication, enforced **server-side** in the one Communication Service so neither React nor a
background job can bypass it (UI hiding is never the control). Whether **QCB DEAD alone** establishes that
hold is `TBD — Requires QDB Confirmation`. The 20 % exemption (81 accounts, 69 alive) is a separate programme.

**F7 — Account Status 7 / 8 — profile, no meaning yet.** 8 = 3,810 accounts (87 %), median DPD 77; 7 = 547
accounts, median DPD 197, avg 882, proportionally *fewer* deceased (12 % vs 17 %); no zero balances in
either; 57 status-8 accounts have arrears ≥ balance. **Status after review (F7):** codes stay **opaque**. The hypothesis that 8 = regular/active and
7 = restructured/frozen is **not encoded anywhere**; the mapping is `TBD — Requires QDB/MIS Confirmation`.

**F8 — Two report columns are derived, not facts.** *Arrear %* = `min(1, Total Arrears ÷ Instalment)`
(matches 4,280 / 4,309; 3,512 rows sit at 1.00) — it is instalment coverage, **not** arrears ÷ balance.
*Last Arrear Amount* = the instalment (3,512 rows) or the total when less than one instalment. **Status after review (F8 ACCEPTED):** raw MIS facts and derived values stay distinguishable in the
contract. The canonical name is `instalmentCoverageRatio` **with the source-field mapping to "Arrear %"
preserved**; it is never reinterpreted as arrears ÷ exposure. `lastArrearAmount` keeps its source mapping
and the "= instalment" relationship is **not assumed universal** until the MIS contract confirms it
(`TBD — Requires QDB/MIS Confirmation`).

**F9 — Product is a real segmentation axis; exposure is not.** Building Housing = 60 % of accounts / 50 %
of arrears; the two land-loan products = 27 % / 29 % with avg DPD ≈ 1,130; **LLD-Real Estate = 16 accounts
holding 9.2 % of all arrears** (avg DPD 1,813). Average balance per account is flat (QAR 680–860 k) across
all buckets, so exposure does not discriminate **in this population**. Instalments are remarkably uniform
(median 3,079; p10–p90 = 1,305–3,380), so arrears ÷ instalment is a clean "months missed" measure.
**Status after review (F9 PARTIALLY ACCEPTED — the original wording is corrected):** product remains an
available strategy criterion, but **exposure is NOT removed from the architecture**. It stays an *optional
configurable* Strategy criterion: this finding applies only to the supplied HL population, while **BFD
SME/Corporate collections may need exposure materially**. HL need not use it initially unless the business
asks. 🔴 This **contradicts BRD FR-034** ("SHALL NOT segment by exposure"), which must be amended to read as
an HL configuration default rather than an architectural prohibition.

**F10 — Eighteen-month trend: the middle drains, the tail does not move.** Total delinquent balance fell
14.7 % (QAR 4.00 bn → 3.42 bn); buckets 91–500 fell 31–46 %; 1-30 rose 2.7 % (steady inflow); **>2000 is
flat (+0.2 %) and yields 0.11 % of balance per month**. Collections totalled QAR 170 M over the period
(≈ 8.9 M/month, 0.24 % of balance). **Status after review (F10 ACCEPTED as candidates, not as the complete model):** core financial/delinquency
KPI candidates are roll rate by bucket, cure rate, 1–30 cure rate, collection yield by bucket, tail
movement/growth, delinquent balance movement and arrears movement. The dashboard architecture must **also**
carry CRM operational KPIs — cases by status/strategy/owner-team, activities due/overdue, contact outcomes,
PTP created/kept/broken/effectiveness, SLA-TAT, escalations, legal / restructuring / deceased-insurance
progression, officer-team workload, strategy effectiveness, communication outcomes — and the two families
stay **architecturally distinct** even when presented together. Final definitions and targets are
configurable and subject to business confirmation before Phase 10.

**F11 — Data quality the adapter must absorb.** Excel turned every `1-30` into the date `2026-01-30` (1,670
rows); one fully blank row; 49 blank mobiles (46 customers); 36 mobiles shared by 2–3 customers (family
numbers — a recipient check, not an identity check); 6 short QIDs; 8 DPD-offset anomalies; negative exemption
amounts; the header is row 2; names are Arabic (RTL). None of it is wrong data — all of it is normalisation.
**Status after review (F11 ACCEPTED):** the MIS adapter normalises bucket date conversion, blanks,
Arabic/RTL text, legacy/short identifiers, shared mobiles, DPD anomalies, negative financial values,
source-specific booleans and status codes, date formats, decimal precision, product codes and nulls before
any canonical Collection object is exposed. **Mobile number must NEVER be used as a customer identity key.**
The number shared by 46 customers is recorded as a **data-quality observation requiring QDB review — the
system must not auto-correct it**.

## 4. Design changes adopted from the data

| Element | Change |
|---|---|
| `MISIntegration.md` §4 canonical model | add `dpdAsOfDate` (semantics TBD); canonical name `instalmentCoverageRatio` **with the source mapping to "Arrear %" preserved**; `lastArrearAmount` keeps its source mapping and its universality is not assumed; QID rule; blank/shared mobile handling; Account Status carried as an **opaque** code |
| Case creation (Phase 2/4) | a configurable **Collection Eligibility / Grace evaluation** (ADR-DCP-11) between resolution and case creation, via the Rule Engine; thresholds are configuration and `TBD`, never code |
| Identity resolution (Phase 4) | QID primary + Customer Number cross-check → Contact GUID; missing/ambiguous/conflicting/invalid/inconsistent → `qdb_identityexception`; mobile never an identity key; 7-digit legacy IDs preserved, not rejected on length; BFD identity a separate contract |
| Deceased (Phase 9 + contact hold) | deceased indicators must be able to trigger a server-side **Contact Hold / Special Handling** rule that manual and automated sends both pass through; whether QCB DEAD alone suffices is `TBD`; exemption/legal/estate states modelled as distinct facts |
| Strategy / dashboards | product a first-class criterion; **exposure retained as optional**; segmentation boundaries configurable; dashboards distinguish Distinct Customers / Delinquent Accounts / Customer-Bucket Count and keep MIS financial KPIs architecturally separate from CRM operational KPIs |
| Mock MIS | seed from the real distribution: 38 % of accounts in 1-30 with 17.6 % below one instalment; 16.6 % deceased; 14.5 % multi-account; 9 loan types with the real shares; 16-day DPD offset reproduced so the normaliser is exercised |

## 5. Specific questions for MIS / QDB (replacing the generic ones)

1. Is *Arrear Days* stamped on a different date from the balances? (Evidence: constant +16 days vs *First
   Arrear Date* on 30/06/2026.) Which date will the API return for each?
2. What are Account Status **7** and **8**? (Profile in F7.)
3. Exemption Amount: why does a 50 % exemption carry an amount ≈ 100 % of the balance, and why negative?
4. Deceased sheet semantics: *Unique* vs *Duplicate* (327) vs *Legal* (72) — and is *Deceased QDB* = exemption
   applied?
5. Will MIS return accounts with arrears below one instalment (the 1-30 churn), and is there a bank-side
   grace convention DCP should mirror?
6. Are the 7-digit ID numbers legacy QIDs, passports, or errors?
7. Are rescheduled loans the source of the 8 DPD-offset anomalies, and does MIS flag rescheduling?
8. For BFD, what replaces Customer Number / QID (CR number?) and Account Number?

The remaining MIS items (endpoints, auth, frequency, change feed, paging, push, limits, error contract)
are unchanged from `MISIntegration.md` §12.
