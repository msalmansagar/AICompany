# Enterprise Decision Platform — Phase 1 CEO Decision

**Engagement ID:** EDP-BRE-001
**Phase:** 1 — CEO Decision (BRD Approval Gate)
**Module:** Business Rules Engine (BRE)
**Parent Product:** Maqsad Low-Code Platform
**Decision by:** CEO, Maqsad AI
**Date:** 2026-07-03
**BRD Version Reviewed:** 1.0 (phase-1-ba.md)
**Architecture Reference Reviewed:** Phase 0 Blueprint (phase-0-architecture.md)

---

## Decision

**APPROVE WITH CONDITIONS**

The BRD is approved as the governing requirements document for EDP-BRE-001. Phase 2 (Dependency and GitHub Research) is authorised to proceed immediately, subject to the conditions listed in Section 7 of this document.

---

## 1. Business Case Assessment

The problem is genuine, well-scoped, and commercially actionable. Business rules buried in C# plugins and workflow definitions are a systemic pain across every Dynamics CRM organisation in a regulated sector. The consequences — week-long change lead times, zero traceability, channel duplication, and compliance exposure — are recurring and expensive. The BA has articulated this with clarity and precision.

The core value proposition is sound: shift policy ownership from developers to Business Analysts by making rules visual, versioned, governed, and self-service. This is not a speculative capability — North52 has proven the market exists. Our differentiation play (stronger governance, native data residency, AI trajectory, zero external infrastructure) is credible and defensible against incumbents.

The ROI logic is correct. Developer time freed from routine policy-change maintenance is a measurable saving. Compliance cost reduction (audit readiness, traceable decisions) is a hard-dollar benefit in financial services and healthcare. The data-residency advantage is a buying accelerator in regulated sectors where cloud-external rule engines are becoming liabilities. The commercial model (ISV-distributable, Dynamics-native) aligns with how SI partners and enterprise customers already budget.

The Horizon 1 MVP scope is the right first bet. It proves both architectural spines — Single Runtime and Metadata-Driven Authoring — end-to-end before any horizontal expansion. The scope is tight enough to be deliverable in a single horizon and complete enough to generate real customer value and market feedback. The decision to defer Excel import/export, approval workflow chains, version diffing, and AI assistance to Horizon 2 and beyond is disciplined and correct. Do not let customer requests or internal enthusiasm push these into Horizon 1.

One note on competitive framing: the BRD correctly identifies North52 as the primary displacement target. That framing must remain consistent through all subsequent phases. Phase 3 architecture must include an explicit competitive feature-parity checklist against North52, so we know exactly what Horizon 1 delivers and what it does not.

---

## 2. Phase 0 Conformance Verdict

The BRD was audited against all eleven Phase 0 architectural invariants (Appendix B of the blueprint). No contradictions were found. The mapping is complete:

| Invariant | BRD Conformance |
|-----------|----------------|
| 1 — One Runtime | FR-021 explicitly invokes single native C# runtime |
| 2 — No External Infrastructure | Section 5.2 explicitly excludes Docker, Kubernetes, Azure Functions, Node, Rust, external runtime |
| 3 — Standard CRM Solution | FR-042–FR-043 confirmed |
| 4 — Rules in CRM/Dataverse | FR-014 confirmed |
| 5 — GoRules designer only; ZEN not runtime | FR-021 and FR-006 confirmed |
| 6 — Immutable Published Versions | FR-016 and FR-017 confirmed |
| 7 — Metadata-Driven Authoring | FR-001 and FR-002 confirmed |
| 8 — Cloud/On-Prem Runtime Parity | FR-024, NFR-007 confirmed |
| 9 — Deterministic Execution; AI Advisory Only | No AI in Horizon 1 runtime scope |
| 10 — Security Inherited from Platform | FR-038 confirmed |
| 11 — Module Independence | Section 5.3 and BRE scope boundary confirmed |

The BRD is internally consistent and does not re-open any settled Phase 0 decision. This is noted favourably.

---

## 3. Success Criteria and KPI Ruling

The five proposed KPIs are accepted with one amendment and one addition.

**KPI-1 — Time-to-first-production-decision: ACCEPTED**
Target of under one working day is the right bar. The structured usability study in Phase 5 with real Business Analyst participants is the correct measurement method. The role-based timestamp tracking from the Rule Repository is a sound complement for post-launch monitoring. This KPI is the north-star test of the product's core promise.

**KPI-2 — Developer-free authoring rate: ACCEPTED WITH AMENDMENT**
The 70% target at six months post-launch is reasonable as a floor. However, the measurement methodology (role identity analysis on Rule Repository records) has a gap: it cannot detect informal developer assistance that leaves no system footprint. The Phase 5 usability study must supplement this with direct observation. The target is accepted; the measurement plan must be tightened in Phase 5.

Additionally, 70% within six months should be a floor, not an aspiration. The product must be designed to achieve 90%+ developer-free authoring for standard decision types within 12 months. Phase 3 architecture must document which decision types are expected to require developer involvement (complex custom functions, new entry adapters) and which must not (policy tables, eligibility expressions, calculation nodes). This distinction is the design accountability boundary.

**KPI-3 — Decision execution latency P95 ≤ 500ms: ACCEPTED**
This is an architectural target as much as a KPI. It must be a hard gate in Phase 5, not a benchmark to be reviewed and softened. The P99 ≤ 2,000ms ceiling and the 30-second absolute maximum are also confirmed. Phase 3 must specify the complexity profile (max conditions, max nesting depth, max rule-chain length) that the runtime guarantees to evaluate within P95. Decisions exceeding that profile must be flagged in the designer at authoring time.

**KPI-4 — Rule-change lead time: ACCEPTED**
One working day for simple changes (under ten condition changes) and three working days for complex changes. These are credible targets that directly address the "weeks, not hours" pain articulated in the problem statement. Measurement from version lifecycle timestamps is clean and requires no additional infrastructure.

**KPI-5 — Governance compliance rate 100%: ACCEPTED**
This is a platform-enforced constraint (FR-008 blocks publication without simulation), not just a target. It is retained as a KPI because its measurement in Phase 5 validates that the enforcement gate cannot be bypassed. If Phase 5 finds that 100% is not achievable under all paths, that is a conformance failure, not a target adjustment.

**KPI-6 (ADDED) — Commercial adoption rate: REQUIRED**
The five existing KPIs measure operational performance but carry no commercial signal. I am adding a sixth KPI: the number of distinct customer environments (licenced and activated) within three months of general availability. The target is to be set jointly by the CEO and the commercial team before Phase 7, based on the design-partner pipeline built under Condition C-003. This KPI must be tracked from the first commercial deployment.

---

## 4. Rulings on OQ-6 and OQ-7 (Escalated Commercial Decisions)

### OQ-6 — ISV Marketplace Commercial and Revenue Model

**Ruling: DEFER to Horizon 3, with strategic direction set now.**

The deferral is confirmed. No marketplace commercial infrastructure will be built or committed to before Horizon 3. The Horizon 1 technical foundation work (JSON schema publication, JSON import/export capability, conceptual signing model definition) is approved as described in the BRD.

Strategic direction for Horizon 3 (to guide architecture decisions in Horizons 1 and 2):

The commercial model will be a **revenue-sharing arrangement**, not a flat listing fee. Revenue sharing aligns Maqsad's incentive with ISV success: we earn more when ISV template packs generate customer value and adoption. A flat fee creates an adversarial dynamic and discourages smaller ISVs from participating.

The revenue-sharing percentage and payment structure are not set at this phase — that requires market intelligence and legal review. However, the architecture must accommodate the following from Horizon 1 onward: (a) signed template packs with Maqsad-issued certificates, (b) per-pack tracking at import time to support future royalty computation, and (c) an ISV identity concept in the signing model that can later map to a commercial record.

The marketplace governance model (ISV onboarding, security review, sandboxed function execution) is approved as described. Unsigned packs are rejected at import. This is a non-negotiable security and brand protection requirement.

Full commercial terms, platform fee structure, and ISV partner programme require a dedicated CEO/Board decision before any Horizon 3 marketplace development begins. That decision gate is recorded here as a future commitment.

### OQ-7 — Licensing and Packaging Model

**Ruling: TIER STRUCTURE RATIFIED; PRICE POINTS AND STANDARD TIER LIMIT DEFERRED.**

The per-environment licensing model is confirmed as the base commercial structure. Per-environment pricing is the dominant pattern for Dynamics ISV solutions and aligns with how CRM administrators budget. Per-seat and per-decision models create excessive friction at procurement in this market and are rejected.

The three-tier structure (Standard / Professional / Enterprise) is ratified as the framework. The targeting rationale is sound:
- Standard: SMB and first-time adopters, single environment.
- Professional: Mid-market ISVs and enterprise single-product teams, up to three environments.
- Enterprise: Large enterprise and Dynamics SI partners, unlimited environments with AI and marketplace access in Horizon 3.

**Amendment to Standard Tier scope:** the 50-active-published-decision limit on the Standard tier is flagged as a potential adoption barrier. A new customer authoring their first rules may reach this limit before seeing value, triggering a forced upgrade conversation too early in the relationship. The commercial team must review this cap with at least three design-partner prospects before it is published. I will not block Phase 2 on this, but it must be resolved under Condition C-003 before Phase 7.

Price points are explicitly deferred to Phase 7. Pricing must be informed by competitive intelligence against North52, design-partner feedback, and the SI partner programme structure. Setting price points now without that data would be premature and likely wrong.

Any partnership or OEM arrangements must come to the CEO for sign-off before any agreement is made. This is not delegable.

---

## 5. Rulings on Remaining Open Questions (OQ-1 through OQ-5, OQ-8 through OQ-10)

### OQ-1 — Performance SLA: ACCEPTED

P95 ≤ 500ms, P99 ≤ 2,000ms, 30-second absolute ceiling for all standard decision profiles. This is confirmed as an architectural constraint, not a soft target. Phase 3 must define the complexity boundary that the runtime guarantees to meet. Phase 5 must measure against it on both cloud and on-prem. Failure to meet P95 under the defined profile is a release blocker, not a deviation to document.

### OQ-2 — MVP Authoring Styles: ACCEPTED

Three styles in Horizon 1: Decision Tables, Condition/Expression Trees, and Formula/Calculation Nodes. The rationale is correct — limiting to tables alone would require developer involvement for eligibility decisions and calculation rules, directly undermining BO-1. All three styles must be demo-ready and usability-tested with real Business Analysts in Phase 5 before any release.

### OQ-3 — Version Resolution Policy: ACCEPTED

Default resolution to the latest Published version; caller-specified pinning available for long-running cases. Single resolver authority. The Phase 3 team must specify: (a) the exact API contract for expressing a version pin, (b) the runtime behaviour when a pinned version has been retired, and (c) whether production pinning requires governance justification in the Rule Repository. Point (c) is a governance decision with compliance implications and must not be left to the architect alone.

### OQ-4 — On-Prem AI Degradation: ACCEPTED WITH DISCLOSURE CONDITION

The position is correct: all core functionality (authoring, versioning, governance, simulation, execution, trace) operates with zero cloud dependency on-prem. AI features require cloud connectivity and are absent in air-gapped deployments. This is accepted.

**Mandatory disclosure requirement (recorded as Condition C-001):** every customer-facing document, pitch deck, product sheet, and trial onboarding flow must clearly identify which capabilities require cloud connectivity before those customers make a purchase decision. Discovering this after contract signature is a trust and retention risk. This is not optional.

### OQ-5 — Trace Retention Policy: ACCEPTED

Execution trace default 90 days (customer-extensible to 7 years). Governance audit 7-year minimum, append-only, non-configurable. Simulation/test-run trace 30 days (customer-reducible to 7 days).

The 7-year floor on governance audit records is correct and non-negotiable for our target sectors (financial services, insurance, healthcare). Phase 6 audit must verify that the append-only constraint cannot be circumvented by any administrative path, including direct record updates through the CRM/Dataverse SDK. Any finding of a bypass path is a release blocker.

The data-classification rules for trace content (redacting FLS-protected field values, storing field names but not restricted values, no PII in structured logs) are accepted as stated in the BRD and must be validated in Phase 6.

### OQ-8 — Initial Target Industries: ACCEPTED

Priority sequence: (1) Financial Services/Lending, (2) Insurance, (3) Healthcare/Public Sector. This sequence is based on Dynamics ISV density, regulatory audit pressure, and existing North52 displacement opportunity — all defensible criteria.

This sequencing must inform Phase 3 decisions about which decision-type examples and template structures are used in usability testing, documentation, and the go-to-market narrative. The product must not launch with generic examples; it must launch with Financial Services/Lending examples that resonate immediately with the primary target buyer.

### OQ-9 — PCF vs. Web Resource: ACCEPTED (No CEO Decision Required)

Web resource for Horizon 1 is confirmed on the grounds of CRM on-prem compatibility and delivery speed. The Horizon 2 PCF re-evaluation point is noted. This decision belongs to the architect in Phase 3; the CEO does not need to be re-consulted unless the architect identifies a material risk requiring escalation.

### OQ-10 — Success Metrics: ACCEPTED WITH AMENDMENT

The five-KPI framework is accepted with the amendment and addition recorded in Section 3 of this document. The measurement instrumentation plan (all baseline metrics derivable from Rule Repository and execution trace records, no external analytics infrastructure) is approved. Leading indicators are confirmed as useful signals and must be surfaced in a post-launch dashboard, even if only as manual CRM queries in Horizon 1.

---

## 6. Strategic Risks

These are business and commercial risks. Technical risks are addressed in Phase 3. Mitigations are required; they are not optional guidance.

**SR-1 — Usability shortfall is the highest commercial risk.**
If a Business Analyst cannot author and publish a standard decision without developer help, the product's core proposition fails. No feature richness compensates for this. Structured usability testing with real BA participants in Phase 5 is a hard gate. If Phase 5 usability results show that more than 30% of standard decision tasks require developer involvement, Phase 5 fails and the product does not proceed to Phase 6.

**SR-2 — North52 incumbent relationships.**
North52 is embedded in customer environments, backed by existing implementation partner relationships, and is a known quantity. We are unknown. Early sales cycles will require direct head-to-head comparisons. If the governance story (version history, simulation gate, segregation of duties, audit trail) is not positioned as the decisive differentiator from day one, we will compete on feature parity and lose on familiarity. The go-to-market narrative must centre on governance, not raw rule authoring.

**SR-3 — Pricing risk before competitive intelligence.**
Setting price points without competitive intelligence against North52 and without design-partner validation is a significant commercial risk. Under-pricing cedes margin; over-pricing blocks adoption. Price points must not be set before Condition C-003 (design-partner engagement) is completed. This condition must be cleared before Phase 7.

**SR-4 — Enterprise rule complexity and performance degradation.**
Real-world enterprise decision sets (large financial services policy tables, complex insurance underwriting rules) can be substantially more complex than the reference standard profile (20 conditions, 5 nested sub-expressions). If the runtime performance degrades unexpectedly under production-grade complexity, early enterprise customers will not renew. Phase 3 must define the complexity ceiling honestly and phase the authoring tools to make authors aware when they approach it.

**SR-5 — Developer ecosystem and marketplace chicken-and-egg.**
The marketplace and ISV ecosystem strategy depends on having a customer base that ISVs want to reach. The customer base depends on the product being available. We must build initial template packs in-house (Maqsad-produced, not ISV-produced) for the Financial Services and Insurance verticals, so the marketplace is not empty at launch. Relying on ISVs to fill the marketplace before we have customers is a structural error.

**SR-6 — On-prem market erosion vs. cloud-only feature pacing.**
A meaningful portion of the target market is migrating to Dynamics 365 Online. If cloud-native customers demand AI assistance and marketplace features earlier than Horizon 3, the product will feel behind cloud-first competitors. The roadmap commitment to on-prem parity must not become a reason to slow cloud features. Horizons 2 and 3 must explicitly identify which capabilities are cloud-first with on-prem graceful degradation, versus which are simultaneous.

**SR-7 — Data residency regulatory trajectory.**
The in-tenancy data residency posture is a strategic advantage today. If regulations evolve to require external regulatory reporting (common in banking), the "zero external data egress" invariant may be in tension with compliance obligations. This is a Horizon 3 risk, but the architecture must not make future opt-in external reporting impossible. Phase 3 should document how the optional/non-core extension model (Phase 0 Section 12.4) could accommodate a governed, consent-based reporting adapter without violating the core invariants.

---

## 7. Conditions

The following conditions must be cleared by the phase indicated. No phase transition gate may be passed with open conditions from a prior phase without explicit CEO re-approval.

**C-001 — Customer-facing disclosure of cloud-only features (by Phase 3)**
All customer-facing materials (product sheets, trial onboarding, pitch decks, documentation site) must include a clear, prominent disclosure of which capabilities require cloud connectivity and are unavailable on air-gapped on-prem deployments. This document must exist before any customer demo or pilot begins. The Phase 3 architect deliverable must include a documented capability matrix (cloud-only / on-prem-capable / both) that serves as the source for this disclosure.

**C-002 — Phase 3 complexity ceiling and authoring-time guardrails (by Phase 3)**
Phase 3 must formally define the rule-complexity profile that the runtime guarantees to evaluate within P95 ≤ 500ms. The designer must surface a warning when an author approaches or exceeds that profile. This is not a documentation item — it is a design requirement that must appear in the Phase 3 architecture output. Phase 4 build cannot begin without it.

**C-003 — Design-partner validation before commercial packaging (by Phase 7)**
At least three design-partner customers (from the Financial Services or Insurance verticals) must be engaged before Phase 7. Their input must inform: (a) the Standard tier published-decision limit, (b) the price-point structure for all three tiers, and (c) confirmation that the per-environment licensing model matches their budget reality. Phase 7 commercial packaging approval is blocked until this condition is cleared. The design-partner programme must begin no later than the start of Phase 4.

**C-004 — Competitive feature-parity checklist against North52 (by Phase 3)**
Phase 3 must produce an explicit side-by-side capability comparison of EDP Horizon 1 versus North52's current offering. This comparison must identify: features where EDP Horizon 1 is superior, features where North52 is superior, and features where EDP deliberately defers (with the Horizon delivery timeline noted). This checklist is the go-to-market readiness gate. Without it, the sales team cannot position the product.

**C-005 — Governance audit append-only bypass audit (by Phase 6)**
Phase 6 must include an explicit test scenario attempting to update or delete a governance audit record and an execution trace record through all available API paths (Web API, Organisation Service SDK, direct SQL if applicable on-prem). Any bypass path found must be remediated before Phase 7. This is a compliance non-negotiable.

**C-006 — Version pinning governance policy defined (by Phase 3)**
The Phase 3 architecture must define whether production-environment version pinning requires recorded governance justification (a field on the decision request, a log entry, or a governing configuration on the consuming plugin). This is not a technical detail — it is a compliance decision. Untracked production pinning creates an audit gap: if a consumer pins an old version and a regulatory audit asks why, there must be an answer in the system. The architect must consult the CEO before this decision is finalised in Phase 3.

---

## 8. Business Objectives Confirmation

Business Objectives BO-1 through BO-7 are confirmed as the governing success criteria for this engagement.

| Objective | CEO Confirmation |
|-----------|-----------------|
| BO-1 — Reduce cost and lead time of policy change | Confirmed. The 1-working-day target is the north-star metric. |
| BO-2 — De-risk decision logic | Confirmed. Governance, auditability, and simulation are first-class requirements, not features. |
| BO-3 — Displace incumbents | Confirmed. North52 is the primary target. Condition C-004 addresses go-to-market alignment. |
| BO-4 — Protect the data trust boundary | Confirmed. Zero external egress for core function is non-negotiable. Condition C-001 addresses disclosure. |
| BO-5 — Create a platform flywheel | Confirmed. The integration contract (Phase 3) enables Form and Process engines to consume BRE from Horizon 1. |
| BO-6 — Enable a rule marketplace (foundation) | Confirmed. JSON schema and import/export in Horizon 1; marketplace in Horizon 3. OQ-6 direction set in Section 4. |
| BO-7 — Support multi-tenant, multi-industry deployment | Confirmed. No hardcoded rules, GUIDs, or thresholds in any shipped artefact. |

---

## 9. Horizon 1 Scope Confirmation

The Horizon 1 MVP scope defined in BRD Section 5.1 is confirmed as the delivery scope for Phases 2 through 5. The out-of-scope list in Section 5.2 is confirmed. The following items are specifically called out as scope protection targets — they must not migrate into Horizon 1 under any circumstances without a new CEO BRD approval:

- Full multi-step approval chains (Horizon 2).
- Excel import/export (Horizon 2).
- Visual debugger (Horizon 2).
- Workflow Activity entry point (Horizon 2).
- AI-assisted rule generation (Horizon 3).
- Rule Marketplace (Horizon 3).
- GoRules ZEN runtime (excluded at all horizons, permanently).

Any scope change request for Horizon 1 must be submitted as a revised BRD and approved at a new Phase 1 gate.

---

## 10. Phase 2 Go/No-Go

**Phase 2 (Dependency and GitHub Research) is authorised to proceed.**

Phase 2 must address the following in priority order:

1. **GoRules JDM Editor** — validate license (must be compatible with commercial product distribution), star count, active maintenance, React embeddability, and ability to be hosted in a Dynamics web resource. If GoRules JDM Editor fails on any of these dimensions, Phase 2 must surface at least one alternative designer surface before Phase 3 begins. Phase 3 does not start until this is resolved.

2. **JSON rule definition parsers and evaluator libraries for C#** — validate whether any 1,000-plus-star open-source C# rule evaluation libraries exist that could serve as the native runtime foundation. Adoption over building-from-scratch is the standing rule, subject to license fit and Phase 0 invariant compliance (no external runtime; must run in CRM sandbox).

3. **CRM/Dataverse metadata SDK libraries** — validate available tooling for reading metadata in plugin/web resource context.

4. **GoRules ZEN runtime** — confirm what it does and formally document why it is excluded. This documentation anchors the invariant and prevents future drift.

Phase 2 must produce a `dependencies.md` file at `projects/enterprise-decision-platform/dependencies.md` with every evaluated library, its GitHub URL, star count, license, and adoption decision (adopt/reject/monitor), including rationale.

---

## Approval Record

| Role | Name | Decision | Date |
|------|------|----------|------|
| CEO | Maqsad AI | APPROVE WITH CONDITIONS | 2026-07-03 |
| Business Analyst | Maqsad AI | Submitted | 2026-07-03 |
| Architect | Pending | For awareness — approves in Phase 3 | — |

---

## Summary for Engagement Record

**Verdict:** APPROVE WITH CONDITIONS

**Business case:** Sound. The problem is real, the market is proven (North52 incumbency), the differentiation is credible (governance + data residency + zero external infrastructure), and the MVP scope is appropriately bounded.

**KPIs:** Five accepted, one amended (KPI-2 measurement must be supplemented with usability observation), one added (KPI-6 commercial adoption rate, target to be set pre-Phase 7).

**OQ-6 (Marketplace):** Deferred to Horizon 3. Strategic direction set: revenue-sharing model, not flat fee. Technical foundation in Horizon 1 approved.

**OQ-7 (Licensing):** Three-tier per-environment structure ratified. Price points and Standard tier decision limit deferred pending design-partner validation (Condition C-003). OEM/partnership arrangements require CEO sign-off.

**Six conditions:** C-001 (disclosure by Phase 3), C-002 (complexity ceiling by Phase 3), C-003 (design-partner validation by Phase 7), C-004 (North52 competitive checklist by Phase 3), C-005 (audit bypass test by Phase 6), C-006 (version pinning governance policy by Phase 3).

**Phase 2:** Authorised to proceed.

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT — EDP-BRE-001 PHASE 1 CEO DECISION
═══════════════════════════════════════════════════
```
