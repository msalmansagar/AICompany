# Puck RTL Spike — Acceptance Criteria

Decided BEFORE running anything, so the result is a verdict and not an impression.

Stack pinned to portal-shell's actual versions: **Next 14.2 + React 18**, `@puckeditor/core@0.22.4`.

## Fatal tests — any failure kills the adoption

| ID | Test | Pass condition |
|----|------|----------------|
| **F1** | `<Render>` runtime output under `dir="rtl"` | Arabic text right-aligned, component order right-to-left, no horizontal overflow. This is what 100% of citizens see. |
| **F2** | Editor mounts at all in RTL | `<Puck>` renders without throwing under `dir="rtl"` on React 18. |

## Major tests — failure means mitigation required, not abandonment

| ID | Test | Pass condition |
|----|------|----------------|
| **M1** | Editor chrome mirrors | Component list / fields panel swap sides under RTL. |
| **M2** | Drag-drop lands correctly | Dropping between two items inserts where the pointer is — NOT mirrored to the opposite index. |
| **M3** | Nested DropZone ordering | Items inside a Columns component order right-to-left correctly. |
| **M4** | Arabic in field inputs | Text fields accept and display Arabic, cursor/caret behaves. |

## Minor tests — cosmetic, log and move on

| ID | Test |
|----|------|
| m1 | Icon direction (chevrons/arrows) |
| m2 | Drag preview offset |

## Verdict rules

- Any **F** fails → **reject Puck**, reopen the decision.
- All F pass, any **M** fails → **adopt with a documented mitigation** in the ADR.
- All F + M pass → **adopt**, minor issues become backlog items.
