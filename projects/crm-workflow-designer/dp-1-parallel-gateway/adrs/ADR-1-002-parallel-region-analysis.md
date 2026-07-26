# ADR-1-002 — Parallel Region Analysis: Strict, Acyclic, graphlib-Backed

**Project:** DP-1 — Parallel (AND) Gateway (CWFD)
**Status:** Accepted
**Date:** 2026-07-26
**Decided by:** Architect — MSS Technologies
**Resolves:** OQ-3 (strict vs. permissive join), OQ-4 (loops across a region), OQ-7 (branch cap)

---

## Context

The CEO gate delegated three modelling questions to architecture, and set C-2: deadlock
validation must be a pure, unit-tested function, because "a publishable process that can
hang forever is the one defect class this engagement cannot ship."

The analysis has to answer, for a given process graph: which steps form the region between
a parallel split and its join, does every branch actually converge, and can the join ever
be starved.

`ValidationService` today builds a step→successors map ad hoc inside `buildStepNextMap`
and hand-rolls a DFS for `DEAD_LOOP`. DP-1 needs strictly more graph machinery than that,
and per the research pass it should not be hand-rolled.

---

## Decision

### 1. One shared step-graph, built once

A new pure module `src/validators/parallelRegions.ts` exposes a
`buildStepGraph(state)` that produces a `dagre.graphlib.Graph` of step nodes and
successor edges — derived from outcomes and routes with the same rules
`buildStepNextMap` already uses (unfiltered outcome → its `nextStepId`; filtered outcome →
each of its routes' `nextStepId`; `null` = terminal, modelled as an edge to a synthetic
`__end__` sink).

`graphlib` comes from the existing `@dagrejs/dagre` dependency, which already re-exports
it and already ships its type definitions. No new package.

### 2. Strict structural join (resolves OQ-3)

**Every branch of a parallel split must reach the same AND-join step.** A branch may not
terminate at End, and may not merge into an exclusive path that bypasses the join.

Rationale: strictness is the only rule that is both cheap to verify and safe to hand to a
runtime that does not exist yet. A permissive rule ("some branches may end") requires the
future runtime to decide what a join waits for when a branch legitimately never arrives —
which is a runtime semantics decision this engagement has no authority to make. If a maker
genuinely needs a branch that ends, they can model it as a branch that reaches the join and
then goes to End from there. The restriction is loosenable later; a wrong permissive
semantic baked into published processes is not.

The matched join for split `S` is computed as: intersect the reachable-step sets of all
branches of `S`; among the intersection, take the topologically earliest step whose
`joinType` is `AndJoin`. If the intersection is empty, or contains no `AndJoin`, the split
is unmatched.

### 3. Parallel regions must be acyclic (resolves OQ-4)

Run `graphlib.alg.tarjan` once. If any strongly connected component of size > 1 (or a
self-loop) intersects the interior of a parallel region — the steps strictly between a
split and its matched join — that is an error.

Rationale: a loop that re-enters a region means the join can receive a branch twice, or
receive a branch it has already consumed. What *should* happen is a runtime token
question with several defensible answers, none of which CWFD can pick unilaterally. Back
edges outside parallel regions are unaffected — the existing loopback modelling, which
makers use heavily, keeps working exactly as today.

### 4. Deadlock

`PARALLEL_JOIN_DEADLOCK` fires when an `AndJoin` step can be entered without all of its
awaited branches being active. Concretely, for a join `J` matched to split `S`: any inbound
edge of `J` originating from a step that is not in `S`'s region is a starvation path — the
process can arrive at `J` having never taken the split, so `J` waits forever for branches
that were never started. Also fires when `J` is reachable from only a proper subset of
`S`'s branches.

### 5. Branch cap (resolves OQ-7)

Reuse the existing `MAX_OUTCOMES_PER_STEP = 5` as the threshold, warning severity, via the
existing `TOO_MANY_OUTCOMES` check. No second limit and no new constant — a parallel split
with six branches is exactly as suspect as an exclusive step with six outcomes, and for
the same reason.

### 6. Complexity

One graph build, one `tarjan`, one `topsort`, and one DFS per split. Splits are rare and
bounded by step count, so the analysis is effectively O(V+E) on real processes, satisfying
NFR-004. The existing `checkDeadLoops` DFS is left alone — DP-1 does not refactor it, per
the Boy Scout limit of not touching what it is not changing.

---

## Alternatives Considered

**Hand-rolled DFS reachability, no graphlib — rejected.** It is what the codebase does
today for `DEAD_LOOP`, so it would be consistent. Rejected because per-branch reachability
computed by repeated DFS trends quadratic, and because C-2 makes correctness here
non-negotiable: tarjan and topsort are library code with known semantics, and the domain
logic on top is small enough to test exhaustively.

**Full workflow-net soundness checking — rejected.** The formally correct answer
(Petri-net soundness) is decidable and well-studied, but the implementations are Java or
Python and server-side, and CWFD ships as a single-file browser web resource. The subset
above catches the failure modes a maker can actually draw in this designer.

**Permissive join (OQ-3 alternative) — rejected**, see §2.

---

## Consequences

**Positive**
- Deadlock analysis is a pure function over a graph, so it is unit-testable with
  adversarial fixtures and no store, adapter or React involvement — exactly what C-2 asks
  for.
- Strict + acyclic means the set of publishable parallel processes is small and
  well-understood, which is the right posture while no runtime exists.
- Zero new dependencies.

**Negative / Risks**
- Strictness will reject some legitimate models — notably a branch that genuinely ends
  early. The validation message must say *how to model it instead* (route the branch to
  the join, then End), or makers will read it as a bug.
- The "topologically earliest AndJoin in the intersection" rule is a heuristic for nested
  or overlapping regions. Nested parallel regions are legal under it, but the failure mode
  if a maker builds something pathological is a false `UNMATCHED_PARALLEL_SPLIT`, i.e. it
  fails closed. Accepted, and called out for QA to probe.
- `tarjan` on every validation pass adds work to the debounced live-validation path.
  Measured against NFR-003/004 during build; the graph is small (steps, not nodes).
