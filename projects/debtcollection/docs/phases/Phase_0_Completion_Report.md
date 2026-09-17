# Phase 0 — Completion Report: Architecture Reconciliation & Refactoring Assessment

**Project:** QDB Debt Collection Platform (DCP-001) · **Phase:** 0 · **Date:** 2026-09-17 ·
**Status:** **Ready for Review — STOPPED at the Phase 0 gate (Master Prompt §89, Correction Prompt §48).**
**Nothing in Phase 1 has started. No schema, org data, plugin registration or application code was
changed.** The only non-document artefact produced is `DebtCollection_Project_Tracker.xlsx`.

Governing inputs: Master Prompt (`QDB DEBT COLLECTION PLATFORM COMPLETE REQUIREMENTS.docx`, 105 §) ·
Correction Prompt (`ClaudeCorrectionPrompt.docx`, 48 §) · supplied `HousingLoanArrearReport.xlsx` and
`HousingLoanArrearReportDetailed.xlsx` (as-of 30/06/2026) · the architecture deck (2 image slides).

---

## 1. Phase objective

Inspect the complete existing repository, reconcile it against the approved target architecture, decide
KEEP / REFACTOR / CREATE / REMOVE for every component, design the target `qdb_` model, the dual-platform
architecture and the MIS integration, capture the test baseline, populate the tracker — and stop.

## 2. Planned scope vs completed scope (Master Prompt §86, Correction Prompt §44)

| Deliverable | File | Status |
|---|---|---|
| Current implementation / solution / entity / field / relationship / choice / alt-key / plugin / registration / script / API / auth / UI / test / role / field-security / queue / documentation / ADR / integration inventories | `docs/CurrentStateAssessment.md`, `docs/SchemaMigration_msst_to_qdb.md` | Complete |
| Existing functionality vs approved architecture matrix; Keep/Refactor/Create/Remove matrix | `docs/CurrentStateAssessment.md` §1–5 | Complete |
| msst_ → qdb_ migration matrix (every entity, field, choice, relationship, key, plugin, role, queue, profile, script, API/UI/test reference; method, dependencies, data, validation, rollback, retirement) | `docs/SchemaMigration_msst_to_qdb.md` | Complete |
| Correction Prompt §6 field-by-field classification of `msst_dcpcustomer` | `docs/SchemaMigration_msst_to_qdb.md` §3 | Complete |
| Target ERD | `docs/ERD.md` | Complete |
| Target Entity Dictionary | `docs/EntityDictionary.md` | Complete |
| Target Field Dictionary (~330 fields, 17 attributes each) | `docs/FieldDictionary*.md` (5 files) | Complete |
| Platform Configuration + Platform Mapping design | `docs/ConfigurationGuide.md` | Complete |
| On-prem / cloud / shared-code portability assessment | `docs/CloudMigrationReadiness.md` | Complete |
| Fastify/API responsibility assessment | `docs/CurrentStateAssessment.md` §5, `docs/APIContracts.md`, ADR-DCP-09 | Complete |
| Communication architecture reconciliation | `docs/CommunicationArchitecture.md`, ADR-DCP-08 | Complete |
| Customer/facility duplication, audit, consent, plugin, security, queue-defect reconciliations | `CurrentStateAssessment.md`, `SecurityModel.md`, `KnownIssues.md` | Complete |
| MIS integration design — live + background, canonical contract, mock scenarios, API capability proposal, TBDs | `docs/MISIntegration.md` | Complete |
| Engine reuse assessment (Form, Process, Rule, Report, Smart Assignment) | `docs/EngineReuseAssessment.md` | Complete |
| Existing QDB schema on the sandbox — BFD facility masters, legacy DA module, reuse/collision decisions | `docs/ExistingQdbSchemaAssessment.md` | Complete (late finding) |
| Housing Loan arrear data analysis — concentration, 1-30 churn, DPD as-of offset, QID identity, deceased population, derived columns, 18-month trend, data quality; specific MIS questions | `docs/HousingLoanDataAnalysis.md` | Complete |
| **`qdb_crmlogs` reuse assessment** — current purpose, 9 existing columns + activity base, 19-capability DCP mapping, gaps, proposed extensions, audit boundary, activity-entity cautions, PII/retention, platform compatibility (gate correction 1) | `docs/QdbCrmLogsReuseAssessment.md` | Complete |
| Target architecture (incl. CP §47 dual-path MIS diagram), overview, React, deployment, testing strategy, test cases, risk register, dependency register, known issues, change log | `docs/TargetArchitecture.md`, `Architecture.md`, `ReactArchitecture.md`, `DeploymentGuide.md`, `TestingStrategy.md`, `TestCases.md`, `RiskRegister.md`, `DependencyRegister.md`, `KnownIssues.md`, `ChangeLog.md` | Complete |
| ADR review — existing marked amended/superseded/confirmed; new ADR-DCP-07..10 | `adrs/` | Complete (see §5) |
| Project Tracker (§72–73 columns + §43 dual-platform columns; requirements, components, MIS traceability, TBD, phases, baseline) | `DebtCollection_Project_Tracker.xlsx` | Complete |
| Test baseline | `docs/TestingStrategy.md` §1, tracker *Test Baseline* | Complete |
| Phase 0 demo / architecture review package | `docs/phases/Phase_0_Demo.md` | Complete |

**Incomplete / deferred:** nothing in the Phase 0 scope. Items that cannot be closed without QDB input
are carried as `TBD — Requires QDB Confirmation` (§8).

## 3. Components — reused, refactored, removed, created

| Category | Items |
|---|---|
| **Reused as-is (KEEP)** | status-transition matrix and 17-state case lifecycle · `DefaultStatusAssigner` · `IAuthAdapter` + `AdfsAdapter` / `AzureAdAdapter` · `DataverseClient`, `buildODataUrl`, `retry`, `CrmApiError`, `Result`, `DomainError` · correlation-id plugin · 3 queues · portfolio analysis · 22-screen prototype as reference material |
| **Existing QDB entities reused (no new entity)** | **`qdb_crmlogs`** (technical/integration log — QDB-confirmed; see `QdbCrmLogsReuseAssessment.md`) · `contact` / `account` (customer masters) · existing HL/BFD facility masters · `fax` / `email` (communications) · `queue`, `team`, `systemuser`, `businessunit` · candidates under assessment: `qdb_emailtemplate`, `qdb_exclude_customer`, existing mapping/configuration entities |
| **Existing entities proposed for extension (approval required; nothing changed in Phase 0)** | `qdb_crmlogs` (9 columns/options in `QdbCrmLogsReuseAssessment.md` §2.1) · `contact` / `account` (`qdb_stopcontact`, deceased set, vulnerability, special handling, collection language) |
| **Refactor (Phase 1–2)** | `qdb_collectioncase`, `qdb_collectionactivity`, `qdb_delinquencysnapshot`, `qdb_identityexception` (from their `msst_` equivalents) · `StatusTransitionValidator`, `ImmutabilityGuard`, `ActivitySubjectComposer`, `StopContactQueueMover` (retarget) · 12 roles + field-security profile · 13 option sets · provisioning/registration/smoke tooling (add auth adapter, `DV_API_VERSION`) · Fastify service (responsibilities per ADR-DCP-09) |
| **Remove / retire (Phase 2, after validation)** | `msst_dcpcustomer`, `msst_dcploanfacility`, `msst_dcpcommunication`, `msst_dcpptprecord` (consolidated), `msst_dcpauditlog` (replaced), `msst_dcpstrategyconfig` (split) · `AuditLogWriter` (replaced by native audit) · `GET /customers/:qid`, `GET /identity-exceptions` · adopted `nodemailer`, `ISmsGateway`; `puppeteer` deferred to Report Engine; Next.js |
| **Create (Phase 1+)** | `qdb` publisher/solution · `qdb_platformconfiguration`, `qdb_platformmapping` · `qdb_collectionactivitytype`, `qdb_activityoutcome` · `qdb_collectionstrategy`, `qdb_strategyaction`, `qdb_assignmentconfiguration`, `qdb_communicationtemplate` · contact/account `qdb_` collection flags · `ICrmAdapter`, engine facades, Communication Service, `IMisDelinquencyService` + Mock/API providers, live proxy, background sync · React workspace as full-page web resource · CI/CD for two packages |

**Entities / fields / plugins / APIs / UI / configuration delivered in Phase 0: none** — by design.

## 4. Key decisions taken in Phase 0 (all reversible, all awaiting your approval)

1. Single `qdb_customerid` **Customer** lookup (contact + account) — technically verified on both
   platforms; two-lookup proposal withdrawn.
2. Facility: the **canonical Collection contract does not depend on the physical lookup target** — it
   carries `facilityNumber`, `sourceSystem` and resolved Facility domain information. Where an
   organisation-specific physical lookup is deployed it is an **optional deployment extension / adaptor
   relationship**, not a portable assumption; two differently-targeted lookups are not the same physical
   schema. React, Rule Engine, Collection Services and MIS processing never branch on physical HL/BFD
   facility entity names. HL facility entity `TBD`; **BFD target = likely `qdb_account`, `TBD`**.
3. PTP consolidated into `qdb_collectionactivity` (type = PTP); Kept/Broken logic survives as a rule.
4. Business audit via native Dynamics audit; technical/integration logging **reuses the existing `qdb_crmlogs`** (no new DCP log entity).
5. Fastify = live MIS proxy · background sync · cross-org 360 · system comms · monitoring only.
6. MIS: live path never writes CRM in bulk; snapshots only from background sync or a controlled rule.
   **Snapshot idempotency is a logical requirement, not a frozen formula** — stable Facility/Account
   identity plus authoritative MIS observation/source identity; the physical composition is
   `TBD — Requires QDB/MIS Confirmation` while DPD as-of semantics are unconfirmed, and replay idempotency
   must hold whatever the final composition. `qdb_snapshotpolicy` has **no production default** on Phase 0
   evidence — `TBD` / performance-volume validation, with all three options compared in Mock MIS tests.
7. Custom API (cloud) ⇄ Process Action (on-prem) with identical plugin code for every DCP operation —
   the same pattern EDP and the Form Engine already document.
8. On-prem and cloud are equal targets; cloud-only runtime testing is an access constraint.
9. **Late Phase 0 finding (`docs/ExistingQdbSchemaAssessment.md`):** the sandbox carries a bulk-imported
   copy of the **BFD CRM schema** (909 `qdb_` entities). It evidences the BFD facility masters
   (`qdb_facility`, `qdb_account` "Loan Account"), a **legacy DA collections module** (`qdb_da_case`,
   DA Task, site visit, thresholds, reasons), `qdb_npl`, `qdb_customer_mis`, a legal module,
   `qdb_emailtemplate`, `qdb_privsendsms`, `qdb_integrationlogs` and **`qdb_crmlogs`**. Decision taken (QDB-confirmed at the gate): **reuse `qdb_crmlogs`** for technical/integration logging — both `qdb_integrationlog` (new) and `qdb_integrationlogs` (reuse) are withdrawn; `qdb_collectioncase` proposed as the DA
   module's successor (frozen, not deleted — raised for review under MP §103); all thirteen target names
   confirmed free. The HL schema is not on this org.
10. **From the Housing Loan data (`docs/HousingLoanDataAnalysis.md`), as ratified by the F1–F11 review:**
    QID ↔ Customer Number is strictly 1:1 (HL identity candidate); the account is the unit of delinquency
    (546 customers hold 2–4 accounts, 30.7 % of arrears) — one case per facility confirmed; 769 accounts
    (17.6 %) owe less than one instalment → a **configurable** eligibility/grace evaluation before any case
    or contact; DPD is stamped 16 days after the balance date → `dpdAsOfDate` added provisionally; *Arrear %*
    and *Last Arrear Amount* are derived columns keeping their source mappings; 724 deceased accounts (24.4 %
    of arrears, three exemption states) → deceased indicators must be able to trigger a **server-side Contact
    Hold**, whose policy is TBD; the >2000 tail (58.7 % of arrears, 9.1 years, flat for 18 months) is a
    **data-supported recommendation** for differentiated treatment, not an encoded boundary.

11. **F1–F11 review decisions (user, 2026-09-17) — now binding architecture.** Differentiated strategy
    segmentation is required but its **boundaries are configuration**, not code; a MIS delinquency record is
    **not** a Collection Case, so a configurable **Collection Eligibility / Grace evaluation** (ADR-DCP-11)
    sits between resolution and case creation, reusing the Rule Engine with six outcomes and no new entity;
    identity is QID-primary with Customer-Number cross-check and exception routing, never mobile; dashboards
    must distinguish Distinct Customers / Delinquent Accounts / Customer-Bucket Count; contact hold is a
    server-side Rule Engine evaluation identical for manual and automated sends; Account Status codes stay
    opaque; raw MIS facts stay distinguishable from derived values; **exposure is retained** as an optional
    criterion; MIS financial KPIs and CRM operational KPIs remain architecturally distinct; the MIS adapter
    normalises all source-specific representation. **Cross-platform principle:** HL evidence may set HL
    defaults and test scenarios but must never constrain BFD.

## 5. ADRs (Master Prompt §84)

ADR-DCP-01 amended · 02 superseded by 07 + 09 · 03 superseded in part by 07 · 04 confirmed + extended by
10 · 05 confirmed · 06 superseded · **new** 07 full-page CRM web resource · 08 communication via
fax/email · 09 integration-service responsibilities · 10 dual-platform single codebase. All preserved.

## 6. Tests — Phase 0 baseline (Master Prompt §87)

| Suite | Result |
|---|---|
| C# xUnit (`Msst.DebtCollection.Plugins.Tests`) | **92 passed**, 0 failed, 0 skipped |
| TS vitest — `@dcp/api` / `@dcp/auth-adapters` / `@dcp/dataverse-client` | **19 / 14 / 12 passed**, 0 failed |
| Live smoke — cloud org5869857f | **14 / 15** — queue move fails (`IsValidForQueue=false`, KI-01) |
| Live smoke — on-prem 9.1 | never run (tooling cannot authenticate on-prem, KI-03) |

Functional / technical / security / regression / performance tests for **new** scope: not applicable
in Phase 0 (no build). Tests coupled to `msst_` names will be fixed, not deleted (MP §81).

## 7. Platform status (Correction Prompt §43)

Every existing component: **Cloud Runtime Tested · On-Prem Compatible by Design — Runtime Test Pending**,
except the two **violations** to fix in Phase 1 — hard-coded Web API `9.2` (KI-02) and Entra-only tooling
auth (KI-03) — and the absent solution packaging. Plugins pass the §57 scan. Full register:
`docs/CloudMigrationReadiness.md`.

**Remaining dual-platform blockers:** (B1) no on-prem 9.1 organisation has ever hosted DCP; (B2)
`AdfsAdapter` unproven against real AD FS (COND-008); (B3) Custom API availability on QDB on-prem
unknown — design is pattern-independent; (B4) facility entity names unknown (lookup packaging); (B5)
browser-to-service auth mechanism on-prem unknown; (B6) engine on-prem runtime validation (EDP, DFE,
CWFD, Report Engine) pending.

## 8. `TBD — Requires QDB Confirmation` (consolidated)

On-prem org for DCP · **HL** facility entity + business-id field (BFD now has evidenced candidates:
`qdb_account` / `qdb_facility` — which the MIS Account Number resolves to) · Fax → SMS/WhatsApp trigger
mechanism (`qdb_privsendsms` exists; mechanism unknown) · Smart Assignment existence/contract · existing
consent capability · Custom API on on-prem 9.1 · existing `qdb_` **contact** fields overlapping the proposed
flags (none exist on `account`) · `qdb_emailtemplate` / EmailEditor as template engine · on-prem browser auth
mechanism · strong-name key rotation · **whether the BFD legacy DA module is live and holds data** · whether
`qdb_npl` is the NPL/legal hand-off and which legal entity receives Legal Recommendations · whether
`qdb_crmlogs` may be extended with the columns it lacks · **MIS**: endpoints,
authentication, refresh frequency, live/on-demand support, aggregate endpoint, paging/filtering/sorting,
facility query, incremental "changed since", push/events, source/as-of timestamps, timeout/SLA, rate
limits, page/batch size, BFD field contract and identifiers, error/retry contract, cured-record behaviour,
Account Status 7/8 meaning, Exemption Amount sign. (Tracker sheet *TBD — QDB Confirmation*.)

## 9. Supported by supplied data vs proposed for the MIS API (Correction Prompt §48)

**Supported by the Housing Loan Arrear data** (analysed in `docs/HousingLoanDataAnalysis.md`, which also
replaces the generic MIS questions with eight specific ones): the 23-field detail contract; the 10-bucket taxonomy;
aggregate breakdown with four segments (Deceased & Applied / Need to Apply / Exemption 20 % / No
Exemption); monthly balance/collection trend Jan-25 → Jun-26; deceased list; as-of convention; volumes
(4,357 accounts, 3,777 customers, 3,905 bucket-customer counts). **Proposed:** the capability set
(`GetArrearBreakdown`, `GetArrearDetails`, `GetFacilityArrearPosition`, `GetCustomerArrearPositions`,
`GetArrearChanges`, `GetArrearTrend`, `GetDeceasedList`), canonical names, idempotency key, episode rules,
fallback behaviour, the 37 mock scenarios. **Not evidenced:** everything in §8 under *MIS*.

## 10. Proposed Phase 1 changes (for approval — none executed)

1. Create `qdb` publisher and `qdb_debtcollection` solution beside `msst_debtcollection`.
2. Provision the `qdb_` schema per the dictionaries (additive; nothing deleted).
3. Rename the plugin namespace/assembly to `Qdb.DebtCollection.Plugins` and register it beside the old
   assembly; retarget steps; decide `key.snk` (reuse or rotate).
4. Move Web API version to `DV_API_VERSION` / runtime context; add the tooling auth adapter (Entra |
   AD FS/PRT); produce the two deployment packages; CI.
5. Implement `qdb_platformconfiguration` / `qdb_platformmapping`, `ICrmAdapter`, engine facades.
6. Set `IsValidForQueue = true` on `qdb_collectioncase` at creation; add the queue smoke assertion.
7. Establish rollback (solution export before any retirement) and the regression suite.

**Destructive actions Phase 1 would eventually require (listed, not executed):** deleting the six retired
`msst_` entities and their 13 option sets after validation; unregistering the 30 `msst`-bound plugin steps
and the old assembly; deleting the 12 `Msst DCP` roles and the field-security profile; disabling the
ImmutabilityGuard steps to purge SMOKE/DIAG rows on the shared sandbox (a compliance-control change —
separate explicit approval).

## 10a. Contradictions found (tracker sheet *Contradictions*)

| ID | Contradiction | Resolution | Status |
|---|---|---|---|
| C-01 | **BRD FR-034** forbids exposure segmentation absolutely; the F9 decision retains exposure as an optional criterion | **BRD amendment required** — re-cast FR-034 as an HL configuration default | **Open — for QDB** |
| C-02 | **BRD FR-026 / FR-132** hard-code ">2000 DPD"; the F1 decision forbids encoded boundaries | acceptable as a default *view*; the requirements must read as configuration | **Open — for QDB** |
| C-03 | Phase 0 first issue asserted "stop-contact defaults from QCB DEAD" | demoted to *capability*; policy is TBD | Resolved in Phase 0 |
| C-04 | Phase 0 first issue said exposure "stays unused" and cited FR-034 as confirmation | corrected across the dictionaries and the analysis | Resolved in Phase 0 |
| C-05 | Phase 0 first issue called the >2000 tail "not a dunning target" as a conclusion | demoted to a recommendation for QDB confirmation | Resolved in Phase 0 |
| C-06 | Assessment prescribed a **new** `qdb_integrationlog`, then reuse of `qdb_integrationlogs` | **both withdrawn — QDB confirmed reuse of existing `qdb_crmlogs`** | Resolved by QDB decision |
| C-06b | (historical) reuse of `qdb_integrationlogs` | Resolved in Phase 0 |
| C-07 | `qdb_noautomatedcontact` description referenced ">2000 DPD" | reframed as an illustration of the mechanism | Resolved in Phase 0 |
| C-08 | **Master Prompt §41** lists Exposure From/To while **BRD FR-034** forbids exposure — a pre-existing conflict between the two governing documents | resolved in favour of MP §41 + F9: criterion retained, configured off for HL | Resolved in Phase 0 |
| C-09 | **BRD FR-095 / FR-096** assume the deceased flag and stop-contact are set *manually* by an officer; F6 requires a rule-driven, server-side Contact Hold that a confirmed (incl. MIS/QCB-sourced) indicator can trigger | FR-095/096 stay valid for the manual path; a rule-driven hold requirement must be added (Phase 1 BRD delta) | **Open — for QDB** |
| C-10 | **BRD Q-09** (>2000 DPD treatment) was treated in the Phase 0 first issue as answered by the portfolio analysis | F1 re-opens it and forbids encoding the threshold | **Open — for QDB** |

## 11. Defects, limitations, technical debt, risks

Defects: KI-01 queue move; KI-02 API version; KI-03 tooling auth. Limitations and debt: 22 entries in
`docs/KnownIssues.md` (incl. tests coupled to `msst_`, option-value remapping, `key.snk` on disk only,
untracked project folder on the checked-out branch, undeletable smoke data). Risks: 24 entries in
`docs/RiskRegister.md`.

## 12. Demo

Script and expected results: `docs/phases/Phase_0_Demo.md`. It walks the review package, replays the
test baseline from the consolidated directory, shows the cloud smoke result including the queue failure,
opens the tracker, and profiles the supplied MIS data (including the Excel `1-30` → date artefact).

## 13. Tracker status

`DebtCollection_Project_Tracker.xlsx` — sheets *Legend · Phases · Tracker (48 columns, 95 rows) ·
Requirements (156) · MIS Traceability (21) · TBD — QDB Confirmation (12) · Test Baseline (6)*. Phase 0 =
Ready for Review; Phases 1–11 = Not Started. No mock screen is marked implemented.

## 14. Recommendation

Approve Phase 0 and release Phase 1 **after** the four answers that shape its first week: (1) the
on-prem organisation DCP may use, (2) the HL facility entity name and confirmation of the BFD candidate
(`qdb_account`), (3) whether Custom API exists on QDB's on-prem build, (4) whether the BFD legacy DA module
is live — which decides whether Phase 2 includes a DA → DCP migration. Everything else in §8 can be
answered while Phase 1 runs, and Mock MIS development is not blocked by any of it.
