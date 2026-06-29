═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-BTN-001 — Tab/Section Buttons, Button Navigation
                & Final-Submission Parameters
Client:         Qatar Development Bank (QDB)
Product:        Dynamic Form Engine (DFE) — Designer, Frontend Runtime,
                Backend API, Mobile Runtime, CRM On-Prem Runtime,
                Shared Types
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-06-29
Version:        1.0
Status:         DRAFT — Pending CEO Approval
Prior phases:   DFE-ADD-001/002 (APPROVED WITH CONDITIONS)
                DFE-RC-001 (DELIVERED)
                DFE-i18n-001 (CEO APPROVED WITH CONDITIONS)
                DFE-STYLE-001 (BRD APPROVED WITH CONDITIONS,
                               Architecture pending)
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
═══════════════════════════════════════════════════

The Dynamic Form Engine (DFE) today supports one placement for
interactive buttons: a single, form-level action bar rendered below
all tabs, containing a fixed set of actions (submit, save-draft,
cancel, reset). This design works for simple single-tab forms but
fails for multi-step wizard flows and long-section forms where QDB
needs contextually placed "Next Step", "Save & Continue", "Check
Eligibility", or targeted final-submit buttons at specific points
in the form journey.

Additionally, the current final-submission payload is a flat record
of field values only — `{ formData: Record<string, unknown> }`. QDB
has identified a recurring manual integration overhead: after each
submission, QDB back-office staff must look up and attach context
that could have been stamped automatically (who submitted, from which
form version, at what locale, under which tenancy segment). There is
also no mechanism to send design-time constants or derived computed
values as part of the submission without creating visible hidden
fields for each one.

This engagement (DFE-BTN-001) extends the DFE in two complementary
areas. First, it introduces buttons at tab level and section level,
with four configurable action types: Navigate (tab, section, step,
external URL, or another form), Final Submit (with extra-param
envelope), Save Draft, and Call Backend API / CRM Custom Action.
Second, it defines a formal extra-parameter envelope for Final Submit
that carries static key/value pairs, hidden-field values, runtime
context values (stamped authoritatively by the backend, not trusted
from the client), and computed/expression values derived from other
fields at submit time. Both features must work identically across all
four rendering surfaces: the Next.js portal frontend, the React Native
mobile app, and the on-premises CRM web-resource runtime
(qdb_form_runtime.html), all consuming a common schema extension in
the shared @qdb/shared package.

The expected business outcomes are: (1) QDB form designers can build
multi-step wizard flows with per-tab navigation buttons without
writing custom JavaScript or raising a developer change request;
(2) QDB's back-office integration team receives a richer, fully
contextualised submission payload without maintaining parallel
look-up queries; and (3) the on-premises CRM team can invoke CRM
Custom Actions mid-form (e.g., eligibility check, draft pre-
validation) and receive structured responses within the form session.


2. BUSINESS OBJECTIVES
═══════════════════════════════════════════════════

BO-001: Enable QDB form designers to place navigation and action
        buttons at the tab level and section level of any DFE form so
        that multi-step wizard flows require no custom JavaScript and
        can be authored entirely within the designer web resource.

BO-002: Enable QDB form designers to configure Final Submit buttons
        that carry a structured extra-parameter envelope (static
        constants, hidden values, runtime context, and computed
        expressions) so that QDB back-office integration consumes
        fully contextualised submissions without post-processing
        look-ups.

BO-003: Enable QDB's on-premises CRM team to configure mid-form
        "Call Backend API / CRM Action" buttons that invoke registered
        backend endpoints or CRM Custom Actions synchronously,
        returning structured responses (success/error/data) into the
        form session so that eligibility validation and draft-
        calculation workflows are driven from within the form rather
        than duplicated in downstream plugins.

BO-004: Ensure that all new button types, action types, navigation
        targets, and submission parameters are defined in the shared
        @qdb/shared type package and consumed identically by the
        Next.js portal, the React Native mobile app, and the CRM
        on-premises web-resource runtime, so that no runtime diverges
        from the designer's configured intent.

BO-005: Preserve full backward compatibility for all currently
        published forms that rely on form-level buttons
        (submit/saveDraft/cancel/reset in FormActionBar) and the
        existing flat submission payload, so that existing live forms
        require zero migration.


3. STAKEHOLDERS
═══════════════════════════════════════════════════

| Stakeholder                       | Role                         | Interest in this project                                                                         |
|-----------------------------------|------------------------------|--------------------------------------------------------------------------------------------------|
| QDB Form Designers/Administrators | Primary users                | Author tab/section buttons and wizard flows without developer help                               |
| QDB Back-Office Integration Team  | Primary beneficiaries        | Receive contextualised submission payloads; eliminate post-submission look-up overhead           |
| QDB CRM Team (on-prem)            | Primary users                | Configure mid-form CRM Custom Action buttons; receive structured responses in form session       |
| QDB Portal End Users              | Indirect beneficiaries       | Experience guided multi-step form flows with clearly placed "Next", "Submit", "Check" buttons    |
| QDB Mobile App Users              | Indirect beneficiaries       | Identical wizard navigation and submission behaviour on mobile as on the web portal              |
| QDB IT Director                   | Sign-off authority           | Dataverse schema extensions; URL/API allowlist security governance; CRM solution deployment      |
| QDB Compliance Team               | Review authority             | Audit trail for submission extra-params; expression sandboxing; no open-redirect or SSRF         |
| Maqsad AI — Business Analyst      | Requirements owner           | Produces and maintains this document                                                             |
| Maqsad AI — Architect             | Solution design              | Phase 3: shared-type extension contract; Dataverse schema; backend envelope; sandbox design      |
| Maqsad AI — CRM Developer         | Delivery                     | Dataverse schema for new button entities; CRM runtime (qdb_form_runtime.html) button rendering  |
| Maqsad AI — Backend Developer     | Delivery                     | Submit-endpoint envelope extension; call-api proxy route; context stamping; expression eval     |
| Maqsad AI — Frontend Developer    | Delivery                     | Designer button-configuration panels; portal tab/section button rendering; navigation logic     |
| Maqsad AI — Mobile Developer      | Delivery                     | React Native tab/section button rendering; navigation; submission param client-side assembly    |
| Maqsad AI — Code Reviewer         | Quality gate                 | Code review after every implementation phase before QA handover                                 |
| Maqsad AI — QA                    | Verification                 | Test strategy across all four rendering surfaces; security probes on URL/endpoint inputs        |
| Maqsad AI — Auditor               | Governance                   | Phase 6 security and expression-injection audit                                                 |


4. SCOPE
═══════════════════════════════════════════════════

4.1 IN SCOPE
────────────────────────────────────────────────────

THEME A — BUTTON PLACEMENT (Tab-Level and Section-Level Buttons):

  - A new button-definition type (ScopedButton) that can be attached
    to a tab or a section, in addition to the existing form-level
    FormButton type.
  - Designer UI: a "Buttons" sub-panel within the Tab Properties
    Panel and within the Section Properties Panel, allowing the form
    designer to add, reorder, label, and configure buttons at each
    scope.
  - Each ScopedButton carries: label, display order, action type
    (Navigate / FinalSubmit / SaveDraft / CallApi), placement scope
    (tab | section), placement ID (the tab ID or section ID it
    belongs to), primary flag, visibility flag, and optional
    confirmation dialog settings.
  - Designer persistence: new Dataverse entity (qdb_form_button or
    extension of qdb_button_design) with a placement scope column
    and a foreign key to either qdb_form_tab or qdb_form_section,
    in addition to the existing form-level FK to
    qdb_form_definition.
  - Render-cache invalidation: any button add/edit/delete on a
    published form triggers a qdb_publish_job (consistent with
    DFE-RC-001 pattern).
  - Runtime rendering: all three non-designer surfaces (frontend
    portal, mobile, CRM runtime) read tab-level and section-level
    buttons from the published FormDefinition and render them at
    their configured placement.
  - Backward compatibility: existing form-level FormButton records
    (action: submit | saveDraft | cancel | reset) and their
    rendering in FormActionBar are unchanged. New ScopedButton
    type is additive.
  - Shared-type contract: ScopedButton and its related types added
    to BOTH shared/src/types/form.types.ts AND
    shared/src/types/form.ts (mobile). TabDefinition and
    SectionDefinition extended with a buttons: ScopedButton[]
    property.

THEME B — BUTTON ACTION TYPES AND NAVIGATION TARGETS:

  - Navigate action: move the runtime to a target within or outside
    the current form. Sub-targets in scope:
      (a) Tab — jump to a specific tab by tabId.
      (b) Section — scroll/anchor to a specific section by sectionId
          within the currently visible tab.
      (c) Next Step — advance to the next visible, non-locked tab in
          displayOrder sequence (wizard-style).
      (d) Previous Step — return to the previous visible tab in
          displayOrder sequence.
      (e) External URL — navigate the browser/app to a configured
          URL (subject to allowlist validation; see NFR-003).
      (f) Another DFE Form — load a different form by formCode
          within the same DFE runtime session.
  - FinalSubmit action: trigger the standard form-submission flow
    (identical to the existing submit action at form level) but
    carries the extra-parameter envelope defined in Theme C.
  - SaveDraft action: trigger the save-draft flow (identical to the
    existing saveDraft action at form level) from a tab/section
    button.
  - CallApi action: invoke a registered backend endpoint or CRM
    Custom Action without leaving the form. Configuration includes:
    endpoint key (resolved from a backend registry), HTTP method,
    request body fields (field references), and response-handling
    behaviour (success message, error message, set-field-value
    mapping from response).
  - Designer configuration panels for all four action types,
    including dropdowns for navigation target (tab/section
    selection from the current form's definition), URL input for
    external targets, endpoint-key selector for CallApi.

THEME C — FINAL-SUBMISSION EXTRA PARAMETERS:

  - A structured ExtraParams envelope added to the FinalSubmit
    action configuration and to the backend submission payload.
  - Four parameter source types in scope:
      (a) Static — design-time key/value string pairs configured in
          the designer (e.g., productLine: "SME", channel: "portal").
      (b) HiddenField — a reference to a field on the form by
          schemaName; the runtime resolves the current value of that
          field at submit time and includes it under the configured
          key. The field need not be marked hidden — this is a
          parameter-output mapping.
      (c) RuntimeContext — a fixed set of automatically injected
          values stamped authoritatively by the backend (NOT the
          client). The client MAY assemble and send these for
          debugging, but the backend MUST override any client-supplied
          value for security-sensitive context keys. In-scope context
          keys: userId, userDisplayName, formId, formCode,
          formVersion, submittedAt (UTC ISO 8601), locale, sessionId.
      (d) Computed — a DSL expression evaluated at submit time against
          the current field values (e.g., concat(firstName, " ",
          lastName)). Expression evaluation must use the existing safe
          DSL expression engine or its extension; raw JavaScript eval
          is prohibited.
  - The extra-params object is carried in the submission request
    body under a dedicated extraParams key (not merged into
    formData), so the existing submission mapping pipeline is
    undisturbed.
  - Backend receives, validates, stamps authoritative context values
    (overriding client-supplied ones), evaluates computed expressions
    server-side, and persists the full resolved ExtraParams alongside
    the standard submission log.
  - ExtraParams are stored on the qdb_form_submission_log (or a
    child entity) as a JSON column for audit and downstream
    integration consumption.
  - ExtraParams must be transmitted and handled identically by all
    three runtime surfaces that can reach the backend submit endpoint
    (frontend portal, mobile, CRM on-prem runtime).

CROSS-CUTTING CONCERNS:

  - Shared-type package @qdb/shared: all new types defined in
    shared/src/types/form.types.ts (backend/frontend) AND
    shared/src/types/form.ts (mobile). Any divergence between the
    two files is a defect.
  - Designer web resource: all new configuration surfaces must be
    implemented as Fluent UI v9 React components inside the existing
    designer screen architecture.
  - Render cache: new button and extra-param configuration is
    included in the published JSON snapshot; publish triggers the
    existing qdb_publish_job flow unchanged.
  - Audit log: new event types for button-triggered actions
    (tab_button_submit, section_button_navigate, mid_form_api_call)
    added to the AuditLogEntry eventType union.


4.2 OUT OF SCOPE
────────────────────────────────────────────────────

  - Drag-and-drop visual button layout within tab or section
    canvases. Button ordering is controlled by displayOrder integer
    only; visual positioning is deferred.
  - Role-based button visibility (showing or hiding buttons based
    on the authenticated user's AAD group or CRM security role).
    Not in scope for this engagement.
  - Conditional button enabling/disabling rules (e.g., hide "Next"
    until all required fields in the current section are filled).
    Business rule extensions to drive button state are deferred.
  - Server-side workflow authoring for CallApi responses (e.g.,
    branching the form path based on a backend response). The
    response can set field values and show a message; workflow
    branching is out of scope.
  - Free-form endpoint URLs for CallApi. The endpoint must be
    resolved from a designer-maintained allowlist (registry) held
    in Dataverse. Free-text URLs entered at design time are not
    permitted.
  - Client-side expression parsing or execution. All computed
    ExtraParam expressions are evaluated by the backend at submit
    time. Runtimes send the raw expression string; they do not
    evaluate it locally.
  - Changes to existing form-level FormButton records, their
    current rendering in FormActionBar (StickyActionBar), or the
    existing submission flow for forms that have no ScopedButtons.
  - Extra parameters on the SaveDraft action. ExtraParams are
    defined only for the FinalSubmit action type.
  - Animated transitions or progress-bar updates triggered by
    navigation buttons. Navigation state change is structural only.
  - ExtraParams encryption at rest beyond standard Dataverse column
    security. Encryption in transit is already enforced by HTTPS.
  - RTL/Arabic label rendering for button labels (covered by the
    existing DFE-i18n-001 translation framework; this engagement
    adds new translatable button label keys but does not change
    the i18n infrastructure).
  - Dynamics 365 F&O integration.
  - Any DFE-STYLE-001 features (button visual styling is a separate
    engagement).


5. FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

Requirements are numbered FR-001 onwards. Each is atomic and
testable. Traceability to Business Objectives is noted in brackets.

────────────────────────────────────────────────────
GROUP A: BUTTON PLACEMENT — DESIGNER [BO-001]
────────────────────────────────────────────────────

FR-001: The designer SHALL provide a "Buttons" sub-section within
        the Tab Properties Panel that lists all ScopedButtons
        currently attached to that tab, sorted by displayOrder.

FR-002: The designer SHALL allow the form designer to add a new
        ScopedButton to a tab by clicking an "Add Button" control
        within the Tab Properties Panel.

FR-003: The designer SHALL provide a "Buttons" sub-section within
        the Section Properties Panel that lists all ScopedButtons
        currently attached to that section, sorted by displayOrder.

FR-004: The designer SHALL allow the form designer to add a new
        ScopedButton to a section by clicking an "Add Button"
        control within the Section Properties Panel.

FR-005: Each ScopedButton in the designer SHALL expose the following
        editable fields: label (text input), display order (integer
        input), action type (dropdown: Navigate | FinalSubmit |
        SaveDraft | CallApi), isPrimary (toggle), isVisible (toggle),
        confirmationRequired (toggle), confirmationMessage (text
        input, visible only when confirmationRequired is true).

FR-006: The designer SHALL allow the form designer to delete a
        ScopedButton from a tab or section, with a confirmation
        prompt before deletion.

FR-007: The designer SHALL allow the form designer to reorder
        ScopedButtons within a tab or section by editing the display
        order field. Visual drag-and-drop reordering is NOT required
        (see Out of Scope).

FR-008: The designer SHALL persist all ScopedButton create,
        update, and delete operations to Dataverse via the
        ButtonDesignRepository (or a new dedicated repository)
        immediately when the designer's save action is triggered.

FR-009: The designer SHALL validate that at least one ScopedButton
        per tab or section has a unique label (non-empty, non-blank)
        before saving. A duplicate label within the same tab or
        section SHALL produce a designer-side validation warning
        (not a hard block).

FR-010: The designer SHALL display the count of buttons on each tab
        and section in the canvas sidebar to give the designer a
        quick inventory without opening the properties panel.

────────────────────────────────────────────────────
GROUP B: BUTTON PLACEMENT — RUNTIME [BO-001, BO-004]
────────────────────────────────────────────────────

FR-011: The frontend portal runtime SHALL render all ScopedButtons
        attached to a tab in a button row immediately below the last
        section of that tab, in ascending displayOrder, before
        transitioning to the next tab.

FR-012: The frontend portal runtime SHALL render all ScopedButtons
        attached to a section in a button row immediately below the
        section's field grid, in ascending displayOrder.

FR-013: The mobile runtime SHALL render ScopedButtons at tab level
        and section level at the same relative position described in
        FR-011 and FR-012.

FR-014: The CRM on-prem runtime (qdb_form_runtime.html) SHALL render
        ScopedButtons at tab level and section level at the same
        relative position described in FR-011 and FR-012.

FR-015: All three runtimes SHALL honour the isVisible flag on each
        ScopedButton: buttons where isVisible is false SHALL NOT be
        rendered in the DOM (not merely hidden with CSS).

FR-016: All three runtimes SHALL honour the confirmationRequired flag:
        when true, clicking the button SHALL display a modal
        confirmation dialog with the configured confirmationMessage
        before executing the button's action.

FR-017: The ScopedButton rendering in all three runtimes SHALL be
        independent of the FormActionBar (form-level buttons). Both
        can coexist on the same form without conflict.

────────────────────────────────────────────────────
GROUP C: ACTION TYPE — NAVIGATE [BO-001, BO-004]
────────────────────────────────────────────────────

FR-018: When a ScopedButton with action type Navigate and sub-target
        Tab is activated, all three runtimes SHALL switch the active
        tab to the configured tabId, provided that tab is visible and
        not locked. If the target tab is not found or is locked, the
        runtime SHALL display a user-facing error message and SHALL
        NOT crash.

FR-019: When a ScopedButton with action type Navigate and sub-target
        Section is activated, the runtime SHALL scroll the page so
        that the section identified by the configured sectionId is
        visible and focused. If the sectionId is not found in the
        current tab, the runtime SHALL display a user-facing error
        message.

FR-020: When a ScopedButton with action type Navigate and sub-target
        Next Step is activated, the runtime SHALL advance to the next
        tab in ascending displayOrder among tabs where isVisible is
        true. If the current tab is the last visible tab, the button
        SHALL be disabled or produce a user-facing "No next step"
        message.

FR-021: When a ScopedButton with action type Navigate and sub-target
        Previous Step is activated, the runtime SHALL return to the
        previous tab in ascending displayOrder among tabs where
        isVisible is true. If the current tab is the first visible
        tab, the button SHALL be disabled or produce a user-facing
        "No previous step" message.

FR-022: When a ScopedButton with action type Navigate and sub-target
        External URL is activated, the frontend portal and mobile
        runtimes SHALL navigate to the configured URL. The URL SHALL
        be validated at runtime against a backend-maintained
        allowlist before navigation occurs (see NFR-003). If the URL
        fails validation, the runtime SHALL display an error and
        SHALL NOT navigate.

FR-023: When a ScopedButton with action type Navigate and sub-target
        Another Form is activated, the frontend portal and mobile
        runtimes SHALL load the DFE form identified by the configured
        formCode within the same DFE runtime session, discarding the
        current form's unsaved state after a confirmation prompt.

────────────────────────────────────────────────────
GROUP D: ACTION TYPE — FINALSUBMIT [BO-002, BO-004]
────────────────────────────────────────────────────

FR-024: When a ScopedButton with action type FinalSubmit is
        activated, all three runtimes SHALL execute the same form
        submission flow as the existing form-level submit action
        (field validation, confirmation dialog if configured, POST
        to /api/forms/:formCode/submit).

FR-025: When a ScopedButton with action type FinalSubmit is
        activated, the runtime SHALL assemble an ExtraParams object
        from the button's configured parameter sources (see Group F)
        and SHALL include it in the submission request body under
        the key extraParams.

FR-026: A form MAY have zero or one FinalSubmit ScopedButton per tab
        and per section. Multiple FinalSubmit buttons across different
        tabs or sections are permitted. The backend SHALL accept the
        first FinalSubmit request for a given formCode/userId and
        reject duplicates (idempotency per the existing submission
        logic).

────────────────────────────────────────────────────
GROUP E: ACTION TYPE — SAVEDRAFT AND CALLAPI [BO-001, BO-003, BO-004]
────────────────────────────────────────────────────

FR-027: When a ScopedButton with action type SaveDraft is activated,
        all three runtimes SHALL execute the same save-draft flow as
        the existing form-level saveDraft action (POST to
        /api/forms/:formCode/draft with current formData and
        currentTabIndex).

FR-028: When a ScopedButton with action type CallApi is activated, the
        runtime SHALL POST a request to a backend proxy route with:
        the configured endpoint key, the set of field values
        referenced in the button's requestBodyFields configuration,
        and the current form context (formCode, formId, correlationId).

FR-029: The backend proxy route for CallApi SHALL resolve the endpoint
        key against a Dataverse-persisted allowlist (qdb_api_endpoint
        entity or equivalent). If the key is not found in the
        allowlist, the backend SHALL return 400 Bad Request and SHALL
        NOT forward the request to any external system.

FR-030: On a successful CallApi response (HTTP 2xx from the resolved
        endpoint), the runtime SHALL:
        (a) Display the configured successMessage to the user.
        (b) Apply any configured response-field mappings: for each
            mapping, write the value at the configured JSON path from
            the response body into the specified form field's value.

FR-031: On a CallApi error response (HTTP 4xx/5xx or network error),
        the runtime SHALL display the configured errorMessage to the
        user. The runtime SHALL NOT leave the form in an undefined
        state: the form fields must remain editable.

FR-032: The CRM on-prem runtime (qdb_form_runtime.html) SHALL invoke
        CallApi as a Dynamics CRM Custom Action (via
        Xrm.WebApi.online.execute) rather than a direct HTTP call,
        using the configured action name as the Custom Action unique
        name. The response handling requirements in FR-030 and FR-031
        apply identically.

────────────────────────────────────────────────────
GROUP F: EXTRA-PARAM SOURCES — DESIGNER [BO-002]
────────────────────────────────────────────────────

FR-033: When a ScopedButton has action type FinalSubmit, the designer
        SHALL display an "Extra Parameters" configuration panel for
        that button.

FR-034: The designer SHALL allow the form designer to add Static
        parameter entries, each consisting of a key (text input,
        max 100 characters) and a value (text input, max 500
        characters).

FR-035: The designer SHALL allow the form designer to add
        HiddenField parameter entries, each consisting of a key
        (text input) and a field reference (dropdown populated
        from the current form's field schemaName list).

FR-036: The designer SHALL allow the form designer to select which
        RuntimeContext keys to include in the ExtraParams envelope
        from a fixed multi-select list: userId, userDisplayName,
        formId, formCode, formVersion, submittedAt, locale,
        sessionId. Selecting a key opts it into the backend-stamped
        envelope.

FR-037: The designer SHALL allow the form designer to add Computed
        parameter entries, each consisting of a key (text input) and
        a DSL expression string (text area, max 500 characters). The
        designer SHALL display a syntax hint and SHALL validate that
        the expression is non-empty, but SHALL NOT evaluate the
        expression at design time.

FR-038: The designer SHALL display a summary of all configured extra
        parameters (count per source type) on the ScopedButton row
        in the button list panel so the form designer can see at a
        glance that parameters are configured.

────────────────────────────────────────────────────
GROUP G: EXTRA-PARAM ASSEMBLY — RUNTIME AND BACKEND [BO-002, BO-004]
────────────────────────────────────────────────────

FR-039: At FinalSubmit time, all three runtimes SHALL assemble the
        extraParams object client-side as follows:
        (a) Resolve Static entries directly from the button
            configuration.
        (b) Resolve HiddenField entries by reading the current value
            of the referenced field from the form state.
        (c) Include RuntimeContext entries as reported by the client
            (these will be overridden server-side for security-
            sensitive keys; see FR-041).
        (d) Include Computed entries as raw expression strings (the
            runtime does NOT evaluate expressions).
        The assembled extraParams object SHALL be sent in the request
        body alongside formData.

FR-040: The backend submit endpoint (POST /api/forms/:formCode/submit)
        SHALL be extended to accept an optional extraParams object
        alongside formData. If extraParams is absent, the endpoint
        SHALL behave identically to its current behaviour. Existing
        integrations are unaffected.

FR-041: The backend SHALL authoritatively stamp the following
        RuntimeContext keys in the resolved extraParams, overriding
        any client-supplied values:
        userId, userDisplayName (from the authenticated JWT claims),
        formId, formCode (from the resolved form definition),
        formVersion (current published version),
        submittedAt (current UTC timestamp generated server-side).
        The keys locale and sessionId MAY be accepted from the client
        if present, but SHALL be sanitised and length-limited.

FR-042: The backend SHALL evaluate all Computed expression strings
        server-side using the existing safe DSL expression engine
        (the same engine used for customExpression validation rules),
        passing the submitted formData as the evaluation context. If
        an expression fails to evaluate (syntax error, reference
        error), the backend SHALL log the failure with the
        correlationId, substitute a null value for that key in the
        resolved extraParams, and SHALL NOT reject the submission.

FR-043: The backend SHALL validate that the total serialised size of
        the resolved extraParams object does not exceed 64 KB. If
        it exceeds this limit, the backend SHALL reject the
        submission with HTTP 422 Unprocessable Entity and a
        descriptive error message.

FR-044: The backend SHALL persist the fully resolved extraParams
        (after stamping and expression evaluation) as a JSON column
        on the submission log record (qdb_form_audit_log or a new
        qdb_submission_extra_params child entity, to be decided in
        architecture). The persisted value SHALL be the server-
        resolved object, not the raw client payload.

────────────────────────────────────────────────────
GROUP H: SHARED TYPE CONTRACT [BO-004, BO-005]
────────────────────────────────────────────────────

FR-045: The type ScopedButton SHALL be added to both
        shared/src/types/form.types.ts (backend/frontend) and
        shared/src/types/form.ts (mobile). Any PR that modifies one
        file without the other SHALL be rejected at code review.

FR-046: TabDefinition in both shared type files SHALL be extended
        with an optional property buttons: ScopedButton[] that
        defaults to an empty array when absent (backward
        compatibility with existing published forms).

FR-047: SectionDefinition in both shared type files SHALL be extended
        with an optional property buttons: ScopedButton[] that
        defaults to an empty array when absent.

FR-048: The new ButtonActionType union SHALL be defined in shared
        types as: 'navigate' | 'finalSubmit' | 'saveDraft' |
        'callApi'. The existing ButtonAction type ('submit' |
        'saveDraft' | 'cancel' | 'reset') used by FormButton SHALL
        remain unchanged.

FR-049: The NavigationTarget type SHALL be defined in shared types
        to cover all six sub-targets: tab (with tabId), section
        (with sectionId), nextStep, previousStep, externalUrl (with
        url), anotherForm (with formCode).

FR-050: The ExtraParams configuration type SHALL be defined in shared
        types to express the four source types (Static, HiddenField,
        RuntimeContext, Computed) as discriminated union members so
        that each source is unambiguously typed.

FR-051: The ExtraParamsResolved type SHALL be defined in shared types
        as a flat Record<string, unknown> representing the fully
        resolved server-side object, for use in the submission
        payload and the audit log schema.

────────────────────────────────────────────────────
GROUP I: BACKWARD COMPATIBILITY [BO-005]
────────────────────────────────────────────────────

FR-052: All existing published forms (those with no ScopedButton
        records) SHALL render identically to their current behaviour
        on all three runtimes after this engagement is deployed.
        The FormActionBar (form-level buttons) SHALL continue to
        function without modification.

FR-053: The existing POST /api/forms/:formCode/submit endpoint SHALL
        continue to accept requests with only the formData field in
        the body (no extraParams). The endpoint SHALL not require
        extraParams to be present.

FR-054: The qdb_button_design entity and the existing ButtonDesign
        type (used by DFE-STYLE-001 for Submit/SaveDraft/Cancel
        visual styling) SHALL remain unchanged. New ScopedButton
        configuration is stored in a separate Dataverse entity.

FR-055: The render cache (qdb_form_render_cache) payload format for
        existing forms SHALL not change. New ScopedButton data is
        additive in the published JSON; existing parsers that do not
        read the buttons arrays on TabDefinition and SectionDefinition
        will simply ignore the new fields.


6. NON-FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════

NFR-001: PERFORMANCE
        The backend submit endpoint, when processing an ExtraParams
        envelope (with up to 20 parameter entries and up to 5
        computed expressions), SHALL respond within 2,000ms at the
        95th percentile under normal load (consistent with the
        existing form-submission SLA). Computed expression
        evaluation SHALL add no more than 200ms to the baseline
        submission latency.

NFR-002: PERFORMANCE — RUNTIME RENDERING
        Tab-level and section-level ScopedButtons SHALL render
        within the existing tab-switch latency budget. Adding
        buttons to a tab SHALL not cause the tab-switch time
        to exceed 100ms additional overhead versus the current
        baseline.

NFR-003: SECURITY — EXTERNAL URL ALLOWLIST (OPEN REDIRECT PREVENTION)
        The backend SHALL maintain a Dataverse-persisted allowlist
        of approved external URL prefixes (domains or path prefixes).
        When a Navigate: External URL button is activated, the
        runtime SHALL call a backend validation endpoint to verify
        the target URL against this allowlist before any navigation
        occurs. The runtime SHALL NOT navigate to a URL that returns
        a disallowed response. Hard-coded bypass of the allowlist
        check is prohibited in all runtimes.

NFR-004: SECURITY — CALLAPI SSRF PREVENTION
        CallApi endpoints SHALL be resolved exclusively from a
        backend-maintained allowlist (Dataverse entity). Runtimes
        SHALL send only an endpoint key, never a URL. The backend
        SHALL never forward a request to a URL constructed from
        client-supplied input. Any attempt to pass a URL (not a
        key) in the endpoint field SHALL be rejected with HTTP 400.

NFR-005: SECURITY — RUNTIME CONTEXT STAMPING
        The backend SHALL treat userId, userDisplayName, formId,
        formCode, formVersion, and submittedAt as authoritative-
        only fields. Client-supplied values for these keys in the
        extraParams object SHALL be silently overwritten by the
        backend before the submission is persisted. The backend
        SHALL NOT log a warning for client-supplied values — the
        override is silent and unconditional.

NFR-006: SECURITY — EXPRESSION SANDBOX
        Computed expressions in the ExtraParams configuration SHALL
        be evaluated in a sandboxed execution context that:
        (a) Has access only to the submitted formData fields and a
            fixed set of approved built-in functions (string
            manipulation, arithmetic, date formatting).
        (b) Has no access to the Node.js process, filesystem,
            network, or any Dataverse SDK.
        (c) Terminates execution after 50ms and returns null for
            the affected key if the time limit is exceeded.
        Raw JavaScript eval() or Function() constructor with
        expression strings is prohibited.

NFR-007: SECURITY — EXTRAPARAM PAYLOAD SIZE LIMIT
        The backend SHALL reject any submission where the
        serialised extraParams object exceeds 64 KB (UTF-8 encoded)
        with HTTP 422. This limit is enforced before expression
        evaluation to prevent resource exhaustion.

NFR-008: AVAILABILITY
        ScopedButton configuration is included in the render cache
        (qdb_form_render_cache). Loss of live Dataverse connectivity
        SHALL not prevent the portal from rendering ScopedButtons
        or executing SaveDraft, Navigate, and FinalSubmit actions,
        provided a valid cache record exists. CallApi actions require
        live backend connectivity and SHALL fail gracefully with the
        configured errorMessage if the backend is unreachable.

NFR-009: AUDIT
        Every FinalSubmit triggered by a ScopedButton SHALL produce
        an audit log entry with the fully resolved ExtraParams (as
        persisted per FR-044). Every CallApi invocation SHALL produce
        an audit log entry recording: formCode, buttonLabel, endpoint
        key, HTTP status of the backend response, and correlationId.
        Navigate and SaveDraft button activations do not require
        individual audit log entries.

NFR-010: SCALABILITY
        The ExtraParams envelope design SHALL support a maximum of
        50 parameter entries per FinalSubmit button (combined across
        all source types) without schema changes. The Dataverse
        persistence column for resolved ExtraParams SHALL be sized
        to hold at least 64 KB of JSON text (nvarchar(max) or memo
        type).

NFR-011: COMPLIANCE
        ExtraParams persisted in the audit log are classified as
        INTERNAL sensitivity (may contain user-identifying
        information). They are subject to QDB's data retention
        policy for submission records. No ExtraParam key or value
        SHALL contain unmasked authentication secrets or tokens.

NFR-012: CROSS-SURFACE CONSISTENCY
        The schema for ScopedButton, NavigationTarget, and
        ExtraParamsConfig in shared/src/types/form.types.ts and
        shared/src/types/form.ts SHALL be semantically identical.
        Any field present in one file MUST be present in the other.
        This SHALL be enforced by a shared-types consistency test
        in CI (compare structural keys of the two files) added
        as part of this engagement.


7. BUSINESS RULES
═══════════════════════════════════════════════════

BR-001: A ScopedButton with action type Navigate and sub-target Next
        Step SHALL only advance to the next visible tab. Tabs where
        isVisible is false are skipped.

BR-002: A ScopedButton with action type Navigate and sub-target Tab
        SHALL NOT navigate to a tab that has requiresPreviousTabComplete
        set to true if the user has not completed all required fields
        on all preceding tabs. The runtime SHALL display a validation
        summary instead.

BR-003: A FinalSubmit button SHALL only execute the submission flow
        if all required fields across all tabs pass client-side
        validation. If any required field fails validation, the
        runtime SHALL display validation errors and SHALL NOT call
        the submit endpoint.

BR-004: The ExtraParams Static key namespace SHALL be validated
        server-side: any static key that collides with a reserved
        RuntimeContext key (userId, userDisplayName, formId,
        formCode, formVersion, submittedAt, locale, sessionId)
        SHALL be overwritten by the authoritative backend value
        (BR-004 corollary to NFR-005). No error is returned; the
        override is silent.

BR-005: Each ScopedButton is scoped exclusively to either a tab or
        a section — never both simultaneously. A button's placement
        scope (tab | section) and placement ID (tabId or sectionId)
        are set at creation and are immutable for the lifetime of
        the button record (to change placement, delete and recreate).

BR-006: A form designer may define FinalSubmit ScopedButtons on
        multiple tabs or sections within the same form (e.g., one
        per tab in a multi-step form where any tab may be the
        submitting step). Each button executes the same full-form
        submission.

BR-007: The ExtraParams Computed expression SHALL receive only
        the submitted formData as its evaluation context.
        Expressions that reference field keys not present in
        formData SHALL evaluate to null for that key without
        aborting the submission.

BR-008: A CallApi button SHALL NOT be activated while another
        CallApi request from the same form session is still
        in-flight. The runtime SHALL disable the button until
        the prior request completes (success or error).

BR-009: Section-level scroll navigation (Navigate: Section) SHALL
        only scroll within the currently active tab. Navigating to
        a section in a different tab requires first switching to
        that tab.

BR-010: The ExtraParams HiddenField source references a field by
        schemaName. If the referenced field is not present in the
        current formData at submit time (e.g., field was hidden by
        a business rule and cleared), the key SHALL be included in
        ExtraParams with a null value.


8. USER STORIES
═══════════════════════════════════════════════════

US-01: As a QDB form designer, I want to add a "Next" button to a
       tab so that portal users step through a multi-page form in
       sequence without navigating via the tab bar.
       Priority: Must Have
       Acceptance criteria:
         Given a form with three tabs and no existing ScopedButtons,
         When I open Tab 1 properties and click "Add Button",
         configure label "Next", action type "Navigate",
         sub-target "Next Step", and save,
         Then the designer persists the button to Dataverse,
         And the portal renders "Next" below Tab 1's sections,
         And clicking "Next" in the portal switches the active tab
         to Tab 2.

US-02: As a QDB form designer, I want to add a "Submit Application"
       button to a specific section so that users can submit from
       within a section rather than scrolling to the bottom of the
       form.
       Priority: Must Have
       Acceptance criteria:
         Given a form with one tab containing three sections,
         When I open Section 2 properties and add a "Submit
         Application" button with action type FinalSubmit,
         Then the portal renders "Submit Application" below
         Section 2's field grid,
         And clicking it executes the full form validation and
         submission flow identically to the existing form-level
         Submit button.

US-03: As a QDB back-office integration lead, I want the submission
       payload to include the form version, submission timestamp,
       and a static channel identifier so that I can route and
       audit submissions without additional look-ups.
       Priority: Must Have
       Acceptance criteria:
         Given a FinalSubmit button configured with a Static param
         (channel: "portal"), and RuntimeContext params formVersion
         and submittedAt selected,
         When a user submits the form,
         Then the backend submission log contains an extraParams
         object with channel="portal", formVersion matching the
         current published version integer, and submittedAt
         matching the server-generated UTC timestamp,
         And the client-supplied formVersion (if any) is
         overwritten by the server value.

US-04: As a QDB CRM on-premises relationship manager, I want a
       "Check Eligibility" button in the middle of a loan
       application form so that the system validates the applicant's
       eligibility against CRM data before the applicant completes
       the remaining sections.
       Priority: Must Have
       Acceptance criteria:
         Given a section containing applicant income fields, and a
         ScopedButton with action type CallApi and endpoint key
         "check_eligibility_action",
         When the relationship manager fills in the income fields
         and clicks "Check Eligibility",
         Then the CRM runtime invokes the qdb_CheckEligibility
         CRM Custom Action via Xrm.WebApi,
         And on success, the runtime displays the configured
         successMessage and writes the returned eligibility_score
         field value into the configured form field,
         And on failure, the configured errorMessage is shown and
         all form fields remain editable.

US-05: As a QDB portal end user, I want a "Save & Continue Later"
       button on each tab so that I can save my progress without
       navigating to the end of the form.
       Priority: Should Have
       Acceptance criteria:
         Given a multi-tab form where each tab has a ScopedButton
         with action type SaveDraft,
         When I click "Save & Continue Later" on Tab 2,
         Then the runtime calls POST /api/forms/:formCode/draft
         with the current formData and currentTabIndex = 1,
         And displays the same "Saved" confirmation as the
         form-level SaveDraft button.

US-06: As a QDB form designer, I want to configure a "Review QDB
       Website" button in a section that navigates users to the QDB
       public website in a new browser tab so that users can access
       reference materials without losing their form progress.
       Priority: Could Have
       Acceptance criteria:
         Given a Navigate: External URL button configured with
         url = "https://www.qdb.qa",
         When the portal user clicks the button,
         Then the backend validates "https://www.qdb.qa" against
         the allowlist,
         And on success, the portal opens the URL in a new browser
         tab without navigating away from the form,
         And if the domain is not in the allowlist, the portal
         shows an error and does not navigate.

US-07: As a QDB form designer, I want to add a computed extra
       parameter that concatenates the applicant's first and last
       name into a fullName key so that downstream CRM records
       are created with a formatted display name without requiring
       a separate field.
       Priority: Should Have
       Acceptance criteria:
         Given a FinalSubmit button with a Computed param key
         "fullName" and expression concat(firstName, " ", lastName),
         When the user submits the form with firstName="Ahmed" and
         lastName="Al-Rashidi",
         Then the backend evaluates the expression and the
         persisted submission log's extraParams contains
         fullName = "Ahmed Al-Rashidi".


9. DATA REQUIREMENTS
═══════════════════════════════════════════════════

| Entity                          | Est. Volume          | Retention      | Sensitivity   |
|---------------------------------|----------------------|----------------|---------------|
| ScopedButton (new Dataverse)    | ~500 records total   | Lifetime of    | Internal      |
|                                 | across all forms;    | form definition|               |
|                                 | ~5 per form avg      |                |               |
| qdb_api_endpoint (new allowlist)| ~20–50 records       | Admin-managed  | Confidential  |
| ExtraParams resolved JSON       | 1 per submission;    | Per QDB data   | Internal      |
| (persisted on audit/log entity) | est. 2–5 KB avg      | retention      |               |
| qdb_url_allowlist (or merged    | ~10–30 domains       | Admin-managed  | Internal      |
| with endpoint allowlist)        |                      |                |               |

New fields added to existing shared types:
  - TabDefinition.buttons: ScopedButton[] (optional, additive)
  - SectionDefinition.buttons: ScopedButton[] (optional, additive)
  - FormDefinition unchanged at root level (buttons[] stays as
    FormButton[] form-level; new ScopedButtons live on tabs/sections)


10. CROSS-SURFACE CONSISTENCY REQUIREMENT
═══════════════════════════════════════════════════

CR-001: The published FormDefinition JSON (from the render cache)
        is the single source of truth consumed by all runtimes.
        The ScopedButton schema in this JSON is defined by
        @qdb/shared and must be semantically identical across all
        four surfaces: designer (authoring), frontend portal
        (React/Next.js), mobile (React Native/Expo), and CRM
        on-prem runtime (qdb_form_runtime.html / Xrm.WebApi).

CR-002: Any change to ScopedButton, NavigationTarget, or
        ExtraParamsConfig in shared/src/types/form.types.ts MUST
        be simultaneously applied to shared/src/types/form.ts.
        A CI check SHALL enforce this. The TypeScript compiler
        strict mode SHALL catch type drift at build time for
        backend, frontend, and mobile. The CRM on-prem runtime
        SHALL parse the shared JSON schema and SHALL be regression-
        tested against a reference snapshot in the CI pipeline.

CR-003: The CallApi action in the CRM on-prem runtime uses
        Xrm.WebApi rather than fetch(). The endpoint key maps to
        a CRM Custom Action unique name on the on-prem side and
        to a backend API endpoint on the portal/mobile side. The
        allowlist entity SHALL store both the API endpoint URL
        (for portal/mobile) and the CRM Custom Action unique name
        (for on-prem), keyed by the same endpoint key. Runtimes
        use the appropriate field for their environment.


11. INTEGRATION DEPENDENCIES
═══════════════════════════════════════════════════

| System                          | Integration type              | Data exchanged                                           | Direction      |
|---------------------------------|-------------------------------|----------------------------------------------------------|----------------|
| Dataverse (qdb_form_tab)        | OData / Xrm.WebApi            | ScopedButton records: create, read, update, delete       | Designer → CRM |
| Dataverse (qdb_form_section)    | OData / Xrm.WebApi            | ScopedButton records (section-scoped)                    | Designer → CRM |
| Dataverse (qdb_api_endpoint,    | OData / Xrm.WebApi            | Allowlist read at runtime; admin write via designer      | Backend → CRM  |
| new entity)                     |                               |                                                          |                |
| Dataverse (qdb_form_render_     | OData read                    | Published FormDefinition JSON (now includes ScopedButton)| Backend → CRM  |
| cache)                          |                               |                                                          |                |
| Backend API (Node/Fastify)      | HTTP REST                     | FinalSubmit with extraParams; CallApi proxy route;       | Runtime →      |
|                                 |                               | URL validation endpoint for Navigate:ExternalUrl         | Backend        |
| Xrm.WebApi (on-prem CRM)       | CRM SDK / JavaScript          | CallApi CRM Custom Action invocation; response handling  | CRM Runtime →  |
|                                 |                               |                                                          | CRM Actions    |
| @qdb/shared package             | npm package reference         | ScopedButton, NavigationTarget, ExtraParamsConfig types  | All runtimes   |
| DSL Expression Engine           | Internal module               | Computed expression evaluation at submit time            | Backend        |
|                                 | (existing in backend)         |                                                          |                |
| Azure AD (JWT claims)           | Auth middleware               | userId, userDisplayName for RuntimeContext stamping      | Backend inbound|
| qdb_form_audit_log (existing)   | OData write                   | Extended to persist resolved extraParams JSON            | Backend → CRM  |


12. ASSUMPTIONS
═══════════════════════════════════════════════════

A-001: The existing safe DSL expression engine used for
       customExpression validation rules in the backend is
       extensible to support ExtraParams computed expressions
       against a formData context. If it is not, the architect
       must propose an alternative in Phase 3.

A-002: The Dataverse org (org5869857f) has sufficient schema
       capacity for new entities (qdb_form_button for ScopedButton
       records, qdb_api_endpoint for the allowlist). No managed
       solution quota is exceeded.

A-003: The on-prem CRM instance is Dynamics CRM 9.1 (as documented
       in PLUGIN-REGISTRATION.md). The CallApi requirement depends
       on Xrm.WebApi.online.execute being available, which is
       supported on 9.1 UCI.

A-004: The qdb_form_runtime.html web resource is self-contained and
       reads its form definition from the render cache. Section-
       level scroll navigation assumes the CRM model-driven form
       container allows programmatic scroll manipulation
       (window.scrollTo or equivalent). This needs on-prem testing.

A-005: The render cache publish job (qdb_publish_job) will include
       ScopedButton data in the generated JSON without requiring
       changes to the async plugin assembly other than extending
       the data assembly query to include the new entity.

A-006: QDB IT Director will provide the initial list of approved
       external URL prefixes and CRM Custom Action names for the
       allowlist. This list is required before any Navigate:
       ExternalUrl or CallApi button can be tested end-to-end
       in staging.

A-007: The mobile app (React Native/Expo) can handle programmatic
       tab switching (scrolling to a tab in the tab list) and
       section scroll anchoring using existing navigation
       primitives. Confirmation required by Mobile Developer in
       Phase 3.

A-008: The ExtraParams JSON column on the audit log entity
       is a memo (multi-line text) or nvarchar(max) column.
       If the existing qdb_form_audit_log entity does not have
       such a column, a new child entity qdb_submission_extra_params
       will be created. The architect will decide in Phase 3.


13. CONSTRAINTS
═══════════════════════════════════════════════════

C-001: The CRM plugin assembly (Qdb.FormEngine.Plugins.dll) targets
       .NET Framework 4.6.2 and runs in CRM sandbox mode. Any
       server-side computation added to the publish flow (e.g.,
       assembling ScopedButton data) must be compatible with
       .NET 4.6.2. Third-party expression evaluation libraries
       used in the plugin must be ILRepack-merged.

C-002: The backend Node.js + Fastify architecture must not introduce
       a synchronous blocking call into the submit endpoint that
       could breach the 2,000ms SLA (NFR-001). DSL expression
       evaluation must be async with a timeout (NFR-006).

C-003: All Dataverse attribute names for new entities and columns
       must follow the qdb_ prefix convention established in this
       codebase (see formAttributeNames.ts). Attribute names must
       be registered in the relevant constants file before any
       service code references them.

C-004: The shared types in form.types.ts and form.ts are consumed
       by TypeScript strict mode in all packages. New types must
       have no implicit any and must not break existing
       discriminated union exhaustiveness checks.

C-005: The ExtraParams payload size limit of 64 KB (NFR-007) is
       a firm constraint driven by Dataverse memo column limits
       on on-prem 9.1 (nvarchar(max) is 2 GB but the CRM plugin
       context payload limit for on-prem custom action responses
       is more restricted). The architect must verify the on-prem
       payload size ceiling in Phase 3.

C-006: The QDB IT Director must approve the allowlist governance
       model (who can add entries to qdb_api_endpoint and the URL
       allowlist, under which CRM security role) before
       go-live. This is a governance gate, not a technical gate.


14. RISKS AND OPEN QUESTIONS
═══════════════════════════════════════════════════

| Risk / Question                                                     | Impact                                       | Owner                    | Resolution needed by         |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-001: What expression language / DSL is approved for Computed     | Determines backend sandbox design,           | Maqsad AI Architect      | Before Phase 3 architecture  |
| ExtraParams? Is the existing customExpression DSL sufficient, or    | library selection, and C-001 compatibility   | + QDB IT Director        |                              |
| is a new sandboxed evaluator required?                              | with CRM plugin .NET 4.6.2                   |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-002: How does Navigate: Another Form resolve the target form?    | Affects mobile navigation stack, CRM         | Maqsad AI Architect      | Before Phase 3 architecture  |
| Is it an in-page route change, a full page reload, or a CRM        | runtime navigation model, URL scheme design  | + QDB Form Designers     |                              |
| model-driven form navigation? Does the current form's draft state  |                                              |                          |                              |
| need to be preserved across the form switch?                        |                                              |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-003: Does Navigate: Section scroll apply on mobile?              | If the mobile app uses a flat scroll         | Maqsad AI Mobile Dev     | Before Phase 4 mobile build  |
| React Native does not have an HTML anchor/scroll-into-view API.    | model, section navigation may need a         | + QDB Mobile team        |                              |
| What is the acceptable fallback (e.g., scroll to section Y offset)?| different implementation per platform.       |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-004: Are CallApi endpoint keys a fixed registry (maintained by   | A fixed registry (designer-selected from     | QDB IT Director          | Before Phase 3 architecture  |
| QDB IT) or can form designers add new endpoint entries themselves?  | a pre-approved list) is safer but requires   | + Maqsad AI Architect    |                              |
| What CRM security role controls the qdb_api_endpoint entity?       | IT involvement per new integration.          |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-005: What is the authentication model for CallApi backend calls? | Mid-form API calls may cross tenant or       | Maqsad AI Architect      | Before Phase 3 architecture  |
| Do they carry the user's Bearer token, a service-account token,    | auth boundary. Using the user's token        | + QDB IT Director        |                              |
| or no auth (intranet-only endpoints)?                               | exposes it to the called endpoint.           |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-006: Should BR-002 (requiresPreviousTabComplete blocking         | Blocking navigate on incomplete prior tabs   | QDB Form Designers       | Before Phase 4 build         |
| tab navigation) apply to ScopedButton Navigate:Tab as well as      | is a UX choice that may conflict with        | + Maqsad AI BA           |                              |
| Navigate:NextStep? Or only to NextStep?                             | "jump to any tab" designer intent.           |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-007: ExtraParams persistence — new child entity vs. JSON column  | A JSON column on audit log is simpler        | Maqsad AI Architect      | Before Phase 3 architecture  |
| on qdb_form_audit_log? If a child entity, what is the primary key  | but limits queryability. A child entity      |                          |                              |
| and retention policy alignment?                                     | is more queryable but adds schema            |                          |                              |
|                                                                     | complexity and migration risk.               |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| OQ-008: Confirm on-prem CRM 9.1 memo column size ceiling for       | If on-prem caps memo fields below 64 KB,     | Maqsad AI CRM Developer  | Before Phase 3 architecture  |
| ExtraParams JSON. Is nvarchar(max) available or is the field        | the size limit in NFR-007 must be reduced    | + QDB IT Director        |                              |
| capped at a lower practical limit by the CRM form engine?          | to match on-prem constraints.                |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| RISK-001: ScopedButton rendering in qdb_form_runtime.html (CRM     | Medium — on-prem HTML web resource has       | Maqsad AI CRM Developer  | Phase 4 CRM build start      |
| on-prem) may conflict with the existing CRM model-driven form       | strict CSP and DOM constraints. Scroll       |                          |                              |
| container's scroll model and CSP policy.                           | anchoring may require alternative approach.  |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| RISK-002: The shared DSL expression engine has not been validated   | High if the engine lacks string concat,      | Maqsad AI Architect      | Phase 3 architecture         |
| for all function types needed by ExtraParams computed expressions   | date formatting, or arithmetic — a new       | + Backend Developer      |                              |
| (concat, date, arithmetic). Scope may be broader than existing     | engine increases C-001 and timeline risk.    |                          |                              |
| customExpression validation coverage.                               |                                              |                          |                              |
|---------------------------------------------------------------------|----------------------------------------------|--------------------------|------------------------------|
| RISK-003: Two shared type files (form.types.ts, form.ts) diverging  | Medium — any divergence is a runtime bug     | All developers           | Ongoing — enforced by CI     |
| under parallel team development (backend/frontend vs. mobile).     | specific to mobile. The CI consistency       |                          |                              |
|                                                                     | check (CR-002) mitigates but does not        |                          |                              |
|                                                                     | eliminate this risk during active dev.       |                          |                              |


15. GLOSSARY
═══════════════════════════════════════════════════

ScopedButton         A button attached to a specific tab or section
                     in a DFE form definition, as distinct from the
                     existing form-level FormButton.

ButtonActionType     The enum of actions a ScopedButton can perform:
                     navigate, finalSubmit, saveDraft, callApi.

NavigationTarget     The sub-configuration that specifies where a
                     Navigate action leads: tab, section, nextStep,
                     previousStep, externalUrl, or anotherForm.

ExtraParams          The structured envelope of additional key/value
                     data sent alongside the standard formData in a
                     FinalSubmit submission.

ExtraParamsResolved  The server-resolved version of ExtraParams after
                     authoritative stamping and computed expression
                     evaluation.

RuntimeContext       The set of system-provided values stamped
                     server-side into ExtraParams: userId,
                     userDisplayName, formId, formCode, formVersion,
                     submittedAt, locale, sessionId.

CallApi              The ScopedButton action type that invokes a
                     registered backend endpoint (portal/mobile) or
                     CRM Custom Action (on-prem) from within the
                     form session without leaving the form.

Endpoint Key         An opaque string identifier resolved against the
                     qdb_api_endpoint allowlist to obtain the actual
                     target URL (portal/mobile) or CRM Custom Action
                     unique name (on-prem).

DSL Expression       A restricted domain-specific language expression
                     string evaluated server-side by the existing safe
                     expression engine to compute a derived value from
                     formData at submit time.

FormButton           The existing form-level button type (action:
                     submit | saveDraft | cancel | reset) rendered in
                     FormActionBar. Unchanged by this engagement.

qdb_form_runtime.html  The CRM on-premises web resource that renders
                     DFE forms inside Dynamics CRM model-driven forms.

Render Cache         The qdb_form_render_cache Dataverse entity that
                     stores pre-generated published FormDefinition JSON
                     for fast serving via the backend API.


16. ACCEPTANCE CRITERIA (PER THEME)
═══════════════════════════════════════════════════

THEME A — BUTTON PLACEMENT:

AC-A1: A form with one tab and one tab-level ScopedButton
       (action: Navigate, Next Step) renders the button below the
       tab's sections on the portal. Clicking it advances to the
       next tab. Verified on frontend portal, mobile, and CRM
       on-prem runtime.

AC-A2: A form with one section and one section-level ScopedButton
       (action: SaveDraft) renders the button below the section's
       fields on all three runtimes. Clicking it POSTs to the draft
       endpoint and displays a save confirmation.

AC-A3: A form with no ScopedButtons continues to render its
       FormActionBar (form-level buttons) identically to the
       pre-engagement behaviour. No regression on any runtime.

THEME B — ACTION TYPES AND NAVIGATION:

AC-B1: Navigate: Tab — clicking a ScopedButton with a configured
       tabId switches the active tab on all three runtimes.

AC-B2: Navigate: NextStep — advances to the next visible tab;
       disabled on the last visible tab.

AC-B3: Navigate: External URL — backend validates the URL against
       the allowlist; navigation proceeds on allow, error shown on
       deny. Tested with both an approved and a non-approved URL.

AC-B4: CallApi — backend resolves the endpoint key against the
       allowlist; calls the endpoint; on 200 the success message
       is shown and response-mapped fields are updated; on error
       the error message is shown; form remains editable.

THEME C — EXTRA PARAMETERS:

AC-C1: A FinalSubmit button with all four source types (Static,
       HiddenField, RuntimeContext, Computed) configured produces
       a submission log on the backend with an extraParams object
       where: static values are as configured; hiddenField values
       match the current form field values; RuntimeContext keys
       (userId, formId, submittedAt) contain the server-authoritative
       values (NOT the client-supplied values if different);
       computed key contains the evaluated expression result.

AC-C2: A submission where the client supplies userId in extraParams
       with a spoofed value results in the server's authoritative
       userId in the persisted record, not the spoofed value.

AC-C3: An ExtraParams payload exceeding 64 KB is rejected with
       HTTP 422. The submission is not persisted.

AC-C4: A computed expression that times out after 50ms results
       in a null value for that key in the persisted extraParams.
       The submission is accepted and logged.


17. SUCCESS METRICS
═══════════════════════════════════════════════════

SM-001: Within 60 days of go-live, at least three QDB form designs
        use multi-tab wizard navigation with ScopedButtons, with
        zero developer JavaScript changes required.

SM-002: QDB back-office team reports a reduction in post-submission
        manual look-up operations of at least 50% for forms that
        adopt ExtraParams RuntimeContext stamping.

SM-003: Zero security incidents related to open-redirect or SSRF
        via Navigate:ExternalUrl or CallApi buttons in the 90 days
        following go-live.

SM-004: Shared-type consistency CI check passes in 100% of builds
        with no drift between form.types.ts and form.ts detected
        after the initial implementation.


18. REQUIREMENTS TRACEABILITY MATRIX
═══════════════════════════════════════════════════

| User Story | Functional Requirements                          | Test Case (QA fills) | Status |
|------------|--------------------------------------------------|----------------------|--------|
| US-01      | FR-001, FR-002, FR-005, FR-011, FR-018, FR-020   | TC-XXX (pending)     | Draft  |
| US-02      | FR-003, FR-004, FR-005, FR-012, FR-024, FR-025   | TC-XXX (pending)     | Draft  |
| US-03      | FR-033, FR-034, FR-036, FR-039, FR-040, FR-041   | TC-XXX (pending)     | Draft  |
|            | FR-042, FR-043, FR-044                           |                      |        |
| US-04      | FR-005, FR-028, FR-029, FR-030, FR-031, FR-032   | TC-XXX (pending)     | Draft  |
| US-05      | FR-003, FR-004, FR-005, FR-013, FR-014, FR-027   | TC-XXX (pending)     | Draft  |
| US-06      | FR-022, NFR-003                                  | TC-XXX (pending)     | Draft  |
| US-07      | FR-037, FR-039, FR-042, FR-044                   | TC-XXX (pending)     | Draft  |
| CR-001     | FR-045, FR-046, FR-047, FR-048, FR-049, FR-050   | TC-XXX (pending)     | Draft  |
|            | FR-051, FR-052, FR-053, FR-054, FR-055           |                      |        |


19. APPROVAL
═══════════════════════════════════════════════════

| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Pending           | PENDING   |      |
| Requestor     | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
