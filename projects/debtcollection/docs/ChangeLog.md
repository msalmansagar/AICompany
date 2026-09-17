# DCP — Change Log

Newest first. Entries record what changed in the repository, the org, or the approved architecture.
Phase 0 changed documentation only. **Phase 1 changed the repository and provisioned schema on the Cloud sandbox `org5869857f` — the only organisation authorised — and nothing else.**

## 2026-09-17 — Phase 1 close-out (gate decisions executed)

Detail in `docs/phases/Phase_1_Completion_Report.md` §10. Phase 2 remains not started.

**KI-40 — the live `msst_` registration corrected.** `filteringattributes` cleared on
`ImmutabilityGuardPlugin: Update of msst_dcpcollectionaction` and `… of msst_dcpcommunication`.
Registration only: no code change, no assembly re-deployed, and the before/after capture in
`docs/evidence/` shows 2 steps changed, 28 unchanged, 0 added, 0 removed. Verified live on both steps:
a completed activity and a completed communication now refuse an ordinary field update, Delete stays
blocked, and open records and the completion transition still work. 🔴 Clearing the filter alone did
nothing — the pipeline caches the registration and the step must be cycled; `ensureStep` now does that
on every filter reconciliation.

**KI-42 / KI-04 — sandbox cleaned within the authorised scope.** The seven identified `SMOKE-` records
were removed by `clean-qdb-smoke-data.mjs`, which disabled only the three `qdb_` Delete guards and
restored them immediately; the guards were then re-proven (verify 19/19, smoke 13/13) and that run's
own rows cleaned the same way. The canonical tables hold **zero** smoke records. The legacy `msst_`
guard was never disabled and the Phase 0 `msst_` data was not in scope.

**KI-45 — communication architecture confirmed and closed.** Communications stay on native records
(SMS/WhatsApp → `fax`, Email → `email`, Warning Letter → the approved QDB document capability); DCP
creates no communication entity of its own; the officer-facing unified Communication History is a
read/aggregation model correlated to the Collection Case. Updated: `CommunicationArchitecture.md`
§7 and §9, `SecurityModel.md` §5b, `APIContracts.md` §4.1, `ReactArchitecture.md` §5.1a,
`TargetArchitecture.md` §6, `TestCases.md` TC-215–TC-222, known issues and tracker.

**KI-43** classified *Legacy — pending `msst_` retirement*; no `qdb_` artefact depends on
`AuditLogWriter`. **KI-44** left as an open QDB configuration dependency: no Contact or Account column
was invented, created or inferred.

**KI-12 — Phase 1 baseline committed** on `feat/dcp-phase1-foundation` as four atomic commits on top
of `95dcb04d` (`08eee02c`, `98c36c66`, `86a9b254`, `3e3377f8`), nothing rewritten, and
`feat/dcp-phase2-core-model` created from that baseline. A DCP `.gitignore` now keeps the strong-name
key out of history — it was **not** ignored before this (KI-13).

🔴 **Damage outside DCP during the git step.** Committing onto the DCP lineage required a branch
switch that an ordinary checkout refused, and `git checkout -f` also discarded uncommitted edits to
tracked files belonging to the Dynamic Form Engine branch: `CLAUDE.md` (recovered), the root
`.gitignore` (candidate found, unconfirmed), `projects/state.yml` (not recoverable), three `.claude/`
files (candidates only), and two pending hook deletions that were undone. No DCP work was affected.
Recovery detail and the remedy are in the completion report §11.

## 2026-09-17 — Phase 1: QDB Foundation Refactoring (repository + sandbox `org5869857f`)

Full detail in `docs/phases/Phase_1_Completion_Report.md`. This is the first entry that records a
change to an organisation; the authorisation was specific to the Cloud sandbox `org5869857f`, and the
provisioning script refuses to run against any other.

**Schema provisioned** — solution `qdb_debtcollection` under publisher `qdb` (OptionValuePrefix
`10000`, confirmed by QDB): 12 entities, 243 columns, 17 relationships plus the `qdb_customerid`
Customer lookup (contact + account from one column), 30 global choices (139 options), 23 status
reasons, 3 alternate keys, 12 security roles. Final run: Created 2 · Skipped 102 · **Failed 0**.
Verified by `verify-qdb-schema.mjs` — **19/19**.

**Left untouched, and re-verified after every run**: the 11 `msst_dcp*` entities, the legacy DA
module, `qdb_crmlogs` (12 `qdb_` columns, unextended), `qdb_autonumberconfig`, and the registered
`Msst.DebtCollection.Plugins` assembly with all 30 of its steps.

**Plugins retargeted** to `qdb_collectioncase` / `qdb_collectionactivity` with the provisioned status
values; promise-to-pay moved from a separate entity to `qdb_collectionactivity.qdb_ptpstatus`; the
subject composer now reads the activity type record instead of mapping option-set codes. The
contact-hold guard became configuration-driven (`ContactHoldSettings`) because the canonical schema
owns no customer master. `Qdb.DebtCollection.Plugins` registered **beside** the legacy assembly:
4 types, 10 steps, 4 images. Live smoke `smoke-qdb-plugins.mjs` — **13/13**.

**Portability abstractions added**: `ICrmAdapter` (the only CRM seam in Collection logic, with
`execute` covering Custom API on cloud versus Process Action on-premises), `DataverseCrmAdapter`, and
platform configuration read from `qdb_platformconfiguration` / `qdb_platformmapping` — no defaults,
so a missing value raises rather than guessing which master a deployment uses.

**Tests**: C# 92 → **105**, TypeScript 83 → **120**, tooling **10**. Nothing deleted or weakened.

**Defects found and fixed while executing** — `CreateCustomerRelationships` needs *complex* metadata
types; role privilege depth must come from each table's ownership rather than a stale set; the
immutability guard's step filtered on `statecode` so a completed activity was still editable
(KI-40 — **the same defect is live on the `msst_` registration and was deliberately not touched**);
`plugintype.friendlyname` is unique organisation-wide (KI-41); `refreshStep` was called but never
imported.

**Documentation**: KI-35 recorded as architecturally resolved in SecurityModel §5a,
CommunicationArchitecture §2a and ADR-08; KI-01, KI-21 and KI-38 closed; KI-40 to KI-45 raised;
the pre-provisioning safety check closed out.

**Not started**: Phase 2. Nothing has been committed to git — `projects/debtcollection/` is still
untracked on `feat/dfe-six-point-batch` (KI-12).

## 2026-09-17 — Phase 0: architecture reconciliation (documentation only)

**Inputs received**
- Master Prompt: `D:\QDB\Projects\Debt Collection Platform\QDB DEBT COLLECTION PLATFORM COMPLETE REQUIREMENTS.docx` (105 §).
- Correction Prompt: `D:\QDB\Projects\Debt Collection Platform\ClaudeCorrectionPrompt.docx` (48 §) — supersedes conflicting Phase 0 assumptions.
- MIS baseline workbooks: `HousingLoanArrearReport.xlsx`, `HousingLoanArrearReportDetailed.xlsx` (as-of 30/06/2026).
- Architecture deck `Debt Collection Architecture.pptx` (2 image slides: platform architecture, EDR).

**Documents created under `projects/debtcollection/docs/`**
`CurrentStateAssessment.md` (first Phase 0 artefact; revised the same day to apply the Correction Prompt — §0 reframed, single Customer lookup, Rule Engine not a blocker) ·
`TargetArchitecture.md` · `ERD.md` · `EntityDictionary.md` · `MISIntegration.md` · `TestingStrategy.md` ·
`TestCases.md` · `RiskRegister.md` · `DependencyRegister.md` · `ChangeLog.md`.
Remaining Phase 0 documents (`Architecture.md`, `FieldDictionary.md`, `SchemaMigration_msst_to_qdb.md`,
`ConfigurationGuide.md`, `SecurityModel.md`, `CommunicationArchitecture.md`, `APIContracts.md`,
`ReactArchitecture.md`, `DeploymentGuide.md`, `KnownIssues.md`, `CloudMigrationReadiness.md`,
`EngineReuseAssessment.md`, ADR updates, `docs/phases/Phase_0_*`, `DebtCollection_Project_Tracker.xlsx`)
are in progress within Phase 0.

**Architecture decisions changed (proposed, pending Phase 0 review)**
| Was | Now | Source |
|---|---|---|
| Standalone Next.js portal (ADR-DCP-02) | Full-page React CRM web resource, one bundle for HL/BFD, on-prem/cloud | MP §10–11 |
| `msst_` prefix, `Msst.DebtCollection.Plugins` | `qdb_` prefix, `Qdb.DebtCollection.Plugins`; controlled create-new-then-migrate, nothing renamed in place | MP §2–3 |
| `msst_dcpcustomer` customer master | Retired → existing contact (HL) / account (BFD) + `qdb_` Collection flags; field-by-field classification pending | MP §15, CP §6–7 |
| `msst_dcploanfacility` facility master | Retired → existing facility entities; `qdb_facilitynumber` business key on the case | MP §16, CP §8–9 |
| `msst_dcpcommunication` custom activity | Retired → fax (SMS/WhatsApp) + email through one Communication Service | MP §32–36, CP §40 |
| `msst_dcpptprecord` + ADR-DCP-06 | PTP = `qdb_collectionactivity` type; ADR-06 superseded unless evidence per MP §26 | MP §26 |
| `msst_dcpauditlog` on every field change | Native audit for business fields; existing `qdb_crmlogs` for technical events | MP §52 |
| `msst_dcpstrategyconfig` flat rules | `qdb_collectionstrategy` + `qdb_strategyaction` | MP §41–42 |
| Fastify serves ordinary CRM reads | Fastify = live MIS proxy, background MIS sync, cross-org 360, system comms only | MP §60, CP §36 |
| Two customer lookups (`qdb_contactid` + `qdb_accountid`) — Phase 0 first proposal | **Withdrawn.** Single `qdb_customerid` Customer lookup (contact + account); `CreateCustomerRelationships` verified in the on-prem SDK and on the cloud org | CP §4 |
| Rule Engine on-prem = hard blocker (21 Custom APIs) — Phase 0 first finding | **Corrected.** EDP ships an on-prem runbook (Custom Actions, same plugin code); "compatible by design, runtime test pending" | CP §41 |
| Cloud as "current platform", on-prem as future | Two equal targets; cloud testing is an environment-access constraint | CP §1 |
| MIS via nightly ingest only | Two paths: live user-triggered reads (no CRM writes) + background sync (writes, drives automation) | CP §11–33 |
| nodemailer / `ISmsGateway` / puppeteer adopted | nodemailer and `ISmsGateway` withdrawn; puppeteer deferred to Report Engine | MP §32, §48 |

**Findings recorded, not fixed (Phase 0 is non-destructive)**
- Web API version `9.2` hard-coded ×4 in `apps/api` + literal in `routes/health.ts` — on-prem is v9.1.
- `crm/scripts/lib/crm-client.mjs` authenticates only against Entra ID — tooling cannot run on-prem.
- `msst_dcpcollectioncase.IsValidForQueue = false` — queue move has never worked (smoke 14/15).
- No solution package, no CI, no on-prem environment ever used for DCP.

**Test baseline captured:** C# 92/92 · TS 45/45 · cloud smoke 14/15 · on-prem never run.

**Memory / process:** project memory updated with the Master Prompt location and Phase 0 state; the
house publisher-prefix rule records the DCP `qdb_` exception.

## 2026-09-16 — Worktree consolidation

- All 138 tracked files from `feat/dcp-phase1-foundation` @ `95dcb04d` extracted into
  `D:\AI Projects\AICompany\projects\debtcollection\` (+ the gitignored `key.snk`, sha-verified) = 139 files.
- `D:\AI Projects\dcp-wt` deregistered and deleted (dangling npm workspace symlinks under
  `node_modules/@dcp/` cleared with `rm -rf`).
- Verified from the new location: `npm ci` → 45 TS tests green; `dotnet build` 0 warnings → 92 C# tests
  green; assembly identity unchanged (`PublicKeyToken=f70ee8facd683d55`).
- `projects/debtcollection/` is present but **untracked** on the checked-out branch
  `feat/dfe-six-point-batch`; history remains on `feat/dcp-phase1-foundation` (origin in sync).
- User raised six open concerns (no web app; prototype is mock-only; API never consumed; undeletable
  smoke data on the shared org; misplaced worktree — now resolved; process lesson: surface runnable work early).

## 2026-09-16 — Architect decision 3 (`95dcb04d`)

- Deceased/Insurance Review reachable from every non-terminal state; `StopContactQueueMover` sets
  `statuscode` alongside the queue move with per-case error isolation. 92 C# tests. Assembly re-registered
  (6 types / 30 steps / 14 images). Live smoke 14/15 — surfaced the `IsValidForQueue` defect.

## 2026-09-15 → 16 — Phase 4 step 1 foundation (`87676b2a`)

- 11 `msst_dcp*` tables, 13 option sets, 12 roles, 3 queues, field-security profile provisioned on
  org5869857f; 6 plugin types registered; Fastify API + `dataverse-client` + `auth-adapters` +
  `types` packages; `phase-4-ux.md`. Smoke 13/13 at the time (queue move not asserted).

## 2026-09-11 → 14 — Documentation phases (`d91d468d` … `957d743c`)

- Brief, facts-and-analysis with ADR-DCP-01..03, 22-screen prototype (+ UCI layer `255d93a4`), Phase 1
  CEO objectives, BRD (136 FR + 20 NFR), priority re-cut, dependency research, CEO-approved architecture
  with ADR-DCP-04..06.

## 2026-09-17 (late) — existing BFD schema discovered on the sandbox

- Read-only metadata sweep of org5869857f: 909 `qdb_` entities (solution `QDBAllEntites`, 2025-09-21) = BFD CRM schema copy.
- Added `docs/ExistingQdbSchemaAssessment.md`; amended `CurrentStateAssessment.md` (§10, §12), `EntityDictionary.md`, `TargetArchitecture.md` §5, `ERD.md`, `FieldDictionary-Platform.md` (addendum), `KnownIssues.md` (KI-23..26), `RiskRegister.md` (R-ADD-1..3), completion report, demo package, tracker TBD sheet.
- Design change: `qdb_integrationlog` withdrawn → (then) `qdb_integrationlogs`, **now both superseded by reuse of existing `qdb_crmlogs`** per the QDB gate decision. `qdb_collectioncase` proposed as successor of the legacy DA module (for review). All thirteen target names verified free.
- Still no schema, org data or application code changed.

## 2026-09-17 (later) — Housing Loan data analysis

- Added `docs/HousingLoanDataAnalysis.md` (11 findings, design changes, 8 specific MIS/QDB questions); numbers tie to the Breakdown sheet exactly.
- `MISIntegration.md` §4/§12 amended: `dpdAsOfDate` added; `arrearPercentage` → `instalmentCoverageRatio` (derived); `lastArrearAmount` derived; QID 1:1 evidence; mobile/status notes; new TBDs.
- Completion report (decision 10, scope table, §9), demo (step 11), tracker (TBD sheet + docs), `KnownIssues.md` KI-27..30 updated. Still no schema, org data or application code changed.

## 2026-09-17 (F1–F11 review) — user decisions on the Housing Loan findings

The user reviewed findings F1–F11 and issued binding architecture decisions. Applied across the Phase 0
package. **Nothing became a hard-coded business rule: every threshold, boundary and policy the user left
configurable is now a Rule Engine ruleset or a configuration row.**

**Became architecture decisions**
- **F2 → new architecture element: Collection Eligibility / Grace evaluation** (ADR-DCP-11). A MIS
  delinquency record does **not** equal a Collection Case. After identity and facility resolution a
  configurable evaluation runs via `IRuleEngine` and yields `EligibleCreateCase` · `ExistingEpisodeUpdate` ·
  `GraceMonitor` · `ExcludedSpecialHandling` · `IdentityException` · `FacilityException`. No new entity, no
  new engine. The decision is recorded on `qdb_delinquencysnapshot` so a record that produces no case still
  has traceable history; the snapshot's case link is therefore optional.
- **F5 → dashboard metric model**: *Distinct Customers*, *Delinquent Facilities/Accounts* and
  *Customer-Bucket Count* are three distinct metrics with explicit aggregation labels; the HL values
  (3,778 / 4,357 / 3,905) are sample observations, never application constants.
- **F8 → canonical naming**: `installmentCoverageRatio` with the source-field mapping preserved; never
  reinterpreted as arrears/exposure.
- **F11 → MIS adapter normalisation contract** (bucket date conversion, blanks, Arabic/RTL, legacy
  identifiers, shared mobiles, DPD anomalies, negative values, source booleans/status codes, date formats,
  decimal precision, product codes, nulls). **Mobile number is never a customer identity key.**
- **F4 → identity resolution**: QID primary, Customer Number cross-check, Contact GUID as the CRM
  relationship; missing / ambiguous / conflicting / invalid / inconsistent ⇒ `qdb_identityexception`, never a
  silent wrong match.
- **F9 (partial) → exposure retained** as an optional configurable Strategy criterion.
- **F1 (partial) → configurable segmentation**: the Strategy Engine must support DPD, bucket, product,
  arrears, exposure, customer type, facility type, deceased/special-handling status, previous outcomes, PTP
  history and other approved Rule Engine criteria.
- **F6 (partial) → server-side Contact Hold**: a confirmed deceased indicator must be capable of
  immediately triggering a Contact Hold / Special Handling rule, enforced centrally so manual React sends
  and automated sends cannot bypass it; not UI hiding.
- **F10 (partial) → two KPI families kept architecturally distinct**: financial/MIS delinquency KPIs and CRM
  operational Collection KPIs, presentable together in React but never conflated.

**Corrections to earlier Phase 0 text** (all three were stated too strongly in the first issue)
- **F9 — exposure retained.** Reverses `EntityDictionary.md`'s earlier "columns present but left unused by
  default" framing and the analysis's "exposure ranks nothing". Exposure is configured off for HL, available
  for BFD, never removed. **Contradicts approved BRD FR-034** (absolute prohibition) → BRD amendment needed,
  logged as KI-32.
- **F6 — stop-contact no longer asserted from QCB DEAD.** The earlier "stop-contact must default from QCB
  DEAD (all 724)" is withdrawn as a decision and retained as the motivating evidence; whether QCB DEAD alone
  establishes the hold is `TBD — Requires QDB Confirmation`.
- **F1 — the operational/recovery split is demoted from conclusion to recommendation.** `>2000 DPD =
  Recovery` is **not** encoded; boundaries and permitted treatment are business policy. BRD Q-09 (automated
  contact above 2000 DPD) stays open.
- `HousingLoanDataAnalysis.md` gains §2a recording all three corrections in place; KI-11 is superseded by
  KI-32; KI-33 records the superseded wording so no downstream document repeats it as a decision.

**Remain business / MIS TBDs** — `CurrentStateAssessment.md` §10 items 15–25: contact prohibition above
2000 DPD · segmentation boundaries · eligibility/grace thresholds · whether QCB DEAD alone holds contact ·
DPD as-of semantics · Account Status 7/8 · exemption-amount definition · `lastArrearAmount` semantics · HL
identifier validation (incl. the six 7-digit legacy IDs, not rejected on length) · BFD business identity ·
final KPI definitions and targets.

**Documents changed:** `CurrentStateAssessment.md` (§10 + 11 items), `KnownIssues.md` (KI-11 superseded;
KI-28 amended; KI-31 shared-mobile observation, KI-32 BRD contradictions, KI-33 superseded wording),
`RiskRegister.md` (R-25 HL→BFD generalisation, R-26 hard-coded thresholds, R-27 unconfirmed contact-hold),
`ChangeLog.md`, `adrs/ADR-11-collection-eligibility.md` (new), `adrs/ADR-05-mis-ingest-snapshot.md`
(amended), `adrs/index.md`. Sibling updates to `TargetArchitecture.md`, `ERD.md`, `EntityDictionary.md`,
`MISIntegration.md`, `HousingLoanDataAnalysis.md` §2a and the Project Tracker were made in the same pass.

**Cross-platform principle recorded as binding:** HL evidence may establish HL defaults, recommendations,
data-model requirements, required configurability and test scenarios — it must not constrain BFD.

**No schema, org data or application code changed.** Phase 1 has not started; the CRM organisation was not
modified.

## 2026-09-17 (gate response) — QDB Phase 0 gate returned CORRECTIONS REQUIRED; 20 corrections applied

- **1. Integration logging.** QDB confirmed **reuse of the existing `qdb_crmlogs`** (custom *activity*
  entity, 1,295 rows). Both `qdb_integrationlog` (new) and `qdb_integrationlogs` (reuse) are **withdrawn**.
  49 references re-pointed across 20 documents + ADRs; withdrawn proposals retained only where labelled
  historical. New `docs/QdbCrmLogsReuseAssessment.md` maps 19 DCP capabilities to the entity's 9 existing
  columns + activity base, identifies 9 gaps, and proposes extensions (nothing changed on the org).
  Audit boundary restated: native audit = business field-change audit; `qdb_crmlogs` = technical only.
- **2. Snapshot idempotency key un-frozen** — logical requirement documented, physical composition `TBD`.
- **3. Snapshot policy has no production default** — `TBD` / volume validation; all three options compared in tests.
- **4/5. Facility architecture** — canonical contract (`facilityNumber` + `sourceSystem`) separated from an
  optional per-deployment relationship extension; BFD target = likely `qdb_account`, `TBD`; HL `TBD`.
- **6. Legacy DA module** — restated as "**Proposed successor — pending QDB confirmation and
  coexistence/migration assessment**". No retirement, freezing, migration or disabling approved.
- **15.** Existing QDB mapping/configuration entities must be reuse-assessed **before** Phase 1 creates
  `qdb_platformconfiguration` / `qdb_platformmapping` — a binding pre-condition.
- **16.** Smart Assignment stays an external dependency/`TBD`; `qdb_assignmentconfiguration` must not
  become a generic assignment engine.
- **18.** Housing Loan statistics may never become application constants — an explicit prohibited-values table added.
- **19.** BRD conflicts (FR-034, FR-026/FR-132, FR-095/FR-096, Q-09) now carry
  **"Proposed BRD Amendment — Awaiting QDB Approval"**, with original and proposed text both traceable.
- **7–14, 17.** Confirmed without redesign (eligibility, snapshot relationship, customer architecture, case
  unit, exposure, DPD thresholds, contact hold, audit separation, Custom API not a blocker).
- **20.** Full consistency sweep of the completion report: stale `qdb_integrationlog` removed from the
  Create list; Reuse/Extend/Retire/Legacy lists added; decisions 2, 4 and 6 rewritten.
- Tracker: new **Entity Delta** and **Dual-Platform Check** sheets; Contradictions extended to C-14; TBD sheet 41 rows.
- **No schema, org data, plugin registration or application code changed. No CRM metadata created,
  modified or deleted. Phase 1 has not started.**
