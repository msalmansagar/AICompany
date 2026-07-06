# Enterprise Decision Platform — Phase 5: Enterprise Decision Service

**Engagement ID:** EDP-BRE-001
**Phase:** 5 — Technical Design (Product Phase 5: Enterprise Decision Service — Runtime Exposure & Consumer Integration)
**Module:** Business Rules Engine (BRE)
**Parent Product:** Maqsad Low-Code Platform
**Prepared by:** Maqsad AI — Principal Enterprise Integration Architect / Solution Architect
**Date:** 2026-07-06
**Version:** 1.0
**Status:** AUTHORITATIVE — Phase 5 Design Input

---

## Authority Clause

This document conforms to and extends, without redesigning, all prior phases. All previous architectural decisions are FINAL.

- `phase-0-architecture.md` — Architectural Invariants (Appendix B) are binding: **zero external infrastructure for the core, CRM-native, single runtime, immutable published versions, deterministic execution, AI advisory-only.**
- `phase-3-arch.md` — Domain Model (§3), PCRM Canonical Model (§6), Metadata Architecture (§7–8), Security (§10), Versioning (§11); ADR-01 … ADR-12 binding.
- `phase-4-native-runtime.md` — `RuleRuntimeService` façade, compiler, execution, formula/table/variable engines; entry-point adapter constraints (§1.3); ADR-R01 … ADR-R05; ADR-13 (trace tiering) binding.
- `phase-4-visual-rule-designer.md` — Designer spec; ADR-D01 … ADR-D09.
- `phase-4-testing-governance.md` — Testing, governance, execution-log & trace (ADR-G series); step-trace persistence (`qdb_edp_tracejson`, ADR-G03) shipped 2026-07-06.
- `schema/README.md` — Live Dataverse schema (`qdb_edp_` namespace). Every entity/column named here matches the deployed schema.

Changes to any decision in this document require a formally approved ADR that explicitly names and supersedes the relevant section. Silent deviation is prohibited.

**This document is DESIGN SPECIFICATION ONLY.** No C#, TypeScript, or production code is produced. Conceptual JSON shapes and ASCII sequence sketches are used only where they serve clarity. Operation and parameter names are **contract design**, not code.

---

## Legend — Implementation Status Tags

| Tag | Meaning |
|-----|---------|
| **[ALREADY-EXISTS]** | Deployed to Dataverse and working end-to-end today |
| **[EXTEND]** | Schema or code exists; additional design and build required |
| **[NET-NEW]** | No schema or code exists; full design and build required |

---

## The One-Runtime Contract (non-negotiable spine of this phase)

Every capability in this document resolves to a single sentence:

> **Every consumer, on every platform, through every transport, executes exactly the same compiled rule inside the same `RuleRuntimeService` over the same PCRM canonical model read from the same Dataverse rule repository. No consumer contains, caches-and-re-executes, re-implements, or forks business logic.**

There is **ONE** Rule Repository (Dataverse `qdb_edp_*`), **ONE** Canonical Rule Model (PCRM), **ONE** Rule Compiler (`RuleCompiler`), **ONE** Rule Runtime (`RuleRuntimeService`). The Enterprise Decision Service (EDS) is **not a new engine** — it is the formal, versioned, contract-stable *façade* over that one runtime. Everything below is reach, shape, and governance around a single point of execution.

---

## Table of Contents

1. Enterprise Decision Service Architecture
2. Integration Architecture
3. Dataverse Custom API Strategy
4. Dynamics CRM Custom Action Strategy
5. Portal Integration
6. Mobile Integration
7. Process Engine Integration
8. Form Engine Integration
9. Integration Engine Integration
10. Power Automate Strategy
11. Input Mapping
12. Output Mapping
13. Execution Context
14. Security Architecture
15. Performance Architecture
16. Monitoring
17. Import / Export Architecture
18. SDK Strategy
19. Error Handling
20. Future Roadmap
21. Architecture Decision Records (ADR-EDS series)

Appendix A — Verified Current-State Inventory
Appendix B — Operation × Surface × Consumer Matrix
Appendix C — Canonical Error Catalogue

---

## 1. Enterprise Decision Service Architecture

### 1.1 What the EDS is (and is not)

**[EXTEND]** — one operation (`qdb_edp_EvaluateDecision`) already exists and is verified live; the service is the formalization and completion of that surface.

The Enterprise Decision Service is a **logical service** with a **stable operation contract** and **two physical execution surfaces**, plus **one optional transport tier**:

```
                         ┌───────────────────────────────────────────┐
                         │        ENTERPRISE DECISION SERVICE         │
                         │      (logical contract — 12 operations)    │
                         └───────────────────────────────────────────┘
                                          │  same contract
              ┌───────────────────────────┼───────────────────────────┐
              ▼                            ▼                           ▼
   ┌────────────────────┐      ┌────────────────────┐      ┌──────────────────────┐
   │  CLOUD SURFACE     │      │  ON-PREM SURFACE   │      │  TRANSPORT TIER       │
   │  Dataverse         │      │  CRM Custom        │      │  (OPTIONAL)           │
   │  Custom API        │      │  Actions           │      │  ASP.NET Web API      │
   │  qdb_edp_*         │      │  qdb_edp_*         │      │  "EDP.Gateway"        │
   │  (unbound actions/ │      │  (same signatures) │      │  transport ONLY —     │
   │   functions)       │      │                    │      │  never executes rules │
   └─────────┬──────────┘      └─────────┬──────────┘      └──────────┬───────────┘
             │  thin adapter             │  thin adapter              │ forwards to
             ▼                           ▼                            ▼ Custom API/Action
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │                    RuleDecisionService  →  RuleRuntimeService                 │
   │            (the ONE runtime — ADR-06 — logic-free adapters funnel here)       │
   └─────────────────────────────────────────────────────────────────────────────┘
             │                              │                          │
             ▼                              ▼                          ▼
   ┌──────────────────┐        ┌────────────────────┐      ┌──────────────────────┐
   │ ONE Repository   │        │ ONE Canonical Model│      │ ONE Compiler          │
   │ Dataverse qdb_edp│        │ PCRM               │      │ RuleCompiler + cache  │
   └──────────────────┘        └────────────────────┘      └──────────────────────┘
```

**It is:** a versioned contract, a set of adapters, an envelope, a gateway, and SDKs.
**It is not:** a second runtime, a rules cache that re-executes, a microservice that owns logic, or anything that violates ADR-05 (zero external infra for core) or ADR-06 (single runtime).

### 1.2 The 12 operations

Operations split by **Command–Query Separation** (per `.claude/rules/common.md`): queries never mutate; commands may. This split is not cosmetic — it maps directly onto Custom API **Function** (query, side-effect-free, cacheable) vs **Action** (command).

| # | Operation | Kind | Surface primitive | Status |
|---|-----------|------|-------------------|--------|
| 1 | **ExecuteRule** | Command | Action `qdb_edp_ExecuteRule` | [EXTEND] — `qdb_edp_EvaluateDecision` exists; rename/alias + envelope |
| 2 | **ExecuteRuleSet** | Command | Action `qdb_edp_ExecuteRuleSet` | [NET-NEW] |
| 3 | **ExecuteDecisionTable** | Command | Action `qdb_edp_ExecuteDecisionTable` | [EXTEND] — table path proven; dedicated entry |
| 4 | **TestRule** | Command | Action `qdb_edp_TestRule` | [EXTEND] — `TestRule` harness + scenario library exist |
| 5 | **ValidateRule** | Command | Action `qdb_edp_ValidateRule` | [EXTEND] — `RuleValidator` exists in runtime |
| 6 | **GetRuleMetadata** | Query | Function `qdb_edp_GetRuleMetadata` | [NET-NEW] |
| 7 | **GetInputSchema** | Query | Function `qdb_edp_GetInputSchema` | [NET-NEW] |
| 8 | **GetOutputSchema** | Query | Function `qdb_edp_GetOutputSchema` | [NET-NEW] |
| 9 | **GetPublishedVersion** | Query | Function `qdb_edp_GetPublishedVersion` | [EXTEND] — Rule Resolver exists |
| 10 | **GetRuleHistory** | Query | Function `qdb_edp_GetRuleHistory` | [NET-NEW] |
| 11 | **GetRuleDocumentation** | Query | Function `qdb_edp_GetRuleDocumentation` | [NET-NEW] |
| 12 | **GetRuleTemplates** | Query | Function `qdb_edp_GetRuleTemplates` | [NET-NEW] |

All 12 are **unbound** (not tied to a table row) so any consumer can call them without an entity context. Each is a logic-free adapter: it deserializes the envelope, resolves the rule version (Rule Resolver, ADR-09/12), calls `RuleDecisionService`/`RuleRuntimeService`, and serializes the response envelope. **No operation contains rule logic.**

### 1.3 Layering

| Layer | Responsibility | Contains logic? | Artifact |
|-------|----------------|-----------------|----------|
| **Contract** | Operation names, envelope shapes, versioning | No | This document + Custom API metadata |
| **Transport (optional)** | AuthN, envelope shaping, HTTP↔OData, rate limiting | **No — forbidden (ADR-EDS-02)** | `EDP.Gateway` ASP.NET Web API |
| **Surface adapter** | Deserialize → resolve version → call runtime → serialize | No | Custom API plugin / Custom Action |
| **Decision orchestration** | Bind inputs, invoke runtime, emit trace+audit | No (orchestration only) | `RuleDecisionService` [ALREADY-EXISTS] |
| **Runtime** | Compile + execute PCRM deterministically | **Yes — the only place** | `RuleRuntimeService` [ALREADY-EXISTS] |
| **Repository** | Versioned rule storage | No | Dataverse `qdb_edp_*` [ALREADY-EXISTS] |

### 1.4 Version resolution is inside the service, not the caller

Callers reference a rule by **business identity** (`ruleId` or `ruleName`), optionally with an explicit `version` or `pinPolicy`. The **Rule Resolver** (ADR-09, ADR-12) inside the surface adapter decides which immutable published version executes, records `resolvedVersion` vs `wouldResolveVersion`, and enforces production pin-justification. Consumers never select a version by reaching into storage. This keeps the immutable-version invariant (Phase 0) intact across all channels.

---

## 2. Integration Architecture

### 2.1 Two integration classes

The single most important integration decision: **co-located consumers call the runtime in-process; remote consumers call it out-of-process. Both hit the identical `RuleRuntimeService`.** (ADR-EDS-10)

| Class | Consumers | Path | Network hop | Latency |
|-------|-----------|------|-------------|---------|
| **In-process (co-resident in Dataverse)** | CRM plugins/BPF, Process Engine, Form Engine server logic, Integration Engine (when hosted as plugins/flows), Batch (async plugins) | Direct call to the shared runtime assembly inside the sandbox | None | Sub-ms dispatch + eval |
| **Out-of-process (remote)** | Customer Portal, Mobile, External Applications, Power Automate, any non-Dataverse caller | Custom API (cloud) / Custom Action (on-prem), optionally via `EDP.Gateway` | 1 (to Dataverse) or 2 (via gateway) | Network + eval |

Because both classes converge on the same assembly, there is **exactly one compiled-rule cache, one metadata cache, one execution semantic**. A rule behaves identically whether fired by a portal button or a nightly batch.

### 2.2 Canonical integration flow (remote consumer)

```
Consumer → [optional] EDP.Gateway → Dataverse Custom API (qdb_edp_ExecuteRule)
   1. Build RequestEnvelope (correlationId, ruleRef, inputs, context, mode)
   2. Gateway: authenticate (OAuth2), validate envelope, forward as OData action call
   3. Custom API adapter: deserialize → Rule Resolver → RuleDecisionService
   4. RuleRuntimeService: compile-cache lookup → execute PCRM → RuleResult
   5. Adapter: write trace (best-effort) + audit (durable) → serialize ResponseEnvelope
   6. Gateway: map to HTTP + correlationId echo → Consumer
```

### 2.3 Integration invariants

- **I-1** No consumer deserializes or interprets PCRM. PCRM is a runtime-internal contract; consumers see only the envelope's business inputs/outputs.
- **I-2** No consumer receives raw storage records to make decisions. They receive *decisions*.
- **I-3** Every cross-boundary call carries a `correlationId`; every execution produces an `executionId`; both are logged (ADR-EDS-04).
- **I-4** The gateway is stateless and optional. Removing it changes reach, not correctness.
- **I-5** Async and batch never bypass the runtime — they queue *requests to the runtime*, not alternate execution.

---

## 3. Dataverse Custom API Strategy

**[EXTEND]** — `qdb_edp_EvaluateDecision` + `qdb_edp_RuleGovernanceAction` exist; extend to the full operation set.

### 3.1 Why Custom API is the cloud primitive

Custom API (unbound messages) is the correct cloud surface because it: (a) runs the plugin-hosted runtime *inside* Dataverse (honoring ADR-05 zero-infra), (b) is callable by every Dataverse-authenticated identity (users, app users/S2S, Power Automate, portal), (c) participates in the security model natively (`executeprivilegename`, roles), (d) returns strongly-typed response properties, and (e) is solution-packaged with the rest of `BusinessRuleEngine` (one ALM unit).

### 3.2 Function vs Action mapping (ADR-EDS-03)

| Concern | Custom API **Function** | Custom API **Action** |
|---------|-------------------------|------------------------|
| Used for | `Get*` queries (6–12) | `Execute*`, `Test`, `Validate` (1–5) |
| HTTP verb (OData) | `GET` | `POST` |
| Side effects | None (CQS query) | May write trace/audit; never mutates the rule |
| Cacheable at gateway | Yes (metadata/schema/history change only on publish) | No |
| `isfunction` | `true` | `false` |

### 3.3 Operation contract skeletons (design, not code)

Request/response properties are Custom API request parameters and response properties. `EdsRequest`/`EdsResponse` below are the **envelope carried as a single `EnvelopeJson` string parameter** plus a few first-class scalar parameters for gateway routing and metering. Carrying the envelope as JSON keeps the contract stable while Dataverse parameter types stay simple (String/EntityReference/Boolean/Integer).

**ExecuteRule (Action `qdb_edp_ExecuteRule`)** — supersedes the raw `EvaluateDecision`, which is retained as a back-compat alias.

- Request params: `EnvelopeJson` (String, req), `RuleId` (String, opt), `RuleName` (String, opt), `Version` (String, opt), `TargetRef` (EntityReference, opt), `ExecutionMode` (String, opt = `sync`).
- Response props: `ResponseJson` (String — the full ResponseEnvelope), `Success` (Bool), `Matched` (Bool), `ExecutionId` (String), `ElapsedMs` (Integer).

**ExecuteRuleSet (Action `qdb_edp_ExecuteRuleSet`)** — evaluate an ordered/keyed set of rules in one call; response returns per-rule outcomes plus an aggregate. Set composition and short-circuit policy are defined by a `qdb_edp_ruleset` definition (see §12.4), never by the caller.

**ExecuteDecisionTable (Action `qdb_edp_ExecuteDecisionTable`)** — evaluate a rule whose logic root is a decision table; identical runtime, dedicated entry for consumers that think in tables (returns matched row index + hit-policy metadata in the trace).

**TestRule (Action `qdb_edp_TestRule`)** — execute against supplied inputs *or* a saved scenario without writing durable audit (test executions are tagged `executionSource = test` and, per ADR-13, may be sampled/suppressed from the durable tier). Reuses the runtime `TestRule` harness + Phase-4 scenario library.

**ValidateRule (Action `qdb_edp_ValidateRule`)** — compile-and-validate a PCRM/JDM payload or a stored draft version; returns `RuleValidator` diagnostics (Error/Warning) without executing. Used by the designer save-gate and by CI import.

**GetPublishedVersion (Function `qdb_edp_GetPublishedVersion`)** — resolve business identity → immutable published version id + version number + pin state, honoring production pin governance.

**GetRuleMetadata / GetInputSchema / GetOutputSchema (Functions)** — return the rule's declared metadata, input contract, and output contract derived from PCRM + the metadata catalogue. These power SDK typing, portal/mobile form binding, and connector schema generation. **Schemas are generated from the canonical model, never hand-authored per consumer** — this is what prevents contract drift.

**GetRuleHistory / GetRuleDocumentation / GetRuleTemplates (Functions)** — version lineage + audit summary, generated documentation (Phase-4 docs architecture), and the published template library respectively.

### 3.4 Standard envelope on every operation

Every operation accepts and returns the canonical envelope (§11–13, §19). This uniformity means one gateway mapping, one SDK serializer, one monitoring schema — for all 12 operations.

### 3.5 Registration & ALM

All Custom APIs live in the `BusinessRuleEngine` unmanaged solution, plugin steps on the shared IL-merged assembly (`EDP.RuleRuntime.Crm.Signed`, currently v1.0.4.0). New operations = new plugin types on the *same* assembly (no second assembly → no chance of a second runtime). `executeprivilegename` binds each operation to an EDP privilege (§14.3).

---

## 4. Dynamics CRM Custom Action Strategy

**[NET-NEW]** for on-prem packaging; the runtime already targets net462 and CRM SDK.

### 4.1 Parity principle

On-premises Dynamics CRM 9.x does not have Custom API (pre-Dataverse). The equivalent is a **Custom Process Action** (`workflow` category = action) backed by a plugin step, or a registered plugin message. The EDS exposes the **same 12 operation names and the same envelope** as Custom Actions so that a consumer's call shape is identical across cloud and on-prem — only the endpoint binding differs (`ExecuteWorkflowRequest`/`OrganizationRequest` vs OData action).

```
Cloud:    POST {org}/api/data/v9.2/qdb_edp_ExecuteRule        (Custom API)
On-prem:  Execute(new OrganizationRequest("qdb_edp_ExecuteRule"){ ... })  (Custom Action)
                       ▲ same name, same EnvelopeJson, same runtime assembly ▲
```

### 4.2 Same assembly, same runtime

The on-prem Custom Action's plugin step references the **identical** `RuleRuntimeService` (the runtime core is netstandard2.0; the CRM adapter is net462 — already built and tested, 50 tests green). There is no on-prem re-implementation. This is the concrete realization of ADR-06 across deployment topologies (`phase-4-native-runtime.md` §1.4 convergence).

### 4.3 On-prem external exposure

Where on-prem consumers need HTTP, an **on-prem `EDP.Gateway`** (IIS-hosted ASP.NET Web API) forwards to the Custom Action via the Organization Service SDK — again transport only, business logic stays in CRM (ADR-EDS-02). This satisfies the platform-strategy rule verbatim: *"an ASP.NET Web API may act only as a transport layer; the Web API must never execute rules directly."*

### 4.4 Differences isolated in adapters

| Concern | Cloud | On-prem | Isolated where |
|---------|-------|---------|----------------|
| Message host | Custom API | Custom Action | Adapter registration |
| Identity | Entra OAuth2 / S2S | AD / Windows / S2S | Gateway + CRM security |
| Metadata resolver | Web API `EntityDefinitions` | `RetrieveEntityRequest` | `IMetadataResolver` impl |
| Async | Dataverse async job | CRM async workflow / queue | Execution-mode adapter |

Everything below `RuleDecisionService` is byte-for-byte identical.

---

## 5. Portal Integration (Customer Portal)

**[NET-NEW]** integration; runtime unchanged.

### 5.1 Topology

Power Pages / custom Customer Portal is a remote, out-of-process consumer. It calls **`ExecuteRule` via the portal's authenticated Web API path or the `EDP.Gateway`** — never a direct designer/runtime dependency.

```
Browser (portal page) → Portal Web API / EDP.Gateway → qdb_edp_ExecuteRule → runtime
```

### 5.2 Authentication

- **Preferred:** Power Pages **authenticated Web API** using the signed-in contact's Dataverse identity → the Custom API executes under a least-privileged **EDP Business User** role (§14). No secret in the browser.
- **Custom portal:** browser holds no Dataverse credential. It calls `EDP.Gateway` with the portal session token; the gateway exchanges it (OAuth2 on-behalf-of / client-credentials with contact assertion) for a Dataverse S2S token scoped to a portal app user. **The rule always runs server-side under a governed identity.**

### 5.3 Execution flow

1. Portal collects business inputs from the form.
2. Portal builds the envelope (`ruleRef` by name, `executionSource = portal`, `context` = contact BU/language/currency).
3. Gateway authenticates + rate-limits (§14.4) and forwards.
4. Custom API executes; response envelope returns decision + diagnostics (trace **off** by default for portal — see 5.5).
5. Portal binds outputs to UI (eligibility banner, pricing, next step).

### 5.4 Caching (read-optimized, never logic)

Only **queries** are cached, never executions:

| Cacheable | TTL / invalidation | Where |
|-----------|--------------------|-------|
| `GetInputSchema` / `GetOutputSchema` / `GetRuleMetadata` | Invalidate on publish (version-keyed ETag) | Gateway + browser |
| `GetPublishedVersion` | Short TTL (e.g. 60s) or publish webhook | Gateway |
| **Decisions (ExecuteRule results)** | **Not cached as reusable logic.** Optional idempotency cache keyed by `(ruleVersion, hash(inputs))` with short TTL for retry-dedup only | Gateway (opt-in) |

Decision caching, when enabled, is an **idempotency/retry optimization** — it returns a *recorded prior decision for identical inputs against the same immutable version*, which is safe precisely because versions are immutable. It is not a rule cache and cannot produce a decision the runtime didn't produce (ADR-EDS-06 boundary).

### 5.5 Error handling, performance, security

- **Errors:** gateway maps the canonical error taxonomy (§19) to portal-safe messages; business errors (`EDP-BUS-*`) surface to the user, system/security errors are logged with `correlationId` and shown as generic failures.
- **Performance:** portal calls are synchronous, single-rule, sub-second; schema calls are cached; the gateway pools Dataverse connections (§15.4).
- **Security:** input validation at the gateway boundary (Zod-equivalent contract check) before forwarding; trace disabled to avoid leaking rule internals to the edge; row-level rule visibility enforced by the portal app user's role.

---

## 6. Mobile Integration

**[NET-NEW]**; introduces the offline decision here for the first time — bounded by the single-runtime invariant.

### 6.1 Online strategy

Identical to portal: mobile app → `EDP.Gateway` → `qdb_edp_ExecuteRule`. The app authenticates via Entra ID (MSAL); the gateway forwards under the user identity. Online is always authoritative.

### 6.2 Offline strategy (ADR-EDS-06 — the critical decision)

**Mobile apps do NOT execute rules locally.** Re-implementing evaluation in JavaScript/Swift/Kotlin would create a *second runtime* and violate ADR-06 and the one-runtime contract. Instead, offline is handled by **three bounded mechanisms**:

1. **Cached prior decisions** — the app caches recent `ExecuteRule` responses keyed by `(ruleName, version, hash(inputs))`. Offline, for *identical* inputs against a known immutable version, it may reuse the recorded decision (safe: immutable version + identical inputs = identical result). This is a cache of *the runtime's own outputs*, not a re-computation.
2. **Deferred execution queue** — for new/changed inputs offline, the app **queues the decision request** and shows an "pending decision" state. On reconnect the queue drains through the online path; authoritative decisions replace pending placeholders.
3. **Schema prefetch** — `GetInputSchema`/`GetOutputSchema`/`GetRuleMetadata` are cached so forms render and validate structure offline (structural validation ≠ business decision).

What is explicitly **forbidden offline:** computing eligibility, pricing, risk, or approval from a local logic copy. The app can *collect* and *validate shape*, but *decisions come from the runtime*.

### 6.3 Caching, authentication, retry

| Concern | Design |
|---------|--------|
| **Cache** | SQLite/secure store; decision cache is version-keyed and evicted on version change (detected via `GetPublishedVersion` on reconnect) |
| **Authentication** | MSAL token; refresh on reconnect; gateway validates every call |
| **Retry** | Exponential backoff with jitter; `requestId` makes retries idempotent (gateway dedup); queued deferred requests retried until acknowledged |
| **Conflict** | If a cached decision's version is stale on reconnect, the app re-requests; the fresh authoritative decision wins |

---

## 7. Process Engine Integration

**[NET-NEW]** consumer; Process Engine is co-resident in Dataverse → **in-process** where possible.

### 7.1 How the Process Engine calls the Rule Engine

The Process Engine (a sibling Maqsad module) reaches a **decision point** in a process and must ask "what next?". It calls the EDS — **in-process via the shared runtime assembly** when both run in the same Dataverse sandbox, or via `qdb_edp_ExecuteRule`/`ExecuteRuleSet` when decoupled. One decision point = one EDS call. The Process Engine owns *orchestration*; the Rule Engine owns *the decision*. Neither duplicates the other.

### 7.2 Decision categories → operation mapping

| Process need | Operation | Output shape | Example |
|--------------|-----------|--------------|---------|
| **Routing** | `ExecuteRule` | Decision → next node key | Route claim to Fast-Track vs Manual |
| **Eligibility** | `ExecuteRule` | Boolean + reasons | Applicant eligible for product |
| **Approval** | `ExecuteRule` / `ExecuteRuleSet` | Approval level / required approvers | Loan → CEO vs Manager (the live sample rule) |
| **Validation** | `ValidateRule`-of-data via `ExecuteRule` | Boolean + violation list | Application completeness gate |
| **Calculations** | `ExecuteRule` (formula root) | Numeric outputs (multiple) | Premium, fee, adjusted amount |
| **Risk** | `ExecuteRule` / `ExecuteDecisionTable` | Risk tier + score | Risk rating from decision table |

### 7.3 Contract stability for long-running processes

Processes may be long-running; a decision taken at step 1 must be reproducible at step 9. The EDS records `resolvedVersion` + `executionId` in the process variables so the process can (a) pin subsequent related decisions to the same version and (b) reproduce the exact decision in audit. This uses the existing immutable-version + execution-log foundation — no new mechanism.

---

## 8. Form Engine Integration

**[NET-NEW]** consumer; highest call-density consumer → batched decision requests.

### 8.1 Form-time decisions

The Form Engine (Dynamic Form Engine, DFE — sibling module) needs rule-driven behavior on **every field interaction**: visibility, required, read-only, validation, calculated fields, dynamic labels, sections, tabs. Naively that is one EDS call per field per keystroke — unacceptable. The design is a **Form Decision Set**: the form declares the rules governing it; on load and on significant change it sends **one `ExecuteRuleSet` call** returning a keyed decision map the form binder applies locally.

```
Form load / field change → qdb_edp_ExecuteRuleSet (form decision set)
  ← { visibility:{fieldA:true}, required:{fieldB:false}, readonly:{...},
      validation:[...], calculated:{premium:1234}, labels:{...},
      sections:{secX:show}, tabs:{tabY:hide} }
Form binder applies map to UI. No logic in the binder.
```

### 8.2 Eight form behaviors → decision outputs

| Behavior | EDS output key | Runtime source |
|----------|----------------|----------------|
| Dynamic Visibility | `visibility{field→bool}` | Rule outputs |
| Required Fields | `required{field→bool}` | Rule outputs |
| Read Only | `readonly{field→bool}` | Rule outputs |
| Validation | `validation[{field,severity,message}]` | Diagnostics + rule outputs |
| Calculated Fields | `calculated{field→value}` | Formula engine outputs |
| Dynamic Labels | `labels{field→text}` | Rule outputs (metadata-bound) |
| Dynamic Sections | `sections{section→show/hide}` | Rule outputs |
| Dynamic Tabs | `tabs{tab→show/hide}` | Rule outputs |

### 8.3 Why this respects the one-runtime contract

The form binder is a **pure applicator** — it maps a decision map to UI state and contains **zero business logic**. Every visibility/required/calc value came from the runtime. The form cannot drift from the rules because it never encodes them. Debounce + batch keeps call volume within performance envelopes (§15).

### 8.4 Determinism note

Calculated fields flow through the runtime formula engine (UTC/InvariantCulture, ADR-11) — the *same* numbers a server-side or batch execution would produce. The form never computes; it displays.

---

## 9. Integration Engine Integration

**[NET-NEW]** consumer; the Integration Engine adapts many wire protocols to the one canonical input.

### 9.1 Pattern: protocol adapter → canonical input → EDS

The Integration Engine (sibling module) terminates external protocols and, at any point requiring a decision, maps the inbound payload to the canonical envelope and calls the EDS. **Each protocol is an input adapter; none is a rule host.**

| Trigger | Adapter behavior | EDS call | Mode |
|---------|------------------|----------|------|
| **REST** | Map JSON body → envelope inputs | `ExecuteRule` | sync |
| **SOAP** | XML → envelope (XML input supported, §11) | `ExecuteRule` | sync |
| **Queue** | Dequeue message → envelope | `ExecuteRule` | async |
| **File Processing** | Parse row → envelope (per row) | `ExecuteRuleSet`/batch | batch |
| **Batch** | Chunk records → batch request | batch (§10 modes) | async batch |
| **Webhook** | Inbound event → envelope | `ExecuteRule` | sync/async |

### 9.2 Transformation ownership

Field transformation (protocol payload → canonical inputs) lives in the Integration Engine's mapping layer, **not** in the rule. Rules receive already-canonical, already-typed inputs. This keeps rules protocol-agnostic and keeps the runtime free of transport concerns (separation of concerns; single responsibility).

### 9.3 Delivery semantics

Queue/webhook/batch integrations are **at-least-once**; `requestId` idempotency (§15.5, gateway dedup) makes re-delivery safe. Durable audit (ADR-13 tier 1) guarantees every executed decision is recorded even under retry.

---

## 10. Power Automate Strategy

**[NET-NEW]**, Horizon-2 delivery.

### 10.1 Custom connector over the Custom API

Power Automate consumes the EDS through a **certified custom connector** whose operations are 1:1 with the 12 Custom API messages. The connector is a thin OpenAPI definition pointing at the Dataverse Web API (or the gateway); it contains **no logic**. Flow makers pick `ExecuteRule`, supply `ruleName` + inputs, and bind outputs to subsequent flow steps.

### 10.2 Schema-driven connector actions

Connector input/output schemas are **generated from `GetInputSchema`/`GetOutputSchema`** so the connector's dynamic schema stays in lockstep with the rule contract — publishing a new rule version updates the connector's dynamic outputs without a connector redeploy (dynamic schema pull at design time). This is the payoff of canonical schema generation (§3.3).

### 10.3 Trigger + action coverage

| Power Automate need | EDS mapping |
|---------------------|-------------|
| Action: evaluate a rule | `ExecuteRule` connector action |
| Action: evaluate a set | `ExecuteRuleSet` |
| Action: fetch schema for dynamic outputs | `GetInputSchema`/`GetOutputSchema` |
| Trigger (future): "on rule published" | Dataverse trigger on `qdb_edp_ruleversion` publish (H3 event stream) |

### 10.4 Governance

The connector is published through the tenant's DLP-governed connector catalogue; it inherits Dataverse security (a flow's connection identity governs which rules it may execute). No rule executes outside the runtime.

---

## 11. Input Mapping

**[EXTEND]** — CRM Entity + JSON inputs exist; formalize the five sources behind one binding model.

### 11.1 Five input sources → one binding contract

Every input source is normalized to the runtime's input dictionary via a **binding adapter**. The PCRM input's `binding` (logical name / key) is the single source of truth for how a value is located. Consumers pick a source; the mapping is uniform.

| Source | Adapter behavior | Status |
|--------|------------------|--------|
| **CRM Entity** | For each PCRM input, read `target[binding]`; `CrmValueConverter` normalizes Money/OptionSetValue/EntityReference → runtime scalar | [ALREADY-EXISTS] |
| **JSON** | `InputsJson` parsed → dictionary (type inference: string/decimal/bool) | [ALREADY-EXISTS] |
| **Dictionary** | In-process callers pass `IDictionary<string,object?>` directly | [ALREADY-EXISTS] |
| **Object (typed)** | SDK reflects a POCO's properties → dictionary by name/attribute | [NET-NEW] SDK |
| **Dynamic Object** | `ExpandoObject`/`dynamic`/`JObject` → dictionary | [NET-NEW] SDK |

### 11.2 Type coercion & determinism

All sources converge on the same typed dictionary before execution, so operator×type semantics (`phase-4-native-runtime.md` §3.3) and formula determinism (UTC/InvariantCulture) apply identically regardless of source. **A decimal is a decimal whether it arrived as a `Money` attribute, a JSON number, or a POCO property.** Missing bindings resolve to null with defined null-handling (§7.5 runtime).

### 11.3 XML input (optional)

For SOAP/legacy consumers, the gateway/adapter converts XML → canonical JSON at the boundary (§9). The runtime never sees XML; it sees the normalized dictionary.

### 11.4 Input contract discovery

`GetInputSchema` returns each input's name, business label (metadata-bound), type, optionality, and allowed values (option sets) — generated from PCRM. Consumers build forms/connectors/SDK types from this, guaranteeing the inputs they send match what the rule declares.

---

## 12. Output Mapping

**[EXTEND]** — decision/JSON/dictionary outputs exist; formalize the full set incl. governed write-back.

### 12.1 Seven output shapes

| Output shape | Design | Status |
|--------------|--------|--------|
| **Decision** | Named decision result (e.g. `approvalLevel`) — the canonical outcome | [ALREADY-EXISTS] |
| **Boolean** | `matched` + any boolean rule output | [ALREADY-EXISTS] |
| **JSON** | `OutputsJson` — the full output map | [ALREADY-EXISTS] |
| **Dictionary** | In-process `IReadOnlyDictionary<string,object?>` | [ALREADY-EXISTS] |
| **Variables** | Intermediate variables exposed when `options.exposeVariables=true` (from Variable Engine) | [EXTEND] |
| **Multiple Outputs** | Any number of named outputs in one execution (already native) | [ALREADY-EXISTS] |
| **CRM Fields (write-back)** | **Opt-in, governed** mapping of outputs → target attributes | [NET-NEW] |

### 12.2 CRM field write-back is governed and opt-in (ADR-EDS-07)

A decision is a **query by default** (Command–Query Separation): `ExecuteRule` returns outputs and does **not** mutate business data. Writing an output back to a CRM field is a **separate, explicit, governed** capability:

- Requires a configured **output binding** on the rule version (`outputBinding{output→attribute}`) authored in the designer, not chosen by the caller.
- The write is performed by the **calling context** (plugin/flow) under its own identity and security — the runtime returns the decision; the *consumer* decides to persist it. The runtime itself remains side-effect-free (except trace/audit).
- Every write-back is audited (who/what/old→new) via the existing audit sink.

This keeps the runtime pure and makes side effects explicit, opt-in, and traceable — never a hidden consequence of "just evaluating a rule".

### 12.3 Output contract discovery

`GetOutputSchema` returns each output's name, label, type, and (for enumerated outputs) allowed values — generated from PCRM. Portals, forms, connectors, and SDKs bind to this.

### 12.4 Rule Set outputs

`ExecuteRuleSet` returns per-rule outputs plus an **aggregate** shaped by the `qdb_edp_ruleset` definition (e.g. first-match, all-match, priority-collect). The set's composition/short-circuit policy is authored, versioned, and governed like a rule — the caller cannot redefine it.

---

## 13. Execution Context

**[EXTEND]** — actor/time captured today; formalize the full context block.

### 13.1 Context is asserted, propagated, and validated — never trusted blindly

Every execution carries an **Execution Context** describing *who/where/how*. In-process (CRM), it derives from `IPluginExecutionContext` (authoritative). Remote, the caller asserts context in the envelope; the surface adapter **validates it against the authenticated identity** (a portal caller cannot claim a different business unit than its app user grants).

| Context field | Source (in-proc) | Source (remote) | Use |
|---------------|------------------|-----------------|-----|
| **User** | `InitiatingUserId` | OAuth identity / on-behalf-of | Audit actor, ownership-scoped rule visibility |
| **Business Unit** | User's BU | Derived from identity, validated | Rule scoping, data-visibility |
| **Security** | Plugin context roles | App-user roles | AuthZ (§14) |
| **Organization** | Org context | `organization` (validated vs token org) | Multi-org routing |
| **Language** | User UI language | `context.language` | Metadata labels, message localization |
| **Time Zone** | User TZ | `context.timeZone` | **Input interpretation & output formatting only** |
| **Currency** | Txn/user currency | `context.currency` | **Input interpretation & output formatting only** |
| **Execution Source** | Set by adapter | `executionSource` (portal/mobile/process/form/integration/test/batch) | Trace tagging, metrics segmentation, test-tier suppression |

### 13.2 Determinism firewall (ADR-EDS-08)

Language/TimeZone/Currency influence **how inputs are read and how outputs are presented** — they do **NOT** influence evaluation. The runtime evaluates in **UTC + InvariantCulture** (ADR-11, runtime §5.2) unconditionally. A rule fired from Doha, London, or a batch job at UTC midnight yields the **same decision**; only the display/interpretation layer localizes. This prevents the classic "same rule, different answer by locale" defect and preserves reproducibility for audit.

### 13.3 Context propagation across hops

The gateway forwards context immutably and adds transport metadata (source IP, gateway node) to the trace, never to the evaluation. `correlationId` threads the full call chain across consumer → gateway → Custom API → runtime → log.

---

## 14. Security Architecture

**[EXTEND]** — 6 EDP roles + append-only audit exist; formalize the end-to-end model.

### 14.1 Authentication by surface

| Surface | AuthN |
|---------|-------|
| Cloud Custom API | Entra ID OAuth2 (user or S2S app-user); Dataverse validates |
| On-prem Custom Action | AD / Windows integrated / S2S |
| Gateway (optional) | OAuth2 client-credentials + on-behalf-of; mTLS for service callers |
| Portal | Power Pages auth (contact) → app-user; or gateway token exchange |
| Mobile | MSAL (Entra) → gateway → app-user |

### 14.2 Authorization — the runtime never invents access control

AuthZ is **CRM-native**. The 6 shipped EDP roles gate every operation:

| Role | EDS operations permitted |
|------|--------------------------|
| **EDP Rule Administrator** | All (incl. governance) |
| **EDP Author** | Author + `TestRule`, `ValidateRule`, all `Get*` |
| **EDP Reviewer** | `Get*`, `TestRule`, approval governance actions |
| **EDP Publisher** | `Get*`, version publish |
| **EDP Business User** | `ExecuteRule`, `ExecuteRuleSet`, `ExecuteDecisionTable`, `Get*` (read) |
| **EDP Read-Only** | `Get*` only |

Portal/mobile/connector identities map to **Business User** (execute + read) — least privilege for consumers.

### 14.3 API security

- Each Custom API binds `executeprivilegename` to an EDP privilege → execution is denied at the platform layer without the privilege (defense before the adapter runs).
- Gateway enforces: rate limiting + throttling per identity (§15), request-size caps, schema validation at the boundary, WAF, IP allow-listing for service callers, and structured audit of every forwarded call.
- No secrets in clients; gateway holds S2S credentials in a secret store (Key Vault / on-prem equivalent), rotated (ties to the standing SEC action to rotate any hardcoded secrets).

### 14.4 Rate limiting & abuse protection

Per-identity token-bucket at the gateway; Dataverse service-protection limits as the backstop (the gateway respects `Retry-After` and surfaces `429`/`EDP-SYS-THROTTLED`). Test/execute segmented so a runaway test loop can't starve production execution.

### 14.5 Audit & encryption

- **Audit:** durable append-only `qdb_edp_ruleaudit` (ADR-13 tier 1) for governance events; `qdb_edp_ruleexecutionlog` (+ `qdb_edp_tracejson`) for executions. Append-only enforced by role + plugin (Phase-6 C-005 pen-test target).
- **Encryption:** TLS 1.2+ in transit on every hop; Dataverse encryption-at-rest (TDE) for storage; gateway secrets encrypted at rest. No rule inputs/outputs logged in clear where they contain PII beyond the governed audit scope (trace redaction option per rule).

### 14.6 Threat boundaries

The gateway is the only internet-facing component and holds **no logic and no rules** — compromising it yields transport, not decisions (it still must authenticate to Dataverse). The runtime executes only inside the Dataverse/CRM trust boundary. This is why "Web API never executes rules" is a *security* property, not just an architectural preference.

---

## 15. Performance Architecture

**[EXTEND]** — compiled-rule + metadata caches exist in `RuleRuntimeService`.

### 15.1 Target envelope

- **100,000+ executions/day** ≈ 1.16/sec average; realistic peaks 50–150/sec (form-load bursts, batch windows).
- Single-rule sync execution budget: **P95 ≤ 500 ms end-to-end** (C-002 ceiling), of which runtime eval is single-digit ms (measured: 14–19 ms live incl. Dataverse round-trip in-plugin).

### 15.2 Caching layers (all read-side; none re-executes)

| Cache | Key | Invalidation | Location | Status |
|-------|-----|--------------|----------|--------|
| **Compiled-rule cache** | content-hash of PCRM | version immutable → never stale | `RuleRuntimeService` (per sandbox) | [ALREADY-EXISTS] |
| **Metadata cache** | entity/attribute | targeted refresh + background (triage #4) | `IMetadataResolver` | [ALREADY-EXISTS/EXTEND] |
| **Schema/metadata query cache** | ruleVersion | publish-keyed ETag | Gateway/consumer | [NET-NEW] |
| **Idempotency (decision) cache** | ruleVersion + hash(inputs) | short TTL, retry-dedup only | Gateway (opt-in) | [NET-NEW] |

### 15.3 Compiled-rule cache economics

Because published versions are **immutable**, a compiled graph is cache-valid forever once built. Cold-start compiles once per sandbox per version; steady state is pure execution. This is why the runtime hits single-digit-ms evaluation.

### 15.4 Connection reuse

The gateway maintains a pooled `ServiceClient`/`HttpClient` to Dataverse with cached S2S tokens (refresh-ahead), eliminating per-call auth cost. On-prem uses a pooled Organization Service channel. **No per-request connection or token acquisition.**

### 15.5 Concurrency & idempotency

Concurrent requests are independent (stateless runtime, no shared mutable state — ADR/common.md). `requestId` enables gateway-level dedup so retries under at-least-once transports don't double-execute side effects.

### 15.6 Execution Modes

The EDS supports five modes; **all funnel to the same runtime** — modes govern *scheduling and fan-out*, not *logic*.

| Mode | Mechanism | Bound | Status |
|------|-----------|-------|--------|
| **Synchronous** | Custom API request/response | Plugin ≤ 2-min ceiling; use for single sub-second decisions | [ALREADY-EXISTS] |
| **Asynchronous** | Enqueue to `qdb_edp_executionrequest` entity → async plugin/flow executes → result on the record; consumer polls or is webhooked | For long/deferred work; no external queue (ADR-05) | [NET-NEW] |
| **Batch** | One call carries N input sets → adapter iterates the runtime, chunked to respect limits; results array returned (sync for small N, async for large) | File/bulk integration | [NET-NEW] |
| **Parallel** | Fan-out of independent executions via multiple concurrent Custom API calls orchestrated by the consumer/gateway (the sandbox is single-threaded per invocation; parallelism is across invocations) | High-throughput windows | [NET-NEW] |
| **Streaming (future)** | Event-driven: Dataverse change events → Service Bus → per-event execution | H3 (§20) | [FUTURE] |

**Mode selection rule:** sync if a human waits and it's sub-second; async if it can defer or may exceed the sandbox ceiling; batch/parallel for volume. The consumer selects `executionMode`; the EDS enforces the bound (rejecting a sync request that would exceed the ceiling with `EDP-SYS-TIMEOUT-GUARD`).

---

## 16. Monitoring

**[EXTEND]** — execution log + designer log viewer + step trace exist.

### 16.1 Health

- `qdb_edp_GetHealth` Function (lightweight: assembly version, runtime self-check, metadata-resolver ping) — [NET-NEW].
- Gateway `/health` (liveness) + `/ready` (Dataverse reachability + token validity) — [NET-NEW].

### 16.2 Metrics (from the execution log, not a new store)

All operational metrics are **aggregations over `qdb_edp_ruleexecutionlog`** — no separate telemetry system for the core (ADR-05). Segmented by `executionSource`, `outcome`, `resolvedVersion`.

| Metric | Source |
|--------|--------|
| Execution count (by rule/version/source) | Count of log rows |
| Average / P95 response time | `qdb_edp_durationms` aggregate |
| Failure rate | `outcome = error` ratio |
| Retries | `requestId` collisions / gateway retry counter |
| No-match rate | `outcome = no-match` ratio (rule-coverage signal) |

### 16.3 Performance dashboard

Model-driven dashboard + the designer's **Execution Log Viewer** (now with step-trace drill-down, shipped 2026-07-06) provide: throughput trend, latency distribution, top rules by volume, failure/no-match hotspots, and per-execution trace inspection. Gateway metrics (rate-limit hits, 429s, auth failures) exported to the tenant's APM (App Insights / on-prem equivalent) — the gateway *may* use external telemetry because it holds no rules (its telemetry is transport telemetry).

### 16.4 Alerting

Threshold alerts on failure-rate spike, P95 breach (C-002), throttle saturation, and audit-write failure (a durable-audit failure is a governance incident, ADR-13 tier 1 — it must surface, never be swallowed).

---

## 17. Import / Export Architecture

**[EXTEND]** — dual-storage (JDM source + PCRM) already makes rules portable.

### 17.1 Package types

| Package | Contents | Format | Use |
|---------|----------|--------|-----|
| **Rule Package** | One rule: definition, all versions, PCRM + JDM source, metadata, docs | JSON | Share/backup a single rule |
| **Version Package** | One immutable published version (self-contained, executable) | JSON | Promote a specific version |
| **Migration Package** | Rules + rulesets + templates + dependency graph across environments | JSON (+ manifest) | Cross-environment promotion (dev→test→prod) |
| **Excel** | Decision-table rows in/out | XLSX (ClosedXML, H2 per dependencies.md) | Business authoring of tables |
| **Solution** | The whole `BusinessRuleEngine` (schema + web resources + APIs) | Dataverse managed/unmanaged | Platform ALM |

### 17.2 Integrity & governance

- Export is a `Get*`-class read; import is a governed command that runs **`ValidateRule`** on every incoming version before it can be published (§3.3) — a package cannot introduce an invalid or out-of-grammar rule.
- Packages carry a **content hash + source-environment + contract version**; import verifies hash and rejects on tamper.
- Immutable versions import as immutable (a new version id in the target); import never mutates an existing published version.
- Cross-env promotion records provenance in audit (who imported what from where).

### 17.3 Migration package = the promotion path

Dev→Test→Prod promotion uses Migration Packages layered on Dataverse solution ALM. The **managed-solution upgrade trap** (triage #9: new required attributes on existing entities) is avoided by the standing invariant *all new attributes are optional + defaulted*. Production pin governance (ADR-09/12) applies at import time.

---

## 18. SDK Strategy

**[NET-NEW]**.

### 18.1 Principle: SDKs are envelope builders, never logic (ADR-EDS-09)

Every SDK does exactly three things: **build the request envelope, call the surface (Custom API/gateway), parse the response envelope.** No SDK contains, caches-and-reexecutes, or interprets rule logic. All SDKs converge on the identical contract, so a decision is identical across languages.

### 18.2 SDK matrix

| SDK | Target consumers | Transport | Typing | Status |
|-----|------------------|-----------|--------|--------|
| **.NET** (`EDP.Client`) | External apps, services, on-prem callers, batch | `IOrganizationService` (in-org) or `HttpClient` (gateway) | Typed envelope + POCO input mapping (§11) | [NET-NEW] |
| **JavaScript/TypeScript** (`@qdb/edp-client`) | Portal, mobile (RN), web apps | `fetch` → Web API/gateway | Types generated from `GetInput/OutputSchema` | [NET-NEW] |
| **Power Platform** | Canvas/Model apps, Power Automate | Custom connector (§10) | Dynamic schema from `Get*Schema` | [NET-NEW, H2] |
| **Java** (future) | Enterprise integration | OpenAPI-generated over gateway | Generated | [FUTURE] |
| **Python** (future) | Data/ML pipelines (advisory-only consumers) | OpenAPI-generated over gateway | Generated | [FUTURE] |

### 18.3 Generated, contract-locked types

JS/Java/Python types and Power Platform dynamic schemas are **generated from the canonical schema operations** (`GetInputSchema`/`GetOutputSchema`), not hand-written. Publishing a rule version updates the schema; regenerating the SDK types keeps callers in lockstep. This is the mechanism that makes "one canonical model" observable all the way to a Python client.

### 18.4 What SDKs deliberately omit

No local evaluation, no rule parsing, no PCRM handling, no version-selection logic (the service resolves versions). An SDK that grew any of these would be a second runtime — prohibited.

---

## 19. Error Handling

**[EXTEND]** — runtime returns typed diagnostics; formalize the cross-surface taxonomy.

### 19.1 Six error categories, one code namespace

Errors never return `null` and are never swallowed (common.md). Every error is a typed, coded, logged result mapped uniformly across surfaces.

| Category | Code prefix | Meaning | HTTP (gateway) | Retryable |
|----------|-------------|---------|----------------|-----------|
| **Validation** | `EDP-VAL-*` | Envelope/input fails contract (missing required input, wrong type) | 400 | No |
| **Business** | `EDP-BUS-*` | Rule produced a business-rejection outcome (not an error per se — surfaced to user) | 200 (outcome) / 422 (if consumer treats as error) | No |
| **Runtime** | `EDP-RUN-*` | Evaluation error (bad formula at runtime, out-of-grammar) | 422 | No |
| **Metadata** | `EDP-MET-*` | Rule/version/schema not found or unresolved | 404 | No |
| **Security** | `EDP-SEC-*` | AuthN/AuthZ failure, privilege denied | 401/403 | No |
| **System** | `EDP-SYS-*` | Throttle, timeout-guard, Dataverse unavailable, transport fault | 429/503/504 | **Yes** (backoff) |

### 19.2 Error envelope

Errors ride the same ResponseEnvelope: `status=error`, `diagnostics:[{code, category, message, field?, severity}]`, plus `correlationId`/`executionId` for support. Business rejections are **outcomes, not exceptions** — `matched=false` with reasons is a successful execution, distinct from an error (this distinction is load-bearing for monitoring: no-match ≠ failure).

### 19.3 Cross-surface consistency

The **same code** appears in an in-process exception, a Custom API response property, and a gateway HTTP body. Consumers handle one taxonomy regardless of surface. The gateway maps category→HTTP; in-process callers get the typed result; both log the same `correlationId`.

### 19.4 Failure isolation

- Trace-write failure never fails the decision (ADR-13 tier 2, best-effort).
- Audit-write failure **does** fail the operation for governance-critical writes (ADR-13 tier 1) and alerts (§16.4).
- A single item's failure in batch mode drops that item to an error result and continues (partial success with a per-item status array).

---

## 20. Future Roadmap

Architecture is **prepared** for these; none is built now and none may violate the invariants.

| Capability | Horizon | Design hook already in place | Constraint |
|------------|---------|------------------------------|------------|
| **GraphQL** | H3 | Gateway can expose a GraphQL schema generated from `Get*` operations; resolvers forward to Custom API | Gateway stays logic-free |
| **gRPC** | H3 | Gateway adds a proto surface over the same operations | Transport only |
| **Event-Driven** | H3 | `qdb_edp_executionrequest` + Dataverse events → Service Bus | Events *trigger* the runtime, never replace it |
| **Streaming** | H3 | Async/event mechanism extends to per-event streaming execution | Same runtime per event |
| **Multi-Tenant** | H2/H3 | Already per-org isolated (solution + `qdb_edp_` namespace + BU scoping); add a SaaS control plane for tenant onboarding/licensing (Standard/Pro/Enterprise tiers, ratified Phase 1) | One runtime per tenant boundary; no shared mutable state |
| **Multi-Region** | H3 | Gateway regional routing + Dataverse geo; version packages replicate | Determinism preserved (UTC/InvariantCulture) so a rule decides identically in every region |

**Roadmap invariant:** every future transport (GraphQL/gRPC/streaming) is *another face on the gateway or another Dataverse trigger* — the runtime, repository, canonical model, and compiler stay singular. New reach, never new logic.

---

## 21. Architecture Decision Records (ADR-EDS series)

These extend, and do not supersede, ADR-01…ADR-13, ADR-R01…R05, ADR-D01…D09, ADR-G-series. Registered in `adrs/index.md`.

### ADR-EDS-01 — Enterprise Decision Service is a Logical Façade, Not a New Engine
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** The EDS is a versioned contract + adapters over the single `RuleRuntimeService`. Two physical execution surfaces (Dataverse Custom API cloud; CRM Custom Action on-prem) share one runtime assembly. No new evaluation engine is created.
**Rationale:** Preserves ADR-06 (single runtime) and ADR-05 (zero infra) while giving every consumer a stable service.
**Consequences:** All operations are logic-free adapters; adding consumers/transports never adds logic.

### ADR-EDS-02 — Web API Gateway is Transport-Only
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** The optional ASP.NET Web API (`EDP.Gateway`) may authenticate, shape the envelope, rate-limit, and forward to the Custom API/Action. It **must not** reference the runtime or execute rules. It is optional; removing it changes reach, not correctness.
**Rationale:** Enforces the platform-strategy rule and makes "logic stays in CRM" a security boundary. Honors ADR-05 (gateway is infra for reach, not core).
**Consequences:** A compromised gateway yields transport, not decisions. Business logic never leaves the CRM trust boundary.

### ADR-EDS-03 — Command–Query Split Maps to Custom API Action vs Function
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** `Get*` operations are side-effect-free **Functions** (cacheable, GET); `Execute*`/`Test`/`Validate` are **Actions** (POST). No Function mutates state.
**Rationale:** CQS (common.md); enables safe gateway caching of metadata/schema without risking execution caching.
**Consequences:** Clean caching story; clear semantics for consumers and SDKs.

### ADR-EDS-04 — Canonical Decision Envelope with Correlation/Request/Execution IDs
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** One versioned envelope (`contractVersion`, `correlationId`, `requestId`, `executionId`, `ruleRef`, `environment`, `organization`, `executionMode`, `inputs`, `context`, `options`; response adds `status`, `outcome`, `diagnostics`, `trace`, `metrics`, `resolvedVersion`, `wouldResolveVersion`) is used by all operations, surfaces, and SDKs.
**Rationale:** One mapping, one serializer, one monitoring schema across 12 operations × many consumers.
**Consequences:** Contract evolution is explicit via `contractVersion`; correlation threads every hop for support/audit.

### ADR-EDS-05 — Async/Batch Uses a Dataverse-Native Request Entity, No External Queue for Core
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Asynchronous and batch execution enqueue to `qdb_edp_executionrequest` processed by async plugins/flows. External queues appear only via the (separate) Integration Engine, never in the EDS core.
**Rationale:** ADR-05 zero-infra; keeps async within the platform. Respects the 2-minute plugin ceiling by deferring long work.
**Consequences:** No Service Bus dependency for core async; streaming (H3) extends this same mechanism.

### ADR-EDS-06 — Offline Mobile Never Executes Rules Locally
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Mobile offline uses (1) cached prior decisions keyed by version+input-hash, (2) a deferred-execution queue, (3) schema prefetch. It never re-implements evaluation in a client language.
**Rationale:** A client-side evaluator would be a second runtime — violates ADR-06 and risks divergent decisions.
**Consequences:** Offline yields cached/deferred decisions, not freshly-computed ones; correctness and auditability preserved.

### ADR-EDS-07 — CRM Field Write-Back is Opt-In, Governed, and Consumer-Performed
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** `ExecuteRule` is a query by default. Persisting an output to a CRM field requires an authored output binding and is performed by the calling context under its identity; the runtime stays side-effect-free (except trace/audit). Every write-back is audited.
**Rationale:** CQS; explicit, traceable side effects; keeps the runtime pure and reusable.
**Consequences:** No hidden mutations from "just evaluating"; side effects are designed, not incidental.

### ADR-EDS-08 — Locale Affects Interpretation/Formatting Only, Never Determinism
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Language/TimeZone/Currency in the Execution Context govern input interpretation and output presentation only. Evaluation is UTC + InvariantCulture unconditionally (ADR-11).
**Rationale:** Prevents "same rule, different answer by locale"; preserves reproducibility for audit and cross-region parity.
**Consequences:** A rule decides identically everywhere; only display localizes.

### ADR-EDS-09 — SDKs are Envelope Builders Only
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** All SDKs build/parse envelopes and call the surface; none contains rule logic, PCRM handling, or version selection. Typed schemas are generated from `Get*Schema`.
**Rationale:** Guarantees cross-language decision parity; prevents SDK drift into a shadow runtime.
**Consequences:** Publishing a version regenerates types; SDKs stay contract-locked and thin.

### ADR-EDS-10 — In-Process Consumers Call the Runtime In-Proc; Remote Consumers via Surface — Same Assembly
**Status:** Accepted · **Date:** 2026-07-06
**Decision:** Co-resident consumers (CRM plugins/BPF, Process/Form engines in Dataverse) invoke the shared runtime assembly in-process (no network hop); remote consumers use the Custom API/Action (optionally via gateway). Both bind the identical `RuleRuntimeService`.
**Rationale:** Performance for co-located callers without forking logic; one execution semantic for all.
**Consequences:** Exactly one compiled-rule cache and execution path; behavior is topology-independent.

---

## Appendix A — Verified Current-State Inventory (as of 2026-07-06)

| Foundation element | State | Evidence |
|--------------------|-------|----------|
| ONE Runtime (`RuleRuntimeService`) | ✅ Live | 50 tests green; executes in CRM sandbox |
| ONE Repository (22 `qdb_edp_` entities) | ✅ Live | `schema/README.md`, deployed org5869857f |
| ONE Canonical Model (PCRM) | ✅ Live | ADR-03/08; runtime reads PCRM only |
| ONE Compiler (`RuleCompiler` + cache) | ✅ Live | runtime §2 |
| `qdb_edp_EvaluateDecision` (→ ExecuteRule) | ✅ Live | smoke-tested 200 this session |
| `qdb_edp_RuleGovernanceAction` | ✅ Live | maker-checker two-stage |
| Execution log + two-tier trace (ADR-13) | ✅ Live | `qdb_edp_tracejson` shipped 2026-07-06 |
| 6 EDP security roles | ✅ Live | `deploy/bre-roles.js` |
| Test scenario library | ✅ Live | commit a4faea4 |
| **Full 12-operation surface** | ⛏ 3 of 12 exist | this phase designs the rest |
| **On-prem Custom Action surface** | ✳ Design only | §4 |
| **`EDP.Gateway` transport tier** | ✳ Design only | §1, ADR-EDS-02 |
| **Canonical envelope** | ✳ Design only | §11–13, ADR-EDS-04 |
| **SDKs / connector** | ✳ Design only | §10, §18 |
| **Async/batch/parallel modes** | ✳ Design only | §15.6 |

Legend: ✅ live · ⛏ partial · ✳ designed this phase, unbuilt.

## Appendix B — Operation × Surface × Consumer Matrix

| Operation | Cloud API | On-prem Action | Gateway | Portal | Mobile | Process | Form | Integration | Power Automate |
|-----------|:--------:|:--------------:|:-------:|:------:|:------:|:-------:|:----:|:-----------:|:--------------:|
| ExecuteRule | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| ExecuteRuleSet | ✔ | ✔ | ✔ | ○ | ○ | ✔ | ✔ | ✔ | ✔ |
| ExecuteDecisionTable | ✔ | ✔ | ✔ | ○ | ○ | ✔ | ○ | ✔ | ✔ |
| TestRule | ✔ | ✔ | ○ | ✖ | ✖ | ✖ | ✖ | ○ | ○ |
| ValidateRule | ✔ | ✔ | ○ | ✖ | ✖ | ○ | ○ | ✔ | ○ |
| Get* (metadata/schema/version/history/docs/templates) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

✔ primary · ○ available · ✖ not exposed to that consumer.

## Appendix C — Canonical Error Catalogue (representative)

| Code | Category | HTTP | Retry | Meaning |
|------|----------|:----:|:-----:|---------|
| `EDP-VAL-REQUIRED-INPUT` | Validation | 400 | No | A required input was missing |
| `EDP-VAL-TYPE-MISMATCH` | Validation | 400 | No | Input type does not match schema |
| `EDP-BUS-REJECTED` | Business | 200/422 | No | Rule produced a business rejection (outcome) |
| `EDP-RUN-OUT-OF-GRAMMAR` | Runtime | 422 | No | Formula/expression outside EDP-H1 grammar |
| `EDP-MET-RULE-NOT-FOUND` | Metadata | 404 | No | Rule/name unresolved |
| `EDP-MET-NO-PUBLISHED-VERSION` | Metadata | 404 | No | No published version to resolve |
| `EDP-SEC-PRIVILEGE-DENIED` | Security | 403 | No | Caller lacks the EDP execute privilege |
| `EDP-SYS-THROTTLED` | System | 429 | Yes | Service-protection / rate limit; honor Retry-After |
| `EDP-SYS-TIMEOUT-GUARD` | System | 504 | No | Sync request would exceed the plugin ceiling — resubmit async |
| `EDP-SYS-AUDIT-WRITE-FAILED` | System | 503 | Yes | Durable audit (ADR-13 tier 1) failed — operation aborted, alerted |

---

## Document Control

**Supersedes:** nothing (net-new phase).
**Depends on:** phase-0, phase-3, phase-4 (all sub-specs), schema/README.
**Opens:** build backlog for 9 net-new operations, gateway, envelope, SDKs, async/batch, on-prem Custom Actions.
**Next in pipeline:** code review of this design → QA test strategy (Phase 5 pipeline) → audit (Phase 6, incl. C-005 append-only pen-test of the exposed surfaces) → CEO final (Phase 7).
**Non-negotiable on build:** every new artifact is a logic-free adapter into the one runtime. Any PR introducing evaluation logic outside `RuleRuntimeService` is rejected by definition.
