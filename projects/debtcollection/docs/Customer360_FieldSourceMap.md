# Customer 360 — inspection findings and field-source map

Date: 2026-09-28 (Asia/Qatar). Scope: the Customer 360 redesign on Option 1's information hierarchy,
showing only what the platform can source. Read model and UI only; no schema, API, Rule Engine,
Process Engine or Report Engine change.

## 1. Pre-implementation findings

| Topic | Finding |
|---|---|
| Previous Customer 360 | Two implementations: V1 `views/Customer360.tsx` (KPIs, identity, a "Facilities" table with three "not yet sourced" columns, MIS snapshots) and V2 `V2CustomerPage.tsx` (its own native layout). Both over `data/customerAggregate.ts`: one bounded read of the customer's cases (≤200) plus one profile read, totals summed in the browser. |
| Domain model | HL customer = `contact`, HL unit = loan account. BFD customer = `account`, BFD unit = facility. The case's polymorphic `qdb_customerid` targets contact and account; `qdb_customerbusinessid` carries the MIS identity (QID for HL, CR number for BFD). Confirmed against the organisation's metadata. |
| Technical canonical name | `facilityNumber` + `sourceSystem` (`qdb_facilitynumber` + `qdb_facilitysourcesystem`) is the canonical financial-unit key across the domain (`CollectionFacility`, `MisDelinquencyRecord`), the case, the snapshot and the MIS normaliser (which reads MIS "Account Number" into it). It is deployed on 4,363 cases and in every query. **Retained as a compatibility abstraction**; the UI now labels HL units "Loan Account" and BFD units "Facility" through `data/financialUnit.ts`. Renaming the schema or the API contract was not necessary and was not done — recorded as technical debt below. |
| `qdb_delinquencysnapshot` | Has `qdb_collectioncaseid` (lookup), `qdb_customerbusinessid`, `qdb_facilitynumber`, `qdb_facilitysourcesystem`, `qdb_snapshotdate`, `qdb_missourcetimestamp`, DPD, bucket, arrears, balance. **No Customer lookup.** Case → Customer traversal and the business id are sufficient for Customer 360; no schema change proposed. |
| Live MIS | No MIS API exists (`ApiMisDelinquencyService` is a boundary with every setting TBD; `docs/MISContractEvidence.md`). The web resource reads Dataverse only. Customer 360 therefore shows the **last synchronised position** and labels it so; it never presents cached data as live. |
| Daily sync | `BackgroundSyncRunner` / `DelinquencySyncService` exist in the API; the schedule is configuration; nothing in this task changes it. Customer 360 consumes its results (case position, snapshots) and writes nothing. |
| Next planned action | From the existing Action Plan (`loadActionPlan` + `toPlanItem`, first current item). Now a shared hook `data/useNextAction.ts` used by the V2 case preview and Customer 360. |
| PTP semantics | A promise is a `qdb_collectionactivity` with `qdb_ptpdate`; status is the officer's record (`qdb_ptpstatus`), never a verified payment. |
| History paging | `mergeHistory` (domain) already merges fax/email/activity for one case with a watermark and id tie-break. Generalised to a customer's cases in `data/customerHistoryQueries.ts`. |
| V1/V2 reuse | One shared screen (`views/Customer360.tsx`), hosted by V1 directly and by V2 inside its frame. The V2 native implementation was removed. |
| N+1 review | Before: per-case reads for facilities were fine, but V2 read profile per page and summed in the browser. After: one case read, one profile read, one FetchXML aggregate for the position, two counts for promise performance, three history reads per page (one per table, filtered to all cases), and one action-plan read per **open** unit card (bounded by the customer's units). No per-row reads. |
| Effort | Estimated 3 h AI-assisted. |

## 2. Field-source map

| UI field | Label | HL/BFD | Source | Entity / column | Level | Direct/Derived | Live/Persisted |
|---|---|---|---|---|---|---|---|
| Customer name | (heading) | HL | CRM | `contact.fullname` via case `qdb_customerid` | Customer | Direct | Persisted |
| Customer name | (heading) | BFD | CRM | `account.name` via case `qdb_customerid` | Customer | Direct | Persisted |
| CRM context tag | Housing Loan · contact / BFD · account | Both | CRM | lookup target table of `qdb_customerid` | Customer | Direct | Persisted |
| Identifier | QID / CR number | Both | MIS via DCP | `qdb_collectioncase.qdb_customerbusinessid` | Customer | Direct | Persisted (sync) |
| Segment | Individual / SME | Both | DCP | distinct `qdb_collectioncase.qdb_customertype` | Customer | Derived (distinct) | Persisted |
| Mobile / phone / email / city | (sub line) | HL: mobile, phone; BFD: phone | CRM | `contact.mobilephone`, `telephone1`, `emailaddress1`, `address1_city` / `account.*` | Customer | Direct | Persisted |
| Total exposure | Total exposure | Both | DCP (platform aggregate) | sum `qdb_currentloanbalance` over open cases | Customer | Derived (platform sum) | Persisted (sync) |
| Total overdue | Total overdue | Both | DCP (platform aggregate) | sum `qdb_currenttotalarrears` over open cases | Customer | Derived (platform sum) | Persisted (sync) |
| Worst DPD | Worst DPD | Both | DCP (platform aggregate) | max `qdb_currentdpd` over open cases | Customer | Derived (platform max) | Persisted (sync) |
| Open cases | Open cases | Both | DCP (platform aggregate) | count open `qdb_collectioncase` | Customer | Derived (platform count) | Persisted |
| Recorded PTP performance | "1 of 3 recorded as kept" | Both | DCP (platform counts) | count `qdb_collectionactivity` with `qdb_ptpdate ne null` / and `qdb_ptpstatus = Kept` over the customer's cases | Customer | Derived (platform counts) | Persisted |
| Stored position notice | as-of / synced | Both | DCP | latest `qdb_misasofdate`, `qdb_lastmissyncon` | Customer | Derived (latest) | Persisted |
| Unit kind | Loan Account / Facility | HL / BFD | DCP | `qdb_organizationcode` (HL/BFD) | Unit | Derived (terminology) | Persisted |
| Unit number | Loan Account: … / Facility: … | Both | MIS via DCP | `qdb_collectioncase.qdb_facilitynumber` | Unit | Direct | Persisted (sync) |
| Product / loan type | (unit title) | Both | MIS via DCP | `qdb_productdescription` | Unit | Direct | Persisted (sync) |
| Balance | Loan balance / Facility exposure | HL / BFD | MIS via DCP | `qdb_currentloanbalance` | Unit | Direct | Persisted (sync) |
| Overdue | Overdue | Both | MIS via DCP | `qdb_currenttotalarrears` | Unit | Direct | Persisted (sync) |
| DPD | DPD | Both | MIS via DCP | `qdb_currentdpd` | Unit | Direct | Persisted (sync) |
| Bucket | Bucket | Both | MIS via DCP | `qdb_currentarrearbucket` (label) | Unit | Direct | Persisted (sync) |
| Case | Case | Both | DCP | `qdb_casenumber`, `statuscode` | Case | Direct | Persisted |
| Owner | Owner | Both | DCP | `ownerid` (name) | Case | Direct | Persisted |
| Next planned action | Next planned action | Both | DCP Action Plan | `qdb_strategyaction` rows of the case's `qdb_strategyid` + answering `qdb_collectionactivity` | Case | Derived (existing plan logic) | Persisted |
| History entry | channel · subject · status · when | Both | DCP / native | `qdb_collectionactivity`, `fax` (SMS/WhatsApp), `email` | Case | Direct | Persisted |
| History unit context | Case … · HL Loan Account … | Both | DCP | activity `_qdb_collectioncaseid_value` / `_regardingobjectid_value` → case → unit | Case | Derived (join in browser over the customer's cases) | Persisted |
| Promise detail | QAR … promised for … · status | Both | DCP | `qdb_promisedamount`, `qdb_ptpdate`, `qdb_ptpstatus` | Case | Direct | Persisted |
| Channel preferences | Phone / Email / SMS-WhatsApp channel | Both | CRM | `donotphone`, `donotemail`, `donotfax` | Customer | Direct | Persisted |
| Delinquency history | As of · unit · DPD · bucket · arrears · balance | Both | MIS via DCP | `qdb_delinquencysnapshot` by `qdb_customerbusinessid` | Unit | Direct | Persisted (sync) |

Not shown, because no source exists: risk score, KYC status, customer-since date, interest rate,
tenor, guarantor, collateral, security, maturity date, recommended next action / rule reasoning /
override, eligibility (restructure, second PTP, fee waiver, legal hand-off), contact window,
contact frequency allowance, language.

## 3. Technical debt recorded

- `facilityNumber` / `qdb_facilitynumber` names both HL loan accounts and BFD facilities. Business
  semantics are applied at the UI boundary only (`financialUnit.ts`). A canonical rename would touch
  the domain contract, the MIS normaliser, four tables and every query; not justified for terminology.
- Live MIS is not integrated; the "live" state of §16 of the brief cannot be shown until an MIS API
  exists (KI-53). The screen shows the stored position with its as-of and sync times.
- Next planned action is one action-plan read per open unit card; bounded by a customer's units,
  but a customer with many open cases would issue that many reads.
