# Implementation Plan: Scheduled Surveys at HL Scale (Scale per Org)

**Branch**: `docs/survey-brd-addendum-e` (renamed to a feature branch at build) | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification `projects/customer-survey-engine/specs/001-scale-per-org/spec.md`
(BRD Addendum E, CEO-approved 2026-11-21; clarified 2026-11-21).
**Architecture record**: `phase-3-arch.md` § Addendum E and `adr/ADR-011-scheduled-run-paging.md`.

## Summary

Scheduled surveys (monthly, quarterly, annual) must reach HL's ~10,000 active customers. Today the scheduled
pass builds every due trigger's whole population in one call and is cut by the 2-minute plugin limit at
that size, so the survey is never sent (research R1). The plan: process **one trigger at a time, in priority
order** (clarified), **page by page** (25 customers, the one-time send's paging), saving the run's position
and progress on the trigger (reusing the one-time run record plus four new columns), so the work resumes
across the 15-minute scheduler's calls with no duplicates. Failed calls are counted by a new
`Pass = RecordFailure` call the scheduler script makes outside the failed call's transaction; three in a row
mark the trigger **Stuck** (threshold in Survey Settings). Progress shows read-only on the trigger form.
Postponed release and retention already page per item and need no change (R6).

## Technical Context

**Language/Version**: C# 7.3 on .NET Framework 4.7.1 (CRM plugin, Sandbox); JavaScript (provisioning, web resources); PowerShell 5.1 (scheduler)
**Primary Dependencies**: Microsoft.CrmSdk.CoreAssemblies (Organization Service SDK) only (ADR-003)
**Storage**: Dataverse / Dynamics 365 CE tables (`qdb_survey_trigger`, `qdb_survey_settings`)
**Testing**: xUnit + Moq with in-memory stores (C#); node:test (provisioning, on-prem checks); live e2e scripts on the cloud test org
**Target Platform**: Dynamics 365 CE 9.1 on-premises (HL, BFD/QDB1) and Dataverse cloud (test org)
**Project Type**: CRM extension (plugin + Custom API + provisioning + scheduler script)
**Performance Goals**: each scheduled survey to ~10,000 customers fully sent within 1 hour (SC-001); every call < 2 minutes; ~165 ms per customer measured
**Constraints**: 2-minute sandbox limit; one database transaction per Custom API call; no third-party libraries in the plugin
**Scale/Scope**: HL ~10,000 active (44,000 total); BFD/QDB1 ~450; ~10,000 invitations per HL run

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Article | Check | Result |
|---|---|---|
| I Spec first | BRD Addendum E CEO-approved; spec clarified before this plan | PASS |
| II Default stack | Existing CRM plugin stack (C#, Organization Service SDK) per the engagement's ADRs | PASS |
| III TypeScript everywhere | No new TypeScript/JS beyond provisioning and the form script (strict, existing patterns) | PASS |
| IV TDD | Every change test-first (xUnit, node:test); live e2e for the deploy | PASS (planned) |
| V No hardcoding | Stuck threshold in Survey Settings (`qdb_stuck_after_failed_calls`). Page size 25 stays a technical constant shared with the one-time send (not a business rule; ADR-011) | PASS |
| VI Audit trail | Run writes by SYSTEM on an audited table (change history on `qdb_survey_trigger`, AUD-01); every Stuck transition carries its reason in `qdb_run_message` | PASS |
| VII Security | No new permission; scheduler access check unchanged; Survey Integration untouched | PASS |
| VIII CEO checkpoints | Architecture approval before build (this plan); schema apply needs go-ahead | PASS (gate pending) |
| IX Git safety | Specific files staged; conventional commits; one PR | PASS |
| X CRM on-prem | Every call bounded inside 2 minutes by paging; no network calls; SDK only | PASS |
| XI Dataverse cloud | Provisioning uses the solution header; no Default-solution components | PASS |
| XIV Observability | Plugin trace per page; summary in the scheduler log; Stuck → scheduler exit 1 → monitoring | PASS |
| XV Traceability | Spec FRs cite BRD IDs; tasks will cite spec FRs | PASS |
| XVII Reuse before rebuild | Reuses the one-time paging, run record, conditional writes, dedupe key; no OSS applies (research) | PASS |
| XVIII Requirements unit-tested | FR-001..011 each mapped to tests in tasks | PASS (planned) |
| XIX Artifacts agree | `/speckit-analyze` before build | Pending |

**Post-design re-check (after Phase 1)**: PASS. No deviation needs an ADR exception; ADR-011 records the design
decisions themselves.

## Project Structure

### Documentation (this feature)

```text
projects/customer-survey-engine/specs/001-scale-per-org/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/run-due-surveys.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks (next)
```

### Source Code (customer-survey-engine)

```text
crm-plugins/Qdb.SurveyEngine/
├── Scheduling/
│   ├── ScheduledTriggerPass.cs        # one trigger at a time, priority order, paged (changed)
│   ├── ScheduledCandidateBuilder.cs   # builds one PAGE of candidates (changed)
│   ├── ScheduledRun*.cs               # run state, page result, summary text (new)
│   ├── RunDueSurveysService.cs        # RecordFailure pass (changed)
│   └── RunPass.cs                     # + RecordFailure (changed)
├── Data/
│   ├── ScheduledRunStore.cs           # read/save run record with row-version writes (new)
│   └── CustomerPopulationReader.cs    # paged reads (changed)
└── Plugins/RunDueSurveysPlugin.cs     # reads RecordFailure (changed)
crm-plugins/Qdb.SurveyEngine.Tests/    # tests for all of the above
provisioning/manifest.mjs              # 4 trigger columns, Stuck option, settings column
provisioning/ui-manifest.mjs           # trigger form Run section
webresources/trigger-form.js           # show the Run section for scheduled triggers
scheduler/Invoke-RunDueSurveys.ps1     # RecordFailure after a failed Daily call (both copies)
e2e/scheduled-volume.mjs               # live 2,500-customer proof
onprem-deploy/…                        # kit 1.2.0.5, RUNBOOK, README, handover
```

**Structure Decision**: extend the existing SurveyEngine plugin and provisioning in place; no new project.

## Complexity Tracking

No constitution violations to justify.

| Decision with a visible effect | Why | Simpler alternative rejected because |
|---|---|---|
| A lower-priority **Drop** trigger is logged as Fatigue, not PriorityLost, when two surveys fall due the same day | Same-day surveys now run one after another (clarified FR-010), so the second meets the fatigue rule | Interleaving triggers per customer keeps PriorityLost but cannot page two different populations together and contradicts the CEO's answer |
| `Pass = RecordFailure` call from the scheduler | A failed call cannot record its own failure (transaction rollback) | A counter inside the call is rolled back with it; a local file is invisible in CRM |
