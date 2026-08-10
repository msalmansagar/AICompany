# ADR-CMS-004 — The runtime renderer is ours; Puck never reaches a visitor

| | |
|---|---|
| **Status** | **Proposed** — answers OQ-B from ADR-CMS-003 |
| **Date** | 2026-08-10 |
| **Raised by** | ADR-CMS-003, open question B |
| **Applies to** | CMS Engine (CMS-ENG-001) |
| **Related** | ADR-CMS-003 (adapter boundary), ADR-CMS-001 (payload storage) |

---

## Context

ADR-CMS-003 puts Puck behind an adapter so the **editor** is replaceable. It left
one question open: should the **runtime renderer** — the code that turns a stored
page into HTML for a visitor — also be Puck's, or our own?

This matters more than it first appears. Puck is **v0.22 after three years**, and
the CEO gate named that the risk most likely to hurt later (R-1). If Puck renders
published pages, that pre-1.0 dependency sits on **every page a citizen opens**.
If the renderer is ours, it is confined to the admin surface, used by a handful
of authors.

Those are materially different exposures, and the choice is cheap now and
expensive once pages are live.

---

## Evidence

### What Puck's runtime actually contains

Read from the shipped bundle (`dist/rsc.mjs` and its chunks) rather than from
documentation:

| Import | Purpose | Do we need it? |
|---|---|---|
| `SlotRenderPure`, `useSlots` | Resolve named slots into render-props | **Yes** |
| `migrate` | Shape-sniffing migration of older Puck data | No — we carry `schemaVersion` |
| `resolveAllData` | Async / dynamic prop resolution (`resolveData`) | Not used |
| `transformProps` | Field-level prop transforms | Not used |
| `useRichtextProps` | Rich text handling | Blocked on OQ-1; not used today |
| `walkTree`, `setupZone`, `rootZone` | Puck's legacy **zones** mechanism | No — we use slots only |

So of six capabilities, we need one: slot resolution.

### The comparison

A hand-written renderer — roughly 60 lines — was written against our own tree
walk, and the **same** Reyada dashboard tree was rendered through both. Harness
committed at `spikes/puck/app/oqb/page.tsx`.

| | Puck `<Render>` | Hand-written |
|---|---|---|
| HTML characters | 17,719 | 17,719 |
| DOM elements | 225 | 225 |
| First difference | — | **none** |
| **Identical** | | **true** |

Byte-identical output, after normalising React's non-deterministic attributes.

---

## Decision

**Write our own runtime renderer. Puck is used in the editor only, and is never
loaded by a visitor.**

`RendererPort` (ADR-CMS-003) gets a hand-written implementation over `PageTree`.
`EditorPort` keeps its Puck-backed implementation.

The renderer's entire job:

1. Walk the tree
2. Look up each block's definition by `type`
3. Resolve named slots into render-prop components
4. Pass `props`, `locale` and `isEditing: false`

A block whose `type` has no definition renders a **visible** placeholder rather
than being skipped — the same rule as the unknown-icon marker in ADR-CMS-002. A
page silently missing a section is worse than one that shows a fault.

---

## Consequences

### Positive

- **Puck is absent from the citizen-facing path entirely.** The pre-1.0 risk
  applies to an admin tool used by a few people, not to public pages.
- **52 KB JS + 4.5 KB CSS** removed from every visitor page load.
- A Puck breaking change can no longer break a published page. It can only break
  the editor, where it is noticed immediately by an author rather than silently
  by a visitor.
- The runtime has no dependency that could be abandoned, relicensed, or
  security-advisoried out from under published content.
- Rendering becomes testable without mounting an editor or a browser.

### Negative

- **We own it.** Sixty lines today, but slot semantics, nested slot ordering and
  fallback behaviour are ours to get right and keep right.
- Two renderers now exist — Puck's inside the editor canvas, ours at runtime —
  and they must agree. A divergence would mean a page previews one way and
  publishes another, which is the worst failure mode in a CMS.
- If `resolveData`, prop transforms or rich text later enter scope, we either
  implement them or revisit this decision.

### The mitigation for the divergence risk

The comparison harness is committed, not thrown away. It must run in CI over a
corpus of representative pages, asserting the two renderers produce identical
output. The moment they diverge, the build fails — rather than an author
discovering it after publish.

> This is the point of the ADR. The decision is cheap; the **guarantee that the
> two renderers stay in agreement** is what actually needs maintaining.

---

## Caveats on the evidence

Stated so the result is not over-read.

- The test used the Reyada configuration, which does **not** use `resolveData`,
  prop transforms or rich text. Identical output proves the renderers agree *for
  the features we use*, not universally.
- It ran with `locale: 'en'`. Neither renderer touches direction — locale is
  passed through untouched to components — so RTL divergence is implausible, but
  it has not been measured and is listed below as a verification item.
- ~60 lines is the honest current size. Slot `allow` constraints and any future
  field kind will grow it.

---

## Alternatives considered

| Option | Why not |
|---|---|
| **Use Puck's `<Render>` at runtime** | Puts a 0.x dependency on every citizen page. Also drags in migration, transform and richtext code we do not use. |
| **Use Puck's renderer now, replace later** | "Later" arrives after pages are live, when the stored format has hardened around Puck's shape. The cheap moment is now. |
| **Server-render in the plugin (C#)** | Would need a second implementation of every block in a second language. The render cache already removes the performance argument. |

---

## Verification required before acceptance

- [ ] Comparison harness runs in CI over a corpus of pages, failing on any divergence
- [ ] Identical output confirmed with `locale: 'ar'` as well as `'en'`
- [ ] Nested slots verified — a slot inside a slot inside a slot
- [ ] Unknown block type renders a visible placeholder, not an empty gap
- [ ] Confirm the published bundle contains no `@puckeditor/core` code, by inspecting the built output rather than trusting the import graph
