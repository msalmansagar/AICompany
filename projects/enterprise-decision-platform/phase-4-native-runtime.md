# Enterprise Decision Platform — Native C# Rule Runtime Design Specification

**Engagement ID:** EDP-BRE-001
**Phase:** 4 — Technical Build (Product Phase 3: Native C# Rule Runtime)
**Module:** Business Rules Engine (BRE) — Runtime Component
**Parent Product:** Maqsad Low-Code Platform
**Prepared by:** Maqsad AI — Backend Developer
**Date:** 2026-07-04
**Version:** 1.0
**Status:** AUTHORITATIVE — Phase 4 Build Gate (Runtime)

---

## Authority Clause

This document conforms to and extends:
- `phase-0-architecture.md` — Architectural Invariants (Appendix B) are binding and are not re-opened here.
- `phase-3-arch.md` — Platform Foundation Architecture; all ADRs (ADR-01 through ADR-12), PCRM schema (§6), versioning (§11), performance strategy (§17), and extensibility model (§16) are adopted without change.
- `spikes/p3-r1-ncalc-zen-coverage.md` — The bounded EDP Horizon-1 Expression Grammar (31 `EDP_*` custom functions, determinism rules, GAP analysis) is the authoritative reference for the Formula Engine.
- `phase-3-skeptic-triage.md` — W5 (trace write path, ADR-13 candidate), W8 (complexity benchmark), and C1 (PCRM schema governance) dispositions are binding work items.
- `schema/README.md` — Live Dataverse schema (`qdb_edp_` namespace); entity and column names used in this spec match the deployed schema.

Changes to any decision in this document require a formally approved Architecture Decision Record that explicitly names and supersedes the relevant section. Silent deviation is prohibited.

This document is **DESIGN SPEC ONLY**. No complete C# method bodies, no DDL, no migration scripts. Illustrative interface signatures and pseudocode are used to convey design intent; they are not implementations.

---

## Table of Contents

1. Runtime Architecture
2. Compiler Architecture
3. Execution Architecture
4. Validation Architecture
5. Formula Engine
6. Decision Table Engine
7. Variable Engine
8. Function Library
9. Plugin Architecture
10. Workflow Architecture
11. Custom Action Architecture
12. Execution Trace
13. Performance Strategy
14. Caching Strategy
15. Error Handling
16. Extension Model
17. Class Architecture
18. Design Patterns
19. Testing Strategy
20. Architecture Decision Records (Runtime)

---

## 1. Runtime Architecture


### 1.1 End-to-End Pipeline

The native C# Rule Runtime is the single, authoritative evaluator for all decision requests in the Enterprise Decision Platform. Every entry point — Plugin, Custom Action, Custom API, Workflow Activity — converges on this pipeline. No entry point re-implements any evaluation logic.

```
Entry Point (Plugin | Custom Action | Custom API | Workflow Activity)
    │
    │  [thin adapter: authenticate → normalise → invoke → map response]
    ▼
RuleExecutionContext
    │  (rule identifier, optional pinned version, caller identity,
    │   typed input payload, environment flags, pin justification)
    ▼
Rule Resolver
    │  Reads qdb_edp_IsProductionEnvironment env var
    │  Enforces ADR-09 / ADR-12 pin governance
    │  Resolves Rule Version: pinned → exact record;
    │                         default → qdb_edp_ruleversion where
    │                                   lifecyclestate=Published AND isdefaultpublished=true
    ▼
PCRM JSON Load
    │  Reads qdb_edp_ruleversion.qdb_edp_pcrmjson from Dataverse/Org Service
    │  Lightweight structural integrity check (required fields, enum range)
    │  (Full NJsonSchema validation is at save time — not repeated here for performance)
    ▼
RuleCompiler
    │  Deserialises PCRM JSON into domain objects (PcrmDeserialiser)
    │  Validates metadata bindings (IMetadataResolver — live or cached)
    │  Compiles to CompiledRuleGraph (in-memory decision graph)
    │  Resolves execution order (variable dependency sort)
    │  Checks compiled rule cache (Horizon 2)
    ▼
CompiledRuleGraph
    │  (immutable, in-memory; equivalent to a validated, executable plan;
    │   not IL-compiled — an interpreted graph walk, per ADR-R01)
    ▼
RuleExecutor
    │  Binds inputs from execution context to typed variable slots
    │  Evaluates compiled graph:
    │    IF/ELSE/ELSE-IF trees → CompositeCondition → ConditionEvaluator
    │    Decision tables → DecisionTableEngine (hit-policy strategy)
    │    Formula nodes → FormulaEngine (NCalc + 31 EDP_* functions)
    │    Rule variables → VariableProvider (dependency-ordered evaluation)
    │    Sub-decisions → recursive RuleExecutor invocation (depth-bounded)
    │  Collects typed outputs
    │  Builds ExecutionTrace (step-level results, timings, variable snapshots)
    ▼
Decision Result
    │  RuleEvaluationResult: { outputs, resolvedVersionId, durationMs,
    │                          traceCorrelationId, success | typedError }
    ▼
Trace Writer (tiered — ADR-13)
    │  Tier A: Governance audit events → qdb_edp_ruleaudit (synchronous, never dropped)
    │  Tier B: Execution traces → qdb_edp_ruleexecutionlog (async, sampled, degrade gracefully)
    ▼
Entry Point Adapter
    │  Maps RuleEvaluationResult → channel-native response
    ▼
Caller Response
```

### 1.2 Five Invariants (Phase 0 Appendix B reaffirmed)

1. **One Runtime.** This pipeline is the only decision evaluator. No adapter or channel re-evaluates.
2. **Native C#.** All evaluation runs within the CRM/Dataverse plugin sandbox as managed code. No WASM, no Rust, no external process.
3. **Deterministic.** Identical inputs + resolved version = identical outputs. `DateTime.UtcNow` is captured once per evaluation and passed as `__now`; no mutable shared state affects outputs.
4. **Stateless per evaluation.** `ExecutionContext` is allocated per call and discarded. No shared mutable fields on evaluator classes.
5. **Sandbox-bounded.** P95 target ≤ 500ms for Standard Decision Profile decisions. All evaluator operations complete within the 2-minute plugin sandbox ceiling.

### 1.3 Entry Point Adapter Constraints

Each adapter is a thin normalisation layer with these strict boundaries:
- It authenticates/authorises via the platform identity only.
- It constructs a `RuleExecutionContext` from channel-specific inputs with no branching business logic.
- It invokes `RuleExecutor.Execute(context)` — the same method, always.
- It maps `RuleEvaluationResult` to the channel response format.
- It handles typed errors returned by the runtime — it does not catch and swallow.
- It contains no conditions on rule outputs, no decision forks, no rule-specific logic.

### 1.4 On-Premises vs. Cloud Convergence

Both deployment targets converge on the identical `RuleExecutor`. The only platform-specific elements are:
- **Cloud**: `DataverseMetadataResolver` (Web API) and `DataversePersistenceAdapter` (Web API writes).
- **On-Premises**: `OrganizationServiceMetadataResolver` (SDK) and `OrganizationServicePersistenceAdapter` (SDK writes).

Both `IMetadataResolver` implementations present the same interface to the runtime. The evaluator never calls platform-specific APIs directly.

---

## 2. Compiler Architecture

### 2.1 Purpose

The Compiler transforms a PCRM JSON document into a `CompiledRuleGraph` — an in-memory, validated, execution-ready representation of the decision logic. The compiled graph is what the Executor walks. Compilation is the checkpoint at which all structural and metadata errors are caught; the Executor operates on a graph that is guaranteed structurally valid.

Per ADR-R01, the "compiled" graph is an **interpreted graph**, not IL-emitted code. The choice is correct for sandbox safety (no `Reflection.Emit` or `LambdaExpression.Compile()`). See Section 20.

### 2.2 Compiler Pipeline

```
PCRM JSON string
    │
    ▼  [PcrmDeserialiser]
PcrmDocument (typed domain object tree — Inputs, Outputs, Logic, Variables, Functions)
    │
    ▼  [PcrmStructuralValidator]
Structural validation: schema version supported, required fields present,
    enums within registered ranges, no circular variable dependencies
    │
    ▼  [MetadataBindingValidator using IMetadataResolver]
Metadata validation: every input binding references an existing entity + attribute;
    data types match declared types; lookup targets exist; option set values valid
    │
    ▼  [ExpressionValidator using FormulaEngine.Parse()]
Formula/expression pre-validation: each NCalc expression parses without error;
    all referenced variable aliases are declared; all function names are registered
    │
    ▼  [ExecutionOrderPlanner]
Variable dependency graph: topological sort of variable declarations by their
    formula input dependencies; detects cycles (compile-time error, not runtime)
    │
    ▼  [CompiledRuleGraphBuilder]
CompiledRuleGraph: immutable in-memory graph of CompiledNodes
    (ConditionNode, DecisionTableNode, FormulaNode, VariableNode, OutputNode)
    each pre-bound to typed inputs, operators, and expression objects
```

### 2.3 CompiledRuleGraph Node Types

| Node Type | Compiled Representation | Notes |
|-----------|------------------------|-------|
| `ConditionNode` | Typed left-operand binding, registered `IOperatorEvaluator`, typed right-operand (literal or variable ref) | Operator resolved at compile time from registry |
| `CompositeConditionNode` | List of child `ConditionNode`/`CompositeConditionNode` + logical combinator (AND / OR) | Supports arbitrary nesting up to SDP depth limit |
| `IfElseNode` | `CompositeConditionNode` + Then-branch + Else-branch (both are `ICompiledNode`) | Represents expression-tree logic nodes |
| `DecisionTableNode` | Compiled columns (bound inputs, operators), compiled rows (pre-parsed cell conditions as `IConditionExpression` objects), `IHitPolicyStrategy` instance | Hit policy resolved to strategy at compile time |
| `FormulaNode` | NCalc `Expression` object (pre-parsed AST), variable binding map, output alias | NCalc parses the expression string once at compile time |
| `VariableNode` | Alias, data type, `FormulaNode` or `DecisionTableNode` that computes its value | Evaluated before nodes that depend on it |
| `OutputNode` | Output alias, data type, source (literal, variable ref, or formula ref) | Collects final output values |

### 2.4 Compiler Version Compatibility

The compiler maintains a registry of supported `pcrmSchemaVersion` values. The entry point is:

```csharp
// Illustrative — not implementation
interface IPcrmVersionedCompiler
{
    bool Supports(string pcrmSchemaVersion);
    CompiledRuleGraph Compile(PcrmDocument document, IMetadataResolver resolver);
}
```

A `PcrmVersionedCompilerRegistry` maps schema versions to the appropriate `IPcrmVersionedCompiler` implementation. Minor version increments share the same compiler (missing optional fields receive defaults). Major version increments require a dedicated compiler. In Horizon 1, only version `1.x` is supported; a `1.0.0` compiler handles all `1.x` documents.

### 2.5 Design Patterns Applied

- **Builder**: `CompiledRuleGraphBuilder` constructs the immutable graph incrementally.
- **Visitor**: `PcrmDocumentVisitor` traverses the PCRM JSON node tree during compilation; each node type dispatches to a typed `Visit` method.
- **Strategy**: `IHitPolicyStrategy` instances are selected and embedded in `DecisionTableNode` at compile time.
- **Specification**: `IValidationRule<T>` implementations in `PcrmStructuralValidator` and `MetadataBindingValidator` compose via `And()` / `Or()`.

---

## 3. Execution Architecture

### 3.1 Execution Flow

The `RuleExecutor` receives a `CompiledRuleGraph` and an `ExecutionContext` populated with typed input values. It walks the graph and produces an `ExecutionResult`.

```
ExecutionContext:
    inputs (typed key-value: alias → typed value)
    __now  (DateTime.UtcNow captured once at evaluation start)
    caller identity, pin status, trace builder reference

Graph walk order:
    1. Evaluate VariableNodes in topological dependency order
       (each VariableNode's FormulaNode or sub-table is evaluated;
        the result is added to ExecutionContext.Variables)
    2. Evaluate the root logic node:
       - IfElseNode → recursive conditional branch evaluation
       - DecisionTableNode → DecisionTableEngine.Evaluate(table, context)
       - FormulaNode → FormulaEngine.Evaluate(expression, context)
    3. Collect OutputNodes into ExecutionResult.Outputs
    4. Finalise ExecutionTrace with total duration
```

### 3.2 Conditional Logic Evaluation (IF / ELSE-IF / ELSE)

`IfElseNode` evaluation follows standard short-circuit logic:

```
Evaluate CompositeCondition (AND/OR groups, recursive):
  AND group: evaluate each child condition; stop on first false
  OR group:  evaluate each child condition; stop on first true

If condition is true  → evaluate Then-branch (which may itself be an IfElseNode)
If condition is false → evaluate Else-branch (which may be another IfElseNode
                        for ELSE-IF chains, or a terminal OutputNode, or null)

Depth tracking: EvaluationDepthGuard increments/decrements a counter per recursive
  call; throws DepthExceededError if nesting exceeds SDP ceiling (5 levels).
```

### 3.3 Operator × Field-Type Semantics

The Executor dispatches every condition evaluation through a registered `IOperatorEvaluator`. Each evaluator implements the semantics for one operator across all compatible field types.

**Operator Applicability Matrix**

| Operator | Text / Memo | Whole Number | Decimal / Currency | Date / DateTime | Boolean | Option Set / State / Status | Multi-Select | Lookup / Owner / Customer / Unique ID |
|----------|:-----------:|:------------:|:-----------------:|:---------------:|:-------:|:---------------------------:|:------------:|:-------------------------------------:|
| Equals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ (GUID comparison) |
| Not Equals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Greater Than | — | ✓ | ✓ | ✓ | — | — | — | — |
| Greater Than Or Equal | — | ✓ | ✓ | ✓ | — | — | — | — |
| Less Than | — | ✓ | ✓ | ✓ | — | — | — | — |
| Less Than Or Equal | — | ✓ | ✓ | ✓ | — | — | — | — |
| Contains | ✓ | — | — | — | — | — | ✓ (contains value) | — |
| Not Contains | ✓ | — | — | — | — | — | ✓ | — |
| Starts With | ✓ | — | — | — | — | — | — | — |
| Ends With | ✓ | — | — | — | — | — | — | — |
| IN | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ |
| NOT IN | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ |
| Between | — | ✓ | ✓ | ✓ | — | — | — | — |
| Is Null | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Is Not Null | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Before | — | — | — | ✓ | — | — | — | — |
| After | — | — | — | ✓ | — | — | — | — |
| On | — | — | — | ✓ | — | — | — | — |
| On Or Before | — | — | — | ✓ | — | — | — | — |
| On Or After | — | — | — | ✓ | — | — | — | — |

**Field-type evaluation semantics notes:**

- **Equals / Not Equals on Text/Memo**: OrdinalIgnoreCase comparison. Null == null is true. Null != non-null is true.
- **Equals on Decimal/Currency**: decimal comparison after rounding both sides to the field's configured decimal places (drawn from metadata binding). Floating-point intermediate values are not used directly.
- **Equals on Option Set / State / Status**: integer value comparison (the option set value integer). The designer resolves labels to values at save time; the executor sees integers.
- **Equals on Lookup / Owner / Customer**: GUID comparison. The input binding may be the lookup ID (raw GUID) or the lookup name field (resolved to GUID at binding time per metadata).
- **IN / NOT IN**: the right-operand is a typed list. The executor calls the field's equality evaluator for each list element. Set membership is OR-of-equality.
- **Between**: requires two bounds (lower, upper); evaluator asserts lower ≤ value ≤ upper. Null value returns false.
- **Before / After / On / On Or Before / On Or After**: date-only comparison (ignores time component) for Date fields; full timestamp comparison for DateTime fields. "On" = same UTC calendar date. Implemented via EDP_Day/Month/Year component comparison for date fields, timestamp comparison for DateTime fields.
- **Contains / Not Contains on Multi-Select**: tests whether the integer value list of the multi-select attribute contains the specified integer value.
- **Starts With / Ends With**: always OrdinalIgnoreCase; null input → false.
- **Text Contains**: uses `EDP_Contains` semantics (OrdinalIgnoreCase, null → false).

### 3.4 Output Collection

After the graph walk completes, the executor collects all `OutputNode` values from the `ExecutionContext`. Outputs are typed key-value pairs (output alias → typed value). An output whose source formula returned null is included in the result with a null value and is flagged in the trace.

---

## 4. Validation Architecture

### 4.1 Design Principle

Validation is the platform's quality gate, not the runtime's correctness guarantee. Two layers:

1. **Save-time validation** (designer, browser-side): catches authoring errors before the PCRM document reaches storage. This is the primary user-facing layer.
2. **Runtime structural check** (executor, at load time): lightweight check for required fields and enum ranges. Full NJsonSchema validation is NOT repeated here for performance.
3. **Compile-time metadata validation** (RuleCompiler, at first execution): validates metadata bindings via `IMetadataResolver`. This runs when a rule is first compiled for execution.

Phase 4 build note (W8): the compile-time metadata validation budget must be measured as part of the complexity benchmark harness. If it materially contributes to the P95 budget, metadata validation results are cached alongside the compiled graph.

### 4.2 Validation Tiers

| Tier | When | Owner | Blocks |
|------|------|-------|--------|
| JSON Schema (NJsonSchema) | Save time | Rule Translator (browser) | Write to CRM |
| Expression Grammar | Save time | Rule Translator (browser) | Write to CRM |
| Structural Integrity | Load time (runtime) | PcrmStructuralValidator | Execution |
| Metadata Binding | Compile time | MetadataBindingValidator | Execution |
| Expression Parse | Compile time | ExpressionValidator | Execution |
| Dependency Cycle | Compile time | ExecutionOrderPlanner | Execution |
| Operator × Field-Type | Compile time | OperatorCompatibilityValidator | Execution |

### 4.3 Validation Categories

**Metadata Validation** (via `IMetadataResolver`):
- Entity logical name exists in the CRM/Dataverse schema.
- Attribute logical name exists on the declared entity.
- Relationship traversal path is valid (each step exists and connects correctly).
- Attribute data type matches the binding's declared `dataType`.
- Option set values declared in conditions exist in the option set's registered values.
- Lookup target entity matches the attribute's target entity type.

**Expression Validation**:
- NCalc expression parses without syntax error.
- All variable aliases referenced in the expression are declared in the PCRM `variables` array or `inputs` array.
- All function names in the expression are registered in the `FunctionLibrary`.
- EDP H1 grammar: no array function calls, no `rand()`, no template strings, no object literals.
- Output formula wraps with `Round()` when the output alias maps to a Currency or Decimal field (warning tier in H1; hard error in H2).

**Decision Table Validation**:
- At least one row exists.
- All condition column input aliases reference declared inputs or variables.
- All output column aliases reference declared outputs.
- Operators in condition cells are valid for the column's data type (per operator × field-type matrix).
- Hit policy is a registered value (`first`, `all`, `priority`, `collect`).
- `collect` hit policy requires a valid `aggregation` value (`sum`, `min`, `max`, `count`).

**Circular Reference / Broken Reference**:
- No variable references itself directly or transitively (detected by topological sort failure).
- Sub-decision references (rule calling another rule) do not form a cycle; maximum chain depth ≤ SDP ceiling (3).
- All `functionId` references in the PCRM `functions` array resolve to a registered `qdb_edp_rulefunction` record.

### 4.4 Error and Warning Tiers

| Tier | Behaviour | Example |
|------|-----------|---------|
| `CompilationError` | Blocks execution; returns typed error to caller | Unknown entity binding, unparseable expression, circular variable dependency |
| `CompilationWarning` | Logged in trace; execution proceeds | Formula output missing `Round()` wrapper, approaching SDP ceiling |
| `RuntimeError` | Blocks evaluation of the affected path; propagates as typed error | Null input used in arithmetic, unknown function called (should not occur if compile-time passes) |
| `MetadataWarning` | Logged; execution may proceed | Attribute renamed (logical name stable, display name changed) |

### 4.5 Specification Pattern Implementation

Each validation rule implements:

```csharp
// Illustrative interface — no implementation
interface IValidationRule<T>
{
    ValidationResult Validate(T subject, ValidationContext context);
}

// Composed at compile time — not at save time per call
class EntityExistsRule : IValidationRule<RuleBinding> { /* ... */ }
class AttributeExistsRule : IValidationRule<RuleBinding> { /* ... */ }
class OperatorCompatibilityRule : IValidationRule<ConditionDefinition> { /* ... */ }
```

`ValidationContext` carries the `IMetadataResolver`, the `FunctionLibrary` reference, and the collected results list. Validators compose via `ValidationPipeline` (ordered list of `IValidationRule<PcrmDocument>` implementations). The pipeline stops on the first `CompilationError` to avoid cascading false errors.

---

## 5. Formula Engine

### 5.1 Architecture

The Formula Engine wraps NCalc (base package, AST interpreter — no `LambdaCompilation`). It:
1. Registers the 31 `EDP_*` custom functions once at engine initialisation.
2. Accepts a pre-parsed NCalc `Expression` object (compiled during `RuleCompiler` phase — parse once, evaluate many).
3. Binds `ExecutionContext` variables to NCalc parameters.
4. Evaluates the expression.
5. Returns a typed `FormulaResult` or a typed `FormulaError`.

NCalc `Expression` is pre-parsed at compile time to catch syntax errors early and avoid re-parsing on every evaluation.

```csharp
// Illustrative interface
interface IFormulaEngine
{
    ExpressionParseResult Parse(string ncalcExpression);
    FormulaResult Evaluate(ParsedExpression expression, FormulaContext context);
}
```

`FormulaContext` contains: the input alias→value map, the `__now` DateTime parameter, and registered custom functions.

### 5.2 Determinism Rules

| Rule | Mandated Behaviour |
|------|-------------------|
| Current timestamp | `DateTime.UtcNow` captured **once** at `RuleExecutor.Execute()` entry and stored as `context.__now`. Passed to all `FormulaEngine.Evaluate()` calls as an NCalc parameter. `EDP_Now()` is translated to `__now` parameter reference at compile time. |
| Culture | All string formatting and parsing uses `InvariantCulture`. All string comparisons use `OrdinalIgnoreCase`. |
| Decimal arithmetic | NCalc evaluates arithmetic in `double`. Currency/Decimal outputs **must** be wrapped in `Round(expression, scale)`. `scale` is the field's configured decimal places from the metadata binding. |
| Regex evaluation | `EDP_Matches` uses a 100ms `Regex` timeout. On timeout, returns `false` and logs a `CompilationWarning`-level diagnostic in the trace. |
| UTC date operations | All `EDP_Date*` functions operate in UTC. IANA timezone operations are H2 (D-03, D-04, D-26 are GAP in H1). |

### 5.3 EDP Horizon-1 Function Registry

All 31 custom functions must be registered in the NCalc `Expression.EvaluateFunction` handler before any formula evaluation. Categorised below with their authoritative signatures from spike P3-R-1.

#### 5.3.1 String Functions (8)

| Function | Signature | Culture / Notes |
|----------|-----------|-----------------|
| `EDP_Len` | `(s: string) → int` | Returns `s.Length`; null → 0 |
| `EDP_Upper` | `(s: string) → string` | `String.ToUpperInvariant()`; null → null |
| `EDP_Lower` | `(s: string) → string` | `String.ToLowerInvariant()`; null → null |
| `EDP_Trim` | `(s: string) → string` | Trims ASCII whitespace; null → null |
| `EDP_Contains` | `(source: string, search: string) → bool` | `OrdinalIgnoreCase`; null either arg → false |
| `EDP_StartsWith` | `(s: string, prefix: string) → bool` | `OrdinalIgnoreCase`; null → false |
| `EDP_EndsWith` | `(s: string, suffix: string) → bool` | `OrdinalIgnoreCase`; null → false |
| `EDP_Matches` | `(s: string, pattern: string) → bool` | `Regex`, 100ms timeout; null → false; designer validates pattern complexity |

#### 5.3.2 Date Functions (18)

| Function | Signature | Notes |
|----------|-----------|-------|
| `EDP_Now` | `() → DateTime` | Translated to `__now` parameter at compile time |
| `EDP_Date` | `(s: string) → DateTime` | Parses ISO date/datetime; `InvariantCulture`; parse failure → `DateTime.MinValue` |
| `EDP_DateAdd` | `(date, amount: decimal, unit: string) → DateTime` | Units: y/M/w/d/h/m/s |
| `EDP_DateSub` | `(date, amount: decimal, unit: string) → DateTime` | Equivalent to `EDP_DateAdd(date, -amount, unit)` |
| `EDP_DateDiff` | `(from: DateTime, to: DateTime, unit: string) → decimal` | `Math.Floor((to-from).TotalDays / factor)`; approximation documented |
| `EDP_Year` | `(date: DateTime) → int` | UTC year |
| `EDP_Month` | `(date: DateTime) → int` | UTC month 1–12 |
| `EDP_Day` | `(date: DateTime) → int` | UTC day 1–31 |
| `EDP_Hour` | `(date: DateTime) → int` | UTC hour 0–23 |
| `EDP_Minute` | `(date: DateTime) → int` | UTC minute 0–59 |
| `EDP_Second` | `(date: DateTime) → int` | UTC second 0–59 |
| `EDP_DayOfWeek` | `(date: DateTime) → int` | 0=Sunday … 6=Saturday |
| `EDP_DayOfYear` | `(date: DateTime) → int` | 1–366 |
| `EDP_Quarter` | `(date: DateTime) → int` | 1–4 |
| `EDP_Timestamp` | `(date: DateTime) → decimal` | Unix epoch seconds |
| `EDP_StartOf` | `(date: DateTime, unit: string) → DateTime` | Units: day/week/month/quarter/year |
| `EDP_EndOf` | `(date: DateTime, unit: string) → DateTime` | Last instant (23:59:59) of boundary |
| `EDP_IsToday` | `(date: DateTime) → bool` | Compare to `__now` UTC date components |

(EDP_IsYesterday, EDP_IsTomorrow, EDP_IsValidDate, EDP_IsLeapYear are defined in spike P3-R-1 §3.3 and are included in the implementation register. The authoritative total is **31** custom functions as stated in the spike.)

#### 5.3.3 Utility Functions (5)

| Function | Signature | Notes |
|----------|-----------|-------|
| `EDP_Coalesce` | `(a: any, b: any) → any` | Returns `a` if not null, else `b`; both args evaluated (value semantics) |
| `EDP_IsNumeric` | `(value: any) → bool` | True for numeric types or strings parseable as decimal |
| `EDP_ToString` | `(value: any) → string` | `InvariantCulture`; null → `""` |
| `EDP_ToNumber` | `(value: any) → decimal` | `InvariantCulture`; null or unparseable → null |
| `EDP_ToBool` | `(value: any) → bool` | "true"/"yes"/"1" → true; others → false; null → false |

### 5.4 Designer-Facing Function Name Mapping

The designer surfaces function names in business language. The Rule Translator resolves them to their NCalc equivalents.

| Designer Name | NCalc / EDP_* Resolution | H1 Status |
|---------------|--------------------------|-----------|
| Today | `__now` parameter (date comparison uses `EDP_Day`, `EDP_Month`, `EDP_Year`) | COVERED |
| Now | `__now` parameter | COVERED |
| DateDiff | `EDP_DateDiff(from, to, unit)` | COVERED |
| AddDays | `EDP_DateAdd(date, n, 'd')` | COVERED |
| AddMonths | `EDP_DateAdd(date, n, 'M')` | COVERED |
| Year | `EDP_Year(date)` | COVERED |
| Month | `EDP_Month(date)` | COVERED |
| Round | `Round(value, places)` — NCalc native | COVERED |
| Ceiling | `Ceiling(value)` — NCalc native; translator maps `ceil` → `Ceiling` | COVERED |
| Floor | `Floor(value)` — NCalc native | COVERED |
| Upper | `EDP_Upper(s)` | COVERED |
| Lower | `EDP_Lower(s)` | COVERED |
| Trim | `EDP_Trim(s)` | COVERED |
| Length | `EDP_Len(s)` | COVERED |
| Coalesce | `EDP_Coalesce(a, b)` | COVERED |
| IsEmpty | Composed: `EDP_Coalesce(s, '') == ''` — no dedicated function; designer translates at save time | COVERED (composition) |
| Concat | Translated to `+` operator chain: `Concat(a, b, c)` → `a + b + c` | COVERED |
| Min (scalar) | `Min(a, b)` — NCalc native for 2-arg scalar | COVERED |
| Max (scalar) | `Max(a, b)` — NCalc native for 2-arg scalar | COVERED |
| Substring | **NOT in H1 grammar.** Designer rejects at save time. Deferred to H2. | GAP — H2 |
| Replace | **NOT in H1 grammar.** Designer rejects at save time. Deferred to H2. | GAP — H2 |
| Sum (collection) | **NOT in H1 grammar.** NCalc has no array type. For scalar sum, use `+` arithmetic. Designer rejects `Sum(collection)` form. Deferred to H2 Custom Data Provider. | GAP — H2 |
| Average (collection) | **NOT in H1 grammar.** Same reason as Sum. Scalar average: `(a + b) / 2`. Designer rejects `Average(collection)` form. Deferred to H2. | GAP — H2 |

**Handling of Sum/Average rejections**: The designer's save-time pass 1 grammar check (spike P3-R-1 §7) identifies any call to `Sum(`, `Average(`, `Avg(`, `map(`, `filter(` as an untranslatable expression. The error message explicitly states: "Collection aggregation (Sum, Average) is not available in Horizon 1. Use explicit arithmetic expressions for scalar inputs, or configure a Custom Data Provider for related-record aggregation (Horizon 2)."


---

## 6. Decision Table Engine

### 6.1 Purpose

The `DecisionTableEngine` evaluates the compiled `DecisionTableNode` from the `CompiledRuleGraph`. It is responsible for row iteration, cell condition evaluation, hit-policy application, and output collection. It delegates individual cell condition evaluation to the `ConditionEvaluator` (which calls `IOperatorEvaluator` implementations). It delegates formula output cells to `FormulaEngine`.

```csharp
// Illustrative interface
interface IDecisionTableEngine
{
    DecisionTableResult Evaluate(CompiledDecisionTable table, ExecutionContext context);
}
```

### 6.2 Hit Policies

Hit policies are compiled to `IHitPolicyStrategy` instances at `RuleCompiler` time and embedded in the `CompiledDecisionTable`. No hit-policy logic lives in the engine dispatcher.

| PCRM Hit Policy | Strategy Class | Semantics |
|-----------------|---------------|-----------|
| `first` | `FirstMatchStrategy` | Evaluate rows in declaration order; return the first row where all condition cells match; stop iteration. If no row matches and a default row exists, return default row outputs. If no row matches and no default row, return typed `NoMatchError`. |
| `all` | `AllMatchStrategy` | Evaluate all rows; collect outputs from every matching row as a list. Return empty list (not error) if no rows match. Used when the caller expects multiple matching results. |
| `priority` | `PriorityMatchStrategy` | Evaluate all rows; from all matching rows, select the one with the highest `priority` integer value (declared in the PCRM row definition). If two rows share the same priority, the first in declaration order wins. |
| `collect` | `CollectAggregateStrategy` | Evaluate all rows; for each matching row, collect the numeric output column value; apply `aggregation` function (sum / min / max / count) across collected values. Returns a single aggregated value per output column. |

**Default Row**: A decision table may include a row where all condition cells are empty (wildcard — U-10 form from spike P3-R-1). This row matches any input combination that no prior row matched. In `first` policy, the default row is the terminal fallback. In `all` policy, the default row participates only when no other row matched. In `collect` policy, the default row contributes its value when no other rows match.

**Unique Match** (DMN concept): Not exposed as a distinct hit policy in H1. Rules requiring unique-match semantics use `first` policy with the expectation that no two rows should match the same input. The designer does not expose a "Unique" option in H1; this is a planned H2 addition with a PCRM schema minor-version increment and a `UniqueMatchStrategy` implementation.

### 6.3 Condition Cell Evaluation

Each condition cell in a row is pre-compiled at `RuleCompiler` time into a `CompiledCellCondition`:

```
CompiledCellCondition:
    inputAlias       → resolves to ExecutionContext input or variable value
    operator         → IOperatorEvaluator instance (from registry)
    rightOperand     → typed literal value or NCalc Expression (formula-based cells)
```

Evaluation:
1. Resolve `inputAlias` from `ExecutionContext`. If input is null and operator is not Is Null / Is Not Null, the condition evaluates to `false` (null-safe — never throws).
2. Call `operatorEvaluator.Evaluate(leftValue, rightValue, fieldType)`.
3. Return bool.

For wildcard cells (empty condition), the compiled condition is a constant `true` evaluator, incurring zero comparison cost.

AND logic within a row: all condition cells must return `true` for the row to match. Short-circuit evaluation stops at first `false`.

### 6.4 Output Cell Evaluation

Output cells are either literal values (compiled as typed constants) or formula references (compiled as NCalc `Expression` objects). When a row matches:
1. Literal values are returned directly.
2. Formula values call `FormulaEngine.Evaluate(expression, context)`.
3. Output results are written to `ExecutionContext.Outputs` under the column output alias.

### 6.5 Decision Table Trace

The `DecisionTableEngine` records in the `ExecutionTrace` builder for every row evaluated:
- Row ID, whether it matched, elapsed time for that row.
- For matching rows: each output alias and produced value.
- Final hit-policy output: which rows were selected and why.

---

## 7. Variable Engine

### 7.1 Variable Types and Scoping

The EDP runtime supports six conceptual variable types. All are resolved through the `VariableProvider` component.

| Type | Declared in PCRM | Scope | Resolution Order |
|------|-----------------|-------|-----------------|
| **Input** | `inputs[]` array | Rule-level; populated from request payload before evaluation starts | First (pre-execution) |
| **Context** | Injected by runtime | Rule-level; `__now`, caller identity, environment tier | Pre-execution alongside inputs |
| **Rule Variable** | `variables[]` array | Rule-level; computed during evaluation | After inputs; topological order |
| **Temporary** | Implied by rule variable with no output binding | Rule-level; available to downstream nodes but not returned as output | Same as rule variable |
| **Output** | `outputs[]` array | Rule-level; populated by output nodes | After all conditions evaluated |
| **Global** | `qdb_edp_ruleconfiguration` records | Platform-level constants (thresholds, rates) read at engine startup | Loaded at engine init; available to all rules |

### 7.2 Resolution Order

```
1. Context variables (__now, __callerId, __environmentTier)
   [populated by RuleExecutor before graph walk begins]

2. Input variables (from ExecutionContext.Inputs, matched by alias)
   [populated from RuleExecutionContext.InputPayload before graph walk]

3. Global variables (from loaded Rule Configuration records)
   [loaded once at engine init; referenced by alias in PCRM expressions]

4. Rule variables (from PCRM variables[] in topological dependency order)
   [each variable formula evaluated; result stored in ExecutionContext.Variables]

5. Output collection (OutputNodes read from inputs, variables, or literals)
   [populated last, after all conditional logic resolves]
```

### 7.3 Variable Declaration Contract

Each entry in the PCRM `variables[]` array declares:

```json
{
  "variableId": "<stable UUID>",
  "alias":      "<expression-friendly name, unique within rule>",
  "dataType":   "<crm data type>",
  "source": {
    "type":       "formula | decisionTableOutput",
    "expression": "<NCalc expression string — if formula>",
    "tableRef":   "<variableId + outputAlias — if decisionTableOutput>"
  }
}
```

The `ExecutionOrderPlanner` reads all `variables[]` declarations, builds a directed dependency graph (Variable A depends on Variable B if B's alias appears in A's expression), and performs a topological sort. A cycle is a `CompilationError` — never a runtime error.

### 7.4 VariableProvider Interface

```csharp
// Illustrative interface
interface IVariableProvider
{
    void SetInput(string alias, object typedValue);
    void SetContextVariable(string alias, object value);
    void SetComputedVariable(string alias, object typedValue);
    object Resolve(string alias);
    bool IsDeclared(string alias);
    IReadOnlyDictionary<string, object> Snapshot();
}
```

`VariableProvider` is allocated per evaluation (stateless between evaluations). Type mismatch on `SetComputedVariable` → `RuntimeError` with alias, expected type, and actual type.

### 7.5 Null Input Handling

When a required input binding has no value in the request payload:
- `required: false` → alias receives `null`; conditions handle null safely (null → false for most operators).
- `required: true` → executor returns typed `MissingRequiredInputError` before graph walk begins.

---

## 8. Function Library

### 8.1 Architecture

The `FunctionLibrary` is a registry of all callable formula functions available to `FormulaEngine`. It holds built-in `EDP_*` functions and extension custom functions loaded from `qdb_edp_rulefunction` records.

```csharp
// Illustrative interface
interface IFunctionLibrary
{
    void RegisterBuiltIn(string functionName, FunctionHandler handler);
    void RegisterExtension(string functionName, ICustomFunction implementation);
    bool IsRegistered(string functionName);
    FunctionHandler Resolve(string functionName);
}
```

`FunctionHandler` is a delegate matching NCalc's `EvaluateFunctionHandler` signature.

### 8.2 Built-In Function Registration

The `BuiltInFunctionRegistrar` registers all 31 `EDP_*` functions at `RuleExecutor` initialisation. Functions are registered by their exact `PascalCase` prefixed name. NCalc is case-sensitive for function names; the Rule Translator is the single source of function name strings and must output exact registered names (P4-R-05 from spike).

### 8.3 Custom Function Extension Point

Custom functions are registered via `qdb_edp_rulefunction` records with `qdb_edp_isbuiltin = false` and an `implementationClassName` that resolves to a type in a registered extension assembly. If resolution fails, the function is unavailable and any rule referencing it produces a `CompilationError`.

```csharp
// Illustrative extension interface (EDP SDK)
interface ICustomFunction
{
    string Name { get; }
    object Execute(object[] arguments, FormulaContext context);
}
```

Custom function constraints (ADR-11 / P3-R-5):
- Must be deterministic: same inputs always produce same output.
- Must not access the file system, network, or CRM SDK directly.
- Must not store mutable state.
- Must complete within 100ms.
- May use `context.__now` for time; must not call `DateTime.Now` or `DateTime.UtcNow`.

A custom function that violates sandbox constraints is caught as a `CustomFunctionSandboxViolationError`, which propagates to the caller as a `RuntimeError`.

### 8.4 Future Registration Extension

The `FunctionLibrary` is an open extension point. Future Horizon 3 capabilities (AI-assisted function generation, ISV pack functions) register via `RegisterExtension`. The core runtime is closed for modification: new functions are always additions, never edits to existing registrations.

---

## 9. Plugin Architecture

### 9.1 Plugin Entry Point Role

CRM plugins are thin adapters (ADR-06). The plugin class:
1. Receives `IPluginExecutionContext` and `IServiceProvider` from the CRM runtime.
2. Reads input parameters (rule identifier, optional pinned version, input field values from step configuration).
3. Constructs a `RuleExecutionContext`.
4. Resolves the appropriate `IMetadataResolver` and `IPersistenceAdapter` from DI.
5. Calls `RuleExecutor.Execute(context)`.
6. Writes `RuleEvaluationResult` outputs back to plugin output parameters or target entity.
7. Contains no conditions on rule outputs, no decision forks, no rule-specific branching.

### 9.2 Shared Runtime in the Plugin Assembly

All runtime components (`RuleExecutor`, `RuleCompiler`, `FormulaEngine`, `DecisionTableEngine`, `VariableProvider`, `FunctionLibrary`, `TraceWriter`, and all their dependencies) are compiled into a **single ILMerge'd plugin assembly**. No external NuGet packages exist in the CRM environment. Dependencies (NCalc, NJsonSchema, JSON serialiser) are merged at build time. This is a hard requirement for plugin sandbox compliance (phase-3-arch.md §4.6).

### 9.3 Plugin Sandbox Compliance

| Constraint | Compliance Approach |
|-----------|-------------------|
| 2-minute execution ceiling | P95 target <= 500ms; complexity ceiling enforced at save time; sub-decision depth bounded at 3 |
| Partial trust (.NET Framework on-prem) | NCalc AST interpreter only; no `LambdaExpression.Compile()`; no `Reflection.Emit` |
| No unmanaged code | No P/Invoke; no ZEN C# binding; pure .NET Standard 2.0 / .NET Framework 4.6.2+ |
| Per-call isolation | New `ExecutionContext` per call; no shared mutable static state in evaluators |
| Network isolation | No outbound HTTP from evaluation path; metadata reads via `IOrganizationService` |

### 9.4 Plugin Step Registration Design

- Plugin steps that invoke the rule runtime are **synchronous, post-operation** (decision reads) or **pre-operation** (decision-based validation before write).
- Execution trace writes (Tier B, ADR-13) are submitted as **async post-operation** plugin steps, decoupled from the main evaluation pipeline.
- Rule-step configuration (which rule to invoke) is stored in the plugin step's `UnsecureConfiguration` as a JSON object with the `ruleKey`. No rule logic is hardcoded in any step configuration.

### 9.5 Plugin Impersonation

The rule executor operates in the **calling user's context** by default. Field-level security is honoured: the executor cannot read field values the calling user cannot access. The `EDP Rule Executor` security role must be assigned to all service accounts that invoke the runtime.

---

## 10. Workflow Architecture

### 10.1 Scope

The Workflow Activity entry point is a **Horizon 2** capability. It is designed here as a placeholder; Phase 4 implements Plugin and Custom Action / Custom API only.

### 10.2 Workflow Activity Adapter Design (H2 Intent)

A custom `CodeActivity` subclass (on-prem CRM) or Dataverse Custom API wrapper (cloud) acts as the adapter:

```
Workflow Step (configured: rule key, input field mappings, output field mappings)
    |
    v
WorkflowActivityAdapter.Execute(CodeActivityContext)
    |
    +-- Read workflow step input parameters from CodeActivityContext
    +-- Construct RuleExecutionContext from workflow entity and step configuration
    +-- Call RuleExecutor.Execute(context)   [same runtime -- ADR-06]
    +-- Write output parameter values back to CodeActivityContext
```

The `RuleExecutor` is unaffected by the calling context — stateless and sandbox-agnostic. The adapter handles workflow-specific timeout configuration.

### 10.3 Workflow vs. Plugin Semantics

| Concern | Plugin | Workflow Activity |
|---------|--------|-------------------|
| Timing | Synchronous, within the platform event | Synchronous or async (workflow engine controls) |
| Retry | CRM platform retry | Workflow engine retry |
| Runtime invoked | `RuleExecutor.Execute` | `RuleExecutor.Execute` (identical) |
| Trace tier | ADR-13 tiering | ADR-13 tiering (same) |

The single runtime guarantee (ADR-06) means no semantic difference in decision output regardless of entry point. Only the surrounding execution environment differs.


---

## 11. Custom Action Architecture

### 11.1 On-Premises Custom Action

On CRM On-Premises 9.x, the Custom Action entry point exposes the decision runtime to:
- In-process CRM callers (other plugins, workflows that call the action via `ExecuteRequest`).
- External callers via the CRM Organization Service endpoint (SOAP/REST lightweight API wrapping the action).

The Custom Action adapter (`mql_ExecuteDecision` / `qdb_edp_ExecuteDecision`):

```
Custom Action Input Parameters:
    RuleKey             (string)  — stable rule identifier
    InputPayloadJson    (string)  — JSON-serialised input key-value map
    PinnedVersionId     (string, optional) — UUID of pinned Rule Version
    PinJustificationCode (int, optional)
    PinJustificationNote (string, optional)

Custom Action Output Parameters:
    OutputPayloadJson   (string)  — JSON-serialised output key-value map
    ResolvedVersionId   (string)  — UUID of the Rule Version that evaluated
    TraceCorrelationId  (string)  — correlation ID for trace lookup
    ErrorCode           (string)  — empty on success; typed error code on failure
    ErrorMessage        (string)  — empty on success; human-readable on failure
```

The adapter deserialises `InputPayloadJson`, constructs a `RuleExecutionContext`, and calls `RuleExecutor.Execute(context)`. The result is serialised to `OutputPayloadJson`. Errors are returned as output parameters — never as plugin exceptions that would roll back the CRM transaction.

### 11.2 Dataverse Custom API (Cloud)

On Dataverse / D365 Online, the Dataverse Custom API (`qdb_edp_EvaluateDecision`) exposes the decision runtime to external callers via the Dataverse Web API. The Custom API is a CRM-native HTTP endpoint; no external server is required.

```
Custom API Request (Web API):
    POST /api/data/v9.2/qdb_edp_EvaluateDecision
    Body: {
        "RuleKey":           "<string>",
        "InputPayloadJson":  "<json string>",
        "PinnedVersionId":   "<uuid, optional>",
        "PinJustificationCode": <int, optional>,
        "PinJustificationNote": "<string, optional>"
    }

Custom API Response:
    {
        "OutputPayloadJson":  "<json string>",
        "ResolvedVersionId":  "<uuid>",
        "TraceCorrelationId": "<uuid>",
        "ErrorCode":          "<string or null>",
        "ErrorMessage":       "<string or null>"
    }
```

The Custom API is backed by the same plugin assembly and the same `RuleExecutor`. The `DataverseCustomApiAdapter` is the thin normalisation layer between the Custom API request and `RuleExecutionContext`.

### 11.3 External Invocation from Portals and Mobile

Portal and mobile callers (React Native, Power Pages) invoke decisions via the Dataverse Custom API (cloud) or via the on-prem lightweight API wrapping the Custom Action. Neither portal nor mobile clients communicate with the runtime directly; they always go through the entry adapter.

The decision contract (request and response) is stable and versioned. Version increments to the contract require a new Custom API version, not modification of the existing one.

### 11.4 Idempotency

Decision requests are inherently idempotent: the same `RuleKey`, `InputPayloadJson`, and resolved version always produce the same outputs. Callers may safely retry on network failure. The execution log may record duplicate trace entries for retried calls; this is acceptable (trace completeness is subordinate to decision integrity, per ADR-13).

---

## 12. Execution Trace

### 12.1 ADR-13 Tiering

The execution trace system operates in two distinct tiers, as resolved by ADR-13 (authored in this document's Section 20). The tiers are non-negotiable:

**Tier A — Governance Audit Events**
- Events: rule version state transitions (Draft → In Review → Approved → Published → Retired), approval decisions, production pin activations, production-environment designation changes.
- Characteristics: low-volume, durable, append-only, synchronous write, never dropped, never sampled.
- Written to: `qdb_edp_ruleaudit` (append-only CRM entity; no UPDATE/DELETE permitted).
- Written by: `GovernanceAuditWriter` — a dedicated, synchronous component invoked by the governance workflow, not the evaluation pipeline.

**Tier B — Execution Traces**
- Events: per-decision-evaluation telemetry (step-level condition results, timings, variable snapshots, outputs).
- Characteristics: high-volume, asynchronous, configurable retention, configurable sampling rate.
- Written to: `qdb_edp_ruleexecutionlog` (append-only CRM entity).
- Written by: `ExecutionTraceWriter` — invoked asynchronously after the decision result is returned to the caller. A trace write that fails or is throttled by Dataverse must not block or fail the decision.
- Degradation contract: **a trace may be deferred, sampled, or dropped under Dataverse throttle. A trace write must never block or fail a decision. Decision integrity outranks trace completeness.**

### 12.2 Execution Trace Structure

The `ExecutionTrace` object is built during graph evaluation and serialised to JSON for storage in `qdb_edp_ruleexecutionlog.qdb_edp_tracejson` (a memo/JSON column, Horizon 2 — not yet a deployed column in H1 schema). In H1, the execution log record captures the summary fields; the step-level JSON detail is Horizon 2 (Execution Trace Detail, phase-3-arch.md §3.6).

```json
{
  "traceVersion": "1.0",
  "ruleKey": "<string>",
  "resolvedVersionId": "<uuid>",
  "startedAt": "<ISO 8601 UTC>",
  "durationMs": <integer>,
  "inputSummary": { "<alias>": "<redacted-or-value based on FLS>" },
  "outputSummary": { "<alias>": "<value>" },
  "steps": [
    {
      "stepId": "<uuid>",
      "nodeType": "IfElse | DecisionTable | Formula | Variable",
      "nodeId": "<PCRM node id>",
      "conditionResult": true,
      "elapsedMs": <integer>,
      "detail": "<optional: row matched, expression evaluated, variable computed>"
    }
  ],
  "errorCode": "<string or null>",
  "errorMessage": "<string or null>"
}
```

### 12.3 Execution Log Record (H1 — qdb_edp_ruleexecutionlog)

H1 writes to `qdb_edp_ruleexecutionlog` with the following columns (per live schema):
- `resolvedversion` — lookup to `qdb_edp_ruleversion` (the version that evaluated)
- `wouldresolveversion` — lookup to the default-published version (what would have resolved without pinning)
- `pinned` — boolean
- `pinjustificationcode` — option set
- `actor` — caller identity (CRM user reference)
- `executedon` — datetime
- `outcome` — string (Success / NoMatch / CompilationError / RuntimeError)
- `durationms` — integer

The `outputjson` memo column and step-level trace are written in Horizon 2 when the Execution Trace Detail is fully designed.

### 12.4 Sampling and Retention

Sampling rate and retention are controlled by `qdb_edp_ruleconfiguration` records:
- `TraceRetentionDays` — default 90 (controlled by `qdb_edp_DefaultTraceRetentionDays` env var).
- `TraceSamplingRate` — default 100% (write every trace). For high-volume rules, administrators may configure a lower rate (e.g., 10% = write 1 in 10 traces). Sampling is random per evaluation; governance-audit events are never sampled.
- Retention enforcement: a scheduled async plugin step runs daily and deletes `qdb_edp_ruleexecutionlog` records older than the configured retention. Deletion of execution log records older than the retention period is the only permitted DELETE operation on the log entity.

### 12.5 Field-Level Security in Traces

When writing trace input/output values, the `ExecutionTraceWriter` evaluates the calling identity's FLS for each field referenced in the rule bindings. Fields the identity cannot read are replaced with `"[restricted]"` in the stored trace. Field logical names are retained (for governance reference). Values are never stored in clear text for FLS-restricted fields.

---

## 13. Performance Strategy

### 13.1 Standard Decision Profile (SDP) and Targets

The P95 <= 500ms target applies to all Rule Versions within the Standard Decision Profile ceiling (defined in phase-3-arch.md §17.1):

| Dimension | SDP Ceiling | Warning at 80% |
|-----------|-------------|----------------|
| Total conditions | 100 | 80 |
| Max nesting depth | 5 levels | 4 |
| Decision table rows | 200 | 160 |
| Decision table columns | 20 | 16 |
| Chained sub-decisions | 3 | — |
| Output fields | 20 | 16 |
| Formula expression length | 1,000 chars | 800 |
| Rule variables | 10 | 8 |

Phase 4 Work Item W8: Sprint 1 of the runtime build must include a benchmark harness that measures `PCRM deserialise + rule load + evaluation` across multiple complexity profiles on both cloud and on-prem. The SDP ceiling values are confirmed or revised from measurement. The P95 target is non-negotiable; the SDP ceiling values are the levers.

### 13.2 Per-Stage Performance Budget

Within the 500ms P95 budget:

| Stage | Budget | Notes |
|-------|--------|-------|
| Rule Version load from Dataverse (query + read) | <= 100ms P95 | Reduced to ~10ms with Horizon 2 compiled-graph cache |
| PCRM JSON deserialisation | <= 20ms | Standard JSON deserialiser; small payload for SDP-range rules |
| Compile-time metadata validation | <= 50ms | Cached on warm path (see Section 14) |
| Graph compilation | <= 10ms | Once metadata validation completes |
| NCalc expression evaluation (total per rule) | <= 50ms | Sub-millisecond for SDP expressions; 50ms ceiling for complex formulas |
| Decision table evaluation (all rows) | <= 100ms | 200 rows x ~0.5ms per row |
| Trace build (in-memory) | <= 5ms | Memory allocation only; write is async |
| Execution log write (async, decoupled) | Not in P95 | ADR-13: deferred; does not contribute to decision latency |

### 13.3 Design for 100,000+ Executions Per Day

The runtime is stateless per invocation and inherits CRM/Dataverse platform concurrency. Key design choices for high throughput:

- **Compiled-graph cache** (Horizon 2): eliminates repeat PCRM deserialisation and compilation for hot rules. Reduces per-call overhead to input binding + graph walk only.
- **Async trace writes** (ADR-13): execution log writes are decoupled from the decision response. This prevents Dataverse write throttle from affecting decision latency.
- **Read-only metadata resolver**: the runtime never writes metadata during evaluation. Metadata reads are cached (Section 14).
- **Stateless evaluators**: zero shared mutable state means concurrent invocations are safe without locking.

### 13.4 Design for 5,000+ Rules

The runtime is unaffected by the number of rules in the repository; it loads and evaluates one rule per call. Repository size affects designer performance (rule list views, search) but not runtime throughput.

Metadata cache design (Section 14) ensures metadata resolution does not degrade as the entity count grows.

### 13.5 Complexity Ceiling Enforcement

Rules exceeding the SDP ceiling are not blocked from execution; authors are warned at save time. For rules beyond the SDP ceiling:
- The P95 guarantee does not apply.
- The 2-minute sandbox absolute ceiling (P0) remains.
- Authors are advised to split the decision or use an async handoff via the Process Engine.

The `ComplexityGuard` in the `RuleExecutor` tracks nesting depth and sub-decision chain depth at runtime and throws a `SandboxBudgetExceededError` if the absolute ceiling is approached.

### 13.6 NCalc AST Performance (P3-R-7)

NCalc evaluates expressions via an AST interpreter. For SDP-ceiling expressions (1,000 chars, 10 variables), evaluation is sub-millisecond to tens of milliseconds. The 50ms expression evaluation budget is conservative.

If Phase 5 benchmarks show NCalc AST interpretation exceeds 50ms on SDP-ceiling expressions under concurrent load, the remediation path is:
- Cloud (Dataverse, .NET 6+): evaluate `NCalc.LambdaCompilation` for the cloud-only runtime (where partial trust is not a concern). Requires an ADR.
- On-prem (.NET Framework): AST interpreter is mandatory; optimise by pre-parsing expressions at compile time (already in the design).

---

## 14. Caching Strategy

### 14.1 Cache Design Under Sandbox Statelessness

**Key constraint**: the CRM plugin sandbox does not guarantee process persistence between invocations. The plugin host may recycle at any time. No in-process cache can be relied upon across invocations in a correctness-critical way.

**Design response**: all caches are designed for **best-effort performance improvement** with guaranteed correctness fallback:
- On a cache miss (first invocation or after process recycle), the runtime loads from Dataverse and recomputes. This is always correct.
- On a cache hit (same process, cache populated), the runtime uses the cached value. Cache entries must be validated before use (version token check).
- No decision result depends on a cache being warm. Performance degrades gracefully on cold starts.

### 14.2 Compiled Rule Cache (Horizon 2)

**Purpose**: eliminate repeated PCRM deserialisation and compilation for rules invoked frequently within the same plugin process lifetime.

**Key**: `(ruleVersionId, pcrmSchemaVersion, pcrmContentHash)` — a composite key that uniquely identifies the compiled graph.

**Population**: after successful `RuleCompiler.Compile()`, the `CompiledRuleGraph` is stored in a `ConcurrentDictionary` keyed by the composite key.

**Invalidation**: a Post-Operation plugin step registered on `qdb_edp_ruleversion` (state change to Published or Retired) signals a cache invalidation event. In-process, the executor checks the cached version's ID against the resolved version ID; if they differ, the cache entry is discarded and recompiled.

**Immutability advantage**: Published Rule Versions are immutable (phase-3-arch.md §11.2). A cached `CompiledRuleGraph` for a published version will never become stale due to rule content change. The only invalidation trigger is a new default-published version replacing the old one.

**Sandbox caveat**: the cache is process-local. After process recycle, the cache is cold. This is by design — correctness never depends on the cache.

### 14.3 Metadata Cache

| Level | Location | Invalidation | TTL |
|-------|----------|--------------|-----|
| Plugin process memory | `ConcurrentDictionary` in `IMetadataResolver` implementation | Process recycle; metadata version token mismatch | Duration of process lifetime |
| CRM entity cache (`qdb_edp_metadataentitydef`, `qdb_edp_metadataattributedef`) | Dataverse/CRM entity records | Metadata version token mismatch; `qdb_edp_MetadataCacheTtlMinutes` env var (default 60 min) | Configurable |

The metadata cache is populated at first use and refreshed when the metadata version token changes. The runtime reads the version token before serving cached metadata and falls back to a live read on mismatch.

### 14.4 Configuration Cache

Platform Rule Configuration is read from `qdb_edp_ruleconfiguration` records once at first invocation within a plugin process lifetime and held in memory. A `mql_RefreshConfiguration` Custom Action (or `qdb_edp_RefreshConfiguration` per live naming) forces a re-read on the next invocation.

Configuration values:
- Trace retention period, trace sampling rate.
- SDP complexity ceiling parameters.
- Sub-decision chain maximum depth.
- Whether SoD enforcement (author != approver) is enabled.
- Whether simulation requires test passage before submission.

### 14.5 Version Resolution Cache

The Rule Resolver caches the result of "resolve default published version for rule key X" for the duration of the plugin process lifetime. Cache is invalidated when a Post-Operation step on `qdb_edp_ruleversion` detects a `lifecyclestate` or `isdefaultpublished` change.

This cache eliminates the Dataverse query on the hot path. Version resolution is a read-only operation against an immutable state machine; the cache is safe as long as the invalidation trigger fires reliably.

---

## 15. Error Handling

### 15.1 Error Handling Philosophy

Errors in the runtime are explicit, typed results — never a silent null, never a swallowed exception, never a generic `Exception` message (per `.claude/rules/common.md`). The runtime defines a hierarchy of typed errors. Each error carries:
- A machine-readable `ErrorCode` (SCREAMING_SNAKE_CASE string).
- A human-readable `ErrorMessage`.
- A structured `ErrorContext` (relevant identifiers: rule key, version ID, alias, field name, step ID).
- The `CorrelationId` from the `ExecutionContext`.

### 15.2 Error Hierarchy

```
EdpRuntimeError (base)
    CompilationError
        SchemaVersionNotSupportedError    (pcrmSchemaVersion unrecognised)
        MalformedPcrmError                (required fields missing, enum out of range)
        MetadataBindingError              (entity/attribute not found)
        ExpressionParseError              (NCalc parse failure)
        UnknownFunctionError              (function name not in FunctionLibrary)
        CircularVariableDependencyError   (topological sort failed)
        OperatorIncompatibilityError      (operator not valid for field type)

    RuntimeError
        MissingRequiredInputError         (required input alias not in payload)
        NullArithmeticError               (null value in arithmetic expression)
        DivisionByZeroError               (denominator is zero)
        DateParseError                    (EDP_Date received unparseable string)
        RegexTimeoutError                 (EDP_Matches timeout exceeded)
        DepthExceededError                (nesting or sub-decision chain exceeds ceiling)
        CustomFunctionSandboxViolationError

    GovernanceError
        RuleNotPublishedError             (no published version found)
        PinJustificationRequiredError     (production pin without justification)
        RuleVersionNotFoundError          (pinned version ID does not exist)

    NoMatchError                          (first-policy table; no row matched; no default row)
```

### 15.3 Result Pattern

`RuleExecutor.Execute` returns a `RuleEvaluationResult` — a discriminated union of success and error states. It never throws a checked exception for anticipated error conditions.

```csharp
// Illustrative Result type — not implementation
class RuleEvaluationResult
{
    bool IsSuccess { get; }
    IReadOnlyDictionary<string, object> Outputs { get; }
    string ResolvedVersionId { get; }
    string TraceCorrelationId { get; }
    int DurationMs { get; }
    EdpRuntimeError Error { get; }   // null on success
}
```

Callers (entry adapters) check `IsSuccess` and handle both paths. No caller may silently discard an error. If the entry adapter cannot propagate the error to the ultimate caller, it writes it to the execution log and raises a platform event.

### 15.4 Compilation Error Handling

Compilation errors are returned as `RuleEvaluationResult.Error` with `CompilationError` subtype. The evaluation does not proceed. The error is written to the execution log (Tier B) with error context. No `CompilationError` is swallowed.

For rules that consistently produce `CompilationError` on load (e.g., a metadata binding broken by a deleted field), the platform surfaces this via the Rule Analytics entity: a spike in `CompilationError` outcomes on a rule alerts administrators to a broken binding.

### 15.5 Runtime Error Handling

Runtime errors terminate graph evaluation at the point of failure. Partially-evaluated outputs up to the error point are discarded — the result is always complete-success or complete-error, never partial. The `ExecutionTrace` captures which step failed and why.

### 15.6 Formula Error Handling

NCalc evaluation is wrapped in a typed try-catch:

```csharp
// Illustrative pseudocode
try
{
    result = ncalcExpression.Evaluate();
}
catch (NCalcException ex) when (ex.Message.Contains("null"))
{
    return FormulaResult.Error(new NullArithmeticError(expressionText, ex));
}
catch (DivideByZeroException ex)
{
    return FormulaResult.Error(new DivisionByZeroError(expressionText, ex));
}
catch (Exception ex)
{
    // Log full context; return typed RuntimeError
    logger.Error(ex, context: new { ruleKey, versionId, expressionText });
    return FormulaResult.Error(new RuntimeError("EXPRESSION_EVALUATION_FAILED", ex.Message));
}
```

The exception message is never returned directly to the caller (security: exception messages may contain expression content). It is logged internally and a sanitised `ErrorMessage` is returned.

### 15.7 Governance Error Handling

Governance errors (rule not published, pin justification required) are returned immediately by the Rule Resolver before compilation or execution. They are written to the Tier A governance audit log (they are governance events, not just traces).

### 15.8 Error Response Contract (RFC 7807 alignment)

Entry adapters that expose decisions via HTTP (Custom API, on-prem lightweight API) map `EdpRuntimeError` to an RFC 7807 Problem Details response:

```json
{
  "type":     "https://edp.maqsad.io/errors/RULE_NOT_PUBLISHED",
  "title":    "Rule Not Published",
  "status":   422,
  "detail":   "No published version found for rule key 'credit-eligibility-v1'.",
  "instance": "/api/decisions/qdb_edp_EvaluateDecision",
  "extensions": {
    "ruleKey":           "credit-eligibility-v1",
    "correlationId":     "<uuid>",
    "edpErrorCode":      "RULE_NOT_PUBLISHED"
  }
}
```

HTTP status mappings:

| Error Category | HTTP Status |
|---------------|-------------|
| GovernanceError | 422 Unprocessable Entity |
| CompilationError | 500 Internal Server Error (rule is broken at platform level) |
| MissingRequiredInputError | 400 Bad Request |
| RuntimeError | 500 Internal Server Error |
| NoMatchError | 200 OK (with empty outputs or explicit no-match indicator) |

---

## 16. Extension Model

Extensibility is by registration, never by editing the core (Open/Closed). Every extension point is an interface resolved through DI; the core ships with default implementations and knows nothing about custom ones.

| Extension point | Interface | Purpose | Governance |
|-----------------|-----------|---------|------------|
| Custom operator | `IOperatorHandler` | New comparison/logic operator beyond the 21 built-ins | Registered by name; validated at compile time |
| Custom function | `IEdpFunction` | New formula function (registered into the NCalc function table as `EDP_*`) | Sandbox-constrained (no I/O, no reflection); reviewed/signed per P3-R-5 |
| Custom variable provider | `IVariableProvider` | Supply context/global variables (e.g., environment, org-level constants) | Read-only; no side effects |
| Custom validator | `IRuleValidationRule` | Additional platform-owned validation checks | Returns Error/Warning diagnostics |
| Future decision node | `IDecisionNodeExecutor` | New PCRM logic-node kind (e.g., ML score node) | Versioned in PCRM schema; opt-in |
| Future AI node | (via `IDecisionNodeExecutor`) | AI-assisted node — advisory at authoring, deterministic at execution | Never introduces non-determinism into the executed path |

**Registration model:** a `RuntimeRegistry` collects handlers at composition time (plugin `Execute` entry or DI container). The compiler consults the registry to validate that every operator/function/node referenced by a PCRM document has a handler before producing a `CompiledRule` — an unknown extension is a **compile-time error**, never a runtime surprise.

**Invariants:** (1) extensions cannot bypass the sandbox constraints; (2) an extension may add behaviour but may not alter determinism; (3) the core has zero compile-time dependency on any extension assembly.

---

## 17. Class Architecture

The class model below is realised in the `runtime/` reference implementation (Horizon-1 slice) and is the authoritative shape for the full build. Responsibilities are single-purpose; dependencies are injected; the facade is the only public entry surface.

| Class / Interface | Responsibility | Collaborators |
|-------------------|----------------|---------------|
| `RuleRuntimeService` (facade) | The single entry surface all adapters call. Compile-and-cache, then execute. Exposes `Execute` and the `TestRule` harness. | `RuleCompiler`, `RuleExecutor`, compiled-rule cache |
| `RuleCompiler` | Parse PCRM JSON → validate → `CompiledRule`. Command-query separated; throws `RuleCompilationException` with diagnostics on blocking errors. | `RuleValidator`, `PcrmDocument` |
| `RuleValidator` | Platform-owned validation (bindings, operators, symbol refs) → Error/Warning diagnostics. | `IMetadataResolver`, `OperatorEvaluator` |
| `RuleParser` | Deserialise PCRM JSON into `PcrmDocument` (in the slice, folded into `RuleCompiler` via System.Text.Json). | `PcrmDocument` |
| `CompiledRule` | Validated, ready-to-execute rule + content hash (cache key). | `PcrmDocument` |
| `RuleExecutor` | Execute a `CompiledRule`: compute variables, evaluate logic, produce `RuleResult`. Deterministic, one context per call. | `ConditionEvaluator`, `DecisionTableEngine`, `FormulaEngine` |
| `ConditionEvaluator` | Evaluate a boolean group tree (AND/OR/negate/nested). Composite pattern. | `OperatorEvaluator` |
| `DecisionTableEngine` | Execute a table under a hit policy (Strategy). | `OperatorEvaluator` |
| `FormulaEngine` | NCalc-based formula evaluation over the EDP-H1 grammar. | `RuntimeValue`, `RuleExecutionContext` |
| `OperatorEvaluator` | The 21 operators; pure comparison with coercion. | `RuntimeValue` |
| `RuntimeValue` | Value normalisation/coercion (decimal/DateTime-UTC/bool/string) and three-way compare. | — |
| `IMetadataResolver` | Abstraction over CRM metadata. **Live impl** (Org Service/Web API) + **in-memory impl** (tests/Test-Rule harness — the testability seam). | `AttributeInfo`, `FieldType` |
| `RuleExecutionContext` | Per-evaluation inputs/variables + fixed UTC clock (`NowUtc`) + `ExecutionTrace`. Stateless across calls. | `ExecutionTrace` |
| `ExecutionTrace` / `TraceStep` | Ordered per-step record (kind, description, result). | — |
| `RuleResult` | Outcome: Success/Matched/Outputs/Trace/ElapsedMs/Diagnostics. Result pattern, never null. | `ExecutionTrace`, `RuleDiagnostic` |
| `RuleDiagnostic` / `RuleRuntimeException` (+ typed subclasses) | Typed error model with codes and context; never swallowed. | — |

**Entry-point adapters** (`PluginRuntimeAdapter`, `WorkflowActivityAdapter`, `CustomActionAdapter`, future `CustomApiAdapter`) each: authenticate via platform identity → resolve the published PCRM for the requested rule → marshal inputs → call `RuleRuntimeService.Execute` → marshal the `RuleResult` back. They contain **no decision logic** (ADR-06).

---

## 18. Design Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| **SOLID** | Throughout | Single-responsibility classes; DI everywhere; small focused interfaces; depend on abstractions (`IMetadataResolver`). |
| **Facade** | `RuleRuntimeService` | One simple surface over compiler/executor/cache for all adapters. |
| **Interpreter** | `RuleExecutor` + `FormulaEngine` (NCalc AST) | Evaluate the PCRM/expression tree directly — sandbox-safe, no IL emit. |
| **Composite** | `ConditionEvaluator` over `PcrmGroup` | Uniformly evaluate nested groups + leaf conditions. |
| **Strategy** | `DecisionTableEngine` hit policies; `IOperatorHandler` | Swap hit-policy / operator behaviour without branching the core. |
| **Specification** | `RuleValidator` checks | Each validation is an independent, composable rule producing diagnostics. |
| **Builder** | `RuleExecutionContext` / result assembly | Assemble per-evaluation state and outputs step-by-step. |
| **Factory / Registry** | `RuntimeRegistry` for extensions | Resolve operator/function/node handlers by name at compile time. |
| **Dependency Injection** | All collaborators | No `new()` of dependencies inside logic; testable via mocks (esp. `IMetadataResolver`). |
| **Result pattern** | `RuleResult` | Communicate success/failure without null or cross-boundary exceptions. |

Deliberately **not** used: the Visitor pattern was considered for PCRM traversal but the node set is small and stable in Horizon 1, so direct interpretation is simpler (YAGNI). Revisit if the PCRM node taxonomy grows.

---

## 19. Testing Strategy

The runtime is designed to be **fast-locally-testable with no CRM** — the single most valuable testing property (Milestone A). Achieved via `IMetadataResolver`: tests supply an in-memory resolver and execute PCRM fixtures.

| Test suite | Covers | Style |
|------------|--------|-------|
| Operator tests | All 21 operators, coercion, normalisation, null/empty semantics | AAA, `[Theory]` data-driven |
| Formula tests | EDP function set, InvariantCulture/UTC determinism, fixed-clock `Today()/Now()`, `Sum/Average` → H2 error | Pure `FormulaEngine` |
| Compiler/validation tests | Parse errors, binding/operator/symbol diagnostics, Error-vs-Warning tiering | Via facade |
| Condition-set execution | IF/ELSE-IF/ELSE, AND/OR/nested, the designer's worked DOA example, trace | End-to-end via facade |
| Decision-table tests | First / Priority / Unique / All hit policies + default row | End-to-end via facade |
| End-to-end tests | Variables via formula → branch, determinism across runs, `TestRule` timing | Milestone-A harness |
| Performance/regression (build phase) | Complexity-ceiling cases at P95 (W8 harness), cloud+on-prem parity fixtures, golden-file regression | Benchmark + golden files |

**Reference implementation status:** the `runtime/` slice ships **40 passing tests** across the first six suites. Performance/regression suites are added with the benchmark harness in the build phase.

**Test principles (per common.md):** AAA, behaviour-named tests, real implementations over mocks except the metadata boundary, fast/isolated/repeatable. Every new operator/function/node ships with its own tests before merge.

---

## 20. Architecture Decision Records

Runtime-specific ADRs, numbered `ADR-R0x` to avoid colliding with platform ADR-01…13 and designer ADR-D01…05. **ADR-13 (the platform-level trace/audit decision) is authored here** because the runtime owns its implementation.

### ADR-13: Two-Tier Write Path — Durable Audit vs. Async Sampled Trace
**Status:** Accepted · **Date:** 2026-07-04 · **Decided by:** Architect (closes triage W5)
**Context:** A synchronous per-evaluation execution-log write couples decision latency to a CRM write and becomes a bottleneck at 100k–1M/day against Dataverse API limits. But governance requires durable, complete audit of decisions.
**Decision:** Split the write path into two tiers.
- **Governance audit events** (version transitions, approvals, production pins) → **low-volume, durable, append-only, never dropped**, written to `qdb_edp_ruleaudit`. These are synchronous and must succeed.
- **Execution traces** (per-evaluation telemetry) → **high-volume; written asynchronously/buffered with configurable retention and sampling; degrade gracefully under throttle**. A trace may be deferred or sampled, but trace persistence **must never block or fail a decision**. Decision integrity outranks trace completeness. Written to `qdb_edp_ruleexecutionlog`.
Exact throttle thresholds, buffer sizing, and sampling rates are **measured in the build** (W8 harness), cloud and on-prem separately.
**Consequences:** The `RuleResult` returns before the trace is durably written; trace loss under extreme load is acceptable and logged, audit loss is not. Two distinct sinks (`IAuditSink` durable, `ITraceSink` best-effort). Phase 6 (C-005) verifies audit durability and append-only enforcement across all write paths.

### ADR-R01: Interpret PCRM Directly (No IL/Expression Compilation)
**Status:** Accepted · **Date:** 2026-07-04
**Context:** A "compiled rule graph" could mean emitting IL/`Expression.Compile()` for speed, or interpreting the validated PCRM tree. The CRM plugin sandbox (partial trust on older on-prem .NET) restricts dynamic code emission.
**Decision:** "Compilation" means **parse + validate + build an in-memory `CompiledRule`** that the executor **interprets**; NCalc is used in AST-interpreter mode (no LambdaCompilation). No IL emit, no `Expression.Compile()`.
**Consequences:** Sandbox-safe and on-prem/cloud identical. Interpretation is fast enough for the H1 complexity ceiling (validated by the W8 benchmark, P3-R-7); if a future high-complexity tier needs it, a cloud-only compiled path can be added behind the same interface via ADR.

### ADR-R02: `IMetadataResolver` Abstraction for Local Testability
**Status:** Accepted · **Date:** 2026-07-04
**Context:** The runtime needs CRM metadata (field types, entity/attribute existence), but tying it to the Organization Service would make it un-testable without a live org and slow to iterate.
**Decision:** All metadata access goes through `IMetadataResolver`, with a live Org Service/Web API implementation and an in-memory implementation. The runtime compiles and executes PCRM fixtures with the in-memory resolver — **no CRM needed** (Milestone A).
**Consequences:** Fast local unit/integration tests and a real Test-Rule harness. The live resolver is the only component that must be integration-tested against CRM; everything above it is tested locally.

### ADR-R03: Content-Hash Compiled-Rule Cache, Non-Durable by Design
**Status:** Accepted · **Date:** 2026-07-04
**Context:** Recompiling identical PCRM on every evaluation is wasteful; but the plugin sandbox does not guarantee durable in-process state across invocations.
**Decision:** Cache `CompiledRule` by PCRM **content hash** in a process-level concurrent cache. Treat the cache as a **best-effort within-process optimisation**, not a persistence guarantee — correctness never depends on a cache hit. Invalidate implicitly: a new PCRM version has a new hash, so stale entries are never served.
**Consequences:** Correct under sandbox recycling; no explicit invalidation logic needed for version changes. Metadata and configuration caches follow the same version-token/best-effort philosophy.

### ADR-R04: NCalc as the Formula Evaluator (implements ADR-11)
**Status:** Accepted · **Date:** 2026-07-04
**Context:** ADR-11 selected NCalc. The runtime must bind the EDP-H1 grammar (31 `EDP_*` functions + natives) onto it deterministically.
**Decision:** Use NCalc's AST interpreter with custom-function registration for the `EDP_*` set; enforce determinism (InvariantCulture strings, UTC dates, `Today()/Now()` from the context's fixed `NowUtc`, away-from-zero rounding). Collection aggregates (`Sum`/`Average`) raise a clear H2 error rather than guessing scalar semantics.
**Consequences:** Formula behaviour matches the spike and the designer's save-time validation. NCalc + System.Text.Json must be IL-merged for isolated-sandbox plugin deployment (packaging-phase task; noted in `runtime/README.md`).

### ADR-R05: Single Runtime Behind Thin Adapters (implements ADR-06)
**Status:** Accepted · **Date:** 2026-07-04
**Context:** Four entry points (plugin, workflow activity, custom action, future custom API) must not each re-implement decision logic.
**Decision:** All adapters call one `RuleRuntimeService`. Adapters only authenticate, resolve the published PCRM, marshal inputs, and marshal the result. No branching decision logic lives in an adapter.
**Consequences:** One place to test and evolve decision semantics; parity across entry points is structural, not maintained by convention.

---

*End of Document — EDP-BRE-001 Native C# Rule Runtime Design Spec (Product Phase 3).*
*A Horizon-1 reference implementation lives in `runtime/` (40 passing local tests). This document is authoritative for the runtime build. Changes require an ADR.*
*Prepared by: Maqsad AI — .NET / Decision-Engine Architect | Date: 2026-07-04*

