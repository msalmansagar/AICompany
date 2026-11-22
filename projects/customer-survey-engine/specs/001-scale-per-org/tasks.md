---
description: "Task list for 001-scale-per-org (BRD Addendum E, ADR-011)"
---

# Tasks: Scheduled Surveys at HL Scale (Scale per Org)

**Input**: `projects/customer-survey-engine/specs/001-scale-per-org/` — spec.md, plan.md, research.md,
data-model.md, contracts/run-due-surveys.md, quickstart.md
**Architecture**: ADR-011 (Accepted 2026-11-21), `phase-3-arch.md` § Addendum E
**Tests**: REQUIRED. TDD is mandatory (constitution Article IV, `.claude/rules/common.md`): every test task is
written and seen failing before its implementation task.

All paths are relative to `projects/customer-survey-engine/`. `Plugin` = `crm-plugins/Qdb.SurveyEngine/`,
`Tests` = `crm-plugins/Qdb.SurveyEngine.Tests/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3 (spec.md user stories)

---

## Phase 1: Setup

- [ ] T001 Create the build branch `feat/survey-scale-per-org` from `docs/survey-brd-addendum-e` (company git rules; no `git add .`) and confirm the baseline is green: `dotnet test Tests/Qdb.SurveyEngine.Tests.csproj` and `node --test provisioning/__tests__/*.test.mjs onprem/__tests__/*.test.mjs`; record the baseline test counts in `specs/001-scale-per-org/tasks.md` Notes

---

## Phase 2: Foundational (blocks every story)

**Purpose**: schema, settings and the run-record store that all three stories use.

### Tests first

- [ ] T002 [P] Write failing node:test cases in `provisioning/__tests__/manifest.test.mjs` asserting the manifest declares the four new trigger columns `data-model.md` Scheduled run progress.`qdb_run_period_key`, `.qdb_run_evaluated_count`, `.qdb_run_failed_calls`, `.qdb_run_progress_on`, the new option `data-model.md` Scheduled run progress.`qdb_run_status` = Stuck (100000004), and the settings column `data-model.md` Survey Settings.`qdb_stuck_after_failed_calls` (required, default 3, range 1–10), and that the four new trigger columns are audit-enabled (extend `provisioning/__tests__/table-auditing.test.mjs`; Article VI)
- [ ] T003 [P] Write failing xUnit tests in `Tests/ScheduledRunStoreTests.cs` for a new `ScheduledRunStore`: reads a trigger's run record (status, period key, cursor, counts, failed calls, progress time, row version); `TrySaveProgress` is conditional on the row version (second writer gets `false`, writes nothing); `TrySaveProgress` always resets `qdb_run_failed_calls` to 0 and stamps `qdb_run_progress_on`
- [ ] T004 [P] Write failing xUnit tests in `Tests/ConfigDataTests.cs` that Survey Settings maps `qdb_stuck_after_failed_calls` (`data-model.md` Survey Settings.`qdb_stuck_after_failed_calls`) and that an empty value is reported as missing (no value supplied by code; Article V — the caller refuses, see T022)

### Implementation

- [ ] T005 Add to `provisioning/manifest.mjs` the four trigger columns and the Stuck option (`data-model.md` Scheduled run progress.`qdb_run_period_key`, `.qdb_run_evaluated_count`, `.qdb_run_failed_calls`, `.qdb_run_progress_on`, `.qdb_run_status`) and the settings column (`data-model.md` Survey Settings.`qdb_stuck_after_failed_calls`: required, schema default 3, 1–10); audit-enable the new columns; make T002 pass
- [ ] T006 [P] Add `RunStatus.Stuck = 100000004` and the scheduled run record type (period key, cursor, evaluated/invited/postponed/suppressed counts, failed calls, progress time, row version) in `Plugin/Scheduling/ScheduledRun.cs`; keep the existing one-time run types untouched
- [ ] T007 Implement `IScheduledRunStore` + `ScheduledRunStore` in `Plugin/Data/ScheduledRunStore.cs` (row-version conditional update, the `OneTimeTriggerStore.TrySaveProgress` pattern) and its in-memory fake in `Tests/InMemorySchedulingStore.cs`; make T003 pass
- [ ] T008 [P] Map `qdb_stuck_after_failed_calls` in `Plugin/Data/SurveyConfigMapping.cs` and expose it on the settings object in `Plugin/Data/SurveyConfigRepository.cs`; make T004 pass

**Checkpoint**: schema declared, run record readable and writable, threshold configurable; all old tests green.

---

## Phase 3: User Story 1 — A quarterly survey reaches every HL customer (P1) 🎯 MVP

**Goal**: scheduled triggers run one at a time in priority order, 25 customers per page, saving progress on
the trigger after each page, until the whole population is evaluated (FR-001, FR-002, FR-005, FR-006,
FR-007, FR-010).

**Independent test**: an in-memory 300-customer scheduled trigger completes across budget-cut calls with
exactly one invitation per customer; the trigger shows Sending with a rising evaluated count, then Sent.

### Tests first

- [ ] T009 [P] [US1] Write failing tests in `Tests/SchedulingDataTests.cs` that `ScheduledCandidateBuilder` builds **one page** of 25 for "All active customers" (via `AudienceReader.ReadPage` + paging cookie) and for "Active in a source during the period" (by key: `distinct`, `order by customer`, `customer > lastCustomerId`, first page only — research R3 as amended), returning the next cursor (`data-model.md` Scheduled run progress.`qdb_run_cursor`) and an end-of-population flag; plus a test that the FetchXML for "active in a source" contains the `gt` condition on the customer column and no `page` attribute beyond 1
- [ ] T010 [P] [US1] Write failing tests in `Tests/SchedulingDataTests.cs` that the per-page dedupe check reads only the page's own `DedupeKey.ForSchedule(setup, customer, period)` keys and skips customers already invited (research R4)
- [ ] T011 [US1] Write failing tests in `Tests/RunDueSurveysTests.cs` for `ScheduledTriggerPass`: (a) 300 customers, budget cut every few pages → resumed over several calls, exactly 300 invitations, `IsComplete` false until the last page; (b) progress written after each page (`data-model.md` Scheduled run progress.`qdb_run_evaluated_count`, `.qdb_run_progress_on`, `.qdb_run_cursor`, `.qdb_run_period_key`); (c) status Not sent → Sending → Sent; (d) two due triggers processed in priority order, the second starts only after the first is Sent (FR-010); (e) a trigger still Sending for period P is finished before period P+1 starts (FR-006); (f) an overlapping call that loses the row-version race writes nothing; (g) a deactivated setup or trigger stops at the next page; (h) customers leave and join the "active in a source" population between calls — every customer still in it is evaluated exactly once, none skipped (SC-003); (i) a foreseeable per-customer problem (no published form, no customer link, delivery None) in paged mode is still logged and skipped and the page carries on (FR-011)
- [ ] T012 [US1] Update `Tests/RunDueSurveysTests.cs` for FR-007 at ~450: every existing scheduled-pass test still passes unchanged, except the same-day **Drop** case, which now asserts reason **Fatigue** (CEO-accepted R-E4); `Run_TwoSchedulesDueForOneCustomer_SendsTheHigherPriorityAndPostponesTheOther` stays unchanged
- [ ] T013 [P] [US1] Write failing tests in `Tests/RunDueSurveysTests.cs` for the scheduled part of `RunSummary`: `Scheduled: "<name>" <period> running, N evaluated (i invited, p postponed, s suppressed); k more due today.` and the `completed` form (contracts/run-due-surveys.md Outputs)

### Implementation

- [ ] T014 [US1] Change `Plugin/Scheduling/ScheduledCandidateBuilder.cs` and `Plugin/Data/CustomerPopulationReader.cs` / `Plugin/Data/AudienceReader.cs` to build one page from a saved cursor (`data-model.md` Scheduled run progress.`qdb_run_cursor`; "active in a source" resumes by last customer id, not page number); share the page size with `OneTimeSendService.PageSize` (25); make T009 pass
- [ ] T015 [US1] Replace the whole-period dedupe load with a per-page key lookup in `Plugin/Data/ScheduledInvitationReader.cs`; make T010 pass
- [ ] T016 [US1] Rewrite `Plugin/Scheduling/ScheduledTriggerPass.cs`: select triggers **due on the run date plus every trigger with an unfinished run** (research R7 as amended), order by priority then id, pick the first whose period run is incomplete and not Stuck (one shared selection method, reused by RecordFailure in T028), start or resume its run, dispatch page by page through the existing `InvitationDispatcher` rules (FR-002), save progress via `IScheduledRunStore` after each page, stop between pages when the `RunBudget` is spent; write one `ITracingService` line per page (trigger, period, page, counts, elapsed ms) and one at the start of each daily pass (Article XIV; research R5 "which pass failed"); keep each method ≤ 20 lines (extract a page-runner class in `Plugin/Scheduling/ScheduledPageRunner.cs` if needed); make T011 and T012 pass
- [ ] T017 [US1] Extend `Plugin/Scheduling/RunResults.cs` (`RunSummary`) with the scheduled-run progress text and `IsComplete` = false while a run is in progress; make T013 pass
- [ ] T018 [US1] Wire `ScheduledRunStore` into the pass in `Plugin/Scheduling/RunDueSurveysService.cs` / `Plugin/Plugins/RunDueSurveysPlugin.cs` composition (no `new` inside logic)
- [ ] T019 [P] [US1] Add the read-only **Run** section for scheduled triggers to `provisioning/ui-manifest.mjs` (Run Status, Period, Run Started On, Customers Evaluated, Invited, Postponed, Suppressed, Last Updated, Run Message; contracts/run-due-surveys.md Trigger form) with a failing-first test in `provisioning/__tests__/ui-payloads.test.mjs`
- [ ] T020 [P] [US1] Show the Run section only for trigger kind Scheduled in `webresources/trigger-form.js`, test-first in `webresources/__tests__/trigger-form.test.mjs` (new file, same style as `trigger-audience.test.mjs`); the one-time section is unchanged

**Checkpoint**: US1 complete in-memory; a large scheduled run completes across calls with progress visible.

---

## Phase 4: User Story 2 — An interrupted run finishes without duplicates or gaps (P1)

**Goal**: interrupted or failed calls lose only their own pages; repeated failures mark the trigger Stuck;
resume after missed days (FR-003, FR-004, FR-011).

**Independent test**: a run cut mid-call and a run with one failing call each end with exactly one
invitation per customer; three `RecordFailure` calls mark the trigger Stuck; a later successful page resets it.

### Tests first

- [ ] T021 [P] [US2] Write failing tests in `Tests/RunDueSurveysTests.cs`: a call that throws on page k (transaction rolled back in the fake: no writes kept) → next call redoes page k only; final count = population, zero duplicates, zero missing (SC-003)
- [ ] T022 [P] [US2] Write failing tests in `Tests/RunDueSurveysTests.cs` for `Pass = RecordFailure`: increments `data-model.md` Scheduled run progress.`qdb_run_failed_calls` on the **target trigger** (same selection as the Daily pass, contracts/run-due-surveys.md), including a trigger still **Not sent** whose first page keeps failing; at `data-model.md` Survey Settings.`qdb_stuck_after_failed_calls` sets `data-model.md` Scheduled run progress.`qdb_run_status` Stuck with the reason in `data-model.md` Scheduled run progress.`qdb_run_message`, cut to its 2,000-character limit (test with a 5,000-character error); with no target it does nothing and says so; an empty threshold setting is refused with a message naming it; it never dispatches
- [ ] T023 [P] [US2] Write failing tests in `Tests/RunDueSurveysTests.cs`: a Stuck trigger is skipped so the next-priority trigger runs; when only Sent or Stuck runs remain the scheduled pass reports complete, so the daily gate records the date; on a later run date (later than the date of `data-model.md` Scheduled run progress.`qdb_run_progress_on`) a **quarterly trigger that is not due that day** is still selected and retried, and a successful page sets it back to Sending with failed calls 0 (research R5, R7 as amended)
- [ ] T024 [P] [US2] Write failing tests in `Tests/MissedRunDaysTests.cs` / `Tests/RunDueSurveysTests.cs`: a run in progress keeps the daily gate open; after missed days (≤ 28) the run resumes from its saved cursor and completes (research R7)
- [ ] T025 [P] [US2] Write failing tests in `Tests/PluginEntryPointTests.cs` that `RunDueSurveysPlugin.ReadPass` accepts `RecordFailure` and the refusal message for an unknown value lists `OneTime`, `Daily`, `RecordFailure`
- [ ] T026 [P] [US2] Create `scheduler/__tests__/invoke-run-due-surveys.test.mjs` (new; no scheduler tests exist today) — a node:test that runs `scheduler/Invoke-RunDueSurveys.ps1` under `powershell.exe` against a stubbed `Invoke-RestMethod` (the script's call function is dot-sourced and replaced), plus a check that both copies (`scheduler/` and `onprem-deploy/2026-11-11/scheduler/`) are identical — asserting `scheduler/Invoke-RunDueSurveys.ps1` calls `Pass=RecordFailure` after a failed Daily call, logs its own error without failing on it, stops the Daily loop, and still exits 1

### Implementation

- [ ] T027 [US2] Add `RecordFailure = 3` to `Plugin/Scheduling/RunPass.cs` and parse it in `Plugin/Plugins/RunDueSurveysPlugin.cs`; make T025 pass
- [ ] T028 [US2] Implement the RecordFailure pass in `Plugin/Scheduling/ScheduledFailureRecorder.cs`, called from `Plugin/Scheduling/RunDueSurveysService.cs`: target chosen with T016's shared selection; writes `data-model.md` Scheduled run progress.`qdb_run_failed_calls`, `.qdb_run_status`, `.qdb_run_message` (≤ 2,000 characters) through `IScheduledRunStore`; threshold from `data-model.md` Survey Settings.`qdb_stuck_after_failed_calls`, refused if empty; make T022 pass
- [ ] T029 [US2] Make `ScheduledTriggerPass` skip Stuck triggers, report the pass complete when only Sent or Stuck runs remain, and retry a Stuck trigger when the run date is later than the date of `data-model.md` Scheduled run progress.`qdb_run_progress_on` (`Plugin/Scheduling/ScheduledTriggerPass.cs`); make T021, T023 and T024 pass
- [ ] T030 [US2] Update both copies of `scheduler/Invoke-RunDueSurveys.ps1` (keep them identical) and both `scheduler/README.md` copies; make T026 pass
- [ ] T031 [US2] Accept `RecordFailure` in the `Pass` request-parameter description in `provisioning/lib/plugin-payloads.mjs` (no new parameter; description text only) with its test in `provisioning/__tests__/`

**Checkpoint**: US1 + US2 complete in-memory; full suite green; code review (`code-reviewer`) of Phases 2–4.

---

## Phase 5: User Story 3 — Each org's expected size is written down and proven (P2)

**Goal**: per-org volumes recorded; live proof on the cloud org (2,500) and the HL test-org procedure
(FR-008, FR-009, SC-001, SC-002, SC-005).

**Independent test**: read the records; run `e2e/scheduled-volume.mjs` and get 2,500 / 2,500.

- [ ] T032 [P] [US3] Record per-org volumes (HL ~44,000 / ~10,000 active; BFD/QDB1 ~450) in `phase-2-ba.md` §5.1 cross-reference and `phase-3-arch.md` § Addendum E (FR-009)
- [ ] T033 [US3] Write `e2e/scheduled-volume.mjs` (from `e2e/one-time-volume.mjs`: `--size N`, retry logging, plugintracelog timing): 2,500 `PERF-TEST-SC-*` test accounts, a scheduled setup + trigger scoped to them on a free run date, `Pass=Daily` loop until `IsComplete`, trigger run fields read after each call, one forced client interruption, postponed-release and retention passes observed (FR-008), full cleanup with leftovers 0 and the daily gate date restored (quickstart §3)
- [ ] T034 [US3] **CEO go-ahead** — user runs `provision.mjs` plan/`--apply`, `register-plugin.mjs` plan/`--apply`, `provision-ui.mjs` plan/`--apply` on the cloud org; I verify read-only (columns, option, settings column, assembly hash = local build, form published) and bump the solution version to 1.2.0.5 (separate go-ahead)
- [ ] T035 [US3] **CEO go-ahead** — run `e2e/scheduled-volume.mjs --size 2500`; record calls, per-call times, total time, 2,500 / 2,500 invitations, zero duplicates, and the extrapolated 10,000 time in `phase-5-qa.md` (SC-001, SC-002, SC-003)
- [ ] T036 [P] [US3] Add the HL test-org timing procedure (one scheduled survey to a test audience: calls, total time, invitation count) to `onprem-deploy/2026-11-11/RUNBOOK.md` Gate 3 and a results row placeholder in `phase-5-qa.md` (SC-005, NFR-CSE-020)

---

## Phase 6: Polish & Cross-Cutting

- [ ] T037 Run `/speckit-converge` and `/speckit-checklist`; resolve any unbuilt work
- [ ] T038 Code review of the whole diff (`code-reviewer`, ≤ 20-line functions, ≤ 3 params, no null returns); apply findings
- [ ] T039 Coverage ≥ 80 % on the changed C# (existing coverage command; record in `phase-5-qa.md`)
- [ ] T040 Rebuild the on-prem kit as **1.2.0.5**: `onprem/export-survey-solution.mjs --date=2026-11-11` (retry once on "fetch failed"), `onprem/build-onprem-kit.mjs --date=2026-11-11`; update `onprem-deploy/2026-11-11/README.md`, `RUNBOOK.md` (stage 8.2: Stuck, RecordFailure, run section) and `DEPLOYMENT-AND-HANDOVER.md` with the new zip name, sha256, size and assembly hash
- [ ] T041 Update `docs/` admin guidance: reading the Run section, what Stuck means and how to recover (fix cause → next day's retry, or deactivate/reactivate)
- [ ] T042 QA phase (`phase-5-qa.md` Addendum E section), audit (`phase-6-audit.md`), CEO final decision (`phase-7-ceo.md`); ADR-011 stays Accepted
- [ ] T043 One PR from `feat/survey-scale-per-org` to `main`; merge only on the user's approval; update memory

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T008)** → **US1 (T009–T020)** → **US2 (T021–T031)** → **US3 (T032–T036)** → **Polish (T037–T043)**
- US2 depends on US1 (it extends `ScheduledTriggerPass` and the run record). US3's live steps (T034, T035) need US1 + US2 built and reviewed; T032 and T036 are documentation and can run any time.
- Inside each phase: tests before implementation; `ScheduledTriggerPass.cs` tasks (T016, T029) are sequential.
- Live steps T034 and T035 each need their own CEO go-ahead; the user runs the deploy scripts.

## Parallel Opportunities

- Foundational tests: T002, T003, T004 together; then T006 and T008 alongside T005/T007.
- US1: T009, T010, T013 together; T019 and T020 (UI) in parallel with T014–T018 (plugin).
- US2: T021–T026 together (separate test files or independent test methods); T030/T031 in parallel with T027–T029.
- US3: T032 and T036 any time.

## Implementation Strategy

- **MVP = US1**: paged, priority-ordered, resumable scheduled runs with progress — the change that makes HL's quarterly survey possible at all.
- **Then US2** before any live deploy: failure counting and Stuck are part of the CEO's clarified behaviour, so nothing is deployed without them.
- **Then US3**: one cloud deploy (T034) and one live proof (T035), then kit 1.2.0.5 and the HL test-org procedure.
- Estimate (research R8): 7–9 dev-days.

## Notes

- **Progress 2026-11-22**: T001–T034, T036 and T041 done on `feat/survey-scale-per-org` (C# 716, node 292; code review: no
  blockers, findings applied in `ba6bfc34`). Cloud deploy T034 done and verified (assembly sha256 `958f0391…` = local build;
  forms carry the new fields; Stuck After Failed Calls = 3; solution 1.2.0.5). T035 live 2,500-customer run in progress.
  Build findings: DEF-CSE-004 (scheduler always exited 0); a lookup column is not sorted in "gt" order, so "active in period"
  reads the customer table by primary key (research R3); Dataverse whole-number columns carry no default (data-model.md).
  Open: T035 result, T037–T040, T042–T043; the cosmetic summary fix `bd767390` deploys with the next plugin update.

- Baseline test counts (T001, 2026-11-22, branch `feat/survey-scale-per-org`): C# 657 passed / 0 failed; node (provisioning + onprem + webresources) 269 passed / 0 failed.
- Commit after each green test/implementation pair; specific files only.
- Traceability (Article XV): test names and `feat`/`fix` commit subjects carry the requirement ID, e.g. `feat(survey): page scheduled runs [FR-CSE-098]`, test `Run_ScheduledRunCutByBudget_ResumesWithOneInvitationPerCustomer_FR001`; the PR lists FR-CSE-098, NFR-CSE-006/019/020 and spec FR-001..011 under `## Implements`.
- Remediation of `/speckit-analyze` 2026-11-22 (D1, C1, C2, C3, I1, F1, A1, A2, G1, G2, G3, T1, L1) applied to spec.md, research.md, data-model.md, contracts/run-due-surveys.md and this file.

## Phase 7: Convergence

- [x] T044 Start a period that became due while its predecessor's run was unfinished, once the predecessor completes (test-first in `Tests/ScheduledPagedRunTests.cs`: quarterly run Stuck on its due day, retried and Sent on a later day → the next period's run then starts and completes; change `Plugin/Scheduling/ScheduledWork.cs` `ScheduledSelection.WorkFor`), or, if the CEO prefers no behaviour change, record the waiting period on the trigger and in the RUNBOOK so an admin re-runs it with `RunDate` per FR-006 / Edge case "next period due while the first still runs" (partial)
- [x] T045 Record the FR-008 evidence (research R6 per-item budget; the existing postponed-release and retention budget tests; the live run had both passes empty by its guards) in `phase-5-qa.md` Addendum E, and add a unit test in `Tests/RunDueSurveysTests.cs` that a budget cut part-way through postponed release resumes on the next call per FR-008 (partial)
- [x] T046 Renew the access token (re-open the session) before clean-up in `e2e/scheduled-volume.mjs`, so a run over ~60 minutes cleans up without `--cleanup` per quickstart §3 step 5 / T033 (partial)
- [x] T047 Correct the `qdb_run_cursor` validation rule in `specs/001-scale-per-org/data-model.md`: both populations store the last customer id read (research R3 as amended) per data-model.md Scheduled run progress.`qdb_run_cursor` (contradicts)
- [x] T048 Align the Summary example in `specs/001-scale-per-org/contracts/run-due-surveys.md` with the implemented wording (setup form code + period; no "k more due today" count), or implement the count in `Plugin/Scheduling/RunResults.cs`, per contracts/run-due-surveys.md Outputs (contradicts)
- [x] T049 Add `Implements:` requirement-ID header comments to `ScheduledTriggerPass.Run`, `ScheduledPageRunner.Run`, `ScheduledFailureRecorder.Record` and the RecordFailure path of `RunDueSurveysPlugin` per Constitution XV (partial)
- [x] T050 Confirm at QA the justification for the scheduler changes outside Addendum E (One-time pass no longer fails at MaxCalls; DEF-CSE-004 exit code), already recorded as DEF-CSE-004 in `phase-5-qa.md`, per tasks T030 scope (unrequested)

## Phase 8: Convergence

- [x] T051 Add the T044 transition to the state diagram in `specs/001-scale-per-org/data-model.md` ("Sent for period P, finished on or after P+1's due date ──(next Daily call)──▶ Sending for period P+1") per data-model.md state transitions / FR-006 (contradicts)
- [x] T052 Add to the "Stuck" row of `onprem-deploy/2026-11-11/DEPLOYMENT-AND-HANDOVER.md` and the Stuck paragraph of both `scheduler/README.md` copies that a period which waited for the stuck one starts automatically once it finishes, so no manual re-run is needed, per T041 / FR-006 (partial)
