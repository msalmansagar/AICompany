# DP-1 — Solution Architecture (Phase 3)

Engagement: DP-1 — Parallel (AND) Gateway: split and join
Inputs:     `brd.md` v1.0 · `phase-1-ceo.md` (APPROVED) · `github-research.md`
Date:       2026-07-26
Architect:  MSS Technologies
ADRs:       ADR-1-001 · ADR-1-002 · ADR-1-003 · ADR-1-004

---

## 1. Shape of the solution

DP-1 adds one idea to the model — a step can say *how* its successors relate — and then
propagates that idea through five layers that already exist. There is no new subsystem.

```
Dataverse        qdb_work_item_steps  + qdb_splittype  + qdb_jointype
                          │
Types            WorkflowStep extends ControlFlowFields          (mirrors SlaFields)
                          │
Adapters         controlFlowFields.ts  ← ONE shared mapping module, both adapters
                          │
Store/Domain     parallelRegions.ts (pure analysis, graphlib) → ValidationService
                          │           └────────────────────────→ PathEnumerator
Canvas/UI        StepPropertiesPanel section · EditStepNode + ViewStepNode markers
                                             · parallel edge styling
```

The engagement's whole risk sits in the third and fourth rows: 31 files read `nextStepId`,
and the semantic must not leak into any of them (BRD R-02). The design contains that by
making the semantic *additive and defaulted* — nothing reads the new fields unless it
opts in.

---

## 2. Dataverse schema

Per ADR-1-001. Two global option sets, two columns on `qdb_work_item_steps`.

| Schema name | Type | Global option set | Values |
|---|---|---|---|
| `qdb_splittype` | Picklist | `qdb_SplitType` | Exclusive 100000000 · Parallel 100000001 |
| `qdb_jointype` | Picklist | `qdb_JoinType` | None 100000000 · AndJoin 100000001 |

**Provisioning** — `scripts/add-controlflow-fields.js`, built on the same
`crm-api-client.js` + option-set-reuse pattern as `add-sla-fields.js`. Idempotent:
existing option sets are reused by MetadataId, existing columns are skipped. Codes are
declared once in `scripts/controlflow-option-codes.js` and cross-checked against
`WorkflowTypes.ts` by a unit test — the same GA-3 duplication fix DP-2's audit forced,
applied up front rather than after review.

Two DP-2 provisioning lessons are designed in rather than rediscovered:
- **Logical name derives from SchemaName.** Both names are underscore-free and identical
  to the strings the adapters use.
- **Picklists, not lookups**, so DP-2's R-2 null-clear trap does not apply. Clearing is a
  plain `null` write.

Provisioning runs **only on explicit user authorisation**, per standing rule and C-4.

---

## 3. Type layer

```ts
export type SplitType = 'Exclusive' | 'Parallel';
export type JoinType  = 'None' | 'AndJoin';

export interface ControlFlowFields {
  splitType: SplitType;
  joinType: JoinType;
}

export interface WorkflowStep extends SlaFields, ControlFlowFields { … }
```

Code maps `SPLIT_TYPE_CODES` / `JOIN_TYPE_CODES` and their inverses use the existing
`invertCodeMap` helper. Non-nullable in TypeScript with concrete defaults — the nullability
lives in Dataverse and is normalised at the adapter boundary, so no consumer ever handles
`splitType === null`.

---

## 4. Adapter layer — `src/services/controlFlowFields.ts`

Deliberately shaped as a smaller twin of `slaStepFields.ts`, because that module exists
specifically to kill dual-adapter drift (DP-2 risk R-1) and the same risk applies here.

| Export | Purpose |
|---|---|
| `emptyControlFlowFields()` | `{ splitType: 'Exclusive', joinType: 'None' }` — the default every constructor spreads |
| `mapControlFlowFields(raw)` | Raw row → typed; **null/absent → Exclusive/None** (FR-013, the compatibility guarantee) |
| `buildControlFlowBody(data)` | Typed → write body; `{}` when the write does not touch control flow |
| `copyControlFlowFields(source)` | For `deriveProcessFromSop` — emits defaults in V1, ready for DP-1b |
| `CONTROL_FLOW_SELECT_COLUMNS` | `'qdb_splittype,qdb_jointype'` for `$select` |
| `controlFlowSummaryText(step)` | Short badge text, or null when the step is plain |

Wiring points, mirroring the SLA wiring exactly (same call sites, one line each):
`DataverseAdapter` getSteps `$select` · createStep · updateStep · `mapStepRow`;
`ODataAdapter` the same four; plus `emptyControlFlowFields()` in
`workflowStore`, `useEditMode.buildNewStep`, `processTemplates`, `deriveProcessFromSop`.

**Not touched:** `qdb_sopstep` and the SOP adapters — SOP is DP-1b (CEO scope lock 2).

---

## 5. Analysis layer — `src/validators/parallelRegions.ts`

Pure, no store, no React, no adapter. Per ADR-1-002.

```ts
buildStepGraph(state)          → dagre.graphlib.Graph      // steps + synthetic __end__
findParallelRegions(state)     → ParallelRegion[]          // split, branches, join, interior
analyseParallelRegions(state)  → ParallelFinding[]         // the five defects, code + nodeIds
```

`ParallelRegion` is the single region model, consumed by **both** `ValidationService` and
`PathEnumerator` — simulation must not invent a second notion of what a region is
(ADR-1-004).

Algorithms, all from `dagre.graphlib.alg`: `topsort` for the join-matching order, `tarjan`
for cycle intersection, plus one DFS per split for branch reachability.

### Violation codes added to `ValidationService`

| Code | Severity | Fires when |
|---|---|---|
| `PARALLEL_SPLIT_SINGLE_BRANCH` | error | `splitType = Parallel` with < 2 outcomes |
| `UNMATCHED_PARALLEL_SPLIT` | error | branches never converge on a common `AndJoin` |
| `ORPHAN_AND_JOIN` | error | `joinType = AndJoin` with no inbound parallel branches |
| `PARALLEL_JOIN_DEADLOCK` | error | join enterable without all awaited branches active |
| `PARALLEL_LOOP_IN_REGION` | error | an SCC intersects a region interior (OQ-4) |
| `PARALLEL_NOT_EXECUTABLE` | error | any parallel configuration exists (ADR-1-003) |

`checkParallelRegions` is added to the existing `validate()` call list. Branch cap reuses
`TOO_MANY_OUTCOMES` — no new constant (OQ-7).

`checkOrphanSteps` and `checkEndNodes` need no change: they key off `buildReachableStepIds`,
which already counts a step reachable through *any* outcome, parallel or not. Confirmed
against the current source, and pinned by a regression test rather than left to inspection
(C-3).

---

## 6. UI layer

**Step properties panel** — a `ControlFlowSection`, sibling to `SlaEscalationSection`,
using maker vocabulary: "When this step completes → run **one** of the following /
run **all** of the following", and "Before this step starts → start immediately /
**wait for all incoming branches**". Progressive disclosure and live inline validation
match the SLA section's established behaviour, so the panel stays one idiom.

**Canvas notation** (FR-030..033, NFR-009 — never colour alone):
- Split step: `⧉ ALL` marker on the right edge of `EditStepNode`, reusing the existing
  badge slot next to the SLA badge; text + glyph + colour, all three.
- Join step: `⧉ WAIT ALL` marker on the left edge.
- Parallel edges: distinct stroke plus an `AND` edge label — the label is what survives
  greyscale printing and colour-blindness.
- `ViewStepNode` gets the same markers, fed from the same `controlFlowSummaryText`.
- **Degrade safe:** unprovisioned org → fields absent → mapper returns Exclusive/None →
  no markers, no error (FR-033).

**Layout** — no change to `EditGraphLayout`. Dagre LR already ranks a fan-out as siblings
and places a common descendant downstream; the join is a common descendant by construction.
Verified visually during build rather than assumed.

**Publish** — no code change in `usePublish`. The block is the `PARALLEL_NOT_EXECUTABLE`
violation flowing through the gate that already exists (ADR-1-003).

---

## 7. Build sequence

1. Types + `controlFlowFields.ts` + its tests. *(foundation, no behaviour change)*
2. Both adapters + all step constructors. *(round-trip works, still nothing to configure)*
3. `parallelRegions.ts` + adversarial unit tests. *(C-2 — the highest-risk unit, tested before it is wired)*
4. `ValidationService` codes incl. `PARALLEL_NOT_EXECUTABLE`. *(C-1)*
5. Panel section + canvas notation.
6. `PathEnumerator` collapse (ADR-1-004) + simulation UI narrowing.
7. Provisioning script. **Run only on explicit user go-ahead.**
8. Regression evidence for C-3, then live E2E.

Steps 1–6 need no live org. The provisioning gate is where DP-2 found two real
schema-shape bugs that tsc and unit tests both missed — it is treated as a test.

---

## 8. Risk register (architecture view)

| Risk | Treatment |
|---|---|
| R-02 semantics leak into the 31 `nextStepId` consumers | Additive + defaulted design; opt-in reads only; C-3 payload-equality regression test |
| R-03 deadlock validator subtly wrong | Pure function, library algorithms, adversarial fixtures, tested before wiring (build step 3) |
| ADR-1-004 `SimPathStep` union regresses simulation | Discriminant defaults to today's shape; existing enumerator tests must pass unchanged |
| R-06 provisioning surfaces a schema bug late | Picklists avoid DP-2's lookup traps; idempotent script; gate treated as a test |
| Validation cost on the debounced path | One graph build per pass; measured against NFR-003/004 in build |
| Strict join rejects legitimate models | Message must state the alternative modelling, not just the refusal |

---

## 9. What this architecture deliberately does not do

- No refactor of `checkDeadLoops`, `DataverseAdapter` (1 087 lines, CWFD-006) or any file
  DP-1 does not otherwise touch.
- No SOP-side work (DP-1b), no inclusive gateway, no runtime, no BPMN.
- No change to `qdb_outcome` or `qdb_outcomeworktasks`, so the chain the external execution
  layer walks is byte-identical to today for every non-parallel process.
