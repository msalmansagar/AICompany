# Enterprise Decision Platform — Phase 0 Architecture Blueprint

**Engagement ID:** EDP-BRE-001
**Phase:** 0 — Product Vision, Product Architecture & Technical Blueprint
**Module in Focus:** Business Rules Engine (BRE)
**Parent Product:** Maqsad Low-Code Platform
**Document Status:** Authoritative Architecture Reference
**Date:** 2026-07-03

---

## Authority Clause

This document is the **authoritative architecture reference** for the Enterprise Decision Platform and, specifically, its Business Rules Engine module. Every subsequent phase — architecture detail, technical build, QA, audit — must conform to the decisions recorded here.

Where a future phase conflicts with this document, **this document takes precedence**, unless a formally approved **Architecture Decision Record (ADR)** explicitly supersedes a named section. ADRs are the only mechanism permitted to change these decisions. Silent deviation is prohibited.

This is a **Phase 0** document. It defines **what** the product is and **how it is shaped**, not **how it is coded**. It deliberately contains no C#, no React, no CRM entity definitions, no database schema, no plugin logic, no API contracts, no UI wireframes, and no folder structures. Those belong to Phases 1–4.

---

## Table of Contents

1. Product Vision
2. Product Goals
3. Product Scope
4. Core Design Principles
5. Business Objectives
6. Target Users
7. Functional Boundaries
8. Non-Functional Requirements
9. High-Level Architecture
10. Module Architecture
11. Runtime Architecture
12. Deployment Architecture
13. Cloud vs On-Premises Strategy
14. Metadata-Driven Architecture
15. Rule Lifecycle Architecture
16. Versioning Strategy
17. Security Architecture
18. Extensibility Strategy
19. AI Readiness Strategy
20. Integration Strategy
21. Product Roadmap
22. Risks
23. Recommended Development Phases
24. Future Vision

Appendix A — Glossary
Appendix B — Architectural Invariants (Non-Negotiables)
Appendix C — Open Questions for Phase 1

---

## 1. Product Vision

The **Enterprise Decision Platform (EDP)** is a commercial, enterprise-grade decision-management product that lets business users author, govern, simulate, and execute business decisions **without writing code**, natively inside Microsoft Dynamics 365 and Microsoft Dataverse — and, on the same rule definitions, from portals, mobile apps, and future integration surfaces.

It is one of six independent-yet-integrated modules of the Maqsad Low-Code Platform: Form Engine, Process Engine, **Business Rules Engine**, Integration Engine, CMS Engine, and AI Engine. The Business Rules Engine is the decisioning heart of that platform.

The vision is deliberately positioned against a recognised market:

- **Microsoft Power Platform** — for its low-code reach and Dataverse-native footprint.
- **IBM Operational Decision Manager (ODM)** — for its rigorous rule governance and decision-table maturity.
- **Oracle Intelligent Advisor** — for its business-user-first authoring and natural-language decisioning.
- **Pega Decisioning** — for its enterprise decision orchestration and simulation.
- **North52 Business Rules Engine** — as the incumbent Dynamics-native competitor to displace.

EDP's differentiated position: **the governance and decision rigour of ODM/Pega, delivered with the business-user simplicity of Intelligent Advisor, running natively inside the Dynamics/Dataverse trust boundary with zero external runtime infrastructure** — cloud and on-premises alike — while remaining AI-ready and portable to portal and mobile channels.

The central promise to a customer is: *"Your decision logic lives where your data lives, is authored by the people who own the policy, is versioned and audited like source code, and executes identically everywhere — inside a CRM plugin, a Custom API, a portal, or a mobile app."*

---

## 2. Product Goals

**Primary product goals:**

1. **Business-user rule authoring** — non-technical policy owners design decisions visually, never touching schema names or code.
2. **One runtime, many entry points** — a single native execution engine invoked from plugins, custom actions, workflow activities, Custom APIs, portals, and mobile clients, with no duplicated decision logic anywhere.
3. **Zero external infrastructure for core function** — the entire authoring-plus-execution loop is deployable as a standard Dynamics CRM Solution and runs inside CRM/Dataverse with no Docker, Kubernetes, Azure Functions/App Service, Node/Rust servers, external rule server, external runtime, or external rule repository.
4. **Enterprise governance** — versioning, approval workflow, simulation, testing, execution trace, and audit as first-class capabilities, not afterthoughts.
5. **Metadata-driven adaptability** — the platform reads CRM/Dataverse metadata automatically so rules are expressed in business terms and adapt as the model evolves.
6. **Cloud and on-premises parity** — identical authoring and decision semantics across Dynamics CRM On-Premises 9.x, Dynamics 365 Online, and Dataverse.
7. **AI readiness** — an architecture prepared for AI-assisted rule generation, optimisation, and impact analysis without redesign.
8. **Module independence with seamless integration** — the BRE works standalone and also composes cleanly with Form, Process, Integration, CMS, and AI engines.

**Success is measured by** (targets to be ratified in Phase 1 CEO BRD): time-to-author a production decision by a business analyst; percentage of decisions authored with zero developer involvement; execution latency inside the CRM sandbox budget; and rule-change lead time from request to production.

---

## 3. Product Scope

### 3.1 In Scope (Product)

- A **visual Rule Designer** embedded in Dynamics/Dataverse as a web resource / PCF, using the **GoRules JDM Editor as the designer surface only**.
- A **native C# Rule Runtime** that executes rule definitions directly from CRM/Dataverse, independent of any GoRules/ZEN runtime.
- **Rule storage inside CRM/Dataverse** as versioned metadata (rule definitions, versions, bindings, test cases, execution traces).
- **Multiple execution entry points**: Plugin, Custom Action, Workflow Activity (CRM); Plugin, Custom API (Dataverse); with portal and mobile as downstream consumers of the same runtime.
- **Metadata services** that surface entities, fields, relationships, option sets, and lookups as searchable, business-friendly selectors (Advanced-Find-like experience).
- **Governance capabilities**: versioning, cloning, templates, approval workflow, simulation, testing, execution trace/visual debug, execution analytics, import/export (JSON, Excel).
- **Security model** aligned to CRM/Dataverse identity, roles, and audit.
- **AI-ready extension points** for assisted authoring and optimisation.
- **Integration contracts** enabling Form, Process, Integration, CMS, and AI engines to invoke decisions.

### 3.2 Out of Scope (Phase 0 and, where noted, product)

- **Out of Phase 0 (deferred to later phases):** any implementation — code, schema, plugins, APIs, wireframes, folder structures.
- **Out of product (deliberate non-goals):** replacing Dynamics workflow/Power Automate as a process orchestrator (that is the Process Engine's job); acting as a general-purpose ETL tool (Integration Engine's job); being a standalone SaaS decision service divorced from the Dynamics data plane. EDP is decisioning, expressed over the customer's own data model.
- **Not a dependency on GoRules ZEN runtime** for execution — explicitly excluded.

### 3.3 Scope Boundaries with Sibling Modules

The BRE **owns decision logic**. It does **not** own process sequencing (Process Engine), data capture UI (Form Engine), external system connectivity (Integration Engine), content (CMS Engine), or model inference (AI Engine). Each sibling calls the BRE; the BRE calls none of them synchronously as a hard dependency. This keeps the BRE independently deployable and testable.

---

## 4. Core Design Principles

The platform is built on twelve enduring principles. Every later design decision is judged against them.

| # | Principle | Architectural meaning |
|---|-----------|----------------------|
| 1 | **Metadata-Driven** | Rules are expressed against CRM metadata, not hardcoded schema. The model can evolve without rewriting rules. |
| 2 | **Configuration-Driven** | Behaviour is data, not code. Changing a decision is a configuration act, not a deployment. |
| 3 | **Low-Code** | Business users author decisions visually; developers extend, they do not author routine policy. |
| 4 | **Extensible** | New operators, functions, data sources, and channels are added through defined extension points, never by editing the core. (Open/Closed at product scale.) |
| 5 | **Versioned** | Every rule definition is immutably versioned; execution always resolves a specific version. |
| 6 | **Secure** | Authoring and execution honour CRM/Dataverse identity, role-based access, field-level security, and audit. |
| 7 | **Reusable** | Rules, sub-decisions, templates, and functions are composable and shareable across solutions and channels. |
| 8 | **Enterprise-Grade** | Governance, approval, traceability, analytics, and SLAs are built in, not bolted on. |
| 9 | **Cloud-Ready** | First-class on Dataverse and Dynamics 365 Online, exposing Custom APIs. |
| 10 | **On-Premises-Compatible** | Fully functional on Dynamics CRM On-Premises 9.x with no cloud dependency for core function. |
| 11 | **AI-Ready** | Authoring and analysis surfaces are structured so AI can generate, explain, and optimise rules. |
| 12 | **Module Independent + Integrated** | Each engine stands alone and composes cleanly. No hidden coupling. |

**Governing meta-principle — Single Runtime Authority:** there is exactly one place where a decision is evaluated. All entry points funnel to it. Duplicate execution logic is an architectural defect, not a variation.

---

## 5. Business Objectives

1. **Reduce cost and lead time of policy change.** Move decision changes from developer backlog to business self-service, cutting change lead time from weeks to hours.
2. **De-risk decision logic.** Replace opaque, code-buried business rules with governed, versioned, auditable, testable decisions.
3. **Displace incumbents.** Offer a credible, Dynamics-native alternative to North52 with stronger governance and an AI trajectory, and a lower-TCO alternative to ODM/Pega for Dynamics-centric customers.
4. **Protect the data trust boundary.** Keep decisions and data co-located inside the customer's CRM/Dataverse tenancy, easing data-residency, sovereignty, and compliance concerns — a decisive advantage in regulated sectors.
5. **Create a platform flywheel.** Every module (Form, Process, Integration, CMS, AI) that consumes the BRE increases the platform's stickiness and the BRE's reuse value.
6. **Enable a rule marketplace.** Establish templates and reusable decision assets as a future revenue and ecosystem channel.
7. **Support multi-tenant, multi-industry deployment** with no hardcoded business rules, thresholds, or GUIDs — everything is metadata and configuration.

---

## 6. Target Users

| Persona | Role | What they do in EDP | Skill assumption |
|---------|------|---------------------|------------------|
| **Business Analyst / Policy Owner** | Primary author | Designs, simulates, tests, and submits decisions for approval using searchable business terms. | No coding; understands the business policy. |
| **Rule Approver / Governance Officer** | Approver | Reviews, approves/rejects rule versions; owns the promotion gate. | Business + compliance literacy. |
| **CRM Administrator / Solution Owner** | Deployer | Installs the solution, configures security, manages environments and versions. | Dynamics admin skills. |
| **Developer / Maker** | Extender | Builds custom operators/functions, wires new channels, embeds decisions in plugins/APIs. | Pro-code (.NET / TS). |
| **System Integrator / ISV** | Packager | Ships industry rule templates and marketplace assets. | Platform expertise. |
| **Auditor / Compliance** | Oversight | Consumes execution trace, version history, and audit logs. | Read-only governance. |
| **AI/Data Scientist (future)** | Optimiser | Uses AI-assisted generation, impact analysis, and optimisation. | Advanced/AI. |
| **Portal & Mobile end-users (indirect)** | Consumers | Experience decisions through downstream apps; never see the engine. | None. |

The **north-star persona is the Business Analyst**. The product succeeds when a BA authors, tests, and ships a production decision without a developer.

---

## 7. Functional Boundaries

Defined as capability boundaries, not features.

### 7.1 What the Business Rules Engine DOES
- Authors decisions visually (decision tables, expressions, formulas, decision graphs).
- Stores decisions as versioned metadata inside CRM/Dataverse.
- Resolves and executes a specific rule version natively in C# on demand.
- Reads CRM/Dataverse data as decision inputs and returns decision outputs.
- Provides simulation, testing, trace, and analytics for decisions.
- Exposes decisions to every supported entry point through one runtime.

### 7.2 What the Business Rules Engine DOES NOT DO
- It does **not** orchestrate long-running processes (Process Engine).
- It does **not** render data-entry UI (Form Engine).
- It does **not** move data between external systems (Integration Engine).
- It does **not** execute the GoRules ZEN runtime.
- It does **not** require or spin up external servers or runtimes.
- It does **not** persist rules outside CRM/Dataverse.

### 7.3 Boundary Contracts
- **Inbound:** a decision request (context + input payload + rule reference/version).
- **Outbound:** a decision result (outputs + trace reference + version resolved).
- **Metadata boundary:** the engine consumes CRM metadata read-only for authoring; it never mutates schema.
- **Governance boundary:** promotion between draft → approved → published is a controlled state transition, not a free edit.

These contracts are the stable surface future phases must honour.

---

## 8. Non-Functional Requirements

NFR targets are stated as architectural intents; precise SLAs are ratified in Phase 1.

| Category | Requirement | Rationale / Constraint |
|----------|-------------|------------------------|
| **Performance** | Synchronous decision evaluation must complete well within the CRM plugin sandbox execution budget (2-minute hard ceiling; target sub-second for typical decisions). | CRM plugins must exit within 2 minutes; decisioning should be interactive. |
| **Scalability** | Runtime is stateless per evaluation; scales with the CRM/Dataverse platform's own scaling. Rule complexity bounded and analysable. | No external scaling infrastructure permitted. |
| **Availability** | Inherits the availability of the host CRM/Dataverse platform; no independent availability story required for core function. | Zero external infra. |
| **Latency budget** | Rule resolution + evaluation + trace capture must fit inside interactive form/plugin timeframes. | UX and sandbox limits. |
| **Security** | Honour CRM identity, security roles, field-level security, and audit; no secrets in rules or logs. | Enterprise + platform rules. |
| **Auditability** | Every published version, approval, and execution is traceable. Audit records are append-only. | Compliance. |
| **Reliability** | Deterministic evaluation: identical inputs + version ⇒ identical outputs. Explicit error results, never silent null. | Decision integrity. |
| **Portability** | Identical semantics across On-Prem 9.x, D365 Online, Dataverse. | Cloud/on-prem parity. |
| **Maintainability** | Versioned, testable, self-documenting rules; single runtime to maintain. | TCO. |
| **Usability** | Business users author without schema knowledge; Advanced-Find-like selection. | North-star persona. |
| **Extensibility** | New operators/functions/channels via extension points, no core edits. | Open/Closed. |
| **Observability** | Execution trace, analytics, and structured runtime diagnostics (no console logging in shipped code). | Governance + platform rules. |
| **Localisation** | Multi-language authoring labels and messages. | Enterprise/global. |
| **Data residency** | Decisions and traces remain within the customer's CRM/Dataverse tenancy. | Sovereignty advantage. |
| **Determinism vs. AI** | AI features are advisory at authoring time; the executed runtime remains deterministic. | Trust and audit. |

**Hard architectural NFR constraints (non-negotiable):** no external runtime; deployable as a standard CRM Solution; one runtime; native C# execution; rule storage inside CRM/Dataverse.

---

## 9. High-Level Architecture

The platform is organised into five conceptual planes. This is a logical model, not a deployment diagram.

```
┌──────────────────────────────────────────────────────────────────────┐
│  EXPERIENCE PLANE  (authoring & consumption surfaces)                  │
│  ┌───────────────────────────┐   ┌─────────────────────────────────┐  │
│  │  Rule Designer            │   │  Consumption Surfaces           │  │
│  │  (GoRules JDM Editor as   │   │  CRM forms · Portals · Mobile · │  │
│  │   designer, in a web      │   │  Sibling engines (Form/Process/ │  │
│  │   resource / PCF)         │   │  Integration/CMS/AI)            │  │
│  └───────────────────────────┘   └─────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│  ENTRY PLANE  (one runtime, many doors)                                │
│  Plugin · Custom Action · Workflow Activity   (CRM)                    │
│  Plugin · Custom API                          (Dataverse)             │
│  On-Prem lightweight API → Custom Action   |  Cloud → Custom API      │
├──────────────────────────────────────────────────────────────────────┤
│  RUNTIME PLANE  (the single native C# Rule Runtime)                    │
│  Rule Resolver → Compiler/Interpreter → Evaluator → Trace Writer      │
│  (deterministic · stateless per call · GoRules/ZEN-independent)       │
├──────────────────────────────────────────────────────────────────────┤
│  METADATA & DATA PLANE  (inside CRM / Dataverse)                       │
│  Rule Definitions (versioned) · Bindings · Test Cases · Traces ·      │
│  CRM Metadata (entities, fields, relationships, option sets, lookups) │
├──────────────────────────────────────────────────────────────────────┤
│  GOVERNANCE & INTELLIGENCE PLANE  (cross-cutting)                      │
│  Versioning · Approval · Simulation · Analytics · Security · Audit ·  │
│  AI Assist (advisory) · Import/Export · Metadata Sync                 │
└──────────────────────────────────────────────────────────────────────┘
```

**Reading the model top-to-bottom:**

- The **Experience Plane** is where humans and sibling engines meet the product. Authoring uses the **GoRules JDM Editor purely as a designer**; it emits JSON. Consumption surfaces never talk to GoRules — they talk to the runtime.
- The **Entry Plane** is the set of doors into the single runtime. Every door is a thin adapter that normalises its request into the same runtime invocation. **No door contains decision logic.**
- The **Runtime Plane** is the one and only decision evaluator — native C#, deterministic, stateless per call, and completely independent of GoRules/ZEN. It resolves a rule version, evaluates it against inputs, and writes a trace.
- The **Metadata & Data Plane** lives entirely inside CRM/Dataverse: versioned rule definitions and their governance artefacts, plus the customer's own CRM metadata that rules are expressed against.
- The **Governance & Intelligence Plane** is cross-cutting: it wraps authoring and execution with version control, approvals, simulation, analytics, security, audit, and (advisory) AI.

**Two architectural spines hold this together:**
1. **The Single Runtime Spine** — every entry point resolves to one evaluator. This is the product's integrity guarantee.
2. **The Metadata Spine** — rules are authored, stored, and executed against live CRM metadata, so decisions speak the business's language and survive model change.

---

## 10. Module Architecture

The EDP is six modules. This document details the **Business Rules Engine**; siblings are described only at their integration surface.

### 10.1 Business Rules Engine — Internal Composition (logical components)

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| **Rule Designer Host** | Embeds the GoRules JDM Editor as the visual authoring surface; captures Save; hands JSON to storage. | Designer only; not runtime. |
| **Metadata Service** | Reads CRM metadata; presents searchable entities/fields/relationships/option-sets/lookups; keeps authoring in business terms. | Read-only against schema. |
| **Rule Repository** | Stores rule definitions, versions, bindings, templates, and test cases as CRM/Dataverse records. | The only rule store. |
| **Rule Resolver** | Given a rule reference + context, resolves the exact version to execute. | Central to versioning. |
| **Rule Runtime (Evaluator)** | The single native C# engine: compiles/interprets a rule definition and evaluates it deterministically. | GoRules/ZEN-independent. |
| **Expression & Function Library** | Operators, formulas, and functions available to rules; extensible. | Open/Closed extension point. |
| **Trace Writer** | Emits execution trace for debugging, audit, and analytics. | Append-only trace records. |
| **Simulation & Test Harness** | Runs rules against sample/historical inputs without side effects; supports test cases. | Command-query separated. |
| **Governance Controller** | Manages lifecycle state transitions (draft→approved→published) and approval workflow. | Enforces gates. |
| **Analytics Aggregator** | Summarises execution outcomes, coverage, and performance. | Reads traces. |
| **Import/Export Service** | JSON and Excel interchange; template distribution. | Marketplace enabler. |
| **AI Assist Adapter (future)** | Advisory generation/optimisation/impact analysis over rule metadata. | Never in the deterministic execution path. |

### 10.2 Module Independence & Integration Model

- **Independence:** the BRE has no hard runtime dependency on any sibling. It can be installed and used alone.
- **Integration:** siblings **consume** the BRE through the Entry Plane. The BRE exposes decisions; it does not reach into siblings.
- **Composition pattern:** Form Engine calls a decision to compute visibility/validation; Process Engine calls a decision to branch; Integration Engine calls a decision to transform/route; CMS Engine calls a decision to select content; AI Engine both consumes decisions and (advisorily) helps author them.
- **Contract stability:** the inbound/outbound decision contract (Section 7.3) is the shared, versioned interface across all modules.

### 10.3 Designer/Runtime Separation (critical invariant)

The GoRules JDM Editor is the **authoring UX**. Its output is a **JSON rule definition** stored in CRM/Dataverse. The **native C# runtime interprets that definition**. There is **no runtime coupling to GoRules or ZEN**. This separation means: the designer can be swapped, upgraded, or supplemented (e.g., decision-table editor, formula builder) without touching the runtime, and the runtime can evolve without touching the designer. The JSON definition is the contract between them and must be **versioned and schema-governed**.

---

## 11. Runtime Architecture

The runtime is the product's integrity core. Its design is governed by five rules.

### 11.1 The Five Runtime Rules
1. **One Runtime.** Exactly one evaluator exists. Every entry point calls it. No entry point re-implements decision logic.
2. **Native C#.** Execution is native managed code running inside the CRM/Dataverse sandbox — no external process, no ZEN, no interpreter server.
3. **Deterministic.** Same inputs + same resolved version ⇒ same outputs, every time, everywhere.
4. **Stateless per evaluation.** No mutable shared state between calls; concurrency-safe by construction.
5. **Sandbox-bounded.** Every evaluation completes within the plugin sandbox budget; long work is out of scope for synchronous decisioning and must be handed off (Process Engine / async).

### 11.2 Evaluation Pipeline (logical)
```
Request → Resolve version → Load definition → Bind inputs (metadata-aware)
        → Compile/interpret → Evaluate deterministically
        → Produce outputs → Write trace → Return result
```
Each stage is a single-responsibility component. Errors are explicit, typed results — never a silent null and never a swallowed exception.

### 11.3 Entry-Point Adapter Pattern
Each door (Plugin, Custom Action, Workflow Activity, Custom API, on-prem lightweight API) is a **thin adapter** that:
- Authenticates/authorises via the platform's identity,
- Normalises its native request into the standard decision request,
- Invokes the single runtime,
- Maps the standard decision result back to its native response.

Adapters contain **no branching business logic**. This is what makes "one runtime, many doors" real rather than aspirational.

### 11.4 On-Premises vs. Cloud Invocation
- **Cloud (Dataverse / D365 Online):** external and portal/mobile callers invoke a **Custom API**, which adapts to the runtime.
- **On-Premises (CRM 9.x):** external callers invoke a **lightweight API that internally calls a CRM Custom Action**, which adapts to the same runtime.
- **Both paths converge** on the identical native C# evaluator. There is no cloud-only or on-prem-only decision path.

### 11.5 Determinism vs. AI Boundary
AI participates at **authoring and analysis** time (suggest, explain, optimise, assess impact). The **executed runtime is pure and deterministic**. AI never injects non-deterministic behaviour into evaluation. This preserves auditability and trust — a decision can always be explained by its version and inputs alone.

---

## 12. Deployment Architecture

### 12.1 Deployment Unit
The entire platform ships as a **standard Dynamics CRM Solution** (managed for customers, unmanaged for development), containing:
- The Rule Designer web resource(s) / PCF,
- The native runtime assemblies (plugins, custom actions, workflow activities, custom APIs),
- The metadata definitions for rule storage and governance artefacts,
- Security roles and configuration.

**No component is deployed outside the CRM Solution for core functionality.** No container, no cloud service, no external host is required to author or execute rules.

### 12.2 Deployment Constraints (hard)
The following must **never** be introduced as a requirement for core function: Docker, Kubernetes, Azure Functions, Azure App Service, Node.js server, Rust server, separate rule server, external runtime, external rule repository. Any proposal to add one requires an ADR and, per the customer's constraint, would violate a non-negotiable — so such an ADR must be exceptional and optional-only (see 12.4).

### 12.3 Environments & ALM
Standard Dynamics ALM applies: Dev → Test → Staging → Production, promoted via solution import/export (and PAC CLI / solution packaging in cloud). Web-resource root components are declared individually in the solution manifest (folder wildcards are not reliable). Rule **content** (definitions, versions) travels as configuration data via the platform's data-migration mechanisms, distinct from the solution's structural components.

### 12.4 Optional, Non-Core Extensions
Anything beyond core — e.g., an external analytics warehouse, an AI generation service, or a marketplace backend — is **optional, additive, and never on the core authoring/execution path**. If ever introduced, it is an opt-in module, gated by an ADR, and the platform must remain fully functional without it.

---

## 13. Cloud vs On-Premises Strategy

A single codebase and single runtime serve both worlds; the difference is confined to entry adapters and platform APIs.

| Concern | Cloud (Dataverse / D365 Online) | On-Premises (CRM 9.x) |
|---------|----------------------------------|------------------------|
| External invocation | **Custom API** | **Lightweight API → Custom Action** |
| In-platform invocation | Plugin · Custom API | Plugin · Custom Action · Workflow Activity |
| Metadata access | Web API / platform metadata services | Organization Service metadata |
| Runtime | **Same native C# evaluator** | **Same native C# evaluator** |
| Rule storage | Dataverse tables | CRM entities |
| Designer | Web resource / PCF | Web resource / PCF |
| Security | Dataverse security + Entra ID | CRM security + AD/ADFS |

**Strategy principles:**
1. **Runtime parity is absolute** — semantics are identical; only the door differs.
2. **Isolate platform differences in adapters** — differences live in thin, testable adapter layers, never in decision logic.
3. **On-prem is a first-class citizen**, not a degraded mode — required by the customer's target platforms and a competitive differentiator against cloud-only rivals.
4. **No cloud dependency for on-prem core** — an air-gapped on-prem deployment must author and execute rules with no internet.
5. **AI/marketplace features degrade gracefully** — where cloud-only services power AI or marketplace, on-prem simply operates without them; core decisioning is unaffected.

---

## 14. Metadata-Driven Architecture

This is the second architectural spine and the source of the business-user promise.

### 14.1 Principle
Rules are expressed against **CRM/Dataverse metadata**, not against literal schema strings the author must know. The platform **reads metadata automatically** and presents it as searchable, human-friendly selectors — the Advanced-Find experience business users already trust.

### 14.2 What the Metadata Service Surfaces
- **Entities** (by display name, searchable),
- **Fields/attributes** (by display name and type),
- **Relationships** (1:N, N:1, N:N) for traversal,
- **Option sets / choices** (by label),
- **Lookups** (entity-aware, respecting target entity),
- **Localised labels** for multi-language authoring.

The author picks *"Loan → Applicant → Annual Income"*; the platform binds it to the correct logical names behind the scenes. **Authors never type or memorise schema names.**

### 14.3 Metadata Synchronisation
- Metadata is read **live or via a governed cache** so rules reflect the current model.
- A **CRM Metadata Synchronisation** capability detects model changes and flags rules whose bindings are affected (input to Impact Analysis, Section 19/21).
- Bindings store **stable references** (logical identifiers) so display-name changes don't break rules, while display remains friendly.

### 14.4 Why This Matters Architecturally
- **Adaptability:** the model can evolve; rules bound to stable identifiers survive.
- **Portability:** the same rule authored against a portable metadata model runs across environments.
- **Governance:** metadata-aware bindings enable dependency and impact analysis — you can answer *"which rules touch this field?"*.
- **AI-readiness:** structured metadata bindings are exactly what AI needs to generate and reason about rules.

---

## 15. Rule Lifecycle Architecture

A rule moves through a **governed state machine**. Free editing is confined to draft; everything past approval is controlled.

```
   DRAFT ──submit──▶ IN REVIEW ──approve──▶ APPROVED ──publish──▶ PUBLISHED
     ▲                   │  reject                                   │
     └───────────────────┘                                           │
                                                          supersede  ▼
   (new draft version) ◀──────────────────────────────  RETIRED / ARCHIVED
```

| State | Meaning | Who acts | Editable? |
|-------|---------|----------|-----------|
| **Draft** | Authoring in progress | Business Analyst | Yes |
| **In Review** | Submitted for approval; simulated/tested | Approver | No (comment/return) |
| **Approved** | Passed governance gate, not yet live | Approver | No |
| **Published** | Live; resolvable by the runtime | System | No (immutable) |
| **Retired/Archived** | Superseded or withdrawn | Admin/Approver | No (historical) |

**Lifecycle rules:**
1. **Only Published versions execute** in production (simulation may run drafts in a sandboxed, side-effect-free mode).
2. **Published versions are immutable** — a change means a new version, never an in-place edit.
3. **Promotion is a controlled transition**, gated by approval and (recommended) by passing tests/simulation.
4. **Every transition is audited** — who, when, from/to state, with justification.
5. **Rollback = re-publish a prior version**, not a destructive edit.
6. **Simulation and testing are lifecycle stages**, not optional extras — governance can require green tests before approval.

This lifecycle is what elevates EDP from a rule tool to a governed decision platform.

---

## 16. Versioning Strategy

Versioning is foundational, not additive — it underpins determinism, audit, rollback, and safe change.

### 16.1 Principles
1. **Immutable published versions.** Once published, a version is frozen. Corrections create a new version.
2. **Explicit version resolution.** Every execution resolves a **specific version** — either pinned by the caller or resolved to the current published version by policy. Determinism requires knowing exactly which version ran.
3. **Full version history.** Every version is retained with authorship, approval, and change metadata.
4. **Semantic version metadata.** Versions carry meaningful change classification (e.g., editorial vs. behaviour-changing) to inform impact analysis and approval rigour.
5. **Binding-stable.** Metadata bindings use stable identifiers so versions survive display-name changes.
6. **Traceable to execution.** Each execution trace records the exact version resolved, closing the loop between "what ran" and "what was authored."

### 16.2 Resolution Policy (architectural intent)
- **Default:** resolve to the latest **Published** version at call time.
- **Pinned:** callers (or governed processes) may pin a specific version for reproducibility (e.g., a long-running case must keep evaluating under the policy that was current when it began).
- **The resolver is the single authority** for version selection; adapters never choose versions ad hoc.

### 16.3 Coexistence & Migration
- Multiple published versions may coexist (pinned consumers + default consumers).
- Retiring a version is a governed transition; the platform warns if active consumers still pin it.
- Version diffing (a roadmap capability) supports review and impact analysis.

---

## 17. Security Architecture

Security is inherited from and aligned to the host platform — never a parallel, weaker model.

### 17.1 Identity & Authentication
- Authoring and execution use the **platform's identity** — Entra ID (cloud) / AD/ADFS (on-prem). EDP introduces **no separate identity store**.
- Every entry-point adapter authenticates through the platform before invoking the runtime.

### 17.2 Authorisation
- **Role-based access** via CRM/Dataverse security roles governs who may author, submit, approve, publish, and administer rules.
- **Segregation of duties:** authors cannot approve their own rules where governance requires it (approval workflow enforces this).
- **Field-level security** is honoured: a rule cannot expose or use data the executing identity cannot access. The runtime evaluates within the caller's security context where the platform enforces it.

### 17.3 Data Protection
- **No secrets, tokens, or credentials** in rule definitions, traces, or logs.
- **No sensitive data leakage** through traces — trace capture respects field-level security and data-classification.
- **Decisions and traces stay in-tenant** (data-residency advantage).

### 17.4 Audit
- **Append-only audit** of version transitions, approvals, publishes, and administrative actions.
- **Execution trace** provides decision-level accountability (version, inputs summary, outputs, outcome).
- Audit records follow the enterprise rule: append-only, no UPDATE/DELETE.

### 17.5 Runtime Safety
- The native runtime executes within the **sandbox trust boundary**; it does not call out to arbitrary external endpoints as part of core evaluation.
- Extensions (custom functions) are governed and reviewed — extensibility never becomes an injection vector.
- **No dynamic code evaluation of untrusted strings**; rule definitions are interpreted by the governed runtime, not executed as arbitrary code.

### 17.6 Multi-Tenancy & Configuration Hygiene
- **No hardcoded GUIDs, thresholds, rates, or business rules** — all are metadata/configuration.
- Every governance record carries created/modified by/on stamps.

---

## 18. Extensibility Strategy

Extensibility is delivered through **defined extension points**, honouring Open/Closed: extend by adding, never by editing the core.

| Extension Point | What it enables | Governance |
|-----------------|-----------------|------------|
| **Custom Operators** | New comparison/logic operators for rules. | Registered, reviewed, versioned. |
| **Custom Functions** | Reusable formula functions (business calculations). | Sandboxed, tested, catalogued. |
| **Custom Data Providers** | Additional input sources beyond direct CRM fields (still within trust boundary). | Contract-bound, secured. |
| **Custom Entry Adapters** | New channels/doors into the single runtime. | Must be logic-free adapters. |
| **Designer Extensions** | Additional authoring surfaces (decision-table editor, formula builder) emitting the governed JSON. | Conform to the rule-definition schema. |
| **AI Assist Providers** | Pluggable advisory generation/optimisation. | Advisory only; never in execution path. |
| **Template Packs** | Industry rule templates (marketplace). | Signed, versioned, importable. |

**Extensibility invariants:**
1. Extensions **register**; they never fork the runtime.
2. New entry points are **adapters**, never new evaluators — the single-runtime rule holds.
3. The **rule-definition JSON schema is the contract** every designer extension must honour.
4. Extensions are **secured and reviewed** — extensibility does not weaken the security model.
5. Extensions are **optional** — the core works without any of them.

---

## 19. AI Readiness Strategy

AI is a **readiness posture**, layered so it can arrive without redesign, and always **advisory to a deterministic core**.

### 19.1 AI Roles (roadmap-aligned)
- **AI-Assisted Rule Generation:** describe a policy in natural language; AI proposes a rule definition (author reviews, edits, approves).
- **Rule Explanation:** AI narrates what a rule does in business language (aids review and audit).
- **Rule Optimisation:** AI suggests simplifications/consolidations of decision logic.
- **Impact Analysis & Dependencies:** AI reasons over metadata bindings and version history to predict change impact.
- **Rule Documentation:** AI generates and maintains human-readable documentation from definitions.

### 19.2 Architectural Enablers Already Built In
- **Structured, metadata-bound rule definitions** — machine-readable input/output for AI.
- **Version history + execution traces** — training/grounding signal for optimisation and impact analysis.
- **Designer/runtime separation** — AI can generate the JSON definition without touching the runtime.
- **Advisory boundary** — AI outputs are proposals entering the normal draft→approve lifecycle.

### 19.3 Non-Negotiable AI Boundaries
1. **Determinism preserved:** AI never runs inside the evaluation path. Executed decisions are explainable by version + inputs alone.
2. **Human-in-the-loop:** AI-generated rules pass the same governance gates as human-authored ones.
3. **On-prem graceful degradation:** where AI depends on cloud services, on-prem operates without it; core decisioning is unaffected.
4. **Data governance:** AI features honour data residency and never exfiltrate sensitive tenant data without explicit, governed consent.

This makes AI a **force multiplier on authoring and governance**, not a risk to execution integrity.

---

## 20. Integration Strategy

Two integration dimensions: **within the Maqsad platform** (sibling engines) and **with the outside world** (portals, mobile, external systems).

### 20.1 Intra-Platform Integration (sibling engines)
- **Contract:** the standard decision request/result (Section 7.3) is the shared, versioned interface.
- **Direction:** siblings **call** the BRE; the BRE does not depend on siblings at runtime.
- **Patterns:**
  - *Form Engine* → decisions for dynamic visibility, validation, defaulting.
  - *Process Engine* → decisions for branching, eligibility, routing.
  - *Integration Engine* → decisions for transformation, enrichment, routing.
  - *CMS Engine* → decisions for content selection/personalisation.
  - *AI Engine* → consumes decisions and provides advisory authoring assistance.
- **Loose coupling:** integration is through the decision contract and platform events, not shared internals.

### 20.2 External Integration
- **Cloud:** external and portal/mobile clients invoke decisions via **Custom API**.
- **On-Prem:** via a **lightweight API that calls a Custom Action**.
- **Portal & mobile** are first-class **consumers** of the same runtime — decision logic is authored once and reused across channels.
- **Eventing:** decision outcomes can raise platform events for downstream orchestration (owned by Process/Integration engines, not the BRE).

### 20.3 Interchange
- **Import/Export** of rules in **JSON** (fidelity) and **Excel** (business-friendly decision tables) enables migration, backup, and marketplace distribution.
- **Metadata sync** keeps imported rules bound correctly to the target environment's model.

### 20.4 Integration Invariants
1. One decision contract across all consumers.
2. One runtime behind every integration door.
3. No sibling engine becomes a hard runtime dependency of the BRE.
4. External access is always mediated by a governed entry adapter (Custom API / Custom Action), never by direct rule-store access.

---

## 21. Product Roadmap

A capability roadmap in four horizons. Horizons are capability-sequenced, not date-bound; dates are set in Phase 1 planning.

### Horizon 1 — Foundational Decisioning (MVP)
- Visual Rule Designer (GoRules JDM Editor embedded) with Save-to-CRM.
- Native C# runtime with core entry points (Plugin, Custom Action, Custom API).
- Metadata Service with searchable entities/fields/option-sets/lookups.
- Rule storage, basic versioning, and execution trace.
- Decision tables and expression/formula authoring.
- Simulation and basic testing.

### Horizon 2 — Enterprise Governance
- Full lifecycle state machine + approval workflow.
- Rule versioning (pinning, diffing), cloning, templates.
- Visual debugger and richer execution trace.
- Execution analytics.
- Import/Export (JSON + Excel).
- Workflow Activity entry point; on-prem lightweight API path hardened.
- Multi-language authoring; theme support.

### Horizon 3 — Intelligence & Reuse
- AI-assisted rule generation, explanation, and documentation.
- Rule optimisation, impact analysis, and dependency mapping.
- CRM Metadata Synchronisation with change-impact flags.
- Rule Marketplace (template packs, signing, distribution).
- Advanced simulation (batch/historical replay).

### Horizon 4 — Platform Decisioning Fabric
- Deep integration with Process, Form, Integration, CMS, AI engines.
- Cross-module decision reuse and shared decision catalogues.
- Advanced analytics and decision performance optimisation.
- Enterprise-scale governance (portfolios, decision domains, federated ownership).

---

## 22. Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R-1 | **Sandbox performance ceiling** — complex rules risk breaching the plugin execution budget. | High | Medium | Bound rule complexity; compile/cache definitions; measure against the 2-min ceiling from day one; async handoff for heavy work. |
| R-2 | **GoRules designer/runtime coupling creep** — accidental dependence on ZEN semantics. | High | Medium | Enforce the JSON-schema contract; independent runtime conformance tests; explicit "no ZEN" gate in code review. |
| R-3 | **Metadata drift** — model changes silently break rule bindings. | High | Medium | Stable-identifier bindings; metadata sync with impact flags; version-level dependency analysis. |
| R-4 | **On-prem/cloud divergence** — behaviour differs across platforms. | High | Medium | One runtime; isolate differences in adapters; shared conformance test suite run on both. |
| R-5 | **Governance bypass** — unpublished/edited rules reach production. | High | Low | Immutable published versions; only Published resolves in prod; audited transitions. |
| R-6 | **Business-user usability shortfall** — authors still need schema knowledge. | High | Medium | Advanced-Find-grade metadata UX; usability testing with real BAs as a Phase 5 gate. |
| R-7 | **Determinism erosion via AI** — AI leaks into execution. | High | Low | Hard boundary: AI advisory-only; deterministic runtime; audit proves version+inputs suffice. |
| R-8 | **Security regression** — rules expose data beyond caller's rights. | High | Low | Honour field-level security in evaluation and trace; security review (Phase 6). |
| R-9 | **Scope creep into sibling domains** — BRE starts orchestrating/ETL. | Medium | Medium | Enforce functional boundaries (Section 7); ADR required to cross them. |
| R-10 | **Versioning complexity** — pinned vs. default resolution confuses consumers. | Medium | Medium | Single resolver authority; clear default policy; explicit pinning API; documentation. |
| R-11 | **Deployment constraint pressure** — future feature "needs" external infra. | Medium | Medium | Non-negotiable gate; optional/additive only via exceptional ADR; core must always work without it. |
| R-12 | **Marketplace quality/security** — third-party templates carry risk. | Medium | Low | Signing, review, sandboxed functions, governed import. |
| R-13 | **Competitive parity gap** vs. North52/ODM on niche features. | Medium | Medium | Roadmap prioritisation; differentiate on governance + AI + zero-infra + data residency. |
| R-14 | **Localization/theming debt** deferred too long. | Low | Medium | Bake multi-language into authoring metadata from Horizon 1/2, not retrofit. |

---

## 23. Recommended Development Phases

Aligned to the Maqsad engagement pipeline (BA → CEO BRD → GitHub research → Architecture → Build → Review → QA → Audit → CEO), applied per horizon.

| Phase | Focus | Key gate |
|-------|-------|----------|
| **Phase 0 (this document)** | Product vision, architecture, blueprint. | This document ratified as authoritative. |
| **Phase 1 — BRD & CEO Approval** | Business requirements, success metrics, SLAs, prioritised MVP scope (Horizon 1). | CEO BRD approval — entry gate. |
| **Phase 2 — Dependency & GitHub Research** | Validate GoRules JDM Editor adoption; evaluate any 1000+★ libraries for designer/interchange; record decisions. | dependencies.md with adoption rationale. |
| **Phase 3 — Detailed Architecture** | Component/interface design, rule-definition JSON schema, entry-adapter contracts, storage model, security model — as ADRs conforming to Phase 0. | Architecture sign-off; ADRs logged. |
| **Phase 4 — Technical Build** | Implement runtime, adapters, designer host, metadata service, storage, governance — per clean-code standards. | Working, tested increments per horizon. |
| **Phase 5 — QA** | Conformance tests (cloud + on-prem parity), performance vs. sandbox budget, usability with real BAs, security tests. | Green conformance + usability gate. |
| **Phase 6 — Audit** | Security, compliance, data-residency, governance, audit-trail validation. | Audit pass. |
| **Phase 7 — CEO Final Decision** | Go/no-go, conditions, release blockers. | Approved / Approved-with-conditions. |

**Sequencing note:** deliver Horizon 1 end-to-end (single decision authored, versioned, executed via one runtime across cloud and on-prem, with trace) before broadening. Prove the two spines — Single Runtime and Metadata — first; everything else compounds on them.

---

## 24. Future Vision

The long-term ambition is for the Enterprise Decision Platform to become the **decisioning fabric of the Maqsad Low-Code Platform** — the single place where every module and channel asks "what should happen here?" and receives a governed, versioned, explainable answer.

**Five-point future vision:**

1. **Decisioning everywhere, authored once.** Any form, process, integration, portal, or mobile app in the customer's estate consults the same governed decisions, expressed in business language over the customer's own model.
2. **AI-native authoring, deterministic execution.** Business users describe policy; AI drafts, explains, and optimises; humans govern; the runtime executes deterministically and auditably. The best of both worlds — intelligence in authoring, certainty in execution.
3. **A decision marketplace and ecosystem.** Industry-specific decision packs (lending, insurance, healthcare eligibility, compliance) become distributable, signed, reusable assets — a revenue and adoption flywheel.
4. **Sovereign, in-tenant decisioning at enterprise scale.** As data-residency and AI-governance regulation tightens, EDP's "decisions live where your data lives, with zero external runtime" posture becomes a primary buying reason, not a technical footnote.
5. **From rules to autonomous decisioning.** With impact analysis, optimisation, and analytics maturing, the platform evolves from executing hand-authored rules toward **continuously improving, self-documenting, self-optimising decision assets** — always under human governance, always explainable.

The measure of ultimate success: a Maqsad customer changes a business policy in an afternoon, with no developer, sees it simulated against real history, approves it through governance, and watches it execute identically across their CRM, portal, and mobile channels — with a full audit trail — all inside their own Dynamics/Dataverse tenancy.

---

## Appendix A — Glossary

- **BRE** — Business Rules Engine; the decisioning module of the EDP.
- **EDP** — Enterprise Decision Platform; parent product; one of six Maqsad modules.
- **Rule Definition** — the versioned JSON artefact authored in the designer and interpreted by the runtime.
- **JDM Editor** — GoRules JSON Decision Model editor, used **as a designer only**.
- **ZEN Runtime** — GoRules' execution engine; **explicitly not used**.
- **Single Runtime** — the one native C# evaluator all entry points invoke.
- **Entry Adapter** — a thin, logic-free door (Plugin/Custom Action/Workflow Activity/Custom API/lightweight API) that funnels requests to the runtime.
- **Metadata Spine** — the architecture that expresses rules against CRM metadata.
- **Execution Trace** — the auditable record of a single decision evaluation.
- **Published Version** — an immutable, live rule version resolvable in production.

---

## Appendix B — Architectural Invariants (Non-Negotiable)

These invariants may only change via an approved ADR that explicitly names and supersedes the relevant Phase 0 section.

1. **One Runtime.** Exactly one native C# evaluator; every entry point funnels to it; no duplicate decision logic anywhere.
2. **No External Runtime/Infrastructure for Core.** No Docker, Kubernetes, Azure Functions, App Service, Node/Rust server, separate rule server, external runtime, or external rule repository is required for authoring or execution.
3. **Deployable as a Standard CRM Solution.** The whole core ships and runs inside Dynamics/Dataverse.
4. **Rules Stored in CRM/Dataverse.** The rule store is the platform itself; no external rule repository.
5. **GoRules is Designer-Only; ZEN is Not the Runtime.** The JSON definition is the contract; the native runtime interprets it.
6. **Immutable Published Versions + Explicit Version Resolution.** Determinism and audit depend on this.
7. **Metadata-Driven Authoring.** Business users never handle schema names.
8. **Cloud/On-Prem Runtime Parity.** Identical semantics; differences confined to adapters.
9. **Deterministic Execution; AI is Advisory-Only.** AI never enters the evaluation path.
10. **Security Inherited from the Platform.** No parallel identity or weaker authorisation model.
11. **Module Independence.** The BRE has no hard runtime dependency on any sibling engine.

---

## Appendix C — Open Questions for Phase 1 (BRD)

These are deliberately deferred to the BRD/CEO phase, not decided in Phase 0:

- **OQ-1:** Exact performance SLA (target/percentile latency) within the sandbox budget.
- **OQ-2:** MVP decision-authoring styles for Horizon 1 (decision tables only, or tables + expressions + formula).
- **OQ-3:** Default vs. pinned version-resolution policy defaults per consumer type.
- **OQ-4:** Extent of on-prem AI degradation acceptable to target customers.
- **OQ-5:** Trace retention and data-classification policy (privacy vs. auditability trade-off).
- **OQ-6:** Marketplace commercial and security/signing model.
- **OQ-7:** Licensing/packaging model (per-environment, per-decision, per-seat).
- **OQ-8:** Initial target industries for template packs.
- **OQ-9:** Whether PCF is required over a web resource for the designer host in the first release.
- **OQ-10:** Success metrics and their measurement instrumentation.

---

*End of Phase 0 — Enterprise Decision Platform Architecture Blueprint (EDP-BRE-001). This document is authoritative for all subsequent phases. Changes require an approved ADR.*
