# Enterprise Decision Platform — Phase 3 Detailed Architecture (Platform Foundation)

**Engagement ID:** EDP-BRE-001
**Phase:** 3 — Detailed Architecture (Platform Foundation)
**Module:** Business Rules Engine (BRE)
**Parent Product:** Maqsad Low-Code Platform
**Prepared by:** Maqsad AI — Solution Architect
**Date:** 2026-07-03
**Version:** 1.0
**Status:** AUTHORITATIVE — Phase 4 Build Gate

---

## Authority Clause

This document conforms to the Phase 0 Architecture Blueprint (`phase-0-architecture.md`), the Phase 1 Business Requirements Document (`phase-1-ba.md`), the Phase 1 CEO Decision (`phase-1-ceo.md`), and the Phase 2 Dependency Research (`dependencies.md`). All decisions in those documents are FINAL and are baked into this architecture without re-opening.

Changes to any decision in this document require a formally approved Architecture Decision Record (ADR) that explicitly names and supersedes the relevant section. Silent deviation is prohibited.

This document is ARCHITECTURE ONLY. No C# code, no React components, no runtime classes, no decision-table implementations, no DB DDL, no API implementation code, and no plugin logic are produced here. Phase 4 build begins from this document.

---

## Table of Contents

1. Executive Summary
2. Platform Foundation
3. Domain Model
4. CRM Solution Architecture
5. CRM Data Model Strategy
6. Platform Canonical Rule Model
7. Metadata Architecture
8. Searchable Metadata Experience
9. JSON Strategy
10. Security Architecture
11. Versioning Strategy
12. Configuration Strategy
13. Caching Strategy
14. React Foundation
15. GoRules Integration Strategy
16. Extensibility Strategy
17. Performance Strategy
18. Architecture Decision Records
19. Risks
20. Recommendations

Appendix A — Cloud / On-Premises Feature Matrix (C-001)
Appendix B — EDP Horizon 1 vs North52 Parity Checklist (C-004)
Appendix C — ADR Index

---

## 1. Executive Summary

The Enterprise Decision Platform Business Rules Engine is architected as a fully CRM-native, zero-external-infrastructure decisioning layer deployable as a single standard Dynamics CRM Solution. The platform is organised around two architectural spines: a Single Native C# Runtime that is the sole evaluator for all decision requests regardless of entry point, and a Metadata Spine that binds all rule definitions to stable CRM/Dataverse metadata identifiers so business users author in display-language while the platform resolves schema names internally.

The platform introduces a vendor-neutral Platform Canonical Rule Model (PCRM) as the internal runtime contract — GoRules JDM JSON is the authoring interchange format only, translated to PCRM at save time, so the designer and runtime are independently evolvable. Every significant decision in this document resolves an open item from Phase 2 or a CEO-imposed condition from Phase 1: the designer host accepts degraded WASM mode in a plain web resource (P2-OI-001, ADR-10); NCalc is selected as the expression evaluator (P2-OI-002, ADR-11); production version-pinning requires recorded governance justification (C-006, ADR-09).

This document is the complete technical contract for Phase 4. Developers begin implementation without making further architecture decisions.

---

## 2. Platform Foundation

The platform foundation is the set of cross-cutting architectural commitments that govern every component. Each pillar is stated as a design constraint, not a goal.

**Metadata-Driven.** Every rule definition is authored against CRM/Dataverse metadata bindings — stable logical identifiers that survive display-name changes. No author ever enters a schema name, field logical name, option-set value, or GUID manually. The Metadata Service is the single point of truth for entity, field, relationship, option-set, and lookup discovery.

**Configuration-Driven.** No business threshold, rate, or behaviour is hardcoded in any shipped artefact. Platform behaviour is driven by the Rule Configuration and Environment Configuration domain objects. Feature toggles are managed through the Feature Flag domain object. All solution-level defaults are environment variables within the CRM Solution.

**Low-Code.** The designer surface is the GoRules JDM Editor hosted in a React web resource. Business Analysts author rules using display-name selectors, point-and-click table editing, and graphical expression builders. The platform enforces this boundary: the designer does not expose the underlying JSON or schema to authors under any circumstances.

**CRM-Native.** The entire platform — authoring surface, runtime, metadata service, rule repository, governance artefacts, execution traces — lives inside the customer's CRM/Dataverse environment. No component requires an external host, container, or service for core function.

**Enterprise-Grade.** Versioning, approval gates, simulation requirements, segregation of duties, append-only audit records, and execution traces are first-class platform capabilities enforced by the domain model, not optional configuration.

**Versioned.** Every rule definition is immutably versioned. Published versions are frozen. Version resolution is explicit and auditable. The version of every executed decision is recorded in the trace.

**Reusable.** Rules, templates, functions, and sub-decisions are composable assets, addressable by stable identifiers across environments.

**Secure.** Authoring and execution inherit the host platform's identity model (Entra ID / AD/ADFS) and honour CRM security roles, business-unit scoping, field-level security, and the platform's own audit infrastructure. No parallel identity model exists.

**AI-Ready.** Domain objects, metadata bindings, version history, and execution traces are structured to serve as ground truth for AI-assisted authoring, explanation, and optimisation in Horizon 3 — without redesigning the data model.

**Cloud and On-Premises Compatible.** The Single Runtime, the Domain Model, and the Solution Structure are identical on Dynamics CRM On-Premises 9.x and Dynamics 365 Online / Dataverse. Entry adapters and metadata API calls are the only platform-specific variations.

**Performant.** The platform is designed to evaluate a Standard Decision Profile (defined in Section 17) at P95 ≤ 500ms and P99 ≤ 2,000ms inside the CRM plugin sandbox. Complexity bounds are enforced by the designer at authoring time.

**Extensible.** Custom operators, custom functions, custom entry adapters, and future designer extensions register against defined extension points. No extension modifies the core runtime or the canonical rule model.

**Maintainable.** A single runtime to maintain, a versioned canonical rule model as the designer-runtime contract, and platform-standard solution ALM ensure the long-term TCO is bounded.

**Future-Proof.** The Platform Canonical Rule Model, the Extensibility Strategy, and the AI-readiness posture ensure that the platform can accommodate new authoring surfaces, new execution channels, and new intelligence capabilities without redesigning the foundation.

---

## 3. Domain Model

The domain model defines every major domain object, its identity, and its responsibility. Objects are grouped by domain area. Persistence strategy is decided in Section 5.

Domain objects that exist only as runtime-transient (in-memory, not persisted) are labelled **[RUNTIME]**. Objects that are Horizon 2 or beyond design intent are labelled with their horizon.

### 3.1 Rule Definition Domain

**Rule**
The top-level rule asset. Represents a named, categorised decision owned by a business unit. Holds identity, display metadata, categorisation, ownership, and lifecycle state at the rule level (not the version level). Owns zero or more Rule Versions.

**Rule Version**
An immutable, numbered snapshot of a rule's decision logic, expressed as a Platform Canonical Rule Model JSON document. Carries the authoring identity, creation timestamp, version number, lifecycle state, PCRM schema version reference, and complexity score. The Rule Version is the unit of execution, governance, and audit. A new version is the only permitted change mechanism for a published rule.

**Rule Category**
A taxonomy node for classifying rules by business domain (e.g., "Credit Risk", "Pricing", "Eligibility"). Supports hierarchical categorisation. Rules belong to exactly one category.

**Rule Folder**
A navigational container for organising rules in the designer interface. Folders are display-only groupings — they do not affect execution semantics. Rules belong to at most one folder.

**Rule Package**
A named, exportable bundle of one or more rule versions, their dependencies, and their metadata, packaged for transport between environments or for marketplace distribution. A Rule Package is an exportable artefact, not a runtime concept.

**Rule Template**
A pre-authored, parameterised rule definition that authors use as a starting point. Templates are published by administrators or ISVs and instantiated to create new Draft Rule Versions. Templates are versioned independently of the rules they instantiate.

**Rule Tag**
A free-form label applied to a Rule for search, filtering, and grouping in the designer. Many-to-many with Rule.

**Rule Documentation**
Structured human-readable documentation attached to a Rule Version — purpose, business context, authoring notes, approval rationale. AI-generated documentation (Horizon 3) is stored here. Append-only: new documentation versions do not overwrite prior ones.

**Rule Dependency**
A directed, versioned reference from one Rule Version to another Rule Version that it invokes as a sub-decision. Used for impact analysis (which rules are affected if this rule changes?), change notification, and dependency graph visualisation. Horizon 2 for full dependency tracking; Horizon 1 captures direct references only.

### 3.2 Rule Logic Domain

The objects in this group describe the internal structure of a Rule Version's logic. They are NOT separate persisted records; they are structural concepts within the Platform Canonical Rule Model JSON document (see Section 6). They are named here for domain clarity.

**Decision Table**
A two-dimensional decision structure: a matrix of condition columns and output columns, evaluated row-by-row according to a hit policy (First, All, Priority, Collect). A Rule Version whose authoring style is "Decision Table" contains exactly one Decision Table as its logic root.

**Decision Table Row**
One row in a Decision Table, representing a policy case: a set of condition values and the corresponding output values to produce if that case matches.

**Decision Table Column**
A typed column definition in a Decision Table, referencing a metadata binding (input) or an output alias (output), with a data type, display label, and permitted operator set.

**Rule Expression**
A structured condition within a Decision Table cell or an expression tree node: a triple of (input binding, operator, value or value reference). Rule Expressions are not string expressions — they are structured JSON objects. The operator comes from the registered operator library.

**Formula**
A calculated-output expression associated with a Formula node or a Decision Table output cell. A Formula has an expression string (evaluated by the NCalc expression engine), a set of variable bindings mapping expression variable names to input metadata bindings, and an output data type. The expression language for Horizon 1 is NCalc (see ADR-11).

**Rule Variable**
A named, typed intermediate value computed during rule evaluation and available to subsequent nodes or conditions within the same rule. Rule Variables are declared within the PCRM JSON and bound to Formula expressions or Decision Table outputs.

**Rule Function**
A reusable, named formula function registered in the platform's function library. Callable by name from Formula expressions and Decision Table output cells. Each Rule Function has a name, description, parameter list (Rule Function Parameters), return type, and implementation strategy (built-in NCalc function, custom C# extension function, or composition of other functions).

**Rule Function Parameter**
A typed, named parameter definition belonging to a Rule Function. Carries the parameter name, data type, whether it is required, and a default value expression.

### 3.3 Metadata Binding Domain

**Rule Binding**
A stable, versioned reference from a rule input or output to a CRM/Dataverse metadata element. A Rule Binding stores: the entity logical name, the attribute logical name, a traversal path for relationship navigation (e.g., account → primarycontactid → emailaddress1), the data type resolved at binding time, and the display label captured at binding time for reference. The display label is informational only; the logical names are the execution contract. Rule Bindings are stored as structured JSON within the Rule Version PCRM document.

**Metadata Entity Definition**
A cached record of a CRM/Dataverse entity's metadata: logical name, display name, plural name, entity type, ownership type, and summary of its attribute definitions. Stored as a CRM entity with a JSON detail blob. Used by the Metadata Service to serve designer requests without live API calls on every keystroke.

**Metadata Attribute Definition**
A cached record of a single CRM/Dataverse attribute's metadata: logical name, display name, data type, required level, format, maximum length, min/max values, and (for lookups) the target entity logical name. Stored as a child of Metadata Entity Definition.

**Metadata Option Set Definition**
A cached record of a CRM/Dataverse option set (global or local), including all option labels and values in all installed languages. Critical for surfacing option labels in business terms rather than numeric values.

### 3.4 Lifecycle and Governance Domain

**Rule Approval**
A governance record for one lifecycle-transition event: who requested the transition, who approved or rejected it, when, and the stated justification. Append-only. One rule version may accumulate multiple Rule Approvals across its lifecycle (e.g., submitted → rejected → revised draft → submitted → approved → published).

**Rule Audit**
An append-only record of every significant event in the platform: rule creation, version creation, state transitions, security-role assignments, configuration changes, import/export operations, and platform administrative actions. Carries actor identity, timestamp, event type, affected record reference, and a change summary. Rule Audit records are never updated or deleted.

**Rule Notification** (Horizon 2 design intent)
Configuration for which users or teams receive notifications on specific rule lifecycle events (draft submitted for approval, version published, version retired). One Rule Notification record per user-per-event-type-per-rule.

**Rule Version Diff** (Horizon 2 design intent)
A computed or stored comparison between two Rule Versions of the same Rule, capturing which conditions, outputs, and bindings changed. Enables reviewers to see exactly what changed without reading raw JSON.

### 3.5 Testing and Simulation Domain

**Rule Test**
A named test suite attached to a Rule. Contains one or more Rule Test Cases. A Rule Test records whether the last run passed or failed and when it was last executed.

**Rule Test Case**
An individual test scenario within a Rule Test: a named set of input values (matching the rule's input bindings) and a set of expected output values. Pass/fail is determined by comparing actual outputs from the runtime against expected outputs.

**Rule Simulation Run**
A record of a single simulation execution against a Rule Version (typically a Draft). Captures the input payload, the output received, the execution timestamp, the rule version used, and whether it was a designer-triggered simulation or a test-case execution. Simulation Runs are written to a separate, shorter-retention store from production execution traces.

### 3.6 Execution and Observability Domain

**Rule Execution Log**
An append-only record of a single production decision evaluation. Captures: the rule identifier, the rule version resolved, the entry adapter used (Plugin / Custom Action / Custom API), the invoking identity, the execution timestamp (start and end), the decision output (subject to field-level security), the pin status and justification (if pinned), and the trace correlation identifier. Rule Execution Log records are the primary audit artefact for regulatory queries.

**Execution Trace Detail** (Horizon 2 design intent)
A child record of Rule Execution Log capturing the node-by-node evaluation path through the rule's logic graph — which conditions evaluated, which rows matched, which sub-decisions were invoked. Supports the Horizon 2 visual debugger.

**Rule Analytics**
Aggregated, time-windowed statistical records computed from Rule Execution Logs: execution count, error count, average latency, P95 latency, most-frequent outputs. Rule Analytics records are materialised summaries — they do not replace the underlying Rule Execution Log records.

**Rule Complexity Profile**
A computed record attached to a Rule Version, capturing the complexity score for that version: condition count, maximum nesting depth, decision-chain depth, output count, table row count, and whether the version is within or beyond the Standard Decision Profile ceiling. Written at save time. Used by the designer to display the complexity warning indicator.

### 3.7 Configuration and Feature Domain

**Rule Configuration**
A named, typed platform configuration value stored as a CRM entity record. Covers: default version resolution policy, trace retention period, complexity ceiling parameters, simulation retention period, metadata cache TTL, and other platform-wide settings. Loaded by the runtime and designer at startup.

**Environment Configuration**
Captures per-environment operational settings not managed by Rule Configuration: whether the current environment is a production environment (controls version-pinning justification enforcement), environment tier (Dev / Test / Staging / Production), and environment-specific overrides of platform defaults. Managed via CRM environment variables.

**Feature Flag**
A named on/off switch for in-development or phased platform capabilities. Feature Flags are CRM entity records, not hardcoded conditionals. The runtime and designer read Feature Flag state at startup.

### 3.8 AI and Marketplace Domain (Extension Points)

**AI Rule Request** (Horizon 3)
A record of a request submitted to an AI authoring service: the natural-language policy description, the entity context, the output schema, the AI provider used, and the request timestamp. Stored in CRM for audit.

**AI Rule Suggestion** (Horizon 3)
A record of an AI-generated rule definition proposed in response to an AI Rule Request. Carries the proposed PCRM JSON, the confidence indicator, the AI model version, and the author's accept/reject decision. An accepted AI Rule Suggestion creates a new Draft Rule Version via the standard authoring path.

**ISV Pack** (Horizon 3 extension point)
A signed, versioned bundle of Rule Templates, Rule Functions, and Rule Categories distributed by a Maqsad-verified ISV. ISV Packs are installed via the import mechanism. Each ISV Pack record carries the publisher identity, the signing certificate reference, the pack version, and the import timestamp. The extension point is designed now; the commercial mechanism is Horizon 3.

**Rule Import Record**
A record of a JSON import operation: the source (manual upload, ISV Pack, environment promotion), the import timestamp, the acting identity, the number of rules imported, the number of validation failures, and the import status. Append-only.

### 3.9 Runtime-Transient Objects

The following objects exist only in memory during execution and are never persisted directly. They are named here to define the execution contract that Phase 4 implements.

**Rule Execution Context [RUNTIME]**
The normalised, in-memory representation of a decision request as it enters the Rule Resolver. Contains: rule identifier, optional pinned version, caller identity, input payload (typed key-value map), execution environment flag, and pin justification (if pinned).

**Rule Evaluation Result [RUNTIME]**
The structured result returned by the native C# evaluator: decision outputs (typed key-value map), the resolved rule version, the execution duration, a trace correlation identifier, and either a success indicator or a typed error descriptor.

**Rule Entry Adapter Configuration [RUNTIME]**
The adapter-specific settings loaded at runtime by each entry-point adapter: the adapter type (Plugin / Custom Action / Custom API / Lightweight API), the default version resolution policy for this adapter, and whether production-pinning justification is required.

---

**Total domain objects defined: 43** (27 from the seed list; 16 additions: Rule Tag, Rule Binding, Metadata Entity Definition, Metadata Attribute Definition, Metadata Option Set Definition, Rule Function Parameter, Rule Notification, Rule Version Diff, Rule Test Case, Rule Simulation Run, Execution Trace Detail, Rule Analytics, Rule Complexity Profile, ISV Pack, Rule Import Record, Rule Entry Adapter Configuration, Rule Execution Context, Rule Evaluation Result — some additional objects above the stated 27 after careful review).

---

## 4. CRM Solution Architecture

### 4.1 Publisher

| Property | Value |
|----------|-------|
| Publisher display name | Maqsad Low-Code Platform |
| Publisher unique name | `maqsad` |
| Publisher prefix | `mql` |
| Option set value prefix | `89100` (reserved range) |

All entities, attributes, web resources, plugins, and custom APIs carry the `mql_` prefix. No component is created in the Default Solution or Active layer.

### 4.2 Solution Structure

Two solutions are defined:

**MaqsadEDPBase (unmanaged — development only)**
Contains all platform components in the development environment. Developers work against this solution. Never imported as unmanaged into Test, Staging, or Production.

**MaqsadEDPManaged (managed — all customer environments)**
Exported from MaqsadEDPBase as a managed solution for customer deployment. Managed solutions prevent direct schema modification in customer environments and allow upgrade via solution layering.

The solution contains exactly:
- All `mql_` prefixed custom entities and their attributes
- All `mql_` prefixed web resources (each declared as an individual RootComponent in solution.xml — no folder wildcards per CRM packaging rule)
- Plugin assemblies (ILMerge'd to single DLL where dependencies require it)
- Custom Actions and Custom APIs
- Security roles
- Site maps and model-driven app customisations
- Environment variable definitions (values travel separately, not in the solution)

### 4.3 Naming Standards

| Artefact type | Convention | Example |
|--------------|------------|---------|
| Entity logical name | `mql_<noun>` | `mql_rule`, `mql_ruleversion` |
| Entity display name | TitleCase | `Rule`, `Rule Version` |
| Attribute logical name | `mql_<attribute>` | `mql_name`, `mql_lifecyclestate` |
| Web resource | `mql_/edp/<area>/<filename>` | `mql_/edp/designer/index.html` |
| Plugin assembly | `Maqsad.EDP.<Layer>` | `Maqsad.EDP.Runtime`, `Maqsad.EDP.Metadata` |
| Plugin step | `<entity>:<message>:<stage>:<mode>` (logical form) | `mql_ruleversion:Create:PostOperation:Async` |
| Custom Action | `mql_<action>` | `mql_ExecuteDecision`, `mql_PublishRuleVersion` |
| Custom API | `mql_<api>` | `mql_EvaluateDecision` |
| Security role | `EDP <Role Name>` | `EDP Rule Author`, `EDP Rule Approver` |
| Environment variable | `mql_edp_<setting>` | `mql_edp_defaulttraceretentiondays` |

### 4.4 Managed vs. Unmanaged Strategy

Production and all customer-facing environments receive only the managed solution. Managed solutions protect the publisher's intellectual property and ensure upgrades are controlled. Developers work in unmanaged in the development environment only.

The managed solution is imported with `overwriteUnmanagedCustomizations=false` on initial installation and `overwriteUnmanagedCustomizations=true` only on explicit upgrade — never silently.

### 4.5 Environment Variables

All configurable platform defaults are stored as CRM environment variable definitions (schema) in the solution. Environment variable values are set per environment after solution import. The platform reads environment variable current values at startup; default values apply if a current value is not set.

Environment variables defined:
- `mql_edp_IsProductionEnvironment` (Boolean) — controls version-pinning justification enforcement
- `mql_edp_DefaultTraceRetentionDays` (Integer, default 90)
- `mql_edp_MetadataCacheTtlMinutes` (Integer, default 60)
- `mql_edp_GovernanceAuditRetentionYears` (Integer, default 7, non-configurable floor)
- `mql_edp_SimulationTraceRetentionDays` (Integer, default 30)
- `mql_edp_ComplexityWarningThreshold` (Integer, default 80, as a percentage of ceiling)

### 4.6 Dependency Strategy

NuGet dependencies required by the plugin assemblies (NCalc, NJsonSchema) are resolved at build time using ILMerge or assembly merge strategy into the single deployable plugin DLL. No NuGet packages are expected to exist in the CRM environment; all dependencies must be contained within the assembly artefact. This is a hard requirement for plugin sandbox compliance.

### 4.7 Upgrade Strategy

Solution upgrades follow the standard Dynamics Solution Upgrade path:
1. New version exported from development as managed.
2. Imported to Test environment as an upgrade (not overwrite).
3. Post-import validation: all entities present, all plugin steps registered, all web resources updated.
4. Promoted to Staging → Production via the same import mechanism.
5. Rule content (definitions, versions, traces) travels via CRM configuration data export/import tools (separate from the solution artefact).
6. Breaking schema changes (removing an attribute, changing an entity ownership type) are explicitly disallowed — schema is append-only for managed attributes in existing entities.

---

## 5. CRM Data Model Strategy

For each domain object, the persistence strategy is decided with rationale. Four strategies are used:

- **CRM Entity**: a dedicated custom entity with its own records, security model, and views.
- **JSON in Entity**: data stored as a JSON text attribute on a parent CRM entity.
- **Environment Variable**: platform configuration value stored as a CRM environment variable.
- **Runtime Only**: in-memory; never persisted directly.

| Domain Object | Strategy | Rationale |
|---------------|----------|-----------|
| Rule | CRM Entity | Top-level asset requiring security model, views, search, ownership, and audit stamps. |
| Rule Version | CRM Entity | Independent security, lifecycle state, and query requirements. The canonical rule model JSON is a text attribute on this entity. |
| Rule Category | CRM Entity | Administrative entity; queryable; must be selectable in designer dropdowns. |
| Rule Folder | CRM Entity | Display-only navigation; small dataset; CRM entity enables security scoping per folder. |
| Rule Package | CRM Entity | Export artefact requiring its own lifecycle, query, and security. Package content stored as JSON attribute. |
| Rule Template | CRM Entity | Independently queryable and administrable; template PCRM JSON as text attribute. |
| Rule Tag | CRM Entity (N:N with Rule) | Enables efficient tag-based search and filtering. |
| Rule Documentation | CRM Entity | Append-only versioned text; each version is a separate record for audit. |
| Rule Dependency | CRM Entity | Directional reference requiring its own records for impact analysis queries. |
| Decision Table | JSON in Rule Version | Part of the PCRM document; not independently queried; no separate security required. |
| Decision Table Row | JSON in Rule Version | Same rationale as Decision Table. |
| Decision Table Column | JSON in Rule Version | Same rationale as Decision Table. |
| Rule Expression | JSON in Rule Version | Structural component of the PCRM; not independently queryable. |
| Formula | JSON in Rule Version | Expression string and variable bindings are part of the PCRM document. |
| Rule Variable | JSON in Rule Version | Intermediate variables are PCRM-internal; not independently persisted. |
| Rule Function | CRM Entity | Independently administrable, queryable, and extensible. Function body and parameters stored as JSON attribute on this entity. |
| Rule Function Parameter | JSON in Rule Function | Parameters are not independently queried; stored as JSON array on Rule Function entity. |
| Rule Binding | JSON in Rule Version | Bindings are part of the PCRM document; not independently persisted. Querying "which rules use field X" is done via the Rule Dependency entity (populated at save time). |
| Metadata Entity Definition | CRM Entity | Cached metadata must be queryable by logical name and searched by display name. |
| Metadata Attribute Definition | CRM Entity (child of Metadata Entity Definition) | Queried by parent entity and attribute type. |
| Metadata Option Set Definition | CRM Entity | Queried by option set name; values stored as JSON array attribute. |
| Rule Approval | CRM Entity | Governance record requiring individual audit, security, and query capabilities. |
| Rule Audit | CRM Entity | Append-only; independently queryable by event type, actor, date. |
| Rule Notification | CRM Entity (Horizon 2) | Per-user, per-event configuration; independently administrable. |
| Rule Version Diff | CRM Entity (Horizon 2) | Query-driven comparison result; may be precomputed or on-demand. |
| Rule Test | CRM Entity | Test suite entity with its own lifecycle; test cases stored as JSON attribute. |
| Rule Test Case | JSON in Rule Test | Test cases are not independently queried; stored as JSON array on Rule Test entity. |
| Rule Simulation Run | CRM Entity | Shorter-retention, independently queryable simulation record. |
| Rule Execution Log | CRM Entity | Append-only; independently queryable; primary audit artefact. Output payload stored as JSON attribute. |
| Execution Trace Detail | JSON in Rule Execution Log (Horizon 2) | Node-level trace stored as JSON attribute on the log record; not independently queried. |
| Rule Analytics | CRM Entity | Pre-aggregated; independently queryable for dashboards. |
| Rule Complexity Profile | JSON in Rule Version | Computed at save time; stored as JSON attribute on Rule Version entity. |
| Rule Configuration | CRM Entity | Platform configuration records; small dataset; queried by setting key. |
| Environment Configuration | Environment Variable | Per-environment overrides managed via CRM environment variables; read-only at runtime. |
| Feature Flag | CRM Entity | Named on/off flags; administered by EDP Rule Administrator role. |
| AI Rule Request | CRM Entity (Horizon 3) | Audit requirement; independently queryable. |
| AI Rule Suggestion | CRM Entity (Horizon 3) | Accept/reject decisions require their own governance records. |
| ISV Pack | CRM Entity (Horizon 3) | Independently administrable; signing metadata stored as JSON attribute. |
| Rule Import Record | CRM Entity | Append-only import history; independently queryable. |
| Rule Entry Adapter Configuration | CRM Entity | One record per adapter type; administrable by EDP Rule Administrator. |
| Rule Execution Context | Runtime Only | In-memory request object; never persisted directly. |
| Rule Evaluation Result | Runtime Only | In-memory response object; its contents are written to Rule Execution Log. |

---

## 6. Platform Canonical Rule Model

This section is the most critical architectural specification in this document. It defines the proprietary, vendor-neutral internal contract between the designer, the storage layer, and the future native C# runtime.

### 6.1 Purpose and Motivation

The GoRules JDM Editor emits JSON conforming to the GoRules JDM format. This format is the editor's output — it is not the EDP's internal storage and execution model. Storing and executing raw JDM JSON would create an irreversible coupling to the GoRules vendor and schema evolution. Instead, the platform translates JDM JSON into the Platform Canonical Rule Model (PCRM) at save time.

The PCRM serves as the stable contract between:
- The Rule Translator (reads JDM JSON, writes PCRM JSON)
- The Rule Repository (stores PCRM JSON as the Rule Version payload)
- The future Native C# Runtime (reads PCRM JSON, evaluates deterministically)
- Future alternative designers (emit their own formats, translated to PCRM)
- Future import sources (DMN, Excel, Microsoft RulesEngine, AI-generated)

### 6.2 Translation Pipeline

```
JDM Editor (browser)
    |
    | [GoRules JDM JSON emitted on Save]
    v
Rule Translator (web resource layer, runs in browser before CRM save)
    |
    | Validates JDM JSON against pinned JDM schema
    | Maps JDM nodes → PCRM logic blocks
    | Resolves metadata bindings (display names → logical identifiers)
    | Computes Rule Complexity Profile
    | Assigns PCRM schema version
    |
    v
PCRM JSON (validated against PCRM schema via NJsonSchema)
    |
    | [Saved to mql_ruleversion.mql_canonicaldefinition text attribute]
    v
Rule Version (CRM entity record)
    |
    | [Loaded by Native C# Runtime at evaluation time]
    v
Native C# Runtime (Horizon 1 implementation — evaluates PCRM JSON)
```

The JDM JSON is also stored alongside the PCRM JSON (as `mql_ruleversion.mql_jdmsource`) to support round-tripping back to the designer for editing. The JDM source is the designer's editable form; the PCRM is the runtime's authoritative form.

### 6.3 Canonical Rule Model — Conceptual JSON Shape

The PCRM document is a self-describing, versioned JSON structure. The schema is defined formally (as a JSON Schema document owned by the platform) and validated by NJsonSchema at the save boundary. The following describes the top-level structure conceptually — this is not DDL or schema code.

```
{
  "pcrmSchemaVersion": "1.0.0",
  "ruleId":            "<stable rule identifier>",
  "ruleVersionId":     "<stable version identifier>",
  "authoringStyle":    "decisionTable" | "expressionTree" | "formula" | "composite",
  "metadata": {
    "name":            "<rule display name>",
    "description":     "<rule description>",
    "tags":            ["<tag>", ...],
    "complexityScore": <integer 0-100>
  },
  "inputs": [
    {
      "alias":    "<expression-friendly name for this input>",
      "binding": {
        "entityLogicalName":    "<mql_... or system entity>",
        "attributeLogicalName": "<field logical name>",
        "traversalPath":        ["<relationship logical name>", ...],
        "dataType":             "<crm data type: string|integer|decimal|boolean|datetime|picklist|lookup>",
        "displayLabel":         "<captured display name at binding time>"
      }
    }
  ],
  "outputs": [
    {
      "alias":    "<output name>",
      "dataType": "<crm data type>"
    }
  ],
  "logic": {
    "type": "decisionTable" | "expressionTree" | "formula" | "composite",
    "decisionTable": {
      "hitPolicy":   "first" | "all" | "priority" | "collect",
      "aggregation": "sum" | "min" | "max" | "count" | null,
      "columns": [
        {
          "columnId":    "<stable id>",
          "role":        "condition" | "output",
          "inputAlias":  "<matches inputs[].alias, for condition columns>",
          "outputAlias": "<matches outputs[].alias, for output columns>",
          "dataType":    "<crm data type>",
          "label":       "<column header>"
        }
      ],
      "rows": [
        {
          "rowId":   "<stable id>",
          "cells": [
            {
              "columnId":  "<matches column>",
              "condition": {
                "operator": "<registered operator name>",
                "value":    "<literal or variable reference>"
              },
              "output": "<literal or formula reference>"
            }
          ]
        }
      ]
    },
    "expressionTree": {
      "root": {
        "type":      "if" | "switch" | "leaf",
        "condition": { "<Rule Expression structure>" },
        "then":      { "<nested node>" },
        "else":      { "<nested node>" },
        "outputs":   { "<alias>": "<literal or formula reference>" }
      }
    },
    "formula": {
      "expression":      "<NCalc expression string>",
      "variables":       { "<varName>": "<matches inputs[].alias>" },
      "outputAlias":     "<matches outputs[].alias>"
    }
  },
  "functions": [
    {
      "functionId":  "<matches mql_rulefunction record>",
      "alias":       "<callable name in formulas>"
    }
  ],
  "variables": [
    {
      "variableId": "<stable id>",
      "alias":      "<variable name>",
      "dataType":   "<crm data type>",
      "source":     { "<formula or decision table output reference>" }
    }
  ],
  "extensions": {}
}
```

The `extensions` block is reserved for future capabilities and third-party additions. It must not be used by the core runtime for required logic.

### 6.4 Translation Strategy (JDM → PCRM)

The Rule Translator maps GoRules JDM constructs to PCRM structures as follows:

| JDM Construct | PCRM Construct |
|--------------|----------------|
| `DecisionTableNode` | `logic.decisionTable` block |
| Decision table schema (columns) | `logic.decisionTable.columns` array |
| Decision table rules (rows) | `logic.decisionTable.rows` array |
| `expressionNode` (condition cell) | `Rule Expression` within a cell.condition |
| `functionNode` / formula expression | `logic.formula` block |
| ZEN expression string | NCalc-compatible expression string (with thin translation layer for ZEN-specific syntax differences) |
| Field reference in ZEN expression | Replaced by input alias, resolved from metadata binding |
| `switchNode` | `logic.expressionTree` with type "switch" |
| Input schema field | `inputs[]` entry with full binding resolution |
| Output schema field | `outputs[]` entry |

The ZEN-to-NCalc expression translation is a deterministic, rule-based string transformation for the subset of ZEN expressions used in formula nodes. ZEN functions that have direct NCalc equivalents (floor → Floor, ceil → Ceil, round → Round, max → Max, min → Min) are translated by name mapping. ZEN date arithmetic is translated to custom NCalc function registrations provided by the runtime.

If a ZEN expression contains constructs that cannot be translated (complex closures, array operations beyond the supported subset), the Rule Translator flags the expression as untranslatable and presents an authoring-time error before saving.

### 6.5 Schema Evolution and Versioning

The PCRM JSON schema is formally versioned using semantic versioning (`pcrmSchemaVersion` field). Each Rule Version stores the PCRM schema version it was authored against.

**Backward compatibility**: The native C# Runtime must be able to evaluate all Rule Versions authored against any previous minor version of the PCRM schema. Minor version increments (1.0.0 → 1.1.0) add optional fields with defined defaults; the runtime treats missing optional fields as their defaults.

**Forward compatibility**: The runtime reads only the fields it understands; unknown fields in the `extensions` block and unknown optional fields are silently ignored. This allows future PCRM versions to add non-breaking capabilities.

**Major version migration**: A PCRM major version increment (1.x → 2.0.0) indicates a breaking change. A Migration Service (Horizon 2 design intent) will provide automated migration of existing Rule Versions from the prior major version to the new one, producing a new Rule Version record rather than mutating the existing one.

**Schema publication**: The PCRM JSON Schema document is published as a web resource within the EDP solution (`mql_/edp/schemas/pcrm-v1.0.0.schema.json`). This serves as the formal contract for alternative designers and import sources.

### 6.6 Vendor Independence

The PCRM design is structurally independent of GoRules in the following ways:
- No GoRules-specific type names, field names, or enum values appear in the PCRM schema.
- The ZEN expression language is replaced at translation time; the PCRM stores NCalc expressions, not ZEN expressions.
- The `pcrmSchemaVersion` is a Maqsad-versioned identifier, not a JDM version.
- A future alternative designer (e.g., a custom Excel-to-PCRM importer, a DMN-to-PCRM importer, or an AI-to-PCRM generator) writes PCRM JSON directly — it does not need to produce JDM JSON.

### 6.7 Import Source Support

The PCRM is designed to receive rule definitions from multiple origins:

| Import Source | Translation Path | Horizon |
|--------------|-----------------|---------|
| GoRules JDM Editor (primary) | JDM JSON → Rule Translator → PCRM | Horizon 1 |
| JSON export/import | PCRM JSON → PCRM validator → stored directly | Horizon 1 |
| Excel decision table | Excel → ClosedXML parser → PCRM builder | Horizon 2 |
| DMN 1.3 XML | DMN parser → PCRM builder | Horizon 3 |
| Microsoft RulesEngine JSON | RulesEngine parser → PCRM builder | Horizon 3 |
| AI-generated PCRM | AI Assist Adapter → PCRM validator → Draft | Horizon 3 |
| Custom designer | Designer emits PCRM JSON directly | Any horizon |

All import paths terminate at the PCRM validator before a Rule Version record is created. No import source bypasses schema validation.

---

## 7. Metadata Architecture

### 7.1 Purpose

The Metadata Architecture is the second architectural spine of the platform. It translates the customer's CRM data model into a searchable, display-name-first catalogue that the designer and runtime use to express and bind rules without exposing schema names.

### 7.2 Metadata Discovery

The Metadata Service discovers metadata through two paths:

**Cloud (Dataverse / D365 Online)**: The designer web resource calls Dataverse Web API metadata endpoints from the browser, authenticated with the user's session token. Calls: `GET /api/data/v9.2/EntityDefinitions`, `GET /api/data/v9.2/EntityDefinitions(<logicalname>)/Attributes`, `GET /api/data/v9.2/GlobalOptionSetDefinitions`. These calls are subject to Dataverse's own metadata caching.

**On-Premises (CRM 9.x)**: The designer web resource cannot call the Organization Service directly (server-side SDK, not available in browser). Instead, it calls a CRM Custom Action (`mql_RetrieveEntityMetadata`) that executes the `RetrieveAllEntitiesRequest` / `RetrieveAttributeRequest` on the server side and returns JSON to the browser. This Custom Action is thin — it reads and serialises metadata, applies no business logic.

### 7.3 Metadata Cache

Live metadata calls on every designer interaction would be prohibitively slow for large CRM organisations. A governed cache operates at two levels:

**Cache Level 1 — Browser Session Cache** (designer web resource)
Metadata fetched during a designer session is held in browser memory (React state / Zustand store). Cache is invalidated on session end. This prevents repeated API calls within a single authoring session.

**Cache Level 2 — CRM Entity Cache** (`mql_metadataentitydefinition`, `mql_metadataattributedefinition`, `mql_metadataoptionsetdefinition`)
Metadata is serialised and stored as CRM entity records. Cache records carry a `mql_lastrefreshedon` timestamp and a `mql_metadataversion` token. The cache version token is compared against the live platform metadata version on each designer startup; if they match, the cache is served without a live call.

### 7.4 Metadata Synchronisation and Refresh

**Version token check**: CRM/Dataverse publishes a metadata version token that increments whenever any entity or attribute is created, modified, or deleted. The Metadata Service compares the stored token against the live token. If they differ, the cache is flagged as stale and a refresh is queued.

**Refresh trigger**: Cache refresh is triggered by:
1. A Metadata Version token mismatch at designer startup.
2. An explicit "Refresh Metadata" action in the designer (administrator-accessible).
3. A scheduled plugin step (`mql_RefreshMetadataCache`) that runs on a configurable interval (default: once per hour, controlled by `mql_edp_MetadataCacheTtlMinutes`).

**Refresh scope**: Full-entity refresh (all entities and their attributes) is performed on version token mismatch. Incremental refresh (specific entity) is supported via the Custom Action for targeted updates after targeted schema changes.

### 7.5 Binding Stability

Rule Bindings store logical names, not display names. When a field or entity is renamed in CRM/Dataverse, existing rule bindings remain valid because they reference the stable logical name. The display label captured at binding time is informational and is refreshed from the cache on designer load.

This means a renamed field continues to execute correctly; only its display label in the designer is updated. Authors are not disrupted by model changes.

### 7.6 Impact Analysis (Horizon 2 design intent)

The platform is designed to answer: "Which rules are affected if I change this field?" This is enabled by the Rule Dependency entity (Section 3.1), which is populated at save time with the set of entity and attribute logical names referenced in the rule's bindings. A query on Rule Dependency for a given attribute logical name returns all Rule Versions that bind to it.

### 7.7 What the Metadata Service Surfaces

The Metadata Service makes the following metadata types available to the designer:

- **Entities** (by display name, searchable by name and description)
- **Fields/Attributes** (by display name and type, filterable by data type)
- **Relationships** (1:N, N:1, N:N by display name, traversable for path building)
- **Option Sets / Choices** (by option label, never by numeric value to the author)
- **Lookup Fields** (with target entity clearly identified)
- **Localised Labels** (in the authenticated user's language where available)
- **Field Data Types** (mapped to EDP's normalised type set for operator filtering)
- **Required Levels** (to help authors understand which inputs are guaranteed present)
- **Activities, Business Process Fields, Owner Fields, Status/State Fields** (as typed input sources)

---

## 8. Searchable Metadata Experience

This section designs the designer-facing interaction model for metadata selection. No UI code is produced here; the specification defines what the React components must support when built in Phase 4.

### 8.1 Entity Picker

The Entity Picker presents a searchable, filterable list of CRM entities. Interaction model:
- Full-text search against entity display name and plural name.
- Filter by entity type (standard, activity, virtual).
- Filter by "recently used" (session memory of recently selected entities).
- Filter by "favourites" (persisted as Feature Flag or browser local storage per user).
- Grouped by solution/publisher for disambiguation.
- Each entity shown with its display name, plural name, and icon (CRM entity icon where available, category icon otherwise).

### 8.2 Field / Attribute Picker

Once an entity is selected, the Field Picker presents its attributes. Interaction model:
- Full-text search against attribute display name.
- Filter by data type (Text, Number, Date, Boolean, Picklist, Lookup, Currency, Calculated).
- Grouped by section (standard fields, custom fields, relationship-based fields).
- Relationship traversal: a "→" indicator on lookup fields allows the author to navigate to the target entity's fields, building a traversal path.
- Displays data type icon alongside each field name.
- Displays whether the field is required or optional (to guide input configuration).

### 8.3 Operator Picker

Once a field is selected, the Operator Picker presents only the operators valid for that field's data type. Interaction model:
- Operators filtered by the selected field's EDP normalised data type.
- Operators grouped by semantic category (Equality, Comparison, Set Membership, Pattern, Null/Empty).
- Custom operators registered via the Extension Point (Section 16) appear in the list with a visual indicator.
- Operators display in business-friendly language ("is equal to", "is greater than", "is one of") — not code symbols.

### 8.4 Option Set Value Picker

When a Picklist field is selected with an equality operator, the value input presents only the option set labels (not numeric values). Interaction model:
- Full-text search against option labels.
- Multi-select for "is one of" / "is not one of" operators.
- Localised labels shown in the authenticated user's language.

### 8.5 Lookup Value Configuration

When a Lookup field is selected, the designer shows the target entity name and allows the author to configure whether the comparison is against the lookup's name field, a specific attribute of the target entity (requiring a traversal), or a record reference. Authors never see GUIDs.

### 8.6 Recent Items and Favourites

The designer maintains a session-level "recently used" list for entities and fields (top 10 recents, shown first in search results). Favourites are persisted per user (browser local storage for Horizon 1; CRM user preference record for Horizon 2).

### 8.7 Business-Friendly Name Mapping

The Metadata Service maintains a bidirectional mapping between display names and logical names. The designer always shows display names. At save time, display names are resolved to logical names and stored in the Rule Binding. At load time, logical names are resolved back to display names for presentation. If a logical name cannot be resolved (entity or field deleted from the model), the designer shows a binding error indicator.

---

## 9. JSON Strategy

### 9.1 Storage

Three JSON documents are stored per Rule Version:
1. `mql_ruleversion.mql_canonicaldefinition` — the PCRM JSON. This is the execution contract.
2. `mql_ruleversion.mql_jdmsource` — the original GoRules JDM JSON from the designer. Used for round-trip editing. Not used by the runtime.
3. `mql_ruleversion.mql_complexityprofile` — the computed complexity profile JSON.

All three are stored as CRM memo (nvarchar(max)) attributes on the Rule Version entity.

### 9.2 Validation

PCRM JSON is validated against the PCRM JSON Schema using NJsonSchema at two boundaries:
1. **Save boundary** (designer web resource, before the CRM API call): Validation catches authoring errors before they reach storage.
2. **Import boundary** (Rule Import Service, before creating a Rule Version record): Validation catches malformed imported JSON.

Runtime loading does not repeat full NJsonSchema validation (performance concern inside the sandbox). Instead, the runtime performs lightweight structural checks (required fields present, enums within range) as part of its own loading logic.

### 9.3 Versioning

The `pcrmSchemaVersion` field in the PCRM document enables schema evolution management. The PCRM schema is published as a web resource and versioned semantically. The runtime maintains a registry of supported schema versions and their respective deserialisation paths.

### 9.4 Compression

For large decision tables (100+ rows, many columns), the PCRM JSON may exceed 1 MB. CRM nvarchar(max) supports up to 1,073,741,823 characters (approx. 1 GB), so storage is not a practical constraint. However, loading and deserialising large JSON in the plugin sandbox has latency implications.

Compression strategy: if the PCRM JSON exceeds a configurable threshold (default 512 KB, controlled by Rule Configuration), the stored value is Base64-encoded gzip-compressed JSON. The first two bytes of the stored value distinguish compressed from uncompressed. The runtime and designer handle both transparently.

### 9.5 Large-JSON Handling

Decision tables with 10,000+ rows are a theoretical possibility. Platform guidance (enforced by the Complexity Profile and designer warnings) discourages tables beyond 500 rows in a single Rule Version. Authors with very large tables are directed to split by category or use metadata-level pre-filtering to reduce the runtime table size.

### 9.6 Migration Strategy

When the PCRM schema major version increments, a Migration Service (Horizon 2) reads all Rule Versions at the prior schema version and produces new Rule Versions (not mutations) at the new schema version. Old Rule Versions are retained (immutable history) and flagged as "migrated — superseded by version N". Consumers pinned to old versions continue to function until they are explicitly re-pointed.

---

## 10. Security Architecture

### 10.1 Security Roles

Five security roles are defined within the EDP solution. They compose with existing CRM security roles; no author or administrator needs to give up their existing CRM role.

| Role Name | Privileges | Typical persona |
|-----------|------------|-----------------|
| **EDP Rule Author** | Create/Read/Write on Draft Rule Versions; Read on Rule Category, Folder, Function, Template; Execute simulation via Custom Action | Business Analyst, Policy Owner |
| **EDP Rule Approver** | All Author privileges; Publish/Retire Rule Versions; Create Rule Approval records | Governance Officer, Compliance Lead |
| **EDP Rule Administrator** | All Approver privileges; Manage Rule Configuration, Feature Flags, Metadata Cache, Security Role assignments; Delete draft records | CRM Administrator, Platform Owner |
| **EDP Rule Auditor** | Read on Rule Execution Log, Rule Audit, Rule Version history; no write privileges | Compliance Auditor, Regulator |
| **EDP Rule Executor** | Execute the runtime entry adapters (Plugin / Custom Action / Custom API) via service accounts; no authoring privileges | Service Accounts, System Integration Users |

### 10.2 Business Unit Scoping

Rule entities use standard CRM ownership model (User or Team ownership). Business unit scoping applies: an EDP Rule Author in Business Unit A cannot see Rule records owned by Business Unit B unless sharing is explicitly configured. Cross-BU rule reuse is governed through Teams and sharing at the Rule Template and Rule Package level.

### 10.3 Segregation of Duties

The EDP Rule Approver role is the only role that may transition a Rule Version from In Review to Approved or Published. The platform enforces that the Approver is not the same identity as the Author for the same version (where the customer's governance policy requires this). The enforcement mechanism is a Pre-Validation plugin on the Rule Version entity that checks the approving identity against the authoring identity and rejects the transition with a typed error if they match and the SoD flag is enabled.

### 10.4 Field-Level Security

Execution traces respect CRM field-level security (FLS). When writing a Rule Execution Log record, the Trace Writer evaluates the invoking identity's field-level access for each input field referenced in the rule. Fields the invoking identity cannot read are excluded from the trace output. Field names (not values) are retained for governance reference.

### 10.5 No Separate Identity Store

The EDP introduces no login page, session token, authentication endpoint, or credential store. Identity is the CRM/Dataverse identity (Entra ID on cloud, AD/ADFS on on-prem). Every designer action, every runtime invocation, and every governance transition is traceable to a CRM identity.

### 10.6 Rule Safety

The PCRM design prevents code injection by design. Rule conditions are structured JSON objects (operator + value), not interpreted strings. The only interpreted strings in the PCRM are NCalc formula expressions, which are evaluated by the NCalc AST interpreter — a sandboxed evaluator that does not execute arbitrary .NET code, cannot access the file system, and cannot make network calls. NCalc is configured with a whitelist of registered functions; functions not in the whitelist are rejected at translation time.

### 10.7 Audit Records

Rule Audit records are written by a Post-Operation plugin on all significant entities. The plugin uses an impersonation-free execution context (the audit records reflect the actual user, not the system account). Audit records are CRM entity records with no workflow or automation that could delete or update them. Phase 6 must verify that no CRM SDK path (Web API, Org Service, Power Automate) allows UPDATE or DELETE on audit records.

### 10.8 Secret Management

No secrets, credentials, API keys, or tokens appear in any rule definition, configuration record, web resource, or plugin assembly. Service account credentials for background operations are managed via CRM Connection References or Managed Identity (cloud) / AD service accounts (on-prem), not stored in the EDP solution.

---

## 11. Versioning Strategy

### 11.1 Lifecycle State Machine

Every Rule Version exists in exactly one lifecycle state at any point in time. Permitted transitions are enforced by a Pre-Validation plugin on the Rule Version entity.

```
[Draft] ──submit──▶ [In Review] ──approve──▶ [Approved] ──publish──▶ [Published]
           ▲              │ reject                                          │
           │              ▼                                                 │
           └──────── [Draft]                                  retire/supersede
                                                                            ▼
                                                               [Retired] ◀──────
```

| State | Editable? | Executable in production? | Executable in simulation? |
|-------|-----------|--------------------------|--------------------------|
| Draft | Yes | No | Yes |
| In Review | No (comment only) | No | Yes |
| Approved | No | No | Yes |
| Published | No | Yes | Yes |
| Retired | No | No | Yes (historical replay only) |

Only Published versions are resolved by the Rule Resolver in production. The distinction between Approved and Published exists to support future pre-deployment checks (e.g., automated conformance tests) that run after approval but before the version is made live.

### 11.2 Immutability of Published Versions

A Published Rule Version record is immutable. The Pre-Validation plugin rejects any attempt to update the `mql_canonicaldefinition` attribute on a Published or Retired record. A correction to a Published rule requires creating a new Draft version from a clone of the current Published version.

### 11.3 Version Numbering

Version numbers are integers, auto-incremented per rule. The first version of any rule is Version 1. Cloning a published version to create an edit increment creates Version N+1. Version numbers are displayed to authors and used in API contracts for pinned resolution.

### 11.4 Version Resolution Policy

The Rule Resolver enforces the following resolution logic:

1. If the decision request includes a `pinnedVersionId`, resolve to that exact Rule Version record (subject to governance justification requirements — see Section 11.5).
2. If no pin is provided, resolve to the Rule Version record for the Rule where `mql_lifecyclestate = Published` and `mql_isdefaultpublished = true`. Only one version per rule may hold the default-published flag at any time.
3. If the default-published version cannot be found, return a typed error (`RuleNotPublished`) — never return null, never fall back silently to a draft.

### 11.5 Production Version Pinning — Governance Justification (C-006 Resolution)

The CEO ruling (C-006) requires that production-environment version pinning carries a recorded governance justification. The design is:

**Decision request contract for pinned calls in production:**
The decision request (executed via Plugin, Custom Action, or Custom API) includes two additional fields when a `pinnedVersionId` is supplied:
- `PinJustificationCode` — an enum from a registered set: `LongRunningCase`, `RegulatoryFreeze`, `TestingExplicitVersion`, `Other`.
- `PinJustificationNote` — free text, maximum 500 characters.

**Enforcement:**
The Rule Resolver, before executing the pinned version, checks the `mql_edp_IsProductionEnvironment` environment variable. If the environment is flagged as production and a `pinnedVersionId` is present but no `PinJustificationCode` is provided, the resolver returns a typed error (`PinJustificationRequired`) and does not execute the rule.

**Audit record:**
When a pinned execution occurs (in any environment), the Rule Execution Log record captures: `mql_ispinned = true`, `mql_pinnedversionid`, `mql_defaultpublishedversionid` (what would have resolved without pinning), `mql_pinjustificationcode`, and `mql_pinjustificationnote`. This ensures auditors can explain every pinned execution.

**Non-production environments:**
In Dev, Test, and Staging environments (`mql_edp_IsProductionEnvironment = false`), pinning without justification is permitted and the resolver records the pin but does not enforce the justification fields.

### 11.6 Rollback

Rollback is re-publishing a prior Retired version: the administrator sets the desired prior version's state back to Approved, then publishes it (triggering the governance transition). The previously Published version becomes Retired. No data is deleted; no records are mutated beyond the lifecycle state fields.

### 11.7 Coexistence of Multiple Published Versions

By design, the platform supports exactly one "default published" version per rule at any time. However, multiple versions may be in Published state simultaneously — the default-published flag identifies which one is resolved by callers that do not pin. This enables:
- A new version to be published while existing callers that pin the old version continue to execute against it.
- A controlled cutover when the administrator sets the new version as default-published and the old version remains Published for legacy pinned consumers.

---

## 12. Configuration Strategy

### 12.1 Hierarchy

Configuration is read from the following sources in priority order (highest to lowest):

1. **Environment Variable** (CRM-native, per-environment, set by administrator)
2. **Rule Configuration entity record** (platform-wide defaults stored in CRM)
3. **Compiled defaults** (baked into the plugin assembly as constants — only for absolute platform floor values that cannot be overridden below)

No configuration value is hardcoded as a magic number in business logic. The compiled default is the last resort only.

### 12.2 Environment Settings

Environment-tier settings (covered by Environment Configuration domain object) are stored as CRM environment variables. Administrators set these once during deployment and never touch them during normal operation.

Key environment variables:
- `mql_edp_IsProductionEnvironment` — Boolean; controls governance enforcement strictness.
- `mql_edp_EnvironmentTier` — Picklist (Dev / Test / Staging / Production).
- `mql_edp_MetadataCacheTtlMinutes` — refresh interval for the CRM entity metadata cache.

### 12.3 Platform Configuration

Platform configuration (Rule Configuration entity records) covers settings that platform administrators tune per deployment:
- Default trace retention period (days).
- Default simulation trace retention period (days).
- Complexity ceiling parameters (max conditions, max nesting, max table rows, max chain depth).
- Complexity warning threshold percentage.
- Whether SoD enforcement (author ≠ approver) is enabled.
- Whether simulation is required before submission.

These are read by the designer and runtime at startup and cached in the session. A configuration reload is triggered by a designer restart or by the platform administrator's explicit "Reload Configuration" action.

### 12.4 Feature Flags

Feature Flags are CRM entity records administered by the EDP Rule Administrator role. The runtime and designer read all active Feature Flags at startup. Feature Flags control:
- In-development capabilities not yet ready for general use.
- Per-deployment feature enables (e.g., enabling Horizon 2 capabilities in a specific customer environment before GA).
- Emergency kill-switches for a specific capability without a deployment.

Feature Flags are not for business rules. They are for platform capability control.

### 12.5 Localisation Configuration

The Metadata Service surfaces localised CRM display names in the authenticated user's language. The platform UI strings (button labels, error messages, field labels in the designer) are localised via RESJSON web resources included in the solution, with English as the base language and additional languages added as separate RESJSON files. The designer loads the appropriate RESJSON file based on the user's CRM language setting.

---

## 13. Caching Strategy

### 13.1 Metadata Cache

| Cache type | Location | Invalidation trigger | TTL |
|-----------|---------|---------------------|-----|
| Browser session cache (entities) | React state / Zustand store | Session end, explicit refresh | Duration of designer session |
| Browser session cache (attributes) | React state / Zustand store | Entity reselection, session end | Duration of entity selection |
| CRM entity cache (`mql_metadataentitydefinition` et al.) | CRM entities | Metadata version token mismatch; scheduled refresh | Configurable TTL (default 60 min) |

Metadata cache is always read-only from the runtime's perspective. The runtime never writes to the metadata cache.

### 13.2 Configuration Cache

The platform Rule Configuration is read once at plugin/designer startup and held in memory for the session. For the plugin, configuration is read on the first invocation within a plugin host process lifetime (the CRM plugin host recycles the process periodically). A `mql_RefreshConfiguration` Custom Action forces a configuration re-read.

### 13.3 Rule Definition Cache

The native C# Runtime does not implement a rule definition cache in Horizon 1. Each invocation loads the Rule Version record from CRM, deserialises the PCRM JSON, and evaluates. This is intentional for correctness simplicity in Horizon 1.

Horizon 2 design intent: a lightweight rule definition cache keyed by Rule Version ID + PCRM schema version, held in plugin-process memory, invalidated when a new Published version is detected via a plugin step on Rule Version state transitions. Cache entries are immutable (published versions are immutable), so cache coherence is straightforward.

### 13.4 Performance Targets for Cache Operations

- Metadata cache read (from CRM entity, first access per session): target P95 ≤ 200ms.
- Metadata cache read (from browser session memory): target < 5ms.
- Rule Configuration read (from CRM, first access): target P95 ≤ 50ms.
- Rule Version load from CRM: target P95 ≤ 100ms (contributes to the overall P95 ≤ 500ms decision evaluation SLA).

---

## 14. React Foundation

### 14.1 Architecture Overview

The designer is a single-page React application packaged as a set of CRM web resources. It is not a Next.js application (Next.js requires a Node.js server; web resources are static client-side bundles — see ADR-07). The build output is a set of chunked JavaScript, CSS, and asset files, each registered as an individual web resource RootComponent in the solution manifest.

### 14.2 Application Structure

The designer web resource is organised into logical layers. No folder structure or code is produced here; the design identifies the layers:

- **Shell Layer**: Loads the application, reads authentication context, loads Feature Flags and Rule Configuration, initialises Zustand stores, and routes to the correct view (designer, version list, test harness, simulation panel).
- **Designer Layer**: Hosts the GoRules JDM Editor, the metadata selector components, the save/translate pipeline, and the complexity score display.
- **Governance Layer**: Version list, lifecycle state controls, approval submission, publication controls.
- **Simulation and Test Layer**: Input panel for test payload entry, simulation result display, test case management.
- **Administration Layer**: Rule Configuration editor, metadata cache refresh, Feature Flag management.

### 14.3 Build Toolchain

Vite is the build tool. It provides fast development builds, good tree-shaking for production, and excellent support for splitting large applications into chunks (critical for web resource file-size limits). The WASM file (`@gorules/zen-engine-wasm`) is output as a separate chunk and registered as its own web resource.

### 14.4 State Management

Zustand is the state management library. It is chosen over Redux Toolkit for its minimal boilerplate and its suitability for the designer's state complexity. State stores are organised by concern:

- `metadataStore` — cached entity/attribute metadata for the current session.
- `ruleDesignerStore` — the current rule's JDM JSON state as the designer operates on it.
- `configurationStore` — loaded platform configuration.
- `sessionStore` — user identity context, language, feature flag state.

### 14.5 Styling

Tailwind CSS (per constitution default) for layout and utility classes. Microsoft Fluent UI v9 for Dynamics-design-language-aligned components (dialogs, buttons, dropdowns, person cards, breadcrumbs, icons). Fluent UI is chosen to align the designer visually with the Dynamics 365 shell. Tailwind and Fluent UI are compatible and their concerns are separated: Tailwind handles spacing, grid, and layout; Fluent UI handles interactive component chrome.

### 14.6 Localisation

`react-i18next` for string externalisation and language switching. RESJSON files loaded as web resources serve as the translation source. The language is initialised from the CRM `Xrm.Utility.getGlobalContext().userSettings.languageId` value at application startup.

### 14.7 Error Boundaries

React error boundaries are placed at the designer layer boundary, the governance layer boundary, and the metadata selector component boundary. An error in the metadata selector does not crash the designer; it degrades to manual-entry mode with an error notice. An error in the GoRules editor component is caught and displays a structured recovery prompt.

### 14.8 Lazy Loading

The GoRules JDM Editor and the WASM binary are loaded lazily (dynamic import) after the shell has loaded and displayed the application chrome. This ensures the designer UI appears quickly even if the GoRules bundle takes longer to load. The simulation and administration layers are also lazily loaded.

### 14.9 GoRules Integration Wiring

The GoRules JDM Editor component receives:
- Initial JDM JSON (from the loaded Rule Version's `mql_jdmsource`, or an empty template for a new rule).
- A metadata-resolution callback (the Metadata Service's entity/field picker API).
- A save callback (triggers the Rule Translator, PCRM validation, and CRM save sequence).
- A configuration object (editor theme, feature enables, WASM configuration — see Section 15).

The editor emits JDM JSON on save; the application's save pipeline translates it to PCRM and submits to CRM. The editor never calls CRM directly.

---

## 15. GoRules Integration Strategy

### 15.1 Scope Boundary

GoRules JDM Editor (`@gorules/jdm-editor`) is the authoring surface only. It is embedded in the designer web resource. It is never referenced by the native C# runtime, the entry adapters, the Rule Resolver, the Trace Writer, or any server-side component.

The GoRules ZEN runtime (`@gorules/zen-engine-wasm`, `gorules/zen` C# binding) is excluded from the EDP product at all horizons. This is Phase 0 Invariant 5, reaffirmed by Phase 2 research and ADR-01.

### 15.2 Designer Host Decision — P2-OI-001 Resolution

**Decision: Accept degraded mode (no WASM) in a plain CRM web resource for Horizon 1. See ADR-10 for full rationale.**

The GoRules JDM Editor ships with `@gorules/zen-engine-wasm` as a production dependency. The WASM binary requires the hosting server to serve `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` HTTP headers. CRM/Dataverse web resource servers do not allow setting custom HTTP response headers on web resource files.

**Horizon 1 consequence:** The WASM binary is included in the build output (as a separate web resource chunk) but the editor is initialised without WASM — `createDecisionEngine()` is not called and the WASM module is not loaded. The editor operates in structural mode only:
- All decision graph editing, node creation, connection drawing: fully functional.
- Decision table authoring (rows, columns, condition cells, output cells): fully functional.
- Expression/formula text input: functional (authors type expressions; NCalc syntax is documented in the designer help panel).
- WASM-dependent features disabled: expression autocomplete in formula fields; inline ZEN expression validation; expression syntax highlighting.

This degradation is accepted because: structural authoring (the core BA capability) is unaffected; expression autocomplete is a quality-of-life enhancement, not a correctness gate (the Rule Translator validates expressions at save time); and maintaining zero-external-infrastructure requires accepting this limitation.

**Horizon 2 cloud path (design intent, not Horizon 1 scope):** On Dataverse cloud only, the designer shell may be hosted as a Power Apps Custom Page (a Dataverse-native, model-driven app extension that runs as an iframe within Dynamics). Power Apps Custom Page hosting may support COOP/COEP headers. If this is confirmed to be feasible without external infrastructure, the WASM initialisation will be enabled in the cloud designer, providing the full autocomplete experience on cloud. On-prem will remain in degraded mode. An ADR will be required to activate this path.

### 15.3 JDM JSON Load and Save

**Load:** When the designer opens an existing Rule Version, the JDM source JSON (`mql_jdmsource`) is loaded from the Rule Version CRM record and passed to the editor's `value` prop. The editor renders the saved decision graph.

**Save:** When the author saves, the editor emits the current JDM JSON via its onChange/onSave callback. The designer application:
1. Validates the JDM JSON structure.
2. Passes it to the Rule Translator.
3. The Rule Translator resolves metadata bindings, maps to PCRM, and computes the complexity profile.
4. PCRM JSON is validated against the PCRM schema via NJsonSchema.
5. Both `mql_jdmsource` and `mql_canonicaldefinition` are written to the Rule Version record in a single CRM update call.

### 15.4 GoRules Upgrade Strategy

The GoRules JDM Editor package version is pinned in package.json. Upgrades are governed by the following process:
1. New version reviewed for API changes, JDM schema changes, and WASM dependency changes.
2. If the JDM schema changes, the Rule Translator must be updated before the editor version is upgraded.
3. The PCRM schema version is incremented if the JDM-to-PCRM mapping changes.
4. All existing Rule Version records must be verified to round-trip correctly through the new editor version.
5. An ADR is produced for any JDM schema change that affects the Rule Translator.

### 15.5 Designer Replacement Strategy

If GoRules JDM Editor is deprecated, becomes commercially encumbered, or fails to meet usability needs in a future horizon, the replacement strategy is:
1. The new designer must emit PCRM JSON directly (bypassing the JDM translation step) or emit a new source format with a corresponding new translator.
2. The runtime is unaffected — it reads PCRM JSON regardless of designer.
3. The `mql_jdmsource` attribute on Rule Version will be repurposed to store the new source format (or deprecated if the new designer edits PCRM directly).
4. An ADR documents the transition.

---

## 16. Extensibility Strategy

### 16.1 Design Principle

Extensibility is delivered through defined, registered extension points. No extension modifies the core runtime, the PCRM schema, or the Rule Translator. Extensions register as CRM entity records and are loaded by the platform at startup. This is Open/Closed at product scale.

### 16.2 Custom Operators

Custom comparison operators are registered via a Custom Operator registration entity (`mql_customoperator`). Each registration provides:
- Operator name (unique, used in the PCRM `condition.operator` field).
- Display label for the designer's operator picker.
- Supported data types.
- Implementation class name (a C# class in a registered extension assembly, implementing the `IOperatorEvaluator` interface defined in the EDP SDK).
- Version (semantic).

The runtime loads registered custom operators at startup and includes them in the operator evaluation pipeline.

### 16.3 Custom Functions

Custom formula functions extend the NCalc function library available to formula nodes. Registered via `mql_rulefunction` records (the Rule Function domain object, Section 3.2) with an implementation type of `CustomExtension`. The implementing C# class is registered in the extension assembly. All custom functions are sandboxed — they cannot access CRM data directly, make network calls, or access the file system.

### 16.4 Custom Data Providers (Horizon 2)

Custom Data Providers allow rule authors to configure additional input sources beyond direct field bindings on the primary evaluation entity. A data provider is a registered C# class (implementing `IDataProvider`) that, given a context (the evaluation request), returns a typed key-value map of additional inputs. Data providers remain within the CRM trust boundary (they can call the Organization Service but not external endpoints).

### 16.5 Custom Entry Adapters

New integration channels are added by implementing the `IEntryAdapter` interface from the EDP SDK. Custom Entry Adapters:
- Authenticate via the platform identity.
- Normalise the channel-specific request into a `RuleExecutionContext`.
- Invoke the single runtime.
- Map the `RuleEvaluationResult` back to the channel response.
- Contain no business logic.

### 16.6 Designer Extensions

The GoRules JDM Editor is the Horizon 1 designer surface. Future designer extensions (a standalone decision-table editor, a formula builder, a natural-language rule editor) must:
- Emit PCRM JSON directly (or emit a format with a registered translator).
- Register as an authoring surface in the Extension registry.
- Respect the PCRM schema as the designer-runtime contract.
- Not reference the GoRules editor or its JSON format (each designer is independent).

### 16.7 Future Marketplace (Horizon 3 Extension Points)

The ISV Pack domain object (Section 3.8) and the Rule Template domain object are the extension points for a future marketplace. Horizon 1 establishes:
- The PCRM JSON schema as the stable distribution format for templates.
- The `mql_ruletemplate` entity as the store for packaged templates.
- The `mql_isvpack` entity as the future carrier of signed packs.
- The JSON import path as the installation mechanism.

The signing model (Maqsad-issued certificate, import-time signature validation) is designed but not implemented until Horizon 3.

---

## 17. Performance Strategy

### 17.1 Standard Decision Profile (C-002 Ceiling)

The platform guarantees P95 ≤ 500ms for any Rule Version whose complexity profile is within the Standard Decision Profile (SDP). The SDP is defined as:

| Dimension | SDP Ceiling | Designer warning threshold (80%) |
|-----------|-------------|----------------------------------|
| Total conditions (table rows × condition columns, or expression tree nodes) | 100 | 80 |
| Maximum nesting depth (sub-expressions within a condition) | 5 | 4 |
| Decision table rows (for decision table style) | 200 | 160 |
| Decision table columns (condition + output) | 20 | 16 |
| Chained sub-decisions (rule calling another rule) | 3 | — |
| Output fields | 20 | 16 |
| Formula expression length (NCalc expression string, characters) | 1,000 | 800 |
| Rule Variables | 10 | 8 |

**Complexity score**: The Rule Complexity Profile stores a composite score from 0–100, computed as the maximum of each dimension's percentage of its SDP ceiling. A score of 80–99 triggers a designer warning ("Approaching complexity ceiling"). A score of 100+ triggers a designer error ("Exceeds Standard Decision Profile — P95 performance guarantee does not apply. Consider splitting this decision or using async handoff via the Process Engine.").

**Beyond SDP**: Decisions with complexity scores above 100 may still be authored and published. The platform does not block them; it informs the author that the P95 guarantee does not apply and that the 30-second absolute ceiling (P0 guarantee) remains. Customers with decisions beyond the SDP are advised to measure against the 30-second absolute ceiling and plan for potential async handoff architecture.

### 17.2 Rule Definition Loading

The primary performance-sensitive sub-operation within the evaluation pipeline is loading the Rule Version from CRM and deserialising the PCRM JSON. Target: P95 ≤ 100ms for rule load plus deserialisation. This is within the budget for the 500ms total target.

Rule loading optimisation strategies (Horizon 2 design intent):
- In-process memory cache of recently-resolved Rule Versions, keyed by version ID.
- Version token-based invalidation (a plugin step on Rule Version state transitions invalidates the cache entry).

### 17.3 Expression Evaluation Performance

NCalc evaluates expressions via an AST interpreter. For simple arithmetic formulas within the SDP (expressions ≤ 1,000 characters, ≤ 10 variables), NCalc evaluation time is sub-millisecond. For complex expressions approaching the SDP ceiling, evaluation time should remain well within 50ms. The expression evaluation budget within the overall 500ms P95 target is set at 50ms.

### 17.4 Design for 5,000+ Rules

The platform is designed to operate correctly with 5,000+ Rule records in the repository without performance degradation in the designer or runtime:
- Designer rule list views use server-side paging (CRM FetchXML paging cookies).
- Rule search uses CRM's full-text search capabilities or Quick Find on the Rule entity.
- The runtime is stateless and per-invocation — the number of rules in the repository has no effect on runtime performance.

### 17.5 Design for 100,000+ Executions Per Day

The runtime is stateless per invocation and inherits the CRM/Dataverse platform's own concurrency capabilities. 100,000 executions per day at a 500ms average latency requires ~58 evaluations per second sustained. Within a Dynamics 365 Online environment, the Custom API and Plugin entry points can support this throughput provided the CRM platform's API limits are not exceeded. On-prem throughput scales with the server infrastructure.

Rule Execution Log write performance is a potential bottleneck at high throughput. Mitigation: write the execution log asynchronously (Post-Operation async plugin step on the Custom API / Custom Action) for non-audit-critical callers who do not need the trace ID in the synchronous response. For synchronous trace captures (default), the log write is Post-Operation synchronous but does not block the decision result returned to the caller.

### 17.6 Large CRM Organisations

Metadata cache prevents repeated live metadata API calls on every authoring action. The CRM entity cache is effective even for organisations with 500+ custom entities and 10,000+ attributes. The designer metadata selector uses search-first (author types to filter) rather than load-all (prevents rendering very large entity lists).

---

## 18. Architecture Decision Records

### ADR-01: Why GoRules Designer-Only (No ZEN Runtime)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect, Phase 0, confirmed Phase 2 research

**Context:**
GoRules produces two artefacts: the JDM Editor (a React designer component) and the ZEN runtime (a Rust-based evaluator available via WASM in the browser and via a C# binding on the server). Phase 0 Invariant 5 prohibits using ZEN as the runtime. Phase 2 research confirmed that the ZEN C# binding operates via P/Invoke to unmanaged Rust code — blocked by the CRM plugin sandbox — and that WASM is a browser-only capability. Using ZEN would violate both the no-external-runtime invariant and sandbox compatibility.

**Decision:**
GoRules JDM Editor is adopted as the designer surface only. It emits JDM JSON to the host application. ZEN is excluded from the EDP product at all horizons. The native C# runtime interprets PCRM JSON independently of GoRules.

**Consequences:**
The designer autocomplete and inline expression validation features (which use ZEN WASM in the browser) are unavailable in a plain CRM web resource host (see ADR-10). The EDP must maintain its own expression evaluator (NCalc, see ADR-11). The JDM-to-PCRM translation layer must remain current with JDM schema versions.

---

### ADR-02: Why Native C# Runtime (Build, Not Adopt)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect, Phase 2 research

**Context:**
Phase 2 evaluated microsoft/RulesEngine (4.3k stars), NRules (1.6k stars), and GoRules ZEN C# binding as complete runtime alternatives. All were rejected: RulesEngine uses C# expression strings (security risk, wrong paradigm), NRules uses a Rete forward-chaining model (wrong paradigm), and ZEN is sandbox-incompatible (see ADR-01). No adoptable library exists that is JDM-compatible, CRM-sandbox-safe, and deterministic.

**Decision:**
The native C# Rule Runtime is a bespoke build. It reads PCRM JSON, walks the decision graph, evaluates conditions using C# comparison logic, evaluates formulas using NCalc (ADR-11), and returns a typed result. It is built from standard .NET Framework / .NET Standard libraries available in the CRM sandbox.

**Consequences:**
Build effort for the runtime is not offset by adoption. Quality, performance, and correctness are entirely the platform team's responsibility. The NCalc expression evaluator reduces the build surface to: PCRM deserialisation, decision graph walking, condition operator evaluation, variable management, trace writing, and entry adapter normalisation. This is a manageable, well-defined scope.

---

### ADR-03: Why Platform Canonical Rule Model (Not Raw JDM Storage)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect

**Context:**
The simpler approach would be to store GoRules JDM JSON directly and have the runtime interpret it. This would eliminate the translation layer. However, it would couple the runtime to the GoRules schema version, prevent import from non-JDM sources, and make GoRules abandonment catastrophically disruptive. Phase 0 Section 10.3 explicitly identifies the JSON definition as the designer-runtime contract and requires it to be versioned and schema-governed independently.

**Decision:**
A Platform Canonical Rule Model (PCRM) is introduced as the internal storage and execution contract. JDM JSON is stored alongside the PCRM as the designer's round-trip source. The runtime reads PCRM only. All import sources translate to PCRM.

**Consequences:**
A Rule Translator component must be built and maintained. JDM upgrades require a translator update. The PCRM schema must be governed and versioned. The investment pays off by: making the designer replaceable without runtime impact, enabling multi-source imports, and providing a stable, platform-owned execution contract.

---

### ADR-04: Why Metadata-Driven (Business Terms Over Schema Names)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Phase 0, Architect

**Context:**
The north-star persona is the Business Analyst who must author decisions without CRM schema knowledge. Any design that exposes entity logical names, attribute logical names, or option-set numeric values to the author fails the usability requirement (NFR-008, BO-1). The Metadata Service resolves display names to stable identifiers at save time, making the bound rule independent of display changes.

**Decision:**
Every rule authoring interaction goes through the Metadata Service. Display names are the only things authors see or select. Logical identifiers are only visible to developers examining the PCRM JSON. The Metadata Cache reduces performance overhead of this approach.

**Consequences:**
A Metadata Service component must be built (Phase 2: BUILD decision, DEP-012). The designer requires round-trip from display names to logical identifiers. The cache must be kept fresh (Section 7). The investment is non-negotiable for the usability promise.

---

### ADR-05: Why CRM-Native (Zero External Infrastructure)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Phase 0 Invariant 2 and 3

**Context:**
Adding external infrastructure (Docker, Azure Functions, Node server) would accelerate some capabilities (e.g., WASM expression validation, richer APIs) but violates Phase 0 Invariants 2 and 3, which are non-negotiable customer commitment and competitive differentiator. The data-residency advantage (decisions in-tenancy) is destroyed by external computation.

**Decision:**
The platform has zero external infrastructure requirements for core authoring and execution. Optional, non-core features that require cloud services (AI Horizon 3, marketplace Horizon 3) are additive and gated by ADR at the time they are built.

**Consequences:**
Some capabilities are constrained or unavailable (WASM autocomplete in web resource host — see ADR-10). The platform inherits CRM/Dataverse availability and scalability entirely. No independent infrastructure to operate, monitor, or scale.

---

### ADR-06: Why Single Runtime (No Per-Channel Evaluators)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Phase 0 Section 11, Governing meta-principle

**Context:**
A multi-runtime approach (e.g., one evaluator for plugins, another for portal invocations) would create divergence risk — the same rule producing different outputs in different channels. This would make the audit trail unreliable and debugging impossible. The product's integrity guarantee is that decision semantics are identical everywhere.

**Decision:**
Exactly one native C# evaluator exists. All entry adapters (Plugin, Custom Action, Custom API, Lightweight API on-prem) normalise their requests and invoke the same evaluator class. No adapter contains decision logic.

**Consequences:**
A thin adapter layer must be built for each entry point. The evaluator must be accessible from all adapter contexts (it is a library within the plugin assembly, not a separate service). Any bug in the evaluator is a bug everywhere — which is correct: there is one truth to fix.

---

### ADR-07: Why React Web Resource (Not Next.js, Not PCF for Horizon 1)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect, confirmed by Phase 1 BRD OQ-9 resolution

**Context:**
The constitution's default for frontend web is Next.js. However, Next.js requires a Node.js server. CRM web resources are static client-side bundles served from the CRM platform — there is no server to run Next.js. PCF (Power Apps Component Framework) is the alternative embedded approach for Dynamics, but Phase 1 BRD OQ-9 documented that PCF has limited support on CRM On-Premises 9.x, which is a first-class target. The designer is a full-screen authoring surface, not an inline field control — PCF's UX advantage applies to inline controls, not full-screen apps.

**Decision:**
A plain React 18 SPA (not Next.js) built with Vite is the designer web resource host. Deviation from the constitution's Next.js default is justified by the CRM web resource constraint. PCF is deferred to Horizon 2 re-evaluation.

**Consequences:**
No server-side rendering. No Next.js-specific routing, data fetching, or API routes. The designer is entirely client-side. All CRM data access is via the CRM SDK (Xrm) or Web API from the browser. The Vite build pipeline produces static web resource files.

---

### ADR-08: Why Platform Independence (PCRM Over Vendor Formats)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect

**Context:**
Storing GoRules JDM JSON as the primary runtime format would make the entire runtime dependent on GoRules schema evolution and commercial viability. Future import sources (DMN, Excel, AI-generated) would all need to produce JDM JSON — adding a GoRules dependency to every import path. The marketplace vision requires a format the platform controls.

**Decision:**
The PCRM is the platform-owned, vendor-neutral internal format. GoRules JDM JSON is an import source with a dedicated translator, not the authoritative format. The PCRM schema is owned by Maqsad, versioned under Maqsad version numbers, and published as a platform contract.

**Consequences:**
Maqsad owns and governs the PCRM schema evolution. Breaking changes require a migration strategy. This is the correct trade-off: vendor independence and multi-source import capability outweigh the maintenance overhead of a translation layer.

---

### ADR-09: Governance-Justified Version Pinning in Production (C-006)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect, mandated by CEO Condition C-006

**Context:**
The CEO ruling (C-006) requires that production-environment version pinning carries a recorded governance justification. Without it, a consumer pinning an old rule version in production creates an audit gap: if a regulatory audit asks why a superseded rule was applied to a case, there is no system answer.

**Decision:**
Production-environment pinned decision requests must include `PinJustificationCode` (enum: LongRunningCase / RegulatoryFreeze / TestingExplicitVersion / Other) and `PinJustificationNote` (free text, max 500 chars). The Rule Resolver enforces this when `mql_edp_IsProductionEnvironment = true`. Missing justification in production returns error `PinJustificationRequired` — no execution occurs. The justification is written to the Rule Execution Log record alongside the pinned version ID, the default-would-have-resolved version ID, the actor identity, and the timestamp. Non-production environments permit unpinned and unjustified pinning.

**Consequences:**
Callers that pin in production must be updated to supply justification fields. This is a breaking change for any caller that uses pinning before this policy is enforced — addressed by communicating the requirement at integration time (Phase 4 build documentation). The audit trail for pinned executions is complete and regulatorily defensible.

---

### ADR-10: Designer Host WASM Decision — Degraded Mode Accepted (P2-OI-001)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect, resolves Phase 2 Open Item P2-OI-001

**Context:**
The GoRules JDM Editor's WASM features (expression autocomplete, inline validation) require `COOP: same-origin` and `COEP: require-corp` HTTP headers. CRM/Dataverse web resource servers do not allow custom HTTP headers on web resource responses. Three options were evaluated:
- Option A: Accept degraded mode (no WASM) in a plain web resource.
- Option B: Iframe with a CORS-capable origin (e.g., Azure Static Web App or Azure Functions host).
- Option C: Power Apps Custom Page (Dataverse-native iframe).

Option B is rejected: it introduces external infrastructure (Azure Static Web App or Azure Functions), violating Phase 0 Invariant 2. Option C is a viable Horizon 2 cloud path but is unproven for WASM header support and is cloud-only (breaks on-prem parity for the experience). Option A maintains the zero-external-infra invariant, works identically on cloud and on-prem, and requires only that authors type NCalc expressions unaided (the designer provides a help panel with expression syntax reference).

**Decision:**
Option A — accept WASM degraded mode in Horizon 1. The designer is a plain CRM web resource. WASM is not initialised. Expression autocomplete and inline expression validation are not available in Horizon 1. The Rule Translator validates expressions at save time.

**Consequences:**
BA authoring experience is slightly reduced for formula/expression authoring. This is mitigated by: (a) an expression syntax quick-reference panel in the designer; (b) save-time validation with clear error messages; (c) the simplicity of the initial NCalc expression subset needed for Horizon 1 formulas. The usability test in Phase 5 must explicitly test formula authoring without autocomplete and pass the 30-minute benchmark for NFR-008. If it fails, this ADR is superseded.

---

### ADR-11: Expression Engine Selection — NCalc over DynamicExpresso (P2-OI-002)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect, resolves Phase 2 Open Item P2-OI-002

**Context:**
Phase 2 identified two expression evaluator candidates for the native C# runtime's formula/expression sub-component:
- DynamicExpresso (2.2k stars, MIT): uses `System.Linq.Expressions` and `LambdaExpression.Compile()` to build and compile lambda delegates at runtime.
- NCalc (1.1k stars, MIT): pure AST interpreter — walks the expression parse tree node-by-node; no dynamic IL compilation.

Three evaluation criteria:
1. **CRM sandbox safety**: DynamicExpresso calls `LambdaExpression.Compile()`. In older .NET Framework on-prem CRM plugin sandbox environments (partial trust), `LambdaExpression.Compile()` may be restricted — this risk is unacceptable for on-prem compatibility. NCalc's AST interpreter has no such risk.
2. **netstandard2.0 compatibility**: NCalc targets netstandard2.0, ensuring compatibility across .NET Framework 4.6.2+ (on-prem plugins) and modern .NET (Dataverse plugins). DynamicExpresso targets .NET Framework 4.6.2 and .NET 5+ but has an incomplete netstandard2.0 record.
3. **JDM formula construct coverage**: The ZEN formula subset needed for Horizon 1 formula nodes is: arithmetic operators, Math functions (floor, ceil, round, abs, max, min, pow, sqrt), string functions (upper, lower, length, contains, startsWith), date functions (date arithmetic, age). NCalc's built-in functions cover the arithmetic subset. Date and string functions are added via NCalc custom function registration (a straightforward extension mechanism). DynamicExpresso covers C# expression syntax more broadly but the broader coverage is not needed.

**Decision:**
NCalc is selected as the expression evaluator for the EDP native C# runtime. The base `NCalc` NuGet package is used (not `NCalc.LambdaCompilation`). ZEN date and string expression constructs are mapped to custom NCalc function registrations provided by the EDP runtime.

**Consequences:**
The native C# runtime must register custom NCalc functions for the ZEN expression constructs not natively in NCalc (date arithmetic, string operations). The Rule Translator maps ZEN expression function names to NCalc-compatible equivalents at translation time. The expression compatibility matrix (ZEN construct → NCalc mapping) must be formally documented in the Phase 4 build plan and tested in Phase 5.

---

### ADR-12: Defense-in-Depth Enforcement of Version-Pin Governance (P3-R-8)

**Status:** Accepted
**Date:** 2026-07-03
**Decided by:** Architect, mandated by user (post-Phase-3 addendum). Companion to ADR-09; anticipates CEO Condition C-005.

**Context:**
ADR-09 enforces C-006 (governance-justified pinning) at the Rule Resolver — a runtime, door-level check that fires when a pinned decision is executed. However, the pin selection and its justification are stored as fields on a CRM record. A caller with direct Organization Service or Web API access — a CRM Administrator, a Power Automate flow, or a custom integration — can write or alter the pin fields without ever passing through the Resolver, creating a justification and audit gap (risk P3-R-8). This contradicts the Phase 0 principle that governance is enforced at the platform boundary, not at a single door. CEO Condition C-005 further tasks the Phase 6 auditor with actively pen-testing governance and append-only bypass across all API paths, so this gap will be probed, not assumed away. One constraint is irreducible: a user holding the System Administrator role can disable a plugin step by definition, so absolute prevention is impossible. The realistic objective is boundary enforcement for every normal write path plus a tamper-evident trail for the residual.

**Decision:**
Enforce pin governance in three layers, plus one explicitly accepted residual:
1. **Boundary enforcement.** A synchronous pre-operation plugin registered on create/update of the version-pin fields rejects any write that sets or changes a production pin without a valid `PinJustificationCode` and `PinJustificationNote`, regardless of caller (Org Service, Web API, Resolver, Power Automate). This moves C-006 enforcement from the Resolver door to the platform boundary. The ADR-09 Resolver check is retained as defense-in-depth on the execution path.
2. **Tamper-evidence.** Dataverse / CRM column-level auditing is enabled on the pin fields and the justification fields. Any change is recorded in the platform audit log even if a gate is bypassed.
3. **Least privilege.** A dedicated `Manage Production Pin` privilege, held by a small number of named roles, is required to set a production pin — shrinking the actor set capable of pinning at all.
4. **Protect the linchpin — production-environment designation integrity (resolves Challenge 6).** ADR-09 and layers 1–3 all gate on the production-environment designation. If that designation is a freely mutable CRM field, flipping it to non-production silently disables *all* pin governance — a one-field bypass with no justification prompt. Therefore the production designation is **not** an ordinary user-editable field: it is sourced from a deployment-controlled Environment Variable set at solution-configuration time, its value is covered by column-level auditing, and any change to it requires the same `Manage Production Pin` privilege and raises a high-severity audit event. The Resolver treats the designation as authoritative only from this protected source. This removes the "flip the flag" bypass for all normal write paths; the System-Administrator residual (item 5) still applies to it.
5. **Accepted residual.** A System Administrator can disable the plugin step or alter the protected designation. This is an irreducible property of the platform — a System Administrator is a trusted actor. The residual is not "prevented"; it is (a) constrained to a very small, named actor set via layer 3 and (b) rendered tamper-evident via layers 2 and 4. Documentation must state this honestly and must never claim pinning is un-bypassable.

**Consequences:**
- The pinning-carrier entity gains a synchronous pre-operation plugin; Phase 4 builds and registers it (design intent only in this phase — no code here).
- Column-level auditing must be enabled on the pin and justification fields at solution-configuration time.
- The security model (Section 10) gains a dedicated `Manage Production Pin` privilege; the role matrix must be updated to include it.
- The production-environment designation moves from a mutable CRM field to a deployment-controlled Environment Variable with column auditing and privilege-gated change (resolves Challenge 6); the Configuration Strategy (Section 12) and Security model (Section 10) must reflect this.
- Phase 6 audit (C-005) verifies: the plugin fires for SDK, Web API, and Power Automate write paths; auditing captures pin and production-designation changes; and the System-Administrator-disable residual is documented and access-restricted. Any additional bypass path discovered is a release blocker.
- This ADR broadens and supersedes the original P3-R-8 mitigation text (which specified only a pre-validation plugin on Rule Version lifecycle) by targeting the pin fields and the production designation specifically and adding auditing, least-privilege, and the honest residual statement. It also resolves Skeptic Challenge 6.

---

## 19. Risks

Risks below are additive to Phase 0 Section 22 and Phase 1 Section 9. Pre-existing risks from those phases are not repeated unless this phase adds material new information.

| # | Risk | Impact | Likelihood | Mitigation | New in Phase 3? |
|---|------|--------|------------|------------|-----------------|
| P3-R-1 | **NCalc expression coverage gap** — ZEN expression constructs used in formula nodes exceed what NCalc covers or can be bridged via custom functions, forcing a BUILD decision for the expression parser mid-Phase 4. | High | Medium | Phase 4 must begin with a mandatory expression compatibility spike: enumerate every ZEN expression construct emitted by JDM formula nodes, map each to NCalc or custom function registration, identify any gaps before any other runtime work begins. If a gap cannot be bridged, escalate to architect before proceeding. | New |
| P3-R-2 | **Rule Translator accuracy** — the JDM-to-PCRM translation has subtle bugs for complex JDM graphs, causing rules that validate in the designer to fail at runtime. | High | Medium | Comprehensive translation unit tests covering every JDM node type. Integration tests that round-trip JDM → PCRM → runtime evaluation and compare outputs against known-correct values. Phase 5 conformance suite must include a JDM-PCRM round-trip category. | New |
| P3-R-3 | **PCRM schema proliferation** — multiple concurrent PCRM versions accumulate, increasing runtime complexity and migration burden. | Medium | Low | Strict schema governance: minor versions only for backward-compatible additions; major versions only for breaking changes (rare). No major version in Horizon 1 or Horizon 2. A migration service is designed in Horizon 2 before any major version is considered. | New |
| P3-R-4 | **Metadata cache staleness** — the metadata version token check mechanism is unreliable on a specific CRM version, causing stale bindings to be served after model changes. | High | Low | Phase 5 must explicitly test: (a) rename a field in CRM; (b) verify cache refresh is triggered; (c) verify existing Rule Versions' stable bindings remain valid; (d) verify designer shows updated display name. On-prem and cloud tested separately. | New |
| P3-R-5 | **Expression injection via Rule Function** — a custom function registered by a developer contains code that violates the security model (e.g., calling external services from within the formula evaluation). | High | Low | Custom functions implementing `ICustomFunction` are reviewed and signed at registration time. Phase 6 audit includes a custom function security review. The EDP SDK documents the sandbox constraints custom functions must respect. | New |
| P3-R-6 | **WASM degraded-mode usability failure** — BA usability testing in Phase 5 shows that formula authoring without expression autocomplete prevents the 30-minute benchmark from being met. | High | Medium | Mitigation 1: designer provides a prominent expression syntax quick-reference panel. Mitigation 2: formula authoring guide with worked examples included in Horizon 1 documentation. Mitigation 3: if Phase 5 fails, ADR-10 is superseded and the Horizon 2 cloud Custom Page path is accelerated. | New |
| P3-R-7 | **Performance ceiling: NCalc AST interpretation slower than compiled alternatives for very complex formulas** — formulas at the SDP ceiling (1,000 character expressions, 10 variables) exceed the 50ms expression evaluation budget under load. | Medium | Low | Phase 5 performance benchmarks must include NCalc evaluation of SDP-ceiling expressions under concurrent load. If average exceeds 50ms, evaluate NCalc.LambdaCompilation for cloud-only (where sandbox partial trust is not a concern) and retain AST for on-prem. ADR required. | New |
| P3-R-8 | **Version pinning enforcement bypassed via direct Org SDK update** — a caller with elevated CRM privileges writes the pin fields directly via the Org Service / Web API / Power Automate, bypassing the Resolver's C-006 justification check. | High | Low | **Resolved by ADR-12** (defense-in-depth): synchronous pre-operation plugin on the pin fields enforces justification for all write paths; column-level auditing on pin/justification fields makes any change tamper-evident; dedicated `Manage Production Pin` privilege limits the actor set. Residual accepted: a System Administrator can disable the plugin step — documented, access-restricted, and audited, never claimed un-bypassable. Phase 6 (C-005) verifies. | New — resolved ADR-12 |
| P3-R-9 | **GoRules JDM editor abandonment** — GoRules Ltd ceases active development of the jdm-editor package before Horizon 2. | Medium | Low | Phase 4 build start: re-check repo maintenance health (as required by Phase 2 conditions). Horizon 2 design intent includes the PCRM-direct designer path that removes JDM dependency entirely. The PCRM format already provides independence. | Elevated from Phase 2 |
| P3-R-10 | **Zustand state management choice debt** — Zustand is adequate for Horizon 1 designer complexity but may not scale to the Horizon 2/3 features (visual debugger, analytics, AI assist side panels). | Low | Low | State store boundary design (Section 14.4) is modular by concern. Migration from Zustand to a more structured solution (Redux Toolkit) is a contained refactor within the designer, not a cross-cutting change. Monitor complexity as Horizon 2 features are added. | New |

---

## 20. Recommendations

### 20.1 Immediate Phase 4 Priorities

1. Begin Phase 4 with a mandatory NCalc expression compatibility spike (one to two developer-days): enumerate every ZEN expression construct emitted by JDM formula nodes; attempt mapping to NCalc; document all coverage gaps. This gates all runtime work and must complete before runtime sprint 1.
2. Build the Rule Translator before the runtime evaluator. The PCRM JSON is the evaluator's input contract; the translator produces it; the evaluator is worthless without a correctly-shaped PCRM.
3. Prototype the end-to-end authoring path (designer → save → PCRM → CRM → load) before any governance or trace features. This proves both architectural spines.

### 20.2 Phase 5 QA Requirements

1. A dedicated conformance test category for cloud and on-prem parity: identical input + version → identical output, executed on both platforms with identical PCRM payloads.
2. A dedicated WASM degraded-mode usability test session: measure the 30-minute benchmark for formula authoring without autocomplete (ADR-10 requires this).
3. A performance benchmark test: Standard Decision Profile ceiling case (100 conditions, 200-row table, 5 chained sub-decisions) measured at P95 on both platforms.

### 20.3 Security Guidance for Phase 6

1. Verify that no CRM API path (Web API, Org Service, Power Automate) can UPDATE or DELETE a Rule Audit record or Rule Execution Log record.
2. Verify that the Pre-Validation plugin on Rule Version rejects updates to Published and Retired records when called with System Administrator credentials.
3. Verify that field-level security on trace records is honoured — restricted field values must not appear in trace records for identities that lack field access.

---

## Appendix A — Cloud / On-Premises Feature Matrix (C-001 Resolution)

This matrix is the authoritative disclosure document for which EDP capabilities require cloud connectivity. All customer-facing materials must derive from this table.

| Capability | On-Prem (CRM 9.x) | Cloud (D365 Online / Dataverse) | Notes |
|-----------|------------------|---------------------------------|-------|
| Rule Designer (visual authoring) | Full | Full | Web resource host on both |
| Decision Table authoring | Full | Full | |
| Condition/Expression Tree authoring | Full | Full | |
| Formula/Calculation authoring | Full | Full | NCalc-based; no WASM required |
| Expression autocomplete in designer | Not Available | Not Available | WASM COOP/COEP header limitation (both); Horizon 2 cloud re-evaluation |
| Inline expression validation | Not Available | Not Available | Same as above; save-time validation available on both |
| Metadata Service (entity/field picker) | Full | Full | Org Service on-prem; Web API on cloud |
| Metadata Cache refresh | Full | Full | Version token check on both |
| Rule Storage (CRM entity records) | Full | Full | CRM entities on-prem; Dataverse tables on cloud |
| Rule Versioning (draft/published) | Full | Full | |
| Rule Publication (lifecycle state machine) | Full | Full | |
| Plugin entry point | Full | Full | |
| Custom Action entry point | Full | Full | |
| Custom API entry point | Not Available | Full | Custom API is Dataverse-only |
| Workflow Activity entry point | Not Available (Horizon 2) | Not Available (Horizon 2) | Deferred to Horizon 2 for both |
| Lightweight API → Custom Action (on-prem) | Full | Not Applicable | On-prem external invocation path |
| Simulation | Full | Full | |
| Rule Testing (test cases) | Full | Full | |
| Execution Trace (append-only log) | Full | Full | |
| Governance Audit Trail | Full | Full | |
| Segregation of Duties enforcement | Full | Full | |
| Version pinning with governance justification | Full | Full | Enforced when environment is flagged Production |
| JSON Import/Export | Full | Full | |
| Excel Import/Export | Not Available (Horizon 2) | Not Available (Horizon 2) | Deferred to Horizon 2 |
| Solution deployment (managed) | Full | Full | Standard solution import; PAC CLI on cloud |
| PAC CLI deployment | Not Applicable | Full | |
| Multi-language designer UI | Partial (metadata labels localised; UI base is English) | Partial | Full multi-language UI in Horizon 2 |
| Execution Analytics dashboards | Not Available (Horizon 2) | Not Available (Horizon 2) | Horizon 2 |
| Visual Debugger (step-through trace) | Not Available (Horizon 2) | Not Available (Horizon 2) | Horizon 2 |
| AI-Assisted Rule Generation | Not Available | Not Available (Horizon 3) | Requires cloud AI service; on-prem permanently unavailable |
| AI Rule Explanation | Not Available | Not Available (Horizon 3) | Same |
| Rule Marketplace (ISV Packs) | Not Available | Not Available (Horizon 3) | |
| Advanced Simulation (historical replay) | Not Available (Horizon 3) | Not Available (Horizon 3) | |

---

## Appendix B — EDP Competitive Parity Checklist (C-004 Resolution · verified 2026-07-27, Flowon added 2026-07-28, North52 data-reach rows refreshed 2026-08-18)

This table is the authoritative input for sales positioning and go-to-market. "EDP Superior" means EDP delivers meaningfully better capability than North52's current offering. "North52 Superior" means North52 has a capability EDP does not.

**Revised 2026-07-27 (condition C-B4).** The original table was written in Phase 3 against *design intent* and was never reconciled against what was subsequently built. An audit found it inaccurate in both directions — it overstated four capabilities, understated four that have since shipped, and omitted five capabilities entirely, including two of North52's most-used features. Every row below was re-verified against the live environment (`org5869857f`) and the committed registration manifest on 2026-07-27.

**The `EDP today` column states build state explicitly**, because conflating "designed", "merged" and "running" is what produced the original errors:

| Marker | Meaning |
|---|---|
| **LIVE** | Deployed and verified in the environment; a customer can use it |
| **MERGED** | Code on `main`, not deployed anywhere |
| **PARTIAL** | Works, with a stated limitation |
| **DESIGN** | Specified only; no implementation |
| **NONE** | Not built and not designed |

**Rule for using this document:** never quote a row to a customer without its build-state marker. A LIVE row is a demonstrable claim; a MERGED or DESIGN row is a roadmap statement and must be presented as one. `UNVERIFIED` means exactly that — do not claim it in either direction.

### Competitors tracked, and how strong the evidence is

Evidence quality differs by column and **must not be flattened**. Overstating a competitor's weakness is the same class of error as overstating our own strength.

| Column | Source | Confidence |
|---|---|---|
| **EDP** | Live environment `org5869857f` + committed registration manifest, re-verified each release | **High** — demonstrable |
| **North52** | Public product documentation. Data-reach rows re-verified against North52's own function documentation 2026-08-18 (EDP-GAP-001); all other rows still as of Phase 3 | **Mixed** — data-reach rows **medium-high** (documented functions); everything else **medium**, not re-verified since 2026-07-03 |
| **Flowon** | Vendor's own product page and its interactive product demos, walked 2026-07-28 (`flowon.com/dataverse/logic-composer`) | **Low-to-medium** — vendor marketing claims and simulated UI, **not hands-on use, not documentation review, not a trial tenant** |

**Flowon rows are what the vendor says it does.** Treat every Flowon "Yes" as an unverified vendor claim. Before any Flowon row is used in a competitive deal, it must be confirmed against their documentation or a trial. The North52 column was stale; its **data-reach rows were refreshed 2026-08-18** against North52's published function reference (§B.8). The remainder of the North52 column is still unrefreshed and should be completed on the same standard.

Flowon also ships adjacent products not compared here (Process Orchestrator, API Builder, MCP Server, CLI Tools) and an on-premises D365 CE line. This appendix compares **Logic Composer only**.

### B.1 Authoring

| Capability | North52 | Flowon *(claimed)* | EDP today (verified) | Roadmap | EDP position |
|---|---|---|---|---|---|
| Visual decision table authoring | Yes | Yes — first-match, multi in/out, wildcards | **LIVE** | — | Parity |
| Condition / expression authoring | Yes | Yes | **LIVE** — AND/OR/NOT builder | — | Parity |
| Formula / calculation authoring | Yes | Yes — claims 200+ functions | **LIVE** — NCalc, 31 bridge functions | — | Parity (function breadth unconfirmed both sides) |
| Decision graph (node-based) | Limited | Yes — drag-drop **decision tree**, path-based | **LIVE** — JDM editor, 6 node types incl. switch | — | Parity |
| Metadata-driven field selection | Partial | Not stated | **LIVE** — business names, no schema names | — | **EDP Superior** |
| Cross-entity conditions (N:1) | Yes | Yes — read related records during computation | **LIVE** | — | Parity |
| Child aggregation in conditions (1:N) | Yes — `FindSumFD`, `FindECCount` over arbitrary FetchXML | Not stated | **LIVE** — Count/Sum/Avg/Min/Max + filter, **single hop, anchored to the target record, filter value must be a literal** | Widen | **North52 Superior** *(revised 2026-08-18, was Parity)* |
| **Query an arbitrary record population from inside a rule** | Yes — `FindRecordsFD` / `FindRecordsFetchXml`, parameterised at runtime via `SetParams()` | Yes — read related records during computation | **NONE** — every read is anchored to `target.Id`; there is no population search | Wave 2, guard-railed | **North52 Superior** *(added 2026-08-18)* |
| **Collection type and iteration over records** | Yes — `ForEachRecord`, `ForEachInline` (nested), `CurrentRecord()`, `RecordIndex()` | Yes — Loop construct in Logic Flow | **NONE** — the value system is scalar-only; the formula engine raises an error on collection aggregates by design | GAP-01, highest-value engine investment | **Both Superior** *(added 2026-08-18)* |
| Multi-level child traversal (parent → child → grandchild) | Yes — via FetchXML link-entity | Not stated | **NONE** — single hop only | Widen | **North52 Superior** *(added 2026-08-18)* |
| Reason codes on outcomes | No | Not stated | **LIVE** | — | **EDP Superior** |
| Reusable validation rules | Partial | Yes — **Validation Sets** applied across entities | **PARTIAL** — validation is per rule, not a reusable set | Consider | **Flowon Superior** |
| Rule cloning | Yes | Not stated | **LIVE** | — | Parity |
| Rule templates | Yes | Yes — Templates tab on every block | **PARTIAL** — API live, designer UI not wired | Wire UI | Behind |
| Excel import/export of rules | Yes | Not stated | **NONE** | H2 | **North52 Superior** |
| JSON import/export | Limited | Not stated | **LIVE** | — | **EDP Superior** |
| Self-documenting artifacts | No | Yes — Docs title/description on every artifact | **PARTIAL** — descriptions exist, not a first-class docs pane | Consider | **Flowon Superior** |
| Multi-language authoring UI | Partial | Partial | **PARTIAL** — CRM field labels localise; EDP UI chrome is English only | H2 | Behind |

### B.2 Invocation — the weakest area, and the reason EDP-BIND-001 exists

| Capability | North52 | Flowon *(claimed)* | EDP today (verified) | Roadmap | EDP position |
|---|---|---|---|---|---|
| **Server-side trigger on record events** | Yes | **Yes — "Logic Recipe"**, binds to Create/Update/Delete on any entity; markets itself as "replaces C# plugins entirely" | **NONE** — 0 SDK steps registered on any business entity | EDP-BIND-001 | **Both Superior** |
| **Execution phases per event** | Partial | Yes — **Validation / Before / After** per event type | **NONE** | EDP-BIND-001 | **Flowon Superior** |
| **Blocking validation that cancels the operation** | Yes | Yes — Validation phase cancels and shows the error to the user | **NONE** | EDP-BIND-001 (FR-B17) | **Both Superior** |
| **Sync and async execution modes** | Yes | Yes — per step, tagged Sync/Async | **NONE** | EDP-BIND-001 (OQ-B2) | **Both Superior** |
| **Client-side / form-level formulas** | Yes | **Not offered** — every construct is server-side | **NONE** — no form integration exists | EDP-BIND-001 | **North52 Superior** |
| **Write-back of outputs to record fields** | Yes | Yes — Logic Flows have full create/update/delete access | **DESIGN** — ADR-EDS-07, consumer-performed | EDP-BIND-001 | **Both Superior** |
| Multi-step stateful orchestration | Partial | Yes — **Logic Flow**: loops, switch, error handling, mid-flow block calls | **NONE** — the runtime is deliberately side-effect-free | Separate BRD | **Flowon Superior** |
| Scheduled / time-based execution | Partial | Yes — **Schedule**, 5 frequencies, native background job, run history | **NONE** | Separate BRD | **Flowon Superior** |
| Outbound REST integration | **Yes** — `CallRestAPI` (method, headers, params, auth, typed response variables) plus **WebFusion** *(revised 2026-08-18, was Partial)* | Yes — **Service Connection**: OpenAPI import, OAuth2 / API key / Basic | **NONE** — the runtime has no HTTP client, by design | Separate BRD | **Both Superior** *(was Flowon Superior)* |
| Publish/subscribe events between artifacts | No | Yes — **Events**: definitions, multiple handlers, sync + async, immutable log | **NONE** | Separate BRD | **Flowon Superior** |
| Rollup / cross-record aggregate formulas | Yes | Not stated | **NONE** | Separate BRD | **North52 Superior** |
| Workflow activity entry point | Yes | Yes — can trigger Business Processes from a recipe phase | **NONE** | Separate BRD | **Both Superior** |
| Plugin-based execution | Yes | Yes | **PARTIAL** — a plugin backs the Custom API, but nothing is registered on business entities, so there is no automatic execution | EDP-BIND-001 | **Both Superior** |
| Custom Action entry point (on-prem) | Yes | Yes — separate D365 CE on-prem product line | **PARTIAL** — code and runbook complete, never tested | Test on an instance | Behind |
| Custom API entry point (cloud) | No | Not stated | **LIVE** — 22 APIs, privilege-gated | — | **EDP Superior** |
| REST API + SDKs for external callers | No | Adjacent product (API Builder), not Logic Composer | **MERGED** — gateway, OpenAPI 3.1, TS and .NET SDKs | Deploy | **EDP Superior** |

### B.3 Governance — the primary differentiator

| Capability | North52 | Flowon *(claimed)* | EDP today (verified) | Roadmap | EDP position |
|---|---|---|---|---|---|
| Rule versioning, immutable once published | Basic | Claims "versioned in Git, readable by anyone" — no in-product immutability described | **LIVE** | — | **EDP Superior** |
| Approval workflow | No | **Not offered** | **LIVE** — 4-state lifecycle, two-stage maker-checker | — | **EDP Superior** |
| Segregation of duties | No | **Not offered** | **LIVE** | — | **EDP Superior** |
| Append-only audit trail | No | Partial — Events are "immutable and timestamped"; no governance trail described | **LIVE** — guarded at the data layer | — | **EDP Superior** |
| Version pinning | No | **Not offered** | **LIVE** | — | **EDP Superior** |
| Enforced justification for a production pin | No | **Not offered** | **MERGED** — guard not deployed; pinning is live but justification is *not yet enforced* | W0-1 cutover | EDP Superior once deployed |
| Effective dating / scheduled activation | No | **Not offered** | **LIVE** | — | **EDP Superior** |
| Governed rule sets and ordered chaining | Partial | Partial — ordered steps within a recipe phase, no governance over the set | **LIVE** | — | **EDP Superior** |
| Centralised config / thresholds | Partial | Yes — **Configuration Variables**, typed, environment-aware, cached | **UNVERIFIED** — a `qdb_edp_ruleconfiguration` entity exists; whether it is surfaced to authors is unconfirmed | Verify | **Flowon Superior** |
| Centralised localised strings | No | Yes — **Localized Resources** resolved by user language | **NONE** | Consider | **Flowon Superior** |

### B.4 Quality, insight and operations

| Capability | North52 | Flowon *(claimed)* | EDP today (verified) | Roadmap | EDP position |
|---|---|---|---|---|---|
| Simulation / what-if before publishing | No | Partial — a **Run** command exists on artifacts | **LIVE** | — | **EDP Superior** |
| Built-in test cases with pass/fail | No | **Not offered** | **LIVE** — scenarios block publish on failure | — | **EDP Superior** |
| Table completeness / overlap analysis | No | **Not offered** | **LIVE** | — | **EDP Superior** |
| Execution trace per decision | Limited | Not stated | **LIVE** — full step trace | — | **EDP Superior** |
| Decision explanation grounded in trace | No | **Not offered** | **LIVE** | — | **EDP Superior** |
| Execution analytics / aggregate reporting | No | **Not offered** | **LIVE** — dashboard + API | — | **EDP Superior** |
| Rule dependency impact analysis | No | **Not offered** | **LIVE** — graph + API | — | **EDP Superior** |
| Version comparison / diff | No | **Not offered** | **LIVE** | — | **EDP Superior** |
| Execution log export | Partial | Not stated | **LIVE** — CSV | — | Parity |
| Visual step-through debugger | No | Not stated | **NONE** | H2 | Parity (both lack) |
| AI-assisted rule generation | No | Adjacent product (MCP Server), not Logic Composer | **DESIGN** — Phase 6, not built | H3 | Parity today |
| Rule marketplace / template packs | No | **Not offered** | **DESIGN** | H3 | Parity today |

### B.5 Platform and deployment

| Capability | North52 | Flowon *(claimed)* | EDP today (verified) | Roadmap | EDP position |
|---|---|---|---|---|---|
| Data residency (in-tenancy) | Yes | Yes — executes natively inside Dataverse | **LIVE** | — | Parity |
| Zero external infrastructure for the core | Yes | Yes — "no Azure Functions, no external schedulers" | **LIVE** — the gateway is an optional tier, not required | — | Parity |
| No deployment cycle per logic change | Yes | Yes — "save and the change is active" | **PARTIAL** — rule changes are instant, but any *runtime* change needs a signed assembly deploy | — | Parity on rules |
| Cloud and on-prem parity | Yes | Yes — separate D365 CE on-prem product line | **PARTIAL** — on-prem path is code-complete but unproven | Test on an instance | Behind |
| Managed-solution deployment | Yes | Not stated | **PARTIAL** — deployment is by API script; managed packaging is unverified | Verify | Behind |

### B.6 Summary for go-to-market positioning

**Where EDP is decisively ahead — all LIVE and demonstrable:** governance is the story, and adding a second competitor strengthened rather than weakened it. A four-state lifecycle with two-stage maker-checker, segregation of duties, an append-only trail guarded at the data layer, simulation and saved test scenarios that block a failing publish, effective dating, full execution traces and grounded decision explanations. **Neither North52 nor Flowon offers any of these.** Flowon's entire governance claim is that logic is "versioned in Git, readable by anyone" — that is source control, not governance, and it does not answer who approved a change, whether an approver was distinct from the author, or what the system decided last Tuesday and why. For a regulated buyer this remains the whole argument, and every claim in it can be demonstrated today.

**Where EDP is behind — and it is one coherent area, not a scattering of niche gaps.** The original table framed the deficit as four minor items (workflow activities, cloning, templates, Excel). That framing was wrong. The real deficit is **invocation**:

> EDP can author, govern, publish and explain a decision — but cannot make one *happen* on its own. There is no record-event trigger and no form-level execution. A published rule stays inert until a developer writes code to call it.

That is North52's core usage pattern **and Flowon's entire product thesis** — Flowon markets its Logic Recipe as "replaces C# plugins entirely." It is a single connected gap rather than a feature list. `EDP-BIND-001` addresses it. Until that ships, **EDP is not a drop-in replacement for either incumbent**, however strong the governance story is, and it should not be positioned as one.

**Flowon widens the second front: EDP cannot *act*, only decide.** North52 exposed the trigger gap; Flowon exposes a larger one. Its Logic Flow, Schedule, Service Connection and Events constructs let logic write records, run on a timer, call external APIs with managed OAuth, and fan out through publish/subscribe. EDP's runtime is **deliberately side-effect-free** (ADR-EDS-07) and has none of this.

That is a legitimate architectural position, not an oversight — side-effect-freedom is what makes decisions reproducible and explainable. But it must be sold as a *decision engine*, not as a logic platform. Against a customer evaluating Flowon for orchestration, EDP is not competing for the same job, and pretending otherwise loses the deal on a demo.

**One useful datapoint from Flowon:** it ships **no client-side/form execution at all** — every construct is server-side. A serious competitor built this way weakens, though does not settle, the concern behind `OQ-B1` (that ADR-06's server round trip is commercially unacceptable). North52 does offer client-side formulas, so the question stands.

**Secondary gaps:** rollup formulas, workflow activities, Excel rule import/export, reusable validation sets, centralised localised strings, authoring-UI localisation, an unproven on-prem path, and unverified managed-solution packaging.

**Corrections applied 2026-07-27 (C-B4).** Recorded so the same drift is visible if it recurs:

| Row | Was | Now | Direction |
|---|---|---|---|
| Plugin entry point | Parity | North52 Superior — nothing registered on business entities | **Overstated** |
| Client-side formulas | *absent from the table* | North52 Superior | **Omitted** |
| Server-side triggers | *absent from the table* | North52 Superior | **Omitted** |
| Write-back | *absent from the table* | North52 Superior (design only) | **Omitted** |
| Rollup formulas | *absent from the table* | North52 Superior | **Omitted** |
| Custom Action / on-prem parity | Parity | Partial — never tested | **Overstated** |
| Managed-solution deployment | Parity | Partial — unverified | **Overstated** |
| Pin justification | EDP Superior | Superior *once deployed* — guard is merged, not running | **Overstated** |
| Approval workflow | "design intent, 2-state" | LIVE, 4-state, two-stage maker-checker | **Understated** |
| Rule cloning | North52 Superior | Parity — it was built | **Understated** |
| Execution analytics | "No" | LIVE — dashboard and API | **Understated** |
| Dependency impact analysis | "No" | LIVE — graph and API | **Understated** |

**Root cause:** the table was authored in Phase 3 against design intent and never reconciled against the built system, so it drifted in both directions as the product moved. The `EDP today` build-state column exists to make that drift visible on sight. **This table should be re-verified against the environment at every release**, and it carries a verification date for that reason.

### B.7 Flowon added 2026-07-28 — what it changed

Adding a second competitor moved the picture in both directions:

| Effect | Detail |
|---|---|
| **Governance case strengthened** | Flowon offers no approval workflow, no SoD, no pinning, no effective dating, no simulation gate, no dependency analysis. Two independent competitors lacking all of it makes governance a category gap, not a North52 weakness. |
| **A second gap opened** | Flowon does what EDP deliberately will not: write records, schedule work, call external APIs, publish events. EDP must be positioned as a decision engine, not a logic platform. |
| **Design validated** | Flowon's Logic Recipe independently confirms EDP-BIND-001's shape — per-entity binding, Validation/Before/After phases, per-step sync/async, blocking validation. Its **one recipe per entity** model is a cleaner answer to step ordering than the multi-binding ordering in FR-B9 and should be considered at architecture. |
| **Evidence weakened** | The Flowon column is vendor marketing, not verified use. It is explicitly marked as such and must be confirmed before any competitive use. |

### B.8 North52 data-reach rows refreshed 2026-08-18 (EDP-GAP-001)

A candidate customer requirement — duplicate invoice detection with unit-price
threshold checks — was analysed for feasibility against the built engine
(`gap-analysis-duplicate-invoice-detection.md`). Establishing whether EDP could
deliver it required checking what the incumbents actually do, which produced the
first partial refresh of the stale North52 column.

**Refreshed on documented functions, not hands-on use.** Confidence is
medium-high for these rows and unchanged elsewhere.

| Row | Was | Now | Direction |
|---|---|---|---|
| Child aggregation (1:N) | Parity | North52 Superior — `FindSumFD` / `FindECCount` over arbitrary FetchXML vs our single-hop, target-anchored, literal-filtered fold | **Overstated** |
| Query an arbitrary record population | *absent from the table* | North52 Superior — `FindRecordsFD`, `SetParams()` | **Omitted** |
| Collection type and iteration | *absent from the table* | Both Superior — `ForEachRecord` / `ForEachInline` | **Omitted** |
| Multi-level child traversal | *absent from the table* | North52 Superior — FetchXML link-entity | **Omitted** |
| Outbound REST integration | Partial | Yes — `CallRestAPI` + WebFusion | **Understated (competitor)** |

**What this changes in the positioning.** The invocation gap recorded in B.6 is
narrower than the real deficit. North52 does not merely *trigger* where EDP
cannot — it can **reach data** EDP cannot: other records, other tables, multiple
relationship levels, and external REST endpoints. On the analysed requirement,
North52 covers all five checks with no C# at all, where EDP covers two.

The honest counter is unchanged and remains strong: a nested `ForEachRecord`
over a fetched collection, calling a REST API, is code in everything but name —
proprietary formula text with no source control, tests, debugger, approval
workflow or simulation. For a control governing payment release that distinction
is the argument, and EDP still holds every governance row in B.3.

**GAP-01 — no collection type — is identified as the single highest-value engine
investment.** It is what separates EDP from the DMN, Drools and IBM ODM tier,
all of which express set-based logic natively while sharing EDP's "facts are
supplied to us" data posture.

**Open action (reduced, not closed):** the remaining North52 rows — authoring,
governance, and the B.4/B.5 groups — have still not been re-verified since
2026-07-03 and remain the least trustworthy part of this table. They should be
refreshed on the same standard before the next competitive cycle.

---

## Appendix C — ADR Index

| ADR | Title | Status | Date | Decided by |
|-----|-------|--------|------|------------|
| ADR-01 | GoRules Designer-Only — ZEN Runtime Excluded | Accepted | 2026-07-03 | Architect |
| ADR-02 | Native C# Runtime — Build, Not Adopt | Accepted | 2026-07-03 | Architect |
| ADR-03 | Platform Canonical Rule Model Over Raw JDM Storage | Accepted | 2026-07-03 | Architect |
| ADR-04 | Metadata-Driven Authoring — Business Terms Over Schema Names | Accepted | 2026-07-03 | Architect |
| ADR-05 | CRM-Native — Zero External Infrastructure | Accepted | 2026-07-03 | Architect |
| ADR-06 | Single Runtime — No Per-Channel Evaluators | Accepted | 2026-07-03 | Architect |
| ADR-07 | React Web Resource — Deviation from Next.js Default | Accepted | 2026-07-03 | Architect |
| ADR-08 | Platform Independence — PCRM Over Vendor Formats | Accepted | 2026-07-03 | Architect |
| ADR-09 | Governance-Justified Version Pinning in Production (C-006) | Accepted | 2026-07-03 | Architect (mandated by CEO) |
| ADR-10 | Designer Host — WASM Degraded Mode Accepted (P2-OI-001) | Accepted | 2026-07-03 | Architect |
| ADR-11 | Expression Engine — NCalc Selected Over DynamicExpresso (P2-OI-002) | Accepted | 2026-07-03 | Architect |
| ADR-12 | Defense-in-Depth Enforcement of Version-Pin Governance (P3-R-8, Challenge 6) | Accepted | 2026-07-03 | Architect (mandated by user) |

---

## Skeptic Review

**The Skeptic speaks now. Every major decision above is challenged.**

> CHALLENGE 1 — Platform Canonical Rule Model (PCRM): The PCRM is a vendor-neutral format owned by Maqsad. Who owns the schema evolution process? If the team building Phase 4 adds a new NCalc function, do they update the PCRM schema? If yes, that creates a tight coupling between runtime implementation details and the "stable" contract schema. If no, the schema will drift from reality. A governance process for PCRM schema changes must be defined before Phase 4 starts — not assumed.

> CHALLENGE 2 — Rule Translator Accuracy: The JDM-to-PCRM translation is complex mapping logic built and maintained by the EDP team. What happens at 3am when a production rule fails because a JDM graph construct the translator has not seen before produces a silent mis-mapping? The translation output is the ONLY thing the runtime sees. A translation defect is indistinguishable from a rule defect to the business user. The translator needs its own independent test suite with 100% JDM construct coverage before Phase 4 ships anything.

> CHALLENGE 3 — NCalc ZEN Compatibility Assumption: ADR-11 says "ZEN date and string expression constructs are mapped to custom NCalc function registrations." This is stated as fact but it has not been proven. The ZEN expression language's date operations (`.age()` method syntax, period arithmetic) may not be translatable to NCalc's function-call syntax without significant parser work. The "mandatory spike" in Section 20.1 is the right call — but if that spike fails and a BUILD decision is required for the expression parser, Phase 4's timeline shifts materially. Is there a contingency timeline?

> CHALLENGE 4 — Metadata Cache Staleness at 3am: The CRM metadata version token check requires a live API call at designer startup. On a large on-prem environment with 500+ entities, `RetrieveAllEntitiesRequest` can take 10–30 seconds. If the cache is stale at 9am Monday after a Friday model change, every designer open triggers a full cache rebuild. The user experience impact is not designed for. What is the maximum acceptable cache rebuild time? What does the designer show the author during a rebuild?

> CHALLENGE 5 — Performance at 10x Load: The Section 17 performance strategy notes that 100,000 executions per day is the design target. At 10x (1M/day), the Rule Execution Log write (Post-Operation synchronous plugin) becomes a CRM write bottleneck — Dataverse Online's Write API limit is enforced per organisation. Has the write path for the execution log been sized against Dataverse API concurrency limits? What happens when writes are throttled — are decisions blocked or is the trace dropped?

> CHALLENGE 6 — Production Pinning Enforcement Gap: The pinning justification is enforced by the Rule Resolver based on `mql_edp_IsProductionEnvironment`. A developer with CRM Administrator access can set `mql_edp_IsProductionEnvironment = false` in the production environment, bypassing all pinning governance. This is not a theoretical attack — it is a one-field change by any user with Solution Customizer or System Administrator privilege. The enforcement mechanism must not be bypassable by a configuration change that itself has no audit trail.
> **RESOLVED by ADR-12 (2026-07-03):** the production designation is moved out of a mutable CRM field into a deployment-controlled, column-audited, privilege-gated Environment Variable; changes raise a high-severity audit event. The one-field bypass is closed for all normal write paths. The irreducible System-Administrator residual is documented, access-restricted, and tamper-evident — never claimed un-bypassable.

> CHALLENGE 7 — Zustand State Management at Horizon 2+ Complexity: Section 14.4 defers the concern. The visual debugger (Horizon 2) requires maintaining a step-by-step execution state that the designer can replay — a fundamentally different state model from the current rule-definition-edit state. If Zustand is in place and the Horizon 2 team reaches for Redux Toolkit, they face a mid-flight refactor of all existing stores. This is a known-unknown that should be designed for now, not discovered in Horizon 2.

> CHALLENGE 8 — Complexity Ceiling Calibration: The SDP ceiling (100 conditions, 200 rows, 5 nesting levels) is a design assumption, not a measured value. What if the NCalc evaluator handles a 200-row decision table in 20ms, meaning the real ceiling could safely be 500 rows? Or what if the PCRM deserialisation alone takes 400ms for a 200-row PCRM document, blowing the budget? The ceiling must be MEASURED, not assumed. Phase 4 sprint 1 must include a benchmark harness that measures rule load + PCRM deserialisation + evaluation against multiple complexity profiles on both cloud and on-prem.

> CHALLENGE 9 — Managed Solution Upgrade Conflict Risk: The upgrade strategy (Section 4.7) says "breaking schema changes are disallowed." What if Horizon 2 requires adding a required attribute to `mql_ruleversion`? Required attributes on an existing managed entity cannot be added without a migration — and CRM managed-solution upgrades that add required attributes on entities with existing records fail unless a data migration runs simultaneously. This is a known CRM ALM trap. The architecture must commit to: all new attributes are optional with platform-side defaults, and the platform treats missing optional attributes as their defaults at runtime.

> CHALLENGE 10 — GoRules Editor Lock-in via JDM Source Storage: The JDM source JSON (`mql_jdmsource`) is stored per Rule Version for round-trip editing. If GoRules JDM Editor is replaced, the historical JDM source is useless to the new editor. Authors trying to edit old rules in the new designer will have nothing to start from except the PCRM JSON — which is the execution format, not an editable authoring format. The designer replacement strategy (Section 15.5) acknowledges this but does not resolve it. If the new designer edits PCRM directly (the stated mitigation), the PCRM must be designed with author-friendliness in mind — field aliases must be readable, logic must be structured for a UI to render. Is the current PCRM conceptual design (Section 6.3) designed for both machine readability AND human editability?

> CHALLENGE 11 — On-Prem Metadata Custom Action Performance: On large on-prem CRM environments, calling `RetrieveAllEntitiesRequest` inside a Custom Action returns a response that may be 10+ MB of metadata XML before serialisation. The designer makes this call on startup. This is not covered in the caching design's "200ms P95 for metadata cache read from CRM entity" — that target assumes the cache is warm. What is the acceptable cold-start time for the metadata cache on a large on-prem environment, and what does the designer show while it initialises?

**These challenges must be addressed before Phase 4 begins.**

---

*End of Document — EDP-BRE-001 Phase 3 Detailed Architecture (Platform Foundation)*
*This document is authoritative for Phase 4. Changes require a formally approved ADR.*
*Prepared by: Maqsad AI — Solution Architect | Date: 2026-07-03*
