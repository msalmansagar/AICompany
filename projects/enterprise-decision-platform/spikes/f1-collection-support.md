# Spike — What the runtime does with a collection today (EDP-FACT-001 F1)

**Date:** 2026-08-18
**Status:** COMPLETE — measured, not reasoned
**Harness:** `runtime/tests/EDP.RuleRuntime.Tests/CollectionSupportSpikeTests.cs` — **committed**, 7 tests, all passing on net9
**Question:** F1 assumes the runtime cannot carry collections. Where exactly is the ceiling, and how much of F1 is therefore already built?

---

## Why this spike exists

The adopt-over-build research asserted, from reading source, that **NCalc is not what blocks
collection support** — that EDP's own normalisation layer flattens collections before NCalc
ever sees them. If true, F1 is materially cheaper than the BRD assumed.

That assertion was worth a test rather than a paragraph. The BRD's own §11.1 lists it as a
measurement owed. This is that measurement.

The harness is **committed**, not left in a scratchpad — OQ-B1's harness was lost to a temp
wipe, which made its published numbers unreproducible.

---

## Findings

### 1. CONFIRMED — NCalc is not the blocker

A collection passes through `RuleExecutionContext` unchanged, reaches `FormulaEngine`, and
NCalc's `in` operator evaluates against it correctly.

```csharp
Context(("invoiceNumbers", new List<object?> { "1", "2", "5" }));
new FormulaEngine().Evaluate("'2' in invoiceNumbers", context);   // => true
```

`RuleExecutionContext` stores `object?` with no type constraint, so it carries a `List<object?>`
by reference identity. **The expression layer already works.**

### 2. CONFIRMED — the ceiling is ours, in `RuntimeValue.FromJson`

```csharp
JsonDocument.Parse("{\"refs\":[11,12]}").RootElement.GetProperty("refs");
RuntimeValue.FromJson(refs);   // => "[11,12]"   (a string)
```

A JSON array is flattened to its raw text. This is the single line that makes collections
unreachable in practice, and it is EDP's own code.

`OperatorEvaluator.InList` even accepts a `JsonElement` array **directly** — so the operator
layer is ahead of the value layer that feeds it.

### 3. 🔴 NEW — `in` silently returns **false** for a value-typed collection

This was not visible from reading the code and is the reason the spike earned its keep.

```csharp
var amounts = new List<decimal> { 5000m, 100000m };
OperatorEvaluator.Evaluate("in", 5000m, amounts, null);   // => FALSE. Not an error.
```

`InList` pattern-matches `IEnumerable<object?>`. `List<decimal>` is `IEnumerable<decimal>`, and
**generic variance does not apply to value types**, so the collection branch never matches. The
value falls through to the comma-separated string fallback, which compares `"5000"` against
`"System.Collections.Generic.List\`1[System.Decimal]"` and returns false.

**Severity: this is a silent wrong answer, not a failure.** A fact-assembly layer building
`List<decimal>` of line-item amounts, or `List<Guid>` of ids — both entirely natural — would get
`false` from every membership test with no diagnostic. On a duplicate-detection control, a
silent `false` means *"no duplicate found"*.

**F1 must normalise collection element types at the boundary, or make the mismatch an error.**
It must not be left to the caller to remember.

### 4. Two flattening points that disagree with each other

| Layer | Input | Result |
|---|---|---|
| Core — `RuntimeValue.FromJson` | JSON array | `"[11,12]"` — raw text string |
| CRM adapter — `RuleDecisionService.ParseInputsJson` | JSON array | **`null`** (its `switch` returns null in `default`) |

The same payload reaching the engine by two routes produces two different values, neither of
them a collection. **F1 must unify these**, and the adapter path is the one a Custom API caller
actually uses.

### 5. CONFIRMED — no quantifier exists

`Some(...)`, `All(...)`, `None(...)` and `Filter(...)` are absent from `FormulaEngine`; invoking
one throws. That is the genuine gap FR-F1 and FR-F2 close.

---

## What this means for the F1 estimate

| F1 component | State |
|---|---|
| Context carries collections | **Already works** |
| Operator-layer membership (`in`) | **Already works** for reference-typed and `JsonElement` collections |
| Value-layer collection type | **Missing** — one flattening line in core, one in the adapter |
| Element-type normalisation | **Missing, and actively dangerous today** (finding 3) |
| Quantifiers `some`/`all`/`none`/`filter` | **Missing** — the real build, and per ADR-16 it is a node in `PcrmGroup`, not a new evaluator |
| Trace, coercion, null handling, validation | **Already exist** and are reused unchanged |

**The assertion holds: F1 is smaller than the BRD assumed.** The expression and operator layers
are largely in place. What F1 actually builds is a collection value type, a boundary
normalisation, and a quantifier node — not a collection subsystem.

**But finding 3 adds work the BRD did not anticipate**, and it is the kind that ships quietly.
It should be fixed regardless of whether F1 proceeds, because the `in` operator is live today.

---

## Recommendation

1. **Treat finding 3 as a defect in current code, not an F1 task.** `in` against a value-typed
   collection returns a silent wrong answer now, on a shipped operator.
2. **Unify the two flattening points** (finding 4) as the first F1 change — the disagreement is
   a latent defect independent of collections.
3. **Estimate F1 as: value type + boundary normalisation + quantifier node.** Not a subsystem.
4. Re-run this harness after F1. Assertions 2, 3, 4 and 5 are expected to change — that is the
   point of a characterisation test, and each change should be a deliberate edit.

---

## VERIFICATION

| Claim | How | Result |
|---|---|---|
| All findings | `dotnet test --filter CollectionSupportSpike` | **7/7 passed, net9** |
| Finding 4, adapter behaviour | Read from `RuleDecisionService.ParseInputsJson` | **Not covered by a test** — the adapter lives in the Crm test project and needs the Xrm SDK. Verified by reading only, and labelled as such |
| net462 behaviour | **NOT run** | Local net462 discovery is a known vstest quirk in a fresh worktree; CI is the authoritative net462 gate |
