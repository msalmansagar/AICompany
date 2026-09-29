# Rule Engine Release 1 (EDP-RE-ENH-001): B1–B4 implementation record

**Authority:** sponsor ratification of EDP-RE-ENH-001 (2026-09-28), on BRD v1.1 + CEO-function decision APPROVE WITH CONDITIONS and the architecture gate (ADR-19/20/21, AC-1…AC-7). **Scope: source implementation only.**
**Branch:** `feat/edp-re-r1-contract` from `main` `a4c04fd2` · **PR:** #169 (not merged).
**Live environment:** nothing deployed, no live write. Read-only reads of org5869857f only (listed in §6).

## 1. Timing (Asia/Qatar)

| | |
|---|---|
| Start | 2026-09-28 09:08:40 |
| Source complete, PR opened | 2026-09-28 21:56 |
| Elapsed (wall clock) | 12.8 h, continuous, with parallel sub-agents (SDK + gateway ≈ 78 min; designer ≈ 36 min plus one stall; three code reviews) |
| Baseline estimate | 41.5 h (not re-estimated) |

## 2. What was built

| Package | Delivered |
|---|---|
| B1 declared facts | `PcrmInput.IsDeclaredFact` (no binding/via/aggregate); record path carries declared facts as null and never reads a column, even a same-named one; EDP064 Info, EDP069; designer Facts panel, pickers, GoRules `x-edp-kind: "declared"`, Fill-from-record keeps typed facts; `GetInputSchema` `kind`/`binding: null` |
| B2 strict contract | strict ⇔ `schemaVersion` 1.1 **and** `inputContract` strict (EDP065 otherwise); Option A typing (`TypeCheck`), exact decimals (`TryGetDecimal` / `UnrepresentableNumber`); EDP060–063, 066 (declared facts only), 067 Info, 068; validation before any retrieval; rule-set members validated against the pipeline context; `RuleOutcome` with derived Success/Matched; log outcome `rejected`; designer: new rules strict, legacy lenient with badge and an explicit switch, required/nullable on every input |
| B3 RuleKey | `RuleIdentityResolver` (IC-1) replacing both unordered lookups; precedence, EDP070, EDP071, deterministic names, orphaned versions kept addressable; `RuleKey` on 4 operations; designer create requires a valid, unused, never-retired key, written once by one function; delete audit records `ruleKey=<key>`; SDK `RuleRef.key`; gateway `ref.key` |
| B4 provenance | `Outcome` + `ProvenanceJson` + CorrelationId (1–100) on EvaluateDecision; ContentHash (ADR-20) in C# and TS; no InputsDigest; identity-only responses for resolution operations |
| Contract | `contract/rule-engine-contract.json` (IC-3) + parity tests in runtime, designer, JS SDK, .NET SDK, gateway; `contract/content-hash-vectors.json` (12 vectors incl. the five FR-B4-06 cases) |
| Registration | 7 new arguments in `deploy/registration/rule-engine-registration.json`; on-prem manifest regenerated; forward + reverse contract↔code checks (IC-2) |
| Migration | `deploy/a7-rulekey.mjs` (Order Y), `deploy/check-declared-facts.mjs` (R-3), `deploy/test/rulekey-write-guard.test.mjs` (HD-5) |
| TC-3 | `runtime/tools/EDP.RuleRuntime.Replay` + `runtime/tests/replay/*` + `ReplayRegressionTests` |

## 3. Test evidence (local, 2026-09-28)

| Suite | Before (a4c04fd2) | After |
|---|---|---|
| Core runtime (net9) | 176 | **333** passed, 0 failed, 0 skipped |
| CRM adapter (net462) | 98 | **153** passed |
| Designer (vitest) | 96 | **156** passed; `tsc && vite build` ✓ |
| JS SDK (vitest) | — | **51** passed; `tsc --noEmit` clean |
| .NET SDK | — | **15** passed |
| Gateway (vitest) | — | **31** passed; typecheck clean |
| Deploy tools (node --test) | 53 | **98** passed |
| Plug-in package | — | build ✓; `verify-package.ps1` **PASS** (release 1.1.0, record 1.0.0, 9 IPlugin types); contract resource embedded in the packaged `EDP.RuleRuntime.dll` 1.1.0.0 |
| Security gate | 5 warnings, 0 critical | 5 warnings (all pre-existing lines), 0 critical |
| CI (PR #169) | — | **8/8 green** |
| TC-3 replay | — | 14 versions, 600 cases, **0 differences**; mutation (one golden flipped) is caught; every live version hashes |

## 4. Code review

| Review | Result | Resolution |
|---|---|---|
| Runtime B1–B4 (code-reviewer) | PASS WITH WARNINGS | Boolean flag in `ContentHash.WriteObject` → split writer (fixed `142db5e7`); CorrelationId minimum now read from the contract (fixed) |
| Self-review of runtime | — | Orphaned versions were refused by the new resolver (fixed `1fcad803`); EDP066 was raised for record-bound Lookups, blocking publish of any strict rule with a lookup column (fixed `936a0f93`) |
| SDK + gateway (agent output, verified) | — | JS SDK did not typecheck (7 strict-null errors) and carried a boolean flag and a stale comment; it also accepted leading-zero numbers the C# parser rejects: all fixed. Gateway and .NET SDK had copies of contract values with no parity test: tests added |
| Designer (agent output, verified) | — | Six defects fixed before commit: legacy rules opened as strict; strict switch locked once a key existed; reuse check never called; key written after the rule was created; the retired-key query filtered a column the audit table does not have (would fail every availability check live); legacy unbound `tier` not recognised as a declared fact. Also added: required/nullable on bound inputs, one-time key entry for unkeyed rules, typed empty test inputs, styles |
| Final review (whole branch) | see PR #169 | recorded there |

## 5. Deviations and decisions made during build (none changes a sponsor decision)

- `otherwise` / default row remains a **match** (pre-existing); `NO_MATCH` = nothing applied.
- A required declared fact on the `TargetRef` path is EDP060, because the record never supplies one (overlay is A1b, Release 2).
- Record-bound values are not type-checked (CRM-typed); a caller-supplied bound Lookup must be a JSON string.
- Three orphaned rule versions remain addressable by `RuleVersionId` only.
- ContentHash vectors were rebuilt to cover FR-B4-06's five named cases (the first set did not).
- `GetRuleAnalytics` gains an additive `rejected` count.
- A copy of a rule starts with no key; the editor lets the author set a new one once.

## 6. Read-only live evidence (org5869857f, 2026-09-28)

- `qdb_edp_rulekey` exists (String 100, optional); **no** alternate keys; 14 rules, none keyed.
- 14 rule versions (3 orphaned), all `schemaVersion` 1.0, captured as TC-3 fixtures.
- R-3: one unbound input (`tier` on `account`); **0 coincidences** with real columns.
- `a7-rulekey.mjs plan`: 14 writes, **0 problems**.
- `a7-repoint.mjs` dry run: 30 registrations, **10 metadata creates**, 0 incompatibilities, 29 moves, 0 problems.
- `qdb_edp_rule` belongs to the unmanaged solution `BusinessRuleEngine`.

## 7. Status

**On-Prem Compatible by Design — Runtime Validation Pending.** Cloud: source complete, CI on PR #169; live steps are listed, each needing its own authorisation, in `deploy/A7-RELEASE-PROCEDURE.md` §4a.
