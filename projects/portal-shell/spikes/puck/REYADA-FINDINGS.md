# Reyada Advisory Dashboard — Build Notes

**Routes:** `/reyada?dir=ltr` (English) · `/reyada?dir=rtl` (Arabic) · `&mode=edit` to edit.
Floating pill switches language in either mode.

Reproduces the supplied design: sidebar brand lockup, nav with active pill,
welcome bar, Growth Opportunities with three badged event cards, Reyada Academy
with carousel dots, Explore Reyada Services, and the right rail (On-Spot
Advisory promo, Registered Events with coloured rails, CR registration).

## Files

- `reyada.icons.tsx` — 16 inline line icons, `currentColor`, direction-aware
- `app/reyada.css` — palette as custom properties, layout, responsive rules
- `reyada.config.tsx` — 9 Puck components, all bilingual
- `reyada.data.ts` — full English + Arabic content in one tree
- `app/reyada/page.tsx` — view / edit routes

## Decisions worth carrying into the product

**Icons are inline SVG, not an icon font.** A CRM web resource cannot depend on
an external font host, and `currentColor` means one path serves every badge
tone with no per-variant asset.

**Only directional icons flip.** `DIRECTIONAL` lists chevron, double-chevron,
search, rocket, external-link. Calendar, clock and pin must NOT mirror —
flipping a clock face is a bug, not localisation.

**Palette is exposed as CSS custom properties** (`--rey-green`, `--rey-navy`,
…), so DXP-P1-003 tokens can override any colour per service or locale without
touching component code.

**Photography is CSS gradients.** The `media` prop is already a plain string,
so production swaps in `url(...)` from Dataverse/CMS as a data change.

## Bugs found and fixed during the build

### 1. Bidi reordering of Latin strings in Arabic — the subtle one

`10:00 AM - 6:00 PM` inside an Arabic paragraph rendered as
**`AM - 6:00 PM 10:00`**. The bidi algorithm reorders a Latin run inside an RTL
paragraph. Fixed by wrapping every metadata value in `<bdi>`, which isolates it
from the surrounding direction.

This will hit any mixed-script value — reference numbers, IBANs, phone numbers,
emails, file names. **Rule for the product: any user- or data-supplied string
rendered inside an RTL paragraph goes in `<bdi>`.** It is invisible in English
testing and looks merely "odd" in Arabic, so it survives review easily.

### 2. Date/time were not localised

`date` and `time` were single fields while the registration strip was a
localised pair, so Arabic pages showed Latin dates next to Arabic ones. Split
into `dateEn`/`dateAr` and `timeEn`/`timeAr`. Arabic now shows
`١٥ يونيو ٢٠٢٥ - ١٦ يونيو ٢٠٢٥` and `١٠:٠٠ ص - ٦:٠٠ م`.

Note this contradicts the earlier portal spike, which kept digits Latin for
financial figures. Both are defensible — **dates localise, money may not** —
but it is a QDB brand decision that should be written down once, not decided
per component.

### 0. ROOT CAUSE: no `box-sizing: border-box` — buttons rendered outside cards

`.rey-btn` declares `inline-size: 100%` and also carries 20px inline padding
plus a 1px border. Under the CSS default (`content-box`) that resolves to
100% + 42px, so every full-width button was wider than the card holding it.

Measured before / after adding a global reset:

| | before | after |
|---|---|---|
| global `box-sizing` | content-box | **border-box** |
| button width | 264px | **222px** (= card inner width) |
| card scrollWidth / clientWidth | 296 / 254 | **254 / 254** |
| elements overflowing their container | several | **0** |

**This was also the real cause of finding 3 below.** The `overflow: hidden` I
added there only clipped the symptom — the button was still 42px too wide, just
invisible. Next.js ships no reset, so `border-box` must be declared explicitly;
it now lives in `app/reset.css`, imported before the Puck stylesheet so Puck's
own scoped rules still win for its chrome.

Lesson for the product: a page builder composes third-party and first-party CSS
in one document. Assume nothing about inherited defaults — declare the reset.

Also fixed alongside: `white-space: nowrap` on `.rey-btn` (labels like "Go to
Portal" were wrapping to two lines, which reads as a layout fault), and
`flex-wrap` on the academy action row so the pair wraps as a unit when narrow.

### 3. Event cards overflowed their section by 25px

Grid items default to `min-width: auto` (= max-content), so the nowrap card
titles widened the track. Fixed with `min-inline-size: 0` plus `overflow:
hidden` on the card and `max-inline-size: 100%` on its children. Same root
cause as the nav-scroller overflow in the portal spike — this is the recurring
CSS Grid trap in this codebase.

### 4. Side rail breakpoint was too aggressive

The container query collapsed the two-column grid at 1120px, which stacks the
rail on an ordinary laptop. Lowered to 1000px and narrowed the rail to 420px.

## Not done

- Real photography (gradients stand in)
- The Reyada wordmark is CSS type, not the real logo asset
- Carousel dots are static — no slider behaviour
- Arabic copy is my translation, not QDB-approved terminology
- Not tested on physical devices (CEO condition C3 unchanged)
