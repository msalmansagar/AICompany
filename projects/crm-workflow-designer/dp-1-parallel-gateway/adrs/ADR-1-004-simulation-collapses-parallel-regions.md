# ADR-1-004 — Simulation Collapses a Parallel Region Into One Concurrent Path Node

**Project:** DP-1 — Parallel (AND) Gateway (CWFD)
**Status:** Accepted
**Date:** 2026-07-26
**Decided by:** Architect — MSS Technologies
**Resolves:** OQ-5

---

## Context

`PathEnumerator` walks the graph depth-first and returns `SimPath[]` — a list of linear
step sequences, each with the outcome taken at every hop, ending in `end`, `no-outcomes`
or `cycle`. `SimulationPanel` and the auto-playback mode render those linear paths.

A parallel region is not linear. FR-060 forbids the enumerator from silently walking one
branch and presenting it as *the* path, which is what today's code would do. FR-061
forbids unbounded interleaving: a region with three branches of four steps each has
34 650 interleavings, and nested regions multiply.

---

## Decision

**A parallel region is emitted as a single path element representing all its branches
running together, not as separate paths and not as interleavings.**

`SimPathStep` gains an optional concurrent form: instead of one `stepId`/`stepName`, the
element carries the set of branch entry steps and the matched join, and the UI renders it
as one "these run at the same time" block listing the branches. Enumeration then continues
from the join step as if the region were a single node.

Consequences for path counts: a process with one parallel region produces the same number
of paths as the same process with the region collapsed to a single step. Branch count does
not multiply path count at all, which is what makes FR-061 hold by construction rather
than by a cap.

Within a branch, exclusive choices still enumerate normally — a branch containing an
either/or step contributes its alternatives to the block's description of that branch, not
to the outer path list.

---

## Alternatives Considered

**Enumerate all interleavings — rejected.** It is the only faithful representation of what
a runtime would actually do, and it is unusable: factorial growth, and a path list a human
cannot read. It would also be simulating a runtime that does not exist, with token
semantics nobody has specified.

**Enumerate one path per branch — rejected.** Cheap and it does show every branch. But it
misrepresents concurrency as choice: the reader sees three paths and concludes the process
picks one, which is precisely the confusion DP-1 exists to eliminate.

**Refuse to simulate processes with parallel regions — rejected.** Defensible given the
publish block, and it would have been the cheapest option. Rejected because simulation is
how Business Analysts review a model, and DP-1's entire interim value is a reviewable,
truthful diagram. Blocking review of exactly the models DP-1 adds would gut that value.

---

## Consequences

**Positive**
- Honest: concurrency is visible as concurrency (FR-060), and paths stay readable.
- Bounded by construction (FR-061) — no cap, no truncation, no "showing first 50 paths".
- The collapse point is the matched join, which ADR-1-002's analysis already computes, so
  simulation reuses the validator's region model instead of inventing a second one.

**Negative / Risks**
- `SimPathStep` gains a concurrent form, which every consumer — `AutoSimulationPanel`,
  auto-playback, and the `PathEnumerator` tests — may need to account for. This is the
  widest type change in the engagement and the most likely source of regression in
  existing simulation behaviour.

> **Amendment (build, 2026-07-26).** This ADR originally specified a *discriminated
> union* on `SimPathStep`. It was built as an **optional `concurrentBranches` field** on
> the existing shape instead. A union would have forced narrowing at every existing read
> of `stepId` — which is precisely the regression risk this section warns about — for no
> behavioural gain. With the optional field the concurrent element is still an ordinary
> path step (it *is* the split step, with its branches attached), so untouched consumers
> keep working and rendering the branches is opt-in. The decision's intent — concurrency
> visible, enumeration bounded, one region model shared with the validator — is unchanged.
- Simulation cannot show what happens when one branch is slower than another; it shows
  structure, not timing. Correct for a design-time tool, but it means simulation cannot be
  used to reason about SLA interaction across branches. Noted for CWFD-005.
- An unmatched or invalid parallel region has no join to collapse to. In that case the
  enumerator falls back to ending the path with a dedicated reason rather than guessing —
  the model is already failing validation, so simulation should not paper over it.
