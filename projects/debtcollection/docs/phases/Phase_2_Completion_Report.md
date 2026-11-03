# Phase 2 — Core Collection Data Model: Completion Report

**Date:** 2026-09-18 · **Branch:** `feat/dcp-phase2-core-model` (worktree `.claude/worktrees/dcp-phase2`), from the approved Phase 1 baseline `df56a047`
**Organisation:** `org5869857f` (Cloud sandbox, the only one authorised)
**Status:** complete — **stopping at the Phase 2 gate. Phase 3 has not been started.**

Every figure below was produced by a test run in this session or read back from the organisation.
Where something is not proven, it says so.

---

## 1. Implementation summary

Phase 2 implemented the operational Collection domain the gate asked for — case, activity, snapshot,
customer relationship, MIS facility identity, delinquency episode lifecycle, case and activity
transitions, PTP as an activity, immutable historical observations, identity exception handling —
and proved it on the organisation with the code that will run in production.

The facility clarification shaped the whole phase: **the facility is its MIS business identity**
(facility number plus source system). Nothing in the pipeline asks the organisation for a facility
record; BFD's Facility Limit and HL's Customer Product are not referenced anywhere in shared logic,
and a test fails the build if they ever are.

Two things were found and decided during the build rather than designed in advance:

- **The approved case matrix had no cure path from most working states** (KI-46). Settled is now a
  universal transition target, alongside Deceased/Insurance Review, in the plugin and its TypeScript
  mirror — proven live (New → Settled). Closure stays a configured rule.
- **The snapshot has no source-system column** (KI-47). A column is proposed, not added.

---

## 2. Repository changes

| Area | Added | Changed |
|---|---|---|
| `packages/domain/src` | `caseLifecycle`, `activityLifecycle`, `misObservation`, `customerResolution`, `collectionCase`, `episode`, `snapshot`, `collectionActivity`, `collectionSettings` (+ 9 test files) | `eligibility.ts` (evaluation port), `platformConfiguration.ts` (`featureFlags`, `defaultCustomerType`), `index.ts` |
| `apps/api/src/services/collection` | `qdbBindings`, `CollectionCaseRepository`, `DelinquencySnapshotRepository`, `IdentityExceptionRepository`, `CollectionActivityRepository`, `CustomerResolutionService`, `eligibilityEvaluators`, `DelinquencySyncService`, `index` | `PlatformConfigurationService.ts` (feature flags, customer type) |
| `apps/api/src/__tests__` | `delinquency-sync`, `collection-repositories`, `collection-portability`, `helpers/FakeCrmAdapter`, `helpers/collectionFixtures` | `platform-configuration-service.test.ts` (+3) |
| `crm/plugins` | `ActiveCaseGuard.cs`, `ActiveCaseGuardPlugin.cs`, `ActiveCaseGuardTests.cs`, `StatusTransitionMatrixCureTests.cs` | `StatusTransitionMatrix.cs` (Settled universal), `StatusTransitionValidatorTests.cs` (one target re-pointed), `REGISTRATION.md` |
| `crm/scripts` | `smoke-qdb-phase2.mjs` | `clean-qdb-smoke-data.mjs` (marker-based, covers every smoke table, callable), `lib/qdb-plugin-steps.mjs` (+2 steps) |
| `docs`, `adrs` | `phases/Phase_2_Completion_Report.md`, `evidence/Phase2_smoke_run.txt` | `TargetArchitecture` §5a, `MISIntegration` §5, `EntityDictionary`, `APIContracts` §3A.4, `FieldDictionary-Transaction`, `TestingStrategy` §1B, `TestCases` §H, `KnownIssues` (KI-46–50), `RiskRegister`, `ChangeLog`, `ADR-05`, `ADR-11`, `Phase_1_Completion_Report` (recovery outcome), tracker |

No file was deleted. No test was deleted or weakened.

---

## 3. CRM changes (sandbox `org5869857f` only)

| Change | Detail |
|---|---|
| Assembly `Qdb.DebtCollection.Plugins` | content patched (ActiveCaseGuard + matrix amendment); same identity, same key |
| Plugin type | `ActiveCaseGuardPlugin` created |
| Steps | `Create of qdb_collectioncase (PreOperation)`; `Update of qdb_collectioncase (PreOperation)` filtered on `statecode` with PreImage `qdb_facilitynumber,qdb_facilitysourcesystem` |
| Schema | **none** — no entity, column, relationship or choice added or changed |
| Data | none left behind: the smoke seeds a contact, an activity type and a platform-configuration row and removes them; guarded rows removed under the three-step cleanup with the guards restored and re-verified |
| Untouched | `msst_` schema and registration, DA module, Contact/Account schema, Facility Limit, Customer Product, `qdb_crmlogs`, production, on-premises |

`verify-qdb-schema.mjs` after the change: **19/19**, 12/12 steps, legacy assembly present with all 30 steps.

---

## 4. Domain model implemented

| Concept | Where | Shape |
|---|---|---|
| MIS observation | `MisDelinquencyRecord` | the canonical `ArrearDetail` after normalisation; bucket verbatim; `mobileNumber` a contact point, outside `customer` |
| Customer identity | `CustomerIdentity` (strict) | `nationalId`, `customerNumber` — nothing else can be identity |
| Facility identity | `FacilityIdentity`, `checkFacilityIdentity` | `facilityNumber` + `sourceSystem`; validated for shape; never resolved |
| Customer resolution | `decideCustomerResolution`, `ICustomerResolver` | QID primary; customer-number cross-check where mapped; `NotFound` / `Duplicate` / `Mismatch` / `NoIdentifier` |
| Collection Case | `CollectionCase`, `CaseSummary`, `CaseStatus`, `CASE_TRANSITIONS` | customer ref (contact/account), facility identity, episode, status, cached MIS position, cure/closure, resolution |
| Episode rules | `decideEpisodeAction`, `EpisodePolicy` | Create / Update / Reopen / Cure / Ignore; reopen window is configuration; a new episode is the normal rule |
| Collection Activity | `CollectionActivity`, `PromiseToPay`, `ActivityStatus`, `PtpStatus`, `PTP_TRANSITIONS` | PTP is an activity type; `relatedRecord` correlates to a native communication by reference |
| Delinquency Snapshot | `DelinquencySnapshot`, `composeSnapshotKey`, `buildSnapshot` | source identity + observation identity + verbatim position + eligibility decision; case optional |
| Eligibility port | `IEligibilityEvaluator`, `EligibilityInput` | facts in, decision out; no threshold anywhere |
| Collection settings | `CollectionSettings`, `readCollectionSettings`, `requireSetting` | `snapshotKeyComposition`, `episodePolicy`, `eligibilityOperation` from `qdb_featureflags`; no defaults |

The physical binding — every `qdb_` column, entity set, navigation name and choice value — is in one
file, `apps/api/src/services/collection/qdbBindings.ts`.

---

## 5. Case lifecycle evidence

- Matrix: 17 statuses, parity-tested TypeScript ↔ C# on every transition and every code
  (`caseLifecycle.test.ts`); 129 C# tests including 17 for the Settled universal target.
- Live (`smoke-qdb-phase2.mjs`): case opened at **New** by `DefaultStatusAssigner`; **New → Settled**
  on cure with `qdb_curedate` and resolution **Cured**; Settled → Closed by the repository; a second
  active case for the facility **refused by `ActiveCaseGuard`** with the conflicting case number in the
  message; re-delinquency after closure opened **episode 2** (`HL-…-E2`).
- In-memory end to end (`delinquency-sync.test.ts`): 36 scenarios covering create, update, reopen
  inside a configured window, new episode outside it, cure, ignore, invariant breach reporting.

## 6. Activity / PTP evidence

- Live: promise created through `CollectionActivityRepository` with the type resolved **by code**;
  the plugin opened the activity at **Open** and the promise at **Active** and composed the subject from
  the type; Active → **Kept**; completed; a subsequent update **refused** by `ImmutabilityGuard`.
- Unit: PTP matrix parity with C#; activity immutability; correlation to a native `fax` record by
  reference with **no** body, channel or recipient on the activity.

## 7. MIS facility identity model evidence

- `checkFacilityIdentity`: missing number, embedded whitespace / control characters, over-length,
  missing source system → `FacilityException` reasons; surrounding whitespace trimmed, not rejected.
- Live: a facility number with an embedded space became an **identity exception row**
  (`InvalidIdentifier`) and no case; a valid number created a case carrying
  `qdb_facilitynumber` / `qdb_facilitysourcesystem`.
- Same facility number in two source systems → two cases (end to end).

## 8. Evidence that no CRM facility entity is required

- `delinquency-sync.test.ts` "never asks the organisation for a facility record": the entity sets
  touched during case creation are exactly `contacts`, `qdb_collectioncases`,
  `qdb_delinquencysnapshots`.
- "processes an HL facility when no Customer Product record exists anywhere" and "processes a BFD
  facility without a Facility Limit relationship" — both pass with no such table in the organisation.
- `collection-portability.test.ts` scans 32 source files of shared logic for `facilitylimit`,
  `customerproduct`, `qdb_facilityid`, `crmi_` and organisation-code branching: none.
- `ActiveCaseGuardTests`: the guard's query carries the two identity columns and the state, and no
  `facilityid` condition.
- Live: the smoke run touched no facility table.

## 9. Snapshot evidence

- Live: first observation → snapshot written, linked to the case; **replay of the same observation →
  `written: false`** on the alternate key `qdb_snapshotkey`; bucket movement → second snapshot;
  GraceMonitor → snapshot **without** a case; identity exception → snapshot on source identity.
- Unit: key composed from configured parts in order; empty composition, missing part, separator in
  a part and over-length key all refused; same observation on replay yields the same key.
- Immutability: Phase 1 smoke (Update and Delete refused) still passes.

## 10. Customer resolution evidence

- Live: national id on `contact.governmentid` (the sandbox's configured column) resolved and bound
  through the Customer lookup (`_qdb_customerid_value` = the contact); an unknown id → exception
  `CustomerNotFound`.
- Unit and end to end: duplicate id → `DuplicateCustomer`; customer number contradicting the id →
  `IdentifierMismatch`; no identifier → `NoIdentifier`; cross-check skipped where the deployment maps
  no customer-number column; account master served with no code change; a contact with only a mobile
  number never matches.

---

## 11. Test results before / after

| Suite | Phase 1 | Phase 2 |
|---|---|---|
| `@dcp/domain` | 30 | **164** |
| `@dcp/api` | 49 | **129** |
| `@dcp/dataverse-client` | 27 | 27 |
| `@dcp/auth-adapters` | 14 | 14 |
| Tooling | 10 | 10 |
| C# | 105 | **129** |
| Live verify | 19/19 | **19/19** (12 steps) |
| Live smoke (Phase 1) | 13/13 | **13/13** |
| Live smoke (Phase 2) | — | **20/20** |

Type-check: 9/9 packages clean.

## 12. Cloud runtime evidence

`docs/evidence/Phase2_smoke_run.txt` — the full run, including the cleanup and the restored-guard
verification. **Cloud Runtime Tested** for: platform configuration read, case creation and Customer
lookup binding, facility identity on the case, plugin default status, cached position, snapshot
write / replay / movement, `ActiveCaseGuard`, second facility per customer, activity type by code,
PTP open / kept / complete / immutable, cure → Settled, closure → new episode, identity exception,
facility exception, GraceMonitor without case, cleanup with zero residue.

## 13. On-premises compatibility status

**On-Prem Compatible by Design — Runtime Test Pending** for everything in this phase. Nothing added
branches on the platform: the services see `ICrmAdapter`; the plugin uses `QueryExpression` and
`IOrganizationService` only; the Web API version and the auth mode are configuration. No on-premises
organisation has been available for DCP (KI-22), and no on-premises runtime validation is claimed.

---

## 14. Remaining TBDs — `Requires QDB Confirmation`

| Item | Why it is still open |
|---|---|
| Final snapshot key composition | MIS timestamp / change-feed semantics unconfirmed; the deployment configures it, nothing defaults it |
| Whether the MIS contract needs a further identifier in facility uniqueness | not guessed; `facilityNumber` + `sourceSystem` is what is proven necessary |
| Contact Hold source column (KI-44) | implementation ready, configuration pending |
| Rule Engine eligibility operation and its response shape (KI-48) | Phase 3 |
| Case number format under QDB's auto-number (KI-39 / KI-49) | provisional composition meanwhile |
| Snapshot policy production default (§7.2) | QDB / volume validation |
| Snapshot source-system column (KI-47) | schema proposal awaiting approval |

## 15. Known issues and risks

New: KI-46 (matrix amendment — resolved, flagged for the gate), KI-47 (snapshot source system —
proposal), KI-48 (eligibility operation — Phase 3), KI-49 (provisional case numbers), KI-50 (legacy
`msst_` routes coexist). Risks R-P2-1 … R-P2-4 in `RiskRegister.md`.

## 16. Schema deviations

**None made.** One proposed: `qdb_delinquencysnapshot.qdb_facilitysourcesystem` string(50) — what is
missing, why, compatibility and migration impact are in KI-47. No mandatory lookup from case or
snapshot to Facility Limit or Customer Product was added, and none will be.

## 17. Demo / replay steps

```
# from the worktree, with the sandbox .env
npm run build && npm run test                       # 334 TypeScript + 10 tooling tests
cd crm/plugins && dotnet test …Plugins.Tests.csproj  # 129
QDB_OPTION_VALUE_PREFIX=10000 DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
  node --env-file=<.env> crm/scripts/verify-qdb-schema.mjs        # 19/19
DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
  node --env-file=<.env> crm/scripts/smoke-qdb-phase2.mjs         # 20/20, cleans up
  node --env-file=<.env> crm/scripts/smoke-qdb-phase2.mjs --keep  # leave rows to inspect, then
  node --env-file=<.env> crm/scripts/clean-qdb-smoke-data.mjs --confirm
```

## 18. Proposed Phase 3 scope — *Configuration & strategy foundation + engine integration* (as sequenced in the tracker)

1. **Rule Engine integration** — the DCP-facing eligibility operation (`qdb_dcp_EvaluateEligibility`,
   Custom API on cloud / Process Action on-premises) and its response contract, replacing the
   provisional evaluator (KI-48); the Contact Hold ruleset operation on the same pattern.
2. **Strategy and assignment configuration** — the provisioned `qdb_collectionstrategy`,
   `qdb_strategyaction` and `qdb_assignmentconfiguration` tables brought into the service layer with
   the same bindings discipline; thresholds remain rulesets.
3. **Platform configuration administration** — mapping rows, feature flags and the snapshot key
   composition made manageable, with the no-default rule enforced at the edge.
4. **Snapshot source-system column** (KI-47) and the QDB auto-number configuration for cases
   (KI-49), if approved.
5. **Engine facades** — `IRuleEngine`, `IProcessEngine`, `IFormEngine` per `EngineReuseAssessment.md`,
   compatible by design with runtime proof on cloud.

Not proposed for Phase 3: MIS live/background adapters (Phase 4), the React workspace (Phase 5),
communications (Phase 7).

**Do not start Phase 3 without explicit approval.**
