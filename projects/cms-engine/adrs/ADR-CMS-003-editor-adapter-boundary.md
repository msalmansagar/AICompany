# ADR-CMS-003 — The editor sits behind an adapter; no Puck type crosses the boundary

| | |
|---|---|
| **Status** | **Proposed** — satisfies CEO condition **C-7**; must be accepted before Phase 3 closes |
| **Date** | 2026-08-10 |
| **Raised by** | Phase 1 CEO gate, condition C-7 (adapter pattern made mandatory, not advisory) |
| **Applies to** | CMS Engine (CMS-ENG-001) |
| **Related** | ADR-CMS-001 (payload storage), ADR-CMS-002 (icon storage) |

---

## Context

Puck (`@puckeditor/core`) was adopted after comparison against craft.js and
GrapesJS. It is the right choice today: MIT, actively maintained, RTL verified by
measurement, and it removes perhaps 40 % of the build.

It is also **version 0.22.0 after three years**. Roughly seven minor releases a
year, several carrying breaking changes. That is normal for a pre-1.0 library and
entirely reasonable of its maintainers — but this engagement is a **product sold
to multiple clients and maintained for years**. The CEO gate identified this as
the single risk most likely to hurt later (R-1) and made the adapter
**mandatory rather than advisory**.

The failure this prevents is specific and common. A library gets adopted, its
types spread through the codebase — `Config`, `Data`, `ComponentConfig`,
`puck.isEditing` — and within a year "replace the editor" means "rewrite the
application". The dependency stops being a choice.

The spike already demonstrates the problem in miniature. In
`projects/portal-shell/spikes/puck`, `import type { Config } from
'@puckeditor/core'` appears in four config files, `puck.metadata` and
`puck.isEditing` are read inside more than twenty component render functions,
and the stored page format *is* Puck's `Data` shape. That is fine for a spike.
It is not a foundation.

---

## Decision

**Exactly one module may import `@puckeditor/core`. Everything else speaks our
own types.**

```
src/
  domain/            PageTree, BlockDefinition, FieldDefinition   ← ours
  blocks/            block definitions and render functions        ← ours
  adapters/
    puck/            THE ONLY PLACE @puckeditor/core is imported
      config.ts        BlockDefinition[]  →  Puck Config
      tree.ts          PageTree          ↔  Puck Data
      fields.ts        FieldDefinition   →  Puck Field
      editor.tsx       EditorPort implementation
      renderer.tsx     RendererPort implementation
  editor/            uses EditorPort, never Puck
```

### The domain types

Nothing here references Puck.

```ts
/** A page exactly as stored in qdb_contentjson. Ours, not Puck's. */
export interface PageTree {
  /** Lets a stored page be migrated when this shape changes. */
  schemaVersion: number;
  root: { props: Record<string, unknown> };
  blocks: BlockInstance[];
}

export interface BlockInstance {
  id: string;
  type: string;
  props: Record<string, unknown>;
  /** Named slots. Puck calls these zones; we do not adopt that word. */
  children?: Record<string, BlockInstance[]>;
}

export interface BlockDefinition {
  type: string;
  label: LocalisedText;
  category: BlockCategory;
  fields: FieldDefinition[];
  render(props: BlockRenderProps): ReactNode;
}

/**
 * Field kinds the CMS supports. Deliberately a closed set — every kind maps to
 * a governed input, which is what stops an author entering an arbitrary colour
 * or an unvetted image reference.
 */
export type FieldDefinition =
  | { kind: 'text';     name: string; label: LocalisedText; bilingual: boolean }
  | { kind: 'longText'; name: string; label: LocalisedText; bilingual: boolean }
  | { kind: 'image';    name: string; label: LocalisedText }
  | { kind: 'icon';     name: string; label: LocalisedText }
  | { kind: 'colour';   name: string; label: LocalisedText; tokens: TokenSlug[] }
  | { kind: 'link';     name: string; label: LocalisedText }
  | { kind: 'choice';   name: string; label: LocalisedText; options: ChoiceOption[] }
  | { kind: 'number';   name: string; label: LocalisedText }
  | { kind: 'slot';     name: string; allow?: string[] };

/** What a block's render function receives. Note there is no `puck` object. */
export interface BlockRenderProps {
  id: string;
  props: Record<string, unknown>;
  locale: Locale;
  /** True while an author is editing. Replaces puck.isEditing. */
  isEditing: boolean;
}
```

### The ports

```ts
export interface EditorPort {
  mount(target: HTMLElement, options: EditorMountOptions): EditorHandle;
}

export interface EditorMountOptions {
  definitions: BlockDefinition[];
  tree: PageTree;
  locale: Locale;
  onChange(tree: PageTree): void;
  onPublish(tree: PageTree): void;
}

export interface EditorHandle {
  getTree(): PageTree;
  setTree(tree: PageTree): void;
  destroy(): void;
}

export interface RendererPort {
  render(tree: PageTree, definitions: BlockDefinition[], locale: Locale): ReactNode;
}
```

### Enforcement, not convention

An architectural boundary that relies on discipline is not a boundary. It is
enforced mechanically:

```jsonc
// .eslintrc — no-restricted-imports
{
  "patterns": [{
    "group": ["@puckeditor/core", "@puckeditor/*"],
    "message": "Puck may only be imported from src/adapters/puck/. Use EditorPort."
  }]
}
```
with an override permitting the import inside `src/adapters/puck/**` only, plus
a CI check that fails the build on violation.

---

## What the adapter has to reconcile

These are the real friction points, listed so the Phase 3 estimate is honest
rather than optimistic.

| Ours | Puck | Note |
|---|---|---|
| `BlockInstance.children` (named slots) | `content` + `zones` + slot fields | Puck carries two historical mechanisms; the adapter normalises to one |
| `bilingual: true` on one field | **two** Puck text fields, `…En` / `…Ar` | One domain field expands to two editor fields, and collapses back on read |
| `kind: 'colour'` with token list | Puck `custom` field rendering a swatch picker | The token constraint is ours; Puck has no concept of it |
| `kind: 'icon'` | Puck `custom` field over the icon library | Same |
| `isEditing` | `puck.isEditing` | Renamed at the boundary so blocks never see a `puck` object |
| `locale` | Puck `metadata.locale` | Puck's metadata is untyped; the adapter types it |
| `schemaVersion` | *(no equivalent)* | Ours alone. Puck's `Data` has no version field, which is precisely why we cannot store it directly |

That last row justifies the ADR independently of replaceability — but the
argument needs stating precisely, because an earlier draft of this document
overstated it.

**Corrected 2026-08-10.** An earlier version claimed a Puck format change would
"silently invalidate every page with no way to detect which version a stored page
was written against". Inspecting the shipped bundle shows that is wrong: Puck
*does* migrate older data, via a `migrations` array applied on read. Those
migrations detect whether they apply by **sniffing the shape** — for example
`if (!data.root.props)` — rather than by reading a version.

The accurate argument is narrower and still holds:

- Puck's `Data` genuinely carries **no version field**. Confirmed in the bundle.
- Shape-sniffing works only while old and new shapes are *distinguishable*. A
  change that is ambiguous — same shape, different meaning — cannot be detected
  this way at all.
- Migration runs **on every read**, and the shipped migrations emit
  `console.warn` / `console.log` when they fire. That is acceptable in a
  developer tool and unwelcome on a public page.
- An explicit version lets us migrate **once, at publish**, and know what we are
  reading instead of inferring it.

Our `PageTree` therefore carries `schemaVersion` from the first row written. The
reason is not that Puck cannot evolve its format — it can — but that we want the
evolution to be *explicit and one-time* rather than *inferred and repeated*.

---

## Consequences

### Positive

- Replacing the editor becomes a bounded task — rewrite one directory — rather
  than an application rewrite.
- Stored pages carry a schema version, so they can be migrated.
- Block authors never learn Puck's API, only ours. Onboarding is about the
  domain, not a third-party library.
- A Puck upgrade is contained: breaking changes surface in the adapter's tests,
  not scattered across sixty render functions.
- The domain types are testable without mounting an editor at all.

### Negative

- **Real cost.** Estimated 400–600 lines plus tests, before a single feature is
  built. That is the price of the option and should be stated as such.
- Two vocabularies exist. A developer debugging the canvas will be reading Puck's
  internals while holding our types in their head.
- The adapter is a place bugs can hide — a tree round-trip that loses a slot will
  look like a Puck fault.
- **The abstraction will be tempting to bypass.** "Just import Puck here, it's
  quicker" is how every such boundary dies. Hence the lint rule.

### Explicitly not claimed

This does **not** make the editor cheap to replace. Swapping Puck would still
mean re-implementing drag-and-drop behaviour, field rendering, the outline and
viewport handling against a new library. The adapter bounds the *blast radius*;
it does not eliminate the work.

Claiming otherwise would be the kind of false comfort that makes teams complacent
about a 0.x dependency.

---

## Alternatives considered

| Option | Why rejected |
|---|---|
| **Use Puck types directly** (the spike's approach) | Fine for a spike. For a multi-year product it makes the dependency permanent and leaves stored pages unversioned. |
| **Fork Puck** | Inherits maintenance of a codebase we did not write, and forfeits upstream fixes. Worse than either adopting or replacing. |
| **Adapter for the editor only, Puck's `Data` for storage** | Half a boundary. The storage format is the part that outlives everything — pages written today must still open in five years. |
| **Wait until Puck reaches 1.0** | Blocks delivery on someone else's roadmap, with no commitment behind it. |

---

## Verification required before acceptance

- [ ] Lint rule in place and proven to fail the build on a violating import
- [ ] Round-trip test: `PageTree → Puck Data → PageTree` is lossless across every field kind, including nested slots
- [ ] A block render function contains no reference to `puck`
- [ ] `schemaVersion` present on every tree the adapter emits
- [ ] Renderer works without the editor bundle loaded — proving the runtime path does not drag Puck in

---

## Open questions

| # | Question | Owner |
|---|---|---|
| OQ-A | Does the adapter own the bilingual field expansion, or does the domain store one field with `{ en, ar }`? The latter is cleaner but changes the stored shape — decide before the first row is written. | Architecture |
| ~~OQ-B~~ | ~~Should `RendererPort` also be Puck-backed, or hand-written?~~ **Answered — see [ADR-CMS-004](ADR-CMS-004-own-the-runtime-renderer.md).** A hand-written renderer produces byte-identical output in ~60 lines, so the runtime is ours and Puck never reaches a visitor. | Closed |

> The renderer question turned out to be the more valuable half of this ADR.
> See ADR-CMS-004: confining Puck to the admin surface is a materially smaller
> risk than carrying a 0.x dependency on every page a citizen opens.
