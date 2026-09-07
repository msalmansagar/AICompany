# ADR-17: Per-Child Verdicts Reach the Form as an Anchor Summary First, Child Detail Second

**Status:** **Accepted** by the human sponsor 2026-08-19. Not yet built — per-child fan-out (FR-F43) is the next increment.
**Date:** 2026-08-18
**Decided by:** Solution Architect. Resolves the EDP-FACT-001 / EDP-BIND-001 seam (OQ-F6). Constrained by ADR-EDS-07 (side-effect-free runtime), FR-B24 and condition C-B9 (render-first), FR-B43 (versioned directive schema), FR-B9 (one binding per entity), FR-F43 (per-child verdicts), FR-F30–F33 (fact snapshotting).

---

## Context

The joint architecture phase exists because these two features meet at one point, and the
sponsor chose to design that point once rather than twice (OQ-F6).

**EDP-BIND-001** returns a presentation directive set per form event. Every directive in the
v1.1 vocabulary addresses **a field on the anchor entity**:

```jsonc
{ "hide": [...], "mandatory": [...], "readOnly": [...], "values": {...},
  "messages": [{ "field": "amount", "severity": "warning", "text": "..." }] }
```

FR-B44 validates at binding save that every named field exists on the entity.

**EDP-FACT-001** FR-F43 allows one invocation to return **a verdict per child record**, each
with its own reason codes.

**These do not compose.** There is no field on a Disbursement Request that means "invoice
line 12 failed the unit-price check". The directive vocabulary is record-scoped; the new
verdicts are collection-scoped.

### The obvious answer is unavailable in Phase 1

The natural Dynamics idiom is to store the verdict on the line item so the subgrid renders it
as an ordinary column. **That is a data effect.** EDP-FACT-001 §6.2 places writing out of
scope and leaves ADR-EDS-07 standing; data effects are EDP-BIND-001 Phase 2, explicitly
deferred under condition C-B10.

This must be stated plainly now, because it is the first thing a developer will reach for and
the first thing a stakeholder will ask for.

---

## Decision

**A per-child evaluation must always produce an anchor-scoped summary using the existing
vocabulary. Per-child detail is an additive, optional directive that a capable surface may
render and every other surface safely ignores.**

### The directive schema gains one optional key

```jsonc
{
  "messages": [ { "scope": "form", "severity": "warning",
                  "text": "3 of 5 invoice lines failed the unit-price check" } ],

  "children": [                                   // additive, optional, ignorable
    { "entity": "qdb_invoiceline", "id": "…", "matched": false,
      "reasonCodes": ["PRICE_ABOVE_TOLERANCE"],
      "messages": [ { "severity": "error", "text": "12% above last purchase" } ] }
  ]
}
```

`children` is a new key in the **versioned schema FR-B43 already requires**, and FR-B43
already guarantees an older client ignores an unknown directive safely rather than fatally.
No new mechanism is invented; the extension point was designed in.

### The degradation ladder

C-B9 established render-first for fields. This extends the same ladder by one rung:

| Rung | Condition | Result |
|---|---|---|
| 0 | No directives arrive (cold start, 3–14 s per OQ-B6) | Form renders and is usable, un-directed — **FR-B24, the release gate** |
| 1 | Anchor summary arrives | **Stock form renders it.** No PCF, no custom control, no new capability |
| 2 | A capable surface is present (PCF subgrid or custom page) | Per-child detail rendered inline |

**Rung 1 is mandatory. Rung 2 is a progressive enhancement and never a requirement.**

---

## Why the summary is mandatory rather than optional

**C-B9's render-first model is well-defined for fields and ill-defined for collections.**
Applying a late directive to a field means setting a property on a control that exists. A
subgrid may not have loaded, may be paged beyond the row in question, may sit on a tab the
user has not opened, and refreshes on a schedule of its own.

So a late per-child directive **may have nothing to apply to**. The anchor summary is on the
main form, always present, and always applicable — which is exactly why it, and not the child
detail, carries the obligation.

---

## Constraints that must not be discovered during build

### 1. Unsaved children cannot receive a verdict

A per-child directive addresses a child **by id**. A row the user has just added to a grid and
not yet saved has no id. Per-child verdicts therefore address **persisted children only**, and
the anchor summary must not silently imply otherwise — a count of "5 lines checked" when the
user is looking at six rows is a defect report waiting to happen.

### 2. One binding, not one per grain

FR-B9 fixes **one binding per entity**. The binding is on the Disbursement Request; child
verdicts are returned by that single evaluation. **Do not bind the child entity separately.**
Per OQ-B1 each invocation costs ~480 ms warm and 3–14 s cold, essentially all of it platform
overhead, so a per-line binding would multiply the only cost that actually matters. Child
evaluation happens in-process within the one call (NFR-F1).

### 3. The new output parameter must be verified by calling it

Per-child results require a new output parameter on `qdb_edp_EvaluateDecision` — provisionally
`ChildResultsJson` — which means re-running `bre-register.js`. **That rides W0-1**, alongside
the pin guard, `ExecutionId`, entity binding and actions.

⚠️ **This company has shipped the same defect twice.** A Custom API's declared parameters and
what callers actually send have drifted before — the Dynamic Form Engine's `PublishForm` was
sent five parameters against three declared, and the CMS engine learned that a parameter's
`UniqueName`, not its `Name`, is what a caller passes. In the CMS case a message-contract
document written hours earlier did not prevent it; **calling the API did.**

Registration is not proof. **The seam is verified by invoking the API and reading back what
arrives**, and that verification belongs in the W0-1 cutover checklist next to
`verify-execution-id.js`.

### 4. The snapshot is what makes summary-only acceptable

FR-F30 and FR-F33 mean the full per-child detail, and the facts that produced it, live in the
execution record regardless of what any surface rendered. "Why did line 12 fail?" is
answerable from the decision record even when the form showed only a count.

**Without snapshotting, rung 1 would be lossy.** With it, rung 1 is a display choice rather
than a loss of information — which is the second time fact snapshotting has turned out to be
load-bearing for something it was not introduced to solve.

---

## Consequences

**Positive**

- Works on a stock model-driven form with no PCF investment, on day one.
- Extends an extension point that FR-B43 already required; no new mechanism, no schema break.
- Keeps the render-first guarantee intact and honest, by putting the obligation on the part of
  the form that is always there.
- ADR-EDS-07 stays whole — nothing is written, and the temptation to smuggle a data effect in
  as "just a status column" is named and closed.
- One invocation per form event survives contact with the new grain.

**Negative, and accepted**

- The stock experience is a summary, not inline per-line marking. That will be asked for, and
  the honest answer is that it needs either a PCF surface (rung 2) or Phase 2 data effects.
- A new output parameter is one more change queued behind W0-1.
- Per-child detail is unavailable for unsaved rows, which is a real functional limit on
  in-progress data entry.

**Neutral**

- Whether rung 2 is delivered as a PCF subgrid or a custom page is a later, separable decision.

---

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| **Write the verdict to a column on each child** | A data effect. Out of scope for EDP-FACT-001 §6.2, deferred under C-B10, and would breach ADR-EDS-07. It is the natural Dynamics idiom and it is simply not available in Phase 1 |
| **Per-child directives only, no anchor summary** | Nothing renders on a stock form, and a late directive may find no subgrid to apply to. Fails C-B9's degradation requirement in the collection case |
| **A separate binding on the child entity** | Breaches FR-B9, and multiplies the 480 ms–14 s platform cost per line — the one cost OQ-B1 showed is irreducible |
| **Return per-child results only through the gateway, not the form** | Solves nothing for the form binding, which is the surface the requirement class actually needs |

---

## Registry

Add to `adrs/index.md`:

| ADR-17 | Per-Child Verdicts Reach the Form as an Anchor Summary First (resolves the FACT/BIND seam) | Proposed | 2026-08-18 | Architect |
