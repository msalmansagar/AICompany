# Phase 3 — Solution Architecture
## Engagement: DFE-STYLE-001 — Advanced Visual Styling & Full CSS Control
**Client:** Qatar Development Bank (QDB)
**Date:** 2026-06-28
**Architect:** Maqsad AI Solution Architect
**Status:** Proposed — Pending CEO Phase 3 → 4 Gate

---

## 1. Solution Overview

This engagement extends the Dynamic Form Engine's design system from a 12-field legacy model to the full `DesignPayload` contract already defined in `shared/src/types/design.types.ts`. The designer (CRM web resource) gains structured Style tab panels for Theme, Form, Section, Field, and Button layers; the Fastify backend gains a CSS sanitization path on every save; the render cache gains an inline `designPayload` block; and the on-prem runtime gains isomorphic re-sanitization before CSS injection. The `DesignerStyleModel` legacy type is retired across all 8 dependent files and replaced by `DesignPayload` sub-types flowing through a migrated Zustand store. No new runtime infrastructure is introduced — the engagement extends what the DFE-RC-001 publish pipeline and the DFE-i18n-001 schema already put in place.

---

## 2. Component Inventory

All paths are relative to `projects/dynamic-form-engine/`.

### New Components

| Component | File Path | Layer | Responsibility |
|---|---|---|---|
| StyleTabContainer | `designer/src/screens/style/StyleTabContainer.tsx` | designer | Tab-deferred-render wrapper; mounts each style sub-panel only on first activation |
| ThemeStylePanel | `designer/src/screens/style/ThemeStylePanel.tsx` | designer | Theme color pickers, typography controls, shape/shadow controls, and WCAG indicators |
| FormStylePanel | `designer/src/screens/style/FormStylePanel.tsx` | designer | Form-level layout type, label position, section style, animation, max-width, custom CSS textarea |
| SectionStylePanel | `designer/src/screens/style/SectionStylePanel.tsx` | designer | Per-section background, border, padding, card style, collapse animation controls |
| FieldStylePanel | `designer/src/screens/style/FieldStylePanel.tsx` | designer | Per-field input style, width, height, icon prefix/suffix, state-style advisory warnings |
| ButtonStylePanel | `designer/src/screens/style/ButtonStylePanel.tsx` | designer | Per-button-type color, size, border radius, alignment, icon, hover effect, loading style |
| WcagContrastIndicator | `designer/src/components/wcag/WcagContrastIndicator.tsx` | designer | Fluent UI v9 Badge + Text alongside each ColorPicker showing ratio and AA/AAA level |
| AllowlistService | `designer/src/services/AllowlistService.ts` | designer | Reads `qdb_css_allowlist_config` via Xrm.WebApi; caches the allowed-domains array for the session |
| CssSanitiserPlugin | `shared/src/sanitizer/CssSanitiserPlugin.ts` | shared | PostCSS plugin factory; accepts `allowedDomains[]`; removes unsafe AST nodes |
| contrastRatio | `shared/src/utils/contrastRatio.ts` | shared | Pure W3C WCAG 2.1 contrast ratio calculator; no dependencies |
| design.schema | `shared/src/validation/design.schema.ts` | shared | Zod schemas for all `DesignPayload` sub-types; used at every API boundary |
| styleAttributeNames | `designer/src/constants/styleAttributeNames.ts` | designer | Registry of all new `qdb_*` attribute logical names for style entities |
| CacheSanitiser | `backend/src/sanitizer/CssSanitiser.ts` | backend | Server-side wrapper: reads allowed domains from config, constructs and runs CssSanitiserPlugin |
| DesignAssembler | `backend/src/services/DesignAssembler.ts` | backend | Queries all style entities for a form and assembles the `DesignPayload` for cache embedding |

### Modified Components

| Component | File Path | Layer | Change Summary |
|---|---|---|---|
| DesignService | `designer/src/services/DesignService.ts` | designer | All upsert DTOs extended to full DesignPayload fields; `getTheme()` return type changed to `ThemeDefinition`; 5 new read methods added |
| designerStore | `designer/src/state/designerStore.ts` | designer | `style: DesignerStyleModel` replaced by `designPayload: DesignPayload`; `updateStyle` replaced by per-layer update actions; `loadForm` signature extended |
| ThemeEditorScreen | `designer/src/screens/ThemeEditorScreen.tsx` | designer | Reduced to a navigation shell that mounts `StyleTabContainer`; existing 12-control layout retired |
| PreviewScreen | `designer/src/screens/PreviewScreen.tsx` | designer | Reads `state.designPayload.theme` instead of `state.style` |
| VersionHistoryScreen | `designer/src/screens/VersionHistoryScreen.tsx` | designer | Reads `state.designPayload.theme.themeName` for display label |
| FormListScreen | `designer/src/screens/FormListScreen.tsx` | designer | Reads `state.designPayload.theme.themeName` for display label |
| NewFormWizardScreen | `designer/src/screens/NewFormWizardScreen.tsx` | designer | Initializes with `DEFAULT_DESIGN_PAYLOAD` instead of `DEFAULT_STYLE` |
| DesignerStyleModel | `designer/src/state/models/DesignerStyleModel.ts` | designer | Deprecated; file retained with JSDoc `@deprecated` tag only; exports removed post-migration |
| StyleEngine | `frontend/src/theme/StyleEngine.ts` | frontend | WeakMap-based memoization added to `resolveField` and `resolveSection` |
| LivePreviewMiniature | `frontend/src/components/preview/LivePreviewMiniature.tsx` | frontend | Receives full `DesignPayload`; propagates through `DesignPayloadContext` to child renderers |
| attributeNames | `designer/src/constants/attributeNames.ts` | designer | Single addition: `PUBLISH_JOB_TRIGGER_REASON.STYLE_CHANGE = 2` |
| CacheAssemblyService | `backend/src/services/CacheAssemblyService.ts` | backend | Extended to call `DesignAssembler.assembleDesignPayload()` and embed result in cache JSON |
| qdb_form_runtime | `designer/src/webresources/qdb_form_runtime.html` | on-prem | Adds AllowlistService read on load; runs CssSanitiserPlugin (browser build) before style injection |

---

## 3. Dataverse Schema Design

### 3a. Extended Entities — New Attributes

All attributes carry `qdb_` publisher prefix. All new attributes are optional with null defaults, enabling zero-downtime deployment (existing code continues to read only the attributes it already knows).

#### qdb_theme (8 existing attributes → 24 total)

| Logical Name | Dataverse Type | Length / Values | design.types.ts Field |
|---|---|---|---|
| `qdb_theme_code` | Text | 100 | `ThemeDefinition.themeCode` |
| `qdb_surface_color` | Text | 7 | `ThemeDefinition.surfaceColor` |
| `qdb_text_primary_color` | Text | 7 | `ThemeDefinition.textPrimaryColor` |
| `qdb_text_secondary_color` | Text | 7 | `ThemeDefinition.textSecondaryColor` |
| `qdb_border_color` | Text | 7 | `ThemeDefinition.borderColor` |
| `qdb_error_color` | Text | 7 | `ThemeDefinition.errorColor` |
| `qdb_success_color` | Text | 7 | `ThemeDefinition.successColor` |
| `qdb_warning_color` | Text | 7 | `ThemeDefinition.warningColor` |
| `qdb_font_url` | Text | 2048 | `ThemeDefinition.fontUrl` (validated against allowlist before persist) |
| `qdb_heading_font_size` | Text | 10 | `ThemeDefinition.headingFontSize` (e.g., `"24px"`) |
| `qdb_label_font_size` | Text | 10 | `ThemeDefinition.labelFontSize` (e.g., `"12px"`) |
| `qdb_input_font_size` | Text | 10 | `ThemeDefinition.inputFontSize` (e.g., `"14px"`) |
| `qdb_shadow_style` | Option Set | None=100000000, Subtle=100000001, Strong=100000002 | `ThemeDefinition.shadowStyle` |
| `qdb_spacing_scale` | Option Set | Compact=100000000, Normal=100000001, Comfortable=100000002 | `ThemeDefinition.spacingScale` |
| `qdb_is_dark_mode` | Two Options | true/false, default false | `ThemeDefinition.isDarkMode` |
| `qdb_is_active` | Two Options | true/false, default true | `ThemeDefinition.isActive` |

**Existing attribute note:** `qdb_secondary_color` (registered in code as `THEME_ATTRS.ACCENT_COLOR`) is the canonical attribute for `ThemeDefinition.secondaryColor`. New code registers it as `THEME_EXT_ATTRS.SECONDARY_COLOR` in `styleAttributeNames.ts`. The string value `'qdb_secondary_color'` is identical — only the TypeScript key name changes. Migration plan in Section 5 covers the alias transition.

**Type-mapping note:** `qdb_base_font_size` (WholeNumber, existing) stores the numeric px value (e.g., `14`). The `DesignAssembler` appends `"px"` when building `ThemeDefinition.baseFontSize`. Same pattern for `qdb_border_radius` (WholeNumber) → `ThemeDefinition.borderRadius` string.

**New attribute count: 16**

---

#### qdb_form_design (5 existing attributes → 16 total)

| Logical Name | Dataverse Type | Length / Values | design.types.ts Field |
|---|---|---|---|
| `qdb_layout_type` | Option Set | SingleColumn=100000001, TwoColumn=100000002, Grid=100000003, Stepper=100000004, Wizard=100000005, Accordion=100000006, TabBased=100000007, InlineCompact=100000008 | `FormDesign.layoutType` |
| `qdb_label_position` | Option Set | Top=100000001, Left=100000002, Floating=100000003 | `FormDesign.labelPosition` |
| `qdb_section_style` | Option Set | Card=100000001, Flat=100000002, Outlined=100000003 | `FormDesign.sectionStyle` |
| `qdb_form_button_style` | Option Set | Primary=100000001, Outline=100000002, Text=100000003 | `FormDesign.buttonStyle` |
| `qdb_animation_enabled` | Two Options | default true | `FormDesign.animationEnabled` |
| `qdb_responsive_behavior_json` | Memo | 4000 | `FormDesign.responsiveBehavior` (JSON-serialized `Record<string, unknown>`) |
| `qdb_max_width` | Text | 20 | `FormDesign.maxWidth` (e.g., `"1200px"`) |
| `qdb_alignment` | Option Set | Left=100000001, Center=100000002, Right=100000003 | `FormDesign.alignment` |
| `qdb_sticky_action_bar` | Two Options | default false | `FormDesign.stickyActionBar` |
| `qdb_skeleton_loader_enabled` | Two Options | default false | `FormDesign.skeletonLoaderEnabled` |
| `qdb_form_design_is_active` | Two Options | default true | `FormDesign.isActive` |

**New attribute count: 11**

---

#### qdb_section_design (4 existing attributes → 14 total)

| Logical Name | Dataverse Type | Length / Values | design.types.ts Field |
|---|---|---|---|
| `qdb_background_color` | Text | 7 | `SectionDesign.backgroundColor` |
| `qdb_border_style` | Text | 100 | `SectionDesign.borderStyle` (e.g., `"1px solid #ccc"`) |
| `qdb_padding` | Text | 20 | `SectionDesign.padding` (e.g., `"16px"`) |
| `qdb_margin` | Text | 20 | `SectionDesign.margin` (e.g., `"8px 0"`) |
| `qdb_section_column_layout` | Option Set | 1=100000001, 2=100000002, 3=100000003, 4=100000004 | `SectionDesign.columnLayout` |
| `qdb_card_style` | Option Set | Flat=100000001, Elevated=100000002, Outlined=100000003 | `SectionDesign.cardStyle` |
| `qdb_collapsible_style` | Option Set | None=100000000, Animated=100000001, Instant=100000002 | `SectionDesign.collapsibleStyle` |
| `qdb_header_style_json` | Memo | 2000 | `SectionDesign.headerStyle` (JSON `Record<string,string>`) |
| `qdb_visibility_animation` | Option Set | None=100000000, Fade=100000001, Slide=100000002 | `SectionDesign.visibilityAnimation` |
| `qdb_section_is_active` | Two Options | default true | `SectionDesign.isActive` |

**Deprecated (retained, not written by new code):** `qdb_css_class` (no mapping in shared type), `qdb_custom_css` (no mapping in SectionDesign shared type — was designer-only legacy).

**New attribute count: 10**

---

#### qdb_field_design (4 existing attributes → 15 total)

| Logical Name | Dataverse Type | Length / Values | design.types.ts Field | Notes |
|---|---|---|---|---|
| `qdb_label_style` | Text | 4000 | `FieldDesign.labelStyle` (JSON `Record<string,string>`) | Existing — content format migrates from CSS string to JSON |
| `qdb_input_style` | Text | 50 | `FieldDesign.inputStyle` — stores `InputStyleType` enum value | Existing — content migrates from CSS string to typed value |
| `qdb_field_width` | Option Set | Full=100000001, Half=100000002, Custom=100000003 | `FieldDesign.width` | New |
| `qdb_custom_width` | Text | 20 | `FieldDesign.customWidth` (e.g., `"300px"`) | New |
| `qdb_field_height` | Text | 20 | `FieldDesign.height` (e.g., `"120px"`) | New |
| `qdb_placeholder_style_json` | Memo | 1000 | `FieldDesign.placeholderStyle` (JSON) | New |
| `qdb_icon_prefix` | Text | 100 | `FieldDesign.iconPrefix` | New |
| `qdb_icon_suffix` | Text | 100 | `FieldDesign.iconSuffix` | New |
| `qdb_tooltip_style_json` | Memo | 1000 | `FieldDesign.tooltipStyle` (JSON) | New |
| `qdb_error_style_json` | Memo | 1000 | `FieldDesign.errorStyle` (JSON) — advisory v1 | New |
| `qdb_focus_style_json` | Memo | 1000 | `FieldDesign.focusStyle` (JSON) — advisory v1 | New |
| `qdb_disabled_style_json` | Memo | 1000 | `FieldDesign.disabledStyle` (JSON) — advisory v1 | New |
| `qdb_field_is_active` | Two Options | default true | `FieldDesign.isActive` | New |

**New attribute count: 11 (plus 2 existing with content format change)**

---

#### qdb_button_design (5 existing attributes → 13 total)

| Logical Name | Dataverse Type | Length / Values | design.types.ts Field | Notes |
|---|---|---|---|---|
| `qdb_button_color` | Text | 7 | `ButtonDesign.color` | New |
| `qdb_button_size` | Option Set | Small=100000001, Medium=100000002, Large=100000003 | `ButtonDesign.size` | New |
| `qdb_button_border_radius` | Text | 20 | `ButtonDesign.borderRadius` (e.g., `"4px"`) | New |
| `qdb_button_alignment` | Option Set | Left=100000001, Center=100000002, Right=100000003 | `ButtonDesign.alignment` | New |
| `qdb_button_icon` | Text | 100 | `ButtonDesign.icon` (Fluent icon name) | New |
| `qdb_hover_effect` | Option Set | None=100000000, Elevate=100000001, ColorShift=100000002 | `ButtonDesign.hoverEffect` | New |
| `qdb_loading_style` | Option Set | Spinner=100000001, Dots=100000002, Pulse=100000003 | `ButtonDesign.loadingStyle` | New |
| `qdb_button_is_active` | Two Options | default true | `ButtonDesign.isActive` | New |

**Existing notes:** `qdb_style` (existing Text attribute) is deprecated — new code ignores it; existing value is not migrated. `qdb_button_type` (existing Text) continues to store `ButtonType` enum values (`'Submit'`, `'SaveDraft'`, `'Cancel'`) — no change.

**New attribute count: 8**

---

**Total new attributes across existing entities: 16 + 11 + 10 + 11 + 8 = 56**

---

### 3b. New Entity: qdb_layout_grid

**Display Name:** Layout Grid
**Logical Name:** `qdb_layout_grid`
**Primary Key:** `qdb_layout_gridid` (UniqueIdentifier, system-generated GUID)
**Ownership:** Organization-owned
**Purpose:** Stores per-field responsive column spans within a form design.

| Logical Name | Dataverse Type | Constraints | design.types.ts Field |
|---|---|---|---|
| `qdb_layout_gridid` | UniqueIdentifier | Primary key | `LayoutGrid.id` |
| `qdb_form_design_id` | Lookup → `qdb_form_design` | Required, N:1 | `LayoutGrid.formDesignId` |
| `qdb_form_field_id` | Lookup → `qdb_form_field` | Required, N:1 | `LayoutGrid.fieldId` |
| `qdb_columns_total` | Whole Number | 1–12 | `LayoutGrid.columnsTotal` |
| `qdb_span_mobile` | Whole Number | 1–12 | `LayoutGrid.spanMobile` |
| `qdb_span_tablet` | Whole Number | 1–12 | `LayoutGrid.spanTablet` |
| `qdb_span_desktop` | Whole Number | 1–12 | `LayoutGrid.spanDesktop` |
| `qdb_layout_grid_is_active` | Two Options | Default true | — |

**Relationships:**
- `qdb_form_design_id` → `qdb_form_design` (N:1, cascade delete: Remove Link)
- `qdb_form_field_id` → `qdb_form_field` (N:1, cascade delete: Remove Link)
- One `qdb_form_design` record has 0..N `qdb_layout_grid` records (one per field that has an explicit responsive override)
- Constraint enforced in application: at most one `qdb_layout_grid` record per `(form_design_id, form_field_id)` combination. Enforced by designer upsert logic (find-then-update pattern), not by Dataverse unique index.

---

### 3c. New Configuration Entity: qdb_css_allowlist_config

**Display Name:** CSS Allowlist Config
**Logical Name:** `qdb_css_allowlist_config`
**Primary Key:** `qdb_css_allowlist_configid` (UniqueIdentifier)
**Ownership:** Organization-owned
**Purpose:** Holds the configurable list of approved CDN domains for `url()` values inside `customCss` and for `fontUrl` in ThemeDefinition. QDB IT can add or remove domains here without a code deployment, satisfying NFR-008 and CEO condition C-005a.

| Logical Name | Dataverse Type | Length | Purpose |
|---|---|---|---|
| `qdb_css_allowlist_configid` | UniqueIdentifier | — | Primary key |
| `qdb_config_key` | Text | 100 | Lookup key used at runtime (always `'default'` in v1; supports future per-form overrides) |
| `qdb_allowed_domains_json` | Memo | 8000 | JSON array of approved domain strings (e.g., `["fonts.googleapis.com","fonts.gstatic.com"]`). Governs both `url()` in `customCss` AND `fontUrl` domain validation (single source — C-005a). |
| `qdb_is_active` | Two Options | — | Only the active record is read at runtime |
| `qdb_notes` | Memo | 2000 | Admin notes explaining why each domain is approved (audit trail) |

**Read path — three consumers:**

1. **Designer (CRM web resource):** `AllowlistService.ts` calls `Xrm.WebApi.retrieveMultipleRecords('qdb_css_allowlist_config', '?$filter=qdb_config_key eq \'default\' and qdb_is_active eq true&$select=qdb_allowed_domains_json&$top=1')` once on designer load. Result is cached in module scope for the session. On save, `fontUrl` domain and `customCss` url() values are validated against this cached array before `upsertTheme` / `upsertFormDesign` is called.

2. **Fastify backend:** `CssSanitiser.ts` reads allowed domains from `process.env.ALLOWED_CSS_DOMAINS_JSON` (a JSON array string set at deploy time). For environments where the backend has Dataverse access, a startup task can read from `qdb_css_allowlist_config` and cache in-process; environment variable takes precedence. The env var approach avoids a Dataverse round-trip on every save request and is the primary path for v1.

3. **On-prem runtime (`qdb_form_runtime.html`):** Reads via `Xrm.WebApi.retrieveMultipleRecords` on page load — same query as the designer. Cached in a module-level variable. Used by the browser-build PostCSS sanitizer before injecting `customCss` into the `<style>` block (C-005b).

**OQ-007 impact:** The `qdb_allowed_domains_json` field is the sole place QDB Brand Team's CDN confirmation (pending) gets recorded. When Brand Team confirms approved domains, QDB IT updates this record. No code change required.

---

### 3d. New attributeNames.ts Registries

**File:** `designer/src/constants/styleAttributeNames.ts`

This file is separate from `attributeNames.ts` (which is already at 490 lines, exceeding NFR-014's 400-line cap). All new style-entity attribute registries live here. The `attributeNames.ts` receives only the `STYLE_CHANGE: 2` addition to `PUBLISH_JOB_TRIGGER_REASON`.

**Naming pattern:** All keys use `UPPER_SNAKE_CASE`. All values use `qdb_` logical names. Every attribute referenced anywhere in the codebase must be registered here — no inline strings.

Required constant objects in `styleAttributeNames.ts`:

```
THEME_EXT_ATTRS        — 16 new theme attributes + SECONDARY_COLOR alias
FORM_DESIGN_EXT_ATTRS  — 11 new form design attributes
SECTION_DESIGN_EXT_ATTRS — 10 new section design attributes
FIELD_DESIGN_EXT_ATTRS   — 11 new field design attributes
BUTTON_DESIGN_EXT_ATTRS  — 8 new button design attributes
LAYOUT_GRID_ATTRS        — 8 attributes (all attributes for the new entity)
CSS_ALLOWLIST_CONFIG_ATTRS — 5 attributes (all attributes for the new entity)
```

Picklist-to-value maps companion objects (same file):
```
LAYOUT_TYPE_TO_PICKLIST / PICKLIST_TO_LAYOUT_TYPE
LABEL_POSITION_TO_PICKLIST / PICKLIST_TO_LABEL_POSITION
SECTION_STYLE_TO_PICKLIST / PICKLIST_TO_SECTION_STYLE
FORM_BUTTON_STYLE_TO_PICKLIST / PICKLIST_TO_FORM_BUTTON_STYLE
ALIGNMENT_TO_PICKLIST / PICKLIST_TO_ALIGNMENT
SECTION_COLUMN_LAYOUT_TO_PICKLIST / PICKLIST_TO_SECTION_COLUMN_LAYOUT
CARD_STYLE_TO_PICKLIST / PICKLIST_TO_CARD_STYLE
COLLAPSIBLE_STYLE_TO_PICKLIST / PICKLIST_TO_COLLAPSIBLE_STYLE
VISIBILITY_ANIMATION_TO_PICKLIST / PICKLIST_TO_VISIBILITY_ANIMATION
FIELD_WIDTH_TO_PICKLIST / PICKLIST_TO_FIELD_WIDTH
BUTTON_SIZE_TO_PICKLIST / PICKLIST_TO_BUTTON_SIZE
BUTTON_ALIGNMENT_TO_PICKLIST / PICKLIST_TO_BUTTON_ALIGNMENT
HOVER_EFFECT_TO_PICKLIST / PICKLIST_TO_HOVER_EFFECT
LOADING_STYLE_TO_PICKLIST / PICKLIST_TO_LOADING_STYLE
SHADOW_STYLE_TO_PICKLIST / PICKLIST_TO_SHADOW_STYLE
SPACING_SCALE_TO_PICKLIST / PICKLIST_TO_SPACING_SCALE
INPUT_STYLE_TO_PICKLIST / PICKLIST_TO_INPUT_STYLE
```

Estimated file size: ~280 lines — within the 400-line NFR-014 limit.

---

## 4. DesignService Extension Design

`designer/src/services/DesignService.ts` — all existing methods are extended. New read methods are added. File will approach 400 lines; if it exceeds this, the write methods split to `DesignWriteService.ts` and read methods remain in `DesignService.ts` (split point defined at build time, not speculated here).

### Extended DTOs and Data Flow

**`UpsertThemeDto` — extended**
Adds all 16 new `ThemeDefinition` fields to the existing 7. The `fontUrl` field is validated against the allowlist by the caller (ThemeStylePanel) before this DTO is constructed — the service does not re-validate (validation at boundary, trust inside). The `borderRadius` field continues to carry a `number` (service converts to `string` when building DesignPayload). `THEME_EXT_ATTRS.SECONDARY_COLOR` replaces `THEME_ATTRS.ACCENT_COLOR` in new write code; both reference the same `qdb_secondary_color` attribute.

**`UpsertFormDesignDto` — extended**
Adds 11 new fields matching `FormDesign`. `customCss` is sanitized by the caller (FormStylePanel passes through `CssSanitiserPlugin`) before the DTO is constructed. The service embeds the sanitized value directly. `responsiveBehavior` is JSON-serialized before passing to the DTO (`JSON.stringify`). `PATCH semantics:` the payload object only includes keys whose values differ from null — undefined/null-valued optional fields are omitted from the payload object, ensuring PATCH does not overwrite existing values with null.

**`UpsertSectionDesignDto` — extended**
Adds 10 new fields. `headerStyle` (JSON `Record<string,string>`) is serialized to string before inclusion. The existing `cssClass` and `customCss` fields are removed from the DTO — old values are not overwritten (backward compat with any existing records using those attributes).

**`UpsertFieldDesignDto` — extended**
Adds 11 new fields. `labelStyle` is now `Record<string, string>` serialized to JSON string before writing to `qdb_label_style`. `inputStyle` writes the `InputStyleType` enum string directly. All state-style JSON fields (`errorStyleJson`, `focusStyleJson`, `disabledStyleJson`) are included in the DTO even in v1 — they are saved as advisory data; the publish gate does not block on them.

**`UpsertButtonDesignDto` — extended (per ButtonType)**
Adds 8 new fields. The designer calls `upsertButtonDesign` once per `ButtonType` (Submit, SaveDraft, Cancel), identified by `buttonType` field. The service finds the existing record for that `(formId, buttonType)` pair and updates it. `qdb_style` (the old attribute) is not written — the new specific attributes replace its role.

**`UpsertLayoutGridDto` — new**
Fields: `formDesignId`, `fieldId`, `columnsTotal`, `spanMobile`, `spanTablet`, `spanDesktop`. The service uses `findSingleByField` on `(form_design_id, form_field_id)` combined filter before create vs. update.

**`UpsertFontUrlDto` — new**
Separate DTO for fontUrl to isolate the domain-validation concern. The service validates the domain portion of `fontUrl` against the allowlist array passed in before writing to `qdb_font_url`. If validation fails, the service throws a `DomainError('font_url_domain_not_allowed')` — the UI catches this and surfaces it in the ThemeStylePanel.

**New read methods:**

| Method | Return Type | Query |
|---|---|---|
| `getThemeByFormDesign(formId)` | `ThemeDefinition \| null` | Retrieves `qdb_form_design` for formId, follows `qdb_theme_id` lookup, retrieves all theme attributes |
| `getFormDesign(formId)` | `FormDesign \| null` | Retrieves `qdb_form_design` record; maps all attributes |
| `getSectionDesigns(sectionIds)` | `SectionDesign[]` | Retrieves all `qdb_section_design` records matching the sectionIds array; one call with `$filter` using `in` clause |
| `getFieldDesigns(fieldIds)` | `FieldDesign[]` | Same pattern for `qdb_field_design` |
| `getButtonDesigns(formId)` | `ButtonDesign[]` | Retrieves all `qdb_button_design` records for the formId |
| `getLayoutGrid(formDesignId)` | `LayoutGrid[]` | Retrieves all `qdb_layout_grid` records for the formDesignId |

**`getTheme(id)` return type change:** The existing method returns `DesignerStyleModel`. After migration, it returns `ThemeDefinition`. The `getTheme` method is retained for backward compat during the migration window; it is marked `@deprecated` in JSDoc and callers are migrated to `getThemeByFormDesign`.

**PATCH semantics enforcement:** Every write payload is built by iterating the DTO fields and only including keys with non-undefined values. A shared private helper `buildPatchPayload<T>(dto: T, attrMap: Record<keyof T, string>): Record<string, unknown>` constructs this object. This helper is defined once in `DesignService.ts` and used by all upsert methods — no duplication.

---

## 5. DesignerStyleModel → DesignPayload Migration Plan

The migration is atomic at the store level — the `style: DesignerStyleModel` field in `designerStore.ts` is the central dependency. All 8 source files depend on it transitively. The migration proceeds file-by-file in a single Phase 4 task; no intermediate mixed state is accepted.

### File Migration Table

| File | Current DesignerStyleModel Slice | After Migration | Breaking Change Risk | Mitigation |
|---|---|---|---|---|
| `DesignerStyleModel.ts` (definition) | Defines the 12-field interface and `DEFAULT_STYLE` constant | Deprecated with JSDoc tag. `DEFAULT_DESIGN_PAYLOAD: DesignPayload` is added as a new export in this file for the transition, then moved to `designerStore.ts` | Low — rename only | File is retained; existing imports get a compile error that guides the migration |
| `designerStore.ts` | `style: DesignerStyleModel`; `updateStyle(patch: Partial<DesignerStyleModel>)` | `designPayload: DesignPayload`; `updateTheme(patch: Partial<ThemeDefinition>)`, `updateFormDesign(patch: Partial<FormDesign>)`, `updateSectionDesign(sectionId, patch: Partial<SectionDesign>)`, `updateFieldDesign(fieldId, patch: Partial<FieldDesign>)`, `updateButtonDesign(buttonType, patch: Partial<ButtonDesign>)`, `upsertLayoutGrid(entry: LayoutGrid)` | High — central store; all consuming screens fail to compile | TypeScript strict mode turns this into a compile-time checklist; every consumer fails at build with a type error, not a runtime error |
| `DesignService.ts` | `getTheme()` returns `DesignerStyleModel`; `mapRecordToStyleModel()` builds it | `getThemeByFormDesign()` returns `ThemeDefinition`; `getFormDesign()`, `getSectionDesigns()`, `getFieldDesigns()`, `getButtonDesigns()`, `getLayoutGrid()` added; `mapRecordToStyleModel()` removed | Medium — internal private method; only `ThemeEditorScreen` and `designerStore` call `getTheme` | Remove `getTheme` last after all callers migrated |
| `ThemeEditorScreen.tsx` | Renders 12 controls reading from `state.style` | Replaced by `StyleTabContainer.tsx` mounting `ThemeStylePanel`, `FormStylePanel`, `SectionStylePanel`, `FieldStylePanel`, `ButtonStylePanel`; all read from `state.designPayload` sub-fields | High — complete screen replacement | New screen components are built first; `ThemeEditorScreen` becomes a navigation shell during transition, then is emptied once panels are wired |
| `PreviewScreen.tsx` | Reads `state.style.primaryColor`, `state.style.themeName`, etc. for display | Reads `state.designPayload.theme.primaryColor`, `state.designPayload.theme.themeName` | Low — read-only consumer | Straightforward property path update |
| `VersionHistoryScreen.tsx` | Reads `state.style.themeName` for version snapshot label | Reads `state.designPayload.theme.themeName` | Low — read-only consumer | Straightforward property path update |
| `FormListScreen.tsx` | Reads `state.style.themeName` for form card label | Reads `state.designPayload.theme.themeName` | Low — read-only consumer | Straightforward property path update |
| `NewFormWizardScreen.tsx` | Initializes `style` with `DEFAULT_STYLE` via `loadForm` | Passes `DEFAULT_DESIGN_PAYLOAD` as the `designPayload` parameter to the updated `loadForm` signature | Medium — `loadForm` signature changes | `loadForm` parameter addition is made backward-compatible by making `designPayload` a required parameter rather than optional — TypeScript error is the guard |

**Two test files:** Both test `getTheme()` → `DesignerStyleModel` mappings. After migration, tests are rewritten against `getThemeByFormDesign()` → `ThemeDefinition`. No test logic is shared with implementation — rewrite is clean.

**`DEFAULT_DESIGN_PAYLOAD` specification:** The default payload mirrors `DEFAULT_STYLE` field values where overlapping, and fills remaining fields with sensible defaults: primary color `#0078d4`, dark mode false, label position `Top`, tab style `Tabs`, layout type `TabBased`, all section designs empty record, all field designs empty record, all button designs with size `Medium`, alignment `Center`, hover effect `None`, loading style `Spinner`.

---

## 6. Render Cache Extension Design

### DesignPayload Embedding in Cache JSON

The existing `qdb_runtime_json` column (Memo, 1,048,576 char limit, current max usage 10,392 chars) holds the assembled form runtime JSON. `DesignPayload` is embedded inline as a top-level key.

**Cache JSON structure — version 3:**
```
{
  "version": 3,
  "formDefinitionId": "...",
  "formCode": "...",
  "tabs": [...],
  "sections": [...],
  "fields": [...],
  "validationRules": [...],
  "businessRules": [...],
  "translations": { ... },
  "designPayload": {
    "theme": { ... },
    "formDesign": { ... },
    "sectionDesigns": { "sectionId1": { ... }, ... },
    "fieldDesigns": { "fieldId1": { ... }, ... },
    "buttonDesigns": { "Submit": { ... }, "SaveDraft": { ... }, "Cancel": { ... } },
    "layoutGrid": [...]
  }
}
```

**Size guard:** The `DesignAssembler` calculates `JSON.stringify(designPayload).length` before embedding. If the result exceeds 512,000 characters (NFR-004 hard cap), the assembler throws a `PublishError('design_payload_exceeds_size_cap')` and the publish job fails with this error in `qdb_error_details`. The designer surfaces a 400KB soft warning before the user reaches the publish step (FR-083 guard).

### Fastify Cache Assembly Extension

`CacheAssemblyService.ts` is extended with a call to `DesignAssembler.assembleDesignPayload(formDefinitionId)` during cache build. The assembler performs these Dataverse OData queries in parallel (Promise.all):

1. `GET /qdb_form_designs?$filter=qdb_form_definition_id eq '{id}'&$expand=qdb_theme_id($select=all_theme_attrs)&$top=1`
2. `GET /qdb_section_designs?$filter=qdb_form_section_id in ('{id1}','{id2}',...)` — section IDs from the already-assembled sections array
3. `GET /qdb_field_designs?$filter=qdb_form_field_id in ('{id1}','{id2}',...)` — field IDs from the already-assembled fields array
4. `GET /qdb_button_designs?$filter=qdb_form_definition_id eq '{id}'`
5. `GET /qdb_layout_grids?$filter=qdb_form_design_id eq '{formDesignId}'` — formDesignId from result of query 1

All queries use `$select` limited to only the attributes defined in `THEME_EXT_ATTRS`, `FORM_DESIGN_EXT_ATTRS`, etc. No wildcard selects.

**FR-083 default payload:** If query 1 returns zero records (no `qdb_form_design` exists for this form), `DesignAssembler` returns `DEFAULT_DESIGN_PAYLOAD` — the same constant as the designer default. The cache assembly never fails because of a missing design record.

### STYLE_CHANGE Publish Job Trigger

**`PUBLISH_JOB_TRIGGER_REASON` addition:**
```
PUBLISH_JOB_TRIGGER_REASON = {
  PUBLISH: 1,
  STYLE_CHANGE: 2,   // new — added to attributeNames.ts
}
```

**Flow:** When a designer style save completes (any of the `upsertTheme`, `upsertFormDesign`, `upsertSectionDesign`, `upsertFieldDesign`, `upsertButtonDesign`, `upsertLayoutGrid` calls returns successfully), the designer creates a `qdb_publish_job` record:
- `qdb_trigger_reason`: `STYLE_CHANGE (2)`
- `qdb_status`: `QUEUED (1)`
- `qdb_form_definition_id`: current form ID
- `qdb_target_version`: current form version number
- `qdb_languages_requested`: same language set as the last PUBLISH job for this form (read from the last completed job record)

The `qdb_publish_job` creation is fire-and-forget — the designer does not wait for the job to complete. The backend's existing publish job processor picks it up and re-runs cache assembly. This means style changes have eventual consistency with the rendered cache: the cache reflects the new style only after the background job completes (typically seconds).

**Race condition guard:** If the designer saves style changes and creates a STYLE_CHANGE job while a PUBLISH job is already RUNNING for the same form, the backend processor checks for a newer QUEUED job before marking RUNNING → COMPLETED. If a newer job exists, the processor completes its current run normally — the newer job will re-run assembly with the latest state.

---

## 7. CSS Sanitization Architecture

### CssSanitiserPlugin.ts (shared/src/sanitizer/)

This is a PostCSS plugin factory function. It accepts `allowedDomains: readonly string[]` and returns a PostCSS `Plugin` object. The plugin walks the PostCSS AST and applies the following rules:

**AtRule nodes:**
- `@import` — always removed (prevents external stylesheet injection)
- `@charset` — always removed
- `@namespace` — always removed
- `@font-face` — retained, but each `src` declaration inside it is inspected; any `url()` whose domain is not in `allowedDomains` causes the entire `@font-face` block to be removed
- `@keyframes` — retained (safe animation declarations)
- All other at-rules — removed by default

**Rule nodes (selectors):**
- Selectors targeting `html`, `body`, `:root`, `*` — removed (prevent global style overrides)
- Selectors not scoped to `.qdb-form`, `.qdb-field`, `.qdb-section`, or a `.qdb-*` class prefix — removed
- Note: the designer prepends a `.qdb-form-{formCode}` scope wrapper before passing to the plugin; the plugin validates that all selectors include this prefix

**Declaration nodes (property/value pairs):**
- Properties against a hardcoded allowlist (defined in-code, not configurable — this is a security boundary): includes layout (`display`, `flex-*`, `grid-*`), typography (`font-*`, `color`, `line-height`), spacing (`margin`, `padding`), borders (`border-*`, `border-radius`), backgrounds (`background-color`, `background-image` with url() restriction), shadows (`box-shadow`), transitions (`transition`, `animation`), visibility (`opacity`, `visibility`)
- Properties accessing behavior (`pointer-events: none/auto` are allowed; `content` only in `::before`/`::after` contexts) — others blocked
- `expression()`, `javascript:` — always removed regardless of property
- `url()` values — domain extracted and checked against `allowedDomains`; declaration removed if domain not in allowlist

**Output:** The plugin returns the processed CSS string with all unsafe nodes removed. It does not throw — it silently drops unsafe nodes. The caller (designer panel) reads the processed output and compares it to the input to determine if any content was removed; if so, it surfaces a non-blocking warning in the UI.

### Designer Path (browser-isomorphic)

The designer bundles PostCSS using its existing webpack/esbuild build pipeline. The `CssSanitiserPlugin.ts` from the shared package is imported directly. `AllowlistService.ts` fetches allowed domains once on designer load.

When the user edits the Custom CSS textarea in `FormStylePanel.tsx`:
1. On every debounced change (300ms), the textarea value is passed to `postcss([createCssSanitiserPlugin(allowedDomains)]).process(css)`
2. The processed output is compared to the input
3. If they differ, a warning message is displayed below the textarea: "Some rules were removed as they do not meet the security policy"
4. The processed (sanitized) value is what gets persisted on save — not the raw input

The `fontUrl` field in `ThemeStylePanel.tsx` validates the domain on blur: the domain is extracted and checked against `allowedDomains` from `AllowlistService`; if not in the allowlist, an inline error is shown and the save is blocked for that field.

### Backend (Fastify) Path

`CssSanitiser.ts` in `backend/src/sanitizer/`:
- Reads `process.env.ALLOWED_CSS_DOMAINS_JSON` (JSON string) and parses it on startup
- Exposes a single function: `sanitiseCustomCss(rawCss: string): string`
- Called by the cache assembly service's `DesignAssembler.ts` when building `FormDesign.customCss` from the Dataverse record before embedding in the cache JSON
- Also called on the style save endpoint (`POST /api/forms/:id/design`) before persisting to Dataverse — defense in depth

The backend path does NOT re-fetch from Dataverse on every request — the allowed domains are loaded once at startup. A restart is required to pick up allowlist changes. This is acceptable for v1 given the infrequency of domain additions.

### On-Prem Runtime Path (C-005b)

`qdb_form_runtime.html` receives `customCss` as part of the render cache JSON. Even though the Fastify backend already sanitized this CSS before caching, the runtime must re-sanitize before injection. This is defense-in-depth — the runtime does not trust cache integrity.

The runtime includes the PostCSS browser build (bundled at build time from `postcss/lib/postcss` browser entry) and the `CssSanitiserPlugin` (same shared module, browser-compatible). On page load:
1. `Xrm.WebApi.retrieveMultipleRecords(...)` fetches the active `qdb_css_allowlist_config` record
2. `JSON.parse(record.qdb_allowed_domains_json)` extracts the domains array
3. When the cache JSON is received, `customCss` is passed through `postcss([createCssSanitiserPlugin(allowedDomains)]).process(customCss)`
4. The sanitized output is injected as a `<style>` element scoped to the form container

The PostCSS browser build is ~30KB gzipped — acceptable for a CRM web resource. It does not use Node.js `path`, `fs`, or `process` APIs in its browser entry.

### Single Allowlist Read Path (C-005a Summary)

| Consumer | Read method | When read | Refresh |
|---|---|---|---|
| Designer | `Xrm.WebApi.retrieveMultipleRecords` | Once on designer load | Page reload |
| Fastify backend | `process.env.ALLOWED_CSS_DOMAINS_JSON` | Once at startup | Service restart |
| On-prem runtime | `Xrm.WebApi.retrieveMultipleRecords` | Once on form load | Page reload |

The single `qdb_css_allowlist_config` record with `qdb_config_key = 'default'` is the authoritative source. The Fastify env var mirrors it — kept in sync by the deployment pipeline (updated in `.env` / Kubernetes secret when the Dataverse record changes).

---

## 8. WCAG Contrast Architecture

### contrastRatio.ts (shared/src/utils/)

Pure utility function, zero dependencies, ~30 lines. Exports one function:

```
function calculateContrastRatio(hexForeground: string, hexBackground: string): ContrastResult
```

**ContrastResult type:**
```
{
  ratio: number;           // e.g., 4.52
  level: 'AAA' | 'AA' | 'AA Large' | 'Fail';
  passesMinimumGate: boolean;  // true if ratio >= 3:1 (the v1 blocking gate)
  isAdvisoryWarning: boolean;  // true if 3:1 <= ratio < 4.5:1
}
```

**W3C WCAG 2.1 formula steps:**
1. Hex parse: strip `#`; handle 3-digit shorthand by doubling each hex digit (`#RGB` → `#RRGGBB`)
2. Normalize each channel: `value / 255` → linear float
3. Linearize: for each channel `c`, if `c <= 0.04045` then `c / 12.92`, else `((c + 0.055) / 1.055) ^ 2.4`
4. Relative luminance: `L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin`
5. Apply to both foreground and background → `L1`, `L2`
6. Contrast ratio: `(max(L1, L2) + 0.05) / (min(L1, L2) + 0.05)`
7. Level classification: `>= 7:1` → `AAA`, `>= 4.5:1` → `AA`, `>= 3:1` → `AA Large`, else `Fail`
8. `passesMinimumGate`: `ratio >= 3.0`

**Input validation:** Malformed hex values (not 3 or 6 hex digits after stripping `#`) return `{ ratio: 0, level: 'Fail', passesMinimumGate: false, isAdvisoryWarning: false }`.

### WcagContrastIndicator.tsx (designer/src/components/wcag/)

Fluent UI v9 composition. Renders alongside each ColorPicker in `ThemeStylePanel.tsx` and `ButtonStylePanel.tsx`.

**Props:**
```
{
  foregroundHex: string;
  backgroundHex: string;
  label: string;  // e.g., "Primary on Background"
}
```

**Render:** A Fluent UI `Badge` (appearance: `tint`) with color based on level (`success` for AAA/AA, `warning` for AA Large, `error` for Fail) alongside a `Text` showing `"X.XX:1"` ratio. An `aria-label` reads the full accessibility result for screen readers.

### Contrast Pairs Checked (v1 scope — ADR-STYLE-006)

**Blocking gate (publish blocked if ratio < 3:1):**
- `primaryColor` on `backgroundColor`
- `primaryColor` on `surfaceColor`
- `textPrimaryColor` on `backgroundColor`
- `textPrimaryColor` on `surfaceColor`
- Submit button: `ButtonDesign[Submit].color` on `backgroundColor`
- SaveDraft button: `ButtonDesign[SaveDraft].color` on `backgroundColor`
- Cancel button: `ButtonDesign[Cancel].color` on `backgroundColor`

The `WcagContrastIndicator` renders inline for each of these pairs. The publish gate (`PublishValidationScreen`) re-evaluates all pairs using `calculateContrastRatio` before allowing publish. If any blocking pair fails, the screen shows a blocking error list and the publish button is disabled.

**Advisory-only (warn in designer, do not block publish):**
- Per-field state styles: error color, focus color, disabled color
- `textSecondaryColor` on `backgroundColor`
- `borderColor` on `backgroundColor`

Advisory warnings render as an informational `MessageBar` (Fluent UI v9) in the relevant panel — not inline per control, not in the publish gate.

---

## 9. StyleEngine Memoization Design

`frontend/src/theme/StyleEngine.ts` gains a module-level WeakMap cache.

**Cache structure:**
```
WeakMap<DesignPayload, Map<string, CSSProperties | ResolvedFieldStyle>>
```

The outer `WeakMap` key is the `DesignPayload` object reference. When `ThemeProvider` provides a new `DesignPayload` (e.g., after a style save), the old `WeakMap` entry becomes eligible for GC automatically — no explicit invalidation needed.

The inner `Map` key is `"section:{sectionId}"` or `"field:{fieldId}"` (prefixed to prevent collision).

**resolveSection memoization:** Before computing the CSS, check `outerMap.get(payload)?.get("section:{sectionId}")`. If present, return it. Otherwise compute, store in inner Map, return.

**resolveField memoization:** Same pattern with `"field:{fieldId}"` key, storing `ResolvedFieldStyle`.

**useEffect dependency array in ThemeProvider:** Already uses `[theme, formTheme]` as dependencies. Since `useMemo` builds a new `ThemeDefinition` (via `buildFluentTheme`) only when these references change, the CSS property injection in `useEffect` also only fires on reference change. The `DesignPayload` object from the store is a new reference on every Zustand `produce` call — this is the expected behavior. The WeakMap cache means that after a style-unrelated state change (e.g., field label update), the same `DesignPayload` reference is reused and `StyleEngine` returns cached values.

**When not to memoize:** `resolveButton` (future addition) resolves `ButtonDesign` from the payload — same pattern. Forms with no `DesignPayload` (rendering against defaults) share the `DEFAULT_DESIGN_PAYLOAD` object reference — this reference is stable across all form renders without explicit style, so the cache entry is effectively global for that case.

---

## 10. Designer Performance Strategy — C-004b

### Problem Quantification

A form with 20 fields and 5 sections on the Style tab mounts approximately:
- ThemeStylePanel: ~22 Fluent UI v9 controls (10 ColorPickers, 4 Selects, 2 TextFields, 1 Slider, 1 Toggle, 2 Dropdowns, 1 Textarea, 1 WcagContrastIndicator per pair × 4)
- FormStylePanel: ~11 controls
- SectionStylePanel (5 sections × 8 controls): ~40 controls
- FieldStylePanel (20 fields × 12 controls): ~240 controls
- ButtonStylePanel (3 button types × 8 controls): ~24 controls
- **Total: ~337 controls**

Mounting 337 Fluent UI v9 controls synchronously in one React render cycle will not meet the NFR-002 200ms initial render target.

### Chosen Strategy: Tab-Deferred Render

The Style tab in the designer canvas hosts a secondary tab bar with 5 sub-tabs: Theme, Form, Sections, Fields, Buttons.

`StyleTabContainer.tsx` manages mounting state:
- Each sub-tab panel is wrapped in a deferred mount: the panel's React subtree is only instantiated when the user first activates that sub-tab
- Once mounted, the panel stays mounted (the React subtree is not destroyed on tab switch — it is hidden via CSS `display: none`)
- This is implemented using a `mountedTabs: Set<StyleTabValue>` state variable, not `React.lazy` — the panels are not code-split (they are in the same bundle), but their React subtrees are conditionally rendered

**Implementation contract (not code — interface specification):**
`StyleTabContainer` maintains `mountedTabs: Set<StyleTabValue>`. On tab selection, the newly selected tab is added to `mountedTabs`. The JSX for each panel renders as `mountedTabs.has(tab) ? <PanelComponent /> : null`, but only the active tab is visible (Fluent UI `TabPanel` handles visibility). Previously-mounted panels remain in the DOM tree (hidden) so their state is preserved.

**Initial render budget:**
- Tab activation = Theme tab (first tab, mounted immediately): ~22 controls → well within 200ms
- First click to Sections tab: ~40 controls → fast
- First click to Fields tab: ~240 controls → may take 80-150ms on first mount; subsequent visits instant (already in DOM)
- First click to Buttons tab: ~24 controls → fast

### Why Not Virtualization

Virtual scrolling (react-window / react-virtual) is the wrong shape for this problem. Virtualization is appropriate for long flat lists where items have uniform or measurable heights. The Style panels are structured forms with grouped accordions (one accordion per section, one per field) — not flat lists. Virtualizing them would require knowing the expanded height of every accordion upfront, adding significant complexity. Tab-deferred-render achieves the same 200ms first-paint goal with far less complexity and is the correct pattern for tab-organized structured forms.

### Interaction with Fluent UI v9 Tab Component

The designer already uses Fluent UI v9 `TabList` + `Tab` + `TabPanel`. `StyleTabContainer` follows the same pattern, using `TabValue` state to track the selected sub-tab and the `mountedTabs` set to control deferred mounting. No changes to the Fluent UI library are required.

---

## 11. RTL Logical Property Strategy

### Where Substitution Is Applied

The RTL logical property substitution table (BR-014) is applied inside `StyleEngine.ts`, not in `ThemeProvider`. `StyleEngine.resolveField` and `StyleEngine.resolveSection` accept an optional `isRtl: boolean` parameter. When `isRtl` is true, the substitution table is applied to the computed `CSSProperties` before returning.

**Why StyleEngine, not ThemeProvider:** ThemeProvider injects CSS custom properties (`--qdb-*` vars) which are not direction-sensitive — they are scalar values (colors, font sizes). The direction-sensitive properties (margin-left/right, padding-left/right, text-align, border-left/right) are resolved per-field and per-section in `StyleEngine`. The substitution happens once in the resolver, not in every component.

### RTL Substitution Table (BR-014 contract)

| LTR Property | RTL Logical Replacement |
|---|---|
| `marginLeft` | `marginRight` (values swapped) |
| `marginRight` | `marginLeft` (values swapped) |
| `paddingLeft` | `paddingRight` (values swapped) |
| `paddingRight` | `paddingLeft` (values swapped) |
| `textAlign: 'left'` | `textAlign: 'right'` |
| `textAlign: 'right'` | `textAlign: 'left'` |
| `borderLeft` | `borderRight` |
| `borderRight` | `borderLeft` |
| `float: 'left'` | `float: 'right'` |
| `float: 'right'` | `float: 'left'` |

**Pure CSS logical properties** (`margin-inline-start`, `padding-block-end`, etc.) do not need substitution — they are already direction-aware. The substitution table only applies to physical properties specified in `SectionDesign` or `FieldDesign` records.

### How the RTL Flag Is Read

`LANGUAGE_CONFIG_ATTRS.RTL_DIRECTION` (`qdb_rtl_direction`) — already in `attributeNames.ts`. The active language's RTL flag is read by the frontend at form initialization time and stored in a `DesignContext` (a React context, not Zustand store — it is immutable per form load). `StyleEngine.resolveField` and `StyleEngine.resolveSection` are called with `isRtl` derived from this context.

The memoization key includes `isRtl`: inner Map key becomes `"field:{fieldId}:{isRtl}"` (appended `":true"` or `":false"`). This ensures RTL and LTR cached values are separate entries.

### On-Prem Runtime Parity

`qdb_form_runtime.html` reads the active language's `qdb_rtl_direction` from the render cache JSON (the language config is already embedded in the cache from DFE-i18n-001). The same substitution table is implemented in the runtime's style-application function — it is not a shared module (the on-prem runtime has its own isolated JavaScript context), but the table values are identical by specification.

---

## 12. Deployment and Rollback Plan — C-004a

### Zero-Downtime Rationale

All 56 new attributes across existing entities are optional with null defaults. Existing code reads only the attributes it already selects (`$select` lists do not include new attributes). New code is deployed after schema, so there is no window where code runs against a schema that does not yet have the expected attributes.

### Deployment Sequence

**Step 1 — Schema deployment (PAC CLI, managed solution)**
Import an updated `qdb_form_engine` managed solution containing:
- All 56 new attributes across 5 existing entities
- `qdb_layout_grid` new entity (full definition)
- `qdb_css_allowlist_config` new entity (full definition)
- All new option sets and their values
- Solution version bump: `1.0.0.X` → `1.1.0.0` (minor version increment for new entities)

Command: `pac solution import --path qdb_form_engine_1_1_0_0.zip --activate-plugins true`

The solution import runs in non-interactive mode. Estimated import time: 3–5 minutes (new entities require table creation). A maintenance window is not strictly required for step 1 alone — existing functionality continues during schema deployment because no code changes are deployed yet and all new attributes are optional.

**Step 2 — Backend API deployment (Fastify)**
- Set `ALLOWED_CSS_DOMAINS_JSON` environment variable (initial value: `["fonts.googleapis.com","fonts.gstatic.com"]`)
- Deploy new `DesignAssembler.ts`, `CssSanitiser.ts`, extended `CacheAssemblyService.ts`
- The backend's existing cache remains valid — it has no `designPayload` key (v2 format). The frontend handles missing `designPayload` by using `DEFAULT_DESIGN_PAYLOAD` (backward compat — Section 13)
- Estimated downtime: 0 (rolling restart of Fastify containers)

**Step 3 — Frontend deployment (Next.js)**
- Deploy updated `StyleEngine.ts` (memoization), updated `LivePreviewMiniature.tsx`, updated `ThemeProvider.tsx` if any changes
- New frontend can receive cache responses with or without `designPayload` (backward compat)
- Estimated downtime: 0 (rolling deployment)

**Step 4 — Designer deployment (CRM web resource)**
- Deploy: `styleAttributeNames.ts`, `AllowlistService.ts`, `CssSanitiserPlugin.ts` (browser build), `WcagContrastIndicator.tsx`, all 5 Style panel components, `StyleTabContainer.tsx`, updated `DesignService.ts`, updated `designerStore.ts`, updated `ThemeEditorScreen.tsx`, updated `PreviewScreen.tsx`, `VersionHistoryScreen.tsx`, `FormListScreen.tsx`, `NewFormWizardScreen.tsx`, deprecated `DesignerStyleModel.ts`
- All files declared individually in `solution.xml` RootComponents (per CRM Solution Packaging memory rule)
- Publish customizations after import: `pac solution publish`
- First use of the new Style tabs begins populating the new schema attributes. Forms not touched continue to use `DEFAULT_DESIGN_PAYLOAD` at runtime

**Step 5 — On-prem runtime deployment (CRM web resource)**
- Deploy updated `qdb_form_runtime.html` (contains bundled PostCSS browser build + `CssSanitiserPlugin`)
- On load, the runtime fetches the allowlist and re-sanitizes `customCss` before injection
- Existing render cache entries (without `designPayload`) render with default styles (backward compat — Section 13)

**Initial data seed (post Step 1):**
- Insert one `qdb_css_allowlist_config` record with `qdb_config_key = 'default'`, `qdb_is_active = true`, and the initial approved domains JSON. This must happen before Step 4 — otherwise `AllowlistService` returns an empty array and all `url()` values in `customCss` are stripped.

### Rollback Procedure

Rollback proceeds in reverse order (Steps 5 → 1):

**Step 5 rollback:** Re-deploy the previous `qdb_form_runtime.html` web resource. Takes effect immediately on next page load.

**Step 4 rollback:** Re-deploy the previous designer web resource bundle. The designer reverts to `DesignerStyleModel` mode. Any `DesignPayload` data saved during Step 4 deployment window remains in Dataverse but is not read by the rolled-back designer.

**Step 3 rollback:** Re-deploy the previous Next.js build. No state side effects.

**Step 2 rollback:** Re-deploy the previous Fastify build. Cache assembly reverts to v2 format (no `designPayload`).

**Step 1 rollback (schema):** Re-import the previous managed solution version (`1.0.0.X`). Dataverse managed solution rollback behavior:
- New optional attributes are removed from the managed layer; any data in those attributes is lost
- `qdb_layout_grid` and `qdb_css_allowlist_config` new entities are removed; all records in those entities are deleted
- Existing entity records are unaffected (their established attributes, values, and relationships are preserved)
- `qdb_form_design`, `qdb_section_design`, `qdb_field_design`, `qdb_button_design`, `qdb_theme` records retain their original attribute values

**Rollback is safe** because: no existing attributes are modified (only new ones added); no mandatory attributes are added (all null-default); the managed solution import removes what was added cleanly.

### Maintenance Window Assessment

No mandatory maintenance window is required. All deployment steps support rolling execution with no downtime. The only observable user impact during deployment is:
- Between Step 3 and Step 4: the frontend can receive cache responses with `designPayload`; the old designer cannot produce them. This window is typically minutes.
- After Step 4: the designer produces `DesignPayload` data; the Fastify backend cache remains in v2 format until a STYLE_CHANGE job runs cache reassembly. Existing cached responses continue to serve correctly.

If QDB policy requires a formal maintenance window, a 30-minute window during off-peak hours is sufficient to complete all 5 steps sequentially with verification between each.

---

## 13. Backward Compatibility Strategy

### DesignPayload Fields as Optional

Every new `ThemeDefinition`, `FormDesign`, `SectionDesign`, `FieldDesign`, and `ButtonDesign` field added in this engagement is typed as optional (`?`) in `design.types.ts`. This is already the case for the existing shared types (e.g., `ThemeDefinition.secondaryColor?`, `FormDesign.customCss?`). No new required fields are added.

### StyleEngine Null Handling

`StyleEngine.resolveField` and `StyleEngine.resolveSection` already return an empty `CSSProperties` object `{}` when no design record exists for a given `fieldId` or `sectionId`. This behavior is retained. When a field exists but optional properties are null (e.g., `FieldDesign.customWidth` is null), the resolver skips that property — it does not emit `width: undefined` into the style object. React ignores undefined CSS values safely.

### Cache Assembly Default Payload

Forms without a `qdb_form_design` record receive `DEFAULT_DESIGN_PAYLOAD` embedded in their cache (FR-083). The `DEFAULT_DESIGN_PAYLOAD` is the canonical default — same object reference used in the designer. This means existing published forms, before any Style-tab interaction, render exactly as they did before this engagement: with the default theme and no per-field or per-section overrides.

### Visual Regression Guard

SM-002 (screenshot comparison): before deploying Step 3 (frontend), a Playwright screenshot comparison run captures all currently published forms in their rendered state. After deployment, the same run executes. Any delta in visual output is surfaced as a regression. The comparison set includes forms with existing `customCss` values (if any) to validate sanitizer backward compat.

---

## 14. Architecture Decision Records

---

### ADR-STYLE-001: Inline DesignPayload in Cache JSON vs. Separate Storage

**Status:** Accepted
**Context:** The `DesignPayload` aggregate (theme + form design + section designs + field designs + button designs + layout grid) must be delivered to both the Next.js frontend and the on-prem CRM runtime with a single fetch. Two options were considered: (A) embed inline in the existing `qdb_runtime_json` column, (B) store in a separate `qdb_design_cache` column or entity and fetch separately.
**Decision:** Option A — inline in `qdb_runtime_json`. The column has a 1,048,576-character limit. Current maximum usage is 10,392 characters (0.99%). A form with 20 fields, 5 sections, and full DesignPayload is estimated at 15,000–40,000 characters — well under 5% of capacity. The 512KB hard cap (NFR-004) provides a guard against pathological cases. Embedding inline avoids an additional Dataverse fetch, eliminates a join on the runtime path, and requires no new cache entities.
**Consequences:** Positive: single fetch for all runtime data; no join complexity; no new entities for cache. Negative: `qdb_runtime_json` column grows; extreme edge cases (forms with hundreds of fields and per-field styles) could approach the 512KB soft warning threshold and require the designer to reduce style complexity. The 400KB designer warning mitigates this risk proactively.

---

### ADR-STYLE-002: Tab-Deferred Render vs. Virtualization for Designer Performance

**Status:** Accepted
**Context:** CEO condition C-004b requires the Style tab initial render to meet NFR-002 (200ms) with 20 fields and 5 sections (~337 Fluent UI v9 controls total). Two strategies were evaluated: (A) virtual scrolling (react-window / react-virtual) for the fields and sections panels, (B) tab-deferred render — mount each sub-tab panel only on first activation.
**Decision:** Option B — tab-deferred render. Virtual scrolling requires the items to be a flat list with measurable heights; the Style panels are structured accordion-within-accordion forms, not flat lists. Computing accordion heights requires mounting the content anyway, negating the benefit. Tab-deferred render matches the problem shape: the Theme tab (the first activated) has only ~22 controls and meets 200ms comfortably. Subsequent sub-tabs are mounted on first user activation — an intentional user action, not an implicit background cost.
**Consequences:** Positive: correct fit for structured panel shape; simpler implementation than virtualization; zero additional library dependencies; preserves panel state between tab switches. Negative: the Fields sub-tab (240 controls) has a first-activation cost of ~80-150ms, but this occurs only on the first click and is not the initial render — the NFR targets initial render. Users feel a brief pause on first activation of the Fields tab; subsequent activations are instant.

---

### ADR-STYLE-003: PostCSS as CSS Sanitizer Foundation (ADAPT over BUILD)

**Status:** Accepted — Supersedes rationale from ADR-009 (which adopted PostCSS for `custom_css` sanitization at the architecture phase; this ADR extends that decision to the on-prem runtime and shared package)
**Context:** The GitHub research step (locked decision) determined: PostCSS (`^8.x`) is the foundation; a custom `CssSanitiserPlugin.ts` (~150-200 lines) is the ADAPT decision. An alternative considered was building a raw CSS parser from scratch.
**Decision:** PostCSS `^8.x` as the AST foundation. `CssSanitiserPlugin.ts` is implemented as a PostCSS plugin factory (shared package, isomorphic). The PostCSS browser build serves both the designer (Xrm web resource context) and the on-prem runtime. The plugin is the sole place sanitization logic lives — backend, designer, and runtime all use the same module, preventing drift.
**Consequences:** Positive: proven AST parser (100M+ weekly downloads); browser-compatible entry; plugin API is stable; isomorphic usage avoids code duplication. Negative: PostCSS `^8.x` browser bundle is ~30KB gzipped — a cost for the CRM web resource; acceptable given the security value. The `color@5.0.1` supply-chain attack (Sep 2025) noted in CEO conditions affects a package in the PostCSS ecosystem; a `lockfile audit` step is added to the CI pipeline to catch vulnerable transitive dependencies before deployment.

---

### ADR-STYLE-004: Single Shared Allowlist for customCss url() and fontUrl Validation

**Status:** Accepted
**Context:** CEO condition C-005a requires a single allowlist governing both `url()` values inside `customCss` and the `fontUrl` domain. Two options: (A) one `qdb_css_allowlist_config` record with one `qdb_allowed_domains_json` field covering both use cases, (B) separate config records or separate fields for CSS url() vs. font URL domains.
**Decision:** Option A — single record, single JSON array. The security requirement for both cases is identical: "only allow content from QDB-approved CDN domains." A font URL is a special case of a CSS URL. Maintaining two separate allowlists creates a synchronization burden: QDB IT would need to add Google Fonts to both lists. A single list is simpler to administer, impossible to forget to update, and correct by construction.
**Consequences:** Positive: one admin action adds a domain for both use cases; no synchronization risk; simpler AllowlistService implementation. Negative: if QDB ever needs to permit a domain for fonts but block it for arbitrary CSS url() values, a single list cannot express this distinction — a separate list would need to be introduced. This is not a v1 requirement and can be addressed if OQ-007 (font policy) introduces such a distinction.

---

### ADR-STYLE-005: On-Prem Runtime Re-Sanitization via PostCSS Browser Build

**Status:** Accepted
**Context:** CEO condition C-005b requires `qdb_form_runtime.html` to re-sanitize `customCss` after reading it from the render cache, without trusting cache integrity. Two options: (A) run the full PostCSS `CssSanitiserPlugin` (browser build), (B) apply a simpler regex/string check against a hardcoded prefix-based allowlist.
**Decision:** Option A — PostCSS browser build with `CssSanitiserPlugin`. The runtime loads the same shared plugin used by the designer and the backend. This gives identical sanitization behavior across all three contexts, eliminating drift risk. If the allowlist is ever tightened, a single code change in `CssSanitiserPlugin.ts` applies everywhere simultaneously.
**Consequences:** Positive: identical behavior to backend sanitizer (no drift); shared code path; full AST-level protection (not regex-level). Negative: PostCSS browser build adds ~30KB gzipped to the runtime HTML; the runtime already loads Fluent UI and other dependencies, so this is an incremental cost. The `Xrm.WebApi` call to fetch the allowlist adds one Dataverse round-trip on page load; this is acceptable since the runtime already makes at least one round-trip to fetch the render cache. The round-trip is done in parallel with the cache fetch using `Promise.all`.

---

### ADR-STYLE-006: WCAG v1 Scope — Primary Palette and Button Pairs Only

**Status:** Accepted
**Context:** Full WCAG 2.1 AA compliance checking would require validating every color combination produced by the design system, including per-field state styles (focus, error, disabled, placeholder). This would generate dozens of contrast pairs per form. The blocking publish gate must be actionable and specific — a gate that blocks publish for 15 different pairs would overwhelm the designer.
**Decision:** WCAG v1 scope is limited to: (1) primary color pairs against background and surface colors, (2) primary text color against background and surface colors, (3) Submit, SaveDraft, and Cancel button foreground against background. These are the highest-visibility, highest-risk pairs. Per-field state styles (focus rings, error text, disabled opacity) are advisory-only: the designer surfaces them as informational warnings but they do not block publish. This scope is explicitly labeled "v1" in all code and documentation to signal that v2 can expand it without ambiguity.
**Consequences:** Positive: publish gate is actionable (maximum 7 blocking checks); advisory warnings inform designers without blocking workflow; scope matches what a real WCAG audit would prioritize first. Negative: a form can publish with WCAG-non-compliant field state styles; QDB must accept this as a v1 limitation. The CEO condition OQ-010 (third-party WCAG audit in Phase 5 QA) will validate this scope decision independently.

---

## ADR Index Update

`projects/dynamic-form-engine/adrs/index.md` — entries to append:

| ADR | Title | Status | Date | Decided by |
|-----|-------|--------|------|------------|
| ADR-STYLE-001 | Inline DesignPayload in cache JSON vs. separate storage | Accepted | 2026-06-28 | Architect |
| ADR-STYLE-002 | Tab-deferred render vs. virtualization for designer performance | Accepted | 2026-06-28 | Architect |
| ADR-STYLE-003 | PostCSS as CSS sanitizer foundation — ADAPT with shared isomorphic plugin | Accepted | 2026-06-28 | Architect |
| ADR-STYLE-004 | Single shared allowlist for customCss url() and fontUrl domain validation | Accepted | 2026-06-28 | Architect |
| ADR-STYLE-005 | On-prem runtime re-sanitization via PostCSS browser build | Accepted | 2026-06-28 | Architect |
| ADR-STYLE-006 | WCAG v1 scope limited to primary palette and button pairs | Accepted | 2026-06-28 | Architect |

---

## Skeptic Review

> CHALLENGE 1 — Dataverse Schema (C-004a): The architecture claims zero-downtime deployment because new attributes are optional. But Dataverse managed solution import is not always atomic for large solution packages with new entities. A partial import failure for `qdb_layout_grid` would leave `qdb_css_allowlist_config` undeployed — and Step 4 (designer) would fail silently: `AllowlistService` would return an empty array and sanitize ALL `customCss` to empty string, destroying designer UX. What is the failure detection and rollback trigger for a partial schema import?

> CHALLENGE 2 — CSS Sanitizer (PostCSS browser build): The claim that PostCSS's browser build does not use Node.js APIs is based on the PostCSS documentation. PostCSS `8.x` conditionally loads a `path` polyfill in browser contexts. If the CRM web resource bundle target differs from what PostCSS expects (e.g., esbuild `platform: 'browser'` vs. `platform: 'node'`), the wrong entry point may be resolved and the bundle will fail at runtime inside a CRM plugin sandbox. Has the browser build been tested in a CRM web resource sandbox specifically?

> CHALLENGE 3 — STYLE_CHANGE Publish Job (eventual consistency): The architecture accepts that style changes have eventual consistency with the render cache — the cache reflects new styles only after the background publish job completes. If a QDB form admin saves a theme color change and immediately sends the form URL to a citizen, the citizen may see the old colors for seconds or minutes depending on job queue depth. At peak load (many forms publishing simultaneously), queue depth could be significant. What is the maximum acceptable lag and has a QDB SLA been defined for style-to-render consistency?

> CHALLENGE 4 — DesignerStyleModel Migration (8 files): The migration claims TypeScript strict mode turns breaking changes into compile-time errors. This is true in isolation, but `designerStore.ts` uses `Partial<DesignerStyleModel>` in `updateStyle` — and `Partial<>` is structurally compatible with many types. If a developer accidentally passes a partial `DesignerStyleModel` slice to the new `updateTheme` action (whose parameter is `Partial<ThemeDefinition>`), TypeScript may not catch the error if the overlapping fields (`primaryColor`, `backgroundColor`, `fontFamily`) have the same name and type in both. The migration plan must include a strict type guard or branded type on `ThemeDefinition` to prevent accidental mixing.

> CHALLENGE 5 — Single Allowlist (ADR-STYLE-004): The single `qdb_css_allowlist_config` record with `qdb_config_key = 'default'` is fetched without authentication by the on-prem runtime using `Xrm.WebApi`. If a malicious actor with CRM access modifies the `qdb_allowed_domains_json` value to include an attacker-controlled domain, and then injects a `url()` reference to that domain in `customCss` of any form, the on-prem runtime will permit injecting content from that domain. The allowlist config record needs its own security role restriction — only users with a specific "CSS Allowlist Admin" role should be able to write to `qdb_css_allowlist_config`. This security role is not specified anywhere in the architecture.

> CHALLENGE 6 — StyleEngine Memoization (WeakMap): The memoization uses the `DesignPayload` object reference as the WeakMap key. Zustand with Immer produces a new top-level `DesignPayload` reference on every `produce` call — even a call that only changes `form.label` (a field label, nothing to do with style). This means every non-style edit to the form invalidates the entire `StyleEngine` cache and forces recomputation of all field and section styles on the next render. In a form-heavy editing session, this produces continuous cache misses. A finer-grained memoization key — using the `DesignPayload` sub-object references (`sectionDesigns`, `fieldDesigns`) separately — would preserve cache hits during structural edits. This needs to be addressed before the memoization is implemented.

> CHALLENGE 7 — On-Prem Runtime Allowlist Round-Trip: The on-prem runtime fetches the allowlist via `Xrm.WebApi` on every page load, in parallel with the render cache fetch. If the `qdb_css_allowlist_config` Dataverse call fails (network timeout, insufficient permissions for the form user), the runtime currently has no fallback. Option A: proceed with an empty allowlist (strip all `url()` — safe but breaks intended design). Option B: proceed with no sanitization (unsafe — violates C-005b). Option C: block form render until allowlist loads (bad UX). A specific failure mode and fallback must be defined.

> CHALLENGE 8 — WCAG Publish Gate: The blocking gate checks 7 contrast pairs. The `calculateContrastRatio` function is called at publish time by reading from `state.designPayload`. But the `designPayload` in the store may not be saved yet if the designer made color changes and navigated to the publish screen without saving first. The publish gate could pass WCAG against stale saved data while the unsaved in-memory state would have failed. The architecture must specify whether the publish gate evaluates the in-memory `designPayload` or the last-saved Dataverse state — and ensure the designer enforces a save before allowing publish navigation.

> CHALLENGE 9 — attributeNames.ts File Size: The architecture acknowledges `attributeNames.ts` at 490 lines exceeds NFR-014's 400-line cap. The plan is to leave it as-is (except for the `STYLE_CHANGE` addition) and put new constants in `styleAttributeNames.ts`. But this means the existing violation persists and worsens with the `STYLE_CHANGE` addition. If NFR-014 is a non-negotiable standard (as stated in the CLAUDE.md), the architecture should specify a split of `attributeNames.ts` into domain-specific files (`formAttributeNames.ts`, `ruleAttributeNames.ts`, etc.) as part of this engagement's scope — not deferred.

> CHALLENGE 10 — Lockfile Audit (ADR-STYLE-003): The `color@5.0.1` supply-chain attack is noted and a "lockfile audit step in the CI pipeline" is prescribed. But the architecture does not specify which tool performs this audit (`npm audit`, `better-npm-audit`, `socket.dev`, Dependabot), what severity threshold triggers a build failure, or what the exemption process is for known-acceptable vulnerabilities. This is not a hypothetical — a PostCSS transitive dependency had a real supply-chain attack. The deployment plan must name the specific tool and threshold before Phase 4 begins.

**These challenges must be addressed before Phase 4 begins.**
