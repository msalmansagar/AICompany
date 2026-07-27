# DP-1 — Code Review + QA (Phases 4b / 5)

Engagement: DP-1 — Parallel (AND) Gateway
Date:       2026-07-26
Verdict:    **CONDITIONAL PASS — all required conditions resolved in this gate.**
Suite:      **174 tests** (94 pre-existing, all green, + 80 new)

---

## Part 1 — Code review

Three real findings. All fixed; none were cosmetic.

### CR-1 [required] `collectInterior` was quadratic — violated NFR-004

The region interior was computed by asking, for each candidate step, "can you reach the
join?" — a fresh forward reachability walk per candidate, so O(V·(V+E)) on the step graph.
NFR-004 requires near-linear analysis, and this runs on the debounced live-validation path,
so it degrades exactly where it is least affordable: a large process being actively edited.

Fixed by inverting the question. One backwards walk from the join (`ancestorsOf`) yields
every step that can reach it; interior is then a set intersection. O(V+E), once per region.

The 169 tests passing unchanged before and after is the behaviour-preservation evidence —
the fixtures include multi-step branches, nested regions and inner exclusive choices, all
of which exercise interior membership.

### CR-2 [required] `findCycles` recomputed per region

`checkLoopInRegion` called `dagre.graphlib.alg.findCycles(graph)` for every region. Cycles
are a property of the whole graph, so a process with three parallel splits ran Tarjan three
times over the same graph for identical results. Hoisted into an `AnalysisContext` computed
once per analysis.

### CR-3 [required] The Branching radio groups were not groups

Each radio was rendered with `name={`${label}-${option.value}`}` — a *unique* name per
option, so every radio was its own group of one. `checked` is controlled so it looked
correct, which is what makes this the kind of bug that ships: the visible behaviour is
right and the accessibility behaviour is wrong. Arrow-key navigation between options
silently does not work, and screen readers announce two unrelated controls rather than a
two-option choice.

Fixed with one `name` per group, derived from `useId()` so two sections on one document
can never collide.

### Reviewed and deliberately left alone

- `PICKLIST_FIELDS[].description` is no longer sent to Dataverse (see the provisioning
  finding) but is kept as the field's documentation, with a comment saying so. A reviewer
  would reasonably flag it as dead data; it is retained deliberately, because deleting it
  would leave the columns' purpose recorded nowhere.
- `buildOutcomeEdge` already takes 5 parameters, over the constitution's limit of 3. DP-1
  needed to mark parallel branch edges and did **not** add a sixth: the decoration is a
  separate `asParallelBranchEdge(edge)` function. Fixing the pre-existing signature is out
  of scope (Boy Scout ≠ refactor what you are not changing).
- `checkDeadLoops` in `ValidationService` keeps its own hand-rolled DFS rather than moving
  to graphlib. Out of scope, and touching the existing loop detection is exactly the kind
  of change that risks R-02.

---

## Part 2 — QA

### Q-1 [required] `describeBranches` shipped with no direct test — FIXED

It was exercised only indirectly, through `PathEnumerator`. It is the function that
decides what a reviewer is told runs concurrently, so it earns its own tests. Added five
covering: one branch per successor, the join excluded, the synthetic `END_SINK` never
leaking into user-visible output, multi-step branches carried whole, and a split with no
join still described rather than returning nothing.

### Coverage summary

| Area | Tests | Notes |
|---|---|---|
| `controlFlowFields` mapping | 26 | defaults, null/absent/unknown codes, round trip, partial writes, badge text |
| Option-set code parity | 3 | script vs TypeScript, plus 100000002 left unallocated |
| `parallelRegions` structure | 40 | graph build, region discovery, all five defects, nesting, branch description |
| `ValidationService` | 12 | C-3 regression, C-1 publish block, message wording |
| `PathEnumerator` | 9 | non-parallel unaffected, collapse, path count invariance, unmatched |
| Pre-existing suite | 94 | all green, unchanged |

### Requirements verified

| Requirement | Evidence |
|---|---|
| FR-013 null → Exclusive/None | unit + **live** (E2E null-clear) |
| FR-050..054 structural defects | unit, adversarial fixtures |
| FR-056 errors block Publish | unit (severity assertion on the real service) |
| FR-060 concurrency visible | unit — collapse element carries every branch |
| FR-061 bounded enumeration | unit — 2, 3 and 5 branches all yield one path |
| NFR-001 zero change without parallel config | unit — valid non-parallel process yields **zero** violations |
| NFR-002 ≤ 25 KB | measured: +10.6 KB |
| NFR-004 near-linear | CR-1 fix; no per-candidate reachability, no per-region Tarjan |
| BR-007 existing processes untouched | **live** — Test Filter unchanged, 3 steps, all null |

### Accepted gaps

- **G-1 No component tests.** `ControlFlowSection` has none, because the project has no
  jsdom environment (a known gap since DP-11 stood vitest up in Node env). CR-3 is exactly
  the class of bug a component test would have caught, and it was found by reading instead.
  Ties to the existing DP-11 follow-up; not opened as new work here.
- **G-2 Canvas layout unverified for a real parallel region.** Dagre LR *should* rank
  branches as siblings with the join downstream. That is a design assertion, not an
  observation — no parallel process has been rendered. Cheap to close once someone builds
  one in the UI; called out to the CEO rather than buried.
- **G-3 No automated integration harness.** Live verification was a throwaway script,
  same as DP-2. No CI harness exists for Dataverse round-trips.
- **G-4 Nested-region join matching is heuristic.** "Nearest common AND-join by hop
  distance" is correct for the shapes tested, including nesting. A pathological graph
  could mismatch; it fails closed (`UNMATCHED_PARALLEL_SPLIT`), so the failure mode is a
  refused model, never a wrong one.
