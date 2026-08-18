# Enterprise Decision Platform — Phase 2 Dependency Research

**Engagement ID:** EDP-BRE-001
**Phase:** 2 — Dependency Research and GitHub Validation
**Module:** Business Rules Engine (BRE)
**Prepared by:** Maqsad AI — GitHub Researcher
**Date:** 2026-07-03
**Authority reference:** Phase 0 Architecture Blueprint + Phase 1 CEO Decision

---

## Non-Negotiable Constraint Checklist

Every library in this document was evaluated against the following hard constraints before
any other criterion was considered. A single hard-fail disqualifies for the constrained role.

| Constraint | Source |
|-----------|--------|
| No external runtime or infrastructure for core function | Phase 0 Invariant 2 |
| Entire core deployable inside a standard CRM Solution | Phase 0 Invariant 3 |
| GoRules ZEN runtime is NOT the execution engine | Phase 0 Invariant 5 / CEO |
| Sandbox-safe: no Reflection.Emit, no P/Invoke, no file IO, no unmanaged code in the CRM plugin | CRM Plugin Sandbox hard limit |
| MIT, Apache 2.0, or BSD license for commercial embedding | Maqsad product licensing requirement |

---

## CEO PRIORITY #1 — GoRules JDM Editor Verdict

### Repo: gorules/jdm-editor

**URL:** https://github.com/gorules/jdm-editor
**NPM:** `@gorules/jdm-editor`
**Stars:** 308 (as of 2026-07-03) — **BELOW the 1,000-star adopt threshold**
**License:** MIT (confirmed from LICENSE file)
**Commercial embedding permitted:** Yes — MIT grants unrestricted use, copy, modify, distribute, sublicense, and sell. Only obligation is to preserve copyright notice.
**Open issues:** 41
**Release tags:** 172 (active, frequent releases)
**Primary language breakdown:** TypeScript 79.9%, Rust 10.8%, SCSS 8.0%
**React peer requirement:** React >= 18
**Package version reviewed:** 1.52.0

#### License Assessment

MIT license. No copyleft, no commercial restriction, no attribution in UI required (only in distributed software copies). This is the most permissive classification. Zero license risk for commercial embedding in the EDP product.

#### Maintenance Assessment

172 release tags and 41 open issues on a relatively young, domain-specific component indicate active and dedicated maintenance by GoRules. The low star count reflects the niche domain (visual JDM decision modelling) rather than poor quality. Active commits, regular releases, and a commercially-backed company (GoRules) behind the repo reduce abandonment risk. Actively maintained: PASS.

#### Embeddability as a Pure React Designer (Editor-Only, No ZEN Runtime)

This is the critical question the CEO asked.

**Finding: The editor CAN be used in editor-only / designer mode without invoking the ZEN C# runtime. However, it ships with `@gorules/zen-engine-wasm` as a production dependency.**

The WASM package is used in the browser for:
- Syntax highlighting in formula/expression input fields
- Autocomplete for the ZEN expression language
- Client-side expression validation (instant feedback while authoring)

**These WASM features are optional from a functional standpoint.** The documentation confirms that core design operations — dragging and dropping nodes, connecting nodes, editing decision table rows and columns, defining conditions — work without WASM initialisation. The editor degrades gracefully: without WASM, authors lose autocomplete and inline expression validation but retain all structural editing capabilities.

**Critical deployment constraint for CRM web resources:** The WASM SharedArrayBuffer API (used by `@gorules/zen-engine-wasm`) requires the hosting server to send two HTTP response headers:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`

Microsoft Dynamics CRM and Dataverse web resource servers do NOT allow setting custom HTTP headers on web resource responses. This means **WASM features (autocomplete, expression validation) will be unavailable inside a Dynamics web resource host** unless one of these mitigations is applied:
1. The designer is hosted in an iframe whose frame source is a controlled endpoint that can set these headers (a canvas app, a custom page, or a server the team controls).
2. The designer is deployed as a standalone page outside the web resource mechanism (permitted as an optional, non-core extension per Phase 0 Section 12.4), losing the embedded-in-model-driven-app experience.
3. The editor is used without WASM initialisation (no autocomplete, no expression validation — authors type ZEN expressions unaided).

Option 3 is viable for Horizon 1 given that expression validation feedback is a quality-of-life feature, not a core design capability. Option 1 should be evaluated in Phase 3 alongside the designer host architecture.

**JDM JSON Schema:** The editor emits JSON conforming to the GoRules JDM format (`DecisionGraphType`, `DecisionTableType` TypeScript types are documented). The schema is stable across the version history and is the authoritative designer-to-runtime contract. Phase 3 must formalise this schema as the versioned EDP rule-definition contract (NFR-012).

**ZEN runtime NOT invoked:** The JDM Editor npm package contains the WASM engine for browser-side features only. Saving a rule emits JSON to the host application; it does not call any GoRules server, ZEN C# binding, or external runtime. Our C# runtime interprets the saved JSON independently. The designer/runtime separation invariant (Phase 0 Section 10.3) is architecturally sound with this component.

**ZEN C# Binding — Formally Excluded:** GoRules publishes a C# binding for the ZEN engine. This binding wraps the native Rust runtime via P/Invoke or WASM. BOTH paths are disqualified for use in the CRM plugin sandbox: P/Invoke to unmanaged Rust code is blocked by CRM sandbox security restrictions; WASM execution is a browser-side capability not available in .NET server-side code. The ZEN C# binding is formally excluded from the EDP product at all horizons, as directed in Phase 0 Invariant 5 and the Phase 1 CEO decision.

#### Bundle Size and CRM Web Resource Compatibility

- `@gorules/zen-engine-wasm` package: ~1.79 MB (the WASM binary file)
- The editor itself (TypeScript, React, antd, Monaco, reactflow): substantial — likely 2–4 MB bundled
- CRM web resource file size limit: 5 MB per file on Dataverse; no documented limit on-prem

The bundle will be split across multiple web resource files (main JS chunk, WASM file, CSS). This is standard practice and does not exceed per-file limits. Phase 4 must configure a build pipeline (Vite or Webpack) that outputs individual chunks as separate web resource files.

#### Contingency Assessment

If the JDM Editor is rejected after Phase 3 testing (e.g., WASM CORS issues cause unacceptable UX degradation), the available contingencies are assessed in Section 6 of this document. No alternative produces JDM-format JSON; a contingency would require the Phase 3 team to define a custom rule-definition JSON schema and build a corresponding designer surface using primitives (react-querybuilder for condition trees, custom decision-table grid component for tables, custom formula input). This is materially more build effort.

#### Verdict: ADOPT-WITH-CAUTION

The GoRules JDM Editor is the only purpose-built, MIT-licensed, React-native decision graph designer available. Despite falling below the 1,000-star threshold — a threshold calibrated for general-purpose libraries where alternatives are plentiful — it is the right tool for this domain, and no credible alternative exists that produces the same JDM JSON format.

**Conditions that must be satisfied before Phase 4 build starts:**

| Condition | Owner | Gate |
|----------|-------|------|
| Phase 3 architect must prototype the editor in a CRM web resource and document whether degraded-mode (no WASM) UX is acceptable for BA usability (connects to C-002 and NFR-008) | Architect | Phase 3 |
| If degraded-mode UX is not acceptable, the designer host must be architected with a controlled iframe origin that can serve the required CORS headers | Architect | Phase 3 |
| Phase 3 must formalise the JDM JSON schema as the EDP rule-definition contract (NFR-012) | Architect | Phase 3 |
| The Phase 4 build pipeline must be configured to upload the WASM file as a separate web resource with a configurable URL path passed to the editor | Developer | Phase 4 |
| Star count and maintenance health must be re-checked at Phase 4 build start; if the repo shows signs of abandonment (no commits in 6 months, key issues unresolved), escalate to a BUILD decision | GitHub Researcher | Phase 4 start |

---

## Summary Table

| # | Capability | Candidate Repo | Stars | License | Verdict |
|---|-----------|---------------|-------|---------|---------|
| 1 | Visual rule designer (JDM editor) | gorules/jdm-editor | 308 | MIT | ADOPT-WITH-CAUTION |
| 2 | C# expression/formula evaluation (in-runtime) | davideicardi/DynamicExpresso | 2.2k | MIT | ADOPT |
| 3 | C# expression/formula evaluation (alternative) | ncalc/ncalc | 1.1k | MIT | ADOPT (Phase 3 chooses one) |
| 4 | C# rules engine as complete runtime | microsoft/RulesEngine | 4.3k | MIT | REJECT (wrong paradigm + security risk) |
| 5 | C# Rete rules engine | NRules/NRules | 1.6k | MIT | REJECT (wrong paradigm) |
| 6 | JSON schema validation (.NET) | RicoSuter/NJsonSchema | 1.6k | MIT | ADOPT-WITH-CAUTION |
| 7 | Excel import/export (.NET) | ClosedXML/ClosedXML | 5.6k | MIT | ADOPT (Horizon 2) |
| 8 | Designer contingency: condition builder | react-querybuilder/react-querybuilder | 1.7k | MIT | CONTINGENCY ONLY |
| 9 | Designer contingency: condition builder alt | ukrbublik/react-awesome-query-builder | 2.3k | MIT | CONTINGENCY ONLY |
| 10 | Designer contingency: DMN editor | bpmn-io/dmn-js | 359 | bpmn.io license | REJECT |
| 11 | Metadata browsing UX | (none applicable) | — | — | BUILD |
| 12 | GoRules ZEN runtime (C#) | gorules/zen (C# binding) | (excluded) | MIT | REJECT — invariant violation |

---

## Detailed Findings

---

### Capability 1 — Visual Rule Designer (React Component)

*See CEO PRIORITY #1 section above for the primary candidate.*

#### Contingency A: react-querybuilder

**URL:** https://github.com/react-querybuilder/react-querybuilder
**Stars:** 1.7k
**License:** MIT
**Last release:** v8.20.2, June 2026 (actively maintained)
**Open issues:** 11 (excellent health)
**Contributors:** 47
**React requirement:** Not pinned; modern React compatible

**Assessment:** A mature, well-maintained query filter builder. It is excellent for condition/expression trees (if-then-else filtering logic). It does NOT produce JDM JSON, is NOT a decision table editor, and has no decision graph authoring capability. Adopting it as the primary designer would require the Phase 4 team to build:
- A custom decision table grid component (not in this library)
- A custom JSON schema to represent the EDP rule definition
- A mapping layer from the querybuilder output format to the EDP rule-definition contract

This contingency covers only the Condition/Expression Tree authoring style (FR-004). Decision Tables (FR-003) and Formula nodes (FR-005) would still require custom build.

**Verdict: CONTINGENCY ONLY.** Use only if GoRules JDM Editor is rejected after Phase 3 prototyping. If activated, escalate to a Phase 3 architectural decision.

---

#### Contingency B: react-awesome-query-builder

**URL:** https://github.com/ukrbublik/react-awesome-query-builder
**Stars:** 2.3k
**License:** MIT
**Open issues:** 131 (elevated, watch)

**Assessment:** More feature-rich than react-querybuilder, supports functions and complex expressions, multiple export formats (SQL, MongoDB, JsonLogic, SpEL). Same fundamental limitation: condition filter builder only, not a decision table designer. The higher open-issue count indicates maintenance debt. Same contingency applicability and limitations as react-querybuilder above.

**Verdict: CONTINGENCY ONLY.** Lower preference than react-querybuilder due to higher issue count.

---

#### Contingency C: bpmn-io/dmn-js

**URL:** https://github.com/bpmn-io/dmn-js
**Stars:** 359
**License:** bpmn.io custom license — NOT MIT, NOT Apache 2.0

The bpmn.io license is a proprietary, source-available license that permits free use for development and testing only. Production commercial use in a proprietary product requires a commercial license from Camunda GmbH (which acquired and maintains the bpmn.io toolset). This is a commercial blocking issue for embedding in the EDP ISV product.

Additionally: (a) dmn-js outputs standard DMN 1.3 XML, not JSON — would require a full XML-to-JSON transformation layer; (b) it is vanilla JavaScript with no React integration, requiring a wrapper component; (c) its star count is lower than the GoRules JDM Editor and also below the threshold.

**Verdict: REJECT.** License is not MIT/Apache/BSD. Commercial embedding is blocked without a Camunda licence agreement. Wrong output format. Not React-native.

---

### Capability 2 — Expression and Formula Evaluation in C# (Sandbox-Safe)

The EDP C# runtime needs to evaluate formula/calculation nodes and condition expressions at execution time. The JDM format encodes decision table conditions as structured JSON (field, operator, value triples) — these are evaluated by simple C# comparison logic with no external library needed. However, Formula/Calculation nodes may contain ZEN expression language strings (e.g., `floor(input.loanAmount / 12)`, `input.dob.age() > 18`) that require parsing and evaluation.

The decision on whether to adopt a library for expression evaluation (versus building a custom ZEN expression subset parser) is finalised in Phase 3. Phase 2 identifies the strongest candidates.

---

#### Candidate A: DynamicExpresso

**URL:** https://github.com/davideicardi/DynamicExpresso
**NuGet:** `DynamicExpresso.Core`
**Stars:** 2.2k
**License:** MIT
**Last release:** v2.19.3, October 2025 (within 12 months — PASS)
**Open issues:** 34
**.NET support:** .NET Core 3.1, .NET 5+, .NET Framework 4.6.2

**Technical fit:**
- Evaluates C# expression strings at runtime using `System.Linq.Expressions` (expression trees)
- Does NOT use `Reflection.Emit` — no dynamic IL generation
- Reflection is BLOCKED by default (enabled only by explicit `EnableReflection()` call)
- Registered types and variables are the only accessible members — controlled exposure
- No file IO, no external calls

**CRM sandbox safety assessment:** SAFE for the constrained role of evaluating simple arithmetic, string, and date expressions. Expression trees compile to lambda delegates via the standard CLR expression compile path, not raw IL emission. On Dataverse and modern CRM on-prem (full trust with process isolation), this is straightforwardly safe. On older on-prem sandbox (partial trust), `LambdaExpression.Compile()` should still work as it is permitted in partial-trust scenarios in .NET Framework; however, Phase 4 must verify this on the specific .NET Framework version targeted by on-prem plugins.

**Fit against JDM expression language:** The ZEN expression language used in JDM formula nodes is not C# syntax. Phase 3 must assess whether DynamicExpresso's expression syntax is close enough to the ZEN expression subset used in formula nodes to serve as the evaluator (with thin translation), or whether a custom parser for the ZEN expression grammar is the better option. If the ZEN expressions translate cleanly (arithmetic operators, `floor()`, `ceil()`, `round()`, date arithmetic), DynamicExpresso is an excellent adopter. If ZEN uses constructs DynamicExpresso cannot handle, the BUILD path is required.

**Verdict: ADOPT** as the expression evaluation layer for formula/calculation nodes within the custom C# runtime, subject to Phase 3 expression-language compatibility assessment.

---

#### Candidate B: NCalc

**URL:** https://github.com/ncalc/ncalc
**NuGet:** `NCalc`
**Stars:** 1.1k (meets 1,000-star threshold)
**License:** MIT
**Open issues:** 8 (excellent — lowest open issue count of all candidates reviewed)
**.NET support:** .NET Standard 2.0, .NET Framework 4.8, modern .NET

**Technical fit:**
- AST-based interpreter for mathematical and logical expressions
- Base `NCalc` package uses AST interpretation (no IL compilation)
- Optional `NCalc.LambdaCompilation` package adds lambda compilation if needed; use base package only in sandbox
- netstandard2.0 target is ideal for CRM plugin compatibility across cloud and on-prem
- No file IO, no external calls
- 8 open issues signals very clean, stable codebase

**CRM sandbox safety assessment:** SAFE. The base `NCalc` package is an AST interpreter with no dynamic code generation. It evaluates expressions by walking the AST — a pure, deterministic, sandbox-compliant operation. Do NOT use `NCalc.LambdaCompilation` in the plugin; use base `NCalc` only.

**Fit against JDM expression language:** NCalc's expression syntax is closer to mathematical formula notation (`Round(a / b, 2)`, `Max(a, b)`, `if(cond, a, b)`) than to C# or ZEN syntax. Coverage of the ZEN expression language's arithmetic and built-in functions is likely high; coverage of complex ZEN constructs (date operations with `.age()` method syntax, string manipulation) may require custom function registration or thin translation.

**Verdict: ADOPT** as the primary alternative expression evaluator. Phase 3 must run a compatibility matrix of the JDM formula/expression constructs against DynamicExpresso and NCalc and pick one. NCalc's netstandard2.0 compatibility and AST interpreter architecture make it the lower-risk sandbox option; DynamicExpresso offers richer C# expression syntax coverage.

---

#### Rejected candidates: Complete C# rule engines as the EDP runtime

Both microsoft/RulesEngine and NRules/NRules were evaluated as complete replacements for the custom C# runtime. Both are rejected.

**microsoft/RulesEngine**
**URL:** https://github.com/microsoft/RulesEngine
**Stars:** 4.3k | **License:** MIT | **Last release:** v6.0.0, June 2025

Rejection rationale:
1. **Rules are C# lambda expression strings.** Business Analysts cannot author C# code. Rule conditions are written in C# syntax (e.g., `"input1.amount > 10000 && input1.status == \"active\""`) — this conflates authoring format with execution format and creates a serious security exposure: if a business user can craft rule definitions that are compiled and executed as C# lambdas, an attacker with BA role privileges can execute arbitrary .NET code inside the plugin process.
2. **Not JDM-compatible.** Adopting this as the runtime means abandoning the GoRules JDM JSON format as the designer↔runtime contract. This breaks the designer/runtime separation invariant (Phase 0 Section 10.3) and requires rebuilding the rule storage schema for the RulesEngine JSON format.
3. **Expression compilation risk.** Uses System.Linq.Dynamic.Core to compile C# expression strings into lambda delegates. While not using Reflection.Emit directly, it executes arbitrary C# code paths that could be blocked in partial-trust on-prem sandboxes depending on version.

**Verdict: REJECT.** Security risk from arbitrary C# expression execution. Wrong output format. Breaks designer/runtime contract.

---

**NRules/NRules**
**URL:** https://github.com/NRules/NRules
**Stars:** 1.6k | **License:** MIT

Rejection rationale:
1. **Rete production rules paradigm.** NRules is a forward-chaining production rules engine that matches facts against rule patterns using the Rete algorithm. This is an excellent paradigm for complex reasoning over large fact sets but is architecturally incompatible with the EDP's decision-table and expression-tree authoring model.
2. **Not JDM-compatible.** NRules rules are defined in a C# internal DSL, not JSON. Integrating with JDM JSON output requires a full intermediate compilation layer.
3. **Potential sandbox risk.** Rete-based engines typically compile rule networks using IL generation. Sandbox compatibility is unconfirmed.

**Verdict: REJECT.** Wrong paradigm for the EDP use case. High integration overhead with no JDM compatibility.

---

**GoRules ZEN C# Binding**
**URL:** https://github.com/gorules/zen (C# binding)
**Stars:** N/A (shared repo)

Formally excluded per Phase 0 Invariant 5 and CEO Phase 1 decision. Document of exclusion rationale for future reference:

The ZEN C# binding wraps the GoRules ZEN Rust runtime. The binding operates in one of two modes: (1) Native Rust via P/Invoke — blocked by CRM plugin sandbox, which prohibits loading unmanaged code. (2) WASM — a browser runtime; not available server-side in .NET. Neither mode is operable inside the CRM plugin sandbox. Additionally, introducing the ZEN runtime would violate the zero-external-infrastructure invariant and would make the EDP C# runtime dependent on an external engine rather than being a standalone native C# evaluator. This dependency is architecturally disqualifying regardless of sandbox feasibility.

---

### Capability 3 — JSON Schema Validation (.NET)

The rule-definition JSON schema (Phase 3 deliverable) needs a .NET library to:
- Define and publish the schema (used in the designer web resource and data layer)
- Validate rule definitions at the save boundary (web resource → CRM) and import boundary
- Optionally validate rule definitions at runtime load (the plugin loads a rule definition and verifies schema before evaluating)

---

#### Candidate: NJsonSchema

**URL:** https://github.com/RicoSuter/NJsonSchema
**NuGet:** `NJsonSchema`
**Stars:** 1.6k
**License:** MIT
**Open issues:** 403 (elevated — highest open issue count of all candidates; quality risk)
**.NET support:** .NET Standard 2.0 (confirmed)

**Technical fit:**
- Reads, generates, and validates JSON Schema draft v4+ documents
- Dual purpose: schema definition from .NET types + JSON instance validation
- netstandard2.0 support makes it usable in CRM plugin context
- Well-established in the .NET ecosystem; widely used

**Concerns:** 403 open issues on a library of this maturity signals accumulated technical debt. Many issues may be edge-case features or documentation requests rather than defects, but the count warrants close attention. Phase 4 must pin to a specific NJsonSchema version and monitor for regressions.

**Alternative consideration:** For runtime validation inside the CRM plugin, a lightweight approach using `System.Text.Json` (for Dataverse plugins targeting modern .NET) or `Newtonsoft.Json` (already a CRM SDK dependency) may be sufficient. The full NJsonSchema library may only be needed at the designer/repository layer where full schema validation is performed.

**Verdict: ADOPT-WITH-CAUTION.** Use at the designer boundary (web resource) and repository layer for full schema validation. For the runtime plugin, evaluate whether lightweight Newtonsoft.Json schema validation (or manual property checking) is sufficient to reduce the dependency surface inside the sandbox. Pin to a stable version and monitor issue resolution rate.

---

### Capability 4 — Decision Table / Excel Import-Export (.NET)

Excel import/export is a Horizon 2 capability (BRD Section 5.2, out of scope for Horizon 1). This section is provided so Phase 3 can reference the adoption decision when designing the Import/Export Service interface.

---

#### Candidate: ClosedXML

**URL:** https://github.com/ClosedXML/ClosedXML
**NuGet:** `ClosedXML`
**Stars:** 5.6k (well above threshold — strong)
**License:** MIT
**Last release:** 0.105.0, May 2025 (within 12 months)
**Open issues:** 424 (elevated — monitor)
**.NET support:** .NET Standard 2.0 and .NET Framework 4.0+
**MemoryStream compatible:** Yes — no file system access required

**Technical fit:**
- Read and write .xlsx files using MemoryStream in a sandboxed context
- No file IO required — fully stream-based API
- High star count and long history indicate production-grade maturity
- The 424 open issues on a library this mature and widely used are consistent with a large active user base filing edge-case requests; core functionality is stable

**CRM sandbox note:** ClosedXML would be used in the Import/Export Service, which is a web resource (browser side) or a background Dataverse action — NOT inside the synchronous plugin execution path. This avoids any sandbox concerns. For on-prem, a Custom Action calling an out-of-band API endpoint (optional extension, Phase 0 Section 12.4) would handle Excel processing.

**Verdict: ADOPT (Horizon 2).** Strong candidate with clear fit. Not required for Horizon 1 MVP. Phase 3 should include the Import/Export Service interface in the architecture even if implementation is Horizon 2, so the storage model accommodates the interchange format.

---

### Capability 5 — Metadata Browsing UX

**Assessment: BUILD.**

The Metadata Service requires reading CRM/Dataverse entity metadata (entities, fields, option sets, lookups, relationships) and presenting it in a searchable, display-name-first selector. No open-source library exists that addresses this specific capability — it requires calling CRM's Organization Service metadata APIs (on-prem) or the Dataverse Web API metadata endpoints (cloud) and building a React selector component on top.

Existing Dynamics admin tools (XrmToolBox plugins, Dataverse documentation utilities) are desktop-only utilities, not embeddable React components.

The metadata browsing UX is a pure BUILD decision. The Phase 3 architecture must specify:
- Which CRM metadata endpoints are called (Organisation Service `RetrieveAllEntitiesRequest` on-prem; Dataverse `/api/data/v9.2/EntityDefinitions` cloud)
- Cache strategy (live call vs. session-scoped cache to avoid repeated metadata fetches during authoring)
- How the selector component integrates with the GoRules JDM Editor's field input fields

---

## Adoption Decision Register

This register is the authoritative record of all Phase 2 adoption decisions. Phase 3 must reference this register when making component design choices.

| ID | Library | Role in EDP | Verdict | Rationale summary |
|----|---------|------------|---------|-------------------|
| DEP-001 | gorules/jdm-editor | Visual rule designer surface (Experience Plane) | ADOPT-WITH-CAUTION | Only JDM-format React designer; MIT license; WASM CORS constraint requires Phase 3 web resource architecture decision |
| DEP-002 | davideicardi/DynamicExpresso | Expression/formula node evaluator inside C# runtime | ADOPT | MIT, no Reflection.Emit, reflection-blocked by default, sandbox-safe; Phase 3 must confirm ZEN expression syntax coverage |
| DEP-003 | ncalc/ncalc | Alternative expression evaluator inside C# runtime | ADOPT | MIT, AST interpreter, netstandard2.0, 8 open issues, safest sandbox option; Phase 3 picks DEP-002 or DEP-003 |
| DEP-004 | RicoSuter/NJsonSchema | JSON schema validation at designer + repository boundary | ADOPT-WITH-CAUTION | MIT, netstandard2.0; elevated open issue count (403); pin to stable version; not required in runtime plugin |
| DEP-005 | ClosedXML/ClosedXML | Excel decision table import/export (Horizon 2) | ADOPT (Horizon 2) | MIT, 5.6k stars, MemoryStream-safe, netstandard2.0 |
| DEP-006 | microsoft/RulesEngine | C# runtime (entire runtime) | REJECT | C# expression string security risk; wrong paradigm; breaks JDM contract |
| DEP-007 | NRules/NRules | C# runtime (entire runtime) | REJECT | Rete paradigm; C# DSL; not JDM-compatible |
| DEP-008 | gorules/zen (C# binding) | C# runtime | REJECT | Invariant violation; P/Invoke blocked in sandbox; WASM not server-side |
| DEP-009 | bpmn-io/dmn-js | Designer contingency | REJECT | bpmn.io commercial license; DMN XML output; not React |
| DEP-010 | react-querybuilder | Designer contingency (condition tree only) | CONTINGENCY ONLY | Activated if DEP-001 fails Phase 3 prototype; covers FR-004 only |
| DEP-011 | react-awesome-query-builder | Designer contingency (condition tree only) | CONTINGENCY ONLY | Secondary to DEP-010; higher issue count |
| DEP-012 | Metadata browsing UX | Metadata selector component | BUILD | No adoptable library; CRM metadata API + custom React component |
| DEP-013 | Native C# runtime (core evaluator) | Rule Runtime Plane | BUILD | No adoptable library produces a JDM-compatible, sandbox-safe, deterministic evaluator; custom build required |

---

## Runtime Architecture Confirmation

No library was found that provides a ready-made, JDM-compatible, CRM-sandbox-safe native C# rule evaluator. The custom **native C# Rule Runtime** (Phase 0 Section 11) must be built. This BUILD decision is consistent with the Phase 0 architecture, which anticipated that the runtime would be a bespoke component.

The runtime build scope:
- **Decision graph walker:** parses the JDM JSON, traverses nodes (decision table, condition tree, formula), evaluates each — custom build (no adoption needed; standard JSON deserialisation and tree traversal)
- **Comparison operator library:** implements all JDM condition operators (equals, not-equals, greater-than, in-set, contains, etc.) — custom build
- **Formula/expression evaluation:** evaluates formula node expression strings — **ADOPT DEP-002 or DEP-003** (Phase 3 decision)
- **Version resolver, trace writer, entry adapters:** custom build (CRM-platform-specific)

The expression evaluation layer is the only sub-component where adoption of an existing library is recommended.

---

## Phase 3 Readiness Assessment

Phase 3 (Detailed Architecture) may proceed with the following two open items from Phase 2:

**Open item P2-OI-001 (designer host architecture):** Phase 3 must prototype the GoRules JDM Editor in a CRM web resource and document: (a) whether degraded-mode UX (without WASM, no autocomplete) is acceptable for BA usability targets, (b) if not, whether an iframe-with-CORS-headers approach can be designed within Phase 0 constraints. This is an input to Condition C-002.

**Open item P2-OI-002 (expression language compatibility):** Phase 3 must produce a compatibility matrix of the JDM formula/expression language constructs against DynamicExpresso and NCalc, then select one. If neither covers the required ZEN expression subset adequately, Phase 3 must escalate to a BUILD decision for the expression parser.

Neither open item blocks Phase 3 from starting. Both must be resolved before Phase 4 build begins.

**Phase 3 is cleared to start.**

---

## Search Queries Executed

| # | Query |
|---|-------|
| 1 | `site:github.com gorules/jdm-editor stars license React` |
| 2 | `site:github.com C# expression evaluator rule engine sandbox safe stars:>1000` |
| 3 | `site:github.com .NET JSON schema validation library stars:>1000` |
| 4 | `site:github.com React visual decision table rule designer component stars:>500` |
| 5 | `site:github.com .NET excel decision table import export NPOI ClosedXML stars:>1000` |
| 6 | `site:github.com react-querybuilder query builder rule builder stars license` |
| 7 | `gorules jdm-editor "zen-engine-wasm" optional required bundle size designer only` |
| 8 | `site:github.com DMN decision table editor React component open source stars` |
| 9 | `site:github.com "microsoft/RulesEngine" CRM plugin sandbox compatibility` |
| 10 | `site:github.com NCalc C# expression evaluator stars license` |

Direct repository pages fetched: gorules/jdm-editor, gorules/jdm-editor package.json (root + package level), microsoft/RulesEngine, NRules/NRules, davideicardi/DynamicExpresso, RicoSuter/NJsonSchema, ClosedXML/ClosedXML, bpmn-io/dmn-js, react-querybuilder/react-querybuilder, ukrbublik/react-awesome-query-builder, ncalc/ncalc, gorules/jdm-editor LICENSE, GoRules documentation (docs.gorules.io).

---

*End of Phase 2 Dependency Research — EDP-BRE-001*
*Phase 3 (Detailed Architecture) is authorised to proceed.*

---

# Addendum — Wave 1 Gateway Dependencies (2026-07-27)

Scope note: these apply to the **Decision Gateway** (`gateway/`), which is an accepted
**optional** tier under ADR-05. The zero-infra core invariant is untouched — nothing here
enters the CRM plugin sandbox, so the sandbox-safety constraints above do not apply.

## `@fastify/rate-limit` — **ADOPT (below star threshold, justified)**

| Attribute | Value |
|---|---|
| **Repo** | https://github.com/fastify/fastify-rate-limit |
| **Version adopted** | `9.1.0` (the 9.x line is the Fastify 4 compatible one; 11.x requires Fastify 5) |
| **License** | MIT — commercial embedding permitted |
| **Stars** | **599** (2026-07-27) — **below the 1,000-star adopt threshold** |
| **Maintenance** | Last push 2026-07-22 (5 days before adoption); 6 open issues; not archived |

### Why adopt despite missing the threshold

The 1,000-star rule exists as a proxy for "battle-tested and maintained". That proxy is weak
here, and three specific facts substitute for it:

1. **It is the official rate limiter of the framework we already depend on**, published under
   the `fastify` organisation and versioned in lockstep with Fastify itself. Its user base is
   a subset of Fastify's (~34k stars), not an independent community that could evaporate.
2. **The alternative is worse.** Hand-rolling a limiter means owning a sliding-window counter,
   header conventions (`x-ratelimit-*`, `retry-after`), and per-route store lifecycles — all
   easy to get subtly wrong, and none of it differentiating for a decision platform.
3. **Small, inspectable surface.** We read the implementation during integration (which is how
   two integration defects were caught before merge — see below), so this is not a black box.

Precedent within this engagement: `gorules/jdm-editor` was adopted at **308 stars** under
ADOPT-WITH-CAUTION. A sub-threshold adoption with recorded rationale is established practice
here, not an exception being invented.

### Integration notes (both found by reading the source, not the docs)

- `errorResponseBuilder`'s return value is **thrown**, so it must be an `Error` carrying
  `statusCode`. Returning a plain response object yields a 500, not a 429.
- The plugin attaches its hook **per route** via `onRoute`. Route-level `onRequest` hooks run
  *after* instance-level ones, so an instance-level auth hook would short-circuit before the
  limiter counted anything. Gateway authentication is a `preHandler` for exactly this reason.
- The TypeScript definition of `errorResponseBuilderContext` omits `statusCode`, which the
  runtime does provide. We use the 429 literal rather than a type assertion.

### Residual risk

In-memory counters mean **per-replica** quotas. Multi-replica deployment needs the plugin's
shared-store option (Redis) — deferred until a deployment topology is chosen, and recorded as
a limitation in `gateway/README.md`.

---

*Addendum ends. No new dependency enters the CRM plugin sandbox.*

---

# Addendum — EDP-FACT-001 Phase F1 Dependency Research (2026-08-18)

**Context:** `brd-edp-fact-001-declarative-fact-assembly.md` was ratified 2026-08-18 with
**Option B**. Phase F1 is the collection type, iteration, bounded traversal and per-child
fan-out. The standing adopt-over-build rule requires this research before architecture.

**⚠️ This addendum proposed a new sandbox dependency and then, on examining the integration
seam, withdrew it.** The final position is **adopt the specification, not the package** —
see the mode resolution at the end and **ADR-16**. Read the whole addendum before quoting any
part of it: the research below is the evidence that produced that reversal, not a superseded
draft.

## Constraint checklist applied

| Constraint | Source |
|---|---|
| `netstandard2.0` and `net462` | Runtime targets |
| **No `Reflection.Emit`, no `LambdaCompilation`, no `Compile()`** | ADR-11, sandbox partial-trust posture |
| **No arbitrary code execution from author input** | ADR-01 |
| Permissive licence | Phase 2 checklist |
| 1000+ stars, or a written justification | Company rule |

## Candidates evaluated

| Repo | Stars | Lang | Licence | Last push | Verdict |
|---|---|---|---|---|---|
| `json-everything/json-everything` (Json.Logic) | 1,274 | C# | MIT | 2026-08-08 | **ADOPT THE SPECIFICATION, not the package** (ADR-16). Had it been taken as a dependency it would have been 5.4.3, never 6.x |
| `zzzprojects/System.Linq.Dynamic.Core` | 1,711 | C# | Apache-2.0 | 2026-07-11 | **REJECT — CVE-2023-32571** |
| `ncalc/ncalc` | 1,152 | C# | MIT | 2026-08-15 | Already adopted — **re-scoped, see below** |
| `jwadhams/json-logic-js` | 1,478 | JS | MIT | 2024-07-09 | Specification and conformance-test source only |
| `apache/incubator-kie` (Drools) | 6,297 | Java | Apache-2.0 | 2026-08-18 | Semantics source only — wrong platform |
| `camunda/feel-scala` | 136 | Scala | Apache-2.0 | 2026-08-18 | Below bar and wrong platform — FEEL semantics reference |
| `yavuztor/JsonLogic.Net` | 50 | C# | MIT | 2025-01-25 | Below bar; superseded by json-everything |

## ⚠️ CORRECTION 2026-08-18 — the adopt stands, the version does not

**The first pass of this research recommended Json.Logic 6.1.0 on the strength of its
`TargetFrameworks` including `netstandard2.0`. That check was necessary but not sufficient,
and the recommendation was wrong.** Target frameworks say nothing about transitive package
versions, which is where the sandbox constraint actually bites.

Resolved through the full chain against the NuGet registration API:

| Version | Chain | System.Text.Json | Verdict |
|---|---|---|---|
| JsonLogic **6.1.0** | → JsonPointer.Net 7.0.x → Json.More.Net 3.0.1 | **10.0.5** | ❌ **BLOCKED** |
| JsonLogic **5.5.0** | → JsonPointer.Net 6.0.0 → Json.More.Net 2.2.0 | **10.0.0** | ❌ **BLOCKED** |
| JsonLogic **5.4.3** | → JsonPointer.Net 5.3.1 → Json.More.Net 2.1.1 | **[9.0.0, )** | ✅ **SAFE** |

**System.Text.Json 10.x is the exact wall already documented in `EDP.RuleRuntime.csproj`** —
the reason NCalc 6.x was rejected and NCalcSync 5.4.2 retained despite an accepted DoS
advisory (ADR-SEC-NCALC). EDP pins System.Text.Json **9.0.4**, which satisfies the 5.4.3
chain's `[9.0.0, )` and does not satisfy the 6.x chain's `[10.0.5, )`.

**How it was caught:** by tracing the dependency graph before architecture rather than after,
which is the whole point of doing this research first. Recorded rather than quietly amended,
in the same spirit as the C-004 corrections table.

### Last sandbox-safe version of each package

| Package | Last safe | First blocked | What changes |
|---|---|---|---|
| `JsonLogic` | **5.4.3** | 5.5.0 | Moves to JsonPointer.Net 6.0.0 |
| `JsonPointer.Net` | **5.3.1** | 6.0.0 | Moves to Json.More.Net 2.2.0 |
| `Json.More.Net` | **2.1.3** | 2.2.0 | Jumps System.Text.Json 9 → 10 |

**Every range in this graph is open-ended (`[x, )`).** A restore will happily float to
System.Text.Json 10 and break the net462 build. **All three transitives must be pinned
explicitly**, not merely referenced — the same discipline the Phase 2 register applied to
NJsonSchema.

## ADOPT — `json-everything` / Json.Logic **5.4.3**

**Its operator set is, almost exactly, the F1 primitive set** — and this was verified against
the **shipped `netstandard2.0` binary of 5.4.3**, not the main branch, after the version
correction above made that distinction matter.

Types present in `lib/netstandard2.0/JsonLogic.dll` (5.4.3):

`AllRule · CatRule · FilterRule · IfRule · InRule · MapRule · MergeRule · MissingRule ·
MissingSomeRule · NoneRule · ReduceRule · SomeRule · SubstrRule · VariableRule`

Operator identifiers in the same binary: `all · filter · map · merge · missing_some · none ·
reduce · some · var`.

`All`, `Some`, `None`, `Filter`, `Map`, `Reduce`, `Merge` and `In` are precisely the
collection primitives FR-F1, FR-F2 and FR-F43 require — **all present in the sandbox-safe
version.** Nothing needed for F1 was lost by dropping from 6.1.0 to 5.4.3.

| Fit check | Result |
|---|---|
| Target frameworks | `netstandard2.0; net8.0; net9.0` — netstandard2.0 lib present in the 5.4.3 package |
| Licence | MIT |
| Stars | 1,274 — above the bar |
| Shipped dependencies | `JsonPointer.Net 5.3.1` → `Json.More.Net 2.1.1` → `System.Text.Json [9.0.0, )`, plus **`Humanizer.Core 2.14.1`** via JsonPointer — a text-humanisation library with no purpose in a rules runtime, which nonetheless enters the ILRepack. Flagged for architecture |
| Serialiser | `System.Text.Json` **9.x line — matches EDP's existing 9.0.4 pin exactly** (`PcrmModels`, `RuleDecisionService`) |
| `Reflection.Emit` | None found |
| Operator extensibility | `RuleRegistry` catalogs known rules and resolves by identifier — **closed by default, extended by explicit registration** |

**That last row matters more than it looks.** B-6 of the BRD requires a *closed primitive
set, extended only by ADR*. Json.Logic's registry is structurally that shape already, so the
governance boundary can be enforced by the library's own design rather than by convention.

## REJECT — `System.Linq.Dynamic.Core`, despite 1,711 stars

It would otherwise be a natural fit: string-expressed `Where`, `OrderBy`, `GroupBy` over
collections is close to what F1 and F2 need.

**It is disqualified by CVE-2023-32571 — remote code execution.** The library uses
`Reflection.Emit` to compile lambdas from supplied text without sufficient validation.
Versions 1.0.7.10 through 1.2.25 are affected; 1.3.0 remediates the disclosed vector.

The version is not the point. **Rule authors are untrusted input by definition** — that is
what a business-authored rule *is*. Adopting an expression compiler that turns author text
into emitted IL contradicts ADR-01 directly, and is the same reasoning that rejected
`microsoft/RulesEngine` in Phase 2 and that led ADR-11 to choose NCalc over DynamicExpresso.

**What is new is the evidence class.** That decision was previously a judgement about risk.
There is now a CVE against exactly the mechanism, in exactly this category of library. The
Phase 2 rejection is retrospectively vindicated and should be cited as precedent, not
re-argued.

## Correction — NCalc is not what limits us

`FormulaEngine`'s class comment states that collection aggregates are Horizon 2 and
"raise a clear error rather than silently guessing scalar semantics". That reads as an NCalc
limitation. **It is not.**

NCalc's `IN` operator accepts an `IEnumerable` as its right operand — the adopted expression
engine already carries collections. The flattening is **ours**: `RuntimeValue.FromJson`
converts a JSON array to `e.GetRawText()`, a string, before NCalc ever sees it.

**The ceiling is EDP's own normalisation layer, not the library.** F1 may therefore be
materially cheaper than the BRD assumed, and the architecture phase should test that
assumption early — it changes the shape of the estimate.

## Mode resolution — RESOLVED 2026-08-18 by **ADR-16**: mode (b)

| Mode | Description | Outcome |
|---|---|---|
| **(a) Adopt the library** | PCRM carries Json.Logic fragments; json-everything evaluates them | **Rejected** |
| **(b) Adopt the semantics** | PCRM gains native collection primitives built to Json.Logic's operator semantics, verified against its published conformance cases | **Adopted** |

This research initially leaned toward (a) on the standing adopt-over-build rule, and
deliberately deferred the call until the integration seam had been examined. **Examining it
reversed the answer.** Summarised — the full argument is in ADR-16:

1. **Two coercion models.** EDP compares via `RuntimeValue.Compare`; JsonLogic ships JS-style
   loose `==`. The same authored comparison would coerce differently inside a collection
   predicate than outside one — dual-engine drift inside a single evaluation.
2. **The trace goes black.** Every EDP condition and group writes a `TraceStep`; an embedded
   fragment writes none, exactly where FR-F33 and ADR-AI-05 require grounded explanation.
3. **Validation goes blind.** `RuleValidator` and `TableCompletenessAnalyzer` reason over PCRM
   structure and cannot see inside an opaque fragment.
4. **Two structural idioms in PCRM**, both of which the designer must generate and round-trip.
5. **Empty-set semantics inherited by accident.** The reference implementation returns
   `false` for `all` over an empty collection, departing from vacuous truth. Applied to the
   specimen's G1, a DR with zero invoices would silently fail the beneficiary check. That may
   be the right behaviour — the objection is that nobody would have chosen it.

**What adopt-over-build actually buys here.** EDP already owns every hard prerequisite of
iteration: operator evaluation, type coercion, null handling, trace, validation.
`ConditionEvaluator` is a composite that a quantifier node slots straight into. So mode (a)
would adopt the *trivial* part — roughly thirty lines of looping — while inheriting a semantic
mismatch, an opaque trace and a frozen dependency chain. **The rule is honoured by adopting
the specification and its conformance suite, which is where the real risk in set semantics
lives.**

Authors never see either representation — the designer generates PCRM from a visual editor —
so this was an internal representation choice throughout. ADR-06 constrains channels, not
internals, so neither mode conflicted with it.

## Practical consequence — this rides W0-1

The runtime ships as a single ILRepacked, signed assembly. Adding Json.Logic and JsonPointer
changes that assembly, so it cannot deploy until the SNK rotation completes.

**This would be the fifth change queued behind W0-1** — after the pin guard, `ExecutionId`,
entity binding and actions. W0-1 remains blocked on a vault and staging decision.

## Open for the architecture phase

1. Mode (a) or mode (b).
2. Whether `JsonPointer`'s transitive surface is acceptable inside the sandbox.
3. **Transitive pinning is mandatory, not advisory** — JsonLogic 5.4.3, JsonPointer.Net 5.3.1
   and Json.More.Net 2.1.1 must all be pinned explicitly. Every range is open-ended, so an
   unpinned restore floats to System.Text.Json 10 and breaks net462.
4. Whether `Humanizer.Core` can be excluded from the ILRepack, or must ship dead weight.
5. **The compounding pin problem (below)** — a strategy question, not a package question.
4. Whether FEEL's `some` / `every` semantics (DMN, via Drools and feel-scala as references)
   differ from Json.Logic's `Some` / `All` in any way that matters for authoring. Both are
   free specification prior art; neither is adoptable as code on netstandard2.0.

---

## 🔴 Structural finding — the net462 pin problem is compounding

This is the **second** dependency EDP would pin to an older line for one reason: **System.Text.Json
10.x is incompatible with the net462 sandbox.**

| Dependency | Pinned at | Current line | Cost of the pin |
|---|---|---|---|
| `NCalcSync` | 5.4.2 | 6.x | An accepted DoS advisory (GHSA-3w5p-95mh-gq75), ADR-SEC-NCALC |
| `JsonLogic` | *would have been 5.4.3* | 6.1.0 | **Avoided — ADR-16 takes the spec, not the package.** The pattern below is why that mattered |

Each pin is individually defensible. **The pattern is the risk.** The net462 sandbox is
progressively cutting EDP off from current library lines, and every pin is a security surface
that stops moving while the world keeps moving.

**ADR-16 declines to add the second entry** — not primarily for this reason, but the pin
problem was a real weight on the scale. The count stays at one.

The strategy question stands regardless, because a third candidate will arrive: accept the
freeze and monitor advisories, vendor a minimal subset, or source-include. **That belongs in
an ADR, not in a csproj comment**, and it is now the one open architecture item this research
did not close.

---

---

*Addendum ends. **Net result: no new sandbox dependency.** The runtime's dependency set is
unchanged — NCalcSync 5.4.2 and System.Text.Json 9.0.4 — and what EDP adopts from
`json-everything` is its specification and conformance cases, which carry no supply-chain,
ILRepack or advisory surface at all.*

*Two errors are recorded above rather than quietly amended, because both are the kind that
recur: **checking `TargetFrameworks` instead of the transitive dependency graph**, and
**applying adopt-over-build before examining the integration seam**. The rule is sound; it
just cannot be applied from the package page alone.*
