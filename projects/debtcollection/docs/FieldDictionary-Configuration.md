# Field Dictionary — Part 2: Business configuration entities

Legend and conventions: `FieldDictionary.md`. All entities here are organisation-owned; admin-edited;
every change is captured by native audit (FR-036/118). Entity = table heading.

## `qdb_collectionactivitytype` — Collection Activity Type

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Activity Type | qdb_collectionactivitytypeid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | new | |
| Name | qdb_name | string | 200 | R | — | C | Y | — | English name (primary) | Y | Y | CbD | CbD | — | option-set label `msst_dcpactiontype` | |
| Code | qdb_code | string | 50 | R | — | C | N | — | Stable code; **alternate key** | Y | Y | CbD | CbD | — | new | e.g. CALL, PTP, VISIT, RESTRUCT, LEGAL, DECEASED, COMPLAINT |
| Name (Arabic) | qdb_namearabic | string | 200 | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Category | qdb_category | choice (Contact · Payment · Commitment · Visit · Recommendation · Complaint · General) | — | R | General | C | Y | — | Grouping for UI and reporting | Y | Y | CbD | CbD | — | new | Values are a proposal |
| Applicable Customer Type | qdb_applicablecustomertype | multi-select `qdb_customer_type` | — | O | all | C | Y | — | Empty = all | Y | Y | CbD (v9.0+) | CbD | — | new | |
| Applicable Product | qdb_applicableproduct | multi-select `qdb_product_type` | — | O | all | C | Y | — | Empty = all | Y | Y | CbD (v9.0+) | CbD | — | new | |
| Default Form Code | qdb_defaultformcode | string | 100 | O | — | C | Y | — | Form Engine form code for the activity's dynamic fields | Y | Y | CbD | CbD | — | new | Form Engine key format `TBD — Requires QDB Confirmation` |
| Process Code | qdb_processcode | string | 100 | O | — | C | Y | — | Process Engine process to start | Y | Y | CbD | CbD | — | new | `TBD` key format |
| Rule Code | qdb_rulecode | string | 100 | O | — | C | Y | — | Rule Engine rule set for validation/eligibility | Y | Y | CbD | CbD | — | new | `TBD` key format |
| Requires Approval | qdb_requiresapproval | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Requires Follow-up | qdb_requiresfollowup | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| SLA Hours | qdb_slahours | int | — | O | — | C | Y | — | Completion SLA | Y | Y | CbD | CbD | — | msst_dcpstrategyconfig.msst_slahours (concept) | |
| Amount Required | qdb_amountrequired | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Notes Required | qdb_notesrequired | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Attachment Allowed | qdb_attachmentallowed | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Requires MIS Revalidation | qdb_requiresmisrevalidation | bool | — | R | false | C | Y | — | Live MIS check before completing (CP §18) | Y | Y | CbD | CbD | — | new | Proposed |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Sequence | qdb_sequence | int | — | O | — | C | Y | — | Display order | Y | Y | CbD | CbD | — | new | |

## `qdb_activityoutcome` — Activity Outcome

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Activity Outcome | qdb_activityoutcomeid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | new | |
| Name | qdb_name | string | 200 | R | — | C | Y | — | English name (primary) | Y | Y | CbD | CbD | — | msst_outcomecode (free text) | |
| Activity Type | qdb_activitytypeid | lookup `qdb_collectionactivitytype` | — | R | — | C | N | — | Owning type | Y | Y | CbD | CbD | — | new | |
| Code | qdb_code | string | 50 | R | — | C | N | — | Unique within type | Y | Y | CbD | CbD | — | new | |
| Name (Arabic) | qdb_namearabic | string | 200 | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Category | qdb_category | choice (Positive · Negative · Neutral · NoContact) | — | O | Neutral | C | Y | — | Reporting bucket | Y | Y | CbD | CbD | — | new | Proposal |
| Requires Follow-up | qdb_requiresfollowup | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Requires Notes | qdb_requiresnotes | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Follow-up Days | qdb_followupdays | int | — | O | — | C | Y | — | Sets `qdb_followupdate` | Y | Y | CbD | CbD | — | new | |
| Escalation Required | qdb_escalationrequired | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Close Activity | qdb_closeactivity | bool | — | R | true | C | Y | — | Completes the activity when chosen | Y | Y | CbD | CbD | — | new | |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Sequence | qdb_sequence | int | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |

## `qdb_collectionstrategy` — Collection Strategy (which treatment applies)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Collection Strategy | qdb_collectionstrategyid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | msst_dcpstrategyconfigid | |
| Name | qdb_name | string | 200 | R | — | C | Y | — | Primary name | Y | Y | CbD | CbD | — | msst_name | |
| Code | qdb_code | string | 50 | O | — | C | N | — | Stable code | Y | Y | CbD | CbD | — | new | |
| Customer Type | qdb_customertype | choice `qdb_customer_type` | — | O | — | C | Y | — | Empty = any | Y | Y | CbD | CbD | — | msst_segment | |
| Product Type | qdb_producttype | choice `qdb_product_type` | — | O | — | C | Y | — | Empty = any | Y | Y | CbD | CbD | — | new | |
| DPD From | qdb_dpdfrom | int | — | O | — | C | Y | — | Inclusive | Y | Y | CbD | CbD | arrearDays | msst_dpdbucket (bucket → range) | Ranges replace the bucket choice so `1001-2000` rules are expressible |
| DPD To | qdb_dpdto | int | — | O | — | C | Y | — | Inclusive; empty = open-ended | Y | Y | CbD | CbD | arrearDays | msst_dpdbucket | |
| Arrears From | qdb_arrearsfrom | money | — | O | — | C | Y | — | | Y | Y | CbD | CbD | totalArrears | new | |
| Arrears To | qdb_arrearsto | money | — | O | — | C | Y | — | | Y | Y | CbD | CbD | totalArrears | new | |
| Exposure From | qdb_exposurefrom | money | — | O | — | C | Y | — | Optional; unused by default (FR-034 vs MP §41) | Y | Y | CbD | CbD | loanBalance | new | See `KnownIssues.md` |
| Exposure To | qdb_exposureto | money | — | O | — | C | Y | — | As above | Y | Y | CbD | CbD | loanBalance | new | |
| Risk Level | qdb_risklevel | choice `qdb_risk_level` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| NPL Only | qdb_nplflag | bool | — | O | — | C | Y | — | Null = any | Y | Y | CbD | CbD | — | new | |
| Broken PTP Count From | qdb_brokenptpcountfrom | int | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Legal Status | qdb_legalstatus | string | 50 | O | — | C | Y | — | Matches case status labels for legal states | Y | Y | CbD | CbD | — | new | |
| Restructure Status | qdb_restructurestatus | string | 50 | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Priority | qdb_priority | int | — | R | 100 | C | Y | — | Evaluation order (lower first) | Y | Y | CbD | CbD | — | new | |
| Effective From | qdb_effectivefrom | datetime | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Effective To | qdb_effectiveto | datetime | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Rule Code | qdb_rulecode | string | 100 | O | — | C | Y | — | Rule Engine eligibility rule for criteria the columns cannot express | Y | Y | CbD | CbD | — | new | |
| No Automated Contact | qdb_noautomatedcontact | bool | — | R | false | C | Y | — | Suppresses all automated communication for matches (FR-033, >2000 DPD) | Y | Y | CbD | CbD | — | msst_actiontype = No Contact | |
| Description | qdb_description | memo | 2000 | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | msst_active | |

## `qdb_strategyaction` — Strategy Action (what happens, in sequence)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Strategy Action | qdb_strategyactionid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | new | |
| Name | qdb_name | string | 200 | R | `{strategy} #{seq}` | P | Y | — | Primary name | Y | Y | CbD | CbD | — | new | |
| Strategy | qdb_strategyid | lookup `qdb_collectionstrategy` | — | R | — | C | N | — | | Y | Y | CbD | CbD | — | msst_dcpstrategyconfig (row) | |
| Sequence | qdb_sequence | int | — | R | — | C | Y | — | Order within strategy | Y | Y | CbD | CbD | — | new | |
| Activity Type | qdb_activitytypeid | lookup `qdb_collectionactivitytype` | — | O | — | C | Y | — | Activity to create | Y | Y | CbD | CbD | — | msst_actiontype | |
| Communication Channel | qdb_communicationchannel | choice `qdb_communication_channel` | — | O | — | C | Y | — | Send via this channel | Y | Y | CbD | CbD | — | msst_actiontype (SMS/Email/Letter) | |
| Day Offset | qdb_dayoffset | int | — | R | 0 | C | Y | — | Days after trigger | Y | Y | CbD | CbD | — | new | |
| Trigger Event | qdb_triggerevent | choice `qdb_trigger_event` | — | R | DayOffset | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Assignment Configuration | qdb_assignmentconfigurationid | lookup `qdb_assignmentconfiguration` | — | O | — | C | Y | — | Route on this step | Y | Y | CbD | CbD | — | new | |
| Queue Name | qdb_queuename | string | 100 | O | — | C | Y | — | Queue resolved by name, never GUID | Y | Y | CbD | CbD | — | msst_queueref | |
| Requires Approval | qdb_requiresapproval | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Communication Template | qdb_communicationtemplateid | lookup `qdb_communicationtemplate` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Process Code | qdb_processcode | string | 100 | O | — | C | Y | — | Process Engine reference | Y | Y | CbD | CbD | — | new | `TBD` key format |
| Rule Code | qdb_rulecode | string | 100 | O | — | C | Y | — | Rule Engine reference | Y | Y | CbD | CbD | — | new | `TBD` key format |
| Mandatory | qdb_ismandatory | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Stop on Payment | qdb_stoponpayment | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Stop on PTP | qdb_stoponptp | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Escalate if Not Completed | qdb_escalateifnotcompleted | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Escalation Hours | qdb_escalationhours | int | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | msst_slahours | |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |

## `qdb_assignmentconfiguration` — Assignment Configuration

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Assignment Configuration | qdb_assignmentconfigurationid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | new | |
| Name | qdb_name | string | 200 | R | — | C | Y | — | Primary name | Y | Y | CbD | CbD | — | new | |
| Customer Type | qdb_customertype | choice `qdb_customer_type` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Product Type | qdb_producttype | choice `qdb_product_type` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| DPD From / To | qdb_dpdfrom / qdb_dpdto | int | — | O | — | C | Y | — | | Y | Y | CbD | CbD | arrearDays | new | Two columns |
| Arrears From / To | qdb_arrearsfrom / qdb_arrearsto | money | — | O | — | C | Y | — | | Y | Y | CbD | CbD | totalArrears | new | Two columns |
| Exposure From / To | qdb_exposurefrom / qdb_exposureto | money | — | O | — | C | Y | — | Optional (see strategy note) | Y | Y | CbD | CbD | loanBalance | new | Two columns |
| Risk Level | qdb_risklevel | choice `qdb_risk_level` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Region | qdb_region | string | 100 | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | Source of region `TBD — Requires QDB Confirmation` |
| Legal Status | qdb_legalstatus | string | 50 | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Target Team | qdb_targetteamid | lookup team | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Assignment Method | qdb_assignmentmethod | choice `qdb_assignment_method` | — | R | Manual | C | Y | — | RoundRobin · Load · Territory · SmartAssignment · Manual | Y | Y | CbD | CbD | — | new | |
| Default User | qdb_defaultuserid | lookup systemuser | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| SLA Hours | qdb_slahours | int | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Priority | qdb_priority | int | — | R | 100 | C | Y | — | Evaluation order | Y | Y | CbD | CbD | — | new | |
| Effective From / To | qdb_effectivefrom / qdb_effectiveto | datetime | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | Two columns |
| Smart Assignment Reference | qdb_smartassignmentref | string | 100 | O | — | C | Y | — | Handle into Smart Assignment | Y | Y | CbD | CbD | — | new | `TBD — Requires QDB Confirmation` (engine not found) |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |

## `qdb_communicationtemplate` — Communication Template (conditional on EmailEditor reuse — `TBD — Requires QDB Confirmation`)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Communication Template | qdb_communicationtemplateid | uniqueidentifier | — | S | new GUID | S | N | — | Primary key | Y | Y | CbD | CbD | — | new | |
| Name | qdb_name | string | 200 | R | — | C | Y | — | Primary name | Y | Y | CbD | CbD | — | new | |
| Code | qdb_code | string | 50 | R | — | C | N | — | Stable code; alternate key with version | Y | Y | CbD | CbD | — | msst_templateref (concept) | |
| Channel | qdb_channel | choice `qdb_communication_channel` | — | R | — | C | Y | — | SMS · WhatsApp · Email · Official Letter | Y | Y | CbD | CbD | — | msst_dcpchannel | |
| Language | qdb_language | choice `qdb_language` (Arabic · English) | — | R | — | C | Y | — | | Y | Y | CbD | CbD | — | msst_dcppreferredlanguage | |
| Subject | qdb_subject | string | 500 | O | — | C | Y | — | Email subject | Y | Y | CbD | CbD | — | new | |
| Body | qdb_body | memo | 100000 | R | — | C | Y | — | With `{{placeholders}}` | Y | Y | CbD | CbD | — | new | Placeholder list in `CommunicationArchitecture.md` |
| Placeholders | qdb_placeholders | memo | 4000 | O | — | C | RO | — | Declared placeholders (validated) | Y | Y | CbD | CbD | — | new | |
| Customer Type | qdb_customertype | choice `qdb_customer_type` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Product Type | qdb_producttype | choice `qdb_product_type` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Activity Type | qdb_activitytypeid | lookup `qdb_collectionactivitytype` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Strategy | qdb_strategyid | lookup `qdb_collectionstrategy` | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Effective From / To | qdb_effectivefrom / qdb_effectiveto | datetime | — | O | — | C | Y | — | | Y | Y | CbD | CbD | — | new | Two columns |
| Approval Status | qdb_approvalstatus | choice `qdb_approval_status` | — | R | Pending | P | RO | — | Template approval workflow (FR-071/117) | Y | Y | CbD | CbD | — | new | |
| Version | qdb_version | int | — | R | 1 | P | RO | — | | Y | Y | CbD | CbD | — | new | |
| Free Text Allowed | qdb_freetextallowed | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Editing Allowed | qdb_editingallowed | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| Approval Required | qdb_approvalrequired | bool | — | R | false | C | Y | — | Per-send approval | Y | Y | CbD | CbD | — | new | |
| Attachments Allowed | qdb_attachmentsallowed | bool | — | R | false | C | Y | — | | Y | Y | CbD | CbD | — | new | |
| External Template Reference | qdb_externaltemplateref | string | 100 | O | — | C | Y | — | Reference into QDB EmailEditor if reused | Y | Y | CbD | CbD | — | new | `TBD — Requires QDB Confirmation` |
| Active | qdb_isactive | bool | — | R | true | C | Y | — | | Y | Y | CbD | CbD | — | new | |

---

## Addendum 2026-09-17 — exposure criteria retained (F9 decision) and thresholds are configuration

### Exposure stays in the model

`qdb_collectionstrategy.qdb_exposurefrom` / `qdb_exposureto` and
`qdb_assignmentconfiguration.qdb_exposurefrom` / `qdb_exposureto` are **retained as optional, configurable
criteria** — the earlier note "unused by default (FR-034 vs MP §41)" is superseded. Reading:

| Organisation | Exposure criterion |
|---|---|
| **HL** (Housing Loan) | Available but **left unconfigured by default**. Evidence: average balance is flat at QAR 680–860 k across all ten DPD buckets, so exposure ranks nothing in this population. A business request can switch it on without a code change. |
| **BFD** (SME / Corporate) | Available and **may be significant**. Exposure commonly differentiates corporate collections; nothing in the HL data speaks to it. |

The HL observation is a *configuration default and a strategy recommendation*, **not** an architectural
prohibition. HL statistical findings must not be generalised into cross-platform Collection policy — the
same build must let BFD configure materially different criteria and thresholds.

> 🔴 **Contradiction with the approved BRD.** **FR-034** — *"The strategy engine SHALL NOT segment by
> exposure (outstanding balance). DPD and arrears amount are the only permitted segmentation dimensions"* —
> is now contradicted. It must be amended to express an **HL default**, not a platform rule.
> Tracked in `KnownIssues.md` and the Project Tracker.

### Thresholds are configuration, never code

Every numeric boundary used by strategy or eligibility — DPD ranges, arrears ranges, exposure ranges,
arrears-to-instalment ratios, grace periods, broken-PTP counts, bucket boundaries, segmentation cut-offs
such as "operational vs recovery" — is held in `qdb_collectionstrategy` / `qdb_assignmentconfiguration`
rows or in a Rule Engine ruleset referenced by `qdb_rulecode`. **No threshold is compiled into Collection
application source.** In particular:

- The data-supported HL recommendations (grace below one instalment; reduced automation deep in the tail)
  are **seeded configuration and a recommendation for QDB confirmation**, not defaults enforced in code.
- `qdb_collectionstrategy.qdb_noautomatedcontact` remains the *mechanism* by which a strategy may suppress
  automated contact. **Whether it is switched on above 2000 DPD — or at any threshold — is
  `TBD — Requires QDB Confirmation`** and is configured, never encoded. The column's earlier note citing
  ">2000 DPD" is an illustration of the mechanism, not an approved rule.
