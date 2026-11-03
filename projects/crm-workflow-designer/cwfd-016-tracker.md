# CWFD-016 Tracker — Edit Mode Improvement Programme

Analysis: `cwfd-015-edit-mode-improvements.md`. Benchmark: Loan Application
Process (35 steps, 28 unassigned, 35 empty task subjects).

| # | Item | Status | Notes |
|---|------|--------|-------|
| B1 | Task subject + description in the step panel | ✅ done | Batch 1. General tab, subject placeholder = step name; clears the 35 warnings as typed. |
| B2 | "Edit all steps" bulk grid | ✅ done | Batch 1. Toolbar overflow → table of all steps (subject / mode / assignee), draft + Apply, change counter, warning-tinted missing cells. Read From Parent rows defer to the panel. |
| B3 | Keyboard layer (Ctrl+Z/Y/S, Esc, arrow nudge) | ✅ done | Batch 2 (PR #137). Quiet in form fields and during simulation. |
| B4 | Re-pointable transitions (picker + edge reconnect) | ✅ done | Batch 2 (PR #137). Next Step select + onReconnect; target-end only. |
| B5 | Insert-between on an edge | ✅ done | Batch 3 (PR #138). Pill on selected forward edges; renumbers; terminal stays terminal. |
| B6 | Duplicate step | ✅ done | Batch 3 (PR #138). Clones assignment/SLA/hooks/decisions/routes. |
| B7 | Warning acknowledgement at publish | ✅ done | Batch 4. Warnings stop publish once, grouped by rule; accepting records at/count/codes in the designer-state annotation and the audit log. Errors still block first. |
| B8 | Drag-reorder sheet | ✅ done | Batch 4. Toolbar overflow → drag rows or type a position; new moveStepTo store action renumbers. |
| B9 | Panel polish + inline rename on connect | ✅ done | Batch 4. Drag-connect names the decision "To <target>" (or "Complete") and selects it, so the panel opens on the name — no more canvases full of "Outcome" the duplicate-name rule flags. |

## Log

- 2026-08-29 — **Batch 1 (B1+B2) done.** Verified live: grid shows all 35 rows,
  "1 step changed" counter, Apply → step panel shows the same subject; test
  edit discarded afterwards. 421 tests green, tsc clean.
- 2026-08-29 — **Batches 2 and 3 merged** (PRs #137, #138) along with #133–#136.
  Main @ 2b446ce2, 438 tests green, built and **deployed to org5869857f**
  (hash a569a789, agentation provably absent from the deployed copy). LR
  hierarchy fix confirmed live in CRM. Batch 4 begins.
- 2026-08-29 — **Batch 4 (B7+B8+B9) done — ALL NINE ITEMS COMPLETE.** 444 tests
  green, tsc clean. Verified live: reorder sheet moved step 9 to position 2 with
  full renumbering; publish on the Loan process still blocked by its 28 errors
  (warnings never reached — correct precedence). The warning dialog itself is
  covered by state round-trip tests; a warning-only process was not available
  in the org to exercise it on screen.
