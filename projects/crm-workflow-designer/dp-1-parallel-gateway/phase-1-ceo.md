# DP-1 — CEO Gate Decision (Phase 1)

Engagement:  DP-1 — Parallel (AND) Gateway: split and join
Input:       `dp-1-parallel-gateway/brd.md` v1.0 (BA, 2026-07-26)
Date:        2026-07-26
Decision by: CEO

---

## Decision

**APPROVED — proceed to GitHub research and architecture.**

DP-1 is authorised as a design-time modelling capability. The BA's recommended
step-level option-set model is accepted. Build may start immediately; the
execution-layer unknown (OQ-1) is contained by a hard publish block rather than by
stalling the engagement.

---

## Scope locks (CEO)

1. **AND only.** AND-split and AND-join. Inclusive (OR) gateways, quorum / N-of-M
   joins, event gateways and multi-instance steps are out. The schema must not
   preclude them; V1 must not build them.
2. **Process steps only.** `qdb_work_item_steps`. SOP template steps and inheritance
   through `deriveProcessFromSop` are deferred to a follow-on engagement, DP-1b —
   mirroring the DP-2 → DP-2b sequencing. OQ-6 answered: **no**.
3. **Design-time only.** DP-1 ships modelling, notation, validation and a persisted
   contract. It does not and cannot make anything execute.
4. **No C# workstream.** Client-side TypeScript across both adapters and the dev shim.
5. **No migration.** Every existing step keeps exclusive/none semantics. Null reads as
   today's behaviour. Zero behaviour change for any process without parallel config.
6. **Modelling shape accepted:** two option sets on the step (split type, join type).
   The gateway-entity and outcome-flag alternatives are rejected for V1 for the reasons
   in BRD §16. Architecture owns final naming and field shape.

---

## OQ-1 — ruling

The BA raised OQ-1 (what the existing CRM plugin/flow execution layer does with a
multi-successor step) as blocking, on the grounds that a wrong answer means silent
single-branch execution in production.

**Ruling: contain it, do not wait on it.**

The QDB platform team already holds GL-01/02/03 unresolved; making DP-1 depend on the
same queue would stall the engagement indefinitely for a risk that can be eliminated in
code. Therefore:

- **A process containing a parallel region SHALL NOT be publishable.** Hard block, not a
  warning, not an acknowledgement checkbox. Modelling, validation, canvas notation,
  export and Save Draft all work; Publish is refused with a clear, honest message that
  the platform cannot yet execute concurrent branches.
- Nothing a maker draws can therefore reach the execution layer, so the OQ-1 answer
  cannot cause a production incident either way.
- OQ-1 remains open as a **platform-team question**, tracked as a release condition for
  the follow-on engagement that lifts the block — not as a gate on this one.
- **OQ-2 is thereby decided:** hard block. The "publish with acknowledgement" option is
  rejected; an acknowledgement checkbox transfers a correctness risk to a maker who has
  no way to evaluate it.

The CEO accepts explicitly that V1 ships a capability that cannot be published. The value
delivered in the interim is a truthful diagram, a validated model, and a machine-readable
control-flow contract for CWFD-005 to build against. That is approved on its own merits,
not on an implied promise of execution.

---

## Delegated to architecture

- **OQ-3** strict structural join vs. permitted branch termination at End. BA recommends
  strict for V1; architecture decides and records the rationale in an ADR.
- **OQ-4** loops crossing a parallel-region boundary. BA recommends forbidding in V1.
- **OQ-5** simulation representation of concurrency. BA recommends collapsing a parallel
  region to a single "these run together" path node; the binding constraint is FR-060
  (no silent single-branch walk) and FR-061 (bounded enumeration).
- **OQ-7** branch cap. BA recommends reusing `MAX_OUTCOMES_PER_STEP = 5` as a warning
  threshold rather than inventing a second limit.

---

## Conditions

- **C-1** The publish block is a **required** deliverable, not a nice-to-have. QA must
  test it explicitly and the audit must confirm it cannot be bypassed.
- **C-2** Deadlock validation (FR-053) must be a pure, unit-tested function with
  adversarial cases. A publishable process that can hang forever is the one defect class
  this engagement cannot ship.
- **C-3** Regression evidence that a process with no parallel configuration produces an
  identical saved payload and identical validation results to today. R-02 (semantics
  leaking into the 31 files that consume `nextStepId`) is the highest-likelihood
  technical risk and must be closed with tests, not inspection.
- **C-4** Live-org schema provisioning requires explicit user authorisation at the time,
  per standing rule. DP-2 surfaced two real schema-shape bugs at exactly this gate; treat
  it as a test, not a formality.
- **C-5** New columns inherit GL-01 (managed-solution packaging) and GL-02 (native field
  audit). No new governance track — the existing conditions widen to cover them.
- **C-6** Notation must not rely on colour alone (NFR-009).

---

## Next

GitHub research → architecture (ADRs for the control-flow model, validation algorithm,
and notation) → build in the isolated worktree → code review → QA → audit → CEO final.
