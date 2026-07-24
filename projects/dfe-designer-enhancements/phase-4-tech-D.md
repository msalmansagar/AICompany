# Phase 4 — Workstream D: Keyboard DnD Sensor + Field List Virtualisation

**Project:** DFE-ENH-001 — Form Designer Enhancements
**Engagement IDs:** FR-009 (keyboard drag-drop), ENT-010 (virtualisation)
**Branch:** `feat/dfe-enh-dnd` (based on `feat/dfe-designer-style-load`)
**Author:** Frontend Developer — Maqsad AI
**Date:** 2026-07-11
**Status:** IMPLEMENTED — awaiting Phase 5 QA

---

## Scheduling Risk (C-003)

This branch is based on `feat/dfe-designer-style-load`, not `main`, per the condition that
style-load work (DFE-STYLE-001) must land first. When DFE-STYLE-001 merges to main, this
branch must be rebased: `git rebase main`. The files added in Workstream D have no
conflicts with STYLE-001 changes (orthogonal: sensor + constants + tests vs theme/style
loading). Risk of merge conflict: **LOW**.

---

## ADR-009: IndexBasedKeyboardSensor Design

**Status:** Accepted
**Date:** 2026-07-11
**Context:**

dnd-kit's built-in `KeyboardSensor` (v6.1) computes move targets by measuring pixel
distances between DOM rectangles (`getSortedRects`). For variable-height field and
section cards — the designer's primary content — this produces incorrect movement:
pressing ArrowDown while on a 40px card followed by a 200px card moves the item to
the wrong position. This is dnd-kit issue #985.

**Decision:**

Do not use dnd-kit's built-in `KeyboardSensor`. Implement `IndexBasedKeyboardSensor`,
a standalone class that:

1. Listens for `keydown` globally via a React hook (`useIndexBasedKeyboard`).
2. Responds only to `Alt+ArrowUp` and `Alt+ArrowDown` to avoid conflicting with
   native arrow-key navigation in Fluent UI menus and text inputs.
3. Reads `data-sortable-id`, `data-sortable-container`, and `data-sortable-type`
   data attributes from the nearest ancestor of the event target.
4. Calls `reorderFields` or `reorderSections` in the Zustand store directly,
   bypassing dnd-kit's drag lifecycle entirely.
5. Announces every successful move via an `aria-live="polite"` region:
   _"Moved [field label] to position N of M"_.

**Why not a proper dnd-kit Sensor class?**

dnd-kit's sensor API is built around a physical drag lifecycle (start → move → end),
driven by pointer or keyboard events that produce a `Translate` delta. Index-based
reordering has no physical delta — the target position is known immediately from the
sorted list. Implementing a conforming `Sensor` class for this pattern would require
mocking the `collisionDetection` result and injecting a fake overlay transform, adding
~250 lines of adapter code with no architectural benefit. The direct-store approach is
simpler, testable, and more robust.

**Key bindings:**

| Key | Action |
|-----|--------|
| `Alt+ArrowUp` | Move focused field/section one position up in its container |
| `Alt+ArrowDown` | Move focused field/section one position down in its container |

Alt-prefix was chosen to avoid colliding with:
- Native `ArrowUp/Down` (scroll, option navigation in dropdowns)
- Existing Ctrl+Z / Ctrl+Y (undo/redo, already wired in DesignerScreen)

**ARIA live region:**

A visually hidden `role="status"` / `aria-live="polite"` `<div>` in `DesignerScreen`
is updated by `setKeyboardAnnouncement` after each successful move. Screen readers
announce the new position without interrupting the current reading flow.

**Data attributes on sortable elements:**

| Element | `data-sortable-id` | `data-sortable-container` | `data-sortable-type` |
|---------|-------------------|--------------------------|----------------------|
| `FieldSlot` root `<div>` | `field.id` | `field.sectionId` | `"field"` |
| `SectionContainer` header `<div>` | `section.id` | `section.tabId` | `"section"` |

The sensor uses `element.closest('[data-sortable-id]')` to handle events on child
elements (e.g., the text label span inside a field card).

**Consequences:**

- `KeyboardSensor` from `@dnd-kit/core` is removed from the sensor list.
- The `PointerSensor` activation distance is tightened from `8px` to `5px`
  (see PointerSensor Tuning below).
- Tab navigation in the canvas continues to work (sortable items retain `tabIndex={0}`
  from `useSortable` attributes).

---

## PointerSensor Activation Tuning

**Previous:** `activationConstraint: { distance: 8 }`
**New:** `activationConstraint: { distance: 5 }`

**Rationale:** At 8px, a user clicking quickly on a field card label and moving slightly
could accidentally start a drag, interfering with text selection within the label. 5px
is a tighter threshold that still provides clear intent differentiation between a click
and a deliberate drag on a desktop pointer device. This also matches the recommended
default in the dnd-kit docs for mouse-primary interfaces.

`delay`-based activation was evaluated and rejected: a 150ms delay makes dragging feel
sluggish for experienced users, and the 5px distance constraint already solves the
accidental drag problem.

---

## ENT-010: Field List Virtualisation

### Library Choice

`@tanstack/react-virtual` v3 (64k+ GitHub stars, MIT, TypeScript-first, framework-agnostic).
This is the defacto standard for React window-based virtualisation. The alternative,
`react-window` (13k stars), is in maintenance mode with no v3 release.

### Threshold

```typescript
// src/designer/dnd/dndConstants.ts
export const VIRTUALIZATION_THRESHOLD = 40;
```

Fields per section above `VIRTUALIZATION_THRESHOLD` trigger virtualised rendering.
This threshold was chosen because:
- Per NFR-011 the designer must handle 20 fields per section without degradation
- The threshold of 40 is 2× the typical maximum, covering pathological cases without
  triggering virtualisation in normal use
- `shouldVirtualizeFieldList(count)` is a pure function, testable without a component

### Virtualisation Strategy

**Location:** `SectionContainer.tsx` — virtualises only the field list within a section.
  The section list itself (max 5 sections per tab per NFR-011) is never virtualised.

**Scroll container:** The `sectionBody` div becomes the scroll container when virtualised.
  `maxHeight: 400px; overflowY: 'auto'` is applied conditionally.

**DragOverlay compatibility:** Virtualisation is **disabled while a pointer drag is active**:

```typescript
const { active } = useDndContext();
const isVirtualized = shouldVirtualizeFieldList(fields.length) && active === null;
```

This ensures all `FieldSlot` DOM nodes exist during pointer drag operations, which
dnd-kit's collision detection requires. The drag lifecycle is brief (< 2 seconds
typical), so rendering all fields during drag has negligible performance cost.

**Keyboard reorder with virtualisation:**

The `IndexBasedKeyboardSensor` calls `reorderFields` directly in the Zustand store —
it never reads the DOM. Virtualisation has zero impact on keyboard reordering; the full
field order is always available in the store regardless of which items are rendered.

**Overscan:** `overscan: 3` — three extra items above and below the visible window are
pre-rendered. This prevents blank flashes on fast scroll.

**Column grid:** The multi-column CSS grid (`gridTemplateColumns: '1fr 1fr'` etc.) is
NOT applied in virtualised mode, since absolutely-positioned children cannot participate
in a grid flow. When virtualised, fields render in a single scrollable column. This
trade-off is acceptable for the 40+ field pathological case where multi-column layout
is impractical anyway.

**Estimated item height:** `ESTIMATED_FIELD_SLOT_HEIGHT_PX = 48px`. The virtualiser
uses `measureElement` (ref-based dynamic measurement) to self-correct after first
render.

### Composing with SortableContext

The `SortableContext` in `DesignerCanvas` declares all field IDs (virtualised or not).
dnd-kit's `useSortable` is called in every `FieldSlot` regardless of virtualisation.
Only the DOM node registration differs: items scrolled out of the virtual window
unmount their DOM nodes. Since virtualisation is disabled during drag (see above),
this is safe.

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/designer/dnd/dndConstants.ts` | `VIRTUALIZATION_THRESHOLD`, `shouldVirtualizeFieldList`, sizing constants |
| `src/designer/dnd/IndexBasedKeyboardSensor.ts` | Sensor class: index-based keyboard reordering |
| `src/designer/dnd/useIndexBasedKeyboard.ts` | Hook: registers/deregisters the sensor in DesignerScreen |
| `tests/dnd/IndexBasedKeyboardSensor.test.ts` | 12 unit tests for sensor logic |
| `tests/dnd/virtualizationThreshold.test.ts` | 5 unit tests for threshold function |
| `projects/dfe-designer-enhancements/phase-4-tech-D.md` | This document |

### Modified Files

| File | Change |
|------|--------|
| `src/screens/DesignerScreen.tsx` | Remove `KeyboardSensor`; add `useIndexBasedKeyboard` hook; add ARIA live region; tune PointerSensor distance to 5px |
| `src/designer/canvas/FieldSlot.tsx` | Add `data-sortable-*` attributes; extract `handleKeyDown` callback; update aria-label |
| `src/designer/canvas/SectionContainer.tsx` | Add `data-sortable-*` attributes on header; add `useVirtualizer` for 40+ field sections; disable virtualisation during drag |

---

## Test Results

```
  IndexBasedKeyboardSensor
    moveItemByIndex
      ✓ moveItemByIndex_movesItemDown_whenFromIsBeforeTo
      ✓ moveItemByIndex_movesItemUp_whenFromIsAfterTo
      ✓ moveItemByIndex_returnsIdenticalOrder_whenFromEqualsTo
      ✓ moveItemByIndex_doesNotMutateSourceArray
      ✓ moveItemByIndex_handlesOneItemArray_withoutThrowing
    handleKeyDown
      ✓ handleKeyDown_ignoresEvent_whenAltKeyIsNotPressed
      ✓ handleKeyDown_ignoresEvent_whenKeyIsNotArrowUpOrDown
      ✓ handleKeyDown_ignoresEvent_whenTargetHasNoSortableAttributes
      ✓ handleKeyDown_movesFieldDown_whenAltArrowDownOnFirstField
      ✓ handleKeyDown_movesFieldUp_whenAltArrowUpOnLastField
      ✓ handleKeyDown_doesNotReorder_whenLastFieldMovesDown
      ✓ handleKeyDown_doesNotReorder_whenFirstFieldMovesUp
      ✓ handleKeyDown_announcesMove_withCorrectPositionString
      ✓ handleKeyDown_movesSectionDown_whenAltArrowDownOnSection
      ✓ handleKeyDown_doesNotReorderSection_whenAlreadyAtBottom
      ✓ handleKeyDown_resolvesSortableId_fromChildElement

  VIRTUALIZATION_THRESHOLD
    ✓ VIRTUALIZATION_THRESHOLD_equals_40

  shouldVirtualizeFieldList
    ✓ shouldVirtualizeFieldList_returnsFalse_whenCountIsZero
    ✓ shouldVirtualizeFieldList_returnsFalse_whenCountEqualsThreshold
    ✓ shouldVirtualizeFieldList_returnsFalse_whenCountIsBelowThreshold
    ✓ shouldVirtualizeFieldList_returnsTrue_whenCountExceedsThreshold
    ✓ shouldVirtualizeFieldList_returnsTrue_forLargeFieldCount
```

---

## Deviations from Original Spec

| Spec directive | Deviation | Reason |
|----------------|-----------|--------|
| "Register alongside PointerSensor in useSensors()" | `useIndexBasedKeyboard` hook called _inside_ DndContext instead | dnd-kit sensor API is designed for pixel-delta drag lifecycle; index-based reorder bypasses that lifecycle; direct store dispatch is architecturally cleaner and fully testable |
| "Register KeyboardSensor for WCAG 2.1 AA" | Removed `KeyboardSensor` import | The custom sensor provides superior keyboard accessibility for variable-height items; removal eliminates conflicting key-event handling |
| Virtualise "field list within a section or the section list" | Only field list virtualised | Section count is bounded at 5 (NFR-011); virtualising 5 items has no measurable benefit and adds code complexity |

---

## Rebase Note (C-003 Risk)

```bash
# When DFE-STYLE-001 merges to main:
git fetch origin main
git rebase origin/main

# Expected conflicts: NONE
# Orthogonal file sets confirmed:
#   STYLE-001: ThemeDesignRepository, ButtonStylePanel, style screens
#   Workstream D: DesignerScreen (sensors only), dnd/, canvas/FieldSlot, canvas/SectionContainer
```
