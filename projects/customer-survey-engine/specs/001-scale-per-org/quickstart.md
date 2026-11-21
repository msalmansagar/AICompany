# Quickstart / validation: Scheduled Surveys at HL Scale (001-scale-per-org)

How to prove the feature works. Details: [spec](spec.md), [data model](data-model.md),
[contract](contracts/run-due-surveys.md).

## 1. Unit tests (no org)

```text
dotnet test crm-plugins/Qdb.SurveyEngine.Tests/Qdb.SurveyEngine.Tests.csproj
node --test provisioning/__tests__/*.test.mjs onprem/__tests__/*.test.mjs
```

Expected new tests pass, among them: a 300-customer scheduled run cut by the budget resumes with exactly one
invitation per customer; a failed call in the middle loses only its pages; same-day triggers run in priority
order; RecordFailure reaches Stuck at the threshold and a successful page resets it; at ~450 the existing
scheduled-pass tests are unchanged (R2's Drop case asserts reason Fatigue).

## 2. Deploy to the cloud org (CEO go-ahead each time; the user runs the scripts)

1. `provision.mjs` plan, then `--apply`: 4 new trigger columns, 1 new run-status option, 1 settings column.
2. `register-plugin.mjs` plan, then `--apply`: assembly update only.
3. `provision-ui.mjs` plan, then `--apply`: the trigger form's Run section.
4. Read back: assembly hash = local build; columns present; form published.

## 3. Live volume proof (OQ-E1 = b; CEO go-ahead)

Script (extends `e2e/one-time-volume.mjs` as `e2e/scheduled-volume.mjs`):

1. Create **2,500** test accounts `PERF-TEST-SC-*` and a scheduled setup + trigger whose population is those
   accounts (an "active in a source" style population scoped to the test accounts, so no real account is
   surveyed), due on a test run date that is **not** the 1st for any other active trigger.
2. Call `qdb_srv_RunDueSurveys` with `Pass = Daily` and that `RunDate` until `IsComplete`; time each call
   (plugin trace log) and read the trigger's run fields after each call.
3. Expected: exactly **2,500** invitations for 2,500 customers; every call under 2 minutes; the trigger shows
   Sending with a rising evaluated count, then Sent; ~100 pages; extrapolated time for 10,000 recorded.
4. Interruption: after a few calls, kill the client mid-call once, then continue; still 2,500 / 2,500.
5. Clean up all test data; leftovers 0. Restore the daily gate date.

## 4. HL test org (QDB IT, Gate 3)

QDB IT runs one scheduled survey to a test audience on the HL test org and records calls, total time and
the invitation count (NFR-CSE-020). The RUNBOOK gets the steps.
