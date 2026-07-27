# EDP Entity Binding — CEO Decision (BRD Approval Gate)

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-BIND-001
**Phase:** BRD Approval Gate
**Date:** 2026-07-27
**BRD Reviewed:** `brd-edp-bind-001-entity-binding.md` v1.0
**Decision by:** MSS Technologies — CEO function

> **Independence caveat, recorded deliberately.** This decision was rendered by the same
> agent that authored the BRD. That is the author-approves-own-work pattern this very product
> forbids for rule versions (segregation of duties, FR-B27). It is recorded here rather than
> hidden. **This decision is a recommendation requiring human ratification before the build
> phase begins**, and two of the five open questions are escalated unanswered because they
> require market and organisational knowledge the author does not hold.

---

## Decision

**APPROVE WITH CONDITIONS.**

The architecture phase is authorised to begin **only after OQ-B1 is answered** (see §4).
No implementation is authorised by this decision.

---

## 1. Business Case Assessment

The case is accepted, and it is stronger than a normal feature request because it closes a
gap between what the product claims and what it does.

The platform was funded on the proposition that a business analyst can own a decision without
developer involvement. Authoring autonomy was delivered — the analyst can author, validate,
simulate, govern, publish, audit and explain. **Activation autonomy was not.** A published
rule is inert until someone writes code to call it, which means the developer dependency was
relocated, not removed. Every customer deployment therefore carries bespoke invocation code
that the product does not own, does not govern, and cannot audit.

That last point is the one that decides this. Our primary differentiator against North52 is
governance: an append-only trail, segregation of duties, simulation gates, version pinning
with justification. **If the invocation is hand-written customer code sitting outside the
product, the governed trail begins after the most consequential decision — when and whether
to run at all.** The differentiator is weaker than we have been claiming.

Business objectives BO-B1 through BO-B5 are confirmed as stated.

## 2. Conformance Verdict

The BRD does not re-open any settled decision. Specifically:

| Boundary | Verdict |
|---|---|
| ADR-06 — one runtime, no per-channel evaluators | **Honoured.** The browser calls the runtime rather than re-implementing it. Correctly treated as a constraint, not a choice. |
| ADR-05 — zero external infrastructure | **Honoured.** No queue, cache or service introduced. |
| ADR-EDS-07 — write-back opt-in and governed | **Extended, not overturned.** The dispatcher becomes a governed consumer acting under the triggering user's identity. Acceptable. |
| ADR-01 — ZEN excluded | **Honoured.** JavaScript function nodes remain non-executable on both surfaces. |
| F-01 — published-only execution | **Honoured.** A binding may reference only a published version. |

Conformance is clean. No ADR exception is requested, and none is granted.

## 3. Ruling on the Checklist Defect

The BRD reports that `phase-3-arch.md` Appendix B — the C-004 parity checklist feeding sales
positioning — scores *"Plugin entry point: Parity"*, which the built system does not support,
and omits client-side formulas entirely.

**This is the most urgent item in the submission and it is severed from the feature.**

A checklist that overstates capability is a commercial exposure the moment it reaches a
prospect, and it does not become less wrong while this feature is designed. Correcting it is
**condition C-B4**, due immediately and independent of whether the feature is ever built.

## 4. Rulings on Open Questions

### OQ-B1 — Commercial acceptability of the client-side round trip: **ESCALATED, NOT DECIDED**

ADR-06 makes every client-side evaluation a server round trip where North52 evaluates in the
browser. Whether target customers accept that is a market question requiring knowledge of
customer tolerance and competitive sales dynamics that the author does not hold. **It is not
decided here and must not be assumed.**

This is a **gating** question, not a detail. If the round trip proves commercially
unacceptable, the client-side half of this feature needs a different design — or an ADR-06
exception debate, which is a far larger decision than this BRD. Committing architecture
effort before the answer risks designing something that must be discarded.

**Ruling: architecture may not begin until OQ-B1 is answered by a human with customer
knowledge.** The server-side half is unaffected and may proceed independently if the answer
is delayed.

### OQ-B2 — Synchronous bindings in Horizon 1: **DECIDED — permitted, but async by default**

Async-only was considered and rejected, because it would silently remove the validation use
case: blocking a save on a decision outcome is inherently synchronous, and validation is one
of the most common North52 patterns. Shipping without it would leave the displacement gap
substantially open while appearing to close it.

**Ruling:** asynchronous is the default for every binding. Synchronous is permitted only
where the binding must block or must write back before the user sees the saved record, and
no synchronous binding ships until NFR-B1 (p95 ≤ 200 ms) is measured, not estimated.

### OQ-B3 — Ownership of the production binding privilege: **PROVISIONAL — administrators only**

Binding a rule to an entity changes production system behaviour for every user of that
entity. In Horizon 1 the blast radius outweighs the autonomy benefit.

**Provisional ruling:** system administrators only. Rule authors create and submit bindings;
administrators approve and enable them in production. This is org policy and should be
confirmed by the customer's own governance owner — it is provisional for that reason.

### OQ-B4 — Blocking save on a decision outcome (FR-B17): **DECIDED — in scope**

Follows from OQ-B2. Excluding it would omit a primary competitive use case. It is in scope,
and it is the specific justification for synchronous bindings existing at all.

### OQ-B5 — Whether this waits for W0-1: **ESCALATED, with a finding**

Not decided here — prioritising the key rotation involves vault custody, security engagement
and a maintenance window, all outside this decision's authority.

**Finding placed on record:** this feature would be the **third** completed-but-undeployable
change queued behind a single unmade decision, alongside the pin justification guard and the
addressable-decisions change. The queue is now itself an argument. Each further item raises
the risk and coordination cost of the eventual cutover, because more untested change lands in
one window. **The recommendation is that W0-1 be prioritised ahead of building this feature**,
so that this work deploys on a normal release rather than joining a growing batch.

## 5. Strategic Risk Assessment

| Risk | CEO view |
|---|---|
| BR-B1 recursion | **The decisive risk.** Accepted as a release-blocking gate, not a requirement. See C-B1. |
| BR-B2 blast radius | Accepted with mitigations. A binding can break record creation org-wide; the kill switch is mandatory before first enablement (C-B3). |
| BR-B3 save-path latency | Accepted, gated by measurement (C-B2). |
| BR-B4 client round trip | **Not accepted yet** — this is OQ-B1. |
| BR-B7 data protection | Write-back persists decisions onto business records. Must be inside the existing W0-5 review scope (C-B6). |
| BR-B8 scope creep | Exclusions in §5.2 confirmed. Rollups, workflow activities, cloning, templates and Excel remain separate engagements. |

## 6. Conditions

| ID | Condition | Due | Owner |
|---|---|---|---|
| **C-B1** | **FR-B14 recursion impossibility is release-blocking.** Requires an adversarial test that deliberately constructs a self-retriggering binding and proves it cannot recur — not merely an absence of observed recursion. | Before release | QA |
| **C-B2** | Async default. No synchronous binding ships until NFR-B1 is measured in a real environment. | Before release | Backend |
| **C-B3** | The global disable (FR-B30) exists and is verified before the first binding is enabled in any customer environment. | Before first enablement | Backend |
| **C-B4** | **C-004 checklist corrected** — "Plugin entry point" rescored honestly and a client-side formula row added. **Severed from this feature; due immediately.** | Immediate | Architect |
| **C-B5** | Production binding privilege confirmed with the customer's governance owner (OQ-B3 is provisional). | Before release | Auditor |
| **C-B6** | Write-back included in the W0-5 data-protection review scope. | Before production | Auditor |
| **C-B7** | **OQ-B1 answered before architecture begins** for the client-side surface. | Before architecture | CEO / human |

## 7. Scope Confirmation

In scope as submitted. Exclusions confirmed as listed. No expansion authorised.

## 8. Gate Decision

**Architecture phase: CONDITIONALLY AUTHORISED.**

- **Server-side binding** — authorised to proceed to architecture now.
- **Client-side binding** — blocked until C-B7 (OQ-B1) is answered.
- **Implementation** — not authorised by this decision. Architecture output returns for review.
- **C-B4** — proceeds immediately, independent of everything above.

Next workflow step per `.claude/workflows`: `github-researcher` (adopt-over-build) before any
implementation, then Architecture, producing ADRs for the recursion guard and the write-back
identity model.
