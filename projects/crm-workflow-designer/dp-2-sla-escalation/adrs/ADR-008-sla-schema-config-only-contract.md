# ADR-008 — SLA Schema as Config-Only Dataverse Contract
**Project:** DP-2 — SLA / Escalation on Workflow Steps (CWFD)
**Status:** Accepted
**Date:** 2026-07-21
**Decided by:** Architect — Maqsad AI

---

## Context

CWFD-007 (DP-2) must close the gap where workflow steps have no time commitment
concept. Three architectural questions had to be answered before any schema could
be designed:

**Q1 — Where does the schema live?**
Options considered:
- (A) On `qdb_work_item_steps` (process-step level)
- (B) On `qdb_sopstep` (SOP template level, with inheritance at derivation time)
- (C) Both

**Q2 — When does enforcement happen?**
Options considered:
- (A) DP-2 delivers both schema and runtime enforcement
- (B) DP-2 delivers schema only; enforcement deferred to CWFD-005

**Q3 — What cardinality for option sets?**
Options considered:
- (A) Local option sets (entity-scoped to `qdb_work_item_steps`)
- (B) Global option sets (solution-level, accessible from any table)

The CEO gate decision (phase-1-ceo.md) locked OQ-3 (process-step scope only)
and confirmed CWFD-005 is on the roadmap. OQ-1 and OQ-5 were delegated to the
architect.

---

## Decision

### Q1 — Schema on `qdb_work_item_steps` only

SLA configuration lives on the process step (`qdb_work_item_steps`), not on
the SOP template step (`qdb_sopstep`). Template-level SLA with inheritance
(option B) is deferred as a potential future engagement.

**Rationale:** Template-level SLA introduces a three-layer problem (template SLA,
process override SLA, effective SLA after merge). This creates a more complex
UI (inheritance indicators, override affordances) and a more complex runtime
contract. The CEO explicitly scoped DP-2 to process-step only. Process steps
are what the runtime executes against — no field on `qdb_sopstep` is read by
a runtime engine. Starting with the execution-level entity is the minimal viable
schema that delivers immediate value.

**Future path:** A future engagement may add `qdb_sopstep` SLA fields that
propagate during the `qdb_CreateProcessFromSop` derivation action. That engagement
will assess whether propagation is a copy-on-derive or a live inheritance link.
It does not conflict with DP-2 fields.

### Q2 — Config-only; enforcement deferred to CWFD-005

DP-2 delivers Dataverse schema and designer UI only. No timer, no scheduler,
no plugin logic, no Power Automate flow is introduced. The SLA fields are
permanently inert until CWFD-005 reads and acts on them.

**Rationale:**
1. CWFD is a design-time modeler with no server-side execution layer. Adding
   execution logic would violate its architectural boundary and the constitution's
   CRM plugin constraints (2-minute sandbox limit).
2. Building the schema before the runtime avoids the inverse problem: if CWFD-005
   designs its own schema without maker input, the result may not match what
   process designers actually need.
3. Config fields are additive and cause zero regression on existing step behaviour.
   Steps with all SLA fields null behave identically to their pre-DP-2 state.

**Implication for UI copy:** No UI copy may suggest enforcement is active. The
panel carries a persistent notice: "Configuration only — SLA enforcement requires
the CWFD-005 runtime to be active."

### Q3 — Global option sets

All four new option sets (`qdb_SLADurationUnit`, `qdb_SLABasis`,
`qdb_EscalationAction`, `qdb_EscalationTargetType`) are global (solution-level),
not entity-local.

**Rationale (BR-005):** The CWFD-005 runtime must be able to reference these
option sets without importing or depending on the CWFD solution. Global option
sets are accessible from any solution in the same environment. Entity-local option
sets create a solution dependency that would force CWFD-005 to take a reference on
the CWFD solution — tightly coupling two solutions that should be independently
deployable.

**Consequence:** Option set values must be authored once at the solution level.
If two future engagements both need a "duration unit" concept, they can reference
the same `qdb_SLADurationUnit` global option set rather than creating a duplicate.

---

## Alternatives Considered

**Config-and-runtime in DP-2 (rejected):**
Build both the schema and a Power Automate cloud flow for enforcement in DP-2.
Rejected: CWFD is a Dataverse web resource with no cloud flow authoring surface.
Cloud flow development is a separate project strand. Mixing it into a designer
UI engagement introduces a second deployment target, a second test scope, and
a second failure surface — disproportionate to the config UI scope.

**Local option sets (rejected):**
Scope option sets to `qdb_work_item_steps` only. Rejected: CWFD-005 would need
to join or reference the CWFD solution to read option set metadata. This creates
a managed solution dependency between two independently versioned components.
Dataverse article XI of the constitution requires solutions to be independently
deployable; a managed dependency between CWFD and CWFD-005 violates this.

**Single "SLA policy" entity (rejected):**
Introduce a new `qdb_sla_policy` entity that step records look up, enabling
policy reuse across steps. Rejected: adds a full entity with its own CRUD surface,
complicates the designer (policy management screen needed), and defers value
delivery. The V1 requirement is per-step, maker-configured values. Reuse can
be modelled in a later engagement if usage patterns demand it.

---

## Consequences

**Positive:**
- Schema is available immediately for CWFD-005 to build against, reducing
  the runtime engagement's design risk.
- Zero runtime regression: inert fields on existing steps do not change any
  behaviour.
- Global option sets allow CWFD-005 to reference classification codes without
  a solution dependency.
- Designer UI delivers visible BPM parity (SLA is configurable) before
  enforcement is complete — addressing the sales/stakeholder objection now.

**Negative / Risks:**
- If CWFD-005 is cancelled, the 11 fields and 4 option sets remain permanently
  inert. They consume schema space and appear in Dataverse metadata queries,
  but cause no functional harm.
- The config-only framing requires disciplined UI copy management. If copy drifts
  to imply enforcement ("SLA will be enforced"), makers will have incorrect
  expectations. A pre-release copy review gate is recommended.
- SOP template-level SLA is explicitly deferred. Makers who derive processes from
  SOPs will need to configure SLA separately per derived process in V1.
