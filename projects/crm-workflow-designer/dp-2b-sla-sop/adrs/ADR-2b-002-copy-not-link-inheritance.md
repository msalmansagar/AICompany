# ADR-2b-002 — Copy-Not-Link Inheritance at Derivation Time

**Project:** DP-2b — SLA / Escalation on SOP Template Steps (CWFD)
**Status:** Accepted
**Date:** 2026-07-22
**Decided by:** Architect — Maqsad AI

---

## Context

When a process is derived from a SOP template, DP-2b must transfer SLA
configuration from each `qdb_sopstep` record to the corresponding
`qdb_work_item_steps` record. Two structural models are possible:

**Model A — Copy (snapshot):** At derivation time, field values are read from
the SOP step and written directly into the process step. After derivation, the
two records are independent. Changes to the SOP step do not propagate to
derived process steps.

**Model B — Live link:** The `qdb_work_item_steps` SLA fields are not stored
directly; instead, the process step holds a foreign key to the `qdb_sopstep`
record, and the runtime (or UI) resolves SLA values via that link at query time.
Changes to the SOP step propagate automatically.

The CEO gate (phase-1-ceo.md) explicitly locked OQ-4: "in-wizard SLA override
DEFERRED — inheritance + post-derivation editing via DP-2's step panel is
sufficient for V1." This presupposes that the derived process step is
independently editable immediately after derivation — which is only possible
under Model A.

BR-003 states the copy is a one-time snapshot. FR-016 states the derived step
is independently editable with no link back to the SOP step.

---

## Decision

**Model A: one-time value copy at derivation time.**

At the point in `deriveProcessFromSop.ts` where each process step is created,
`copySlaFields(sopStep)` is spread into the `adapter.createStep(...)` call.
This writes the SLA field values from the `qdb_sopstep` record directly into
the `qdb_work_item_steps` record.

After derivation:
- The `qdb_work_item_steps` SLA fields are the authoritative values for that
  derived process step.
- No reference to the source `qdb_sopstep` is stored on `qdb_work_item_steps`
  beyond the existing `qdb_sop_id` foreign key on the process header record.
- Editing the SOP template's SLA fields after derivation has zero effect on
  already-derived processes.

---

## Alternatives Considered

**Live link via foreign key (rejected):**
Store a `qdb_sopstep_id` lookup on `qdb_work_item_steps`. The UI and runtime
read SLA values from the linked SOP step when the process step's own SLA fields
are null. Rejected for the following reasons:
1. **Schema conflict with DP-2:** DP-2 adds SLA fields directly to
   `qdb_work_item_steps` for manually configured process steps. A live-link
   model creates two sources of SLA truth on the same record — the direct
   fields (for manually configured steps) and the foreign key (for
   SOP-derived steps). The CWFD-005 runtime would need to implement a
   merge/override resolution strategy, adding runtime complexity and
   ambiguity.
2. **Override complexity:** If a maker wants to override the inherited SLA on
   a specific derived process step, the live-link model requires either clearing
   the foreign key (breaking the link) or adding per-step override flags.
   Both approaches increase schema and UI complexity substantially.
3. **CEO lock:** The CEO locked the inheritance model as "snapshot only"
   and explicitly deferred a live-sync mechanism to a future engagement.

**Template propagation engine (rejected):**
When the SOP template's SLA fields change, propagate the changes to all derived
processes whose steps have not been manually overridden. Rejected: requires a
propagation mechanism (plugin, Power Automate, or scheduled job), change
tracking per field per derived step, and a UI to show which fields were
inherited vs. overridden. This is a full-featured template management capability,
not an inheritance copy. Explicitly out of scope for DP-2b.

---

## Consequences

**Positive:**
- Implementation is trivially simple: one function call (`copySlaFields`) and
  one spread into an existing `createStep` call.
- Derived process steps are independently editable immediately; DP-2's existing
  step panel works without modification.
- CWFD-005 runtime reads SLA from `qdb_work_item_steps` without any
  template-awareness; the runtime contract is unchanged.
- No new foreign keys, no new schema complexity on `qdb_work_item_steps`.

**Negative / Risks:**
- Updating a SOP template's SLA fields after derivation does not propagate to
  existing derived processes. Makers who expect template updates to "flow
  downstream" will be surprised. The UI should not imply propagation; any
  documentation or onboarding material must explain the snapshot model.
- If a SOP template has an incorrect SLA value that was copied into many derived
  processes, fixing it requires manually updating each process step or re-deriving.
  This is a known and accepted trade-off for the V1 simplicity of the snapshot
  model.
