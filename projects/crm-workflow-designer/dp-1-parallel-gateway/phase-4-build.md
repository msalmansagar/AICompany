# DP-1 — Build Record (Phase 4)

Engagement: DP-1 — Parallel (AND) Gateway
Branch:     `feat/cwfd-dp1-parallel-gateway` (worktree `D:/AI Projects/cwfd-dp1-wt`)
Date:       2026-07-26
Status:     **Build complete, not provisioned.** Awaiting the provisioning gate,
            then code review → QA → audit → CEO final.

---

## 1. State

| | |
|---|---|
| tsc | clean |
| Tests | **169** (94 pre-existing, all still green, + 75 new) |
| Production build | green |
| Bundle | 1760.0 KB → **1770.6 KB** = **+10.6 KB** against the 25 KB NFR-002 budget |
| Live org | **untouched.** No schema provisioned, no web resource deployed |

The bundle figure was measured, not estimated: `origin/main` was built in the same
worktree with the same `node_modules`, then the branch restored.

---

## 2. What was built

**Model** — `ControlFlowFields` on `WorkflowStep`: `splitType` (`Exclusive` | `Parallel`)
and `joinType` (`None` | `AndJoin`), with option-set code maps. `100000002` is left
unallocated in both sets for a future inclusive/quorum gateway, without creating a value
nothing implements.

**Mapping** — `controlFlowFields.ts`, one shared module for both adapters, shaped as a
smaller twin of `slaStepFields.ts`. Null, absent and unrecognised codes all read back as
`Exclusive`/`None`.

**Analysis** — `parallelRegions.ts`, pure, on graphlib via the existing `@dagrejs/dagre`
dependency. Matches each split to its nearest AND-join **by hop distance rather than
topological order**: the architecture called for topological order, but `topsort` throws
on any cyclic graph, and CWFD processes legitimately contain loops elsewhere. Hop
distance gives the same answer on the acyclic region and an answer at all when the wider
graph has cycles.

**Validation** — six codes. Five structural (single-branch split, non-converging
branches, orphan join, both starvation modes of deadlock, loop in a region) plus
`PARALLEL_NOT_EXECUTABLE`, the publish block.

**UI** — `ControlFlowSection` in the step panel using the maker's vocabulary; ⧉ ALL /
⧉ WAIT ALL badges on both the edit and view canvases; AND-labelled branch edges.

**Simulation** — a parallel region collapses to one path element listing its branches;
enumeration continues from the join. Branch count no longer affects path count at all.

**Provisioning** — `add-controlflow-fields.js`, idempotent, codes cross-checked against
the TypeScript maps by a unit test.

---

## 3. Decisions taken during the build

**Option sets named `qdb_gatewaysplittype` / `qdb_gatewayjointype`, not after the
columns.** Sharing a string between a global option-set name and an attribute logical
name is probably legal. "Probably" is not something to discover against a live org, and
the distinct name costs nothing.

**ADR-1-004 amended: optional field, not a discriminated union.** A union would have
forced narrowing at every existing read of `SimPathStep.stepId` — the exact regression
risk the ADR itself flagged — for no behavioural gain. Recorded as an amendment in the
ADR rather than left as a silent divergence.

**View-mode notation shipped.** DP-2 deferred its view-mode SLA badge (D-3) as "not a
quick wire" because of the separate `WorkflowDataService → CrmStep → ViewStepData` path.
That path turned out not to be a barrier here: `ViewStepData` already carries the whole
`CrmStep`, so the badge needed three small edits, not a plumbing exercise.

---

## 4. Known constraint — carried forward from DP-2, unchanged

`getSteps`' `$select` now names `qdb_splittype` and `qdb_jointype`. Until those columns
exist on the org, **opening an existing process will fail**, exactly as DP-2's SLA
columns did before provisioning. This is a prerequisite, not a defect, and it is the
reason the provisioning gate comes before any live verification.

The in-memory new-process path (wizard → template → edit canvas) works pre-provisioning
and is how the panel and notation can be exercised locally.

---

## 5. Not done

- **Provisioning against org5869857f.** Gated on explicit user authorisation (C-4).
- **Live E2E round-trip.** Blocked by the above. DP-2 found two real schema-shape bugs
  at exactly this gate, so this is a test, not a formality.
- **Web resource deployment.** Not required for a schema + design-time change, and DP-2
  set the precedent of not redeploying for one.
- **Code review, QA, audit, CEO final.** Next gates.
- **Layout verification for a parallel region.** Dagre LR should rank branches as
  siblings with the join downstream; asserted by design, not yet seen on a canvas.

---

## 6. Commits

| Commit | Contents |
|---|---|
| `8651c119` | BRD (Phase 2) |
| `56a59fd8` | CEO gate + adopt-over-build research |
| `0acf839c` | Architecture + 4 ADRs |
| `3b9fe9aa` | Model, analysis, validation, edit-canvas notation, panel |
| `0086fdab` | View notation, simulation collapse, provisioning script, C-1/C-3 evidence |
