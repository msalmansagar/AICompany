# DCP — Architecture Overview and Document Map (Phase 0)

**Status:** Phase 0 · 2026-09-17 · non-destructive. This is the entry document required by Master
Prompt §85. Governing inputs: `QDB DEBT COLLECTION PLATFORM COMPLETE REQUIREMENTS.docx` (Master Prompt,
105 §) and `ClaudeCorrectionPrompt.docx` (Correction Prompt, 48 §) in
`D:\QDB\Projects\Debt Collection Platform\`. The Correction Prompt wins on conflict.

---

## 1. Purpose

Give a QDB Collection Officer one modern Collection Workspace, opened from Dynamics CRM, to do daily
Collection work without knowing whether the customer is a Contact (HL) or an Account (BFD), or whether
the CRM is on-premises or cloud.

## 2. The principle everything follows

```
                 ONE PRODUCT · ONE SOURCE · ONE qdb_ SCHEMA · ONE REACT WORKSPACE · ONE BUSINESS LOGIC
                                                    │
                            ┌───────────────────────┴───────────────────────┐
                            ▼                                               ▼
                  Dynamics 365 CE 9.1 On-Premises                 Microsoft Dataverse / D365 Cloud
                            │                                               │
                    HL (Contact) · BFD (Account)                    HL (Contact) · BFD (Account)
```

Cloud is where runtime testing happens **today** because it is the environment reachable from the
development machine; that is an access constraint, not an architecture choice (Correction Prompt §1).
Both targets are equal. Platform and organisation differences live in `qdb_platformconfiguration`,
`qdb_platformmapping`, adapters and deployment packaging — never in Collection business or UI code.

## 3. Context

```
  ┌────────────┐   API    ┌──────────────────────────────┐        ┌──────────────────────────────────┐
  │  QDB MIS   │ ───────▶ │ Collection Integration Service│ ◀────▶ │  React Collection Workspace       │
  │ delinquency│ ◀─────── │ live proxy · background sync  │  user  │  full-page CRM web resource       │
  │ position   │          │ cross-org 360 · system comms  │  token │  (same file in every org/platform)│
  └────────────┘          └───────┬──────────────┬────────┘        └───────────────┬──────────────────┘
                                  │ principal     │ principal                       │ CRM session (Xrm.WebApi)
                                  ▼               ▼                                 ▼
                    ┌──────────────────┐   ┌──────────────────┐        ┌────────────────────────────┐
                    │  HL CRM          │   │  BFD CRM         │        │  qdb_ Collection schema     │
                    │  contact · HL    │   │  account · BFD   │  ◀───  │  plugins · queues · roles   │
                    │  facility entity │   │  facility entity │        │  fax / email communications │
                    └──────────────────┘   └──────────────────┘        └────────────┬───────────────┘
                                                                                    │ facades
                              ┌─────────────────────────────────────────────────────┴──────────────┐
                              │  QDB reusable engines: Form · Process · Rule · Report · Smart Assignment │
                              └────────────────────────────────────────────────────────────────────────┘
  External / related systems (per the QDB architecture deck): Core Banking / LOS (facility & loan
  details, payment updates) · Legal system (escalation, case status) · Insurance system (deceased
  verification, claims) · Credit Bureau / Government / KYC (if required). Integration contracts:
  TBD — Requires QDB Confirmation.
```

## 4. Containers

| Container | Technology | Deployed as | Platform-specific? |
|---|---|---|---|
| Collection Workspace | React + TypeScript, Fluent UI, single-file bundle | `qdb_dcp_workspace.html` web resource, sitemap entry | No — runtime context + configuration |
| Collection schema | `qdb_` entities, choices, relationships, keys | solution package | No — same logical schema; facility lookup added per org (`ERD.md`) |
| Plugins | `Qdb.DebtCollection.Plugins` (.NET Framework 4.7.1, strong-named) | assembly + steps; operations as Custom API (cloud) / Process Action (on-prem) | Registration only |
| Collection Integration Service | Node + TypeScript + Fastify, containerised | one image, two deployments | Auth adapter and API version by configuration |
| MIS providers | `MockMisDelinquencyService` / `ApiMisDelinquencyService` | inside the Integration Service | Provider by configuration |
| Engines | Form Engine · Process Engine · Rule Engine · Report Engine · Smart Assignment | existing QDB solutions | Consumed through `IFormEngine` / `IProcessEngine` / `IRuleEngine` / `IReportingService` / `IAssignmentEngine` |

## 5. Document map

| Document | Content |
|---|---|
| `CurrentStateAssessment.md` | What exists today, evidence, Keep/Refactor/Create/Remove, portability findings |
| `TargetArchitecture.md` | Principles, runtime architecture, adapter surface, MIS dual path, customer/facility abstractions |
| `ERD.md` | Target entity relationships |
| `EntityDictionary.md` | Every target entity, ownership, purpose, compatibility |
| `FieldDictionary.md` | Every target column with type, requirement, source, applicability, compatibility |
| `SchemaMigration_msst_to_qdb.md` | Component-by-component migration matrix incl. the `msst_dcpcustomer` field classification, rollback, retirement criteria |
| `ConfigurationGuide.md` | Platform Configuration and Platform Mapping design and example rows for HL/BFD × on-prem/cloud |
| `SecurityModel.md` | Three layers, role mapping, privilege matrix, field security, direct-URL protection, test matrix |
| `MISIntegration.md` | Live and background patterns, canonical contract, mock scenarios, required API capabilities, TBDs |
| `CommunicationArchitecture.md` | Communication Service, Fax/Email mapping, validation, templates, timeline |
| `APIContracts.md` | Integration Service responsibilities and interfaces (`IMisDelinquencyService`, `ICrmAdapter`, engine facades) |
| `ReactArchitecture.md` | Workspace delivery shape, startup, layering, modules, live-MIS presentation, packaging, testing |
| `DeploymentGuide.md` | Same-source build → on-prem package / cloud package; registration paths; environment configuration |
| `TestingStrategy.md` / `TestCases.md` | Functional, technical, security, regression, dual-platform testing and the Phase 0 baseline |
| `RiskRegister.md` / `DependencyRegister.md` / `KnownIssues.md` | Risks, dependencies, open defects (e.g. `IsValidForQueue`) |
| `CloudMigrationReadiness.md` | Portability register: every platform-specific component, reason, adapter, test status |
| `EngineReuseAssessment.md` | Form / Process / Rule / Report / Smart Assignment: runtime status, on-prem/cloud compatibility, remediation |
| `ChangeLog.md` | Phase-by-phase change history |
| `phases/Phase_0_Completion_Report.md` · `phases/Phase_0_Demo.md` | Phase 0 report and architecture review package |
| `../DebtCollection_Project_Tracker.xlsx` | Authoritative tracker (Master Prompt §72–75) |

### Architecture Decision Records — `../adrs/`

| ADR | Title | Phase 0 status |
|---|---|---|
| ADR-DCP-01 | Collection interactions as custom activity entities | **Amended** — activities confirmed; `msst_dcpcommunication` half superseded by ADR-DCP-08 |
| ADR-DCP-02 | Standalone Next.js portal + Fastify router | **Superseded** by ADR-DCP-07 and ADR-DCP-09 |
| ADR-DCP-03 | Portal owns submission; Legal/Insurance in native CRM | **Superseded in part** by ADR-DCP-07 (Form Engine); server-side enforcement rule retained |
| ADR-DCP-04 | Platform portability and pluggable auth adapter | **Confirmed**, extended by ADR-DCP-10 |
| ADR-DCP-05 | MIS ingest and thin immutable snapshot | **Confirmed**, refined by `MISIntegration.md` (live + background) |
| ADR-DCP-06 | PTP Kept/Broken evaluation | **Superseded** — PTP is an activity type; evaluation logic moves to Rule Engine / background sync |
| ADR-DCP-07 | Full-page CRM web resource React workspace | **New** |
| ADR-DCP-08 | Communication via existing Fax/Email + one Communication Service | **New** |
| ADR-DCP-09 | Integration Service (Fastify) responsibilities after Master Prompt §60 | **New** |
| ADR-DCP-10 | Dual-platform single-codebase architecture | **New** |
| ADR-DCP-11 | Collection Eligibility / Grace evaluation before case creation | **Accepted** at the Phase 1 gate; extended by ADR-DCP-13 |
| ADR-DCP-12 | MIS determines financial cure; DCP owns the lifecycle transition | **Accepted** (Phase 2 gate, closes KI-46) |
| ADR-DCP-13 | Rule Engine facade for eligibility, strategy and Contact Hold; fails closed | **Accepted** (Phase 3) |
| ADR-DCP-14 | Assignment configuration selects an engine; no DCP routing algorithm | **Accepted** (Phase 3) |
| ADR-DCP-15 | Case number has two sources; no invented format | **Accepted** (Phase 3) |

Superseded ADRs are kept and marked; none are deleted.

## 6. Phase plan (Master Prompt §86–100)

| Phase | Scope | Gate |
|---|---|---|
| **0** | Architecture reconciliation — inventories, matrices, target ERD/dictionaries, MIS contract proposal, tracker, test baseline, completion report | **STOP — review and approval** |
| 1 | QDB foundation refactoring — publisher/solution, controlled `qdb_` schema, namespace, provisioning, platform configuration/mapping, CRM + auth abstraction, queue fix, migration + rollback scripts, CI/CD targets | test · tracker · demo · stop |
| 2 | Core Collection data model — case, activity, type, outcome, snapshot, identity exception; contact/account + facility integration; retire duplicates after validation | " |
| 3 | Configuration & strategy foundation — strategy, actions, assignment, mappings, engines wired | " |
| 4 | MIS integration — resolution, matching, create/update, snapshot, exceptions; live + background | " |
| 5 | Real React Collection Workspace — web resource, navigation, configuration, adapters, My Work, cases, Customer 360, timeline | " |
| 6 | Collection activities & PTP lifecycle | " |
| 7 | Communication Center — SMS/WhatsApp (fax), Email, templates, validation, history | " |
| 8 | Strategy automation & assignment | " |
| 9 | Advanced processes — field visit, restructuring, legal, deceased & insurance, complaints | " |
| 10 | Reporting & oversight | " |
| 11 | Hardening & production readiness — regression, security, performance, both targets, same-source verification | production readiness report |

## 7. Phase 0 stop gate (Master Prompt §89, Correction Prompt §48)

Phase 0 produces documents, matrices, proposals and the tracker only. It does **not** delete `msst_`
components, remove data, migrate `msst_` → `qdb_`, start Phase 1, start feature development, modify live
schema, create duplicate customer/facility/communication entities, hard-code MIS assumptions, or make
automation depend on a user opening the application. On completion: tracker updated, Phase 0 Completion
Report and Architecture Review package produced, remaining `TBD — Requires QDB Confirmation` items,
proposed Phase 1 changes, dual-platform blockers, destructive Phase 1 actions and MIS assumptions listed —
then **wait for explicit approval** before Phase 1.

> **Addendum 2026-09-17:** `ExistingQdbSchemaAssessment.md` — read-only inventory of the BFD schema copy found
> on the sandbox (facility masters, legacy DA collections module, technical-logging reuse (now `qdb_crmlogs`), name-collision
> check) and the decisions it drives. Read it with `CurrentStateAssessment.md` §12.

> **Addendum 2026-09-17 (gate correction 1):** `QdbCrmLogsReuseAssessment.md` — Debt Collection technical/
> integration logging **reuses the existing `qdb_crmlogs`** activity entity (1,295 rows, already used by QDB).
> Both `qdb_integrationlog` (new entity) and `qdb_integrationlogs` (reuse) are **withdrawn**. Dynamics native
> audit remains the business field-change audit; `qdb_crmlogs` must never become business audit.
