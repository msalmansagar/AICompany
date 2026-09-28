# ADR-19: Strict Input Contract, the `Outcome` Discriminator, and How Provenance Is Returned

**Status:** Proposed. For the CEO-function architecture gate (`new-feature.md` Phase 2).
**Date:** 2026-09-28
**Decided by:** Solution Architect.
**Implements:** EDP-RE-ENH-001 v1.1 (ratified 2026-09-28): FR-B2-01…12, FR-B4-01…08, MC-1, MC-2.
**Touches:** ADR-13 (two-tier write path), ADR-17 (per-child verdicts), `deploy/registration/rule-engine-registration.json`.

---

## Context

The ratified BRD fixes the *semantics*. Three things are left for architecture:
- how strictness is represented and enforced;
- how a caller distinguishes the four outcomes;
- how the approved provenance fields reach the caller given the platform's constraints.

**A platform constraint the BRD could not see.** FR-B4-02 lists `RuleVersionId` and `CorrelationId` among the fields *returned* by `EvaluateDecision`. Both names are also *request* parameters of that operation (`RuleVersionId` today; `CorrelationId` from FR-B4-01).
- On-premises, an operation is a Process Action whose argument names must be **unique across inputs and outputs**.
- The registration contract's own validator (A7) likewise rejects a name declared in both directions, because the semantic parity check depends on it.
- Same-named response properties for those two fields are therefore impossible under "one semantic contract, two targets".

## Decision

### 1. Strictness is data, never inference
- A rule is **strict** exactly when its PCRM has `"inputContract": "strict"`. Absent or `"lenient"` means lenient.
- A strict rule must carry `"schemaVersion": "1.1"`; the contradictory combination fails validation with **EDP065**. There is no heuristic of any kind.
- The designer stamps both on every new strict rule. All existing rules are `1.0` without `inputContract`, so they stay lenient and evaluate exactly as today.

### 2. One validator, one place, before anything reads inputs
`InputContractValidator` (core, netstandard2.0) runs in `RuleRuntimeService.Execute` **before** execution, on every path:
- `InputsJson`;
- rule-set members, against the pipeline context at that moment (FR-B2-08);
- the record path.

On the record path it runs in `RuleDecisionService.Evaluate` **after the anchor inputs are bound and before any retrieval executes** (FR-B2-07). There, record-bound values are CRM-typed and trusted, so only required/nullable and declared facts are checked.

**Strict acceptance: Option A, strict JSON typing.** The value's JSON token type carries its semantic type:

| Declared type | Accepted | Normalised to | Rejected with |
|---|---|---|---|
| `Text` | JSON string | `string` | EDP062 |
| `Decimal`, `Currency` | JSON number, read with `JsonElement.TryGetDecimal` (exact, never `double`) | `decimal` | quoted number, out of `decimal` range, anything else: EDP062 |
| `WholeNumber` | JSON number, integral, within `Int64` | `long` | fractional: EDP063; out of range or quoted: EDP062 |
| `Choice`, `OptionSet` | JSON number, integral, within `Int64` (labels never accepted) | `long` | fractional: EDP063; quoted or label: EDP062 |
| `Boolean` | JSON `true` / `false` | `bool` | EDP062 |
| `Date` | JSON string `YYYY-MM-DD` (a valid calendar date) | `DateTime` (UTC midnight) | EDP062 |
| `DateTime` | JSON string, ISO-8601 with `Z` or `±hh:mm` | `DateTime` (UTC) | missing offset or other form: EDP062 |
| `Collection` | JSON array (element shape is out of scope for Release 1) | the collection | a scalar: EDP062 |
| anything else (`Lookup`, unknown) | **not declarable in a strict rule** | — | EDP066 at validation |

**Other rules:**
- **Values that are already typed** are accepted as their own type. These are `DateTime`, `int` or `long`, `decimal`, `bool` and collections that reach a rule from an upstream rule's outputs or from the record. JSON never produces them, so Option A still holds for everything a caller sends.
- **A number that cannot be held as `decimal`** no longer crashes JSON parsing. It is carried as an unrepresentable marker: a strict rule rejects it with EDP062, and a lenient rule re-raises the original parse error, which preserves its existing HTTP-400 behaviour.
- **Arrays:** a JSON array can never satisfy a scalar declaration (EDP062). In a strict rule, a quantifier over an input requires that input to be declared `Collection` (EDP066).
- **Missing, null and extra inputs:**
  - a missing `required` input: EDP060;
  - `null` where `nullable: false`: EDP061;
  - an undeclared supplied input: ignored, with an **EDP067 Info** notice.
- **Lenient rules:** the same checks run, but type problems are **warnings only**, values are never converted, and nothing is refused, unless an author explicitly set `required` or `nullable: false`.
- **Declared facts, validator messages:**
  - an input with no binding, relationship or aggregate is a declared fact (EDP064 Info);
  - a declared-fact marker that also carries a binding breaks "bound xor declared" (EDP069);
  - a strict numeric literal that is not an exact `decimal` fails validation (EDP068).
- **Severity:** `RuleErrorSeverity` gains `Info`, appended so existing numeric values are unchanged.

### 3. `Outcome` is the discriminator; the booleans are derived from it
`RuleResult` gains `Outcome` ∈ {`Matched`, `NoMatch`, `InputRejected`, `EngineError`}. It can only be constructed through factories that set `Outcome` together with `Success` and `Matched`, so a contradictory combination cannot be represented:

| Outcome (wire value) | Success | Matched | HTTP | Execution-log outcome |
|---|---|---|---|---|
| `MATCHED` | true | true | 200 | `matched` |
| `NO_MATCH` | true | false | 200 | `no-match` |
| `INPUT_REJECTED` | false | false | 200 | `rejected` |
| `ENGINE_ERROR` | false | false | 200 | `error` |
| malformed request (unparseable `InputsJson`, missing mandatory parameter, EDP070 conflicting identifiers, EDP071 malformed RuleKey, `CorrelationId` outside 1–100 characters, an ad-hoc PCRM that fails compilation) | — | — | **400** | none |

Existing fields keep their meaning, so a caller that only reads `Success`/`Matched` sees exactly what it saw before for every existing rule. `TestRule`, `ExecuteDecisionTable` and `ExecuteRuleSet` include `outcome` in each result object of their `ResultJson`. This is so a rejected rule-set member is distinguishable; it is **not** US-05 provenance.

### 4. Provenance travels as one `ProvenanceJson` property
`EvaluateDecision` gains two response properties and one request parameter in the registration contract:
- **`Outcome`** (String): top level, because callers branch on it.
- **`ProvenanceJson`** (String): a JSON object with every approved provenance field. Fields that do not apply are `null`, for example rule identity on an ad-hoc `PcrmJson` call.
- **`CorrelationId`** (request, String, optional, 1–100 characters): echoed verbatim inside `ProvenanceJson`, never interpreted.

```json
{ "executionId": "…", "ruleId": "…", "ruleKey": "…", "ruleVersionId": "…",
  "versionNumber": 3, "contentHash": "64 lower-case hex", "evaluatedOnUtc": "2026-09-28T09:00:00.0000000Z",
  "correlationId": "…" }
```

This follows the operation's existing convention of JSON-valued properties (`OutputsJson`, `ReasonCodesJson`, `TraceJson`, `DiagnosticsJson`, `ChildResultsJson`). It avoids the name clash on both targets, and it keeps one registration change instead of eight.
- `ExecutionId` stays a top-level property for compatibility and is repeated in `ProvenanceJson`. It remains empty when the best-effort trace is dropped (ADR-13); `correlationId` is the reliable correlation key.
- **No `InputsDigest`** (MC-3).
- `ResolveEffectiveVersion` and `GetPublishedVersion` add `ruleKey` to their existing `ResultJson`. They return no hash and nothing that implies an evaluation happened (FR-B4-08).

## Consequences

**Positive:**
- A strict rule cannot silently compare under the wrong semantic type.
- The four outcomes are unambiguous.
- Every existing rule and caller is unaffected.
- The contract registers identically on cloud and on-prem.

**Negative, accepted:**
- Consumers read provenance by parsing one more JSON property instead of reading separate properties. That is the same effort they already spend on `OutputsJson`.
- The validator runs on every call. It is a single pass over the declared inputs (NFR-02 < 1 ms).

## VERIFICATION (to be demonstrated by the build)
- Invariant tests: every `Outcome` maps to exactly one `Success`/`Matched` pair, and no factory can produce another.
- TC-2 hostile-input suite: every case in BRD §11-2 rejects with the stated code and zero matches.
- Replay (TC-3): every live rule version gives identical `Success`, `Matched`, outputs and reason codes before and after.
