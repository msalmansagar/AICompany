═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-STYLE-001 — Advanced Visual Styling & Full CSS Control
                for the Dynamic Form Engine
Client:         Qatar Development Bank (QDB)
Product:        Dynamic Form Engine (DFE) — Designer, Frontend Runtime,
                Backend API, Shared Types, CRM Plugins
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-06-28
Version:        1.0
Status:         DRAFT — Pending CEO Approval
Prior phases:   DFE-ADD-001/002 (APPROVED WITH CONDITIONS)
                DFE-RC-001 (DELIVERED)
                DFE-i18n-001 (CEO APPROVED WITH CONDITIONS)
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
═══════════════════════════════════════════════════

The Dynamic Form Engine (DFE) is live at QDB. Its runtime already
contains a fully specified design system — ThemeDefinition, FormDesign,
SectionDesign, FieldDesign, ButtonDesign, and LayoutGrid — all of which
are typed in shared/src/types/design.types.ts and rendered correctly by
the StyleEngine and ThemeProvider on the Next.js portal and by the on-
premises qdb_form_runtime.html web resource.

The problem is that the designer web resource — the tool that QDB form
administrators use to build and publish forms — exposes only twelve of
these design controls. It has a single Theme Editor screen that surfaces
three colours, two typography fields, two shape/spacing fields, three
toggle groups, and a raw CSS textarea. Everything else in the design
system is effectively dark: it exists in code and in Dataverse schema
partially, but form administrators cannot reach it.

This engagement fills that gap completely. It surfaces the full design
system in the designer through tabbed property panels on fields,
sections, and buttons; it extends the underlying Dataverse schema to
persist all new properties; it ensures that every styling change flows
through the render cache so both the portal and the on-premises CRM
runtime see the same output; and it enforces WCAG 2.1 AA accessibility
constraints at the point of authoring rather than after publication.

The expected business outcome is that a QDB form administrator can apply
QDB's full corporate visual identity to any form — including per-field
widths, per-section card styles, per-button colours and sizes,
responsive breakpoint behaviour, and dark-mode theming — without writing
a single line of code or raising a developer change request. The
engagement is structured in three delivery tiers. Tiers 1 and 2 are
within scope for this engagement. Tier 3 (conditional styling, named
presets, DXP token integration) is formally deferred pending resolution
of open questions.


2. BUSINESS OBJECTIVES
═══════════════════════════════════════════════════

BO-001: Enable QDB form administrators to configure all visual styling
        properties (theme, layout, sections, fields, and buttons) for any
        form from within the designer web resource without a developer
        code change, so that the time from a brand guideline update to a
        re-styled published form is reduced from weeks to under one
        working day.

BO-002: Enable QDB's brand team to apply and maintain QDB's corporate
        visual identity — including the full approved colour palette,
        typography scale, and component styles — consistently across all
        DFE-rendered forms, so that all published forms pass QDB internal
        brand compliance reviews without manual remediation.

BO-003: Enable QDB form designers to configure responsive grid layouts
        per field (mobile, tablet, and desktop breakpoints) so that the
        same form definition serves all device types without maintaining
        separate form definitions per device.

BO-004: Ensure that every styling change saved in the designer propagates
        automatically to both the cloud portal (Next.js) and the on-
        premises CRM form runtime (qdb_form_runtime.html) without
        requiring separate configuration steps, so that portal users and
        CRM relationship managers see identically styled forms.

BO-005: Enable QDB's compliance team to verify that all published forms
        meet WCAG 2.1 Level AA colour contrast requirements at the point
        of authoring, so that QDB is not exposed to accessibility non-
        compliance risk under applicable Qatar e-government standards.

BO-006: Retire the divergence between the designer's internal
        DesignerStyleModel type and the shared DesignPayload type
        contract, so that the design system has a single authoritative
        type definition maintained in one place.


3. STAKEHOLDERS
═══════════════════════════════════════════════════

| Stakeholder                     | Role                        | Interest in this project                                                                |
|---------------------------------|-----------------------------|-----------------------------------------------------------------------------------------|
| QDB Form Administrators         | Primary users               | Author complete form styling without developer help                                     |
| QDB Brand / Marketing Team      | Secondary users             | Ensure all published forms comply with the QDB visual identity guidelines               |
| QDB IT Director                 | Sign-off authority          | Dataverse schema changes, CRM solution deployment, security review, font domain policy  |
| QDB Compliance Team             | Review authority            | Accessibility compliance, WCAG 2.1 AA verification before go-live                      |
| QDB Relationship Managers       | Indirect beneficiaries      | Use forms that look professionally branded and are easy to use on any device            |
| QDB Portal End Users            | Indirect beneficiaries      | Submit forms that are accessible and visually consistent with QDB brand                 |
| Maqsad AI — Business Analyst    | Requirements owner          | Produces and maintains this document                                                    |
| Maqsad AI — Architect           | Solution design             | Phase 3 architecture for Tier 1, 2, and deferred Tier 3                                |
| Maqsad AI — CRM Developer       | Delivery                    | Dataverse schema extensions, solution packaging, on-prem runtime styling                |
| Maqsad AI — Frontend Developer  | Delivery                    | Designer Style tab panels, StyleEngine memoization, WCAG contrast component            |
| Maqsad AI — Backend Developer   | Delivery                    | Render cache assembly extension to include full DesignPayload                           |
| Maqsad AI — Code Reviewer       | Quality gate                | Code review after every implementation phase before QA                                  |
| Maqsad AI — QA                  | Verification                | Test strategy, visual regression, RTL regression, accessibility checks                  |
| Maqsad AI — Auditor             | Governance                  | Phase 6 security and CSS injection audit                                                |
| DXP-P1-003 Team                 | External dependency (Tier 3)| Token contract definition required for DXP integration (deferred)                      |


4. SCOPE
═══════════════════════════════════════════════════

4.1 IN SCOPE
────────────────────────────────────────────────────

TIER 1 — Designer UI work only (runtime already renders; no schema
changes needed beyond what is confirmed in Section 11):

  - Extended Theme Editor: expose all ThemeDefinition and FormDesign
    fields not currently surfaced in the designer
  - Per-Section Style tab: surface SectionDesign on the Section
    Properties Panel
  - Per-Field Style tab: surface FieldDesign on the Field Properties
    Panel
  - Per-Button Style tab: surface ButtonDesign for Submit, SaveDraft,
    and Cancel buttons
  - Responsive Grid Controls: per-field LayoutGrid breakpoint spans
    (mobile / tablet / desktop)

TIER 2 — Persistence and schema extensions:

  - Scoped CSS class names per field and per section (cssClassName)
    with autocomplete in the Custom CSS textarea
  - Full ThemeDefinition colour palette in the Theme Editor (secondary,
    surface, text-primary, text-secondary, border, error, success,
    warning colours)
  - Dark-mode authoring toggle in the Theme Editor
  - fontUrl field in the Theme Editor (web font CDN URL)
  - Heading, label, and input font size controls
  - ShadowStyle and SpacingScale controls
  - FormDesign extras: layoutType, alignment, maxWidth, stickyActionBar,
    skeletonLoaderEnabled, animationEnabled, sectionStyle
  - Dataverse schema extensions for all new fields on qdb_theme,
    qdb_form_design, qdb_section_design, qdb_field_design,
    qdb_button_design, and a new qdb_layout_grid entity
  - DesignerStyleModel deprecation: replace with direct use of the
    shared DesignPayload types

CROSS-CUTTING CONCERNS (apply across both tiers):

  - Render cache (DFE-RC-001): include full DesignPayload in the cached
    JSON; invalidate cache on style save
  - On-prem parity: qdb_form_runtime.html renders all styling from the
    DesignPayload identically to the Next.js portal
  - RTL/Arabic safety: all directional layout controls emit CSS logical
    properties (padding-inline-start, margin-inline-end)
  - WCAG 2.1 AA enforcement: contrast ratio indicator and blocking rule
    on colour pickers
  - Backward compatibility: all existing published forms receive default
    DesignPayload values; no visual change on first deploy
  - StyleEngine memoization: resolveField and resolveSection must not
    re-resolve on every render for an unchanged DesignPayload

4.2 OUT OF SCOPE
────────────────────────────────────────────────────

  - Custom font file hosting: uploading font binary files to
    SharePoint or Dataverse blob. fontUrl must reference a publicly
    accessible CDN URL only
  - Brand Kit (logo, banner, favicon): upload, storage, and runtime
    injection of binary brand assets. Deferred to a follow-on
    engagement (see 4.3) due to unresolved blob storage questions
  - Live form preview iframe inside the designer showing the full
    rendered form with applied styles. The existing LivePreviewMiniature
    will be extended but a full-page iframe preview is not in scope
  - A/B testing of different themes on the same form
  - Print/PDF-specific styling and print stylesheet generation
  - Email-safe CSS generation for confirmation message templates
  - Accessibility auto-remediation: the system warns on contrast
    failures; it does not automatically fix or suggest replacements
  - CRM-native UI theme overrides outside the DFE scope
  - White-label or multi-tenant theme row-level security isolation
    beyond the existing access policy model
  - Dynamics 365 F&O or any non-DFE portal integration
  - Any Tier 3 features listed below (see 4.3)

4.3 DEFERRED (Tier 3 — gated on Open Question resolution)
────────────────────────────────────────────────────

The following features are acknowledged as valuable but cannot be
scoped or estimated until the corresponding open questions are resolved.
They will be taken up in a follow-on engagement after OQ resolution.

  - Conditional/rule-driven styling: extending business rule actions
    with apply_style and add_class operations. Blocked on OQ-001 and
    OQ-002 (schema versioning approval and confirmed use cases)
  - Named Theme Presets: save/load multiple named themes per tenant
    with system-provided starter presets. Blocked on OQ-003 (preset
    ownership and approval model)
  - DXP-P1-003 Token Integration: consume DXP central design tokens as
    the CSS variable source. Blocked on OQ-004 (DXP-P1-003 go-live
    status and token contract finalization)
  - Brand Kit (logo, banner, favicon): blocked on OQ-005 (binary asset
    storage decision)


5. FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

Requirements are numbered FR-001 onwards. Each is atomic and testable.
They are grouped by functional area. Traceability to Business Objectives
is noted in square brackets.

────────────────────────────────────────────────────
GROUP A: EXTENDED THEME EDITOR [BO-001, BO-002, BO-005]
────────────────────────────────────────────────────

FR-001: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.secondaryColor.

FR-002: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.surfaceColor.

FR-003: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.textPrimaryColor.

FR-004: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.textSecondaryColor.

FR-005: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.borderColor.

FR-006: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.errorColor.

FR-007: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.successColor.

FR-008: The designer Theme Editor SHALL expose a colour picker for
        ThemeDefinition.warningColor.

FR-009: The designer Theme Editor SHALL expose a text input for
        ThemeDefinition.fontUrl, accepting a full HTTPS URL to a web
        font stylesheet.

FR-010: The designer Theme Editor SHALL expose a numeric input for
        ThemeDefinition.headingFontSize in pixel units.

FR-011: The designer Theme Editor SHALL expose a numeric input for
        ThemeDefinition.labelFontSize in pixel units.

FR-012: The designer Theme Editor SHALL expose a numeric input for
        ThemeDefinition.inputFontSize in pixel units.

FR-013: The designer Theme Editor SHALL expose a toggle group for
        ThemeDefinition.shadowStyle with options: None, Subtle, Strong.

FR-014: The designer Theme Editor SHALL expose a toggle group for
        ThemeDefinition.spacingScale with options: Compact, Normal,
        Comfortable.

FR-015: The designer Theme Editor SHALL expose a boolean toggle for
        ThemeDefinition.isDarkMode, labelled "Dark Mode".

FR-016: The designer Theme Editor SHALL expose a dropdown or toggle
        group for FormDesign.layoutType with all eight values defined
        in the LayoutType union type: SingleColumn, TwoColumn, Grid,
        Stepper, Wizard, Accordion, TabBased, InlineCompact.

FR-017: The designer Theme Editor SHALL expose a toggle group for
        FormDesign.alignment with options: Left, Center, Right.

FR-018: The designer Theme Editor SHALL expose a text input for
        FormDesign.maxWidth, accepting a CSS length value
        (e.g., "960px", "100%").

FR-019: The designer Theme Editor SHALL expose a toggle group for
        FormDesign.sectionStyle with options: Card, Flat, Outlined.

FR-020: The designer Theme Editor SHALL expose a boolean toggle for
        FormDesign.animationEnabled, labelled "Enable Animations".

FR-021: The designer Theme Editor SHALL expose a boolean toggle for
        FormDesign.stickyActionBar, labelled "Sticky Action Bar".

FR-022: The designer Theme Editor SHALL expose a boolean toggle for
        FormDesign.skeletonLoaderEnabled, labelled "Skeleton Loader".

FR-023: The Theme Editor live preview miniature SHALL update in real
        time to reflect changes to primaryColor, secondaryColor,
        backgroundColor, surfaceColor, fontFamily, baseFontSize,
        borderRadius, isDarkMode, and shadowStyle as the user edits
        them, without requiring a save action.

FR-024: The designer SHALL persist all extended ThemeDefinition and
        FormDesign fields to the relevant Dataverse records
        (qdb_theme and qdb_form_design) when the user triggers the Save
        action in the Theme Editor.

────────────────────────────────────────────────────
GROUP B: WCAG 2.1 COLOUR CONTRAST ENFORCEMENT [BO-005]
────────────────────────────────────────────────────

FR-025: Each colour picker control in the designer SHALL display a
        real-time WCAG 2.1 contrast ratio indicator that shows the
        calculated contrast ratio between the selected colour and its
        semantically paired counterground colour:
          - primaryColor paired against backgroundColor
          - textPrimaryColor paired against backgroundColor
          - textSecondaryColor paired against backgroundColor
          - errorColor paired against backgroundColor
          - successColor paired against backgroundColor
          - warningColor paired against backgroundColor
          - ButtonDesign.color paired against the button's inferred
            text colour (white for dark buttons, primaryColor for light
            buttons)

FR-026: When a colour pair's WCAG 2.1 contrast ratio falls below 4.5:1,
        the designer SHALL display a visible warning indicator adjacent
        to the colour picker labelled with the calculated ratio and the
        text "Below AA normal text requirement (4.5:1)".

FR-027: When a colour pair's WCAG 2.1 contrast ratio falls below 3.0:1,
        the designer SHALL display a blocking error indicator adjacent
        to the colour picker labelled with the calculated ratio and the
        text "Below AA large text minimum (3:1) — unusable".

FR-028: The designer SHALL prevent a form from being published when any
        configured colour pair has a contrast ratio below 3.0:1. The
        publish validation screen SHALL list every offending colour pair
        by name and calculated ratio.

FR-029: The designer SHALL allow a form to be published when a colour
        pair has a contrast ratio between 3.0:1 and 4.5:1 (warning
        range only), but SHALL require the form administrator to
        acknowledge the specific warnings via an explicit confirmation
        dialog before publication proceeds.

FR-030: The WCAG 2.1 contrast ratio calculation SHALL use the relative
        luminance formula defined in W3C WCAG 2.1 Success Criterion
        1.4.3. It SHALL correctly handle hex colour codes with and
        without the # prefix, and three-digit shorthand hex codes.

────────────────────────────────────────────────────
GROUP C: PER-SECTION STYLE TAB [BO-001, BO-002]
────────────────────────────────────────────────────

FR-031: The designer Section Properties Panel SHALL include a Style tab
        alongside the existing Content/Settings tabs.

FR-032: The Style tab SHALL expose a colour picker for
        SectionDesign.backgroundColor.

FR-033: The Style tab SHALL expose a text input for
        SectionDesign.borderStyle, accepting a CSS border shorthand
        value (e.g., "1px solid #cccccc").

FR-034: The Style tab SHALL expose a text input for
        SectionDesign.padding, accepting a CSS padding shorthand value.

FR-035: The Style tab SHALL expose a text input for
        SectionDesign.margin, accepting a CSS margin shorthand value.

FR-036: The Style tab SHALL expose a toggle group for
        SectionDesign.columnLayout with options: 1, 2, 3, 4.

FR-037: The Style tab SHALL expose a toggle group for
        SectionDesign.cardStyle with options: Flat, Elevated, Outlined.

FR-038: The Style tab SHALL expose a toggle group for
        SectionDesign.collapsibleStyle with options: None, Animated,
        Instant.

FR-039: The Style tab SHALL expose a toggle group for
        SectionDesign.visibilityAnimation with options: None, Fade,
        Slide.

FR-040: The Style tab SHALL expose a text input for
        SectionDesign.cssClassName, labelled "CSS Class Name", accepting
        a single valid CSS identifier (see BR-009 for validation rule).

FR-041: The designer SHALL persist SectionDesign changes to the
        qdb_section_design Dataverse entity when the form is saved.
        Each section SHALL have at most one qdb_section_design record.

────────────────────────────────────────────────────
GROUP D: PER-FIELD STYLE TAB [BO-001, BO-003]
────────────────────────────────────────────────────

FR-042: The designer Field Properties Panel SHALL include a Style tab
        alongside the existing Content/Validation tabs.

FR-043: The Style tab SHALL expose a toggle group for
        FieldDesign.width with options: Full, Half, Custom.

FR-044: When FieldDesign.width is set to "Custom", the Style tab SHALL
        expose a text input for FieldDesign.customWidth accepting a CSS
        length value (e.g., "320px", "75%").

FR-045: The Style tab SHALL expose a text input for FieldDesign.height
        accepting a CSS length value.

FR-046: The Style tab SHALL expose a toggle group for
        FieldDesign.inputStyle with options: Outlined, Filled, Standard.

FR-047: The Style tab SHALL expose a text input for
        FieldDesign.iconPrefix, accepting a Fluent UI icon name string
        or a Unicode character code.

FR-048: The Style tab SHALL expose a text input for
        FieldDesign.iconSuffix, accepting a Fluent UI icon name string
        or a Unicode character code.

FR-049: The Style tab SHALL expose expandable advanced sub-sections for
        FieldDesign.focusStyle, FieldDesign.errorStyle,
        FieldDesign.disabledStyle, FieldDesign.placeholderStyle, and
        FieldDesign.tooltipStyle. Each sub-section SHALL provide a key-
        value CSS property editor where the user can add, edit, and
        delete CSS property/value pairs.

FR-050: The Style tab SHALL expose a text input for
        FieldDesign.cssClassName, labelled "CSS Class Name", accepting
        a single valid CSS identifier (see BR-009).

FR-051: The designer SHALL persist FieldDesign changes to the
        qdb_field_design Dataverse entity when the form is saved.
        Each field SHALL have at most one qdb_field_design record.

────────────────────────────────────────────────────
GROUP E: PER-BUTTON STYLE TAB [BO-001, BO-002]
────────────────────────────────────────────────────

FR-052: The designer SHALL expose a Button Style panel, accessible from
        the form's action bar area in the designer canvas. The panel
        SHALL allow configuration of ButtonDesign for each of the three
        button types: Submit, SaveDraft, and Cancel.

FR-053: For each button type, the panel SHALL expose a colour picker for
        ButtonDesign.color.

FR-054: For each button type, the panel SHALL expose a text input for
        ButtonDesign.borderRadius accepting a CSS length value.

FR-055: For each button type, the panel SHALL expose a toggle group for
        ButtonDesign.size with options: Small, Medium, Large.

FR-056: For each button type, the panel SHALL expose a toggle group for
        ButtonDesign.alignment with options: Left, Center, Right.

FR-057: For each button type, the panel SHALL expose a text input for
        ButtonDesign.icon accepting a Fluent UI icon name string.

FR-058: For each button type, the panel SHALL expose a toggle group for
        ButtonDesign.hoverEffect with options: None, Elevate, ColorShift.

FR-059: For each button type, the panel SHALL expose a toggle group for
        ButtonDesign.loadingStyle with options: Spinner, Dots, Pulse.

FR-060: The designer SHALL persist ButtonDesign changes to the
        qdb_button_design Dataverse entity when the form is saved.
        There SHALL be at most one qdb_button_design record per
        (formDefinitionId, buttonType) combination.

────────────────────────────────────────────────────
GROUP F: RESPONSIVE GRID CONTROLS [BO-001, BO-003]
────────────────────────────────────────────────────

FR-061: The designer SHALL expose responsive grid controls per field,
        accessible from the field's Style tab or a dedicated Layout
        panel. The exact UI placement shall be determined in the
        architecture phase, but the controls must be reachable without
        leaving the field's property context.

FR-062: The responsive grid controls SHALL expose LayoutGrid.columnsTotal
        as a numeric selector (range 1 to 12).

FR-063: The responsive grid controls SHALL expose LayoutGrid.spanMobile
        as a numeric input (range 1 to columnsTotal).

FR-064: The responsive grid controls SHALL expose LayoutGrid.spanTablet
        as a numeric input (range 1 to columnsTotal).

FR-065: The responsive grid controls SHALL expose LayoutGrid.spanDesktop
        as a numeric input (range 1 to columnsTotal).

FR-066: The designer SHALL display an inline validation error when any
        span value (spanMobile, spanTablet, or spanDesktop) exceeds
        columnsTotal for that field.

FR-067: The designer SHALL persist LayoutGrid changes to the
        qdb_layout_grid Dataverse entity when the form is saved.
        There SHALL be at most one qdb_layout_grid record per
        (formDesignId, fieldId) combination.

────────────────────────────────────────────────────
GROUP G: SCOPED CSS CLASS NAMES [BO-001]
────────────────────────────────────────────────────

FR-068: The Custom CSS textarea in the Theme Editor SHALL provide
        autocomplete suggestions for CSS class names that have been
        assigned to fields or sections via FR-040 and FR-050. The
        autocomplete SHALL trigger when the user types a period (.)
        character inside the textarea.

FR-069: The Custom CSS textarea SHALL provide autocomplete suggestions
        for all --qdb-* CSS custom property names defined in
        ThemeDefinition. The autocomplete SHALL trigger when the user
        types "--qdb-" inside the textarea.

FR-070: The frontend runtime SHALL apply the cssClassName value as an
        additional CSS class on the field's container element and on the
        section's container element at render time, appended to any
        system-generated classes.

FR-071: The on-premises runtime (qdb_form_runtime.html) SHALL also apply
        the cssClassName values as additional CSS classes on the
        corresponding elements, using the same logic as the frontend
        runtime.

────────────────────────────────────────────────────
GROUP H: DATAVERSE SCHEMA EXTENSIONS [BO-001, BO-004]
────────────────────────────────────────────────────

BA NOTE: The following requirements specify schema additions. The
architect will determine the exact Dataverse attribute type
(text, integer, boolean, picklist, memo) and size constraints per
attribute in Phase 3. All new attribute logical names MUST be registered
in attributeNames.ts before use.

FR-072: The qdb_theme Dataverse entity SHALL be extended with new
        attributes for all ThemeDefinition fields not currently stored:
        qdb_secondary_color, qdb_surface_color, qdb_text_primary_color,
        qdb_text_secondary_color, qdb_border_color, qdb_error_color,
        qdb_success_color, qdb_warning_color, qdb_font_url,
        qdb_heading_font_size, qdb_label_font_size, qdb_input_font_size,
        qdb_shadow_style (Option Set), qdb_spacing_scale (Option Set),
        qdb_is_dark_mode (Two Options).

FR-073: The qdb_form_design Dataverse entity SHALL be extended with new
        attributes for all FormDesign fields not currently stored:
        qdb_layout_type (Option Set), qdb_alignment (Option Set),
        qdb_max_width (Text), qdb_section_style (Option Set),
        qdb_animation_enabled (Two Options),
        qdb_sticky_action_bar (Two Options),
        qdb_skeleton_loader_enabled (Two Options).

FR-074: The qdb_section_design Dataverse entity SHALL be extended with
        new attributes for all SectionDesign fields not currently stored:
        qdb_background_color (Text), qdb_border_style (Text),
        qdb_padding (Text), qdb_margin (Text),
        qdb_column_layout (Option Set: 1/2/3/4),
        qdb_card_style (Option Set), qdb_collapsible_style (Option Set),
        qdb_visibility_animation (Option Set),
        qdb_header_style_json (Multiline Text),
        qdb_css_class (Text).

FR-075: The qdb_field_design Dataverse entity SHALL be extended with new
        attributes for all FieldDesign fields not currently stored:
        qdb_width (Option Set: Full/Half/Custom),
        qdb_custom_width (Text), qdb_height (Text),
        qdb_icon_prefix (Text), qdb_icon_suffix (Text),
        qdb_focus_style_json (Multiline Text),
        qdb_error_style_json (Multiline Text),
        qdb_disabled_style_json (Multiline Text),
        qdb_placeholder_style_json (Multiline Text),
        qdb_tooltip_style_json (Multiline Text),
        qdb_css_class (Text).

FR-076: The qdb_button_design Dataverse entity SHALL be extended with
        new attributes for all ButtonDesign fields not currently stored:
        qdb_color (Text), qdb_border_radius (Text),
        qdb_size (Option Set: Small/Medium/Large),
        qdb_alignment (Option Set: Left/Center/Right),
        qdb_icon (Text),
        qdb_hover_effect (Option Set: None/Elevate/ColorShift),
        qdb_loading_style (Option Set: Spinner/Dots/Pulse).

FR-077: A new Dataverse entity qdb_layout_grid SHALL be created (it does
        not currently exist in the schema), with attributes:
        qdb_layout_grid_id (Primary Key, GUID),
        qdb_form_design_id (Lookup to qdb_form_design),
        qdb_form_field_id (Lookup to qdb_form_field),
        qdb_columns_total (Whole Number),
        qdb_span_mobile (Whole Number),
        qdb_span_tablet (Whole Number),
        qdb_span_desktop (Whole Number).

FR-078: All new Dataverse attributes and the new qdb_layout_grid entity
        SHALL be included in the existing qdb_form_engine CRM managed
        solution and deployed via the established solution packaging
        process.

FR-079: All new Dataverse attribute logical names SHALL be registered in
        designer/src/constants/attributeNames.ts in the appropriate
        constant object before any service or component references them.

────────────────────────────────────────────────────
GROUP I: RENDER CACHE INTEGRATION [BO-004]
────────────────────────────────────────────────────

FR-080: The render cache JSON assembled by the backend API for each
        published form SHALL include the complete DesignPayload
        structure: theme (ThemeDefinition), formDesign (FormDesign),
        sectionDesigns (Record<sectionId, SectionDesign>),
        fieldDesigns (Record<fieldId, FieldDesign>),
        buttonDesigns (Record<ButtonType, ButtonDesign>), and
        layoutGrid (LayoutGrid[]).

FR-081: When a form administrator saves any style change from the
        designer (Theme Editor, Section Style tab, Field Style tab,
        Button Style panel, or Responsive Grid Controls), the system
        SHALL automatically trigger a cache invalidation for the
        affected form by creating a new qdb_publish_job record with
        trigger_reason = STYLE_CHANGE.

FR-082: The backend API render cache assembly SHALL populate all new
        ThemeDefinition, FormDesign, SectionDesign, FieldDesign,
        ButtonDesign, and LayoutGrid fields from the corresponding
        Dataverse records using the new attributes defined in FR-072
        through FR-077.

FR-083: Forms that do not have a qdb_form_design record at cache
        assembly time SHALL receive a default DesignPayload populated
        from the linked qdb_theme record and system defaults for all
        other fields, ensuring backward compatibility.

────────────────────────────────────────────────────
GROUP J: ON-PREMISES RUNTIME PARITY [BO-004]
────────────────────────────────────────────────────

FR-084: The qdb_form_runtime.html web resource SHALL read the full
        DesignPayload from the render cache JSON (via the same endpoint
        as the Next.js portal) and apply all styling using the same
        resolution logic defined in StyleEngine.ts.

FR-085: The on-premises runtime SHALL inject all --qdb-* CSS custom
        properties defined in ThemeDefinition onto the web resource root
        element (or documentElement within the web resource iframe).

FR-086: The on-premises runtime SHALL apply per-field styles (width,
        height, inputStyle, iconPrefix, iconSuffix, focusStyle,
        errorStyle, disabledStyle, placeholderStyle) as inline styles
        on the corresponding field container elements.

FR-087: The on-premises runtime SHALL apply per-section styles
        (backgroundColor, borderStyle, padding, margin, cardStyle)
        as inline styles on the corresponding section container elements.

FR-088: The on-premises runtime SHALL inject FormDesign.customCss in a
        <style> block scoped to a form-specific wrapper class, placed
        in the web resource document head.

FR-089: The on-premises runtime SHALL apply cssClassName values as
        additional CSS classes on the corresponding field and section
        container elements (FR-070, FR-071 parity).

────────────────────────────────────────────────────
GROUP K: RTL AND ARABIC SAFETY [BO-004]
────────────────────────────────────────────────────

FR-090: The StyleEngine SHALL detect the active locale's RTL direction
        flag from the DesignPayload or the page's dir attribute, and
        when RTL is active, SHALL emit CSS logical properties
        (padding-inline-start, padding-inline-end, margin-inline-start,
        margin-inline-end, border-inline-start, text-align: start/end)
        in place of physical directional properties for all dynamically
        generated inline styles.

FR-091: The designer Style tab controls for padding and margin MUST
        document clearly that entered values are treated as CSS logical
        properties when the form is rendered in an RTL locale.

FR-092: The on-premises runtime SHALL also apply RTL logical property
        mapping when the form is rendered in an RTL locale (FR-090
        parity).

────────────────────────────────────────────────────
GROUP L: BACKWARD COMPATIBILITY [BO-001, BO-004]
────────────────────────────────────────────────────

FR-093: All newly added DesignPayload fields SHALL be typed as optional
        (undefined or null) in the shared type contract. The StyleEngine
        SHALL treat undefined or null values as "use theme default" and
        SHALL NOT apply any overriding inline style for those properties.

FR-094: The designer SHALL NOT modify any existing form's styling data
        when the form is opened for editing, unless the user explicitly
        changes a value in a Style tab or the Theme Editor.

FR-095: All DesignService save operations (upsertTheme, upsertFormDesign,
        upsertSectionDesign, upsertFieldDesign, upsertButtonDesign) SHALL
        use partial update (PATCH) semantics: the request payload SHALL
        include only the attributes that were explicitly changed, not a
        full replacement of the record.

────────────────────────────────────────────────────
GROUP M: STYLENGINE MEMOIZATION [BO-004]
────────────────────────────────────────────────────

FR-096: The StyleEngine.resolveField method SHALL be memoized such that
        calling resolveField with the same DesignPayload object reference
        and the same fieldId returns a cached result object without
        re-computing. The cache SHALL be invalidated when the
        DesignPayload reference changes.

FR-097: The StyleEngine.resolveSection method SHALL be memoized using
        the same strategy as FR-096.

FR-098: The ThemeProvider injectCssCustomProperties function SHALL not
        re-inject CSS properties on every render cycle. It SHALL only
        run when the ThemeDefinition object reference changes
        (controlled by the existing useEffect dependency in ThemeProvider).

────────────────────────────────────────────────────
GROUP N: DESIGNER TYPE SYSTEM CONSOLIDATION [BO-006]
────────────────────────────────────────────────────

FR-099: The DesignerStyleModel type defined in
        designer/src/state/models/DesignerStyleModel.ts SHALL be marked
        as deprecated and all designer components and services SHALL be
        migrated to use the shared DesignPayload and ThemeDefinition
        types from @qdb/shared.

FR-100: The designer's Zustand store SHALL hold a DesignPayload state
        object (replacing the current DesignerStyleModel state) that is
        loaded from and saved to Dataverse through an updated
        DesignService.

FR-101: The DesignService SHALL be updated to read and write all fields
        in the extended Dataverse schema (FR-072 through FR-077) and to
        return a fully populated DesignPayload to the designer store.


6. NON-FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

NFR-001: Performance — Colour Contrast Calculation
         The WCAG contrast ratio calculation (FR-025 through FR-030)
         SHALL complete within 10 milliseconds of a colour input change
         event on an Intel Core i5-class CPU. This ensures the real-time
         indicator does not introduce perceptible lag during colour
         selection.

NFR-002: Performance — Style Panel Render
         Each Style tab (Section, Field, Button) SHALL complete its
         initial render within 200 milliseconds of tab activation,
         including loading existing style values from the designer store.

NFR-003: Performance — StyleEngine Resolution
         StyleEngine.resolveField and StyleEngine.resolveSection SHALL
         each complete within 1 millisecond per call on a warm memoized
         cache for a form with up to 100 fields and 20 sections. This
         SHALL be verified by a unit test benchmark.

NFR-004: Performance — DesignPayload Payload Size
         The serialized DesignPayload JSON for a single form SHALL not
         exceed 512 kilobytes. The designer SHALL display a warning to
         the administrator if the payload size approaches 400 kilobytes.
         This is a risk-mitigation constraint (see R-001).

NFR-005: Security — CSS Injection Prevention
         Custom CSS entered via FormDesign.customCss SHALL be sanitized
         before injection. The sanitizer SHALL reject @import rules
         referencing URLs outside the QDB-approved CDN allowlist,
         url() functions containing non-allowlisted domains, and CSS
         expression() and behavior: declarations. The sanitizer SHALL be
         applied at both the designer save path and the runtime injection
         path.

NFR-006: Security — CSS Class Name Sanitization
         cssClassName values entered via FR-040 and FR-050 SHALL be
         sanitized before DOM injection to prevent CSS injection attacks.
         The sanitizer SHALL allow only characters conforming to the CSS
         identifier specification (letters, digits, hyphens, underscores)
         and SHALL reject values containing angle brackets, quotes, or
         parentheses.

NFR-007: Security — CSS Scoping
         FormDesign.customCss SHALL be injected at runtime inside a
         CSS block scoped to a form-instance-specific wrapper class
         (e.g., .dfe-form-{formCode}) to prevent style bleeding into
         adjacent CRM native UI elements in the on-prem runtime context.

NFR-008: Security — fontUrl Domain Allowlist
         The font URL domain allowlist governing FR-009 and BR-010
         SHALL be stored in a Dataverse configuration record readable
         at runtime, not hardcoded in source code. QDB IT SHALL be able
         to add or remove approved domains without a code deployment.

NFR-009: Accessibility — WCAG Formula Compliance
         The contrast ratio calculation (FR-030) SHALL implement the
         relative luminance formula from W3C WCAG 2.1 (W3C
         Recommendation 5 June 2018, Section 1.4.3). It SHALL correctly
         handle sRGB gamma correction via the linear light transform
         defined in that specification.

NFR-010: Compatibility — Component Library
         All new designer UI controls SHALL be implemented using Fluent
         UI v9 components (the existing library). No additional component
         library dependency may be introduced.

NFR-011: Compatibility — Browser Matrix
         The designer Style tabs SHALL support the same browser matrix
         as the existing designer web resource: modern Microsoft Edge
         and Google Chrome. Internet Explorer 11 is not supported.

NFR-012: Compatibility — Shared Type Contract
         The shared DesignPayload type (design.types.ts) is the
         authoritative contract between the designer, the backend API,
         the frontend runtime, and the on-prem runtime. Any change to
         this type during the engagement SHALL be reviewed and approved
         by all four component owners before merge.

NFR-013: Maintainability — Attribute Name Registry
         Every new Dataverse attribute logical name introduced by
         FR-072 through FR-077 SHALL be added to attributeNames.ts
         before any service or component references it. Inline string
         literals for attribute names are prohibited.

NFR-014: Maintainability — No God Components
         No single new designer component SHALL exceed 400 lines of
         code. Style tab panels for fields, sections, and buttons SHALL
         each be implemented as separate, independently testable
         components following the existing panel pattern.

NFR-015: CRM Plugin Limits — On-Prem
         Any CRM plugin triggered by a style save event (cache
         invalidation, qdb_publish_job creation) SHALL complete its
         synchronous execution within the Dynamics CRM 2-minute plugin
         timeout. Style changes that require cache regeneration for
         many language variants SHALL be handled asynchronously via the
         existing qdb_publish_job queue mechanism.

NFR-016: Data Integrity — Partial Update
         All Dataverse write operations in this engagement SHALL use
         partial update (PATCH) semantics (NFR linked to FR-095).
         Full record replacement PUT operations are prohibited for
         update paths.


7. BUSINESS RULES
═══════════════════════════════════════════════════

BR-001: A form MAY have at most one ThemeDefinition linked to it via
        FormDesign.themeId. A single ThemeDefinition MAY be linked to
        multiple forms.

BR-002: A SectionDesign record is linked to exactly one form section
        (qdb_form_section). A SectionDesign record SHALL NOT exist
        without a corresponding parent qdb_form_section record.

BR-003: A FieldDesign record is linked to exactly one form field
        (qdb_form_field). A FieldDesign record SHALL NOT exist without
        a corresponding parent qdb_form_field record.

BR-004: A ButtonDesign record is linked to exactly one form definition
        and one button type. There SHALL be at most one qdb_button_design
        record per (qdb_form_definition_id, qdb_button_type) pair.

BR-005: A LayoutGrid record is linked to exactly one form design and
        one form field. There SHALL be at most one qdb_layout_grid
        record per (qdb_form_design_id, qdb_form_field_id) pair.

BR-006: A DesignPayload field that is null or undefined in the runtime
        SHALL be treated as "inherit from the active ThemeDefinition
        default". The StyleEngine SHALL NOT apply any overriding style
        for a null/undefined field. This rule is enforced in StyleEngine
        code, not at the Dataverse constraint level.

BR-007: SectionDesign.columnLayout overrides the section's column count
        for that specific section only. It does not affect the form-
        level FormDesign.layoutType column behaviour.

BR-008: LayoutGrid span values (spanMobile, spanTablet, spanDesktop)
        SHALL each be between 1 and columnsTotal inclusive. A span value
        of 0 or greater than columnsTotal is invalid and SHALL be
        rejected by the designer with an inline validation error (FR-066).

BR-009: cssClassName values (FR-040, FR-050) SHALL contain only valid
        CSS identifier characters: ASCII letters (a-z, A-Z), digits
        (0-9), hyphens (-), and underscores (_). The value SHALL NOT
        begin with a digit. Values violating this rule SHALL be rejected
        by the designer with an inline validation error.

BR-010: The ThemeDefinition.fontUrl field SHALL only accept HTTPS URLs
        whose domain matches an entry in the QDB-approved font CDN
        allowlist (stored in a Dataverse configuration record per
        NFR-008). An HTTP (non-TLS) URL SHALL be rejected. A URL whose
        domain is not in the allowlist SHALL be rejected with a specific
        error message identifying the offending domain.

BR-011: A form version snapshot (qdb_form_version.qdb_metadata_snapshot_
        json) SHALL include the complete DesignPayload that was active at
        the time of publication. Rolling back to a prior version SHALL
        restore both the form structure and the styling that was active
        at that version.

BR-012: When a designer saves any style change, the system SHALL write
        a qdb_form_audit_log entry recording the actor's user ID and
        display name, the timestamp, and the delta of changed
        DesignPayload fields (not the full payload). The audit log entry
        SHALL NOT include the full CSS content of customCss to avoid
        bloating audit records.

BR-013: Contrast ratio warnings (3.0:1 to 4.5:1 range) are advisory.
        A form administrator MAY publish a form with a contrast warning
        after explicit acknowledgement. Contrast errors (below 3.0:1)
        are blocking. A form administrator SHALL NOT be able to publish a
        form with any colour pair below 3.0:1 contrast ratio.

BR-014: For RTL locales, the StyleEngine SHALL substitute physical CSS
        directional properties with CSS logical properties as follows:
        padding-left → padding-inline-start,
        padding-right → padding-inline-end,
        margin-left → margin-inline-start,
        margin-right → margin-inline-end,
        border-left → border-inline-start,
        border-right → border-inline-end,
        text-align: left → text-align: start,
        text-align: right → text-align: end.
        This substitution applies to all dynamically generated inline
        styles emitted by the StyleEngine and the on-prem runtime.

BR-015: The DesignService.upsertTheme method SHALL NOT overwrite
        attributes that were not included in the current save payload.
        If a form administrator saves only colour changes, typography
        attributes previously saved SHALL be preserved.


8. OPEN QUESTIONS
═══════════════════════════════════════════════════

Each open question must be resolved before the phase it blocks begins.
Unresolved questions at phase start are escalation triggers.

OQ-001: Business Rule Schema Version Bump
         The existing business rule schema (businessRule.ts) is at
         version '1.0' and defines six action types (show_field,
         hide_field, set_required, clear_required, set_value,
         show_message). Tier 3 conditional styling would add apply_style
         and add_class as new action types, requiring a schema version
         bump to '2.0'.
         Question: Does QDB IT require formal sign-off before the
         business rule schema version is incremented? Who owns the
         approval authority for schema version changes?
         Blocks: Tier 3 Conditional Styling (deferred)
         Owner: QDB IT Director
         Needed by: Before Tier 3 engagement begins (not this engagement)

OQ-002: Conditional Styling Use Cases
         Tier 3 conditional/rule-driven styling is in the deferred scope.
         The BA cannot estimate effort or design rules without knowing
         the specific scenarios QDB wants to support.
         Question: Does QDB have confirmed use cases for conditional
         styling? For example: "Highlight field X with a warning
         background colour when field Y is answered 'Yes'"? Please
         provide a minimum of three use cases.
         Blocks: Tier 3 Conditional Styling (deferred)
         Owner: QDB Form Administrators / Business Analysts at QDB
         Needed by: Before Tier 3 engagement begins

OQ-003: Named Theme Preset Ownership
         Tier 3 Named Theme Presets include system-provided starter
         presets (Corporate, Minimal, Dark).
         Question: Who authors and approves system-provided presets —
         the Maqsad AI team, QDB brand team, or QDB IT? Are presets
         tenant-scoped (one set per QDB Dataverse environment) or global
         across all environments?
         Blocks: Tier 3 Named Theme Presets (deferred)
         Owner: QDB Brand Team / IT Director
         Needed by: Before Tier 3 engagement begins

OQ-004: DXP-P1-003 Token Contract and Go-Live Status
         Tier 3 DXP integration depends on the DXP-P1-003 Theme Token
         System being live and exposing a stable CSS custom property
         contract.
         Question: (a) What is the current deployment status of
         DXP-P1-003? (b) Has the CSS token contract (the complete list
         of CSS custom property names, their scoping, and their
         documented source) been finalised? (c) Is there an API or
         Dataverse endpoint the DFE can consume to read the current
         DXP token values?
         Blocks: Tier 3 DXP Integration (deferred)
         Owner: DXP-P1-003 Team / Maqsad AI
         Needed by: Before Tier 3 DXP integration sprint begins

OQ-005: Brand Asset Storage Decision
         Brand Kit (logo, banner, favicon) is deferred pending a storage
         architecture decision.
         Question: Should binary brand assets be stored as Dataverse
         file attributes (10 MB limit per attribute) or in Azure Blob
         Storage with a Dataverse URL reference? This decision has
         architectural implications (blob CDN URL injection vs. Dataverse
         file streaming).
         Blocks: Brand Kit feature (deferred to follow-on engagement)
         Owner: QDB IT Director
         Needed by: Before Brand Kit engagement begins

OQ-006: DesignerStyleModel Deprecation Review
         NFR-014 proposes deprecating DesignerStyleModel.ts. This is a
         significant internal refactoring that changes the designer's
         Zustand store shape.
         Question: Is the DesignerStyleModel deprecation (FR-099 through
         FR-101) within the agreed change scope for this engagement, or
         does it require a separate formal change request? Confirmation
         is needed before architecture begins.
         Blocks: Phase 3 Architecture
         Owner: Maqsad AI Project Manager / Architect (internal type — not a
         QDB decision per CEO C-006)
         Needed by: Before Phase 3
         RESOLVED 2026-06-28 (see brd-style-resolutions.md): in scope and
         mandatory (FR-099–101). Reference surface measured: 8 source files +
         2 tests + the definition. QDB IT Director removed as owner.

OQ-007: QDB Font Policy
         BR-010 requires a font URL domain allowlist, but does not
         specify whether there is also a restriction on which specific
         fonts may be used (e.g., is Arial allowed, is a custom Arabic
         typeface required, is Segoe UI mandatory for QDB branding?).
         Question: (a) Is there a QDB-approved list of specific font
         names that may be used in forms? (b) Are Google Fonts generally
         permitted, or is a specific subset approved? (c) Are there
         mandatory Arabic font requirements for RTL forms?
         Blocks: FR-009 (fontUrl), BR-010 (allowlist design)
         Owner: QDB Brand Team
         Needed by: Before Phase 4 (Frontend build)

OQ-008: Current Render Cache Size Per Form
         NFR-004 caps DesignPayload JSON at 512 KB. The BA does not know
         the current average size of the render cache payload per form.
         Question: (a) What is the current average and maximum render
         cache JSON size per form in the QDB production environment?
         (b) What is the Dataverse column size limit on the
         qdb_render_cache.qdb_cached_payload_json attribute?
         Blocks: NFR-004 validation, R-001 risk assessment
         Owner: Maqsad AI CRM Developer / QDB IT
         Needed by: Before Phase 3 Architecture
         RESOLVED 2026-06-28 (see brd-style-resolutions.md): measured live.
         Column qdb_runtime_json limit = 1,048,576 chars; current max usage =
         10,392 chars (0.99%); ~1,014 KB headroom. DesignPayload may be stored
         INLINE; no separate blob storage needed. R-001 downgraded High → Low.

OQ-009: WCAG Contrast Scope for State Styles
         FR-025 specifies which colour pairs receive contrast checking.
         It does not address whether focusStyle, errorStyle, or
         disabledStyle colours should also be checked against adjacent
         background colours.
         Question: Should the contrast ratio check extend to per-field
         state styles (focus ring colour vs. field background, error
         text colour vs. field background)? This would require the
         designer to know which background colour applies to each field
         at the time of checking, which adds complexity.
         Blocks: FR-025 through FR-030 implementation scope
         Owner: QDB Compliance Team / Maqsad AI BA
         Needed by: Before Phase 3 Architecture

OQ-010: Third-Party WCAG Audit Requirement
         The engagement includes built-in contrast ratio enforcement
         (FR-025 through FR-030). However, the CEO approval for
         DFE-i18n-001 included an accessibility condition.
         Question: Does QDB require a formal third-party WCAG 2.1 AA
         accessibility audit as a go-live condition for this engagement,
         or is the built-in contrast ratio warning and blocking rule
         sufficient for QDB's internal compliance programme?
         Blocks: Go-live gating criteria for Phase 7 CEO approval
         Owner: QDB Compliance Team / IT Director
         Needed by: Before Phase 5 QA (so test scope can include or
         exclude third-party audit coordination)


9. ASSUMPTIONS AND CONSTRAINTS
═══════════════════════════════════════════════════

ASSUMPTIONS

A-001: The shared type contract in shared/src/types/design.types.ts is
       authoritative and complete for all DesignPayload fields this
       engagement will surface. Any change to these types during the
       engagement requires a formal shared-types review with all
       component owners.

A-002: The existing Dataverse entities (qdb_theme, qdb_form_design,
       qdb_section_design, qdb_field_design, qdb_button_design) can be
       extended with new attributes under the existing qdb_ publisher
       prefix without requiring a new managed solution or a separate
       publisher registration.

A-003: The qdb_layout_grid entity does NOT currently exist in the
       Dataverse schema and must be created as part of this engagement.
       If this assumption is incorrect (e.g., it exists under a different
       name), the CRM Developer must raise it as a blocker in Phase 3.

A-004: The DFE-RC-001 render cache assembly pipeline (backend Fastify
       service + CRM plugin + qdb_publish_job queue) can be extended to
       include DesignPayload fields without a re-architecture of the
       publish job mechanism.

A-005: QDB form administrators are already trained on the designer web
       resource (per DFE-ADD-001/002 onboarding). No new user training
       programme is in scope for this engagement beyond updated inline
       help text in the new Style tab panels.

A-006: The designer web resource runs in Dynamics CRM on-premises and
       uses Xrm.WebApi for all Dataverse operations. There is no direct
       REST API call from the designer to the backend Fastify service.

A-007: The on-premises qdb_form_runtime.html reads the DesignPayload
       from the same render cache JSON endpoint as the Next.js portal.
       No separate style delivery pipeline is required for on-prem.

A-008: CSS custom properties (var(--qdb-*)) are supported in the
       browser environment used by the on-prem CRM runtime (modern Edge
       and Chrome confirmed by DFE-ADD-001 browser matrix).

A-009: The WCAG contrast ratio check in the designer runs entirely
       client-side (JavaScript). It does not require a server-side API
       call.

CONSTRAINTS

C-001: All Dataverse attribute logical names for new fields MUST follow
       the qdb_ prefix naming convention. No deviation is permitted.

C-002: The designer UI MUST use Fluent UI v9 components exclusively.
       No additional UI library dependency may be introduced in this
       engagement.

C-003: The WCAG 2.1 contrast ratio calculation MUST use the W3C WCAG 2.1
       relative luminance formula. No approximation, colour-library
       wrapper, or alternative formula is acceptable.

C-004: Any CRM plugin that handles style save events (cache invalidation,
       publish job creation) MUST complete its synchronous execution
       within the Dynamics CRM 2-minute plugin time limit. Style changes
       requiring cache regeneration for multiple language variants MUST
       be processed asynchronously via the existing qdb_publish_job
       queue.

C-005: FormDesign.customCss MUST be scoped at runtime using a form-
       specific CSS wrapper class (.dfe-form-{formCode}) to prevent
       style leakage into adjacent CRM native UI elements in the on-prem
       runtime context.

C-006: The fontUrl domain allowlist MUST be stored in a configurable
       Dataverse record, not hardcoded in source or deployed files.

C-007: All new Dataverse entities and attributes MUST be included in the
       existing qdb_form_engine managed solution and deployed through the
       established CRM solution packaging and import process.

C-008: All save operations to Dataverse (theme, form design, section
       design, field design, button design, layout grid) MUST use
       partial update (PATCH) semantics. Full record replacement (PUT)
       is prohibited for update paths.


10. SUCCESS METRICS
═══════════════════════════════════════════════════

SM-001: A QDB form administrator can configure complete per-field,
        per-section, and per-button styling for a new form within 30
        minutes without any developer assistance. Verified in UAT by
        timing a full styling exercise against a new test form.

SM-002: Zero visual regression is observed on any existing published
        form after deployment. An automated visual regression test suite
        comparing screenshots before and after deployment must pass at
        100% for all forms that existed before this engagement.

SM-003: 100% of colour picker controls in the designer (primary, all
        secondary palette colours, button colours) surface a WCAG 2.1
        contrast ratio indicator in real time.

SM-004: The DesignPayload is present and non-empty in the render cache
        JSON for 100% of forms published after this engagement is
        deployed.

SM-005: A visual comparison of any published form rendered by the Next.js
        portal and by the on-premises qdb_form_runtime.html produces no
        layout, colour, or typography differences detectable to the naked
        eye (verified by QA screenshot comparison).

SM-006: StyleEngine.resolveField completes in under 1 millisecond per
        call on a warm memoized cache, verified by an automated unit
        test benchmark that is included in the test suite and runs on
        every CI build.

SM-007: Zero published forms have any colour pair with a WCAG contrast
        ratio below 3.0:1 after this engagement. The publish gate (FR-028)
        enforces this. The QA phase will verify the blocking behaviour
        by attempting to publish a test form with deliberately non-
        compliant colours.

SM-008: The DesignerStyleModel type is no longer referenced by any
        designer component or service at the end of this engagement
        (verified by a TypeScript compilation check with the type removed
        from the codebase).


11. DEPENDENCIES
═══════════════════════════════════════════════════

INTERNAL DEPENDENCIES

DEP-001: DFE-ADD-001 / DFE-ADD-002 — Core Form Engine (APPROVED WITH
         CONDITIONS). This is the architecture baseline. The designer
         component patterns (PropertiesPanel, FieldProperties,
         SectionProperties, designerStore), the Dataverse entity schema,
         and the designer-to-Dataverse persistence layer established in
         this engagement are the foundation on which all new Style tabs
         are built.

DEP-002: DFE-RC-001 — Render Cache (DELIVERED). The DesignPayload must
         be integrated into the existing qdb_publish_job and
         qdb_render_cache mechanism. The publish job trigger_reason enum
         must be extended to include STYLE_CHANGE. The cache assembly
         pipeline must be extended to fetch and serialize the full
         DesignPayload.

DEP-003: DFE-i18n-001 — Arabic/RTL (CEO APPROVED WITH CONDITIONS).
         The RTL direction flag on qdb_language_config.qdb_rtl_direction
         must be readable by the StyleEngine to activate logical CSS
         property substitution (BR-014, FR-090 through FR-092). This
         engagement MUST NOT introduce any RTL regression that would
         violate the go-live conditions of DFE-i18n-001.

EXTERNAL DEPENDENCIES (Tier 3 — all deferred)

DEP-004: DXP-P1-003 — Theme Token System (CEO APPROVED WITH CONDITIONS).
         The CSS custom property contract from DXP-P1-003 must be
         documented and stable before any Tier 3 DXP integration work
         begins. This is a hard dependency for OQ-004 resolution.

TECHNOLOGY DEPENDENCIES

DEP-005: Fluent UI v9 — All new designer controls use the existing Fluent
         UI v9 dependency. No version upgrade is required for this
         engagement (assumption; verify in Phase 3).

DEP-006: Zod — The backend API uses Zod for runtime schema validation.
         The DesignPayload schema must be extended in Zod to cover all
         new fields before they are accepted from the render cache
         assembly request.


12. RISKS AND MITIGATIONS
═══════════════════════════════════════════════════

| Risk                                                                                          | Impact | Likelihood | Mitigation                                                                                                                                                             | Owner                        | Phase |
|-----------------------------------------------------------------------------------------------|--------|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------|-------|
| R-001: DesignPayload JSON size exceeds the Dataverse column limit for render cache storage. A form with 100 fields, each with five JSON style blobs, could easily exceed 512 KB. | High   | Medium     | OQ-008 must be answered before Phase 3. If current cache is already near the limit, the architect must evaluate a separate Dataverse file attribute or Azure Blob reference for DesignPayload.   | Architect / CRM Developer    | 3     |
| R-002: Custom CSS injection via FormDesign.customCss introduces XSS or data exfiltration via CSS (e.g., url() with an external tracking pixel, expression()). | High   | Low        | Implement strict CSS sanitization at both the designer save path and runtime injection path. Sanitizer rules must be reviewed in the Phase 6 audit. Include a specific audit test for CSS injection. | Code Reviewer / Auditor      | 4, 6  |
| R-003: Extending Dataverse entities with many new attributes degrades performance of existing plugin queries that use SELECT * (or no explicit $select). | Medium | Medium     | Audit all existing plugin and DesignService queries for explicit $select lists before Phase 4 build. Flag any SELECT * queries as blockers in the code review. | CRM Developer / Code Reviewer | 4     |
| R-004: DesignerStyleModel divergence is not resolved (NFR-014, FR-099), leaving two competing type contracts that create bugs on the style save path. | Medium | Medium     | Mark DesignerStyleModel deprecation as a mandatory Phase 4 task. Add a TypeScript compiler check that fails if DesignerStyleModel is referenced from any new code. Enforce in code review. | Frontend Developer / Code Reviewer | 4  |
| R-005: The new qdb_layout_grid entity name conflicts with an existing CRM schema element in another solution installed in QDB's environment. | Medium | Low        | CRM Developer to verify no naming conflict in the QDB Dataverse environment before Phase 3 schema design. Document finding under A-003. | CRM Developer                | 3     |
| R-006: Per-field JSON style blobs (focusStyle, errorStyle, etc.) stored in Multiline Text Dataverse attributes contain malformed JSON due to developer error, causing runtime StyleEngine parse failures. | Medium | Low        | All JSON style blob attributes must be validated on the designer save path before writing to Dataverse. Parse failures must surface as user-visible errors, not silent failures. Zod schemas must cover these fields. | Frontend Developer / Backend Developer | 4 |
| R-007: RTL CSS logical property substitution (FR-090) is not applied correctly by the on-prem runtime (qdb_form_runtime.html), causing Arabic form layout breakage and violating DFE-i18n-001 go-live conditions. | High   | Medium     | Include RTL regression tests in Phase 5 QA for both the Next.js portal and the on-prem runtime. RTL test cases must cover padding, margin, border, and text-align for at least three layout variations. | Frontend Developer / QA      | 4, 5  |
| R-008: WCAG contrast enforcement (FR-028) is perceived by QDB form administrators as an editorial constraint that prevents use of approved QDB brand colours (e.g., QDB's brand green may fall below 4.5:1 on white). | Medium | Medium     | FR-029 allows publishing with a warning after acknowledgement for the 3.0:1 to 4.5:1 range. OQ-010 must confirm whether QDB requires a formal WCAG audit. Engage QDB brand team early (OQ-009) to flag known brand colour issues before build. | QDB Brand Team / BA          | 3     |
| R-009: Cache invalidation on style save (FR-081) triggers a qdb_publish_job that runs cache regeneration for all language variants, blocking the designer if the job is synchronous and exceeds 2 minutes. | Medium | High       | Cache regeneration must be fully asynchronous via the existing qdb_publish_job queue. Style save in the designer creates the job record and returns immediately. Job status is not surfaced to the form administrator in real time (a separate future feature). | CRM Developer / Backend Developer | 3, 4 |
| R-010: Partial update (PATCH) semantics are not enforced on all save paths, causing a full record replacement that wipes attributes not included in the current save payload (e.g., saving colours wipes typography). | High   | Medium     | FR-095 and NFR-016 mandate PATCH semantics. The code review checklist must include a specific check for every DesignService method. Unit tests must verify that a partial save does not modify unrelated attributes. | CRM Developer / Code Reviewer | 4     |


13. ACCEPTANCE CRITERIA FOR THIS BRD
═══════════════════════════════════════════════════

The following criteria must be met for the CEO to approve this BRD.
They are evaluated against the document itself, not against any
implementation.

AC-001: Every field defined in ThemeDefinition, FormDesign, SectionDesign,
        FieldDesign, ButtonDesign, and LayoutGrid in design.types.ts
        has a corresponding Functional Requirement that specifies exactly
        how it is surfaced in the designer, persisted in Dataverse, and
        included in the render cache.

AC-002: Every Functional Requirement (FR-001 through FR-101) is traceable
        to at least one Business Objective (BO-001 through BO-006), as
        indicated in the group headers.

AC-003: Every Open Question (OQ-001 through OQ-010) is assigned to a
        named owner and specifies which phase or feature it blocks.

AC-004: Brand Kit, Tier 3 Conditional Styling, Named Theme Presets, and
        DXP-P1-003 integration are explicitly listed in Section 4.3
        (Deferred) with the conditions that must be met before each can
        be taken up.

AC-005: Backward compatibility for all existing published forms is
        addressed by FR-093, FR-094, and FR-083.

AC-006: Render cache integration, on-prem parity, RTL/Arabic safety, and
        WCAG 2.1 AA compliance are each addressed by named Functional
        Requirements in dedicated groups (Groups H, J, K, B respectively).

AC-007: The DesignerStyleModel type divergence (the design system gap
        between the designer and the shared DesignPayload contract) is
        addressed as a mandatory task in FR-099 through FR-101.

AC-008: The BRD contains no implementation guidance, architectural
        decisions, code samples, or technology recommendations. All such
        decisions are deferred to Phase 3 Architecture.

AC-009: All ten risks in Section 12 have a named owner and a target
        phase. No risk is listed as "owner: TBD".


14. REQUIREMENTS TRACEABILITY MATRIX
═══════════════════════════════════════════════════

| Business Objective | Functional Requirements                                | Open Questions |
|--------------------|--------------------------------------------------------|----------------|
| BO-001             | FR-001 to FR-024, FR-031 to FR-051, FR-052 to FR-067, FR-068 to FR-071, FR-093 to FR-095, FR-099 to FR-101 | OQ-006, OQ-007 |
| BO-002             | FR-001 to FR-023, FR-031 to FR-039, FR-052 to FR-060   | OQ-007         |
| BO-003             | FR-061 to FR-067                                       | none           |
| BO-004             | FR-080 to FR-089, FR-090 to FR-092, FR-093 to FR-095   | OQ-004, OQ-008 |
| BO-005             | FR-025 to FR-030                                       | OQ-009, OQ-010 |
| BO-006             | FR-099 to FR-101                                       | OQ-006         |

Note: All Non-Functional Requirements support multiple Business
Objectives. NFR-001 to NFR-003 support BO-001 and BO-004. NFR-005
to NFR-007 support BO-004 and BO-005. NFR-013 to NFR-014 support BO-006.


15. GLOSSARY
═══════════════════════════════════════════════════

ButtonDesign: A Dataverse record (qdb_button_design) holding per-button-
   type visual styling properties for a form's action buttons (Submit,
   SaveDraft, Cancel). Defined in design.types.ts.

cssClassName: A stable CSS identifier string assigned to a field or
   section container element at runtime. Allows Custom CSS rules in the
   Theme Editor to target specific elements by class name.

DesignPayload: The complete styling data structure for a form, containing
   ThemeDefinition, FormDesign, SectionDesign records, FieldDesign
   records, ButtonDesign records, and LayoutGrid records. Defined in
   shared/src/types/design.types.ts. This is the authoritative contract.

DesignerStyleModel: The legacy internal type in
   designer/src/state/models/DesignerStyleModel.ts that currently holds
   only 12 design properties. This type is being deprecated in this
   engagement (FR-099 to FR-101).

DFE: Dynamic Form Engine. The product this engagement extends.

FieldDesign: A Dataverse record (qdb_field_design) holding per-field
   visual styling properties. Defined in design.types.ts.

FormDesign: A Dataverse record (qdb_form_design) holding form-level
   layout and presentation settings. Defined in design.types.ts.

LayoutGrid: A Dataverse record (qdb_layout_grid) holding responsive grid
   breakpoint span values for a specific field within a form design.
   Defined in design.types.ts.

QDB: Qatar Development Bank. The client organisation.

Render Cache: The pre-assembled JSON payload stored in qdb_render_cache
   per form and language, produced by the DFE-RC-001 engagement. The
   frontend portal and on-prem runtime read from this cache instead of
   querying Dataverse at request time.

RTL: Right-to-Left. Refers to Arabic text directionality. RTL-safe CSS
   uses logical properties rather than physical directional properties.

SectionDesign: A Dataverse record (qdb_section_design) holding per-
   section visual styling properties. Defined in design.types.ts.

StyleEngine: The pure utility module at
   frontend/src/theme/StyleEngine.ts that resolves DesignPayload entries
   into CSS properties objects for use by React components.

ThemeDefinition: A Dataverse record (qdb_theme) holding the global colour
   palette, typography, and shape settings that apply to all forms using
   that theme. Defined in design.types.ts.

ThemeProvider: The React component at
   frontend/src/theme/ThemeProvider.tsx that injects CSS custom
   properties (--qdb-*) onto documentElement and wraps children in
   a Fluent UI FluentProvider.

WCAG 2.1 AA: Web Content Accessibility Guidelines version 2.1, Level AA.
   The minimum accessibility standard this engagement must meet for
   colour contrast (Success Criteria 1.4.3 and 1.4.11).


16. APPROVAL
═══════════════════════════════════════════════════

| Role          | Name                | Decision  | Date       |
|---------------|---------------------|-----------|------------|
| CEO           | Maqsad AI CEO       | PENDING   |            |
| Requestor     | QDB Engagement Lead | PENDING   |            |
| BA (Author)   | Maqsad AI BA        | SUBMITTED | 2026-06-28 |

═══════════════════════════════════════════════════
END OF DOCUMENT — DFE-STYLE-001 BRD v1.0
═══════════════════════════════════════════════════
