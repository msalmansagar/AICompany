# DP-1 — GitHub Research (adopt-over-build pass)

Engagement: DP-1 — Parallel (AND) Gateway
Date:       2026-07-26
Gate:       Mandatory pre-implementation research per CLAUDE.md ("adopt over build
            whenever a battle-tested library with 1000+ stars fits")

---

## 1. What we are actually looking to avoid building

DP-1 splits into three buildable pieces. Only the third is a plausible adoption target.

| Piece | Adoptable? |
|---|---|
| Persisted split/join semantics on `qdb_work_item_steps` | No — Dataverse schema, domain-specific |
| Canvas notation for split/join in React Flow | No — already own the node/edge layer |
| **Structural analysis of the graph** — reachability, cycle detection, matching a split to its join, proving an AND-join cannot deadlock | **Yes — this is graph theory, not domain logic** |

The research therefore targets the third: is there a maintained library that will tell us
whether a parallel region is structurally sound, so we do not hand-roll it?

---

## 2. Candidates evaluated

### 2a. Workflow engines with parallel/join support

| Project | Stars | Verdict |
|---|---|---|
| [ts-edge](https://github.com/cgoinglove/ts-edge) | < 1 000 | **REJECT** |
| [workflow-es](https://danielgerlag.github.io/workflow-es/typescript-guide.html) | ~1 000 | **REJECT** |
| [serverlessworkflow/sdk-typescript](https://github.com/serverlessworkflow/sdk-typescript) | ~200 | **REJECT** |
| [lyraproj/ts-workflow](https://github.com/lyraproj/ts-workflow) | < 100 | **REJECT** |
| [Workflow SDK](https://workflow-sdk.dev/) | n/a (commercial) | **REJECT** |

All five are **runtime execution engines**. They own the workflow model, execute it in
their own process, and validate their own DSL. Adopting one would mean either
(a) re-expressing the Dataverse graph in a second, foreign model purely to borrow its
validator — a translation layer with its own drift risk, for a validator we would still
have to teach our domain rules — or (b) letting a library define control-flow semantics
that the QDB CRM execution layer, not the library, actually implements. Both invert the
architecture. CWFD is design-time only (BRD C-01); a runtime engine is the wrong shape of
dependency regardless of star count.

Note also that `serverlessworkflow/sdk-typescript` does ship graph-building and validate
helpers — but they validate *its own* Serverless Workflow DSL, not an arbitrary graph.

### 2b. BPMN tooling

| Project | Stars | Verdict |
|---|---|---|
| bpmn-js / bpmn-moddle (Camunda) | 8 000+ | **REJECT for DP-1 — revisit for DP-8** |

Mature, well-licensed (MIT) and directly on-topic for gateway notation. Rejected here
because adopting it means adopting BPMN as CWFD's notation and model, which is explicitly
a separate backlog item (DP-8, BPMN 2.0 import/export) and explicitly out of DP-1's scope
(BRD X-07). Pulling it in for one gateway shape would be a notation migration disguised as
a dependency. Recorded as the natural adoption candidate **if and when DP-8 is authorised.**

### 2c. Formal workflow-net soundness checkers

Woflan, PM4Py and the academic Petri-net soundness literature solve exactly our
verification problem, and solve it properly. All are Java or Python, server-side, and
frequently heavier than the entire CWFD bundle. CWFD ships as a **single-file browser web
resource** inside a Dataverse iframe (`vite-plugin-singlefile`). Not adoptable. **REJECT.**

### 2d. Graph algorithm libraries — the one real hit

**`graphlib` via the existing `@dagrejs/dagre` dependency — ADOPT. No package.json change.**

- MIT, maintained by the dagre org. `@dagrejs/dagre` ^1.1.4 is **already a direct
  dependency** and **already re-exports graphlib**: `EditGraphLayout.ts` uses
  `dagre.graphlib.Graph` today, and `index.d.ts` types the full `graphlib.alg` namespace
  (`tarjan`, `topsort`, `findCycles`, `components`, `dfs`, `dijkstra`).
- So this is not a new dependency, a version bump, or even a manifest edit — it is using
  more of a library the project already ships, already trusts for layout, and already has
  type definitions for. Verified in the installed tree at
  `node_modules/@dagrejs/dagre/index.d.ts`.
- It supplies exactly the primitives DP-1's validation needs:

  | Algorithm | DP-1 use |
  |---|---|
  | `tarjan` (strongly connected components) | Cycle regions — feeds FR-053 deadlock analysis and keeps the existing `DEAD_LOOP` check correct inside a parallel region (FR-055) |
  | `topsort` | Ordering the DAG to match a split to its join |
  | `dfs` / `preorder` / `postorder` | Reachability per branch |
  | `components` | Detecting branches that cannot converge |
  | `isAcyclic`, `findCycles` | Loop-crossing-a-parallel-region check (OQ-4) |
  | `dijkstra` | Not needed |

- **Zero net bundle cost and zero new supply-chain surface** — it is already shipped.
- Satisfies NFR-004 (near-linear analysis): tarjan and topsort are O(V+E), where a
  hand-rolled repeated-DFS reachability check would trend quadratic on large processes.

Star count for graphlib as a standalone package is below the 1000 threshold, but the
rule's intent is satisfied and then some: it is the algorithm core of dagre (5 000+ stars),
it is already a shipped, typed, trusted part of this bundle, and adopting it adds nothing
to review, license or audit.

---

## 3. Decision

**ADOPT graphlib's algorithms via the existing `@dagrejs/dagre` dependency** for the
graph-theoretic layer of DP-1 validation — SCC, topological order, reachability. No
manifest change, no new package to license, review or audit.
**BUILD** the domain layer on top of it: what constitutes
a matched split/join, when an AND-join deadlocks, and how that maps to `ViolationCode`s.
That domain layer is CWFD-specific by definition and has no adoption candidate.

**BUILD** notation and persistence — no candidates, and the existing React Flow node/edge
and adapter layers already own those concerns.

This mirrors the honest outcome of the DP-2 research pass, where the conclusion was also
that a domain-specific Dataverse schema plus panel had nothing to adopt — with the
difference that DP-1's analysis half genuinely does, and taking it removes the highest-risk
hand-rolled code in the engagement (BRD R-03).

Architecture owns confirming the graphlib promotion in an ADR and checking it against the
`vite-plugin-singlefile` build.

---

## 4. Rejected — summary table for `dependencies.md`

| Package | Stars | Reason for rejection |
|---|---|---|
| bpmn-js / bpmn-moddle | 8 000+ | Adopting BPMN notation is DP-8, not DP-1; would be a model migration disguised as a dependency |
| ts-edge | < 1 000 | Runtime execution engine; CWFD is design-time only; would own the workflow model |
| workflow-es | ~1 000 | Runtime engine, same inversion; last meaningful activity long stale |
| serverlessworkflow/sdk-typescript | ~200 | Validates its own DSL, not an arbitrary graph; below threshold |
| lyraproj/ts-workflow | < 100 | FSM library, unmaintained, below threshold |
| Workflow SDK (workflow-sdk.dev) | n/a | Commercial durable-execution service; wrong layer entirely |
| Woflan / PM4Py (soundness checkers) | n/a | Java/Python server-side; incompatible with a single-file browser web resource |

**Sources:**
[ts-edge](https://github.com/cgoinglove/ts-edge) ·
[workflow-es](https://danielgerlag.github.io/workflow-es/typescript-guide.html) ·
[serverlessworkflow/sdk-typescript](https://github.com/serverlessworkflow/sdk-typescript) ·
[lyraproj/ts-workflow](https://github.com/lyraproj/ts-workflow) ·
[Workflow SDK](https://workflow-sdk.dev/)
