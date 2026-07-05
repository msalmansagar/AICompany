# Enterprise Decision Platform — Visual Rule Designer Design Specification

**Engagement ID:** EDP-BRE-001
**Phase:** 4 — Technical Design (Product Phase 2: Visual Rule Designer)
**Module:** Business Rules Engine (BRE)
**Parent Product:** Maqsad Low-Code Platform
**Document Type:** Design Specification — sufficient for developer implementation
**Date:** 2026-07-04
**Status:** AUTHORITATIVE — Phase 4 Build Input

---

## Authority Clause

This document conforms to:
- `phase-0-architecture.md` — Architectural Invariants and Appendix B (non-negotiable)
- `phase-3-arch.md` — Domain Model (§3), PCRM (§6), Metadata Architecture (§7–8), React Foundation (§14), GoRules Integration Strategy (§15), Security Architecture (§10), ADRs ADR-01 through ADR-12 (§18)
- `dependencies.md` — Adoption decisions DEP-001 through DEP-013
- `spikes/p3-r1-ncalc-zen-coverage.md` — EDP Horizon-1 Expression Grammar (authoritative: 105 catalogued constructs, 31 EDP_* bridge functions, NATIVE/BRIDGE/GAP classification)
- `phase-3-skeptic-triage.md` — Design commitments C1/C7/C9/C10 and Phase 4 work items W2/W4/W5/W8/W11

All decisions in the above documents are final and are incorporated without re-opening. Changes to any decision in this document require a formally approved Architecture Decision Record (ADR). Designer-specific ADRs are prefixed ADR-D to avoid colliding with platform ADRs ADR-01 through ADR-13.

This document is DESIGN SPECIFICATION ONLY. No C#, React/TypeScript, or any other production code is produced here. Conceptual JSON illustrations and ASCII layout sketches are permitted where they serve clarity.

---

## Table of Contents

1. Executive Summary
2. Phase Scope
3. Explicit Non-Scope
4. Visual Rule Designer Architecture
5. GoRules Embedding Strategy
6. Degraded WASM Impact and Mitigation
7. Canonical Rule Model Interaction (Generate and Render-Back)
8. Rule Save / Load / Render Flow
9. CRM Metadata Picker Design
10. Field Type-Aware Authoring
11. Operator Matrix
12. Expression Builder
13. Formula Builder
14. Decision Table Designer
15. Rule Template Design
16. Validation Framework
17. React Architecture
18. CRM Web Resource Packaging
19. PCF Evaluation
20. UX Layout
21. Security Considerations
22. Performance Considerations
23. Accessibility
24. Localization
25. Error Handling
26. Risks and Mitigations
27. Architecture Decision Records (Designer-Specific)
28. Acceptance Criteria

---

## 1. Executive Summary

The Visual Rule Designer is the business-user authoring surface of the Enterprise Decision Platform Business Rules Engine. It is a single-page React application deployed as a set of CRM web resources inside a standard Dynamics CRM / Dataverse solution. It hosts the GoRules JDM Editor as the structural design canvas for decision graphs, decision tables, and formula nodes, and wraps that canvas with a suite of platform-owned capabilities that GoRules cannot and should not provide: a CRM Metadata Picker, field-type-aware operator selection, an Expression Builder, a Formula Builder aligned to the bounded EDP Horizon-1 Expression Grammar, a Validation Framework, a Rule Save/Load pipeline that produces and consumes both JDM source JSON (designer round-trip) and Platform Canonical Rule Model JSON (runtime contract), lifecycle governance controls, and a business-readable rule summary.

The designer is the only surface through which Business Analysts author rules. They operate entirely in display-name terms — "Loan Amount greater than 500,000 and Risk Rating equals High" — and never see logical schema names, option-set integer values, or GUID identifiers. The platform resolves all display terms to stable CRM metadata identifiers at save time and reverses the mapping at load time.

GoRules JDM Editor operates in degraded WASM mode per ADR-10: structural graph authoring, decision table editing, and formula text input are fully functional; ZEN expression autocomplete and inline validation are unavailable and are replaced by save-time platform-owned grammar validation and an in-designer expression syntax quick-reference panel.

This specification defines 28 numbered design sections and maps all 38 required designer features. The formula function set is explicitly reconciled to the EDP-H1 grammar: scalar `Min(a,b)` and `Max(a,b)` are available in H1 via NCalc native functions; `Sum()` and `Average()` over collections are H2-deferred and shown visibly disabled in the formula function picker with an "H2" badge.

---

## 2. Phase Scope

The Visual Rule Designer (Phase 2 product scope) covers:

**Authoring surfaces:**
- Rule Designer Home with rule list, search, filter, folder navigation, and create/edit entry points.
- Drag-and-drop decision graph canvas powered by the GoRules JDM Editor (structural authoring only, no WASM).
- Decision Table Designer with full row/column authoring, hit-policy selection, and row priority management.
- Expression Builder for IF/THEN/ELSE condition trees with AND/OR nesting, NOT logic, and parenthesised groups.
- Formula Builder with the EDP-H1 grammar function set, variable bindings, and output type alignment.
- Rule Variable Builder for declaring intermediate computed values within a rule.
- CRM Metadata Picker for entity, field, relationship, option-set, lookup, status, state, owner, customer, currency, date, and boolean selection — display-name-first, schema-stored.

**Governance and lifecycle controls:**
- Save as Draft, Submit for Review, Clone, Version Selector.
- Publish Prep (lifecycle state display, approval submission, transition controls).
- JSON Viewer (read-only PCRM preview), JSON Import, JSON Export.

**Supporting panels:**
- Business-Friendly Rule Summary panel (human-readable conditional preview generated from the rule graph).
- Validation / Error / Warning panel with categorised, actionable messages.
- Function Picker with H1 / H2-deferred categorisation.
- Template Selector for instantiating pre-authored rule templates.
- Documentation Preview panel (structured authoring notes on the rule version).
- Dependencies Preview panel (which rules reference this rule and which rules this rule references).

**Placeholder stubs (UI shells, no backend yet):**
- Test Rule panel stub.
- Execution Trace viewer stub.
- Audit History panel stub.

---

## 3. Explicit Non-Scope

The following are explicitly outside this Phase 4 design specification:

| Out-of-scope item | Reason |
|-------------------|--------|
| Native C# Rule Runtime implementation | Separate Phase 4 deliverable (backend). This spec produces JSON; the runtime reads it. |
| ZEN runtime or GoRules ZEN engine in any form | Phase 0 Invariant 5; ADR-01; sandbox incompatibility. |
| External hosting, Docker, Azure Functions, Node server | Phase 0 Invariant 2; ADR-05. |
| Next.js, Nuxt, Remix | Require a server; web resources are static bundles. ADR-07. |
| PCF as the designer host | Re-evaluated and reaffirmed here as web resource in Section 19. |
| AI-assisted rule generation | Horizon 3. Advisory only when built; never in execution path. |
| Visual step-through debugger | Horizon 2. The Execution Trace stub is a placeholder only. |
| Execution Analytics dashboards | Horizon 2. |
| Excel import/export | Horizon 2 (ClosedXML, DEP-005). |
| Rule Marketplace / ISV Pack management | Horizon 3. |
| Expression autocomplete in designer | Unavailable in degraded WASM mode (ADR-10). Mitigated by syntax reference panel and save-time validation. |
| Sum() / Average() over collections in Formula Builder | H2-deferred (array operations excluded from EDP-H1 grammar per spike P3-R-1, Section 2.5). Shown disabled with H2 badge. |
| Full ZEN expression column mode (`-` column) in Decision Table | H2-deferred per spike P3-R-1, Section 5.2 (U-11). Hidden in H1 designer. |
| Timezone-parameterised date functions (`.tz()`, `d("date","tz")`) | H2-deferred per spike P3-R-1 (D-03, D-04, D-26). UTC-only in H1. |

---

## 4. Visual Rule Designer Architecture

### 4.1 Position in the Platform

The Visual Rule Designer sits in the Experience Plane of the platform architecture (Phase 0 §9). It is the sole human-authored entry point into the Rule Repository. It does not invoke the native C# runtime at any point during authoring. Its only runtime dependency is the CRM Web API / Xrm.WebApi for data access.

```
Experience Plane
┌─────────────────────────────────────────────────────────────┐
│  Visual Rule Designer (React SPA — web resource)            │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ GoRules JDM      │  │ Platform-Owned Designer Layer    │ │
│  │ Editor           │  │  • Metadata Picker               │ │
│  │ (structural mode │  │  • Expression Builder            │ │
│  │  no WASM)        │  │  • Formula Builder (H1 grammar)  │ │
│  │                  │  │  • Decision Table Designer       │ │
│  │  emits JDM JSON  │  │  • Validation Framework          │ │
│  │  on save         │  │  • Save/Translate/Store pipeline │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ JDM JSON (save)              │ PCRM JSON (save/load)
         │                              │
         ▼                              ▼
   Rule Translator ────────► PCRM Validator ──► mql_ruleversion
   (browser-side TS)          (NJsonSchema-        CRM entity
                               compatible
                               schema check)
```

### 4.2 Three Layers of Responsibility

**Layer 1 — Structural Canvas (GoRules JDM Editor):** Renders the visual decision graph. Handles node drag-drop, connection drawing, decision-table grid cells, and formula-text input. Emits GoRules JDM JSON. Has no knowledge of CRM metadata, PCRM, or the EDP grammar.

**Layer 2 — Platform Wrapper (Platform-Owned Designer Layer):** Interposes on all structural inputs to inject metadata awareness. Replaces GoRules' field-selection UI with the CRM Metadata Picker. Adds the Expression Builder, Formula Builder, Operator Matrix, and Validation Framework as side panels and modal overlays. Manages the Save/Translate/Store pipeline.

**Layer 3 — Shell and Governance (Application Shell):** Loads authentication context, Feature Flags, Rule Configuration, and platform RESJSON strings. Handles routing between the designer, rule list, version selector, test stub, and administration views. Owns the governance lifecycle controls (state transition buttons, approval submission, clone, publish prep).

### 4.3 Data Flow Directions

| Direction | Path | Format |
|-----------|------|--------|
| Load for editing | CRM → mql_jdmsource → JDM Editor | GoRules JDM JSON |
| Save | JDM Editor → Rule Translator → PCRM Validator → CRM | JDM + PCRM (dual-write) |
| Load for display | CRM → mql_canonicaldefinition → Business Summary Generator | PCRM JSON |
| Runtime | CRM → mql_canonicaldefinition → Native C# Runtime | PCRM JSON only |

The designer always reads JDM source for editing. The runtime never reads JDM source. PCRM is the single runtime contract.

---

## 5. GoRules Embedding Strategy

### 5.1 Scope Boundary Restatement

`@gorules/jdm-editor` is the designer surface ONLY. Its responsibilities within this designer:
- Render a visual decision graph with nodes, edges, and panels.
- Provide decision-table grid editing (rows, columns, condition cells, output cells).
- Accept and emit GoRules JDM JSON on load/save.
- Render formula/expression text inputs (free-text fields; no autocomplete in degraded mode).

Its responsibilities stop there. It does NOT:
- Know anything about CRM metadata or schema names.
- Validate expressions against the EDP-H1 grammar.
- Produce PCRM JSON.
- Invoke any GoRules ZEN runtime (zero runtime coupling per ADR-01).

### 5.2 Initialisation Configuration

The JDM Editor component is initialised with the following configuration object (conceptual shape):

```json
{
  "defaultFilename": "<rule display name>",
  "hideExpressionEditor": false,
  "configurable": {
    "table": true,
    "inputSchema": true,
    "outputSchema": true
  },
  "components": {
    "decisionGraph": {
      "disabled": false
    }
  },
  "simulate": false,
  "mode": "designer"
}
```

Key configuration choices:
- `simulate: false` — disables the built-in ZEN simulation panel. Simulation is owned by the platform's Simulation Layer (Horizon 2), not GoRules.
- WASM is not initialised. `createDecisionEngine()` is not called. The WASM chunk is present as a web resource but not loaded. This is ADR-10 degraded mode.
- The editor's input/output schema UI fields are visible but are supplemented (not replaced) by the platform's Metadata Picker overlays — the platform injects selected metadata bindings as schema values into the editor.

### 5.3 JDM JSON Contract

The editor emits JDM JSON on every save event. The platform's save pipeline treats this as the input to the Rule Translator. The JDM JSON is:
1. Validated for structural integrity (well-formed JSON, valid JDM schema).
2. Passed to the Rule Translator which produces PCRM JSON.
3. Both JDM and PCRM are written to the Rule Version CRM record in a single atomic update.

The editor receives JDM JSON on load (from `mql_jdmsource`) and renders the saved graph. The platform does not reconstruct JDM JSON from PCRM — the JDM source is the designer's editable form; PCRM is the runtime's authoritative form (ADR-D04 — see Section 27).

### 5.4 Platform Metadata Injection Points

The GoRules JDM Editor exposes panel extension points where the platform injects its own React components. These injection points replace GoRules' default field-input elements within condition and formula panels:

| JDM Editor panel | Platform replacement component |
|------------------|-------------------------------|
| Input schema field picker | CRM Metadata Picker (entity + field + traversal path) |
| Output schema field picker | CRM Metadata Picker (output field selection) |
| Condition value input | Field-type-aware Value Editor (Section 10) |
| Formula expression input | Formula Builder overlay (Section 13) |
| Expression/condition cell in decision table | Cell Editor with Metadata Picker + Operator Picker + Value Editor |

Platform components communicate back to the JDM editor by writing valid JDM JSON structures into the editor's props. The editor remains the single source of visual state.

### 5.5 GoRules Package Version Governance

The `@gorules/jdm-editor` package version is pinned in `package.json`. The upgrade process follows Phase 3 §15.4: review API changes, review JDM schema changes, update the Rule Translator if JDM schema changes, verify all existing round-trips, produce an ADR for any JDM schema change affecting the translator.

---

## 6. Degraded WASM Impact and Mitigation

### 6.1 Impact Summary (ADR-10)

The GoRules JDM Editor ships `@gorules/zen-engine-wasm` as a production dependency. The WASM binary requires COOP/COEP HTTP headers which CRM/Dataverse web resource servers do not support. The designer therefore operates in degraded mode: WASM is not initialised.

**Features unavailable in degraded mode:**
| Unavailable feature | Business impact | Mitigation |
|---------------------|----------------|------------|
| ZEN expression autocomplete in formula inputs | Authors type NCalc-compatible expressions without in-line suggestions | Expression Quick-Reference Panel (see 6.2); Function Picker overlay (Section 13) |
| Inline ZEN expression validation (syntax errors shown as you type) | Syntax errors discovered at save time, not keystroke-by-keystroke | Save-time grammar validation with specific error messages (Section 16) |
| ZEN expression syntax highlighting in formula fields | Formula text inputs are plain-text | No alternative; accepted |

**Features fully functional in degraded mode:**
- Decision graph node creation, connection, and drag-drop.
- Decision table row and column authoring, cell editing.
- Node-level configuration (hit policy, node naming, input/output schema).
- All platform-injected overlay components (Metadata Picker, Formula Builder, Expression Builder).
- Formula text input fields (text entry works; autocomplete does not).

### 6.2 Mitigation: Expression Quick-Reference Panel

A collapsible side panel, permanently accessible from the formula input fields and expression builder, shows:
- The complete EDP-H1 grammar summary (operators, math functions, string functions, date functions, type functions, null handling, range constructs).
- The 31 EDP_* bridge function signatures with parameter descriptions and return types.
- Function categorisation: Available in H1 (green label), H2-Deferred (grey/disabled label).
- Example expressions for common patterns: age calculation, date range, string matching, currency rounding.
- A note on UTC-only dates for H1, with the recommended pre-conversion pattern.

This panel is opened via a "?" icon in the formula input toolbar. It does not block the input field.

### 6.3 Mitigation: Save-Time Grammar Validation

The Rule Translator's four-pass grammar validator (specified in spike P3-R-1, Section 7) fires on every save. Authors receive specific, field-level error messages identifying the violating construct (e.g., "sum() is not available in Horizon 1. Use explicit addition for scalar fields, or await Horizon 2 for collection aggregation"). This replaces the continuous-feedback role of WASM inline validation.

### 6.4 Horizon 2 Cloud Path (Design Intent — Not H1 Scope)

On Dataverse cloud, if Power Apps Custom Page hosting is confirmed to support COOP/COEP headers without external infrastructure, WASM initialisation will be enabled in the cloud-only designer variant. This requires a separate ADR. On-prem remains in degraded mode permanently.

---

## 7. Canonical Rule Model Interaction (Generate and Render-Back)

### 7.1 Generate Path (Author → CRM)

The designer generates PCRM JSON from authored content through the following pipeline (detailed further in Section 8):

1. Author designs rule graphically using GoRules JDM Editor + platform overlay components.
2. Author triggers Save (or Save as Draft).
3. JDM Editor emits current JDM JSON state.
4. Platform's Rule Translator receives JDM JSON and metadata binding state.
5. Translator maps JDM nodes to PCRM logic blocks:
   - Decision table nodes → `logic.decisionTable` block
   - Condition cell values → `logic.decisionTable.rows[].cells[].condition` (structured JSON: operator + value, never raw expression strings)
   - Formula nodes → `logic.formula` block with NCalc expression string
   - Switch/if nodes → `logic.expressionTree` block
6. Translator resolves all display names to stable CRM logical identifiers via the in-session Metadata Cache. Each field selection becomes a `binding` object in the PCRM `inputs[]` array.
7. Translator computes the Rule Complexity Profile.
8. Translator applies four-pass grammar validation (H1 grammar check, regex complexity check, date method chain parse, round-on-decimal-output warning).
9. PCRM JSON is validated against the PCRM JSON Schema.
10. On success: both `mql_jdmsource` (JDM JSON) and `mql_canonicaldefinition` (PCRM JSON) are written to the CRM Rule Version record in a single API call.

### 7.2 Render-Back Path (CRM → Designer)

When a previously saved Rule Version is opened for editing:

1. Designer shell loads the Rule Version CRM record.
2. `mql_jdmsource` is read and passed directly to the JDM Editor's `value` prop. The editor renders the saved graph visually.
3. In parallel, the metadata display labels for all bindings in the PCRM `inputs[]` and `outputs[]` are resolved from the session Metadata Cache (CRM display names, refreshed as needed).
4. If any binding cannot be resolved (field deleted from the CRM model), the designer shows a binding-error indicator on the affected node/cell. The author must re-select a valid field before re-saving.
5. The platform's metadata overlay components are pre-populated with the resolved display labels so the author sees "Loan Amount" not `mql_loanamount`.

### 7.3 Dual-Storage Rationale

JDM source is stored alongside PCRM for one reason: the JDM Editor cannot reconstruct its visual graph from PCRM JSON. PCRM is a runtime-optimised format; JDM JSON is a designer-specific format with visual layout metadata (node positions, connection routing) that PCRM does not preserve. Both are needed. This is ADR-D04 (Section 27).

### 7.4 Backward Compatibility When PCRM Schema Changes

When the PCRM schema receives a minor-version increment (backward-compatible, as required by design commitment C1):
- Existing Rule Versions stored with the prior minor version load and display correctly. The designer reads `pcrmSchemaVersion` and applies the appropriate rendering logic.
- The JDM source is schema-agnostic (it is the GoRules format, not the PCRM format) and is unaffected.
- The designer appends the new PCRM schema version to the document on the next save, producing a PCRM document at the new minor version.

Major-version increments are prohibited in H1 and H2 (design commitment C1). If a major version ever occurs (Horizon 3+), a Migration Service produces a new Rule Version at the new schema version; the designer loads the migrated version for editing.

---

## 8. Rule Save / Load / Render Flow

### 8.1 Ten-Step Save Lifecycle

This lifecycle applies to every save action (Save as Draft, auto-save, or save triggered by a lifecycle transition).

**Step 1 — Capture.** The save pipeline requests the current JDM JSON from the GoRules JDM Editor component. If the editor has unsaved structural changes (dirty state), these are flushed to the JDM JSON snapshot.

**Step 2 — Pre-flight Check.** The designer checks: (a) a rule name has been entered; (b) at least one input binding is defined; (c) at least one output binding is defined; (d) the lifecycle state is Draft (saves are blocked on In Review / Approved / Published / Retired). If any check fails, the save is blocked with a specific inline message. No CRM write occurs.

**Step 3 — Metadata Resolution.** The Rule Translator looks up every field reference in the JDM JSON in the session Metadata Cache and resolves display name → logical identifier. Any reference that cannot be resolved (binding orphaned by a CRM model change) is flagged as an unresolvable binding error. The author must correct before saving.

**Step 4 — JDM-to-PCRM Translation.** The translator maps each JDM node type to its PCRM equivalent (Section 7.1). This includes: decision table nodes, condition trees, formula nodes, switch nodes, and input/output schema entries.

**Step 5 — Grammar Validation (Four Passes).** Per spike P3-R-1 Section 7 and Section 16 of this document:
- Pass 1: Structural grammar check (H1 grammar allowlist; blocks GAP constructs).
- Pass 2: Regex complexity check (on all `matches()` patterns).
- Pass 3: Date method chain parse (blocks H2-deferred date methods).
- Pass 4: Round-on-decimal-output advisory (warns if currency/decimal formula lacks `Round()` wrapper).

**Step 6 — PCRM Schema Validation.** The PCRM JSON document is validated against the PCRM JSON Schema (NJsonSchema-compatible). Any structural violation (missing required field, invalid enum value, mismatched data type) is a hard block.

**Step 7 — Complexity Profile Computation.** The translator computes the complexity score across all SDP dimensions (condition count, nesting depth, table rows, table columns, chained sub-decisions, output fields, formula expression length, rule variables). The score is embedded in the PCRM `mql_complexityprofile` block.

**Step 8 — Complexity Gate.** If complexity score exceeds 100 (beyond Standard Decision Profile ceiling), the designer shows a prominent warning — not a hard block in H1 — stating the P95 performance guarantee does not apply. The author may proceed.

**Step 9 — CRM Write.** A single CRM Xrm.WebApi call updates (or creates) the Rule Version record, writing:
- `mql_jdmsource` — the JDM JSON (source of truth for designer editing).
- `mql_canonicaldefinition` — the PCRM JSON (source of truth for runtime execution).
- `mql_complexityprofile` — the computed complexity profile JSON.
- `mql_lifecyclestate` — set to Draft on initial save; unchanged on re-saves within Draft.
- Standard audit stamp fields (`mql_modifiedon`, `mql_modifiedby`).

**Step 10 — Post-Save UI Feedback.** On success: the designer shows a non-blocking toast "Rule saved as Draft". The version number and last-saved timestamp are updated in the header. Dirty state indicators are cleared. On failure: the save error is displayed in the Validation Panel with the specific failure reason and recovery guidance.

### 8.2 Load Lifecycle (Open Existing Rule for Editing)

1. User navigates to Rule Version from the Rule List or Version Selector.
2. Designer shell calls `Xrm.WebApi.retrieveRecord("mql_ruleversion", versionId, selectColumns)` for `mql_jdmsource`, `mql_canonicaldefinition`, `mql_lifecyclestate`, `mql_complexityprofile`, and display metadata fields.
3. `mql_jdmsource` is passed to the JDM Editor. Graph renders.
4. PCRM `inputs[]` and `outputs[]` bindings are resolved from the Metadata Cache to display labels. If the cache is cold, a non-blocking "Loading metadata..." skeleton is shown; the graph renders without binding labels until resolution completes.
5. Lifecycle state controls are set based on `mql_lifecyclestate` (e.g., In Review → all editing disabled; Draft → editing enabled).
6. The complexity indicator in the header is set from `mql_complexityprofile`.
7. The Business-Friendly Summary panel is generated from the loaded PCRM JSON.
8. If any binding cannot be resolved (missing entity/field), the affected node/cell shows a binding-error indicator.

### 8.3 Render Flow for Business-Friendly Summary

The Business-Friendly Summary panel renders PCRM JSON into human-readable text, without executing the rule. The generator reads the PCRM `logic` block and produces sentences of the form:

> "If **Loan Amount** is greater than **500,000** AND **Risk Rating** equals **High**, then set **Approval Level** to **CEO Approval**."

For decision tables with multiple rows:

> "For each of the following conditions (First Match policy):"
> "  Row 1: If **Loan Amount** is between **0** and **100,000** → **Branch Manager**"
> "  Row 2: If **Loan Amount** is between **100,001** and **500,000** → **Regional Director**"
> "  Row 3: If **Loan Amount** is greater than **500,000** → **CEO Approval**"

Display labels come from the binding's captured `displayLabel` property in the PCRM (refreshed from cache on load). Operators use business-friendly label mappings (see Operator Matrix, Section 11). Option-set values are displayed by label, not integer. Lookup values are displayed by name field.

This summary is read-only. It updates on every save. It is visible in the right panel of the designer and is also surfaced in a "Preview Summary" modal from the command bar.

---

## 9. CRM Metadata Picker Design

### 9.1 Design Principle

The Metadata Picker is an Advanced-Find-grade CRM entity and field selection experience. It is entirely platform-owned (BUILD decision, DEP-012 from dependencies.md). Authors select from searchable display-name lists; the picker stores the corresponding logical identifiers. Authors never see or type logical names, option-set integer values, attribute logical names, or GUIDs.

### 9.2 Picker Types and Their Roles

| Picker type | Used when | Output stored in PCRM |
|-------------|-----------|----------------------|
| **Entity Picker** | Selecting the primary rule entity or relationship target | `binding.entityLogicalName` |
| **Field / Attribute Picker** | Selecting a condition input, output field, or formula input | `binding.attributeLogicalName`, `binding.dataType` |
| **Relationship Traversal Picker** | Navigating a lookup field to reach a related entity's fields | `binding.traversalPath[]` |
| **Option Set / Choice Picker** | Selecting option values for Picklist conditions | Stored as option-value integer in PCRM; displayed as label |
| **Multi-Select Option Set Picker** | Selecting multiple values for IN / NOT IN conditions | Stored as array of integer values |
| **Lookup Reference Picker** | Configuring lookup comparison targets | Target entity + comparison field logical name |
| **Status Picker** | Selecting `statuscode` option values | Integer stored; label displayed |
| **State Picker** | Selecting `statecode` option values | Integer stored; label displayed |
| **Owner Picker** | Selecting owner-type conditions | systemuser/team entity reference |
| **Customer Picker** | Selecting customer-type conditions (account or contact polymorphic) | Polymorphic lookup with entity type discriminator |
| **Currency Picker** | Selecting currency field comparisons | Currency entity reference; ISO code displayed |
| **Date Value Picker** | Selecting static date values or relative date expressions | ISO date string or EDP date expression stored |
| **Boolean Picker** | Selecting true/false for boolean fields | `true` / `false` literal stored; "Yes" / "No" displayed |

### 9.3 Entity Picker — Interaction Design

Entry points: (a) "Select Input Entity" in a new rule's input schema panel; (b) "Change Entity" on an existing binding card; (c) Relationship traversal → target entity selection.

**UI behaviour:**
- Opens as a Fluent UI Dialog (modal overlay).
- Contains a search input with instant filtering against entity display names (client-side filter on cached entity list; falls back to a debounced server query for large organisations or on cache miss).
- Entity list is grouped: Standard Entities, Custom Entities (Maqsad prefix `mql_`), Activity Entities.
- Each entity row shows: CRM entity icon (where available), Display Name, Plural Name.
- "Recently Used" section shows the last 5 selected entities at the top (session-scoped).
- Entity type filter (Standard / Custom / Activity) as filter pills above the list.
- Filter by "entities I've used in rules this session" (session recents).
- Selecting an entity closes the dialog and triggers Field Picker for that entity.

### 9.4 Field / Attribute Picker — Interaction Design

Shown after entity selection, or when modifying an existing field binding.

**UI behaviour:**
- Search input filters fields by display name as the author types.
- Fields grouped: Standard Fields (CRM system), Custom Fields (customer schema), Relationship-Based Fields (available via 1-hop traversal).
- Each field row shows: field data-type icon, Display Name, data type label (e.g., "Whole Number", "Text", "Option Set").
- "Required" / "Optional" badge on each field (from CRM `RequiredLevel` metadata) — helps authors know which inputs are guaranteed to be populated.
- A "→" navigate indicator on Lookup-type fields allows the author to traverse to the related entity's field list. Traversal path is shown as a breadcrumb: "Opportunity → Account → Annual Revenue".
- Maximum traversal depth: 3 hops in H1. Beyond 3 hops the path builder shows a "depth limit reached" message.
- Calculated fields and Rollup fields are clearly labelled — they may have performance implications inside the plugin sandbox (they trigger their own CRM calculation on field read).

### 9.5 Option Set / Choice Value Picker

Invoked when a Picklist or Status/State field is selected with an equality-type operator.

**UI behaviour:**
- Displays all option labels for the field's option set. Labels come from the Metadata Option Set cache (`mql_metadataoptionsetdefinition`).
- Labels are shown in the authenticated user's language (from CRM localised labels).
- For IS ONE OF / IS NOT ONE OF operators, multiple values can be selected (checkboxes).
- The integer values are stored in the PCRM; the labels are displayed to the author and in the Business-Friendly Summary.
- If the option set cache is stale (option set modified since last cache refresh), a "Refresh metadata" prompt appears. Stale option values are shown with a warning indicator.

### 9.6 Lookup Reference Configuration

When a Lookup-type field is selected:
- The picker shows the target entity name ("This field references an Account record").
- The author selects a comparison mode:
  - **Name match** — compare by the lookup's name field (e.g., Account Name contains "Acme"). Stored as traversal to the name attribute.
  - **Attribute match** — traverse to a specific attribute of the target entity (e.g., Account → Annual Revenue > 1,000,000). Opens Field Picker for the target entity.
  - **Record reference** — compare the GUID of the lookup itself (e.g., "is the assigned account this specific record"). This mode is for developer-authored rules; the designer warns that this stores a GUID and should not be used for business rules that need to be portable across environments.
- Authors never see GUIDs in any comparison mode.

### 9.7 Cold-Start UX (W4/W11 Design Commitment)

Per Phase 3 skeptic-triage work item W4/W11:

**Cold-start scenario:** The metadata entity cache (`mql_metadataentitydefinition` etc.) is empty or stale (version token mismatch). A full metadata refresh must occur before the picker can populate.

**Designer behaviour during cold-start:**
- The designer shell starts and displays the rule graph / table canvas immediately (does not block on metadata).
- The Metadata Picker shows a "Loading field catalogue..." skeleton state with a progress indicator.
- Existing bindings on loaded rules show their captured `displayLabel` (stored in PCRM at last save) while the cache rebuilds — authors can see what fields are bound even during cache refresh.
- If an author tries to open the Entity Picker before the cache is ready, the picker opens in "search mode" (live server query) rather than blocking. Entities return as the author types; full cache is not required for individual searches.
- A non-blocking banner "Field catalogue is updating..." appears in the designer header. It dismisses automatically when the cache rebuild completes.
- Cache rebuild is initiated by the shell as a background Custom Action call (`mql_RetrieveEntityMetadata`) which returns JSON to populate the CRM entity cache. This does not block any authoring action.

**On-premises specific:** The Custom Action-based metadata retrieval path uses targeted, paged entity retrieval (specified field-filter parameters) rather than a blanket `RetrieveAllEntitiesRequest` where possible, consistent with W4/W11 commitment to targeted retrieval. The cache is persisted (CRM entity records) so cold-start is a rare event (occurs only on first designer load after deployment or after a schema change invalidates the version token).

### 9.8 Business-Friendly Name Mapping (Bidirectional)

The designer maintains a session-level bidirectional map:

```
Display Name → Logical Identifier   (used at save time, binding resolution)
Logical Identifier → Display Name   (used at load time, render-back)
```

At save time: every display-name selection is resolved to its logical identifier, which is stored in the PCRM `binding` object alongside the captured `displayLabel` (informational only — the source of truth is the logical identifier).

At load time: logical identifiers are resolved back to display names from the session cache. If a logical identifier cannot be resolved (entity/field has been deleted from the CRM model since the rule was last saved), the binding is flagged with a binding error indicator. The rule can still be loaded and viewed; it cannot be re-saved until all broken bindings are corrected or removed.

---

---

## 10. Field Type-Aware Authoring

Each CRM field data type has a distinct authoring experience: a specific set of permitted operators, a specific UI control for entering values, specific validation rules, a specific PCRM storage representation, a specific display format in the Business-Friendly Summary, and specific error handling. Designers show only controls that are valid for the selected field type.

### 10.1 Text (Single Line of Text)

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Equals, Not Equals, Contains, Not Contains, Starts With, Ends With, Is Empty, Is Not Empty, Matches (regex, constrained), IN (set of values), NOT IN |
| UI control (value) | Single-line text input. For IN/NOT IN: tag-input (multiple values). For Matches: text input with regex helper icon opening a regex tester popover. |
| Validation | For Matches: regex pattern validated against complexity allowlist (no nested quantifiers, no backreferences, max 50 character classes) per spike P3-R-1. |
| PCRM storage | `{ "operator": "contains", "value": "Acme" }` — all values stored as strings in PCRM; string literals without quotes in display. |
| Display format | Summary shows: **Field Name** contains "**value**" |
| Error handling | Empty value blocked (except Is Empty / Is Not Empty which take no value). Regex complexity failure shows specific pattern violation. |

### 10.2 Memo (Multi-Line Text)

Same as Text but operators restricted: Contains, Not Contains, Is Empty, Is Not Empty, Starts With, Ends With. Equals/Not Equals are blocked (memo fields are impractical for exact-match conditions). Stored as string value in PCRM.

### 10.3 Whole Number (Integer)

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Equals, Not Equals, >, >=, <, <=, Between, IN, NOT IN, Is Null, Is Not Null |
| UI control (value) | Numeric input (integer only; decimal input blocked). For Between: two numeric inputs (from/to inclusive). For IN/NOT IN: tag-input with integer validation. |
| Validation | Value must be within the field's min/max range (from attribute metadata). Between: from must be ≤ to. |
| PCRM storage | `{ "operator": "greaterThan", "value": 100 }` — stored as JSON number (integer). |
| Display format | **Loan Term** is greater than **12** months |
| Error handling | Non-integer input blocked. Out-of-range value shows metadata-derived constraint message. |

### 10.4 Decimal Number

Same operators as Whole Number, plus Between. UI control accepts decimal input. PCRM stores as JSON number (decimal). Validation warns if formula output targeting this field lacks `Round()` per pass 4 of grammar validation.

### 10.5 Currency

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Equals, Not Equals, >, >=, <, <=, Between, Is Null, Is Not Null |
| UI control (value) | Numeric input with currency symbol prefix (resolved from the rule's base currency configuration). Decimal precision follows the field's metadata precision setting. |
| Validation | Numeric only. Negative values permitted (some currency fields may be negative). |
| PCRM storage | `{ "operator": "greaterThan", "value": 500000.00 }` — stored as decimal JSON number. |
| Display format | **Loan Amount** is greater than **500,000.00** |
| Error handling | Non-numeric input blocked. Formula outputs targeting currency fields must use `Round()` — designer enforces pass-4 advisory. |
| Note | The `_base` (base currency) attribute of a currency field is a separate attribute in CRM. The picker treats the currency field and its `_base` variant as distinct selectable fields with distinct labels. |

### 10.6 DateTime (Date and Time)

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Equals, Not Equals, Before, After, On, On Or Before, On Or After, Between, Is Null, Is Not Null |
| UI control (value) | Date-time picker (Fluent UI DateTimePicker). Alternatively, an "expression" toggle reveals a text input for EDP date expressions (e.g., `d().add(-30, "d")` meaning "30 days ago"). The expression toggle is labelled "Use formula..." and displays the quick-reference panel when active. |
| Validation | Static values: valid ISO datetime. Expression values: pass-1 and pass-3 grammar validation. UTC-only in H1. |
| PCRM storage | Static: ISO 8601 date string. Expression: NCalc-ready expression string after translation (e.g., `EDP_DateAdd(__now, -30, 'd')`). |
| Display format | Static: **Application Date** is before **2026-01-01**. Expression: **Application Date** is before **[30 days ago]** |
| Error handling | Invalid date strings blocked. H2-deferred timezone methods produce grammar error at save time. |

### 10.7 Date Only

Same as DateTime but without time component. Date-only picker (no time input). Operators: Equals, Not Equals, Before, After, On, On Or Before, On Or After, Between, Is Null, Is Not Null. Stored as `yyyy-MM-dd` string. Summary uses date-only format.

### 10.8 Boolean (Two Options)

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Equals, Not Equals |
| UI control (value) | Toggle or radio buttons showing the field's custom true/false labels (from metadata: e.g., "Active" / "Inactive", not "True" / "False"). |
| Validation | No free-text input. Only the two defined options are selectable. |
| PCRM storage | `{ "operator": "equals", "value": true }` — boolean JSON literal. |
| Display format | **Is Active** equals **Active** (using field's display labels for true/false) |

### 10.9 Option Set (Choice / Picklist)

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Equals, Not Equals, IN (one of), NOT IN (not one of), Is Null, Is Not Null |
| UI control (value) | Dropdown or single-select list showing option labels. For IN/NOT IN: multi-select checkbox list. |
| Validation | Only option-set values from the field's metadata are selectable. Authors cannot type free-form values. Stale option values (option deleted from CRM) are marked with a warning. |
| PCRM storage | `{ "operator": "equals", "value": 100000001 }` — integer value. Display label stored separately as `displayValue` for the summary. |
| Display format | **Application Status** equals **Approved** (label only, integer value hidden from author) |

### 10.10 Multi-Select Option Set (Choices)

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Contains Values (any of), Does Not Contain Values, Contains All Values, Exactly Matches Values |
| UI control (value) | Multi-select checkbox list showing all option labels. Selected values shown as chips. |
| Validation | Options from metadata only. |
| PCRM storage | `{ "operator": "containsValues", "value": [100000001, 100000002] }` — array of integers. |
| Display format | **Product Types** contains any of **Mortgage, Personal Loan** |

### 10.11 Lookup (Entity Reference)

| Aspect | Specification |
|--------|---------------|
| Allowed operators | Equals (is this specific record), Not Equals, Is Null, Is Not Null, and attribute-traversal operators (when the author navigates to a target entity attribute) |
| UI control (value) | For Equals/Not Equals: a lookup-to-record search input (uses Xrm.Utility.lookupObjects or Xrm.WebApi quick-find). Author sees the record's name field. For attribute-traversal: delegates to the selected target attribute's type-specific control. |
| Validation | Record references must resolve to a real CRM record. GUID is stored in PCRM; name is displayed. Authors are warned that record-reference conditions are environment-specific (not portable). |
| PCRM storage | `{ "operator": "equals", "value": { "id": "<guid>", "entityType": "account", "name": "Acme Corp" } }` |
| Display format | **Account** equals **Acme Corp** |
| Error handling | Record not found in target environment on load → binding error indicator. Record-reference condition flagged as "environment-specific" with a warning chip. |

### 10.12 Owner (User or Team)

Treated as a polymorphic Lookup (target entity is systemuser or team). Same behaviour as Lookup. Operator set: Is Null, Is Not Null, Equals (specific user/team), Not Equals. Summary displays by name. Environment-specific warning applies.

### 10.13 Customer (Account or Contact Polymorphic)

A polymorphic lookup that may reference either an Account or a Contact. The Lookup Reference Configuration shows the target entity type selector (Account / Contact / Either). Operators same as Lookup. PCRM stores the entity type discriminator alongside the reference.

### 10.14 Unique Identifier (GUID)

Allowed operators: Equals, Not Equals, Is Null, Is Not Null. UI control: text input validated as GUID format (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Authors are warned that GUID conditions are environment-specific. Stored as string in PCRM. Summary displays full GUID value in a monospace span.

### 10.15 Status (Status Reason / statuscode)

Treated as an Option Set picker but sourced from the entity's `statuscode` global option set. The Status Picker shows the reason labels grouped by state (Active reasons / Inactive reasons). Operators: Equals, Not Equals, IN, NOT IN, Is Null, Is Not Null. Integer values stored. Labels displayed.

### 10.16 State (statecode)

Two-value option set (Active / Inactive, or entity-specific state labels). Simplified picker: radio buttons showing the state labels. Operators: Equals, Not Equals. Integer stored (0 / 1 typically). State label displayed.

---

## 11. Operator Matrix

The following matrix maps each operator to the field types that support it. The designer's Operator Picker filters this list by the selected field's data type so authors never see inapplicable operators.

Operator labels shown to authors use business-friendly language. The PCRM operator name (for developer reference) is the camelCase identifier stored in `condition.operator`.

| Operator (author label) | PCRM name | Text | Memo | Int | Dec | Curr | DateTime | DateOnly | Bool | OptionSet | MultiSelect | Lookup | Owner | Customer | GUID | Status | State |
|------------------------|-----------|------|------|-----|-----|------|----------|----------|------|-----------|-------------|--------|-------|----------|------|--------|-------|
| Equals | `equals` | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Not Equals | `notEquals` | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Greater Than | `greaterThan` | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| Greater Than or Equal | `greaterThanOrEqual` | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| Less Than | `lessThan` | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| Less Than or Equal | `lessThanOrEqual` | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| Before | `before` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| After | `after` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| On | `on` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| On or Before | `onOrBefore` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| On or After | `onOrAfter` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| Between | `between` | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| Contains | `contains` | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Does Not Contain | `notContains` | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Starts With | `startsWith` | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Ends With | `endsWith` | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Matches Pattern | `matches` | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Is One Of | `in` | ✓ | — | ✓ | — | — | — | — | — | ✓ | — | — | — | — | — | ✓ | — |
| Is Not One Of | `notIn` | ✓ | — | ✓ | — | — | — | — | — | ✓ | — | — | — | — | — | ✓ | — |
| Contains Values | `containsValues` | — | — | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Does Not Contain Values | `notContainsValues` | — | — | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Contains All Values | `containsAllValues` | — | — | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Is Null | `isNull` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Is Not Null | `isNotNull` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Is Empty | `isEmpty` | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Is Not Empty | `isNotEmpty` | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

**Notes on the matrix:**
- DateTime operators Before/After/On/On Or Before/On Or After map to NCalc comparisons after translator expansion (e.g., `Before` → `_input < valueOrExpression`).
- Unary test forms in decision-table cells map to the same PCRM operators via the Rule Translator expansion (Section 5.3 of spike P3-R-1).
- Custom operators registered via `mql_customoperator` appear in the Operator Picker below the built-in list with a visual "Custom" badge; their type applicability is declared in the registration record.

---

## 12. Expression Builder

### 12.1 Purpose

The Expression Builder is the platform-owned panel for authoring condition logic: IF / THEN / ELSE / ELSE-IF trees with AND / OR nesting, NOT negation, and parenthesised groups. It replaces direct interaction with the GoRules JDM Editor's condition node UI for condition-tree style rules (as opposed to Decision Table style rules, which use the Decision Table Designer, Section 14).

The Expression Builder produces PCRM `logic.expressionTree` JSON. It does not directly produce ZEN expression strings. Each leaf condition is a structured triple (field binding + operator + value), not a raw text expression.

### 12.2 Condition Group Model

The expression tree is composed of three node types:

**Logical Group:** AND or OR. Contains one or more child nodes (conditions or nested groups). Groups can be collapsed and expanded. The group connector label (AND / OR) is a clickable toggle — clicking it converts AND to OR and vice versa, restructuring the PCRM tree without clearing its children.

**Condition (Leaf):** A single condition triple: [Field binding] [Operator] [Value]. The field binding is selected via the Metadata Picker. The operator is selected via the Operator Picker (filtered by field type). The value is entered via the field-type-aware Value Editor (Section 10).

**NOT Wrapper:** Any group or condition can be wrapped in a NOT negation. In the UI, a NOT badge appears on the group/condition. In PCRM, the condition or group node gains a `"negated": true` property.

### 12.3 IF / THEN / ELSE / ELSE-IF Structure

For Expression Tree-style rules the PCRM supports:
- `IF [condition group] THEN [outputs]`
- `IF [condition group] THEN [outputs] ELSE [outputs]`
- `IF [condition group] THEN [outputs] ELSE IF [condition group] THEN [outputs] ELSE [outputs]`

In the Expression Builder:
- The "Add ELSE" button appends an alternative output branch to the current IF node.
- The "Add ELSE IF" button appends a new IF node as the ELSE branch (chained IF/ELSE IF structure).
- The chain length is limited by the SDP complexity ceiling.
- Branches can be reordered by drag-handle.

### 12.4 Interaction Behaviours

**Add condition:** A "+ Add Condition" button within a group creates a new leaf condition below the last condition in that group.

**Add group:** A "+ Add Group" button adds a nested AND or OR group within the current group.

**Delete:** Each condition and group has a delete icon. Deleting a group deletes all its children. A confirmation prompt appears before multi-child deletions.

**Duplicate:** Each condition has a "Duplicate" action (ellipsis menu) that creates a copy immediately below it. The copy's operator and value can then be independently edited.

**Drag-reorder:** Conditions and groups within the same parent are drag-reorderable via a drag handle on the left edge of each row. Order affects display order but not logical evaluation order (AND/OR logic is commutative in evaluation).

**Collapse/expand:** Groups with more than 3 children show a "Collapse" toggle. Collapsed groups show a one-line summary of their children count and logic type.

**Convert AND to OR:** Clicking the AND/OR connector label converts the group type. The tooltip reads "Toggle between AND (all conditions must match) and OR (any condition must match)".

### 12.5 Validation Messages

Condition-level validations (raised by the Validation Framework, Section 16) are shown inline on the affected condition row:
- "Field binding is missing" — no field selected.
- "Operator is missing" — field selected but operator not yet chosen.
- "Value is required" — operator requires a value but none entered.
- "Invalid value type" — value type does not match field type (e.g., text entered for a numeric field).
- "Option set value is no longer valid" — selected option has been removed from the CRM metadata.
- "Lookup reference may not be portable across environments" — GUID-based lookup condition advisory.

### 12.6 Business-Readable Preview

At the bottom of the Expression Builder panel, a live-updating "Rule preview" sentence is rendered from the current expression tree. Example:

> If **Loan Amount** is greater than **500,000** AND **Risk Rating** equals **High** THEN set **Approval Level** to **CEO Approval**

This preview uses the same Business-Friendly Summary generator (Section 8.3). It updates as the author makes changes, using the current in-memory state (not requiring a save). If the expression is incomplete, the preview shows "..." for unresolved parts.

---

## 13. Formula Builder

### 13.1 Purpose

The Formula Builder is the platform-owned overlay for authoring formula/calculation expressions. It is invoked from: (a) formula-type nodes in the decision graph canvas; (b) output formula cells in decision tables where the output is calculated rather than literal.

The Formula Builder is the primary mitigation for degraded WASM mode (ADR-10) — it provides a guided, GUI-assisted experience for composing NCalc-compatible expressions without requiring ZEN autocomplete.

### 13.2 Formula Builder Layout

The Formula Builder opens as a modal or a slide-over panel (configurable via Feature Flag). It contains:

**Left panel — Variable Bindings:** Lists the input variables available to the formula, each with its alias (expression-friendly name, e.g., `loanAmount`) and its resolved CRM field display name (e.g., "Loan Amount"). Authors add variables by clicking "+ Add Variable" which opens the Metadata Picker. Each variable's alias is auto-generated from the display name (camelCase, e.g., "Loan Amount" → `loanAmount`) and is editable. Variables are used in the NCalc expression string by their alias.

**Centre panel — Expression Input:** A text area for the NCalc-compatible expression string. The expression uses variable aliases defined in the left panel. A character counter shows the current length vs. the 1,000-character SDP ceiling. An estimated-complexity indicator shows a percentage of the SDP ceiling. The "?" quick-reference icon opens the Expression Quick-Reference Panel (Section 6.2).

**Right panel — Function Picker:** A categorised, searchable catalogue of available formula functions. Clicking a function inserts its template (with parameter placeholders) at the cursor position in the expression input. Categories:

| Category | Functions available in H1 | Functions deferred to H2 |
|----------|--------------------------|-------------------------|
| Math — Scalar | `Abs(n)`, `Floor(n)`, `Ceiling(n)`, `Round(n, decimals)`, `Truncate(n)`, `Pow(base, exp)`, `Sqrt(n)`, `Min(a, b)`, `Max(a, b)` | — |
| Math — Collection aggregates | *(none in H1)* | `Sum(collection)` **, `Average(collection)` **, `Min(collection)` **, `Max(collection)` ** |
| String | `EDP_Len(s)`, `EDP_Upper(s)`, `EDP_Lower(s)`, `EDP_Trim(s)`, `EDP_Contains(src, search)`, `EDP_StartsWith(s, prefix)`, `EDP_EndsWith(s, suffix)`, `EDP_Matches(s, pattern)` | `EDP_FuzzyMatch(s1, s2)` ** |
| Date (UTC only) | `EDP_Now()`, `EDP_Date(s)`, `EDP_DateAdd(date, n, unit)`, `EDP_DateSub(date, n, unit)`, `EDP_DateDiff(from, to, unit)`, `EDP_Year(d)`, `EDP_Month(d)`, `EDP_Day(d)`, `EDP_Hour(d)`, `EDP_Minute(d)`, `EDP_Second(d)`, `EDP_DayOfWeek(d)`, `EDP_DayOfYear(d)`, `EDP_Quarter(d)`, `EDP_Timestamp(d)`, `EDP_StartOf(d, unit)`, `EDP_EndOf(d, unit)`, `EDP_IsToday(d)`, `EDP_IsYesterday(d)`, `EDP_IsTomorrow(d)`, `EDP_IsValidDate(d)`, `EDP_IsLeapYear(d)` | Timezone functions: `EDP_DateTz(d, tz)`, `.tz()` conversions **, `.format()` ** |
| Type Coercion | `EDP_ToString(v)`, `EDP_ToNumber(v)`, `EDP_ToBool(v)`, `EDP_IsNumeric(v)` | — |
| Conditional | `if(condition, thenValue, elseValue)` | — |
| Null Handling | `EDP_Coalesce(a, b)` | — |

** = H2-deferred. These entries appear in the function picker with a grey "H2" badge and a tooltip "Available in Horizon 2". Clicking them inserts a comment placeholder `/* H2: Sum(collection) — not available in Horizon 1 */` rather than a live function call. This prevents authors from writing formulas they cannot save.

### 13.3 Formula Reconciliation with EDP-H1 Grammar

The key reconciliation required by the design prompt:

**Scalar Min / Max (2-argument form):** Available in H1. NCalc native functions. Author writes `Min(a, b)` or `Max(a, b)`. Function Picker entry: "Min of two values" / "Max of two values". The formula `Min(loanAmount, creditLimit)` is valid H1.

**Sum() over collections:** NOT available in H1. NCalc has no array type. The Function Picker entry for `Sum(collection)` is shown but disabled with H2 badge. The save-time grammar validator (Pass 1) blocks any expression containing `sum(`. For authors who need to sum scalar fields, the correct H1 approach is explicit addition: `field1 + field2 + field3` — the Function Picker tooltip explains this.

**Average() over collections:** NOT available in H1. Same treatment as Sum. Authors needing an average of known scalar fields divide by a constant: `(field1 + field2 + field3) / 3`.

**Min / Max of arrays:** NOT available in H1. The multi-argument form `Min(a, b)` is available; the single-argument array form `min(array)` (ZEN M-06/M-07) is not. The picker distinguishes these clearly: "Min of two values Min(a, b) — H1 Available" vs "Min of a collection Min(collection) — H2 Deferred".

This reconciliation is the complete and authoritative record. Any conflict with other documents resolves in favour of this classification.

### 13.4 Output Type Configuration

Below the expression input, the author selects the output data type for this formula (e.g., Decimal, Currency, Text). The selected output type:
- Determines which output binding (from the rule's `outputs[]`) this formula populates.
- Triggers the Pass-4 Round-on-decimal-output check: if the output type is Decimal or Currency, the validator checks that the expression's outermost call is `Round(...)`.
- Currency output type adds a "Decimal places" selector (0–4) which pre-fills the `Round()` template.

### 13.5 Rule Variable Builder

Rule Variables are intermediate computed values within a rule. They are declared in the Formula Builder's Variable Bindings panel using a "Add Intermediate Variable" workflow:
1. Author names the variable (display label, e.g., "Monthly Instalment").
2. Author selects the variable's source: either a formula expression (building a formula using the Formula Builder) or a decision table output from an upstream node.
3. The variable is added to the PCRM `variables[]` array with an auto-generated alias.
4. Downstream formula nodes and decision table output cells can reference this variable by its alias.

The Variable Builder is accessed via the "Variables" tab in the Formula Builder panel. A variable dependency graph (simple list, not a diagram) shows the order in which variables are computed.

---

## 14. Decision Table Designer

### 14.1 Purpose and Model

The Decision Table Designer is a platform-managed authoring surface for decision tables. It wraps the GoRules JDM Editor's built-in decision table grid with the platform's metadata-aware column headers, cell editors, and hit-policy configuration. The designer produces PCRM `logic.decisionTable` JSON.

### 14.2 Table Structure

A decision table has:
- **Condition columns** (left side): each column corresponds to one rule input binding. Each cell contains a condition value (unary test) for that column's field.
- **Output columns** (right side): each column corresponds to one rule output. Each cell contains the literal or formula output for matching rows.
- **Row priority column** (optional, visible for Priority hit policy): an integer priority value per row.
- **Default row** (optional): a row that matches when no other row matches. Displayed at the bottom with a "Default" label and a distinct background.

### 14.3 Hit Policy Selection

Hit policy is set at the table level (not per-row). A Hit Policy selector appears in the table toolbar. Four policies:

| Hit Policy | PCRM value | Evaluation behaviour | When to use |
|-----------|------------|---------------------|-------------|
| **First Match** | `first` | Evaluate rows top to bottom; return first matching row's outputs; stop. | Ordered priority rules, eligibility checks. |
| **Unique Match** | `unique` | All rows evaluated; exactly one must match; error if 0 or 2+ match. | Mutually exclusive rules where gaps or overlaps are an authoring error. |
| **All Matches** | `all` | All matching rows collected; all outputs returned as a list. | Multi-output rules (e.g., which documents are required). |
| **Priority** | `priority` | All rows evaluated; matching row with lowest priority number wins; ties broken by row order. | Rules with overlapping conditions where precedence is explicit. |

The designer shows a tooltip on each hit policy option explaining when to use it.

### 14.4 Column Management

**Add condition column:** Opens the Metadata Picker to select a new input field. The new column is appended at the right of the existing condition columns. The column header shows the field's display name and type icon.

**Add output column:** Opens the output field selector. Output fields come from the rule's declared `outputs[]` list or can be added here (which also adds them to `outputs[]`).

**Delete column:** Removes the column and all its cell values. A confirmation prompt appears ("Deleting this column will remove all values in it — proceed?").

**Reorder columns:** Columns are draggable by their header. Reordering does not affect evaluation semantics.

**Column operator per column:** For condition columns, the operator is set at the column level (all cells in that column share the same operator). A column-level Operator Picker is shown in the column header. Authors can override at the cell level for special cases (the cell shows its own operator when different from the column default).

**Column display in header:** [Type icon] [Field Display Name] [Operator label]. Example: "[#] Loan Amount [>]" or "[Picklist] Application Status [=]".

### 14.5 Row Management

**Add row:** A "+ Add Row" button at the bottom of the table appends a new empty row. For Priority hit policy, the new row gets priority 999 (lowest) by default.

**Duplicate row:** Each row has a "Duplicate" action (ellipsis menu) that creates a copy directly below it. All cell values are copied. Authors then edit the differences.

**Delete row:** Delete icon on each row. Confirmation prompt if row has values.

**Reorder rows:** Rows are drag-reorderable by a drag handle on the left edge. For First Match hit policy, row order directly determines evaluation priority. A "Sort rows by field value" quick-sort option is available in the table toolbar for tables with numeric ranges.

**Set Default Row:** A "Set as Default" toggle on each row marks it as the fallback row (matched when no other row matches). Only one row can be the default. Default row is visually distinguished (distinct background, "Default" label).

### 14.6 Cell Editing

Each condition cell opens an inline Cell Editor on click. The Cell Editor shows:
- The field for this column (display name, read-only — set at column level).
- An operator selector (defaulting to the column operator; overridable at cell level).
- A value editor appropriate to the field type (Section 10 controls).

For simple text or number conditions, inline editing in the cell is supported (no modal required). For complex inputs (option set selection, lookup reference, date expressions), a popover opens.

Empty condition cells are treated as wildcards (match-any) by the runtime. The cell displays a dash character "—" and the summary shows "(any)".

Output cells accept: a literal value (using the field-type-appropriate Value Editor) or a formula reference (using the Formula Builder). A "Use formula..." toggle in the cell popover switches between the two modes.

### 14.7 Table Validation in the Validation Framework

- Condition column with no rows: Warning — "This table has no rows. Add at least one rule row."
- Empty output cell on a non-default row: Error — "Output [column name] has no value in row [row number]."
- Overlapping rows in Unique Match policy: Warning — "Rows [n] and [m] may produce overlapping matches. Unique Match policy requires exactly one row to match."
- Default row with Unique Match policy: Warning — "A default row in Unique Match policy may trigger when zero rows match, which is an error condition for this policy."
- Priority hit policy with all rows at same priority: Warning — "All rows have identical priority. Row order determines evaluation order."

---

## 15. Rule Template Design

### 15.1 Template Model

Rule Templates are pre-authored, parameterised rule definitions stored as `mql_ruletemplate` CRM entity records. A template contains a PCRM JSON structure with parameter placeholders. Instantiating a template creates a new Draft Rule Version with all non-placeholder fields pre-populated. The author fills in the parameterised fields and customises as needed.

Templates are not editable by authors (read-only in Template Selector). Templates are managed by EDP Rule Administrators and ISV Publishers.

### 15.2 Template Selector UX

The Template Selector is accessible via the command bar "From Template" button when creating a new rule. It opens as a Fluent UI Dialog with:
- A search input filtering templates by name and tag.
- A category filter (one of the 8 template categories below, plus "All").
- Template cards showing: name, description, required entity, required input fields count.
- A "Preview" action on each card that opens a read-only summary of the template's logic.
- A "Use this template" button that instantiates and closes the dialog.

### 15.3 Eight Standard Templates (H1 Scope)

**Template 1 — DOA Delegation of Authority Approval**
- Purpose: Route an approval request to the correct authority level based on a monetary value or risk classification.
- Required parameters: Approval amount field, Authority level output field, Authority thresholds (configurable rows in a decision table).
- Entity binding: Any entity with a currency field and a lookup/option-set for approval authority.
- Generated starter rule: A decision table with 3 condition columns (Amount, Risk Rating, Product Type) and 1 output column (Required Approval Level), First Match hit policy, 5 pre-populated rows covering common thresholds. All thresholds are parameterised (authors replace placeholder values).
- Customisation flow: Author updates threshold values, adds or removes rows, optionally adds a second condition dimension.

**Template 2 — Loan / Product Eligibility**
- Purpose: Determine whether an applicant or record meets the eligibility criteria for a product or service.
- Required parameters: Multiple eligibility criterion fields (age, income, credit score, etc.), Eligible output (boolean), Ineligible reason output (text or option set).
- Entity binding: Customer entity (Contact or Account) or Application entity.
- Generated starter rule: An expression tree with AND-grouped eligibility conditions (e.g., Age >= 18 AND Annual Income >= 30,000 AND Credit Score >= 650). Output branches set `Eligible = true` on pass, `Eligible = false, Ineligible Reason = "Income below threshold"` on specific failure paths.
- Customisation flow: Add/remove eligibility criteria, adjust thresholds, add ELSE-IF branches for specific rejection reasons.

**Template 3 — Document Requirement**
- Purpose: Determine which documents are required for a given application or case, based on its characteristics.
- Required parameters: Application type field, Document list output (multi-select or comma-separated text), possibly a risk classification field.
- Entity binding: Application, Case, or Opportunity entity.
- Generated starter rule: A decision table with hit policy All Matches, condition column = Application Type, output column = Required Document (one row per document-type requirement). All-Matches returns all required documents.
- Customisation flow: Add rows for each document/application-type combination, add additional condition columns (e.g., Loan Amount for high-value additional requirements).

**Template 4 — Case / Task Routing**
- Purpose: Route a case, task, or request to the correct team or queue based on attributes.
- Required parameters: Classification fields (type, priority, region), Assignment Target output (owner lookup or queue option set).
- Entity binding: Case (Incident), Task, or custom entity.
- Generated starter rule: Decision table, First Match, condition columns include Type and Priority. Output column is Assignment Target. Default row routes to a general queue.
- Customisation flow: Map each condition combination to the correct routing target.

**Template 5 — Risk Scoring**
- Purpose: Compute a numeric risk score from multiple weighted input factors.
- Required parameters: Input score fields (numeric), Weight values for each, Output score field (decimal).
- Entity binding: Application or Customer entity.
- Generated starter rule: A formula node computing a weighted sum: `Round((riskFactor1 * weight1) + (riskFactor2 * weight2) + (riskFactor3 * weight3), 2)`. Weight values are parameterised as constants in the formula.
- Customisation flow: Replace placeholder weights and field bindings. Add or remove factors. Optionally add a decision table that maps score range to a Risk Category output.

**Template 6 — SLA / Response Time**
- Purpose: Determine the required response or resolution time for a case or ticket based on its priority and type.
- Required parameters: Priority field, Case Type field, SLA Target Hours output.
- Entity binding: Case / Incident entity.
- Generated starter rule: Decision table mapping Priority × Case Type to SLA Target Hours. First Match. Default row provides a catch-all SLA.
- Customisation flow: Set SLA values per row. Add escalation conditions.

**Template 7 — Product / Fee Eligibility**
- Purpose: Determine which products or fees apply to a record based on its classification.
- Required parameters: Customer tier field, Product category field, Applicable Fee Rate output (decimal), Applicable Product output (option set).
- Entity binding: Account, Opportunity, or Order entity.
- Generated starter rule: Decision table, First Match, condition columns = Customer Tier + Product Category. Output = applicable fee rate. Placeholder rows for 3 tiers × 2 categories.
- Customisation flow: Fill in fee rates, expand rows for additional tiers or categories.

**Template 8 — Fee Calculation**
- Purpose: Compute a fee or charge amount from formula.
- Required parameters: Base amount field, Fee rate field or constant, Output fee amount field (currency).
- Entity binding: Any entity with numeric/currency fields.
- Generated starter rule: A formula node computing `Round(baseAmount * feeRate, 2)` with one input variable for base amount and one for fee rate (either a field binding or a constant from an intermediate variable).
- Customisation flow: Adjust formula for tiered fees (add conditional branches), add minimum/maximum fee bounds using `Max(minimumFee, Round(baseAmount * rate, 2))`.

### 15.4 Template Instantiation Flow

1. Author opens Template Selector from command bar.
2. Author selects a template and clicks "Use this template".
3. The template PCRM JSON is copied into a new Draft Rule Version record.
4. A "Template Setup" dialog appears (one step per required parameter): author selects the entity, maps required fields via Metadata Picker, fills in threshold/rate values.
5. The designer pre-populates the JDM Editor with the template's starter graph (with the author's field mappings applied).
6. The author can immediately edit, add rows/conditions, or save as draft.
7. The template origin is recorded in the Rule Version's `mql_templateid` reference (for traceability).

---

## 16. Validation Framework

### 16.1 Design Principle

The Validation Framework is the primary compensation for the absence of inline WASM validation (ADR-10). It is entirely platform-owned and runs in the browser before any CRM write occurs. All validation is save-time (not as-you-type), except for structural pre-flight checks (Section 8.1 Step 2) which run before the full validation pass.

Validation produces three tiers of findings:

| Tier | Symbol | PCRM write behaviour | Example |
|------|--------|---------------------|---------|
| **Error** | ✗ (red) | Blocked — PCRM is NOT written to CRM | Formula uses `sum()` (GAP construct) |
| **Warning** | ⚠ (amber) | Allowed — PCRM is written; author acknowledges warning | Currency formula lacks `Round()` wrapper |
| **Suggestion** | ℹ (blue) | Allowed — informational; no acknowledgement required | Record-reference lookup may not be portable |

### 16.2 Complete Validation Rules

**Structural validations:**

| ID | Validation rule | Tier | Description |
|----|----------------|------|-------------|
| V-001 | Missing entity binding | Error | A rule input or condition references a field with no entity selected. |
| V-002 | Missing field binding | Error | An entity is selected but no field is selected for a condition or input. |
| V-003 | Invalid field type for operator | Error | The selected operator is not valid for the selected field's data type (see operator matrix, Section 11). |
| V-004 | Missing condition value | Error | An operator that requires a value has no value provided (e.g., "Equals" with empty value). |
| V-005 | Invalid option-set value | Error | A selected option value has been removed from the CRM metadata. The option set must be refreshed. |
| V-006 | Invalid lookup reference | Warning | A lookup-based condition references a specific record GUID that may not exist in the target environment. |
| V-007 | Empty decision table | Warning | The decision table has zero rows. A table with no rows produces no output. |
| V-008 | Empty output cell (non-default row) | Error | A non-default row in a decision table has an output cell with no value. |
| V-009 | Missing output binding | Error | The rule has no output fields declared. |
| V-010 | Duplicate output alias | Error | Two output columns share the same alias name. |
| V-011 | Empty expression tree | Error | An expression tree node has no conditions defined. |
| V-012 | Conflicting rows (Unique Match) | Warning | Two rows in a Unique Match table may match simultaneously (overlapping condition ranges detected). |

**Formula / expression validations:**

| ID | Validation rule | Tier | Description |
|----|----------------|------|-------------|
| V-013 | Unsupported H1 expression construct | Error | Grammar Pass-1: expression contains a GAP construct (array function, rand(), closure, template string, object/array literal). |
| V-014 | Regex complexity violation | Error | Grammar Pass-2: `EDP_Matches` pattern fails static complexity analysis. |
| V-015 | H2-deferred date method | Error | Grammar Pass-3: expression contains `.tz()`, `.format()`, `.set()`, `d("date","tz")`, `d("tz")`, or `duration()`. |
| V-016 | Currency/decimal output lacks Round() | Warning | Grammar Pass-4: formula output targets a currency or decimal field but the expression's outermost call is not `Round(...)`. |
| V-017 | Unknown function name | Error | Expression contains a function name not in the registered EDP_* function set and not in NCalc's built-in set. |
| V-018 | Variable alias conflict | Error | A rule variable alias matches an input alias — NCalc would be ambiguous. |
| V-019 | Circular variable dependency | Error | Variable A's formula references Variable B, which references Variable A. |
| V-020 | Variable referenced but not declared | Error | A formula expression references a variable alias that has not been declared in `variables[]`. |
| V-021 | Formula output type mismatch | Error | The formula's declared output type does not match the target field's data type. |

**Schema and structural integrity:**

| ID | Validation rule | Tier | Description |
|----|----------------|------|-------------|
| V-022 | PCRM schema validation failure | Error | The generated PCRM JSON fails NJsonSchema validation against the PCRM JSON Schema. This indicates a Rule Translator bug; the author is shown a "Please report this issue" message with a copy of the PCRM fragment. |
| V-023 | Unsupported JDM node type | Error | The JDM JSON contains a node type that the Rule Translator does not know how to translate. |
| V-024 | Invalid relationship path | Error | A traversal path in a binding references a relationship that no longer exists in the CRM metadata. |
| V-025 | Broken relationship path (field deleted) | Error | A field within a traversal path has been deleted from the CRM model. |
| V-026 | Decision table column count exceeds SDP ceiling | Warning | More than 20 columns in a single decision table (SDP ceiling per Phase 3 §17.1). |
| V-027 | Decision table row count exceeds SDP ceiling | Warning | More than 200 rows in a single decision table. |
| V-028 | Maximum nesting depth exceeded | Warning | Expression tree nesting exceeds 5 levels (SDP ceiling). |
| V-029 | Rule complexity exceeds SDP | Warning | Complexity score is above 100. P95 performance guarantee does not apply. |
| V-030 | Expression length exceeds SDP ceiling | Warning | Formula expression exceeds 1,000 characters. |

### 16.3 Validation Panel Display

The Validation Panel is a collapsible bottom panel in the designer layout (Section 20). It shows all current validation findings in a categorised list:

- Errors first (red header, count badge).
- Warnings second (amber header, count badge).
- Suggestions third (blue header, count badge).

Each finding row shows: [Tier icon] [Validation ID] [Finding description] [Location link]. Clicking the Location link scrolls the canvas/table to the affected element and highlights it. The "Save" button in the command bar is replaced with a "Save (N errors)" badge in red when errors are present, making it visually clear the save will be blocked.

If there are no findings, the panel shows "All checks passed" in green.

---

---

## 17. React Architecture

### 17.1 Application Shell

The designer is a React 18 single-page application built with Vite, deployed as CRM web resources. Per ADR-07, it is not Next.js (requires a server) and is not a PCF control (see Section 19 for PCF evaluation). The shell performs the following on startup:

1. Read `Xrm.Utility.getGlobalContext()` for user identity, language ID, environment URL, and organisation details.
2. Load all active Feature Flags from `mql_featureflag` entity records.
3. Load Rule Configuration from `mql_ruleconfiguration` entity records.
4. Initialise Zustand stores with loaded configuration (see 17.4).
5. Resolve the application route from the URL query string parameters (CRM web resources receive parameters via query string: `?ruleid=...&versionid=...&mode=...`).
6. Launch background metadata cache warm-up (non-blocking — see Section 9.7 cold-start UX).
7. Render the correct application view.

### 17.2 Routing Model

The designer uses client-side routing (React Router v6, hash-based to work within CRM web resource URL constraints). All routes share the application shell layout.

| Route | View | Parameters |
|-------|------|------------|
| `#/` | Rule Designer Home (rule list) | — |
| `#/rule/new` | New Rule wizard | `?templateid=` (optional) |
| `#/rule/:ruleId/version/:versionId/edit` | Rule Editor (design canvas) | ruleId, versionId |
| `#/rule/:ruleId/versions` | Version List for a rule | ruleId |
| `#/rule/:ruleId/version/:versionId/json` | JSON Viewer | ruleId, versionId |
| `#/rule/:ruleId/version/:versionId/test` | Test Rule stub | ruleId, versionId |
| `#/rule/:ruleId/version/:versionId/trace` | Execution Trace stub | ruleId, versionId |
| `#/rule/:ruleId/audit` | Audit History stub | ruleId |
| `#/admin` | Administration (metadata cache, config) | — |
| `#/templates` | Template Browser | — |

### 17.3 Component Hierarchy (Key Components)

```
<App>
 ├── <ErrorBoundary> (outer; catches shell failures)
 │    └── <Shell>
 │         ├── <TopCommandBar>
 │         │    ├── <SaveButton> | <SaveDraftButton>
 │         │    ├── <LifecycleStateChip>
 │         │    ├── <VersionSelector>
 │         │    ├── <CloneButton>
 │         │    ├── <TemplateSelector>
 │         │    ├── <JsonViewerButton>
 │         │    ├── <ImportButton>
 │         │    └── <ExportButton>
 │         ├── <LeftNavPanel>
 │         │    ├── <RuleFolderTree>
 │         │    ├── <RuleList> (filtered/searched)
 │         │    └── <RuleSearchInput>
 │         ├── <ErrorBoundary> (designer layer)
 │         │    └── <RuleEditorCanvas>
 │         │         ├── <GoRulesJdmEditor> (lazy-loaded)
 │         │         │    └── [GoRules JDM Editor component]
 │         │         ├── <MetadataPickerOverlay> (portals into GoRules panels)
 │         │         ├── <ExpressionBuilderPanel>
 │         │         └── <FormulaBuilderPanel>
 │         ├── <RightPropertiesPanel>
 │         │    ├── <RuleMetadataForm> (name, category, tags, description)
 │         │    ├── <ComplexityIndicator>
 │         │    ├── <BusinessFriendlySummary>
 │         │    ├── <DocumentationPreview>
 │         │    └── <DependenciesPreview>
 │         └── <BottomValidationPanel>
 │              ├── <ValidationErrorList>
 │              ├── <ValidationWarningList>
 │              └── <ValidationSuggestionList>
```

### 17.4 State Management (Zustand Stores)

Per design commitment C7 from Phase 3 skeptic triage, stores are partitioned by concern. The Horizon 2 visual debugger replay state is a separate, isolated store — not a modification of the authoring store.

| Store | Contents | Lifecycle |
|-------|----------|-----------|
| `metadataStore` | Entity list, attribute maps keyed by entity logical name, option set maps, cache version token, cache status (warm/loading/stale) | Session-scoped; invalidated on metadata version mismatch |
| `ruleDesignerStore` | Current JDM JSON state (from editor), current Rule Version record metadata (id, version number, lifecycle state, complexity score), dirty flag, pending save state | Rule-session-scoped; reset on navigation |
| `configurationStore` | Loaded Feature Flags, Rule Configuration values, SDP ceiling parameters | Session-scoped; reload on admin action |
| `sessionStore` | User identity (systemuserId, fullName, languageId), CRM environment URL, org name, time zone | Session-scoped; read-only after init |
| `validationStore` | Current validation findings (errors, warnings, suggestions), last validated JDM snapshot | Rule-session-scoped; updated on each save attempt |

### 17.5 CRM Data Access

All CRM data access uses the CRM SDK client (Xrm.WebApi for cloud; Xrm.WebApi with on-prem compatibility shims for CRM 9.x). No direct REST fetch calls — all calls go through the platform SDK to benefit from the platform's authentication and error handling.

Key API patterns:
- `Xrm.WebApi.retrieveRecord(entityLogicalName, id, options)` for single-record reads.
- `Xrm.WebApi.retrieveMultipleRecords(entityLogicalName, options)` for list queries with FetchXML/OData `$filter`.
- `Xrm.WebApi.createRecord` / `updateRecord` for saves.
- `Xrm.WebApi.execute(request)` for Custom Action invocations (e.g., metadata refresh, template instantiation).

### 17.6 Metadata and Rule Services (Browser-Side TypeScript)

Four platform-owned service modules operate in the browser:

**MetadataService:** Wraps the entity/attribute/option-set CRM APIs and the Zustand `metadataStore`. Provides:
- `getEntities(): Promise<EntitySummary[]>` — returns from cache or fetches.
- `getAttributes(entityLogicalName: string): Promise<AttributeSummary[]>` — returns from cache or fetches targeted attribute list.
- `getOptionSetValues(logicalName: string): Promise<OptionSetValue[]>` — returns from cache.
- `resolveBinding(displayName: string, entityLogicalName: string): string` — display to logical name.
- `resolveDisplayLabel(logicalName: string, entityLogicalName: string): string` — logical to display name.

**RuleTranslatorService:** Browser-side TypeScript service that:
- Maps JDM JSON + metadata bindings → PCRM JSON.
- Runs all four grammar validation passes.
- Computes the Rule Complexity Profile.
- Returns either a translated PCRM document or a list of translation errors.

**ValidationService:** Runs the full Validation Framework (Section 16) against the JDM JSON + PCRM JSON outputs. Returns structured findings by tier (error / warning / suggestion).

**BusinessSummaryGeneratorService:** Reads PCRM JSON and produces a human-readable summary string (Section 8.3). Pure function, no external dependencies.

### 17.7 Error Boundaries

React error boundaries are placed at three levels:
- **Outer / Shell level:** Catches errors in routing, store initialisation, and the command bar. Shows a full-page error state with a "Reload designer" button.
- **Designer Canvas level:** Catches errors within the GoRules JDM Editor component and the platform overlay components. Falls back to a "Designer failed to load — try reloading or export your rule as JSON to recover" panel. This ensures a GoRules component error cannot crash the entire shell.
- **Metadata Picker level:** Catches errors within picker dialogs. Falls back to "Field selection failed — enter the field alias manually" with a text input for the alias.

### 17.8 Loading and Empty States

| Component | Loading state | Empty state |
|-----------|--------------|------------|
| Rule List | Skeleton rows (3) | "No rules found. Create your first rule." + Create button |
| JDM Editor | "Loading designer..." spinner, centred | Empty canvas with "Start by adding a node" tooltip |
| Metadata Picker (entity list) | Skeleton rows | "No matching entities found. Try a different search term." |
| Metadata Picker (field list) | Skeleton rows | "No fields match your search." |
| Business-Friendly Summary | "Generating preview..." | "Add conditions and outputs to see a summary." |
| Validation Panel | — | "All checks passed." (green) |
| Version Selector | Skeleton pills | "This is the only version of this rule." |
| Dependencies Preview | Spinner | "No dependencies found." / "This rule has no references to other rules." |

### 17.9 Localization

`react-i18next` for all designer UI strings. RESJSON files as web resources, loaded at startup based on `Xrm.Utility.getGlobalContext().userSettings.languageId`. All string constants in the designer are externalised to the RESJSON file — no hardcoded English strings in component JSX. CRM metadata display labels (entity names, field names, option labels) are localised by the Metadata Service from CRM's own localised label data.

RTL layout readiness: CSS uses logical properties (`margin-inline-start` instead of `margin-left`, `inset-inline-end` etc.) throughout. RTL language support requires testing in Phase 5 but the layout does not need rework to support it.

### 17.10 Theme

Fluent UI v9 `FluentProvider` wraps the application. Theme is determined from the CRM shell's theme context (via `Xrm.Utility.getGlobalContext()` theme data) and from the OS preference signal (`prefers-color-scheme`). The designer respects the Dynamics 365 light/dark theme switch. Tailwind CSS utility classes are used for layout and spacing; Fluent UI components handle interactive chrome and color tokens.

---

## 18. CRM Web Resource Packaging

### 18.1 Web Resource Structure

All designer files are registered as CRM web resources with individual `RootComponent` declarations in `solution.xml`. No folder wildcards are used (per the CRM packaging rule documented in the user's memory and Phase 3 §4.2).

The web resource namespace follows the Phase 3 naming standard: `mql_/edp/designer/<filename>`.

| Web resource | Type | Purpose |
|--------------|------|---------|
| `mql_/edp/designer/index.html` | HTML | Designer entry point. Loads the shell script. |
| `mql_/edp/designer/app.[hash].js` | Script | Main React application bundle (chunked by Vite). |
| `mql_/edp/designer/vendor.[hash].js` | Script | Third-party vendor chunk (React, Fluent UI, GoRules editor, react-i18next, Zustand). |
| `mql_/edp/designer/goruleseditor.[hash].js` | Script | GoRules JDM Editor chunk (lazy-loaded). |
| `mql_/edp/designer/app.[hash].css` | CSS | All application styles (Fluent UI tokens + Tailwind utilities). |
| `mql_/edp/designer/zen-engine.wasm` | Data | GoRules WASM binary. Present but NOT loaded in H1 (degraded mode). Retained for future WASM path (H2). |
| `mql_/edp/schemas/pcrm-v1.0.0.schema.json` | Data | PCRM JSON Schema (published contract). |
| `mql_/edp/i18n/en-us.resjson` | Data | English localisation strings. |
| `mql_/edp/i18n/ar-sa.resjson` | Data | Arabic strings (Horizon 2 — placeholder in H1). |
| `mql_/edp/designer/assets/icons.[hash].svg` | Data | SVG icon sprite for field type and entity icons. |

### 18.2 Entry HTML Configuration

`index.html` is the CRM web resource entry point. It:
- References no external CDN URLs (CSP-compatible; all assets are co-located web resources).
- Loads the main JS bundle via a `<script type="module">` tag with a relative URL.
- Passes the web resource root URL as a global variable (`window.__EDP_ASSET_BASE_URL__`) derived from `Xrm.Utility.getGlobalContext().getClientUrl()`. All lazy-loaded chunks and the WASM file are resolved relative to this base URL.
- Does not hardcode any CRM organisation URL, environment ID, or GUID.

### 18.3 Cache Busting and Versioning

Vite generates content-hash suffixes on all JS and CSS files (e.g., `app.3f2a1b.js`). Because CRM web resource cache is controlled by the web resource version number (set on the web resource record), the Vite output hash in the filename is the secondary cache buster. The build pipeline must:
1. Generate hashed filenames via Vite.
2. Register each output file as a named web resource in the solution.
3. Increment the web resource version number in the solution on every deployment.

A single deployment increments all web resource version numbers atomically (solution export/import handles this).

### 18.4 Environment Configuration

No secrets, environment URLs, or tenant-specific values are hardcoded in any web resource. All environment-specific values are read at runtime from the CRM context (`Xrm.Utility.getGlobalContext()`, Environment Variables via Xrm.WebApi). The environment variable `mql_edp_IsProductionEnvironment` is read to control governance strictness display in the designer.

### 18.5 On-Premises Compatibility

- No SharedArrayBuffer usage (required by WASM COOP/COEP, not available in degraded mode — this is the ADR-10 choice).
- No ES2022+ constructs that are not available in the supported on-prem browser versions. Phase 4 must confirm the CRM On-Prem 9.x browser compatibility target and set Vite's `targets` accordingly.
- The Vite build uses `@vitejs/plugin-legacy` for on-prem IE11 fallback if required (on-prem customer environments may still have IE11 users — this must be confirmed in Phase 4).
- Asset URLs use the absolute CRM server URL (`window.__EDP_ASSET_BASE_URL__`) to work regardless of URL depth in the on-prem deployment.

### 18.6 Managed Solution Deployment

The designer web resources are part of the `MaqsadEDPManaged` managed solution. Solution import in the customer environment:
- Overwrites all web resource files at the registered web resource name.
- Does NOT overwrite active user customisations on entities or forms.
- Solution version is incremented on each release per the managed upgrade strategy (Phase 3 §4.7).

PAC CLI deployment path (Dataverse cloud): `pac solution push` with individual web resource upsert commands in the CI/CD pipeline. Each web resource file is declared individually (no wildcard push).

---

## 19. PCF Evaluation

### 19.1 PCF Re-evaluation (Required by ADR-07)

Phase 3 ADR-07 deferred PCF to Horizon 2 re-evaluation. This section is the designer-phase formal assessment.

**What PCF offers over a web resource for the Rule Designer:**

| Factor | PCF advantage | Relevance to Rule Designer |
|--------|--------------|---------------------------|
| Property binding | PCF gets data-bound CRM record fields directly | The designer is not a field-level control; it manages its own rule record reads/writes via Xrm.WebApi |
| Standard control lifecycle | Framework-managed init/updateView/destroy | The designer's React lifecycle handles this adequately |
| Availability on model-driven app | PCF embeds directly in a model-driven form | The designer is a full-screen canvas, not an inline field control |
| TypeScript types generated from schema | PCF tools generate component manifest types | The designer uses its own TypeScript type layer for PCRM |
| Full-trust vs. virtual PCF | Virtual PCF runs in iframe; full-trust is deprecated | Virtual PCF has the same iframe COOP/COEP limitations as a plain web resource; WASM headers are still unavailable |

**What the web resource has over PCF for the Rule Designer:**

| Factor | Web resource advantage |
|--------|----------------------|
| Full-page canvas | Web resources can be opened as full-screen pages; PCF components are constrained to a column/section on a form |
| Deployment simplicity | Web resources are standard solution components on all CRM versions; virtual PCF requires PCF framework version compatibility per CRM release |
| On-premises support | PCF support on CRM On-Premises 9.x is partial and version-dependent. The web resource is fully supported on CRM On-Prem 9.x — a first-class requirement (Phase 0 Invariant 8) |
| Bundle size flexibility | Web resources have a generous 5 MB per-file limit (Dataverse) with no PCF component manifest overhead |
| Lazy loading across components | The designer loads the GoRules editor lazily; PCF's component lifecycle does not accommodate this pattern as cleanly |

### 19.2 Verdict: Reaffirm Web Resource (ADR-07 Confirmed)

**Decision: Web resource remains the correct and only viable host for the Visual Rule Designer in Horizon 1.**

Rationale:
1. The Rule Designer is a full-screen authoring application, not an inline field control. PCF's design centre is inline controls; the designer's scope exceeds PCF's natural fit.
2. PCF on CRM On-Premises 9.x (virtual PCF / standard PCF) is partial and version-specific. The web resource works fully on CRM On-Prem 9.x without version constraints — this is a non-negotiable requirement.
3. PCF virtual PCF (the modern recommended form) runs in an iframe. The COOP/COEP WASM header limitation that affects web resources (ADR-10) equally affects a PCF iframe for the same reasons. PCF does not resolve the WASM problem.
4. The complexity of managing a full-screen React SPA within PCF's `updateView()` lifecycle cycle adds integration overhead with no compensating benefit for this use case.

**PCF is deferred to Horizon 2 re-evaluation ONLY for a potential narrow use case: embedding a small, inline "rule result indicator" PCF component on a CRM form to show the result of a rule evaluation for a specific record.** This would be a separate, lightweight PCF — distinct from the full Rule Designer. No decision is made here; it remains a design intent.

---

## 20. UX Layout

### 20.1 Overall Layout Structure

The designer uses a four-zone layout: top command bar, left navigation panel, main canvas, and right properties panel. A collapsible bottom panel holds the Validation results. ASCII structural sketch:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP COMMAND BAR                                                               │
│ [EDP Logo] [Rule Name ▸ v3 Draft] [Version ▼] [Template ▼] [· · ·]          │
│ [Save Draft] [Submit for Review] [Clone] [Validate] [Preview JSON] [Export]  │
└──────────────────────────────────────────────────────────────────────────────┘
┌────────────────┬───────────────────────────────────────┬─────────────────────┐
│ LEFT NAV       │ MAIN CANVAS                           │ RIGHT PROPERTIES    │
│                │                                       │                     │
│ ┌────────────┐ │ ┌───────────────────────────────────┐ │ [Rule Metadata]     │
│ │ Rule List  │ │ │                                   │ │   Name              │
│ │ Search...  │ │ │   GoRules JDM Editor Canvas       │ │   Category          │
│ │            │ │ │   (decision graph / table view)   │ │   Tags              │
│ │ Folders    │ │ │                                   │ │                     │
│ │ ▶ Credit   │ │ │   Nodes, edges, decision tables   │ │ [Complexity]        │
│ │ ▶ Eligib.  │ │ │   Formula panels                  │ │   Score: 42 / 100   │
│ │ ▶ Routing  │ │ │                                   │ │                     │
│ │            │ │ │   [+ Add Node]    [Zoom ±]        │ │ [Rule Summary]      │
│ │ [+ New]    │ │ └───────────────────────────────────┘ │  "If Loan Amount    │
│ └────────────┘ │                                       │   > 500,000 AND     │
│                │ ┌───────────────────────────────────┐ │   Risk = High       │
│ [Refresh]      │ │ Expression Builder / Formula Bld  │ │   THEN Approval =   │
│ [Admin]        │ │ (shown when node is selected)     │ │   CEO"              │
│                │ └───────────────────────────────────┘ │                     │
│                │                                       │ [Documentation]     │
│                │                                       │                     │
│                │                                       │ [Dependencies]      │
└────────────────┴───────────────────────────────────────┴─────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ BOTTOM VALIDATION PANEL (collapsible)                                        │
│ [✗ 2 Errors] [⚠ 1 Warning] [ℹ 0 Suggestions]                                │
│ ✗ V-004 · Row 3, Output column "Approval Level" · Missing value  [→ Go]      │
│ ✗ V-013 · Formula node "Monthly Fee" · sum() not available in H1 [→ Go]     │
│ ⚠ V-016 · Formula "Fee Amount" · Consider wrapping with Round()  [→ Go]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 20.2 Top Command Bar — Full Control Set

| Control | Purpose | Available when |
|---------|---------|---------------|
| Rule Name + Version indicator | Shows rule display name and current version number with lifecycle state chip (Draft / In Review / Approved / Published / Retired) | Always |
| Version Selector | Dropdown listing all versions of this rule with their state and date. Navigate to any version (read-only for non-Draft). | Always |
| Template Selector | Open Template Browser to instantiate a template (replaces current empty canvas). Available only on new, empty rules. | New rule, canvas empty |
| Save as Draft | Save current state to CRM as Draft Rule Version (blocked if errors present). | Lifecycle state = Draft |
| Submit for Review | Transition lifecycle state to In Review. Prompts for submission note. Requires no validation errors. | Lifecycle state = Draft |
| Clone | Create a new Draft Rule Version as a copy of the currently viewed version. Opens a name dialog. | Any lifecycle state |
| Validate | Manually trigger the full Validation Framework pass. Results shown in bottom panel. | Lifecycle state = Draft |
| Preview JSON | Open read-only JSON Viewer modal showing the current PCRM JSON. | Always |
| Import | Import a PCRM JSON file as a new Draft Rule Version. File picker + validation before import. | Admin / Author roles |
| Export | Export the current version's PCRM JSON to a downloadable `.json` file. | Always |
| Metadata Refresh | Hidden in an overflow menu ("..."). Triggers a manual metadata cache refresh. Warns if refresh is in progress. | EDP Rule Administrator role only |

### 20.3 Rule Designer Home (Rule List View)

The Rule Designer Home is the landing page when no specific rule is selected.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ENTERPRISE DECISION PLATFORM · Rule Designer                                  │
│ [+ Create Rule] [Import from JSON] [Browse Templates]          [Search rules]│
├──────────────────────────────────────────────────────────────────────────────┤
│ Filter: [All categories ▼] [All states ▼] [My rules ▼]                      │
├────────────────────┬────────────────┬────────────────┬────────────────┬──────┤
│ RULE NAME          │ CATEGORY       │ STATE          │ LAST MODIFIED  │      │
├────────────────────┼────────────────┼────────────────┼────────────────┼──────┤
│ DOA Approval       │ Credit Risk    │ ● Published v3 │ 2026-07-01     │ Edit │
│ Loan Eligibility   │ Eligibility    │ ◑ Draft v4     │ 2026-07-03     │ Edit │
│ Document Check     │ Compliance     │ ○ In Review v2 │ 2026-06-29     │ View │
│ Monthly Fee Calc   │ Pricing        │ ● Published v1 │ 2026-06-15     │ Edit │
└────────────────────┴────────────────┴────────────────┴────────────────┴──────┘
```

Lifecycle state indicators: ● Published (green), ◑ Draft (blue), ○ In Review (amber), ◉ Approved (teal), ✗ Retired (grey).

Server-side paging (50 rules per page, FetchXML paging cookie). Quick Find search on rule name. Filter by Category (bound to `mql_rulecategory` entity), State (bound to lifecycle state picklist), and "My Rules" (rules authored by the current user — uses CRM owner filter).

### 20.4 Right Properties Panel — Tabs

The right panel is organised into four tabs:

**Properties tab:** Rule name (editable text field, auto-saved on blur), Category selector (lookup to `mql_rulecategory`), Tags (multi-select from `mql_ruletag`), Description (multi-line text), Complexity indicator (gauge: 0–100 score with colour coding: green 0–50, amber 51–79, orange 80–99, red 100+).

**Summary tab:** Business-Friendly Rule Summary (Section 8.3). Read-only. "Copy to Clipboard" icon. "Expand" icon opens a modal for easier reading on complex rules.

**Documentation tab:** Structured human-readable documentation fields: Purpose (multi-line), Business Context (multi-line), Authoring Notes (multi-line), Last Reviewed On (date), Reviewed By (lookup to systemuser). All fields are per-Rule-Version (stored in the Rule Documentation entity).

**Dependencies tab:** Two sub-lists:
- "This rule calls" — rules that this version invokes as sub-decisions (from PCRM `logic` sub-decision references). Each is a clickable link opening that rule in the designer.
- "Calls this rule" — rules that invoke this rule as a sub-decision (queried from `mql_ruledependency` entity). Read-only. "Impact: changing this rule will affect N other rules" summary chip.

### 20.5 Placeholder Stub Panels

Three placeholder panels have UI shells but no backend implementation in H1:

**Test Rule panel** (route `#/rule/:ruleId/version/:versionId/test`):
```
┌────────────────────────────────────────┐
│ TEST RULE — DOA Approval v3            │
│ ─────────────────────────────────────  │
│ [Input fields: Loan Amount, Risk ...]  │
│ [Run Test]                             │
│                                        │
│ ⚙  Coming in Horizon 2               │
│ Test rule execution against sample     │
│ inputs to verify outputs.              │
└────────────────────────────────────────┘
```

**Execution Trace panel** (route `#/rule/:ruleId/version/:versionId/trace`):
```
┌────────────────────────────────────────┐
│ EXECUTION TRACE                        │
│ ─────────────────────────────────────  │
│ ⚙  Coming in Horizon 2               │
│ View step-by-step evaluation history   │
│ for this rule version.                 │
└────────────────────────────────────────┘
```

**Audit History panel** (route `#/rule/:ruleId/audit`):
```
┌────────────────────────────────────────┐
│ AUDIT HISTORY — DOA Approval           │
│ ─────────────────────────────────────  │
│ ⚙  Coming in Horizon 2               │
│ View lifecycle transitions, approvals  │
│ and administrative events for this     │
│ rule.                                  │
└────────────────────────────────────────┘
```

All three stubs render a visible, accessible placeholder — not a blank page — with a "Coming in Horizon 2" message and a brief description of what the panel will do. The routes are registered and accessible; the content is a stub component.

---

## 21. Security Considerations

### 21.1 Field-Level Security in Pickers

The Metadata Picker must not surface fields that the current user cannot access due to CRM Field-Level Security (FLS) profiles. When the designer fetches entity attribute metadata (via the on-prem Custom Action or Dataverse Web API), the call executes under the current user's security context. Attributes restricted by FLS are not returned by the metadata API for users who lack read access — the picker never has to explicitly check or filter them. This is the platform-enforced guarantee.

However: the designer must NOT surface a binding error for fields excluded by FLS when loading an existing rule. If a rule was authored by a user with higher field access and the current user loading the rule lacks access to a field, the designer shows "Field access restricted by your security profile" on that binding — not an error. The rule can still be saved; the restricted binding persists unchanged (it is already stored in the PCRM).

### 21.2 Honouring CRM Security Roles

The designer reads the current user's EDP security role (from a cached role check at startup) and adjusts the available controls:

| EDP Role | Designer capabilities |
|----------|-----------------------|
| EDP Rule Author | Full editing of Draft rules. Cannot approve or publish. Cannot access admin panel. |
| EDP Rule Approver | Author capabilities + lifecycle transition controls (Submit for Review, Approve, Publish, Retire). |
| EDP Rule Administrator | All capabilities + Admin panel (metadata refresh, configuration management). |
| EDP Rule Auditor | Read-only access. Version selector, JSON viewer, summary, documentation, dependencies. No editing. |
| EDP Rule Executor | No designer access. Designer redirects to "You do not have permission to access the Rule Designer." |

Role detection is done by checking membership in the EDP security roles at startup (`Xrm.Utility.getGlobalContext().userSettings.securityRoles`). This check is cached for the session.

### 21.3 No Schema Leakage

Authors never see logical schema names in the designer UI. This includes:
- Entity logical names — never shown, never in tooltips.
- Attribute logical names — never shown. The PCRM JSON Viewer (for Preview JSON command) is accessible only to users with Author or higher role and shows a sanitised display-name annotated version, not raw PCRM JSON, in the default view. A "Raw JSON" toggle is available for Authors who need it (e.g., to import/export).
- Option-set integer values — never shown. Only labels.
- GUIDs — never shown in authoring flows. Shown in the Raw JSON Viewer only.

### 21.4 Lifecycle State Protection

Editing controls (canvas editing, formula builder, metadata picker overlays) are disabled when the rule's lifecycle state is not Draft. The GoRules JDM Editor receives `mode: "view"` in its configuration when the state is In Review, Approved, Published, or Retired. The save button is hidden. The command bar shows only Clone (to create an editable copy) and Export.

The server-side lifecycle plugin (Pre-Validation on Rule Version state transitions) is the authoritative enforcement point; the designer's client-side disabling is a UX convenience, not the security boundary.

### 21.5 Rule Safety — No Code Injection via Designer

The designer does not allow authors to enter arbitrary JavaScript or C# code. Formula expressions are restricted to the EDP-H1 grammar. The save-time grammar validator (Section 16, Pass 1) blocks all out-of-grammar constructs before the expression reaches the PCRM. The NCalc evaluator in the C# runtime evaluates only registered functions — unregistered function names are rejected. This chain prevents expression injection.

---

## 22. Performance Considerations

### 22.1 Metadata Cache Performance

Per W4/W11 triage commitment:
- Entity list for the picker is served from the browser session cache (`metadataStore`) after the first successful fetch. Subsequent picker opens are sub-5ms (in-memory).
- First fetch (cold start) shows a non-blocking loading state. The cache is persisted in CRM entity records, so cold starts occur only on first deployment or after metadata version token mismatch.
- Targeted attribute retrieval (`EntityFilters.Attributes` on the Custom Action call) limits the on-prem payload. Full RetrieveAllEntities is not used; entity-by-entity retrieval on demand is the pattern.

### 22.2 Large Rule Rendering

For rules with large decision tables (approaching the 200-row SDP ceiling):
- The GoRules JDM Editor renders the decision table virtually (windowing). Only visible rows are in the DOM. Phase 4 must validate this with the actual GoRules editor version.
- The Business-Friendly Summary truncates after 10 rows of a decision table display with a "Show all N rows" expandable section.
- The Complexity Indicator updates in real-time as rows are added, warning at 80% threshold.
- PCRM JSON compression (gzip + Base64) kicks in automatically for PCRM documents exceeding 512 KB (configured via Rule Configuration entity, default per Phase 3 §9.4). The designer transparently decompresses on load.

### 22.3 Designer Startup Performance

Target: designer is interactive (rule list visible, shell ready) within 3 seconds on a standard Dataverse environment. Optimisations:
- Vendor and GoRules editor chunks are lazy-loaded after the shell renders.
- Rule list uses server-side paging (50 rules, fast FetchXML query on initial load).
- Metadata warm-up is a background operation that does not block the shell render.
- React DevTools profiler baseline must be run in Phase 4 to establish startup benchmarks.

### 22.4 Save Performance

Target: save operation (Translate → Validate → CRM write) completes within 2 seconds for SDP-ceiling rules. The CRM write is the dominant time:
- Rule Translator and grammar validation (browser-side): target < 200ms for SDP-ceiling rules.
- PCRM schema validation (NJsonSchema in browser via WASM-free JS port if available, or a lightweight structural check): target < 100ms.
- CRM Xrm.WebApi updateRecord call: target P95 < 1,500ms on Dataverse.

### 22.5 Large Organisation Support (W8 / Complexity Measurement)

Per W8 triage commitment, Phase 4 Sprint 1 builds a benchmark harness measuring PCRM deserialize + rule load + evaluation across complexity profiles. The designer's SDP ceiling values (complexity score parameters) are set from those measurements, not from assumptions. The designer's complexity calculation mirrors the runtime's complexity calculation so that what the designer shows as the complexity score matches what the runtime will measure.

---

## 23. Accessibility

The designer targets **WCAG 2.1 Level AA**. Because it is an enterprise authoring tool used daily by business analysts, accessibility is a first-class requirement, not a compliance afterthought.

### 23.1 Keyboard Operability
- Every authoring action reachable by mouse is reachable by keyboard: adding/deleting conditions, opening pickers, reordering groups, editing decision-table cells, and traversing the rule tree.
- The Expression Builder supports full keyboard navigation: `Tab`/`Shift+Tab` between conditions, `Enter` to edit a value, `Ctrl+D` to duplicate a condition, `Delete` to remove, `Alt+↑/↓` to reorder (mirroring the drag-reorder in Section 12).
- The Decision Table Designer behaves like a spreadsheet: arrow keys move the active cell, `Enter` commits, `Tab` advances, `Ctrl+Enter` adds a row. This is the single most important keyboard surface — decision tables are unusable by keyboard-only authors otherwise.
- A documented keyboard-shortcut reference is available from the command bar (`?` key), and focus order follows the visual left-nav → canvas → property-panel → validation-panel reading order.

### 23.2 The GoRules Canvas — the known accessibility gap
The embedded GoRules JDM Editor is a third-party React canvas and its internal keyboard/screen-reader support is **not guaranteed by EDP** (ADR-10 already accepts a degraded GoRules experience). To avoid the canvas being an accessibility dead-end:
- All authoring that the canvas performs graphically is **also** available through the platform-owned, fully-accessible Expression Builder, Formula Builder, and Decision Table Designer, which are the primary authoring surfaces. The canvas is a visualisation and structural-navigation aid, not the only path.
- Where a keyboary-only or screen-reader user cannot operate a canvas gesture, the property panel provides an equivalent form-based control. This is a **hard requirement**: no authoring capability may exist *only* on the canvas.

### 23.3 Screen Reader Support
- All pickers (Entity, Field, Operator, Value, Option Set, Lookup) are Fluent UI components with correct ARIA roles, labels, and live-region announcements for search results ("12 fields match").
- The Business-Friendly Summary (Section 12.6) doubles as the screen-reader-friendly representation of a rule: it is real, selectable text ("If Loan Amount is greater than 500,000 AND Risk Rating equals High THEN Approval Level is CEO"), announced in reading order. A screen-reader user can comprehend an entire rule from the summary without touching the canvas.
- The Validation Panel uses an ARIA live region so newly-raised errors/warnings are announced as they appear.

### 23.4 Visual Accessibility
- Colour is never the sole carrier of meaning: validation severity uses icon + colour + text label (Error/Warning/Suggestion), not colour alone. Decision-table hit-policy and lifecycle states use labels, not just colour chips.
- The designer inherits the Fluent UI high-contrast theme and respects the CRM/Dataverse theme and OS `prefers-contrast`/`prefers-reduced-motion` settings (drag animations disabled under reduced-motion).
- Minimum target size 24×24 CSS px for interactive controls; text meets 4.5:1 contrast (3:1 for large text and UI components).

### 23.5 Accessibility Acceptance
Accessibility is verified in Phase 5 with automated axe-core scans (zero critical violations gate) plus a manual keyboard-only and screen-reader (NVDA + Narrator) authoring pass on the full "create → validate → save draft" flow.

---

## 24. Localization

The designer is built localization-ready from the start; the QDB deployment context (qdb.qa) makes Arabic/RTL a near-term, not hypothetical, requirement.

### 24.1 Two Distinct Localization Layers
There are two separate concerns that must not be conflated:

| Layer | What is localized | Source of truth |
|-------|-------------------|-----------------|
| **Designer chrome** | UI labels, buttons, menus, validation messages, help text | EDP resource bundles (per-locale JSON), keyed strings |
| **Business metadata** | Entity display names, field display names, option-set labels | **CRM metadata localized labels** — the platform, not EDP |

The critical rule: EDP **never** translates business metadata itself. When an author's user-language is Arabic, the Metadata Picker shows the **CRM-provided Arabic display label** for each entity/field/option (Dataverse localized labels), falling back to the base language label when a localized label is absent. This keeps EDP consistent with how the same field appears everywhere else in CRM.

### 24.2 Designer Chrome Localization
- All designer strings are externalised into per-locale resource bundles (no hardcoded UI text). Keyed lookups with an explicit fallback chain: user locale → org base language → English.
- The active locale is read from `Xrm.Utility.getGlobalContext().userSettings.languageId` (LCID) at startup.
- Number, date, and currency **display** formatting in the designer (previews, value editors) uses the user's locale conventions; the **stored** PCRM values remain culture-invariant (ISO-8601 UTC dates, invariant-culture decimals) per the EDP-H1 determinism rules — display locale never leaks into stored data.

### 24.3 RTL Readiness
- The layout (Section 20) is authored with logical CSS properties (`inline-start`/`inline-end`, not `left`/`right`) so the shell mirrors correctly under `dir="rtl"`.
- The left navigation becomes the right navigation; the property panel moves to the left; the Business-Friendly Summary renders RTL with correctly-ordered mixed LTR content (numbers, logical-name-free) using Unicode bidi isolation.
- **Known constraint:** the GoRules JDM Editor canvas is not guaranteed RTL-aware. The canvas remains LTR even under an RTL shell; this is documented as an ADR-10-class accepted limitation. Because the accessible platform-owned builders (Section 23.2) are RTL-correct, an Arabic author is not blocked by the LTR canvas.

### 24.4 Localization Acceptance
Phase 5 verifies the full designer in at least English and Arabic: chrome fully translated, metadata labels sourced from CRM localized labels, RTL shell mirrored, and stored PCRM values confirmed culture-invariant regardless of author locale.

---

## 25. Error Handling

Error handling is a designed surface, not a fallback. The guiding principle: **an author must always understand what went wrong and never lose work.**

### 25.1 Error Boundaries
- A top-level React Error Boundary wraps the app shell; a component-level boundary wraps the GoRules canvas specifically, so a canvas crash degrades to "The visual canvas failed to load — you can still edit this rule using the property panel and builders, or reload" rather than a white screen. This directly leverages the Section 23.2 guarantee that the canvas is never the only authoring path.
- Each major panel (rule tree, property panel, validation panel) has its own boundary so a failure in one does not take down the others.
- Boundaries log structured diagnostics (component, rule id, lifecycle state, translator/PCRM version) to the browser console and, where available, to a diagnostics buffer — never to `console.log` in shipped code paths beyond the structured diagnostics channel.

### 25.2 Save Failures
Saving is the highest-stakes operation. The failure model:
- **Translation failure** (GoRules JSON → PCRM): the save is aborted *before* any CRM write. The author is shown the specific untranslatable construct with a link to the offending node/expression. The in-progress design is retained in the editor — nothing is lost.
- **Validation failure** (grammar / schema): save is blocked; the Validation Panel is focused with the blocking errors. Warnings and Suggestions do **not** block save (Section 16 tiering).
- **CRM write failure** (network, throttling, privilege): the author sees a non-destructive toast ("Save failed — your changes are still here. Retry?") with a Retry action. The editor state is preserved in memory and, as a safety net, in a browser-local draft snapshot keyed by rule id so an accidental reload does not lose unsaved work. The local snapshot is cleared on successful save.
- **Optimistic-concurrency conflict** (another user published a new version): the author is warned that a newer version exists and is offered "Reload latest" or "Save as new draft from my copy" — never a silent overwrite.

### 25.3 Load / Render Failures
- If a stored PCRM cannot be rendered back to the designer (e.g., a PCRM authored by a newer schema version than this designer build understands — Section 8 backward compatibility), the designer shows a read-only, summary-plus-raw-JSON view with "This rule was created with a newer version of the Rule Designer. Viewing is available; editing requires an updated designer." The rule is never corrupted by a partial render, and save is disabled to prevent a lossy round-trip.
- Metadata load failure (picker cannot reach CRM metadata) degrades pickers to a "metadata unavailable — retry" state without crashing the rule being edited; existing bindings still display their stored display-name annotations.

### 25.4 Validation-Surfaced Errors
All rule-content problems flow through the single Validation Framework (Section 16) and are surfaced consistently in the Validation Panel with severity, message, and a deep-link to the offending element. There is one error-presentation vocabulary across the whole designer — authors learn it once.

---

## 26. Risks and Mitigations

Designer-specific risks, additive to the Phase 0 / Phase 1 / Phase 3 risk registers. Prefix `PD-R` (Phase-Designer-Risk).

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| PD-R-1 | **GoRules canvas fights the platform-owned model** — the JDM Editor's internal state and EDP's metadata-bound property panel drift out of sync, so what the canvas shows differs from what is saved. | High | Medium | Single source of truth is the platform state store, not the canvas. The canvas is driven from, and emits into, the store through the Section 5 embedding adapter; a reconciliation step on every canvas change re-derives the summary. Phase 4 must build round-trip tests (canvas edit → store → canvas re-render equality). |
| PD-R-2 | **Degraded-WASM authoring is too slow for real BAs** (no autocomplete/inline validation) — the 30-minute authoring benchmark (NFR-008) fails in Phase 5. | High | Medium | Save-time grammar validation with precise messages (Section 16); a prominent EDP-H1 expression quick-reference panel; worked-example templates (Section 15). If Phase 5 still fails, ADR-10 is superseded and the Horizon-2 cloud Custom Page (CORS-capable, WASM-enabled) path is accelerated. Mirrors P3-R-6. |
| PD-R-3 | **Business-Friendly Summary misrepresents the rule** — the natural-language preview says something subtly different from what the PCRM will execute, and authors trust the summary. | High | Low | The summary is generated deterministically from the *same* PCRM the runtime executes, never from the canvas or an intermediate model. Summary generation is unit-tested against known PCRM→text pairs. The summary explicitly renders operator precedence/parentheses so nested AND/OR is unambiguous. |
| PD-R-4 | **Metadata cold-start on a large org** makes first designer open feel broken (Section 22.1 / triage W4/W11). | Medium | Medium | Persisted metadata cache, targeted attribute retrieval, non-blocking loading state, background warm-up. Measured against the W8 harness. |
| PD-R-5 | **Template instantiation produces an invalid rule** — a template's field mappings don't match the target org's actual schema (e.g., `qdb_loanamount` absent), yielding broken bindings on first open. | Medium | Medium | Templates bind by *role* and resolve to concrete fields through the Metadata Picker at instantiation time (Section 15); unresolved mappings are surfaced as Warnings in the Validation Panel immediately after instantiation, not discovered later. |
| PD-R-6 | **Author enters an out-of-grammar formula** expecting an H2 function (e.g., `Sum()` over a collection) and is confused when it is disabled. | Low | Medium | H2 functions are shown in the Formula Builder palette but visibly disabled with an "Available in a future release" tooltip — discoverable but unusable, so expectations are set at author time rather than at save-time rejection. |
| PD-R-7 | **PCRM schema evolution breaks render-back** — a future PCRM version cannot be edited by an older designer build. | Medium | Low | Section 8 backward-compatibility: PCRM carries a schema version; the designer render-back checks it and falls back to read-only view for newer versions rather than corrupting the rule. Governed by the PCRM Schema Steward (triage C1). |
| PD-R-8 | **Web-resource bundle size** — the React app plus the GoRules editor exceeds practical web-resource limits or loads slowly. | Medium | Low | Code-splitting: shell first, GoRules editor and heavy builders lazy-loaded (Section 22.3). Bundle-size budget enforced in Phase 4 CI. PCF is explicitly *not* adopted to solve this (ADR-D reaffirms ADR-07). |

---

## 27. Architecture Decision Records

Designer-specific ADRs, numbered `ADR-D0x` to avoid collision with the platform ADR-01…13 series. All conform to the platform ADRs and Phase 0 invariants.

### ADR-D01: Platform-Owned Validation Instead of GoRules/WASM Validation
**Status:** Accepted · **Date:** 2026-07-04
**Context:** ADR-10 established that WASM features — including GoRules' inline expression validation — are unavailable in a plain CRM web resource. A rule authored with no validation until runtime is unacceptable.
**Decision:** EDP owns a complete, browser-side Validation Framework (Section 16) that runs at edit time and at save time, independent of any WASM. It validates metadata bindings, operator/field-type compatibility, the EDP-H1 grammar, PCRM schema, and decision-table integrity, returning Error/Warning/Suggestion tiers. Save is blocked only by Errors.
**Consequences:** EDP maintains its own validation logic (a real cost) but gains platform independence from GoRules, on-prem/cloud parity, and validation that speaks in business terms rather than raw expression syntax. This validator is also the compensating control for the degraded-WASM authoring experience.

### ADR-D02: Deterministic Business-Friendly Summary Generated from PCRM
**Status:** Accepted · **Date:** 2026-07-04
**Context:** Authors — especially keyboard/screen-reader users and approvers — need to understand a rule without reading the canvas or raw JSON. A summary that is generated from the canvas or an intermediate model risks disagreeing with what executes.
**Decision:** The Business-Friendly Summary is generated deterministically from the **same PCRM** the runtime executes, is real selectable text, renders precedence/parentheses explicitly, and is the canonical human-readable representation of a rule (also serving accessibility, Section 23.3).
**Consequences:** The summary is trustworthy for approval and audit. It must be unit-tested against PCRM→text fixtures and kept in lock-step with PCRM schema changes.

### ADR-D03: Role-Based Template Instantiation with Deferred Field Binding
**Status:** Accepted · **Date:** 2026-07-04
**Context:** Rule templates (Section 15) must work across orgs with different schemas; a template that hardcodes `qdb_loanamount` breaks anywhere that field differs.
**Decision:** Templates declare **parameter roles** and **entity/field mappings resolved at instantiation time** through the Metadata Picker. Instantiation produces a Draft rule with concrete bindings; any unresolved mapping is raised immediately as a Validation Warning.
**Consequences:** Templates are portable and org-agnostic, aligning with the metadata-driven principle. Template authoring is slightly more abstract (roles, not fields), and instantiation requires a metadata round-trip.

### ADR-D04: Dual Storage — JDM Source Plus PCRM — for Round-Trip Editing
**Status:** Accepted · **Date:** 2026-07-04
**Context:** The runtime consumes PCRM only, but the GoRules canvas needs its native JDM JSON to render an existing rule back for editing. Reconstructing JDM from PCRM on every open is lossy and brittle.
**Decision:** Each editable Rule Version stores **both** the GoRules JDM source JSON (for canvas render-back) **and** the translated PCRM JSON (the execution source of truth), per Phase 3 §6/§15. The PCRM is authoritative; the JDM source is a designer convenience. If the JDM source is ever absent or stale (e.g., a future PCRM-direct designer), the designer falls back to rendering from PCRM — which is why PCRM is required (triage C10) to remain human-editable.
**Consequences:** A modest storage cost per version and a discipline that the two representations are kept consistent at save time (translation is one-way JDM→PCRM; the JDM is only ever the author's last-saved canvas state). Prevents GoRules lock-in because PCRM alone is sufficient to edit.

### ADR-D05: Spreadsheet-Model Decision Table Authoring Independent of the Canvas
**Status:** Accepted · **Date:** 2026-07-04
**Context:** Decision tables are the most-used authoring surface and must be fully keyboard-operable and metadata-bound — needs the GoRules table widget alone does not guarantee (accessibility, FLS-aware pickers, EDP-H1 value editors).
**Decision:** EDP provides its own decision-table authoring model (Section 14) — column field-pickers, per-column operators, per-cell type-aware value editors, hit-policy selector — that produces the decision-table portion of the PCRM directly, with the GoRules table as a synchronized visualisation. The EDP model is authoritative for decision-table content.
**Consequences:** Full keyboard/screen-reader support, metadata-bound cells, and grammar-validated values — at the cost of EDP owning the table editor rather than delegating to GoRules. Consistent with ADR-D01's platform-owned stance.

---

## 28. Acceptance Criteria

Phase-2 (Visual Rule Designer) is accepted when the following are demonstrably true. Criteria are testable and developer-ready; they gate the end of the designer build.

### 28.1 Authoring — Core
- **AC-1** An author can create a new Draft rule, select a target entity via the searchable Entity Picker (business labels only, no schema names shown), and save it — with the stored record carrying the correct `qdb_` logical bindings.
- **AC-2** An author can build an IF/ELSE-IF/ELSE condition set with AND/OR and nested groups using the Expression Builder entirely by mouse **and** entirely by keyboard, and see a correct Business-Friendly Summary update live.
- **AC-3** For every one of the 16 field types (Section 10), selecting a field presents only the operators valid for that type (Operator Matrix, Section 11) and a type-appropriate value editor with correct validation and stored JSON format.
- **AC-4** The Formula Builder exposes only EDP-H1-grammar functions as usable; H2 functions (e.g., `Sum()`/`Average()` over collections) appear disabled with a "future release" tooltip and cannot be saved into a rule.
- **AC-5** An author can build a decision table (add/delete/duplicate/reorder rows and columns, set per-column operators, edit per-cell values, choose a hit policy) via keyboard and mouse, producing valid decision-table PCRM.

### 28.2 Metadata Experience
- **AC-6** No logical schema name, option-set integer value, or GUID is ever displayed in any authoring surface. A field the user lacks FLS access to is shown as "access restricted," not as an error, and does not corrupt the rule.
- **AC-7** Metadata pickers show CRM-provided localized display labels; in an Arabic session, entity/field/option labels appear in Arabic sourced from CRM, and the designer chrome is fully translated with the shell mirrored RTL.

### 28.3 Save / Load / Render Round-Trip
- **AC-8** Saving performs GoRules-JSON → Translator → PCRM, validates, and writes to CRM; a translation or blocking-validation failure aborts the save **before** any CRM write with no loss of in-progress work.
- **AC-9** Reopening a saved rule renders it back visually (from stored JDM source) with the property panel, summary, and PCRM all consistent; editing and re-saving creates a new Draft version.
- **AC-10** A PCRM produced by a newer schema version opens read-only with a clear message and cannot be lossily overwritten (backward-compatibility, Section 8).

### 28.4 Validation
- **AC-11** The Validation Framework detects and correctly classifies (Error / Warning / Suggestion) each of the 16 validation cases in Section 16, surfaces them in the Validation Panel with deep-links, and blocks save only on Errors.

### 28.5 Templates, Versioning, JSON
- **AC-12** Each of the 8 rule templates (Section 15) instantiates into a valid Draft rule with role-based field mappings resolved through the picker; unresolved mappings surface as Warnings immediately.
- **AC-13** Clone, Save As Draft, and the Version Selector work; JSON Import/Export round-trips a rule losslessly (export → import → identical PCRM).
- **AC-14** The Test Rule, Execution Trace, and Audit/History surfaces are present as clearly-labelled placeholder stubs (no execution), wired into the layout for later phases.

### 28.6 Non-Functional
- **AC-15** Lifecycle enforcement: non-Draft rules are read-only in the designer (canvas `mode:"view"`, save hidden), with server-side plugin as the authoritative boundary.
- **AC-16** Accessibility: axe-core reports zero critical violations, and the full create→validate→save flow is completable keyboard-only and via screen reader (NVDA + Narrator).
- **AC-17** Performance: designer interactive within 3s; save within 2s for an SDP-ceiling rule; picker reopen sub-5ms warm (targets from Sections 22.3–22.4, confirmed against the W8 harness).
- **AC-18** Packaging: the designer deploys as CRM web resources within the `BusinessRuleEngine` solution, imports cleanly on Dataverse and on-prem, with each web-resource file individually declared in the solution manifest.
- **AC-19** No authoring capability exists only on the GoRules canvas — every capability has a platform-owned, accessible equivalent (the ADR-10 / Section 23.2 guarantee).

---

*End of Document — EDP-BRE-001 Visual Rule Designer Design Specification (Product Phase 2).*
*This document is authoritative for the Visual Rule Designer build. Changes require an ADR.*
*Prepared by: Maqsad AI — Frontend / UX Architect | Date: 2026-07-04*
