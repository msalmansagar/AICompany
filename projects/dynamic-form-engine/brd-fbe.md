═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-FBE-001 — DFE Form Builder Enhancements:
                Summary Modes, Label Field, Section Icons &
                Tab Descriptions
Client:         Qatar Development Bank (QDB)
Product:        Dynamic Form Engine (DFE) — Designer, Frontend Runtime,
                Backend API, CRM On-Prem Runtime, Mobile Runtime,
                Shared Types, C# Publish Plugin
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-07-01
Version:        1.0
Status:         DRAFT — Pending CEO Approval
Prior phases:   DFE-ADD-001/002 (APPROVED WITH CONDITIONS)
                DFE-RC-001 (DELIVERED)
                DFE-i18n-001 (CEO APPROVED WITH CONDITIONS)
                DFE-STYLE-001 (BRD APPROVED WITH CONDITIONS,
                               Architecture pending)
                DFE-BTN-001 (BRD APPROVED)
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
═══════════════════════════════════════════════════

QDB form designers currently have no way to visually distinguish
sections with icons, add descriptive copy to tab headers, place
read-only display content (headings, instructions, or live field
mirrors) inside a form, or build a hand-crafted pre-submission
review screen. The system-generated summary step auto-produces a
flat field list that cannot be reordered, grouped, or formatted
to match QDB's presentation standards. Designers who need richer
summary layouts today must resort to custom HTML web resources
outside the DFE, breaking the engine's single-authoring-surface
promise.

This engagement (DFE-FBE-001) introduces four additive capabilities:
(1) Section icons — a qdb_icon_name attribute on qdb_form_section
mirrors the existing tab-icon pattern and propagates to all
rendering surfaces; (2) Tab descriptions — a qdb_description
attribute on qdb_form_tab adds contextual copy below the tab title
without structural change to the tab model; (3) a new Label field
type (qdb_field_type = 100000022) that renders read-only display
content — either static designer-authored text or a type-aware
live mirror of another field's current value; and (4) a
qdb_summary_mode option-set on qdb_form_definition that replaces
the legacy qdb_show_summary_step boolean with three explicit
modes — None, SystemGenerated, and Manual — where Manual mode
lets the designer build a flagged summary tab from standard
sections and Label fields, with all content rendered read-only
and type-aware.

The four features are unified by a minimal schema footprint: no new
entities, only additive nullable attributes on existing ones. Label
fields are the building block of the manual summary, enabling
designers to compose the review screen exactly as they would any
other tab, with the engine enforcing the read-only constraint
automatically. The expected business outcomes are: QDB form
designers gain full authoring control over section headers,
tab context, embedded instructions, and pre-submission review
layouts, all within the designer web resource and without writing
any custom code.


2. BUSINESS OBJECTIVES
═══════════════════════════════════════════════════

BO-001: Enable QDB form designers to assign icons to individual
        section headers across all rendering surfaces so that forms
        with multiple sections are visually navigable at a glance
        without custom CSS or HTML.

BO-002: Enable QDB form designers to add descriptive text to tab
        headers so that form users understand the purpose and scope
        of each tab before interacting with its fields.

BO-003: Enable QDB form designers to place read-only Label elements
        — static text or live data-bound mirrors — inside any
        section of any form so that instructional content, headings,
        and field summaries are managed entirely within the DFE
        designer without custom web resources.

BO-004: Enable QDB form designers to build a manually composed
        summary tab — using Label fields with optional source
        bindings — so that the pre-submission review screen matches
        QDB's presentation standards rather than being constrained
        by the auto-generated flat field list.

BO-005: Preserve full backward compatibility for all currently
        published forms and for the existing system-generated
        summary step behaviour so that no live form requires
        migration, republication, or code change after this
        engagement is deployed.


3. STAKEHOLDERS
═══════════════════════════════════════════════════

| Stakeholder                       | Role                  | Interest in this project                                                                               |
|-----------------------------------|-----------------------|--------------------------------------------------------------------------------------------------------|
| QDB Form Designers/Administrators | Primary users         | Author section icons, tab descriptions, Label fields, and manual summary tabs without developer help   |
| QDB Portal End Users              | Indirect beneficiaries| Experience clearer section headers, tab context copy, and a properly formatted pre-submission review   |
| QDB Mobile App Users              | Indirect beneficiaries | Identical icon, description, label, and summary behaviour on mobile as on the web portal              |
| QDB IT Director                   | Sign-off authority    | Dataverse schema additions; icon library governance; solution deployment approval                      |
| QDB Compliance Team               | Review authority      | Audit trail for summary content; ensure read-only enforcement in Manual summary cannot be bypassed     |
| Maqsad AI — Business Analyst      | Requirements owner    | Produces and maintains this document                                                                   |
| Maqsad AI — Architect             | Solution design       | Phase 3: shared-type extension contract; Dataverse schema; icon library choice; summary mode engine    |
| Maqsad AI — CRM Developer         | Delivery              | Dataverse attribute additions; C# plugin updates (CrmMetadataReader, FormJsonGenerator, FormDefinitionModel); CRM runtime rendering |
| Maqsad AI — Backend Developer     | Delivery              | Node.js live-metadata query path updates; Label field validation; summary mode logic                   |
| Maqsad AI — Frontend Developer    | Delivery              | Designer panels for icon, description, Label field, summary mode; portal runtime rendering             |
| Maqsad AI — Mobile Developer      | Delivery              | React Native rendering of section icons, tab descriptions, Label fields, and Manual summary tab        |
| Maqsad AI — Code Reviewer         | Quality gate          | Code review after every implementation phase before QA handover                                        |
| Maqsad AI — QA                    | Verification          | Test strategy across all four rendering surfaces; backward-compatibility regression suite              |
| Maqsad AI — Auditor               | Governance            | Phase 6 audit: read-only enforcement in summary; schema migration safety                               |


4. SCOPE
═══════════════════════════════════════════════════

4.1 IN SCOPE
────────────────────────────────────────────────────

FEATURE 1 — SECTION-LEVEL ICON:

  - A new optional attribute qdb_icon_name (single-line text,
    nullable) on the existing Dataverse entity qdb_form_section,
    mirroring the existing qdb_icon_name attribute on
    qdb_form_tab.
  - Designer UI: an "Icon" input field (or picker) in the
    Section Properties Panel, consistent in UX with the
    existing tab-icon configuration.
  - Designer canvas: a preview of the resolved icon beside the
    section name when qdb_icon_name is set.
  - Runtime rendering: when qdb_icon_name is non-null, all
    four rendering surfaces (designer canvas, frontend portal,
    in-CRM runtime, mobile) render the icon to the left of the
    section label in the section header.
  - Shared-type contract: SectionDefinition in both
    shared/src/types/form.types.ts and shared/src/types/form.ts
    extended with iconName: string | null.
  - C# plugin (CrmMetadataReader.cs + FormJsonGenerator.cs)
    and Node.js live-metadata path both populate iconName in
    the generated FormDefinition JSON.

FEATURE 2 — TAB-LEVEL DESCRIPTION:

  - A new optional attribute qdb_description (multi-line text,
    nullable) on the existing Dataverse entity qdb_form_tab,
    mirroring the existing qdb_description attribute already
    present on qdb_form_section.
  - Designer UI: a "Description" multi-line text input in the
    Tab Properties Panel.
  - Runtime rendering: when qdb_description is non-null and
    non-empty, all three non-designer runtimes render the
    description text below the tab title in the tab content
    area (exact placement is an open question — see OQ-001).
  - Shared-type contract: TabDefinition in both shared type
    files extended with description: string | null.
  - C# plugin and Node.js live-metadata path populate
    description in the generated JSON.

FEATURE 3 — LABEL FIELD TYPE:

  - A new value in the qdb_field_type option-set:
    label = 100000022 (the next sequential code after the
    current highest value, interactive-grid = 100000021).
  - A new optional attribute qdb_source_field_schema_name
    (single-line text, nullable) on the existing Dataverse
    entity qdb_form_field. This attribute is only meaningful
    when qdb_field_type = label; it is null for all other
    field types.
  - Designer UI: "Label" appears in the field type selector.
    When Label is selected: (a) an optional "Source Field"
    dropdown (populated from the current form's field schema
    names); (b) when no source is selected, a "Content" input
    for static text (see OQ-002 regarding attribute reuse
    vs. new attribute); (c) when a source is selected, a
    read-only mirror indicator replaces the content input.
  - Runtime rendering — two variants:
    (a) Static Label (no source): renders the configured
        content as read-only display text (not an input).
    (b) Data-bound Label (with source): resolves
        formValues[sourceFieldSchemaName] at render time and
        delegates to the source field's existing read-only
        renderer, producing type-aware display:
        - text / number / date: formatted value string.
        - dropdown / radio / option-set: selected option label.
        - checkbox / multi-select: selected option labels as
          comma-separated list.
        - file/document: clickable link opening the document
          via its stored URL (see OQ-004 for URL source).
        - interactive-grid: read-only tabular row display.
    (c) Data-bound Labels update live as the source field
        value changes during the form session.
  - Label fields are NEVER submitted in formData and NEVER
    generate validation errors.
  - Shared-type contract: 'label' added to FieldType union;
    FieldDefinition extended with
    sourceFieldSchemaName: string | null in both shared files.
  - C# plugin (CrmMetadataReader.cs, FormDefinitionModel.cs,
    FormJsonGenerator.cs) and Node.js live-metadata path
    populate fieldType and sourceFieldSchemaName.

FEATURE 4 — SUMMARY MODES:

  - A new option-set attribute qdb_summary_mode on
    qdb_form_definition with three values:
    None (100000001), SystemGenerated (100000002),
    Manual (100000003).
  - A new boolean attribute qdb_is_summary_tab (nullable,
    default false) on qdb_form_tab.
  - Designer UI: a "Summary Mode" selector in the Form
    Properties Panel (None / System Generated / Manual). The
    legacy qdb_show_summary_step boolean field is shown
    read-only and deprecated in the designer.
  - When Manual is selected: a "Mark as Summary Tab" toggle
    appears in the Tab Properties Panel; the designer enforces
    at most one summary tab per form.
  - Runtime behaviour by mode:
    - None: no summary step rendered.
    - SystemGenerated (or legacy qdb_show_summary_step = true
      with no qdb_summary_mode set): current auto-generated
      review step, unchanged.
    - Manual: the tab flagged qdb_is_summary_tab = true is
      treated as a standard navigation tab, but all fields
      within it are forced read-only and type-aware regardless
      of their individual configuration. It is positioned as
      the final tab in navigation order.
  - Backward compatibility: qdb_summary_mode = null signals
    the engine to fall back to reading qdb_show_summary_step.
    No published form is broken without republication.
  - Publish gate: a form with qdb_summary_mode = Manual and
    no tab marked qdb_is_summary_tab = true MAY be saved but
    SHALL NOT be published (the publish job returns a
    validation error).
  - Shared-type contract: FormDefinition extended with
    summaryMode: 'none' | 'systemGenerated' | 'manual' | null;
    showSummaryStep: boolean retained (deprecated, read-only).
    TabDefinition extended with isSummaryTab: boolean.
  - C# plugin and Node.js live-metadata path populate both
    summaryMode and isSummaryTab in the generated JSON, and
    continue to read qdb_show_summary_step for back-compat.

CROSS-CUTTING CONCERNS:

  - All four features flow through the same five-surface
    pipeline: Dataverse schema → Designer → C# publish plugin
    → Node.js live-metadata path → all three runtimes
    (portal/mobile/in-CRM).
  - No new Dataverse entities are introduced. All schema
    changes are additive nullable attributes on existing
    entities or new option-set values on existing option-sets.
  - @qdb/shared dual-barrel rule: every type change must be
    applied to both shared/src/types/form.types.ts (backend/
    frontend) and shared/src/types/form.ts (mobile) in the
    same commit.
  - Render cache: the published JSON for forms that do not
    use any of the four new features SHALL be byte-identical
    to its current output.
  - Render cache invalidation: any change to qdb_icon_name,
    qdb_description, qdb_is_summary_tab, qdb_summary_mode,
    qdb_source_field_schema_name on a published form triggers
    the existing qdb_publish_job flow unchanged.


4.2 OUT OF SCOPE
────────────────────────────────────────────────────

  - An icon picker UI (grid of clickable icons). The designer
    takes a free-text icon name string in this engagement;
    a visual picker is deferred.
  - Animated or interactive icon rendering (hover effects,
    loading states on section icons).
  - Tab description rendering inside the tab bar strip (e.g.,
    as a sub-label beneath the tab button). Placement is
    within the tab content area only; tab bar styling is
    covered by DFE-STYLE-001.
  - Rich-text / HTML formatting for tab descriptions or static
    Label content. Plain text only in this engagement.
  - Expression-based Label content (dynamic text computed from
    a DSL expression at runtime). Label content is either
    static text or a direct field value mirror. Computed
    expressions are covered by DFE-BTN-001 ExtraParams and
    are not reused for Label display in this engagement.
  - Label field translation via DFE-i18n-001. Static Label
    content will use the standard i18n key pattern if
    translated content is available, but adding new i18n
    authoring flows for Label content is deferred.
  - Conditional visibility of Label fields (show/hide based
    on other field values). Existing DFE visibility rule
    engine applies; no Label-specific extensions.
  - Partial summary modes — e.g., showing a summary for
    selected tabs only. The ManualSummary mode covers the
    full form; per-tab summaries are not in scope.
  - Automatic migration of existing forms from
    qdb_show_summary_step to qdb_summary_mode via a batch
    script. The migration path is defined as a design-time
    decision (OQ-004) but the batch script itself is out of
    scope for this engagement unless chosen as the migration
    strategy.
  - Summary tab print/PDF export. Read-only rendering is
    screen-only in this engagement.
  - File preview (inline rendering of PDFs or images) in the
    data-bound Label for file/document types. A clickable link
    to open the stored URL is the full requirement.
  - Dynamics 365 F&O integration.
  - Any DFE-STYLE-001 visual styling (colours, fonts, spacing)
    for icons, descriptions, or Label fields.
  - DFE-BTN-001 features (button placement, extra params).


5. FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

Requirements are numbered FR-001 onwards. Each is atomic and
testable. Traceability to Business Objectives is noted in
brackets.

────────────────────────────────────────────────────
GROUP A: SECTION ICON — DESIGNER [BO-001]
────────────────────────────────────────────────────

FR-001: The designer SHALL provide an "Icon Name" text input
        field within the Section Properties Panel for
        qdb_icon_name, consistent in label and placement with
        the existing "Icon Name" field in the Tab Properties
        Panel.

FR-002: The designer SHALL render a preview of the resolved
        icon adjacent to the section name in the designer
        canvas when qdb_icon_name contains a non-empty value.
        The icon preview SHALL use the same icon-rendering
        component used for tab icons.

FR-003: The designer SHALL clear the icon preview in the
        canvas when the qdb_icon_name field is emptied, with
        no empty gap or placeholder remaining in the section
        header.

FR-004: The designer SHALL persist qdb_icon_name to the
        qdb_form_section Dataverse record via the existing
        section-save flow when the form is saved.

FR-005: The designer SHALL display a validation warning (not
        a hard block) when qdb_icon_name is set to a value
        that is not recognised within the configured icon
        library. The form may still be saved with an
        unrecognised icon name.

────────────────────────────────────────────────────
GROUP B: SECTION ICON — RUNTIME [BO-001]
────────────────────────────────────────────────────

FR-006: The frontend portal runtime SHALL render the section
        icon to the left of the section label text in the
        section header when iconName is non-null and
        non-empty in the published FormDefinition.

FR-007: The in-CRM runtime (qdb_form_runtime.html) SHALL
        render the section icon in the section header when
        iconName is non-null and non-empty, using the same
        icon-rendering approach as the portal.

FR-008: The mobile runtime SHALL render the section icon in
        the section header when iconName is non-null and
        non-empty, using the appropriate React Native icon
        component.

FR-009: When iconName is null, empty, or unrecognised by the
        runtime's icon library, all runtimes SHALL render the
        section header with no icon and no empty space where
        the icon would have appeared.

────────────────────────────────────────────────────
GROUP C: TAB DESCRIPTION — DESIGNER [BO-002]
────────────────────────────────────────────────────

FR-010: The designer SHALL provide a "Description" multi-line
        text input within the Tab Properties Panel for
        qdb_description, consistent with the existing
        "Description" field in the Section Properties Panel.

FR-011: The designer SHALL persist qdb_description to the
        qdb_form_tab Dataverse record via the existing
        tab-save flow when the form is saved.

────────────────────────────────────────────────────
GROUP D: TAB DESCRIPTION — RUNTIME [BO-002]
────────────────────────────────────────────────────

FR-012: The frontend portal runtime SHALL render
        qdb_description as plain text in the tab content area
        when description is non-null and non-empty in the
        published FormDefinition. The exact vertical placement
        relative to the tab title is subject to OQ-001.

FR-013: The in-CRM runtime SHALL render qdb_description in
        the tab content area under the same placement rule as
        FR-012.

FR-014: The mobile runtime SHALL render qdb_description in
        the tab content area under the same placement rule as
        FR-012.

FR-015: When description is null or empty, all runtimes SHALL
        render the tab content area without a description
        element or empty placeholder.

────────────────────────────────────────────────────
GROUP E: LABEL FIELD TYPE — DATAVERSE SCHEMA [BO-003]
────────────────────────────────────────────────────

FR-016: The qdb_field_type option-set SHALL be extended with
        a new value: label with integer code 100000022.
        This is the next sequential code after the current
        highest value (interactive-grid = 100000021).

FR-017: The qdb_form_field entity SHALL be extended with a
        new optional single-line text attribute
        qdb_source_field_schema_name (nullable). This
        attribute has meaning only when qdb_field_type =
        100000022 (label); it SHALL be null for all other
        field types.

────────────────────────────────────────────────────
GROUP F: LABEL FIELD TYPE — DESIGNER [BO-003]
────────────────────────────────────────────────────

FR-018: The designer field type selector SHALL include "Label"
        as a selectable option in the field type dropdown,
        positioned after all existing field types.

FR-019: When field type is Label and no source field is
        selected, the designer SHALL display a "Content"
        input for static text (see OQ-002 for attribute
        storage decision).

FR-020: When field type is Label, the designer SHALL display
        an optional "Source Field" dropdown populated with
        all field schema names from the current form
        definition (excluding Label-type fields themselves,
        to prevent circular mirroring).

FR-021: When a source field is selected via FR-020, the
        designer SHALL suppress the static Content input
        (FR-019) and display a read-only indicator
        "Mirrors: [source field label / schema name]".

FR-022: The designer SHALL persist qdb_source_field_schema_name
        to the qdb_form_field Dataverse record when a source
        is configured. When no source is selected, the
        attribute SHALL be saved as null.

FR-023: The designer SHALL validate at save time that a Label
        field has either a non-empty static content value OR
        a non-null source field schema name. A Label with
        neither SHALL produce a hard validation error
        preventing the section from being saved.

FR-024: The designer SHALL display a visual indicator on
        Label fields in the canvas (e.g., an "eye" or
        "display" icon) to distinguish them from editable
        input fields at a glance.

────────────────────────────────────────────────────
GROUP G: LABEL FIELD TYPE — RUNTIME [BO-003]
────────────────────────────────────────────────────

FR-025: When rendering a field of type label with no
        qdb_source_field_schema_name, all runtimes SHALL
        render the static content text as a non-interactive
        display element, not a form input control.

FR-026: When rendering a field of type label with a
        qdb_source_field_schema_name, all runtimes SHALL
        resolve formValues[sourceFieldSchemaName] and
        delegate display to the source field's read-only
        renderer, producing type-aware output as defined in
        FR-027 through FR-033.

FR-027: When the source field type is text, number, date,
        or date-time, the data-bound Label SHALL render the
        current value as a formatted string using the source
        field's configured format settings.

FR-028: When the source field type is dropdown, radio, or
        single-select option-set, the data-bound Label SHALL
        render the selected option's display label, not its
        integer code or internal value.

FR-029: When the source field type is checkbox or
        multi-select option-set, the data-bound Label SHALL
        render all selected option display labels as a
        comma-separated list.

FR-030: When the source field type is file or document, the
        data-bound Label SHALL render the file name as a
        clickable link that opens the stored document URL in
        a new browser tab or native viewer. The link text
        SHALL be the file name, not the raw URL. The source
        of the stored URL is subject to OQ-004.

FR-031: When the source field type is interactive-grid, the
        data-bound Label SHALL render the current grid rows
        in a read-only tabular layout using the existing
        read-only grid renderer.

FR-032: A data-bound Label field SHALL re-render its
        displayed content whenever the value of
        formValues[sourceFieldSchemaName] changes during the
        form session, without requiring a page reload or
        tab switch.

FR-033: When sourceFieldSchemaName references a field not
        present in the current form definition (stale
        reference), all runtimes SHALL render the Label with
        an empty/blank display, not an error state. No
        exception or runtime crash is permitted.

FR-034: A Label field SHALL never be included in the
        formData object submitted to the backend, regardless
        of whether it has a source binding or static content.

FR-035: A Label field SHALL never trigger field-level
        validation (required, pattern, custom rules). It
        has no value to validate.

────────────────────────────────────────────────────
GROUP H: SUMMARY MODES — DATAVERSE SCHEMA [BO-004, BO-005]
────────────────────────────────────────────────────

FR-036: The qdb_form_definition entity SHALL be extended
        with a new option-set attribute qdb_summary_mode
        with the following values:
        None = 100000001, SystemGenerated = 100000002,
        Manual = 100000003.
        The attribute SHALL be nullable (no default value
        required at the database level).

FR-037: The qdb_form_tab entity SHALL be extended with a
        new boolean attribute qdb_is_summary_tab (nullable,
        treated as false when null).

FR-038: The legacy boolean attribute qdb_show_summary_step
        on qdb_form_definition SHALL NOT be removed, renamed,
        or modified in this engagement. It remains readable
        by the C# plugin and backend as a backward-
        compatibility signal.

────────────────────────────────────────────────────
GROUP I: SUMMARY MODES — DESIGNER [BO-004]
────────────────────────────────────────────────────

FR-039: The designer SHALL display a "Summary Mode" selector
        in the Form Properties Panel with three options:
        None, System Generated, and Manual.

FR-040: The designer SHALL display the legacy
        qdb_show_summary_step toggle as read-only and visually
        deprecated (greyed out, with a note: "Replaced by
        Summary Mode") when qdb_summary_mode is set. When
        qdb_summary_mode is null (legacy form opened for the
        first time), the designer SHALL show both controls,
        allowing the designer to migrate to the new selector.

FR-041: When Summary Mode is Manual, the designer SHALL
        display a "Mark as Summary Tab" toggle in the Tab
        Properties Panel for each tab.

FR-042: The designer SHALL enforce that at most one tab
        per form has qdb_is_summary_tab = true. Attempting
        to mark a second tab as summary SHALL produce a hard
        validation error: "Only one summary tab is permitted
        per form."

FR-043: When Summary Mode is None or System Generated, the
        designer SHALL disable (not hide) the "Mark as
        Summary Tab" toggle on all tabs and display a tooltip:
        "Enable Manual summary mode to designate a summary tab."

FR-044: The designer SHALL persist qdb_summary_mode to
        qdb_form_definition and qdb_is_summary_tab to each
        qdb_form_tab record via the existing save flow.

FR-045: The designer SHALL display a publish-time validation
        error when qdb_summary_mode = Manual and no tab in
        the form has qdb_is_summary_tab = true. The error
        message SHALL read: "Manual summary mode requires a
        designated summary tab. Mark one tab as the summary
        tab before publishing."

────────────────────────────────────────────────────
GROUP J: SUMMARY MODES — RUNTIME [BO-004, BO-005]
────────────────────────────────────────────────────

FR-046: When summaryMode is 'none' in the published
        FormDefinition, all runtimes SHALL NOT render any
        summary step, review screen, or auto-generated field
        list at any point during the form session.

FR-047: When summaryMode is 'systemGenerated' in the
        published FormDefinition, all runtimes SHALL render
        the existing auto-generated summary step unchanged
        (current behaviour).

FR-048: When summaryMode is null or absent in the published
        FormDefinition AND showSummaryStep is true, all
        runtimes SHALL fall back to systemGenerated behaviour
        (FR-047). This is the backward-compatibility path for
        all currently published forms.

FR-049: When summaryMode is null or absent in the published
        FormDefinition AND showSummaryStep is false or null,
        all runtimes SHALL default to none behaviour (FR-046).

FR-050: When summaryMode is 'manual', all runtimes SHALL
        identify the tab where isSummaryTab is true and
        position it as the final navigation step. If the
        tab's displayOrder does not place it last among
        visible tabs, the runtime SHALL treat it as last
        regardless of displayOrder.

FR-051: When summaryMode is 'manual' and the active tab is
        the summary tab, all runtimes SHALL render every
        field within that tab as read-only and type-aware,
        regardless of the field's individual isRequired,
        isReadOnly, or fieldType configuration. Label fields
        within the summary tab delegate to their read-only
        renderer as per FR-026 through FR-031.

FR-052: When summaryMode is 'manual' and the active tab is
        the summary tab, all runtimes SHALL prevent user
        input on any field control within the tab. No field
        within the summary tab shall accept keyboard input,
        mouse selection, or touch interaction.

FR-053: When summaryMode is 'manual' and the summary tab
        contains data-bound Label fields, those Label fields
        SHALL display the values as populated by the user in
        the earlier tabs, reflecting the state of formValues
        at the time the summary tab is displayed.

────────────────────────────────────────────────────
GROUP K: C# PLUGIN AND NODE.JS GENERATOR [ALL BOs]
────────────────────────────────────────────────────

FR-054: CrmMetadataReader.cs SHALL be updated to retrieve
        qdb_icon_name from qdb_form_section records in the
        same OData/FetchXML query that retrieves other
        section attributes.

FR-055: CrmMetadataReader.cs SHALL be updated to retrieve
        qdb_description and qdb_is_summary_tab from
        qdb_form_tab records in the same query that retrieves
        other tab attributes.

FR-056: CrmMetadataReader.cs SHALL be updated to retrieve
        qdb_summary_mode (and continue to retrieve
        qdb_show_summary_step) from qdb_form_definition
        records in the form-level query.

FR-057: CrmMetadataReader.cs SHALL be updated to retrieve
        qdb_source_field_schema_name from qdb_form_field
        records in the same query that retrieves other field
        attributes.

FR-058: FormDefinitionModel.cs SHALL be extended with
        properties for all four new schema additions:
        section.IconName (string?), tab.Description (string?),
        tab.IsSummaryTab (bool), form.SummaryMode (enum?),
        field.SourceFieldSchemaName (string?).

FR-059: FormJsonGenerator.cs SHALL serialize all new
        properties into the published FormDefinition JSON
        when their values are non-null. When all new values
        are null for a given form, the serialized JSON
        SHALL be byte-identical to the current output for
        that form.

FR-060: The Node.js live-metadata query path SHALL retrieve
        and expose all four new Dataverse attributes in the
        same manner as the C# plugin, producing a
        structurally identical FormDefinition object for the
        same form definition.

────────────────────────────────────────────────────
GROUP L: SHARED TYPE CONTRACT [ALL BOs]
────────────────────────────────────────────────────

FR-061: SectionDefinition in both shared/src/types/form.types.ts
        AND shared/src/types/form.ts SHALL be extended with
        an optional property iconName: string | null or
        iconName?: string.

FR-062: TabDefinition in both shared type files SHALL be
        extended with optional properties
        description: string | null and isSummaryTab: boolean
        (defaulting to false when absent).

FR-063: FormDefinition in both shared type files SHALL be
        extended with optional property
        summaryMode: 'none' | 'systemGenerated' | 'manual' | null.
        The existing showSummaryStep: boolean property SHALL
        be retained as deprecated but never removed.

FR-064: FieldDefinition in both shared type files SHALL be
        extended with an optional property
        sourceFieldSchemaName: string | null, present
        for all field types (null for non-label fields).

FR-065: The FieldType union in both shared type files SHALL
        be extended with the literal 'label'. All existing
        FieldType values are unchanged.

FR-066: Any PR that modifies shared/src/types/form.types.ts
        without a simultaneous, equivalent modification to
        shared/src/types/form.ts (or vice versa) SHALL be
        rejected at code review. A CI structural-consistency
        check SHALL enforce this per the pattern established
        in DFE-BTN-001.

────────────────────────────────────────────────────
GROUP M: BACKWARD COMPATIBILITY [BO-005]
────────────────────────────────────────────────────

FR-067: All existing published forms (those where all four
        new attributes are null) SHALL render identically on
        all runtimes after this engagement is deployed.
        Zero republication is required for existing live forms.

FR-068: The system-generated summary step (forms with
        qdb_show_summary_step = true and
        qdb_summary_mode = null) SHALL continue to function
        without republication or code change for all forms
        currently using it.

FR-069: The render cache payload structure for forms that do
        not use any of the four new features SHALL not change.
        New properties are additive and nullable; existing
        JSON parsers that do not read iconName, description,
        isSummaryTab, summaryMode, or sourceFieldSchemaName
        will ignore them without error.

FR-070: The qdb_field_type option-set extension (adding
        label = 100000022) SHALL be additive and SHALL NOT
        change the integer codes of any existing option-set
        values.


6. NON-FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

NFR-001: BACKWARD COMPATIBILITY — BYTE-IDENTICAL CACHE
        The C# publish plugin (FormJsonGenerator.cs) and
        the Node.js live-metadata path SHALL produce
        byte-identical FormDefinition JSON output for any
        form in which all four new attributes
        (qdb_icon_name on section, qdb_description and
        qdb_is_summary_tab on tab, qdb_summary_mode on form,
        qdb_source_field_schema_name on field) are null. A
        CI regression test SHALL compare published JSON
        snapshots for at least three existing production-
        representative forms before and after the deployment
        and fail if any diff is detected.

NFR-002: BACKWARD COMPATIBILITY — LEGACY BOOLEAN HONOURED
        When qdb_summary_mode is null, the runtime summary
        step decision SHALL be identical to the current
        production behaviour driven solely by
        qdb_show_summary_step. This guarantee SHALL hold
        across all three runtimes and both JSON-generation
        paths (C# plugin and Node.js live-metadata) without
        any form requiring republication.

NFR-003: ALL-SURFACE PARITY
        Every new schema attribute populated in the
        FormDefinition JSON SHALL be read and rendered
        correctly by all four surfaces: (1) designer canvas,
        (2) frontend portal (Next.js), (3) in-CRM runtime
        (qdb_form_runtime.html), (4) React Native mobile app.
        A surface that silently ignores a new attribute (e.g.,
        mobile not rendering section icons, in-CRM runtime
        not enforcing Manual summary read-only) is a defect.
        QA SHALL include an all-surface parity test matrix
        covering all four features across all four surfaces.

NFR-004: ADDITIVE SCHEMA — ZERO-DOWNTIME DEPLOY
        All Dataverse schema additions in this engagement
        (four new attributes and one new option-set value)
        SHALL be nullable or have a safe default, such that
        the Dataverse solution import completes without
        updating existing data records and without requiring
        a Dynamics CRM restart or maintenance window. No
        attribute in this engagement is NOT NULL without a
        default value.

NFR-005: PERFORMANCE — LABEL FIELD RENDERING
        Rendering a data-bound Label field (resolving
        formValues[sourceFieldSchemaName] and delegating to
        the read-only renderer) SHALL add no more than 16ms
        of additional render latency per Label field on a tab
        with up to 10 Label fields. The read-only renderer
        reuse requirement means no new async data fetch is
        introduced for Label rendering.

NFR-006: PERFORMANCE — PUBLISH JOB
        The C# publish plugin query extensions required for
        the four new attributes SHALL not increase the total
        publish-job execution time by more than 5% versus
        the current baseline, measured on a form definition
        with 5 tabs, 20 sections, and 80 fields. New
        attributes SHALL be retrieved in the same FetchXML
        queries already issued for their parent entities —
        no additional round-trip queries are permitted.

NFR-007: AVAILABILITY
        All four new features are configuration-time
        additions to the published FormDefinition render
        cache. Loss of live Dataverse connectivity SHALL
        not affect rendering of section icons, tab
        descriptions, Label fields, or Manual summary tabs
        on forms served from a valid render cache record.
        The existing cache-served availability guarantee
        applies equally to these features.

NFR-008: SECURITY — READ-ONLY ENFORCEMENT
        The Manual summary tab's read-only enforcement
        (FR-051, FR-052) SHALL be enforced at the runtime
        rendering layer, not merely by setting HTML input
        attributes to disabled. Specifically: (a) the
        frontend portal SHALL not register change handlers
        on summary-tab fields; (b) the mobile runtime SHALL
        render summary-tab fields using read-only display
        components, not editable input components; (c) the
        in-CRM runtime SHALL not register Xrm field-change
        listeners on summary-tab fields. Bypassing the
        read-only state via browser developer tools or
        direct DOM manipulation SHALL produce no change to
        the submitted formData because Label fields are
        excluded from formData assembly (FR-034).

NFR-009: SECURITY — NO OPEN REDIRECT FROM LABEL LINKS
        The clickable document link rendered by a data-bound
        Label field for file/document source fields (FR-030)
        SHALL open the stored URL directly. The URL SHALL
        NOT be constructed from user-supplied runtime input
        or concatenated from form field values. The stored
        URL is determined by the file upload flow, not by
        the Label field or the form user. No allowlist
        validation is required because the URL is
        server-stored, not user-entered at runtime.

NFR-010: SCALABILITY
        The schema additions support forms of any current
        size (up to 5 tabs, 20 sections, 80 fields as per
        the current production maximum). A Manual summary
        tab may contain up to 20 Label fields (bound or
        static) without performance degradation beyond
        NFR-005. No hard limits are introduced by this
        engagement.

NFR-011: COMPLIANCE
        Label field content (static or data-bound) is
        display-only and is not submitted to the backend or
        stored in any submission record. No new personal
        data fields are introduced. qdb_description on
        qdb_form_tab and qdb_icon_name on qdb_form_section
        are form-configuration metadata classified as
        Internal sensitivity. qdb_source_field_schema_name
        stores a schema name string (not personal data).

NFR-012: SHARED TYPE CONSISTENCY — CI ENFORCEMENT
        A CI structural-consistency check (per the pattern
        established in DFE-BTN-001 CR-002) SHALL compare the
        key set of new properties in form.types.ts against
        form.ts after every build. Any structural divergence
        between the two files SHALL cause the CI build to
        fail. TypeScript strict mode compilation across all
        packages (backend, frontend, mobile) provides
        additional type-drift detection at build time.


7. BUSINESS RULES
═══════════════════════════════════════════════════

BR-001: A Label field SHALL never appear in the formData
        object assembled by any runtime for submission to
        the backend. This applies regardless of whether the
        Label has a source binding or static content.

BR-002: qdb_source_field_schema_name on a Label field MUST
        reference a field within the same form definition.
        Cross-form references are not permitted. The designer
        SHALL enforce this at configuration time; the runtime
        SHALL handle stale references gracefully (FR-033).

BR-003: A form with qdb_summary_mode = Manual MUST have
        exactly one tab with qdb_is_summary_tab = true
        before it can be published. It MAY be saved in an
        intermediate state with zero summary tabs (designer
        in progress), but the publish job SHALL reject it
        with a descriptive error (FR-045).

BR-004: qdb_is_summary_tab = true is only meaningful when
        qdb_summary_mode = Manual. When summaryMode is None
        or SystemGenerated, the isSummaryTab flag on all
        tabs SHALL be ignored by all runtimes and by the
        publish job.

BR-005: The summary mode precedence rule: qdb_summary_mode
        takes priority over qdb_show_summary_step when
        qdb_summary_mode is non-null. The legacy boolean is
        consulted only when qdb_summary_mode is null.

BR-006: In Manual summary mode, the summary tab is always
        the last tab in navigation order. A "Next Step"
        button on the penultimate tab navigates to the
        summary tab. No "Next Step" button on the summary
        tab itself is permitted.

BR-007: A Label field with a source binding that references
        a field whose qdb_field_type is also label (circular
        mirror) SHALL be prevented by the designer
        (FR-020 excludes Label fields from the source
        dropdown). If such a configuration exists in legacy
        data, the runtime SHALL render the Label as blank
        (FR-033 fallback).

BR-008: The integer code for the new label option-set value
        (100000022) is permanent and immutable. It must not
        be reused for any other field type in this or any
        future engagement.

BR-009: qdb_icon_name on qdb_form_section uses the same
        icon identifier format as qdb_icon_name on
        qdb_form_tab. The icon library and identifier
        convention are confirmed in Phase 3 architecture;
        the two attributes are governed by the same library
        contract.

BR-010: Static Label content (no source binding) is
        design-time authored text. It is stored in Dataverse
        as a configuration value and included in the render
        cache. It is NOT user-entered data and SHALL NOT be
        validated against field validation rules.


8. USER STORIES
═══════════════════════════════════════════════════

US-01: As a QDB form designer, I want to assign an icon
       to a section so that users can visually identify
       sections at a glance when scrolling a long form.
       Priority: Must Have
       Acceptance criteria:
         Given a form with two sections and no section icons,
         When I open Section 1 properties, enter "DocumentBullet"
         in the Icon Name field, and save the form,
         Then the designer canvas renders the icon to the
         left of "Section 1" in the section header,
         And the published FormDefinition JSON contains
         iconName: "DocumentBullet" in the section record,
         And the portal renders the icon to the left of the
         section label on the live form.

US-02: As a QDB form designer, I want to add a description
       to a tab so that applicants understand the purpose
       of that tab before filling in any fields.
       Priority: Must Have
       Acceptance criteria:
         Given a form with a tab titled "Financial Details",
         When I open the Tab Properties Panel, enter "Please
         provide your income and expense information for the
         last 12 months." in the Description field, and save,
         Then the published FormDefinition JSON contains the
         description in the tab record,
         And the portal renders the description text below
         the tab title when "Financial Details" is the
         active tab,
         And the mobile runtime renders the same description
         in the same relative position.

US-03: As a QDB form designer, I want to place a static
       heading Label at the top of a section so that I can
       introduce a group of fields with a formatted title
       without creating a visible input field.
       Priority: Must Have
       Acceptance criteria:
         Given a section with three input fields,
         When I add a new field, set its type to Label,
         leave Source Field empty, set Content to "Guarantor
         Information", set display order to 1, and save,
         Then the portal renders "Guarantor Information" as
         plain display text above the other fields in the
         section,
         And the Label field is absent from the formData
         in the submitted payload.

US-04: As a QDB form designer, I want to place a data-bound
       Label on the summary tab that mirrors the applicant's
       selected financing type so that the reviewer can see
       the key selection without editing it.
       Priority: Must Have
       Acceptance criteria:
         Given a form where Tab 2 has a dropdown field
         "Financing Type" with schema name "qdb_financingtype",
         And the form's Summary Mode is Manual,
         And Tab 3 is marked as the summary tab,
         When I add a Label field in Tab 3 Section 1 with
         Source Field = qdb_financingtype,
         And the applicant selects "Islamic Finance" from
         the dropdown on Tab 2,
         Then on Tab 3 the Label renders "Islamic Finance"
         (the option label, not the integer code) as
         read-only text,
         And the Label updates immediately if the applicant
         navigates back to Tab 2 and changes their selection
         before submitting.

US-05: As a QDB form designer, I want to switch a form from
       System Generated summary to Manual summary so that
       I can build a custom review screen that groups fields
       by topic rather than presenting a flat auto-list.
       Priority: Must Have
       Acceptance criteria:
         Given a form with qdb_show_summary_step = true and
         no qdb_summary_mode set,
         When I open Form Properties, change Summary Mode
         to "Manual", mark Tab 4 as the Summary Tab, and
         publish,
         Then the runtime no longer shows the auto-generated
         review step,
         And Tab 4 is rendered as the final navigation step
         with all its fields forced read-only,
         And the designer shows the legacy qdb_show_summary_step
         toggle as greyed out and deprecated.

US-06: As a QDB portal end user, I want the summary tab to
       show a clickable link to the document I uploaded so
       that I can verify I attached the correct file before
       submitting.
       Priority: Must Have
       Acceptance criteria:
         Given a Manual summary tab with a data-bound Label
         whose source is a file upload field
         "Supporting Document" (schema name qdb_supportingdoc),
         And the applicant has uploaded "passport_copy.pdf",
         When the applicant navigates to the summary tab,
         Then the Label renders "passport_copy.pdf" as a
         clickable hyperlink,
         And clicking the link opens the stored document URL
         in a new browser tab,
         And no file upload control or re-upload prompt is
         shown.

US-07: As a QDB form designer, I want existing published
       forms to continue working exactly as before this
       release, without any republication step.
       Priority: Must Have
       Acceptance criteria:
         Given any form currently published to the render
         cache with qdb_show_summary_step = true and no new
         attributes set,
         When the DFE-FBE-001 deployment completes,
         Then the portal renders the auto-generated summary
         step identically to the pre-deployment behaviour,
         And no error is logged,
         And the render cache record is unchanged (no
         automatic republication occurs).


9. DATA REQUIREMENTS
═══════════════════════════════════════════════════

| Entity / Change                          | Est. Volume            | Retention            | Sensitivity |
|------------------------------------------|------------------------|----------------------|-------------|
| qdb_form_section.qdb_icon_name           | 1 nullable text col;   | Lifetime of form     | Internal    |
| (new attr, existing entity)              | ~500 section records   | definition           |             |
| qdb_form_tab.qdb_description             | 1 nullable text col;   | Lifetime of form     | Internal    |
| (new attr, existing entity)              | ~300 tab records       | definition           |             |
| qdb_form_tab.qdb_is_summary_tab          | 1 nullable bool col;   | Lifetime of form     | Internal    |
| (new attr, existing entity)              | ~300 tab records       | definition           |             |
| qdb_form_definition.qdb_summary_mode     | 1 nullable option-set; | Lifetime of form     | Internal    |
| (new attr, existing entity)              | ~100 form records      | definition           |             |
| qdb_form_field.qdb_source_field_         | 1 nullable text col;   | Lifetime of form     | Internal    |
| schema_name (new attr, existing entity)  | ~8,000 field records   | definition           |             |
| qdb_field_type option-set extension      | +1 value               | Permanent            | Internal    |
| (label = 100000022)                      | (additive)             |                      |             |

No new entities are introduced. All changes are additive
and nullable on existing Dataverse entities.

New shared type additions (not persisted — runtime only):
  - SectionDefinition.iconName: string | null (optional)
  - TabDefinition.description: string | null (optional)
  - TabDefinition.isSummaryTab: boolean (optional)
  - FormDefinition.summaryMode: enum | null (optional, additive)
  - FieldDefinition.sourceFieldSchemaName: string | null (optional)
  - FieldType union: + 'label'


10. CROSS-SURFACE CONSISTENCY REQUIREMENT
═══════════════════════════════════════════════════

CR-001: The published FormDefinition JSON (from the render
        cache) is the single source of truth consumed by all
        runtimes. All four new features are expressed entirely
        through this JSON; no runtime reads Dataverse directly
        at render time.

CR-002: Any change to new properties in
        shared/src/types/form.types.ts MUST be simultaneously
        applied to shared/src/types/form.ts. A CI check SHALL
        enforce this. TypeScript strict mode catches type drift
        at build time for backend, frontend, and mobile.

CR-003: The C# plugin (FormJsonGenerator.cs) and the Node.js
        live-metadata path MUST produce structurally identical
        FormDefinition JSON for the same form definition. A
        CI snapshot comparison test SHALL validate this for
        at least one representative form definition.


11. INTEGRATION DEPENDENCIES
═══════════════════════════════════════════════════

| System                               | Integration type        | Data exchanged                                                                           | Direction         |
|--------------------------------------|-------------------------|------------------------------------------------------------------------------------------|-------------------|
| Dataverse (qdb_form_section)         | OData / Xrm.WebApi      | qdb_icon_name: read by C# plugin + Node.js; write by designer save flow                 | Designer → CRM    |
| Dataverse (qdb_form_tab)             | OData / Xrm.WebApi      | qdb_description, qdb_is_summary_tab: read by plugin + Node.js; write by designer        | Designer → CRM    |
| Dataverse (qdb_form_definition)      | OData / Xrm.WebApi      | qdb_summary_mode (new), qdb_show_summary_step (read-only legacy): read by plugin + Node.js; write by designer | Designer → CRM |
| Dataverse (qdb_form_field)           | OData / Xrm.WebApi      | qdb_source_field_schema_name, qdb_field_type extended: read by plugin + Node.js; write by designer | Designer → CRM |
| C# Publish Plugin (Qdb.FormEngine)   | Internal CRM plugin     | CrmMetadataReader.cs, FormDefinitionModel.cs, FormJsonGenerator.cs extended for new attrs | CRM Plugin        |
| Node.js Backend (live-metadata path) | Internal service        | Live metadata query extended to retrieve all four new attributes                         | Backend → CRM     |
| Render Cache (qdb_form_render_cache) | OData write (publish)   | Extended FormDefinition JSON (additive new fields)                                       | Plugin → CRM      |
| @qdb/shared package                  | npm package reference   | SectionDefinition, TabDefinition, FormDefinition, FieldDefinition, FieldType extended    | All runtimes      |
| Frontend Portal (Next.js)            | Reads render cache JSON | Renders iconName, description, Label fields, Manual summary tab                          | Cache → Portal    |
| In-CRM Runtime (qdb_form_runtime.html)| Reads render cache JSON | Renders iconName, description, Label fields, Manual summary tab via Xrm context          | Cache → CRM RT    |
| React Native Mobile App              | Reads render cache JSON | Renders iconName, description, Label fields, Manual summary tab                          | Cache → Mobile    |
| PicklistMapper.cs (C# plugin)        | Internal module         | Maps qdb_summary_mode option-set integer codes to enum values in FormDefinitionModel      | Internal          |


12. ASSUMPTIONS
═══════════════════════════════════════════════════

A-001: The icon identifier format for qdb_icon_name on
       qdb_form_section is the same string-based format
       already used by the existing qdb_icon_name on
       qdb_form_tab. If the tab icon uses Fluent UI v9
       icon names (e.g., "DocumentBullet"), sections will
       use the same. Confirmation is required from the
       frontend developer in Phase 3.

A-002: The existing read-only renderer for each field type
       (text, dropdown, checkbox, file, grid) is a reusable
       React/React Native component that can be invoked
       independently of the form-edit mode. The Label
       field's type-aware delegation (FR-026 through FR-031)
       relies on this reusability. If any field type does
       not have a standalone read-only renderer, one must
       be extracted as part of this engagement.

A-003: The Dataverse org (org5869857f) has capacity for the
       five new nullable attributes and one new option-set
       value without exceeding managed solution limits.

A-004: The CRM on-prem instance (Dynamics CRM 9.1, per
       PLUGIN-REGISTRATION.md) supports addition of nullable
       attributes to existing entities without requiring an
       upgrade or schema migration downtime.

A-005: The existing qdb_publish_job plugin correctly includes
       all attributes queried by CrmMetadataReader.cs in its
       FetchXML. The architect must confirm whether the
       FetchXML is dynamically constructed from the model or
       hardcoded — hardcoded queries will need manual extension.

A-006: For the Manual summary tab, the "stored URL" for
       file/document fields is accessible directly from the
       value stored in formValues[sourceFieldSchemaName] at
       runtime. If the file field's value is a Dataverse
       annotation ID rather than a direct URL, the runtime
       will need to construct the download URL from the
       annotation ID. Architecture must resolve this
       (OQ-004).

A-007: The designer's existing section-save and tab-save
       flows POST the complete section/tab record to the
       backend, which then upserts to Dataverse. Adding new
       attributes to these payloads is additive and does not
       require new API endpoints.

A-008: The backward-compatibility path (reading
       qdb_show_summary_step when qdb_summary_mode is null)
       will remain in place indefinitely. No forced migration
       timeline is imposed by this engagement. OQ-004
       addresses the optional migration strategy separately.


13. CONSTRAINTS
═══════════════════════════════════════════════════

C-001: The C# plugin assembly (Qdb.FormEngine.Plugins.dll)
       targets .NET Framework 4.6.2 and runs in CRM sandbox
       mode. All model extensions (FormDefinitionModel.cs)
       and serialization changes (FormJsonGenerator.cs) must
       be compatible with .NET 4.6.2 and JSON.NET (Newtonsoft)
       as used in the existing plugin.

C-002: All new Dataverse attribute names must follow the
       qdb_ prefix convention. The four new attributes
       (qdb_icon_name on section, qdb_description and
       qdb_is_summary_tab on tab, qdb_source_field_schema_name
       on field, qdb_summary_mode on form definition) must be
       registered in the relevant constants file (formAttributeNames.ts
       or equivalent C# constants) before any service code
       references them.

C-003: The shared type files (form.types.ts, form.ts) are
       consumed by TypeScript strict mode in all packages.
       New types must have no implicit any, must not break
       existing discriminated union exhaustiveness checks
       (particularly the FieldType union switch), and must
       not introduce breaking changes to any existing
       optional property.

C-004: The render cache byte-identity requirement (NFR-001)
       constrains the JSON serialization strategy: new
       nullable properties must serialize as absent (omitted)
       rather than as null when their values are null, to
       preserve the exact existing JSON structure for
       unaffected forms. The architect must confirm whether
       the existing serializer (JSON.NET / Node.js JSON
       serializer) is configured to omit null fields.

C-005: No new Dataverse entities are introduced in this
       engagement. All schema additions are attributes on
       existing entities. Any deviation from this constraint
       requires an ADR and CEO approval.

C-006: The in-CRM runtime (qdb_form_runtime.html) is a
       self-contained web resource with no external CDN
       access. Any new icon-rendering dependency (e.g., a
       Fluent UI icon font) must be bundled into the web
       resource package and must not exceed the CRM web
       resource file-size limit.


14. RISKS AND OPEN QUESTIONS
═══════════════════════════════════════════════════

| Risk / Question                                                                | Impact                                                                                       | Owner                              | Resolution needed by          |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| OQ-001: Where exactly is qdb_description rendered relative to the tab title?  | Determines the CSS/layout contract shared across portal, mobile, and in-CRM. Options:        | QDB Form Designers +               | Before Phase 3 architecture   |
| Options: (a) below tab title in the tab content area as the first element      | (a) is inside the tab panel, (b) is inside the tab button strip (affects STYLE-001 boundary).| Maqsad AI Architect                |                               |
| above sections; (b) as a subtitle inside the tab button strip; (c) as a        | Confirm with QDB before Phase 3 to lock the placement contract.                              |                                    |                               |
| tooltip on hover. Which placement do QDB designers expect?                     |                                                                                              |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| OQ-002: Should static Label content (headings, instructions) reuse the         | Using qdb_default_value risks semantic collision and may break existing default-value logic  | Maqsad AI Architect + BA           | Before Phase 3 architecture   |
| existing qdb_default_value attribute on qdb_form_field, or require a new       | for input fields. A new dedicated attribute (e.g., qdb_static_content) is cleaner but       |                                    |                               |
| dedicated attribute (e.g., qdb_static_content)?                                | adds one more schema change. Recommend new attribute; architect to confirm.                  |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| OQ-003: What is the icon library and identifier format for section icons?       | The designer UX, the CSS bundle for in-CRM, and the React Native icon import strategy all   | Maqsad AI Architect +              | Before Phase 3 architecture   |
| Is it the same Fluent UI v9 icon-name string used by existing tab icons?       | depend on this decision. If a different format, the designer needs separate icon pickers.   | Frontend Developer                 |                               |
| Does the existing tab icon use a free-text name or a picker-constrained value? |                                                                                              |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| OQ-004: What is the exact stored-URL source for the file/document type-aware   | Determines whether the data-bound Label's file link can be resolved from formValues alone   | Maqsad AI Architect +              | Before Phase 4 runtime build  |
| rendering in a data-bound Label (FR-030)? Is formValues[sourceFieldSchemaName] | or requires an additional Dataverse annotation lookup. An annotation-based URL adds async   | CRM Developer                      |                               |
| a direct URL, a Dataverse annotation ID, or a blob reference?                  | complexity to the runtime and potential auth issues in the in-CRM context.                  |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| OQ-005: What is the migration strategy for existing forms that currently use   | Options: (a) lazy — no migration, legacy boolean honoured indefinitely; (b) on-publish     | QDB IT Director +                  | Before Phase 4 build starts   |
| qdb_show_summary_step = true? Should a migration script set                    | migration — publish job sets qdb_summary_mode when it detects the legacy boolean;           | Maqsad AI BA                       |                               |
| qdb_summary_mode = SystemGenerated on those forms?                             | (c) designer-driven — alert shown when form is opened. Choice affects Phase 4 scope.        |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| OQ-006: Should the designer or publish job validate that                        | A stale reference (source field deleted after Label created) silently renders blank.         | Maqsad AI Architect +              | Before Phase 3 architecture   |
| qdb_source_field_schema_name references a field that still exists in the       | Options: (a) publish-time warning (soft), (b) publish-time hard block, (c) runtime-only     | QDB Form Designers                 |                               |
| same form definition? What is the policy for stale references?                 | graceful blank. Client to confirm acceptable user experience for stale references.           |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| RISK-001: The existing read-only renderer for each field type may not be a     | Medium — if field type renderers are tightly coupled to edit-mode form context (e.g.,       | Maqsad AI Frontend Developer       | Phase 3 architecture          |
| standalone reusable component. The data-bound Label's type-aware delegation    | they read from a FormContext prop that only exists in edit mode), a refactor is required    | + Mobile Developer                 |                               |
| (FR-026 through FR-031) depends on calling that renderer in isolation.         | before the Label feature can be implemented. This is the highest-risk assumption.           |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| RISK-002: The JSON serializer's null-omission behaviour may differ between     | Medium — if the C# JSON.NET serializer and the Node.js JSON serializer handle null          | Maqsad AI CRM Developer +          | Phase 3 architecture          |
| the C# plugin (JSON.NET / Newtonsoft) and the Node.js live-metadata path.     | properties differently (one omits, one serialises as null), the byte-identity requirement  | Backend Developer                  |                               |
| NFR-001 requires byte-identical output for forms with all-null new attrs.      | (NFR-001) cannot be met without explicit serializer configuration in both paths.            |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| RISK-003: qdb_form_runtime.html (in-CRM) bundles its icon dependency.         | Medium — if the Fluent UI icon bundle for the section icon feature is large, it may        | Maqsad AI CRM Developer            | Before Phase 4 CRM build      |
| Adding section icon rendering may require bundling an icon font or sprite.     | breach the Dynamics CRM web resource file-size limit. The architect must assess bundle     |                                    |                               |
| Web resource size limit on CRM on-prem 9.1 must be verified.                  | size and consider a lightweight alternative (e.g., SVG inline or icon subset).             |                                    |                               |
|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------|-------------------------------|
| RISK-004: Two shared type files diverging during parallel development.          | Medium — any divergence causes mobile-specific runtime bugs. The CI structural             | All developers                     | Ongoing — enforced by CI      |
| (form.types.ts for backend/frontend vs. form.ts for mobile)                    | consistency check (NFR-012) mitigates but does not eliminate the risk during active dev.   |                                    |                               |


15. GLOSSARY
═══════════════════════════════════════════════════

Label Field          A new DFE field type (qdb_field_type =
                     100000022) that renders read-only display
                     content — either static designer-authored
                     text or a type-aware live mirror of
                     another field's current value. Label
                     fields produce no formData value.

Static Label         A Label field with no source binding
                     (qdb_source_field_schema_name is null).
                     Renders designer-authored text content
                     (headings, instructions, notes).

Data-Bound Label     A Label field with a source binding
                     (qdb_source_field_schema_name references
                     another field's schemaName). Resolves
                     and renders the current runtime value
                     of the source field using the source
                     field's read-only renderer.

Section Icon         The optional qdb_icon_name attribute on
                     qdb_form_section, rendered in the section
                     header to the left of the section label,
                     using the same icon library as tab icons.

Tab Description      The optional qdb_description attribute on
                     qdb_form_tab, rendered as plain text in
                     the tab content area below the tab title.

Summary Mode         The qdb_summary_mode option-set on
                     qdb_form_definition controlling pre-
                     submission review behaviour:
                     None, SystemGenerated, or Manual.

SystemGenerated      The existing auto-built review step that
                     produces a flat list of all filled fields.
                     Triggered by summaryMode = systemGenerated
                     or (legacy) qdb_show_summary_step = true.

Manual Summary       A designer-built summary tab (flagged
                     qdb_is_summary_tab = true) containing
                     sections and Label fields arranged freely.
                     All content in the tab is forced read-only
                     and type-aware by the runtime.

Summary Tab          The qdb_form_tab record with
                     qdb_is_summary_tab = true within a form
                     using Manual summary mode. Rendered as the
                     final navigation step.

Type-Aware Rendering The practice of displaying a field's
                     value in the format appropriate to its
                     field type: the selected option label for
                     dropdowns, a clickable filename for file
                     fields, formatted date strings, etc.
                     The data-bound Label delegates to the
                     source field's existing read-only renderer
                     to achieve type-awareness.

Render Cache         The qdb_form_render_cache Dataverse entity
                     that stores pre-generated published
                     FormDefinition JSON for fast serving by
                     the backend API. All four new features are
                     expressed through the published JSON.

qdb_show_summary_step  The legacy boolean attribute on
                     qdb_form_definition that controls whether
                     the system-generated summary step appears.
                     Deprecated in favour of qdb_summary_mode
                     but retained for backward compatibility.

Dual Barrels         The two shared type files:
                     shared/src/types/form.types.ts (consumed
                     by backend and frontend) and
                     shared/src/types/form.ts (consumed by
                     mobile). Both must be kept in sync.

CrmMetadataReader    The C# class in the Qdb.FormEngine plugin
                     responsible for querying Dataverse to
                     retrieve form definition metadata for
                     inclusion in the render cache.

FormJsonGenerator    The C# class in the Qdb.FormEngine plugin
                     responsible for serializing the
                     FormDefinitionModel into the published
                     FormDefinition JSON.


16. REQUIREMENTS TRACEABILITY MATRIX
═══════════════════════════════════════════════════

| User Story | Functional Requirements                                    | Test Case (QA fills) | Status |
|------------|------------------------------------------------------------|----------------------|--------|
| US-01      | FR-001, FR-002, FR-004, FR-006, FR-007, FR-008, FR-009     | TC-XXX (pending)     | Draft  |
|            | FR-054, FR-059, FR-061                                     |                      |        |
| US-02      | FR-010, FR-011, FR-012, FR-013, FR-014, FR-015             | TC-XXX (pending)     | Draft  |
|            | FR-055, FR-059, FR-062                                     |                      |        |
| US-03      | FR-018, FR-019, FR-023, FR-024, FR-025, FR-034, FR-035     | TC-XXX (pending)     | Draft  |
|            | FR-064, FR-065                                             |                      |        |
| US-04      | FR-020, FR-021, FR-022, FR-026, FR-028, FR-032, FR-051     | TC-XXX (pending)     | Draft  |
|            | FR-053, FR-057, FR-060, FR-064                             |                      |        |
| US-05      | FR-039, FR-040, FR-041, FR-044, FR-045, FR-050, FR-051     | TC-XXX (pending)     | Draft  |
|            | FR-052, FR-056, FR-059, FR-063                             |                      |        |
| US-06      | FR-026, FR-030, FR-051, FR-053                             | TC-XXX (pending)     | Draft  |
| US-07      | FR-048, FR-049, FR-067, FR-068, FR-069, FR-070             | TC-XXX (pending)     | Draft  |
|            | NFR-001, NFR-002                                           |                      |        |
| CR-001     | FR-061, FR-062, FR-063, FR-064, FR-065, FR-066             | TC-XXX (pending)     | Draft  |
|            | NFR-012                                                    |                      |        |


17. APPROVAL
═══════════════════════════════════════════════════

| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Pending           | PENDING   |      |
| Requestor     | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
