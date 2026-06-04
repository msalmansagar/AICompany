# ADR-003 — Zustand Flat-Map State Architecture
**Project:** CWFD-001 — CRM Visual Workflow Designer
**Status:** Accepted
**Date:** 2026-06-01
**Decided by:** Architect — Maqsad AI

---

## Context

The workflow designer canvas displays a directed graph with up to 200 nodes
(Steps, Outcomes, Routes) and their corresponding edges. The state must support:

1. O(1) lookup of any node by its CRM GUID (or temporary `tmp_xxx` ID).
2. Selective re-rendering — updating a single StepNode property must not re-render
   all OutcomeNodes or RouteEdges.
3. Undo/redo over the full graph state (FR-07g — minimum 50 history states).
4. Dirty tracking: which records are new, changed, or deleted since last save (FR-20).
5. Canvas layout positions stored alongside entity data.

Two structural approaches were evaluated:

**Approach A — Nested tree mirroring the CRM entity hierarchy:**
```typescript
{
  process: WorkflowProcess & {
    steps: Array<WorkflowStep & {
      outcomes: Array<WorkflowOutcome & {
        routes: WorkflowRoute[]
      }>
    }>
  }
}
```
Lookup by ID requires O(N) scan or a secondary index. Updating a route requires
cloning the entire nested chain (process → step → outcome → route) even when only
a single field changed. Immer handles this correctly but the path is verbose and
error-prone.

**Approach B — Flat maps keyed by CRM ID:**
```typescript
{
  process: WorkflowProcess | null;
  steps: Record<string, WorkflowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  routes: Record<string, WorkflowRoute>;
  stepOrder: string[];
  outcomeOrder: Record<string, string[]>;
  routeOrder: Record<string, string[]>;
}
```
Lookup is O(1) by key. Updating any record requires a single key assignment in
the Immer draft. React component subscriptions can be scoped to `store.steps[id]`
avoiding cross-entity re-renders.

---

## Decision

Adopt Approach B — flat maps keyed by entity ID, with explicit ordering arrays.

Full state interface:
```typescript
interface WorkflowDesignerState {
  // Process
  process: WorkflowProcess | null;

  // Entity maps (O(1) lookup)
  steps: Record<string, WorkflowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  routes: Record<string, WorkflowRoute>;

  // Ordering (defines visual sequence within parent)
  stepOrder: string[];                      // process-level step sequence
  outcomeOrder: Record<string, string[]>;   // stepId → sorted outcomeIds
  routeOrder: Record<string, string[]>;     // outcomeId → sorted routeIds

  // Canvas layout (persisted to qdb_workflow_snapshot on publish)
  nodePositions: Record<string, XYPosition>;

  // Dirty tracking (same pattern as Form Designer — ADR-008 equivalent)
  newIds: Set<string>;
  dirtyIds: string[];
  deletedIds: string[];
  deletedEntityTypes: Record<string, 'step' | 'outcome' | 'route'>;

  // UI state (not persisted, not part of undo history)
  selectedId: string | null;
  isDirty: boolean;
  isPublishing: boolean;
  isSaving: boolean;
  previewMode: boolean;
  validationResults: ValidationResult[];
}
```

**Ordering arrays** hold the sorted IDs in the sequence they should be rendered
on canvas. Reordering a step updates `stepOrder` only — the `steps` map is
unchanged. This produces minimal Immer diffs and minimal re-renders.

**Dirty tracking** mirrors the Form Designer (FDWR-001 ADR-008) because it
proved correct in production on that engagement:
- `newIds`: Set of IDs not yet persisted to CRM (start with `tmp_xxx` prefix).
- `dirtyIds`: IDs of existing CRM records that have unsaved local changes.
- `deletedIds`: IDs of CRM records pending deletion.
- `deletedEntityTypes`: Maps deleted ID → entity type for correct API routing.

**Undo/redo** uses `zundo` middleware which snapshots the mutable portions of state
(steps, outcomes, routes, stepOrder, outcomeOrder, routeOrder, nodePositions) via
`partialize`. UI state (selectedId, isSaving, previewMode) is excluded from the
undo history.

---

## Temporary ID Convention

All locally-created records receive a `tmp_` prefixed UUID:
```typescript
const tmpId = `tmp_${crypto.randomUUID()}`;
```
When a CREATE operation succeeds, the `tmp_xxx` key in the flat map is replaced
with the real CRM GUID. All ordering arrays referencing the `tmp_xxx` key are
updated atomically within the same Immer draft. This is done in the
`useWorkflowSave` hook after each successful create response.

---

## Selectors

The `nodes[]` and `edges[]` arrays required by `<ReactFlow>` are derived from the
flat maps via memoised selectors in `src/store/selectors.ts`:

```typescript
// Derived — never the source of truth
export const selectReactFlowNodes = (state: WorkflowDesignerState): Node[] => [
  ...selectStartNode(state),
  ...Object.values(state.steps).map(stepToNode(state.nodePositions)),
  ...Object.values(state.outcomes).map(outcomeToNode(state.nodePositions)),
];

export const selectReactFlowEdges = (state: WorkflowDesignerState): Edge[] => [
  ...selectStepToOutcomeEdges(state),
  ...selectOutcomeToStepEdges(state),
];
```

React Flow renders from these derived arrays. It never writes back to the store
directly. On a node drag-end, React Flow emits an `onNodesChange` event; the
handler updates `nodePositions` in the store — completing the cycle.

---

## Alternatives Rejected

**Redux Toolkit:** Introduces action/reducer boilerplate. For a single-screen application
with no server-synchronised state (no Redux Saga/Thunk required), the overhead is
unjustified. Zustand with Immer achieves the same structural sharing in ~5% of the
boilerplate.

**React Context:** Full subtree re-renders on every state change. At 200 nodes, a
single `nodePositions` update would re-render all StepNode, OutcomeNode, and RouteEdge
components. Unacceptable for 30fps NFR-01b.

**MobX:** Observable graph works but adds a class-based mutation pattern that conflicts
with functional component idioms and makes snapshot serialisation for undo/redo
non-trivial.

---

## Consequences

**Positive:**
- Any component can subscribe to a single node's data: `useWorkflowStore(s => s.steps[id])`
  — zero re-renders on unrelated updates.
- Immer diffs on flat-map mutations are shallow and fast.
- Dirty tracking is per-ID, not per-field — simple and reliable.
- The `tmp_xxx` convention makes upsert logic (CREATE vs UPDATE) unambiguous
  throughout the save pipeline.

**Negative / Risks:**
- Ordering arrays must be kept consistent with the maps at all times. A step added
  to `steps` without a corresponding entry in `stepOrder` would be invisible on
  canvas. Every mutation that creates or deletes a record must update both the map
  and the ordering array in the same Immer draft.
- The `zundo` partialize function must be reviewed whenever new top-level state slices
  are added. Accidentally including UI state in the undo snapshot wastes memory.
