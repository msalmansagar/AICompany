# CMS-ENG-001 — UI/UX specification

```
═══════════════════════════════════════════════════
UI/UX DESIGN SPECIFICATION
Engagement ID:  CMS-ENG-001
Date:           2026-08-11
Satisfies:      Phase 1 gate finding SR-4
Status:         Draft — for architecture-gate review
═══════════════════════════════════════════════════
```

## What this satisfies

Gate finding **SR-4** — *"The BRD confuses the prototype with a design
specification"* — requires Phase 3 to produce, before any frontend
implementation:

1. **Component-level interaction patterns** → §3
2. **Field grouping strategy** → §1
3. **Bilingual editor layout** → §2

The 15-screen prototype is **input to this document, not a substitute for it**.
It proves a direction is feasible; it does not specify how a block behaves when
an author selects it.

---

## The measured problem

The gate cites *"14 fields on Hero alone"*. Counting the shipped configs — and
expanding the `pair()` spreads that the original count missed — the real figures
are worse:

| Component | Top-level fields |
|---|---|
| `LoginForm` | **21** |
| `SiteFooter` | **19** |
| `Hero` | **17** |
| `ReyadaAcademy` | **17** |
| `HowItWorks` · `BecomeProvider` | 13 |
| `ChoosePath` | 11 |

Six of twenty-one components exceed ten controls in a ~320 px sidebar. **This is
the single biggest usability defect in the spike**, and it is entirely
self-inflicted: the spike used flat `xEn` / `xAr` pairs throughout, which doubles
every string.

Two causes, addressed separately below: **no grouping** (§1) and **bilingual
doubling** (§2).

---

## §1 Field grouping strategy

### Rule

> **No block exposes more than seven top-level controls.** Beyond that, related
> fields are grouped into a labelled, collapsible object.

Seven is not arbitrary — it is roughly what fits a 320 px sidebar without
scrolling on a 1080 px-tall screen, which is the difference between an author
seeing their options and hunting for them.

### Grouping is by concept, never by language

The instinct is to group "all English" and "all Arabic". **That is wrong**: it
separates a string from its translation, so an author editing a headline must
work in two places and cannot see whether the Arabic still matches.

Group by the thing the author is thinking about.

### Worked example — Hero, 17 → 4

| Group | Contains |
|---|---|
| **Headline** | lead · highlight 1 · middle · highlight 2 · tail |
| **Description** | body text |
| **Search** | placeholder · button label |
| **Accent colour** | token picker |

Each string inside a group carries both languages (§2). The author sees four
collapsed rows, opens Headline, and edits the five parts of one sentence
together — which is how the sentence is actually composed.

### Ordering within a block

1. **What the visitor reads first** — headline, then body
2. **Actions** — buttons, links
3. **Appearance** — colour tokens, layout choices
4. **Advanced** — collapsed by default, rarely touched

Content before appearance, always. An author opens a block to change words far
more often than to change a colour.

### Consequence for the adapter

ADR-CMS-003's mapping table currently states that one domain field with
`bilingual: true` expands to **two Puck fields** (`…En` / `…Ar`). §2 changes
that to **one custom field rendering both**.

> **This also settles OQ-A.** The adapter owns bilingual presentation; the domain
> keeps one field per concept. The stored shape carries `{ en, ar }` rather than
> two sibling keys — which must be fixed before the first row is written, and
> now is.

---

## §2 Bilingual editor layout

### The requirement, and a tension worth naming

**FR-03** — *"The system shall present English and Arabic fields together on the
same block, not as separate pages."*

The cheapest fix for field count is a **language toggle**: show one language at a
time, halving what is on screen. It is also the obvious reading of "not as
separate pages" being satisfied, since nothing navigates away.

> ⚠️ **But a toggle arguably violates the word *together*.** If FR-03 means
> "both visible simultaneously", a toggle fails it. If it means "on the same
> block rather than a separate Arabic page", a toggle passes.
>
> **This specification does not rely on the ambiguity being resolved in its
> favour.** The design below satisfies the strict reading. Flagged for the BA
> because a one-word clarification changes what is permitted.

### The design — a paired field, not two fields

One control per concept, containing both languages stacked:

```
┌─ Headline ─────────────────────────────┐
│  English                                │
│  ┌───────────────────────────────────┐  │
│  │ Find the Perfect                  │  │
│  └───────────────────────────────────┘  │
│  العربية                    ● Stale     │
│  ┌───────────────────────────────────┐  │
│  │                    اعثر على       │  │  ← RTL input
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

Both languages are present and visible — the strict reading of FR-03 — but they
read as **one field with two inputs**, not two unrelated fields. Hero's seven
strings become seven paired controls inside four groups, rather than fourteen
loose inputs.

### Rules for the paired field

| Rule | Why |
|---|---|
| Source language on top, target below | Translation is a directional act |
| The Arabic input renders **RTL, with the caret at the right edge** | Verified working in the spike |
| Language labels in their own language — "English", "العربية" | Never "EN"/"AR" chips; the label is the affordance |
| A **status chip** on the target when Missing, Stale or Unknown | FR-40, FR-41 |
| The pair never collapses to hide only one language | That would reintroduce the FR-03 question |

### The three translation states must be visually distinct

| State | Shown as | Source |
|---|---|---|
| **Missing** | Empty input, amber outline, "Not translated" | FR-08 |
| **Stale** | Value present, amber chip "English changed" | FR-41 |
| **Unknown** | Grey chip "Cannot verify" | AC-40.3 — no source snapshot exists |

**Unknown must not look like Translated.** The Dynamic Form Engine had no source
snapshot on 221 of 226 translations, so everything appeared current and staleness
was silently uncomputable. A distinct state is what stops that recurring.

### Whitespace does not mean stale

Per AC-41.3, a source change consisting only of leading or trailing whitespace
must not raise the stale flag. The DFE flagged every padded label as stale, which
trains translators to ignore the signal entirely — a warning nobody reads is
worse than no warning.

---

## §3 Component-level interaction patterns

These are **mandatory for every block**. They are written as rules because each
one corresponds to a defect found in the spike.

### 3.1 No raw interactive element inside a block

An `<a>` or `<button>` that works in the canvas hijacks clicks meant to select
the block. The spike's fix — a `puck.isEditing` guard — was applied by hand and
**missed on one component, producing 5 non-focusable spans and a real
accessibility regression in the published page**.

> **Rule:** blocks never render `<a>`, `<button>` or `<input>` directly. They use
> the shared `SmartLink`, `SmartButton`, `SmartInput` wrappers, which render an
> inert but **visually identical and still focusable** element while editing.
>
> Enforced by lint rule, in the same manner as the Puck import boundary
> (ADR-CMS-003). Boilerplate repeated by hand is boilerplate eventually skipped.

Inert must not mean unfocusable. An editing-mode button remains keyboard
reachable and announced; it simply does not navigate.

### 3.2 Blocks are stateless

Puck re-renders on every prop change, so component-held `useState` resets
mid-edit. The spike's login form had to become uncontrolled for exactly this
reason.

> **Rule:** no `useState` for anything an author can edit. Genuinely stateful
> widgets — carousels, accordions, wizards — expose their state as a **prop with
> an author-set initial value**, so the author can author *each* state rather
> than fighting the canvas.

A carousel in the editor shows the slide the author selects, not slide 1 forever.

### 3.3 Every block renders with missing props

Puck's `defaultProps` apply **only when a block is dragged in** — never to stored
data. A page saved before a prop existed renders `undefined`.

> **Rule:** every block renders acceptably with `{}` as props. Missing text
> renders a visible placeholder in the editor and nothing at runtime — never the
> string "undefined".

Publish-time validation (AC-65) is the backstop; this is the first line.

### 3.4 Unknown references are visible, never silent

An unknown block type, icon name or asset key renders a **visible placeholder**
— dashed outline, the missing identifier as text.

This caught a genuinely missing icon during the spike. A silent fallback would
have shipped a blank space nobody noticed.

### 3.5 Empty slots are visibly droppable

A slot with no children collapses to zero height and cannot be dropped into.
Every slot carries a minimum height and an empty-state label naming what belongs
there — "Drop content blocks here".

### 3.6 Selection and focus

| Interaction | Behaviour |
|---|---|
| Click a block | Selects it; the sidebar shows its fields |
| Click a nested block | Selects the **innermost** block, not the parent |
| Escape | Selects the parent — the only way out of deep nesting |
| Selected block | Outline plus a label naming the block type |

The label matters in a bilingual product: an author looking at an Arabic page
still needs to know they have selected "Hero" rather than guessing from shape.

---

## §4 Role-specific editor views

Three roles see materially different surfaces from the same page.

### Translator (FR-42, AC-42.2)

- Target-language inputs **only**
- Source shown **read-only** beside each, for reference
- **No palette, no drag handles, no delete, no reorder, no appearance fields**
- Blocks are not selectable as objects — only their values are reachable

The structural controls are **absent, not disabled**. A greyed-out delete button
still reads as "you might be able to do this".

### Content Author (FR-60, AC-60.2)

Full composition. **No publish control anywhere** — the primary action is
"Submit for review". Publishing is not a thing an author can attempt and be
refused; it is not offered.

### Approver (FR-61)

Read-only canvas with **Approve** and **Return with comments**. Return requires a
comment — an empty return teaches nothing.

### Draft marking (FR-67, AC-67.1)

An unpublished page viewed internally carries a persistent draft marker that is
**part of the page frame, not a dismissible toast**. Someone will screenshot a
draft and circulate it; the marker must survive that.

---

## §5 What this specification does not cover

| Not covered | Why |
|---|---|
| **Rich text editing surface** | Blocked on **Q1**. If rich text is in scope, its toolbar, paste handling and sanitisation feedback all need specifying. |
| **Approval UI beyond approve/return** | Blocked on **Q3**. A second approval route changes the reviewer's queue and the author's status display. |
| **Arabic authoring chrome** | Blocked on **Q5**. This document specifies Arabic *content* editing; an Arabic *interface* is separate scope. |
| **Visual design** | Colour, type scale and spacing come from the DXP-P1-003 theme tokens, not from here. This document specifies behaviour and layout. |
| **Mobile authoring** | Not in Phase A scope. Authoring is a desktop task; the *published page* is responsive and that is specified by the block library. |
| **Media library browse/search UX** | Deferred to the Phase 4 detailed design; FR-20/21 fix the behaviour, not the layout. |

---

## §6 Consequences for other documents

| Document | Change required |
|---|---|
| **ADR-CMS-003** | Mapping table: `bilingual: true` becomes **one** custom field, not two. **OQ-A resolved** — domain stores `{ en, ar }`. |
| **phase-3-arch.md §4** | Adapter spec inherits the same change |
| **acceptance-criteria.md** | AC-03.1 currently says "both inputs visible in the same panel" — consistent with this design, no change. Add criteria for the three translation states and for `SmartLink` focusability. |
| **phase-2-ba.md** | **FR-03 wording**: clarify whether "together" requires simultaneous visibility. This design assumes yes. |

---

## Status

**Draft, for architecture-gate review.** SR-4 names the `ui-ux-designer` agent as
the producer; this pass was written directly against the shipped configs and the
COMPARISON.md findings. If the gate wants the named agent's independent pass, this
document is a specification to review rather than a substitute for it.
