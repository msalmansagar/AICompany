# ADR-16: Collection Semantics Adopt the JsonLogic Specification, Not the JsonLogic Library

**Status:** Proposed
**Date:** 2026-08-18
**Decided by:** Solution Architect. Implements EDP-FACT-001 phase F1. Constrained by ADR-01 (no arbitrary code execution), ADR-06 (one evaluator), ADR-11 (bounded deterministic grammar), ADR-13 (trace tiering), ADR-AI-05 (grounded explainability), ADR-SEC-NCALC (the net462 / System.Text.Json ceiling).

---

## Context

`EDP-FACT-001` was ratified with **Option B**: the evaluator stays a pure function, and fact
assembly becomes a second declarative surface. Phase F1 adds the collection type, iteration
and per-child fan-out (FR-F1, FR-F2, FR-F3, FR-F43).

The adopt-over-build research (`dependencies.md`, addendum 2026-08-18) identified
**`json-everything` / Json.Logic 5.4.3** as the only credible .NET candidate that clears the
sandbox constraints, and left one question open for architecture:

| Mode | Description |
|---|---|
| **(a)** | PCRM carries Json.Logic fragments; the library evaluates them |
| **(b)** | PCRM gains native collection primitives implemented to Json.Logic's semantics |

The research leaned toward **(a)** on the strength of the standing adopt-over-build rule,
explicitly deferring the decision until the integration seam had been examined. Examining it
reverses the answer.

---

## Decision

**Adopt the JsonLogic *specification* and its conformance suite. Do not take the library as a
runtime dependency. Express collection quantification in PCRM's existing idiom.**

Concretely: `PcrmGroup` gains a third child kind alongside conditions and nested groups — a
**quantifier** (`some` / `all` / `none` / `filter`) over a named collection input, whose body is
an ordinary `PcrmGroup` evaluated once per element with the element bound as a scoped symbol.

`ConditionEvaluator` is already a composite over that shape. A quantifier is a new node in the
same tree, not a new evaluation model.

**What is still adopted:** the operator semantics, the edge-case behaviour, and the published
conformance tests. That is the hard-won part. **What is not adopted:** roughly thirty lines of
iteration, which EDP is better placed to write itself because it already owns everything that
iteration needs.

---

## Why the seam reverses the adopt-over-build default

The rule says adopt when licence and technical fit allow. Licence is fine. **Technical fit is
not**, for five reasons, each verified against the code rather than reasoned from principle.

### 1. Two coercion models in one rule

EDP compares through `RuntimeValue.Compare`: numeric, then date, then bool, then ordinal
string, with an explicit "not comparable" result. JsonLogic ships `==` (loose, JavaScript
coercion) and `===` (strict).

Embedding fragments means **the same authored comparison coerces differently depending on
whether it sits inside a collection predicate or outside one**. An author writing
`amount = "5000"` would get one answer in a table cell and potentially another inside a
`some`. That is dual-engine drift — the exact failure `ADR-06` and the "one engine, two entry
points" position exist to prevent — reproduced *inside* a single evaluation.

### 2. The trace goes black exactly where explanation is required

Every condition and every group in `ConditionEvaluator` writes a `TraceStep(kind, description,
result)`. `json-everything` evaluates its expression tree internally and returns a value; it
emits no EDP trace steps.

An embedded fragment is therefore **opaque precisely inside the collection logic** — which is
where "why did line 12 fail?" has to be answered. That conflicts directly with **FR-F33**
(an explanation may cite the records that drove the verdict) and with **ADR-AI-05**, which
makes grounded explainability mandatory rather than optional.

Mode (b) writes a trace step per element and per quantifier for free, because it reuses the
evaluator that already does.

### 3. Author-time validation goes blind

`RuleValidator` emits `EDP0xx` diagnostics and `TableCompletenessAnalyzer` reasons over PCRM
structure. Neither can see inside an opaque JSON fragment, so a malformed or unsatisfiable
collection predicate would fail at run time instead of at author time — against the grain of
a platform whose selling point is catching problems before publish.

### 4. PCRM would carry two structural idioms

PCRM is a structured model: field, operator, value, groups. JsonLogic is a nested
array-and-object idiom. Mode (a) puts both in one document, and the designer must generate
*and round-trip* both to reopen a saved rule for editing.

### 5. Empty-collection semantics would be inherited by accident

This one is concrete rather than architectural. The reference implementation contains:

```js
} else if (op === "all") {
  // All of an empty set is false. Note, some and none have correct fallback after the for loop
  if ( ! Array.isArray(scopedData) || ! scopedData.length) {
    return false;
  }
```

**JsonLogic's `all` over an empty collection returns `false`**, deliberately departing from
vacuous truth — and the comment concedes that `some` and `none` are the ones with "correct
fallback".

Applied to the specimen's **G1** — *all invoices of the disbursement carry a beneficiary name
and account number* — a Disbursement Request with **zero invoices** would silently return
*"Beneficiary details are consistent = No"*. That may well be the behaviour the business
wants; an empty DR is itself suspicious. **The objection is not the answer, it is that nobody
would have chosen it.**

EDP has already faced this question once and answered it explicitly: `ResolveAggregate`'s fold
documents that "empty collection is deterministic (Count/Sum 0, others null)". Empty-set
behaviour is a decision this platform makes on the record, not one it inherits from a
JavaScript idiom.

---

## Consequences

**Positive**

- One coercion model, one trace model, one validation model, one structural idiom.
- Per-element trace steps come free, satisfying FR-F33 without additional design.
- **No new sandbox dependency.** The frozen chain in the research addendum — JsonLogic 5.4.3,
  JsonPointer.Net 5.3.1, Json.More.Net 2.1.1, plus `Humanizer.Core` as dead weight in the
  ILRepack — is avoided entirely, and the compounding-pin problem does not gain a second
  entry.
- Empty-set, null and type-mismatch behaviour is chosen and documented per operator.
- B-6 (closed primitive set, extended only by ADR) is enforced by PCRM's own schema rather than
  by a third party's registry.

**Negative, and accepted**

- EDP writes and tests the iteration layer. Mitigated by its small size and by the fact that
  every hard dependency of it already exists.
- Semantic divergence from JsonLogic becomes possible over time. Mitigated by running the
  published conformance cases as a test suite, and by recording each deliberate divergence —
  starting with `all` over an empty collection.
- Deviates from the standing adopt-over-build default, which is why this ADR exists rather
  than a backlog note.

**Neutral**

- Authors never see either representation; the designer generates PCRM from a visual editor.
  This is an internal representation decision with no user-facing consequence.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| **Mode (a) — embed Json.Logic fragments** | The five reasons above. Adopts the trivial part while inheriting a semantic mismatch, an opaque trace, blind validation and a frozen dependency chain |
| **`System.Linq.Dynamic.Core`** | CVE-2023-32571, remote code execution via `Reflection.Emit` over supplied text. A business-authored rule *is* untrusted input. Same principle that rejected `microsoft/RulesEngine` in Phase 2 and chose NCalc over DynamicExpresso in ADR-11 |
| **Extend NCalc expressions to cover collections** | NCalc's `IN` does accept an `IEnumerable`, so this is less impossible than assumed — but quantification belongs in the structured PCRM tree where the designer, validator and trace already operate, not inside formula strings |
| **DMN FEEL semantics instead of JsonLogic** | Equally reputable and arguably richer, but no adoptable netstandard2.0 implementation exists (`feel-scala` is Scala at 136 stars; Drools is Java). Retained as a cross-check for quantifier edge cases |

---

## Registry

Add to `adrs/index.md`:

| ADR-16 | Collection Semantics Adopt the JsonLogic Specification, Not the Library | Proposed | 2026-08-18 | Architect |
