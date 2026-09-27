# DCP — Existing QDB Schema on the Sandbox (Phase 0 addendum)

**Status:** Phase 0 finding · 2026-09-17 · read-only metadata inspection of `org5869857f` · nothing changed.
Master Prompt §102 ("reuse existing QDB/system entities before creating custom entities") and §103 ("do not
invent existing QDB entity names") make this assessment mandatory once the evidence exists.

## 1. What the sandbox actually is

`org5869857f` is not an empty sandbox. Solution `QDBAllEntites` (unmanaged, installed **2025-09-21**) and
later `QDBEntities`, `MasterEntities`, `LoanApplicationEntityCloudMigration`, `CloudFieldMigration1` bulk-
imported a QDB organisation's schema for the cloud-migration programme. The org holds **909 `qdb_`
entities** and 132 visible solutions (QDB engines: `BusinessRuleEngine`, `FormEngine`, `qdb_reportengine`,
`BusinessProcessManagement`, `QdbPortalShell`, `MssCmsEngine`; plus `msst_debtcollection`).

The imported schema is the **BFD CRM's** (SME / corporate): the customer is `account` everywhere
(`qdb_account.customer → account`, `qdb_da_case.customer → account`, 577 `qdb_` columns on `account` vs
43 on `contact`); Al Dhameen, ALD, exporter and Numu programme entities dominate. **The HL (Housing Loan)
schema is not on this org.** Row counts are ~0 for almost every entity (schema copied, data not) except
`qdb_facility` (8) and `qdb_collection_reason` (7).

Consequences: several `TBD — Requires QDB Confirmation` items now have **evidence-based candidates** for
BFD; nothing changes for HL; and DCP must position itself against an existing BFD collections module.

## 2. Entities that matter to DCP — and the decision each drives

| Existing entity (BFD) | What it is (attributes seen) | Rows | DCP decision |
|---|---|---|---|
| `qdb_facility` "Facility" | 110 attrs: `facility_number`, `customer → account`, `arrear_amount`, `arrear_days`, `facility_os_balance`, `facilitystatus`, `expiry_date`, `credit_officer`, limits | 8 | **BFD facility master — candidate** for Platform Mapping `Facility` object (limit level) |
| `qdb_account` "Loan Account" | 63 attrs: `account_no`, `customer → account`, `facility_no → qdb_facility`, `arrear_amount`, `no_of_arrear_days`, `collectibility`, `dpdnplref → qdb_npl`, `nextinstallmentamount/date`, `maturity_date`, `loan_tenor`, rescheduling counters | 0 | **BFD loan-account master — candidate for the case's facility link**: matches the MIS *Account Number* unit (one loan account = one delinquency) |
| `qdb_customerloanaccount`, `qdb_customerallloanaccount` | `loanaccount → qdb_account`, `facility → qdb_facility`, `dayspastdue`, `pastdues` | 0 | Read-only inputs for Customer 360; not a target |
| `account` columns | `qdb_noofdaysindelinquency` "Days in Arrear", `qdb_past_dues_amount` "Arrear Amount", `qdb_customerfacilityfreezestatus`, `qdb_special_instructions`, `qdb_crnumber`, `qdb_mobile_number`, `qdb_nationality`, `qdb_risklevel` (KYC), `qdb_riskscore`. **No** stop-contact, deceased, vulnerability or language column. | — | Reuse `qdb_crnumber`, `qdb_mobile_number`, `qdb_nationality`, `qdb_special_instructions` via mapping; **add** `qdb_stopcontact`, deceased set, vulnerability, collection language (CP §7) |
| `qdb_da_case` "DA Case" | 30 attrs: `customer → account`, `arrears_amount`, `days_in_arrears`, `loan_outstanding`, `case_category → qdb_da_case_category`, `customer_promised_to_pay_in_days`, `next_da_case_followup_date`, `reminder_date`, `close_case_status`, `relationship_manager` | 0 | **Existing delinquent-accounts case.** `qdb_collectioncase` is a **proposed successor — pending QDB confirmation and a coexistence/migration assessment** (§3). No retirement decision taken. |
| `qdb_da_configuration` | `arrears_amount`, `days_in_arrears`, `reoccurrence_after_last_creation` | 0 | Existing case-creation threshold. `qdb_collectionstrategy` + the eligibility ruleset are the **proposed** replacement — pending QDB confirmation (§3). |
| `qdb_collections_task` "DA Task" (activity) | `da_case_ref`, `da_task_type`, `instructions`, `assign_to`, `commentsfrom → qdb_collections_staff`, `relationship_manager` | 0 | Existing activity. `qdb_collectionactivity` is the **proposed** replacement — pending QDB confirmation (§3). |
| `qdb_collections_site_visit` (activity), `qdb_collections_staff`, `qdb_collection_reason` (7 rows), `qdb_da_task_actions`, `qdb_da_case_category` | field visit, staff list, reasons, task actions, categories | 0–7 | Part of the existing DA module. The 7 `qdb_collection_reason` rows are **candidate** seed vocabulary for `qdb_activityoutcome`. **No retirement, freezing or migration decision is taken** — see §3. |
| `qdb_npl` "NPL" | 107 attrs incl. `collectionsofficer`, `collectionsrecommendation`, `dpd1taskcreated`, `dpd2taskcreated`, `dpdwarningletterguid`, `courtdecisionguid`, `facilityref → qdb_facility`, `installmentamount` | 0 | Hard-collections / NPL workflow record. Coexists: DCP hands off to it at the Under Legal Action / NPL boundary — `TBD — Requires QDB Confirmation` whether it is in use |
| `qdb_customer_mis` "Customer MIS" | 29 attrs: `cif_number → account`, `fac_number → qdb_facility`, `days_past_due`, `total_arrears`, `principal_arrears`, `interest_arrears`, `loan_outstanding`, `mis_date`, `mis_registerid → qdb_mis_rs`, `partner_bank` | 0 | An existing MIS-position record (ALD partner-bank context). **Design input** for `qdb_delinquencysnapshot`; not reused as-is (partner-bank specific, not append-only) |
| `qdb_customer_account_behavior`, `qdb_customer_restructure_history`, `qdb_customerfollowup`, `qdb_followup_actions`, `qdb_followup_action_master` | annual arrears behaviour, restructure history, RM follow-ups | 0 | Read-only inputs for Customer 360 / restructuring history |
| `qdb_legaltask` (activity, 56 attrs), `qdb_qdblegal` "Litigation Request", `qdb_qdblegalcaseprogress`, `qdb_legalligitation`, `qdb_legaldocumentreview`, `qdb_legaladvice` | an existing legal module | 0 | **Confirms ADR-DCP-03's surviving rule**: legal lifecycle stays in native CRM; DCP's Legal Recommendation activity hands off here — mapping `TBD` |
| `qdb_communication` (activity) | `message`, `partnerbank → qdb_partnerbank`, generic regarding | 0 | Partner-bank correspondence log — **not** the SMS/WhatsApp mechanism. Name is taken; DCP creates no communication entity (MP §32) |
| `qdb_privsendsms` "Priv Send SMS" | privilege-carrier entity | 0 | Evidence that SMS sending is privilege-gated in QDB; the actual send mechanism remains `TBD — Requires QDB Confirmation` |
| `qdb_emailtemplate` | `name`, `subject`, `template`, `recordentity` | 0 | **Reuse candidate** for email templates (MP §39); SMS/WhatsApp/AR templates would still need `qdb_communicationtemplate` — decision deferred to Phase 7 |
| `qdb_document_template`, `qdb_legaltexttemplate`, `qdb_lodgment_template` | document/letter templates | 0 | Reuse for official letters (MP §49) — `TBD` |
| `qdb_crmlogs` "CRM Logs" **(the QDB-confirmed DCP technical log)** | custom **activity**: `qdb_source`, `qdb_destination`, `qdb_type` (CutomWorkflow/Plugin/Console), `qdb_request`, `qdb_response`, `qdb_exception`, `qdb_isexception`, `qdb_depth`, `qdb_saveditem`→queueitem, plus activity base (subject, description, regarding, state/status, actualstart/end, duration) | **1,295** | **REUSE — the QDB-confirmed DCP technical/integration log.** Both `qdb_integrationlog` (new) and `qdb_integrationlogs` (reuse) are **withdrawn**. Gaps needing a *proposed* extension (approval required; nothing changed in Phase 0): correlation id, batch/run id, operation code, severity, error code, attempt number, ms duration, source reference, a `qdb_type` option. Full mapping, activity-entity cautions and PII/retention analysis: **`QdbCrmLogsReuseAssessment.md`** |
| `qdb_attributesmapping`, `qdb_attributemappingconfiguration`, `qdb_parentattributemapping` | Process-Engine work-item field mapping (`qdb_work_item_*`, `crmi_autonumber_*`) | 0 | First inspection suggests a different purpose, but this is **not** a closed decision — see §3A. `qdb_platformmapping` remains *proposed*, subject to the mandatory reuse assessment. |
| `qdb_form_submission_mapping`, `qdb_reportentitymapping`, `qdb_taskapprovalappfieldmapping`, `qdb_autonumberconfig` | other existing mapping/configuration infrastructure | 0 | In scope for the §3A reuse assessment before any new generic configuration entity is created |
| `qdb_team_queue`, `qdb_queueitemconfiguration`, `qdb_exclude_customer` | queue/exclusion helpers | 0 | Consider in Phase 3 (assignment); `qdb_exclude_customer` is a reuse candidate for the `ExcludedSpecialHandling` eligibility outcome — `TBD` |

Exact-name check: all thirteen proposed target names (`qdb_collectioncase … qdb_consent`) are **free**; the
only collisions are `qdb_communication` (not created by DCP) and `qdb_integrationlog(s)` (both withdrawn — QDB confirmed reuse of `qdb_crmlogs`; resolved by reuse).

## 3. Positioning DCP against the legacy DA module

**Phase 0 position: `qdb_collectioncase` is a PROPOSED SUCCESSOR — pending QDB confirmation and a
coexistence/migration assessment.** Phase 0 recommends it as the *target strategic model*; it **cannot and
does not declare the existing DA module superseded operationally**.

### 3.1 Evidence (sandbox, read-only — facts only)

The DA module (`qdb_da_case` + `qdb_collections_task` + `qdb_collections_site_visit` +
`qdb_da_configuration` + `qdb_collection_reason` + `qdb_collections_staff` + `qdb_da_task_actions` +
`qdb_da_case_category`) exists in the imported BFD schema. Its shape is a first-generation collections
implementation: threshold-driven case creation (`qdb_da_configuration`: `arrears_amount`,
`days_in_arrears`, `reoccurrence_after_last_creation`), a promise-to-pay expressed in days
(`customer_promised_to_pay_in_days`), follow-up and reminder dates, RM assignment. **On this sandbox every
DA entity holds 0 rows except `qdb_collection_reason`, which holds 7.** The sandbox is a schema copy, so
row counts here say nothing about production use at BFD.

### 3.2 Recommendation (not a decision)

1. **Recommended target strategic model:** `qdb_collectioncase` + `qdb_collectionactivity` +
   `qdb_collectionstrategy` + the eligibility ruleset, which functionally cover the DA module's scope and
   add strategy/actions, outcomes, MIS snapshots, unified timeline, dual-org and dual-platform support.
2. **No retirement, freezing, migration, replacement or disabling of DA processes is approved**, and none
   may be actioned in Phase 1. DA entities are **not to be extended** by DCP either, pending the answers below.
3. The 7 `qdb_collection_reason` rows are **candidate** seed vocabulary for `qdb_activityoutcome` —
   useful evidence of the real business vocabulary, not an approved migration.
4. A **DA → DCP coexistence/migration assessment** is scheduled once QDB has answered §3.3. Depending on
   those answers the outcome may be coexistence, phased migration, or no change at all.

### 3.3 Questions QDB must answer before any DA decision

1. Is the DA module **currently live**?
2. Does it contain **production data**?
3. **Which teams** use it?
4. What **integrations, processes or plugins** depend on it?
5. Is **historical DA data** required (reporting, audit, regulatory)?
6. Is **coexistence required** during a transition period?

Until all six are answered, the DA module's status in every DCP artefact is
**"Existing — decision pending QDB confirmation."** This is a customer/facility-adjacent architecture
question raised for review under Master Prompt §103, not decided unilaterally.

## 3A. Mandatory reuse assessment before any new generic configuration entity

**Phase 1 pre-condition (binding).** `qdb_platformconfiguration` and `qdb_platformmapping` may remain in
the target model, but **Phase 1 must not create them until a documented reuse assessment confirms that the
existing QDB mapping/configuration infrastructure cannot satisfy — or be safely extended for — the
purpose.** Creating duplicate generic configuration infrastructure alongside QDB's own would repeat exactly
the mistake Master Prompt §102 exists to prevent.

Entities in scope for the assessment (all present on the sandbox, all 0 rows here):

| Existing entity | Apparent purpose | Assessment question |
|---|---|---|
| `qdb_attributesmapping` | source→target attribute mapping bound to `qdb_work_item_*` / `crmi_autonumber_system_entities` | Can it express canonical-field → CRM-entity/field mapping for an organisation without a work-item context? |
| `qdb_attributemappingconfiguration` | mapping configuration header with `applyrule`, `filter`, `sortingorder`, `isdefault` | Can it act as, or be extended into, the Platform Configuration header? |
| `qdb_parentattributemapping` | parent-level attribute mapping | Does it already model the hierarchy `qdb_platformmapping` needs? |
| `qdb_form_submission_mapping` | Form Engine submission mapping | Overlapping mapping concept — reusable or Form-Engine-specific? |
| `qdb_reportentitymapping` | Report Engine entity mapping | Same question |
| `qdb_taskapprovalappfieldmapping` | approval-app field mapping | Same question |
| `qdb_autonumberconfig` | auto-number configuration | Relevant to case/activity numbering rather than platform mapping — confirm |

For each, the assessment must record one of: **Reuse as-is · Reuse with extension · Cannot satisfy (with
the specific reason) · TBD — Requires QDB Confirmation**. Only a documented "cannot satisfy" for the whole
set justifies creating `qdb_platformconfiguration` / `qdb_platformmapping`. The assessment is a Phase 1
deliverable and requires QDB input on the intended ownership of these entities.

## 4. What changes in the Phase 0 documents (applied as addenda)

| Document | Change |
|---|---|
| `CurrentStateAssessment.md` | §10 TBD list revised (BFD facility candidates; new items 11–14); §12 pointer to this document |
| `EntityDictionary.md` | technical log → existing **`qdb_crmlogs`** (both `qdb_integrationlog` and `qdb_integrationlogs` withdrawn); section E facility rows carry the BFD candidates; account extension note (no existing flags) |
| `TargetArchitecture.md` §5 | BFD facility candidate named; HL still TBD |
| `ERD.md` | technical-log box now **`qdb_crmlogs`** (existing activity entity) |
| `FieldDictionary-Platform.md` | the withdrawn table is labelled historical; mapping moves to `QdbCrmLogsReuseAssessment.md` (`qdb_integrationlogs` |
| `phases/Phase_0_Completion_Report.md`, `Phase_0_Demo.md` | new decision item, new gate questions |
| `KnownIssues.md`, `RiskRegister.md`, `ChangeLog.md` | addenda |
| `DebtCollection_Project_Tracker.xlsx` | TBD sheet regenerated with the candidates and the DA-module question |

## 5. New / revised `TBD — Requires QDB Confirmation`

- **DA module (six questions, all required before any DA decision — §3.3):** is it currently live? does it
  contain production data? which teams use it? what integrations/processes/plugins depend on it? is
  historical DA data required? is coexistence required during transition?
- **Mapping/configuration reuse (§3A):** can `qdb_attributesmapping`, `qdb_attributemappingconfiguration`,
  `qdb_parentattributemapping`, `qdb_form_submission_mapping`, `qdb_reportentitymapping`,
  `qdb_taskapprovalappfieldmapping` or `qdb_autonumberconfig` satisfy or be safely extended for Platform
  Configuration / Platform Mapping? Who owns them?
- For BFD, is the delinquency unit `qdb_account` (loan account) or `qdb_facility` — i.e. which one the
  MIS *Account Number* resolves to? (Candidate: `qdb_account.account_no`.)
- Is `qdb_npl` the hand-off record for NPL / legal action?
- Which existing legal entity receives DCP's Legal Recommendation hand-off?
- Does `qdb_emailtemplate` (and the document/legal-text templates) cover DCP's template needs?
- What does `qdb_privsendsms` gate, and what mechanism actually sends SMS/WhatsApp (fax entity? other)?
- May **`qdb_crmlogs`** be extended with the DCP columns it lacks (correlation id, batch/run id, severity, error code, retry count)? See `QdbCrmLogsReuseAssessment.md`.
- **HL** facility entity and customer columns — still unknown (HL schema is not on this org).
