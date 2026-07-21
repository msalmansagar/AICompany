# Wave-0 QA Gate — EDP-BRE-001 Production Candidate

**Candidate:** `main` @ 0fc326c2
**Worktree:** `D:/AI Projects/edp-gate-wt/projects/enterprise-decision-platform`
**QA run date:** 2026-07-21
**QA engineer:** Maqsad AI — QA Agent

---

## 1. Test Run Results

### Runtime (.NET)

| Suite | Framework | Passed | Failed | Skipped | Duration |
|-------|-----------|--------|--------|---------|----------|
| EDP.RuleRuntime.Tests | net9.0 | **88** | 0 | 0 | ~3 s |
| EDP.RuleRuntime.Crm.Tests | net462 | **55** | 0 | 0 | ~5 s |
| **Total** | | **143** | **0** | **0** | |

Command: `dotnet test` — clean restore, build, and run, no flags.

Build warnings (not errors):
- `CS8602` at `EvaluateDecisionPlugin.cs(46)` — dereference of a possibly null reference (false positive: guarded by `!string.IsNullOrEmpty`).
- `CS8604` (×4) at `ScenarioRunner.cs`, `RuleDecisionService.cs`, `DecisionIntelligencePlugin.cs`, `RuleServicePlugin.cs` — possible null argument to methods expecting a non-null string.
- `xUnit2031` at `DeleteAuditTests.cs(24)` — use Assert.Single overload with filter instead of Where().

### Designer (TypeScript / Vitest)

| Suite | Test files | Passed | Failed | Duration |
|-------|-----------|--------|--------|---------|
| edp-rule-designer | 7 | **51** | 0 | ~61 ms |

Breakdown: messaging (5), docRedirect (11), dependencyGraph (5), catalog (11), diff (6), toPcrm (7), conditionModel (6).

### Grand Total: 194 tests, 0 failures, 0 skipped.

---

## 2. Pin-Governance Code Assessment

### `ProductionPinJustificationPlugin.cs` — design review

The plugin is well-scoped: a synchronous pre-operation (stage 20) guard on `qdb_edp_ruleversion` Create and Update. It enforces that any write that results in a pinned version carries a non-null `JustificationCode` (OptionSetValue) and a non-empty `JustificationNote`. It skips enforcement in non-production environments (consistent with ADR-12 / GovernanceService.EnforceSoD). The `Effective<T>` helper correctly merges the Target write with the pre-image to compute the post-write effective value.

The fail-safe `catch { return true; }` in `IsProduction()` correctly closes toward enforcement if the environment variable query fails — consistent with the F-02 pattern documented throughout the runtime.

### `ProductionPinJustificationPluginTests.cs` — coverage assessment

7 tests covering:

| Scenario | Covered |
|----------|---------|
| Create + pinned + no justification + production → rejected | YES |
| Create + pinned + code + note + production → allowed | YES |
| Update-to-pinned + no justification + production → rejected | YES |
| Update that clears note while pinned + production → rejected (preimage merge) | YES |
| Non-pin update + preimage has full justification → allowed (preimage merge) | YES |
| Unpinning → no justification required | YES |
| Non-production (null and "no" prod flag) → enforcement skipped | YES (`[Theory]` with 2 values) |

**Missing edge cases:**

1. **`IsProduction()` exception path (fail-safe)** — no test simulates an org-service query exception during the production-flag lookup. The correct catch-to-enforce behavior is untested. Confidence: 90%.
2. **Null OptionSetValue value** — if `JustificationCode` is present as `new OptionSetValue(0)`, `code != null` is true (value 0 is a valid .NET object), so the check passes regardless of whether 0 is a meaningful option-set value. In Dataverse, the platform rejects out-of-range option values, so this is a low-risk boundary in practice. Confidence: 75% — below the 80% report threshold; noted for awareness only.
3. **The "non-pin-update" test exercises a code path that is unreachable from the registered plugin step** — see Finding 4 below.

---

## 3. Prior QA Blocker Re-verification

| Blocker | File / Location | Status |
|---------|----------------|--------|
| QA-B1: null-guard when neither InputsJson nor TargetRef | `EvaluateDecisionPlugin.cs` lines 48–49 | **CLOSED** — explicit guard throws `InvalidPluginExecutionException` |
| ADR-SEC-NCALC: NCalc GHSA-3w5p-95mh-gq75 | `adrs/index.md` bottom footnote | **CLOSED** — accepted with documented rationale (CVSS 4.8, sandbox-bounded, NU1902 suppressed) |
| QA-M2: In/NotIn operator coverage | `OperatorTests.cs` lines 55–61 | **CLOSED** — Theory with 4 inline cases |
| QA-M1: IsNull strict-null distinct from IsEmpty | `OperatorTests.cs` lines 47–53 | **CLOSED** — explicit named test |
| M3: governance TOCTOU / optimistic concurrency | `GovernanceServiceTests.cs` lines 101–111 | **CLOSED** — `ThrowConcurrencyOnUpdate = true` + assertion that no approval/audit record is created |
| QA-M4: toPcrm translator tests | `toPcrm.test.ts` 7 tests | **CLOSED** — covers column-id vs name, hit policies, unary forms, switch nodes, warnings |

All six prior blockers are closed in this candidate.

---

## 4. Regression Assessment — Pin-Governance Additions

**Plugin registration** (`bre-register-pin-guard.js`): Creates a new plugin type and registers two steps (Create + Update). The Update step has `filteringattributes` set to the three pin columns, limiting invocations to writes touching those fields. A pre-image (`PreImage` alias, same pin columns) is registered on the Update step. This is idempotent and does not alter any existing steps.

**Field security profile** (`bre-pin-fieldsecurity-profile.js`): Creates a new named profile and adds the runtime SP as a member. Does not modify existing roles or plugin registrations.

**Field permissions** (`bre-pin-fieldperms.js`): Grants canread=4, cancreate=4, canupdate=4 on the three pin columns to the new profile. Does not affect existing field permissions on other columns.

**Assessment**: No regression to existing evaluation, governance, metadata, or audit flows. The new plugin step is narrowly targeted (pre-op, stage 20, Create+Update, pin fields only) and cannot interfere with `EvaluateDecision`, `GovernanceAction`, `AppendOnlyGuard`, or `DeleteAudit` steps which operate on different messages or targets.

**One static-review observation** (not a regression): `bre-pin-fieldperms.js` has its ENVFILE path hardcoded without a `process.env.EDP_ENV_PATH` override, unlike `bre-register-pin-guard.js`. See Finding 5.

---

## 5. Findings

### F-1 — MEDIUM: npm audit reports 1 critical + 2 high vulnerabilities in designer
**Confidence: 95%**

`npm ci && npm test` output shows: `9 vulnerabilities (6 moderate, 2 high, 1 critical)`.

The designer is a Dataverse web resource (static SPA, served only to authenticated CRM users). However, a critical-severity vulnerability must be triaged before production deployment to determine whether it is in a devDependency (build-time only, no runtime exposure) or a runtime dependency bundled into the web resource. If runtime, it may be exploitable by authenticated CRM users in a privileged context.

**Action required (C1):** Run `npm audit --json` in `designer/` to identify the critical package and its dependency type. If it is a devDependency with no runtime surface, document and accept. If it is a runtime dependency, apply `npm audit fix` or apply a targeted override and re-run tests.

---

### F-2 — MEDIUM: `IsProduction()` fail-safe exception path is untested
**Confidence: 90%**

`ProductionPinJustificationPlugin.IsProduction()` catches all exceptions from the org-service query and returns `true` (enforce). This is the correct F-02 fail-safe pattern. However, no test exercises this path — there is no test that passes an `EnvFlagService` that throws during `RetrieveMultiple`.

**Impact**: The behavior is correct but undocumented by a test. A future refactor could silently break the fail-safe without a failing test to catch it.

**Action required (C2):** Add a test `IsProduction_query_throws_enforces_as_production` that passes an org service whose `RetrieveMultiple` throws and asserts the plugin rejects the pin write.

---

### F-3 — LOW: CS8602/CS8604 nullable-reference warnings in production assemblies
**Confidence: 90%**

The `dotnet build` (as part of `dotnet test`) emits five CS8602/CS8604 warnings across `EvaluateDecisionPlugin.cs`, `ScenarioRunner.cs`, `RuleDecisionService.cs`, `DecisionIntelligencePlugin.cs`, and `RuleServicePlugin.cs`. The analysed case in `EvaluateDecisionPlugin.cs(46)` is a false positive (the `!string.IsNullOrEmpty` guard makes the null dereference unreachable). However, the remaining four are potentially real nullable violations where a `string?` is passed to an API expecting a non-nullable `string` (e.g., `JsonDocument.Parse`, `JsonSerializer.Deserialize`).

**Impact**: Low immediate risk — these are `string?` values already guarded by prior null checks or assigned from OData responses. However, they represent incomplete nullable annotation hygiene and could mask genuine null-ref bugs in future changes.

**Action required (C3):** Address or suppress-with-justification all CS8602/CS8604 warnings in a follow-up commit. Use `!` (null-forgiving) with an inline comment where the prior guard guarantees non-null.

---

### F-4 — LOW: `Non_pin_update_keeps_justification_from_preimage_and_is_allowed` tests a code path unreachable from the registered step
**Confidence: 85%**

`bre-register-pin-guard.js` sets `filteringattributes` to the three pin columns on the Update step. A non-pin-field update (e.g., updating `qdb_edp_versionnumber` only) will never trigger the plugin step in production — Dataverse suppresses the step invocation when none of the filtered attributes are in the update request. The test named above exercises the internal `Effective<T>` preimage-merge logic on this path, but in practice the plugin code would never be reached for this scenario.

**Impact**: The test is still valid as a unit test of the plugin's `Effective<T>` logic. But it implies a coverage story that does not map to real-world usage. No code change is needed — the plugin behavior is correct.

**Action (advisory):** Add a test comment documenting that this scenario is gatekept by step filtering in production and the test covers only internal logic, not a live execution path.

---

### F-5 — LOW: ADR-14 status remains "Proposed" in `adrs/index.md`
**Confidence: 95%**

`adrs/index.md` shows `ADR-14 | ... | Proposed | 2026-07-19 | Architect`. ADR-14 covers the field-security approach for pin governance. The plugin it references is now built, tested, and backed by deploy scripts. The ADR should be ratified to "Accepted" with the Architect and CEO sign-off captured in the ADR document before production deployment.

**Action required (C4):** Ratify ADR-14 to "Accepted" status in `adrs/index.md` and in the ADR body with a "Decision confirmed" note citing the Wave-0 QA gate pass. Requires Architect + CEO sign-off.

---

### F-6 — LOW: `bre-pin-fieldperms.js` has no ENVFILE path override
**Confidence: 95%**

`bre-register-pin-guard.js` supports `process.env.EDP_ENV_PATH` to allow the script to be run from any environment. `bre-pin-fieldperms.js` does not — its `ENVFILE` constant is hardcoded to the local project path and cannot be overridden without editing the file.

**Impact**: CI or non-local environments cannot run `bre-pin-fieldperms.js` without a source edit. Low operational impact if deployment is always developer-driven, but inconsistent with the pattern established in the register script.

**Action (advisory):** Add `process.env.EDP_ENV_PATH ||` prefix to the ENVFILE constant in `bre-pin-fieldperms.js`, consistent with `bre-register-pin-guard.js`.

---

## 6. Performance Note

No performance benchmarks were defined or run in this gate — the runtime is a CRM sandbox plugin (2-minute hard limit per Article X), and no load test harness is wired. Execution traces show step durations logged at the runtime level. Define k6 or Artillery benchmarks for the `qdb_edp_EvaluateDecision` Custom API before load testing in staging.

---

## 7. Verification Runbook Note

`wave-0-pin-governance-verification.md` VP-6 states "Succeeds today — documents the known gap." This was written when the plugin was deferred (ADR-14 as proposed). Now that the plugin is built and registered, VP-6 should be re-run against the production org. With the plugin registered, a privileged member write without justification should now be **rejected** by the synchronous pre-operation step. The VP-6 expected result needs to be updated to "Rejected (plugin enforces)" to reflect the current state.

---

## 8. Definition of Done Checklist

- [x] `dotnet test` — 143/143 pass, 0 failed
- [x] `npm test` (vitest) — 51/51 pass, 0 failed
- [x] QA-B1 null-guard closed
- [x] ADR-SEC-NCALC documented and accepted
- [x] In/NotIn operator coverage (QA-M2) closed
- [x] IsNull strict-null (QA-M1) closed
- [x] TOCTOU / optimistic concurrency (M3) closed
- [x] toPcrm translator tests (QA-M4) closed
- [x] Pin-governance plugin built, tested, deploy scripts ready
- [ ] **C1: npm audit critical triaged** — REQUIRED before prod
- [ ] **C2: IsProduction() exception path test** — REQUIRED before prod
- [ ] **C3: CS8602/CS8604 warnings addressed** — recommended, not blocking
- [ ] **C4: ADR-14 ratified to Accepted** — REQUIRED before prod
- [ ] VP-6 in wave-0-pin-governance-verification.md updated to reflect plugin enforcement
- [ ] Wave-0 live-org verification session (VP-1…VP-7) completed on org5869857f

---

## 9. Verdict

**MERGE-WITH-CONDITIONS**

The candidate passes all 194 automated tests with no failures. All six prior QA blockers are closed. The new pin-governance plugin is correctly implemented, adequately tested for primary flows, and is a net security improvement. No regressions are introduced.

The four conditions that must be cleared before production deployment:

| # | Condition | Severity | Owner |
|---|-----------|----------|-------|
| C1 | Triage npm audit critical vulnerability in designer; if runtime dep, patch before deploy | Medium | Frontend |
| C2 | Add test for `IsProduction()` exception path (fail-safe enforcement) | Medium | Backend |
| C3 | Resolve or suppress-with-justification CS8602/CS8604 warnings | Low | Backend |
| C4 | Ratify ADR-14 to "Accepted" (Architect + CEO sign-off) | Low | Architect / CEO |

Additionally, the live-org Wave-0 verification session (VP-1…VP-7, wave-0-pin-governance-verification.md) remains a manual gate that must be completed on org5869857f before production deployment.
