# ADR ratification pass — gate item A-4

```
═══════════════════════════════════════════════════
RATIFICATION RECORD
Engagement ID:  CMS-ENG-001
Date:           2026-08-11
Gate item:      A-4 — ADRs 001–005 move from Proposed to Accepted
Outcome:        1 of 5 ACCEPTED. Four cannot be ratified yet, and
                that is the checklists working, not failing.
═══════════════════════════════════════════════════
```

## The finding

Every ADR carries a **"Verification required before acceptance"** checklist. Those
checklists were written deliberately, and working through them shows that **most
of the required evidence is build-time**. Nothing has been built.

Ratifying all five today would mean ticking boxes whose evidence does not exist —
which turns the checklists into ceremony. That is precisely the failure mode the
Phase 1 gate was guarding against with C-12: *"without a test contract, code
review has no objective standard."*

So this pass ratifies **one**, records verified progress on a second, and states
exactly what blocks the other three.

| ADR | Items | Verified | Status |
|---|---|---|---|
| 001 — payload storage | — | — | **Proposed** — self-gated on Q1 |
| 002 — icons as geometry | 4 | 0 | **Proposed** — needs the extractor |
| 003 — adapter boundary | 5 | 0 | **Proposed** — all items build-time |
| **004 — own the runtime renderer** | **5** | **5** | ✅ **ACCEPTED** |
| 005 — Tiptap retirement | 4 | 2 | **Proposed** — 2 need the cutover |

---

## ✅ ADR-CMS-004 — Accepted

All five verification items are now satisfied by evidence, not argument.

| # | Requirement | Evidence |
|---|---|---|
| 1 | Comparison harness runs in CI, failing on divergence | `cms-renderer-parity.yml`, green on main. **Verified to fail** — a slot wrapper `div`→`span` was injected and every corpus entry failed with the diverging character located. |
| 2 | Identical output confirmed with `locale: 'ar'` as well as `'en'` | 4 pages × 2 locales, 8 assertions |
| 3 | Nested slots — a slot inside a slot inside a slot | **Was not covered.** The natural corpus reaches depth 2 only. A depth-3 case is now constructed explicitly and runs in CI, in both locales. |
| 4 | Unknown block type renders a visible placeholder | Asserted in the suite |
| 5 | Published bundle contains **no** `@puckeditor/core` code, by inspecting built output | Built visitor bundle scanned: **0** Puck markers, **0** dnd-kit, **0** Tiptap |

### Item 3 nearly passed on an assumption

The corpus *looked* deeply nested. Measuring actual slot depth gave **2** —
`reyada` 1, `portal` 2, `landing` 1, `login` 1. The ADR asks for three.

Constructing depth 3 (`CardRow` nests into itself via its `cards` slot) and
running both renderers produced identical output — **and one further finding**:

```
WARNINGS at slot depth 3:   puck = 1   ours = 0
```

Puck's own bundle emits a React *"Each child in a list should have a unique key"*
warning from its internal `Item` component. Ours does not. Output is byte-identical;
the console noise is not.

That is a second instance of a pattern ADR-CMS-003 already recorded — Puck's
migrations emit `console.warn` on read. **Acceptable in a developer tool,
unwelcome on a page a citizen has open**, and one more reason the runtime is ours.

---

## ADR-CMS-005 — partially verified, still Proposed

| # | Requirement | Status |
|---|---|---|
| 1 | No other portal-shell code imports Tiptap | ✅ **Verified** — still exactly one file, `components/cms/RichTextEditor.tsx` |
| 2 | Visitor bundle contains no Tiptap, by inspecting built output | ✅ **Verified** — 0 Tiptap/ProseMirror markers |
| 3 | `RichTextDisplay` still works after `RichTextEditor` is deleted | ⛔ Requires the deletion, which requires the CMS authoring surface to exist |
| 4 | Measure the admin bundle during the coexistence window | ⛔ Requires Phase A build |

Items 3 and 4 are **not** oversights — the ADR itself describes them as cutover
activities. It cannot be accepted before the thing it describes has happened.

---

## The three that cannot move, and why

### ADR-CMS-001 — payload storage

**Self-gated.** Its own OQ-1 reads: *"Is long-form rich text in scope for the CMS?
If yes, **re-measure with real prose before accepting this ADR**."*

That is **Q1**, unanswered. The measurements behind this ADR used block trees,
which compress at roughly 50×; prose compresses at 3–4×. If rich text is in scope,
the numbers change by an order of magnitude and the size thresholds with them.

OQ-3 additionally needs **Q4** (on-premise File column support and its configured
maximum).

### ADR-CMS-002 — icons as geometry

All four items test **an extractor that does not exist**: a hostile-SVG corpus, a
rejection path for files that extract to nothing, an upload preview, and
`currentColor` inheritance in LTR and RTL.

The hostile corpus is itself a Phase 5 QA deliverable. **Q10** (multi-colour icons)
also bears on it, and icon upload sits in Delivery Phase C, which the Phase 1 gate
rejected.

### ADR-CMS-003 — adapter boundary

All five items require code: a lint rule proven to fail a build, a lossless
round-trip test, block render functions containing no `puck` reference, and
`schemaVersion` on every emitted tree.

**None of it can be verified before the adapter is written.** This is the ADR whose
verification is most completely build-time, which is fitting — it is the one that
constrains how the build is done.

> One of its items is *already* satisfied in substance: *"renderer works without
> the editor bundle loaded"* is what ADR-CMS-004 item 5 proves. It is left
> unticked here because the item is scoped to the adapter's own renderer, which
> does not exist yet.

---

## What this means for the gate

**A-4 cannot close in this Phase 3.** Four of five ADRs need either a client
answer or a build that has not started.

Two honest options:

| Option | Consequence |
|---|---|
| **A — Accept 004 now; ratify the rest at the Phase 4 exit gate** *(recommended)* | The decisions still bind the build — Proposed does not mean ignorable. It means the evidence is outstanding. Each remaining ADR has an unambiguous list of what would close it. |
| B — Accept all five now | Makes the checklists ceremonial and removes the mechanism that just caught the depth-3 gap. |

**Recommending A.** ADR status is a statement about evidence, not about whether
the team follows the decision. All five decisions are in force today; only one has
earned the word *Accepted*.

### What would close each

| ADR | Closes when |
|---|---|
| 001 | **Q1** answered; if rich text is in, re-measure with real prose. **Q4** for OQ-3. |
| 002 | Geometry extractor built + hostile corpus run (Phase 5 QA). **Q10**. Gated behind Delivery Phase C. |
| 003 | Adapter written; lint rule proven to fail; round-trip test green. |
| 005 | `RichTextEditor` deleted at cutover; admin bundle measured during coexistence. |
