# DFE-ENH-001 Phase 4 — Workstream H: Diff Core
**Engagement ID:** DFE-ENH-001
**Workstream:** H — microdiff + FormDiffViewer (FR-004 / FR-001 shared foundation)
**Prepared by:** Maqsad AI — Frontend Developer
**Branch:** `feat/dfe-enh-diff`
**Date:** 2026-07-11
**Status:** COMPLETE

---

## 1. Deliverables

| File | Type | Purpose |
|---|---|---|
| `designer/src/services/FormDiffService.ts` | Service | microdiff wrapper; exports `diffForms()`, `summarizeDiff()`, `FormChange`, `FormDiff`, `DiffSummary` |
| `designer/src/components/FormDiffViewer.tsx` | React component | Visual diff renderer (Accordion + Badge, Fluent UI v9) |
| `designer/tests/services/FormDiffService.test.ts` | Unit tests | 18 Vitest tests for `diffForms` + `summarizeDiff` — pure TypeScript, no DOM |
| `designer/tests/components/FormDiffViewer.test.tsx` | Component tests | 11 Vitest + React Testing Library tests for FormDiffViewer |
| `designer/package.json` | Manifest | `microdiff ^1.5.0` added to `dependencies` |

---

## 2. Public Contracts

### FormChange

The typed shape consumed by `FormDiffViewer` and future callers (`FR-001`
`ConflictResolutionDialog`, `FR-004` version diff panel):

```typescript
/** Normalised change kind — microdiff's "CHANGE" is surfaced as "UPDATE". */
export type FormChangeKind = 'CREATE' | 'UPDATE' | 'REMOVE';

export interface FormChange {
  /** What happened to this property. */
  kind: FormChangeKind;

  /**
   * Full path from microdiff. Segments are strings (object keys) or
   * numbers (array indices). Example: ['fields', 0, 'label'].
   */
  path: (string | number)[];

  /**
   * Top-level grouping key derived from path[0].
   * 'root' when the path is empty (edge case guard).
   * Used by FormDiffViewer to section the UI per area.
   */
  area: string;

  /** State before the change. undefined when kind is CREATE. */
  oldValue: unknown;

  /** State after the change. undefined when kind is REMOVE. */
  newValue: unknown;
}

/** Convenience alias: a diff result is an ordered list of FormChange records. */
export type FormDiff = FormChange[];
```

### DiffSummary

Human-readable summary consumed by Workstream A's `ConflictResolutionDialog`
to render the dialog body before the user opens the full viewer:

```typescript
export interface DiffSummary {
  totalChanges: number;
  humanReadable: string;   // e.g. "3 fields changes, 1 rules change"
}
```

---

## 3. Public API

### `diffForms(before: object, after: object): FormChange[]`

Wraps `microdiff(before, after)` and normalises the output to `FormChange[]`.

- Returns `[]` when the two snapshots are equal.
- microdiff's `CHANGE` type maps to `FormChangeKind = 'UPDATE'`.
- `oldValue` is always `undefined` for `CREATE`; `newValue` is always `undefined` for `REMOVE`.
- Type cast at the microdiff external-library boundary only (microdiff uses `Record<string,any>`).

### `summarizeDiff(changes: FormChange[]): DiffSummary`

Produces a human-readable summary from a `FormDiff` for use in dialog bodies.

```typescript
const summary = summarizeDiff(diffForms(localSnapshot, serverVersion));
// summary.totalChanges  → 4
// summary.humanReadable → "3 fields changes, 1 rules change"
```

Called by Workstream A's `ConflictResolutionDialog` to render body text before
the user opens the full `FormDiffViewer`.

### `FormDiffViewer` component

```tsx
<FormDiffViewer
  before={localSnapshot}         // earlier object
  after={serverVersion}          // later object
  labelResolver={resolvePath}    // optional: (path: string[]) => string
/>
```

- Calls `diffForms(before, after)` internally via `useMemo`.
- Groups changes by `change.area` (top-level key).
- Renders one `AccordionItem` per area, all expanded by default.
- Each change row: Badge (`+` success / `−` danger / `~` warning) + resolved label + before/after values.
- Falls back to `path.map(String).join(' → ')` when no `labelResolver` is provided.
- Renders "No changes detected between the two versions." when the two objects are equal.
- Prop shape is the CANONICAL contract adopted by Workstream A — do not change.

---

## 4. Architecture Compliance

| ADR | Decision | How honoured |
|---|---|---|
| ADR-003 | BUILD `FormDiffViewer` — no third-party renderer | Component built at 128 lines; uses only Fluent UI v9 + microdiff |
| Phase-3-arch §2.9 | microdiff v1.5.x | `microdiff ^1.5.0` installed; `FormDiffService` wraps it |
| Phase-3-arch §8.4 | Unit + component test coverage for Workstream H | 18 service + 11 component = 29 tests; all passing |

---

## 5. Test Summary

### Service tests — `tests/services/FormDiffService.test.ts`

| Scenario | Result |
|---|---|
| Identical snapshots return `[]` | PASS |
| Empty objects return `[]` | PASS |
| Added key → `CREATE` with correct `newValue`, `oldValue` undefined | PASS |
| Added nested value → `CREATE` with object `newValue` | PASS |
| Deleted key → `REMOVE` with correct `oldValue`, `newValue` undefined | PASS |
| Array element removed → `REMOVE` with correct `oldValue` | PASS |
| Changed scalar → `UPDATE` with both `oldValue` and `newValue` | PASS |
| Changed string value → correct `oldValue`/`newValue` | PASS |
| Area derived from `path[0]` | PASS |
| Full nested path reported | PASS |
| Array index appears as numeric segment in path | PASS |
| Multiple changes returned together | PASS |
| Mixed CREATE + UPDATE + REMOVE in one diff | PASS |

| `summarizeDiff_EmptyChanges_ReturnsZeroTotalAndNoChangesMessage` | PASS |
| `summarizeDiff_SingleAreaWithOneChange_ReturnsCorrectCountAndAreaName` | PASS |
| `summarizeDiff_MultipleAreas_FormatsEachAreaSeparately` | PASS |
| `summarizeDiff_OneChangeInArea_UsesChangeSingularForm` | PASS |
| `summarizeDiff_TwoChangesInOneArea_UsesPluralChanges` | PASS |

**Total: 18/18 PASS**

### Component tests — `tests/components/FormDiffViewer.test.tsx`

| Scenario | Result |
|---|---|
| Identical objects → empty state message | PASS |
| Two changed top-level keys → two accordion sections | PASS |
| Two changes in same area → count badge shows 2 | PASS |
| CREATE change → `+` badge rendered | PASS |
| REMOVE change → `−` badge rendered | PASS |
| UPDATE change → `~` badge rendered | PASS |
| UPDATE → "Before:" and "After:" both rendered | PASS |
| CREATE → no "Before:" rendered | PASS |
| REMOVE → no "After:" rendered | PASS |
| Custom `labelResolver` called and result rendered | PASS |
| Default label `path.join(' → ')` rendered without resolver | PASS |

**Total: 11/11 PASS**

---

## 6. TypeScript

`npx tsc --noEmit` — zero errors introduced by the two new files.
Pre-existing errors (all in `@qdb/shared` module resolution — Vite-alias-only) are
unaffected and were present on `origin/main` before this workstream.

---

## 7. Deviations from Architecture

Three intentional deviations from Phase 3 architecture §2.9:

**1. Function-over-class**
Phase 3 described `FormDiffService { static diff(...) }` as a static class.
Implementation uses standalone exported functions (`diffForms`, `summarizeDiff`) instead.
Standalone functions are the idiomatic TypeScript pattern for stateless pure utilities —
there is no behavioural difference and no loss of testability.
A class would add a layer with no cohesive state to encapsulate.

**2. Flat `FormChange[]` vs rich `FormDiff` object**
Architecture §2.9 specified `FormDiff { entries: DiffEntry[], fieldsAdded: string[], fieldsRemoved: string[], rulesAdded: string[], ... }` as a rich envelope.
Implementation uses `type FormDiff = FormChange[]` — a flat ordered list.
The rich derived fields (`fieldsAdded`, `rulesAdded`, etc.) are all derivable from the flat
list by callers using `filter` + `map`. Using a flat list keeps the API minimal (YAGNI),
avoids redundant computed properties, and is sufficient for both FR-001 and FR-004.
If Phase 2 requires the rich shape, an `enrichDiff(changes: FormDiff): RichFormDiff`
function can be added without breaking any existing caller.

**3. `summarizeDiff` not in original spec**
`summarizeDiff(changes: FormChange[]): DiffSummary` was not in the Phase 3 architecture.
It was added during implementation to satisfy Workstream A's `ConflictResolutionDialog`,
which needs a prose summary for the dialog body text before the user opens the full
`FormDiffViewer`. This is a purely additive export; no existing contract was changed.

**Minor clarification (not a deviation)**
The Phase 3 spec notes `labelResolver?: (path: string[]) => string` for the component prop.
microdiff paths are `(string | number)[]`. The component converts numeric segments to strings
via `change.path.map(String)` before calling the resolver, so the public contract is
exactly `(path: string[]) => string` as specified — no change to the caller interface.
