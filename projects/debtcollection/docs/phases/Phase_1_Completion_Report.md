# Phase 1 — QDB Foundation Refactoring: Completion Report

**Date:** 2026-09-17 · **Organisation:** `org5869857f` (Cloud sandbox, the only one authorised)
**Status:** complete — **stopping at the Phase 1 gate. Phase 2 has not been started.**

Every figure below was read back from the organisation or produced by a test run in this session.
Where something was not proven, it says so.

---

## 1. The thirteen validations

| # | Validation | Result | Evidence |
|---|---|---|---|
| 1 | Schema verification | **PASS** | 12/12 canonical entities, 243/243 columns present (`verify-qdb-schema.mjs`) |
| 2 | Relationship verification | **PASS** | 17/17 declared lookups exist; the 18th (`qdb_consent_recordedby`) belongs to the conditional entity not provisioned in Phase 1 |
| 3 | Customer lookup verification | **PASS** | `qdb_collectioncase.qdb_customerid` → **account + contact** from one column, built by `CreateCustomerRelationships` |
| 4 | Choice / status verification | **PASS** | 30/30 global choices; 23/23 status reasons at their provisioned values (case 100000600–616, activity 100000640–645); every value in publisher `qdb`'s band |
| 5 | Queue eligibility verification | **PASS** | `qdb_collectioncase.IsValidForQueue = true`, set at creation — the defect KI-01 records on the `msst_` entity does not exist here |
| 6 | Security role verification | **PASS** | 12/12 `QDB DCP …` roles; privilege depths now derived from each table's `OwnershipType` read from the organisation |
| 7 | Plugin registration verification | **PASS** | `Qdb.DebtCollection.Plugins` registered with 4 plugin types, 10 steps, 4 pre-images — **beside** `Msst.DebtCollection.Plugins`, which is present and untouched (30 steps) |
| 8 | Auto-number configuration verification | **PASS** | `crmi_autonumberingsetup` present and reused; `qdb_autonumberconfig` unmodified; **no cloud-only `AutoNumberFormat` introduced** |
| 9 | Cloud smoke tests | **PASS** | `smoke-qdb-plugins.mjs` — **13/13** against the live organisation |
| 10 | C# tests | **PASS** | **105/105** (baseline was 92; 13 added, none deleted) |
| 11 | TypeScript tests | **PASS** | **120/120** (baseline was 83; 37 added) |
| 12 | Tooling tests | **PASS** | **10/10** |
| 13 | Regression against the baseline | **PASS** | `msst_dcp*` still 11 entities; `qdb_crmlogs` still 12 `qdb_` columns, unextended; the DA module untouched; the legacy assembly and all 30 of its steps still registered |

Run `verify-qdb-schema.mjs` to reproduce items 1–8 and 13: **19/19 checks pass.**

---

## 2. What was provisioned

Solution **`qdb_debtcollection`** under publisher **`qdb`** (OptionValuePrefix **10000**, confirmed by
QDB on 2026-09-17).

| Component | Count | Note |
|---|---|---|
| Entities | 12 | `qdb_consent` deliberately deferred — it is conditional on a QDB decision |
| Columns | 243 | |
| Relationships | 17 | plus the Customer lookup, which is two relationships behind one column |
| Global choices | 30 (139 options) | values 100000000–100000581 |
| Status reasons | 23 | 17 case + 6 activity |
| Alternate keys | 3 | all three indexes read back **Active** |
| Security roles | 12 | |
| Queues | 3 | already existed; reused, not recreated |

Provisioning is idempotent: the final run reported **Created 2 · Skipped 102 · Failed 0**.

**Not provisioned, deliberately:** no facility lookup in the shared schema (an optional
per-deployment extension), no integration-log entity (`qdb_crmlogs` is reused unchanged), no customer
or facility master.

---

## 3. What changed in the repository

### Plugins retargeted to the canonical schema
`StatusTransitionMatrix` now carries the provisioned `qdb` integers. `DefaultStatusAssigner`,
`StatusTransitionValidator`, `ImmutabilityGuard` and `ActivitySubjectComposer` work on
`qdb_collectioncase` and `qdb_collectionactivity`. Promise-to-pay is an activity type, so its
lifecycle moved from a separate entity's `statuscode` to `qdb_collectionactivity.qdb_ptpstatus`.

`ActivitySubjectComposer` no longer maps option-set codes to labels: activity types are reference
data QDB maintains, so it reads the type record. That removes a whole class of drift.

### The contact-hold seam
The old guard read `msst_stopcontact` from a DCP-owned customer master. The canonical schema owns no
customer master, so which column signals a hold is now **deployment configuration**
(`ContactHoldSettings`, read from the step's unsecure configuration). With nothing configured the
guard is inactive and the hold decision stays server-side per ADR-DCP-11; configure
`holdAttribute=<logical name>` and it enforces, resolving `contact` or `account` from the lookup
itself. Nothing about QDB's masters is assumed anywhere in the code.

### Portability abstractions
- **`ICrmAdapter`** (`@dcp/domain`) — the only way Collection logic touches CRM. No OData, no SDK
  types, no HTTP. `execute(operation, parameters)` is the single seam for Custom API (cloud) versus
  Process Action (on-premises). `DataverseCrmAdapter` implements it; an Organization Service adapter
  satisfies the same contract with no change above it.
- **Platform configuration** (`@dcp/domain` + `PlatformConfigurationService`) — the customer master,
  its business-identifier column, the facility master, ruleset codes, snapshot policy and the
  platform type are read from `qdb_platformconfiguration` and `qdb_platformmapping`. Nothing has a
  default: a missing value raises `PlatformConfigurationError` rather than guessing `contact` on a
  BFD organisation.

### Tooling
`register-plugins.mjs` takes `--qdb` to register the canonical step table; without it the legacy
table is used, so the running registration is never touched by accident. `verify-qdb-schema.mjs` and
`smoke-qdb-plugins.mjs` are new. `ensureStep` now reconciles a step's filtering attributes, and
`ensurePluginType` sets a friendly name that is unique across assemblies.

---

## 4. Defects found and fixed during execution

| What | How it surfaced | Fix |
|---|---|---|
| `CreateCustomerRelationships` rejected the payload (0x80048d19) | provisioning run 2 | The action takes OData **complex** types, not the entity metadata types `/Attributes` accepts: `ComplexLookupAttributeMetadata` and `ComplexOneToManyRelationshipMetadata` |
| Role privileges refused at `Local` depth on an organisation-owned table | provisioning run 2 | Ownership is now read from the organisation instead of a hard-coded set — the `msst_` set was silently stale for every `qdb_` table |
| A completed activity could still be edited (KI-40) | smoke run 1 | The guard's step filtered on `statecode`, so only that column triggered it. It now fires on every column. **The same narrow filter is live on the `msst_` registration and has not been changed** — see KI-40 |
| Second assembly could not register its plugin types (412) | registration run 1 | `plugintype.friendlyname` is unique organisation-wide; it is now the fully-qualified type name |
| `refreshStep` was called but never imported, and `dryRun` was out of scope | reading the path before running it | Both fixed; that branch would have thrown on any re-run that added an image to an existing step |

---

## 5. What is deliberately not done

| Item | Why | Where it is tracked |
|---|---|---|
| `AuditLogWriter` has no `qdb_` step | The canonical schema uses native audit; there is no audit table to write to. Retained with its tests because the `msst_` deployment still runs it. | KI-43 — keep or delete is a gate decision |
| `StopContactQueueMover` has no `qdb_` step | Its trigger is a hold column on a QDB customer master that is not confirmed. The plugin is retargeted and configuration-driven; registering it is a one-line change once QDB names the column. | KI-44 |
| `qdb_consent` not provisioned | Conditional on a QDB decision | Phase 0 |
| On-premises runtime | No on-premises organisation has ever been available for DCP | KI-22 |

---

## 6. Dual-platform status

| Surface | Cloud | On-premises |
|---|---|---|
| `qdb_` schema | **Cloud Runtime Tested** | On-Prem Compatible by Design — Runtime Test Pending |
| Plugin assembly and steps | **Cloud Runtime Tested** (13/13 smoke) | On-Prem Compatible by Design — Runtime Test Pending |
| Integration Service (`DV_API_VERSION`, auth adapters) | **Cloud Runtime Tested** | On-Prem Compatible by Design — Runtime Test Pending |
| `ICrmAdapter` / platform configuration | **Cloud Runtime Tested** | On-Prem Compatible by Design — Runtime Test Pending |
| Tooling auth (AD FS / IFD modes) | **Cloud Runtime Tested** (Entra) | Compatible by Design — no AD FS endpoint has been reached |

"On-Prem Compatible by Design — Runtime Test Pending" is an access constraint, not an architectural
one: there is no on-premises organisation to test against (KI-22). Nothing in this phase's code
branches on the target; the differences are the Web API version, the auth mode and Custom API versus
Process Action, all of which are configuration or adapter selection.

---

## 7. Residue on the sandbox

The smoke test must exercise `ImmutabilityGuard`, and the guard then refuses to let it clean up. It
now deletes everything the guard permits and reports what stays. Currently left behind, all named
`SMOKE-…`: **3 collection cases, 2 delinquency snapshots, 2 completed activities**. Reference data is
clean. Removing the residue needs the guard temporarily disabled, which is held for your decision —
the same decision KI-04 already carries for the `msst_` tables (KI-42).

---

## 8. Open decisions for the gate

1. **KI-40 — the `msst_` immutability filter.** The same defect fixed here is live on the `msst_`
   registration: a completed action or communication can be edited column by column. Fixing it means
   touching a live registration, which Phase 1 excluded. Fix, or retire with the schema?
2. **KI-43 — `AuditLogWriter`.** Keep as legacy, or delete it and its 20 tests?
3. **KI-44 — the contact-hold column.** Which column on `contact` / `account` signals a hold? Until
   answered, FR-097 suppression is not plugin-enforced on the canonical schema.
4. **KI-45 — communication channel.** Confirm communications are recorded as native `fax` / `email`
   activities; otherwise `qdb_collectionactivity` needs a channel column.
5. **KI-42 / KI-04 — smoke residue.** Disable the guard to clean the sandbox, or leave the rows?
6. **KI-12 — git.** `projects/debtcollection/` is still untracked on `feat/dfe-six-point-batch`;
   the DCP history is on `origin/feat/dcp-phase1-foundation` @ `95dcb04d`. Nothing in this phase has
   been committed. A commit strategy needs your call before anything lands.

---

## 9. Phase 2 has not been started

No Phase 2 work — Collection services, the React workspace, MIS integration, communications — has
been designed, written or provisioned in this phase.
