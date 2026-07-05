# Enterprise Decision Platform — Phase 1 Business Requirements Document

**Engagement ID:** EDP-BRE-001
**Phase:** 1 — Business Requirements Document (BRD)
**Module in Focus:** Business Rules Engine (BRE)
**Parent Product:** Maqsad Low-Code Platform
**Prepared by:** Maqsad AI — Business Analyst
**Date:** 2026-07-03
**Version:** 1.0
**Status:** DRAFT — Pending CEO Approval

**Reference:** Phase 0 Architecture Blueprint (authoritative; this BRD does not re-open any decision settled there)

---

```
═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        Enterprise Decision Platform — Business Rules Engine
Engagement:     EDP-BRE-001
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-07-03
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════
```

---

## 1. Executive Summary and Business Context

Organisations running Microsoft Dynamics 365 or Dynamics CRM on-premises routinely embed business logic — loan eligibility criteria, pricing rules, compliance thresholds, routing decisions — directly inside C# plugins, Power Automate flows, or hand-crafted workflow configurations. When a policy changes (a common occurrence in regulated industries), a developer must be involved, the change enters a development queue, and what should be a business-day decision becomes a multi-week project. The logic is opaque, untested, un-versioned, and disconnected from the business owner who understands it.

The Enterprise Decision Platform (EDP) — Business Rules Engine (BRE) solves this by delivering a governed, visual, metadata-driven decisioning layer that runs entirely inside the customer's existing Dynamics/Dataverse environment. Business Analysts author decisions in business language using a visual designer. Decisions are versioned, tested, approved, and published through a controlled governance workflow. A single native runtime executes those decisions identically whether called from a plugin, a custom API, a portal, or a mobile application — with no external infrastructure, no external runtime, and no data leaving the customer's tenancy.

The expected business outcome is a shift in ownership: routine policy changes move from the developer backlog to business self-service, cutting change lead time from weeks to hours, de-risking decision logic through auditability and testability, and delivering a sovereign, data-residency-compliant decisioning capability that becomes a strategic competitive advantage for Dynamics-centric customers in regulated sectors.

---

## 2. Problem Statement

### 2.1 The Pain

**Who suffers:** Business Analysts, Policy Owners, Compliance Officers, and Operations Managers in Dynamics 365 and Dynamics CRM on-premises organisations — particularly in financial services, insurance, healthcare, and other regulated industries.

**What hurts:**

1. **Developer dependency for every policy change.** Business rules — interest rate tiers, eligibility criteria, routing logic, pricing formulas — are buried in C# plugin code, workflow definitions, or hard-coded configuration. Any policy change requires a developer, a change request, a build-and-deploy cycle, and a wait measured in weeks, not hours.

2. **Invisible and unverifiable logic.** When a compliance auditor asks "what rule applied to this loan application on 14 March?", the honest answer is often "we don't know without re-reading the code that was deployed at the time." Rule logic has no accessible history, no trace, no simulation capability.

3. **Change risk.** Because rules are in code, changing one can break another. There is no test harness native to the logic layer, no simulation environment, and no safe "what-if" capability for a business user.

4. **Duplication across channels.** The same pricing rule might be implemented once in a CRM plugin, again in a portal API, and a third time in a mobile-app backend — three codebases with three divergence opportunities. No source of truth.

5. **Vendor lock-in and high TCO.** Existing specialist rule engines (North52, IBM ODM, Pega) either require external infrastructure, carry enterprise-scale cost and implementation complexity, or lack the data-residency posture that regulated-sector customers demand.

### 2.2 Cost of Inaction

- Policy change lead times remain weeks, creating competitive and compliance lag.
- Regulatory audit findings expose undocumented, untraceable decision logic.
- Data-residency regulations tighten and cloud-external rule engines become liabilities.
- Developer resources are consumed maintaining rule logic that business users could own.
- Platform stickiness is lost: every channel that cannot invoke a central decision engine builds its own, compounding the problem.

---

## 3. Business Objectives and Success Criteria

The following objectives are taken from Phase 0 Section 5 and given measurable success criteria for Phase 1 ratification. All targets are for the MVP (Horizon 1) unless labelled otherwise.

| # | Objective | Success Criterion | Measurement |
|---|-----------|-------------------|-------------|
| BO-1 | Reduce cost and lead time of policy change | A Business Analyst completes authoring, simulation, and publishing of a new production decision — with zero developer involvement — in under one working day | Measured via usability testing in Phase 5 with real BA participants |
| BO-2 | De-risk decision logic | 100% of published decisions have at least one passing simulation test and a complete version history before reaching production | Enforced by governance workflow; verified in Phase 5 QA |
| BO-3 | Displace incumbents (North52 as primary target) | EDP delivers the same or superior decision-authoring capability with native governance and zero external infrastructure overhead | Competitive feature-parity checklist reviewed in Phase 3; pricing model decided pre-launch |
| BO-4 | Protect the data trust boundary | Rule definitions and execution traces remain 100% within the customer's CRM/Dataverse tenancy for all core functionality; zero exfiltration to any external system as a requirement for core operation | Verified in Phase 6 audit; confirmed by data-residency assessment |
| BO-5 | Create a platform flywheel | At least one sibling engine (Form or Process) can invoke a BRE decision through the published entry contract by end of Horizon 1 | Integration contract tested in Phase 5 |
| BO-6 | Enable a rule marketplace (roadmap) | Horizon 1 delivers import/export and the JSON rule-definition schema needed for marketplace distribution; marketplace itself is Horizon 3 | JSON schema defined in Phase 3; import/export verified in Phase 5 |
| BO-7 | Support multi-tenant, multi-industry deployment | No hardcoded business thresholds, GUIDs, or rates in any shipped artefact; all behaviour is metadata and configuration | Verified in Phase 6 audit |

---

## 4. Stakeholders and Target Users

Mapped to Phase 0 Section 6 personas. The north-star persona is the Business Analyst.

| Stakeholder | Role | Interest in this project | Engagement mode |
|-------------|------|--------------------------|-----------------|
| **Business Analyst / Policy Owner** | Primary author | Authors, simulates, tests, and submits decisions for approval without coding; must work exclusively in business terms | Direct user; usability is the primary acceptance gate |
| **Rule Approver / Governance Officer** | Approver | Reviews proposed rule versions, passes or rejects at the governance gate; owns segregation-of-duties control | Direct user; approval workflow UX and audit trail are critical |
| **CRM Administrator / Solution Owner** | Deployer | Installs the CRM Solution, configures security roles, manages environment promotion | Involved at deployment; ALM tooling is key concern |
| **Developer / Maker** | Extender | Wires new entry adapters, builds custom operators/functions, embeds decisions in plugins/APIs | Consumed through extension points; clean SDK contract is critical |
| **System Integrator / ISV** | Packager | Ships industry rule template packs; distributes via marketplace | Import/export format and signing model matter; Horizon 3 primary concern |
| **Auditor / Compliance Officer** | Oversight | Reads execution trace, version history, approval records; must answer regulatory questions | Read-only consumer; completeness and accuracy of trace are critical |
| **AI/Data Scientist** (future) | Optimiser | Uses AI-assisted generation, impact analysis, and optimisation features | Horizon 3; architecture readiness validated in Horizon 1 |
| **Portal and Mobile end-users** | Indirect consumers | Experience decisions through downstream apps; never interact with the engine directly | Affected by decision accuracy and latency, not the authoring experience |
| **Maqsad CEO / Product Owner** | Sponsor and approver | Strategic direction, go/no-go decisions, resource commitment, market positioning | Phase 1 and Phase 7 approval gates |
| **Maqsad QDB (Quality/Delivery Board)** | Delivery governance | Staging sign-off, release conditions, environment approvals | Phase 5, 6, 7 gates |

---

## 5. Scope

### 5.1 In Scope — Horizon 1 MVP

The following capabilities constitute the Minimum Viable Product. They are sufficient to prove the two architectural spines (Single Runtime and Metadata-Driven Authoring) and deliver real business value.

- Visual Rule Designer embedded in Dynamics/Dataverse as a web resource, hosting the GoRules JDM Editor as the authoring surface.
- Three decision-authoring styles: Decision Tables, Condition/Expression trees, and Formula/Calculation nodes (see OQ-2 resolution, Section 10).
- Metadata Service surfacing CRM/Dataverse entities, fields, option sets, lookups, and relationships in a searchable, business-friendly selector — no schema names exposed to authors.
- Rule Repository storing rule definitions and versions as CRM/Dataverse records.
- Basic versioning: draft and published states, with immutable published records.
- Execution trace record written per decision evaluation.
- Single native C# Rule Runtime invoked via Plugin and Custom Action (CRM on-prem) and Plugin and Custom API (Dataverse cloud).
- Simulation capability: run a rule against sample inputs before publishing, with no side effects.
- Basic testing: define test cases with expected outputs; run against a rule version.
- Import and export of rule definitions as JSON.
- Security model aligned to CRM/Dataverse security roles: separate permissions for authoring, approval, publishing, and administration.
- Cloud/on-prem parity: identical runtime semantics on Dynamics CRM On-Premises 9.x and Dynamics 365 Online / Dataverse.
- Deployment as a standard CRM Solution (managed for customers, unmanaged for development).

### 5.2 Out of Scope — Horizon 1 (deferred to Horizon 2 or beyond)

- Full approval workflow with multi-step approval chains (Horizon 2).
- Version diffing, cloning, and template management (Horizon 2).
- Visual debugger and step-through trace (Horizon 2).
- Execution analytics and aggregate reporting (Horizon 2).
- Excel import/export of decision tables (Horizon 2).
- Workflow Activity entry point for CRM on-prem (Horizon 2).
- On-prem lightweight API hardening (Horizon 2).
- Multi-language authoring labels (Horizon 2).
- AI-assisted rule generation, explanation, optimisation, or documentation (Horizon 3).
- CRM Metadata Synchronisation with change-impact flags (Horizon 3).
- Rule Marketplace, template packs, and signing infrastructure (Horizon 3).
- Advanced simulation with batch or historical replay (Horizon 3).
- Deep integration with Process, Form, Integration, CMS, and AI engines as primary consumers (Horizon 4 — integration contract is published in Horizon 1 but deep composition is Horizon 4).
- PCF-based designer host (deferred; see OQ-9 resolution, Section 10).
- Any external infrastructure: Docker, Kubernetes, Azure Functions, Azure App Service, Node.js or Rust runtime, external rule server, or external rule repository.
- GoRules ZEN runtime: explicitly excluded from product scope at all horizons.

### 5.3 Architectural Scope Boundaries (Phase 0 Invariants — Cannot be Re-opened)

The following are fixed constraints from Phase 0 Appendix B. They are not negotiable without a formally approved ADR:

1. One native C# runtime; every entry point funnels to it.
2. No external runtime or infrastructure for core authoring or execution.
3. Entire core deployable as a standard CRM Solution.
4. Rule store is CRM/Dataverse; no external rule repository.
5. GoRules is designer-only; ZEN is not the runtime.
6. Published versions are immutable; version resolution is explicit.
7. Business users never handle schema names (metadata-driven authoring).
8. Identical runtime semantics on cloud and on-prem.
9. AI is advisory at authoring time; the execution path is deterministic.
10. Security inherited from the platform; no parallel identity model.
11. BRE has no hard runtime dependency on any sibling engine.

---

## 6. Functional Requirements

Grouped by functional area. All requirements are for Horizon 1 MVP unless labelled. Priority follows MoSCoW (Must Have / Should Have / Could Have / Won't Have this release).

### 6.1 Rule Authoring

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | The system shall allow a Business Analyst to create a new decision using the visual GoRules JDM Editor without entering any CRM schema names, field logical names, or option set numeric values. | Must Have |
| FR-002 | The system shall present all entities, fields, relationships, option sets, and lookups by their CRM display name in a searchable selector, auto-resolved to stable logical identifiers at save time. | Must Have |
| FR-003 | The system shall support Decision Table authoring in Horizon 1, allowing authors to define rows of conditions and corresponding outputs with point-and-click cell editing. | Must Have |
| FR-004 | The system shall support Condition/Expression authoring in Horizon 1, allowing authors to construct if-then-else logic using business-term selectors for fields, operators, and values. | Must Have |
| FR-005 | The system shall support Formula/Calculation node authoring in Horizon 1, allowing authors to define derived output values using arithmetic, date, and string operations over selected fields. | Must Have |
| FR-006 | The system shall save the rule definition as a versioned JSON artefact in CRM/Dataverse when the author saves in the designer. | Must Have |
| FR-007 | The system shall display a save confirmation and the current version number to the author after each successful save. | Must Have |
| FR-008 | The system shall prevent a Business Analyst from publishing a decision without first running at least one simulation with a sample input payload. | Should Have |
| FR-009 | The system shall display an error message that identifies the failing field and condition when the rule definition fails validation on save, without requiring the author to interpret schema or JSON. | Must Have |

### 6.2 Metadata Service

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-010 | The system shall read CRM/Dataverse entity metadata on demand (or from a governed cache) and present entity display names, field display names, option-set labels, and relationship labels in the designer selector. | Must Have |
| FR-011 | The system shall allow the author to traverse relationships (1:N, N:1, N:N) within the metadata selector to access related entity fields as decision inputs. | Must Have |
| FR-012 | The system shall bind rule definitions to stable logical identifiers so that a CRM display-name change does not break an existing rule. | Must Have |
| FR-013 | The system shall surface lookup fields with their target entity clearly labelled, preventing authors from selecting a lookup value that is semantically incompatible with the comparison. | Should Have |

### 6.3 Rule Repository and Versioning

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-014 | The system shall store every rule definition, its version number, the authoring identity, and the creation timestamp as records inside CRM/Dataverse. | Must Have |
| FR-015 | The system shall maintain a complete version history for every rule, with no version ever deleted or overwritten. | Must Have |
| FR-016 | The system shall enforce the following minimum lifecycle states for Horizon 1: Draft (editable), Published (immutable, executable in production). | Must Have |
| FR-017 | The system shall prevent any in-place edit of a Published version; a change to a Published rule must create a new Draft version. | Must Have |
| FR-018 | The system shall record the identity of the user who published a version and the timestamp of publication alongside the version record. | Must Have |
| FR-019 | The system shall allow an administrator to view the complete version history of any rule, including author, creation date, and publication date. | Must Have |
| FR-020 | The system shall support JSON export of a rule definition (any version) and JSON import to create a new Draft from the imported definition. | Should Have |

### 6.4 Rule Runtime and Execution

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-021 | The system shall evaluate a decision request by invoking the single native C# runtime, which operates independently of the GoRules ZEN engine. | Must Have |
| FR-022 | The system shall resolve the rule version to execute as follows: by default, the latest Published version; or a specific version if the caller explicitly pins one. | Must Have |
| FR-023 | The system shall return a typed error result — not a null and not a silent exception — when a rule evaluation fails, including a failure reason readable by a developer at integration time. | Must Have |
| FR-024 | The system shall produce identical output for identical inputs and an identical rule version, on every invocation, on both cloud and on-premises deployments. | Must Have |
| FR-025 | The system shall expose a Plugin entry point for in-process invocation on both CRM on-prem and Dataverse cloud. | Must Have |
| FR-026 | The system shall expose a Custom Action entry point for invocation from within CRM workflows and processes on CRM on-prem and Dataverse cloud. | Must Have |
| FR-027 | The system shall expose a Custom API entry point for external and portal/mobile invocation on Dataverse cloud. | Must Have |
| FR-028 | The system shall complete a single decision evaluation within the plugin sandbox execution budget, with a P95 target of 500ms for a standard decision (see OQ-1 resolution, Section 10). | Must Have |
| FR-029 | Each entry-point adapter shall perform no branching business logic; it shall authenticate, normalise the request, invoke the runtime, and map the result — nothing more. | Must Have |

### 6.5 Simulation and Testing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-030 | The system shall allow an author to run a simulation of any rule version (including Draft) against a manually entered sample input, returning the decision output and a trace, with no side effects on CRM data. | Must Have |
| FR-031 | The system shall allow an author to define named test cases with expected outputs for a rule definition. | Should Have |
| FR-032 | The system shall run all defined test cases against a rule version and report pass/fail per test case, with the actual output visible alongside the expected output for any failure. | Should Have |
| FR-033 | The system shall allow simulation and testing to be run on a Draft version (not yet published) without triggering any real CRM data writes. | Must Have |

### 6.6 Execution Trace

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-034 | The system shall write an execution trace record for every production decision evaluation, capturing: the rule identifier, the version resolved, the execution timestamp, the invoking identity, and the decision output. | Must Have |
| FR-035 | The system shall not include in the execution trace any field values that are protected by CRM/Dataverse field-level security for the invoking identity. | Must Have |
| FR-036 | The system shall store execution traces as append-only records in CRM/Dataverse; no trace record may be updated or deleted through the platform. | Must Have |
| FR-037 | The system shall allow a user with the Auditor security role to read execution traces for any rule, filtered by date range. | Must Have |

### 6.7 Security and Access Control

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-038 | The system shall use CRM/Dataverse security roles to control access; no separate identity store shall be introduced. | Must Have |
| FR-039 | The system shall enforce the following minimum security roles: Rule Author (create/edit drafts, run simulation), Rule Approver (publish/retire versions), Rule Administrator (manage all rules, configure security), Rule Auditor (read-only access to traces and version history). | Must Have |
| FR-040 | The system shall prevent a user from publishing their own Draft rule if the Rule Approver role is assigned to a different group (segregation of duties). | Should Have |
| FR-041 | The system shall record an audit entry for every version lifecycle transition (draft created, published, retired) that includes the acting user identity and timestamp. | Must Have |

### 6.8 Deployment and ALM

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-042 | The system shall ship as a standard Dynamics CRM Solution (managed for customers, unmanaged for development) with no components deployed outside the solution. | Must Have |
| FR-043 | The system shall declare all web resource files individually in the solution manifest's RootComponents; folder wildcards shall not be used. | Must Have |
| FR-044 | The system shall support environment promotion via standard Dynamics solution import/export without requiring any external tooling beyond the CRM/Dataverse platform. | Must Have |
| FR-045 | Rule content (definitions, versions) shall travel independently of the solution structure via the platform's data-migration mechanisms (configuration data export/import). | Should Have |

---

## 7. Non-Functional Requirements

Business framing of Phase 0 Section 8 NFRs, with concrete targets.

| ID | Category | Requirement | Rationale |
|----|----------|-------------|-----------|
| NFR-001 | **Performance** | A standard decision evaluation (up to 20 conditions, up to 5 nested sub-expressions, no external data fetch) must complete in P95 ≤ 500ms and P99 ≤ 2,000ms, measured inside the CRM plugin sandbox. The absolute ceiling for any single evaluation is 30 seconds, preserving margin within the platform's 2-minute sandbox budget. | Interactive form and process use cases cannot tolerate long decision latency. The sandbox budget is a hard platform constraint. |
| NFR-002 | **Scalability** | The runtime must be stateless per evaluation so that concurrent invocations do not share mutable state. Throughput scales with the underlying CRM/Dataverse platform's own scaling — no additional infrastructure is required. | No external scaling infrastructure is permitted (Phase 0 Invariant 2). |
| NFR-003 | **Availability** | Core authoring and execution availability inherits the host platform SLA (Dynamics 365 Online: 99.9% monthly uptime per Microsoft SLA; on-prem: customer-managed). The EDP introduces no independent availability dependency. | Zero external infra rule; no independent SLA story required. |
| NFR-004 | **Reliability** | Decision evaluation must be deterministic: identical inputs + identical resolved version must produce identical outputs on every invocation, on cloud and on-prem. Evaluation must return an explicit typed error result — never a null and never a swallowed exception. | Auditability and trust require determinism. Silent failures are unacceptable in governed decisioning. |
| NFR-005 | **Security** | Authoring and execution must honour CRM/Dataverse identity, security roles, field-level security, and platform audit. No secrets, credentials, or tokens may appear in rule definitions, traces, or logs. No sensitive field values may appear in traces for identities that do not have field-level access. | Enterprise platform rules; data-residency advantage. |
| NFR-006 | **Auditability** | Every published version, approval action, execution, and lifecycle transition must be traceable. Audit and trace records must be append-only (no UPDATE/DELETE). Retention must be configurable (see OQ-5 resolution). | Regulatory compliance; competitive differentiator over code-buried rules. |
| NFR-007 | **Portability** | Identical decision semantics must operate on Dynamics CRM On-Premises 9.x and Dynamics 365 Online / Dataverse. Platform differences must be confined to thin entry-adapter layers. | On-prem is a first-class deployment target; cloud-only behaviour is a defect. |
| NFR-008 | **Usability** | A Business Analyst with no CRM schema knowledge must be able to author, simulate, and publish a straightforward decision (< 15 conditions) within 30 minutes of first use, measured in structured usability testing with real BA participants in Phase 5. | The north-star persona test. If a BA needs developer help, the product has failed. |
| NFR-009 | **Extensibility** | New operators, functions, and entry adapters must be addable through defined extension points without editing the core runtime or designer. Each extension point must be documented with a stable, versioned contract. | Open/Closed at product scale. |
| NFR-010 | **Observability** | The runtime must emit structured diagnostic information (not console.log) for every evaluation failure and every significant lifecycle transition. No sensitive data may appear in diagnostic output. | Platform clean-code standards and governance. |
| NFR-011 | **Data Residency** | Rule definitions, version history, execution traces, and all governance artefacts must reside exclusively within the customer's CRM/Dataverse tenancy. No core-function data may transit to or reside in any external system. | Competitive differentiator in regulated sectors; data-sovereignty compliance. |
| NFR-012 | **Maintainability** | The rule-definition JSON schema must be formally versioned, documented, and published as a stable contract. The runtime must pass a conformance test suite verifiable on both cloud and on-prem. | Long-term TCO; prevents designer/runtime coupling creep (Phase 0 Risk R-2). |
| NFR-013 | **Localisation** | The metadata service must surface CRM display names in the language of the authenticated user where localised labels are available in the CRM model. Full multi-language authoring UI is Horizon 2. | Enterprise/global reach. |

---

## 8. Assumptions, Dependencies, and Constraints

### 8.1 Assumptions

| # | Assumption |
|---|------------|
| A-1 | The target customer has an existing Dynamics CRM On-Premises 9.x or Dynamics 365 Online / Dataverse environment into which the EDP solution will be installed. |
| A-2 | Business Analysts at target customers are familiar with the Dynamics Advanced-Find experience and will recognise the metadata selector paradigm. |
| A-3 | GoRules JDM Editor (open-source) remains available under its current license and is technically embeddable in a Dynamics web resource. This is validated in Phase 2 (Dependency Research). |
| A-4 | The rule-definition JSON emitted by the GoRules JDM Editor can be fully parsed and executed by a native C# runtime without dependency on the GoRules ZEN interpreter. This is validated during Phase 3 Architecture and Phase 4 Build. |
| A-5 | CRM/Dataverse field-level security metadata is programmatically accessible to the runtime to enforce data-classification in trace capture. |
| A-6 | The entry-contract JSON schema for decision requests and results will be stable from Horizon 1 forward; breaking schema changes require a version increment and deprecation period. |
| A-7 | The initial licensing model is per-environment (see OQ-7 resolution); changes to this model require a commercial ADR before Phase 7. |
| A-8 | On-prem target customers accept that AI-assisted features are unavailable without cloud connectivity; they do not consider this a blocking limitation for core decisioning. |
| A-9 | Horizon 1 delivers a working end-to-end slice (author → simulate → publish → execute → trace) before any horizontal capability widening begins. |

### 8.2 Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| GoRules JDM Editor | External open-source library | Designer surface only; Phase 2 validates license, stars, and embeddability. If not fit, Phase 2 must surface an alternative. |
| Dynamics CRM / Dataverse Platform | Platform host | All authoring, execution, and storage run inside the customer's platform instance. |
| CRM Solution ALM tooling | Platform | Standard solution import/export (and PAC CLI for cloud) used for promotion. No additional tooling required. |
| Phase 2 Dependency Research | Internal | Must validate GoRules JDM Editor before Phase 3 architecture begins. |
| Phase 3 Architecture | Internal | Rule-definition JSON schema, runtime component interfaces, and entry-adapter contracts must be defined before Phase 4 build. |
| Phase 0 Architecture Blueprint | Internal | Authoritative; all phases conform to it. |

### 8.3 Constraints (Fixed)

The following constraints are non-negotiable. They are inherited from Phase 0 Appendix B and the product vision. No Phase 1–7 deliverable may contradict them without an approved ADR.

| Constraint | Source | Impact on solution |
|------------|--------|--------------------|
| Zero external infrastructure for core function | Phase 0 Invariant 2 | No Docker, Kubernetes, Azure Functions, App Service, Node.js, Rust, external rule server, or external rule repository may be required to author or execute rules. |
| Standard CRM Solution deployment | Phase 0 Invariant 3 | The entire core ships and runs inside a Dynamics/Dataverse solution. No external host is needed. |
| Rules stored in CRM/Dataverse only | Phase 0 Invariant 4 | No external rule repository. The platform itself is the rule store. |
| GoRules JDM Editor as designer; ZEN not the runtime | Phase 0 Invariant 5 | GoRules is the visual authoring surface only. The native C# runtime interprets the JSON definition independently. |
| Published versions are immutable | Phase 0 Invariant 6 | Once published, a version is frozen. A change creates a new version. Rollback is re-publishing a prior version. |
| Metadata-driven authoring; no schema names exposed to authors | Phase 0 Invariant 7 | Authors see display names; the platform resolves to logical identifiers. |
| Identical runtime semantics on cloud and on-prem | Phase 0 Invariant 8 | Cloud/on-prem differences are confined to entry adapters. |
| AI is advisory at authoring time; execution path is deterministic | Phase 0 Invariant 9 | AI never enters the evaluation path. |
| Security inherited from the platform | Phase 0 Invariant 10 | No parallel identity store. Entra ID (cloud) / AD/ADFS (on-prem). |
| BRE has no hard runtime dependency on any sibling engine | Phase 0 Invariant 11 | The BRE is independently deployable and testable. |

---

## 9. Business Risks and Mitigations

Business framing of Phase 0 Section 22 risks, with business-level mitigations.

| # | Risk | Business Impact | Likelihood | Business Mitigation |
|---|------|----------------|------------|---------------------|
| BR-1 | **Usability shortfall: BA still needs developer help** — the metadata selector or authoring experience is not intuitive enough. | High — the core value proposition fails; the product cannot displace North52. | Medium | Mandate structured usability testing with real Business Analysts as a Phase 5 hard gate. No release without a passing usability benchmark (< 30-minute authoring of a standard decision, first use). |
| BR-2 | **Performance ceiling: complex rules exceed sandbox budget** — rich decision logic hits the 2-minute platform constraint. | High — users abandon the platform for decisions with complex logic; the single-runtime value is compromised. | Medium | Define and enforce a rule-complexity ceiling in Phase 3 (max conditions, max nesting, max rule-chain depth). Measure in Phase 5 against the defined SLA. Publish guidance for when to use async handoff. |
| BR-3 | **Governance bypass: unpublished rules reach production** — a configuration error allows draft or unapproved versions to execute. | High — compliance and audit integrity are destroyed; this is a regulatory exposure. | Low | The resolver is the single authority for version selection; it must enforce published-only in production contexts. Phase 6 audit validates that no bypass path exists. |
| BR-4 | **Metadata drift: CRM model changes silently break rules** — a field rename or entity restructure invalidates rule bindings. | High — decisions fail silently or return wrong outputs; business-critical logic breaks post-model change. | Medium | Stable-identifier binding (display-name changes do not break rules). Horizon 2: metadata sync with change-impact flags. Interim: document the risk and advise administrators to test rules after model changes. |
| BR-5 | **Data residency breach: rule data transits externally** — an extension or AI feature sends rule content or trace data outside the tenancy. | High — regulatory exposure; loss of the sovereignty differentiator. | Low | Phase 6 audit verifies zero external egress for core function. Extensions are governed; AI features require explicit customer consent and an approved ADR before any data leaves the tenancy. |
| BR-6 | **Competitive parity gap vs. North52 on niche features** — early customers miss a specific feature they have from North52. | Medium — sales friction; delayed displacement. | Medium | Prioritise the governance, audit, and metadata-driven authoring differentiators — areas where North52 is weaker. Build the competitive checklist in Phase 3. Roadmap the gaps honestly. |
| BR-7 | **On-prem/cloud divergence** — a behaviour difference between CRM on-prem 9.x and Dataverse cloud is not caught before release. | High — breaks the portability promise; damages trust with on-prem-first customers. | Medium | Single runtime. Shared conformance test suite executed on both platforms as a Phase 5 gate. |
| BR-8 | **GoRules JDM Editor embeddability fails** — the library cannot be hosted in a Dynamics web resource under an acceptable license. | High — blocks designer delivery; requires a replacement designer surface. | Low | Phase 2 dependency research validates this before any Phase 3 or 4 work begins. If GoRules fails, Phase 2 must recommend an alternative before the engagement proceeds. |
| BR-9 | **Scope creep: BRE absorbs sibling responsibilities** — pressure to add process orchestration or ETL inside the BRE. | Medium — violates module independence; increases maintenance burden and coupling. | Medium | Enforce Phase 0 functional boundaries (Section 7.2). Any cross-boundary feature request requires an ADR before scoping. |
| BR-10 | **Licensing model wrong for market** — per-environment pricing is not what Dynamics ISV customers expect or budget for. | Medium — blocks commercial traction. | Medium | Per-environment licensing is the recommended default (OQ-7); validate with 3 design-partner customers before Phase 7 commercial packaging. |

---

## 10. Resolved Open Questions

Each open question from Phase 0 Appendix C is addressed with a concrete business recommendation. Items flagged CEO DECISION require ratification at the Phase 1 approval gate.

---

### OQ-1 — Exact Performance SLA (Target/Percentile Latency)

**Recommendation:** Adopt a two-tier SLA:

- **P95 ≤ 500ms** for a standard decision (up to 20 conditions, up to 5 nested sub-expressions, inputs supplied by the caller — no CRM data fetch inside the evaluation).
- **P99 ≤ 2,000ms** for the same standard decision profile.
- **Absolute ceiling: 30 seconds** per evaluation for any decision profile. This preserves comfortable margin within the platform's 2-minute sandbox budget and leaves headroom for caller overhead, network, and serialisation.

**Rationale:** Interactive form and process-driven decisions must feel instantaneous to end users. The 500ms P95 target aligns with widely accepted interactive-response thresholds. The 30-second ceiling ensures no individual decision endangers the sandbox budget, even for complex decision chains.

**What Phase 3 must define:** the maximum rule-complexity profile (max conditions, max rule chain depth, max nested sub-decisions) that the runtime guarantees to evaluate within the P95 target. Decisions exceeding that complexity profile should be flagged at authoring time and directed to async handoff via the Process Engine.

**Status:** BA recommendation — CEO ratification requested.

---

### OQ-2 — MVP Decision-Authoring Styles for Horizon 1

**Recommendation:** Include three authoring styles in Horizon 1:

1. **Decision Tables** — rows of conditions mapped to outputs; the most familiar format for Business Analysts authoring policy matrices (e.g., loan tier by credit score and income band).
2. **Condition/Expression Trees** — if-then-else branching logic using business-term selectors; covers eligibility and routing decisions that do not fit a tabular structure.
3. **Formula/Calculation Nodes** — arithmetic, date, and string operations over selected fields; covers derived-value decisions (e.g., premium calculation, SLA deadline computation).

**Why not decision tables alone:** Limiting Horizon 1 to decision tables would prevent the Business Analyst from authoring two of the most common real-world decision types (branching eligibility and calculated outputs). This would require developer involvement for those cases, directly defeating BO-1.

**What is deferred:** advanced function authoring (custom reusable functions), cross-decision sub-decision invocation, and decision graphs are Horizon 2+.

**Status:** BA recommendation — CEO ratification requested.

---

### OQ-3 — Default vs. Pinned Version-Resolution Policy

**Recommendation:** Implement the following default policy, configurable at the entry-adapter level:

- **Default (all entry points):** resolve to the latest Published version at call time. This ensures that a newly published rule is immediately live without caller reconfiguration.
- **Pinned:** callers may explicitly specify a version identifier in the decision request. Pinning is intended for long-running cases where the policy that applied at case initiation must remain consistent for the life of the case (e.g., a loan application assessed under the rules in force at submission date).
- **Resolution authority:** the Rule Resolver component is the sole authority for version selection; no entry adapter may implement version-selection logic.

**What Phase 3 must specify:** the exact API contract for expressing a version pin in the decision request; the behaviour when a pinned version has been retired; and the governance requirement (documentation/justification) for pinning in production.

**Status:** BA recommendation — CEO ratification requested.

---

### OQ-4 — Extent of On-Prem AI Degradation Acceptable to Target Customers

**Recommendation:** On-premises deployments shall operate the full core platform — authoring, versioning, governance, simulation, execution, and trace — without any cloud dependency. AI-assisted features (rule generation, explanation, optimisation, impact analysis) require cloud connectivity and are unavailable on air-gapped on-prem deployments.

This degradation is acceptable for the following reasons:

1. AI features are Horizon 3; on-prem customers will have significant notice before their absence becomes a gap.
2. The core value proposition — governed, visual, metadata-driven decisioning with zero external infrastructure — is entirely on-prem-capable.
3. On-prem customers in regulated sectors often cannot route CRM data to external cloud AI services; the absence of AI features in air-gapped mode may be a compliance requirement rather than a limitation.

**Disclosure obligation:** marketing materials and product documentation must clearly identify which features require cloud connectivity. Customers must not be surprised by this at deployment.

**Status:** BA recommendation — CEO ratification requested.

---

### OQ-5 — Trace Retention and Data-Classification Policy

**Recommendation:**

| Record type | Sensitivity classification | Default retention | Configurable? |
|-------------|---------------------------|-------------------|---------------|
| Execution trace (inputs summary, output, version resolved) | Internal | 90 days | Yes — customer may extend up to 7 years |
| Governance audit (lifecycle transitions, approvals, publishes) | Confidential | 7 years (minimum) | No — append-only permanent |
| Simulation/test-run trace | Internal | 30 days | Yes — customer may reduce to 7 days |

**Data-classification rules for trace content:**
- Execution traces must redact the values of any CRM field marked as sensitive under field-level security for the invoking identity.
- Traces store field names (for governance) but not field values for restricted fields.
- No personally identifiable information (PII) may appear in structured log output; PII may appear in trace records only within the CRM/Dataverse security boundary.

**Rationale for 7-year governance audit floor:** regulated sectors (financial services, insurance, healthcare) commonly face 5–7 year audit record retention requirements. A 7-year floor avoids customer governance failures caused by premature deletion.

**Status:** BA recommendation — CEO ratification requested.

---

### OQ-6 — Marketplace Commercial and Security/Signing Model

**Recommendation:** Defer full marketplace infrastructure to Horizon 3. Establish the technical foundation in Horizon 1 as follows:

**Horizon 1 (technical foundation only):**
- Publish the JSON rule-definition schema as a stable, versioned contract.
- Deliver JSON import/export capability that can ingest external rule definitions.
- Define the signing model conceptually (what a signed template pack looks like).

**Horizon 3 (full marketplace):**
- Template packs signed by Maqsad (or verified ISV partners) using a code-signing certificate issued by Maqsad.
- Import process validates the signature before allowing installation; unsigned packs are rejected.
- Commercial model: Maqsad-produced templates bundled in base license; ISV-produced packs distributed via a governed marketplace with revenue-sharing (commercial terms are a CEO/Board decision, not a BA recommendation).
- ISV onboarding requires security review of template content and sandboxed function code.

**CEO DECISION REQUIRED:** The commercial revenue-sharing model for ISV marketplace participants (royalty percentage, flat fee, or platform subscription) is a strategic business decision that falls outside the BA scope. The CEO must ratify the commercial model before Horizon 3 marketplace development begins.

---

### OQ-7 — Licensing and Packaging Model

**Recommendation:** Per-environment licensing as the base commercial model.

**Proposed tier structure:**

| Tier | Scope | Key limitations | Target customer |
|------|-------|-----------------|-----------------|
| **Standard** | Single Dynamics environment | Up to 50 active published decisions; no marketplace access; email support | SMB; first-time adopters |
| **Professional** | Up to 3 environments (Dev/Test/Prod) | Unlimited published decisions; JSON import/export; standard support | Mid-market ISVs and enterprise single-product |
| **Enterprise** | Unlimited environments | Marketplace access (Horizon 3); AI features (Horizon 3); premium support + SLA | Large enterprise; Dynamics SI partners |

**Rationale:** per-environment pricing is the dominant model for Dynamics ISV solutions and aligns with how customers budget for CRM add-ons. Per-seat and per-decision models create friction at budget approval because Dynamics admins do not typically count rule executions.

**CEO DECISION REQUIRED:** The final tier names, pricing points, and any partnership/OEM arrangements are a strategic and commercial decision requiring CEO approval before any customer-facing pricing is published. The above is a structural recommendation for the CEO to ratify or revise.

---

### OQ-8 — Initial Target Industries for Template Packs

**Recommendation:** Prioritise the following three industries for Horizon 3 template packs, in order of priority:

1. **Financial Services / Lending** — loan eligibility, credit tier assignment, interest rate decisions, arrears escalation. Dynamics 365 has the highest ISV saturation in this sector; North52 is widely deployed here; EDP's data-residency and governance story directly addresses banking regulatory requirements.

2. **Insurance** — underwriting rule sets, premium calculation, claim eligibility and routing, policy renewal decisions. Complex, high-volume, frequently changing rules; strong BA authoring value; regulatory audit requirements are high.

3. **Healthcare / Public Sector** — patient eligibility, care pathway routing, referral decisions, compliance gates. Data-residency (in-tenancy decisioning) is often a regulatory requirement, not a preference; this is a strategic differentiator for EDP.

**Rationale for sequencing:** these three verticals have the highest Dynamics CRM/D365 density, the strongest regulatory mandate for auditable decision logic, and the greatest appetite to displace code-buried or external rule engines.

**Status:** BA recommendation — CEO ratification requested.

---

### OQ-9 — PCF vs. Web Resource for the Designer Host in Horizon 1

**Recommendation:** Use a **web resource** for the Horizon 1 designer host.

| Factor | Web Resource | PCF |
|--------|-------------|-----|
| Delivery speed | Faster — lower toolchain complexity | Slower — PCF build/packaging overhead |
| CRM on-prem compatibility | Fully supported on CRM 9.x | Requires Dataverse or D365 Online for full PCF support; limited on older on-prem versions |
| React lifecycle integration | Manual management | Native React/web-components lifecycle |
| ALM packaging | Individual RootComponent declarations in solution (same for both) | Same |
| UX integration with Dynamics | Adequate for a full-screen designer hosted in a model-driven app | Richer for embedded field/form controls |

**Why web resource wins for Horizon 1:** PCF offers better UX integration for inline field controls, but the Rule Designer is a full-screen authoring surface, not an embedded field control. For this use case, the UX difference is minimal. The CRM on-prem compatibility advantage of web resources is decisive — PCF support on CRM 9.x on-prem is not on a par with cloud, and on-prem is a first-class deployment target.

**Horizon 2 decision:** after Horizon 1 market validation, re-evaluate PCF for the designer host, particularly if Dataverse cloud becomes the dominant deployment target. An ADR will be required to make the change.

**Status:** BA recommendation — no CEO decision required; this is a technical scoping decision within Phase 0 constraints (Phase 0 Section 9 anticipates both). Architect must confirm in Phase 3.

---

### OQ-10 — Success Metrics and Measurement Instrumentation

**Recommendation:** Five business success metrics, each with a defined measurement approach:

| # | Metric | Target (Horizon 1) | Measurement approach |
|---|--------|--------------------|----------------------|
| SM-1 | **Time-to-first-production-decision** — elapsed time from a BA opening the designer for the first time to having a published, simulated decision live in production | < 1 working day (8 hours), excluding approval wait time | Measured via structured usability study in Phase 5 with real BA participants; also tracked via creation-to-publication timestamps in the Rule Repository post-launch |
| SM-2 | **Developer-free authoring rate** — percentage of rule changes (new or revised decisions) completed with zero developer involvement | Target: ≥ 70% within 6 months of go-live | Tracked via the Rule Repository's created-by identity: changes authored by a user with the Rule Author role only (no Developer/Admin role overlap) |
| SM-3 | **Decision execution latency P95** — 95th-percentile evaluation time for standard decisions in production | ≤ 500ms (see OQ-1) | Measured from execution trace timestamps; execution analytics (Horizon 2) will surface this as a dashboard; interim: trace record query in CRM |
| SM-4 | **Change lead time** — elapsed time from a rule-change request being raised to the new version being Published in production | Target: ≤ 1 working day for a simple change (< 10 condition changes); ≤ 3 working days for a complex change | Tracked via the Rule Repository's version lifecycle timestamps (draft created to published) |
| SM-5 | **Governance compliance rate** — percentage of Published versions that have at least one passing simulation test before publication | Target: 100% (enforced by platform; see FR-008) | Measured by querying the simulation/test-run records linked to each published version; reported in Phase 5 QA and Phase 6 audit |

**Instrumentation plan:**
- Metrics SM-1, SM-2, SM-4, SM-5 are derivable from Rule Repository records in CRM/Dataverse from day one.
- Metric SM-3 requires execution trace timestamps; these are written with every evaluation (FR-034).
- No external analytics infrastructure is required for baseline measurement.
- Execution analytics dashboards (Horizon 2) will surface these metrics in the designer UI.

---

## 11. Acceptance Criteria for Phase 1 Exit

The CEO is approving the following at the Phase 1 gate. Phase 2 (Dependency Research) does not begin until these criteria are met.

| # | Criterion | Pass/Fail indicator |
|---|-----------|---------------------|
| AC-1 | The BRD is complete, internally consistent, and does not contradict any Phase 0 architectural invariant (Appendix B). | Document review by CEO and Architect — no contradictions found. |
| AC-2 | All 10 Open Questions from Phase 0 Appendix C are addressed with either a concrete recommendation or a clearly labelled CEO decision item. | All 10 OQs resolved in Section 10 of this document. |
| AC-3 | Business Objectives BO-1 through BO-7 are accepted as the governing success criteria for this engagement. | CEO confirms the objectives and their measurable criteria in Section 3. |
| AC-4 | The Horizon 1 MVP scope (Section 5.1) is accepted as the delivery scope for Phases 2–5. | CEO confirms scope boundary. |
| AC-5 | The 11 architectural invariants in Section 8.3 are confirmed as non-negotiable constraints for all subsequent phases. | CEO re-affirms Phase 0 invariants for Phase 1 delivery team. |
| AC-6 | The 5 success metrics in Section 10 (OQ-10) are accepted as the measurement framework for this engagement. | CEO ratifies the metrics and targets. |
| AC-7 | The licensing model structure (Section 10, OQ-7) is either ratified by the CEO or a revised structure is specified before Phase 2 begins. | CEO decision recorded. |
| AC-8 | The marketplace commercial model (Section 10, OQ-6) is acknowledged as a Horizon 3 CEO decision and does not block Phase 2. | CEO acknowledges the deferral. |
| AC-9 | Phase 2 (Dependency Research: GoRules JDM Editor validation) is authorised to proceed. | CEO greenlight for Phase 2. |

---

## 12. Success Metrics and KPIs with Measurement Approach

*This section consolidates the OQ-10 resolution for standalone reference.*

### Primary KPIs (Horizon 1)

**KPI-1 — Time-to-first-production-decision**
- Definition: elapsed time for a Business Analyst to author, simulate, and publish their first decision in a new installation.
- Target: < 1 working day.
- Measurement: structured usability study (Phase 5); Rule Repository timestamps post-launch.

**KPI-2 — Developer-free authoring rate**
- Definition: proportion of rule authoring and change actions performed by Business Analyst–role users without developer involvement.
- Target: ≥ 70% of changes within 6 months of go-live.
- Measurement: Rule Repository created-by and modified-by role analysis.

**KPI-3 — Decision execution latency P95**
- Definition: 95th-percentile wall-clock time for a standard decision evaluation inside the CRM sandbox.
- Target: ≤ 500ms.
- Measurement: execution trace timestamps; queryable from CRM immediately on launch.

**KPI-4 — Rule-change lead time**
- Definition: elapsed time from draft creation to publication in production for a changed or new rule.
- Target: ≤ 1 working day (simple); ≤ 3 working days (complex).
- Measurement: Rule Repository version lifecycle timestamps.

**KPI-5 — Governance compliance rate**
- Definition: percentage of Published rule versions with at least one passing simulation test pre-publication.
- Target: 100%.
- Measurement: simulation/test-run records linked to published version records in CRM.

### Leading Indicators (to monitor from Horizon 1 launch)

- Number of unique Business Analyst users actively authoring decisions per month (adoption signal).
- Number of Published decisions in production (breadth signal).
- Number of simulation runs before publication per rule (governance quality signal).
- Rule execution error rate (reliability signal).

### Horizon 2 KPIs (defined here; measurement infrastructure in Horizon 2)

- Decision-change request-to-production lead time trend over 12 months.
- Percentage of regulatory audit queries answerable from execution trace alone (without developer involvement).
- Customer satisfaction score (CSAT) from Business Analyst persona survey.

---

## Glossary

| Term | Definition |
|------|------------|
| BRE | Business Rules Engine — the decisioning module of the EDP. |
| EDP | Enterprise Decision Platform — parent product; one of six Maqsad Low-Code Platform modules. |
| Rule Definition | The versioned JSON artefact authored in the designer and interpreted by the native runtime. |
| JDM Editor | GoRules JSON Decision Model editor, used as a designer surface only — not a runtime. |
| ZEN Runtime | GoRules' execution engine — explicitly excluded from the EDP product at all horizons. |
| Single Runtime | The one native C# evaluator that all entry points invoke. |
| Entry Adapter | A thin, logic-free door (Plugin / Custom Action / Workflow Activity / Custom API / lightweight API) that normalises a caller's request and invokes the Single Runtime. |
| Metadata Spine | The architecture that expresses and binds rules against CRM/Dataverse metadata (display names → logical identifiers). |
| Execution Trace | The append-only record of a single decision evaluation: rule reference, version resolved, timestamp, invoking identity, and decision output. |
| Published Version | An immutable, live rule version resolvable in production. The only version the production runtime may execute. |
| Draft Version | A rule version under active authoring; editable; not executable in production. |
| Decision Table | A rule-authoring format expressing a matrix of conditions (rows) mapped to outputs — the most common business-analyst format. |
| Condition/Expression Tree | A rule-authoring format expressing if-then-else branching logic using business-term selectors. |
| Formula/Calculation Node | A rule-authoring format expressing derived output values via arithmetic, date, and string operations. |
| Simulation | A side-effect-free execution of any rule version (including Draft) against a sample input, used for authoring validation and testing. |
| Horizon 1 | The MVP delivery scope: foundational decisioning (visual authoring, native runtime, metadata service, basic versioning, simulation, Plugin/Custom Action/Custom API entry points). |
| Sandbox Budget | The CRM plugin execution budget: a 2-minute hard ceiling per synchronous invocation. |
| Segregation of Duties | The governance control that prevents an author from approving or publishing their own rule versions. |
| ALM | Application Lifecycle Management — the process of promoting solution versions through Dev → Test → Staging → Production. |
| PCF | Power Apps Component Framework — a component model for embedding React-based controls in Dynamics forms. |

---

## Requirements Traceability Matrix

| User Story / Business Objective | Functional Requirements | NFR | Phase 5 Test Case |
|---------------------------------|------------------------|-----|-------------------|
| BO-1 (reduce policy change lead time) | FR-001–FR-009 (authoring), FR-014–FR-020 (versioning), FR-030–FR-033 (simulation) | NFR-008 (usability) | TC-xxx (pending Phase 5) |
| BO-2 (de-risk decision logic) | FR-015 (version history), FR-031–FR-032 (test cases), FR-034–FR-037 (execution trace), FR-038–FR-041 (security/audit) | NFR-006 (auditability) | TC-xxx (pending Phase 5) |
| BO-3 (displace incumbents) | FR-001–FR-009 (authoring), FR-010–FR-013 (metadata), FR-021–FR-029 (runtime) | NFR-001 (performance), NFR-008 (usability) | TC-xxx (pending Phase 5) |
| BO-4 (protect data trust boundary) | FR-035 (trace field-level security), FR-036 (append-only traces), FR-042–FR-044 (solution deployment) | NFR-005 (security), NFR-011 (data residency) | TC-xxx (pending Phase 5) |
| BO-5 (platform flywheel) | FR-021–FR-029 (runtime, entry points), FR-042–FR-045 (deployment) | NFR-007 (portability) | TC-xxx (pending Phase 5) |
| BO-6 (marketplace foundation) | FR-020 (JSON import/export) | NFR-012 (maintainability, schema) | TC-xxx (pending Phase 5) |
| BO-7 (multi-tenant deployment) | FR-042–FR-045 (deployment) | NFR-002 (scalability), NFR-011 (data residency) | TC-xxx (pending Phase 5) |

---

## Approval

| Role | Name | Decision | Date |
|------|------|----------|------|
| CEO | Pending | PENDING | |
| Requestor / Product Owner | Pending | PENDING | |
| Architect (Phase 3 lead) | Pending | PENDING — for awareness; approves in Phase 3 | |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
```

*BRD is complete. Submitting to CEO for approval before any dependency research, design, or build begins.*
