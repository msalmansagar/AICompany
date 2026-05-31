═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        Dynamics CRM Web Resource — Drag-and-Drop Form Designer
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-05-18
Version:        1.0
Status:         APPROVED WITH CONDITIONS — CEO Decision 2026-05-18
Project Code:   FDWR-001
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
────────────────────
The client (enterprise banking sector, Maqsad AI delivery) operates a Dynamic Form Engine
portal that renders customer-facing forms from configuration records stored in 16 pre-provisioned
Dataverse tables. Currently, every form change requires a developer to manually create or modify
CRM records through standard Dynamics CRM forms — a process that is tedious, error-prone, and
non-visual, causing 2–4 week lead times per change request. This project delivers a visual
drag-and-drop Form Designer embedded inside Dynamics CRM as a Web Resource, built with
ReactJS, TypeScript, Fluent UI, and dnd-kit. Business users — not developers — will be able
to design, configure, preview, version, and publish portal forms entirely within the CRM
interface, with all persistence going directly into the existing Dataverse schema through
Xrm.WebApi. The expected business outcome is the elimination of developer dependency for form
changes, reducing time-to-change from weeks to hours, enabling business agility, and providing
a full audit trail and version rollback capability for all form configurations.


2. BUSINESS OBJECTIVES
───────────────────────
BO-001: Enable Business Analysts to create and modify portal forms visually so that form
        changes are delivered in hours rather than weeks without developer involvement.

BO-002: Enable Business Analysts to publish versioned forms directly from the designer so
        that the portal renderer picks up changes immediately without a CRM solution deployment.

BO-003: Enable Business Analysts to preview forms at desktop, tablet, and mobile breakpoints
        before publishing so that layout errors are caught before they reach portal users.

BO-004: Enable Business Analysts to roll back to any previous form version so that the risk
        of publishing a defective form is recoverable within minutes.

BO-005: Enable CRM Administrators to audit every form change action so that governance and
        compliance obligations are met without manual tracking.

BO-006: Enable Business Analysts to configure dynamic behaviour (show/hide, required,
        read-only rules) without writing code so that contextual forms can be maintained
        independently by the business.


3. STAKEHOLDERS
────────────────
| Stakeholder              | Role                     | Interest in this project                                          |
|--------------------------|--------------------------|-------------------------------------------------------------------|
| Business Analyst (BA)    | Primary designer user    | Ability to design and publish forms without developer help        |
| CRM Administrator        | Deployment and security  | Clean solution packaging, security role definitions, sitemap      |
| Portal Developer         | Renderer integration     | Confidence that designer output matches renderer's expected schema|
| IT Manager               | Governance and oversight | Audit trail, version control, approval gates before publish       |
| Portal End User          | Form consumer (indirect) | Correctly functioning forms on the portal (not a designer user)   |
| Dynamic Form Engine Team | Renderer owners          | Business rule JSON contract alignment with designer output        |
| Maqsad AI Delivery Team  | Build and delivery       | Clear, unambiguous requirements and CRM table mapping             |


4. SCOPE
─────────
4.1 In Scope
  - Dynamics CRM Web Resource (ReactJS + TypeScript + Fluent UI + dnd-kit), deployed as a
    bundled JS/CSS asset within a CRM solution package.
  - Form List Screen: search, filter, paginated list of all qdb_form_definition records with
    status, version, and all CRUD actions.
  - New Form Wizard: 5-step guided form creation flow.
  - Drag-and-drop designer canvas: tab bar, sections per tab, fields inside sections.
  - Left component toolbox with three categories: Basic Fields, Layout Components, Advanced
    Components (all types listed in Section 5).
  - Right properties panel: context-sensitive configuration for the selected component.
  - Top command bar: Save Draft, Publish, Preview, Version History, Clone, Undo, Redo.
  - Tab Designer: add, rename, reorder, delete tabs with visibility rule configuration.
  - Section Designer: add, reorder, delete sections; column layout (1–4); collapsible and
    style configuration.
  - Field Designer: full property configuration for all supported field types.
  - Theme / Style Editor: qdb_theme, qdb_form_design, qdb_section_design, qdb_field_design,
    qdb_button_design configuration with live canvas preview.
  - Business Rule configuration panel: conditional visibility, required, read-only, set value
    rules with AND/OR compound conditions.
  - Validation Rule configuration: required, regex, min/max, custom error messages.
  - Option Set Editor: inline management of qdb_form_option_value records.
  - Lookup Configuration panel: entity, filter, display field, value field.
  - Submission Mapping panel: qdb_form_submission_mapping before publish.
  - Preview Mode: embedded form render at desktop / tablet / mobile breakpoints (read-only).
  - Save Draft: persist to CRM, dirty state tracking, auto-save every 2 minutes.
  - Publish Form: validation checklist gate, version creation, audit entry, status update.
  - Version History: list, view, restore previous qdb_form_version records.
  - Clone Form: deep-copy of form definition and all child records.
  - Undo / Redo: in-memory history stack, minimum 50 operations.
  - Audit Log: append-only writes to qdb_form_audit_log for every user action.
  - CRM solution packaging: web resource bundle, sitemap entry, security role definitions,
    ribbon button, deployment guide for DEV / SIT / UAT / PROD promotion.
  - Keyboard accessibility: WCAG 2.1 AA compliance, full keyboard navigation and screen
    reader support.

4.2 Out of Scope
  - The Dynamic Form Engine portal renderer — it already exists and is a separate project.
  - Authentication — the designer relies entirely on the active CRM session context.
  - Multi-language / localisation of form labels (deferred to Phase 2).
  - Real-time collaborative editing (multiple simultaneous users on one form).
  - Custom field type plugins (beyond the defined toolbox catalogue).
  - Azure Blob integration for file upload preview in the designer.
  - Analytics dashboard for portal form usage statistics.
  - PDF generation of form output.
  - Mobile-native application for the designer itself.
  - Any form renderer changes — the renderer team consumes the schema produced by this tool.
  - Direct REST API calls bypassing Xrm.WebApi.


5. FUNCTIONAL REQUIREMENTS
────────────────────────────

--- Group A: Form Management ---

FR-001: The system shall display a paginated list of all qdb_form_definition records when
        the user opens the Form Designer, showing columns: Name, Code, Status, Version,
        Modified On, Modified By.

FR-002: The system shall allow the user to filter the form list by Status (Draft, Published,
        Archived) and search by form name or form code when on the Form List Screen.

FR-003: The system shall provide the following action buttons on each form list row:
        Open, Clone, Archive, Delete (Draft status only), when the user is on the Form
        List Screen.

FR-004: The system shall provide a "New Form" button that launches the 5-step New Form
        Wizard when the user clicks it from the Form List Screen.

FR-005: The system shall capture form Name, Code (auto-generated, user-editable), Description,
        and target Entity Association in Step 1 of the New Form Wizard.

FR-006: The system shall allow the user to select initial tab count and section column layout
        in Step 2 of the New Form Wizard.

FR-007: The system shall present a list of existing qdb_theme records and allow the user to
        select one or create a new theme in Step 3 of the New Form Wizard.

FR-008: The system shall allow the user to select the target CRM entity for submission
        mapping in Step 4 of the New Form Wizard.

FR-009: The system shall display a review summary and validate that all required fields are
        populated before enabling the Create button in Step 5 of the New Form Wizard.

FR-010: The system shall create qdb_form_definition, default qdb_form_tab, default
        qdb_form_section, and a qdb_form_version (v0.1 Draft) when the user completes
        the New Form Wizard and clicks Create.

--- Group B: Designer Canvas ---

FR-011: The system shall render the designer canvas with the tab bar across the top, sections
        within each tab, and fields inside each section when the user opens a form.

FR-012: The system shall allow the user to drag a component from the left toolbox and drop
        it onto a valid drop target (tab bar, section, field position) when designing a form.

FR-013: The system shall allow the user to drag existing fields, sections, and tabs within
        the canvas to reorder them when the form is in design mode.

FR-014: The system shall highlight the selected component and open its properties in the
        right properties panel when the user clicks any component on the canvas.

FR-015: The system shall display an unsaved-changes indicator when the form state differs
        from the last saved state.

FR-016: The system shall prevent dropping a component onto an invalid target and display a
        visual rejection indicator when the user attempts an invalid drop.

--- Group C: Component Toolbox ---

FR-017: The system shall expose the following Basic Field types in the left toolbox:
        Text (single line), TextArea (multi-line), Number (integer), Decimal, Currency,
        Date, DateTime, Email, Phone, Dropdown, Multi-select, Lookup, Checkbox, Radio Group,
        File Upload, Rich Text Editor.

FR-018: The system shall expose the following Layout Component types in the left toolbox:
        Tab, Section-1-col, Section-2-col, Section-3-col, Card Section, Accordion Section,
        Spacer, Divider, Info Text Block, Header Text.

FR-019: The system shall expose the following Advanced Component types in the left toolbox:
        Repeating Grid, Child Entity Grid, Document Upload Block, Terms and Conditions Block,
        Declaration Block, Summary Block.

--- Group D: Properties Panel ---

FR-020: The system shall display context-sensitive properties in the right panel based on
        the type of the currently selected component when any component is selected.

FR-021: The system shall display form-level properties (Name, Code, Description, Entity,
        Submission Method) in the properties panel when the form canvas background is selected.

FR-022: The system shall display tab-level properties (Label, Sequence, Visibility Condition)
        in the properties panel when a tab is selected.

FR-023: The system shall display section-level properties (Label, Columns, Collapsible,
        Default Expanded, Style Class) in the properties panel when a section is selected.

FR-024: The system shall display field-level properties (Label, Schema Name, CRM Attribute,
        Data Type, Control Type, Placeholder, Help Text, Default Value, Required, Read-only,
        Hidden, Width, CSS Class) in the properties panel when a field is selected.

FR-025: The system shall display type-specific field properties (Regex for Text; Min/Max
        for Number; Date Range for Date; Option Set source for Dropdown/Radio/Multiselect;
        Lookup entity, filter, display field for Lookup) in the properties panel when a
        field of that type is selected.

--- Group E: Tab Designer ---

FR-026: The system shall allow the user to add a new tab by clicking "Add Tab" in the
        canvas tab bar when designing a form.

FR-027: The system shall allow the user to rename a tab by editing its label inline or via
        the properties panel when a tab is selected.

FR-028: The system shall allow the user to reorder tabs by drag-and-drop within the tab bar
        when designing a form.

FR-029: The system shall allow the user to delete a tab (and all its child sections and
        fields) after confirming a destructive action warning when a tab is selected.

FR-030: The system shall allow the user to configure a visibility condition on a tab so that
        the portal renderer shows or hides the tab based on field values.

--- Group F: Section Designer ---

FR-031: The system shall allow the user to add a section to any tab by dragging from the
        toolbox or clicking "Add Section" when on the designer canvas.

FR-032: The system shall allow the user to set the section column count (1, 2, 3, or 4
        columns) from the properties panel when a section is selected.

FR-033: The system shall allow the user to mark a section as collapsible and set its default
        expanded state from the properties panel when a section is selected.

FR-034: The system shall allow the user to reorder sections within a tab by drag-and-drop
        when designing a form.

FR-035: The system shall allow the user to delete a section (and all its child fields) after
        confirming a destructive action warning when a section is selected.

--- Group G: Field Designer ---

FR-036: The system shall write one qdb_form_field record for every field dropped onto the
        canvas, capturing all configured properties, when the user saves or auto-saves the form.

FR-037: The system shall update the corresponding qdb_form_field record when the user modifies
        any field property in the properties panel and the form is saved.

--- Group H: Validation Rules ---

FR-038: The system shall allow the user to add validation rules (Required, Min Length, Max
        Length, Regex Pattern, Min Value, Max Value) with custom error messages to any field
        from the properties panel.

FR-039: The system shall write one qdb_form_validation_rule record per validation rule
        configured on a field when the form is saved.

--- Group I: Business Rules ---

FR-040: The system shall allow the user to create business rules with: a trigger field, one
        or more conditions (field = value / field contains / field is empty), AND/OR logic,
        and one or more actions (Show, Hide, Set Required, Clear Required, Set Value, Show
        Message) from the rule configuration panel.

FR-041: The system shall write one qdb_form_business_rule record per business rule and
        persist the rule logic in the JSON format agreed with the Dynamic Form Engine
        renderer team when the form is saved.

--- Group J: Option Set Editor ---

FR-042: The system shall allow the user to add, edit, reorder, and delete option values for
        Dropdown, Multi-select, and Radio Group fields inline in the properties panel.

FR-043: The system shall write one qdb_form_option_value record per option, maintaining the
        sequence ordering field, when the form is saved.

--- Group K: Lookup Configuration ---

FR-044: The system shall allow the user to configure the lookup entity, OData filter, display
        field, and value field for any Lookup type field from the properties panel.

FR-045: The system shall write one qdb_form_lookup_config record per configured lookup field
        when the form is saved.

--- Group L: Submission Mapping ---

FR-046: The system shall allow the user to configure qdb_form_submission_mapping records
        that map form fields to CRM entity attributes from the submission mapping panel.

FR-047: The system shall block publish if any field marked as required in the submission
        mapping has no mapping configured when the user initiates publish.

--- Group M: Save Draft ---

FR-048: The system shall persist all form design state to CRM tables using Xrm.WebApi and
        set qdb_form_definition.statuscode = Draft when the user clicks Save Draft.

FR-049: The system shall automatically save the form every 2 minutes when the form has
        unsaved changes (dirty state).

FR-050: The system shall validate that no component has an empty name before saving and
        display inline validation errors for unnamed components when save is initiated.

FR-051: The system shall write a qdb_form_audit_log record with action = SAVE_DRAFT,
        actor = current CRM user, and timestamp when a save completes.

--- Group N: Publish Form ---

FR-052: The system shall display a publish validation checklist before publishing and list
        each validation item with pass/fail status when the user clicks Publish.

FR-053: The system shall enforce the following publish validation gates:
        (a) Form has a name and unique code.
        (b) At least one tab exists.
        (c) Every tab contains at least one section.
        (d) No field has an empty label.
        (e) No duplicate field codes exist within the form.
        (f) Every Dropdown, Radio Group, and Multi-select field has at least one option.
        (g) Every Lookup field has an entity configured.
        (h) Submission mapping is complete for all required fields.

FR-054: The system shall block the Publish action and display a clear list of failed
        validation items when any publish validation gate fails.

FR-055: The system shall create a new qdb_form_version record with an incremented version
        number, set qdb_form_definition.statuscode = Published, and retire the previous
        active version when all validation gates pass and the user confirms publish.

FR-056: The system shall write a qdb_form_audit_log record with action = PUBLISH,
        actor = current CRM user, version number, and timestamp when publish completes.

FR-057: The system shall display a CRM notification banner confirming successful publish
        when publish completes.

--- Group O: Version History ---

FR-058: The system shall display a list of all qdb_form_version records for the current
        form, showing version number, status, published date, and published by, when the
        user opens Version History.

FR-059: The system shall allow the user to view the field and structure summary of any
        historical version when the user clicks View on a version row.

FR-060: The system shall allow the user to restore a historical version as a new Draft by
        copying the version snapshot data into the current form definition records when the
        user clicks Restore and confirms.

FR-061: The system shall write a qdb_form_audit_log record with action = RESTORE_VERSION
        and the source version ID when a restore completes.

--- Group P: Clone Form ---

FR-062: The system shall duplicate the qdb_form_definition and all child records (tabs,
        sections, fields, validation rules, business rules, option values, lookup configs,
        submission mappings, design records) when the user clicks Clone on a form.

FR-063: The system shall set the cloned form Name to "[Original Name] — Copy", generate a
        new unique form code, set status = Draft, and version = 0.1 when cloning completes.

FR-064: The system shall write a qdb_form_audit_log record with action = CLONE and the
        source form ID when cloning completes.

--- Group Q: Undo / Redo ---

FR-065: The system shall maintain an in-memory history stack of at least 50 designer
        operations and allow the user to undo the last operation using Ctrl+Z.

FR-066: The system shall allow the user to redo a previously undone operation using
        Ctrl+Y when there are operations on the redo stack.

FR-067: The system shall clear the redo stack when the user performs a new design action
        after undoing one or more operations.

--- Group R: Theme / Style Editor ---

FR-068: The system shall allow the user to select an existing qdb_theme record or create a
        new theme from the Theme / Style Editor panel.

FR-069: The system shall allow the user to configure the following theme properties: primary
        colour, accent colour, background colour, font family, base font size, border radius,
        field spacing, label position (above / beside), button style.

FR-070: The system shall reflect theme changes live on the designer canvas within 500ms of
        any property adjustment when the Theme Editor is open.

FR-071: The system shall write qdb_theme, qdb_form_design, qdb_section_design,
        qdb_field_design, and qdb_button_design records when the user saves theme changes.

--- Group S: Preview Mode ---

FR-072: The system shall render the designed form in a read-only preview panel using a
        simulation of the portal renderer when the user clicks Preview.

FR-073: The system shall provide Desktop (1200px), Tablet (768px), and Mobile (375px) width
        presets that resize the preview container when the user selects a breakpoint.

FR-074: The system shall not permit any editing actions while Preview Mode is active.

--- Group T: Audit Log ---

FR-075: The system shall write one qdb_form_audit_log record for every user-initiated action
        (Open, Save Draft, Publish, Clone, Restore, Delete, Archive, Theme Save) including
        form_id, action type, CRM user ID, timestamp, and a JSON payload of changed attributes.

FR-076: The system shall never update or delete any qdb_form_audit_log record; audit records
        are append-only.

--- Group U: Accessibility ---

FR-077: The system shall make all toolbox items keyboard-navigable and activatable via
        Enter when the user navigates without a mouse.

FR-078: The system shall provide ARIA labels on all interactive components and announce
        drag-and-drop operations to screen readers when the user interacts with the canvas.

FR-079: The system shall support Tab / Shift+Tab focus traversal through all interactive
        elements and arrow-key reordering of selected canvas items.


6. NON-FUNCTIONAL REQUIREMENTS
────────────────────────────────
NFR-001: Deployment — The designer must be packaged as a standard Dynamics CRM Web Resource
         (bundled JS and CSS) with no dependency on any external server, CDN, or backend API.
         All data operations must use Xrm.WebApi exclusively.

NFR-002: Browser Compatibility — The designer must function correctly on Microsoft Edge
         (Chromium) v100+ and Google Chrome v100+. No Internet Explorer or legacy Edge
         support is required.

NFR-003: CRM Version Compatibility — The designer must operate on Dynamics 365 v9.2
         on-premise and Dynamics 365 Online. All Xrm.WebApi features used must be confirmed
         available in v9.2 on-premise (a compatibility matrix is required in the Architecture
         document per CEO Condition C-003).

NFR-004: Performance — The designer canvas must render up to 50 fields with less than 100ms
         visible interaction lag. Toolbox drag initiation must occur within 16ms (60fps
         target). CRM API calls must complete within 3 seconds under normal CRM load.

NFR-005: Bundle Size — The compiled web resource bundle must not exceed 5MB (the CRM Web
         Resource upload limit). The architecture must include a concrete code-splitting and
         tree-shaking strategy with build-time size budget enforcement (CEO Condition C-002).

NFR-006: Reliability — The designer must auto-save every 2 minutes when the form has
         unsaved changes. On CRM API failure, the system must retry up to 3 times with
         exponential backoff before surfacing a user-visible error. The system must present
         an unsaved-changes confirmation dialog before the user navigates away.

NFR-007: Security — Access to the designer is controlled entirely by Dynamics CRM security
         roles. No additional authentication layer is required. All Xrm.WebApi calls respect
         CRM record-level security. No secrets, credentials, or tokens may appear in the
         web resource bundle. The minimum required privilege set for each of the 16 CRM
         tables must be defined as a deployment artifact (CEO Condition C-005).

NFR-008: API Compliance — The designer must not use the deprecated Xrm.Page API. All CRM
         context must be obtained via executionContext or parent.Xrm obtained safely at
         runtime. No direct document.getElementById or DOM manipulation patterns deprecated
         in UCI are permitted.

NFR-009: Accessibility — The designer must comply with WCAG 2.1 Level AA. All interactive
         components must be keyboard-navigable. Screen reader announcements must be provided
         for drag-and-drop operations.

NFR-010: Audit — Every create, update, publish, clone, and restore action must be recorded
         to qdb_form_audit_log. Audit records are append-only — no UPDATE or DELETE is
         permitted on audit table records.

NFR-011: Scalability — The designer must support forms with up to 10 tabs, 5 sections per
         tab, and 20 fields per section (maximum 1,000 field records per form) without
         degradation below the performance thresholds in NFR-004.

NFR-012: Maintainability — All CRM table logical names and attribute names must be declared
         in a central constants file. No hardcoded GUIDs or entity names inline. TypeScript
         strict mode must be enabled throughout. Vitest unit tests must cover all service
         layer functions.

NFR-013: Deployment Pipeline — The designer must be deployable via a single CRM solution
         file (.zip) importable through the CRM Solution Import UI. The solution must
         include the web resource bundle, sitemap entry, security role definitions, and
         ribbon button configuration. A deployment guide must cover DEV / SIT / UAT / PROD
         promotion steps.


7. BUSINESS RULES
──────────────────
BR-001: A form cannot be published unless all publish validation gates defined in FR-053
        have passed. Partial compliance is not accepted.

BR-002: A form code must be unique across all qdb_form_definition records in the CRM
        environment. Duplicate codes are rejected at save time.

BR-003: Every published form must have a corresponding qdb_form_version record with a
        monotonically increasing version number. Version numbers must never be reused or
        decremented.

BR-004: A field code must be unique within its parent form. Duplicate field codes within
        a form are rejected at save time.

BR-005: A Dropdown, Multi-select, or Radio Group field must have at least one
        qdb_form_option_value record before the form can be published.

BR-006: A Lookup field must have an associated qdb_form_lookup_config record specifying
        the target entity before the form can be published.

BR-007: Deleting a tab deletes all child sections and fields cascadingly. Deleting a
        section deletes all child fields cascadingly. This action requires explicit user
        confirmation.

BR-008: Cloning a form creates entirely new CRM records for the form definition and all
        child entities. The clone shares no records with the original.

BR-009: Restoring a previous version does not overwrite the current version. It creates a
        new Draft by copying the restored version's data into new CRM records.

BR-010: The audit log is append-only. No business process or user action may trigger an
        UPDATE or DELETE on any qdb_form_audit_log record.

BR-011: Auto-save must not change qdb_form_definition.statuscode. Auto-save persists data
        silently; only an explicit Save Draft or Publish action changes form status.

BR-012: Business rule JSON written to qdb_form_business_rule must conform to the schema
        agreed with the Dynamic Form Engine renderer team. No deviation from the agreed
        contract is permitted without a formal schema version change.

BR-013: The designer must not make any network calls to external systems. All data
        operations must go through Xrm.WebApi. No direct OData REST calls bypassing the
        CRM security layer are permitted.

BR-014: Option values within a Dropdown, Multi-select, or Radio Group must maintain an
        explicit sequence ordering field. Reordering options must update sequence values on
        qdb_form_option_value records, not delete and re-create records.


8. USER STORIES
────────────────

--- Epic: Form Management ---

US-01: As a Business Analyst, I want to view a searchable, filterable list of all portal
       forms so that I can quickly locate and open the form I need to work on.
       Priority: Must Have
       Acceptance Criteria:
         Given the user opens the Form Designer,
         When the Form List Screen loads,
         Then all qdb_form_definition records are displayed with Name, Code, Status,
         Version, Modified On, and Modified By columns, paginated and filterable by status.

US-02: As a Business Analyst, I want to create a new form using a guided 5-step wizard
       so that I can set up the form structure correctly without developer assistance.
       Priority: Must Have
       Acceptance Criteria:
         Given the user clicks New Form,
         When all 5 wizard steps are completed and Create is clicked,
         Then qdb_form_definition, a default tab, a default section, and a v0.1 Draft
         version record are created in CRM and the canvas opens.

US-03: As a Business Analyst, I want to clone an existing form so that I can create a
       variant quickly without starting from a blank canvas.
       Priority: Should Have
       Acceptance Criteria:
         Given the user clicks Clone on a form,
         When cloning completes,
         Then a new qdb_form_definition and all child records exist with a new code,
         "[Original Name] — Copy" name, Draft status, and version 0.1.

US-04: As a Business Analyst, I want to archive a form so that retired forms are hidden
       from the active list without being permanently deleted.
       Priority: Should Have
       Acceptance Criteria:
         Given the user clicks Archive on a Published or Draft form,
         When the action is confirmed,
         Then qdb_form_definition.statuscode = Archived and the form no longer appears
         in the default active list view.

--- Epic: Canvas Design ---

US-05: As a Business Analyst, I want to drag a field from the toolbox and drop it onto a
       form section so that I can add new inputs to my form without writing code.
       Priority: Must Have
       Acceptance Criteria:
         Given the user drags a Text field from the toolbox,
         When it is dropped onto a section with available space,
         Then a new field placeholder appears in the section, the properties panel opens
         for the new field, and the form is marked as having unsaved changes.

US-06: As a Business Analyst, I want to drag fields within the canvas to reorder them so
       that the form flow reflects the correct logical order.
       Priority: Must Have
       Acceptance Criteria:
         Given two fields exist in a section,
         When the user drags field B above field A,
         Then field B appears first, field A appears second, and the sequence values on
         the corresponding qdb_form_field records are updated on next save.

US-07: As a Business Analyst, I want to add, rename, reorder, and delete tabs so that I
       can organise long forms into logical groupings.
       Priority: Must Have
       Acceptance Criteria:
         Given a form is open in the designer,
         When the user adds a tab, renames it, reorders it, and deletes a tab (after
         confirming the destructive warning),
         Then the canvas reflects each change, the deleted tab's sections and fields are
         removed, and qdb_form_tab records are updated correctly on save.

US-08: As a Business Analyst, I want to add sections with 1, 2, or 3 column layouts so
       that I can control how fields are visually grouped within a tab.
       Priority: Must Have
       Acceptance Criteria:
         Given a tab is selected on the canvas,
         When the user drags a Section-2-col from the toolbox,
         Then a two-column section container appears in the tab and the properties panel
         shows column count = 2.

US-09: As a Business Analyst, I want to undo and redo my last 50 design actions so that
       I can reverse mistakes without losing all my work.
       Priority: Must Have
       Acceptance Criteria:
         Given the user has performed 10 design actions,
         When the user presses Ctrl+Z 10 times,
         Then the canvas reverts to its state before the first of those 10 actions,
         and pressing Ctrl+Y 10 times restores all 10 actions.

--- Epic: Field Configuration ---

US-10: As a Business Analyst, I want to click a field and configure its label, placeholder,
       help text, and required status in the properties panel so that the form captures the
       right information from portal users.
       Priority: Must Have
       Acceptance Criteria:
         Given a field is selected on the canvas,
         When the user changes the label in the properties panel,
         Then the label updates live on the canvas within 100ms and the change is persisted
         to qdb_form_field on next save.

US-11: As a Business Analyst, I want to configure dropdown, radio, and multi-select options
       inline in the properties panel so that I do not need to create option sets as separate
       CRM records outside the designer.
       Priority: Must Have
       Acceptance Criteria:
         Given a Dropdown field is selected,
         When the user adds 3 options with labels and values,
         Then 3 qdb_form_option_value records are created with correct sequence values
         on next save.

US-12: As a Business Analyst, I want to configure lookup fields with entity, filter, and
       display field settings so that portal users see relevant lookup results.
       Priority: Must Have
       Acceptance Criteria:
         Given a Lookup field is selected,
         When the user sets entity = Account and display field = name,
         Then a qdb_form_lookup_config record is created for that field on next save.

US-13: As a Business Analyst, I want to add validation rules to fields so that the portal
       enforces data quality on user submissions.
       Priority: Must Have
       Acceptance Criteria:
         Given a Text field is selected,
         When the user adds a Regex validation rule with pattern and error message,
         Then one qdb_form_validation_rule record is created for that field on next save.

US-14: As a Business Analyst, I want to add business rules (show/hide, required, read-only)
       triggered by field values so that the form behaves contextually for different users.
       Priority: Must Have
       Acceptance Criteria:
         Given the user opens the rule configuration panel,
         When a rule is configured with trigger = Field A, condition = equals "Yes",
         action = Show Field B,
         Then one qdb_form_business_rule record is created with the agreed JSON schema
         on next save.

--- Epic: Publishing ---

US-15: As a Business Analyst, I want to save a draft of my form at any time without
       publishing it so that I can work iteratively across sessions.
       Priority: Must Have
       Acceptance Criteria:
         Given the user has made design changes,
         When the user clicks Save Draft,
         Then all changes are persisted to CRM, status remains Draft, and a
         qdb_form_audit_log record with action = SAVE_DRAFT is written.

US-16: As a Business Analyst, I want to preview my form at desktop, tablet, and mobile
       breakpoints before publishing so that I can verify the layout before portal users
       see it.
       Priority: Must Have
       Acceptance Criteria:
         Given the user clicks Preview,
         When the user selects the Mobile preset,
         Then the preview container resizes to 375px width and the form renders correctly
         within that constraint.

US-17: As a Business Analyst, I want to run publish validation and see a clear checklist of
       issues that must be fixed so that invalid forms cannot be published to the portal.
       Priority: Must Have
       Acceptance Criteria:
         Given the form is missing a required submission mapping,
         When the user clicks Publish,
         Then the publish validation screen appears with the missing mapping item marked
         as FAIL and the Confirm Publish button is disabled.

US-18: As a Business Analyst, I want to publish a form and see it immediately available
       on the portal without requiring a developer or a CRM solution deployment.
       Priority: Must Have
       Acceptance Criteria:
         Given all validation gates pass,
         When the user confirms publish,
         Then qdb_form_definition.statuscode = Published, a new qdb_form_version record
         is created with an incremented version number, and a qdb_form_audit_log record
         with action = PUBLISH is written.

--- Epic: Version Management ---

US-19: As a Business Analyst, I want to view the full version history of a form so that I
       can see who published each version and when.
       Priority: Must Have
       Acceptance Criteria:
         Given the user opens Version History for a form with 3 published versions,
         When the version history screen loads,
         Then all 3 qdb_form_version records are listed with version number, status,
         published date, and published by.

US-20: As a Business Analyst, I want to restore a previous version of a form as a new draft
       so that I can roll back to a known-good state if a published form has errors.
       Priority: Must Have
       Acceptance Criteria:
         Given the user clicks Restore on version 1.0,
         When restore completes,
         Then new CRM records are created reflecting version 1.0's structure, the form
         opens as a Draft, and a qdb_form_audit_log record with action = RESTORE_VERSION
         is written.

--- Epic: Theming ---

US-21: As a Business Analyst, I want to choose an existing theme or create a custom theme
       so that the form matches the organisation's branding guidelines.
       Priority: Should Have
       Acceptance Criteria:
         Given the user opens the Theme Editor,
         When the user selects an existing qdb_theme record,
         Then the canvas immediately reflects the theme's colour, font, and spacing values.

US-22: As a Business Analyst, I want to see theme changes applied live on the canvas as I
       adjust colours, fonts, and spacing so that I can preview the branding without saving.
       Priority: Should Have
       Acceptance Criteria:
         Given the user adjusts the primary colour in the Theme Editor,
         When the colour picker value changes,
         Then the canvas reflects the new colour within 500ms without the user needing
         to click Save.

--- Epic: Audit ---

US-23: As a CRM Administrator, I want to view the audit log for any form so that I can see
       who changed it, what action was taken, and when, to satisfy governance requirements.
       Priority: Must Have
       Acceptance Criteria:
         Given a form has been saved and published,
         When the CRM Admin opens the qdb_form_audit_log view for that form,
         Then records exist for SAVE_DRAFT and PUBLISH actions with actor, timestamp,
         and JSON payload populated.


9. DATA REQUIREMENTS
─────────────────────
| Entity                    | Volume (est.)         | Retention     | Sensitivity   |
|---------------------------|-----------------------|---------------|---------------|
| qdb_form_definition       | 100–500 forms         | Indefinite    | Internal      |
| qdb_form_tab              | 300–2,500 records     | Indefinite    | Internal      |
| qdb_form_section          | 600–5,000 records     | Indefinite    | Internal      |
| qdb_form_field            | 3,000–50,000 records  | Indefinite    | Internal      |
| qdb_form_validation_rule  | 5,000–100,000 records | Indefinite    | Internal      |
| qdb_form_business_rule    | 2,000–50,000 records  | Indefinite    | Internal      |
| qdb_form_option_value     | 10,000–200,000 records| Indefinite    | Internal      |
| qdb_form_lookup_config    | 500–5,000 records     | Indefinite    | Internal      |
| qdb_form_submission_mapping| 1,000–20,000 records | Indefinite    | Internal      |
| qdb_form_version          | 500–5,000 records     | Indefinite    | Internal      |
| qdb_theme                 | 10–100 records        | Indefinite    | Internal      |
| qdb_form_design           | 100–500 records       | Indefinite    | Internal      |
| qdb_section_design        | 600–5,000 records     | Indefinite    | Internal      |
| qdb_field_design          | 3,000–50,000 records  | Indefinite    | Internal      |
| qdb_button_design         | 100–500 records       | Indefinite    | Internal      |
| qdb_form_audit_log        | 50,000–1,000,000 rows | 7 years       | Confidential  |

Notes:
- All 16 tables are already provisioned in the target CRM environment.
- Audit log retention of 7 years reflects banking sector compliance norms.
- No personally identifiable information is stored in the designer's CRM tables;
  PII exists only in portal submission data handled by the renderer.


10. INTEGRATION DEPENDENCIES
──────────────────────────────
| System                     | Integration Type       | Data Exchanged                            | Direction         |
|----------------------------|------------------------|-------------------------------------------|-------------------|
| Dynamics CRM / Dataverse   | Xrm.WebApi (CRUD)      | All 16 form configuration tables          | Read / Write      |
| Dynamic Form Engine (portal)| Schema contract only  | Business rule JSON, field schema, version | Designer writes;  |
|                             |                        | records consumed by renderer              | Renderer reads    |
| CRM Security Role system   | Runtime context        | User identity, table privileges           | Read only         |
| CRM Sitemap                | Navigation entry       | Web resource URL reference                | One-time config   |

Note: The designer makes no calls to external APIs, Azure services, or third-party systems.
All integration is through Xrm.WebApi within the CRM session context.


11. ASSUMPTIONS
────────────────
A-001: All 16 Dataverse tables listed in Section 9 are already provisioned and have the
       correct schema in all target CRM environments (DEV / SIT / UAT / PROD).

A-002: The Dynamic Form Engine portal renderer is already deployed and reads from the same
       16 Dataverse tables. The renderer team will provide or agree the business rule JSON
       schema before the rule configuration panel is built.

A-003: The CRM security role "Form Designer User" will be created by the CRM Administrator
       before UAT. The minimum privilege set will be defined by the architect in response
       to CEO Condition C-005.

A-004: Xrm.WebApi is available in the web resource context for all target CRM environments
       (Dynamics 365 v9.2 on-premise and Online).

A-005: No Internet Explorer or legacy Edge support is required. Microsoft Edge Chromium
       and Google Chrome are the only supported browsers.

A-006: The designer will be embedded via a CRM sitemap entry as a full-page web resource.
       The web resource iframe will be at least 1024px wide.

A-007: Business rule conditions and actions defined in this BRD cover the complete set
       needed for Phase 1. Additional rule types are out of scope.

A-008: The portal renderer's preview mode can be invoked locally (simulation) or via an
       iframe. The architect will make this decision as part of CEO Condition C-004.

A-009: The undo/redo history stack is in-memory only. If the user closes the browser tab,
       undo history is lost. Persisting undo history to session storage is an architect
       decision noted in CEO Advisory A-001.

A-010: No multi-tenancy configuration is required. The designer operates in a single
       CRM environment per deployment.


12. CONSTRAINTS
────────────────
C-001: The web resource bundle must not exceed 5MB. This is a hard CRM platform limit for
       web resource uploads.

C-002: No external network calls are permitted from the web resource. All data operations
       must use Xrm.WebApi. No direct OData REST endpoint calls bypassing CRM security.

C-003: No Node.js server-side code. The designer is a pure client-side web resource.

C-004: The deprecated Xrm.Page API must not be used. All CRM context obtained via
       executionContext or parent.Xrm pattern.

C-005: Direct DOM manipulation patterns deprecated in Dynamics 365 UCI (document.getElementById,
       jQuery DOM writes) must not be used.

C-006: The bundle must be self-contained — no dependency on external CDNs. All dependencies
       must be bundled.

C-007: TypeScript strict mode must be enabled throughout. No any types.

C-008: The business rule JSON schema written to qdb_form_business_rule is a formal contract
       with the renderer team. No deviations are permitted without a versioned schema change
       agreed with both teams.

C-009: The project must be deployable via the standard CRM Solution Import UI and must not
       require PowerShell scripts or manual record creation for the primary deployment path.

C-010: Timeline constraint — Phase 1 scope excludes localisation, collaborative editing,
       custom field type plugins, and analytics. These are deferred to Phase 2.


13. RISKS AND OPEN QUESTIONS
──────────────────────────────
| Risk / Question                                              | Impact | Owner                    | Resolution needed by       |
|--------------------------------------------------------------|--------|--------------------------|----------------------------|
| R-001: Business rule JSON schema not agreed before build     | HIGH   | BA + Renderer Team + Arch| Before Architecture sign-off|
| R-002: Bundle size exceeds 5MB CRM upload limit             | HIGH   | Architect                | Architecture phase          |
| R-003: Xrm.WebApi feature gaps between Online and v9.2 OPR  | HIGH   | Architect                | Architecture phase          |
| R-004: Preview mode approach (iframe vs simulation) undecided| HIGH   | Architect                | Architecture phase          |
| R-005: Security role minimum privilege set undefined         | HIGH   | Architect + CRM Admin    | Architecture phase          |
| R-006: Xrm.WebApi rate limiting under auto-save writes       | MEDIUM | Architect                | Architecture phase          |
| R-007: dnd-kit accessibility gaps vs WCAG 2.1 AA requirement | MEDIUM | Frontend Developer       | Development phase           |
| R-008: CRM version differences between DEV and PROD env      | MEDIUM | CRM Admin                | Before SIT deployment       |
| R-009: Option reordering causes record delete-recreate       | MEDIUM | Backend Developer        | Development phase (BR-014)  |
| R-010: Undo history loss on browser close acceptable?        | LOW    | BA + CEO                 | Architecture phase          |

Open Questions:
Q-001: Has the Dynamic Form Engine renderer team committed to a business rule JSON schema
       review session before Architecture begins?
Q-002: Is there an existing CRM security role that "Form Designer User" should extend, or
       is it to be created from scratch?
Q-003: Will DEV, SIT, UAT, and PROD all have the same Dynamics 365 version and patch level?


14. GLOSSARY
─────────────
| Term                    | Definition                                                                    |
|-------------------------|-------------------------------------------------------------------------------|
| Business Analyst (BA)   | The primary user of the Form Designer; designs and publishes portal forms.   |
| Canvas                  | The central drag-and-drop design surface in the Form Designer.               |
| Component Toolbox       | The left panel in the designer listing draggable field and layout types.     |
| CRM Web Resource        | A client-side HTML/JS/CSS asset deployed and hosted within Dynamics CRM.     |
| Dataverse               | The underlying data platform for Dynamics 365; used interchangeably with CRM.|
| dnd-kit                 | An open-source React drag-and-drop library used for the designer canvas.     |
| Draft                   | A form status indicating the form has not yet been published.                |
| Dynamic Form Engine     | The existing portal renderer that reads form configuration from Dataverse.   |
| Fluent UI               | Microsoft's React component library; the design system for this project.     |
| Form Definition         | The top-level CRM record (qdb_form_definition) representing a portal form.  |
| Form Version            | A snapshot of a form's configuration at a point in time (qdb_form_version). |
| OPR                     | On-Premises; refers to Dynamics CRM deployed on-premise (not cloud).         |
| Properties Panel        | The right panel in the designer showing configuration for selected component. |
| Published               | A form status indicating the form is live and available to portal users.     |
| qdb_                    | The table/attribute prefix used for the Dynamic Form Engine's Dataverse schema.|
| UCI                     | Unified Client Interface; the modern Dynamics 365 web client.                |
| Xrm.WebApi              | The Dynamics 365 JavaScript API for CRUD operations on Dataverse tables.     |
| WCAG 2.1 AA             | Web Content Accessibility Guidelines version 2.1, Level AA compliance.      |


15. CRM TABLE MAPPING REFERENCE
─────────────────────────────────
| Designer Action                 | CRM Table Written                                        |
|---------------------------------|----------------------------------------------------------|
| Create / edit form              | qdb_form_definition                                      |
| Add / edit tab                  | qdb_form_tab                                             |
| Add / edit section              | qdb_form_section                                         |
| Add / edit field                | qdb_form_field                                           |
| Add validation rule             | qdb_form_validation_rule                                 |
| Add business rule               | qdb_form_business_rule                                   |
| Add / reorder option value      | qdb_form_option_value                                    |
| Configure lookup                | qdb_form_lookup_config                                   |
| Configure submission mapping    | qdb_form_submission_mapping                              |
| Save draft / publish version    | qdb_form_version                                         |
| Apply / save theme              | qdb_theme, qdb_form_design                               |
| Style section                   | qdb_section_design                                       |
| Style field                     | qdb_field_design                                         |
| Style button                    | qdb_button_design                                        |
| Any save / publish / audit action| qdb_form_audit_log                                      |


16. REQUIREMENTS TRACEABILITY MATRIX
──────────────────────────────────────
| User Story | Business Objective | Functional Requirements            | Test Case (QA fills) | Status |
|------------|-------------------|------------------------------------|----------------------|--------|
| US-01      | BO-001            | FR-001, FR-002, FR-003             | TC-001 (pending)     | Draft  |
| US-02      | BO-001            | FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010 | TC-002 (pending) | Draft |
| US-03      | BO-001            | FR-062, FR-063, FR-064             | TC-003 (pending)     | Draft  |
| US-04      | BO-001            | FR-003                             | TC-004 (pending)     | Draft  |
| US-05      | BO-001            | FR-011, FR-012, FR-014, FR-015, FR-036 | TC-005 (pending) | Draft  |
| US-06      | BO-001            | FR-013, FR-036                     | TC-006 (pending)     | Draft  |
| US-07      | BO-001            | FR-026, FR-027, FR-028, FR-029, FR-030 | TC-007 (pending) | Draft  |
| US-08      | BO-001            | FR-031, FR-032, FR-033, FR-034, FR-035 | TC-008 (pending) | Draft  |
| US-09      | BO-001            | FR-065, FR-066, FR-067             | TC-009 (pending)     | Draft  |
| US-10      | BO-001            | FR-020, FR-024, FR-036, FR-037     | TC-010 (pending)     | Draft  |
| US-11      | BO-001            | FR-042, FR-043                     | TC-011 (pending)     | Draft  |
| US-12      | BO-001            | FR-044, FR-045                     | TC-012 (pending)     | Draft  |
| US-13      | BO-001            | FR-038, FR-039                     | TC-013 (pending)     | Draft  |
| US-14      | BO-006            | FR-040, FR-041                     | TC-014 (pending)     | Draft  |
| US-15      | BO-001            | FR-048, FR-049, FR-050, FR-051     | TC-015 (pending)     | Draft  |
| US-16      | BO-003            | FR-072, FR-073, FR-074             | TC-016 (pending)     | Draft  |
| US-17      | BO-002, BO-001    | FR-052, FR-053, FR-054             | TC-017 (pending)     | Draft  |
| US-18      | BO-002            | FR-055, FR-056, FR-057             | TC-018 (pending)     | Draft  |
| US-19      | BO-004            | FR-058, FR-059                     | TC-019 (pending)     | Draft  |
| US-20      | BO-004            | FR-060, FR-061                     | TC-020 (pending)     | Draft  |
| US-21      | BO-001            | FR-068, FR-069                     | TC-021 (pending)     | Draft  |
| US-22      | BO-001            | FR-070, FR-071                     | TC-022 (pending)     | Draft  |
| US-23      | BO-005            | FR-075, FR-076                     | TC-023 (pending)     | Draft  |


17. APPROVAL
─────────────
| Role          | Name              | Decision           | Date       |
|---------------|-------------------|--------------------|------------|
| CEO           | Maqsad AI CEO     | APPROVED WITH CONDITIONS | 2026-05-18 |
| Requestor     | Pending           | PENDING            |            |

CEO Conditions that must be resolved in Architecture (not requiring BRD re-submission):
  C-001: Business Rule JSON contract with renderer team (CRITICAL — no code before agreed)
  C-002: Bundle size strategy with build-time size budget enforcement
  C-003: Xrm.WebApi compatibility matrix for v9.2 on-premise vs Online
  C-004: Preview mode implementation decision (iframe vs local simulation)
  C-005: Minimum CRM security role privilege set for all 16 tables as deployment artifact

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
