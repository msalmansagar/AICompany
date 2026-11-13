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
- [ ] A2 (NFR-CSE-004) Part D: Form Engine re-publish and render with no SurveyEngine present, on HL test and QDB1 test (between runbook stages 2 and 4), or a removal rehearsal if the CEO requires one
- [ ] A3 (NFR-CSE-006): trigger p95 and daily run measured against targets
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
