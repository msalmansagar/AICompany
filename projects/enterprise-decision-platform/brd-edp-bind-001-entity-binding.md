# Enterprise Decision Platform — Entity Binding (Server-Side + Client-Side)

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-BIND-001
**Phase:** Business Requirements Document (BRD)
**Module in Focus:** Business Rules Engine (BRE) — invocation surface
**Prepared by:** MSS Technologies — Business Analyst
**Date:** 2026-07-27
**Version:** 1.0
**Status:** DRAFT — Pending CEO Approval

**References:** Phase 0 Architecture Blueprint · Phase 1 BRD (EDP-BRE-001) · Phase 5 Enterprise Decision Service · ADR-05, ADR-06, ADR-EDS-07, ADR-EDS-02
**Authority note:** This BRD does not re-open any decision settled in Phase 0 or the ADR index. Where an existing ADR constrains the solution, it is stated as a boundary, not a choice.

---

## 1. Executive Summary

EDP today has an **invocation model, not a trigger model**. A rule executes only when something explicitly calls `qdb_edp_EvaluateDecision`. Nothing in the platform subscribes to record events on a rule's behalf, and nothing runs a rule on a form.

The practical consequence: **a business analyst can author, test, govern and publish a rule, and it will still never run.** Making it run requires a developer to write a plugin, a Power Automate flow, or a gateway call. That directly contradicts the value proposition this product was funded on — that a BA can own a decision without developer involvement — and it is the largest single capability gap against North52, whose dominant usage pattern is precisely *"when this field changes, recalculate that field."*

This BRD requests approval to build two binding surfaces:

1. **Server-side entity binding** — run a published rule automatically on a record event, with governed write-back of outputs.
2. **Client-side form binding** — run a published rule from a Dynamics form on load, field change, or save, and apply its outputs to the form.

Both are additive. Neither introduces a second rule engine, and neither weakens the governance model.

---

## 2. Problem Statement

### 2.1 The Pain

**A published rule is inert.** The platform can author, validate, simulate, version, approve, publish, audit and explain a decision — and then cannot fire it. Every production use requires custom code written outside the product.

**The BA-autonomy promise is unmet.** Phase 1 established that the product fails if a business analyst still needs developer help (risk BR-1). Authoring autonomy was delivered; **activation autonomy was not**. The developer dependency simply moved from "write the rule" to "wire the rule up".

**Real-time decisioning on the form is absent.** North52's most-used capability — recalculating and validating on the form as a user types — has no equivalent. A user must save the record and wait for out-of-band processing to learn the outcome.

**The competitive checklist overstates the position.** `phase-3-arch.md` Appendix B (the C-004 checklist that feeds sales positioning) scores *"Plugin entry point — North52: Yes / EDP H1: Yes — Parity."* This is not accurate against the built system: a plugin backs the Custom API, but no step is registered against any business entity, so no automatic execution exists. The same checklist has **no row at all for client-side formulas**. Correcting it is a deliverable of this engagement.

### 2.2 Evidence (verified 2026-07-27)

| Check | Result |
|---|---|
| Registered SDK steps | 30 — 22 Custom API bindings, 3 Update guards, 5 Delete guards |
| Steps on business entities | **0** |
| Client-side artifacts (`formContext`, `Xrm.Page`, `addOnChange`) | **None anywhere in the repository** |
| Write-back capability | Designed only (ADR-EDS-07), consumer-performed, never built |

### 2.3 Cost of Inaction

- **Displacement stalls.** BO-3 named North52 as the primary displacement target. A customer cannot migrate off North52 onto a product that cannot fire a rule on save.
- **Every deployment carries bespoke code.** Integration effort is re-incurred per customer, per entity, eroding the low-TCO position and creating unsupported code in customer tenancies.
- **The governance differentiator is undercut.** Our strongest claim is a governed, audited decision. If the *invocation* is hand-written customer code outside the product, the audit trail stops at the boundary and the claim weakens.

---

## 3. Business Objectives and Success Criteria

| ID | Objective | Success Criterion |
|---|---|---|
| BO-B1 | A business analyst can activate a rule without developer help | A BA binds a published rule to an entity event and to a form, and observes it executing, in a single session with no code |
| BO-B2 | Close the primary North52 displacement gap | C-004 checklist shows parity or better on both server-side triggers and client-side formulas, and the checklist's accuracy defects are corrected |
| BO-B3 | Real-time decisioning on the form | A rule's outputs are visible to a user on the form before save |
| BO-B4 | Invocation is as governed as authoring | Every binding is versioned, approved, audited and attributable, to the same standard as a rule version |
| BO-B5 | No regression to platform safety | Record operations cannot be broken org-wide by a binding; recursion is impossible by construction |

---

## 4. Stakeholders and Target Users

| Stakeholder | Interest |
|---|---|
| Business Analyst / Rule Author | Primary beneficiary — activates own rules |
| System Customizer / Admin | Owns which entities are bound; bears the blast-radius risk |
| End user (form) | Sees decisions and validation in real time |
| Compliance / Audit | Requires binding changes to be as traceable as rule changes |
| Developer | Ceases to be required for routine activation |
| CEO / Product | Displacement position against North52 |

---

## 5. Scope

### 5.1 In Scope

**Server-side binding**
- Bind a **published** rule version to a target entity and message (Create, Update, and — where justified — Delete).
- Filtering attributes, so the rule fires only when relevant fields change.
- Execution stage selection (pre-validation / pre-operation / post-operation) with safe defaults.
- Synchronous and asynchronous modes.
- **Governed write-back** of rule outputs to target attributes, extending ADR-EDS-07.
- A recursion and depth guard that makes self-retriggering impossible.

**Client-side binding**
- Invoke a published rule from a model-driven form on **form load**, **field change**, and **save**.
- Apply outputs to form fields, and surface messages, warnings and blocking validation.
- A single deployable form script requiring no per-form custom JavaScript.

**Both**
- Bindings are first-class governed records: versioned, approved, published, audited, attributable.
- Authoring UI for bindings inside the existing designer.
- Deploy tooling to register and deregister bindings, consistent with existing `bre-*.js` scripts.
- Correction of the C-004 parity checklist.

### 5.2 Out of Scope

| Excluded | Reason |
|---|---|
| **In-browser rule execution** | Forbidden by ADR-06 (single runtime, no per-channel evaluators). The browser calls the runtime; it never re-implements it. |
| Workflow Activity entry point | A separate C-004 gap; own BRD. |
| Rollup / cross-record aggregate triggers | Distinct capability (North52 rollup formulas); own BRD. |
| Rule cloning, templates, Excel import/export | Separate C-004 gaps already roadmapped to Horizon 2. |
| Binding to non-Dataverse events | Outside the CRM-native boundary (ADR-05). |
| Retrospective execution over existing records | Bulk/batch is Wave 2 scope. |

### 5.3 Architectural Boundaries (cannot be re-opened)

| Boundary | Source | Consequence for this feature |
|---|---|---|
| One runtime, no per-channel evaluators | ADR-06 | Client-side binding **calls the server**. Accepted cost: a network round trip per evaluation. |
| Zero external infrastructure for the core | ADR-05 | No queue, cache or service may be introduced. |
| Write-back is opt-in and governed | ADR-EDS-07 | Extended, not overturned: the dispatcher becomes a *governed consumer* performing write-back under the triggering user's identity. |
| Only Published versions execute | F-01 lifecycle gate | A binding may only reference a published rule. |
| Sandbox execution limit (2 minutes) | Dataverse platform | Synchronous bindings must be bounded; anything heavier is asynchronous. |
| Append-only audit, SoD, maker-checker | ADR-12, ADR-13, existing governance | Apply to bindings exactly as to rule versions. |
| ZEN engine excluded | ADR-01 | JavaScript function nodes remain non-executable on both surfaces. |

---

## 6. Functional Requirements

### 6.1 Binding Definition

| ID | Requirement | Priority |
|---|---|---|
| FR-B1 | A binding associates one published rule with one target entity and one trigger | Must |
| FR-B2 | A binding declares its trigger type: record event (server) or form event (client) | Must |
| FR-B3 | Server bindings declare message, stage, mode (sync/async) and filtering attributes | Must |
| FR-B4 | Client bindings declare the form event (load / change / save) and, for change, the fields watched | Must |
| FR-B5 | A binding maps record or form fields to rule inputs, using business names not schema names (ADR-04) | Must |
| FR-B6 | A binding optionally maps rule outputs to target attributes for write-back | Must |
| FR-B7 | A binding may be enabled or disabled without deletion | Must |
| FR-B8 | A binding is rejected at save if its rule is not published, or if any mapped field does not exist | Must |
| FR-B9 | Multiple bindings on one entity execute in a declared, deterministic order | Should |

### 6.2 Server-Side Execution

| ID | Requirement | Priority |
|---|---|---|
| FR-B10 | A dispatcher plugin resolves the bindings for the entity and message and invokes the existing runtime — it contains no decision logic | Must |
| FR-B11 | Inputs bind from the record, including the N:1 navigation and 1:N aggregation already supported | Must |
| FR-B12 | Write-back occurs under the **triggering user's identity**, not the dispatcher's, so platform security applies | Must |
| FR-B13 | Write-back is audited: who, what, old value, new value | Must |
| FR-B14 | **Recursion is impossible**: execution depth is bounded, and attributes written by a binding cannot re-trigger that same binding | Must |
| FR-B15 | A rule error in a synchronous binding fails the record operation with an intelligible message; in asynchronous mode it is recorded without failing the operation | Must |
| FR-B16 | Every binding execution writes an execution log entry, addressable by `ExplainDecision` | Must |
| FR-B17 | A binding may be configured to block the record operation on a decision outcome (validation use case) | Should |

### 6.3 Client-Side Execution

| ID | Requirement | Priority |
|---|---|---|
| FR-B18 | One shared form script serves all client bindings — no per-form bespoke JavaScript | Must |
| FR-B19 | The script reads the bindings for the current form and registers the required handlers | Must |
| FR-B20 | Rule invocation uses the existing Custom API under the signed-in user's context | Must |
| FR-B21 | Outputs apply to form fields without saving the record | Must |
| FR-B22 | A rule may surface a field-level or form-level message, and may block save | Must |
| FR-B23 | Evaluation is debounced and concurrent-safe; a slow response must not overwrite newer user input | Must |
| FR-B24 | Failure degrades gracefully — the form remains usable and the failure is logged, never a blocking script error | Must |
| FR-B25 | The script honours the user's language (existing i18n posture) | Should |

### 6.4 Governance

| ID | Requirement | Priority |
|---|---|---|
| FR-B26 | Bindings follow the existing lifecycle: Draft → In Review → Approved → Published | Must |
| FR-B27 | Segregation of duties applies — a binding's author may not approve it | Must |
| FR-B28 | Binding changes are recorded in the append-only audit trail | Must |
| FR-B29 | Creating or enabling a binding in production requires a privilege distinct from rule authoring | Must |
| FR-B30 | An administrator can list every active binding and disable any of them from one place | Must |

### 6.5 Authoring Experience

| ID | Requirement | Priority |
|---|---|---|
| FR-B31 | Bindings are authored in the existing designer, in a dedicated area | Must |
| FR-B32 | The binding editor previews which records or form events would trigger it | Should |
| FR-B33 | A rule shows the bindings that reference it, so impact is visible before a change | Must |
| FR-B34 | A binding can be tested against a chosen record before publishing | Should |

---

## 7. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-B1 | Added latency on a synchronous save path | p95 ≤ 200 ms per binding |
| NFR-B2 | Client-side perceived response on field change | p95 ≤ 500 ms |
| NFR-B3 | Bindings evaluated per entity operation without degradation | ≥ 5 |
| NFR-B4 | Dispatcher overhead when an entity has no binding | Negligible; must not measurably affect unbound entities |
| NFR-B5 | Availability posture | A binding failure must never leave a record in a partially written state |
| NFR-B6 | Auditability | 100% of write-backs and binding changes recorded |
| NFR-B7 | Security | No client-side path may bypass the Custom API execute privileges |

---

## 8. Assumptions, Dependencies, Constraints

**Assumptions**
- Target customers accept a server round trip for client-side evaluation (ADR-06 consequence).
- Model-driven forms are the client surface; canvas apps and portals are out of scope for this feature.
- Existing input binding (N:1 navigation, 1:N aggregation) is sufficient; no new binding semantics are required.

**Dependencies**
- **W0-1 strong-name key rotation.** This feature adds a plugin type, so it cannot deploy until the assembly can be re-signed. It joins the queue already holding the pin guard and the `ExecutionId` change.
- Per the company dependency rule, `github-researcher` must confirm no adoptable library exists before implementation begins.
- Architecture phase must produce ADRs for the recursion guard and the write-back identity model.

**Constraints**
- Sandbox 2-minute execution limit.
- No external infrastructure.
- Managed-solution upgrade safety: all new attributes optional and defaulted.

---

## 9. Business Risks and Mitigations

| ID | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| BR-B1 | **Infinite recursion** — write-back re-triggers the binding | **Critical** — org-wide outage | High if unguarded | Depth bound plus exclusion of written attributes from filtering attributes; FR-B14 is a hard acceptance gate |
| BR-B2 | **Blast radius** — a bad binding blocks all creates/updates of an entity | Critical | Medium | Async default where possible; staged rollout; one-click global disable (FR-B30); production binding privilege (FR-B29) |
| BR-B3 | Save-path latency degrades user experience | High | Medium | NFR-B1 as a hard gate; measured before release |
| BR-B4 | Client-side round trip feels sluggish | Medium | Medium | Debounce; bind to change and save rather than keystroke; measure against NFR-B2 |
| BR-B5 | Write-back under user identity fails on insufficient privilege | Medium | Medium | Validate at binding save; fail with an intelligible message |
| BR-B6 | Binding becomes an ungoverned back door to production behaviour change | High | Medium | Full lifecycle, SoD and audit (§6.4) |
| BR-B7 | PDPPL exposure — decisions written onto records and logged | High | Medium | Route through the existing data-protection review (W0-5) before production |
| BR-B8 | Scope creep into rollups and workflow activities | Medium | High | §5.2 exclusions are explicit |

---

## 10. Open Questions for CEO / Stakeholders

| ID | Question | Needed by |
|---|---|---|
| OQ-B1 | Is the ADR-06 consequence — every client-side evaluation is a server round trip — commercially acceptable versus North52's in-browser formulas? | Before architecture |
| OQ-B2 | Should synchronous server bindings be permitted at all in Horizon 1, or async-only until latency is proven in a customer environment? | Before architecture |
| OQ-B3 | Who owns the production binding privilege — rule authors, or system administrators only? | Before architecture |
| OQ-B4 | Is blocking a record save on a decision outcome (FR-B17) in Horizon 1 scope, or deferred? | Before architecture |
| OQ-B5 | Does this feature wait for W0-1, or does W0-1 get prioritised because the undeployable queue now holds three changes? | Immediate |

---

## 11. Acceptance Criteria for BRD Exit

- [ ] CEO decision recorded: approve / approve-with-conditions / reject
- [ ] OQ-B1 through OQ-B4 answered or explicitly deferred with an owner
- [ ] Recursion prevention (FR-B14) accepted as a hard release gate
- [ ] Scope exclusions in §5.2 confirmed
- [ ] C-004 checklist correction confirmed as a deliverable

## 12. Success Metrics

| KPI | Measure | Target |
|---|---|---|
| KPI-B1 | BA activates a published rule end-to-end, unaided | 100% of usability participants |
| KPI-B2 | Deployments requiring bespoke invocation code | 0 |
| KPI-B3 | Recursion incidents in any environment | 0 |
| KPI-B4 | Added p95 save latency per binding | ≤ 200 ms |
| KPI-B5 | C-004 rows where North52 is superior on invocation | 0 |

---

## 13. Requirements Traceability

| Business Objective | Functional Requirements | Risks |
|---|---|---|
| BO-B1 BA autonomy | FR-B1–B9, FR-B31–B34 | BR-B6 |
| BO-B2 Displacement | FR-B10–B25 | BR-B8 |
| BO-B3 Real-time form decisions | FR-B18–B25 | BR-B4 |
| BO-B4 Governed invocation | FR-B26–B30 | BR-B6, BR-B7 |
| BO-B5 Platform safety | FR-B14, FR-B15, FR-B30 | BR-B1, BR-B2, BR-B3 |

---

## Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | | | |

**Recommended decision:** Approve, subject to answers on OQ-B1 and OQ-B2, and with FR-B14 (recursion impossibility) treated as a non-negotiable release gate rather than a requirement among others.
