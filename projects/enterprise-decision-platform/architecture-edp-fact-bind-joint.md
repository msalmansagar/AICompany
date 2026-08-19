# Architecture — Declarative Fact Assembly and Entity Binding (joint)

**Covers:** EDP-FACT-001 (ratified 2026-08-18) · EDP-BIND-001 Phase 1 (ratified 2026-07-31)
**Phase:** Architecture
**Date:** 2026-08-18
**Status:** **DRAFT — returns for review. Implementation is NOT authorised.**
**Decisions relied on:** ADR-16 (collection semantics) · ADR-17 (the FACT/BIND seam) · ADR-01, ADR-05, ADR-06, ADR-11, ADR-13, ADR-EDS-07, ADR-EDS-10, ADR-AI-05
**Evidence:** `spikes/f1-collection-support.md` · `spikes/oq-b1-client-roundtrip-latency.md` · `spikes/oq-b6-cold-start-posture.md` · `dependencies.md` (F1 addendum)

**Why one document:** the sponsor chose a joint architecture phase (OQ-F6) because these two
features meet at one seam — a rule that returns a verdict per child record, and a directive
vocabulary that addresses fields on one record. Designing them apart would design that seam
twice.

---

## 1. What this document decides, and what it does not

**Decides:** the evaluation pipeline, where collections live, how the render-first model works
in practice, the contract changes, the failure modes, and the blast radius across existing
components.

**Does not decide:** the pin strategy (left open by ADR-16, needs its own ADR); whether rung 2
of the seam ladder is a PCF or a custom page; the designer's authoring UX for quantifiers,
which needs the ui-ux-designer before it needs an architect.

**§3 is the load-bearing section.** Condition C-B9 requires this architecture to state
explicitly how a client binding renders first and applies directives on arrival, because that
is a different interaction model from evaluate-then-render and must be settled here rather
than discovered during build.

---

## 2. The two features in one picture

```
                 ┌──────────────────────────────────────────────┐
                 │  FORM (model-driven)                         │
   user opens →  │  renders immediately, fully usable           │  ← rung 0 always holds
                 │      │                    ▲                  │
                 └──────┼────────────────────┼──────────────────┘
                        │ async, non-blocking│ directives on arrival
                        ▼                    │
                 ┌──────────────────────────────────────────────┐
                 │  qdb_edp_EvaluateDecision   (one call/event)  │
                 └──────┬───────────────────────────────────────┘
                        ▼
        ┌───────────────────────────────────────────────────────┐
        │  FACT ASSEMBLY          (declarative, governed)        │
        │   traversal ≤2 hops · population query · REST (F3)     │
        │   group-by/argmax · union · canonical text             │
        └───────────────┬───────────────────────────────────────┘
                        │  assembled fact set  ──────┐
                        ▼                            │
        ┌───────────────────────────────────────┐    │
        │  EVALUATOR   (pure function)          │    │
        │   PcrmGroup + quantifier node         │    │
        │   one coercion model · one trace      │    │
        └───────────────┬───────────────────────┘    │
                        │                            ▼
                        │                   ┌──────────────────┐
                        │                   │  SNAPSHOT        │
                        │                   │  facts + digest  │
                        │                   └──────────────────┘
                        ▼
              anchor summary  +  optional children[]
```

The evaluator never reaches for data and never writes. Everything it sees was assembled and
snapshotted before it ran. That is what keeps simulation, replay, scenario regression and
grounded explanation intact (ADR-EDS-07, ADR-AI-05).

---

## 3. The render-first model (condition C-B9)

### 3.1 Why it is not evaluate-then-render

The obvious design evaluates, then paints the form with the answer. **OQ-B6 makes that
untenable.** Cold start measured **3,347 / 4,816 / 6,147 / 10,380 / 13,911 ms**, keep-warm was
tested directly and failed, and there is no reliable idle threshold — 19.3 minutes idle went
cold while 20.0 minutes stayed warm. A form that waits for a decision can hang for fourteen
seconds with no way to predict it.

**FR-B24 is therefore a release gate, not a requirement.**

### 3.2 The model

```
  t0  form renders, fully interactive, un-directed        ← usable here, always
  t0  evaluation request issued, async, non-blocking      ← stamped with a request id
      …
  t1  directives arrive (≈480 ms warm, 3–14 s cold)
  t1  directives applied to controls that still exist
      …
      OR: never arrive → form stays un-directed and usable
```

Three rules follow, and none of them is optional:

**R1 — The form never blocks on load or change.** The request is fired and forgotten; the
render path does not await it.

**R2 — A late directive must not destroy user work.** A `values` directive (FR-B41) must **not**
overwrite a field the user has edited since the request was issued. Every request carries a
stamp; on arrival, any field whose dirty-state changed after that stamp is skipped for `values`
and still receives `hide` / `mandatory` / `readOnly`. Without this rule, a 6-second cold start
silently discards six seconds of typing.

**R3 — Unknown directives are ignored, never fatal** (FR-B43). This is what lets `children`
(ADR-17) ship without breaking an older client.

### 3.3 The honest limit — save-time validation has no async escape

Render-first solves **load** and **change**. It does not solve **save**.

A blocking validation that cancels the operation (FR-B17) must complete *before* the save
proceeds — that is what "blocking" means. There is no version of that which renders first.
**So a cold start on save is a user waiting up to fourteen seconds**, and the mitigation that
works for load does not exist here.

This architecture does not pretend otherwise. It requires:

| # | Requirement |
|---|---|
| S1 | Save-time evaluation carries an explicit **timeout budget**, authored per binding, not defaulted |
| S2 | The **failure posture on timeout is authored, not assumed** — fail-closed (block the save) or fail-open (allow, and record) — following the same principle FR-F23 sets for external calls |
| S3 | The posture and the timeout are shown to the author at binding save, because a fail-open payment control is a business decision, not a technical one |
| S4 | Timeouts are recorded as first-class telemetry, not swallowed — a rising timeout rate is the leading indicator of a cold-start problem |

**Open for the sponsor:** the specimen's duplicate check is a payment control. Fail-open on
timeout means a duplicate can pass unchecked; fail-closed means a cold sandbox blocks a
legitimate disbursement for fourteen seconds. Neither is obviously right, and the choice is
theirs, not ours. Recorded as **OQ-A1**.

---

## 4. Fact assembly

### 4.1 Shape

A binding declares its fact set. Assembly is declarative, bounded, and executes **before** the
evaluator runs.

| Primitive | Bound by |
|---|---|
| Traversal | **≤ 2 hops** from the anchor (B-7). A third hop is rejected at author time |
| Population query | Mandatory filter (FR-F11); row ceiling (FR-F13); paged with loud truncation (FR-F12) |
| Group-by + argmax | Latest / first / highest per key (FR-F14) |
| Union | Same-shape sources reconciled into one declared vocabulary (FR-F16) |
| External REST | Phase F3 — governed source definition, timeout, authored failure posture (FR-F20–F24) |
| Canonical text | Declared normal form for comparison (FR-F42) |

**B-6 governs the set: retrieval finds records, it never relates them.** The primitive set is
closed; adding one requires an ADR. This is the ceiling that stops fact assembly becoming a
query language, and it is enforced by PCRM's schema rather than by discipline.

### 4.2 Security — the part that changes EDP's risk profile

Fact assembly is the first EDP capability that lets an author reach data they did not already
have in front of them. **FR-F15 requires retrieval to execute in the calling user's security
context**, honouring record and field-level security.

This is not negotiable and not a performance trade. A rule executing as a service principal
over a population query is a data-exfiltration surface with an approval workflow attached to
it. Phase 6 must review this as a new surface, and it is PDPPL-relevant.

---

## 5. Collections in the evaluator (F1)

Grounded in `spikes/f1-collection-support.md`, which measured rather than assumed.

### 5.1 What already works

- `RuleExecutionContext` carries a collection unchanged — it stores `object?` with no constraint.
- `FormulaEngine` resolves a collection parameter and NCalc's `in` evaluates against it.
- `OperatorEvaluator.InList` accepts a `JsonElement` array directly.

**The operator layer is ahead of the value layer that feeds it.**

### 5.2 What F1 builds

| Component | Change |
|---|---|
| `RuntimeValue` | A collection value type. Today `FromJson` flattens an array to raw text — **this one line is the ceiling** |
| `RuleDecisionService.ParseInputsJson` | Unify with the core. Today the adapter returns **`null`** for an array while the core returns a string; the adapter is the path a Custom API caller takes |
| `OperatorEvaluator.InList` | **Fix the value-typed collection defect** — see §5.3 |
| `PcrmModels` | A quantifier node on `PcrmGroup`: `some` / `all` / `none` / `filter` over a named collection, body is an ordinary `PcrmGroup` |
| `ConditionEvaluator` | Evaluate the body once per element with the element bound as a scoped symbol. It is already a composite; this is a third child kind, **not a new evaluator** (ADR-16) |
| `RuleValidator` | Diagnostics for quantifiers — undeclared collection, unbound element symbol, third-hop traversal |
| `ExecutionTrace` | A step per quantifier and per element. Comes free by reusing the evaluator |

Empty-collection semantics are **chosen and documented per quantifier**, not inherited (ADR-16
§5). `ResolveAggregate` set the precedent: "empty collection is deterministic".

### 5.3 🔴 A defect in shipped code, independent of F1

```csharp
OperatorEvaluator.Evaluate("in", 5000m, new List<decimal> { 5000m }, null);   // => FALSE
```

`InList` matches `IEnumerable<object?>`; `List<decimal>` is `IEnumerable<decimal>`; generic
variance does not apply to value types; the value falls through to the comma-separated string
fallback and compares against the *type name*.

**This is a silent wrong answer on a live operator.** It should be fixed as a defect now rather
than folded into F1, because `in` is in production today and a fact-assembly layer building
`List<decimal>` or `List<Guid>` is the natural thing to write.

---

## 6. The seam (ADR-17)

One evaluation returns **an anchor summary always, child detail optionally**.

```jsonc
{ "messages": [ { "scope": "form", "severity": "warning",
                  "text": "3 of 5 invoice lines failed the unit-price check" } ],
  "children": [ { "entity": "qdb_invoiceline", "id": "…", "matched": false,
                  "reasonCodes": ["PRICE_ABOVE_TOLERANCE"] } ] }
```

| Rung | Condition | Result |
|---|---|---|
| 0 | No directives arrive | Form usable, un-directed — **FR-B24 gate** |
| 1 | Summary arrives | **Stock form renders it.** No PCF required |
| 2 | Capable surface present | Child detail inline |

**Rung 1 is mandatory; rung 2 is a progressive enhancement.** The summary carries the
obligation because C-B9 is well-defined for fields and ill-defined for collections — a subgrid
may be unloaded, paged past, or on an unopened tab, so a late child directive may have nothing
to apply to.

**Writing a verdict onto the child is out of scope** — that is a data effect, deferred under
C-B10, and ADR-EDS-07 stands. It is the first thing that will be asked for and the answer is
Phase 2 or a PCF, not a status column.

---

## 7. Contract changes

| Surface | Change | Consequence |
|---|---|---|
| `qdb_edp_EvaluateDecision` | New output parameter `ChildResultsJson` | Re-run `bre-register.js`; **rides W0-1** |
| Directive schema | New optional `children` key, schema version bump | Safe by FR-B43 |
| Binding definition | Fact-set declaration, save timeout, failure posture | New authoring surface |

⚠️ **Verify the contract by calling it, not by reading it.** This company has shipped this
defect twice — DFE sent five parameters to a `PublishForm` that declared three, and CMS learned
that a parameter's `UniqueName`, not its `Name`, is what a caller passes. In the CMS case a
message-contract document written hours earlier did not prevent it; **an actual call did.**
A verification script belongs in the W0-1 cutover beside `verify-execution-id.js`.

---

## 8. Snapshotting, replay and explanation

Every assembled fact set is captured with the execution (FR-F30). Retention is **tiered by
outcome** (OQ-F3): full snapshot on every decision for a bounded window, materially longer for
decisions that failed or routed to review, and a **tamper-evident digest kept permanently** so
a decision remains provable after purge.

**FR-F31 — replay from snapshot reproduces the original verdict exactly — is a release gate
from F2 onward.** F1 carries no retrieval and so has nothing to snapshot; gating it there would
be theatre.

Snapshotting is load-bearing twice over. It is what keeps the evaluator pure under Option B,
and it is what makes ADR-17's summary-only render a *display choice* rather than a loss of
information — the per-child detail lives in the decision record regardless of what any surface
drew.

---

## 9. Performance envelope

| Constraint | Value | Source |
|---|---|---|
| Warm round trip | ~480 ms p50, ~0 ms of it ours | OQ-B1 |
| Cold start | **3–14 s**, no reliable keep-warm | OQ-B6 |
| Per-child evaluation | **In-process** — N evaluations, one platform invocation | NFR-F1, ADR-EDS-10 |
| Sandbox ceiling | 2 minutes | Platform |
| Retrieval | Paged, capped, loud on truncation | FR-F12, FR-F13 |

**One call per form event, one binding per entity** (FR-B9). Never a binding per child grain:
per OQ-B1 the 329 ms is the cost of *invoking* a sandboxed plugin, so per-line invocation would
multiply the only cost that is irreducible.

---

## 10. Failure modes

| Failure | Behaviour | Requirement |
|---|---|---|
| Directives late or absent (load/change) | Form usable, un-directed | FR-B24 — gate |
| Directives late (save) | Authored timeout, authored posture | S1–S4, **OQ-A1 open** |
| Retrieval exceeds row ceiling | **Evaluation fails loudly.** Never a partial population | FR-F13 |
| External source unavailable (F3) | Authored fail-open / fail-closed | FR-F23 |
| Snapshot write fails | Decision still returned; trace is tier-2 | ADR-13 |
| Unknown directive at the client | Ignored | FR-B43 |
| Child unsaved, no id | Cannot receive a verdict; summary must not imply it did | ADR-17 |

---

## 11. Blast radius

**Core** — `RuntimeValue`, `OperatorEvaluator`, `PcrmModels`, `ConditionEvaluator`,
`RuleValidator`, `ExecutionTrace`.
**CRM adapter** — `RuleDecisionService` (input parsing, fact assembly host, snapshot write),
`EvaluateDecisionPlugin` (new output).
**Deploy** — `bre-register.js` (new response property), and a new contract verification script.
**Designer** — quantifier authoring, fact-set declaration, binding editor. **This is the
largest single piece of work in the programme and it is not architecture's to specify alone**;
ui-ux-designer runs before frontend.
**Unchanged** — the gateway and both SDKs, which pass `ResultJson` through.

---

## 12. Sequencing

| Phase | Content | Gate |
|---|---|---|
| **F1** | Collection type, boundary unification, `in` defect, quantifier node, per-child fan-out | No new data surface, no security review |
| **F2** | Population retrieval with guard rails, group-by/argmax, **snapshotting** | **FR-F31 replay gate applies from here** |
| **F3** | External REST, union, canonical text | Distinct security profile; PDPPL |
| **BIND P1** | Binding, directives, render-first, the seam | FR-B24 gate |

**F1 and BIND Phase 1 can proceed in parallel** — they touch different layers and meet only at
`ChildResultsJson`, which is a contract both can code against. **F2 must not start before F1
lands**, because snapshotting a collection requires the collection type to exist.

---

## 13. Open items carried out of architecture

| ID | Item | Owner |
|---|---|---|
| **OQ-A1** | **Save-time timeout posture** — fail-open or fail-closed on a payment control | **Sponsor** |
| OQ-A2 | Pin strategy — accept-and-monitor, vendor, or source-include | Architect, own ADR |
| OQ-A3 | Rung 2 surface — PCF subgrid or custom page | Architect + UX |
| OQ-A4 | Designer authoring UX for quantifiers and fact sets | ui-ux-designer |
| M-1…M-4 | Miss rate, volumes, legacy columns, MIS contract | Business / data |

---

## 14. Traceability

| Source | Feeds |
|---|---|
| ADR-16 | §5 — quantifier as a `PcrmGroup` node, not an embedded language |
| ADR-17 | §6 — anchor summary first |
| `f1-collection-support.md` | §5.1, §5.2, §5.3 |
| OQ-B1 | §3.1, §9 |
| OQ-B6 | §3.1, §3.3 |
| C-B9 / FR-B24 | §3 in full |
| FR-F30–F34, OQ-F3 | §8 |
| B-6, B-7 | §4.1 |

---

## VERIFICATION

| Claim | How | Result |
|---|---|---|
| Collection behaviour in §5.1, §5.3 | `CollectionSupportSpikeTests`, 7 tests | **Measured. 95/95 net9, no regressions** |
| Latency and cold-start figures | Committed spikes OQ-B1, OQ-B6 | Quoted, not re-measured |
| Adapter `ParseInputsJson` returns null for arrays | Read from source | **Read only — not covered by a test.** The adapter needs the Xrm SDK |
| Directive vocabulary | Read from BIND BRD v1.1 §5.2, FR-B38–B45 | Quoted |
| Subgrid lifecycle claims in §6 | **NOT verified against a live form** | Reasoned from the platform model. **Should be confirmed before rung 2 is designed** |
| Save-time blocking behaviour | **NOT prototyped** | §3.3 is reasoned, not measured. OQ-A1 should be answered with a timing test, not only a policy choice |
| net462 | **NOT run** | Known vstest quirk locally; CI is authoritative |

**Not done, deliberately:** no implementation, no schema change, no live org change, no
designer work. This document returns for review before anything is built.
