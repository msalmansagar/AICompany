# Customer Survey Engine — on-prem kit, 2026-11-11

**Status: built, not yet imported anywhere.** On 2026-11-19 the SurveyEngine package was rebuilt as **1.2.0.1**,
a bug fix only (DEF-CSE-001): an event survey is no longer lost when a record's status changes again before the
trigger job runs. Verified on the cloud org (`e2e/def-cse-001-chained-status-e2e.mjs`). No schema, step or role
change; import it over 1.2.0.0 or on a clean org the same way.
On 2026-11-18 the SurveyEngine package was rebuilt as **1.2.0.0**
for BRD addendum D: one-time general surveys (send now or at a date and time, to all active customers or an
audience copied from a CRM view), multi-number SMS, two new Custom APIs (`qdb_srv_PreviewAudience`,
`qdb_srv_SendOneTimeTrigger`), save-time validation of One-time triggers, and the scheduler every 15 minutes.
Verified on the cloud org (one-time E2E 14/14, dispatch 11/11, daily run 12/12; new preflight P15, post-import Q15).
Before that, on 2026-11-15, the SurveyEngine package was rebuilt as **1.1.0.0**
for BRD addendum C (PDPPL decisions): invitation and suppression-log retention, the anonymise fix, the erasure
API `qdb_srv_EraseCustomerSurveyData` with the **Survey Data Officer** role and the audited erasure log, all
CEO-approved with conditions and verified on the cloud org (runbook section 11; Q13 now 8 tables; new Q14).
Earlier on 2026-11-14 the Form Engine designer was rebuilt as 1.6.1
with three Save fixes, all deployed and verified on the cloud org: clearing a component key (DFE-CKEY-001, PR #177),
clearing score weights, min and max and 11 other settings (DFE-CLEAR-001, #178), and an autosave that lost a field
added while it ran (DFE-AUTOSAVE-001, #179). On 2026-11-14 the SurveyEngine package was rebuilt twice: to add
the Survey Scheduler role and the plugin that admits it (Phase 6 audit SEC-01), then to switch on change history
for the rule tables, invitations and the suppression log (audit AUD-01). On 2026-11-13 it was rebuilt to add the
survey health view, and the Form Engine designer was rebuilt as 1.6.0 to add survey mode (BRD addendum
FR-CSE-071..075); the runtime, column patch contents and plugin are unchanged. One kit for both on-prem orgs, **HL CRM** (customers are
contacts) and **BFD CRM / QDB1** (customers are accounts). Configuration, not code, makes an org one or
the other: Survey Settings → **Customer Table**.

Built from the cloud org `org5869857f` (9.2.26102.136), where every part is live and verified end to end
(B2–B8 and weighted scoring, 2026-11-11). The step-by-step runbook with preflight checks, the per-org
configuration templates and the smoke test are B9 items 4–6; this README covers what is in the kit and the
order it goes in.

## Files

| # | File | What it is | How it goes in |
|---|---|---|---|
| 1 | `form-engine/QdbFormEngineSurveyUpdate_1_0_0_0_onprem_unmanaged.zip` | The six Form Engine columns the surveys use: `qdb_form_type`, `qdb_scoring_mode` (Form Definition), `qdb_score_weight/min/max` (Form Field), `qdb_score_points` (Form Option Value) | Solutions → Import |
| 2 | `form-engine/FormDesignerWebResource_1.6.1.zip` | Form designer and in-CRM runtime with Form Type, the survey branch, no "Submit another" on surveys, and the scoring boxes. The designer adds survey mode: New Form asks Normal Form or Survey, and a survey shows only survey controls and settings. 1.6.1 adds the three Save fixes above. Supersedes 1.6.0, 1.5.0 and 1.4.1 (it includes the 2026-10-19 fixes) | Solutions → Import, then Publish All |
| 3 | `form-engine/Qdb.FormEngine.Plugins.dll` | Form Engine plugin that publishes the scoring values (scoring mode, weights, min/max, option points) into the survey JSON | Plugin Registration Tool → Update assembly. **Gated, see below** |
| 4 | `SurveyEngine_1_2_0_1_onprem_unmanaged.zip` | The survey solution, version 1.2.0.1: 10 tables (with the erasure log), 5 roles (Survey Admin, Analyst, Integration, Survey Scheduler for the scheduler's account, and Survey Data Officer for erasure requests), 10 Custom APIs (with the erasure API and the two One-time APIs), the `Qdb.SurveyEngine` plugin with its 2 dispatch steps and 2 One-time trigger validation steps, the trigger form's audience panel (5 web resources), views, charts, forms, the Survey Engine app and 10 icons, and the survey health view "Survey Jobs - Failed or Suspended" on System Job (the only change to an out-of-box table) | Solutions → Import, then Publish All |

`package-manifest.json` (survey) and `form-engine/package-manifest.json` record every change, count and
checksum; `source/` and `form-engine/source/` hold the unmodified cloud exports they were built from.
`config/` holds each org's configuration rows and the questions QDB must answer first (B9 item 4).
**`DEPLOYMENT-AND-HANDOVER.md`** is the overview for QDB: Form Engine prerequisite, the install order on test and
production orgs, operations, the backend/frontend/mobile code and how to share it.
**`RUNBOOK.md`** is the step-by-step deployment, with the read-only console checks in `scripts/` and the daily
scheduler in `scheduler/` (B9 item 5). **`smoke-test.ps1`** proves the portal APIs on each org (B9 item 6,
runbook stage 9); proven on the cloud org 2026-11-12, 14/14 with `-WriteTest`, nothing left behind.
**`trigger-speed-test.ps1`** measures the survey trigger's speed on each test org (runbook 9.3, go-live checklist A3,
NFR-CSE-006). It was proven end to end on the cloud org on 2026-11-14 (9/9 checks, 20 prepared records): sending was
switched off and restored, and the invitations it caused were deleted. The first proof run found a fault in the record
filter, fixed in `4107c01b`.

## Import order

1. **Form Engine column patch (1)**. Its dependencies are the Form Engine tables and their icons, kept on
   purpose: CRM refuses the import on an org without the Form Engine.
2. **Form Engine designer and runtime (2)**, then Publish All.
3. **Form Engine plugin (3)**, only once its gate is cleared. Without it normal surveys still work, but
   weighted scores are not calculated: the published survey carries no weights or points.
4. **SurveyEngine (4)**, then Publish All. It must come after (1): the Survey Integration role reads Form
   Engine tables.

### The plugin gate (3)

This DLL publishes a grid column's **Is Editable** setting (DEF-002). Grid columns saved on-prem under the
designer's old default (No) would become locked when it ships. Before installing it, list every
`qdb_grid_column_config` row with Is Editable = No and confirm each is meant to be read-only. This is the
same census the 2026-10-19 Form Engine kit deferred.

## What was changed from the cloud exports, and why

The generic 9.2 → 9.1 changes are the Debt Collection kit's transforms, proven on HL CRM test (2026-10-04).
Each removes only empty or default values and refuses anything else.

| Change | Count | Why |
|---|---|---|
| `SolutionPackageVersion` 9.2 → 9.0, version 9.0.0.0, export stamps removed | both packages | a 9.2-stamped package may be refused by 9.1 on its version alone (readiness F3) |
| `AutoNumberFormat` (empty), `CascadeArchive`, `IsHidden="0"`, retrieve-audit and Teams flags (0), `IsAutoAssigned` (0), collapsible groups, `OptimizedFor` | 236 · 44 · 88 · 9 each · 3 · 1 · 1 | cloud-only or default values |
| App setting `AppChannel` and its dependency | 1 | needs the cloud-only `msdyn_AppFrameworkInfraExtensions` |
| `<SiteMapName>` added | 1 | 9.1 refuses an app site map without it (HL CRM test, 2026-10-04) |
| **The six SurveyTriggerPlugin steps and their 3 pre-images removed** | 9 | they name the cloud's request tables (readiness F4). On-prem, `qdb_srv_ActivateSource` creates a source's steps when an administrator activates it, as proven on cloud for a source with no pre-registered steps (B4) |
| **App icon → `qdb_icon_survey_setup`** | 1 | the app used the platform's default icon, which a 9.1 org may not have (F10) |
| **account, contact and queue shells removed** | 3 | the survey adds nothing to them, but the cloud export carried the cloud org's own customizations of those tables: **the account shell brought the Report Engine's six ribbon buttons**, whose script is not in this kit. Without the shells, the import leaves each org's account, contact and queue exactly as they are |
| Out-of-box table self-dependencies (account, contact, queue on cloud-only solutions) and the platform icon dependency | 20 with the step dependencies | satisfied by every CRM, or removed with the component |

Result: **0 missing dependencies** in the survey package; the Form Engine patch keeps only its 6 Form Engine
prerequisites.

## Checks done before shipping (no access to the on-prem orgs from here)

| Check | Result |
|---|---|
| Survey assembly in the package | byte-identical to the local Release build of `fix/survey-trigger-event-status` and to the assembly running on the cloud org (sha256 `ab5fa8ff…`, compared 2026-11-19; adds the DEF-CSE-001 fix to the QA-D1 and AUD-D-01 fixes of 2026-11-18) |
| SystemUser shell | removed like Account, Contact and Queue (the Run Started By lookup brought it into the export); the lookup's relationship stays, on the survey trigger table |
| Solution version | the export carries 1.2.0.1, the manifest's version; the build stops if they differ |
| Plugin steps | 2 dispatch + 2 One-time validation steps kept; the 6 cloud trigger steps and their 3 images removed (activation creates them on-prem). Post-import Q15 checks the validation steps are enabled |
| Change history | `IsAuditEnabled=1` on the package's source, setup, trigger, invitation, suppression log, settings, SMS config and erasure log tables, and `0` on response and answer (read from `customizations.xml`). Post-import Q13 checks it on each org; preflight P14 checks the org switch |
| Survey Scheduler and Survey Data Officer roles | in the package with the other three survey roles. Survey Scheduler grants Read of the organization row; Survey Data Officer grants that and Read of the erasure log. The platform adds nine default privileges to every new role, as on the others. Post-import Q12 and Q14 check each has one root role |
| Erasure API | `e2e/erasure-e2e.mjs` 16/16 on the cloud org (2026-11-15): refusal without the role, dry run, anonymise (R1: several empty invitation links accepted), delete, rerun, log rows. Still to confirm on 9.1: R1 and timing (QA C1–C3) |
| Designer and runtime in 1.6.1 | byte-identical to the cloud org's web resources (designer `e6093c74…`, built from main `911026f2`, deployed and read back 2026-11-14; runtime `afe8eb3f…`, taken unchanged from 1.6.0) |
| Form Engine plugin | byte-identical to the cloud org's assembly (`137658ae…`) |
| System Job shell | kept, carrying only the survey health view; the build stops if it brings columns, forms, charts, ribbon buttons or any other view. Its cloud-only self-dependency is removed, as for Account. Preflight P13 confirms the org accepts views on System Job |
| Relationships | 47, all between survey tables or to Account, Contact, SystemUser, Organization, Queue; the build refuses any other |
| Custom API ↔ plugin binding | carried by `plugintypeexportkey` to plugin types in the same package; still to be confirmed after import (runbook) |
| XSD against Microsoft's 9.0.0.2090 schema | **not run**: the CRM SDK schemas are not on the build machine; the Debt Collection kit found that schema advisory only |
| Custom APIs on 9.1 | **unproven on QDB's orgs** (readiness F2): preflight check before any import |

## Checksums (SHA-256)

| File | SHA-256 | Bytes |
|---|---|---|
| `SurveyEngine_1_2_0_1_onprem_unmanaged.zip` | `b66a73e0aa8b049d7af40129394520e62231d28cf6a07b1ba37e612fd909bff4` | 212,389 |
| `form-engine/QdbFormEngineSurveyUpdate_1_0_0_0_onprem_unmanaged.zip` | `bbef1bd91cf84cd2c97fe8bf1cba0cf2bb5ff37fce573728e4134edb759de980` | 3,426 |
| `form-engine/FormDesignerWebResource_1.6.1.zip` | `b2a8ef00d98b213f6c8d784b50cc2e25291cb323ef780f92e8fb87cfe1bce008` | 1,386,590 |
| `form-engine/Qdb.FormEngine.Plugins.dll` | `137658ae3a101eb97376aef8e22ea155155f74b2490900a81be7729f8529f083` | 903,680 |

The column patch was repacked by the 1.6.0 and 1.6.1 rebuilds: its three files are byte-identical to the earlier
builds (`8f9593cd…`, `c692a980…`); only the zip's timestamps, and so its checksum, changed.

## Rebuild

```
node --env-file=<dfe>/scripts/.env onprem/export-survey-solution.mjs --date=2026-11-11        (read-only)
node --env-file=<dfe>/scripts/.env onprem/export-form-engine-patch.mjs --date=2026-11-11 --apply  (temporary solution, deleted after export)
node onprem/build-onprem-kit.mjs --date=2026-11-11
npm --prefix <dfe>/designer run build:singlefile
node <dfe>/designer/scripts/packageSolution.js --version 1.6.1 --runtime <runtime index.html>
node onprem/build-form-engine-update.mjs --date=2026-11-11 --webresources=<zip> --designer=<index.html> --runtime=<index.html> --dll=<dll>
node onprem/build-browser-checks.mjs --date=2026-11-11
```

For 1.6.1 the runtime was taken from the 1.6.0 zip (`webresources/qdb_form_runtime.html`, unchanged) and the DLL
from a copy of the kit's own; `build-browser-checks.mjs` re-embeds the new designer hash and upload threshold
in the console checks.
