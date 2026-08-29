# CWFD-015 — Edit Mode: Findings and Improvement Programme

**Reviewed 2026-08-29** against the live Loan Application Process (35 steps,
69 decisions, 28 unassigned, 35 empty task subjects) — the same real-scale
benchmark that drove CWFD-009. Walked in the browser and read against the
code (`EditCanvas`, `EditToolbar`, `StepPropertiesPanel`,
`OutcomePropertiesPanel`, `RouteConfigDialog`, `usePublish`,
`useWorkflowSave`, `workflowStore`).

## What edit mode already does well

Add step (toolbar + per-card "+ Next step"), drag-to-connect, four-tab step
panel (General / Assignment / SLA / Automation), decision panel with
conditional-routing toggle and the FetchXML route builder, per-route
properties, undo/redo with load-scope protection, debounced live validation
with the grouped panel and stepper, Delete-key with confirmation, save-draft
with temp-id reconciliation, publish gated on validation errors, simulation +
path enumeration + narrated demo, layout persistence, correction pills,
semantic zoom, go-to-step search, local end stubs.

## Findings

### Data entry gaps (hurt most on real processes)

| # | Finding | Evidence |
|---|---------|----------|
| E1 | 🔴 **Task subject and description cannot be edited in the editor at all.** The Loan process carries 35 "Missing task subject" warnings; the validation panel points at them; the step panel has no field to fix them. Only the create wizard (Step 3 grid) can set them. | `grep taskSubject StepPropertiesPanel.tsx` → nothing. |
| E2 | 🔴 **No bulk operations.** 28 unassigned steps = 28 rounds of select card → Assignment tab → search user. No multi-select, no "assign selected to…", no bulk grid — though the create wizard already HAS the per-step grid (subject + assignment) that edit mode lacks. | `Step3StepAssignments.tsx` vs edit surface. |
| E3 | **A decision's target is read-only.** "Next Step" renders as a chip; re-pointing a transition means deleting the decision and re-drawing it. No edge-drag reconnection either (React Flow supports `onReconnect`). | `OutcomePropertiesPanel.tsx:196`. |
| E4 | **Reordering is one notch at a time.** Order = "#1 ↑Up ↓Down"; moving step 30 to position 5 is 25 clicks. No drag-reorder list, no direct number entry. | General tab. |

### Interaction gaps

| # | Finding |
|---|---------|
| I1 | **No keyboard shortcuts beyond Delete.** Undo/redo are toolbar-only (no Ctrl+Z/Y), no Ctrl+S save, no Esc to clear selection, no arrow-key nudge for selected cards. |
| I2 | **No duplicate/clone step.** A fully configured step (assignment, SLA, hooks, decisions) cannot be copied; rebuilding by hand invites drift. |
| I3 | **No insert-between.** Dropping a new step onto an existing transition to splice it into the flow is a staple of BPM editors; here it takes delete + add + two reconnects. |
| I4 | **Connect-by-drag names every new decision "Outcome"** with no inline rename, so a fast modelling session leaves a trail of "Outcome" rows the validator then flags as duplicates. |
| I5 | **No snap-to-grid or alignment guides** for hand-arranged layouts (which ARE persisted, so tidiness matters). |

### Publish/quality loop

| # | Finding |
|---|---------|
| Q1 | **Warnings are silent at publish.** Errors block (correct), but the 49 warnings ride through without acknowledgement — spec §21 asks for "publish may continue after acknowledgement". No record of who accepted what. |
| Q2 | Validation items focus the node, but don't open the RIGHT panel context (e.g. "Missing task subject" should land in the field that fixes it once E1 exists). |

### Panel polish

| # | Finding |
|---|---------|
| P1 | Delete Step is repeated at the bottom of all four tabs. |
| P2 | The SLA tab is an empty shell holding one collapsed "Escalation" section; Automation similarly thin. Two tabs could merge, or sections auto-expand. |
| P3 | Concurrency rows on the decision panel read as disabled text ("Off — …") rather than obvious toggles. |

## Improvement programme (ranked)

| # | Improvement | Pays off |
|---|-------------|----------|
| **B1** | **Task details in the step panel** — Subject + Description on the General tab (subject defaulting from the step name, as the wizard does). | Unblocks all 35 warnings; smallest change, biggest data-quality win. |
| **B2** | **Bulk assignments & subjects table** — reuse the wizard's Step-3 grid as an "Edit all steps" dialog from the toolbar: one screen, 35 rows, columns for subject / mode / assignee. | Turns 28 panel round-trips into one pass. |
| **B3** | **Keyboard layer** — Ctrl+Z/Y undo-redo, Ctrl+S save draft, Esc clears selection, arrow nudge (+Shift for coarse). | Editing feels professional immediately. |
| **B4** | **Re-pointable transitions** — Next Step becomes a step picker, and edge ends become drag-reconnectable on canvas (both write the same store update). | Kills the delete-and-redraw dance. |
| **B5** | **Insert-between** — drop "Add step" onto an edge (or an edge context button) to splice a step into a transition, rewiring both ends and renumbering. | The most-used gesture in Camunda/Bizagi-class tools. |
| **B6** | **Duplicate step** — clone card with assignment/SLA/hooks (decisions optionally), named "Copy of …". | Real processes repeat patterns (the 12 correction steps are near-clones). |
| **B7** | **Warning acknowledgement at publish** — a publish-time dialog listing warning groups with "publish anyway", recording the acknowledgement in the designer-state annotation. | Closes the spec-§21 gap with an audit trail. |
| **B8** | **Reorder sheet** — a drag-sortable step list (or editable # field) replacing one-notch Up/Down. | 35-step processes stop punishing renumbering. |
| **B9** | **Polish batch** — single Delete placement, merged/auto-expanded SLA & Automation, toggle-styled concurrency rows, inline rename on connect (fixes I4). | Low effort, rounds everything off. |

Suggested batches: **1** = B1+B2 (data entry), **2** = B3+B4 (interaction core),
**3** = B5+B6 (modelling gestures), **4** = B7+B8+B9 (publish loop + polish).
