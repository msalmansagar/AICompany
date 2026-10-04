# DCP — common on-prem package, 2026-10-04

**Status: package prepared and prerequisite-checked — Import Pending Approval.** Nothing in this
folder has been imported anywhere. Importing into HL CRM test or QDB1 test is the next deployment
gate and needs explicit approval.

One package for both organisations. Configuration — not code — makes an org HL or BFD.

| Organisation | Customers | Customer table | Facility | Configuration |
|---|---|---|---|---|
| HL CRM test (`mcdynccatdev01/HousingLoan`) | Individuals | Contact | HL Loan Account | `qdb_organizationcode = HL` |
| BFD CRM / QDB1 test (`mcdynccatdev01/QDB1`) | Corporate / SME | Account | Facility | `qdb_organizationcode = BFD` |

Case Management and Legal live only in BFD CRM / QDB1 and serve both books. The package has **no
native lookup** to `incident` or `qdb_qdblegal`; cross-organisation links use the external process
reference (`docs/ExternalProcessReference.md`) through the Integration Service.

## Files

| File | What it is |
|---|---|
| `qdb_debtcollection_1_0_0_0_onprem_unmanaged.zip` | **The package.** Unmanaged, stamped `SolutionPackageVersion="9.0"`. SHA-256 in `package-manifest.json` |
| `package-manifest.json` | Every change made to the cloud export, with counts; contents; schema findings; zip entries; checksums |
| `source/qdb_debtcollection_cloud_unmanaged.zip` | The unmodified export from org5869857f (9.2.26091.158) the package was built from |
| `source/component-inventory.json` | The 91 solution components of the export, by type |

Rebuild (offline, deterministic content): `node crm/scripts/export-dcp-solution.mjs --date=…` (cloud,
read-only) then `node crm/scripts/build-onprem-package.mjs --date=… --schemas=<Schemas\9.0.0.2090>`.

## Contents

13 DCP tables · 28 DCP global choices (incl. `qdb_dcp_approval_status` 0 Return / 1 Approve) ·
12 security roles (`QDB DCP …`) · 105 relationships · 15 web resources (workspace 762 KB) · 1 app
(`qdb_CollectionWorkspace`) · 2 site maps · plugin assembly `Qdb.DebtCollection.Plugins` (Sandbox,
.NET 4.7.1) with 14 steps on standard Create/Update/Delete messages of DCP tables. **No** Custom API,
workflow, field security profile, organisation setting or QDB shared choice.

## What was changed from the cloud export, and why

All removals carry an empty or default value in this export; the build refuses to remove anything else.

| Change | Count | Why |
|---|---|---|
| Root stamps `OrganizationVersion` etc. | 3 | 9.2 export metadata |
| `SolutionPackageVersion` 9.2 → 9.0, `version` → 9.0.0.0 | 1 | a 9.2-stamped package may be refused by 9.1 on its version alone |
| AppSetting `AppChannel` + its 3 missing dependencies | 1 + 3 | requires the cloud-only `msdyn_AppFrameworkInfraExtensions` package |
| Activity **Regarding** relationships to tables that exist only in the sandbox (`msdyn_*`, `mspp_*`, `msst_*`, `new_*`, other `qdb_*`, `qdb_qdblegal` …) | 458 | the target generates Regarding relationships for its own activity-enabled tables; these would fail the import |
| `CascadeArchive` | 563 | long-term retention does not exist on 9.1 |
| `AutoNumberFormat` (all empty) | 545 | no column is auto-numbered |
| `IsRetrieveAuditEnabled`, `IsRetrieveMultipleAuditEnabled`, `IsMSTeamsIntegrationEnabled` (all 0) | 13 each | cloud-only flags, off |
| `IsHidden="0"`, `IsAutoAssigned` 0, `EnableCollapsibleGroups` False, empty `OptimizedFor`, `headerdensity` | 309 · 12 · 2 · 1 · 13 | defaults / cloud layout hint |

Result: **0 missing dependencies** in `solution.xml`.

## Validation done before import (no access to the on-prem orgs from here)

| Check | Result | Evidence |
|---|---|---|
| Version | both orgs 9.1.42.8; package stamped 9.0 | prerequisite inspections 2026-10-04 |
| Publisher | `qdb`, prefix `qdb`, option prefix 10000 — same in package and both orgs | `package-manifest.json`; choice inspections (QDB solutions under publisher `qdb`) |
| Shared QDB choices | DCP no longer depends on `qdb_approval_status`, `qdb_risk_level`, `qdb_priority` | `docs/evidence/migrations/2026-10-04-post-migration-verification.json` |
| DCP parts already present | none in either org | prerequisite inspections 2026-10-04 |
| Required standard tables | 29 standard CE tables (Account, Contact, SystemUser, Team, Incident, Lead …) | listed in `package-manifest.json` → checked by the preflight below |
| Role privileges | DCP tables + 4 standard SharePoint privileges only | build analysis |
| Plugin | Sandbox; 14 steps on DCP tables; none runs `AuditLogWriter` | build analysis |
| Web resource size | largest 762 KB; HL upload limit 32 MB, QDB1 117 MB | prerequisite inspections |
| Schema | see *Residual risk* | `package-manifest.json` → `xsd` |

### Required before import — run the preflight in BOTH orgs

`crm/scripts/onprem-package-preflight.js` (browser console, System Administrator, GET only) downloads
`package-preflight-<org>-<date>.json`. An **unmanaged import merges into any same-named component**,
so the preflight lists, for all 13 tables, 28 choices, 12 role names, 15 web resources, the app, the
two site maps and the assembly, whether the org already has one — plus the 29 standard tables,
publisher, base language, upload limit and sandbox use. Import only when `verdict.readyForImport` is
`true` in both files. Dry-run against the cloud sandbox: runs clean (reports DCP present, as expected).

**Result, 2026-10-04 (run by the user; `docs/evidence/onprem/Preflight/`):**

| Check | HL CRM test | QDB1 test |
|---|---|---|
| Version | 9.1.42.8 | 9.1.42.8 |
| Existing DCP solution / tables / choices / roles / web resources / app / site maps / assembly | none | none |
| Standard tables (29) | all present | all present |
| Publisher `qdb` | prefix qdb, option prefix 10000 | prefix qdb, option prefix 10000 |
| Upload limit vs 762 KB | 32 MB — fits | 117 MB — fits |
| Languages | 1033 + **1025 (Arabic)** | 1033 |
| Sandbox plugins in use | yes (e.g. Qdb.FormEngine.Plugins) | yes (e.g. Qdb.ReportEngine.CrmPlugin) |
| **readyForImport** | **true** | **true** |

Note: HL has Arabic provisioned; the package carries English (1033) labels only, so Arabic-UI users
see English DCP labels — not an import issue.

## Import attempt 1 — HL CRM test, 2026-10-04 — FAILED, fixed

Log: `onprem-deploy/Error/ImportError.txt`. The server accepted the file (no schema refusal) and
processed 28 choices, 13 tables with views/forms/ribbons/charts, relationships, 15 web resources, the
plugin assembly and 12 roles, then failed on both site maps: **"The SiteMapName in the
AppModuleSiteMap is null or empty" (0x80050109)**. The cloud export keeps a site map's name only in
`LocalizedNames`; 9.1 requires `<SiteMapName>`. Never reached: the app, the 14 steps, root-component
insertion, dependency calculation. Fix: transform `site-map-name` adds `<SiteMapName>` (localized
English name, else the unique name) — package rebuilt, SHA-256 in `package-manifest.json`.

Lesson: the published schema had flagged this as "`ShowHome` invalid … expected: SiteMapName"; the
validator report had trimmed the expected-element list, so it was misfiled as advisory. The full
messages for every remaining finding were re-read: none is a missing required element.

## Import attempt 2 — HL CRM test, 2026-10-04 — SUCCEEDED

Package SHA-256 `de1d31e4…c449` (commit `7c776e3e`). Workspace opens inside the Debt Collection app.
Found after import: at the raw `/<org>/WebResources/qdb_dcp_workspace.html` URL the standalone host
called `https://server/api/data/…` (no organisation) and the server answered **500** — it used the
origin as the organisation URL, which is only true online. Fixed in `webApiHost.ts`
(`organisationUrlOf`: organisation = path before `WebResources`, cache token dropped); deployed to
the sandbox; package re-exported and rebuilt with it (SHA-256 in `package-manifest.json`).

## Import attempt 3 (update) — HL CRM test, 2026-10-04 — SUCCEEDED, VERIFIED

Rebuilt package (`5b85a962…c4f0`, commit `aed091c4`) imported over attempt 2. Post-import check
**16/16** (`onprem-deploy/Post Import/post-import-HousingLoan-2026-10-04.json`); QDB's shared choices
identical to the pre-import inspection. Workspace loads inside the app **and** at the raw
`https://mcdynccatdev01/HousingLoan/webresources/qdb_dcp_workspace.html` (confirmed by the user) —
the standalone-host fix is proven on 9.1. HL app id `57c05de0-26d2-44ef-a6e5-df57801e9bb2`.
Not yet done in HL: configuration row, reference data, role assignment, any runtime use.

## Residual risk — stated precisely

1. **Schema vocabulary.** Microsoft's published on-prem schema (`Schemas\9.0.0.2090`, the one the 9.1
   documentation links) does not declare elements that real 9.x exports carry — including
   `IsRetrievable`, which dates from CRM 2016 — so it cannot model a 9.1.42 server. Against it the
   package still reports `IsSearchable`/`IsRetrievable`/`IsSolutionAware`, step element order,
   site-map `ShowHome`, and app `statecode`/role maps. These carry real values and were kept. A 9.1
   server validates the file **before changing anything**, so a schema refusal is non-destructive.
   Decisive pre-check, if wanted: export any small unmanaged solution from HL test and diff its
   element vocabulary.
2. **Never imported into 9.1.** No cloud-to-9.1 import has been run by this team for any product.
3. **`AuditLogWriter`** (legacy, `msst_`) uses Newtonsoft.Json; it has no step here. It must never be
   registered on-prem without merging Newtonsoft into the assembly.

## Deployment order (after approval) — per organisation

1. Run the preflight; stop on any collision.
2. Settings → Solutions → Import `qdb_debtcollection_1_0_0_0_onprem_unmanaged.zip`. Publish All.
3. Verify independently (do not trust the import dialog): tables, `qdb_dcp_approval_status` 0/1, 14 steps
   enabled, and the workspace opens **inside the Debt Collection app** (site map). On 9.1 on-prem a
   bare `main.aspx?pagetype=webresource&…` opens the classic client and does not work — a direct link
   needs the app: `main.aspx?appid=<appid copied from the app's address bar>&pagetype=webresource&webresourceName=qdb_dcp_workspace.html`
   (HL CRM test, 2026-10-04: import 2 succeeded; workspace works inside the app; the bare link does not).
4. Configuration rows (data, not in the solution): one active `qdb_platformconfiguration`
   (`docs/ConfigurationGuide.md` §2 — HL vs BFD values; facility fields are `TBD — Requires QDB
   Confirmation`), its `qdb_platformmapping` rows, then reference data — activity types, outcomes,
   strategies/actions, assignment configuration (`seed-phase6-configuration.mjs`) and communication
   templates (`seed-phase7-templates.mts`). The scripts support `DV_AUTH_MODE=adfs|windows` but have
   **never run on-prem**.
5. Assign `QDB DCP …` roles to the test users (Collection Officer validation is still pending).
6. Integration Service (QDB-hosted, reaches both orgs) — `integration-service.env.template`.

## Environment configuration (names only, no values)

See `integration-service.env.template`. Per-org differences live in `qdb_platformconfiguration`, never
in code. For HL complaints, `CASE_MANAGEMENT_NON_CUSTOMER_ACCOUNT_ID` must be the active "Non Customer"
account in QDB1. **Candidate:** QDB1's own business rule *Updating Non Customer* sets `customerid` to
account `9a50e4b2-743b-e511-8277-00155d780414` — confirm in QDB1 before use; the service verifies the
account is active and named "Non Customer" at runtime.

## Rollback

Unmanaged import into an org with no DCP parts: delete the `qdb_debtcollection` solution's components
(tables, choices, roles, web resources, app, site maps, assembly) in reverse dependency order. No QDB
component is changed by the import when the preflight shows no collision.
