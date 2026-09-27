# CWFD-009 — Large-Process Readability (View + Edit)

**Trigger:** the Loan Application Process (35 steps, 69 decisions, 14 return
paths, 2 parallel branches) — the first real-scale process in the org — is
unreadable in every canvas. The 6-step demo processes hid all of this.
Evidence captured 2026-08-25 against the live org through the local designer.

---

## 1. What the canvases actually show today

### View mode

| # | Finding | Evidence |
|---|---------|----------|
| V1 | **Initial fit makes the graph microscopic.** Fit-all on a 35-step graph lands at ~6% zoom; node text is unreadable in every view (TB, LR, Executive, Swimlane). | Business TB: a thin filament in the middle of an empty viewport. |
| V2 | **The story does not start at step 1.** Dagre ranks by in-degree, so the ~8 orphan "Return to X by Y" steps land at rank 0 — the canvas *begins* with correction steps and the real entry (Proposal Review by RM) is buried mid-graph. | Top of the TB layout reads "Return to FFD Manager by Credit…", "Return to RM by Credit Analyst"… |
| V3 | **14 correction steps are full-size cards.** Each "Return to X by Y" step has one decision ("Complete Changes & Resubmit") and exists purely to loop back — but each occupies as much canvas as CEO Joint Approval. They roughly double the perceived size of the graph. | |
| V4 | **Executive view is not a happy path.** The "clean happy-path view for management" still renders every return/correction step; its leftmost node is a correction step. | Executive LR screenshot. |
| V5 | **Swimlane collapses into one lane.** 28 steps have no user, so one "(unassigned)" lane holds 80% of the process as a flat horizontal strip; five single-user lanes sit nearly empty below it. | Swimlane zoom. |
| V6 | **Gateways drift from their source.** Conditional diamonds are placed by rank, ending up floating between columns with long lead-in edges — spec §23 explicitly asks that "conditional gateways remain close to their source step". | |
| V7 | **No way to navigate.** No go-to-step search, no stage overview, minimap off by default. Finding "Sr. Credit Manager Approval" means panning around a hairball. | |

### Edit mode

| # | Finding | Evidence |
|---|---------|----------|
| E1 | **Initial viewport is wrong.** Edit opened staring at empty canvas with a single node at the bottom corner; the graph only appeared after a manual fit-view. Fit runs before the large graph settles, or the auto-layout pass invalidates it. | First edit screenshot. |
| E2 | **Error styling floods the canvas.** 28 of 35 nodes render in error-red. When 80% of the canvas is red, red means nothing — the visual hierarchy is destroyed and the few *actually structural* problems drown. | Edit fit-view screenshot. |
| E3 | **The validation panel is a flat wall.** 28 errors + 49 warnings render as ~77 individual cards. "Specific User with no user selected" appears as separate cards instead of once as a group. No severity split in the list, no fix-next navigation. | Validation panel screenshot. |
| E4 | **One global END funnels 14 curves.** Every End Process decision bezier-sweeps across the entire canvas into a single END dot — the dominant visual feature of the edit canvas is the funnel, not the flow. (View mode already has local end stubs; edit does not.) | Edit zoom screenshot. |
| E5 | **Return edges have no discipline.** 14 return paths criss-cross the forward flow as long free-form beziers. View mode has the hide-returns toggle; edit draws everything, always. | |

### Data findings surfaced by the canvas (not UX bugs — report to the client)

The validator is *right* about the orphans: the spec's own tables never route
into ~8 of its correction steps (e.g. Return to RM by EPD Head, Credit Lens
Updated by FFD, FFD Manager Approval, Return to RM by BFD Manager). The spec's
§17 recommended model (Approver → Correction Task → original step) contradicts
its own step tables, which mostly wire returns *directly* back to the approval
step and leave the correction step stranded. This is spec issue #10 made
concrete.

---

## 2. What professional tools do (benchmark)

Camunda / Signavio / Bizagi / Visio / FlowOn conventions this design should meet:

1. **The diagram reads as a narrative** — entry at top-left, forward flow in
   one direction, exceptions off the spine.
2. **Loops are annotations, not topology** — a rework loop is a marker or a
   small side-node, never a second full lane of the graph.
3. **Phases are visible containers** — stage bands ("Proposal", "Credit
   Approval", …) give a 35-step process a 7-chapter table of contents.
4. **Semantic zoom** — zoomed out you see stage blocks and labels; zoomed in
   you see decision chips. Text is never rendered at unreadable sizes.
5. **Problems panel, not problem paint** — issues grouped by rule with
   next/prev navigation; severity affects the badge, not the whole node.
6. **Default-flow marker** — the fallback route wears the BPMN slash, so
   ordered conditional routing is readable at a glance.

---

## 3. Proposal (ranked by impact)

### P1 — Narrative layout core *(the fix that changes everything)*
Rank the graph from the **entry step** using **forward edges only**:
- Return edges (target sequence < source sequence) are excluded from dagre
  ranking and drawn after layout.
- Orphan steps rank next to their *outgoing* target, not at rank 0.
- Gateways rank immediately after their source step (satisfies spec §23).
Result: the spine reads Proposal → … → CEO top-to-bottom, corrections hang off
the side, and the graph height shrinks by the ~8 phantom leading ranks.

### P2 — Collapse correction loops
Detect the pattern (step whose only decision returns to its sender, or any
"Return to X by Y" wiring) and render it as a **compact loop pill** attached to
the approval step — expandable to the full card on click, and always full-size
in edit when selected. 35 cards → ~21 on the spine.

### P3 — Smart initial view + navigation
- Initial camera: fit the **first stage** at a readable zoom (≥60%), not the
  whole graph; "fit all" stays one click away.
- Minimap **on by default** above N=15 steps.
- **Go-to-step**: type-ahead search in the toolbar that pans/zooms and selects.
- Fix E1 by fitting only after the last measured node of the *final* layout.

### P4 — Validation UX overhaul
- Group by rule: "28 steps use Specific User with no user selected" is one
  collapsible group with a count badge and per-item jump links.
- Severity discipline per spec §21: errors block publish; warnings are
  acknowledgeable. Canvas shows a small corner badge (⚠/✕) — **never** a
  whole-node red flood. Selected-issue node gets the strong treatment.
- "Next issue" / "Prev issue" stepping.

### P5 — Stage bands (phase containers)
Optional named stages (stored in the designer-layout annotation; zero schema
change): collapsible horizontal bands with labels. Auto-suggest stages from
graph clustering (articulation points of the forward spine); author can rename.
Executive view becomes stage-blocks-only at low zoom.

### P6 — Semantic zoom
Three node detail levels by zoom threshold: full card (>70%), name+icons
(30–70%), dot+tooltip (<30%). Kills the microscopic-text problem in every view.

### P7 — Edge discipline
- Edit mode gets **local end stubs** (parity with view) — removes the 14-curve
  END funnel.
- Return edges route through a dedicated side gutter, dimmed by default;
  the existing show/hide-returns toggle appears in edit too.
- Fallback routes wear the BPMN default-flow slash marker.

### P8 — Executive view = actual happy path
Filter out correction steps and return edges entirely; show stage bands +
approval spine + endings only. That is what "for management" means.

### P9 — Swimlane fixes
- "(unassigned)" splits by *role hint* parsed from step names (RM / EPD /
  Technical / FFD / BFD / Credit / Director / CEO) with an "unassigned" badge,
  or falls back to stage bands as lanes.
- Lane height caps + horizontal wrap so one lane can never be a 6000px strip.

## Suggested order

| Batch | Items | Why first |
|-------|-------|-----------|
| 1 | P1 + P2 | Layout core — every other view inherits it |
| 2 | P3 + P4 | Navigation + validation; the biggest day-to-day irritation |
| 3 | P7 + P8 | Edge discipline, honest Executive view |
| 4 | P5 + P6 | Stages and semantic zoom — the "compares with any BPM tool" layer |
| 5 | P9 | Swimlane |
