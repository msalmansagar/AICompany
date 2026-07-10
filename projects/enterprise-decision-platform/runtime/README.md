# EDP.RuleRuntime — Native C# Rule Runtime (Horizon-1 slice)

**Engagement:** EDP-BRE-001 — Enterprise Decision Platform / Business Rules Engine
**Status:** Working vertical slice — compiles, **40/40 local tests passing**, no CRM required.
**Design ref:** `../phase-4-native-runtime.md` (this code implements the runtime spec).

## What this is
The single native C# runtime that executes the **Platform Canonical Rule Model (PCRM)** — the only format it reads. It contains **no GoRules/ZEN dependency** (invariant ADR-01/ADR-03). One runtime behind every entry point; entry-point adapters (plugin/workflow/custom action) carry no decision logic.

This is a **Horizon-1 slice**, not the full 20-section spec realised. It proves both architectural spines end-to-end and gives the fast local test loop (**Milestone A**).

## Implemented
- **PCRM model** (`Pcrm/`) — v1.0 shape: condition sets (IF / ELSE-IF / ELSE, AND/OR/nested groups) + decision tables.
- **Compiler** (`Compiler/`) — parse → validate → `CompiledRule`; platform-owned `RuleValidator` (metadata bindings, operators, symbol refs → Error/Warning); content-hash for caching.
- **Executor** (`Executor/`) — deterministic, stateless-per-call; computes variables, evaluates logic, produces outputs + trace + timing.
- **Operators** (`Operators/`) — all 21 EDP-H1 operators with type-coercing comparison (numbers → dates → invariant-ordinal string).
- **Formula engine** (`Formula/`) — NCalc AST interpreter (sandbox-safe, no LambdaCompilation) + EDP function set; `Today()/Now()` use a fixed UTC clock for replay determinism; `Sum()/Average()` over collections correctly raise an H2 error (faithful to the spike).
- **Decision-table engine** (`DecisionTable/`) — First / Priority / Unique / All hit policies + default row.
- **Metadata** (`Metadata/`) — `IMetadataResolver` abstraction with an in-memory implementation → **local unit testing with no CRM**.
- **Facade** (`RuleRuntimeService`) — compile-and-cache + execute + `TestRule` harness.

## Run the tests locally
```
cd runtime
dotnet test
```
No Dataverse connection, credentials, or designer needed — tests execute PCRM fixtures against an in-memory metadata resolver. Test suites: operators, formula determinism, condition-set execution (incl. the designer's worked DOA example), decision-table hit policies, and end-to-end (variables + trace + timing + determinism).

## Local browser test harness (`tools/EDP.RuleRuntime.DevHarness`, net9)
A **developer tool** (not the product) for click-testing rules in a browser. It hosts the *same* `RuleRuntimeService` behind a tiny local API + static page.
```
cd runtime/tools/EDP.RuleRuntime.DevHarness
dotnet run
# then open the printed http://localhost:<port>
```
Paste a PCRM rule + input values, click **Evaluate**, and see the decision, outputs, and full execution trace. Uses a permissive metadata resolver so any rule runs unseeded. No Dataverse connection — this is why it does not violate the zero-external-infra invariant (that governs the shipped product's execution, which stays in CRM).

## Sandbox / packaging note
Core library targets **netstandard2.0** for CRM plugin-sandbox compatibility. NCalc + System.Text.Json must be **IL-merged** into the plugin assembly for isolated-sandbox deployment — a packaging step for the plugin phase, not needed for local tests. (NCalcSync 5.4.2 currently carries advisory GHSA-3w5p-95mh-gq75 — revisit version at packaging time.)

## CRM integration (`src/EDP.RuleRuntime.Crm`, net462)
The Option-1 build — the runtime wired into CRM, all **locally tested with a fake `IOrganizationService` (no live org)**:
- `OrgServiceMetadataResolver` — live `IMetadataResolver` over the Organization Service (retrieves + caches entity metadata, maps CRM attribute types → `FieldType`).
- `CrmValueConverter` — CRM types (Money/OptionSetValue/EntityReference/…) → runtime value space.
- `DataverseAuditSink` (durable) + `DataverseTraceSink` (best-effort, never throws) — the two ADR-13 tiers, writing to `qdb_edp_ruleaudit` / `qdb_edp_ruleexecutionlog`.
- `RuleDecisionService` — binds inputs from a target record, executes the single runtime, emits trace.
- `EvaluateDecisionPlugin : IPlugin` — thin Custom API/Action entry adapter (ADR-06/ADR-R05).

10 adapter tests (value conversion, live metadata mapping, both sink behaviours, end-to-end decision + trace, PCRM resolution).

## Not yet built / not yet deployed
- **Nothing has been registered in the live org** — plugin registration + IL-merge packaging are the next step, pending explicit go-ahead.
- Workflow-activity adapter, multi-select/lookup value semantics, custom-function registration, and the benchmark harness (triage W8).
