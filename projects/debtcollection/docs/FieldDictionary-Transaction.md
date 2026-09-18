# Field Dictionary — Part 1: Transaction entities

Legend and conventions: `FieldDictionary.md`. Entity = table heading.

## `qdb_collectioncase` — Collection Case (user/team-owned, `HasActivities`, `IsValidForQueue = true`)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Collection Case | qdb_collectioncaseid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | msst_dcpcollectioncaseid | |
| Case Number | qdb_casenumber | string (autonumber) | 100 | R | `DCP-{SEQNUM:7}` | S | N | — | Primary name; human key | Y | Y | CbD | CbD | — | msst_name | Format is a proposal |
| Customer | qdb_customerid | lookup (**Customer**: contact, account) | — | R | — | U/I | Y | — | The delinquent customer; contact in HL, account in BFD | Y | Y | CbD (`CreateCustomerRelationshipsRequest` in SDK 9.0) | CbD (action present on org) | customerId → resolved | msst_customerid (→ msst_dcpcustomer) | Single column, two targets — CP §4 |
| Customer Type | qdb_customertype | choice `qdb_customer_type` | — | R | from platform config | D | RO | — | Individual / SME / Corporate | Y | Y | CbD | CbD | customerType | new | |
| Customer Business ID | qdb_customerbusinessid | string | 50 | R | — | D | RO | PII | QID (HL) or CR number (BFD) copied at create for search/reporting | Y | Y | CbD | CbD | nationalId / customerId | msst_dcpcustomer.msst_qid / msst_crnumber | Not the master; the master is contact/account |
| Facility Number | qdb_facilitynumber | string | 50 | R | — | M/U | N | — | MIS Account Number — business key of the facility; part of the one-active-case-per-facility rule | Y | Y | CbD | CbD | facilityId | msst_facilityid (→ msst_dcploanfacility) | Enforced by plugin, not alternate key (status-aware) |
| Facility *(NOT shared schema — optional deployment extension)* | qdb_facilityid | lookup (target fixed per deployment) | — | O | — | I | RO | — | Resolved facility record. **Absent from the shared `qdb_` definitions by design** (gate correction 4): a lookup target is fixed metadata, so an HL-targeted and a BFD-targeted `qdb_facilityid` are two different physical relationships, not one schema. The canonical contract is `qdb_facilitynumber` + `qdb_facilitysourcesystem`, and all Collection logic must work with this column absent. Provisioned only by `OPTIONAL_FACILITY_LOOKUP_EXTENSION(entity)` once QDB confirms the entity. | Y | Y | CbD | CbD | facilityId → resolved | new | Optional per-deployment extension |
| Product Type Code | qdb_producttypecode | string | 20 | O | — | M | RO | — | MIS loan type code | Y | Y | CbD | CbD | loanTypeCode | new | e.g. 1011 |
| Product Type | qdb_producttype | choice `qdb_product_type` | — | O | mapped from code | D | Y | — | Normalised product | Y | Y | CbD | CbD | loanTypeCode | msst_producttype | Seed from data |
| Product Description | qdb_productdescription | string | 200 | O | — | M | RO | — | MIS loan type description | Y | Y | CbD | CbD | loanTypeDescription | new | |
| Case Reason | qdb_casereason | string | 500 | O | "MIS delinquency" when auto-created | U/I | Y | — | Why the case was opened | Y | Y | CbD | CbD | — | msst_casereason | Required for manual creation (form rule) |
| Current DPD | qdb_currentdpd | int | — | O | — | M | RO | — | Cached latest DPD | Y | Y | CbD | CbD | arrearDays | new | Cache only — live MIS wins for display (CP §26) |
| Current Arrear Bucket | qdb_currentarrearbucket | choice `qdb_dpd_bucket` | — | O | — | M | RO | — | Cached bucket | Y | Y | CbD | CbD | arrearBucket | new | |
| Current Loan Balance | qdb_currentloanbalance | money | — | O | — | M | RO | — | Cached balance | Y | Y | CbD | CbD | loanBalance | new | |
| Current Total Arrears | qdb_currenttotalarrears | money | — | O | — | M | RO | — | Cached arrears | Y | Y | CbD | CbD | totalArrears | new | |
| Installment Amount | qdb_installmentamount | money | — | O | — | M | RO | — | Cached instalment | Y | Y | CbD | CbD | installmentAmount | new | |
| NPL Indicator | qdb_nplindicator | bool | — | O | false | M/D | RO | — | Non-performing flag | Y | Y | CbD | CbD | derived — `TBD — Requires QDB Confirmation` | new | Rule for NPL not in supplied data |
| Last MIS Sync | qdb_lastmissyncon | datetime | — | O | — | I | RO | — | When background sync last touched the case | Y | Y | CbD | CbD | — | new | Freshness metadata |
| MIS As-Of Date | qdb_misasofdate | datetime | — | O | — | M | RO | — | As-of of the cached position | Y | Y | CbD | CbD | misAsOfDate | new | Shown in fallback banner |
| Current Strategy | qdb_strategyid | lookup `qdb_collectionstrategy` | — | O | — | P/I | Y | — | Strategy currently applied | Y | Y | CbD | CbD | — | new | |
| Risk Level | qdb_risklevel | choice `qdb_risk_level` | — | O | — | P/U | Y | — | Risk classification | Y | Y | CbD | CbD | — | new | |
| Priority | qdb_priority | choice `qdb_priority` | — | O | Medium | P/U | Y | — | Work priority | Y | Y | CbD | CbD | — | new | |
| Case Stage | qdb_casestage | choice `qdb_case_stage` | — | O | Early | P | RO | — | Coarse stage derived from statuscode | Y | Y | CbD | CbD | — | new | |
| Status Reason | statuscode | status | — | S | New (200) | P/U | Y | — | 17 values — see table below | Y | Y | CbD | CbD | — | msst statuscodes 200–216 | Matrix enforced by `StatusTransitionValidator` |
| Status | statecode | state | — | S | Active | S | Y | — | Active / Inactive | Y | Y | CbD | CbD | — | statecode | |
| Owner | ownerid | owner | — | S | creator | U/P | Y | — | User or team | Y | Y | CbD | CbD | — | ownerid | |
| Assigned Team | qdb_assignedteamid | lookup team | — | O | — | P/U | Y | — | Team from assignment configuration | Y | Y | CbD | CbD | — | new | |
| Open Date | qdb_opendate | datetime | — | R | now | S | N | — | Episode start | Y | Y | CbD | CbD | — | new | |
| Last Activity Date | qdb_lastactivitydate | datetime | — | O | — | P | RO | — | Latest activity actual end | Y | Y | CbD | CbD | — | new | |
| Next Action Date | qdb_nextactiondate | datetime | — | O | — | P | RO | — | Earliest open activity due | Y | Y | CbD | CbD | — | new | Drives overdue views |
| Episode Number | qdb_episodenumber | int | — | R | 1 | I | N | — | Delinquency episode sequence per facility | Y | Y | CbD | CbD | — | new | CP §39 |
| Cure Date | qdb_curedate | datetime | — | O | — | I | RO | — | Date MIS reported cleared arrears | Y | Y | CbD | CbD | derived (arrearDays = 0) | new | |
| Resolution Type | qdb_resolutiontype | choice `qdb_resolution_type` | — | O | — | U/P | Y | — | How the episode ended | Y | Y | CbD | CbD | — | new | |
| Resolution Date | qdb_resolutiondate | datetime | — | O | — | U/P | Y | — | | Y | Y | CbD | CbD | — | new | |
| Closure Reason | qdb_closurereason | string | 500 | O | — | U | Y | — | Mandatory on close (form rule) | Y | Y | CbD | CbD | — | new | |
| Closed Date | qdb_closeddate | datetime | — | O | — | P | RO | — | Set on Closed / Written Off | Y | Y | CbD | CbD | — | new | |
| Reopen Reason | qdb_reopenreason | string | 500 | O | — | U | Y | — | Mandatory on Reopened (FR-029) | Y | Y | CbD | CbD | — | new | |
| Collection Paused | qdb_collectionpaused | bool | — | O | false | P/U | Y | — | Paused while a dispute is open (FR-104) | Y | Y | CbD | CbD | — | new | |
| Organization Code | qdb_organizationcode | choice `qdb_organization_code` | — | R | from platform config | C | RO | — | HL / BFD — for cross-org 360 and reporting | Y | Y | CbD | CbD | — | msst_org | |
| Remarks | qdb_remarks | memo | 4000 | O | — | U | Y | — | Free notes | Y | Y | CbD | CbD | — | new | |
| Correlation ID | qdb_correlationid | string | 100 | O | — | I | RO | — | Sync correlation of the last write | Y | Y | CbD | CbD | — | new | |

**Universal targets (Phase 2 amendment, 2026-09-18 — KI-46).** Two statuses are reachable from every
non-terminal state: *Deceased/Insurance Review* (decision 3, 2026-09-16) and *Settled* (Phase 2 — MIS
reports a cure whenever the customer pays, and a case in any working state must then be able to close).
Neither is added to Under Legal Action, Deceased/Insurance Review, Settled, Closed or Written Off. The
matrix is code in `StatusTransitionMatrix.cs` with a parity-tested TypeScript mirror in `@dcp/domain`.

### `qdb_collectioncase.statuscode` values (carried from the existing matrix; integer values will differ under the `qdb` publisher)

| Label | State | Existing value | Notes |
|---|---|---|---|
| New | Active | 200 | assigned by `DefaultStatusAssigner` on create |
| Assigned | Active | 201 | |
| In Progress | Active | 202 | |
| Pending Customer Response | Active | 203 | contact-bearing |
| PTP Active | Active | 204 | contact-bearing |
| PTP Broken | Active | 205 | |
| Restructure Review | Active | 206 | |
| Restructured | Active | 207 | |
| Escalated to Supervisor | Active | 208 | |
| Pending Legal Review | Active | 209 | |
| Referred to Legal | Active | 210 | |
| Under Legal Action | Active | 211 | terminal for the carve-out |
| Deceased/Insurance Review | Active | 212 | reachable from every non-terminal state |
| Settled | Active | 213 | |
| Closed | **Inactive** | 214 | |
| Written Off | **Inactive** | 215 | |
| Reopened | Active | 216 | requires `qdb_reopenreason` |

## `qdb_collectionactivity` — Collection Activity (custom activity, `IsActivity = true`)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Activity | activityid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key (activity base) | Y | Y | CbD | CbD | — | activityid | |
| Subject | subject | string | 200 | R | composed | P | RO | — | Primary name — `ActivitySubjectComposer` builds it from type name + case number | Y | Y | CbD | CbD | — | subject | |
| Regarding | regardingobjectid | lookup (polymorphic) | — | O | case | U/P | Y | — | Timeline anchor — the case | Y | Y | CbD | CbD | — | regardingobjectid | |
| Activity Number | qdb_activitynumber | string (autonumber) | 100 | R | `ACT-{SEQNUM:8}` | S | N | — | Human key | Y | Y | CbD | CbD | — | new | |
| Collection Case | qdb_collectioncaseid | lookup `qdb_collectioncase` | — | R | — | U/P | N | — | Explicit typed lookup for filtering/rollups | Y | Y | CbD | CbD | — | new | Both this and regarding are set |
| Activity Type | qdb_activitytypeid | lookup `qdb_collectionactivitytype` | — | R | — | U/P | N | — | Replaces the option set | Y | Y | CbD | CbD | — | msst_actiontype (option set) | |
| Activity Sub-Type | qdb_activitysubtype | string | 100 | O | — | U | Y | — | Free sub-classification | Y | Y | CbD | CbD | — | new | |
| Outcome | qdb_outcomeid | lookup `qdb_activityoutcome` | — | O | — | U | Y | — | Filtered by type | Y | Y | CbD | CbD | — | msst_outcomecode (string) | |
| Activity Date | qdb_activitydate | datetime | — | R | now | U | Y | — | When the action happened | Y | Y | CbD | CbD | — | new | |
| Due Date | scheduledend | datetime | — | O | — | U/P | Y | — | Mandatory-next-action control: open + past due = overdue | Y | Y | CbD | CbD | — | scheduledend | |
| Start | scheduledstart | datetime | — | O | — | U | Y | — | | Y | Y | CbD | CbD | — | scheduledstart | |
| Completed On | actualend | datetime | — | O | — | P | RO | — | Set on completion | Y | Y | CbD | CbD | — | actualend | |
| Follow-up Date | qdb_followupdate | datetime | — | O | from outcome follow-up days | P/U | Y | — | Creates the follow-up activity | Y | Y | CbD | CbD | — | new | |
| Status | statecode | state | — | S | Open | S | Y | — | Open / Completed / Canceled | Y | Y | CbD | CbD | — | statecode | Completed = immutable (`ImmutabilityGuard`) |
| Status Reason | statuscode | status | — | S | Open | U/P | Y | — | Open · In Progress · Awaiting Approval · Returned (Open); Completed (Completed); Cancelled (Canceled) | Y | Y | CbD | CbD | — | statuscode | `qdb_activity_status` |
| Owner | ownerid | owner | — | S | creator | U/P | Y | — | Assigned to | Y | Y | CbD | CbD | — | ownerid | |
| Priority | prioritycode | choice (activity) | — | O | Normal | U | Y | — | | Y | Y | CbD | CbD | — | prioritycode | |
| Amount | qdb_amount | money | — | O | — | U | Y | — | Amount if applicable (payment request etc.) | Y | Y | CbD | CbD | — | new | Required when type.qdb_amountrequired |
| Notes | description | memo | 100000 | O | — | U | Y | — | Notes / commitment notes | Y | Y | CbD | CbD | — | msst_notes | Required when type.qdb_notesrequired |
| Requires Approval | qdb_requiresapproval | bool | — | O | from type | D | RO | — | | Y | Y | CbD | CbD | — | new | |
| Approval Status | qdb_approvalstatus | choice `qdb_approval_status` | — | O | NotRequired | P (Process Engine) | RO | — | | Y | Y | CbD | CbD | — | new | |
| Process Instance | qdb_processinstanceid | string | 100 | O | — | P | RO | — | Process Engine instance reference | Y | Y | CbD | CbD | — | new | Type `TBD — Requires QDB Confirmation` (Process Engine key) |
| Form Submission Ref | qdb_formsubmissionref | string | 100 | O | — | P | RO | — | Form Engine submission holding the descriptive fields | Y | Y | CbD | CbD | — | new | Storage model `TBD — Requires QDB Confirmation` |
| Related Record Type | qdb_relatedrecordtype | string | 50 | O | — | P | RO | — | `fax` / `email` when an activity mirrors a send | Y | Y | CbD | CbD | — | new | Only when a rule requires it (MP §40) |
| Related Record ID | qdb_relatedrecordid | string | 50 | O | — | P | RO | — | GUID of the fax/email | Y | Y | CbD | CbD | — | new | |
| MIS Revalidated On | qdb_misrevalidatedon | datetime | — | O | — | I | RO | — | Live MIS revalidation stamp for critical actions | Y | Y | CbD | CbD | misAsOfDate | new | CP §18 (proposed) |
| **PTP Date** | qdb_ptpdate | datetime | — | Cond | — | U | Y | — | Promised payment date | Y | Y | CbD | CbD | — | msst_dcpptprecord.msst_ptpdate | PTP core (physical) |
| **Promised Amount** | qdb_promisedamount | money | — | Cond | — | U | Y | — | | Y | Y | CbD | CbD | — | msst_promisedamount | PTP core |
| **Promise Type** | qdb_promisetype | choice (Full / Partial) | — | Cond | Full | U | Y | — | | Y | Y | CbD | CbD | — | msst_partialflag | PTP core |
| **PTP Status** | qdb_ptpstatus | choice `qdb_ptp_status` | — | Cond | Active | P/U | Y | — | Active · Kept · Partially Kept · Broken · Rescheduled · Cancelled | Y | Y | CbD | CbD | — | msst_dcpptprecord statuscode 220–225 | PTP core; evaluated by rule/sync |
| **Amount Received** | qdb_amountreceived | money | — | O | — | I/U | Y | — | Matched payment | Y | Y | CbD | CbD | derived from arrears delta — `TBD` | new | PTP core |
| **Payment Received Date** | qdb_paymentreceiveddate | datetime | — | O | — | I/U | Y | — | | Y | Y | CbD | CbD | — | new | PTP core |
| **Broken Date** | qdb_brokendate | datetime | — | O | — | P | RO | — | | Y | Y | CbD | CbD | — | new | PTP core |
| **Broken Reason** | qdb_brokenreason | string | 500 | O | — | U/P | Y | — | | Y | Y | CbD | CbD | — | new | PTP core |
| **Reschedule Count** | qdb_reschedulecount | int | — | O | 0 | P | RO | — | Limit configurable (FR-060) | Y | Y | CbD | CbD | — | msst_reschedulecount | PTP core |
| **Previous PTP Date** | qdb_previousptpdate | datetime | — | O | — | P | RO | — | | Y | Y | CbD | CbD | — | new | PTP core |
| **Reminder Date** | qdb_reminderdate | datetime | — | O | ptpdate − 1 day | P | Y | — | Drives reminder communication | Y | Y | CbD | CbD | — | msst_reminderdate | PTP core |
| **Supervisor Escalated** | qdb_supervisorescalated | bool | — | O | false | P | RO | — | | Y | Y | CbD | CbD | — | new | PTP core |

Descriptive fields for field visit (location, purpose, customer response…), restructuring (tenor,
instalment, grace, waiver…), legal (checklist, referral…), deceased/insurance (documents, claim…),
complaint/dispute (type, root cause, SLA…) are **Form Engine configuration** keyed by
`qdb_collectionactivitytype.qdb_defaultformcode`, not columns here.

## `qdb_delinquencysnapshot` — Delinquency Snapshot (org-owned, append-only)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Delinquency Snapshot | qdb_delinquencysnapshotid | uniqueidentifier | — | S | new GUID | S | N | RO | Primary key | Y | Y | CbD | CbD | — | msst_dcpdelinquencysnapshotid | |
| Name | qdb_name | string | 200 | R | `{facility} @ {asof}` | I | N | RO | Primary name | Y | Y | CbD | CbD | — | msst_name | |
| Snapshot Key | qdb_snapshotkey | string | 200 | R | **composed at provisioning** | I | N | RO | **Alternate key** — replay idempotency. **Composition is provisional and configured at provisioning time**; the final rule is `TBD — Requires QDB/MIS Confirmation` (gate correction 2, `ERD.md` *Snapshot idempotency*, `MISIntegration.md` §7.1) | Y | Y | CbD | CbD | stable facility identity + authoritative MIS observation identity | new | 🔴 `facility\|asof\|batch` is a **candidate**, not approved — DPD carries a different as-of date, and an unconditional batch id would break replay idempotency |
| Collection Case | qdb_collectioncaseid | lookup `qdb_collectioncase` | — | **O** | — | I | N | RO | Optional — an exception or GraceMonitor observation has no case (ADR-DCP-11; gate correction 8) | Y | Y | CbD | CbD | — | new | Was `R` in the first issue |
| Customer Business ID | qdb_customerbusinessid | string | 50 | **R** | — | M | N | PII | **Source identity — required at persist.** Present in the MIS feed even when it cannot be resolved to a CRM customer | Y | Y | CbD | CbD | nationalId / customerId | new | Raised from `O` per gate correction 8 |
| DPD As-Of Date | qdb_dpdasofdate | datetime | — | O | — | M | N | RO | The date the DPD counter is measured at, where materially distinct from `qdb_snapshotdate` | Y | Y | CbD | CbD | dpdAsOfDate | new | HL extract shows balance date + 16 days; semantics `TBD — Requires QDB/MIS Confirmation` (F3). Candidate idempotency input |
| Facility Number | qdb_facilitynumber | string | 50 | R | — | M | N | RO | | Y | Y | CbD | CbD | facilityId | new | |
| Snapshot Date (As Of) | qdb_snapshotdate | datetime | — | R | — | M | N | RO | MIS as-of | Y | Y | CbD | CbD | misAsOfDate | msst_asof | |
| DPD | qdb_dpd | int | — | R | — | M | N | RO | | Y | Y | CbD | CbD | arrearDays | msst_dpd | |
| Arrear Bucket | qdb_arrearbucket | choice `qdb_dpd_bucket` | — | R | — | M | N | RO | Normalised code | Y | Y | CbD | CbD | arrearBucket | msst_dpdbucket | `2026-01-30` → `1-30` mapping in adapter |
| Loan Balance | qdb_loanbalance | money | — | R | — | M | N | RO | | Y | Y | CbD | CbD | loanBalance | msst_outstandingbalance | |
| Total Arrears | qdb_totalarrears | money | — | R | — | M | N | RO | | Y | Y | CbD | CbD | totalArrears | msst_arrears | |
| Installment Amount | qdb_installmentamount | money | — | O | — | M | N | RO | | Y | Y | CbD | CbD | installmentAmount | new | |
| First Arrear Date | qdb_firstarreardate | date | — | O | — | M | N | RO | | Y | Y | CbD | CbD | firstArrearDate | new | |
| Last Arrear Amount | qdb_lastarrearamount | money | — | O | — | M | N | RO | | Y | Y | CbD | CbD | lastArrearAmount | new | |
| Arrear Percentage | qdb_arrearpercentage | dec(7,4) | — | O | — | M | N | RO | 0–1 | Y | Y | CbD | CbD | arrearPercentage | new | |
| NPL Indicator | qdb_nplindicator | bool | — | O | — | M/D | N | RO | | Y | Y | CbD | CbD | `TBD — Requires QDB Confirmation` | new | |
| Product Type Code | qdb_producttypecode | string | 20 | O | — | M | N | RO | | Y | Y | CbD | CbD | loanTypeCode | new | |
| Account Status Code | qdb_accountstatuscode | string | 10 | O | — | M | N | RO | MIS status code (7 / 8 seen) | Y | Y | CbD | CbD | accountStatusCode | new | Meaning `TBD — Requires QDB Confirmation` |
| Deceased per QCB | qdb_isdeceasedperqcb | bool | — | O | — | M | N | RO | From QCB Deceased Status = DEAD | Y | Y | CbD | CbD | qcbDeceasedStatus | new | |
| Exemption Percentage | qdb_exemptionpercentage | dec(5,4) | — | O | — | M | N | RO | 0 / 0.2 / 0.5 | Y | Y | CbD | CbD | exemptionPercentage | new | |
| Exemption Amount | qdb_exemptionamount | money | — | O | — | M | N | RO | Sign convention `TBD — Requires QDB Confirmation` | Y | Y | CbD | CbD | exemptionAmount | new | |
| MIS Source Timestamp | qdb_missourcetimestamp | datetime | — | O | — | M | N | RO | | Y | Y | CbD | CbD | sourceTimestamp | new | `TBD` availability |
| Received On | qdb_receivedon | datetime | — | R | now | I | N | RO | When the sync received the row | Y | Y | CbD | CbD | — | new | |
| Integration Batch ID | qdb_integrationbatchid | string | 100 | R | — | I | N | RO | | Y | Y | CbD | CbD | — | msst_batchreference | |
| Correlation ID | qdb_correlationid | string | 100 | O | — | I | N | RO | | Y | Y | CbD | CbD | — | new | |

Update and Delete are blocked by `ImmutabilityGuard` for every role, sysadmin included.

### Source-identity block — persistable without any CRM resolution (gate correction 8)

> **Phase 2 note (2026-09-18):** the canonical observation carries a `sourceSystem` alongside the
> facility number, and the case stores it (`qdb_facilitysourcesystem`), but this table has no column
> for it. It is carried inside `qdb_snapshotkey` where the configured composition includes it and is
> otherwise implied by the organisation. A `qdb_facilitysourcesystem` string(50) column is **proposed,
> not added** — KI-47.

An `IdentityException` or `FacilityException` observation must be storable and later reprocessable **even
though no CRM customer, facility or case GUID was resolved**. These columns are therefore **required at
persist** and come straight from the MIS payload, never from a CRM lookup:

| Column | Why it must be present |
|---|---|
| `qdb_customerbusinessid` | the MIS customer identifier as delivered — the only handle on an unresolved customer |
| `qdb_facilitynumber` | the MIS account/facility number — the only handle on an unresolved facility |
| `qdb_snapshotdate` | the observation's financial as-of date |
| `qdb_receivedon` | when the sync took delivery |
| `qdb_integrationbatchid` | which run delivered it, for replay and reconciliation |
| `qdb_missourcetimestamp` | when MIS stamped it, **where MIS supplies it** (`O` — availability `TBD`) |

**No CRM lookup may be mandatory on this entity.** `qdb_collectioncaseid` is optional; any future
customer or facility lookup added by an organisation-specific deployment must also be optional. A
resolved CRM Facility GUID is explicitly **not** a precondition for persisting an exception observation.

---

## Addendum 2026-09-17 — Collection Eligibility / Grace columns (F2 decision, ADR-DCP-11)

A MIS delinquency record is **not** automatically a Collection Case. After identity and facility
resolution, a configurable **Collection Eligibility / Grace evaluation** runs as a Rule Engine ruleset
(via `IRuleEngine` — **no new entity, no new engine**) and returns one of six outcomes. The decision and
its provenance are recorded on the **snapshot**, so a delinquency record that produced no case still has
auditable history.

### `qdb_delinquencysnapshot` — five added columns

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Eligibility Outcome | qdb_eligibilityoutcome | choice `qdb_eligibility_outcome` | — | R | — | I | N | RO | EligibleCreateCase · ExistingEpisodeUpdate · GraceMonitor · ExcludedSpecialHandling · IdentityException · FacilityException | Y | Y | CbD | CbD | — | new | Written by background sync after the ruleset returns |
| Eligibility Reason | qdb_eligibilityreason | string | 500 | O | — | I | N | RO | Human-readable reason emitted by the ruleset, e.g. "arrears below one instalment" | Y | Y | CbD | CbD | — | new | Text comes from the ruleset, never from application source |
| Eligibility Ruleset Code | qdb_eligibilityrulesetcode | string | 100 | O | from platform config | I | N | RO | Which ruleset decided (`qdb_platformconfiguration.qdb_eligibilityrulesetcode`) | Y | Y | CbD | CbD | — | new | Key format `TBD — Requires QDB Confirmation` (Rule Engine) |
| Eligibility Ruleset Version | qdb_eligibilityrulesetversion | string | 50 | O | — | I | N | RO | Version of the ruleset that produced the decision | Y | Y | CbD | CbD | — | new | Lets a past decision be explained after the rules change |
| Eligibility Evaluated On | qdb_eligibilityevaluatedon | datetime | — | O | — | I | N | RO | When the evaluation ran | Y | Y | CbD | CbD | — | new | |

**Consequential change to an existing column:** `qdb_collectioncaseid` on `qdb_delinquencysnapshot` moves
from **Req `R` → `O` (optional)**, and `qdb_customerbusinessid` moves from **`O` → `R`**. A `GraceMonitor`,
`ExcludedSpecialHandling`, `IdentityException` or `FacilityException` snapshot has no case to point at, and
an exception observation may have no resolved CRM customer or facility at all — but it must always carry
its **source identifiers** (see *Source-identity block* above).

`qdb_snapshotkey` remains the alternate key, but its **composition is provisional**: the final physical
rule is `TBD — Requires QDB/MIS Confirmation` (gate correction 2). Replay idempotency must hold under
whatever composition is confirmed.

Which records are persisted at all is governed by `qdb_platformconfiguration.qdb_snapshotpolicy`
(`AllReceived` · `EligibleOnly` · `ChangedOnly`). **No production default is set in Phase 0** — see
`MISIntegration.md` §7.2; `AllReceived` in particular is *not* adopted as a universal default, because a
policy that re-persists identical unchanged observations on every sync makes history voluminous rather
than meaningful.

### `qdb_collectioncase` — one added column

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Eligibility Ruleset Version | qdb_eligibilityrulesetversion | string | 50 | O | — | I | N | RO | Provenance of the decision that created this episode — which ruleset version judged the facility eligible | Y | Y | CbD | CbD | — | new | Answers "why does this case exist?" months later |

No threshold (`arrears < 1 instalment`, `DPD < N`, any bucket boundary) appears in these columns or in
application source; all of it lives in the ruleset. See `ConfigurationGuide.md` §11.
