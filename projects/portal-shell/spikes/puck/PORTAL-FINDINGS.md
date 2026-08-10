# Portal Shell Spike — Findings

**Routes:** `/portal?dir=rtl` · `/portal?dir=ltr` · add `&mode=edit` for the editor.

## What was proven

**The entire portal chrome composes inside Puck.** `root` accepts slot fields, so
header / nav / content / footer are four editable regions, not fixed React:

```
FOOTER   → التذييل (Footer)
CONTENT  → عنوان الصفحة · صف البطاقات ˅ · بطاقة محتوى ×2
NAV      → قائمة التنقل (Nav)
HEADER   → شريط الرأس (Header)
```

**RTL mirroring is automatic and free.** The layout uses CSS Grid named areas
with zero physical left/right — only `borderInlineEnd`, `marginInlineStart`,
`textAlign: start`. The *same* JSON renders:

- **Arabic** — nav on the right, logo right, user left, cards ordered 12→4→27
- **English** — nav on the left, logo left, user right, cards ordered 27→4→12

No conditional code, no second template.

## Defect found — matters for the product

**`defaultProps` do NOT apply to stored data.** They are an authoring-time
convenience: Puck applies them when a component is dragged in, not when saved
data is rendered. First render of this spike showed an empty header, empty nav,
empty page title and empty footer — silently, with no error, because those props
were absent from the JSON.

Consequences for DXP-P1-004 (Versioning & Snapshots):

1. Stored page JSON must carry **every** prop explicitly.
2. Adding a prop to a component in a later release does **not** back-fill
   existing stored pages. Either every `render` tolerates `undefined`, or
   publish runs a migration.
3. A validation step at publish time (props vs `propsSchema`) would catch this
   before it reaches a citizen — which is an argument for the
   `qdb_PublishPage` plugin doing schema validation, not just caching.

Minor: composing everything into `root` slots leaves the default content zone
empty, and it still shows as `DEFAULT-ZONE — No items` in the Outline.

## Architecture decision this surfaces

An editable shell is powerful and dangerous: an admin can delete the navigation
and break every page at once. Two options:

- **A — Shell locked.** Header/nav/footer are fixed React; Puck edits only the
  content region. Safer, less flexible.
- **B — Shell editable, permission-gated.** Shell regions are editable only by
  `portal-admin`; `service-owner` gets the content region. This maps directly
  onto the DXP-P1-002 role taxonomy, which already distinguishes those roles.

**Recommendation: B**, because the RBAC to enforce it already exists — but the
shell must be versioned and roll-back-able before an admin is allowed to touch
it, i.e. it depends on DXP-P1-004 shipping first. Until then, ship A.

## Responsive (added after first pass)

Breakpoints: ≤1024px narrows the rail to 200px; ≤768px stacks the shell and
turns the nav into a horizontal pill scroller; header drops its subtitle and
username (avatar kept as the tap target); footer stacks and centres.

### Finding: inline styles cannot be responsive

The first version used inline `style={{}}` throughout and nothing collapsed —
inline styles cannot express `@media` or `@container`. **A responsive page
builder must drive layout through classNames and a real stylesheet.** This is a
constraint on how components are authored in the product, not a preference.

### Finding: use CONTAINER queries for components, MEDIA queries for the shell

An admin can drop the same card into a 260px rail or a 1200px main column. The
viewport cannot know which. `.qdb-shell__main` declares
`container-type: inline-size`, and the cards size off the *region*:

```
@container qdb-main (max-width: 520px) { .qdb-card__value { font-size: 22px } }
```

Verified firing: stat value 28px → 22px, rich card padding 20px → 14px.

### Bug found and fixed: horizontal overflow on mobile

Measured at a 390px canvas, before the fix:

| | before | after |
|---|---|---|
| `grid-template-columns` | 822.312px | **390px** |
| `body.scrollWidth > innerWidth` | **true** | **false** |
| stat value (container query) | 28px (never fired) | **22px** |

Cause: grid items default to `min-width: auto`, which resolves to the
max-content of their children. The nav's `overflow-x: auto` scroller therefore
widened the whole grid track past the viewport — and because the main region
was inflated too, the container query never matched. Fix: `min-inline-size: 0`
on the nav grid item, `overflow: hidden` on it at mobile, and
`max-inline-size: 100%; overflow-x: hidden` on the shell.

### Also required

`export const viewport = { width: 'device-width', initialScale: 1 }` in the root
layout. Without it a real handset reports a ~980px virtual viewport and every
sub-768px query silently never fires — it looks correct in devtools and is
broken on the device.

### Not verified

Real-device testing. This was measured in Chrome at a constrained canvas width.
CEO condition C3 requires physical iOS + Android in Arabic locale — that gate
is unchanged by this spike.

## Bilingual (added third pass)

**One tree, localised props — not two trees per language.**

Every text prop exists as an `…En` / `…Ar` pair, mirroring the Dataverse
convention the component registry already uses (`qdb_displayname` /
`qdb_displaynamear`). The active locale travels via Puck's `metadata` and is
read in each `render` through `puck.metadata.locale`.

Why not two trees: with separate Arabic and English trees an admin can add a
card to one and forget the other, and the layouts silently diverge. With one
tree the STRUCTURE is shared by construction — a missing translation shows up
as a missing string, not as a different page. A `pick()` helper falls back to
the other language when a string is blank, so a half-translated page degrades
to bilingual rather than to blank.

Verified — identical structure, different language, one JSON payload:

| | Arabic | English |
|---|---|---|
| `html dir` / `lang` | rtl / ar | ltr / en |
| nav side | RIGHT | LEFT |
| `--font-family-base` | GE Dinar stack | 'Segoe UI', Tahoma |
| `--text-direction` | rtl | ltr |
| nav items / stat cards / rich cards / footer links | 6 / 3 / 2 / 3 | 6 / 3 / 2 / 3 |
| horizontal overflow | false | false |

The font family switching per locale is the DXP-P1-003 cascade doing its job:
locale is already a token resolution dimension, so Arabic and English can carry
different typography with no component-level code.

### Toggle design decisions

- The switcher lives **in the HeaderBar component**, not in spike chrome — it
  is a real portal feature and must be editable/placeable like anything else.
- Its label is **never translated**: Arabic pages show `English`, English pages
  show `العربية`. A user who cannot read the current language must still be
  able to recognise the escape hatch.
- `lang` is set on the anchor so screen readers switch pronunciation.
- Digits stay Latin in both locales. Arabic-Indic numerals are a separate brand
  decision, not a translation one — flag to QDB rather than assume.

### Still open

- Locale currently comes from a query param. Real portal-shell resolves it from
  the `[locale]` route segment; the toggle must preserve the current path and
  any query state, which this spike does not do.
- No `hreflang` / canonical alternate links for SEO.
- Puck's own editor chrome remains English-only (no i18n API) — unchanged.

## Files

- `portal.config.tsx` — root slots + 7 components, Arabic labels, logical CSS only
- `portal.data.ts` — full shell as one serializable tree (the Dataverse payload)
- `app/portal/page.tsx` — view/edit routes
