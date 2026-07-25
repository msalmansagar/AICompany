═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DFE-CBTN-001 — Conditional Button Visibility & Enablement
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-07-19
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════


1. EXECUTIVE SUMMARY
───────────────────────────────────────────────────
The Dynamic Form Engine (DFE) allows makers to place action buttons on
form tabs and sections (DFE-BTN-001). Today those buttons carry only
static on/off flags: they are either always visible or always hidden,
always enabled or always disabled. This forces makers who need
context-sensitive behaviour — for example, showing an "Approve" button
only when a Status field equals "Submitted", or greying out "Submit" once
the record is already approved — to build separate forms or abandon the
feature entirely. DFE-CBTN-001 adds two independent, maker-configurable
condition sets to every scoped button: one that controls visibility
(show/hide) and one that controls enablement (enabled/greyed-out). Each
condition set is a list of field-value conditions combined with AND or OR
logic, evaluated live by the existing RuleEngine as the end user changes
form data. The business outcome is that makers can build approval and
workflow-gating patterns directly in the designer, without additional
development effort.


2. BUSINESS OBJECTIVES
───────────────────────────────────────────────────
1. Enable makers to configure visibility conditions on any scoped button
   so that end users see only contextually relevant actions, reducing form
   confusion and mis-clicks.

2. Enable makers to configure enablement conditions on any scoped button
   so that end users are presented with a clear, accessible disabled state
   for actions that are not yet available, without hiding the button
   entirely.

3. Enable makers to combine multiple conditions using AND or OR logic per
   effect (visibility / enablement), so that multi-field workflow gates
   (e.g. Status = Submitted AND Role = Approver) can be expressed without
   code.

4. Preserve full backward compatibility so that existing deployed forms
   with static button flags continue to behave identically after the
   schema migration, with no maker intervention required.

5. Extend the DFE mobile shared types in step with the web shared types so
   that the mobile application remains type-safe and the CI parity check
   continues to pass.


3. STAKEHOLDERS
───────────────────────────────────────────────────
| Stakeholder            | Role                        | Interest in this project                                     |
|------------------------|-----------------------------|--------------------------------------------------------------|
| Maker / Form Designer  | Primary configurator        | Needs a designer UI to set conditions on buttons             |
| End User               | Form submitter/approver     | Experiences show/hide and enable/disable behaviour at runtime|
| DFE Backend Team       | Owners of CrmMetadataService| Schema migration, ButtonAssembler update, regression safety  |
| DFE Frontend Team      | Owners of form renderer     | Evaluate and apply button state maps in the render cycle     |
| DFE Designer Team      | Owners of designer app      | Condition builder UI, persistence via ScopedButtonDesignService|
| DFE Mobile Team        | Owners of mobile form.ts    | Type parity sync — no runtime mobile change required in v1   |
| QA Team                | Test ownership              | End-to-end condition scenarios, edge cases, accessibility    |
| CRM Administrator      | Dataverse tenant admin      | Schema provisioning on org5869857f via additive mjs scripts  |


4. SCOPE
───────────────────────────────────────────────────

4.1 In Scope
- Two new optional condition sets on ScopedButton: visibleWhen and enabledWhen
- Each condition set: a list of RuleCondition items + a LogicalOperator (AND / OR)
- All eleven existing ConditionOperator values are supported in button conditions:
  equals, notEquals, isEmpty, isNotEmpty, greaterThan, lessThan,
  greaterThanOrEqual, lessThanOrEqual, contains, inList, notInList
- Any form field (by schemaName) may be referenced as the condition field
- Four new additive Dataverse columns on qdb_form_scoped_button (see Section 9)
- Additive provisioning script (or extension of existing) for the new columns
- Backend ButtonAssembler: parse and map new columns; degrade gracefully on null
- Shared type updates: form.types.ts (backend/frontend) and form.ts (mobile) — types only, no mobile runtime change in v1
- Designer ScopedButtonsPanel: inline condition builder for visible-when and enabled-when, per button
- Designer ScopedButtonDesignService: create and update operations extended with new fields
- Runtime evaluation: existing RuleEngine (or a lightweight evaluator equivalent) applied to button condition sets
- RuleEvaluationResult extended with buttonVisibility and buttonEnabledState maps
- Frontend button renderer: reads evaluation maps and applies show/hide and disabled state
- DFE-BTN-001 is a hard prerequisite: this feature extends, not replaces, that work

4.2 Out of Scope
- Conditions on legacy FormButton records (qdb_form_buttons) — only ScopedButton is in scope
- Conditions that reference external API data, user roles, or runtime context keys (e.g. userId) — field values only
- Server-side button visibility evaluation (buttons are always sent to the client; conditions are client-evaluated)
- A form-level rules builder separate from the per-button Properties panel
- Cross-button dependencies (one button's state depending on another button)
- Button animations, transitions, or progressive disclosure beyond show/hide and disabled state
- Mobile runtime rendering changes — mobile receives updated types only; condition evaluation on mobile is deferred
- Audit logging of button condition evaluations
- CallApi and ExternalUrl button action types (remain gated per DFE-BTN-001 decision G-1)
- Any change to existing BusinessRule evaluation for fields, sections, or tabs


5. FUNCTIONAL REQUIREMENTS
───────────────────────────────────────────────────

Group A — Shared Types

FR-001: The system shall add an optional visibleWhen field (type ButtonConditionSet) to the
        ScopedButton interface in shared/src/types/form.types.ts when the feature is built.

FR-002: The system shall add an optional enabledWhen field (type ButtonConditionSet) to the
        ScopedButton interface in shared/src/types/form.types.ts when the feature is built.

FR-003: The system shall define ButtonConditionSet as { conditions: RuleCondition[]; logic: LogicalOperator }
        in shared/src/types/form.types.ts.

FR-004: The system shall add byte-identical ButtonConditionSet, and the new optional ScopedButton
        fields (visibleWhen, enabledWhen), to shared/src/types/form.ts (mobile) so that the
        CI parity check (check-shared-type-sync.mjs) continues to pass.

Group B — Dataverse Schema

FR-005: The system shall provision a new memo-type column qdb_visible_conditions_json on
        qdb_form_scoped_button to store the visibility condition set as a JSON string.

FR-006: The system shall provision a new picklist-type column qdb_visible_conditions_logic on
        qdb_form_scoped_button to store the visibility logic operator (AND = 1, OR = 2).

FR-007: The system shall provision a new memo-type column qdb_enabled_conditions_json on
        qdb_form_scoped_button to store the enablement condition set as a JSON string.

FR-008: The system shall provision a new picklist-type column qdb_enabled_conditions_logic on
        qdb_form_scoped_button to store the enablement logic operator (AND = 1, OR = 2).

FR-009: The system shall add all four new columns via an additive, idempotent provision
        script (pattern: scripts/provision-*.mjs) targeting org5869857f, so that existing
        qdb_form_scoped_button records are not affected.

Group C — Backend (ButtonAssembler / CrmMetadataService)

FR-010: The system shall extend RawScopedButton to include the four new optional fields
        (qdb_visible_conditions_json, qdb_visible_conditions_logic, qdb_enabled_conditions_json,
        qdb_enabled_conditions_logic).

FR-011: The system shall extend ButtonAssembler.mapRawButton to parse qdb_visible_conditions_json
        and qdb_visible_conditions_logic into a ButtonConditionSet and assign it to visibleWhen
        on the returned ScopedButton when the JSON is present and valid.

FR-012: The system shall extend ButtonAssembler.mapRawButton to parse qdb_enabled_conditions_json
        and qdb_enabled_conditions_logic into a ButtonConditionSet and assign it to enabledWhen
        on the returned ScopedButton when the JSON is present and valid.

FR-013: The system shall drop (log a warning; do not fail) any button whose condition JSON is
        present but cannot be parsed, following the same degradation policy already applied to
        invalid action configs.

FR-014: The system shall omit visibleWhen and enabledWhen from the assembled ScopedButton
        when the corresponding columns are null or empty, so that the client treats the button
        as unconditionally visible / unconditionally enabled.

FR-015: The system shall extend the OData $select query in fetchScopedButtons to include all
        four new column names so they are retrieved from Dataverse.

Group D — Designer UI

FR-016: The system shall display a "Visible when" condition builder section within each
        button's card in ScopedButtonsPanel, collapsed by default when no conditions are set
        and expanded (showing the conditions) when at least one condition exists.

FR-017: The system shall display an "Enabled when" condition builder section within each
        button's card in ScopedButtonsPanel, collapsed by default when no conditions are set
        and expanded (showing the conditions) when at least one condition exists.

FR-018: Each condition builder section shall allow the maker to add one or more conditions.
        Each condition row shall contain: a field picker (dropdown of all fields on the
        current form, identified by schemaName), an operator picker (all ConditionOperator
        values), and a value input (free text, accepting the string representation of any
        field value).

FR-019: Each condition builder section shall display an AND / OR logic toggle (LogicalOperator)
        that applies to all conditions in that section. The toggle shall default to AND.

FR-020: The system shall allow the maker to remove any individual condition from either
        condition builder.

FR-021: The system shall immediately persist any change to a condition set (add, remove, or
        edit) by calling ScopedButtonDesignService.update with the serialised
        ButtonConditionSet, following the same immediate-persist pattern used for label and
        action changes.

FR-022: The system shall preserve the existing static isVisible toggle on the button card
        alongside the new condition builder. When visibleWhen conditions exist, the static
        isVisible flag shall continue to be persisted as the default/fallback state (see BR-002).

FR-023: The system shall display a read-only preview label beneath each condition set that
        summarises the condition(s) in plain language (e.g. "Visible when Status equals
        Submitted AND Priority equals High") so the maker can verify config at a glance
        without opening an expanded editor.

Group E — Designer Persistence (ScopedButtonDesignService)

FR-024: The system shall extend ScopedButtonRecord to include optional visibleConditionsJson,
        visibleConditionsLogic, enabledConditionsJson, enabledConditionsLogic fields.

FR-025: The system shall extend CreateScopedButtonInput and UpdateScopedButtonInput to accept
        the new condition fields.

FR-026: The system shall extend ScopedButtonDesignService.create to write the four new
        condition columns when provided, and omit them (leaving Dataverse null) when absent.

FR-027: The system shall extend ScopedButtonDesignService.update to patch the four new
        condition columns when the caller includes them in the patch payload.

FR-028: The system shall extend ScopedButtonDesignService.listByPlacement $select to include
        all four new column names so they are retrieved and surfaced to the panel.

Group F — Runtime Evaluation

FR-029: The system shall extend RuleEvaluationResult (in form.types.ts) with two new maps:
        buttonVisibility: Record<string, boolean> and buttonEnabledState: Record<string, boolean>,
        keyed by button id.

FR-030: The system shall evaluate every ScopedButton's visibleWhen condition set against the
        current FormFieldValues each time the form data changes, producing a boolean per button.

FR-031: The system shall evaluate every ScopedButton's enabledWhen condition set against the
        current FormFieldValues each time the form data changes, producing a boolean per button.

FR-032: When a button has no visibleWhen conditions (the field is absent or the conditions
        array is empty), the system shall use the button's static isVisible value as the
        visibility decision, making the default behaviour identical to pre-feature behaviour.

FR-033: When a button has no enabledWhen conditions (the field is absent or the conditions
        array is empty), the system shall use the button's static isActive value as the
        enabled decision, making the default behaviour identical to pre-feature behaviour.

FR-034: The system shall combine multiple conditions within a condition set using the set's
        logic field: AND requires all conditions to be true; OR requires at least one to be true.

FR-035: The system shall re-evaluate button conditions whenever any field value changes,
        treating the update as synchronous (same re-render cycle as existing business rules).

FR-036: The system shall treat a condition that references a non-existent field schema name
        as evaluating to false (not an error), so that stale conditions do not crash the runtime.

Group G — Frontend Button Rendering

FR-037: The system shall read the buttonVisibility map from RuleEvaluationResult and show or
        hide each ScopedButton accordingly; a button absent from the map falls back to its
        static isVisible value.

FR-038: The system shall read the buttonEnabledState map from RuleEvaluationResult and render
        each ScopedButton as disabled (visually greyed-out, aria-disabled="true", not
        focusable) when the map value is false; a button absent from the map falls back to
        its static isActive value.

FR-039: The system shall ensure that a disabled button still renders in the DOM (it is not
        hidden) so that it is perceivable by the user as an action that exists but is not
        yet available.

FR-040: The system shall ensure that a disabled button cannot be clicked or activated by
        keyboard when its evaluatedEnabled state is false.


6. NON-FUNCTIONAL REQUIREMENTS
───────────────────────────────────────────────────
NFR-001: Performance — Button condition evaluation must complete within the same synchronous
         render cycle as existing business-rules evaluation. Forms with up to 20 buttons,
         each with up to 10 conditions, must not introduce visible latency beyond the existing
         rule-evaluation budget (target: under 5 ms total for condition evaluation on a mid-range
         device).

NFR-002: Availability — No new network calls are introduced for button condition evaluation;
         all data is embedded in the FormDefinition payload fetched at form load time.

NFR-003: Security — Condition JSON columns are read-only at the form renderer; they are
         populated only by authenticated designer users via the Dataverse WebApi. No raw
         user-supplied input from the end-user form is written to these columns.

NFR-004: Scalability — The ButtonConditionSet JSON schema must remain stable so that forms
         provisioned today can be read by future runtime versions without migration.

NFR-005: Compliance — Condition JSON stored in Dataverse is subject to the same data-residency
         rules as all other qdb_form_scoped_button columns (PDPPL hard gate for production;
         inherited from DFE-BTN-001 conditions GL-01..GL-07).

NFR-006: Accessibility — Disabled buttons must meet WCAG 2.1 AA: the disabled state must be
         communicated via aria-disabled="true" (not just visual greying); contrast ratio for
         disabled button text against its background must be at least 3:1.

NFR-007: Backward Compatibility — All existing qdb_form_scoped_button records with null
         condition columns must continue to render identically to today (static flag behaviour),
         with zero maker intervention required.

NFR-008: Test Coverage — All new code paths (assembler, evaluation, renderer, designer service)
         must reach the project minimum of 80% unit-test coverage; the ButtonAssembler must
         have 100% branch coverage given its critical degradation paths.


7. BUSINESS RULES
───────────────────────────────────────────────────
BR-001: A button's evaluated visibility (from visibleWhen) takes precedence over its static
        isVisible flag when visibleWhen is present and contains at least one condition.

BR-002: A button's static isVisible flag is the default visibility state used both when no
        visibleWhen conditions exist and as the initial render state before the first evaluation
        fires (prevents flash of incorrect button state on load).

BR-003: A button's evaluated enablement (from enabledWhen) takes precedence over its static
        isActive flag when enabledWhen is present and contains at least one condition.

BR-004: A button's static isActive flag is the default enablement state used both when no
        enabledWhen conditions exist and as the initial render state before the first evaluation.

BR-005: Visibility and enablement are independent effects: a button can be visible-but-disabled
        (enabledWhen evaluates false) or enabled-but-hidden (visibleWhen evaluates false).
        A button that is hidden does not need to be evaluated for enablement.

BR-006: An empty conditions array (conditions: []) in a ButtonConditionSet must be treated
        identically to a missing ButtonConditionSet — the static flag takes over. Makers must
        add at least one condition for the dynamic behaviour to activate.

BR-007: The logic operator (AND / OR) applies across all conditions in a single condition set.
        Mixed AND/OR within one set is not supported in v1; a separate set per effect (visible,
        enabled) must be used if complex compound logic is needed.

BR-008: If condition JSON stored in Dataverse is syntactically invalid (not parseable as JSON),
        the backend must silently drop the condition set and fall back to the static flag,
        logging a structured warning with the button id and column name.

BR-009: The maker may configure visibleWhen without configuring enabledWhen (and vice versa)
        on the same button. The two condition sets are fully independent.

BR-010: Conditions reference fields by schemaName (fieldId in RuleCondition). If a referenced
        field is removed from the form after the condition was saved, the condition evaluates
        as false (field value is treated as undefined/empty).


8. USER STORIES
───────────────────────────────────────────────────

US-01 — Visibility condition (single condition)
  As a maker, I want to set a single visibility condition on a button (e.g. show "Approve"
  only when Status equals "Submitted") so that end users only see the action when it is
  relevant to the current state.
  Priority: Must Have
  Acceptance criteria:
    Given a tab button with visibleWhen: { conditions: [{ fieldId: "qdb_status", operator: "equals", value: "submitted" }], logic: "AND" }
    When the end user has Status = "Submitted" on the form
    Then the button is rendered as visible.
    When the end user has Status = anything else (or empty)
    Then the button is not rendered (hidden from DOM or display:none).

US-02 — Visibility condition (AND logic, multiple conditions)
  As a maker, I want to combine two field conditions with AND logic on a button so that the
  button only appears when all conditions are met simultaneously.
  Priority: Must Have
  Acceptance criteria:
    Given a button with visibleWhen: conditions [Status = "Submitted" AND Priority = "High"], logic AND
    When Status = "Submitted" and Priority = "High"
    Then the button is visible.
    When only one of the two conditions is true
    Then the button is hidden.

US-03 — Visibility condition (OR logic)
  As a maker, I want to combine conditions with OR logic so that a button appears when any
  one of the conditions is met.
  Priority: Must Have
  Acceptance criteria:
    Given a button with visibleWhen logic OR and conditions [Status = "Approved" OR Status = "Rejected"]
    When Status = "Approved" OR Status = "Rejected"
    Then the button is visible.
    When Status = "Submitted"
    Then the button is hidden.

US-04 — Enablement condition
  As a maker, I want to disable (grey out) a button when a field value indicates the action
  should not be taken yet, so that end users understand it exists but cannot be used yet.
  Priority: Must Have
  Acceptance criteria:
    Given a button with enabledWhen: { conditions: [{ fieldId: "qdb_status", operator: "notEquals", value: "Approved" }], logic: "AND" }
    When Status is not "Approved"
    Then the button renders as enabled (clickable).
    When Status = "Approved"
    Then the button renders as disabled (greyed out, aria-disabled="true", not clickable).

US-05 — Backward compatibility (no conditions)
  As a maker whose forms were built before DFE-CBTN-001, I want my buttons to continue
  behaving exactly as before so that I do not need to reconfigure any existing form.
  Priority: Must Have
  Acceptance criteria:
    Given an existing ScopedButton with no visibleWhen and no enabledWhen
    When the form is loaded after the feature ships
    Then the button honours its static isVisible and isActive flags exactly as before.

US-06 — Independent visible and enabled conditions
  As a maker, I want to configure a button that is always visible but only sometimes enabled,
  so that end users always know the action exists but understand it is temporarily unavailable.
  Priority: Must Have
  Acceptance criteria:
    Given a button with no visibleWhen (always visible) and enabledWhen: Status != "Approved"
    When Status = "Approved"
    Then the button is visible AND disabled.
    When Status = "Draft"
    Then the button is visible AND enabled.

US-07 — Condition builder UI
  As a maker, I want to add, edit, and remove conditions on a button in the designer
  Properties panel without writing any code or JSON manually, so that I can configure
  conditional logic without technical assistance.
  Priority: Must Have
  Acceptance criteria:
    Given the button Properties panel in the designer
    When I open the "Visible when" section
    Then I see an "Add condition" button.
    When I click "Add condition"
    Then a condition row appears with a field picker, operator picker, and value input.
    When I fill in the condition and click away
    Then the condition is immediately persisted to Dataverse.
    When I click the delete icon on a condition row
    Then that condition is removed and the change is persisted.

US-08 — Plain-language condition summary
  As a maker, I want to see a human-readable summary of the configured conditions on each
  button in the Properties panel so that I can verify my configuration without re-opening
  the condition editor.
  Priority: Should Have
  Acceptance criteria:
    Given a button with visibleWhen: Status equals "Submitted"
    When I view the button card in the Properties panel with the "Visible when" section collapsed
    Then I see a text summary such as "Visible when Status equals Submitted".


9. DATA REQUIREMENTS
───────────────────────────────────────────────────
| Entity                      | Volume                        | Retention              | Sensitivity |
|-----------------------------|-------------------------------|------------------------|-------------|
| qdb_form_scoped_button      | ~10–50 buttons per form        | Lifetime of form       | Internal    |
| visibleWhen JSON             | avg <500 chars per button      | Lifetime of button     | Internal    |
| enabledWhen JSON             | avg <500 chars per button      | Lifetime of button     | Internal    |

New columns on qdb_form_scoped_button:

| Column logical name                 | Type              | Purpose                                      |
|-------------------------------------|-------------------|----------------------------------------------|
| qdb_visible_conditions_json         | Memo (nvarchar)   | JSON array of RuleCondition for visibility   |
| qdb_visible_conditions_logic        | Picklist (int)    | AND = 1, OR = 2; visibility logic operator   |
| qdb_enabled_conditions_json         | Memo (nvarchar)   | JSON array of RuleCondition for enablement   |
| qdb_enabled_conditions_logic        | Picklist (int)    | AND = 1, OR = 2; enablement logic operator   |

All four columns are nullable. Null = no condition set = static flag behaviour.
No new entities are introduced. No PII is stored in condition columns.


10. INTEGRATION DEPENDENCIES
───────────────────────────────────────────────────
| System                          | Integration type        | Data exchanged                                         | Direction          |
|---------------------------------|-------------------------|--------------------------------------------------------|--------------------|
| Dataverse org5869857f           | REST / WebApi           | New columns on qdb_form_scoped_button (read + write)   | Designer → Dataverse; Backend reads |
| DFE Backend API                 | Internal module         | ButtonAssembler maps new columns into ScopedButton      | Dataverse → Backend → Frontend     |
| DFE Frontend                    | Internal module         | RuleEvaluationResult.buttonVisibility/buttonEnabledState| Backend → Frontend runtime          |
| DFE Designer                    | Internal WebApi adapter | ScopedButtonDesignService create/update/list            | Designer → Dataverse                |
| DFE Mobile (form.ts)            | Shared types only       | ButtonConditionSet, ScopedButton type additions         | Shared → Mobile build               |
| CI check-shared-type-sync.mjs   | Build script            | Validates ScopedButton parity between form.types.ts and form.ts | Build gate   |


11. ASSUMPTIONS
───────────────────────────────────────────────────
1. DFE-BTN-001 is fully merged to main before DFE-CBTN-001 work begins; the
   ScopedButton entity (qdb_form_scoped_button), ButtonAssembler, and ScopedButtonsPanel
   are all production-ready.

2. The RuleCondition shape (fieldId, operator, value, logicalOperator) is stable and
   suitable for reuse as button conditions without modification.

3. All eleven ConditionOperator values are meaningful and testable against button condition
   fields; no new operator types are required for v1.

4. The additive provisioning pattern (provision-*.mjs idempotent scripts against
   org5869857f) is the agreed schema migration mechanism; solution import is not used.

5. Condition evaluation remains entirely client-side (frontend); no server-side evaluation
   endpoint is needed because all form field values are already in client memory.

6. Mobile runtime button rendering is deferred; the mobile app will receive updated type
   definitions only and will not evaluate button conditions in v1.

7. The designer can enumerate all form fields to populate the field picker in the condition
   builder, because it already loads the full form definition.

8. The existing immediate-persist pattern (changes written to Dataverse on blur / on toggle)
   is the correct UX for condition changes in the designer.

9. A JSON memo column is sufficient for condition storage (no relational condition rows
   are needed) given the expected condition set sizes.

10. The CI build will be run and must pass (tsc clean, 80%+ coverage, parity check green)
    before any deployment to org5869857f.


12. CONSTRAINTS
───────────────────────────────────────────────────
1. Dataverse schema changes must be additive and idempotent; no destructive column or
   entity changes are permitted.

2. The shared type parity check (check-shared-type-sync.mjs) must continue to pass; both
   form.types.ts and form.ts must be updated in the same PR.

3. The ButtonAssembler degradation policy (a single bad button must never break form
   rendering) must be maintained; invalid condition JSON must be silently dropped with a
   structured log warning, not thrown.

4. No new third-party libraries may be introduced to implement condition evaluation; the
   existing RuleEngine (json-rules-engine) or an equivalent internal evaluator must be used.

5. The feature must not increase the form-load payload size by more than 5 KB on average
   (condition JSON is small and embedded in the existing FormDefinition response).

6. Accessibility: disabled buttons must use aria-disabled="true" (not the HTML disabled
   attribute alone) to remain focusable and announced by screen readers, per WCAG 2.1 AA.

7. All 7 DFE-BTN-001 go-live conditions (GL-01..GL-07) remain in force; DFE-CBTN-001
   shares the same production gate as DFE-BTN-001.


13. RISKS AND OPEN QUESTIONS
───────────────────────────────────────────────────
| Risk / Question                                                                | Impact | Owner          | Resolution needed by   |
|-------------------------------------------------------------------------------|--------|----------------|------------------------|
| OQ-001: Should the logic operator (AND/OR) be per-condition (row-level) or    | Medium | CEO + BA       | Before Architecture    |
|         per-set (one toggle for all conditions in the set)?                   |        |                |                        |
|         Current decision: per-set (one logic operator per condition set).     |        |                |                        |
|         Confirm this is sufficient for v1 use cases.                          |        |                |                        |
| OQ-002: Should condition builder field picker include hidden/readonly fields,  | Low    | BA + Maker     | Before Architecture    |
|         or only visible fields at the time of designer configuration?          |        |                |                        |
|         Recommendation: include all form fields (hidden fields carry values).  |        |                |                        |
| OQ-003: When a button is disabled (enabledWhen evaluates false), should a      | Low    | CEO + UX       | Before Architecture    |
|         tooltip explain WHY it is disabled? If yes, is the disabled message    |        |                |                        |
|         maker-configurable or system-generated?                                |        |                |                        |
| OQ-004: Risk — if the ButtonAssembler drops a button with invalid condition    | Medium | Backend Team   | During Phase 4         |
|         JSON, the maker will not see the button in the form at runtime.        |        |                |                        |
|         Mitigation: designer should validate condition JSON before persisting. |        |                |                        |
| OQ-005: Risk — race condition if the same button is being edited by two        | Low    | Designer Team  | During Phase 4         |
|         designers simultaneously (existing concurrency system applies).        |        |                |                        |
| OQ-006: Should the mobile app display a UI indicator (e.g. greyed button) for | Low    | Mobile Team    | Phase 3 Architecture   |
|         disabled buttons, even without runtime evaluation? Deferred to v2.     |        |                |                        |


14. GLOSSARY
───────────────────────────────────────────────────
ButtonConditionSet:
    A new type comprising a list of RuleCondition items and a LogicalOperator.
    Controls one effect (visibility OR enablement) on a single ScopedButton.

ScopedButton:
    A tab- or section-scoped action button introduced in DFE-BTN-001.
    Stored in the qdb_form_scoped_button Dataverse entity.

RuleCondition:
    Existing shared type: { fieldId, operator: ConditionOperator, value?, logicalOperator? }.
    Reused for button conditions without structural modification.

ConditionOperator:
    Existing enum: equals | notEquals | isEmpty | isNotEmpty | greaterThan | lessThan |
    greaterThanOrEqual | lessThanOrEqual | contains | inList | notInList.

LogicalOperator:
    Existing type: 'AND' | 'OR'. Determines how multiple conditions in a set are combined.

visibleWhen:
    Optional ButtonConditionSet on ScopedButton that controls show/hide behaviour.
    When absent, the static isVisible flag is used.

enabledWhen:
    Optional ButtonConditionSet on ScopedButton that controls enable/disable behaviour.
    When absent, the static isActive flag is used.

RuleEvaluationResult:
    Existing interface returned by runtime rule evaluation.
    Will be extended with buttonVisibility and buttonEnabledState maps.

ButtonAssembler:
    Backend class (services/ButtonAssembler.ts) that maps raw Dataverse records
    into typed ScopedButton domain objects.

Maker:
    The person who configures a form in the DFE designer (as opposed to the end user
    who fills in the form).

org5869857f:
    The Dataverse environment used for development and testing of DFE features.

DFE-BTN-001:
    The prior engagement that introduced ScopedButton, the designer panel, the backend
    assembler, and the qdb_form_scoped_button entity. Hard prerequisite for DFE-CBTN-001.


15. REQUIREMENTS TRACEABILITY MATRIX
───────────────────────────────────────────────────
| User Story | Functional Requirements         | Business Objective | Test Case (QA fills) | Status |
|------------|---------------------------------|--------------------|----------------------|--------|
| US-01      | FR-001, FR-003, FR-029, FR-030, FR-032, FR-034, FR-037 | BO-1 | TC-001 (pending) | Draft |
| US-02      | FR-001, FR-003, FR-029, FR-030, FR-034, FR-037 | BO-1, BO-3 | TC-002 (pending) | Draft |
| US-03      | FR-001, FR-003, FR-029, FR-030, FR-034, FR-037 | BO-1, BO-3 | TC-003 (pending) | Draft |
| US-04      | FR-002, FR-003, FR-031, FR-033, FR-038, FR-039, FR-040 | BO-2 | TC-004 (pending) | Draft |
| US-05      | FR-032, FR-033, FR-037, FR-038 | BO-4 | TC-005 (pending) | Draft |
| US-06      | FR-001, FR-002, FR-037, FR-038, FR-039 | BO-1, BO-2 | TC-006 (pending) | Draft |
| US-07      | FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-024, FR-025, FR-026, FR-027, FR-028 | BO-1, BO-2, BO-3 | TC-007 (pending) | Draft |
| US-08      | FR-023 | BO-1, BO-2 | TC-008 (pending) | Draft |
| —          | FR-004 | BO-5 | TC-009 (pending) | Draft |
| —          | FR-005–FR-009 | BO-1, BO-4 | TC-010 (pending) | Draft |
| —          | FR-010–FR-015 | BO-1, BO-2, BO-4 | TC-011 (pending) | Draft |
| —          | FR-035, FR-036 | BO-1, BO-2 | TC-012 (pending) | Draft |


16. APPROVAL
───────────────────────────────────────────────────
| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Pending           | PENDING   |      |
| Requestor     | Pending           | PENDING   |      |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
