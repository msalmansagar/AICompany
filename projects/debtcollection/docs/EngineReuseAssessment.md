# DCP — Existing QDB Engine Reuse Assessment (Phase 0)

**Status:** proposal · 2026-09-17 · Master Prompt §44–48, Correction Prompt §41–42. Evidence is drawn
from this repository's sibling projects and their session records, **not** from QDB runtime testing.
Anything not evidenced is `TBD — Requires QDB Confirmation`. Nothing here modifies any engine.

Rule that binds every engine below (CP §41): **one Collection rule / form / process / assignment /
report definition serves both platforms.** DCP never keeps a cloud copy and an on-prem copy of a rule,
form or process. Where an engine's *execution surface* differs by platform, the difference lives inside
that engine's facade adapter, never in Collection business or UI code.

---

## 0. The cross-cutting platform question — Custom API on on-prem 9.1

| Source | Statement |
|---|---|
| EDP `deploy/onprem/ONPREM.md` | "on-premises predates Custom API … so on-prem the EDP operations are exposed as unbound Custom (Process) Actions" |
| DFE `crm-plugins/Qdb.FormEngine/PLUGIN-REGISTRATION.md` §3b | "The Custom API entity **may be** unavailable on 9.1 on-prem. Use Processes (Actions)" |
| DFE `onprem-deploy/2026-09-16/README.md` | Speaks of "Custom API bindings" surviving an assembly update on the on-prem org — ambiguous |

Whether Custom API exists on **QDB's** on-prem 9.1 build is therefore `TBD — Requires QDB Confirmation`.
It does not change DCP's design: both engines already converge on the same portable pattern —

```
   caller (React / plugin / Integration Service)
        │   Xrm.WebApi.online.execute({ operationName, parameters })   ← same call both platforms
        ▼
   Cloud:   Custom API  qdb_edp_* / qdb_* / qdb_dcp_*   (executeprivilegename authorisation)
   On-Prem: Process Action (unbound) with the SAME unique name; plugin registered as an SDK step
        │   identical plugin class dispatching on context.MessageName
        ▼
   same InputParameters / OutputParameters
```

DCP adopts this pattern for its own operations (`APIContracts.md` §6), so the answer to the question
only affects deployment packaging, never source.

---

## 1. Form Engine (DFE) → `IFormEngine`

| Aspect | Finding |
|---|---|
| Existing implementation | `projects/dynamic-form-engine/` — designer (`qdb_form_designer` web resource), runtime (`qdb_form_runtime.html`, single 1.9 MB bundle), C# plugins `Qdb.FormEngine.*` (render cache, publish), schema `qdb_form*`. Branches: `feat/dfe-*`; **nothing DFE is on `main`**. |
| Runtime status | **Cloud (org5869857f): live** — designer, runtime, publish, render cache, rules, Arabic, grids, API lookups all deployed and org-verified. **On-prem (Reyada-IPC): deployed but defective** — designer loads blank (5 assets 404), on-prem plugin predates the 2026-07-28 attach-by-trigger fix so section rules are missing from published JSON. Kit `onprem-deploy/2026-09-16/` (DLL + combined designer/runtime solution + README) built, not yet confirmed applied. |
| Cloud compatibility | Runtime tested. |
| On-prem compatibility | **Compatible by design, runtime test failing** — the kit README lists: solution `SolutionPackageVersion="9.0"` accepted by 9.0/9.1 (a July export at 9.2 may be refused); web-resource size 1.9 MB under the 5 MB default; provisioning scripts authenticate against `login.microsoftonline.com` and **do not run on-prem** (columns added by solution or by hand). |
| Shared configuration / business model | One form definition (`qdb_form` + `qdb_conditions_json` rules) serves both platforms — confirmed by the on-prem kit shipping the same solution. |
| Platform-specific dependency | Custom API `qdb_GetPublishedFormJson` (publish / cache) on cloud; §3b documents Process Actions for on-prem. The runtime **reads the render-cache table directly via OData by default** and does not need the Custom API. Style-cache trigger `qdb_*Cache` Custom API likewise. |
| Required adapter / remediation | `IFormEngine` binds by **form code**, never by GUID (render cache is keyed by form code — a known gotcha: re-seeding under the same code serves the old cache). On-prem: close the two open defects (apply the 2026-09-16 kit, republish) before DCP relies on it in Phase 6. No DCP-side code branch. |
| Test coverage | ~428 tests at the last recorded green run (frontend + backend), plus browser E2E in later batches — see project. |
| Technical debt | Two rule formats share `qdb_conditions_json`; save is not atomic (header PATCH last); in-CRM build swaps `DynamicIcon` for `webresource/swap/`; publish stripper once deleted hidden fields (fixed); 4 rules in the org publish to nothing (trigger select stored `""`). All recorded in the DFE project memory. |

### `IFormEngine` (facade)

```
loadFormDefinition(formCode, language)          → FormDefinition          // by code, cached
renderForm(formCode, context: { entity, recordId, activityTypeId, prefill }) → FormHandle
validate(formHandle)                            → ValidationResult
readValues(formHandle)                          → Record<string, unknown>  // canonical, not raw DOM
submit(formHandle, target: { entity, recordId }) → Result<SubmitOutcome>
listFormsFor(activityTypeCode)                  → FormSummary[]
```

Adapter per platform: **none** in DCP. The runtime bundle is the same file; DCP hosts it by web-resource
name from `qdb_platformconfiguration` (no absolute URL). Which activity type uses which form code lives on
`qdb_collectionactivitytype.qdb_defaultformcode`.

---

## 2. Process Engine (CWFD runtime) → `IProcessEngine`

| Aspect | Finding |
|---|---|
| Existing implementation | `projects/crm-workflow-designer/` (designer, route table `qdb_outcomeworktasks`, config-table field pickers) and the **QDB process runtime already on org5869857f**: plugins `ApplyProcess`, `OnTaskComplete`, `TatAndEscalations` (see memory *"QDB process engine HAS a runtime"* — the backlog's "no runtime" claim is false and cost two duplicated engagements). CWFD-016…020 merged + deployed; main @ `76ce7cc2`. |
| Runtime status | **Cloud: live** (511 tests; CRM-verified). TAT columns exist but are read by nothing. Platform questions #90 (8 items) and #93 (OQ-1..5) still block the runtime track. |
| Cloud compatibility | Runtime tested. |
| On-prem compatibility | **Unknown** — no on-prem deployment record. `TBD — Requires QDB Confirmation`. Plugin code has not been scanned for sandbox-hostile patterns in this assessment. |
| Shared configuration / business model | Process definitions are CRM records (routes, outcomes, tasks) — one definition per process for both platforms, provided the runtime plugins register on both. |
| Platform-specific dependency | One script (`scripts/check-plugins.js`) lists Custom APIs, but the runtime surface is plugin-driven (Create/Update steps), not Custom API — a favourable sign for on-prem. To be confirmed. |
| Required adapter / remediation | `IProcessEngine` starts / advances / queries process instances by **process code**. Approval, maker-checker, return, reject, escalation, SLA, delegation all route here (MP §46). Remediation: obtain on-prem status; answer #90/#93. |
| Test coverage | 511 tests (CWFD-020). |
| Technical debt | Custom React-Flow edges ignore the `label` prop; a canvas measured mid-load can miss edges; browser session now demands a password, so deploy verification reads `webresourceset` content via the SP token. |

### `IProcessEngine` (facade)

```
startProcess(processCode, subject: { entity, recordId }, payload)   → Result<ProcessInstanceRef>
completeTask(instanceRef, taskRef, outcomeCode, comment)            → Result<ProcessState>
returnTask(instanceRef, taskRef, reason)                            → Result<ProcessState>
delegateTask(instanceRef, taskRef, toUserOrTeam)                    → Result<ProcessState>
escalate(instanceRef, reason)                                       → Result<ProcessState>
getState(instanceRef)                                               → ProcessState
listOpenTasksFor(user | team, filters)                              → TaskSummary[]
getHistory(subject)                                                 → ProcessEvent[]   // feeds the unified timeline
```

Adapter per platform: none expected; if the runtime exposes Custom APIs on cloud, the on-prem adapter
calls the equivalent Process Action (§0).

---

## 3. Rule Engine (EDP) → `IRuleEngine`

| Aspect | Finding |
|---|---|
| Existing implementation | `projects/enterprise-decision-platform/` — solution `BusinessRuleEngine`, entities `qdb_edp_*` (effective-dated versions), runtime `EDP.RuleRuntime` (netstandard2.0 core) + `EDP.RuleRuntime.Crm` (net462 plugins: `RuleServicePlugin`, `EvaluateDecisionPlugin`, `GovernanceActionPlugin`, `RuleAnalysisPlugin`, `RuleMetadataPlugin`, `DecisionIntelligencePlugin`, `AppendOnlyGuardPlugin`, `DeleteAuditPlugin`, `ProductionPinJustificationPlugin`), GoRules-style designer, optional Fastify gateway (ADR-15, transport-only). |
| Runtime status | **Cloud: live** via **22 Custom APIs** `qdb_edp_*` (AnalyzeRule, CompareVersions, EvaluateDecision, ExecuteDecisionTable, ExecuteRuleSet, ExplainDecision, ExplainRule, GetAnalytics, GetDependencies, GetInputSchema, GetOutputSchema, GetPublishedVersion, GetRuleAnalytics, GetRuleDocumentation, GetRuleHistory, GetRuleMetadata, GetRuleTemplates, ResolveEffectiveVersion, RuleGovernanceAction, RunScenarios, TestRule, ValidateRule). Known: the org is **mixed** — `TestRule` still on 1.0.23 silently drops quantifier rules; fix = re-point the 21 Custom APIs (needs the user). |
| Cloud compatibility | Runtime tested. |
| On-prem compatibility | **Compatible by design — runtime test pending.** `deploy/onprem/ONPREM.md` is a full runbook: same signed assembly (net462, sandbox-safe; NCalc is a pure AST interpreter with no `Compile()`), each message re-created as an **unbound Process Action** from `actions-manifest.json`, plugins registered as PostOperation sync steps via the Plugin Registration Tool, designer built with `VITE_EDP_ONPREM=true` (read ops switch from OData Function GET to Action POST), authorisation via table privileges + optional in-plugin check (no `executeprivilegename` on Actions). Explicitly "**not yet validated on an on-prem instance**". Requires on-prem ≥ 9.0. |
| Shared configuration / business model | One rule definition (`qdb_edp_rule` + versions) for both platforms — the runbook ships the same solution. |
| Platform-specific dependency | Message surface only (Custom API ↔ Process Action). Plugin C# is identical; it dispatches on `context.MessageName`. |
| Required adapter / remediation | `IRuleEngine` adapter: cloud calls Functions (GET) / Actions; on-prem calls Actions (POST) — the same switch EDP's own designer already implements in `src/dataverse/messaging.ts`; DCP reuses that mapping. Remediation before Phase 3: run the on-prem runbook once on a real org; re-point the mixed Custom APIs on the cloud org. **This is not a blocker** — the earlier Phase 0 finding that called it one is withdrawn. |
| Test coverage | See project (`runtime/tests/EDP.RuleRuntime.Tests`, `EDP.RuleRuntime.Crm.Tests`; 86 green tests recorded for the designer improvements track). |
| Technical debt | NCalcSync 5.4.2 factorial-DoS advisory (fix needs System.Text.Json 10.x, incompatible with the net462 sandbox — mitigated by input limits); SNK rotation (F-05) before production; Dataverse POST returns 204 with an empty body (id only in `OData-EntityId`) — a class of bug that once duplicated rules; `all` over an empty set = TRUE; element fields shadow outer symbols. |

### `IRuleEngine` (facade)

```
evaluate(ruleCode, input: Record<string, unknown>, options?: { asOf, explain }) → Result<Decision>
executeRuleSet(ruleSetCode, input)                                             → Result<Decision[]>
executeDecisionTable(tableCode, input)                                          → Result<Decision>
explain(decisionRef)                                                            → Explanation
getInputSchema(ruleCode) / getOutputSchema(ruleCode)                            → JsonSchema
resolveEffectiveVersion(ruleCode, asOf)                                         → VersionRef
```

DCP uses: strategy eligibility, PTP rules, communication rules, critical-action MIS revalidation
(`qdb_collectionactivitytype.qdb_requiresmisrevalidation` decides *whether*; a rule decides *what*),
conditional UI, collection policy (MP §47). Rule codes are configuration on `qdb_collectionstrategy`,
`qdb_strategyaction`, `qdb_collectionactivitytype` — never hard-coded in React.

---

## 4. Report Engine → `IReportingService`

| Aspect | Finding |
|---|---|
| Existing implementation | `projects/report-engine/` — designer + runtime web resources, C# plugin (multi-dataset execute, authored totals, matrix, bands, print page, document viewer), schema incl. `qdb_compositionmode`. |
| Runtime status | **Cloud: live** (Phase A multi-dataset, per-dataset queries, D1–D6 SSRS-parity track, related-table picker; PR #161 document viewer open). |
| Cloud compatibility | Runtime tested (806 browser tests + plugin tests at the last record). |
| On-prem compatibility | **Compatible by design — runtime test pending, with two hard prerequisites**: `qdb_compositionmode` must be provisioned and published **before** deploying or every report run breaks; the two activities must be registered by the user on the on-prem org. Web-resource URL must be `main.aspx?pagetype=webresource&webresourceName=…` (never the raw `/WebResources/` path). |
| Shared configuration / business model | One report definition (layout JSON keyed by dataset alias) for both platforms. |
| Platform-specific dependency | None identified beyond the prerequisites; no Custom API found in the project (`customapi` grep = 0 files). |
| Required adapter / remediation | `IReportingService` runs a report by **code** with parameters and returns a viewer handle / export. Keep DCP dashboards' *operational* lists on native views; use Report Engine for management/portfolio reports (MP §66). Keep the design Power BI-compatible: every report reads entity data, never a private store. |
| Test coverage | 806 browser + plugin tests (2026-09-09). |
| Technical debt | PR #161 review findings unapplied (`.doc-pages` needs `position:relative`); a refusal arrives as HTTP 200 with `errorCode`; a failed publish exits 0 and "nothing changed" then skips forever (recovery `--publish`); ECONNRESET mid-PublishAll recurs. |

### `IReportingService` (facade)

```
listReports(area: 'collections' | 'management', role)      → ReportSummary[]
runReport(reportCode, parameters, format: 'viewer'|'pdf'|'xlsx') → Result<ReportHandle | Blob>
getPortfolioMetrics(spec)                                    → MetricSet   // CRM-side metrics only; MIS metrics come from IMisDelinquencyService
```

---

## 5. Smart Assignment → `IAssignmentEngine`

| Aspect | Finding |
|---|---|
| Existing implementation | **No artefact found.** Not in this repository; no folder under `D:\QDB\Projects` (candidates checked: GoldenWorkflow, ConfigurableDevelopment, Workflow Designer, Business Rule Engine); no memory record. The user's architecture deck lists it under "QDB Reusable Engines — Routing Rules, Team/User Assignment". |
| Runtime status / compatibility | `TBD — Requires QDB Confirmation`: where it runs, its contract (entity? plugin? Custom API/Action?), on-prem/cloud status, test coverage. |
| Shared configuration | `qdb_assignmentconfiguration` holds DCP's routing criteria and a `qdb_smartassignmentref` (proposed) pointing at the Smart Assignment rule/team. If Smart Assignment already models the criteria, `qdb_assignmentconfiguration` shrinks to a pointer (MP §43 — reuse, do not duplicate). |
| Required adapter / remediation | Until confirmed, `IAssignmentEngine` has one **interim** implementation over `qdb_assignmentconfiguration` that must be *replaceable* by a Smart Assignment adapter without changing callers. Recorded in `KnownIssues.md` and `RiskRegister.md`. |

> ### Gate correction 16 — Smart Assignment remains an external dependency (2026-09-17)
>
> **Smart Assignment contract/runtime = `TBD — Requires QDB Confirmation`.** The fact that the artefact was
> not found in this repository or under `D:\QDB\Projects` is **not** licence for DCP to build a replacement.
>
> Binding constraints on `qdb_assignmentconfiguration` and the interim `IAssignmentEngine`:
>
> - `qdb_assignmentconfiguration` may hold **DCP-specific configuration only where required** — the
>   criteria DCP itself needs in order to hand work to an assignment mechanism, plus the pointer to the
>   QDB Smart Assignment rule/team.
> - It **must not silently become a replacement generic assignment engine.** No general-purpose routing
>   rule language, no territory model, no workload-balancing engine, no scheduling — those belong to Smart
>   Assignment (MP §43: reuse, do not duplicate; CP §42: do not duplicate an engine because the existing
>   one has a gap).
> - The interim implementation is **deliberately minimal and disposable**: the simplest routing DCP needs
>   to function in Phase 8, behind the facade, removable the moment the Smart Assignment contract is known.
> - Any proposal to extend it beyond that is an architecture change requiring QDB approval, not a build
>   decision. If Smart Assignment already models the criteria, `qdb_assignmentconfiguration` **shrinks to a
>   pointer**.

### `IAssignmentEngine` (facade)

```
resolveAssignment(subject: { caseId, customerType, productType, dpd, arrears, riskLevel, region, legalStatus }) → Result<AssignmentDecision { ownerId | teamId, method, slaHours, configRef }>
reassign(caseId, to: userOrTeam, reason)                → Result<void>     // reason mandatory (BRD FR-039)
rebalance(teamId, strategy)                             → Result<RebalanceOutcome>
getWorkload(teamId)                                     → WorkloadSummary[]
```

---

## 6. Facade placement and the platform switch

```
   React Collection Workspace / Integration Service / plugins
                 │
                 ▼
   packages/engine-facades   (proposed)   IFormEngine · IProcessEngine · IRuleEngine · IAssignmentEngine · IReportingService
                 │
                 ▼
   EngineOperationInvoker  — ONE class:  execute(operationName, params)
        cloud   → Custom API  (Function GET for read ops where the engine exposes one)
        on-prem → Process Action (POST)
        selected by qdb_platformconfiguration.qdb_platformtype (browser) / PLATFORM_TYPE (service)
```

Only `EngineOperationInvoker` knows the platform. No facade, service, component or plugin does.

---

## 7. Summary matrix

| Engine | Cloud | On-Prem 9.1 | Blocker for DCP reuse? | Action before the phase that needs it |
|---|---|---|---|---|
| Form Engine | Runtime tested | Compatible by design — runtime failing (2 defects) | No — defects are DFE's, remediation path exists | Apply kit, republish, verify designer + section rules (Phase 6) |
| Process Engine | Runtime tested | Unknown — `TBD` | Not yet known | Obtain on-prem status; answer #90/#93 (Phase 3) |
| Rule Engine | Runtime tested (mixed org) | Compatible by design — runtime pending | **No** (withdrawn) | Run ONPREM.md once; re-point mixed Custom APIs (Phase 3) |
| Report Engine | Runtime tested | Compatible by design — prerequisites documented | No | Provision `qdb_compositionmode`, register activities (Phase 10) |
| Smart Assignment | `TBD` | `TBD` | Unknown — no artefact | Confirm existence + contract (Phase 3); interim adapter otherwise |

Every engine keeps **one** definition per rule / form / process / report for both platforms; DCP adds
no duplicate engine (MP §44, §102).
