# Customer Survey Engine — on-prem kit, 2026-11-11

**Status: built, not yet imported anywhere.** One kit for both on-prem orgs, **HL CRM** (customers are
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
| 2 | `form-engine/FormDesignerWebResource_1.5.0.zip` | Form designer and in-CRM runtime with Form Type, the survey branch, no "Submit another" on surveys, and the scoring boxes. Supersedes 1.4.1 (it includes the 2026-10-19 fixes) | Solutions → Import, then Publish All |
| 3 | `form-engine/Qdb.FormEngine.Plugins.dll` | Form Engine plugin that publishes the scoring values (scoring mode, weights, min/max, option points) into the survey JSON | Plugin Registration Tool → Update assembly. **Gated, see below** |
| 4 | `SurveyEngine_1_0_0_0_onprem_unmanaged.zip` | The survey solution: 9 tables, 3 roles (Survey Admin, Analyst, Integration), 7 Custom APIs, the `Qdb.SurveyEngine` plugin with its 2 dispatch steps, views, charts, forms, the Survey Engine app and 9 icons | Solutions → Import, then Publish All |

`package-manifest.json` (survey) and `form-engine/package-manifest.json` record every change, count and
checksum; `source/` and `form-engine/source/` hold the unmodified cloud exports they were built from.
`config/` holds each org's configuration rows and the questions QDB must answer first (B9 item 4).
**`RUNBOOK.md`** is the step-by-step deployment, with the read-only console checks in `scripts/` and the daily
scheduler in `scheduler/` (B9 item 5).

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
| Survey assembly in the package | byte-identical to the local Release build of commit `82629dd6`, which runs on the cloud org (sha256 `41f89a5a…`) |
| Designer and runtime in 1.5.0 | byte-identical to the cloud org's web resources (designer `5695e5fd…`, runtime `afe8eb3f…`) |
| Form Engine plugin | byte-identical to the cloud org's assembly (`137658ae…`) |
| Relationships | 44, all between survey tables or to Account, Contact, SystemUser, Organization, Queue; the build refuses any other |
| Custom API ↔ plugin binding | carried by `plugintypeexportkey` to plugin types in the same package; still to be confirmed after import (runbook) |
| XSD against Microsoft's 9.0.0.2090 schema | **not run**: the CRM SDK schemas are not on the build machine; the Debt Collection kit found that schema advisory only |
| Custom APIs on 9.1 | **unproven on QDB's orgs** (readiness F2): preflight check before any import |

## Checksums (SHA-256)

| File | SHA-256 | Bytes |
|---|---|---|
| `SurveyEngine_1_0_0_0_onprem_unmanaged.zip` | `922a037e98d8987457e44c5d592e090937b6d149b596fe69c8b190f4de75c1ed` | 156,656 |
| `form-engine/QdbFormEngineSurveyUpdate_1_0_0_0_onprem_unmanaged.zip` | `8f9593cde2348047d7cccf3e4aadb4fc7137576a2b36df3358dc5bfd4f5e20c3` | 3,426 |
| `form-engine/FormDesignerWebResource_1.5.0.zip` | `ce4d2bbc914ec932200ab5fed88f070a9598b1cccb94138e065f8f2a4bb2cda0` | 1,384,478 |
| `form-engine/Qdb.FormEngine.Plugins.dll` | `137658ae3a101eb97376aef8e22ea155155f74b2490900a81be7729f8529f083` | 903,680 |

## Rebuild

```
node --env-file=<dfe>/scripts/.env onprem/export-survey-solution.mjs --date=2026-11-11        (read-only)
node --env-file=<dfe>/scripts/.env onprem/export-form-engine-patch.mjs --date=2026-11-11 --apply  (temporary solution, deleted after export)
node onprem/build-onprem-kit.mjs --date=2026-11-11
node <dfe>/designer/scripts/packageSolution.js --version 1.5.0 --runtime <dfe>/frontend/dist-webresource/index.html
node onprem/build-form-engine-update.mjs --date=2026-11-11 --webresources=<zip> --designer=<index.html> --runtime=<index.html> --dll=<dll>
```
