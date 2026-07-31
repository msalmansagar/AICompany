# Enterprise Decision Platform — Entity Binding and Rule Actions

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-BIND-001
**Phase:** Business Requirements Document (BRD)
**Module in Focus:** Business Rules Engine (BRE) — invocation and action surface
**Prepared by:** MSS Technologies — Business Analyst
**Date:** 2026-07-31
**Version:** 1.1 — **supersedes v1.0 (2026-07-27)**
**Status:** DRAFT — pending human ratification

**References:** Phase 0 Blueprint · Phase 1 BRD · Phase 5 Enterprise Decision Service · ADR-05, ADR-06, ADR-EDS-07 · `spikes/oq-b1-client-roundtrip-latency.md` · `phase-3-arch.md` Appendix B
**Authority note:** This BRD does not re-open any decision settled in Phase 0 or the ADR index. Where an existing ADR constrains the solution it is stated as a boundary, not a choice.

---

## 0. What changed in v1.1, and why

v1.0 was written before three things happened: the sponsor specified the actual action list, a
latency spike answered OQ-B1, and competitive research surfaced a better design for step ordering.
Ratifying v1.0 would mean approving a document contradicted by evidence gathered since.

| # | Change | Driver |
|---|---|---|
| 1 | **Scope expanded from binding to binding + actions.** A rule may now *do* things, not only decide them | Sponsor requirement: hide/show fields, set mandatory, assign values, send email, create and update records |
| 2 | **New §5 action taxonomy** separating presentation actions from data effects, with where each runs | Presentation actions do not mutate data, so they cost us no architectural compromise; data effects do |
| 3 | **Client evaluation is per form event, never per field change** | Spike: 480 ms p50 per evaluation, ~0 ms of it ours. Per-field-change is not viable |
| 4 | **OQ-B1 downgraded from blocking to answered**, with a narrow commercial residual | Same spike |
| 5 | **One binding per entity** replaces multi-binding ordering (old FR-B9) | Flowon's Logic Recipe uses this and it removes the ordering problem rather than managing it |
| 6 | **Bindings store a resolved version id**; no name resolution at runtime | Spike: resolve-by-name doubles cost to 656 ms |
| 7 | **New OQ-B6 — cold start** | Spike: 6,147 ms first call after sandbox idle |
| 8 | **Data effects proposed as a second phase** | The two halves have very different risk profiles and should not be gated on each other |

> **Governance note.** The CEO decision dated 2026-07-27 was rendered against **v1.0 scope**. This
> version materially expands that scope, so **that decision does not carry forward** — v1.1 requires
> a fresh decision. Scope must not grow quietly under an old approval.

---

## 1. Executive Summary

EDP today has an **invocation model, not a trigger model**, and a **decision model, not an action
model**. A rule executes only when something explicitly calls it, and when it finishes it returns
values that something else must act on.

The practical result is that **a business analyst can author, validate, simulate, govern and publish
a rule, and nothing will ever happen.** Making it run requires a developer; making it *do* anything
requires another. That contradicts the value proposition the product was funded on and leaves the
largest capability gap against both tracked competitors.

This BRD requests two capabilities:

1. **Entity binding** — a published rule fires automatically on a record event or a form event.
2. **Rule actions** — a rule can change what the user sees on a form, and can cause governed data
   effects such as sending an email or creating a record.

Both are additive. Neither introduces a second rule engine, and neither weakens the governance model
that is our primary differentiator — **provided the decision plane stays pure**, which §5 explains.

---

## 2. Problem Statement

### 2.1 The pain

**A published rule is inert.** The platform can author, validate, simulate, version, approve,
publish, audit and explain a decision — and then cannot fire it, and cannot act on it.

**The autonomy promise is unmet.** Phase 1 established that the product fails if a business analyst
still needs developer help. Authoring autonomy was delivered. **Activation and action autonomy were
not** — the developer dependency simply moved from "write the rule" to "wire it up and make it do
something".

**Real-time form behaviour is absent.** Showing, hiding and requiring fields as a user works is the
single most-used capability of the incumbent products. EDP has no equivalent.

### 2.2 Evidence (verified 2026-07-27)

| Check | Result |
|---|---|
| Registered SDK steps | 30 — 22 Custom API bindings, 3 Update guards, 5 Delete guards |
| Steps on a business entity | **0** |
| Client-side artifacts (`formContext`, `Xrm.Page`, `addOnChange`) | **None in the repository** |
| Write-back capability | Designed only (ADR-EDS-07), consumer-performed, never built |
| Any action capability | **None** |

### 2.3 Cost of inaction

- **Displacement stalls.** A customer cannot migrate off North52 or Flowon onto a product that
  cannot fire a rule on save or change a form.
- **Every deployment carries bespoke code**, re-incurred per customer, eroding the low-TCO position
  and leaving unsupported code in customer tenancies.
- **The governance differentiator is undercut.** If invocation and action are hand-written customer
  code outside the product, the audited trail begins after the most consequential decisions — when
  to run, and what to do about the result.

---

## 3. Business Objectives

| ID | Objective | Success criterion |
|---|---|---|
| BO-B1 | A business analyst activates a rule without developer help | A BA binds a published rule and observes it running, in one session, with no code |
| BO-B2 | Close the primary displacement gap | Appendix B shows parity or better on triggers and on form behaviour |
| BO-B3 | Real-time form behaviour | Fields hide, show, become mandatory and receive values from a governed rule |
| BO-B4 | Invocation and action are as governed as authoring | Bindings and actions are versioned, approved, audited, attributable |
| BO-B5 | No regression to platform safety | Record operations cannot be broken org-wide; recursion is impossible by construction |
| BO-B6 | **The decision plane stays pure** | Simulation, scenarios, replay and explanation continue to work unchanged after actions ship |

---

## 4. Stakeholders

| Stakeholder | Interest |
|---|---|
| Business Analyst / Rule Author | Primary beneficiary — activates and acts on own rules |
| System Customizer / Admin | Owns which entities are bound; carries the blast-radius risk |
| End user | Sees form behaviour and decisions in real time |
| Compliance / Audit | Requires binding and action changes to be as traceable as rule changes |
| Developer | Ceases to be required for routine activation |

---

## 5. Action taxonomy — the load-bearing section

"Action" covers two categories with **very different costs**, and conflating them is the main way
this feature could damage the product.

### 5.1 The split

| Action | Category | Client (form) | Server (plugin) | Mutates data |
|---|---|---|---|---|
| Hide / show field | Presentation | ✅ | ❌ no meaning — there is no form on the server | No |
| Set mandatory / optional | Presentation | ✅ | ❌ *(server equivalent is rejecting the save)* | No |
| Lock / unlock field | Presentation | ✅ | ❌ no meaning | No |
| Show warning / error message | Presentation | ✅ inline | ⚠️ as a blocking validation error | No |
| **Assign value to a field** | **Both** | ✅ | ✅ | On save |
| Send an email | Data effect | ⚠️ excluded — see 5.3 | ✅ | **Yes, irreversible** |
| Create record | Data effect | ⚠️ excluded | ✅ | **Yes** |
| Update another record | Data effect | ⚠️ excluded | ✅ | **Yes** |

### 5.2 Presentation actions cost us no architectural compromise

Hiding a field changes no record. So presentation actions are modelled as **ordinary rule outputs**
with an agreed vocabulary, and the *form* applies them:

```jsonc
{
  "hide":      ["discountApprovedBy", "escalationReason"],
  "mandatory": ["justification"],
  "readOnly":  ["creditLimit"],
  "values":    { "riskTier": "High" },
  "messages":  [{ "field": "amount", "severity": "warning", "text": "Above your approval limit" }]
}
```

The rule remains a **pure function**. Simulation, saved scenarios, replay, determinism and
explanation are all untouched, because nothing acted — the rule merely decided what the form should
look like.

### 5.3 Data effects must not run client-side

Technically possible from form JavaScript, and excluded deliberately: they would fire **on a record
that has not been saved**. A user edits a field, the rule emails an approver, the user closes the
tab. The email is gone; the record never existed. No transaction, no rollback, no idempotency, and
it bypasses the plugin pipeline so the append-only audit guarantees do not apply.

### 5.4 One engine, two entry points

"Client side and server side" means the **single C# runtime evaluated from two contexts** — the form
calls it, the plugin calls it in-process. It does **not** mean a JavaScript evaluator in the browser
alongside the C# one.

Two evaluators produce **dual-engine drift**: they disagree on an edge case — dates, decimal
rounding, null semantics, culture — and the form says approved while the save rejects. It is the
worst bug class a rules engine can have, and there is in-house precedent for the cost: the Dynamic
Form Engine maintains a TypeScript engine and a C# mirror, and keeping them aligned is a standing
burden the company is now building a shared library to eliminate.

This is ADR-06 and it is not re-opened here.

---

## 6. Scope

### 6.1 In scope

**Binding** — a published rule bound to Dataverse entity events (Create, Update, Delete) with
filtering attributes and phase selection; and to form events (load, save).

**Presentation actions** — hide, show, mandatory, optional, lock, unlock, set value, field and form
messages, block save.

**Data-effect actions** — send email, create record, update record, under governance.

**Both** — bindings and actions are first-class governed records: versioned, approved, audited,
attributable, authored in the existing designer.

### 6.2 Out of scope

| Excluded | Reason |
|---|---|
| **In-browser rule evaluation** | ADR-06 — one runtime, no per-channel evaluators (§5.4) |
| **Client-side data effects** | Fires on unsaved, possibly abandoned records (§5.3) |
| Multi-step orchestration — loops, branches, error handling | That is a logic platform, not a decision engine. Competing there means competing with Power Automate and plugins on their own ground. Separate BRD if ever |
| Publish/subscribe events between artifacts | Separate BRD |
| Scheduled / time-based execution | Separate BRD |
| Outbound REST integration | Separate BRD |
| Rollup / cross-record aggregate formulas | Separate BRD |
| Workflow activity entry point | Separate BRD |
| Retrospective execution over existing records | Bulk/batch is Wave 2 |

### 6.3 Boundaries that cannot be re-opened

| Boundary | Source | Consequence |
|---|---|---|
| One runtime, no per-channel evaluators | ADR-06 | The browser **calls** the runtime. Cost: a round trip, measured at 480 ms — see §8 |
| Zero external infrastructure for the core | ADR-05 | No queue, cache or service introduced |
| Write-back is opt-in and governed | ADR-EDS-07 | Extended, not overturned: the dispatcher becomes a governed consumer acting under the triggering user's identity |
| Only Published versions execute | F-01 | A binding may reference only a published version |
| Sandbox 2-minute limit | Platform | Synchronous work must be bounded; heavier work is asynchronous |
| Append-only audit, SoD, maker-checker | ADR-12, ADR-13 | Apply to bindings and actions exactly as to rule versions |
| **The decision plane stays pure** | BO-B6, this BRD | Effects live in a separate action plane, never inside evaluation |

---

## 7. Functional Requirements

*Requirement IDs are stable across versions. **[v1.1]** marks new or materially changed items.*

### 7.1 Binding definition

| ID | Requirement | Priority |
|---|---|---|
| FR-B1 | A binding associates one published rule with one target entity and one trigger | Must |
| FR-B2 | A binding declares its trigger type: record event (server) or form event (client) | Must |
| FR-B3 | Server bindings declare message, phase, mode and filtering attributes | Must |
| FR-B4 | Client bindings declare the form event — load or save | Must **[v1.1]** |
| FR-B5 | Field-to-input mapping uses business names, not schema names (ADR-04) | Must |
| FR-B6 | Outputs may map to target attributes for write-back | Must |
| FR-B7 | A binding may be enabled or disabled without deletion | Must |
| FR-B8 | Rejected at save if the rule is unpublished or a mapped field does not exist | Must |
| FR-B9 | **One binding record per entity**, holding all events and phases for that entity. Ordering is explicit within a phase | Must **[v1.1 — replaces multi-binding ordering]** |
| FR-B35 | A binding stores the **resolved rule version id**; no name resolution at runtime | Must **[v1.1]** |

### 7.2 Server-side execution

| ID | Requirement | Priority |
|---|---|---|
| FR-B10 | A dispatcher plugin resolves the binding and invokes the existing runtime — it contains **no decision logic** | Must |
| FR-B11 | Inputs bind from the record, including existing N:1 navigation and 1:N aggregation | Must |
| FR-B12 | Write-back occurs under the **triggering user's identity**, so platform security applies | Must |
| FR-B13 | Write-back is audited: who, what, old value, new value | Must |
| FR-B14 | **Recursion is impossible by construction** — bounded depth, and written attributes cannot re-trigger their own binding | **Gate** |
| FR-B15 | Sync errors fail the operation intelligibly; async errors are recorded without failing it | Must |
| FR-B16 | Every execution writes a log entry addressable by `ExplainDecision` | Must |
| FR-B17 | A binding may block the record operation on a decision outcome | Must **[v1.1 — raised from Should]** |

### 7.3 Client-side execution

| ID | Requirement | Priority |
|---|---|---|
| FR-B18 | **One shared form script** serves all client bindings — no per-form bespoke JavaScript | Must |
| FR-B19 | The script reads the binding for the current form and registers handlers | Must |
| FR-B20 | Invocation uses the existing Custom API under the signed-in user's context | Must |
| FR-B36 | **Evaluation occurs once per form event — on load and on save — never per field change.** One call returns directives for **all** fields | Must **[v1.1 — from the latency spike]** |
| FR-B37 | Presentation evaluation uses a **non-durable** path, so a form load does not write an execution-log row per user per open | Must **[v1.1]** |
| FR-B21 | Directives apply to form fields without saving the record | Must |
| FR-B22 | A rule may surface a field or form message, and may block save | Must |
| FR-B23 | Concurrent-safe — a slow response must never overwrite newer user input | Must |
| FR-B24 | **The form must never block on the call.** Failure degrades gracefully — never a blocking script error | Must **[v1.1 — strengthened]** |
| FR-B25 | Honours the user's language | Should |

### 7.4 Presentation actions **[v1.1 — new group]**

| ID | Requirement | Priority |
|---|---|---|
| FR-B38 | A rule may declare a field **hidden** or **visible** | Must |
| FR-B39 | A rule may declare a field **mandatory** or **optional** | Must |
| FR-B40 | A rule may declare a field **read-only** or **editable** | Must |
| FR-B41 | A rule may **assign a value** to a field, on the form and on the server | Must |
| FR-B42 | A rule may attach a **message** to a field or the form, with severity (info, warning, error) | Must |
| FR-B43 | The directive vocabulary is a **versioned schema**; an unknown directive is ignored safely by an older client, never fatal | Must |
| FR-B44 | Directives are validated at binding save — every named field must exist on the entity | Must |
| FR-B45 | Presentation directives never bypass platform security. A hidden field is a UX affordance, **not** a security control | Must |

### 7.5 Data-effect actions **[v1.1 — new group]**

| ID | Requirement | Priority |
|---|---|---|
| FR-B46 | Effects execute in a **separate action plane**, in the After phase only — never inside evaluation | **Gate** |
| FR-B47 | A rule may **send an email** from a governed template | Must |
| FR-B48 | A rule may **create a record** on a declared entity with a declared field map | Must |
| FR-B49 | A rule may **update another record** reachable from the anchor | Must |
| FR-B50 | Effects run under the **triggering user's identity** | Must |
| FR-B51 | Effects are **idempotent under retry** — a retried plugin must not send a second email or create a duplicate | **Gate** |
| FR-B52 | Partial failure is explicit: the outcome of every effect is recorded, and a failed effect never leaves the record half-acted without a trace | Must |
| FR-B53 | Every effect is audited — what fired, against what decision, under whose identity | Must |
| FR-B54 | Effects are excluded from simulation and scenario runs; simulation reports **what would fire** without firing it | **Gate** |

### 7.6 Governance

| ID | Requirement | Priority |
|---|---|---|
| FR-B26 | Bindings and actions follow the existing lifecycle: Draft → In Review → Approved → Published | Must |
| FR-B27 | Segregation of duties — an author may not approve their own binding or action | Must |
| FR-B28 | Changes recorded in the append-only audit trail | Must |
| FR-B29 | Creating or enabling a binding in production requires a privilege distinct from rule authoring | Must |
| FR-B30 | An administrator can list every active binding and action and disable any of them from one place | Must |
| FR-B55 | Data effects require a **separate privilege** from presentation actions | Must **[v1.1]** |

### 7.7 Authoring

| ID | Requirement | Priority |
|---|---|---|
| FR-B31 | Bindings and actions are authored in the existing designer | Must |
| FR-B32 | The editor previews which records or form events would trigger it | Should |
| FR-B33 | A rule shows the bindings and actions that reference it | Must |
| FR-B34 | A binding can be tested against a chosen record before publishing, **with effects suppressed** | Should |

---

## 8. Non-Functional Requirements

Targets below are informed by measurement, not estimated — see `spikes/oq-b1-client-roundtrip-latency.md`.

| ID | Requirement | Target |
|---|---|---|
| NFR-B1 | Added latency on a synchronous save path | p95 ≤ 200 ms per binding |
| NFR-B2 | Client evaluation, per form event | **p95 ≤ 1,000 ms** — measured baseline 480 ms p50 / 571 ms p95, of which ~0 ms is ours **[v1.1]** |
| NFR-B3 | Bindings evaluated per entity operation without degradation | ≥ 5 |
| NFR-B4 | Dispatcher overhead when an entity has no binding | Negligible |
| NFR-B5 | A binding failure must never leave a record partially written | Absolute |
| NFR-B6 | Write-backs, effects and binding changes recorded | 100% |
| NFR-B7 | No client-side path may bypass Custom API execute privileges | Absolute |
| NFR-B8 | **A form must remain usable if evaluation is slow or fails** — no blocking wait | Absolute **[v1.1]** |

**Measured context.** One evaluation costs ~480 ms, of which 114 ms is network and platform floor,
329 ms is the Custom API plugin pipeline, 37 ms is the durable log write, and **~0 ms is the rule
engine**. The cost is irreducible platform overhead, which is precisely why FR-B36 reduces the
*number* of calls rather than attempting to optimise them.

---

## 9. Assumptions, Dependencies, Constraints

**Assumptions**
- Model-driven forms are the client surface. Canvas apps and portals are out of scope.
- Existing input binding (N:1 navigation, 1:N aggregation) suffices; no new binding semantics.

**Dependencies**
- **W0-1 strong-name key rotation.** This adds plugin types and cannot deploy until the assembly can
  be re-signed. It would be the **fourth** completed-but-undeployable change queued behind that one
  decision, after the pin guard, `ExecutionId` and binding itself.
- `github-researcher` must confirm no adoptable library exists before implementation.
- Architecture must produce ADRs for the recursion guard, the write-back identity model, the action
  plane separation, and the directive schema.

**Constraints**
- Sandbox 2-minute execution limit; no external infrastructure; all new attributes optional and
  defaulted for managed-solution upgrade safety.

---

## 10. Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| BR-B1 | **Infinite recursion** — an effect or write-back re-triggers its own binding | **Critical** | FR-B14 as a release gate with an adversarial test; effects amplify this, so the test must cover effect-driven loops |
| BR-B2 | **Blast radius** — a bad binding blocks all creates/updates of an entity | Critical | Async default, staged rollout, global kill switch, production privilege |
| BR-B9 | **Purity loss** — actions erode simulation, scenarios, replay and explanation, which are our entire differentiation | **Critical** **[v1.1]** | Separate action plane (FR-B46); effects excluded from simulation (FR-B54); BO-B6 as an explicit objective |
| BR-B10 | **Duplicate effects on retry** — a retried plugin sends a second email | High **[v1.1]** | FR-B51 idempotency as a gate |
| BR-B3 | Save-path latency degrades user experience | High | NFR-B1 measured before release |
| BR-B4 | Client round trip feels slow | Medium | Reduced to one call per form event (FR-B36); measured at 480 ms; form never blocks (NFR-B8) |
| BR-B11 | **Cold start** — 6.1 s on the first call after sandbox idle | High **[v1.1]** | OQ-B6; options are accept, keep-warm, or pre-fetch on form open |
| BR-B12 | **Hidden fields mistaken for security** | Medium **[v1.1]** | FR-B45 states plainly that presentation is not a security boundary; field-level security remains the control |
| BR-B5 | Write-back or effect fails on insufficient user privilege | Medium | Validate at binding save; intelligible failure |
| BR-B6 | Binding becomes an ungoverned back door to production behaviour change | High | Full lifecycle, SoD, audit, separate privileges |
| BR-B7 | Data-protection exposure — decisions written onto records, emails sent | High | Inside the W0-5 review scope |
| BR-B8 | Scope creep into orchestration | Medium | §6.2 exclusions are explicit |

---

## 11. Open Questions

| ID | Question | Status |
|---|---|---|
| **OQ-B1** | Is the ADR-06 server round trip commercially acceptable versus in-browser formulas? | **Largely answered [v1.1].** Measured at 480 ms p50. Per-field-change is ruled out; per-form-event is comfortably acceptable. Residual: will customers accept form-load latency where North52 offers instant in-browser? Flowon ships no client-side execution at all, which suggests the market tolerates it |
| **OQ-B6** | **Cold start posture** — accept 6.1 s on first use after idle, keep the sandbox warm, or pre-fetch on form open? | **Open [v1.1]** — now the largest client-side unknown |
| OQ-B2 | Synchronous server bindings in H1, or async-only? | Decided in the v1.0 gate: async default, sync only where a binding must block. Carried forward |
| OQ-B3 | Who owns the production binding privilege? | Provisional: administrators only. Confirm with the governance owner |
| OQ-B4 | Is blocking a record save in scope? | Decided: yes. Now FR-B17 |
| OQ-B5 | Does this wait for W0-1, or does W0-1 get prioritised? | **Open.** The queue behind that decision would reach four |
| **OQ-B7** | **Phase 1 only, or both phases authorised now?** | **Open [v1.1]** — see §12 |

---

## 12. Recommended phasing **[v1.1]**

The two halves have very different risk profiles and should not gate each other.

| Phase | Content | Risk | Note |
|---|---|---|---|
| **1** | Binding + **presentation actions** + write-back + blocking validation | Moderate | The decision plane stays pure throughout. Delivers the demo-losing capability |
| **2** | **Data effects** — email, create, update | High | Introduces the action plane, recursion amplification and idempotency. Needs its own architecture pass |

**Recommendation: authorise Phase 1 now, Phase 2 after Phase 1 is proven in a customer environment.**
Phase 1 closes the visible competitive gap without touching purity. Phase 2 is where the genuine
architectural risk lives, and it will be safer to design once bindings exist and behave.

---

## 13. Acceptance criteria for BRD exit

- [ ] Decision recorded on **v1.1 scope** — the 2026-07-27 decision covered v1.0 and does not carry forward
- [ ] OQ-B6 (cold start) and OQ-B7 (phasing) answered or explicitly deferred with an owner
- [ ] FR-B14 (recursion), FR-B46 (plane separation), FR-B51 (idempotency) and FR-B54 (simulation excludes effects) accepted as **release gates**
- [ ] §6.2 exclusions confirmed, in particular that orchestration is not being taken on
- [ ] BO-B6 (decision plane stays pure) accepted as a standing objective

## 14. Success metrics

| KPI | Measure | Target |
|---|---|---|
| KPI-B1 | A BA activates a published rule end-to-end, unaided | 100% of usability participants |
| KPI-B2 | Deployments requiring bespoke invocation or action code | **0** |
| KPI-B3 | Recursion incidents in any environment | **0** |
| KPI-B4 | Added p95 save latency per binding | ≤ 200 ms |
| KPI-B5 | Appendix B rows where a competitor is superior on invocation or form behaviour | **0** |
| KPI-B6 | Duplicate effects (emails, records) from retries | **0** **[v1.1]** |
| KPI-B7 | Simulation and scenario behaviour after actions ship | Unchanged **[v1.1]** |

## 15. Traceability

| Objective | Requirements | Risks |
|---|---|---|
| BO-B1 autonomy | FR-B1–B9, B31–B35 | BR-B6 |
| BO-B2 displacement | FR-B10–B25, B36–B45 | BR-B8 |
| BO-B3 form behaviour | FR-B38–B45 | BR-B4, BR-B11, BR-B12 |
| BO-B4 governed invocation | FR-B26–B30, B55 | BR-B6, BR-B7 |
| BO-B5 platform safety | FR-B14, B15, B30, B51, B52 | BR-B1, BR-B2, BR-B10 |
| BO-B6 purity | FR-B46, B54 | BR-B9 |

---

## Approval

| Role | Decision | Date | Record |
|---|---|---|---|
| CEO function — **v1.0 scope** | APPROVE WITH CONDITIONS | 2026-07-27 | `ceo-decision-edp-bind-001.md` — **does not carry forward to v1.1** |
| **v1.1 scope** | **PENDING** | — | Requires a fresh decision |
| Human ratification | **PENDING** | — | Required before the build phase begins |

**Recommended decision:** approve **Phase 1** (binding + presentation actions), defer Phase 2 (data
effects) pending Phase 1 in a customer environment, and treat FR-B14, FR-B46, FR-B51 and FR-B54 as
non-negotiable release gates rather than requirements among others.

> The v1.0 decision was rendered by the same agent that authored the BRD — the author-approves-own-work
> pattern this product forbids for rule versions. That caveat applies equally here and is why human
> ratification is a stated exit criterion.
