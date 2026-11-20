# Phase 5 QA — Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, QA Engineer |
| Version | 1.0 |
| Date | 2026-11-13 |
| Status | Complete — pending CEO gate |
| Inputs | `phase-2-ba.md` v1.1, `phase-3-arch.md` v1.0, `go-live-checklist.md`, B0–B9 delivered build on `feat/survey-engine` |
| Coverage files | `qa/coverage/csharp/coverage.xml` (dotnet-coverage, cobertura format) |
| Test counts | 221 C# (xUnit), 64 provisioning JS (node --test), 47 on-prem JS (node --test) |

---

## 1. Test Strategy Summary

The build follows the architecture's layered test design (phase-3-arch.md section 14).

| Layer | Tool | Scope |
|---|---|---|
| C# domain and service logic | xUnit + Moq, in-memory fakes | Transition check, fatigue, priority, milestone, dedupe, token, dispatch, activation |
| C# data/adapter layer | Not unit-testable without a live org | CRM SDK calls; covered by live-org e2e |
| C# plugin entry points | Not unit-testable without IPluginExecutionContext | Plugin wiring; covered by e2e |
| DFE TypeScript additions | Vitest (DFE designer suite) | Form type, SRV- validation, save-defect fix, survey submission helpers |
| Provisioning (JS) | node --test with --experimental-test-coverage | Manifest builders, payload generators, ui-payloads |
| On-prem tooling (JS) | node --test with --experimental-test-coverage | Transforms, checks, preflight assertions |
| Live-org acceptance | B2–B8 e2e scripts against org5869857f | Each critical FR on a real CRM org |
| Performance | Designed but not yet measured | A3 design below |
| Removability | Designed; code analysis done | A2 design below |

The design correctly separates testable domain logic from CRM-SDK adapter code. The test suite verifies the domain thoroughly; adapter and plugin-wiring layers require the live-org e2e scripts.

---

## 2. A4 — Coverage (NFR-CSE-007: ≥ 80% branch on survey code)

### 2.1 C# assembly — Qdb.SurveyEngine

Coverage collected via `dotnet-coverage 18.12.0` (bypasses strong-name verification; all 221 tests passed).

**Assembly-level result:**

| Metric | Covered | Valid | Rate | Target | Result |
|---|---|---|---|---|---|
| Line | 2,711 | 3,709 | **56.1%** | — | — |
| Branch | 807 | 1,289 | **59.1%** | ≥ 80% | **FAIL** |

**By architectural layer (average across non-anonymous classes in that namespace):**

| Layer | Classes | Avg Line | Avg Branch | Verdict |
|---|---|---|---|---|
| Domain | 21 | 99% | **93%** | PASS |
| Services | 15 | 100% | **82%** | PASS |
| Scheduling | 19 | 99% | **86%** | PASS |
| Integration | 26 | 99% | **84%** | PASS |
| Activation | 12 | 100% | **97%** | PASS |
| Dispatch | 7 | 100% | **78%** | borderline |
| **Plugins** | 14 | **8%** | **51%** | **FAIL** |
| **Data** | 36 | **26%** | **37%** | **FAIL** |

**Interpretation.** The failing layers are the CRM-SDK adapter layer (`Data.*`) and the plugin wiring layer (`Plugins.*`). These cannot be exercised in a unit test without `IPluginExecutionContext` and a live Dataverse org. By design, the domain/services/scheduling/integration/activation layers (the testable pure logic) all pass 80%. The assembly-wide branch rate of 59.1% fails NFR-CSE-007 as written. The gap cannot be closed by writing more unit tests alone; closing it to 80% at the assembly level requires either (a) integration tests against a live org inside CI, or (b) a scope clarification restricting the NFR to testable domain code (not the adapter shell). Both options are recorded as proposed tests below.

**Specific classes at 0% that represent risk:**

| Class | File | Risk if untested |
|---|---|---|
| `StepRegistry` | Data/StepRegistry.cs | Plugin step registration (FR-CSE-003) |
| `ResponseWriter` | Data/SurveyWriters.cs | Response + Answer creation (FR-CSE-056) |
| `SuppressionLogWriter` | Data/SurveyWriters.cs | Append-only log (NFR-CSE-001) |
| `IntegrationInvitationStore` | Data/IntegrationInvitationStore.cs | GetSurvey / SubmitResponse data reads |
| `ResponseRetentionStore` | Data/ResponseRetentionStore.cs | Anonymise / delete path (FR-CSE-058) |
| `SurveyConfigRepository` | Data/SurveyConfigRepository.cs | Config read (all triggers) |
| `SurveyTriggerPlugin` | Plugins/SurveyTriggerPlugin.cs | Plugin entry point (FR-CSE-030) |
| `IntegrationPluginBase` | Plugins/IntegrationPluginBase.cs | Integration API entry points |

### 2.2 JS — provisioning

| File | Line | Branch | Verdict |
|---|---|---|---|
| create-until-present.mjs | 100% | 85% | PASS |
| payloads.mjs | 99% | 84% | PASS |
| plugin-payloads.mjs | 100% | 95% | PASS |
| ui-payloads.mjs | 94% | 96% | PASS |
| validate-manifest.mjs | 100% | 95% | PASS |
| manifest.mjs | 100% | 100% | PASS |
| **Suite total** | **94%** | **93%** | **PASS** |

One uncovered branch: `dataverse-client.mjs` (31% line, 100% branch on covered lines) — the HTTP client is intentionally untested without a live org; its lines are excluded from the total above. The 93% branch rate on the provisioning logic itself passes.

### 2.3 JS — on-prem tooling

| File | Line | Branch | Verdict |
|---|---|---|---|
| form-engine-patch.mjs | 100% | 82% | PASS |
| survey-onprem-transforms.mjs | 100% | 94% | PASS |
| **survey-checks.js** | **87%** | **48%** | **FAIL** |
| **Suite total** | **92%** | **67%** | **FAIL** |

`survey-checks.js` fails at 48% branch. The uncovered paths are mostly the preflight checks that read live services and Form Engine state (P4–P12: Form Engine presence, publisher, collisions, the async/sandbox service checks, the grid-column census) and the configuration-name checks; they need richer fake Web API answers, not an on-prem org. These are tested implicitly by the runbook smoke test, not by the unit suite.

### 2.4 DFE additions (Vitest)

The DFE designer Vitest suite covers the survey changes (run separately; DFE's own CI step):

| Test file | FRs covered | Status |
|---|---|---|
| `surveyFormCode.test.ts` | FR-CSE-023 (SRV- prefix guard) | Tests exist |
| `FormDefinitionService.formType.test.ts` | FR-CSE-019 (Form Type column) | Tests exist |
| `FormSaveService.fieldProperties.test.ts` | FR-CSE-024 (save-defect fix: 4 properties) | Tests exist |
| `surveySubmission.test.ts` | `parseSurveyContext`, `buildSurveyAnswers` | Tests exist |
| `surveyApi.ts` (XRM bridge) | FR-CSE-053 survey submit branch | **No test file** |

The XRM bridge (`surveyApi.ts`, `formApi.ts`) is not covered by any unit test. It is exercised by the B6 e2e test on the cloud org.

### 2.5 NFR-CSE-007 verdict

**FAIL** (first measurement). Assembly-level branch coverage is 59.1% against the 80% target. The domain and service layers pass. The gap is structural (adapter and plugin wiring layers require live-org integration). The CEO gate should record this as a named condition, not a blocker on build quality.

### 2.6 Re-measurement after the coverage tests (2026-11-13): **PASS**

The CEO chose to close the gap with tests rather than a condition. The claim in 2.1 that the adapter layers could
not be unit-tested was wrong: they take `IOrganizationService`, which Moq fakes. Tests only; no production code changed.

| Suite | Before | After | Tests | Commits |
|---|---|---|---|---|
| C# `Qdb.SurveyEngine` assembly, branch (dotnet-coverage, same tool as 2.1) | 59.1% | **80.05%** | 221 → 411, all pass | `f1ff9d0a`, `b3df1621` |
| On-prem `survey-checks.js`, branch | 48% | **97.2%** | 47 → 101, all pass | `1de422de` |
| On-prem `survey-onprem-transforms.mjs` / `form-engine-patch.mjs`, branch | — | 94.2% / 81.8% | (same run) | — |

- Both C# numbers were measured by MSS from the real reports, the baseline at `ad474a04` in a separate checkout. 80.05% clears the target by a thin margin: a future change that adds untested branches will drop below it.
- New tests cover the risks in section 5: RISK-01 (anonymise for account **and** contact, paging), the duplicate-submit retry paths, the fatigue-day and token-expiry boundaries (exact equality), the milestone source with no type field, and the suppression-log write failure.
- Code review (`code-reviewer`, 2026-11-13) found four duplicate tests, one fatigue test that would also pass on a silent no-op, a hand-rolled clock sequence and real-clock dates. All were fixed in `b3df1621`, and the 3,105-line test file was split into 13 per-subject files (≤ 402 lines). The strengthened fatigue test passes, so no defect was found.
- Still true: the anonymise **contact** path is now unit-tested but has never run against an org (HL). It stays a test-org check in runbook stage 9.

---

## 3. FR / NFR Coverage Map

| FR / NFR | Description | Unit test? | E2E / live-org? | Gap |
|---|---|---|---|---|
| FR-CSE-001 | Source rows read at runtime | Yes (SurveyConfigRepository faked) | Yes (B2) | Adapter untested |
| FR-CSE-002 | Unlimited sources | Yes (activation unit) | Yes (B4) | None |
| FR-CSE-003 | Auto-registration | Yes (SourceActivationService, 97% branch) | Yes (B4) | StepRegistry 0% |
| FR-CSE-004 | Option codes from metadata | Yes (TriggerCodeValidator, 75% branch) | Yes (B4) | OptionCodeReader 0% |
| FR-CSE-005 | Seed rows | Yes (provisioning tests) | Yes (provisioning deploy) | None |
| FR-CSE-006 | Per-org config | Implicit in all trigger tests | Yes (org seed) | None |
| FR-CSE-007–018 | Setup CRUD, delivery, window, expiry | Setup properties: validated in activation unit tests | B2–B5 e2e | Setup form (CRM) not unit-tested |
| FR-CSE-019 | Form Type = Survey | Yes (DFE Vitest) | Yes (B0 deploy) | None |
| FR-CSE-020–022 | Survey questions, order, Arabic | DFE Vitest for order and type logic | B6 e2e (renders form) | Arabic RTL not automated |
| FR-CSE-023 | SRV- prefix guard | Yes (DFE Vitest) | Yes (B0) | None |
| FR-CSE-024 | Save-defect fix (4 properties) | Yes (DFE Vitest) | Yes (B0 live-org) | None |
| FR-CSE-025 | Regression gate | Gate script exists | Runs before every DFE deploy | None |
| FR-CSE-026–030 | Event triggers, transition check | Yes (221 C# tests incl. TriggerMatcher 87%, RecordChange 100%) | Yes (B2) | Plugin entry point 17% |
| FR-CSE-027 | Outside→inside only | Yes (TriggerRules.TriggerMatcher) | Yes (B2) | None |
| FR-CSE-028 | Inside→inside no double fire | Yes | Yes (B2) | None |
| FR-CSE-029 | Record created trigger | Yes (SurveyTriggerService tests) | Yes (B2) | None |
| FR-CSE-030 | Async, never blocks save | Yes (async step registration confirmed) | Yes (B2 observer) | None |
| FR-CSE-031–033 | Scheduled triggers, calendar dates, idempotency | Yes (ScheduleCalendar 83%, ScheduledCandidateBuilder 86%) | Yes (B5) | RunDueSurveysService 50% branch |
| FR-CSE-034–039 | Milestone triggers | Yes (MilestoneRule 100%, B3RulesTests) | Yes (B3) | MilestoneCounter 56% branch |
| FR-CSE-040–043 | Fatigue, postpone, priority | Yes (FatiguePolicy 100%, PriorityRule 88%) | Yes (B3) | Exact boundary (day=N) |
| FR-CSE-044 | Dedupe one invitation | Yes (DedupeKey 100%, alt-key 412 handling) | Yes (B2, B5) | None |
| FR-CSE-045–046 | Invitation generate + version pin | Yes (InvitationFactory 100%) | Yes (B2) | FormPinner 75% branch |
| FR-CSE-047 | Portal delivery — pending API | Yes (PendingSurveyLister 75% branch) | Yes (B6) | None |
| FR-CSE-048 | SMS hand-off | Yes (InvitationDispatchService 81%) | Yes (B7) | SmsHandOff 0%, DispatchStore 0% |
| FR-CSE-049 | Email activity | Yes (InvitationDispatchService 81%) | Yes (B7) | EmailSender 0% |
| FR-CSE-050 | Secure link single-use + expiry | Yes (LinkToken 75%, LinkTokenValidator 75%) | Yes (B6) | Exact-boundary token edge |
| FR-CSE-051 | List pending surveys API | Yes (PendingSurveyLister 75%) | Yes (B6) | IntegrationInvitationStore 0% |
| FR-CSE-052 | Get survey API | Yes (SurveyReader 70%) | Yes (B6) | None |
| FR-CSE-053 | Submit response API | Yes (ResponseSubmitter 75%) | Yes (B6) | Concurrent submit retry path |
| FR-CSE-054 | Validate token API | Yes (LinkTokenValidator 75%) | Yes (B6) | None |
| FR-CSE-055 | Renderer + docs delivery | Docs reviewed | B6 (renderer end-to-end) | None |
| FR-CSE-056 | Response + Answer rows | Yes (ResponseSubmitter) | Yes (B6) | ResponseWriter 0% |
| FR-CSE-057 | CRM views and Excel export | Manual (B8 e2e reads views) | Yes (B8) | None |
| FR-CSE-058 | Retention delete/anonymise | **No test** | B5 no-op run only | **GAP — ResponseRetentionStore 0%** |
| FR-CSE-059–060 | Roles: Admin, Analyst | Provisioning tests (role payloads) | B6 security assertions | No role-enforcement E2E |
| NFR-CSE-001 | Suppression log every drop | Yes (SuppressionRecorder 50% branch) | Yes (B2, B3, B5, B7) | SuppressionLogWriter 0% (data) |
| NFR-CSE-002 | At most one invitation | Yes (DedupeKey) | Yes (B2, B5) | None |
| NFR-CSE-003 | Pinned version renders | Yes (FormPinner 75%) | Yes (B6) | None |
| NFR-CSE-004 | Removability | Code analysis (see A2) | Not run on live org | Needs disposable org test |
| NFR-CSE-005 | New source = config only | Yes (activation unit tests) | Yes (B4) | None |
| NFR-CSE-006 | p95 < 10 s, daily run fits one exec | Not measured | Not measured | A3 design below |
| NFR-CSE-007 | 80% branch | 80.05% assembly-wide (was 59.1%) | — | PASS (see 2.6) |
| NFR-CSE-008 | PDPPL + residency | Compliance gate (open) | Not applicable yet | B1–B3 in go-live checklist |
| NFR-CSE-009 | Secure-link security review | Channel disabled by default | Security engineer gate | B4 in go-live checklist |

---

## 4. Code-Level Risk Review

Edge cases ranked by risk. These are gaps in the current test suite with ≥ 80% confidence.

### RISK-01 — ResponseRetentionStore: no unit coverage; contact path never run
**Confidence: 95%**
`ResponseRetentionStore.cs` has 0% **unit** coverage. The anonymise mode clears the org's customer lookup (`qdb_customer_id` or `qdb_customer_contact_id`, per Survey Settings), `qdb_answers_json` and Answer text: PII fields.

Correction (QA lead, 2026-11-13): the path is **not** untested at every level. `e2e/b5-run-due-surveys-e2e.mjs` scenario C runs Delete and Anonymise live on org5869857f and checks that customer, JSON and answer text are cleared and the numeric answer kept. That run used **account** customers only. The **contact** case (HL CRM) has never run anywhere: no unit test, and no live org with Customer Table = Contact.

The domain service (`RetentionPass`) has 86% branch coverage, but it delegates all data operations to the store. The store's FetchXml queries for responses older than the period, and the update/delete batching, have never been exercised.

**Proposed tests:** TC-RET-001: `RetentionPass` with a mock `IResponseRetentionStore` that records which records were anonymised — verify customer_id, answers_json cleared; TC-RET-002: same with Delete mode.

### RISK-02 — Concurrent submit: Close() retry path untested
**Confidence: 90%**
`ResponseSubmitter.Close()` has a retry path for the case where `TryClose` returns false (another concurrent process modified the invitation between the response write and the status flip). The retry re-reads the invitation via `FindById` and tries once more. Within that path, there is an untested branch: `FindById` returning null (the invitation was deleted between the two calls). This would throw `SurveyApiException.NotFound` rather than `AlreadySubmitted`, which is the correct behaviour but is unverified.

Additionally, the case where the second `TryClose` also fails (truly concurrent double-submit) throws `AlreadySubmitted`. Neither branch of the retry is covered (the test suite exercises the happy path and the duplicate-alt-key path, but not the mid-flight retry).

**Proposed test:** TC-SUBMIT-001: `ResponseSubmitter` where `IInvitationRepository.TryClose` returns false on first call and the invitation is gone on `FindById` — expect `NotFound`. TC-SUBMIT-002: second `TryClose` also fails — expect `AlreadySubmitted`.

### RISK-03 — Fatigue exact boundary (day = fatigue_min_days)
**Confidence: 85%**
`FatiguePolicy` has 100% branch coverage, but the test parameterisation for the boundary day (exactly `fatigue_min_days` days ago) has not been verified. The `IsBlocked` logic uses `>=` or `>` — a one-off in the direction means a customer surveyed exactly 30 days ago is blocked when they should be eligible. The existing tests cover "inside" and "outside" but not the exact boundary value.

**Proposed test:** TC-FAT-001: `FatiguePolicy.IsBlocked` with last invitation exactly `fatigue_min_days` days ago — verify not blocked.

### RISK-04 — Token expiry at exact boundary
**Confidence: 85%**
`LinkTokenValidator` has 75% branch coverage. The expiry check is `now < invitation.ExpiresOn`. A token presented at exactly `ExpiresOn` (to the millisecond) should be refused, but the test suite doesn't cover this exact boundary — only clearly expired and clearly valid cases. Under clock skew between the portal server and CRM, this matters.

**Proposed test:** TC-TOKEN-001: `LinkTokenValidator` with `now == ExpiresOn` — expect refused; TC-TOKEN-002: `now == ExpiresOn - 1ms` — expect valid.

### RISK-05 — Milestone live-count: type filter with empty type field on a source
**Confidence: 85%**
`MilestoneCounter.BuildFetchXml` has 56% branch coverage. The uncovered branch is: source has no type field (`qdb_type_field` is empty) AND the milestone settings define type values. In this case, the type filter should be omitted, not applied. The current code guards this with `!string.IsNullOrWhiteSpace(fields.Type)`. If this guard ever drifts (e.g. a future refactor), milestones would fire for all records regardless of type.

**Proposed test:** TC-MILE-001: `MilestoneCounter.BuildFetchXml` with empty type field + non-empty type_values — assert type filter not in the XML.

### RISK-06 — SuppressionRecorder: 50% branch on the recorder itself
**Confidence: 85%**
`SuppressionRecorder` has 50% branch coverage. The uncovered branch is the error-handling path: if writing the suppression log row fails, the recorder must not propagate the exception (the suppression log is append-only but non-critical; a failed write should be logged, not thrown). NFR-CSE-001 says "nothing is dropped silently" — but if the suppression log write itself throws, the outer catch must absorb it. This path is not tested.

**Proposed test:** TC-SUP-001: `SuppressionRecorder` where the underlying store throws — verify no exception propagates to the caller.

### RISK-07 — Account vs contact: customer resolution with wrong target entity
**Confidence: 80%**
`CustomerLink` resolves the customer from the source record's `EntityReference`. If the target entity in the reference does not match the org's configured customer table (e.g. a contact reference arrives on an account org), the invitation is created with a contact reference, and the portal API (`ListPendingSurveys`) may not find it when querying by account id. The domain class reads the reference polymorphically, which is correct, but no test verifies the mismatch scenario.

**Proposed test:** TC-CUST-001: `InvitationAccess.Open` with an invitation whose `customer_id` reference is `contact` on an org configured for `account` — verify the API's customer-match check rejects it.

### RISK-08 — Scheduled trigger population: "all active customers" is statecode = 0 only
**Confidence: 80%**
`CustomerPopulationReader` has 70% branch coverage. The "all active customers" population reads accounts or contacts with `statecode = 0`. The gate question D5 in the go-live checklist confirms QDB's definition of "active customer". If the business defines "active" differently (e.g., only accounts with an open disbursement), the daily run would over-invite. This is a configuration gap, not a code defect, but the test suite never asserts the statecode filter value. A future change to the reader would not be caught.

**Proposed test:** TC-POP-001: `CustomerPopulationReader` FetchXml assertion — verify statecode = 0 filter is present.

---

## 5. A2 — NFR-CSE-004: Removability Test Design

**Constraint:** No solution uninstall on org5869857f. The design below separates read-only analysis (can be run now) from the full rehearsal (needs a disposable org, requires CEO go-ahead).

### Part A — Code dependency analysis (read-only, done)

**What was checked:** Whether any DFE production TypeScript imports from the SurveyEngine solution at compile time.

**Method:** `grep -r "import.*survey|require.*survey|from.*survey"` over all DFE `.ts` / `.tsx` production files (excluding tests).

**Findings:**
- `designer/src/validation/publishValidation.ts` and `draftValidation.ts` import `./surveyFormCode` — a file within the DFE solution, not from SurveyEngine.
- `frontend/webresource/formApi.ts` imports `./xrm/surveyApi` — also within DFE.
- `frontend/webresource/main.tsx` imports `./xrm/surveyApi` and `../src/engine/surveySubmission` — both within DFE.
- No DFE file imports from an external SurveyEngine package or references any `qdb_srv_*` name at the TypeScript module level.

**Conclusion:** The DFE has no compile-time dependency on SurveyEngine. At runtime, `formApi.ts` calls the survey Custom APIs (e.g., `qdb_srv_GetSurvey`) only when `getActiveSurvey()` returns non-null, which only happens when the host page calls `startSurvey()`. A standard form never calls `startSurvey()`, so removing SurveyEngine leaves every standard DFE form working unchanged.

**What this proves:** Code-level removability (compile-time and runtime-activation). **What it does not prove:** That the solution uninstall itself succeeds, that no solution dependency blocks it, or that existing SurveyEngine configuration data is handled cleanly.

### Part B — Solution dependency query (read-only, RUN 2026-11-13)

**Tool:** `GET RetrieveDependenciesForUninstall(SolutionUniqueName='SurveyEngine')` on org5869857f (read-only; run by the
lead engineer after this phase's first draft, which had held it back).

**Result: 0 dependencies.** No component outside SurveyEngine (Form Engine or any other solution on the org) depends on a
SurveyEngine component.

**Caveat (QA lead, 2026-11-13):** SurveyEngine is an **unmanaged** solution on the cloud org and in the on-prem kit. Deleting
an unmanaged solution removes only the solution record; its tables, plugin, Custom APIs, roles, app and views all stay
(runbook stage 10 says so: the real rollback is the database backup). So "remove SurveyEngine" is not a one-step
uninstall, and an empty dependency list proves the *direction* of dependency (nothing needs SurveyEngine), not that a
removal procedure works.

### Part C — Original removal rehearsal (superseded, see Part D)

Kept for the record. Step 4 assumes a solution uninstall removes the components, which is not true for an unmanaged
solution (Part B caveat).

**When:** Before any on-prem go-live, on a disposable cloud org or a snapshot of org5869857f.

**Steps:**
1. Deploy DFE baseline + survey changes (C-6 upgrade order).
2. Create three standard forms (one per form type: standard, survey, check each is published successfully).
3. Record the render-cache JSON for all three as a baseline.
4. Remove the SurveyEngine solution via solution management or `pac solution delete`.
5. Re-publish all forms via `qdb_PublishForm`.
6. Run the FR-CSE-025 regression gate: compare render-cache JSON against baseline, ignoring volatile stamps.
7. Submit a standard form through the DFE runtime — verify submission succeeds and writes to the mapped entity.

**Pass criteria:** No regression gate diff; standard form submission succeeds; survey form returns a 404 on `qdb_srv_GetSurvey` (expected — SurveyEngine is gone).

**Cleanup:** Delete the disposable org, or restore the snapshot. No production data at risk.

**Risk to org5869857f:** High if run there (solution removal is destructive). Do not run Part C on org5869857f without CEO approval and a full data backup.

### Part D — Recommended: prove "Form Engine works without SurveyEngine" without removing anything

NFR-CSE-004's acceptance criterion is "after removal, all Form Engine forms still publish and render". Parts A and B show
nothing in the Form Engine depends on SurveyEngine, so the state that matters is **Form Engine (with the survey column
patch and designer/runtime 1.5.0) and no SurveyEngine**. Every on-prem org passes through exactly that state during the
runbook, between stage 2 (Form Engine update) and stage 4 (SurveyEngine import).

1. Add a render-cache snapshot and a re-publish check after stage 2 (the console scripts already take render-cache
   snapshots; `compare-reports.mjs` already compares them), on each test org.
2. Pass: every published form's render cache is unchanged by stage 2, and a re-publish of three sample forms (standard,
   one with a grid, one with scoring columns unset) succeeds and renders in the runtime.
3. Run it on HL test and QDB1 test as part of their runbook windows: no extra org, no destructive step, no change to
   org5869857f.

**What it proves:** the Form Engine publishes and renders with no SurveyEngine present, on the real 9.1 target.
**What it does not prove:** a component-by-component removal procedure. If the CEO wants removal itself proven, it needs
a disposable org and a written removal script (Custom APIs and steps, then the assembly, the app and view, roles, then
the tables), which does not exist today.

---

## 6. A3 — NFR-CSE-006: Performance Test Design

**NFR:** Async trigger p95 < 10 s; the daily run handles the full customer base (~450 customers) in one execution.

**Constraint:** No writes to org5869857f without CEO go-ahead. The design below is executable once approved.

### Part A — Async trigger p95 measurement

**Setup:**
1. Create 20 test accounts on the cloud org (account names prefixed `PERF-TEST-` for easy cleanup).
2. Configure one event trigger on `qdb_payment_authorization_ticket` (Disbursements), status set to `Payment Processed` (statuscode value from B2 test run).
3. Seed 20 disbursement records (one per account) with an initial status outside the trigger set.

**Measurement:**
4. Record wall-clock time `t0`.
5. Bulk-update all 20 disbursement records to the trigger status (via a loop or batch, one update per second to avoid burst throttling).
6. For each update, poll `qdb_survey_invitation` until the invitation for that record appears, recording the elapsed time since the update. Timeout at 60 s.
7. After all 20 invitations appear, compute p95 latency.

**Pass criteria:** p95 ≤ 10,000 ms. If any invitation does not appear within 60 s, the test fails.

**Cleanup:** Delete the 20 accounts, their disbursement records, and the resulting invitations (or use a dedicated test setup that isolates them from production data).

**Volume note:** 20 events is sufficient to establish p95 at this throughput. The expected volume is ~900 events/month (~30/day); 20 simultaneous events is a stress of the daily peak, not an artificial overload.

### Part B — Daily run time budget

**Setup:**
1. Seed 450 test accounts on the cloud org (or use an existing dataset if available).
2. Configure one quarterly scheduled trigger.
3. Set the trigger date to today (temporarily, for the test run).

**Measurement:**
4. Record wall-clock time `t0`.
5. Call `qdb_srv_RunDueSurveys`.
6. Poll `IsComplete` until true, recording total elapsed time.
7. Count the invitations created and compare to 450.

**Pass criteria:** Completes in one execution (no need to call `IsComplete` a second time for a fresh batch); all 450 invitations created; total time < 90 s (a comfortable margin below the Custom API's absence of a hard 2-minute limit, and allowing for Dataverse latency).

**Cleanup:** Delete the 450 test accounts and resulting invitations. Set the trigger date back to its production value. The test must not corrupt other products' data — use accounts prefixed `PERF-TEST-`.

**Risk to org5869857f:** Creating 450 accounts risks polluting the shared test org. Alternative: run Part B on a disposable org, using the same seed approach as Part C of A2.

### Results — run on org5869857f, 2026-11-13 21:14 UTC (CEO go-ahead: "both, test data only")

Script: `e2e/a3-performance.mjs --apply` (commits `299badb4`, `b2723064`; reviewed twice before the run). Guards held
(no active setup, retention off, no Postponed invitation, empty review quarter 2020-Q1, no leftovers); invitation dispatch
was off for the run. Afterwards every switch was back as before, and 470 invitations, 470 disbursements, 470 accounts and the
test setup and trigger were deleted, with 0 rows left. An independent read-only probe confirmed the org matched its pre-run
state (42 active accounts, the same step and source states). No failed plugin jobs.

| Part | Target | Result | Verdict |
|---|---|---|---|
| A trigger latency, 20 status changes 1 s apart (server timestamps, 1 s resolution) | p95 ≤ 10 s, none > 60 s | **p95 14 s**; max 46 s; none missing; median 3 s; 16 of 20 within 10 s | **FAIL** (p95) |
| B daily run, 450 customers active in 2020-Q1 | one call, 450 invitations, < 90 s | **one call, 450 invitations, 24.4 s** | **PASS** |

Part A, in order of the status changes (s): 11, 6, 14, 12, 7, 46, 4, 3, 0, 4, 3, 0, 0, 3, 1, 1, 3, 1, 1, 0. All six slow values
are the first six changes; the other fourteen took 0–4 s. That pattern fits the cloud's shared asynchronous service picking up
a burst, not the plugin's own work. The platform gives no latency guarantee for asynchronous plugins. On-prem 9.1 timing depends
on each org's Asynchronous Processing Service settings and load, so this cloud run does not settle NFR-CSE-006 for release 1
(on-prem). **The decision on how to close it is the CEO's.**

**CEO decision, 2026-11-13: measure on-prem.** The 10 s target stays. A3 closes when the trigger speed passes on HL
test and QDB1 test, measured with the kit's `trigger-speed-test.ps1` (runbook 9.3, part of Gate 3). It uses the same
method as the cloud run, on records QDB IT prepares in the activated source's table. The cloud result above is
information only.

**Script proven on cloud, 2026-11-14** (CEO go-ahead; `e2e/a3-performance.mjs --apply --prove-onprem-script`). The
kit's `trigger-speed-test.ps1` ran against org5869857f on 20 prepared records. The first attempt stopped at the record
query: a PowerShell 5.1 runtime fault in the name filter, which the parse check could not catch. Nothing had moved,
and the clean-up was complete. It was fixed in `4107c01b`, and every read path was then re-run read-only. The second
attempt passed **9/9**: T1–T2, P1–P4, sending off and restored (R1), 20 of 20 caused invitations deleted (R2), and S1
p95 10 s, max 12 s, none missing. Its harness then deleted the 20 test records and accounts, leaving 0 rows. An
independent probe confirmed the org matched its pre-run state. The two cloud measurements (p95 14 s, then 10 s) differ
between runs, which supports measuring on the target orgs.

---

## 7. Test Cases (Representative Set)

Traceability note: The existing test suite uses descriptive method names that reference behaviour but not FR-CSE IDs (the traceability gate uses `FR-NNN` pattern, not `FR-CSE-NNN`; this is a gate limitation, not a code gap). New tests proposed here carry the FR/NFR ID in the name per Article XV.

### Critical Gaps (proposed new tests)

```
TC-RET-001: [FR-CSE-058] RetentionPass_AnonymiseMode_ClearsCustomerIdAndPii
Given: a response older than retention_days with customer_id and answers_json set
When: RetentionPass runs with mode=Anonymise
Then: the store receives an anonymise command for that response id; customer_id and answers_json are cleared
Priority: Critical
Type: Unit

TC-RET-002: [FR-CSE-058] RetentionPass_DeleteMode_RemovesResponseAndAnswers
Given: a response older than retention_days
When: RetentionPass runs with mode=Delete
Then: the store receives a delete command for that response and all its answers
Priority: Critical
Type: Unit

TC-SUBMIT-001: [FR-CSE-053] ResponseSubmitter_InvitationGoneAfterResponseWrite_ThrowsNotFound
Given: TryClose returns false; FindById returns null
When: Submit is called
Then: SurveyApiException.NotFound is thrown
Priority: High
Type: Unit

TC-SUBMIT-002: [FR-CSE-053] ResponseSubmitter_ConcurrentDoubleSubmit_ThrowsAlreadySubmitted
Given: TryClose returns false on both attempts
When: Submit is called
Then: SurveyApiException.AlreadySubmitted is thrown
Priority: High
Type: Unit

TC-FAT-001: [FR-CSE-040] FatiguePolicy_LastInvitationExactlyAtBoundary_IsNotBlocked
Given: last invitation exactly fatigue_min_days days ago
When: IsBlocked is evaluated
Then: returns false (the customer is eligible)
Priority: High
Type: Unit

TC-TOKEN-001: [FR-CSE-050] LinkTokenValidator_TokenPresentedAtExactExpiry_IsRefused
Given: now == invitation.ExpiresOn
When: Validate is called with the token
Then: validation fails with reason "expired"
Priority: High
Type: Unit

TC-MILE-001: [FR-CSE-035] MilestoneCounter_EmptyTypeFieldWithTypeValues_OmitsTypeFilter
Given: source has empty qdb_type_field; milestone settings define type values
When: BuildFetchXml is called
Then: the resulting FetchXML contains no type condition
Priority: High
Type: Unit

TC-SUP-001: [NFR-CSE-001] SuppressionRecorder_LogWriteFails_DoesNotPropagate
Given: the suppression log writer throws an exception
When: SuppressionRecorder.Record is called
Then: no exception is thrown to the caller
Priority: High
Type: Unit

TC-CUST-001: [FR-CSE-050] InvitationAccess_ContactReferenceOnAccountOrg_RefusesAccess
Given: an invitation with customer_id referencing a contact; caller supplies an account id
When: Open is called
Then: SurveyApiException.Forbidden is thrown
Priority: Medium
Type: Unit
```

### Live-org mandatory tests (not new — these are the existing B2–B8 scripts with their FRs)

```
TC-LIVE-001: [FR-CSE-026,027,028,030] Event trigger outside→inside fires; inside→inside does not
Given: a live disbursement record on the cloud org with a status outside the trigger set
When: the status is updated to a value inside the set
Then: one invitation is created; a second update to another inside-set value creates nothing
Type: E2E (live-org, b2-trigger-e2e.mjs)

TC-LIVE-002: [FR-CSE-040,041,043] Fatigue blocks; milestone wins priority; dropped triggers logged
Given: customer surveyed 20 days ago; a disbursement fires both a milestone and an event trigger
When: the daily job runs
Then: event trigger is dropped and logged; milestone invitation is created (priority wins)
Type: E2E (live-org, b3-fatigue-priority-milestone-e2e.mjs)

TC-LIVE-003: [FR-CSE-033] RunDueSurveys idempotent on same day
Given: a scheduled trigger due today has already been processed
When: RunDueSurveys is called a second time
Then: no duplicate invitations are created
Type: E2E (live-org, b5-run-due-surveys-e2e.mjs)

TC-LIVE-004: [FR-CSE-050,052,053,054] Secure-link: token validates, survey fetches, submit succeeds, token refused on replay
Given: a secure-link invitation with a valid token
When: validate-token → get-survey → submit-response → validate-token (second time)
Then: first three succeed; second validate-token returns reason "used"
Type: E2E (live-org, b6-integration-api-e2e.mjs)

TC-LIVE-005: [FR-CSE-059,060] Analyst can read answers; Admin cannot
Given: a submitted response with answer rows
When: Survey Admin tries to open an Answer record; Survey Analyst tries to open one
Then: Admin receives access-denied; Analyst reads successfully
Type: E2E (live-org, manual verification at B8)
```

---

## 8. Performance Benchmarks

| Scenario | p95 Target | Throughput | Volume | Tool | Status |
|---|---|---|---|---|---|
| Async trigger evaluation (event plugin) | < 10,000 ms | 1 event/s | 20 events (burst) | Manual timing against org | Not yet measured |
| Daily run — full scheduled batch | Complete in one execution | 450 invitations | 450 test accounts | Manual timing, `IsComplete` poll | Not yet measured |
| Integration API: `ListPendingSurveys` | < 2,000 ms p95 | 1 req/s | 1 customer, up to 10 invitations | Manual curl timing | Not yet measured |
| Integration API: `SubmitResponse` | < 3,000 ms p95 | 1 req/s | 10-question form | Manual curl timing | Not yet measured |

None of the performance targets have been measured. They are nominated targets consistent with the BRD volume (section 9.2) and the architecture (section 7.3). The go-live checklist A3 gate remains open.

---

## 9. Definition of Done

Before any feature is considered complete for release:

- [ ] All 221 C# tests pass
- [ ] All 64 provisioning JS tests pass
- [ ] All 47 on-prem JS tests pass
- [ ] DFE Vitest suite passes (survey additions: FR-CSE-019, 023, 024, FR-CSE-053 submit branch)
- [ ] FR-CSE-025 regression gate passes (no diff on existing forms after a DFE deploy)
- [ ] Live-org smoke test passes on the cloud org (B2–B8 scripts)
- [ ] Live-org smoke test passes on each on-prem test org (`smoke-test.ps1 -WriteTest`)
- [x] NFR-CSE-007: branch coverage measured and recorded (80.05% assembly-wide on 2026-11-13, was 59.1%; section 2.6)
- [x] A2 (NFR-CSE-004) Part B: solution-dependency query returned empty (2026-11-13)
- [ ] A2 (NFR-CSE-004) Part D: Form Engine re-publish and render with no SurveyEngine present, on HL test and QDB1 test (between runbook stages 2 and 4). **CEO chose Part D, no removal rehearsal (2026-11-13).** Built into the kit: runbook steps 2.5–2.7 and Gate 1b, `survey-stage2-check.console.js` (S1 = SurveyEngine absent, Q7–Q10, render cache snapshot), `compare-reports.mjs --expect-changed`
- [ ] A3 (NFR-CSE-006): trigger p95 and daily run measured against targets. **Measured on cloud 2026-11-13: daily run PASS (24.4 s, one call, 450); trigger p95 14 s FAIL vs 10 s** (section 6 Results); **CEO 2026-11-13: measure on-prem**, runbook 9.3 `trigger-speed-test.ps1` on HL test and QDB1 test
- [ ] Security defects: none Critical/High open (sec-link channel disabled until NFR-CSE-009 signed)
- [ ] PDPPL sign-off on file (B2 in go-live checklist)
- [ ] Retention period set by QDB Compliance (B1 in go-live checklist)

---

## 10. Automation Plan

| Test suite | Automated? | CI stage | Manual only when |
|---|---|---|---|
| C# xUnit (221 tests) | Yes | PR build, main merge | — |
| Provisioning JS (64 tests) | Yes | PR build | — |
| On-prem JS (47 tests) | Yes | PR build | — |
| DFE Vitest (designer) | Yes | DFE PR build | — |
| FR-CSE-025 regression gate | Yes (gate script) | DFE deploy pipeline | — |
| B2–B8 e2e scripts | Manual (needs live org, test data) | Pre-release only | Always (live org required) |
| A2 Part B: dependency query | Manual (read-only, one time) | Pre-release | One-time, needs approval |
| A2 Part C: removal rehearsal | Manual (disposable org) | Pre-release | Needs disposable org + approval |
| A3: performance timing | Manual (live org, test data) | Pre-release | Needs seeded test accounts + approval |
| TC-LIVE-005: role enforcement | Manual (CRM session) | Pre-release | CRM role test requires real user sessions |

---

## Defects

| ID | Description | Severity | FR / NFR | Status |
|---|---|---|---|---|
| DEF-QA-001 | `survey-checks.js` branch coverage 48%: most preflight checks (P4–P12) and the configuration-name checks are uncovered by unit tests (they ran against the cloud org, not in the suite). An uncovered branch could print a false PASS on an on-prem org. | Medium | NFR-CSE-007 | **Closed** 2026-11-13: 97.2% branch, `1de422de` |
| DEF-QA-002 | `ResponseRetentionStore` has 0% unit coverage. Anonymise is live-verified for account customers (B5 e2e scenario C); the contact case (HL) has never run anywhere. | High | FR-CSE-058, NFR-CSE-007 | **Partly closed** 2026-11-13: unit-tested for account and contact; contact still never run on an org (runbook stage 9 on HL test) |
| DEF-QA-003 | `surveyApi.ts` (XRM bridge: `fetchSurvey`, `submitSurvey`) has no unit test. The survey submit branch is exercised only by the B6 e2e script. Any regression in the XRM bridge would be caught only at e2e stage. | Medium | FR-CSE-053 | Open |
| DEF-QA-004 | Assembly-level branch coverage 59.1% fails NFR-CSE-007. The gap is structural (data/plugin adapter layers); closing it requires either live-org integration tests in CI or a scope clarification on the NFR. | High | NFR-CSE-007 | **Closed** 2026-11-13: 80.05% with Moq-based adapter tests (section 2.6) |

---

VERIFICATION
  criterion:  A4 coverage measurement (NFR-CSE-007) — branch rate from a real coverage report
  command:    dotnet-coverage collect "dotnet test Qdb.SurveyEngine.Tests/Qdb.SurveyEngine.Tests.csproj --no-build" --output "qa/coverage/csharp/coverage.xml" --output-format cobertura (run from crm-plugins/); then node --test --experimental-test-coverage provisioning/__tests__/*.test.mjs; node --test --experimental-test-coverage onprem/__tests__/*.test.mjs
  output:     C#: 221 passed, 0 failed. Branch rate (Qdb.SurveyEngine assembly): 59.1% (807/1289 branches). Branch rate (Qdb.SurveyEngine.Tests): 92.6%. Provisioning JS: 64 passed, branch 93.1%. On-prem JS: 47 passed, branch 67.1% (survey-checks.js: 48%).
  result:     FAIL — 59.1% assembly-wide branch rate is below the 80% NFR-CSE-007 target
  unverified: A2 Part B (solution dependency query — read-only, needs approval); A2 Part C (removal rehearsal — disposable org, needs approval); A3 performance targets (not measured, needs live-org write approval); TC-LIVE-001 to TC-LIVE-005 (live-org e2e scripts — not re-run in this phase, need go-ahead); DFE Vitest suite count not measured in this session (the files exist and are integrated into the DFE build); FR-CSE-059/060 role enforcement not automated

---

# Addendum C — QA: PDPPL Retention, Anonymise Fix and Erasure API (BRD v1.4)

| | |
|---|---|
| Prepared by | MSS Technologies, QA Engineer |
| Version | 1.1 (appends phase-5-qa.md v1.0) |
| Date | 2026-11-15 |
| Status | **PASS WITH CONDITIONS** |
| Inputs | `phase-2-ba-addendum-pdppl-retention-erasure.md` (FR-CSE-076..082, NFR-CSE-011..014, BR-PDR-01..04); `phase-3-arch.md` Addendum C (R1–R7, OQ-C1/C2/C3); `adr/ADR-008-erasure-api-execution-and-authorisation.md`; branch `feat/survey-pdppl-erasure` (commits through `6b9817c5`) |
| Coverage file | `crm-plugins/coverage-out/coverage-full.xml` (dotnet-coverage, cobertura format, 2026-11-15) |
| Test counts | 481 C# (xUnit, +70 from Addendum C), 88 provisioning JS (+24), 131 on-prem JS (+30) |

---

## AC-1 Traceability Matrix

Each row maps a BRD requirement to its unit tests, any live evidence, and the current verification status.

### Group M — Invitation and suppression-log retention (FR-CSE-076, 077, 078)

| ID | Requirement | Unit tests (file: class / method) | Live evidence | Status |
|---|---|---|---|---|
| FR-CSE-076 | Daily pass deletes invitations older than retention period | `RetentionExtensionTests.cs: RetentionFloorTests.RunInvitations_RetentionDaysBelowFloor_DeletesInvitationsOlderThanFloor`; `RetentionThreeStepTests.Run_AllThreeSteps_ProcessesResponsesInvitationsAndSuppressionLogs`; `InvitationRetentionStoreDataTests.FindGeneratedBefore_ReturnsOnlyOlderInvitations`, `FindGeneratedBefore_QueriesOnGeneratedOnColumn`, `Delete_CallsServiceDeleteOnTheSurveyInvitationEntity` | `erasure-e2e.mjs` confirmed invitation deletion live (B1 scenario) | **Verified** |
| FR-CSE-077 | Daily pass deletes suppression-log rows older than retention period | `RetentionExtensionTests.cs: RetentionFloorTests.RunSuppressionLogs_RetentionDaysBelowFloor_DeletesLogsOlderThanFloor`; `SuppressionLogRetentionStoreDataTests.FindCreatedBefore_ReturnsOnlyOlderLogs`, `FindCreatedBefore_QueriesOnCreatedOnColumn`, `Delete_CallsServiceDeleteOnTheSurveySuppressionLogEntity` | `erasure-e2e.mjs` confirmed suppression-log deletion live (A2, B1) | **Verified** |
| FR-CSE-078 | Floors: invitations ≥ 395 days, suppression logs ≥ 365 days at runtime | `RetentionFloorTests.RunInvitations_RetentionDaysBelowFloor_ProtectsInvitationsNewerThanFloor`; `InvitationFloorDays_IsThirteenMonthsInDays`; `SuppressionLogFloorDays_IsTwelveMonthsInDays`; `RunInvitations_RetentionDaysAboveFloor_UsesRetentionDays`; `RunInvitations_RetentionDaysAboveFloor_DeletesInvitationsOlderThanSetting` | Not run live (no rows old enough on the test org) | **Partly verified** — unit-tested on both sides of both floors; live deletion of old rows not exercised (see AC-4.1) |

### Group N — Anonymise fix (FR-CSE-079, 080)

| ID | Requirement | Unit tests | Live evidence | Status |
|---|---|---|---|---|
| FR-CSE-079 | Anonymise clears `qdb_survey_invitation_id`, `qdb_source_table`, `qdb_source_record_id` from response | `ResponseRetentionStoreTests.cs: Anonymise_AccountOrg_NullsTheInvitationId_SourceTable_SourceRecordId`; `Anonymise_ContactOrg_NullsTheInvitationId_SourceTable_SourceRecordId`; retains `qdb_survey_setup_id` / `qdb_form_code` verified implicitly (not in the update payload) | `erasure-e2e.mjs` scenario A2: `_qdb_survey_invitation_id_value`, `qdb_source_table`, `qdb_source_record_id` all null on both anonymised responses, plus architecture R1 (null on two responses with alternate-key — no 412) | **Verified** |
| FR-CSE-080 | No CRM view or query joins responses to invitations via `qdb_survey_invitation_id` | Architecture C.2.2 audit: all analyst views and charts already join via `qdb_survey_setup_id`; response main form field removed in provisioning; no C# code reads the invitation link for reporting | No automated test; static analysis in `phase-3-arch.md` C.2.2 | **Partly verified** — static audit complete; not covered by an automated assertion; the `qdb_response_invitation` alternate-key null behaviour on a live org is R1 (see AC-4.4) |

### Group O — Erasure API (FR-CSE-081, 082)

| ID | Requirement | Unit tests | Live evidence | Status |
|---|---|---|---|---|
| FR-CSE-081 AC1 | Dry run returns exact found counts, `AreActual = false`, no rows changed | `CustomerErasureServiceTests.cs: Erase_DryRun_ReturnsFoundCounts_WithAreActualFalse`; `Erase_DryRun_MutatesNothingButWritesOneLogRow`; `Erase_DryRun_LogRowHasDryRunTrueAndAreActualFalse` | `erasure-e2e.mjs` scenario A1: dry run returned 2/2/2/1 counts, nothing changed, one log row with `qdb_dry_run=true` | **Verified** |
| FR-CSE-081 AC2 | Live Delete removes all found rows | `Erase_DeleteMode_DeletesEachInvitation`; `Erase_DeleteMode_DeletesSuppressionLogs`; `Erase_DeleteMode_ReturnsAreActualTrue`; `Erase_DeleteMode_IsCompleteTrue_WhenAllDataErased` | `erasure-e2e.mjs` scenario B1: all invitations, responses, answers, suppression logs gone; two log rows | **Verified** |
| FR-CSE-081 AC3 | Live Anonymise: invitations/suppression logs deleted; responses anonymised per FR-CSE-079 | `Erase_AnonymiseMode_AnonymisesResponsesBeforeDeletingInvitations`; `Erase_AnonymiseMode_DeletesSuppressionLogsAfterInvitations`; `Erase_AnonymiseMode_DoesNotDeleteResponses` | `erasure-e2e.mjs` scenario A2 | **Verified** |
| FR-CSE-081 AC4 | Unknown CustomerGuid returns all-zero counts | `Erase_UnknownCustomer_ReturnsZerosAndIsComplete`; `Erase_RepoReturnsNoData_ReturnsZerosAndIsComplete` | Covered implicitly by B2 (rerun on already-erased customer) | **Verified** |
| FR-CSE-081 AC5 | Wrong org's customer type returns zero counts, no error | `Erase_RepoReturnsNoData_ReturnsZerosAndIsComplete` (repo returns nothing because the wrong lookup column filters to zero) | NFR-CSE-014 cross-org safety tested unit-only; no live cross-org run | **Partly verified** — unit-tested; not run live with a contact GUID on an account org |
| FR-CSE-082 | Only SysAdmin or Survey Data Officer may invoke the API | `ErasureAccessCheckTests.cs: MayErase_SystemAdministrator_IsTrue`; `MayErase_DirectSurveyDataOfficerRole_IsTrue`; `MayErase_SurveyDataOfficerRoleThroughTeam_IsTrue`; `MayErase_NeitherRole_IsFalse`; `MayErase_LooksTheRoleUpByItsName`; `SurveyDataOfficerRoleName_IsTheProvisionedRoleName`; `EraseCustomerSurveyDataPluginTests: Execute_UnauthorisedUser_ThrowsAccessDenied_EvenWhenParametersAreMissing` (SEC-003) | `erasure-e2e.mjs` scenario F: unprivileged user refused, message contains "Survey Data Officer"; no log row written | **Verified** |

### NFRs

| ID | Requirement | Test coverage | Status |
|---|---|---|---|
| NFR-CSE-011 | Daily pass within 90 s at BRD volumes (450 inv + 1,000 supp logs) | No load test run; unit-tested budget exhaustion path (`RetentionThreeStepTests.Run_BudgetExhaustedBeforeFirstItem_ReturnsIsCompleteFalse`); budget-and-rerun mechanism verified correct | **Not verified** — see AC-3.1 |
| NFR-CSE-012 | Erasure API within 2 min at max per-customer volume | No load test run; budget exhaustion unit-tested (`Erase_BudgetExhaustedBeforeFirstItem_IsCompleteFalse`; `Erase_DeleteMode_BudgetExhaustedDuringResiduals_IsCompleteFalse`) | **Not verified** — see AC-3.2 |
| NFR-CSE-013 | Every API call emits a trace entry with required fields | `ErasureLogWriterTests: Write_HappyPath_CreatesOneRow`; `Write_HappyPath_KeepsCallerAndCustomerAsText`; `Write_NullRecord_Throws`; `ErasureLogTable_IsTheProvisionedTableName`; `Erase_LiveRun_WritesTwoAuditRows` (SEC-001); `Erase_LiveRun_WritesStartedRowBeforeAnyMutation`; `Erase_LiveRun_StartedRowHasFoundCountsAndAreActualFalseAndIsCompleteFalse`; `Erase_LiveRun_CompletedRowHasAreActualTrueAndIsCompleteTrue`; `Erase_LiveRun_AuditRowsCarryRequestFields` | `erasure-e2e.mjs`: dry-run log row (`qdb_dry_run=true`); started + completed rows verified in A2 and B1; log rows cleaned up at the end | **Verified** |
| NFR-CSE-014 | Works on both HL CRM (contacts) and BFD CRM / QDB1 (accounts) | `ResponseRetentionStoreTests` account + contact variants; `ErasureAccessCheckTests` parametrised; `Erase_RepoReturnsNoData` parametrised | Live on cloud (account org only); on-prem contact org (HL) not yet run | **Partly verified** — unit-tested both `CustomerLink` variants; never run on the HL on-prem contact org |

### Business rules

| ID | Business rule | Test coverage | Status |
|---|---|---|---|
| BR-PDR-01 | Erasure resets milestone counter — accepted as-is | No test needed (accepted risk, no code path to test) | **Not applicable** |
| BR-PDR-02 | Fatigue window reset after erasure — accepted as-is | No test needed | **Not applicable** |
| BR-PDR-03 | Invitations and suppression logs deleted in both modes (cannot be anonymised in place) | `Erase_AnonymiseMode_DoesNotDeleteResponses` (responses kept, only anonymised); `Erase_AnonymiseMode_DeletesSuppressionLogsAfterInvitations` | **Verified** |
| BR-PDR-04 | Invitation deletion may cascade to a response not yet reached by response pass | Covered implicitly by `RetentionThreeStepTests.Run_AllThreeSteps_*`: responses processed first; `RetentionPass` order fixed | **Verified** (order pinned by test) |

---

## AC-2 Coverage

### AC-2.1 C# assembly — Qdb.SurveyEngine (after Addendum C)

Coverage collected via `dotnet-coverage 18.12.0` with a full rebuild on branch `feat/survey-pdppl-erasure` (all 481 tests).

```
dotnet-coverage collect "dotnet test Qdb.SurveyEngine.Tests/Qdb.SurveyEngine.Tests.csproj"
    --output coverage-out/coverage-full.xml --output-format cobertura
  (run from: crm-plugins/)
```

| Metric | Covered | Valid | Rate | Target | Result |
|---|---|---|---|---|---|
| Line | 6,233 | 6,545 | **95.2%** | — | — |
| Branch | 1,275 | 1,587 | **80.34%** | ≥ 80% | **PASS** |

The 70 new Addendum C tests (across `CustomerErasureServiceTests`, `ErasureAccessCheckTests`, `RetentionExtensionTests`, and the two new anonymise-fix tests in `ResponseRetentionStoreTests`) added 298 new branches to the assembly. The branch rate held above 80% because the new code is well-covered. The NFR-CSE-007 target is maintained.

### AC-2.2 JS — provisioning (after Addendum C)

88 tests pass (up from 64). The 24 new tests cover:
- `manifest.test.mjs` Addendum C block: `dataOfficerRoleName_matchesTheSurveyDataOfficerRoleInRoles`; `roles_surveyDataOfficer_grantsOrganizationReadAndErasureLogRead`; `roles_surveyDataOfficer_isDistinctFromSurveyIntegration`; `tables_erasureLog_isNotAuditEnabledAsItIsItselfAComplianceRecord`; `tables_erasureLog_keepsTheCustomerAsTextWithNoLookup`; `tables_erasureLog_hasEveryColumnThePluginWrites`; `roles_surveyDataOfficer_nameMatchesThePluginCheck`; `tables_erasureLog_hasAllTraceColumns`
- `plugin-payloads.test.mjs` Addendum C block: erasure API parameter builders and contract assertions

Branch coverage remains above 93% on provisioning logic (the HTTP client remains deliberately excluded).

### AC-2.3 JS — on-prem tooling (after Addendum C)

131 tests pass (up from 101). The 30 new tests cover the new Q14 check (`checkDataOfficerRole`) in `survey-checks-post-import.test.mjs`:
- `postImport_dataOfficerRoleAndItsBusinessUnitCopies_passesQ14`
- `postImport_secondIndependentDataOfficerRole_failsQ14`
- `postImport_noDataOfficerRole_failsQ14`
- `postImport_dataOfficerRolesUnreadable_warnsQ14`

Plus additional onprem transform and kit-facts coverage for the new `dataOfficerRoleName` fact.

---

## AC-3 Performance (NFR-CSE-011 and NFR-CSE-012)

### AC-3.1 Daily retention pass (NFR-CSE-011): what is proven and what is not

**What is proven (unit tests):**
- The budget-and-rerun mechanism is correct: `RetentionThreeStepTests.Run_BudgetExhaustedBeforeFirstItem_ReturnsIsCompleteFalse` verifies that a zero-allowance budget returns `IsComplete = false` before touching any row.
- The pass is idempotent: a re-run on an empty store returns `IsComplete = true` with zero counts (`Run_NoData_IsComplete`).
- The order (responses → invitations → suppression logs) is pinned by `Run_AllThreeSteps_ProcessesResponsesInvitationsAndSuppressionLogs`.
- The budget is checked between each step (architecture C.1.3 design).

**What is not proven:**
The 90-second wall-clock target at BRD volumes (450 invitations + 1,000 suppression-log rows in one call) has not been measured. The daily pass is an extension of the existing `RetentionPass`, whose Part B timing (450 customers, 24.4 s, one call) was proven on the cloud org on 2026-11-13. The invitation and suppression-log sub-passes add per-row synchronous deletes. At BRD volumes (450 invitations + 1,000 suppression logs = 1,450 additional deletes on top of the existing response pass), the total is bounded by the 90-second `WorkAllowance`. Whether it fits in one call at those volumes must be measured on the on-prem test orgs, because on-prem Dataverse latency per delete is higher than cloud. This is not a code defect; it is an open measurement.

**Condition C1:** NFR-CSE-011 must be measured on HL test and QDB1 test as part of the on-prem runbook windows. It is not a release blocker for the code, but it is a release blocker for go-live if the measurement fails (the budget-and-rerun mechanism already handles that case gracefully).

### AC-3.2 Erasure API (NFR-CSE-012): what is proven and what is not

**What is proven (unit tests):**
- Budget exhaustion mid-run returns `IsComplete = false` and stops mutations: `Erase_BudgetExhaustedBeforeFirstItem_IsCompleteFalse`, `Erase_DeleteMode_BudgetExhaustedDuringResiduals_IsCompleteFalse`.
- Idempotent rerun on an already-erased customer returns zeros and completes: `Erase_Rerun_SecondCallReturnsZerosWhenDataAlreadyGone`.
- Dry run always returns `IsComplete = true` regardless of budget (dry run never mutates).

**What is not proven:**
The 2-minute wall-clock target at the highest anticipated per-customer volume (300 invitations, 100 responses, 2,000 suppression logs = ~2,400 synchronous ops) has not been measured. The `erasure-e2e.mjs` test ran with 2 invitations, 2 responses, 2 answers, and 1 suppression log per customer — a trivially small dataset. Whether a customer with 2,000 suppression-log rows completes within 120 seconds on on-prem 9.1 is unknown. If it does not, the budget-and-rerun mechanism handles it correctly, but the DSAR operator must invoke multiple times.

**Condition C2:** NFR-CSE-012 must be measured on the on-prem test orgs using a seeded customer with the BRD worst-case row counts (see AC-6, DEF-QA-C-003). Until measured, the budget-and-rerun design is the only mitigation.

---

## AC-4 What Remains Unverified

### AC-4.1 Retention pass: live deletion of old invitations and suppression logs

The retention floor and deletion logic are unit-tested on both sides of both thresholds. No live-org run has deleted invitation or suppression-log rows because no rows on org5869857f or the on-prem test orgs are old enough (the orgs are provisioned recently). This path will be exercised on the on-prem test orgs only once rows age past the floor. The runbook should include a manual verification step (seed an old-dated row in a test area and confirm the pass deletes it) before the first live go-live run.

### AC-4.2 On-prem 9.1 behaviour (Custom API support, preflight P3)

The erasure Custom API and the retention-extension plugin have not been imported to either HL CRM or BFD CRM / QDB1. On-prem 9.1 imposes the same Custom API support as cloud (this is a Dynamics 9.1 platform feature, not cloud-only), but the following must be verified on the on-prem test orgs:
- The new DLL registers without error (ILMerge output, 1.1.0.0 solution version bump re-import).
- Q14 (checkDataOfficerRole) passes on both orgs after import.
- The erasure API executes successfully end-to-end on at least one on-prem org.
- Preflight P3 (Custom API count) detects `qdb_srv_EraseCustomerSurveyData` in `package-manifest.customApis`.

### AC-4.3 Runbook additions

Three runbook additions are designed but not yet written or tested:
- **Erasure procedure:** dry-run → review counts → live execute → re-invoke until `IsComplete` → record in `qdb_survey_erasure_log` / DSAR register.
- **Unpaired started row:** if a live erasure is interrupted after the started log row but before the completed row (e.g. plugin timeout), the DSAR operator sees a started row with `qdb_is_complete = false`. The runbook must instruct them to re-invoke (idempotent) to close the run.
- **Periodic Q14:** `checkDataOfficerRole` (Q14) should be run periodically (as Q12 is for `Survey Scheduler`) to detect a duplicate `Survey Data Officer` root role. This is R7 in the architecture.

The runbook update is owned by MSS; this is a documentation gap, not a code gap.

### AC-4.4 Architecture risk R1: alternate-key null collision

`phase-3-arch.md` C.5 R1 states: nulling `qdb_survey_invitation_id` on many responses in one anonymise run may collide on the `qdb_response_invitation` alternate key if the platform does not treat nulls as index-excluded. The `erasure-e2e.mjs` scenario A2 tested this with two responses simultaneously having `qdb_survey_invitation_id` nulled and **passed** (no 412). This is evidence that the cloud Dataverse treats null as index-excluded (multiple nulls allowed). However, this behaviour has not been confirmed on on-prem 9.1 (the target release platform). It must be verified on the on-prem test orgs before anonymise mode is activated on any production org.

### AC-4.5 Retention settings (730 days, Mode Delete) on each org

`qdb_retention_days` = 730 and `qdb_retention_mode` = Delete must be set by QDB Compliance in Survey Settings on each org after import. These values have not been set on any org. The retention passes are dormant until set. Verifying these values is part of the go-live checklist (B7) and the runbook.

### AC-4.6 NFR-CSE-014 live cross-org validation

The contact-org code path (HL CRM, `CustomerLink.Contact`) has been unit-tested for all Addendum C operations (retention anonymise, erasure service). No Addendum C e2e has run against HL CRM. This is an extension of the existing DEF-QA-002 open item from phase-5-qa.md section 10. The on-prem test-org runs cover this.

---

## AC-5 Test Cases (Addendum C Representative Set)

Traceability note: test method names follow the existing project convention (`MethodName_Scenario_ExpectedResult`). The requirement IDs from Article XV are expressed in test class and file names where the test covers a single FR, and in inline comments where multiple FRs apply.

```
TC-C-001: [FR-CSE-076] RunInvitations_RetentionDaysBelowFloor_DeletesInvitationsOlderThanFloor
Given: retentionDays=90 (below the 395-day floor); an invitation 400 days old
When: the daily pass runs
Then: the invitation is deleted
Priority: Critical
Type: Unit (RetentionExtensionTests.cs: RetentionFloorTests)
Status: Implemented and passing

TC-C-002: [FR-CSE-078] RunInvitations_RetentionDaysBelowFloor_ProtectsInvitationsNewerThanFloor
Given: retentionDays=90; an invitation 200 days old (above 90, below 395-day floor)
When: the daily pass runs
Then: the invitation is NOT deleted
Priority: Critical
Type: Unit (RetentionExtensionTests.cs: RetentionFloorTests)
Status: Implemented and passing

TC-C-003: [FR-CSE-079] Anonymise_AccountOrg_NullsTheInvitationId_SourceTable_SourceRecordId
Given: a response with qdb_survey_invitation_id, qdb_source_table, qdb_source_record_id set
When: ResponseRetentionStore.Anonymise is called (account org)
Then: all three fields are null in the update payload; qdb_survey_setup_id not in the payload
Priority: Critical
Type: Unit (ResponseRetentionStoreTests.cs)
Status: Implemented and passing

TC-C-004: [FR-CSE-079] Anonymise_ContactOrg_NullsTheInvitationId_SourceTable_SourceRecordId
Given: same as TC-C-003 but contact org
When: ResponseRetentionStore.Anonymise is called (contact org)
Then: same three fields are null; contact lookup also nulled; account lookup NOT in the payload
Priority: Critical
Type: Unit (ResponseRetentionStoreTests.cs)
Status: Implemented and passing

TC-C-005: [FR-CSE-081 AC2 / ADR-008 R2] Erase_AnonymiseMode_AnonymisesResponsesBeforeDeletingInvitations
Given: a customer with 1 invitation and 1 response
When: CustomerErasureService.Erase is called in Anonymise mode
Then: anonymise-resp is called BEFORE delete-inv (ordering pinned)
Priority: Critical
Type: Unit (CustomerErasureServiceTests.cs)
Status: Implemented and passing

TC-C-006: [FR-CSE-082 / SEC-003] Execute_UnauthorisedUser_ThrowsAccessDenied_EvenWhenParametersAreMissing
Given: a user with no roles; no input parameters
When: EraseCustomerSurveyDataPlugin.Execute is called
Then: InvalidPluginExecutionException is thrown with the Survey Data Officer role name; NOT a "parameter missing" exception
Priority: Critical
Type: Unit (CustomerErasureServiceTests.cs: EraseCustomerSurveyDataPluginTests)
Status: Implemented and passing

TC-C-007: [NFR-CSE-013 / SEC-001] Erase_LiveRun_WritesStartedRowBeforeAnyMutation
Given: a customer with 1 invitation
When: CustomerErasureService.Erase is called in live Delete mode
Then: ErasureTraceWriter.Write is called BEFORE any DeleteInvitation; two Write calls total
Priority: Critical
Type: Unit (CustomerErasureServiceTests.cs)
Status: Implemented and passing

TC-C-008: [FR-CSE-081 / NFR-CSE-013] erasure-e2e.mjs (live-org, A2 scenario)
Given: a test account with 2 invitations, 2 responses, 2 answers, 1 suppression log
When: dry-run, then live Anonymise
Then: dry run returns 2/2/2/1, AreActual=false; live anonymise: responses kept, all three pointer fields null, invitations and suppression log deleted; R1 (two nulled invitation links) causes no 412; started + completed log rows written
Priority: Critical
Type: E2E (live-org, e2e/erasure-e2e.mjs, run 2026-11-15)
Status: Passed 16/16 checks
```

---

## AC-6 Defects Found in Addendum C Phase

| ID | Description | Severity | FR / NFR | Status |
|---|---|---|---|---|
| DEF-QA-C-001 | Architecture risk R1: nulling `qdb_survey_invitation_id` on two responses simultaneously passed on the cloud Dataverse (no 412). This behaviour is not confirmed on on-prem 9.1. If on-prem 9.1 does not treat nulls as index-excluded, the anonymise operation will fail with a 412 on the second null. The fallback (OQ-C3) is a CEO decision. **Confidence: 85%.** | High | FR-CSE-079, FR-CSE-081 AC3 | Open — must be proven on HL test and QDB1 test before anonymise mode is activated on any org |
| DEF-QA-C-002 | NFR-CSE-011 and NFR-CSE-012 performance not measured at BRD volumes. The budget-and-rerun mechanism is correct (unit-tested), but the wall-clock targets (90 s for the daily pass, 2 min for the erasure API) have not been validated on on-prem 9.1 at the volumes specified. **Confidence: 95%** (the absence of a measurement is factual). | Medium | NFR-CSE-011, NFR-CSE-012 | Open — measure on HL test and QDB1 test before go-live |
| DEF-QA-C-003 | The `erasure-e2e.mjs` test ran with trivially small row counts (2 inv / 2 resp / 2 ans / 1 supp log). The NFR-CSE-012 high-volume scenario (300 inv / 100 resp / 2,000 supp logs) has never run. This is not a defect in the code, but it means the worst-case erasure path has never executed. **Confidence: 95%**. | Medium | NFR-CSE-012 | Open — high-volume erasure test needed on on-prem test org |
| DEF-QA-C-004 | The runbook lacks the three Addendum C additions (erasure procedure, unpaired started-row guidance, periodic Q14). Without them, QDB Compliance cannot process a DSAR correctly and Q14 periodic checks will be skipped. **Confidence: 95%** (runbook sections are simply absent). | Medium | NFR-CSE-013, FR-CSE-082 | Open — MSS to write before go-live |

---

## AC-7 Verdict

**PASS WITH CONDITIONS**

The Addendum C implementation (retention-pass extension, anonymise fix, erasure API, `Survey Data Officer` role, `qdb_survey_erasure_log` table, Q14 on-prem check) is functionally complete and unit-tested. The 16/16 live e2e checks on org5869857f on 2026-11-15 cover the critical paths. Branch coverage is 80.34% (1,275 / 1,587 branches) — above the 80% NFR-CSE-007 target. All 481 C# tests, 88 provisioning JS tests, and 131 on-prem JS tests pass.

Conditions before go-live:
- **C1 (NFR-CSE-011):** Measure the extended daily retention pass at BRD volumes (450 inv + 1,000 supp logs) on HL test and QDB1 test; confirm it completes within the 90-second work allowance, or verify that the budget-and-rerun correctly spreads the load across successive daily runs.
- **C2 (NFR-CSE-012):** Measure the erasure API against a customer with the BRD worst-case row counts (300 inv / 100 resp / 2,000 supp logs) on on-prem 9.1; confirm it completes within 2 minutes, or document the multi-invoke procedure for high-volume erasures.
- **C3 (architecture R1):** Confirm the `qdb_response_invitation` alternate key treats nulls as index-excluded on on-prem 9.1 before anonymise mode is activated on any production org.
- **C4 (runbook):** Add the erasure procedure, unpaired started-row guidance, and periodic Q14 instruction to the runbook before activating the erasure feature on any org.
- **C5 (retention settings):** QDB Compliance sets `qdb_retention_days` = 730 and `qdb_retention_mode` = Delete in Survey Settings on each org after import (go-live checklist B7).

---

VERIFICATION (Addendum C)
  criterion:  Branch coverage ≥ 80% on Qdb.SurveyEngine assembly after Addendum C tests (NFR-CSE-007); all test suites green
  command:    cd crm-plugins && dotnet-coverage collect "dotnet test Qdb.SurveyEngine.Tests/Qdb.SurveyEngine.Tests.csproj" --output coverage-out/coverage-full.xml --output-format cobertura; cd ../provisioning && node --test; cd .. && node --test onprem/__tests__/*.test.mjs
  output:     C#: 481 passed, 0 failed. Assembly-level branch-rate: 80.34% (1275/1587 branches covered). Provisioning JS: 88 passed. On-prem JS: 131 passed.
  result:     PASS
  unverified: NFR-CSE-011 wall-clock measurement at BRD volumes on on-prem 9.1 (C1); NFR-CSE-012 high-volume erasure wall-clock on on-prem 9.1 (C2); architecture R1 alternate-key null behaviour on on-prem 9.1 (C3); runbook additions (C4); retention settings on each org (C5); live deletion of old invitation/suppression-log rows not exercised (no rows old enough on any org); NFR-CSE-014 live contact-org run (HL CRM, extends existing DEF-QA-002)

---

# Addendum D — QA: General Surveys, Audience Filter, Multi-Number SMS (BRD v1.5 + Amendment 1)

| | |
|---|---|
| Phase | 5 — QA |
| Date | 2026-11-18 |
| Branch | `feat/survey-addendum-d` @ `6d09d8f0` (kit 1.2.0.0) |
| Scope | FR-CSE-083..097, NFR-CSE-015..018; `phase-2-ba-addendum-d-audience-and-delivery.md` §4–§6, §9a; `phase-3-arch.md` Addendum D; ADR-009, ADR-010 |
| Environment | org5869857f (cloud, account customers). On-prem 9.1 not available to MSS |

## AD-1 Traceability

| Req | What it promises | Evidence | Result |
|---|---|---|---|
| FR-CSE-083 | One-time trigger kind, no source | Option 100000004 deployed; `one-time-e2e` creates and sends sourceless triggers | PASS |
| FR-CSE-084 | Send now with preview count + confirmation, Admin only | `one-time-e2e` B/C: Preview = 3 exactly, Send = 2 invited + 1 postponed; refusals A; panel: Preview → `openConfirmDialog` → loop (code + review; confirm dialog not clicked live) | PASS (confirm dialog by review) |
| FR-CSE-085 | Dated send by the first scheduler run at or after the time | `one-time-e2e` D: not sent before; sent by the first run after; xUnit due pass | PASS |
| FR-CSE-086 | Runs once; Sent with totals; second send refused | `one-time-e2e` C: Sent with totals, second send "already sent"; xUnit Failed/Sent refusals | PASS |
| FR-CSE-087 | Same rules: dedupe per trigger, version pin, fatigue Drop/Postpone, priority, Digital delivery | `one-time-e2e`: dedupe key `…|T<trigger>`, period key `ONCE-…`, recent customer Postponed; xUnit Drop → Fatigue log, form-not-published → suppressed | PASS |
| FR-CSE-088 | Expiry = setup expiry from creation | `one-time-e2e`: 14 days | PASS |
| FR-CSE-089 | Audience: All active, or a filter stored on the trigger | Live; `AudienceQuery.AllActive` / `FromFetchXml` xUnit | PASS |
| FR-CSE-090 (amended) | Views listed; copy a view; adjust for this survey | Live 2026-11-17: 16 account system views listed; Active (1 cond), My Active (2), Being Followed (related link kept), Active again — each replaces the last; `one-time-views-qa` — 5 real views accepted at save and previewed | PASS, **except QA-D1** |
| FR-CSE-091 | Filter validated at save and at send; other tables, aggregates refused | `one-time-e2e` A (incident refused at save); xUnit `AudienceQuery`, `OneTimeTriggerRules`, validation plugin | PASS |
| FR-CSE-092 | Ordered list of phone fields | B7 E2E F; xUnit `PhoneNumbers`; preflight C-sms checks each column | PASS |
| FR-CSE-093 | One SMS per distinct number (digits), same link | B7 E2E F: 3 fields (2 equal) → 2 SMS, same text | PASS |
| FR-CSE-094 | No number → reason 9; partial failure logged per column | B7 E2E B; xUnit `Dispatch_OneOfTwoNumbersFails…` | PASS |
| FR-CSE-095 | Source view + copy date recorded and shown | Live: "Copied from: Active Accounts, 11/17/2026 …"; columns on form, `setSubmitMode('always')` (review) | PASS (save of a view copy with the new script not completed in the browser — cache; logic tested in isolation live 2026-11-16) |
| FR-CSE-096 | Warn when the view changed since; Reload | `isViewNewer` tests; Reload path = copy path (live) | PASS by test + review; warning banner not seen live (no view edited) |
| FR-CSE-097 | Filters the editor cannot show are kept exactly, not edited | Live: API-written `like '%x'` filter locked on load; `isFaithful` tests | PASS |
| NFR-CSE-015 | Large audiences in budgeted, resumable batches without duplicates | xUnit: 300 customers, budget cut between pages, resume from cursor, no duplicates; concurrent resume: row-version writes, lost writer stops (2 tests) | **PASS — measured live 2026-11-19** (QA-D2): 450 customers in one call (64 s), 1,000 customers in three resumed calls (server 67 / 60 / 36 s), every customer invited once |
| NFR-CSE-016 | Within 15 minutes of the send time | Logic proven live (first run after the time sends it); the 15-minute cadence is the scheduler task (parse-checked, not run) | PASS logic; cadence open on-prem (C7) |
| NFR-CSE-017 | No mass send without preview + confirm or an Admin-set time; Admin only | `one-time-e2e` A: non-admin cannot create, preview or send; validation step filtered to definition columns so the scheduler's run-record writes pass | PASS |
| NFR-CSE-018 | Both orgs (account/contact), 9.1 | Cloud account org only; contact-table and 9.1 untested (as DEF-QA-002); preflight P15 + post-import Q15 added for the test orgs | Open on-prem |

## AD-2 Coverage

| Suite | Result (2026-11-18) |
|---|---|
| C# xUnit `Qdb.SurveyEngine.Tests` | 610 pass, 0 fail. Assembly: line 89.95 %, **branch 80.74 %** (dotnet-coverage) — above NFR-CSE-007, margin still thin |
| Addendum D C# files | `OneTimeSendService` 100 % line / 97 % branch; `AudienceQuery` 100/93; `OneTimeTriggerStore` 99/91; `TriggerAudienceValidationPlugin` 100/91; `RunDueSurveysService` 100/93; `PhoneNumbers` 100/89; data + plugin files together 96 % line / 86 % branch. Thin: `OneTimeBatch` 50 % branch, `OutcomeCounter` 67 % branch (null guards and unused pass-through members) |
| Provisioning JS | 98 pass |
| On-prem JS (checks, transforms, config) | 138 pass (P15, C-sms list, Q15 added) |
| Web resources JS | 18 pass (core rules, views module, panel loads) |
| Live E2E (org5869857f) | one-time 14/14, dispatch (B7, incl. multi-number) 11/11, daily run (B5) 12/12, view audiences 5/5 |

## AD-3 Defects found in QA

| ID | Description | Severity | Req | Status |
|---|---|---|---|---|
| **QA-D1** | **"My …" views select nobody.** Views with user-relative conditions (`eq-userid`, `eq-useroruserteams`, `eq-userteams`, `eq-businessid` …) are evaluated by Preview and Send, which run as SYSTEM, so "current user" is SYSTEM: "My Active Accounts" previewed **0** although the admin owns accounts. A dated send would report 0 invited with no error. Fix options: (a) when a view is copied, the panel replaces "current user" with the administrator who copies it (the survey then means "my accounts as of when I set it up"); and the server refuses any user-relative operator left in a filter, with a clear message; or (b) refuse such views outright. **Confidence: 95 %** (measured live). | High | FR-CSE-090, 091 | **Fixed 2026-11-18** — CEO chose (a): the panel pins `eq-userid` / `ne-userid` to the administrator who copies the view (also for a hand-picked "Equals current user"); `AudienceQuery` refuses any remaining user-relative operator at save and send. Live: raw "My Active Accounts" refused at save; pinned to the owner of 52 active accounts → previews 52. 615 xUnit, 22 web resource tests. Assembly `52eeb3ae…` deployed; kit rebuilt `4f9a064f…` |
| QA-D2 | NFR-CSE-015 not measured live: the largest live send was 3 customers; the 450-customer and 2,000-customer cases are proven only by unit tests with a simulated clock. | Medium | NFR-CSE-015 | **Closed 2026-11-19** — measured on org5869857f with `e2e/one-time-volume.mjs` (CEO go-ahead; fresh `PERF-TEST-AD-*` accounts, Portal delivery so no SMS/email; all test data deleted, 0 left). **450:** preview 450; ONE Send call 64 s; 450 invitations / 450 customers (run twice). **1,000:** preview 1,000 in 2 s; plugin trace log shows three server calls of 67 s, 60 s and 36 s (60 s work allowance checked between pages of 100, so the first overran by one page) — every call under the 2-minute sandbox limit; resumed from the cursor; 1,000 invitations / 1,000 customers, no duplicates. Server time ≈ 164 s for 1,000 (≈ 165 ms per customer). The script reported "call 1 = 427 s" because the first call's response was lost on the network and Node `fetch` waited its 300 s header timeout before the retry — a client measurement, not a server call (see QA-D5). 2,000 was not run: the machine could not hold it; 1,000 already exercises the multi-call resume path. |
| QA-D5 | A Send call's response can be lost on the network after the server has finished (seen once in the 1,000 run). The server side is safe — the work is committed and the next call resumes from the cursor with the dedupe key — but in the browser the administrator would see an error or a long wait for that call. | Low | NFR-CSE-015 | Accepted — handover note added (`DEPLOYMENT-AND-HANDOVER.md` section 6): if Send now reports an error, press it again; it resumes and never invites anyone twice. Volume script now logs every retry |
| QA-D3 | The panel's Send now confirmation dialog and the stale-view warning were not exercised in the browser (the tool freezes on dialogs; no view was edited). Logic reviewed and unit-tested. | Low | FR-CSE-084, 096 | Open — covered by the CEO's own browser test |
| QA-D4 | Browser caching: after a web-resource deploy, users keep the old panel script and the old form definition until their cache refreshes (seen twice). Not a code defect; operational. | Low | — | Document in the runbook / handover (stage 10: clear browser cache or wait) |

Defects found and **fixed during build and review** (for the record): set_fetchXml appends (views could not be changed — CEO-reported, fixed `…` "reload the editor per filter"), editor rewriting `like` → `eq` (write only if changed), condition page never loads (poll the control), panel started before its script (wait), picking a view while Audience = All active (start the editor), concurrent resume undercounting (row-version writes), overlapping view loads merging filters (one change at a time).

## AD-4 Verdict

**PASS WITH CONDITIONS.** The one High defect (QA-D1) was fixed and verified live the same day; D-C1 is closed.

The one-time engine, dated sends, the daily gate, multi-number SMS and the validation steps are complete, tested and verified live. The view picker works and handles related-entity views; it mishandles user-relative ("My …") views (QA-D1).

Conditions:
- **D-C1:** Fix QA-D1 (CEO chooses (a) or (b)) before release.
- **D-C2:** NFR-CSE-015 measured at BRD volume (QA-D2). **CLOSED 2026-11-19** — 450 in one call, 1,000 in three resumed calls, all under the 2-minute limit.
- **D-C3:** On each test org: P15 reported, Q15 PASS, 15-minute task running cleanly (checklist C7, C7a); contact-table (HL) run of a one-time survey.
- **D-C4:** CEO's browser test of the panel, including Send now's confirmation (QA-D3).

---

VERIFICATION (Addendum D)
  criterion:  Every FR-CSE-083..097 / NFR-CSE-015..018 traced to evidence; all suites green; branch coverage ≥ 80 %
  command:    dotnet-coverage collect "dotnet test crm-plugins/Qdb.SurveyEngine.Tests/Qdb.SurveyEngine.Tests.csproj --no-build" (cobertura); node --test provisioning/__tests__/*.test.mjs; node --test onprem/__tests__/*.test.mjs; node --test webresources/__tests__/*.test.mjs; node e2e/one-time-views-qa.mjs (org5869857f)
  output:     C# 610/610, branch 80.74 %; provisioning 98/98; on-prem 138/138; web resources 18/18; view-audience QA 5/5 (My Active Accounts previews 0 — QA-D1)
  result:     PASS WITH CONDITIONS
  update 2026-11-19: node e2e/one-time-volume.mjs --apply (450) and --size 1000 --apply → 450 in 1 call (64 s); 1,000 in 3 calls (server 67/60/36 s per plugin trace log), 1,000 invitations/1,000 customers, clean-up 0 left → QA-D2 CLOSED
  unverified: NFR-CSE-015 at 2,000 (not run; resume path covered by 1,000); 9.1 on-prem and contact-table runs (NFR-CSE-018); Send now confirmation and stale-view warning in the browser (QA-D3)

---

## Post-release defects (bug-fix workflow)

| ID | Symptom | Reproduction | Expected | Requirement violated | Status |
|---|---|---|---|---|---|
| **DEF-CSE-001** | An event survey can be lost with no log row when a record's status changes again before the async trigger job runs. | Found by the independent review of 2026-11-19 (item 1). Draft → Submitted → Approved in quick succession (a workflow auto-advancing, or two saves): the trigger job for the Submitted change runs after the record is already Approved. `SourceRecordReader` took the new status from a fresh read (`Data/SourceRecordReader.cs:37-44`), so it saw Draft → Approved; a trigger on {Submitted} did not fire and nothing was logged. Reproduced in xUnit `ReadCurrent_StatusChangedAgainBeforeTheJobRan_GivesTheStatusTheEventSet` (red: read 100000005, event set 100000002). | The survey decision uses the status the event set. | FR-CSE-026/027 (fires on the move into the set), NFR-CSE-001 (nothing dropped silently) | **Fixed in code, 2026-11-19**, branch `fix/survey-trigger-event-status`. Root cause: the async step passed only the record id. Fix: the plugin passes the request's `Target` (`RecordImages`, `SurveyTriggerPlugin.ImagesOf`); every source field the event carried (status, and type/origin/customer when set in the same request) is taken from it, and the fresh read fills only fields it did not carry. 4 tests; 620/620. **Deployed + live-verified 2026-11-19** on org5869857f (user go-ahead; user ran `register-plugin.mjs --apply`): deployed assembly = local Release build, sha256 `ab5fa8ff…` (205,312 B). `e2e/def-cse-001-chained-status-e2e.mjs`: disbursement saved Payment Processed 19:49:44.31Z, then Saved 19:49:47.75Z; the trigger job started 19:50:15.23Z (27 s after the second save) and traced "1 trigger(s) fire … (1 -> 751090050). Invitation created" — exactly one invitation, no suppression, no failed jobs; step, source and setup restored. (The script's first race check read system jobs, which these steps auto-delete; it now reads the plugin trace log.) On-prem kit rebuilt as 1.2.0.1 (PR #189, merged `5f4f25e4`) |
| **DEF-CSE-002** | (a) A One-time send that keeps throwing a platform error stops the daily passes (scheduled surveys, postponed release, retention) from ever running. (b) A send call can overrun its 60/90 s allowance by a whole page of 100 customers, risking the 2-minute plugin limit on slower servers, and a call over the limit loses all its pages. | Found by the independent review of 2026-11-19 (item 2). (a) `RunDueSurveysService.Run` runs the One-time pass, then the daily passes, in ONE Custom API call = one database transaction (`Scheduling/RunDueSurveysService.cs`); `OneTimeDuePass` catches only `OneTimeSendRefusedException`, and a platform fault cannot be caught and continued inside a transaction anyway, so the whole call rolls back every 15 minutes. (b) Measured: one call 67 s against the 60 s allowance (QA-D2); the budget is checked only between pages (`OneTime/OneTimeSendService.cs`). ADR-010 §2 said the cursor is "committed after each page", which a transaction does not do. Reproduced in xUnit: `PageSize_AtTheRateMeasuredOnCloud_OvershootsTheAllowanceByAtMostFiveSeconds` red (100 customers ≈ 16.5 s); the pass tests did not compile (no way to run a pass alone). | The daily passes run every day whatever happens to a One-time send; a call overruns its allowance by seconds, not tens of seconds. | ADR-005 / ADR-010 §2, §5 (daily passes once a day; resumable sends), FR-CSE-042 (scheduled surveys), FR-CSE-058 (retention), NFR-CSE-015 | **Fixed in code, 2026-11-20**, branch `fix/survey-run-isolation`. Optional `Pass` input on `qdb_srv_RunDueSurveys` (`OneTime` / `Daily` / empty = both, unchanged for other callers); the scheduler script and the cloud-flow recipe call the two passes separately, each with its own error handling, and exit 1 if either failed; page size 100 → 25; ADR-010 Amendment 1 corrects the "committed" wording. `register-plugin.mjs` now adds an optional input declared after an API was created. C# 633/633 (13 new); provisioning + on-prem 239/239 (3 new). **Deployed + live-verified 2026-11-20** on org5869857f (user ran `register-plugin.mjs --apply`: assembly update + new optional request parameter `Pass`, in the SurveyEngine solution): deployed assembly = local build, sha256 `540e724f…`. `e2e/def-cse-002-run-pass-e2e.mjs` 7/7 (user go-ahead): Pass=OneTime ran only the One-time pass and said "Daily passes: not run in this call"; Pass=Daily ran only the daily passes (1 expired postponed test invitation discarded, nothing scheduled due, retention off) and recorded 2026-11-20; a second Daily call said "already completed for this date"; Pass=Weekly refused with HTTP 400 naming the allowed values. Not live-tested: an actual platform fault in one pass (the reason for the split) — the separation is what is proven. On-prem kit rebuilt as 1.2.0.2 (PR #190, merged `a4ee0206`) |
| **DEF-CSE-003** | A day the scheduler does not run (server down, holiday freeze) silently loses that period's scheduled surveys: the run on the 2nd sends nothing for the month, quarter or year that ended on the 1st, and writes no log row. Also, re-running an earlier date with `RunDate` moved *Daily Passes Completed On* backwards. | Found by the independent review of 2026-11-19 (item 4). `ScheduleCalendar.IsDue` fires only when the run date IS the 1st; `DailyPassGate.HasCompleted` compared only the run date with the stored one (`Scheduling/RunDueSurveysService.cs`, `Data/DailyPassGate.cs`). Reproduced in xUnit `Run_FirstOfTheMonthMissed_NextDaySendsThatMonthsSurvey` (red: 0 invitations; gate 31 Dec, run 2 Jan) and 3 more red tests. | Missed days are caught up and their surveys sent; anything too old to catch up is named, never silent. | FR-CSE-042 (scheduled surveys), NFR-CSE-001 (nothing dropped silently), ADR-010 §5 | **Fixed in code, 2026-11-20**, branch `fix/survey-missed-run-days`. `MissedRunDays.Plan` runs every date after the last completed one, oldest first, up to 28 days (shortest month: a caught-up quarterly/annual invitation is always created before its one-month fixed expiry); older dates are named in the summary to re-run with `RunDate`. A date counts as done only when its passes finish (a budget cut resumes next call); the gate never moves back. `IDailyPassGate.HasCompleted` replaced by `LastCompletedOn`. ADR-010 Amendment 2; scheduler README. C# 645/645 (12 new). Not a schema change. Not yet deployed or live-verified |
