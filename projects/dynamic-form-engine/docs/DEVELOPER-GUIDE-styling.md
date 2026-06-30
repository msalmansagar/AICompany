# Developer Guide — DFE-STYLE-001: Advanced Visual Styling & Full CSS Control

Audience: engineers extending or maintaining the DFE design/styling system.
Scope: the design data model (7 Dataverse entities), the `DesignPayload` contract, how
styling is authored (designer Style panels) and rendered (StyleEngine), CSS support and
its security model, WCAG, and the gotchas.

Companion: `DEVELOPER-GUIDE-buttons.md` (DFE-BTN-001). Engagement artifacts:
`brd-style.md`, `brd-style-approval.md`, `phase-3-arch-style.md`, `phase-4-tech-style.md`,
`phase-5-qa-style.md`, `DEPLOYMENT-RUNBOOK-style.md`.

> Status: schema is **deployed** to org5869857f; the WCAG/CSS rendering is implemented.
> The engagement was **approved with conditions** (staging-gated). Treat production rollout
> as condition-gated per `brd-style-approval.md`.

---

## 1. What the feature does

Surfaces the runtime's existing design system in the designer: a theme/token system plus
per-form, per-section, per-field, and per-button styling, **responsive grid** layout,
**custom CSS** (sanitized), an **author-time WCAG contrast** check, and an **IT-governed
CSS domain allowlist** for `url()`/web-fonts. Existing forms render unchanged until a
designer edits a Style panel (backward compatible — all design attributes are optional).

---

## 2. Architecture & data flow

```
DESIGNER Style panels ──(picklistCodec)──▶ qdb_theme / qdb_*_design / qdb_layout_grid
   (Theme/Form/Section/Field/Button)                     │
                                                         ▼
BACKEND DesignAssembler + DesignPicklistMappers ── assembles ──▶ DesignPayload
   (CSS sanitized via CssSanitiser; allowlist from env/Dataverse)│
                                                         ▼
   FormDefinition.design  (embedded in metadata / render cache)
                                                         │
                         ┌───────────────────────────────┼───────────────────┐
                         ▼                                ▼                   ▼
                  Portal StyleEngine               on-prem runtime      (mobile: limited)
                  → CSSProperties + CSS vars        re-sanitizes CSS
                  customCssInjector (sanitized)
```

The **`DesignPayload`** (`shared/src/types/design.types.ts`) is the single contract:
`ThemeDefinition`, `FormDesign`, `SectionDesign`, `FieldDesign`, `ButtonDesign`,
`LayoutGrid`. The `StyleEngine` (`frontend/src/theme/StyleEngine.ts`) resolves it into
React `CSSProperties` + `--qdb-*` CSS custom properties.

---

## 3. Dataverse schema — the 7 design entities

(Verified against org5869857f. In DFE-STYLE-001 the two `*css_class` attributes and the
entire `qdb_css_allowlist_config` entity are net-new; the rest pre-existed from DFE-ADD.)

### `qdb_theme` (23 attrs) — global theme tokens
Colors: `qdb_primary_color`, `qdb_secondary_color`, `qdb_background_color`,
`qdb_surface_color`, `qdb_border_color`, `qdb_text_primary_color`,
`qdb_text_secondary_color`, `qdb_error_color`, `qdb_success_color`, `qdb_warning_color`.
Typography: `qdb_font_family`, **`qdb_font_url`** (external font — allowlist-governed),
`qdb_base_font_size`, `qdb_heading_font_size`, `qdb_label_font_size`, `qdb_input_font_size`.
Other: `qdb_border_radius`, `qdb_shadow_style` (Picklist), `qdb_spacing_scale` (Picklist),
`qdb_is_dark_mode`, `qdb_is_active`, `qdb_theme_code`.

### `qdb_form_design` (16 attrs) — form-level → lookups `qdb_form_definition_id`, `qdb_theme_id`
**`qdb_custom_css` (Memo)** — the custom CSS block (sanitized). Plus `qdb_layout_type`,
`qdb_max_width`, `qdb_tab_style`, `qdb_section_style`, `qdb_button_style`,
`qdb_label_position`, `qdb_alignment` (Picklists); `qdb_responsive_behavior` (Memo);
`qdb_sticky_action_bar`, `qdb_animation_enabled`, `qdb_skeleton_loader_enabled`, `qdb_is_active`.

### `qdb_section_design` (13 attrs) — per-section → lookup `qdb_form_section_id`
**`qdb_css_class` (String)** *(net-new)*. Plus `qdb_background_color`, `qdb_border_style`,
`qdb_card_style`, `qdb_collapsible_style`, `qdb_column_layout`, `qdb_margin`, `qdb_padding`,
`qdb_visibility_animation`, **`qdb_header_style` (Memo JSON)**, `qdb_is_active`.

### `qdb_field_design` (16 attrs) — per-field → lookup `qdb_form_field_id`
**`qdb_field_css_class` (String)** *(net-new)*. Plus `qdb_input_style`, `qdb_width`,
`qdb_custom_width`, `qdb_height`, `qdb_icon_prefix`, `qdb_icon_suffix`, `qdb_is_active`, and
**state styles (Memo JSON):** `qdb_focus_style`, `qdb_error_style`, `qdb_disabled_style`,
`qdb_placeholder_style`, `qdb_tooltip_style`, `qdb_label_style`.

### `qdb_button_design` (11 attrs) — button styling → lookup `qdb_form_definition_id`
`qdb_button_type`, `qdb_color`, `qdb_size`, `qdb_border_radius`, `qdb_alignment`,
`qdb_icon`, `qdb_hover_effect`, `qdb_loading_style`, `qdb_is_active`.
DisplayName **"Button Design"** (collection `qdb_button_designs`) — it's a custom unmanaged
table; in the maker portal set the Tables filter to **All** to see it.

### `qdb_layout_grid` (8 attrs) — responsive grid → lookups `qdb_form_design_id`, `qdb_form_field_id`
`qdb_columns_total`, **`qdb_span_desktop`**, **`qdb_span_tablet`**, **`qdb_span_mobile`**,
`qdb_is_active`.

### `qdb_css_allowlist_config` (5 attrs) — CSS domain allowlist *(net-new entity)*
`qdb_config_key` (primary; the `global` record), **`qdb_allowed_domains_json` (Memo)** —
approved CDN domains for `url()`/`fontUrl`; `qdb_is_active`, `qdb_notes`.
Seeded `global` = `["fonts.googleapis.com","fonts.gstatic.com"]`.

**Provisioning:** `scripts/provision-style-schema.mjs` (the 2 `css_class` attrs + the
allowlist entity + `global` seed). Run with `--env-file=scripts/.env`.

---

## 4. CSS support & security model

Three distinct CSS mechanisms, all governed:

| Mechanism | Stored in | Governed by |
|---|---|---|
| **Custom CSS** (free-form) | `qdb_form_design.qdb_custom_css` | PostCSS sanitizer (save + runtime) |
| **CSS classes** | `qdb_section_design.qdb_css_class`, `qdb_field_design.qdb_field_css_class` | applied via Fluent `mergeClasses` |
| **Font / `url()` domains** | `qdb_theme.qdb_font_url` + `url()` in custom CSS | `qdb_css_allowlist_config` allowlist |

**Sanitizer** — `shared/src/sanitizer/CssSanitiserPlugin.ts` (a PostCSS plugin), wrapped by
`backend/src/sanitizer/CssSanitiser.ts` (save-time, reads `ALLOWED_CSS_DOMAINS_JSON` env)
and `frontend/src/theme/customCssInjector.ts` (runtime defense-in-depth). It strips:
`@import`/`@charset`/`@namespace`, `expression()`, `javascript:`, `behavior:` declarations,
non-`.qdb-` selectors, and any `url()` whose host isn't on the allowlist.

**Allowlist** — single source (`qdb_css_allowlist_config`) for both `url()` and `fontUrl`.
Designer reads it via `designer/src/services/AllowlistService.ts` (Xrm.WebApi, cached per
session, `global` key, fail-safe to no-domains). Backend mirrors it via the
`ALLOWED_CSS_DOMAINS_JSON` env var (startup logs the active domains; empty → ERROR in prod).
**On-prem** re-sanitizes with an **empty** allowlist (it can't reach Dataverse at render
time) — so approved-CDN `url()` renders on the portal but is stripped on-prem (accepted v1
constraint; see the runbook). IT-governed: writing the allowlist record is restricted by a
dedicated CRM security role (`crm-solution/src/Roles/qdb_css_allowlist_admin.xml`).

---

## 5. WCAG contrast (author-time)

`shared/src/utils/contrastRatio.ts` → `calculateContrastRatio(fgHex, bgHex)` implements the
W3C relative-luminance formula and returns a `ContrastResult`. Used by the designer
(`WcagContrastIndicator`, `DesignerScreen`) to flag colour pairs below the threshold **at
authoring time**. It is computed in-app, **not** stored.

> This is the import that caused the **designer blank-page bug**: `calculateContrastRatio`
> lives in the `server.ts` barrel; the designer's Vite config was missing the
> `@qdb/shared → server.ts` alias, so the value import failed and blanked the bundle.
> Fixed in `designer/vite.config.ts`. See the buttons guide §11.

---

## 6. Picklist codec (option-set integer codes)

Design picklist attributes use **integer option-set codes** that are **`100000001`-based**
(NOT `100000000` — the architecture doc was wrong; verified against the org's OptionSets).
`designer/src/services/picklistCodec.ts` provides `fromPicklist<T>(raw, map, fallback)` /
`toPicklist(value, map, fallbackCode)`; each `*DesignRepository` writes integer codes and
reads via reverse maps. The backend mirrors this in
`backend/src/services/DesignPicklistMappers.ts`. **Always round-trip via the codec** — never
hardcode picklist integers.

---

## 7. Surface-by-surface

### Designer (authoring)
- Style panels: `designer/src/screens/style/{Theme,Form,Section,Field,Button}StylePanel.tsx`
  + `StyleTabContainer.tsx`.
- Repositories (CRUD + picklist round-trip + cssClassName): `designer/src/services/`
  `{Form,Section,Field,Button}DesignRepository.ts`, `ThemeDesignRepository.ts`,
  `LayoutGridRepository.ts`; orchestrated by `DesignService.ts`.
- Persistence: `FormSaveService.persistElementDesigns` writes section/field/button/layout
  designs on save (closes the prior "dead upsert" persistence gap). A `STYLE_CHANGE` audit
  entry is logged (`AuditLogService`).

### Backend (assembly)
- `backend/src/services/DesignAssembler.ts` resolves the design hierarchy into the
  `DesignPayload` embedded on the form; `DesignPicklistMappers.ts` maps codes →
  enum values; `CssSanitiser.ts` sanitizes `customCss` at save.

### Portal (render)
- `frontend/src/theme/StyleEngine.ts` → resolves `DesignPayload` into CSSProperties +
  `--qdb-*` vars; null fields fall back to theme/defaults.
- `frontend/src/theme/customCssInjector.ts` → sanitizes `customCss` before injecting as a
  scoped `<style>` block (defense-in-depth).
- `cssClassName` applied in `SectionRenderer`/`FieldRenderer` via `mergeClasses`.

### On-prem
- The on-prem runtime applies `customCss` from the cache and re-sanitizes with an empty
  allowlist (no Dataverse read at render time).

---

## 8. Status, conditions & gating

DFE-STYLE-001 was **approved with conditions** (`brd-style-approval.md`). Highlights still
relevant to engineers:
- Schema deploy is additive/nullable → zero-downtime; deploy order schema → backend →
  frontend → cache invalidation (`DEPLOYMENT-RUNBOOK-style.md`).
- On-prem `url()` constraint (empty allowlist) is an accepted v1 limitation.
- WCAG state-style scope, fonts (OQ-007), and data residency are condition/staging items.
- The designer **live preview** is canvas-CSS-var updates, not a sandboxed iframe.

---

## 9. Running & testing locally

Same toolchain as the buttons guide §9. The designer Style panels run in the designer
(`:5173`); styled output renders in the **portal** (`:3000` → backend `:4000`). Use
`USE_RENDER_CACHE=false` so design edits show without re-publishing. To see CSS apply,
configure a theme/custom-CSS/field style in the designer, then open the form in the portal.

CSS sanitizer tests live with the backend/shared; WCAG with shared
(`contrastRatio` formula). Run `cd backend && npx vitest run` / `cd shared && npm run typecheck`.

---

## 10. Gotchas

1. **`@qdb/shared` resolution** — design *types* import via `import type` (erased) but
   `calculateContrastRatio` is a **value** import; the consumer must resolve `@qdb/shared`
   to `server.ts` (Vite alias). Missing alias = blank designer. (Buttons guide §11.)
2. **Picklist codes are `100000001`-based** — use `picklistCodec`, never hardcode.
3. **Two cssClassName attribute names** — section uses `qdb_css_class`, field uses
   `qdb_field_css_class` (not symmetrical).
4. **State styles are Memo JSON** (`qdb_focus_style` etc.) — parse/serialize as JSON, not
   plain strings.
5. **On-prem `url()`** is always stripped (empty allowlist) — approved-CDN backgrounds/fonts
   render on the portal but not on-prem.
6. **Allowlist key is `global`** (not `default`) — `AllowlistService` filters
   `qdb_config_key eq 'global'`; the seed must match.
7. **`qdb_button_design` table** exists but is a custom unmanaged table — set the maker
   Tables filter to **All** to find it.

---

## 11. File map

```
shared/src/types/design.types.ts                 # DesignPayload contract
shared/src/utils/contrastRatio.ts                # WCAG calculateContrastRatio
shared/src/sanitizer/CssSanitiserPlugin.ts       # PostCSS sanitizer
backend/src/services/DesignAssembler.ts          # DesignPayload assembly
backend/src/services/DesignPicklistMappers.ts    # code → enum mapping
backend/src/sanitizer/CssSanitiser.ts            # save-time sanitization
frontend/src/theme/StyleEngine.ts                # DesignPayload → CSSProperties
frontend/src/theme/customCssInjector.ts          # runtime CSS sanitize + inject
designer/src/screens/style/*StylePanel.tsx       # authoring panels
designer/src/services/*DesignRepository.ts        # CRUD + picklist round-trip
designer/src/services/picklistCodec.ts           # option-set codec
designer/src/services/AllowlistService.ts        # CSS domain allowlist (designer)
scripts/provision-style-schema.mjs               # css_class attrs + allowlist entity
crm-solution/src/Roles/qdb_css_allowlist_admin.xml  # allowlist IT security role
```
