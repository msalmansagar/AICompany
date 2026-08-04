# ADR-1-001 — Control-Flow Semantics Live on the Step, as Option Sets

**Project:** DP-1 — Parallel (AND) Gateway (CWFD)
**Status:** Accepted
**Date:** 2026-07-26
**Decided by:** Architect — MSS Technologies

---

## Context

CWFD's graph is Step → Outcome → (optional) Route → next Step. Nothing in that chain
records whether a step's several successors are *alternatives* or *concurrent*. The
meaning is conventional, and today the convention is exclusive choice everywhere.

DP-1 must make the distinction explicit and machine-readable, because the consumer that
will act on it — the CRM execution layer, and later CWFD-005 — is outside this codebase
and cannot be asked to infer intent from graph shape.

Three structural models were considered. The BRD recommended the third and the CEO gate
accepted it; this ADR records the reasoning and fixes the field shape.

---

## Decision

**Two global option-set columns on `qdb_work_item_steps`.**

| Column | Values | Default |
|---|---|---|
| `qdb_splittype` (global set `qdb_SplitType`) | `Exclusive` = 100000000, `Parallel` = 100000001 | null → Exclusive |
| `qdb_jointype` (global set `qdb_JoinType`) | `None` = 100000000, `AndJoin` = 100000001 | null → None |

- **Null is meaningful and is the compatibility guarantee.** Every step that predates
  DP-1, and every step on an org where the columns are not yet provisioned, reads back as
  Exclusive/None — which is exactly today's behaviour. There is no backfill and no
  migration.
- **Code 100000002 is deliberately left unallocated in both sets.** Inclusive (OR) split
  and quorum join are the natural next values (BRD X-02). They are *not* created now —
  creating an option value the UI cannot produce invites a maker to set it through
  Advanced Find and get undefined behaviour. Leaving the number free costs nothing and
  makes the later extension additive rather than a redesign.
- Naming follows Dataverse's rule that a column's logical name derives from its
  **SchemaName** — the trap DP-2 hit with `qdb_escalation_user` vs `qdb_escalationuser`.
  Schema names are therefore declared as `qdb_splittype` / `qdb_jointype` with no
  underscores, and the provisioning script and the adapters use exactly that string.

---

## Alternatives Considered

**A first-class gateway entity (`qdb_gateway`) between steps — rejected.**
BPMN-faithful and the cleanest notation story: a diamond is a real record, splits and
joins are the same kind of thing, and inclusive gateways drop in later with no schema
change. Rejected on cost and blast radius. It requires a new entity, new foreign keys, and
a rewrite of the `step → outcome → route → step` chain into
`step → outcome → gateway → step`. That chain is walked by the existing CRM execution
layer, which we do not own and (per OQ-1) do not fully understand. Changing the shape of
the graph that an unknown consumer traverses is precisely the risk this engagement is
trying to avoid. It also forces migration of every existing process.

**A flag on the outcome (`qdb_isparallel`), fanning out to all its routes — rejected.**
Cheaper than the entity, and it reuses the routes table as a ready-made branch list. But
it splits one semantic across two tables: the split lives on `qdb_outcome`, and the join
still has nowhere to live except the step. A consumer would have to read both tables to
answer "is this concurrent?", and the two could contradict each other. It also entangles
parallel semantics with the conditional-route mechanism, which is the exclusive-choice
feature — the opposite meaning.

**Inferring parallelism from graph shape (no schema at all) — rejected.**
Any rule of the form "a step with N unconditional outcomes is parallel" silently
reinterprets every existing process on the org. Non-starter against BRD BR-007.

---

## Consequences

**Positive**
- Additive schema. Two integer columns, no new entity, no FK change, no migration.
- The semantic sits on the record every consumer already reads; answering "is this step a
  split, and is that one a join?" is one field read, no traversal.
- Silence equals today's behaviour, which makes the zero-regression NFR (NFR-001)
  structurally true rather than something tests have to chase.
- Extends to inclusive gateways as new option values, not a new model.
- Mirrors the DP-2 shape exactly, so the shared-mapping-module pattern
  (`slaStepFields.ts`) transfers directly and both adapters stay in lockstep by
  construction.

**Negative / Risks**
- The gateway is not a first-class node, so the canvas must *synthesise* the visual
  marker from step fields. Notation is therefore a rendering concern, not a data concern —
  acceptable, but it means the diamond can never be selected or given its own properties.
- Two fields can disagree with the graph: a step can be marked `AndJoin` with no inbound
  parallel branches. This is a validation problem, not a data-integrity one, and is
  handled by ADR-1-002 (`ORPHAN_AND_JOIN`).
- If DP-8 (BPMN interop) is ever authorised, exporting to BPMN will need to materialise
  gateway elements from these fields. That is a mapping exercise, not a blocker.
