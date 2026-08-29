# CWFD-016 Tracker — Edit Mode Improvement Programme

Analysis: `cwfd-015-edit-mode-improvements.md`. Benchmark: Loan Application
Process (35 steps, 28 unassigned, 35 empty task subjects).

| # | Item | Status | Notes |
|---|------|--------|-------|
| B1 | Task subject + description in the step panel | ✅ done | Batch 1. General tab, subject placeholder = step name; clears the 35 warnings as typed. |
| B2 | "Edit all steps" bulk grid | ✅ done | Batch 1. Toolbar overflow → table of all steps (subject / mode / assignee), draft + Apply, change counter, warning-tinted missing cells. Read From Parent rows defer to the panel. |
| B3 | Keyboard layer (Ctrl+Z/Y/S, Esc, arrow nudge) | ⬜ not started | |
| B4 | Re-pointable transitions (picker + edge reconnect) | ⬜ not started | |
| B5 | Insert-between on an edge | ⬜ not started | |
| B6 | Duplicate step | ⬜ not started | |
| B7 | Warning acknowledgement at publish | ⬜ not started | |
| B8 | Drag-reorder sheet | ⬜ not started | |
| B9 | Panel polish + inline rename on connect | ⬜ not started | |

## Log

- 2026-08-29 — **Batch 1 (B1+B2) done.** Verified live: grid shows all 35 rows,
  "1 step changed" counter, Apply → step panel shows the same subject; test
  edit discarded afterwards. 421 tests green, tsc clean.
