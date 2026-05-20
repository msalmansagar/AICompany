═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        UI Design Engine — Dynamic Form Engine (Phase 2)
Client:         Qatar Development Bank (QDB)
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-05-17
Version:        1.0
Status:         Draft — Awaiting CEO Approval
Parent BRD:     projects/dynamic-form-engine/brd.md (v1.0, Approved 2026-05-08)
═══════════════════════════════════════════════════


─────────────────────────────────────────────────────────────────────
DOCUMENT CONTROL
─────────────────────────────────────────────────────────────────────
| Version | Date       | Author              | Changes         |
|---------|------------|---------------------|-----------------|
| 1.0     | 2026-05-17 | Maqsad AI — BA Agent| Initial draft   |


─────────────────────────────────────────────────────────────────────
STAKEHOLDER SIGN-OFF
─────────────────────────────────────────────────────────────────────
| Name            | Role                  | Signature | Date |
|-----------------|-----------------------|-----------|------|
| Maqsad AI — CEO | Internal Approver     |           |      |
| QDB Product     | Client Sponsor        |           |      |
| QDB CRM Team    | Configuration Owner   |           |      |


═══════════════════════════════════════════════════
1. EXECUTIVE SUMMARY
═══════════════════════════════════════════════════

The Dynamic Form Engine (Phase 1) delivered a fully metadata-driven
portal that allows QDB's CRM Configuration Team to define and publish
banking forms entirely within Dataverse without frontend code changes.
However, Phase 1 did not extend this configuration model to visual
design: layout, colors, typography, spacing, component styles, and
responsive breakpoints remain hardcoded in the React codebase and
require a developer to change.

This document defines Phase 2: the UI Design Engine. Its purpose is
to close the remaining hardcoding gap by introducing six new Dataverse
configuration tables and a set of React runtime modules that together
allow QDB's CRM Configuration Team to control the complete look and
feel of every form — at the global, form, tab, section, field, and
button level — entirely from Dataverse records, with zero frontend code
changes or redeployment required.

The expected business outcomes are:
  - Brand updates and theme changes deployable in minutes by the CRM
    team rather than hours by a developer.
  - Multiple product lines or regulatory form sets that carry distinct
    visual identities within a single portal codebase.
  - Enterprise-grade alignment with Microsoft Fluent Design and QDB's
    corporate branding standards.
  - Full runtime theme switching (light / dark / corporate) without
    a page reload.


═══════════════════════════════════════════════════
2. BUSINESS OBJECTIVES
═══════════════════════════════════════════════════

BO-D01: Enable the CRM Configuration Team to define and modify the
        complete visual design of any form entirely within Dataverse
        so that branding and layout changes require no frontend code
        changes or redeployment.

BO-D02: Enable QDB to maintain distinct visual identities for
        different form sets (retail banking, corporate banking,
        regulatory) by applying different themes per form definition
        from Dataverse configuration.

BO-D03: Enable portal users to experience a consistent, professional,
        enterprise-grade UI that reflects QDB corporate branding
        (fonts, colors, spacing, component styles) regardless of
        which form they are completing.

BO-D04: Enable the IT / DevOps team to operate a single frontend
        codebase that serves all design variations, eliminating
        per-form CSS overrides and reducing long-term maintenance cost.

BO-D05: Enable the CRM Configuration Team to support light-mode,
        dark-mode, and custom enterprise themes from a single
        configuration table, switchable at runtime without a page
        reload.

BO-D06: Ensure that all visual behavior enhancements (animated
        transitions, skeleton loaders, sticky action bar, collapsible
        sections) are configurable from Dataverse and are off by
        default, so the team can enable them incrementally without
        code changes.


═══════════════════════════════════════════════════
3. SUCCESS CRITERIA
═══════════════════════════════════════════════════

SC-D01: A CRM Configuration Team member can create a new theme record
        in Dataverse and see it applied to a form on the portal within
        60 seconds of the cache TTL expiry, without touching the
        frontend codebase.

SC-D02: A form with a form-level design record overrides the global
        theme with no visible flash or layout shift on load.

SC-D03: All six design configuration tables are provisioned via the
        PAC CLI provisioning script with no manual Dataverse portal
        steps required.

SC-D04: The metadata API response for GET /api/forms/:formCode/metadata
        includes a complete design payload covering theme, formDesign,
        tab styles, section styles, field styles, and button styles in
        a single round-trip.

SC-D05: The React frontend renders any layout type (single-column,
        two-column, grid, stepper/wizard, accordion, tab-based,
        card-based, inline compact) from metadata alone, with no
        layout-specific code paths in the renderer.

SC-D06: Switching between light and dark themes at runtime causes no
        full page reload and no re-fetch of form submission data.

SC-D07: Design metadata is served from the LRU cache with a hit rate
        above 95% under steady-state load, and cache invalidation via
        POST /api/admin/cache/invalidate/:formCode works correctly.


═══════════════════════════════════════════════════
4. STAKEHOLDERS
═══════════════════════════════════════════════════

| Stakeholder              | Role                  | Interest in this feature                                         |
|--------------------------|-----------------------|------------------------------------------------------------------|
| CRM Configuration Team   | Design Author         | Configure themes, layouts, and component styles in Dataverse     |
| Portal Users (customers) | End User              | Experience consistent, branded, accessible forms                 |
| QDB Product / Business   | Project Sponsor       | Brand compliance, corporate identity, customer experience quality |
| IT / DevOps              | Platform Owner        | Single codebase, no per-form CSS files, cache performance        |
| Compliance / Audit       | Governance Overseer   | Accessibility conformance (WCAG 2.1 AA) audit trail for config   |
| Maqsad AI Dev Team       | Delivery Team         | Design, build, test, and hand over the UI Design Engine          |


═══════════════════════════════════════════════════
5. SCOPE
═══════════════════════════════════════════════════

5.1 In Scope
────────────
  - Six new Dataverse configuration tables:
      qdb_theme, qdb_form_design, qdb_section_design,
      qdb_field_design, qdb_button_design, qdb_layout_grid
  - PAC CLI provisioning script for all six tables (publisher
    prefix: qdb_)
  - Extension of GET /api/forms/:formCode/metadata to include full
    design payload (theme + formDesign + per-tab/section/field styles)
  - Two new backend API endpoints:
      GET /api/themes          — list all active theme records
      GET /api/form-design/:formCode — design config for a specific form
  - New backend service: CrmDesignService (LRU-cached, mirrors
    CrmMetadataService pattern)
  - Extension of shared @dfe/shared type package with design type
    contracts (ThemeDefinition, FormDesign, SectionDesign,
    FieldDesign, ButtonDesign, LayoutGrid)
  - Five new React runtime modules:
      ThemeProvider, StyleEngine, LayoutEngine,
      ResponsiveEngine, ComponentStyleResolver
  - Updated React renderer components to consume design metadata:
      DynamicFormRenderer, TabRenderer, SectionRenderer,
      FieldRenderer, ButtonRenderer
  - Support for all eight layout types: single-column, two-column
    responsive, multi-column grid, wizard/stepper, accordion, tab-
    based, card-based, inline compact
  - Light theme, dark theme, and Corporate/QDB Banking theme
    delivered as sample Dataverse seed records and as TypeScript
    constants in the frontend
  - Runtime theme switching (light / dark) without page reload
  - Dynamic font loading from theme configuration
  - Advanced UI features: field prefix/suffix icons, floating labels,
    animated section collapse/expand, tooltip styling, progress
    indicator, sticky action bar, skeleton loaders
  - Cache invalidation endpoint for design metadata:
      POST /api/admin/cache/invalidate/:formCode
  - Unit tests for CrmDesignService, ThemeProvider, StyleEngine,
    LayoutEngine, and ComponentStyleResolver (minimum 80% coverage)
  - E2E test: Loan Application form with Corporate/QDB Banking theme
    applied end-to-end
  - Dataverse seed data script: Light, Dark, and Corporate themes
    plus a Form Design record for the Loan Application form

5.2 Out of Scope
────────────────
  - Visual drag-and-drop theme builder or design editor UI (all
    configuration is done directly in Dataverse model-driven app)
  - CSS-in-JS library replacement (Fluent UI theming API is used
    throughout; no Tailwind, Emotion, or Styled Components)
  - Multi-language / RTL layout support (Phase 1 exclusion carries
    forward)
  - Animation libraries beyond CSS transitions and Fluent UI motion
  - White-label or multi-tenant domain routing
  - Design versioning or rollback (design records are live;
    audit trail is the version history)
  - Mobile native app styling (React Native is out of scope for the
    entire engagement)
  - Third-party design token import (Figma tokens, Style Dictionary)


═══════════════════════════════════════════════════
6. FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

─────────────────────────────────────────────────────
6.1 Dataverse Configuration Tables
─────────────────────────────────────────────────────

FR-D001: The system shall provide a qdb_theme table with the following
         attributes: theme_name, theme_code (unique), primary_color,
         secondary_color, background_color, surface_color,
         text_primary_color, text_secondary_color, border_color,
         error_color, success_color, warning_color, font_family,
         base_font_size, heading_font_size, label_font_size,
         input_font_size, border_radius, shadow_style, spacing_scale,
         is_dark_mode (boolean), is_active (boolean).
         All color attributes store hex or CSS color strings.

FR-D002: The system shall provide a qdb_form_design table with the
         following attributes: form_lookup (FK to qdb_form_definition),
         theme_lookup (FK to qdb_theme), layout_type (choice:
         SingleColumn / TwoColumn / Grid / Stepper / Wizard),
         label_position (choice: Top / Left / Floating),
         section_style (choice: Card / Flat / Outlined),
         tab_style (choice: Tabs / Stepper / Accordion),
         button_style (choice: Primary / Outline / Text),
         animation_enabled (boolean), responsive_behavior (JSON),
         max_width (string), alignment (choice: Left / Center / Right),
         custom_css (multiline text), is_active (boolean).

FR-D003: The system shall provide a qdb_section_design table with the
         following attributes: section_lookup (FK to qdb_section),
         background_color, border_style, padding, margin,
         column_layout (choice: 1 / 2 / 3 / 4),
         card_style (choice: Flat / Elevated / Outlined),
         collapsible_style (choice: None / Animated / Instant),
         header_style (JSON), visibility_animation (choice: None /
         Fade / Slide).

FR-D004: The system shall provide a qdb_field_design table with the
         following attributes: field_lookup (FK to qdb_field),
         label_style (JSON: bold, size, color), input_style (choice:
         Outlined / Filled / Standard), width (choice: Full / Half /
         Custom), custom_width (string, used when width = Custom),
         height (string), placeholder_style (JSON), icon_prefix
         (string: Fluent UI icon name), icon_suffix (string),
         tooltip_style (JSON), error_style (JSON), focus_style (JSON),
         disabled_style (JSON).

FR-D005: The system shall provide a qdb_button_design table with the
         following attributes: form_lookup (FK to qdb_form_definition),
         button_type (choice: Submit / SaveDraft / Cancel),
         color (string), size (choice: Small / Medium / Large),
         border_radius (string), alignment (choice: Left / Center /
         Right / SpaceBetween), icon (string: Fluent UI icon name),
         hover_effect (choice: None / Elevate / ColorShift),
         loading_style (choice: Spinner / Dots / Pulse).

FR-D006: The system shall provide a qdb_layout_grid table with the
         following attributes: form_design_lookup (FK to
         qdb_form_design), field_lookup (FK to qdb_field),
         columns_total (integer: 1–12), span_mobile (integer: 1–12),
         span_tablet (integer: 1–12), span_desktop (integer: 1–12).

FR-D007: All six design tables shall include standard audit columns:
         created_by, created_on, modified_by, modified_on, and an
         is_active flag following the existing qdb_ entity pattern.

─────────────────────────────────────────────────────
6.2 Metadata API Extension
─────────────────────────────────────────────────────

FR-D008: The existing GET /api/forms/:formCode/metadata endpoint shall
         be extended to include a design node in its response payload
         with the following structure:
         {
           "theme": { ...ThemeDefinition },
           "formDesign": { ...FormDesign },
           "tabs": [
             {
               "tabId": "...",
               "style": { ...TabStyle },
               "sections": [
                 {
                   "sectionId": "...",
                   "style": { ...SectionDesign },
                   "fields": [
                     { "fieldId": "...", "style": { ...FieldDesign } }
                   ]
                 }
               ]
             }
           ],
           "buttons": [ { ...ButtonDesign } ],
           "layoutGrid": [ { ...LayoutGrid } ]
         }
         If no design records exist for a form, the design node shall
         contain default values derived from the active global theme
         (is_active = true, no form_lookup). The API shall never
         return null for the design node.

FR-D009: The system shall expose a new endpoint:
         GET /api/themes
         Returns an array of all active theme records (is_active = true)
         including all attributes defined in FR-D001.
         Response is cached in the LRU cache with the key "themes:all".
         Requires a valid Azure AD JWT token.

FR-D010: The system shall expose a new endpoint:
         GET /api/form-design/:formCode
         Returns the complete design configuration for a specific form
         (form design + resolved theme + section designs + field designs
         + button designs + layout grid), using the same payload shape
         as the design node in FR-D008.
         Requires a valid Azure AD JWT token.

FR-D011: The system shall expose a cache invalidation endpoint:
         POST /api/admin/cache/invalidate/:formCode
         Invalidates both the metadata cache entry and the design cache
         entry for the given formCode.
         Requires a valid Azure AD JWT token with the CRM Configuration
         Team group claim.

─────────────────────────────────────────────────────
6.3 Backend Design Service
─────────────────────────────────────────────────────

FR-D012: The system shall implement a CrmDesignService class that
         fetches design configuration from Dataverse via the existing
         CrmBaseService fetch-with-retry pattern and caches results
         in a dedicated LRU cache instance separate from the metadata
         cache.

FR-D013: CrmDesignService shall resolve the applicable theme for a
         form using the following priority order:
         1. Theme referenced by the form's qdb_form_design record.
         2. The active global theme (is_active = true, no form_lookup).
         3. A hardcoded Light theme default (TypeScript constant) if
            no Dataverse theme record is active.
         This resolution shall be deterministic and logged at debug
         level with the resolution path taken.

FR-D014: CrmDesignService shall assemble the full design payload for a
         formCode in a single service call, combining results from all
         six design tables. It shall not expose individual table fetch
         methods as public API.

─────────────────────────────────────────────────────
6.4 Shared Type Package Extension
─────────────────────────────────────────────────────

FR-D015: The @dfe/shared package shall be extended with the following
         TypeScript types: ThemeDefinition, FormDesign, SectionDesign,
         FieldDesign, ButtonDesign, LayoutGrid, DesignPayload,
         LayoutType, LabelPosition, SectionStyleType, TabStyleType,
         ButtonStyleType, InputStyleType, FieldWidthType, ButtonSizeType,
         CollapseStyleType, AnimationStyleType, HoverEffectType.
         All types must be strict (no `any`). Enums shall be TypeScript
         union types, not TypeScript enum keyword.

─────────────────────────────────────────────────────
6.5 React UI Design Engine Modules
─────────────────────────────────────────────────────

FR-D016: The system shall implement a ThemeProvider React component
         that:
         - Accepts a ThemeDefinition prop.
         - Injects Fluent UI theme tokens via FluentProvider.
         - Injects CSS custom properties on the root element for
           non-Fluent-UI consumers (colors, fonts, spacing).
         - Supports switching from light to dark theme at runtime
           without unmounting child components.
         - Loads Google Fonts (or self-hosted fonts) specified in the
           theme's font_family attribute dynamically via a <link> tag,
           only when the font changes.

FR-D017: The system shall implement a StyleEngine utility module that:
         - Accepts a DesignPayload and a component scope (form / tab /
           section / field / button).
         - Returns a resolved style object (CSSProperties) and a
           Fluent UI tokens override object for that scope.
         - Applies cascade: global theme < form design < section design
           < field design (most specific wins).
         - Never produces inline style rules for layout geometry
           (position, z-index) — those are owned by LayoutEngine.

FR-D018: The system shall implement a LayoutEngine utility module that:
         - Accepts a FormDesign and a LayoutGrid array.
         - Returns CSS Grid template strings and per-field grid span
           classes or style properties for each field.
         - Supports all eight layout types: SingleColumn, TwoColumn,
           Grid, Stepper, Wizard, Accordion, TabBased, InlineCompact.
         - Produces responsive output using the breakpoints in
           LayoutGrid (mobile / tablet / desktop spans).

FR-D019: The system shall implement a ResponsiveEngine utility module
         that:
         - Subscribes to window resize events via ResizeObserver.
         - Exposes the current breakpoint (mobile / tablet / desktop)
           as a React context value.
         - Does not cause full re-renders of form content on resize;
           only updates the breakpoint context value.

FR-D020: The system shall implement a ComponentStyleResolver utility
         that:
         - Accepts a field's FieldDesign record and the active
           ThemeDefinition.
         - Returns the Fluent UI component props override for that
           field's input component (e.g., appearance prop for Input,
           tokens for Dropdown).
         - Is a pure function with no side effects.

─────────────────────────────────────────────────────
6.6 Updated Renderer Components
─────────────────────────────────────────────────────

FR-D021: DynamicFormRenderer shall be updated to:
         - Fetch the design payload from the metadata API (already
           extended per FR-D008).
         - Wrap the form tree in ThemeProvider with the resolved theme.
         - Pass the DesignPayload down via React context (not prop
           drilling).
         - Render a skeleton loader (configurable per formDesign) while
           design metadata is loading.
         - Apply sticky action bar positioning when enabled in formDesign.

FR-D022: TabRenderer shall be updated to:
         - Read tab-level style from the DesignPayload context.
         - Render tab navigation using the tab_style from formDesign
           (Tabs / Stepper / Accordion), switching between Fluent UI
           TabList, a custom Stepper component, or Accordion.
         - Apply animated transitions between tabs when
           animation_enabled is true in formDesign.

FR-D023: SectionRenderer shall be updated to:
         - Read section-level style from the DesignPayload context.
         - Apply background_color, border_style, padding, and margin
           from SectionDesign.
         - Render the section as Card (Fluent UI Card), Flat (div with
           styles), or Outlined (div with border).
         - Animate section collapse/expand using CSS transitions when
           collapsible_style = Animated.
         - Render a visibility_animation (Fade / Slide) when a section
           becomes visible via the rule engine.

FR-D024: FieldRenderer shall be updated to:
         - Read field-level style from the DesignPayload context via
           ComponentStyleResolver.
         - Apply label style (bold, size, color) from FieldDesign.
         - Apply input appearance (Outlined / Filled / Standard) to the
           Fluent UI input component for that field type.
         - Render prefix and suffix icons when configured in FieldDesign.
         - Apply floating label behavior when label_position = Floating
           in formDesign.
         - Apply error_style and focus_style from FieldDesign to
           override Fluent UI defaults.
         - Apply disabled_style when the field is set to read-only by
           the rule engine.
         - Render a tooltip icon next to the label when tooltip_style
           is configured.

FR-D025: ButtonRenderer shall be updated to:
         - Read ButtonDesign for each button_type (Submit / SaveDraft /
           Cancel) from the DesignPayload context.
         - Apply color, size, border_radius, icon, and hover_effect.
         - Render the loading indicator using loading_style when a
           submission or draft-save is in progress.
         - Apply alignment from ButtonDesign to the button container.

─────────────────────────────────────────────────────
6.7 Layout Types
─────────────────────────────────────────────────────

FR-D026: SingleColumn — all fields render in a single full-width
         column. Default when no formDesign record exists.

FR-D027: TwoColumn — fields render in two equal columns by default.
         Fields with width = Full in FieldDesign span both columns.
         Collapses to single column on mobile breakpoint.

FR-D028: Grid — fields render in a CSS grid. Column span per field
         is driven by qdb_layout_grid records. Responsive per
         span_mobile, span_tablet, span_desktop.

FR-D029: Stepper — tabs render as a numbered step indicator at the top.
         Only one tab/section is visible at a time. Next / Back
         navigation replaces tab clicks. Progress percentage shown.

FR-D030: Wizard — same as Stepper with an additional summary step at
         the end showing all entered values before final submission.

FR-D031: Accordion — sections render as vertically stacked accordion
         panels. Only one section expanded at a time by default
         (configurable per section_design).

FR-D032: TabBased — existing tab rendering behavior preserved; this is
         the Phase 1 default. tab_style = Tabs activates this.

FR-D033: InlineCompact — fields render side by side in a dense grid
         with reduced padding and smaller font size. Optimised for
         data-entry forms used by internal staff.

─────────────────────────────────────────────────────
6.8 Theming Features
─────────────────────────────────────────────────────

FR-D034: The system shall support a Light theme as the default global
         theme. It shall be seeded as a Dataverse record and also
         exist as a TypeScript constant fallback (FR-D013 rule 3).

FR-D035: The system shall support a Dark theme. When is_dark_mode =
         true, the ThemeProvider shall override Fluent UI's dark theme
         tokens and inject dark-mode CSS custom properties.

FR-D036: The system shall support a Corporate/QDB Banking theme using
         QDB's brand colors, fonts, and spacing scale, seeded as a
         Dataverse record.

FR-D037: The portal user shall be able to toggle between light and dark
         mode at runtime via a theme-switcher control rendered by
         DynamicFormRenderer. The toggle state shall be persisted in
         localStorage under the key "dfe:theme-preference" and
         respected on subsequent sessions.

FR-D038: When a theme's font_family attribute specifies a Google Font
         or custom font URL, ThemeProvider shall load it dynamically
         via a programmatically created <link> element. Fonts loaded
         in a previous session shall be served from the browser cache.

─────────────────────────────────────────────────────
6.9 Advanced UI Features
─────────────────────────────────────────────────────

FR-D039: Field prefix and suffix icons shall be rendered using Fluent
         UI icon components. Icon names are stored as strings in
         FieldDesign (icon_prefix, icon_suffix) and resolved at runtime
         against the @fluentui/react-icons bundle.

FR-D040: Floating label behavior shall be implemented using CSS
         transitions. The label shall animate from placeholder position
         to above-field position when the field receives focus or has a
         value. This shall not modify the Fluent UI Input component's
         DOM structure.

FR-D041: Animated section collapse/expand shall use CSS max-height
         transitions. The animation duration and easing shall be
         derived from the active theme's shadow_style attribute (a
         future extension point). Default: 200ms ease-in-out.

FR-D042: Tooltip styling shall use Fluent UI Tooltip component. The
         tooltip content, icon, and position shall be configured in
         FieldDesign.tooltip_style (JSON).

FR-D043: The progress indicator (for Stepper and Wizard layout types)
         shall display the current step number, total steps, and a
         percentage progress bar styled using theme colors.

FR-D044: The sticky action bar (Save Draft / Submit buttons) shall be
         rendered as a fixed-position footer when enabled in formDesign.
         It shall respect the form's max_width and alignment settings.

FR-D045: Skeleton loaders shall be rendered for the form shell (tabs,
         sections, field placeholders) while the metadata API response
         is in flight. The skeleton shape shall approximate the
         expected layout based on the layout_type already known from
         a previous load or from the URL parameter.

─────────────────────────────────────────────────────
6.10 Performance Requirements
─────────────────────────────────────────────────────

FR-D046: Design metadata (theme + form design + all sub-designs) shall
         be fetched in a single Dataverse query batch or a maximum of
         three sequential queries per formCode. It shall not issue one
         query per field or per section.

FR-D047: The LRU cache for design metadata shall have a maximum of 500
         entries and a TTL of 5 minutes (configurable via environment
         variable DESIGN_CACHE_TTL_MS). It shall be a separate cache
         instance from the metadata cache.

FR-D048: StyleEngine.resolve() shall be memoized per (formCode, scope,
         entityId) tuple using useMemo in the consuming component.
         Re-renders caused by unrelated form state changes shall not
         re-invoke StyleEngine.

FR-D049: ThemeProvider shall not re-render its children when only a
         non-visual prop (e.g., a logging callback) changes. It shall
         use React.memo and compare theme tokens by value equality.


═══════════════════════════════════════════════════
7. NON-FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

NFR-D001: Performance — The extended GET /api/forms/:formCode/metadata
          endpoint (including design payload) shall return within 500 ms
          at the 95th percentile under 100 concurrent users, consistent
          with the Phase 1 NFR-001 SLA.

NFR-D002: Performance — Runtime theme switching (light ↔ dark) shall
          complete within 100 ms measured from toggle interaction to
          first paint of updated styles, with no layout shift.

NFR-D003: Accessibility — All layout types and advanced UI features
          shall conform to WCAG 2.1 Level AA. Animated transitions shall
          respect the prefers-reduced-motion media query by disabling
          all CSS transitions when the user has requested reduced motion.

NFR-D004: Browser Support — UI Design Engine modules shall support the
          same browser matrix as Phase 1: latest two versions of Chrome,
          Edge, Firefox, and Safari.

NFR-D005: Security — The custom_css attribute (FR-D002) shall be
          sanitised server-side before being returned in the API
          response. CSS containing url() with external domains not
          in the QDB-approved list, or CSS containing expression()
          calls, shall be stripped and a warning logged.

NFR-D006: Security — Design API endpoints (FR-D009, FR-D010, FR-D011)
          require the same Azure AD JWT validation as all Phase 1
          endpoints. No design endpoint is unauthenticated.

NFR-D007: Maintainability — The five new React modules (ThemeProvider,
          StyleEngine, LayoutEngine, ResponsiveEngine,
          ComponentStyleResolver) shall each be under 400 lines and
          shall have a single, named export per module. No barrel files
          that re-export everything from a directory.

NFR-D008: Observability — CrmDesignService shall log cache hits, cache
          misses, Dataverse query durations, and theme resolution paths
          using the existing pino structured logger with the existing
          correlation_id propagation pattern.

NFR-D009: Testability — All five React design modules shall have unit
          tests (Vitest) covering: default theme fallback, cascade
          override precedence, responsive breakpoint switching, and
          memoization correctness. Minimum 80% line coverage.

NFR-D010: Compliance — The audit log (FR-044 from Phase 1 BRD) shall
          be extended to record design configuration change events:
          when a qdb_theme, qdb_form_design, or qdb_field_design record
          is modified by an admin, an audit entry shall be written.


═══════════════════════════════════════════════════
8. USER STORIES
═══════════════════════════════════════════════════

US-D01
  As a CRM Configuration Team member, I want to create a theme record
  in Dataverse with brand colors and fonts so that the portal
  automatically reflects QDB's corporate identity without a code
  change.
  Priority: Must Have
  Acceptance Criteria:
    Given a qdb_theme record is created in Dataverse with
      primary_color = "#003366", font_family = "QDB Sans",
      and is_active = true
    When a portal user opens any form
    Then the form renders with the configured primary color and
      font within one cache TTL period (5 minutes).

US-D02
  As a CRM Configuration Team member, I want to assign a specific
  theme to a specific form so that that form has a distinct visual
  identity from other forms on the portal.
  Priority: Must Have
  Acceptance Criteria:
    Given a qdb_form_design record links the Loan Application form
      to a "Corporate Banking" theme
    When a portal user opens the Loan Application form
    Then the Corporate Banking theme is applied, while other forms
      continue to use the global active theme.

US-D03
  As a CRM Configuration Team member, I want to configure the layout
  type of a form (e.g., TwoColumn or Stepper) from Dataverse so that
  the form renders in the chosen layout without any code deployment.
  Priority: Must Have
  Acceptance Criteria:
    Given a qdb_form_design record sets layout_type = "TwoColumn"
      for the KYC form
    When a portal user opens the KYC form on a desktop browser
    Then fields render in two equal columns, with full-width fields
      spanning both columns.

US-D04
  As a CRM Configuration Team member, I want to configure individual
  field styles (label bold, input style, width, icon) from Dataverse
  so that critical fields are visually distinguished without CSS
  changes.
  Priority: Should Have
  Acceptance Criteria:
    Given a qdb_field_design record sets input_style = "Filled"
      and icon_prefix = "PersonRegular" on the Full Name field
    When a portal user views the form
    Then the Full Name field shows a filled input variant with a
      person icon prefix, matching the Fluent UI Filled appearance.

US-D05
  As a portal user, I want to switch between light and dark mode using
  a toggle on the form page so that I can read the form comfortably
  in low-light conditions.
  Priority: Should Have
  Acceptance Criteria:
    Given the dark theme is active in Dataverse
    When a portal user clicks the theme toggle
    Then the form switches to dark mode within 100 ms without a
      page reload, and the preference is remembered on next visit.

US-D06
  As a portal user, I want to see a loading skeleton while the form
  design is fetching so that there is no blank screen flash on
  initial load.
  Priority: Should Have
  Acceptance Criteria:
    Given the metadata API takes more than 200 ms to respond
    When a portal user navigates to a form URL
    Then a skeleton layout approximating the form structure is
      displayed until the API response arrives.

US-D07
  As a CRM Configuration Team member, I want to configure the Submit,
  Save Draft, and Cancel buttons per form (color, size, icon, loading
  style) from Dataverse so that button appearance matches the form's
  theme.
  Priority: Should Have
  Acceptance Criteria:
    Given a qdb_button_design record sets Submit button color to
      "#003366", size to "Large", and loading_style to "Spinner"
    When a portal user clicks Submit
    Then the button displays a spinner in the configured color while
      the submission is in progress.

US-D08
  As an IT / DevOps team member, I want a cache invalidation endpoint
  so that I can force-refresh design metadata after a Dataverse design
  record is changed without restarting the backend service.
  Priority: Must Have
  Acceptance Criteria:
    Given a qdb_theme record has been updated in Dataverse
    When an admin calls POST /api/admin/cache/invalidate/:formCode
    Then the next request for that formCode fetches fresh design
      data from Dataverse, and the old cached data is discarded.

US-D09
  As a CRM Configuration Team member, I want to configure section
  appearance (Card / Flat / Outlined, collapse animation) from
  Dataverse so that sections are visually grouped in a way that
  matches the form's purpose.
  Priority: Should Have
  Acceptance Criteria:
    Given a qdb_section_design record sets card_style = "Elevated"
      and collapsible_style = "Animated" for the Financial Details
      section
    When a portal user collapses or expands that section
    Then the section animates smoothly using CSS transitions, and
      its card appearance uses Fluent UI elevated surface styling.

US-D10
  As a portal user completing a Stepper/Wizard form, I want to see a
  progress indicator showing which step I am on and how many remain
  so that I know how much of the form is left.
  Priority: Should Have
  Acceptance Criteria:
    Given the Loan Application form uses layout_type = "Stepper"
    When a portal user is on step 3 of 5
    Then a progress bar shows 60% completion and the step labels
      are shown below the bar.


═══════════════════════════════════════════════════
9. DATA REQUIREMENTS
═══════════════════════════════════════════════════

| Entity              | Est. Volume (Year 1) | Retention   | Sensitivity |
|---------------------|----------------------|-------------|-------------|
| qdb_theme           | 10 records           | Indefinite  | Internal    |
| qdb_form_design     | 50 records           | Indefinite  | Internal    |
| qdb_section_design  | 500 records          | Indefinite  | Internal    |
| qdb_field_design    | 5,000 records        | Indefinite  | Internal    |
| qdb_button_design   | 150 records          | Indefinite  | Internal    |
| qdb_layout_grid     | 10,000 records       | Indefinite  | Internal    |

All design records carry standard audit columns (created_by,
created_on, modified_by, modified_on). No PII is stored in design
tables. All data remains in the Qatar Azure region per C-005 of the
Phase 1 BRD.


═══════════════════════════════════════════════════
10. INTEGRATION DEPENDENCIES
═══════════════════════════════════════════════════

| System                    | Integration Type     | Data Exchanged                            | Direction              |
|---------------------------|----------------------|-------------------------------------------|------------------------|
| Microsoft Dataverse       | OData Web API        | Design config records (all 6 tables)      | Inbound to backend     |
| @fluentui/react-components| npm package (already | Theme tokens, component appearance props  | Internal (frontend)    |
|                           | installed)           |                                           |                        |
| @fluentui/react-icons     | npm package          | Icon components resolved by name string   | Internal (frontend)    |
| Google Fonts / CDN        | HTTP <link> load     | Font files for dynamic font loading       | Outbound from frontend |
| Existing LRU cache        | In-process           | Shared cache infrastructure; new cache    | Internal (backend)     |
|                           |                      | instance for design metadata              |                        |
| Existing CrmBaseService   | Class inheritance    | Fetch-with-retry, auth header injection   | Internal (backend)     |
| Azure AD JWT middleware    | Express middleware   | Token validation for new design endpoints | Internal (backend)     |


═══════════════════════════════════════════════════
11. ASSUMPTIONS
═══════════════════════════════════════════════════

A-D001: The Dataverse environment (org5869857f.crm4.dynamics.com)
        already has the qdb_ publisher registered. The six new tables
        will be created under the existing publisher prefix.

A-D002: The @fluentui/react-components package is already installed and
        in use. No additional Fluent UI packages beyond
        @fluentui/react-icons are required.

A-D003: Google Fonts (or a QDB-approved self-hosted font CDN) is
        reachable from the user's browser. If not, ThemeProvider falls
        back to the system font stack.

A-D004: The custom_css field in qdb_form_design is an escape hatch for
        advanced CRM admins. It is not expected to be used in normal
        operations. Its content is sanitised server-side (NFR-D005).

A-D005: QDB will provide brand color codes and font names for the
        Corporate theme seed record. Placeholder values will be used
        during development and replaced before UAT.

A-D006: The Phase 1 LRU cache implementation (lru-cache npm package)
        is the approved pattern. The design cache will use the same
        package with a separate instance.

A-D007: No new npm dependencies requiring security approval are
        introduced beyond @fluentui/react-icons (already in the
        Fluent UI ecosystem approved by Phase 1 architecture).


═══════════════════════════════════════════════════
12. CONSTRAINTS
═══════════════════════════════════════════════════

C-D001: The frontend must remain React + TypeScript + Vite + Fluent UI.
        No CSS-in-JS library (Styled Components, Emotion, vanilla-
        extract) may be introduced. All theming goes through Fluent UI
        tokens and CSS custom properties.

C-D002: The backend must remain Express + TypeScript. CrmDesignService
        must follow the exact class pattern of CrmMetadataService
        (CrmBaseService subclass, LRU cache injected via constructor,
        no static state).

C-D003: All Dataverse access for design metadata must go through the
        Dataverse Web API (OData). No direct SQL. No Azure Table
        Storage as a design config store.

C-D004: The custom_css attribute must never be injected as a raw
        <style> tag without server-side sanitisation. It must pass
        through a CSS sanitiser (postcss or similar) before delivery.

C-D005: Animated transitions must respect prefers-reduced-motion.
        No animation shall play unconditionally (NFR-D003).

C-D006: The UI Design Engine must not break or regress any Phase 1
        functionality. All Phase 1 unit and E2E tests must continue
        to pass after this feature is merged.


═══════════════════════════════════════════════════
13. RISKS AND OPEN QUESTIONS
═══════════════════════════════════════════════════

| Risk / Question                                                               | Impact | Owner             | Resolution Needed By      |
|-------------------------------------------------------------------------------|--------|-------------------|---------------------------|
| Custom CSS injection risk if sanitiser is incomplete                          | High   | Backend Dev       | Architecture phase        |
| Google Fonts CDN blocked in Qatar network — fallback needed                   | Medium | QDB IT            | Before build start        |
| QDB brand colors and font names not yet provided for Corporate theme seed     | Medium | QDB Product       | Before QA phase           |
| @fluentui/react-icons bundle size impact — tree-shaking verification needed   | Medium | Frontend Dev      | Architecture phase        |
| Fluent UI FluentProvider nesting (global theme + form theme) needs testing   | Medium | Frontend Dev      | Architecture phase        |
| prefers-reduced-motion support across all layout types needs explicit testing | Low    | QA                | QA phase                  |
| Cache TTL for design metadata — 5 min may be too long after a config change  | Low    | DevOps / CRM Team | Architecture phase        |
| qdb_layout_grid volume (10,000 records) — OData query performance at scale   | Medium | Backend Dev       | Architecture phase        |


═══════════════════════════════════════════════════
14. REQUIREMENTS TRACEABILITY MATRIX
═══════════════════════════════════════════════════

| User Story | Functional Requirements                              | Business Objective | Status  |
|------------|------------------------------------------------------|--------------------|---------|
| US-D01     | FR-D001, FR-D007, FR-D013, FR-D016, FR-D034–D036    | BO-D01, BO-D03     | Defined |
| US-D02     | FR-D002, FR-D008, FR-D013, FR-D014                  | BO-D02             | Defined |
| US-D03     | FR-D002, FR-D018, FR-D026–D033                      | BO-D01, BO-D04     | Defined |
| US-D04     | FR-D004, FR-D020, FR-D024                           | BO-D01, BO-D03     | Defined |
| US-D05     | FR-D035, FR-D037, FR-D016                           | BO-D05             | Defined |
| US-D06     | FR-D021, FR-D045                                    | BO-D03             | Defined |
| US-D07     | FR-D005, FR-D025                                    | BO-D01, BO-D03     | Defined |
| US-D08     | FR-D011, FR-D047                                    | BO-D04             | Defined |
| US-D09     | FR-D003, FR-D023, FR-D031, FR-D041                  | BO-D01, BO-D06     | Defined |
| US-D10     | FR-D029, FR-D030, FR-D043                           | BO-D03, BO-D06     | Defined |


═══════════════════════════════════════════════════
15. GLOSSARY (additions to Phase 1 glossary)
═══════════════════════════════════════════════════

DesignPayload     The complete design configuration object returned by
                  the metadata API, covering theme, form design, tab,
                  section, field, button, and layout grid entries.

ThemeDefinition   The TypeScript type and Dataverse record that holds
                  all color, font, spacing, and mode attributes for a
                  named theme.

StyleEngine       The React utility module that resolves the cascade of
                  design overrides (global → form → section → field).

LayoutEngine      The React utility module that translates FormDesign
                  and LayoutGrid records into CSS Grid template strings
                  and per-field span values.

ResponsiveEngine  The React utility module that tracks the current
                  responsive breakpoint (mobile / tablet / desktop)
                  via ResizeObserver and exposes it as React context.

ComponentStyle-   The pure-function utility that maps a FieldDesign
Resolver          record to Fluent UI component props overrides.

LRU Cache         Least Recently Used in-memory cache. Two separate
                  instances: one for form metadata, one for design
                  metadata.

Fluent UI Tokens  Design token API in @fluentui/react-components used
                  to override colors, typography, and spacing within
                  FluentProvider.

Corporate Theme   The QDB Banking brand theme: primary color #003366
                  (placeholder), QDB-specified font, and banking-
                  appropriate spacing and border radius.

Skeleton Loader   A placeholder UI that approximates the shape of the
                  expected content while data is loading, preventing
                  a blank-screen flash.


═══════════════════════════════════════════════════
16. APPROVAL
═══════════════════════════════════════════════════

| Role              | Name              | Decision | Date       |
|-------------------|-------------------|----------|------------|
| CEO               | Maqsad AI — CEO   | PENDING  |            |
| Requestor (QDB)   | Pending           | PENDING  |            |
| BA                | Maqsad AI — BA    | SUBMITTED| 2026-05-17 |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
