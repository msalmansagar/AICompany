# ADR-009 — Escalation Target: Option-Set + Conditional Lookup Pattern
**Project:** DP-2 — SLA / Escalation on Workflow Steps (CWFD)
**Status:** Accepted
**Date:** 2026-07-21
**Decided by:** Architect — Maqsad AI

---

## Context

The escalation configuration requires identifying a target entity of one of four
kinds: a specific CRM user, a specific CRM team, the manager of the step's
current assignee (resolved at runtime via user hierarchy), or a `qdb_role` role.

This is a polymorphic target problem: the escalation target can point to different
entity types depending on the configuration. Several schema patterns exist in
Dataverse for this case.

The decision was delegated to the architect by the CEO gate (phase-1-ceo.md).

---

## Decision

Use a **type discriminator option set (`qdb_escalation_target_type`) paired
with three nullable single-value lookup fields** (`qdb_escalation_user`,
`qdb_escalation_team`, `qdb_escalation_role`).

At any point in time, at most one of the three lookup fields is non-null
(the one matching the selected target type). The other two remain null.
`ManagerOfAssignee` requires no lookup field.

The designer UI enforces this invariant by clearing unused lookup fields when
target type changes and presenting only the relevant lookup control.

The `buildStepBody` function enforces the same invariant on write: when SLA
is disabled, all three lookups are null-cleared explicitly.

---

## Alternatives Considered

**Option A — Single polymorphic "Customer" field (rejected):**
Dataverse's Customer field type supports two target entity types (account and
contact). It does not support user, team, and role simultaneously. There is no
native Dataverse mechanism for a polymorphic lookup across arbitrary entity types.
This option is not technically available.

**Option B — Single Regarding lookup (rejected):**
A single "Regarding" lookup (which Dataverse can target at multiple entity types
via `polymorphicLookup`) could point to user, team, or role. However:
1. Dataverse polymorphic lookups carry their own schema complexity and limited
   tooling support.
2. The `ManagerOfAssignee` case has no lookup record at all — the target is
   computed at runtime. A nullable polymorphic lookup cannot express "no record
   needed; resolve at runtime."
3. CWFD-005 runtime code would need to inspect the entity type of the pointed-to
   record to know what action to take — an extra OData `$select` or type-check
   call per task.
4. Querying metadata on a polymorphic field is non-trivial.

**Option C — Separate escalation target entity (rejected):**
Introduce a `qdb_escalation_target` entity with fields for each target kind,
and add a 1:1 lookup from `qdb_work_item_steps` to `qdb_escalation_target`.
Rejected: introduces a new entity with its own create/update/delete lifecycle
that is tightly coupled to the step lifecycle. A step cannot exist without a
non-null escalation target record if escalation is enabled, forcing a cascade
pattern. The schema overhead (a whole new entity, its own metadata, its own
security role grants) is disproportionate to what is a simple configuration
tuple. This pattern would be appropriate if escalation targets were shared
across multiple steps; they are not (each step has independent escalation config).

**Option D — Three nullable lookups without type discriminator (rejected):**
Add `qdb_escalation_user`, `qdb_escalation_team`, `qdb_escalation_role` with
no `qdb_escalation_target_type` option set. The presence of a non-null lookup
implies the type.
Rejected: ambiguous when two lookups are simultaneously non-null (possible if
a previous config change did not null-clear the old lookup). The `ManagerOfAssignee`
case cannot be expressed (no lookup to set). The CWFD-005 runtime would need
heuristic priority logic ("user wins over team") rather than deterministic
type-reading. The designer validation would need to enforce the "at most one"
invariant in a more complex way. The explicit type discriminator makes intent
unambiguous and the runtime contract deterministic.

---

## Consequences

**Positive:**
- The `qdb_escalation_target_type` option set is a single, deterministic read
  for CWFD-005 — no type-sniffing across multiple nullable fields.
- Three independently queryable lookup fields allow Dataverse to resolve display
  names via formatted-value annotations in a single GET, with no extra calls.
- The pattern is identical to existing Dynamics 365 patterns (e.g., the standard
  OwnerId field uses Owner Type + Owner lookup — the same discriminator + lookup
  pattern at the platform level).
- Standard Dataverse field auditing captures each lookup change independently,
  giving a clean audit trail.
- Adding a fifth target type in the future (e.g., a distribution group) requires
  only one new option-set value and one new nullable lookup — no structural change
  to the existing three.

**Negative / Risks:**
- Three lookup fields exist on the record at all times even though at most one
  is non-null. This is mild schema redundancy, mitigated by the fact that Dataverse
  stores null lookups without row-level overhead.
- When target type changes, the previously non-null lookup field must be explicitly
  null-cleared. If the null-clear is missed (implementation bug), stale lookup
  data remains. The CWFD-005 runtime must treat a non-null lookup whose type code
  does not match `qdb_escalation_target_type` as invalid and log a configuration
  warning. Phase 4 integration tests must cover type-switch scenarios explicitly.
- The `ManagerOfAssignee` case produces no lookup reference, making it impossible
  to pre-validate the hierarchy in the designer. The designer carries a static
  notice ("manager is resolved at runtime using the CRM user hierarchy") and
  accepts that a missing manager hierarchy is a runtime error, not a design-time
  error.
