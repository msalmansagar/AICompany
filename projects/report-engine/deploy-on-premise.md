# Deploying the Report Engine on Dynamics 365 on-premise

**Written 2026-08-16.** Everything below is derived from this repository and from the cloud
deployment on org5869857f. **None of it has been run against an on-premise organisation** — I do not
have one to test against, so treat the two blockers in Part 0 as findings to confirm in your own
environment, not as assertions.

---

## Part 0 — Two things must be built before deployment is possible

### 🔴 1. The engine runs on a Custom API. On-premise does not have Custom API.

Every report run goes through `qdb_RunReport`, and every dashboard through `qdb_RunDashboard`. Both
are **Custom APIs** — a Dataverse feature introduced in 2020. The final on-premises release is
**Dynamics 365 Customer Engagement (on-premises) 9.1**, from January 2019. Custom API is not in it.

ADR-RPT-010 assumed otherwise. It says on-premise should "route the calls through the `qdb_RunReport`
Custom API"; that line was written before the constraint was checked and should be treated as wrong
until proven right.

**Confirm it yourself in thirty seconds** — a 404 settles it:

```
GET https://<crmserver>/<org>/api/data/v9.1/customapis?$top=1
```

**The fix is smaller than it looks.** The browser already invokes the engine as an **Action**, not a
Function — `report-engine-core.js` sets `operationType: 0` in the request metadata, and a Custom
Action with the same message name and the same parameters is called in exactly the same way, over the
same unbound POST. **So the web resources do not change at all.**

What must be built:

| | |
|---|---|
| **Create** | A Process of category **Action**, unique name `qdb_RunReport`, on no primary entity |
| **Input arguments** | `reportId` (String), `parametersJson` (String), `format` (String), `async` (Boolean), `relationshipId` (String), `parentKey` (String) |
| **Output arguments** | `resultJson` (String), `executionId` (String), `errorCode` (String), `errorMessage` (String), `mode` (String), `jobId` (String), `statusPollUrl` (String) |
| **Register** | The existing `Qdb.ReportEngine.CrmPlugin.RunReportPlugin` on that Action's message, PostOperation, synchronous |
| **Repeat** | The same for `qdb_RunDashboard` with `dashboardId` in and `resultJson`, `executionId`, `errorCode`, `errorMessage` out |

The argument names must match exactly. They are read by name in the plugin and named in the
browser's `parameterTypes` map, so a rename breaks one end silently.

⚠️ **Performance is not equivalent, and it is unmeasured.** A Custom Action instantiates a workflow
on every call, which a Custom API does not. C-6 measured the cloud path at 1.17s for 5,000 rows
(`c6-scale-characterisation.md`); the on-premise path adds workflow instantiation to every report
run. Measure it before promising anything — the 102× headroom found on cloud may not survive.

### 🔴 2. The solution carries the schema, but it will not import as it stands

**This section previously claimed there was no reproducible way to stand the engine up in a new
organisation, and recommended generating a provisioning script from `schema-manifest.json`. That was
wrong on both counts.** Solution export/import is the supported route and carries far more than a
generated script could: entities, fields, option-set values, relationships, labels, web resources,
the plugin assembly, security roles, the app and the sitemap. A manifest-driven provisioner would be
strictly worse — the manifest records name, type and lookup target only, so every option value, max
length and display name would be lost.

The obstacle is different and specific. Inspected on org5869857f, `qdb_reportengine` v1.0.0.0 holds
**78 components**:

| Count | Component |
|---|---|
| 22 | Entity |
| 14 | Web resource |
| **21** | **Custom API (2), its request parameters (8) and response properties (11)** |
| 3 | SDK message processing step — the audit steps |
| 2 | Security role |
| 1 each | Plugin assembly, model-driven app, sitemap, system form (the dashboard) |
| 12 | Two component types this inspection could not identify — 10100 ×11 and 10034 ×1 |

Those 21 are `qdb_RunReport` and `qdb_RunDashboard` with their parameters, and **their component
types do not exist in 9.1**. Importing this solution on-premise fails on them — not with a warning,
with a failed import.

**So the export has to be assembled deliberately rather than taken wholesale.** Build a second
unmanaged solution for the on-premise target containing only what 9.1 understands — the entities, web
resources, plugin assembly, audit steps, roles, app, sitemap and dashboard form — and leave the
Custom APIs out. They are being replaced by Actions anyway, so nothing is lost by omitting them.

Identify components 10100 and 10034 before relying on the export; twelve unknown components is not a
detail to discover during an import window.

⚠️ Version compatibility remains open even after that surgery. Cloud-to-on-premise import is only
supported downward in version, and a package exported from current Dataverse may be refused by 9.1 on
its package version alone. Try the trimmed export first; if it is rejected on version, unpack with
SolutionPackager, lower `SolutionPackageVersion`, and repack.

⚠️ **The solution carries no records.** Ribbon placements (`qdb_reportribbonplacement`) are data, and
so is every report definition, data source, column, parameter and access row. Moving the engine is
not moving the reports — that is a separate data migration.

---

## Part 1 — What else differs on-premise

**The deployment scripts cannot authenticate.** Every script in `scripts/` obtains a token from
`https://login.microsoftonline.com/...` with a client secret. There is no Entra tenant on-premise.
Each needs its `getToken`/`fetch` pair replaced with either:
- **Windows integrated auth** for an internal deployment — Negotiate/NTLM as the running user, or
- **ADFS OAuth** if the deployment is internet-facing (IFD), where the authority is your ADFS server
  rather than Microsoft's.

This is one shared change: every script builds its own token the same way, so extract it once.

**The Web API version differs.** Scripts call `/api/data/v9.2/`. On-premise 9.1 serves
`/api/data/v9.1/`. A wrong version returns 404 on every call, which reads like a permissions problem
and is not.

**`register-customapi.mjs` and `register-dashboard-api.mjs` become obsolete.** They create
`customapi` records. Replace with the Action creation described above.

**Plugin isolation is a choice on-premise.** Sandbox works and is what the cloud registration uses;
full trust is also available and removes the sandbox host as a dependency. Stay in sandbox unless
something forces otherwise — it keeps one behaviour across both platforms.

**The signing key is required to build the plugin**, and it is currently **untracked** in this
repository. Without it the assembly cannot be built at all. See the `.gitignore` note.

**The `qdb_` prefix.** The company convention is publisher `MSST`, prefix `msst`, with a product
segment (`global/PUBLISHER-AND-PREFIX.md`). Deploying `qdb_` into a customer organisation ties the
schema to a name that is not yours and cannot be changed once records exist. Decide before
provisioning, not after.

**Not applicable on-premise:** the Dataverse TDS endpoint. On-premise has direct SQL, which is what
the existing SSRS estate already uses.

---

## Part 2 — The deployment sequence

Steps 1 and 2 are the build work from Part 0. Everything after is mechanical.

> **The two Actions now have their own build sheet** with the exact argument names, the
> registration steps and a smoke test: `onprem-actions-build-sheet.md`. The scripts' authentication
> is done — see `scripts/.env.example` for DV_AUTH_MODE (entra | adfs | windows).

**1. Build the missing pieces**
- Assemble the on-premise solution on org5869857f — everything except the Custom API components —
  and export it unmanaged
- Create the `qdb_RunReport` and `qdb_RunDashboard` Actions and register the plugin types on them
- Port the scripts' authentication and API version

**2. Prepare the environment**
- Dynamics 365 CE on-premise 9.1, latest update rollup
- A deployment account with System Administrator
- On the build machine: .NET Framework 4.6.2 targeting pack, `sn.exe`, Node 20+
- Confirm the sandbox processing service is running if registering in sandbox isolation

**3. Create the publisher**
- Publisher with the agreed prefix, matching the one the exported solution was built under —
  a prefix mismatch on import creates a second set of attributes rather than failing

**4. Import the trimmed solution**, then verify the schema independently:
```
node scripts/verify-schema.mjs <env>      # after porting auth
```
The verifier checks 22 entities against `schema-manifest.json`. Do not treat a successful import as
proof — a solution can import with warnings and leave components behind.

**5. Build and import the plugin assembly** — the solution carries the assembly, so this step is only
needed if the import left it behind or the assembly must be rebuilt against a different key
```
dotnet build src/Qdb.ReportEngine.CrmPlugin -c Release
node scripts/import-plugin-assembly.mjs <env>
```
Creates the assembly and its three plugin types: `RunReportPlugin`, `RunDashboardPlugin`,
`ReportConfigurationAuditPlugin`.

**6. Register the steps**
- The two Actions from step 1, plugin registered on each
- The three audit steps: `node scripts/register-audit-steps.mjs <env>` — Create, Update and Delete
  on `qdb_reportdefinition`, PostOperation, synchronous

**7. Deploy the web resources** — also carried by the solution; run this when iterating on the
engine afterwards, and to confirm all fourteen are present
```
node scripts/deploy-webresources.mjs <env>
```
Ten resources: the shared engine and stylesheet, three HTML shells, the ribbon handlers, and four
vendored libraries — SheetJS, jsPDF, jsPDF AutoTable and the Amiri Arabic font. The script publishes
automatically, and does a full publish when a shell changes.

**8. Provision the app and navigation**
```
node scripts/provision-report-app.mjs <env>
node scripts/provision-report-dashboard.mjs <env>
```
⚠️ An unpublished `appmodule` is invisible: `POST` returns an id, then `GET` on that id returns 404,
and a retry strands the unique name with an opaque `0x80050135`. Publish in the same run that
creates. And a new dashboard needs `PublishAllXml` — a component-scoped publish leaves it invisible
while reporting healthy.

**9. Ribbon placement, per entity**
```
node scripts/seed-ribbon-placements.mjs <env>
node scripts/deploy-ribbon.mjs <env> account
```
Use `ImportSolutionAsync`, which `deploy-ribbon.mjs` already does — the synchronous message holds the
connection open and trips Node's header timeout while the server carries on and succeeds, so a retry
then fails with "cannot start another Import".

**10. Security roles**
```
node scripts/provision-data-read-role.mjs <env>
node scripts/provision-report-user-role.mjs <env>
```

**11. Prove it, by a change in result**
- Open the runtime viewer through
  `main.aspx?pagetype=webresource&webresourceName=qdb_reportengine_runtime.html` — never the raw
  `/WebResources/` path, where there is no `Xrm` and everything fails
- Run a report and confirm rows, then run one with a filter that must return fewer
- Export all four formats and **open the files**
- Confirm an execution log row was written, and that the correlation id opens its detail
- Confirm access control refuses a user outside a report's access list

---

## What I could not check

No on-premise organisation was available, and the network was unavailable at the end of this
session. Specifically unverified: that a Custom Action accepts these argument shapes unchanged, that
the plugin behaves identically on the Action message, the performance cost of workflow instantiation
per run, and whether a solution exported from current Dataverse will import into 9.1 at all.

Each of those is cheap to answer in the target environment, and each is worth answering before a
date is promised.
