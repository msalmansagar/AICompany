# DCP — Target Entity Dictionary (Phase 0)

**Status:** proposal · 2026-09-17 · publisher prefix `qdb` · solution `qdb_debtcollection` (proposed; the
existing solution is `msst_debtcollection`). Column-level detail is in `FieldDictionary.md`.
Compatibility columns use the CP §1 vocabulary. Nothing here is provisioned.

| Column | Meaning |
|---|---|
| Kind | S = existing system entity · T = transaction · C = business configuration · P = platform/integration · ? = conditional |
| Existing | The `msst_` component it replaces, if any (`SchemaMigration_msst_to_qdb.md`) |
| On-Prem / Cloud | *Compatible by design* unless a genuine platform limitation is named |

## Source of truth (Phase 2, 2026-09-18)

The table in `TargetArchitecture.md` §5a is the contract behind every entity below. In short: CRM owns
the customer (contact for HL, account for BFD); **MIS owns facility identity and the current position**;
`qdb_delinquencysnapshot` owns history; `qdb_collectioncase` owns the lifecycle;
`qdb_collectionactivity` owns actions and promises; native `fax` / `email` / the approved document
capability own communications. BFD Facility Limit and HL Customer Product are **optional enrichment
only** — no entity here depends on them, and the shared schema carries no lookup to them.

## A. Transaction entities

| Logical name | Display | Kind | Ownership | Activities? | Existing | Purpose | On-Prem 9.1 | Cloud |
|---|---|---|---|---|---|---|---|---|
| `qdb_collectioncase` | Collection Case | T | User/Team | Yes (`HasActivities`) — fax, email, collection activities regard it | `msst_dcpcollectioncase` (KEEP/REFACTOR) | The operational Collection record for one facility's delinquency episode: lifecycle, ownership, strategy, priority, cached MIS position. `IsValidForQueue = true` from creation (MP §59). | Compatible by design | Compatible by design |
| `qdb_collectionactivity` | Collection Activity | T (custom activity, `IsActivity`) | User/Team | n/a | `msst_dcpcollectionaction` (KEEP/REFACTOR) + `msst_dcpptprecord` (CONSOLIDATE) | What Collections does: call, follow-up, meeting, payment request, PTP, field visit, restructuring / legal / deceased recommendation, complaint. Type and outcome are lookups to configuration. PTP core fields are physical; descriptive fields via Form Engine. | Compatible by design | Compatible by design |
| `qdb_delinquencysnapshot` | Delinquency Snapshot | T | Organization | No | `msst_dcpdelinquencysnapshot` (KEEP/REFACTOR) | Append-only history of the MIS position for a case/facility, written only by background sync or a controlled rule; unique on `qdb_snapshotkey`. Read-only for users. **Also records the Collection Eligibility decision** (`qdb_eligibilityoutcome` + reason + ruleset code/version + evaluated-on), so a delinquency record that produced *no* case still has auditable history — the snapshot's `qdb_collectioncaseid` is therefore optional. Which records are persisted is governed by `qdb_platformconfiguration.qdb_snapshotpolicy`. | Compatible by design | Compatible by design |

## B. Business configuration entities

| Logical name | Display | Kind | Ownership | Existing | Purpose | On-Prem 9.1 | Cloud |
|---|---|---|---|---|---|---|---|
| `qdb_collectionactivitytype` | Collection Activity Type | C | Organization | option set `msst_dcpactiontype` (REPLACE) | Configurable activity taxonomy with EN/AR names, category, applicability, Form/Process/Rule Engine references, approval/follow-up/SLA rules. | Compatible | Compatible |
| `qdb_activityoutcome` | Activity Outcome | C | Organization | `msst_outcomecode` string (REPLACE) | Outcome/reason per activity type, with follow-up and escalation behaviour. | Compatible | Compatible |
| `qdb_collectionstrategy` | Collection Strategy | C | Organization | `msst_dcpstrategyconfig` (REFACTOR/SPLIT) | Which treatment applies: criteria over customer type, product, DPD, arrears, (exposure — see note), risk, NPL, broken-PTP count, legal/restructure status, effective dates. | Compatible | Compatible |
| `qdb_strategyaction` | Strategy Action | C | Organization | `msst_dcpstrategyconfig` (REFACTOR/SPLIT) | What happens, in sequence: activity type / channel / day offset / trigger / template / process / rule / stop conditions / escalation. | Compatible | Compatible |
| `qdb_assignmentconfiguration` | Assignment Configuration | C | Organization | — (CREATE) | Routing criteria → team/user/method/SLA. Delegates to Smart Assignment where it exists (`TBD — Requires QDB Confirmation`). | Compatible | Compatible |
| `qdb_communicationtemplate` | Communication Template | C | Organization | — (CREATE, conditional on EmailEditor reuse — `TBD`) | Channel/language templates with `{{placeholders}}`, approval, versioning, effective dates, free-text/edit/attachment permissions. | Compatible | Compatible |

**Exposure note (F9 decision, 2026-09-17).** Exposure **remains an optional, configurable Strategy
criterion and is retained in the architecture** (`qdb_exposurefrom` / `qdb_exposureto` on
`qdb_collectionstrategy` and `qdb_assignmentconfiguration`). The Housing Loan analysis shows exposure does
not differentiate *that* population — average balance is flat at QAR 680–860 k across every DPD bucket — so
**HL's initial strategy configuration need not use it**, unless the business asks. That observation applies
only to the supplied Housing Loan population: **BFD SME/Corporate collections may well need exposure as a
significant criterion**, and HL statistical findings must not be generalised into cross-platform Collection
policy. The criterion is therefore configured off for HL, available for BFD, and never removed from the model.

> 🔴 **Contradiction with the approved BRD.** BRD **FR-034** states the strategy engine *"SHALL NOT segment
> by exposure (outstanding balance)"* — an absolute prohibition derived from the HL portfolio analysis. The
> F9 decision supersedes it: exposure is retained as an optional criterion, disabled by default for HL.
> **FR-034 requires a BRD amendment** to read as an HL configuration default rather than an architectural
> prohibition. Logged in `KnownIssues.md`; the requirement is flagged in the Project Tracker.

## C. Platform / integration entities

| Logical name | Display | Kind | Ownership | Existing | Purpose | On-Prem 9.1 | Cloud |
|---|---|---|---|---|---|---|---|
| `qdb_platformconfiguration` | Platform Configuration | P | Organization | — (CREATE) | One row per deployment: platform type, org code, environment, customer/facility/case/activity/sms/whatsapp/email entity names, document provider, MIS enabled + provider, feature flags. **Plus the three Rule Engine ruleset pointers** — `qdb_eligibilityrulesetcode` (Collection Eligibility / Grace), `qdb_strategyrulesetcode`, `qdb_contactholdrulesetcode` — and `qdb_snapshotpolicy`. Pointers, not thresholds: every threshold lives in the ruleset, so HL and BFD can differ materially with no code change. **Never secrets.** | Compatible | Compatible |
| `qdb_platformmapping` | Platform Mapping | P | Organization | — (CREATE) | Normalised child rows: business object → canonical field → CRM entity + field, type, required, access mode, source. Keeps the core model stable and the physical binding dynamic (MP §14). | Compatible | Compatible |
| `qdb_identityexception` | Identity Exception | P | User/Team | `msst_dcpidentityexception` (KEEP/REFACTOR) | MIS records that cannot be resolved to an existing customer/facility; carries enough for controlled resolution; never creates a corrupt case. | Compatible | Compatible |
| `qdb_crmlogs` **(existing — REUSE; QDB-confirmed)** | CRM Logs | S (existing custom **activity**) | User (existing) | `msst_dcpauditlog` technical role (REPLACE). **Both `qdb_integrationlog` (new) and `qdb_integrationlogs` (reuse) are withdrawn — superseded by reuse of existing `qdb_crmlogs`.** | DCP technical/integration execution evidence only. Existing columns reused: `qdb_source`, `qdb_destination`, `qdb_type`, `qdb_request`, `qdb_response`, `qdb_exception`, `qdb_isexception` + activity base (`subject`, `description`, `regardingobjectid`, state/status, `actualstart`/`actualend`, duration). Gaps needing a **proposed extension** (approval required, nothing changed in Phase 0): correlation id, batch/run id, operation code, severity, error code, attempt number, ms duration, source reference, a `qdb_type` option. **1,295 rows already exist** — DCP is a co-tenant and filters on a `qdb_source` prefix. **Must not become business audit** (native audit owns that). Full mapping: `QdbCrmLogsReuseAssessment.md`. | Compatible by design (presence on the on-prem org `TBD`) | Cloud Runtime Tested (exists, in use) |

## D. Conditional

| Logical name | Display | Kind | Existing | Condition |
|---|---|---|---|---|
| `qdb_consent` | Consent | ? | `msst_dcpconsent` (REASSESS) | Only if QDB has no existing consent / opt-out / channel-permission capability — `TBD — Requires QDB Confirmation`. Design carried over unchanged pending the answer. |

## E. Existing system entities reused (no new entity)

| Entity | Role in DCP | `qdb_` extensions proposed (CP §7) | Notes |
|---|---|---|---|
| `contact` | HL customer master; target of `qdb_customerid` | `qdb_stopcontact`, `qdb_stopcontactreason`, `qdb_stopcontactdate`, `qdb_deceasedflag`, `qdb_dateofdeath`, `qdb_deceasedsource`, `qdb_vulnerabilityflag`, `qdb_specialhandling`, `qdb_collectionlanguage` | Existing QDB `qdb_*` contact fields must be checked first for overlap — `TBD — Requires QDB Confirmation` |
| `account` | BFD customer master; target of `qdb_customerid` | Same set as contact | Sandbox evidence: `account` already carries `qdb_crnumber`, `qdb_mobile_number`, `qdb_nationality`, `qdb_special_instructions`, `qdb_noofdaysindelinquency`, `qdb_past_dues_amount`, `qdb_risklevel` — reused via mapping — but **no** stop-contact / deceased / vulnerability / language column, so the CP §7 flags are additions. |
| \<HL facility entity\> | HL facility master | none proposed | Logical name `TBD — Requires QDB Confirmation` — the HL schema is not on the sandbox. |
| `qdb_account` "Loan Account" / `qdb_facility` "Facility" (BFD, **evidenced on the sandbox**) | BFD loan-account / facility masters | none proposed | Candidates: `qdb_account.account_no` matches the MIS *Account Number* unit; `qdb_facility` is the limit. Which one the case's facility lookup targets `TBD — Requires QDB Confirmation`. See `ExistingQdbSchemaAssessment.md`. |
| `qdb_da_case`, `qdb_collections_task`, `qdb_collections_site_visit`, `qdb_da_configuration`, `qdb_collection_reason` (BFD legacy DA module) | superseded by DCP | none | Frozen, not extended, not deleted in Phase 1–2; coexistence/migration assessed once QDB confirms whether it is live. |
| `qdb_exclude_customer` (BFD, **evidenced on the sandbox**: `cif_no`, `customer → account`, `comments`) | **reuse candidate** for the `ExcludedSpecialHandling` eligibility outcome — an existing exclusion list the Eligibility ruleset can read instead of DCP inventing one | none | Whether this list is authoritative, maintained, and applicable to Collections is `TBD — Requires QDB Confirmation`. If confirmed, the Eligibility ruleset consults it; if not, exclusion is expressed purely in ruleset criteria. |
| `fax` | SMS + WhatsApp transactions | possibly `qdb_channel` (SMS vs WhatsApp), `qdb_blockreason`, `qdb_templatecode`, `qdb_deliverystatus` — only if QDB's existing mechanism lacks them (`TBD`) | The existing trigger mechanism is `TBD — Requires QDB Confirmation` |
| `email` | Email transactions | as above | |
| `queue` | Early Collection · High Risk · Deceased & Insurance (+ BRD FR-037 list) | none | Resolved by name, never GUID |
| `team`, `systemuser`, `businessunit` | Ownership, assignment, BU scoping | none | |

## F. Retired (create-new-then-migrate; nothing deleted in Phase 0)

| Existing | Decision | Replaced by |
|---|---|---|
| `msst_dcpcustomer` | RETIRE | contact / account (+ flags above) — field-by-field classification in `SchemaMigration_msst_to_qdb.md` §4 |
| `msst_dcploanfacility` | RETIRE | existing facility entities + `qdb_facilitynumber` on the case |
| `msst_dcpcommunication` | RETIRE | fax / email + Communication Service |
| `msst_dcpptprecord` | CONSOLIDATE | `qdb_collectionactivity` (type = PTP) |
| `msst_dcpauditlog` | REPLACE | Dynamics native audit (business) + existing **`qdb_crmlogs`** (technical/integration) |
| `msst_dcpstrategyconfig` | REFACTOR/SPLIT | `qdb_collectionstrategy` + `qdb_strategyaction` |

## G. Global choices (option sets)

| Choice | Values | Replaces |
|---|---|---|
| `qdb_dpd_bucket` | 1-30 · 31-60 · 61-90 · 91-180 · 181-270 · 271-360 · 361-500 · 501-1000 · 1001-2000 · >2000 | `msst_dcpdpdbucket` (same 10 values, labels normalised to the MIS codes) |
| `qdb_customer_type` | Individual · SME · Corporate | `msst_dcpsegment` (Retail/SME) |
| `qdb_case_stage` | Early · Mid · Late · Legal · Workout · Closed (proposed; stage is coarser than statuscode) | — |
| `qdb_activity_status` | custom statuscodes on the activity (Open, In Progress, Completed, Cancelled, Awaiting Approval, Returned) | — |
| `qdb_ptp_status` | Active · Kept · Partially Kept · Broken · Rescheduled · Cancelled | PTP statuscodes 220–225 |
| `qdb_communication_channel` | SMS · WhatsApp · Email · Call · Official Letter | `msst_dcpchannel` |
| `qdb_platform_type` | OnPrem · Cloud | — |
| `qdb_organization_code` | HL · BFD | `msst_dcporg` |
| `qdb_product_type` | from MIS loan type codes (1001…1013 seen in the report) — seed from data, not hard-coded | `msst_dcpproducttype` |
| `qdb_risk_level`, `qdb_priority` | Low · Medium · High · Critical | — |
| `qdb_assignment_method` | RoundRobin · Load · Territory · SmartAssignment · Manual | — |
| `qdb_trigger_event` | DayOffset · BucketChange · BrokenPTP · Cure · NewDelinquency · SLA · Manual | — |
| `qdb_eligibility_outcome` | EligibleCreateCase · ExistingEpisodeUpdate · GraceMonitor · ExcludedSpecialHandling · IdentityException · FacilityException | — (new; the six outcomes of Collection Eligibility / Grace evaluation, recorded on the snapshot) |
| `qdb_snapshot_policy` | AllReceived · EligibleOnly · ChangedOnly | — (new; governs which MIS records are persisted as snapshots, per deployment) |
| `qdb_exception_reason` | CustomerNotFound · FacilityNotFound · DuplicateCustomer · DuplicateFacility · InvalidIdentifier · OneOrgOnly | `msst_dcpexceptionreason` |
| `qdb_exception_status` | Open · UnderReview · Resolved · Rejected | `msst_dcpexceptionstatus` |
| `qdb_resolution_type` | Cured · Settled · Restructured · WrittenOff · Legal · Deceased · Closed | — |
| `qdb_approval_status` | NotRequired · Pending · Approved · Rejected · Returned | — |
| `qdb_business_object` | Customer · Facility · Case · Activity · Communication · Document | — |
| `qdb_mapping_access`, `qdb_mapping_source` | Read · Write · ReadWrite / CRM · MIS · Derived | — |

Option **values** are publisher-bound (option value prefix), so they cannot be numerically identical
to the `msst_` sets; migration maps by label/code, not by integer.

## H. Volumes (from the supplied Housing Loan Arrear Report, as-of 30/06/2026)

4,357 delinquent accounts · 3,777 distinct customers · 3,905 bucket-customer counts (a customer may
appear in more than one bucket) · 724 deceased-flagged rows. HL is 80–90 % of the book ⇒ ~5,000
accounts platform-wide. Small data; nothing here needs elastic tables or cloud-only storage.

## I. Implementation status on the sandbox — measured 2026-09-18 (end of Phase 3)

Everything below was read back from `org5869857f`, not asserted from intent. `verify-qdb-schema.mjs`
reports 19/19 and **244/244 canonical columns**.

| Entity | Provisioned | Read/written by code | Notes |
|---|---|---|---|
| `qdb_collectioncase` | ✅ | ✅ Phase 2 + Phase 3 | `IsValidForQueue = true`; `qdb_casenumber_uk` alternate key proved live to refuse a duplicate |
| `qdb_collectionactivity` | ✅ | ✅ Phase 2 | Custom activity; immutable once completed (KI-40 class of defect fixed on both registrations) |
| `qdb_delinquencysnapshot` | ✅ | ✅ Phase 2 + Phase 3 | **+ `qdb_facilitysourcesystem` String(50) added in Phase 3 (KI-47)** — the only schema change in the phase |
| `qdb_identityexception` | ✅ | ✅ Phase 2 | |
| `qdb_collectionactivitytype` | ✅ | ✅ Phase 2 + Phase 3 | Activity types resolved to codes by `StrategyRepository`; never a GUID in source |
| `qdb_activityoutcome` | ✅ | — | Provisioned; consumed from Phase 4 |
| `qdb_collectionstrategy` | ✅ | ✅ Phase 3 | Criteria are **data the ruleset reads**, not a matcher DCP evaluates (KI-51, ADR-DCP-13) |
| `qdb_strategyaction` | ✅ | ✅ Phase 3 | Ordered by `qdb_sequence`; inactive actions omitted; channel read as a label from the provisioned choice |
| `qdb_assignmentconfiguration` | ✅ | ✅ Phase 3 | Configuration resolved; **routing deliberately not implemented** (ADR-DCP-14, KI-09) |
| `qdb_platformconfiguration` | ✅ | ✅ Phase 2 + Phase 3 | Carries the three ruleset pointers and `qdb_featureflags`; assembled by `CollectionConfigurationService` |
| `qdb_platformmapping` | ✅ | ✅ Phase 2 | Normalised child rows; no repurposing of unrelated QDB mapping tables |
| `qdb_communicationtemplate` | ✅ | — | Provisioned; Communications is architecture-only until a later phase |
| `qdb_crmlogs` **(existing)** | reused, **unextended** | ✅ | 12 `qdb_` columns, verified unchanged. Every Rule Engine and configuration refusal is written here |

**No entity was created, altered or removed in Phase 3** beyond the single approved KI-47 column. In
particular: no `qdb_collectioneligibility` (forbidden), no `qdb_communication` or per-channel
communication entity (forbidden), no second auto-number table, no second technical log.
