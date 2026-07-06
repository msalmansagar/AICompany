# Enterprise Decision Platform — Phase 4: Testing, Governance & Enterprise Rule Management

**Engagement ID:** EDP-BRE-001
**Phase:** 4 — Technical Design (Product Phase 4: Testing, Governance & Enterprise Rule Management)
**Module:** Business Rules Engine (BRE)
**Parent Product:** Maqsad Low-Code Platform
**Prepared by:** Maqsad AI — Solution Architect
**Date:** 2026-07-04
**Version:** 1.0
**Status:** AUTHORITATIVE — Phase 4 Build Input

---

## Authority Clause

This document conforms to and extends:
- `phase-0-architecture.md` — Architectural Invariants (Appendix B) are binding. Zero external infrastructure. CRM-native. Single runtime.
- `phase-3-arch.md` — Domain Model (§3), PCRM (§6), Metadata Architecture (§7–8), Security (§10), Versioning (§11), ADRs ADR-01 through ADR-12.
- `phase-4-visual-rule-designer.md` — Designer spec; ADRs ADR-D01 through ADR-D09 adopted.
- `phase-4-native-runtime.md` — Runtime spec; ADR-13 Trace Tiering is binding; execution trace structure (§12) adopted without change.
- `schema/README.md` — Live Dataverse schema (`qdb_edp_` namespace). All entity and column names used here match the deployed schema.

Changes to any decision in this document require a formally approved Architecture Decision Record (ADR) that explicitly names and supersedes the relevant section. Silent deviation is prohibited.

This document is DESIGN SPECIFICATION ONLY. No C#, React/TypeScript, or production code is produced. Conceptual JSON shapes and ASCII layout sketches are used where they serve clarity.

---

## Legend — Implementation Status Tags

Every section header carries one of the following tags:

| Tag | Meaning |
|-----|---------|
| **[ALREADY-EXISTS]** | Deployed to Dataverse and working end-to-end today |
| **[EXTEND]** | Schema or code exists; additional design and build required |
| **[NET-NEW]** | No schema or code exists; full design and build required |

Within each section, concrete existence status is stated for individual sub-capabilities.

---

## Table of Contents

1. Executive Summary
2. Testing Architecture
3. Test Rule Studio [EXTEND]
4. Simulation Framework [EXTEND]
5. Execution Trace [ALREADY-EXISTS → EXTEND]
6. Visual Debugger [NET-NEW]
7. Validation Framework [ALREADY-EXISTS → EXTEND]
8. Versioning Strategy [EXTEND]
9. Approval Workflow [NET-NEW (schema only)]
10. Audit Architecture [EXTEND]
11. Documentation Architecture [NET-NEW]
12. Dependency Management [NET-NEW (schema only)]
13. Comparison Engine [NET-NEW]
14. Search Architecture [NET-NEW]
15. Rule Library [NET-NEW (schema only)]
16. Regression Testing [NET-NEW]
17. Performance Analytics [EXTEND]
18. Dashboard Design [NET-NEW]
19. CRM Data Model
20. Security Model [NET-NEW]
21. Reporting Strategy [NET-NEW]
22. Risks
23. Recommendations
24. Acceptance Criteria
25. Architecture Decision Records (ADR-G series)
26. CRM Metadata Explorer [NET-NEW]
27. Execution Log Management & Viewer [EXTEND]

---

## 1. Executive Summary

The Enterprise Decision Platform Business Rules Engine is a fully deployed, end-to-end working system: 22 Dataverse entities are live, the Custom API `qdb_edp_EvaluateDecision` executes rules, the native C# runtime evaluates decisions, designers author via the GoRules-based web resource, and execution logs are being written to `qdb_edp_ruleexecutionlog`. The core decisioning loop is operational.

This Phase 4 specification addresses the governance, quality, and manageability layer that transforms a working engine into an enterprise-grade product: a Test Rule Studio for authored scenario management, a rich Simulation Framework with batch and comparison capabilities, a Visual Debugger for step-by-step evaluation inspection, a maker-checker Approval Workflow, a comprehensive Audit Architecture, auto-generated Documentation, a Dependency Graph and Comparison Engine, a Role Library, Regression Testing, Performance Analytics, Dashboards, a CRM Metadata Explorer, and an Execution Log Management viewer. Seven net-new Dataverse entities are recommended to support these capabilities.

The architecture principle is unchanged: zero external infrastructure. Every capability described here is implemented as CRM/Dataverse plugins, web resources, Custom APIs, and entity records — identical on Dynamics 365 Online and Dynamics CRM On-Premises 9.x.

Performance targets that apply to all new capabilities: repository of 5,000+ rules, 500 concurrent users, 100,000+ executions per day. Governance targets: every state transition audited with actor/timestamp/change; every test scenario reproducible; every approval decision attributed and explainable.

---

## 2. Testing Architecture

### 2.1 Testing Philosophy

The EDP testing architecture separates three distinct testing concerns, each with a different purpose, audience, and retention policy:

| Concern | Owner | Purpose | Retention |
|---------|-------|---------|-----------|
| **Unit testing of a rule** (Test Rule Studio) | Rule Author | Verify a specific rule produces correct outputs for named scenarios | Permanent (owned by rule) |
| **Simulation** | Rule Author / Analyst | Explore rule behaviour with ad-hoc inputs before publishing | 30 days (`SimulationTraceRetentionDays`) |
| **Regression testing** | Rule Approver / Admin | Verify a changed version does not break existing known-good behaviour | Permanent (regression baseline linked to rule) |

Production execution traces are a fourth category: they record what actually happened in production, and serve as the primary audit evidence. They are not tests — they are observations.

### 2.2 Testing Boundaries

**In scope for this Phase 4 testing design:**
- Authoring and running named test scenarios against any rule version from the designer.
- Saving, re-running, cloning, and exporting test scenarios.
- Comparing actual outputs against expected outputs with a pass/fail verdict.
- Batch simulation with multiple input sets.
- Regression suite management and run history.
- Visual debugger for step-by-step trace inspection.

**Out of scope (CRM platform-level):**
- Unit testing of the C# runtime code (that is the developer's responsibility under the `.claude/rules/common.md` code standards — every public method has a unit test).
- Load testing and stress testing of the runtime (covered in Performance Analytics §17).
- End-to-end portal or mobile integration testing (covered by the QA phase).

### 2.3 Testing Entry Points

All testing is routed through the same `qdb_edp_EvaluateDecision` Custom API, ensuring test results faithfully represent what production execution would produce. There is no separate test runner or mock runtime. This is a fundamental principle: testing the real runtime with real inputs gives meaningful results.

```
Rule Author (designer)
    |
    ├── Test Rule Studio → ad-hoc input → Custom API → trace + outputs → save as scenario
    |
    ├── Simulation Framework → multi-scenario / batch → Custom API (n times) → compare
    |
    └── Regression Suite → saved baseline scenarios → Custom API → diff against baseline
```

### 2.4 Test Data Strategy

Test input values can come from three sources:

1. **Manual entry** — author types values field by field using the same type-aware input widgets as the metadata picker.
2. **Sample CRM record** — author selects a real CRM record; the system reads its field values and pre-populates inputs (subject to field-level security).
3. **JSON upload** — author pastes or uploads a JSON payload matching the rule's input schema.

All three paths produce a typed input map that is passed to the Custom API. The distinction is only in how the map is assembled; the evaluation is identical.

---

## 3. Test Rule Studio [EXTEND]

### 3.1 Current State

**ALREADY-EXISTS (core):** The designer's Test panel (stub described in phase-4-visual-rule-designer.md §2) calls the Custom API with manual inputs and displays outputs, trace JSON, diagnostics, and timing. The `qdb_edp_ruletest` entity exists in Dataverse with `testcasesjson` (memo) and `lastresult` columns. One `qdb_edp_ruletest` record per rule.

**What does not yet exist:** The ability to save a test scenario, name it, re-run it independently, compare results across runs, export scenarios, or clone them. There is also no sample-CRM-record input or JSON-upload path in the current designer stub.

### 3.2 Test Rule Studio Design

The Test Rule Studio is a panel within the Rule Designer, accessible from the designer toolbar. It replaces the current Test panel stub with a full scenario management interface.

```
+------------------------------------------------------------+
| TEST RULE STUDIO                           [Run All] [+New] |
+--------------------+---------------------------------------+
| SCENARIOS (list)   | SCENARIO DETAIL                       |
|                    |                                       |
| [P] Credit High    | Name: Credit Score - High Risk        |
| [P] Credit Low     | Version: v3 (Published)               |
| [F] Edge - Zero    |                                       |
| [?] New Scenario   | INPUTS                                |
|                    |  Credit Score:  450                   |
|                    |  Annual Income: 35000                 |
|                    |  [Load from CRM record] [Upload JSON] |
|                    |                                       |
|                    | EXPECTED OUTPUTS                      |
|                    |  Decision:  Reject                    |
|                    |  Risk Band: High                      |
|                    |  Max Loan:  0                         |
|                    |                                       |
|                    | LAST RUN RESULT (2026-07-04 09:15)    |
|                    |  Decision:  Reject        [PASS]      |
|                    |  Risk Band: High          [PASS]      |
|                    |  Max Loan:  0             [PASS]      |
|                    |  Duration: 47ms                       |
|                    |                                       |
|                    | [Run] [View Trace] [Clone] [Export]   |
+--------------------+---------------------------------------+
```

**Legend:** [P] = Pass, [F] = Fail, [?] = Not yet run.

### 3.3 Scenario Lifecycle

Each test scenario is a named record within the `testcasesjson` memo column of `qdb_edp_ruletest`. The JSON structure is:

```json
{
  "schemaVersion": "1.0",
  "scenarios": [
    {
      "scenarioId": "<uuid>",
      "name": "Credit Score - High Risk",
      "description": "Boundary case: score just below threshold",
      "targetVersionId": "<uuid or 'published'>",
      "inputs": { "credit_score": 450, "annual_income": 35000 },
      "expectedOutputs": { "decision": "Reject", "risk_band": "High", "max_loan": 0 },
      "lastRunResult": {
        "ranOn": "<ISO 8601>",
        "ranByVersionId": "<uuid>",
        "actualOutputs": { "decision": "Reject", "risk_band": "High", "max_loan": 0 },
        "passed": true,
        "durationMs": 47,
        "traceCorrelationId": "<uuid>"
      },
      "tags": ["boundary", "high-risk"],
      "createdBy": "<user-id>",
      "createdOn": "<ISO 8601>"
    }
  ]
}
```

### 3.4 Scenario Operations

| Operation | Description |
|-----------|-------------|
| **New Scenario** | Open blank input form; optionally target a specific version or always-published. |
| **Run** | Call Custom API with scenario inputs; compare actual to expected; update `lastRunResult`; display pass/fail per output field. |
| **Run All** | Iterate all scenarios in sequence; display aggregate pass/fail summary. |
| **View Trace** | Open the Execution Trace viewer (§27) for the last run's `traceCorrelationId`. |
| **Load from CRM Record** | Entity picker to select a live CRM record; read its field values mapped to rule inputs; pre-fill inputs. |
| **Upload JSON** | Paste or upload a JSON payload; validate against rule input schema; pre-fill inputs. |
| **Clone** | Duplicate scenario with a new name; useful for boundary-case variants. |
| **Export** | Download scenario JSON (single or all) for sharing or baseline archival. |
| **Import** | Upload previously exported scenario JSON; validate against current rule input schema before saving. |
| **Delete** | Remove scenario (with confirmation); not logged in governance audit. |

### 3.5 Expected Output Configuration

Authors define expected outputs at the field level. Three expectation modes are supported:

| Mode | Description |
|------|-------------|
| **Exact match** | Actual value must equal expected value (default). |
| **Range match** | Actual numeric value must fall within [min, max]. |
| **Present / Not Present** | Output field must be present (or absent) in the result. |

The pass/fail verdict for a scenario is the logical AND of all individual field verdicts. A scenario is PASS only if every expected output field passes its expectation.

### 3.6 Data Storage

`qdb_edp_ruletest` (ALREADY-EXISTS) stores one record per rule. All scenarios for that rule are stored in `testcasesjson`. This is a deliberate Phase 3 design choice (JSON-in-entity per §5 of phase-3-arch.md). If scenario counts grow large (>100 per rule), the platform will warn authors to consider archiving old scenarios. A future `qdb_edp_ruletestresult` entity (NET-NEW, §19) stores run results separately for long-term comparison and regression baseline purposes.

---

## 4. Simulation Framework [EXTEND]

### 4.1 Current State

**ALREADY-EXISTS (single-execution simulation):** The Test panel in the designer calls the Custom API with ad-hoc inputs and shows outputs. `qdb_edp_rulesimulationrun` entity exists, recording `inputjson`, `outputjson`, `ranon`, and a lookup to `ruleversion`.

**What does not yet exist:** Batch simulation (multiple input sets in one operation), decision-table simulation (all rows at once), formula/variable inspection simulation, multi-scenario comparison, or any dedicated simulator UI beyond the current single-call Test panel.

### 4.2 Rule Simulator Design

The Rule Simulator is a dedicated panel in the designer, accessible from the toolbar. It is distinct from the Test Rule Studio: the Studio manages saved named scenarios; the Simulator is an interactive exploration tool where outputs are not necessarily saved.

```
+---------------------------------------------------------------+
| RULE SIMULATOR                                v3 (Published)  |
+-----------------------------+---------------------------------+
| SIMULATION MODE             | RESULTS                         |
|                             |                                 |
| (o) Single Execution        | DECISION:    Approve            |
| ( ) Batch / Multi-Scenario  | Risk Band:   Medium             |
| ( ) Decision Table Explorer | Max Loan:    250,000            |
| ( ) Formula / Variable View | Interest Rate: 7.5%             |
|                             |                                 |
| INPUTS                      | EXECUTION PATH                  |
|  Credit Score:   680 [+]    |  Node 1: IF CreditScore > 650   |
|  Annual Income:  72000 [+]  |    ✓ TRUE (680 > 650)           |
|  Loan Amount:    200000 [+] |  Node 2: IF LoanRatio < 0.4     |
|                             |    ✓ TRUE (0.28 < 0.4)          |
| TARGET VERSION              |  Node 3: DecisionTable[Row 4]   |
|  [v] Published              |    ✓ MATCHED (Band=Medium)      |
|                             |                                 |
| [Simulate] [Save as Scenario]| Duration: 52ms  [View Full Trace]|
+-----------------------------+---------------------------------+
```

### 4.3 Simulation Modes

#### 4.3.1 Single Execution Mode

The default mode. Author supplies inputs one by one, runs the simulation, and sees:
- Decision outputs (all output fields with their values).
- Execution path summary (condensed version of the trace: which nodes evaluated, which matched/failed, in order).
- Execution time in milliseconds.
- The resolved version ID.

The execution path is a simplified trace suitable for the simulator panel. It is not the full step-level trace (that lives in the Execution Trace viewer §27).

#### 4.3.2 Batch / Multi-Scenario Mode

Author supplies multiple input sets (rows) either by manual entry in a table or by uploading a CSV / JSON array. The simulator calls the Custom API for each row and aggregates results.

```
BATCH SIMULATION — Credit Eligibility Rule (v3)
+-------+---------------+----------+--------+-----------+---------+
| Row   | Credit Score  | Income   | Amount | Decision  | Time(ms)|
+-------+---------------+----------+--------+-----------+---------+
| 1     | 450           | 35,000   | 50,000 | Reject    | 44      |
| 2     | 620           | 58,000   | 100,000| Review    | 51      |
| 3     | 750           | 90,000   | 200,000| Approve   | 49      |
| 4     | 680           | 72,000   | 350,000| Reject    | 52      |  ← MaxLoan exceeded
| 5     | 810           | 120,000  | 500,000| Approve   | 48      |
+-------+---------------+----------+--------+-----------+---------+
| Summary: 3 Reject | 1 Review | 1 Approve | Avg: 49ms | [Export CSV]
```

Batch simulation is sequential by default (CRM sandbox one-call-at-a-time). It is NOT parallel — the platform does not spawn concurrent Custom API calls from the designer. Batch size is capped at 100 rows per simulation run to stay within the 2-minute plugin sandbox limit.

#### 4.3.3 Decision Table Explorer Mode

When the active rule's authoring style is `DecisionTable`, the simulator renders the full decision table with an overlay showing which row would match for the given inputs. Authors can step through multiple input sets and see the table highlight differently for each.

```
DECISION TABLE EXPLORER — Credit Eligibility Rule (v3)
INPUT: Credit Score = 680, Income Band = Medium

+----+---------------+-------------------+-----------+-------------+
| #  | Credit Score  | Income Band       | Decision  | Max Loan    |
+----+---------------+-------------------+-----------+-------------+
| 1  | < 500         | *                 | Reject    | 0           |
| 2  | 500-649       | Low               | Reject    | 0           |
| 3  | 500-649       | Medium / High     | Review    | 50,000      |
| 4  | [650-749]     | [Medium]          | [Approve] | [250,000]   |  ← MATCHED (highlighted)
| 5  | 650-749       | High              | Approve   | 400,000     |
| 6  | >= 750        | *                 | Approve   | 600,000     |
+----+---------------+-------------------+-----------+-------------+
```

Matched row is highlighted. Authors can change inputs and the highlight moves. This makes it intuitive to verify table coverage and discover gaps.

#### 4.3.4 Formula / Variable View Mode

For formula-heavy rules, this mode runs the simulation and shows all intermediate variables and formula evaluations:

```
FORMULA / VARIABLE VIEW — Loan Pricing Rule (v2)
INPUT: Principal = 200,000, Term = 36, CreditScore = 720

VARIABLES (evaluated in dependency order):
  base_rate            = 5.5%    ← formula: EDP_Config("base_rate")
  credit_adjustment    = -0.5%   ← formula: IF(CreditScore > 700, -0.5, 0)
  term_adjustment      = +1.0%   ← formula: (Term / 12 - 2) * 0.5
  final_rate           = 6.0%    ← formula: base_rate + credit_adjustment + term_adjustment
  monthly_repayment    = 6,083   ← formula: EDP_PMT(final_rate/12, Term, Principal)

OUTPUTS:
  InterestRate:        6.0%
  MonthlyRepayment:    6,083
  TotalRepayable:      219,000
  Duration: 61ms
```

#### 4.3.5 Compare Mode

Author can run the same input set against two different versions of the same rule and see the outputs side by side:

```
COMPARE: Credit Eligibility v2 vs v3 — Input: CreditScore=680, Income=72000

+--------------------+-----------+-----------+-------------------+
| Output             | v2        | v3        | Change            |
+--------------------+-----------+-----------+-------------------+
| Decision           | Review    | Approve   | CHANGED           |
| Risk Band          | Medium    | Medium    | same              |
| Max Loan           | 200,000   | 250,000   | CHANGED (+25%)    |
| Interest Rate      | 7.5%      | 7.25%     | CHANGED (-0.25%)  |
| Duration           | 55ms      | 52ms      | same              |
+--------------------+-----------+-----------+-------------------+
  2 outputs changed. [Save Comparison] [Export]
```

### 4.4 Simulation Storage

Every simulation run is written to `qdb_edp_rulesimulationrun` (ALREADY-EXISTS). Batch runs create one record per input row. Simulation records are retained for 30 days per the `SimulationTraceRetentionDays` configuration. The `Save as Scenario` button in single execution mode promotes a simulation run to a named test scenario in the Test Rule Studio.

### 4.5 Simulation Constraints

- Simulation always calls the real Custom API runtime. There is no mock evaluator.
- Simulation runs are not written to the governance `qdb_edp_ruleaudit` (Tier A). They are written to `qdb_edp_rulesimulationrun` only.
- Batch simulation is capped at 100 rows to respect the 2-minute plugin sandbox ceiling.
- Formula / Variable View requires the PCRM to have declared variables; if no variables are present, this mode is disabled with an explanatory message.

---

## 5. Execution Trace [ALREADY-EXISTS → EXTEND]

### 5.1 Current State

**ALREADY-EXISTS:**
- The runtime (`RuleExecutor`) builds an `ExecutionTrace` object during evaluation.
- The Custom API returns `TraceJson` and `DiagnosticsJson` in its response.
- The runtime writes summary fields to `qdb_edp_ruleexecutionlog` (resolvedversion, pinned, actor, executedon, outcome, durationms).
- The designer's Test panel displays the raw `TraceJson` returned by the Custom API.

**EXTEND — the following are not yet implemented:**
- Trigger-source capture (which plugin step / workflow / custom action / external caller invoked the decision).
- Step-level trace stored as a persistent column on `qdb_edp_ruleexecutionlog` (currently returned in the Custom API response only; not persisted in H1).
- A dedicated `qdb_edp_ruleexecutionstep` entity for structured step-level storage (NET-NEW §19).
- Input/output JSON persisted on the execution log record (`outputjson` is noted as H2 in the runtime spec).
- User-facing trace viewer UI (covered in §27).

### 5.2 Execution Trace Header Structure

The full trace header (already emitted by the runtime, to be persisted and extended):

| Field | Source | H1 Status | Extend |
|-------|--------|-----------|--------|
| `traceVersion` | Runtime | Emitted in JSON | Persist |
| `ruleKey` | Runtime | Summary field | Persist |
| `resolvedVersionId` | Runtime | Column: `resolvedversion` | ALREADY-EXISTS |
| `startedAt` | Runtime | Column: `executedon` | ALREADY-EXISTS |
| `durationMs` | Runtime | Column: `durationms` | ALREADY-EXISTS |
| `actor` | Runtime | Column: `actor` | ALREADY-EXISTS |
| `outcome` | Runtime | Column: `outcome` | ALREADY-EXISTS |
| `pinned` | Runtime | Column: `pinned` | ALREADY-EXISTS |
| `inputSummary` | Runtime | Not persisted in H1 | Add `inputjson` column |
| `outputSummary` | Runtime | Not persisted in H1 | Add `outputjson` column |
| `triggerSource` | Adapter | Not captured | NET-NEW capture |
| `pluginStepName` | Adapter | Not captured | NET-NEW capture |
| `workflowName` | Adapter | Not captured | NET-NEW capture (H2) |
| `customActionName` | Adapter | Not captured | NET-NEW capture |
| `externalCallerInfo` | Adapter | Not captured | NET-NEW capture |
| `traceCorrelationId` | Runtime | Returned by Custom API | Persist as column |

### 5.3 Step-Level Trace Structure

Each entry in the `steps` array of the trace JSON captures one evaluation step. This structure is returned by the Custom API today; the EXTEND work persists it and optionally stores it in a dedicated entity.

| Field | Description |
|-------|-------------|
| `stepId` | UUID — unique within this trace |
| `nodeType` | `IfElse`, `DecisionTable`, `Formula`, `Variable`, `SubDecision`, `Function` |
| `nodeId` | PCRM node identifier — links back to the rule structure |
| `nodeName` | Display name of the node (for human-readable trace) |
| `conditionResult` | Boolean — did this condition evaluate to true? (null for non-condition steps) |
| `elapsedMs` | Time spent in this step |
| `inputValues` | Key-value map of inputs consumed by this step (FLS-filtered) |
| `outputValues` | Key-value map of outputs produced by this step |
| `variableChanges` | Key-value map of variables set or modified by this step |
| `formulaExpression` | The NCalc expression string evaluated (for Formula steps) |
| `formulaResult` | The result of the formula evaluation |
| `decisionTableRowIndex` | The row index matched in the decision table (for DecisionTable steps) |
| `decisionTableRowKey` | A human-readable description of the matched row |
| `functionName` | Function called (for Function steps) |
| `functionArgs` | Arguments passed to the function |
| `errorCode` | Error code if this step errored |
| `errorMessage` | Human-readable error if this step errored |
| `warningMessages` | Array of warning strings (e.g., "Null input coerced to default") |

### 5.4 Trigger-Source Capture

Each entry adapter (Plugin, Custom Action / Custom API) must be extended to capture trigger-source metadata and include it in the `RuleExecutionContext`. The `ExecutionTraceWriter` then persists this to the execution log record.

| Adapter | Trigger-Source Fields Available |
|---------|--------------------------------|
| Plugin | Plugin step name, registered event entity, event message (Create/Update), execution stage |
| Custom Action | Custom Action logical name, calling entity reference |
| Dataverse Custom API | External caller UPN, OAuth client ID, caller IP (where available from request context) |
| Workflow Activity (H2) | Workflow name, workflow instance ID, step name |

### 5.5 Trace Tiering Conformance (ADR-13)

This section extends the trace — it does not change the ADR-13 tiers.

- **Tier A (Governance Audit)** — unchanged. Governance events (state transitions, pin activations, approval decisions) go to `qdb_edp_ruleaudit` synchronously.
- **Tier B (Execution Traces)** — extended with `inputjson`, `outputjson`, `triggerSource`, `pluginStepName`, `traceCorrelationId` columns on `qdb_edp_ruleexecutionlog`. Still written asynchronously. Still subject to sampling and retention configuration. A trace write failure never blocks a decision.

### 5.6 Performance Impact of Trace Extension

Adding `inputjson` and `outputjson` columns increases the payload written per execution log record. For rules with large input/output sets (approaching SDP ceiling of 20 output fields), the payload may be 2–5 KB per record. At 100,000 executions per day with 100% sampling, this is ~200–500 MB of data written per day. The `TraceSamplingRate` configuration is the primary lever to control volume. At 10% sampling for high-volume rules, daily write volume drops to 20–50 MB — well within Dataverse capacity.


---

## 6. Visual Debugger [NET-NEW]

### 6.1 Current State

**What exists:** The designer Test panel stub shows raw `TraceJson` returned by the Custom API after a test execution. No visual representation of the rule graph with evaluation results overlaid exists.

**What this section designs:** A visual, interactive execution trace overlay on the GoRules JDM canvas that lets a rule author step through the evaluation path one node at a time, seeing exactly what happened and why.

### 6.2 Design Principle

The Visual Debugger is a read-only overlay mode on the existing GoRules JDM canvas. It does not introduce a separate viewer. When an author runs a test or simulation, they can switch the designer into Debug View, which shows the same rule graph but annotates each node with the execution result. No new canvas rendering engine is introduced — the GoRules JDM Editor's read-only mode is used as the host.

### 6.3 Visual Debugger Layout

```
+------------------------------------------------------------------+
| RULE DESIGNER — Credit Eligibility v3                    [DEBUG] |
+------------------------------------------------------------------+
| TOOLBAR: [Edit] [Debug View checked] [Test] [Simulate]           |
+------------------------------------------------------------------+
|  [START]                                                         |
|     |                                                            |
|     v                                                            |
|  [IF CreditScore > 650]  <-- STEP 1 TRUE (680 > 650) 3ms        |
|  (GREEN border)                                                  |
|     | TRUE                                                       |
|     v                                                            |
|  [IF LoanRatio < 0.4]  <-- STEP 2 TRUE (0.28 < 0.4) 4ms        |
|  (GREEN border)                                                  |
|     | TRUE                                                       |
|     v                                                            |
|  [DecisionTable: Band Lookup]  <-- STEP 3 MATCHED Row 4  41ms   |
|  (GREEN border)                                                  |
|     |                                                            |
|  [Reject Node]  <-- SKIPPED (grey border)                       |
+------------------------------------------------------------------+
| STEP INSPECTOR                              [<] STEP 3 of 3 [>] |
| Node: DecisionTable - Band Lookup                                |
| Type: DecisionTable | Duration: 41ms                             |
| Matched Row: 4                                                   |
|   CreditScore in [650, 749] AND IncomeBand = Medium              |
| Outputs:                                                         |
|   Decision = Approve   Risk Band = Medium   Max Loan = 250,000  |
| Variables Set: (none in this step)                               |
| [Expand Full Trace JSON]  [Copy Step]                            |
+------------------------------------------------------------------+
```

### 6.4 Node Visual States

| State | Visual Indicator | Description |
|-------|-----------------|-------------|
| Evaluated - TRUE | Green border | Condition evaluated and returned true |
| Evaluated - FALSE | Red border | Condition evaluated and returned false |
| Matched (Decision Table) | Green border + table icon | At least one row matched |
| No Match (Decision Table) | Amber border | No row matched; default output used |
| Skipped | Grey border | Node not reached (excluded branch) |
| Error | Red fill | Runtime error in this node |

### 6.5 Step Navigation

The Step Inspector panel at the bottom of the canvas provides step-by-step navigation:

- Previous / Next buttons move through evaluated steps in execution order.
- Timeline bar shows all steps as a horizontal bar with proportional width based on `elapsedMs`. Clicking a segment jumps to that step.
- Auto-scroll: the canvas scrolls to keep the current step's node in view as the author navigates.
- Expand Full Trace JSON opens a read-only JSON viewer for the complete trace (raw JSON, formatted).

### 6.6 Step Inspector Content

For each step, the inspector shows:
- Node type and display name.
- Execution duration in milliseconds.
- Input values consumed by this step (mapped to display names, FLS-filtered).
- Output values produced or modified by this step.
- Variable changes (before/after) for any variables modified.
- For Formula steps: the expression string and its computed result.
- For Decision Table steps: the matched row index and its condition description.
- For Function steps: function name and arguments.
- Errors or warnings attached to this step.

### 6.7 Breakpoints (Future - Horizon 2)

Breakpoints are a future capability. The design reserves a `breakpoints` array in the debugger state. When implemented, the author will be able to mark a node in the graph; the simulator will execute up to that node, pause, and allow the author to inspect state before continuing. This requires a stateful simulation session, which is a Horizon 2 capability.

### 6.8 Restart and Rerun

- Restart re-runs the same input set against the same version and refreshes the debug overlay.
- Change Inputs + Rerun opens the input panel over the debug view; author modifies values and re-runs without leaving debug mode.
- Switch Version re-runs the same inputs against a different version and refreshes the overlay.

### 6.9 Implementation Notes

The Visual Debugger reads the `TraceJson` returned by the Custom API (or retrieved from `qdb_edp_ruleexecutionlog` for a past execution). It maps each step's `nodeId` to the GoRules JDM canvas element identifiers. This requires the JDM canvas to expose an API for adding overlays by element ID. If the GoRules JDM Editor does not support this overlay API in its current version, the fallback is a standalone step-list view (not graph-overlay) that is still useful but not graphical. This risk is noted in section 22.

---

## 7. Validation Framework [ALREADY-EXISTS EXTEND]

### 7.1 Current State

**ALREADY-EXISTS (core validation):**
- `RuleValidator` in the C# runtime validates metadata bindings, operator compatibility, symbol resolution, and JSON schema at save time.
- The designer displays Error and Warning messages in the Validation panel.
- The phase-4-visual-rule-designer.md section 16 defines the validation framework.

**EXTEND:** The following 14 validation cases define the complete validation scope. Cases 1-6 are already exists or in partial progress; cases 7-14 are the EXTEND or NET-NEW additions.

### 7.2 Complete Validation Case Catalogue

| # | Validation Case | Severity | Status |
|---|----------------|----------|--------|
| V-01 | Metadata binding not found - entity or field cannot be resolved | Error | ALREADY-EXISTS |
| V-02 | Operator incompatible with field type | Error | ALREADY-EXISTS |
| V-03 | Symbol undefined - variable or function not declared | Error | ALREADY-EXISTS |
| V-04 | JSON schema violation - PCRM fails NJsonSchema validation | Error | ALREADY-EXISTS |
| V-05 | Required output missing - no output for a declared output alias | Error | ALREADY-EXISTS |
| V-06 | Complexity ceiling exceeded - score >= 100 per SDP | Warning | ALREADY-EXISTS |
| V-07 | Deleted field binding - field no longer exists in metadata | Error | EXTEND |
| V-08 | Invalid relationship traversal - path no longer navigable | Error | EXTEND |
| V-09 | Invalid option-set value - value not in the option set | Error | EXTEND |
| V-10 | Circular sub-decision reference - rule A calls B calls A | Error | EXTEND |
| V-11 | Sub-decision chain depth exceeded - beyond SDP ceiling of 3 | Error | EXTEND |
| V-12 | Duplicate condition in decision table - unreachable rows | Warning | EXTEND |
| V-13 | Dead branch - IF/ELSE branch can never be reached | Warning | NET-NEW |
| V-14 | Improvement recommendation - literal should be a config record | Recommendation | NET-NEW |

### 7.3 Severity Tiers

| Tier | Display | Save Behaviour | Publish Behaviour |
|------|---------|---------------|-------------------|
| Error | Red indicator, node highlighted | Save BLOCKED | Publish BLOCKED |
| Warning | Amber indicator, node highlighted | Save ALLOWED (confirmation dialog) | Publish BLOCKED unless admin override |
| Recommendation | Blue indicator, Suggestions panel | Save ALLOWED, no dialog | Publish ALLOWED |

### 7.4 Deleted-Field Detection (V-07)

When the designer loads a Rule Version for editing, the Metadata Service resolves every binding in the PCRM document. If a binding's entity or attribute logical name returns no record from the metadata cache, the designer flags that binding as V-07. The runtime also checks this at compile time and returns a `MetadataResolutionError` typed error if a binding fails to resolve.

### 7.5 Circular Reference Detection (V-10)

Sub-decision references are stored in the PCRM as structured references (rule key + optional pinned version). At save time, the Validation Service performs a depth-first traversal of the sub-decision graph, loading each referenced rule's current PCRM and resolving its sub-decision references. If any traversal visits a rule already in the current traversal stack, a circular reference is detected.

This traversal is bounded by the sub-decision chain depth limit (SDP ceiling: 3). A cycle detected within this depth raises V-10 as an Error. A chain exceeding depth 3 raises V-11 as an Error.

### 7.6 Recommendation Engine (V-14)

The Recommendation tier is distinct from Errors and Warnings. Recommendations are suggestions from the platform that a rule could be improved. The initial implementation supports one recommendation type: detecting hardcoded literal numeric values in formulas that appear in multiple rules (suggesting they should be a shared configuration record). Future recommendations (Horizon 2) may include AI-generated suggestions.

---

## 8. Versioning Strategy [EXTEND]

### 8.1 Current State

**ALREADY-EXISTS:**
- `qdb_edp_ruleversion` entity with `lifecyclestate` option set.
- `qdb_edp_lifecyclestate` option set with states: Draft, Published, Retired.
- `ispinned`, `pinjustificationcode`, `pinjustificationnote` columns on `qdb_edp_ruleversion`.
- Designer creates new versions via Save as Draft.
- The runtime respects Published status for execution resolution.
- ADR-09 (immutable published versions) and ADR-12 (production pin governance) are implemented.

**EXTEND:** In Review, Approved, and Archived lifecycle states; designer UI for Clone, Rollback, Promote, Deprecate, Compare, and Version History panel; version comparison (section 13).

### 8.2 Complete Lifecycle State Machine

```
[Draft] --submit--> [In Review] --approve--> [Approved] --publish--> [Published]
   ^                    | reject                | rollback                    |
   |                    v                       v                   retire    |
   +---------- [Draft (new)]            [Draft (new)]        [Retired] <-----+
                                                                  |
                                                            archive (admin)
                                                                  v
                                                            [Archived]
```

| State | Editable? | Production? | Simulation? | Who transitions |
|-------|-----------|-------------|-------------|-----------------|
| Draft | Yes | No | Yes | Author |
| In Review | No (comment only) | No | Yes | System on submit |
| Approved | No | No | Yes | Approver |
| Published | No | Yes | Yes | Approver / Publisher |
| Retired | No | No | Yes (historical replay) | Approver |
| Archived | No | No | No | Administrator |

### 8.3 Extended Option Set Values

The `qdb_edp_lifecyclestate` option set must be extended with:
- InReview (new value) - submitted for review; read-only except for comments.
- Approved (new value) - passed review; ready to publish; not yet live.
- Archived (new value) - permanently inactive; excluded from designer views by default.

Integer values must be confirmed against the live schema before adding new options.

### 8.4 Version Operations

| Operation | Description | Allowed From | Result State |
|-----------|-------------|-------------|--------------|
| Submit for Review | Author submits draft | Draft | In Review |
| Approve | Approver accepts | In Review | Approved |
| Reject | Approver rejects | In Review | Draft |
| Publish | Make version live | Approved | Published |
| Retire | Withdraw from production | Published | Retired |
| Clone | New Draft copying logic of any version | Any | Draft (N+1) |
| Rollback | Clone a prior version | Published / Retired | Draft |
| Deprecate | Mark "use newer version" with note | Published | Published (with flag) |
| Archive | Suppress old version from views | Retired | Archived |
| Compare | Open Comparison Engine | Any | (no state change) |

### 8.5 Version History Panel

The designer version history panel shows the complete version timeline for the active rule, with state badge, author, date, duration in that state, and action buttons (Clone, Retire, Compare, Archive) per version.

### 8.6 Immutability Enforcement

The Pre-Validation plugin on `qdb_edp_ruleversion` rejects any attempt to update `pcrmjson` or `jdmsourcejson` on a record whose `lifecyclestate` is anything other than Draft. The EXTEND work ensures the plugin covers all six states including the new In Review, Approved, and Archived states.

### 8.7 Clone Operation

Cloning creates a new `qdb_edp_ruleversion` record with a new `versionnumber` (max + 1), `lifecyclestate` = Draft, `pcrmjson` and `jdmsourcejson` copied verbatim from the source version, `ispinned` = false, and a `qdb_edp_ruleaudit` record written with action = `VersionCloned` including source version ID.

---

## 9. Approval Workflow [NET-NEW (schema only)]

### 9.1 Current State

**Schema exists:** `qdb_edp_ruleapproval` entity and `qdb_edp_approvalstatus` option set are deployed.

**What does not exist:** Any workflow logic, maker-checker enforcement, reviewer assignment, comment capture, rejection path, escalation, or approval history UI.

### 9.2 Approval Workflow Design

The approval workflow is a maker-checker process with up to three configurable review stages. Segregation of duties is enforced: the author cannot approve their own version where the SoD flag is enabled (Pre-Validation plugin per phase-3-arch.md section 10.3).

```
APPROVAL STAGES (configurable per rule category):

[Author submits Draft]
        |
        v
[Stage 1: Business Review]  <-- assigned to: Business Reviewer role / specific user
     Approve | Reject / SendBack
             |
        v (if approved)
[Stage 2: Technical Review]  <-- assigned to: Technical Reviewer role (optional)
     Approve | Reject / SendBack
             |
        v (if approved)
[Stage 3: Publisher]  <-- assigned to: EDP Rule Publisher role
     Publish | Send Back
             |
        v (if published)
[Published - Live]
```

Stages 2 and 3 are configurable per rule category. A simple rule category may require only Stage 1 before publish. A high-risk category may require all three stages.

### 9.3 Approval Record Structure

Each approval action creates one `qdb_edp_ruleapproval` record (append-only):

| Column | Description |
|--------|-------------|
| `mql_ruleversion` lookup | The rule version being approved |
| `approvalstatus` option set | Pending / Approved / Rejected / SentBack / Escalated / Withdrawn |
| `approvalstage` integer | 1 (Business), 2 (Technical), 3 (Publisher) |
| `assignedto` | CRM user / team responsible for this approval |
| `decidedon` datetime | When the decision was made |
| `actor` | CRM user who made the decision |
| `comments` text | Rationale (required for Reject and SentBack) |
| `escalationtarget` | CRM user / team who received escalation |
| `escalatedon` datetime | When escalated |

### 9.4 Approval Operations

| Operation | From State | Allowed By | Result |
|-----------|-----------|------------|--------|
| Submit | Draft | Author | In Review; Stage 1 Pending record created |
| Approve (Stage N) | In Review | Assigned Stage N reviewer | Stage N Approved; Stage N+1 Pending created |
| Approve (Final) | In Review | Final reviewer | Rule Version -> Approved state |
| Publish | Approved | EDP Rule Publisher | Rule Version -> Published; Tier A audit event |
| Reject | In Review | Assigned reviewer | Stage N Rejected; Rule Version -> Draft |
| Send Back | In Review | Assigned reviewer | SentBack; Rule Version -> Draft with comment |
| Reassign | In Review | Administrator | Assigned reviewer changed on pending record |
| Escalate | In Review | Reviewer / system | Escalation record created; target notified |
| Withdraw | In Review | Author | Rule Version -> Draft; pending records cancelled |

### 9.5 Comment Policy

Comments are required for Reject and Send Back operations. The Pre-Validation plugin rejects a rejection or send-back with an empty `comments` field with a typed error. Comments are optional but encouraged for Approve operations.

### 9.6 Approval History Panel

The designer shows the full approval history for the active rule version: stage, actor, date, decision, and comments — for all versions, with a toggle to show prior version histories.

### 9.7 Escalation and Notification

Escalation is triggered manually or automatically by a time-based rule. Auto-escalation threshold is configurable per rule category via `qdb_edp_ruleconfiguration`. Notifications are CRM-native (email or activity feed). No external notification infrastructure is introduced. Notification routing is the `Rule Notification` domain object placeholder from phase-3-arch.md section 3.4, implemented in Horizon 2.

---

## 10. Audit Architecture [EXTEND]

**Build status (2026-07-07):** append-only enforcement is now **live** — `AppendOnlyGuardPlugin` blocks Update and Delete on `qdb_edp_ruleaudit` and `qdb_edp_ruleexecutionlog` via synchronous pre-validation steps (verified: an Update attempt returns 400). This discharges part of C-005 (tamper-evident trail); a System Administrator disabling the step remains the documented, accepted residual (ADR-12).

### 10.1 Current State

**ALREADY-EXISTS (infrastructure):**
- `qdb_edp_ruleaudit` entity is deployed (append-only).
- `DataverseAuditSink` is coded; `GovernanceAuditWriter` writes state transitions.
- Append-only enforcement is listed as a remaining refinement in schema/README.md (not yet applied).

**EXTEND - the following event types are not yet captured:** approval decisions, clone operations, rollback operations, import/export operations, rule deletion, configuration changes, feature flag changes, metadata cache refreshes, and security role assignments.

### 10.2 Complete Audit Event Catalogue

| Event Type | Trigger | Written By |
|-----------|---------|-----------|
| RuleCreated | New rule created | Post-Op plugin on `qdb_edp_rule` |
| VersionCreated | New version created | Post-Op plugin on `qdb_edp_ruleversion` |
| VersionSubmitted | Draft -> In Review | Governance plugin |
| ApprovalDecided | Any approval stage decision | Post-Op plugin on `qdb_edp_ruleapproval` |
| VersionPublished | Approved -> Published | Governance plugin |
| VersionRetired | Published -> Retired | Governance plugin |
| VersionArchived | Retired -> Archived | Plugin |
| VersionCloned | Clone operation | Plugin |
| VersionRolledBack | Rollback operation | Plugin |
| PinnedExecution | Decision executed with pin | ExecutionTraceWriter |
| RuleDeleted | Draft deleted | Pre-Op plugin on `qdb_edp_rule` |
| RuleImported | JSON import | Import Service |
| RuleExported | JSON export | Export handler |
| ConfigurationChanged | Rule configuration modified | Post-Op plugin on `qdb_edp_ruleconfiguration` |
| FeatureFlagChanged | Feature flag toggled | Post-Op plugin on `qdb_edp_featureflag` |
| MetadataCacheRefreshed | Manual or scheduled cache refresh | Metadata Service |
| SecurityRoleAssigned | EDP security role assigned to user | Post-Op plugin |

### 10.3 Audit Record Structure

Each `qdb_edp_ruleaudit` record carries: `action` (event type), `actor` (actual CRM user, never a system account), `auditedon` (datetime UTC), `relatedruleversion` lookup, `relatedrule` lookup, `details` (JSON memo with event-specific payload including old/new values), and `correlationid` (UUID linking related audit events).

The `details` JSON payload follows a consistent schema per event type. For state transitions, the old and new `lifecyclestate` enum values are captured. For configuration changes, the previous and new values are captured.

### 10.4 Append-Only Enforcement

No `qdb_edp_ruleaudit` record may be updated or deleted (governance audit records are retained for 7 years per `mql_edp_GovernanceAuditRetentionYears` environment variable, default 7, non-configurable floor). The enforcement mechanism is:
- A Pre-Validation plugin that throws a typed error on any Update or Delete message on `qdb_edp_ruleaudit`.
- EDP security roles grant Create on `qdb_edp_ruleaudit` only - no Update or Delete privilege.

This enforcement is listed as a remaining refinement in schema/README.md and must be applied before the next production deployment.

---

## 11. Documentation Architecture [NET-NEW]

### 11.1 Current State

**Schema exists:** `qdb_edp_ruledocumentation` entity is deployed with a `content` memo column. One record per rule.

**What does not exist:** Documentation generation logic, documentation UI, or export capability.

### 11.2 Documentation Design Principle

Documentation is auto-generated from structured rule metadata and then editable by the author. The generation provides a consistent starting point that authors refine. Authors see exactly what will be generated and can override any section.

### 11.3 Auto-Generated Documentation Sections

| Section | Source | Editable? |
|---------|--------|-----------|
| Purpose | Rule description field | Yes |
| Business Context | Rule category + folder | Yes (enrichable) |
| Inputs | PCRM bindings (auto-generated table) | No |
| Conditions | PCRM logic (auto-rendered as sentences) | Yes (enrichable) |
| Decision Table | PCRM table (auto-rendered as HTML table) | No |
| Variables | PCRM variables (auto) | Yes (enrichable) |
| Functions Used | PCRM function calls (auto) | No |
| Outputs | PCRM output aliases (auto) | Yes (enrichable) |
| Dependencies | Sub-decision references (auto) | No |
| Version History | Version records (auto) | No |
| Approval History | Approval records (auto) | No |
| Examples | Test scenarios (author selects which to include) | Yes |

**Inputs table example (auto-generated):**

```
INPUTS
+---------------------------+----------+--------------------+----------+
| Display Name              | Type     | Entity.Field       | Required |
+---------------------------+----------+--------------------+----------+
| Credit Score              | Integer  | contact.score      | Yes      |
| Annual Income             | Currency | contact.income     | Yes      |
| Loan Amount Requested     | Currency | loan.amount        | Yes      |
+---------------------------+----------+--------------------+----------+
```

### 11.4 Export Formats

| Format | Mechanism | Audience |
|--------|-----------|----------|
| HTML | Generated in-browser from the documentation record | Internal sharing |
| PDF | Browser print-to-PDF (no server-side rendering required) | Regulatory submission |
| Word (DOCX) | CRM Custom API `qdb_edp_ExportDocumentation` using a template DOCX stored as web resource; returns Base64-encoded DOCX | Editable formal documents |

The DOCX generation Custom API uses a template-based approach. No external rendering service is used.

### 11.5 Documentation Storage

Documentation is stored in `qdb_edp_ruledocumentation.content` as a structured JSON document that is rendered to HTML in the designer. The JSON structure separates auto-generated sections (regenerated on demand) from author-edited sections (preserved across regenerations). Documentation is one record per rule (not per version); version-specific content is captured within the JSON sections.


---

## 12. Dependency Management [NET-NEW (schema only) → PARTIAL]

**Build status (2026-07-07):** dependency extraction is **live** as `qdb_edp_GetDependencies` (Phase-6 §11) — computes a rule's field/variable/function/output dependencies + edges from PCRM. Persisting edges to `qdb_edp_ruledependency` and portfolio impact analysis remain follow-ups.


### 12.1 Current State

**Schema exists:** `qdb_edp_ruledependency` entity is deployed with `fromref`, `toref`, and `dependencytype` columns. No dependency records are written today; no dependency graph or impact-analysis UI exists.

**What does not exist:** Any logic that populates dependency records at save time, circular-reference detection at the graph level, an impact-analysis query, or a dependency tree or graph viewer.

### 12.2 Dependency Types

The `qdb_edp_dependencytype` option set defines the nature of the dependency relationship:

| Type | Description |
|------|-------------|
| SubDecision | Rule A invokes Rule B as a sub-decision during evaluation |
| Template | Rule A was instantiated from Rule Template B |
| SharedFunction | Rule A references Rule Function B in a formula expression |
| SharedVariable | Rule A reads a variable defined in a linked rule (Horizon 2) |
| MetadataBinding | Rule A is bound to a specific CRM entity or field (metadata dependency) |

For Phase 4, SubDecision, Template, and SharedFunction are the active types. MetadataBinding dependencies are captured implicitly through the PCRM bindings but are not stored in `qdb_edp_ruledependency` in Phase 4.

### 12.3 Dependency Population

Dependency records are populated at rule version save time by the Dependency Extractor service. The Dependency Extractor reads the saved PCRM JSON and extracts all sub-decision references and function calls. For each reference found, it upserts a `qdb_edp_ruledependency` record:

- `fromref` = the saving rule version ID (UUID, stored as text for cross-environment portability).
- `toref` = the referenced rule key or function name.
- `dependencytype` = SubDecision or SharedFunction.

When a Rule Version is retired or deleted, its outgoing dependency records are also deleted (they no longer reflect a live dependency). Dependency records for Published versions are immutable (they reflect the logic of an immutable version).

### 12.4 Dependency Graph Design

The Dependency Graph is a panel in the designer, accessible from the Dependencies button in the toolbar. It shows the rule's dependencies as an interactive tree.

```
DEPENDENCY GRAPH — Credit Eligibility Rule (v3)
+-----------------------------------------------------+
|                                                     |
|  [Credit Eligibility v3]  (THIS RULE)               |
|       |                                             |
|       +-- SubDecision --> [Income Band Lookup v2]   |
|       |                         |                   |
|       |                         +-- Function --> EDP_Round |
|       |                                                     |
|       +-- SubDecision --> [Regulatory Cap Check v1] |
|       |                                             |
|       +-- Function --> EDP_Config                   |
|       +-- Function --> EDP_Max                      |
|                                                     |
|  USED BY (inbound):                                 |
|  --> [Loan Offer Calculator v4] (SubDecision)        |
|  --> [Portfolio Risk Score v2] (SubDecision)         |
+-----------------------------------------------------+
| [Expand All] [Show Impact] [Export JSON]             |
```

### 12.5 Impact Analysis

The Impact Analysis answers the question: "If I change this rule, which other rules are affected?"

For a given rule version, the platform performs a reverse traversal of the `qdb_edp_ruledependency` graph: starting from the current rule, find all rules that have a SubDecision dependency on it (directly or transitively). The result is a list of affected rules with their current lifecycle states.

```
IMPACT ANALYSIS — Income Band Lookup (about to retire v2)

DIRECTLY AFFECTED (1 rule):
  Credit Eligibility v3 [Published] -- will lose its sub-decision

TRANSITIVELY AFFECTED (2 rules):
  Loan Offer Calculator v4 [Published] -- via Credit Eligibility
  Portfolio Risk Score v2 [Published] -- via Credit Eligibility

WARNING: Retiring this version will break 1 Published rule in production.
  Recommendation: Publish a replacement version before retiring this one.
  [View Credit Eligibility v3] [Cancel Retire]
```

The impact analysis is run before any retire, archive, or delete operation on a Published rule version. If affected Published rules are found, the platform shows the warning (not a block — administrators can override). The impact analysis result is also shown in the Dependency Graph panel.

### 12.6 Circular Reference Detection (Graph Level)

The circular reference detection described in section 7 (V-10) is the save-time check. The Dependency Graph also provides a manual "Check for Cycles" action that runs the full dependency graph traversal across all live rules and reports any circular paths. This is a maintenance tool for administrators, not an authoring-time check.

---

## 13. Comparison Engine [NET-NEW → PARTIAL]

**Build status (2026-07-07):** `qdb_edp_CompareVersions` is **live** — structural diff of two rule versions' PCRM (logic-type change, inputs added/removed/type-changed, outputs added/removed, branch counts). Visual side-by-side diff UI is a follow-up.


### 13.1 Current State

**What does not exist:** No version comparison, rule comparison, template-vs-rule comparison, or table-vs-table comparison capability exists. GoRules has internal diff utilities that are not used by the EDP today.

### 13.2 Comparison Modes

The Comparison Engine supports four comparison modes:

| Mode | Description |
|------|-------------|
| Version vs. Version | Compare two versions of the same rule (most common use case) |
| Rule vs. Rule | Compare the Published (or latest Draft) version of two different rules |
| Template vs. Rule | Compare a rule template against a rule instantiated from it |
| Table vs. Table | Compare two decision tables side by side (for rules using Decision Table authoring style) |

### 13.3 Comparison Panel Layout

The Comparison Panel is accessible from the Version History panel (compare button per version) and from the toolbar (Compare Rules). It shows two rule versions side by side with differences highlighted.

```
COMPARISON — Credit Eligibility v2 vs v3
+---------------------------+---------------------------+
| VERSION 2 (Retired)       | VERSION 3 (Published)     |
| Author: Jane | 2026-06-15 | Author: John | 2026-07-01 |
+---------------------------+---------------------------+
| CONDITIONS                | CONDITIONS                |
| IF CreditScore > 600      | IF CreditScore > 650      |  <- MODIFIED (threshold)
|   AND LoanRatio < 0.5     |   AND LoanRatio < 0.4     |  <- MODIFIED (threshold)
| THEN: Band Lookup         | THEN: Band Lookup         |  (same)
|                           |                           |
| DECISION TABLE            | DECISION TABLE            |
| Row 3: Score 600-749,     | Row 3: Score 650-749,     |  <- MODIFIED (score range)
|   Medium -> Approve 200k  |   Medium -> Approve 250k  |  <- MODIFIED (max loan)
| Row 5: Score >=750,       | Row 5: Score >=750,       |  (same)
|   High -> Approve 500k    |   High -> Approve 500k    |
|                           | Row 6: Score >=810 [NEW]   |  <- ADDED
+---------------------------+---------------------------+
| OUTPUTS      | (no change) |                           |
+---------------------------+---------------------------+
| SUMMARY: 2 modified conditions, 1 table row modified, |
|          1 table row added                            |
| [Export Diff] [Save Comparison] [Apply to Regression] |
```

### 13.4 Diff Categories

| Category | Description | Indicator |
|----------|-------------|-----------|
| ADDED | A condition, row, output, or variable present in the right version but not the left | Green background |
| REMOVED | A condition, row, output, or variable present in the left version but not the right | Red background |
| MODIFIED | Same structural element, different value (threshold, operator, output value) | Amber background |
| UNCHANGED | Identical in both versions | No highlight |

### 13.5 Comparison Storage

The comparison result is not persistently stored by default. It is computed on demand from the two PCRM JSON documents (structural diff of the PCRM JSON). If the author clicks "Save Comparison", a `qdb_edp_comparison` record is created (NET-NEW entity, §19) storing the two version references and the diff summary JSON.

### 13.6 Comparison Algorithm

The Comparison Engine performs a structured diff on PCRM JSON documents (not a text diff). The algorithm:
1. Deserialise both PCRM documents.
2. Compare the conditions list: match by `nodeId` (stable identifier). Flag matched nodes with value changes; flag unmatched nodes as added or removed.
3. Compare decision table rows: match by row index (order-significant in First-hit tables). Flag mismatches.
4. Compare output aliases: match by alias name. Flag value changes.
5. Compare variable declarations: match by variable name. Flag expression changes.
6. Generate the diff summary as a structured JSON document.

This is a server-side computation performed by a Custom API (`qdb_edp_CompareVersions`) that accepts two version IDs and returns the diff summary JSON.

---

## 14. Search Architecture [NET-NEW]

### 14.1 Current State

**What exists:** The designer's rule list is a basic CRM view of `qdb_edp_rule` records with Quick Find. No advanced filtering, faceted search, saved searches, or favourites capability exists.

**What does not exist:** Faceted search, advanced filters, search across rule content (conditions, outputs), tag-based search, template search, or any saved-search / favourites capability.

### 14.2 Search Entry Points

Search is available in three designer locations:

1. **Rule Library Home** — primary search across all rules.
2. **Template Selector** — search across templates when instantiating a new rule.
3. **Sub-Decision Picker** — search across Published rules when adding a sub-decision reference.

### 14.3 Search Facets

The following facets are available in the Rule Library search:

| Facet | Values | Source |
|-------|--------|--------|
| Lifecycle State | Draft / In Review / Approved / Published / Retired / Archived | `qdb_edp_lifecyclestate` |
| Category | Category tree (hierarchical) | `qdb_edp_rulecategory` |
| Folder | Folder tree | `qdb_edp_rulefolder` |
| Authoring Style | Decision Table / Expression Tree / Formula | `qdb_edp_authoringstyle` |
| Author | CRM user picker | `createdby` on ruleversion |
| Date Range | Created on / Last published | Date range picker |
| Tag | Multi-select from existing tags | `qdb_edp_ruletag` |
| Complexity | Simple (score <40) / Moderate (40-79) / Complex (80-99) / Exceeds SDP (100+) | Complexity profile |
| Has Tests | Yes / No | Has related `qdb_edp_ruletest` record |
| Has Dependencies | Yes / No | Has related `qdb_edp_ruledependency` records |

### 14.4 Full-Text Search

Full-text search runs against:
- Rule display name.
- Rule description.
- Rule category name.
- Rule tag names.
- (Horizon 2) PCRM JSON content (condition values, output names).

The H1 implementation uses CRM Quick Find on the `qdb_edp_rule` entity. Horizon 2 extends this to Dataverse full-text search or Azure Cognitive Search (with ADR if external infrastructure is introduced — note this would violate Phase 0 invariant 3 unless limited to read-only analytics).

Given the Phase 0 invariant (zero external infrastructure for core function), full-text search in H1 is limited to CRM Quick Find. Content search (inside rule logic) is deferred to Horizon 2 with a required ADR.

### 14.5 Advanced Filters

Advanced filters allow Boolean combinations of facets:

```
ADVANCED SEARCH — Rules
  State: Published OR In Review
  AND Category: Credit Risk
  AND Author: Jane Smith OR John Doe
  AND Tag: regulatory OR compliance
  AND Has Tests: Yes
  AND Date Published: after 2026-01-01

  [Search] [Clear] [Save as Saved Search]
```

Advanced filters are expressed as CRM FetchXML on the server side. The designer constructs FetchXML from the filter builder state.

### 14.6 Saved Searches and Favourites

**Saved Searches:** Authors can save a filter configuration as a named search. Saved searches are stored as `qdb_edp_ruleconfiguration` records (using the configuration entity as a lightweight user-preference store). Saved searches are user-scoped (not shared by default).

**Favourites:** Authors can star a rule or template to mark it as a favourite. Favourites are stored in browser local storage in Horizon 1 (no Dataverse record). Horizon 2 promotes favourites to a user preference record in CRM.

**Recent Items:** The designer maintains a session-level recently-viewed list (top 10) using browser local storage. Recent items are displayed at the top of the search results before the author types a query.

---

## 15. Rule Library [NET-NEW (schema only)]

### 15.1 Current State

**Schema exists:** `qdb_edp_ruletemplate`, `qdb_edp_rulefunction`, `qdb_edp_rulecategory`, `qdb_edp_rulefolder`, `qdb_edp_ruletag`, `qdb_edp_rulepackage` are all deployed. The designer spec (phase-4-visual-rule-designer.md section 15) defines 8 rule templates.

**What does not exist:** Any UI for browsing the library, seeding template content, managing shared formulas and variables, or managing reusable decision tables. The 8 templates described in the designer spec are not yet seeded in Dataverse.

### 15.2 Library Sections

The Rule Library is a top-level section of the designer (a separate page from the Rule Designer). It has four tabs:

| Tab | Content | Entity |
|-----|---------|--------|
| Templates | Pre-authored rule templates browsable by category | `qdb_edp_ruletemplate` |
| Functions | Shared function catalog (built-in + custom) | `qdb_edp_rulefunction` |
| Shared Variables | Platform-level variable definitions reusable across rules | (JSON in `qdb_edp_ruleconfiguration`) |
| Decision Tables | Reusable decision tables that can be referenced by multiple rules | `qdb_edp_ruletemplate` with subtype=ReusableTable |

### 15.3 Templates

The 8 templates defined in the designer spec (section 15 of phase-4-visual-rule-designer.md) are:
1. Credit Eligibility Decision
2. Risk Band Classification
3. Loan Pricing Formula
4. Geographic Eligibility Filter
5. Regulatory Cap Check
6. Document Completeness Validator
7. Approval Tier Selector
8. Status Transition Guard

Each template is seeded as a `qdb_edp_ruletemplate` record with:
- `templatejson`: the PCRM JSON of the template (with placeholder bindings).
- `parametersjson`: the list of parameters (which bindings the author must map when instantiating).
- `industry`: a tag for filtering (Financial Services, General, Compliance, etc.).

### 15.4 Template Instantiation

When an author instantiates a template:
1. The designer opens a parameter-mapping panel. The author maps each template parameter (placeholder binding) to a real CRM entity/field from the metadata picker.
2. The designer replaces placeholders in the template PCRM JSON with the resolved bindings.
3. A new `qdb_edp_rule` record and a new Draft `qdb_edp_ruleversion` record are created with the instantiated PCRM.
4. A `qdb_edp_ruledependency` record is written: the new rule version -> template (type: Template).
5. A `qdb_edp_ruleaudit` record is written: action = `RuleCreatedFromTemplate`.

The author is then dropped into the Rule Designer with the instantiated rule open for refinement.

### 15.5 Shared Function Catalog

The `qdb_edp_rulefunction` entity stores the function catalog. Each record carries:
- `signature`: the function call signature (name, parameters, return type).
- `semantics`: a human-readable description of what the function does.
- `isbuiltin`: whether this is an EDP built-in function (the 31 `EDP_*` functions from the H1 grammar) or a custom extension function.

The Function Picker in the Formula Builder (designer section 13) reads from this catalog. Built-in functions are seeded during solution installation. Custom functions are added by administrators.

### 15.6 Shared Variables

Platform-level shared variables are configuration records that define commonly-used values across rules (e.g., the base interest rate, the compliance threshold, the maximum exposure limit). They are stored as `qdb_edp_ruleconfiguration` records with a JSON value and accessed from formula expressions using the `EDP_Config("key")` built-in function. Authors do not hardcode these values in rule logic; they reference the configuration key.

Administrators manage shared variables through the Rule Library Shared Variables tab.

### 15.7 Reusable Decision Tables

A reusable decision table is a Rule Template with authoring style = DecisionTable and a flag indicating it is a library asset rather than a standalone rule template. Rules can reference a reusable decision table as a sub-decision. This is functionally equivalent to a sub-decision reference but with a library-browsable presentation.

---

## 16. Regression Testing [NET-NEW]

### 16.1 Current State

**What does not exist:** No regression testing capability, no regression suite management, no baseline capture, no run-history tracking, and no regression suite schedule.

### 16.2 Regression Testing Design Principle

Regression testing answers the question: "Does this new version of the rule produce the same outputs as the prior Published version for all known scenarios?" It is distinct from the Test Rule Studio (which tests a single rule's scenarios) in that it:
1. Runs automatically when a new version is submitted for review or promoted to Approved.
2. Compares outputs of the new version against the baseline (the current Published version's outputs for the same inputs).
3. Produces a pass/fail report that is attached to the Approval Workflow record.

### 16.3 Regression Suite Design

A Regression Suite is a named collection of test scenarios associated with a rule, designated as the baseline for regression comparison. It is a superset of the Test Rule Studio scenarios — any named scenario can be promoted to the regression suite.

```
REGRESSION SUITE — Credit Eligibility Rule
+------+------------------------------+----------+-----------+
| #    | Scenario Name                | Status   | Baseline  |
+------+------------------------------+----------+-----------+
| 1    | Credit Score - High Risk     | Included | v3        |
| 2    | Credit Score - Low Risk      | Included | v3        |
| 3    | Edge - Zero Income           | Included | v3        |
| 4    | Maximum Loan Boundary        | Included | v3        |
| 5    | Regulatory Cap Hit           | Included | v3        |
| 6    | Seasonal Scenario (exploratory)| Excluded | --        |
+------+------------------------------+----------+-----------+
| [Run Suite] [Update Baseline] [Export] [Add Scenario]     |
```

### 16.4 Regression Suite Run

A regression suite run executes all included scenarios against a target version (typically a Draft or Approved version being reviewed) and compares each output against the baseline (the outputs from the current Published version for the same inputs). The baseline outputs are stored in the `qdb_edp_ruletestresult` entity (NET-NEW, §19).

```
REGRESSION SUITE RUN — Credit Eligibility v4 (Draft) vs Baseline (v3)
Run Date: 2026-07-04 14:30   Duration: 312ms (5 scenarios)

+------------------------------+----------+---------------+
| Scenario                     | Result   | Differences   |
+------------------------------+----------+---------------+
| Credit Score - High Risk     | PASS     | (none)        |
| Credit Score - Low Risk      | PASS     | (none)        |
| Edge - Zero Income           | PASS     | (none)        |
| Maximum Loan Boundary        | FAIL     | MaxLoan: 250k -> 300k (CHANGED) |
| Regulatory Cap Hit           | PASS     | (none)        |
+------------------------------+----------+---------------+
| Summary: 4 PASS, 1 FAIL      | [View Diff] [Approve Diff] [Export] |
```

### 16.5 Regression Run Actions

| Action | Description |
|--------|-------------|
| Run Suite | Execute all scenarios against target version; compare against baseline |
| Update Baseline | Capture the current Published version's outputs as the new baseline for all scenarios |
| Approve Diff | Mark a specific difference as intentional (expected regression); document justification |
| View Diff | Open the Comparison panel for the specific scenario that failed |
| Export | Download the regression report as HTML or CSV |

### 16.6 Regression Suite Integration with Approval Workflow

When a rule version is submitted for review (Draft -> In Review), the platform automatically triggers a regression suite run if a regression suite exists for that rule. The result is attached to the `qdb_edp_ruleapproval` record for Stage 1 (Business Review). Reviewers see the regression result before deciding to approve or reject.

If the regression suite run fails (any FAIL result with no approved diff), the platform flags the approval record with a "Regression Failure" indicator. It does not block approval automatically — the reviewer makes the governance decision — but the failure is visible and recorded in the audit.

### 16.7 Performance Target for Regression Runs

Regression suite runs are capped at 100 scenarios. For rules with more than 100 scenarios, the platform selects the most recently run 100 for the automatic approval-trigger run. Administrators can override and run the full suite manually. The time limit for a full 100-scenario regression run is 2 minutes (the plugin sandbox ceiling), which constrains scenario count when each scenario averages 1–2 seconds.

---

## 17. Performance Analytics [EXTEND]

### 17.1 Current State

**ALREADY-EXISTS:**
- `qdb_edp_ruleexecutionlog` is populated with `durationms`, `executedon`, `outcome`, `resolvedversion`.
- `qdb_edp_ruleanalytics` entity exists with `metricsjson`, `periodstart`, `periodend`, and a lookup to `qdb_edp_rule`.

**What does not exist:** Any computation populating `qdb_edp_ruleanalytics`. The entity exists but all records are empty. No aggregation job, no analytics UI, and no per-formula or per-table timing metrics exist.

### 17.2 Metrics Catalogue

The following metrics are defined for the analytics system:

| Metric | Description | Source |
|--------|-------------|--------|
| execution_count | Total decision evaluations in period | ruleexecutionlog count |
| error_count | Evaluations with outcome != Success | ruleexecutionlog where outcome in (CompilationError, RuntimeError) |
| no_match_count | Evaluations with outcome = NoMatch | ruleexecutionlog where outcome = NoMatch |
| avg_duration_ms | Mean execution duration | AVG(durationms) |
| max_duration_ms | Maximum execution duration | MAX(durationms) |
| min_duration_ms | Minimum execution duration | MIN(durationms) |
| p95_duration_ms | 95th percentile duration | Computed from distribution |
| success_rate_pct | Percentage of evaluations that were Success | (execution_count - error_count) / execution_count * 100 |
| cache_hit_rate_pct | Percentage of rule loads served from cache | Horizon 2 (when compiled-graph cache is built) |
| pinned_execution_count | Evaluations using a pinned version | ruleexecutionlog where pinned = true |
| most_common_output | The most frequently produced output value (per output alias) | Aggregated from outputjson (H2) |
| slowest_formula_ms | Maximum time spent in formula evaluation (per step trace) | Aggregated from step trace (H2) |
| slowest_table_ms | Maximum time spent in decision table evaluation | Aggregated from step trace (H2) |

Metrics marked H2 require the step-level trace to be persisted (section 5 EXTEND work). H1 metrics are available from the summary fields on `qdb_edp_ruleexecutionlog`.

### 17.3 Aggregation Job

A scheduled asynchronous plugin step runs once daily and aggregates the previous day's `qdb_edp_ruleexecutionlog` records into `qdb_edp_ruleanalytics` records. One analytics record is created per rule per day. The `metricsjson` column stores the full metric payload:

```json
{
  "schemaVersion": "1.0",
  "periodStart": "2026-07-03T00:00:00Z",
  "periodEnd":   "2026-07-03T23:59:59Z",
  "ruleKey": "credit-eligibility",
  "metrics": {
    "execution_count":      1247,
    "error_count":          3,
    "no_match_count":       48,
    "avg_duration_ms":      52,
    "max_duration_ms":      489,
    "min_duration_ms":      31,
    "p95_duration_ms":      124,
    "success_rate_pct":     99.76,
    "pinned_execution_count": 12
  }
}
```

The aggregation job is implemented as a CRM Custom API (`qdb_edp_AggregateAnalytics`) invoked by a Power Automate scheduled cloud flow or a CRM recurring workflow (on-prem). No external scheduler is introduced.

### 17.4 Analytics Viewer

The Analytics panel in the designer shows a rule's performance history:

```
ANALYTICS — Credit Eligibility Rule
Period: Last 30 days  [7D | 14D | 30D | 90D | Custom]

+------------------+-------+-------+-------+-------+--------+----------+
| Date             | Count | Avg   | P95   | Max   | Errors | Success% |
+------------------+-------+-------+-------+-------+--------+----------+
| 2026-07-03       | 1,247 |  52ms | 124ms | 489ms | 3      | 99.76%   |
| 2026-07-02       | 1,182 |  49ms | 118ms | 412ms | 1      | 99.92%   |
| 2026-07-01       | 1,309 |  54ms | 131ms | 521ms | 7      | 99.46%   |
...
+------------------+-------+-------+-------+-------+--------+----------+

P95 TREND (sparkline bar chart by date - 30 days)
[###########################################################]
 31ms                                                      124ms

[Export CSV] [View in Dashboard]
```

### 17.5 Performance Snapshot

When a rule version is published, the platform captures a Performance Snapshot: the complexity profile metrics and the current SDP compliance status. This snapshot is stored in the `qdb_edp_performancesnapshot` entity (NET-NEW, §19). It provides a baseline for comparing how performance evolves across versions.

### 17.6 SDP Compliance Alerting

When a rule's P95 duration exceeds 400ms (80% of the 500ms SDP target) for three consecutive days, the analytics job writes a `qdb_edp_ruleaudit` record with action = `PerformanceAlert` and sends a notification to the rule's owner. This provides early warning before the SDP ceiling is breached.


---

## 18. Dashboard Design [NET-NEW]

### 18.1 Current State

**What does not exist:** No dashboard, no summary view, no rule-usage reporting, and no operational health view exists for the EDP platform today.

### 18.2 Dashboard Philosophy

EDP dashboards are operational tools for three audiences:
- **Rule Administrators**: platform health, approval queue, error rates.
- **Business Analysts**: my rules, pending approvals, recent activity.
- **Compliance Auditors**: execution counts, pinned executions, approval history.

Dashboards are implemented as CRM model-driven app dashboards (native capability, no external BI infrastructure for the H1 operational dashboard). Power BI reports are the H2 extension for richer analytics (section 21).

### 18.3 Operations Dashboard (Administrator View)

```
EDP OPERATIONS DASHBOARD — 2026-07-04
+------------------+------------------+------------------+------------------+
| TOTAL RULES      | PUBLISHED        | PENDING APPROVAL | DRAFT / IN-REVIEW|
|    247           |    189           |    12            |    46            |
+------------------+------------------+------------------+------------------+

RULE USAGE — Last 7 Days (Top 10 by execution count)
+----------------------------------+--------+-------+------+----------+
| Rule                             | Exec   | Avg   | P95  | Errors   |
+----------------------------------+--------+-------+------+----------+
| Credit Eligibility               | 8,729  | 52ms  | 124ms| 21       |
| Loan Pricing Formula             | 7,341  | 61ms  | 148ms| 5        |
| Income Band Lookup               | 6,892  | 38ms  | 89ms | 2        |
| Regulatory Cap Check             | 4,201  | 44ms  | 102ms| 0        |
| Risk Band Classification         | 3,987  | 57ms  | 133ms| 8        |
+----------------------------------+--------+-------+------+----------+

SLOWEST RULES — Last 7 Days (P95 > 300ms)
  Income Qualifier Matrix: P95 = 489ms [WARNING: approaching SDP ceiling]
  Portfolio Risk Score: P95 = 412ms

SUCCESS / FAILURE RATE (7-day trend - ASCII sparkline)
  Success:  |||||||||||||||||||||||||||||||||||||  99.7%
  NoMatch:  ||||                                    3.8%
  Error:    |                                       0.2%

PENDING APPROVALS (12)
  Stage 1 (Business Review): 7 rules
  Stage 2 (Technical Review): 3 rules
  Stage 3 (Publisher): 2 rules

EXECUTION TREND (daily counts - last 14 days)
  [##########################################################]
  0                                                    12,400/day
```

### 18.4 My Rules Dashboard (Business Analyst View)

Personalised view scoped to the authenticated user's authored rules:

- My rules (published, draft, in review) with last-run count and last-modified date.
- Pending approvals where I am an assigned reviewer.
- Recent test run results (last 5 runs in Test Rule Studio).
- Versions awaiting my attention (rejected and sent back to me).

### 18.5 Compliance Dashboard (Auditor View)

Read-only view for EDP Rule Auditors:

- Pinned executions in the last 30 days (count, rules involved, justification codes).
- State transition history (last 30 days: how many rules published, retired, cloned).
- Approval workflow completion rate (how many submissions led to publish vs. rejected).
- Rules without tests (rules with no associated `qdb_edp_ruletest` record).
- Rules without documentation (rules with no `qdb_edp_ruledocumentation` record).
- Top executors (which service accounts / users triggered the most decisions).

### 18.6 Dashboard Implementation

CRM model-driven app dashboards are the H1 implementation: standard CRM charts and lists configured against FetchXML queries on the EDP entities. The `qdb_edp_ruleanalytics` entity feeds the usage metrics (after the aggregation job populates it). No external BI tool is required for the H1 dashboard.

Dashboard snapshots (point-in-time captures for reporting) are stored in the `qdb_edp_dashboardsnapshot` entity (NET-NEW, §19) when an administrator explicitly saves a snapshot.

---

## 19. CRM Data Model

### 19.1 Existing Entities (ALREADY-EXISTS)

The following 22 entities are deployed and working in the `BusinessRuleEngine` solution as of 2026-07-04:

| Logical Name | Status | Purpose |
|---|---|---|
| `qdb_edp_rule` | ALREADY-EXISTS | Rule top-level asset |
| `qdb_edp_ruleversion` | ALREADY-EXISTS — EXTEND | Rule version; add: `inputjson`, `outputjson`, `triggerSource`, `traceCorrelationId` columns |
| `qdb_edp_ruleapproval` | ALREADY-EXISTS — EXTEND | Approval record; add: `approvalstage`, `escalationtarget`, `escalatedon` columns |
| `qdb_edp_ruleaudit` | ALREADY-EXISTS — EXTEND | Append-only audit; add append-only enforcement plugin; add: `correlationid` column |
| `qdb_edp_ruleexecutionlog` | ALREADY-EXISTS — EXTEND | Per-evaluation log; add: `inputjson`, `outputjson`, `triggersource`, `pluginstepname`, `tracecorrelationid` columns |
| `qdb_edp_ruletest` | ALREADY-EXISTS | Test definition and scenarios (testcasesjson) |
| `qdb_edp_rulesimulationrun` | ALREADY-EXISTS | Simulation run |
| `qdb_edp_ruleanalytics` | ALREADY-EXISTS — EXTEND | Analytics rollup; currently empty; aggregation job to populate |
| `qdb_edp_rulefunction` | ALREADY-EXISTS — EXTEND | Function catalog; seed with 31 EDP_* functions |
| `qdb_edp_rulecategory` | ALREADY-EXISTS | Category taxonomy |
| `qdb_edp_rulefolder` | ALREADY-EXISTS | Navigation folder |
| `qdb_edp_rulepackage` | ALREADY-EXISTS | Exportable bundle |
| `qdb_edp_ruletemplate` | ALREADY-EXISTS — EXTEND | Template; seed 8 templates from designer spec §15 |
| `qdb_edp_ruletag` | ALREADY-EXISTS | Tag |
| `qdb_edp_ruledocumentation` | ALREADY-EXISTS — EXTEND | Documentation; implement generation logic and export |
| `qdb_edp_ruledependency` | ALREADY-EXISTS — EXTEND | Dependency edge; implement population at save time |
| `qdb_edp_ruleconfiguration` | ALREADY-EXISTS | Config KV |
| `qdb_edp_featureflag` | ALREADY-EXISTS | Feature flag |
| `qdb_edp_metadataentitydef` | ALREADY-EXISTS | Cached CRM entity metadata |
| `qdb_edp_metadataattributedef` | ALREADY-EXISTS | Cached CRM attribute metadata |
| `qdb_edp_metadataoptionsetdef` | ALREADY-EXISTS | Cached CRM option-set metadata |
| `qdb_edp_ruleimportrecord` | ALREADY-EXISTS | Import audit |

### 19.2 Net-New Entities Recommended

Seven new entities are recommended to support Phase 4 capabilities. Reasons are given for each.

**qdb_edp_ruletestresult (NET-NEW)**

| Property | Value |
|----------|-------|
| Purpose | Stores the result of each named test scenario execution separately from the scenario definition; enables long-term comparison and regression baseline management |
| Why needed | The current `testcasesjson` memo stores only the last run result per scenario. To support regression baselining (§16), run history, and trend comparison, each run must be a separate record |
| Key columns | `ruletest` lookup, `scenarioid` (UUID), `ranon` datetime, `ruleversion` lookup, `passed` boolean, `actualoutputsjson` memo, `comparisonbaselineversionid`, `durationms` |

**qdb_edp_ruleexecutionstep (NET-NEW)**

| Property | Value |
|----------|-------|
| Purpose | Stores the step-level trace for each decision evaluation as structured records (one per step), enabling the Visual Debugger (§6) and the Execution Log Viewer (§27) to query individual steps |
| Why needed | The step-level trace is currently returned by the Custom API in `TraceJson` but not persisted. Persisting it as structured records enables server-side query (find all evaluations where a specific formula expression resulted in an error) |
| Key columns | `ruleexecutionlog` lookup, `stepid` UUID, `nodetype`, `nodeid`, `conditionresult` boolean, `elapsedms`, `inputvaluesjson` memo, `outputvaluesjson` memo, `variablechangesjson` memo, `formulaexpression`, `formularesult`, `decisiontablerowindex`, `errorcode`, `warningsmessagesjson` |
| Trade-off | High write volume. ADR-G05 governs the decision to create this entity vs. storing steps in the memo column only |

**qdb_edp_approvalhistory (NET-NEW)**

| Property | Value |
|----------|-------|
| Purpose | Provides a queryable, flattened view of all approval decisions across all rule versions; separates historical read concern from the append-only `qdb_edp_ruleapproval` write records |
| Why needed | The Compliance Dashboard (§18.5) and the Approval History Panel (§9.6) need to query approval decisions across rules and time ranges efficiently. The `qdb_edp_ruleapproval` entity is append-only and serves as the write record; this entity is the read-optimised projection |
| Key columns | `ruleversion` lookup, `rule` lookup, `approvalstage`, `decision` (Approved/Rejected/SentBack/Escalated), `actor`, `decidedon`, `comments`, `versionlifecyclestateatdecision` |
| Alternative considered | Use `qdb_edp_ruleapproval` directly with FetchXML queries. Rejected: the approval entity includes pending records (no decision yet); mixing pending and decided records in a history query requires filtering that is better solved by a separate projection |

**qdb_edp_comparison (NET-NEW)**

| Property | Value |
|----------|-------|
| Purpose | Stores saved comparison results from the Comparison Engine (§13) |
| Why needed | Authors can save a comparison for later reference, regression baseline justification, or sharing with reviewers. Without a persistent record, comparisons are compute-only and cannot be referenced by approval workflows |
| Key columns | `rule` lookup, `leftversionid`, `rightversionid`, `diffcount`, `diffsummaryjson` memo, `savedby`, `savedon`, `notes` |

**qdb_edp_regressionsuite (NET-NEW)**

| Property | Value |
|----------|-------|
| Purpose | Manages the regression suite definition for a rule: which scenarios are included, what the baseline version is, and the history of suite runs |
| Why needed | Regression testing (§16) requires a persistent definition of which scenarios form the baseline, and a run history. The current `qdb_edp_ruletest` entity stores the scenarios but not the suite configuration or run history |
| Key columns | `rule` lookup, `baselineversionid`, `includedscenariosids` JSON memo, `lastrunon`, `lastrunresult` (Pass/Fail/Partial), `lastrunby`, `lastrundurationms` |

**qdb_edp_performancesnapshot (NET-NEW)**

| Property | Value |
|----------|-------|
| Purpose | Captures the performance profile of a rule version at the time of publishing: complexity score, SDP compliance status, and initial execution metrics after go-live |
| Why needed | Enables comparison of performance across versions ("was version 4 faster or slower than version 3?") and provides the baseline for the SDP compliance alerting in §17.6 |
| Key columns | `ruleversion` lookup, `capturedon`, `complexityscore`, `sdpcompliant` boolean, `initialp95ms`, `metricsatpublishjson` memo |

**qdb_edp_dashboardsnapshot (NET-NEW)**

| Property | Value |
|----------|-------|
| Purpose | Stores point-in-time snapshots of the Operations Dashboard metrics for period-over-period trend comparison and regulatory reporting |
| Why needed | The live `qdb_edp_ruleanalytics` entity holds rolling aggregates. For compliance reporting ("what was the error rate in Q1 2026?"), a snapshot at a point in time is needed |
| Key columns | `capturedon`, `snapshotjson` memo (full dashboard metric set), `capturedby`, `notes`, `period` (Daily/Weekly/Monthly/Manual) |

### 19.3 Option Set Extensions Required

| Option Set | Extension Needed |
|-----------|-----------------|
| `qdb_edp_lifecyclestate` | Add: InReview, Approved, Archived states (section 8.3) |
| `qdb_edp_approvalstatus` | Confirm: SentBack, Escalated, Withdrawn values exist or add them |
| New: `qdb_edp_approvalstage` | Add: 1=BusinessReview, 2=TechnicalReview, 3=Publisher |
| New: `qdb_edp_regressionresult` | Add: Pass, Fail, Partial, NotRun |
| New: `qdb_edp_snapshotperiod` | Add: Daily, Weekly, Monthly, Manual |

### 19.4 Entity Relationship Summary

```
qdb_edp_rule
  |-- (1:N) qdb_edp_ruleversion
  |       |-- (1:N) qdb_edp_ruleapproval
  |       |-- (1:N) qdb_edp_ruleaudit
  |       |-- (1:N) qdb_edp_ruleexecutionlog
  |       |           |-- (1:N) qdb_edp_ruleexecutionstep  [NET-NEW]
  |       |-- (1:N) qdb_edp_rulesimulationrun
  |       |-- (1:1) qdb_edp_performancesnapshot  [NET-NEW]
  |-- (1:1) qdb_edp_ruletest
  |       |-- (1:N) qdb_edp_ruletestresult  [NET-NEW]
  |-- (1:1) qdb_edp_regressionsuite  [NET-NEW]
  |-- (1:N) qdb_edp_ruledocumentation
  |-- (1:N) qdb_edp_ruledependency (fromref)
  |-- (1:N) qdb_edp_ruleanalytics
  |-- (1:N) qdb_edp_comparison  [NET-NEW] (by rule)
  |-- (N:N via ruletag) qdb_edp_ruletag

qdb_edp_approvalhistory  [NET-NEW] (denormalized projection of ruleapproval)
qdb_edp_dashboardsnapshot  [NET-NEW] (platform-level, no rule lookup)
```

---

## 20. Security Model [NET-NEW]

### 20.1 Current State

**What exists:** The phase-3-arch.md section 10 and the designer spec section 21 define five security roles. The roles are listed in schema/README.md as a remaining refinement ("not yet created"). No EDP security roles exist in Dataverse today.

**What this section adds:** A sixth role (Read-Only), the Tester and Reviewer roles clarified, approval and publish permission matrix, and the net-new entities added to role privilege tables.

### 20.2 Six Security Roles

| Role | Typical Persona | Core Privileges |
|------|----------------|-----------------|
| EDP Rule Author | Business Analyst, Policy Owner | Create/Write Draft versions; read Category/Folder/Function/Template; simulate via Custom API; run test scenarios; submit for review |
| EDP Rule Tester | QA Analyst, Business Validator | Read all rule versions (including Draft); run test scenarios and simulations; no create/write on rule logic; read test results |
| EDP Rule Reviewer | Business Reviewer, Compliance Lead | All Tester privileges; approve/reject Stage 1 and Stage 2 approval records; write comments; submit escalations |
| EDP Rule Publisher | Platform Owner, Release Manager | All Reviewer privileges; publish (Draft -> Published, Approved -> Published); retire; run regression suites |
| EDP Rule Administrator | CRM Administrator | All Publisher privileges; manage Configuration, Feature Flags, Metadata Cache, security roles; archive versions; delete draft records; reassign approvals |
| EDP Read-Only | Auditor, Regulator, Executive | Read on: all rule versions (Published only), execution logs, audit records, analytics, documentation; no create/write/execute |

### 20.3 Approval / Publish Permission Matrix

| Operation | Author | Tester | Reviewer | Publisher | Administrator |
|-----------|--------|--------|----------|-----------|---------------|
| Create Draft | Y | N | N | N | Y |
| Edit Draft | Y | N | N | N | Y |
| Submit for Review | Y | N | N | N | Y |
| Approve (Stage 1) | N | N | Y | Y | Y |
| Approve (Stage 2) | N | N | Y | Y | Y |
| Publish | N | N | N | Y | Y |
| Retire | N | N | N | Y | Y |
| Archive | N | N | N | N | Y |
| Clone | Y | N | N | Y | Y |
| Delete Draft | Y | N | N | N | Y |
| Run Simulation | Y | Y | Y | Y | Y |
| Run Test | Y | Y | Y | Y | Y |
| View Execution Log | N | N | N | Y | Y |
| View Audit | N | N | N | Y | Y |
| Manage Config | N | N | N | N | Y |
| Read-Only access | Read-Only role: Published versions + logs + audit |

### 20.4 Segregation of Duties Enforcement

The Pre-Validation plugin on `qdb_edp_ruleapproval` enforces SoD when the `EDP_EnforceSoD` feature flag is enabled:
- The approving identity (actor on the approval decision) must not be the same CRM user as the authoring identity (createdby on the ruleversion) for the same version.
- If the identities match, the plugin returns a typed error: `SodViolation - author cannot approve their own version`.
- The `EDP_EnforceSoD` feature flag defaults to `true` (enabled). Administrators can disable it for environments where SoD is not required (e.g., a very small team in a development environment).

### 20.5 Privilege Table for Net-New Entities

| Entity | Author | Tester | Reviewer | Publisher | Administrator | Read-Only |
|--------|--------|--------|----------|-----------|---------------|-----------|
| qdb_edp_ruletestresult | CR | R | R | CR | CRWD | R |
| qdb_edp_ruleexecutionstep | N | N | R | R | R | N |
| qdb_edp_approvalhistory | N | N | R | R | R | R |
| qdb_edp_comparison | CR | R | R | CR | CRWD | N |
| qdb_edp_regressionsuite | CR | R | CR | CRW | CRWD | N |
| qdb_edp_performancesnapshot | N | R | R | R | CRWD | R |
| qdb_edp_dashboardsnapshot | N | N | R | CR | CRWD | R |

Legend: C=Create, R=Read, W=Write, D=Delete, N=No access.

### 20.6 Field-Level Security on New Columns

The new `inputjson` and `outputjson` columns on `qdb_edp_ruleexecutionlog` must be protected by FLS where the rule's input or output fields are themselves FLS-protected. The `ExecutionTraceWriter` already evaluates FLS at write time (replacing restricted field values with `"[restricted]"` — per phase-4-native-runtime.md §12.5). No additional FLS configuration is needed on these columns; the protection is applied at the content level before write.

---

## 21. Reporting Strategy [NET-NEW]

### 21.1 Reporting Architecture

Reporting is a read-only analytics concern. It does not affect the core runtime or governance infrastructure. Per Phase 0 invariant 3 (zero external infrastructure for core function), the distinction is: reporting infrastructure is additive and optional — the platform works correctly without it. Reports are not part of the core runtime.

### 21.2 Reporting Tiers

| Tier | Tool | Data Source | Audience | Notes |
|------|------|-------------|----------|-------|
| Tier 1 — Operational | CRM model-driven app dashboards | EDP entities (live) | Administrators, Authors | H1; built-in, no external infra |
| Tier 2 — Analytical | Power BI (Dataverse connector) | `qdb_edp_ruleanalytics`, `qdb_edp_ruleexecutionlog`, `qdb_edp_ruleaudit` | Executives, Compliance | H2; optional; read-only connector |
| Tier 3 — Regulatory | Excel / CSV export + PDF | `qdb_edp_ruleaudit`, `qdb_edp_approvalhistory`, `qdb_edp_ruleexecutionlog` | Auditors, Regulators | H1; manual export from designer |
| Tier 4 — Embedded | SSRS reports (on-prem only) | SQL views over CRM tables | On-premises reporting consumers | H2 on-prem only; read-only |

### 21.3 Standard Reports

| Report | Description | Format | Audience |
|--------|-------------|--------|----------|
| Rule Inventory | All rules with status, version count, category, last published, owner | CSV / Excel | Administrator |
| Execution Summary | Execution count, success rate, avg/P95 duration per rule per period | Excel / Power BI | Administrator |
| Approval Activity | All approval decisions in period: rule, version, stage, actor, decision, date | Excel / CSV | Compliance |
| Audit Trail | All audit events for a rule or period: actor, timestamp, event type, details | PDF / Excel | Auditor |
| Pinned Execution Report | All pinned executions with justification code and note | Excel / PDF | Compliance |
| Test Coverage Report | Rules with/without tests; test pass rates | CSV | QA / Administrator |
| Regression History | Regression suite run history with pass/fail counts | CSV | Administrator |
| Performance Report | P95 trend per rule, SDP compliance flag, alerts | Excel / Power BI | Administrator |

### 21.4 Power BI Integration Notes

Power BI connects to Dataverse via the certified Dataverse connector (read-only). No EDP data is pushed to Power BI; the connector reads live entity data. The `qdb_edp_ruleanalytics` entity is designed to be the primary feed for Power BI dashboards (daily aggregates, not row-level execution logs). Row-level execution log queries from Power BI are permitted but should be filtered by date range to avoid large dataset pulls.

Power BI reports are optional and additive. The platform is complete and correct without them. Their absence does not affect governance, audit, or operational capability.

### 21.5 Export from Designer

The designer provides direct export capabilities for key reports:
- Audit Trail Export: from the Audit panel, export all audit records for the active rule as a PDF or Excel file.
- Test Coverage Export: from the Rule Library, export the test coverage report as CSV.
- Regression Report Export: from the Regression Suite panel, export the last suite run as HTML or CSV.
- Documentation Export: from the Documentation panel, export as PDF, HTML, or DOCX (section 11.4).

All exports are generated in-browser or via a CRM Custom API. No external document generation service is introduced.

---

## 22. Risks

### 22.1 Risk Register

| # | Risk | Probability | Impact | Severity | Mitigation |
|---|------|-------------|--------|----------|------------|
| R-01 | **GoRules JDM canvas overlay API unavailability** — the Visual Debugger (§6) requires the JDM Editor to expose an element-by-element overlay API. If this API does not exist or requires unsupported WASM capabilities, the graphical debugger cannot be implemented | High | Medium | Fallback to step-list view (not graph-overlay). Spike the GoRules JDM API before committing to graph-overlay design. Document the fallback as the H1 deliverable. |
| R-02 | **Dataverse write throttle at high trace volume** — at 100,000+ executions/day with 100% sampling, write throughput to `qdb_edp_ruleexecutionlog` (and the new `qdb_edp_ruleexecutionstep` at ~5-20 steps per call) may trigger Dataverse API limits | High | High | ADR-13 tiering already mitigates this (async write, degrade gracefully). Additionally: default `TraceSamplingRate` to 10% for high-volume rules; implement the `qdb_edp_ruleexecutionstep` entity only after volume testing confirms it is within limits. |
| R-03 | **Regression suite run exceeds 2-minute sandbox limit** — a 100-scenario regression run at 1-2 seconds per scenario would take 100-200 seconds, exceeding the plugin sandbox ceiling | High | Medium | Cap regression run to 50 scenarios for the automatic approval-trigger run. Full-suite runs are manual and use a background async plugin step with Power Automate chunking. |
| R-04 | **Comparison Engine performance on large PCRM documents** — decision tables with 200 rows and 20 columns produce large PCRM JSON; structural diffing of two such documents in the plugin sandbox may be slow | Medium | Medium | Comparison Engine runs as a Custom API call, not in the main evaluation plugin. Apply a size check: if either PCRM exceeds 512KB, warn the author that comparison may be slow and cap the diff at 1000 structural elements. |
| R-05 | **Circular reference detection across 5,000 rules** — the depth-first traversal at save time may be slow in a 5,000-rule repository if sub-decision chains are common | Medium | Medium | Bound traversal at depth 3 (already the SDP ceiling). Cache the sub-decision references of recently-visited rules in the validation pass. Mark traversal as async (show a "Validating dependencies..." spinner) if the call takes > 500ms. |
| R-06 | **DOCX export complexity** — generating a well-formatted DOCX file from structured JSON in a CRM plugin assembly is non-trivial; third-party DOCX libraries may not be sandbox-safe | Medium | Medium | Evaluate Open XML SDK (Microsoft, native .NET, likely sandbox-safe). If not sandbox-safe, fall back to HTML export (which covers 80% of use cases) and defer DOCX to Horizon 2. Document fallback in an ADR. |
| R-07 | **Approval workflow scalability** — at 500 concurrent users submitting rules for review, the approval pipeline may create a queue of 100+ pending approvals simultaneously | Low | Medium | CRM is the bottleneck here, not the EDP. Standard CRM queue management applies. No EDP-specific mitigation needed; document as a CRM environment sizing concern. |
| R-08 | **Field-level security on execution log inputs/outputs** — the `ExecutionTraceWriter` applies FLS filtering at write time. If FLS profiles change after a log record is written, old records may show values that are now restricted | Low | High | FLS applies at read time in Dataverse (standard behaviour). The `[restricted]` masking is a belt-and-suspenders measure. Document that FLS on input/output columns of the execution log is the authoritative control, applied at read time by Dataverse. |
| R-09 | **Metadata Explorer cache staleness** — the metadata cache has a configurable TTL (default 60 minutes). If an entity or field is deleted between cache refreshes, the explorer shows stale data | Medium | Low | The metadata explorer is a browsing tool, not a binding authority. Bindings resolve at save time (not at browse time). Stale explorer data is a UX inconvenience, not a data integrity risk. The V-07 validation (deleted field detection) catches any stale binding at save time. |
| R-10 | **Power BI row-level execution log queries** — analysts running Power BI reports that pull all `qdb_edp_ruleexecutionlog` rows without date filters may cause Dataverse API throttle | Medium | Medium | Document the recommended query pattern: always filter by date range. Apply a `mql_edp_PowerBIMaxRetentionDays` configuration that limits what the Dataverse connector can return. This is a governance policy, not a platform enforcement. |



---

## 23. Recommendations

The following sequenced build roadmap prioritises capabilities by value, dependency order, and risk. It is structured into four sprints.

### Sprint 1 — Foundation Hardening (prerequisite for all Phase 4 work)

These items close known gaps in the already-deployed schema before Phase 4 feature work begins:

| Priority | Item | Why First |
|----------|------|-----------|
| P0 | Apply append-only enforcement plugin on `qdb_edp_ruleaudit` (Pre-Validation plugin blocking Update/Delete) | Security gap; listed as remaining refinement in schema/README.md |
| P0 | Create the six EDP security roles in Dataverse with correct privilege tables | Security gap; listed as remaining refinement in schema/README.md |
| P0 | Add InReview and Approved lifecycle states to `qdb_edp_lifecyclestate` option set | Required for Approval Workflow (Sprint 2) |
| P1 | Add `inputjson`, `outputjson`, `triggersource`, `tracecorrelationid` columns to `qdb_edp_ruleexecutionlog` | Required for Execution Log Viewer (Sprint 3) |
| P1 | Extend the Pre-Validation plugin on `qdb_edp_ruleversion` to enforce immutability on InReview, Approved, Archived states | Required for Versioning correctness |
| P1 | Seed the 31 `EDP_*` functions into `qdb_edp_rulefunction` records | Required for Function Catalog in Rule Library (Sprint 3) |

### Sprint 2 — Governance Core

| Priority | Item | Rationale |
|----------|------|-----------|
| P0 | Approval Workflow (§9): submission, review, approve, reject, send-back, publish lifecycle | Highest governance value; unlocks maker-checker separation of duties |
| P0 | Audit Event Extension (§10): wire all 17 event types to `qdb_edp_ruleaudit` | Closes the audit completeness gap; required for regulatory sign-off |
| P1 | Version History Panel in designer (§8): Clone, Rollback, Promote, Deprecate, Version History UI | Authors need this alongside approval workflow |
| P1 | Validation Framework Extensions (§7): V-07 through V-11 (deleted field, invalid relationship, invalid option-set, circular reference, chain depth) | Prevents invalid rules from reaching the approval pipeline |
| P2 | Dependency Population at save time (§12): populate `qdb_edp_ruledependency` records from PCRM sub-decision and function references | Required for Impact Analysis (Sprint 3) |

### Sprint 3 — Testing and Observability

| Priority | Item | Rationale |
|----------|------|-----------|
| P0 | Test Rule Studio (§3): named scenarios, save/run/clone/export, sample-CRM-record input, expected output modes | Authors need this before publishing rules to production |
| P0 | Execution Log Management Viewer (§27): filter, inspect, export from `qdb_edp_ruleexecutionlog` | Administrators and auditors need log access immediately |
| P1 | Simulation Framework (§4): Batch, Decision Table Explorer, Formula/Variable View, Compare modes | High author productivity value |
| P1 | Performance Analytics (§17): aggregation job for `qdb_edp_ruleanalytics`; Analytics Viewer panel | Enables performance monitoring for published rules |
| P1 | Operations Dashboard (§18): CRM model-driven app dashboard for administrators | Operational visibility |
| P2 | Dependency Graph and Impact Analysis (§12): graph viewer, reverse traversal, impact analysis on retire | Dependency data exists (Sprint 2); UI and traversal are the build work |
| P2 | CRM Metadata Explorer (§26): browsable entity/field/option-set viewer with used-by links | Author productivity; reduces time-to-find the right binding |

### Sprint 4 — Enterprise Completeness

| Priority | Item | Rationale |
|----------|------|-----------|
| P1 | Regression Testing (§16): suite definition, baseline capture, run-on-submit, pass/fail report, approval integration | Required for confident publishing of complex rules |
| P1 | Visual Debugger (§6): canvas overlay OR step-list view (after GoRules overlay API spike) | High author value for diagnosing unexpected decisions |
| P1 | Documentation Architecture (§11): auto-generation, editor, PDF/HTML export | Required for regulatory documentation |
| P2 | Comparison Engine (§13): version-vs-version and rule-vs-rule structural diff | Reviewer productivity; supports regression baseline justification |
| P2 | Search Architecture (§14): faceted search, advanced filters, saved searches, favourites | Library usability at scale |
| P2 | Rule Library UI (§15): template browser, function catalog, shared variables tab | Reuse and consistency |
| P3 | V-12 through V-14 validation (duplicate conditions, dead branch, recommendations) | Quality improvements; not blocking |
| P3 | Net-new entities: qdb_edp_ruleexecutionstep (after volume test confirms feasibility) | Structured step storage; deferred due to write-volume risk |
| P3 | DOCX export (§11.4) — only if Open XML SDK is sandbox-safe | Nice-to-have; HTML export is sufficient for most use cases |

---

## 24. Acceptance Criteria

These criteria are testable per capability. They are stated as observable behaviours, not implementation details.

### Testing (§2-§3)

| ID | Criterion |
|----|-----------|
| AC-T01 | An EDP Rule Author can create a named test scenario with manual inputs and expected outputs, run it, and see a Pass or Fail verdict per output field. |
| AC-T02 | Running a test scenario that was previously Fail shows a previously-failed run in the history before the fix; the current run shows Pass. |
| AC-T03 | An author can load a real CRM record from the entity picker and have its field values pre-populate the test scenario inputs. |
| AC-T04 | Exporting all scenarios for a rule produces a valid JSON file; importing that file into another environment creates identical scenarios. |
| AC-T05 | An author can upload a JSON payload; the system validates it against the rule's input schema and rejects payloads with invalid field names. |

### Simulation (§4)

| ID | Criterion |
|----|-----------|
| AC-S01 | A batch simulation of 10 input rows completes in under 30 seconds and produces correct output for each row. |
| AC-S02 | In Decision Table Explorer mode, changing an input value causes the highlighted matched row to update without a full page reload. |
| AC-S03 | In Compare mode, a simulation run against two versions shows all changed output fields with old and new values highlighted. |
| AC-S04 | A batch simulation of 101 rows is rejected by the designer with a message stating the 100-row limit. |

### Execution Trace (§5)

| ID | Criterion |
|----|-----------|
| AC-E01 | An execution log record for a rule with 5 inputs shows all 5 input values (or `[restricted]` for FLS-protected fields) in `inputjson`. |
| AC-E02 | The `triggersource` column on an execution log record identifies the originating plugin step name when the rule is invoked from a CRM plugin. |
| AC-E03 | The `tracecorrelationid` on an execution log record matches the `TraceCorrelationId` returned by the Custom API response for the same call. |

### Visual Debugger (§6)

| ID | Criterion |
|----|-----------|
| AC-D01 | After running a test, the author can switch to Debug View and navigate through each evaluation step, seeing the input values and result for each node. |
| AC-D02 | Nodes on the FALSE branch of an evaluated IF/ELSE are shown in grey (skipped state); nodes on the TRUE branch are shown in green. |
| AC-D03 | For a Formula step, the Step Inspector shows the full NCalc expression and its computed result. |

### Validation (§7)

| ID | Criterion |
|----|-----------|
| AC-V01 | Attempting to save a rule with a deleted field binding shows a V-07 Error and blocks save. |
| AC-V02 | Attempting to save a rule that creates a circular sub-decision reference shows a V-10 Error and blocks save. |
| AC-V03 | A rule with a complexity score of 100 shows a V-06 Warning but save is permitted after confirmation. |

### Versioning (§8)

| ID | Criterion |
|----|-----------|
| AC-VR01 | Cloning a Published rule version creates a new Draft with version number N+1 and writes a `VersionCloned` audit record. |
| AC-VR02 | Attempting to edit the PCRM JSON of a Published version via the Dataverse Web API returns a typed error (immutability enforcement). |
| AC-VR03 | The Version History panel shows all versions of a rule with state, author, date, and action buttons; the Archive button is only available to EDP Rule Administrators. |

### Approval Workflow (§9)

| ID | Criterion |
|----|-----------|
| AC-AW01 | Submitting a Draft for review transitions its state to In Review and creates a Pending Stage 1 `qdb_edp_ruleapproval` record. |
| AC-AW02 | The author of a rule version cannot approve their own version when the SoD feature flag is enabled; the attempt returns a `SodViolation` error. |
| AC-AW03 | Rejecting a version requires a non-empty comments field; an empty comment field returns a typed error. |
| AC-AW04 | Publishing a version creates a `VersionPublished` audit record in `qdb_edp_ruleaudit` with the full approval stage history in the `details` JSON. |

### Audit (§10)

| ID | Criterion |
|----|-----------|
| AC-AU01 | Attempting to update or delete a `qdb_edp_ruleaudit` record via the Dataverse Web API returns a typed error. |
| AC-AU02 | Exporting a rule's audit trail as PDF produces a document showing all events in chronological order with actor, timestamp, event type, and details. |
| AC-AU03 | A configuration change to `TraceRetentionDays` writes a `ConfigurationChanged` audit record with old and new values. |

### Documentation (§11)

| ID | Criterion |
|----|-----------|
| AC-DOC01 | Clicking "Generate Documentation" for a rule with 3 inputs and a decision table produces a documentation record with all inputs listed in a table and the decision table rendered as HTML. |
| AC-DOC02 | Exporting documentation as HTML produces a self-contained HTML file readable in a browser without internet access. |

### Security (§20)

| ID | Criterion |
|----|-----------|
| AC-SEC01 | A user with only the EDP Rule Author role cannot publish a rule version (the Publish button is disabled or returns a privilege error). |
| AC-SEC02 | A user with only the EDP Read-Only role can view Published rule versions and audit records but cannot create, edit, or delete any EDP record. |
| AC-SEC03 | An EDP Rule Tester can run test scenarios and simulations but cannot submit a rule for review. |

### Performance (§17)

| ID | Criterion |
|----|-----------|
| AC-PERF01 | After the daily aggregation job runs, the Analytics Viewer for a rule with 1,000+ executions yesterday shows today's metrics without loading individual execution log records. |
| AC-PERF02 | A rule with P95 duration > 400ms for 3 consecutive days produces a `PerformanceAlert` audit record and a notification to the rule owner. |

---

## 25. Architecture Decision Records (ADR-G Series)

These ADRs supplement the platform ADRs (ADR-01 through ADR-13) and the designer ADRs (ADR-D01 through ADR-D09). They address governance, testing, and enterprise rule management decisions specific to this Phase 4 spec. They do not re-open or conflict with prior ADRs.

### ADR-G01: Why Immutable Published Versions

**Status:** Accepted (reaffirms ADR-09 from phase-3-arch.md)
**Date:** 2026-07-04
**Decided by:** Architect, Phase 3 confirmed Phase 4

**Context:**
ADR-09 established that Published Rule Versions are immutable. This ADR confirms that the enforcement extends to the In Review and Approved states introduced in this Phase 4 spec. The question is whether the immutability window should be Draft-only (allowing edits until publication) or earlier (blocking edits once submitted for review).

**Decision:**
Immutability applies from the moment a version transitions to In Review. Once submitted for review, the PCRM JSON is frozen. The rationale: a reviewer must be able to trust that what they are reviewing is what will be published. If authors could modify the PCRM after submission, approvals would be meaningless.

**Consequences:**
Authors who need to make changes after submission must Reject the version (if they are also the reviewer, SoD permitting) or request a Send Back from the reviewer. This creates a small friction but is the correct governance behaviour. The clone-and-resubmit path is the prescribed correction mechanism.

---

### ADR-G02: Why a Maker-Checker Approval Workflow (Not Peer Review or Automated Gate)

**Status:** Accepted
**Date:** 2026-07-04
**Decided by:** Architect (Phase 4)

**Context:**
Three governance models were considered for rule promotion:
1. **Peer review** — any other author can approve.
2. **Automated gate** — automated conformance tests (validation, regression) determine promotion.
3. **Maker-checker** — a designated approver role, separate from the author, must explicitly approve.

**Decision:**
Maker-checker is adopted. Automated gates (option 2) are incorporated as supporting evidence within the maker-checker flow (regression run results are attached to the approval record) but do not replace human approval. Peer review (option 1) is rejected because it does not enforce segregation of duties.

**Consequences:**
Rules cannot be published without an explicit approval decision from a designated approver. This adds lead time to rule publication. The mitigation is configurable stage counts (simple rules can be one-stage) and clear escalation paths. The EDP Rule Publisher role consolidates the approval and publish operations for organisations that do not require separation between approval and publication.

**Reference:** CEO condition C-006 (Phase 1) required recorded governance justification for version-pinning. The approval workflow extends this principle to the full publication path.

---

### ADR-G03: Why Execution Trace is Stored as JSON-in-Memo (Not a Separate Execution Step Entity) for H1

**Status:** Accepted (H1); Proposed revision for H2
**Date:** 2026-07-04
**Decided by:** Architect (Phase 4); informed by phase-4-native-runtime.md §12.2

**Context:**
The step-level execution trace can be stored in two ways:
1. **JSON-in-memo** on `qdb_edp_ruleexecutionlog.tracejson` — one record per execution, all steps in one JSON blob.
2. **Separate entity** `qdb_edp_ruleexecutionstep` — one record per step per execution, fully queryable.

Option 2 is significantly richer (enables queries like "show all executions where formula X evaluated to false") but at 5-20 steps per evaluation at 100,000 executions/day, it generates 500,000-2,000,000 records per day — a potential Dataverse throughput and storage concern.

**Decision:**
H1 uses JSON-in-memo (option 1). The step-level trace is returned in the Custom API response and stored in the `tracejson` memo column of `qdb_edp_ruleexecutionlog`. The `qdb_edp_ruleexecutionstep` entity (option 2) is defined in §19 as NET-NEW but is deferred to H2 pending volume testing confirmation.

**Consequences:**
In H1, step-level queries (e.g., "find all evaluations where node X errored") require reading and deserialising the `tracejson` blob, which is not efficient at scale. The Visual Debugger works correctly because it reads the trace for a single execution at a time. The Execution Log Viewer (§27) lists executions and lets users open individual traces — this pattern is unaffected by the memo storage. The H2 revision to `qdb_edp_ruleexecutionstep` requires an ADR update at that time.

**Reference:** ADR-13 (phase-4-native-runtime.md §20) established the tiered trace architecture. This ADR resolves the storage format for the step-level tier.

---

### ADR-G04: Why Regression Suite Is Rule-Scoped (Not Platform-Scoped)

**Status:** Accepted
**Date:** 2026-07-04
**Decided by:** Architect (Phase 4)

**Context:**
Regression testing could be organised at three levels:
1. **Platform-scoped** — one regression suite for all rules; run all rules' scenarios on every publish.
2. **Category-scoped** — one regression suite per rule category.
3. **Rule-scoped** — one regression suite per rule.

**Decision:**
Rule-scoped regression suites (option 3) are adopted. The rationale: each rule has independent decision logic; its regression behaviour is specific to its own scenarios. Platform-scoped regression is expensive (running 5,000 rules' scenarios takes prohibitively long) and produces noisy failure reports where a change to one rule is unrelated to failures in another.

**Consequences:**
Cross-rule regression (detecting that a sub-decision change broke a calling rule) is handled through the Dependency Impact Analysis (§12), not through regression suites. An author modifying a sub-decision should check the impact analysis and run the regression suites of the affected calling rules manually. The platform surfaces the impact analysis warning; it does not automate cross-rule regression in H1.

---

### ADR-G05: Why a Dependency Graph (Not a Flat Dependency List)

**Status:** Accepted
**Date:** 2026-07-04
**Decided by:** Architect (Phase 4)

**Context:**
Sub-decision dependencies could be managed as a simple flat list (rule A depends on rule B — one record) or as a traversable graph (rule A depends on B depends on C, enabling transitive impact analysis).

**Decision:**
A traversable graph is implemented via the `qdb_edp_ruledependency` entity, which stores directed edges. The Impact Analysis traverses the reverse graph (finding all rules that depend on the target). The graph is bounded by the SDP ceiling (sub-decision depth 3), which limits traversal depth.

**Consequences:**
The traversal cost at save time is bounded by depth 3 × fan-in count per level. In a repository of 5,000 rules with average fan-in of 5, worst-case traversal visits 5^3 = 125 rules — manageable. The graph is stored as entity records (not as adjacency lists in JSON) to make it queryable via FetchXML. The `fromref` and `toref` columns store rule version UUIDs as text for cross-environment portability.

---

### ADR-G06: Why Documentation Is Auto-Generated + Author-Edited (Not Fully Manual)

**Status:** Accepted
**Date:** 2026-07-04
**Decided by:** Architect (Phase 4)

**Context:**
Rule documentation can be:
1. Fully manual — the author writes everything.
2. Auto-generated only — the platform generates everything, authors cannot edit.
3. Auto-generated + author-editable — the platform generates a starting point; authors refine and add context.

**Decision:**
Option 3 is adopted. The rationale: fully manual documentation (option 1) is almost never done because it is time-consuming and is often outdated the moment a rule changes. Fully automated documentation (option 2) is accurate but lacks the business context that only the author knows ("why does this rule exist? what policy does it encode?"). Hybrid documentation (option 3) gives accuracy for structural sections (inputs, outputs, decision table, version history) and authoring space for contextual sections (purpose, business context, examples).

**Consequences:**
Documentation must regenerate structural sections when a new version is published. The platform regenerates generated sections on demand (author clicks "Regenerate"); author-edited sections are preserved. This requires the JSON storage structure to distinguish generated vs. edited sections (§11.6).

---

### ADR-G07: Why CRM Model-Driven Dashboards for H1 (Not Power BI)

**Status:** Accepted
**Date:** 2026-07-04
**Decided by:** Architect (Phase 4)

**Context:**
Dashboard options considered:
1. CRM model-driven app dashboards (native CRM capability, FetchXML-driven).
2. Power BI Embedded (requires Azure subscription, external service, embedding configuration).
3. Custom React dashboard (web resource, requires bespoke development).

**Decision:**
CRM model-driven app dashboards are adopted for H1. The rationale: they require zero external infrastructure (Phase 0 invariant 3), are native to the Dynamics environment, support the required FetchXML queries against EDP entities, and can be deployed as part of the solution. Power BI is the H2 extension for richer analytics — it connects via the read-only Dataverse connector and does not affect the core runtime.

**Consequences:**
CRM model-driven dashboards have limited visualisation options compared to Power BI (charts are simpler, layout is constrained). Authors who need richer analytics must wait for H2 Power BI integration. This is an acceptable trade-off given the operational (not analytical) purpose of the H1 dashboard.

---

## 26. CRM Metadata Explorer [NET-NEW]

### 26.1 Current State

**Schema exists:** `qdb_edp_metadataentitydef`, `qdb_edp_metadataattributedef`, and `qdb_edp_metadataoptionsetdef` are deployed as the metadata cache. The Metadata Service populates these records.

**What does not exist:** Any browsable explorer UI. Authors discover entities and fields today only through the metadata pickers embedded in the Rule Designer (entity picker, field picker, option-set picker). There is no standalone explorer, no "used-by" view, no relationship browser, and no favourites/recent items capability outside the designer pickers.

**Design references:** Phase-3-arch.md section 7 (Metadata Architecture) and section 8 (Searchable Metadata Experience) define the metadata service and picker interaction model. This section designs the standalone explorer that complements those pickers.

### 26.2 Why a Standalone Metadata Explorer

Rule authors frequently need to understand the CRM data model before authoring a rule: "What fields does the Contact entity have? What is the relationship from Loan to Contact? What are the option values for the Loan Status field?" Today, authors must open the CRM customisation area (restricted to administrators) or ask a developer. The CRM Metadata Explorer makes this self-service, surfacing the metadata cache in a business-friendly, read-only UI accessible to all EDP roles.

### 26.3 Explorer Structure

The Metadata Explorer is a top-level section of the designer navigation, accessible from the left navigation rail. It is a three-panel layout:

```
+------------------+------------------------+---------------------------+
| ENTITY LIST      | FIELDS                 | FIELD DETAIL              |
|                  |                        |                           |
| Search: [loan_]  | Entity: Loan           | Field: Loan Amount        |
|                  |                        | Logical: qdb_loanamount   |
| [*] Contact      | Search: [     ]        | Type: Currency            |
| [*] Account      | Filter: [All Types v]  | Required: Yes             |
| [v] Loan         |                        | Min: 0   Max: 5,000,000   |
| [v] Loan Version | Status (Required)      | Format: Currency          |
| [ ] Quote        | Loan Amount (Currency) |                           |
| [ ] Product      | Loan Type (Picklist)   | OPTION VALUES: (n/a)      |
| [ ] ...          | Customer (Lookup)      |                           |
|                  |   -> Account           | USED BY (rules):          |
| [My Favourites]  |   -> Contact           |  Credit Eligibility v3    |
| [Recently Used]  | Approval Date (Date)   |  Loan Pricing v2          |
|                  | Created On (Date)      |  Regulatory Cap Check v1  |
+------------------+------------------------+---------------------------+
| RELATIONSHIPS    | OPTION SETS            | [Add to Favourites] [Copy Field Name] |
| Contact --> Loan | Loan Type:             |                           |
| Loan --> Product |   Personal (100000001) |                           |
|                  |   Business (100000002) |                           |
|                  |   Mortgage (100000003) |                           |
+------------------+------------------------+---------------------------+
```

### 26.4 Explorer Panels

**Entity List Panel:**
- Full-text search against entity display name and logical name.
- Filter by entity type (standard, activity, virtual, system).
- Star/unstar entities as favourites.
- Show recently visited entities (session-level, browser local storage).
- Each entity shown with its display name, plural name, and record count (where available from Dataverse).
- Grouped by: All / Custom Entities / System Entities / Activity Entities.

**Fields Panel (for selected entity):**
- Full-text search against field display name and logical name.
- Filter by data type (Text, Integer, Currency, Date, Boolean, Lookup, Picklist, etc.).
- Filter by: Required / Optional / System / Custom.
- Grouped by: Standard / Custom / Relationship-based / Activity / System.
- Relationship lookup fields show a navigate arrow to traverse to the target entity.
- Relationship traversal: clicking the arrow on a lookup field opens that entity in the entity list panel, maintaining a breadcrumb trail (e.g., "Contact > Lookup: Account > Fields").

**Field Detail Panel:**
- Display name and logical name.
- Data type (mapped to EDP normalised type).
- Required level.
- For numeric fields: min/max values.
- For text fields: max length.
- For picklist fields: all option labels and values in the user's language.
- For lookup fields: target entity display name and logical name.
- For date fields: format (date-only vs. datetime).

**USED BY section (in Field Detail Panel):**
The most valuable governance feature of the explorer. For any field, the platform queries `qdb_edp_ruledependency` and the PCRM bindings to list which Published rule versions reference this field. The query is: find all `qdb_edp_ruleversion` records where `pcrmjson` contains the field's entity logical name and attribute logical name as a binding.

```
USED BY (rules binding this field):
  Credit Eligibility v3 [Published]  [Open Rule]
  Loan Pricing Formula v2 [Published]  [Open Rule]
  Regulatory Cap Check v1 [Published]  [Open Rule]
  Income Band Lookup v4 [Draft]  [Open Rule]
```

This is the field-level impact analysis: "if this field changes in the CRM data model, which rules are affected?" It answers the same question as the dependency graph from the rule's perspective, but from the field's perspective.

### 26.5 Relationship Browser

A dedicated Relationships tab in the Fields Panel shows:
- All relationships FROM the selected entity (lookup fields — the entity has a lookup to another entity).
- All relationships TO the selected entity (other entities that have a lookup to this entity).
- For each relationship: the relationship logical name, the related entity, and the traversal path expression (as it would be authored in a PCRM binding).

### 26.6 Option Set Browser

For any Picklist field selected, the explorer shows all option values with their numeric value and localised label. For global option sets (shared across entities), a badge indicates the option set is global and shows which other fields use the same global option set.

### 26.7 Refresh and Sync

The metadata explorer reads from the metadata cache (`qdb_edp_metadataentitydef`, `qdb_edp_metadataattributedef`, `qdb_edp_metadataoptionsetdef`). The cache TTL is 60 minutes (configurable). A "Refresh" button in the explorer header triggers an immediate cache refresh by calling the Metadata Service (if the user has EDP Rule Administrator privileges). Non-administrator users see a "Last updated" timestamp and a message to contact an administrator to force a refresh.

### 26.8 Favourites and Recent

Favourites are stored as browser local storage in H1. Recent entities and fields are stored as session-level browser memory. Both are user-specific and environment-specific. H2 promotes favourites to a CRM user preference record.

### 26.9 Access Control

The Metadata Explorer is read-only for all EDP roles. No EDP action through the explorer modifies any CRM schema. The explorer reads only from the EDP metadata cache entities — it does not call the CRM metadata API directly (that would bypass the cache and is restricted to administrators). All EDP roles have Read access to `qdb_edp_metadataentitydef`, `qdb_edp_metadataattributedef`, and `qdb_edp_metadataoptionsetdef`.

### 26.10 Connection to the Designer Pickers

The Metadata Explorer is the standalone browsing surface. The Entity Picker, Field Picker, and Option Set Picker in the Rule Designer are the authoring-time selection surfaces. Both read from the same metadata cache. The explorer adds the "used-by" dimension, the relationship browser, and the standalone navigation that the designer pickers do not provide.

---

## 27. Execution Log Management & Viewer [EXTEND]

### 27.1 Current State

**ALREADY-EXISTS:**
- `qdb_edp_ruleexecutionlog` is populated live by the `ExecutionTraceWriter` on every rule execution.
- Records contain: `resolvedversion` lookup, `wouldresolveversion` lookup, `pinned` boolean, `pinjustificationcode`, `actor`, `executedon`, `outcome`, `durationms`.
- The Custom API returns `TraceJson` and `DiagnosticsJson` in its response (not persisted in H1 beyond the execution log summary fields).

**What does not exist:** Any viewer or filter UI for `qdb_edp_ruleexecutionlog`. Administrators and auditors cannot browse, filter, or inspect execution logs from the EDP designer today. The only access is via direct Dataverse Advanced Find.

### 27.2 Execution Log Viewer Design

The Execution Log Viewer is a dedicated section of the EDP designer, accessible from the left navigation rail (visible to EDP Rule Publishers, Administrators, and Read-Only roles; hidden from Authors and Testers). It provides a filterable list of execution log records and a detail view for each.

```
EXECUTION LOG VIEWER
+----------------------------------------------------------------------+
| FILTERS                                                   [Export]   |
| Rule: [Credit Eligibility v]  Version: [Any v]                       |
| Outcome: [Any v]  Date: [2026-07-01] to [2026-07-04]                 |
| Actor: [           ]  Duration: [>] [300]ms  Pinned: [Any v]         |
| [Apply Filters] [Clear]                                              |
+----------------------------------------------------------------------+
| RESULTS (247 records, filtered)                                      |
| Showing 1-25 of 247  [<] [1] [2] ... [10] [>]                       |
+------------------+------+-------+------+------------+-----+----------+
| Timestamp        | Rule | Vers. | Outc | Actor      | Ms  | Pinned   |
+------------------+------+-------+------+------------+-----+----------+
| 2026-07-04 09:15 | Cred | v3    | Succ | Jane Smith | 47  | No       |
| 2026-07-04 09:14 | Cred | v3    | Succ | API/Portal | 52  | No       |
| 2026-07-04 09:12 | Cred | v2    | Succ | John Doe   | 489 | YES v2   |  <- PINNED
| 2026-07-04 09:11 | Cred | v3    | Err  | Jane Smith | 103 | No       |  <- ERROR
| 2026-07-04 09:10 | Cred | v3    | NoMt | API/Portal | 44  | No       |
+------------------+------+-------+------+------------+-----+----------+
```

### 27.3 Filter Capabilities

| Filter | Description |
|--------|-------------|
| Rule | Select one or more rules from a picker |
| Version | Specific version number, or "Any" or "Latest Published" |
| Outcome | Success / NoMatch / CompilationError / RuntimeError / Any |
| Date Range | From date / To date (required to prevent unbounded queries) |
| Actor | CRM user name search (partial match) |
| Duration | Greater than / Less than / Between (in milliseconds) |
| Pinned | Yes / No / Any |
| Pin Justification Code | Filter by specific justification code (for compliance queries) |
| Trigger Source | Plugin / Custom API / Custom Action / Any (H2 — requires trigger source column to be populated) |

All filters are applied server-side via FetchXML. A date range filter is required (enforced by the viewer) to prevent queries that return millions of records.

### 27.4 Log Record Detail View

Clicking any row in the results list opens the detail view for that execution log record:

```
EXECUTION LOG DETAIL
+----------------------------------------------------------------------+
| Record: 2026-07-04 09:12:33 UTC                                      |
| Rule: Credit Eligibility   Version: v2 (PINNED)                      |
| Outcome: Success   Duration: 489ms                                   |
| Actor: John Doe (john.doe@company.com)                               |
| Pin Justification: LongRunningCase                                   |
|   "Existing case opened before v3 was published; must use v2 logic"  |
| Would-Resolve Version: v3 (current published)                        |
| Trigger Source: [not captured in H1]                                 |
+----------------------------------------------------------------------+
| INPUTS                                                               |
| Credit Score: 450                                                    |
| Annual Income: 35,000                                                |
| Loan Amount: 80,000                                                  |
| (requires inputjson column to be populated — Sprint 1 EXTEND)        |
+----------------------------------------------------------------------+
| OUTPUTS                                                              |
| Decision: Reject   Risk Band: High   Max Loan: 0                     |
| (requires outputjson column to be populated — Sprint 1 EXTEND)       |
+----------------------------------------------------------------------+
| TRACE                                                                |
| [View Full Trace JSON]  [Open in Visual Debugger]                    |
| Step 1: IF CreditScore > 600 -- FALSE (450 not > 600)                |
| Step 2: [Reject branch] -- Decision = Reject                         |
| Step 3: [Output] MaxLoan = 0                                         |
+----------------------------------------------------------------------+
| [Copy Record ID]  [Export as JSON]  [Add to Regression Baseline]    |
```

### 27.5 Trace Display

The detail view shows a condensed step-by-step trace parsed from the `tracejson` memo column. If the `qdb_edp_ruleexecutionstep` entity (H2) is populated, the detail view reads from there instead for richer step data. The "Open in Visual Debugger" button passes the trace JSON and the rule version to the Visual Debugger (§6), which renders the graphical step-by-step view.

### 27.6 Retention and Sampling Alignment

The Execution Log Viewer respects the ADR-13 retention and sampling configuration:
- Records older than `TraceRetentionDays` (default 90) do not appear in the viewer (they have been deleted by the retention purge job).
- If `TraceSamplingRate` is below 100%, the viewer shows a banner: "Sampling is active (10%). Not all executions are captured. Only sampled executions are shown."
- The viewer shows a "Retention: 90 days" indicator in the filter panel so users understand the search window.

### 27.7 Export

From the Execution Log Viewer, an administrator or auditor can export the filtered results as:
- **CSV** — for spreadsheet analysis (all summary columns, no trace JSON).
- **JSON** — for system integration (full record JSON including `tracejson` where populated).
- **PDF** — for regulatory submission (formatted report showing filter criteria, result count, and first 500 records in a table).

Export is bounded: the maximum export size is 10,000 records. Larger result sets require narrowing the date range filter.

### 27.8 Connection to Dashboards and Regression

The Execution Log Viewer feeds two other capabilities:
- **Dashboards (§18):** The Operations Dashboard's "Slowest Rules" and "Failed Executions" tiles link directly to the Execution Log Viewer with pre-applied filters (outcome=Error, or duration > 400ms for the slowest rules filter).
- **Regression Baseline (§16):** The "Add to Regression Baseline" button in the detail view takes the inputs and outputs of a production execution and adds them as a named test scenario in the Test Rule Studio, promoting a real production execution into a regression baseline scenario.

---

## Closing Note

This document defines the complete Phase 4 Testing, Governance & Enterprise Rule Management specification for engagement EDP-BRE-001. It covers 27 sections: the core 25 required sections plus Section 26 (CRM Metadata Explorer) and Section 27 (Execution Log Management and Viewer).

Every section is tagged with its implementation status (ALREADY-EXISTS / EXTEND / NET-NEW). Seven net-new Dataverse entities are recommended. Seven ADR-G Architecture Decision Records are defined. A four-sprint sequenced build roadmap is provided in Section 23.

No section in this document modifies the Phase 0 Architectural Invariants, the Phase 3 architecture decisions, or the Phase 4 designer and runtime specifications. All decisions here are additive to those authoritative references.

**Document end — EDP-BRE-001 Phase 4 Testing, Governance & Enterprise Rule Management v1.0**

