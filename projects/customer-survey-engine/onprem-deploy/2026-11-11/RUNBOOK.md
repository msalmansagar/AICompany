# Customer Survey Engine — on-prem deployment runbook

| | |
|---|---|
| Kit | `onprem-deploy/2026-11-11/` (see `README.md` for contents and checksums) |
| Orgs | **HL CRM** (customers = contacts) and **BFD CRM / QDB1** (customers = accounts), test first, then production |
| Who | **QDB IT** runs every step on the orgs; **MSS** reads the reports sent back and confirms each gate. MSS has no access to the on-prem orgs |
| Time | About 2 hours per org for stages 1–6, in a maintenance window; configuration and activation (7–8) follow once QDB's answers are in |

Run the whole runbook on **HL test** and **QDB1 test** first. Production follows the same steps once both
test orgs have passed stage 9 (smoke test).

**Stop rule.** A **FAIL** in any report stops the deployment at that stage: send the report to MSS and wait.
A **WARN** needs a named person's decision, written down, before going on.

---

## Stage 0 — Before the window

| # | Step | Who |
|---|---|---|
| 0.1 | Take a **full database backup** of the org. This is the real rollback: an unmanaged solution cannot be uninstalled cleanly (stage 10). | QDB DBA |
| 0.2 | Check the kit files against the checksums in `README.md` (`Get-FileHash <file> -Algorithm SHA256`). | QDB IT |
| 0.3 | Name the people: a **System Administrator** for the imports and source activation; the **AD service account** for the daily scheduler (needs System Administrator in CRM); the **portal backend's service account** (gets Survey Integration). | QDB IT |

## Stage 1 — Preflight (read-only)

1. Open CRM in the browser as a System Administrator (any page, e.g. the dashboard). Press **F12** → **Console**.
2. Paste the whole of **`scripts/survey-preflight-HL.console.js`** on HL, or **`survey-preflight-BFD.console.js`** on QDB1, and press Enter.
3. It prints a table and downloads `survey-preflight-<org>-<date>.json`. **Send the file to MSS.**
4. Paste **`scripts/survey-rollback-backup.console.js`** the same way. It downloads `survey-rollback-backup-<date>.json`, which holds the current Form Engine designer, runtime and plugin. **Keep it with the window's records**; stage 10 restores from it.

| Check | Pass | If not |
|---|---|---|
| P1 version 9.x | PASS | stop |
| P2 upload limit ≥ 2,296,208 bytes (the 1.6.0 designer) | PASS | raise **System Settings → Email → Maximum file size** to 5,120 KB, re-run |
| **P3 Custom APIs supported** (readiness F2) | PASS | **stop**: all seven survey APIs are Custom APIs; the design needs a different binding before this org can take the kit |
| P4–P7 Form Engine present (tables, icons, plugin, Custom API) | PASS | stop: install or update the Form Engine first |
| P8 publisher `qdb` with prefix `qdb` / `10000` | PASS | stop: a different publisher owns the prefix |
| P9 nothing in the kit already exists | PASS on a first install | WARN: find out who created the listed components before importing; the import would merge into them |
| P10–P11 async and sandbox services | PASS | check both Windows services on the CRM servers, re-run |
| **P12 grid columns saved as not editable** | PASS, or WARN with the list | the list decides stage 3; it does not stop stages 2 and 4 |
| P13 System Job accepts the survey health view | PASS | stop: the SurveyEngine import would fail on the System Job view; raise it with MSS |
| C-src / C-sms / C-lang configuration names | PASS or INFO | FAIL: the name in `config/<org>.json` is wrong for this org; correct it with MSS before stage 7 |

**Gate 1:** MSS confirms the preflight report in writing.

## Stage 2 — Form Engine columns and designer/runtime

| # | Step |
|---|---|
| 2.1 | **Settings → Solutions → Import** → `form-engine/QdbFormEngineSurveyUpdate_1_0_0_0_onprem_unmanaged.zip`. Its only dependencies are the Form Engine tables and icons; CRM refuses it on an org without them. |
| 2.2 | **Import** → `form-engine/FormDesignerWebResource_1.6.0.zip`. |
| 2.3 | **Publish All Customizations.** |
| 2.4 | Open the Form Designer from its usual entry point (the app's site map, **not** the raw `/WebResources/` URL, which has no CRM context) and open any existing form. It loads, and the form properties panel shows **Form Type** (Standard / Survey). |
| 2.5 | **Test orgs only: A2 evidence (NFR-CSE-004).** Paste **`scripts/survey-stage2-check.console.js`** as in stage 1. It downloads `survey-stage2-<date>.json`. **S1 must PASS** (no SurveyEngine on the org yet; if S1 fails, this run cannot be A2 evidence) and Q7–Q9 PASS. |
| 2.6 | **Test orgs only.** In the Form Designer, **publish three existing forms again**: a plain form, a form with a grid, and one more. Pick forms with no unfinished draft edits (ask each form's owner): publishing also publishes any draft edits. Each publish must succeed. Then open each form the way its users do and confirm it renders with its fields. Write down the three form codes. |
| 2.7 | **Test orgs only.** Paste `survey-stage2-check.console.js` again; the browser saves it as `survey-stage2-<date> (1).json`. **Send both stage-2 files and the three form codes to MSS.** |

Neither import republishes any form: every published form keeps its current version until someone publishes it again.

**Gate 1b (A2, test orgs only):** MSS runs both comparisons; both must exit 0.

```
node onprem/compare-reports.mjs <preflight.json> <first stage-2.json>
node onprem/compare-reports.mjs <first stage-2.json> <second stage-2.json> --expect-changed=<code1>,<code2>,<code3>
```

The first shows stage 2 changed no published form; the second shows only the three forms republished in step 2.6
changed, each with a new version, and no other form was published. With step 2.6, this is the evidence for go-live
checklist A2: the Form Engine publishes and renders with no SurveyEngine on the org, the state a removal would leave.
Production skips 2.5–2.7 and Gate 1b; the test orgs' evidence stands for it.

## Stage 3 — Form Engine plugin (gated)

Only when **P12** was PASS, or every column it listed has been confirmed read-only on purpose by the form's
owner. Otherwise **skip this stage**: surveys still work, but weighted scores are not calculated until it
is done.

| # | Step |
|---|---|
| 3.1 | Plugin Registration Tool → connect → **Qdb.FormEngine.Plugins** → **Update** → `form-engine/Qdb.FormEngine.Plugins.dll`. Keep every step as it is. |
| 3.2 | Do **not** bulk-republish forms. After this DLL, a form published again carries the newer publisher output; each form's owner republishes their own form when they next change it, after checking it has no unfinished draft edits. |

## Stage 4 — SurveyEngine

| # | Step |
|---|---|
| 4.1 | **Import** → `SurveyEngine_1_0_0_0_onprem_unmanaged.zip`. Leave "enable SDK message processing steps" ticked: the two invitation dispatch steps must be on. |
| 4.2 | **Publish All Customizations.** |

The package carries no trigger steps (readiness F4); activating a source creates them (stage 8).

## Stage 5 — Post-import verification (read-only)

1. Paste **`scripts/survey-post-import.console.js`** in the console as in stage 1. It downloads `survey-post-import-<date>.json`. **Send it to MSS** with the preflight report.
2. MSS runs `node onprem/compare-reports.mjs <before.json> <post-import.json>`. On the test orgs *before* is the second
   stage-2 report (step 2.7), because the three forms republished in step 2.6 are not the import's doing; on production
   it is the preflight report.

| Check | Pass |
|---|---|
| Q1–Q4 solution, 9 tables, 3 roles, app | PASS |
| **Q5 seven Custom APIs bound to `Qdb.SurveyEngine`** | PASS. If not, open each API in the Plugin Registration Tool and set its plugin type from `Qdb.SurveyEngine.Plugins` (same name without the `qdb_srv_` prefix, e.g. `qdb_srv_GetSurvey` → `GetSurveyPlugin`) |
| Q6 two dispatch steps enabled, no trigger steps | PASS |
| Q7 six Form Engine columns | PASS |
| Q8–Q9 designer and runtime are the kit builds | PASS |
| Q10 Form Engine plugin | INFO: says whether stage 3 was done |
| Q11 survey health view on System Job | PASS. A System Administrator then opens Survey Engine → **Health → Survey Jobs**: it opens on "Survey Jobs - Failed or Suspended" (empty after a clean install) |
| **Render cache** | `compare-reports.mjs` reports **none changed by the import** |

**Gate 2:** MSS confirms the comparison in writing.

## Stage 6 — People and roles

| Role | Give to | Why |
|---|---|---|
| **Survey Admin** | survey administrators | setups, triggers, settings, SMS hand-off; reads sources and invitations |
| **Survey Analyst** | people who read results | the only role that reads responses and answers (FR-CSE-060), with Excel export |
| **Survey Integration** | the portal backend's service account | exactly what the four portal APIs need (integration guide) |
| System Administrator | the activation operator and the scheduler's service account | source activation and the daily run are administrator-only |

## Stage 7 — Configuration

Only once every question that blocks a row is answered (`config/README.md`). In the **Survey Engine** app
→ Configuration:

| # | Row | From |
|---|---|---|
| 7.1 | **Survey Settings** (exactly one row). **Customer Table = Contact on HL, Account on QDB1**; leave secure links off. | `config/<org>.json` → `settings` |
| 7.2 | **Survey Sources**, one per request table, all **inactive**. | `sources` |
| 7.3 | **Survey SMS Config**, only when secure links are to be used. | `smsConfigs` |
| 7.4 | Publish each survey form in the Form Designer with **Form Type = Survey**, then create its **Survey Setup** and **Survey Triggers** (status and type values per HL-03 / BFD-03). | survey owners |

Re-run the stage 1 preflight after 7.2: the C-src lines must now all be PASS.

## Stage 8 — Activate sources and the daily run

**8.1 Activate a source** (System Administrator, console on a CRM page, one source at a time; this is a
write):

```js
fetch(Xrm.Utility.getGlobalContext().getClientUrl() + '/api/data/v9.0/qdb_srv_ActivateSource', {
  method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
  body: JSON.stringify({ SourceId: '<the source row id>' }),
}).then((r) => r.json()).then(console.log);
```

The answer's `Message` lists the steps it created. It refuses a trigger whose status or type code is not on
the table. `qdb_srv_DeactivateSource` with the same body removes them again.

**8.2 Daily run.** On the server chosen in 0.3, as a local administrator, from `scheduler/`:

```powershell
.\Register-RunDueSurveysTask.ps1 -OrgUrl https://<crm-server>/<org> -ServiceAccount <DOMAIN\svc> -LogPath D:\Logs\SurveyEngine -At 02:00
Start-ScheduledTask -TaskName 'Survey Engine - Run Due Surveys'
```

Pass: the day's log in `-LogPath` has a `RunDate …, call 1: …` summary line and no "still not complete"
line, and the task's **Last Run Result** is `0x0`. One task per
org (HL and QDB1 have different URLs).

## Stage 9 — Smoke test

From any Windows machine that reaches CRM, in Windows PowerShell, signed in as a System Administrator:

```powershell
# 1. Read-only: settings row, the seven Custom APIs, and each portal API's plugin answering as designed.
.\smoke-test.ps1 -OrgUrl https://<crm-server>/<org>

# 2. Test orgs only: one survey end to end through the portal APIs, as the portal's service account.
#    Creates a test customer, a switched-off setup and one Portal invitation; lists, opens and submits it;
#    checks a second submit is refused; deletes everything it created.
.\smoke-test.ps1 -OrgUrl https://<crm-server>/<org> -WriteTest -FormCode <a published survey form> -IntegrationCredential (Get-Credential <DOMAIN\svc-portal>)
```

Pass: every line PASS, exit code 0. It writes `survey-smoke-test-<date>.json` in the current folder; **send it
to MSS**. Step 1 needs the Survey Settings row (7.1); step 2 also needs a survey form published with Form
Type = Survey (7.4). On production, run step 1 only, unless the change owner approves step 2.

### 9.3 Test orgs only: trigger speed (go-live checklist A3)

Needs one source activated (8.1), with an active setup and Event trigger on it (7.4).

1. Prepare at least 10 (ideally 20) records in that source's table, named `SURVEY-SPEED-01`, `SURVEY-SPEED-02` and so
   on. Each must be for a **different test customer** who has not been surveyed recently and has **no real phone number
   or e-mail**, in a status **just before** the trigger status, and of a type the trigger accepts.
2. As a System Administrator, from the kit folder:

   ```powershell
   .\trigger-speed-test.ps1 -OrgUrl https://<crm-server>/<org>
   ```

   It switches invitation sending off for the run, moves each record into the trigger status one second apart, times
   each invitation, then switches sending back on and deletes the invitations it caused. The prepared records stay in
   the trigger status; remove them as your test process requires. If it stops early, run it again with `-RestoreOnly`.
3. **Send `survey-trigger-speed-<date>.json` to MSS.**

Pass: **S1**, 95% of invitations within 10 s and none over 60 s. Both test orgs passing closes checklist A3; the cloud
measurement of 2026-11-13 is information only.

**Gate 3:** both test orgs pass step 2 and 9.3 before production.

## Stage 10 — Rollback

| Situation | Action |
|---|---|
| Something is wrong after stage 4 and the engine must stop now | Deactivate every source (`qdb_srv_DeactivateSource`), switch every setup's **Is Active** off, disable the scheduled task. The engine then does nothing; nothing customer-facing depends on it. |
| The designer or runtime misbehaves after stage 2 | Re-import the Form Engine kit the org ran before (e.g. `dynamic-form-engine/onprem-deploy/2026-10-19/FormDesignerWebResource_1.4.1.zip`), or restore both web resources from `survey-rollback-backup-<date>.json`, then Publish All. |
| Publishing misbehaves after stage 3 | Plugin Registration Tool → Update `Qdb.FormEngine.Plugins` with the DLL saved in `survey-rollback-backup-<date>.json` (`formEnginePlugin.content`, base64). |
| Everything must go | Restore the stage 0.1 database backup. Deleting the SurveyEngine solution removes only the solution record, not its tables. |

The six Form Engine columns are additive and unused by anything else; leaving them in place is harmless.
