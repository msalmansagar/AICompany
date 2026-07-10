# Enterprise Decision Platform — Phase 6: Decision Intelligence Platform

**Engagement ID:** EDP-BRE-001
**Phase:** 6 — Technical Design (Product Phase 6: AI Assistant, Enterprise Analytics & Decision Intelligence)
**Module:** Business Rules Engine (BRE) → Enterprise Decision Intelligence Platform
**Parent Product:** Maqsad Low-Code Platform
**Prepared by:** Maqsad AI — Principal AI / Decision Intelligence / Enterprise Analytics Architect
**Date:** 2026-07-06
**Version:** 1.0
**Status:** AUTHORITATIVE — Phase 6 Design Input

---

## Authority Clause

This document is **purely additive**. It does not change, and does not require any change to, any previous phase. All prior architectural decisions are FINAL.

- `phase-0-architecture.md` — Invariants (Appendix B) binding, especially: **AI is advisory-only and NEVER in the evaluation path**; deterministic execution; immutable published versions; CRM-native zero-external-infra for the decision core.
- `phase-3-arch.md` — Domain Model, PCRM Canonical Model (§6), Governance/Versioning; ADR-01…ADR-12.
- `phase-4-native-runtime.md` — `RuleRuntimeService`; ADR-R01…R05; ADR-13 two-tier write path (the analytics source of truth).
- `phase-4-testing-governance.md` — Governance state machine, maker-checker approval, execution log & step-trace (ADR-G series). **The AI plane reuses this governance, it does not fork it.**
- `phase-4-visual-rule-designer.md` — Designer; ADR-D01…D09. The AI Assistant is surfaced inside this designer, producing artifacts the designer already knows how to store/validate.
- `phase-5-enterprise-decision-service.md` — Enterprise Decision Service; ADR-EDS-01…10. Analytics read the execution log the EDS already writes; AI documentation consumes the `Get*` schema Functions.
- `schema/README.md` — Live `qdb_edp_` schema. New AI/analytics entities use the `qdb_edp_ai*` / `qdb_edp_analytics*` naming and are **all optional + defaulted** (ALM upgrade-safe invariant).

Changes to any decision here require a formally approved ADR that names and supersedes the relevant section. **This document is DESIGN SPECIFICATION ONLY — no production code.**

---

## The Two-Plane Model (the spine of this phase)

Phase 6 introduces a second plane that is **physically and logically separated** from the decision plane:

```
┌───────────────────────────────────────────────────────────────────────────┐
│  DECISION PLANE  (Phases 0–5 — FINAL, unchanged)                           │
│  Deterministic · CRM-native · zero-external-infra · immutable versions     │
│  Rule Repository → PCRM → Compiler → RuleRuntimeService → EDS operations    │
│  ── AI NEVER RUNS HERE. Every decision is 100% deterministic. ──           │
└───────────────────────────────────────────────────────────────────────────┘
              ▲ reads (metadata, exec log)          │ writes (DRAFTS only, via governance)
              │                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  INTELLIGENCE PLANE  (Phase 6 — NEW, additive, advisory)                   │
│  Non-deterministic (AI) + historical (analytics). Optional. Removable.     │
│  AI Assistant · Document/Excel Intelligence · Explanation · Optimization · │
│  Conflict/Dependency Analysis · Analytics · BI · Predictive Insights       │
│  ── Produces DRAFTS + INSIGHTS only. Human approval gates every write. ──  │
└───────────────────────────────────────────────────────────────────────────┘
```

**Three inviolable boundaries** (each an ADR below):
1. **AI never publishes** — every AI artifact is created as **Draft** and must pass the existing maker-checker before it can be published (ADR-AI-01).
2. **AI is never in the eval path** — the runtime never calls an LLM; a decision is deterministic and reproducible regardless of AI availability (ADR-AI-07, reaffirming Phase-0).
3. **Analytics are historical** — dashboards aggregate the execution log after the fact; they never sit in the request path and never change a decision (ADR-AI-02).

If the entire Intelligence Plane were deleted, **every rule would still author, validate, publish, and execute exactly as today.** That is the test of correct additivity.

---

## Legend — Implementation Status Tags

| Tag | Meaning |
|-----|---------|
| **[ALREADY-EXISTS]** | Deployed and working today (decision plane) |
| **[EXTEND]** | Schema/code exists; additional design/build required |
| **[NET-NEW]** | No schema or code; full design/build required (most of Phase 6) |

---

## Table of Contents

1. Executive Summary
2. AI Architecture
3. Enterprise Analytics Architecture
4. AI Assistant Design
5. Natural Language Rule Generation
6. Document Intelligence
7. Excel Import Intelligence
8. Rule Explanation Engine
9. Rule Optimization Engine
10. Conflict Detection
11. Dependency Analysis
12. Analytics Dashboards
13. Business Intelligence
14. Predictive Insights
15. AI Governance
16. CRM Data Model
17. Search Architecture
18. Reporting Strategy
19. Security Model
20. Performance Strategy
21. Future AI Roadmap
22. Architecture Decision Records (ADR-AI series)
23. Risks
24. Recommendations
25. Acceptance Criteria

Appendix A — AI Capability → Governance → Output Matrix
Appendix B — Analytics Metric Catalogue & Source Mapping

---

## 1. Executive Summary

Phase 6 turns the Business Rules Engine into an **Enterprise Decision Intelligence Platform** by adding an advisory **Intelligence Plane** on top of the finished decision plane. It delivers three capability families:

- **Authoring intelligence** — an AI Assistant that drafts rules, decision tables, formulas, templates, tests, and documentation from natural language, policy documents, and Excel matrices; explains rules and decisions in business and technical language; and proposes optimizations, refactorings, and conflict/duplicate/dead-rule findings.
- **Operational analytics** — enterprise dashboards and business intelligence over the historical execution log: usage, performance, decision distribution, complexity, approval/routing/eligibility/risk/SLA statistics.
- **Predictive insights** — trend-based suggestions (rules to archive/merge/split, hotspots, metadata growth, performance trends) derived from historical snapshots.

**Every capability is advisory.** AI outputs are Drafts requiring human approval; analytics are read-only historicals. The decision plane is untouched: determinism, reproducibility, and zero-infra execution are preserved. The AI provider is **pluggable** behind an abstraction (Claude default, per platform standard), so the platform is never hard-bound to one vendor and can run against Azure OpenAI, OpenAI, Gemini, or a local LLM.

**Value:** collapses rule-authoring time (business users describe intent in English), makes every decision explainable for audit and regulators, and surfaces optimization/risk signals from real execution data — without adding any risk to the deterministic core.

---

## 2. AI Architecture

**[NET-NEW]**

### 2.1 Provider-abstracted, out-of-band, draft-producing

The AI subsystem is an **out-of-band advisory service** that never participates in evaluation. Its architecture has four layers:

```
Designer / EDS consumer
        │ (natural language, document, Excel, "explain", "optimize")
        ▼
┌─────────────────────────────────────────────────────────────┐
│ AI ORCHESTRATION LAYER                                       │
│  • Intent router (which capability)                          │
│  • Context assembler (PCRM, metadata, exec-log excerpts)     │
│  • PII/sensitive-data redactor (pre-egress boundary)         │
│  • Prompt builder (capability-specific templates)            │
│  • Grounding + guardrails (schema-constrained output)        │
│  • Validator (runs ValidateRule on any generated PCRM)       │
│  • Governance writer (creates DRAFT + AI audit records)      │
└─────────────────────────────────────────────────────────────┘
        │ IAiProvider (abstraction — ADR-AI-06)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ AI PROVIDER ADAPTERS (pluggable, swappable)                  │
│  Claude (default) · Azure OpenAI · OpenAI · Gemini · Ollama  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Where it runs (and why not in the sandbox)

LLM calls are **external, latency-variable, and non-deterministic** — they cannot run inside the Dataverse plugin sandbox that hosts the deterministic runtime (and would violate the zero-infra decision-core invariant). The AI Orchestration Layer therefore runs as an **out-of-band service** (the optional `EDP.Gateway` extended with an AI module, or a dedicated `EDP.AiService`), invoked from the designer or via a Custom API that **enqueues an AI job** — never from the eval path. The decision plane has **no dependency** on it.

### 2.3 Grounding, not free-generation

Every generation is **grounded** in platform truth to prevent hallucinated schema:
- **Metadata grounding** — the CRM Field / metadata catalogue (Phase 4 explorer) constrains which entities/fields/option-sets the AI may reference.
- **Canonical grounding** — generated rules are emitted as **PCRM** and immediately passed through the platform's own `ValidateRule` (EDS operation) + EDP-H1 grammar check; anything out-of-grammar is rejected before a Draft is created.
- **Example grounding** — the template library and existing rules provide few-shot exemplars.

An AI output that cannot be validated into legal PCRM never becomes a Draft — it is returned as a suggestion with diagnostics. **The platform's own validator is the gate, not the model's confidence.**

### 2.4 Confidence & human-in-the-loop

Each AI artifact carries a **confidence score** and the **exact prompt + response + provider + model + version** (AI governance, §15). Low-confidence or high-impact artifacts can require elevated review. Nothing is auto-applied.

### 2.5 Determinism firewall (reaffirmed)

The runtime never imports an AI library, never makes a network call to a provider, and never branches on an AI output. AI availability, latency, or failure has **zero effect** on any decision (ADR-AI-07).

---

## 3. Enterprise Analytics Architecture

**[EXTEND]** — the execution log + step-trace already exist as the raw event stream.

### 3.1 Historical, snapshot-based, out of the request path

Analytics are computed **after** executions occur, by aggregating `qdb_edp_ruleexecutionlog` (+ `qdb_edp_tracejson`) and governance/audit records into **incremental snapshots**. No analytics computation sits in the decision request path (ADR-AI-02). This keeps the sub-second execution budget (C-002) untouched and lets analytics scale to **millions of executions** without loading the transactional entities.

### 3.2 Layered analytics pipeline

```
Execution log + audit (raw events, ADR-13)   ← written by the decision plane
        │ scheduled/incremental rollup (Dataverse async job / Power Automate / batch)
        ▼
Usage Statistics + Analytics Snapshot (pre-aggregated, time-bucketed)   [qdb_edp_analytics*]
        │
        ├── Analytics Dashboards (model-driven + designer views)
        ├── Business Intelligence (approval/routing/eligibility/risk/SLA)
        ├── Predictive Insights (trend models over snapshots)
        └── Power BI / Excel / PDF / HTML exports
```

### 3.3 Storage tiering (ADR-AI-09)

| Tier | Content | Retention | Store |
|------|---------|-----------|-------|
| **Hot (raw)** | Individual execution logs + traces | Short (e.g. 30–90d) then rolled up | `qdb_edp_ruleexecutionlog` |
| **Warm (snapshots)** | Pre-aggregated per rule/version/day/source | Medium-long | `qdb_edp_analyticssnapshot`, `qdb_edp_usagestatistics` |
| **Cold (archive)** | Long-term aggregates / exported datasets | Years | Dataverse long-term retention / external analytics store (Power BI dataset / Data Lake, optional) |

Raw logs never grow unbounded in the transactional store — the incremental rollup + retention policy keeps the hot tier bounded while snapshots preserve history. **Analytics never re-executes rules** to compute a metric; it reads recorded outcomes.

### 3.4 Why not real-time streaming analytics now

Real-time analytics would couple the dashboard to the request path and risk affecting execution. Phase 6 commits to **historical/near-real-time (snapshot latency of minutes)**; event-streaming analytics is a future item (§21) that still never sits in the eval path.

---

## 4. AI Assistant Design

**[NET-NEW]**

### 4.1 Capability catalogue → output type → governance

Every capability produces a typed artifact routed through a defined governance path. **Generation capabilities produce Drafts; analysis capabilities produce Suggestions; explanation capabilities produce read-only text.** None publishes.

| # | Capability | Output type | Governance path |
|---|-----------|-------------|-----------------|
| 1 | Generate Rule | PCRM Draft rule/version | Validate → Draft → maker-checker |
| 2 | Generate Decision Table | PCRM Draft (table logic) | Validate → Draft → maker-checker |
| 3 | Generate Formula | Formula expression (EDP-H1) | Grammar-check → attach to Draft |
| 4 | Generate Expression | Condition expression | Grammar-check → attach to Draft |
| 5 | Generate Rule Template | Draft template | Validate → Draft template review |
| 6 | Generate Test Cases | Test scenarios (Phase-4 library) | Draft scenarios → review |
| 7 | Generate Documentation | Doc artifact | Draft doc → review/attach |
| 8 | Explain Rule / Formula / Decision Table | Read-only explanation | None (read-only) |
| 9 | Generate Business Summary | Read-only text | None |
| 10 | Generate Technical Summary | Read-only text | None |
| 11 | Generate API Documentation | Read-only doc (from `Get*Schema`) | None |
| 12 | Generate JSON / Canonical Rule Model | PCRM Draft | Validate → Draft |
| 13 | Generate Sample Inputs / Outputs | Test data (advisory) | Attach to scenario |
| 14 | Generate Regression Tests | Draft regression suite | Draft → review |
| 15 | Suggest Optimizations / Refactoring | Suggestion records | Human applies → Draft |
| 16 | Find Duplicate / Conflicting / Dead Rules | Analysis findings | Advisory report |
| 17 | Suggest Metadata / CRM Fields / Relationships / Option Sets | Metadata suggestions | Advisory (never auto-creates schema) |

### 4.2 The generate→validate→draft→approve loop (the core pattern)

```
User intent → AI Orchestrator → provider → candidate PCRM/artifact
   → platform ValidateRule + grammar check (REJECT if invalid)
   → create DRAFT (qdb_edp_aigeneratedrule, lifecycle=Draft) + AI audit
   → surfaced in designer for human review
   → human edits/accepts → existing maker-checker (Submit→Approve×2→Publish)
```

The AI's output enters the **exact same governance the designer uses for hand-authored rules**. There is no AI bypass, no AI publish privilege, no auto-apply. (ADR-AI-01, ADR-AI-04.)

### 4.3 Metadata/schema suggestions are advisory only

"Suggest CRM Fields / Relationships / Option Sets" produces a **proposal** (what fields/option-sets a rule seems to need) for a human admin to create through normal Dataverse customization. The AI **never creates schema** — that would breach the ALM/governance model. It closes the loop by grounding subsequent generations on whatever the admin actually created.

### 4.4 Surface

The Assistant is embedded in the existing Visual Rule Designer as a side panel (chat + capability buttons) and is also callable via an **AI job Custom API** (`qdb_edp_AiGenerate`, enqueue-only) for programmatic/batch use. Both paths converge on the same orchestrator and governance.

---

## 5. Natural Language Rule Generation

**[NET-NEW]**

### 5.1 From sentence to four artifacts

A business user writes free text; the AI produces a **coordinated set** — visual rule, canonical model, documentation, and test cases — all as Drafts.

**Input:** *"Loan amount greater than 500,000 and Risk is High should route to CEO."*

**Output (all Draft, all validated):**
1. **Canonical Rule Model (PCRM)** —
```
inputs:  [ {name: loanAmount, type: Currency, binding: <suggested/confirmed>},
           {name: riskRating, type: Text} ]
outputs: [ {name: approvalLevel, type: Text} ]
logic (conditionSet):
  when: AND[ loanAmount GreaterThan 500000 ; riskRating Equals "High" ]
  then: { approvalLevel: "CEO" }
```
2. **Visual Rule** — the designer renders the PCRM (decision-table or condition-set editor) for review/edit.
3. **Documentation** — business summary ("Routes high-risk loans above 500k to CEO approval") + technical summary.
4. **Test Cases** — e.g. `{loanAmount:600000, riskRating:High} → approvalLevel:CEO` (match); `{loanAmount:400000, riskRating:High} → no-match`; boundary `{500000, High}`; `{600000, Low} → no-match`.

### 5.2 Grounding the terms

"Loan amount", "Risk" are business terms; the AI maps them to metadata-catalogued fields (metadata-driven authoring, ADR-04) and, if ambiguous, **asks the user to confirm the binding** rather than guessing. The generated PCRM is validated against EDP-H1 grammar before becoming a Draft — so "route to CEO" resolves to a legal output, and an un-mappable term is surfaced, not hallucinated.

### 5.3 Round-trip safety

Because the output is PCRM (the same canonical model the runtime executes), a natural-language-generated rule, once approved, executes through the **identical** runtime as any hand-authored rule — no special NL path at runtime. NL is an authoring convenience, not a second rule format.

---

## 6. Document Intelligence

**[NET-NEW]**

### 6.1 Extract candidate rules from documents

Supports importing **PDF, Word, Excel, policy documents, procedure documents, BRDs, SOPs**. The pipeline extracts **candidate business rules** as Drafts with provenance back to the source passage.

```
Upload doc → text/layout extraction → segmentation (clauses/sections)
   → rule-candidate detection (AI: "which passages express a decision rule?")
   → per candidate: draft PCRM + cite source (page/section) + confidence
   → Validate → DRAFT (with source citation) → human review
```

### 6.2 Provenance is mandatory

Every extracted Draft records **which document, which page/section** it came from (stored on the AI-generated-rule record). A reviewer can trace a rule back to the exact policy clause — essential for regulated environments and for the explainability mandate (ADR-AI-05).

### 6.3 Human review is the gate, not extraction confidence

Document extraction is inherently lossy; the design assumes **every** extracted rule is reviewed. The AI ranks candidates by confidence and flags ambiguous/conflicting passages, but a human approves each Draft. Nothing extracted is ever auto-published.

### 6.4 Boundaries

Large documents are chunked; extraction is a batch/async AI job (§2.2). PII in source documents is redacted at the pre-egress boundary before any provider call (§19).

---

## 7. Excel Import Intelligence

**[NET-NEW]** — leverages ClosedXML (dependencies.md, H2) for parsing.

### 7.1 Matrix types → rule definitions

Business teams already maintain decision logic in Excel. The importer recognizes common **matrix shapes** and converts them to PCRM decision tables (Drafts).

| Matrix | Recognized shape | Converts to |
|--------|------------------|-------------|
| **Decision Table** | condition columns + outcome columns + rows | PCRM decision table (hit policy inferred/confirmed) |
| **DOA Matrix** (Delegation of Authority) | thresholds → approver/level | Decision table (amount bands → approvalLevel) |
| **Pricing Matrix** | dimensions → price | Decision table (+ formula outputs) |
| **Eligibility Matrix** | criteria → eligible/ineligible | Decision table (boolean output + reasons) |
| **Validation Matrix** | field/condition → valid/violation | Condition set + validation outputs |
| **Risk Matrix** | factors → risk tier/score | Decision table (risk tier + score) |

### 7.2 Column mapping with confirmation

The importer proposes a mapping (which columns are inputs vs outputs, cell operators, data types) grounded in the metadata catalogue, and **asks the user to confirm** header→field bindings and hit policy before generating the Draft. Cell values map to PCRM unary tests (operator + value), reusing the exact decision-table model the runtime already executes.

### 7.3 Validation and round-trip

The generated table is validated (grammar + shape) and, once approved, executes as a normal decision table. Export back to Excel (§18) closes the round-trip so business owners can maintain the source-of-truth spreadsheet and re-import governed changes.

---

## 8. Rule Explanation Engine

**[NET-NEW → PARTIAL]** — grounded on the existing step-trace (`qdb_edp_tracejson`).
**Build status (2026-07-06):** `qdb_edp_ExplainDecision` Function is **live** — deterministic first cut that narrates a recorded decision's trace into a business + technical explanation (assembly v1.0.6.0, `DecisionIntelligencePlugin`, read-only, no AI provider, off the eval path). LLM prose enrichment via `IAiProvider` is the follow-up.

### 8.1 Explainability is mandatory (ADR-AI-05)

Every rule and every decision must be explainable in **business** and **technical** language. Explanation is **read-only** and largely **deterministic-first**: it is built from the platform's own structured facts (PCRM, step-trace) and only *narrated* by AI — so an explanation cannot invent logic the rule doesn't contain.

### 8.2 Explanation targets

| Target | Source (deterministic) | AI role |
|--------|------------------------|---------|
| **Explain Rule** | PCRM structure | Narrate conditions/outcomes in business terms |
| **Explain Decision** | A specific execution's step-trace | Narrate why *this* input produced *this* output |
| **Explain Formula** | Formula AST + EDP-H1 functions | Plain-language walkthrough |
| **Explain Variables** | Variable definitions + resolution order | Describe derivation |
| **Explain Dependencies** | Dependency graph (§11) | Describe upstream/downstream impact |
| **Explain Execution Trace** | `qdb_edp_tracejson` steps | Turn kind/description/result steps into a narrative |

### 8.3 Business vs technical explanation

- **Business Explanation:** "This loan was routed to CEO because the amount (600,000) exceeded the 500,000 threshold and risk was High." (grounded in trace steps + metadata labels)
- **Technical Explanation:** condition-by-condition trace (`loanAmount GreaterThan 500000 → true`, `riskRating Equals "High" → true`, `AND → true`, `matched THEN branch`), operators, resolved version, elapsed ms.

### 8.4 Grounded narration prevents hallucination

Because the explanation is generated **from the recorded trace and PCRM**, not from the model's imagination, it is faithful to what actually executed. The AI formats and translates; it does not decide *what* happened. This is what makes the explanation audit-usable.

---

## 9. Rule Optimization Engine

**[NET-NEW → PARTIAL]** — mostly **static analysis**, AI-assisted where useful.
**Build status (2026-07-07):** `qdb_edp_AnalyzeRule` Function is **live** — static single-rule findings (unused variables/outputs, duplicate conditions, duplicate decision-table rows) over PCRM, read-only. Cross-rule/portfolio detection and AI-suggested fixes are follow-ups.

### 9.1 Detections (static-first, AI-augmented)

Most optimization signals are **deterministic static analysis** over PCRM + execution stats — reliable and explainable — with AI used to *suggest* the fix, not to *decide* correctness.

| Detection | Method | Signal source |
|-----------|--------|---------------|
| Duplicate Conditions | Static (normalize + compare condition sets) | PCRM |
| Unreachable Rules | Static (condition domination / never-matched) | PCRM + exec log (never-match) |
| Redundant Conditions | Static (subsumption analysis) | PCRM |
| Slow Formulas | Historical (per-node timing) + static complexity | Exec trace timing |
| Unused Variables | Static (declared but never referenced) | PCRM |
| Unused Functions | Static (registered but never called) | PCRM + registry |
| Unused Templates | Usage stats (template never instantiated) | Analytics |
| Unused Decision Tables | Usage stats | Analytics |
| Unused Outputs | Static (output never produced/consumed) | PCRM |

### 9.2 Suggestions require approval

Optimization findings are **suggestions** (`qdb_edp_aioptimization` records). Applying one produces a **Draft** revision that goes through maker-checker. The engine never rewrites a published rule. High-value example: "conditions 2 and 4 are equivalent — merge?" → human accepts → Draft new version.

### 9.3 Complexity scoring

A **rule/formula complexity score** (condition count, nesting depth, table size, formula AST depth) feeds both optimization ("hotspots") and analytics (§12). This is deterministic and stored per version.

---

## 10. Conflict Detection

**[NET-NEW]** — static analysis over PCRM + governance metadata.

### 10.1 Conflict classes

| Conflict | Definition | Method |
|----------|------------|--------|
| **Rule conflicts** | Two rules produce contradictory outputs for overlapping inputs | Static overlap + output diff |
| **Template conflicts** | Divergent templates for the same intent | Metadata + similarity |
| **Formula conflicts** | Same variable derived two ways | Static |
| **Decision table conflicts** | Overlapping rows with different outputs under a non-First hit policy | Static row-overlap analysis |
| **Output conflicts** | Same output set to different values on overlapping conditions | Static |
| **Priority conflicts** | Ambiguous priority/hit-policy ordering | Static (priority ties) |

### 10.2 Overlap analysis is deterministic; AI explains it

Conflict detection computes **input-space overlap** deterministically (interval/set analysis on conditions) and reports concrete counter-examples ("both match `loanAmount=600000, risk=High` but one yields CEO and the other Manager"). AI narrates the conflict and suggests a resolution; the human decides. A counter-example makes every finding **verifiable**, not a black-box claim.

### 10.3 Surfaced at author time and as a report

Conflicts are flagged in the designer (save-time advisory) and available as a portfolio-wide report for governance review before a publish wave.

---

## 11. Dependency Analysis

**[NET-NEW → PARTIAL]** — closes a Phase-4 gap (dependency graph was schema-only).
**Build status (2026-07-07):** `qdb_edp_GetDependencies` Function is **live** — extracts fields/variables/functions/outputs + edges from a rule's PCRM (read-only). `qdb_edp_CompareVersions` is also live (structural diff of two versions). Upstream/portfolio impact analysis and graph persistence to `qdb_edp_ruledependency` are follow-ups.

### 11.1 The dependency chain

```
Rule → Decision Table → Formula → Variable → Function → CRM Entity → CRM Field
```

The analyzer walks PCRM + metadata to build a **directed dependency graph** per rule and across the portfolio, persisted as `qdb_edp_dependency` edges (typed by `qdb_edp_dependencytype`, which already exists).

### 11.2 Impact analysis (both directions)

- **Downstream ("what does this rule depend on?")** — every field/entity/function/table a rule needs; drives the metadata/field-suggestion loop and deployment prerequisites.
- **Upstream ("what breaks if I change this field?")** — given a CRM field or function, list every rule/version affected. This is the **change-safety** query: before an admin retires a field or an option-set value, they see the blast radius.

### 11.3 Graph + AI narration

The graph is deterministic; AI provides a plain-language impact summary ("Changing `riskRating` option set affects 7 rules across Lending and Insurance; 2 are pinned in production"). Deterministic edges + AI narrative = trustworthy impact analysis.

---

## 12. Analytics Dashboards

**[NET-NEW → PARTIAL]** — over the historical snapshots (§3).
**Build status (2026-07-06):** `qdb_edp_GetAnalytics` Function is **live** — historical count/avg/max duration by outcome aggregated over `qdb_edp_ruleexecutionlog` (FetchXML aggregate, read-only, off the eval path). This is the raw-log first cut; the snapshot rollup tier (§3.3, ADR-AI-09) and P95/dashboards are the follow-up for portfolio scale.

### 12.1 Operational metrics

All computed from `qdb_edp_ruleexecutionlog` rollups (never from live execution):

| Metric | Definition |
|--------|------------|
| Rule Usage / Execution Count | Executions per rule/version/source over time |
| Average Execution Time | Mean `durationms`; P95 tracked vs C-002 |
| Peak Usage | Max executions per time bucket |
| Failure Rate | `outcome=error` ratio |
| Cache Hit Ratio | Compiled-rule cache hits (runtime-reported metric) |
| Rule Popularity | Ranked execution volume |
| Decision Distribution | Distribution of output values / outcomes per rule |
| Rule / Formula Complexity | Complexity scores (§9.3) |
| Template / Category Usage | Instantiation counts |
| Top Entities / Fields | Most-referenced metadata (from dependency graph) |
| Most Used Operators | Operator frequency across PCRM |

### 12.2 Dashboard surfaces

Model-driven dashboards + the designer's analytics views + Power BI (§18). Each metric links back to the underlying snapshot and, for drill-down, to individual execution traces — analytics that connect back to explainable single decisions.

### 12.3 Cache-hit and complexity are first-class

Cache hit ratio and complexity are called out because they are the two levers on the C-002 performance ceiling; the dashboard makes them visible so governance can act before the ceiling is threatened.

---

## 13. Business Intelligence

**[NET-NEW]** — decision-outcome analytics for business owners.

### 13.1 Outcome statistics (from recorded decisions)

Business-facing analytics segment recorded outcomes by decision category:

| BI view | Derived from |
|---------|--------------|
| **Approval Statistics** | Distribution of approval-level outputs (e.g. CEO vs Manager) over time |
| **Routing Statistics** | Routing-decision distribution + volumes per route |
| **Eligibility Statistics** | Eligible/ineligible rates + top rejection reasons |
| **Validation Statistics** | Pass/violation rates per validation rule |
| **Risk Statistics** | Risk-tier distribution + trend |
| **SLA Statistics** | Decision latency vs SLA, breach counts (from `durationms` + timestamps) |

### 13.2 Category-aware, not rule-mechanical

BI reads the **business meaning** of outputs (approval level, risk tier) rather than raw mechanics, so a business owner sees "68% of loans auto-approved, 12% to CEO" — a decision-outcome lens on the same execution log the operational dashboards use. Same source, business framing.

### 13.3 No PII leakage

BI aggregates over decisions; it exposes distributions and rates, not individual PII. Row-level records honor CRM security; aggregates honor the analytics permission model (§19).

---

## 14. Predictive Insights

**[NET-NEW]** — trend models over historical snapshots. Advisory only.

### 14.1 Suggestions

| Insight | Basis |
|---------|-------|
| Frequently Executed Rules | Volume trend → candidates for optimization/caching focus |
| Rules to Archive | Zero/negligible execution over a window |
| Rules to Merge | High structural similarity + overlapping usage |
| Rules to Split | High complexity + divergent usage patterns |
| Rule Hotspots | High volume × high complexity × latency |
| Metadata Growth | Trend in entities/fields/rules → capacity planning |
| Performance Trends | Latency/failure trend → early-warning before C-002 breach |

### 14.2 Trend-based, transparent, non-binding

Predictions are computed from snapshots with **transparent, inspectable heuristics/trend models** (not opaque black boxes), each with the evidence behind it ("archive: 0 executions in 180 days"). Every suggestion is advisory — acting on it (archive/merge/split) still routes through governance as a Draft change. AI is **never** predicting *decisions*; it predicts *portfolio-management actions*.

### 14.3 Not in the decision path

Predictive models run offline over snapshots. They never influence a live decision — reaffirming that AI/ML is advisory-only (Phase-0 invariant, ADR-AI-07).

---

## 15. AI Governance

**[NET-NEW]** — the AI plane's own append-only accountability layer.

### 15.1 Every AI interaction is recorded

| Governance concern | Design |
|--------------------|--------|
| **AI Prompt History** | Every prompt (post-redaction) stored with capability, context refs, actor, timestamp |
| **AI Response History** | Every raw response + provider + model + model version |
| **AI Confidence** | Model/heuristic confidence per artifact |
| **AI Validation** | Result of the platform `ValidateRule` + grammar check on generated PCRM |
| **AI Review** | Reviewer identity, decision, comments |
| **AI Approval** | Links to the existing maker-checker approval that published (or rejected) the Draft |
| **AI Audit** | Append-only trail: generate → validate → review → approve/reject |
| **AI Version** | Which AI capability version + provider/model produced the artifact (reproducibility) |
| **AI Feedback** | User rating of usefulness/quality → feeds prompt/model improvement |

### 15.2 Reuses the decision plane's audit discipline

AI audit records are **append-only** like `qdb_edp_ruleaudit` (ADR-13 tier 1 discipline). Prompts/responses are retained for accountability and reproducibility (ADR-AI-03). The approval that publishes an AI Draft is the **same** `qdb_edp_RuleGovernanceAction` maker-checker — so an AI-drafted rule and a hand-authored rule share one audit lineage.

### 15.3 Traceability end to end

For any published rule that originated from AI, an auditor can reconstruct: the source (NL sentence / document passage / Excel cell) → prompt → provider/model/version → generated PCRM → validation result → reviewer → approvals → published version → executions. **Full chain of custody** from intent to decision.

---

## 16. CRM Data Model

**[NET-NEW]** — new entities in the `BusinessRuleEngine` solution, `qdb_edp_ai*` / `qdb_edp_analytics*` namespaces. All attributes **optional + defaulted** (ALM upgrade-safe invariant; triage #9).

### 16.1 AI entities

| Entity | Purpose | Key fields |
|--------|---------|-----------|
| `qdb_edp_aiprompt` | One prompt | capability, prompttext (redacted), contextrefs, provider, model, actor, createdon |
| `qdb_edp_aiconversation` | Multi-turn session grouping prompts | title, actor, capability, status |
| `qdb_edp_airesponse` | One response | responsetext, tokens, latencyms, confidence, prompt (lookup) |
| `qdb_edp_aigeneratedrule` | AI-drafted rule/version | lifecycle(=Draft), pcrmjson, sourcetype(NL/doc/excel), sourcecitation, confidence, ruleversion (lookup once promoted) |
| `qdb_edp_aigeneratedformula` | AI-drafted formula/expression | expression, grammarvalid, confidence |
| `qdb_edp_aisuggestion` | Generic suggestion (metadata/field/relationship/option-set) | type, payload, status(Proposed/Accepted/Dismissed) |
| `qdb_edp_aioptimization` | Optimization/refactor finding | findingtype, target, evidence, status |
| `qdb_edp_aifeedback` | User feedback on an AI artifact | artifact (lookup), rating, comment |

### 16.2 Analytics entities

| Entity | Purpose |
|--------|---------|
| `qdb_edp_analyticssnapshot` | Time-bucketed pre-aggregated metrics (per rule/version/source/day) |
| `qdb_edp_dashboardsnapshot` | Materialized dashboard state for fast render/export |
| `qdb_edp_usagestatistics` | Rolling usage counters (execution count, popularity, cache-hit) |
| `qdb_edp_prediction` | A predictive insight (type, evidence, confidence, suggestedaction, status) |
| `qdb_edp_dependency` | Dependency-graph edge (from, to, dependencytype) — closes Phase-4 gap |

### 16.3 Relationship to existing entities

New entities **reference** existing ones (lookups to `qdb_edp_rule`, `qdb_edp_ruleversion`) but existing entities gain **no required** new columns — at most optional, defaulted advisory fields. The decision plane's schema is untouched in any breaking way (additive invariant).

---

## 17. Search Architecture

**[NET-NEW]** — intelligent, meaning-aware search over the rule portfolio.

### 17.1 Search dimensions

| Search by | Backed by |
|-----------|-----------|
| **Business Meaning** | AI summaries + semantic/embedding index over rule docs & PCRM intent |
| **CRM Entity / Field** | Dependency graph (§11) — "find every rule using `riskRating`" |
| **Formula** | Formula/expression text index |
| **Decision Table** | Table structure/content index |
| **Documentation** | Full-text over generated + authored docs |
| **AI Summary** | Business/technical summaries (§4) |

### 17.2 Two-tier: exact + semantic

- **Exact/structured** search uses Dataverse queries + the dependency graph (deterministic: field/operator/entity lookups).
- **Semantic** search uses an **embedding index** (vectors computed by a pluggable provider, stored in an external vector index or Dataverse-adjacent store) for "find rules that mean X". Semantic search is **advisory discovery**, never a decision input.

### 17.3 Security-trimmed

Search results honor CRM security — a user only finds rules they may see (Business User vs Author vs Read-Only, §19). Semantic indexing respects the same trimming at query time.

---

## 18. Reporting Strategy

**[NET-NEW]**

### 18.1 Channels

| Channel | Use | Source |
|---------|-----|--------|
| **Power BI** | Enterprise dashboards, scheduled refresh over snapshots | `qdb_edp_analyticssnapshot` dataset |
| **Excel** | Export decision tables, matrices, raw stats; round-trip authoring | ClosedXML |
| **PDF** | Governance/audit reports, rule documentation packs | Rendered from docs + snapshots |
| **HTML** | Interactive in-app reports | Designer/portal |
| **Interactive Dashboard** | Model-driven + designer analytics views | Snapshots + drill-to-trace |

### 18.2 Snapshot-fed, not live-query

All reports read **snapshots**, not the transactional execution log directly, so heavy reporting never contends with execution or breaches performance budgets (ADR-AI-02, ADR-AI-09). Power BI connects to the snapshot dataset / optional Data Lake export for millions-of-rows history.

---

## 19. Security Model

**[NET-NEW]** — extends the 6 EDP roles with AI/analytics privileges + a data-protection boundary.

### 19.1 Permission surfaces

| Permission | Governs |
|------------|---------|
| **AI Permissions** | Who may invoke AI generation/explanation (new privilege; Authors+; Business Users get explain-only) |
| **Analytics Permissions** | Who may view analytics dashboards |
| **Dashboard Permissions** | Per-dashboard visibility (operational vs business vs governance) |
| **Prompt Security** | Prompt/response records access-restricted (may contain business context) |
| **Sensitive Data Protection** | Redaction boundary before any provider egress |
| **PII Protection** | PII never leaves the tenant boundary un-redacted |

### 19.2 Role mapping (extends §14 of Phase 5)

| Role | AI/analytics capability |
|------|--------------------------|
| EDP Rule Administrator | All AI + all analytics + governance of AI records |
| EDP Author | Generate/explain/optimize (Drafts), author analytics views |
| EDP Reviewer | Review AI Drafts, view analytics, explain |
| EDP Publisher | Publish approved AI Drafts (via existing maker-checker) |
| EDP Business User | Explain-only + business dashboards |
| EDP Read-Only | View explanations + permitted dashboards |

### 19.3 The PII/sensitive-data egress boundary (ADR-AI-08)

Before **any** content leaves the tenant to a provider, the AI Orchestrator's **redactor**: strips/masks PII and configured sensitive fields, replaces literal values with typed placeholders where possible (the AI reasons about *structure*, not customer data), and records what was redacted. Providers see rule structure and business terms, **not** customer records. On-prem/local-LLM deployments (Ollama) allow a **no-egress** posture for the most sensitive tenants.

### 19.4 Provider trust & data handling

Each provider adapter declares its data-residency/retention posture; tenants choose a provider consistent with their compliance needs (e.g. Azure OpenAI in-tenant vs local LLM). Provider API keys live in the secret store, rotated (ties to the standing secret-rotation action). No prompt is sent to a provider the tenant hasn't approved.

---

## 20. Performance Strategy

**[NET-NEW]** — scale analytics to millions of executions without touching the eval budget.

### 20.1 Levers

| Lever | Design |
|-------|--------|
| **Millions of executions** | Raw logs rolled up incrementally; hot tier bounded by retention (§3.3) |
| **Historical analytics** | Served from pre-aggregated snapshots, not raw scans |
| **Long-term storage** | Cold-tier aggregates / Data Lake export; raw retained only short-term |
| **Incremental snapshots** | Only new/changed buckets recomputed each cycle (watermark-based) |
| **Aggregation** | Pre-aggregate by rule/version/source/day at write-time-adjacent rollup, not query-time |

### 20.2 AI cost & latency control

AI is async/batch (§2.2), cached where deterministic (identical explain request → cached narration keyed by trace+version), rate-limited per user, and token-budgeted. AI latency never affects a decision (it's off the eval path) and never blocks the designer (jobs are async with progress).

### 20.3 The eval budget is sacrosanct

No Phase-6 feature adds work to the decision request path. Analytics rollup, AI jobs, and predictive models all run **out-of-band**. The C-002 P95 ≤ 500 ms decision budget is unaffected by any intelligence feature — by construction.

---

## 21. Future AI Roadmap

Architecture is **prepared** for these; each stays advisory and off the eval path.

| Capability | Horizon | Hook in place | Constraint |
|------------|---------|---------------|------------|
| **Microsoft Copilot** | H2 | AI Orchestrator exposes capabilities as Copilot skills/plugin | Advisory; drafts only |
| **Azure OpenAI** | H1/H2 | `IAiProvider` adapter (in-tenant option) | Redaction boundary applies |
| **OpenAI** | H2 | `IAiProvider` adapter | Egress governance |
| **Local LLM / Ollama** | H2 | `IAiProvider` adapter | **No-egress** posture for sensitive tenants |
| **Anthropic Claude** | H1 (default) | Default `IAiProvider` (platform standard) | Redaction boundary |
| **Google Gemini** | H2 | `IAiProvider` adapter | Egress governance |
| **Pluggable providers / provider abstraction** | H1 | `IAiProvider` + per-tenant provider config (ADR-AI-06) | One interface, many backends |

**Roadmap invariant:** every provider is another adapter behind `IAiProvider`; adding one never changes the decision plane, the governance model, or the redaction boundary. The platform is **never hard-bound** to a single AI vendor.

---

## 22. Architecture Decision Records (ADR-AI series)

These extend, and do not supersede, ADR-01…13, ADR-R/D/EDS/G series. Registered in `adrs/index.md`.

### ADR-AI-01 — AI Cannot Publish Directly; Every AI Artifact is a Draft
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** AI-generated rules, tables, formulas, templates, tests, and docs are created as **Draft** and must pass the existing maker-checker (`qdb_edp_RuleGovernanceAction`) before publishing. There is no AI publish privilege and no auto-apply.
**Why:** Rules drive real financial/operational decisions; a non-deterministic generator must never place logic into production unreviewed. Human accountability is mandatory.
**Consequences:** AI accelerates authoring without owning correctness; every published rule has a human approver of record.

### ADR-AI-02 — Analytics Are Historical, Not In-Path
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** All analytics/BI/predictive computation runs **after** execution over rolled-up snapshots of the execution log; nothing analytics-related sits in the decision request path.
**Why:** The decision plane must stay deterministic and within the C-002 latency budget at millions of executions. Coupling analytics to execution would risk both.
**Consequences:** Metrics have snapshot latency (minutes), which is acceptable; execution performance is guaranteed unaffected; analytics scale independently.

### ADR-AI-03 — Prompts and Responses Are Audited
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Every prompt (post-redaction), response, provider, model, model-version, confidence, and reviewer decision is recorded append-only.
**Why:** Reproducibility, accountability, regulatory defensibility, and the ability to reconstruct why an AI produced a given artifact. Also enables feedback-driven improvement.
**Consequences:** Full chain of custody from intent to published rule; storage governed by retention policy.

### ADR-AI-04 — AI Suggestions Require Human Approval
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Optimizations, refactorings, conflict resolutions, and metadata suggestions are **advisory**. Acting on one produces a Draft that flows through maker-checker. The AI never mutates a published rule or creates schema.
**Why:** Suggestions can be wrong or context-blind; a human must own the change. Schema changes must follow Dataverse ALM.
**Consequences:** AI reduces analysis effort; humans retain decision authority; ALM integrity preserved.

### ADR-AI-05 — Explainability Is Mandatory and Grounded
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Every rule and decision must be explainable in business and technical terms, generated **from** the deterministic PCRM + recorded step-trace (AI narrates; it does not invent).
**Why:** Audit, regulator, and business-owner trust require faithful explanations. A narration grounded in the trace cannot describe logic the rule doesn't contain.
**Consequences:** Explanations are trustworthy and audit-usable; explanation availability does not depend on AI correctness for *what* happened, only for phrasing.

### ADR-AI-06 — Pluggable AI Provider Abstraction
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** All AI calls go through `IAiProvider`; Claude is the default; Azure OpenAI, OpenAI, Gemini, and local LLM (Ollama) are adapters chosen per tenant. No platform code hard-binds a vendor.
**Why:** Vendor independence, compliance flexibility (in-tenant/no-egress options), and future-proofing.
**Consequences:** Adding/replacing a provider is an adapter change; the redaction boundary and governance are provider-agnostic.

### ADR-AI-07 — AI/ML Is Never in the Evaluation Path (reaffirms Phase-0)
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** The runtime never calls an AI/ML model. AI runs out-of-band on a separate plane. A decision is fully deterministic and reproducible regardless of AI availability, latency, or failure.
**Why:** Determinism and reproducibility are non-negotiable for a rules engine; an LLM in the eval path would destroy both.
**Consequences:** The Intelligence Plane is fully removable with zero effect on decisions — the definition of correct additivity.

### ADR-AI-08 — PII/Sensitive-Data Redaction at the Egress Boundary
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Before any content leaves the tenant to a provider, PII and configured sensitive fields are redacted/placeholdered; the AI reasons about structure, not customer data. Local-LLM enables a no-egress posture.
**Why:** Data protection and compliance; providers must never receive customer PII.
**Consequences:** Safe use of external providers; strongest-sensitivity tenants can stay fully in-tenant.

### ADR-AI-09 — Snapshot-Based Analytics Storage Tiering
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Raw execution logs are hot-tier with short retention then rolled up into warm snapshots and cold aggregates; reporting reads snapshots, never raw scans.
**Why:** Scale to millions of executions with bounded transactional storage and fast reporting, without touching execution performance.
**Consequences:** History is preserved compactly; reporting is fast; the hot tier stays bounded.

---

## 23. Risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| AI-R-1 | **Over-trust in AI drafts** — reviewers rubber-stamp AI output | High | Confidence surfacing, mandatory review, counter-examples for conflicts, feedback loop; consider elevated review for high-impact/low-confidence |
| AI-R-2 | **Hallucinated schema/logic** | High | Grounding + platform `ValidateRule` gate (invalid never becomes a Draft); metadata-catalogue constraint |
| AI-R-3 | **PII egress to provider** | High | Redaction boundary (ADR-AI-08); local-LLM no-egress option; per-tenant provider approval |
| AI-R-4 | **Prompt injection via imported documents** | Medium | Treat document text as untrusted data, not instructions; structured extraction; output still validated + reviewed |
| AI-R-5 | **Analytics storage growth** | Medium | Tiering + retention + incremental rollup (ADR-AI-09) |
| AI-R-6 | **Provider outage/latency** | Low | Async jobs; AI off the eval path so decisions unaffected; provider failover via abstraction |
| AI-R-7 | **Explanation drift from actual logic** | Medium | Ground explanations in recorded trace/PCRM, not model memory (ADR-AI-05) |
| AI-R-8 | **Cost overrun (tokens)** | Medium | Token budgets, caching of deterministic narrations, rate limits, batch scheduling |
| AI-R-9 | **Semantic-search leakage across security boundary** | Medium | Security-trimming at query time; index respects CRM visibility |
| AI-R-10 | **Snapshot/rollup correctness** | Medium | Watermark-based incremental rollup with reconciliation checks; snapshots link back to source rows |

## 24. Recommendations

1. **Ship explanation + analytics before generation.** Explanation (grounded, read-only) and analytics (historical) are the lowest-risk, highest-trust wins and require no publish path — deliver them first to build reviewer trust in the AI plane.
2. **Default to Claude, design for no-egress.** Standardize on Claude as default but validate the local-LLM adapter early so the most sensitive tenants are unblocked.
3. **Make the validator the gate, everywhere.** Route 100% of AI-generated PCRM through the platform `ValidateRule`; never let model confidence substitute for the platform's own validation.
4. **Close the Phase-4 dependency-graph gap here.** `qdb_edp_dependency` powers optimization, conflict, impact analysis, and search — build it first among the analysis features.
5. **Instrument the feedback loop from day one.** `qdb_edp_aifeedback` on every artifact turns real reviewer behavior into prompt/model improvement and into AI-R-1 monitoring.
6. **Keep the two planes physically separate.** Host the AI orchestrator as `EDP.AiService`/gateway module, never in the sandbox — so the additive/removable property is structural, not just conventional.

## 25. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | No AI capability can publish a rule; every AI artifact is created as Draft and only the existing maker-checker can publish it. |
| AC-2 | Deleting the entire Intelligence Plane leaves all authoring, validation, publishing, and execution working unchanged. |
| AC-3 | The runtime makes zero AI/network calls; a decision is identical with the AI service up, down, or removed. |
| AC-4 | 100% of AI-generated PCRM passes the platform `ValidateRule` + EDP-H1 grammar before a Draft is created; invalid output returns as a suggestion with diagnostics, never a Draft. |
| AC-5 | Every prompt/response/provider/model/confidence/review is recorded append-only and reconstructs the full chain from intent to published version. |
| AC-6 | Explanations are generated from recorded trace/PCRM and match the actual execution for a sampled set of decisions. |
| AC-7 | No PII reaches any provider — verified by redaction tests; a local-LLM tenant can operate with zero external egress. |
| AC-8 | Analytics add zero measured latency to the decision path; dashboards render from snapshots; execution P95 remains within C-002. |
| AC-9 | Conflict/duplicate/dead-rule findings include a concrete, verifiable counter-example or evidence. |
| AC-10 | Provider can be switched (Claude → Azure OpenAI → local) via configuration with no change to governance, redaction, or the decision plane. |
| AC-11 | The natural-language example ("Loan amount > 500,000 and Risk is High → CEO") produces a validated PCRM Draft + docs + test cases in one flow. |
| AC-12 | New AI/analytics entities add no required columns to existing entities (ALM upgrade-safe). |

---

## Appendix A — AI Capability → Governance → Output Matrix

| Capability family | Output | Publishes? | Gate |
|-------------------|--------|:----------:|------|
| Generate (rule/table/formula/template/test/doc/JSON/PCRM) | Draft | ✖ | Validate → maker-checker |
| Explain (rule/decision/formula/variables/deps/trace) | Read-only text | ✖ | None (grounded in trace/PCRM) |
| Summarize (business/technical/API docs) | Read-only text | ✖ | None |
| Analyze (duplicate/conflict/dead/optimize/refactor) | Advisory finding | ✖ | Human applies → Draft |
| Suggest (metadata/fields/relationships/option-sets) | Proposal | ✖ | Admin creates via ALM |
| Predict (archive/merge/split/hotspot/trend) | Advisory insight | ✖ | Human acts → Draft |

Nothing in the matrix publishes. Every write path terminates in human approval.

## Appendix B — Analytics Metric → Source Mapping

| Metric group | Source (all historical) | Store |
|--------------|-------------------------|-------|
| Usage / count / popularity / peak | `qdb_edp_ruleexecutionlog` rollup | `qdb_edp_usagestatistics` |
| Latency / avg / P95 / SLA | `durationms` + timestamps | `qdb_edp_analyticssnapshot` |
| Failure / retry | `outcome` + gateway metrics | snapshot |
| Cache hit ratio | runtime-reported cache metric | snapshot |
| Decision distribution / BI (approval/routing/eligibility/risk) | recorded outputs | snapshot |
| Complexity | PCRM static score (per version) | on version + snapshot |
| Top entities / fields / operators | dependency graph + PCRM scan | `qdb_edp_dependency` + snapshot |
| Predictive trends | snapshot time series | `qdb_edp_prediction` |

---

## Document Control

**Supersedes:** nothing (net-new, additive phase).
**Depends on:** phase-0 (AI-advisory invariant), phase-3/4 (runtime, governance, trace), phase-5 (EDS `Get*` + exec log).
**Changes to previous phases:** **NONE.** The Intelligence Plane is additive and removable.
**Opens:** build backlog — AI orchestrator + `IAiProvider` adapters, AI/analytics entities, generation/explanation/analysis capabilities, snapshot rollup pipeline, dashboards, search index.
**Next in pipeline:** code review of this design → QA (test strategy incl. AC-1..AC-12) → audit (Phase 6 gate: AI governance, PII egress, append-only AI audit) → CEO final.
**Non-negotiable on build:** AI never publishes, never in eval path; analytics never in eval path; every AI write terminates in human approval. Any PR violating these is rejected by definition.
