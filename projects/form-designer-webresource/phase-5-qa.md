═══════════════════════════════════════════════════
PHASE 5 — QA TEST STRATEGY AND TEST PLAN
═══════════════════════════════════════════════════
Project:        Dynamics CRM Web Resource — Drag-and-Drop Form Designer
Prepared by:    Maqsad AI — QA Engineer
Date:           2026-05-19
Version:        1.0
Status:         FINAL — Ready for Build Execution
Project Code:   FDWR-001
Constitution:   Article IV — TDD (Red → Green → Refactor, mandatory)
═══════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — TEST STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1.1 Approach
─────────────
This project is a pure client-side SPA delivered as a Dynamics CRM Web Resource.
There is no backend server; all persistence goes through Xrm.WebApi. The testing
strategy is structured around three constraints unique to this project:

  (a) Xrm.WebApi is a CRM-injected global — it does not exist in a Node.js test
      environment. Every service-layer test must use a typed mock of this API.
      The mock is a plain object that satisfies typeof Xrm.WebApi, injected via
      constructor into each service under test. No patching of globals.

  (b) Drag-and-drop behaviour is driven by dnd-kit pointer events. Vitest +
      jsdom does not fully simulate pointer events for drag sequences. Component
      tests verify the store dispatch contracts (data-attribute and store
      mutation), not the physical drag gesture. E2E tests via Playwright cover
      the full gesture.

  (c) The business rule JSON schema (BusinessRuleDefinition v1.0) is a formal
      contract with the Dynamic Form Engine renderer team (CEO Condition C-001).
      Tests that write business rule records must assert the exact JSON structure
      stored in qdb_rule_definition — not just that a record was created.

1.2 Testing Pyramid
────────────────────

  Unit tests (Vitest):                           60% of test effort
    — Service layer: all methods on all 13 services
    — State store: all actions and selectors in designerStore
    — Validation: all paths in publishValidation and draftValidation
    — Business rule JSON schema conformance
    — withRetry backoff and CrmApiError propagation

  Component tests (Vitest + React Testing Library): 20% of test effort
    — DraggableToolboxItem, FieldSlot, TabBar, PropertiesPanel
    — Store integration: component action → store mutation verified
    — No physical drag gestures; data contracts only

  E2E tests (Playwright):                        15% of test effort
    — Full user journeys from browser through CRM mock to store state
    — All five drag zones exercised with simulated pointer events
    — Publish validation checklist rendered correctly
    — Version restore flow verified end-to-end

  Performance and bundle checks:                 5% of test effort
    — Bundle size CI gate (scripts/checkBundleSize.js, 4MB limit)
    — Render budget assertions via Playwright performance API
    — Undo/redo latency measured in E2E

1.3 Coverage Targets by Layer
───────────────────────────────

  | Layer                          | Line  | Branch | Function | Statement |
  |--------------------------------|-------|--------|----------|-----------|
  | src/services/                  | 90%   | 85%    | 100%     | 90%       |
  | src/state/                     | 90%   | 85%    | 100%     | 90%       |
  | src/validation/                | 100%  | 100%   | 100%     | 100%      |
  | src/designer/canvas/           | 80%   | 75%    | 80%      | 80%       |
  | src/designer/toolbox/          | 80%   | 75%    | 80%      | 80%       |
  | src/designer/properties/       | 80%   | 75%    | 80%      | 80%       |
  | src/screens/                   | 70%   | 65%    | 70%      | 70%       |
  | src/constants/                 | N/A   | N/A    | N/A      | N/A       |
  | src/types/                     | N/A   | N/A    | N/A      | N/A       |
  | OVERALL ENFORCED THRESHOLD     | 80%   | 80%    | 80%      | 80%       |

  The 80% overall threshold is enforced via vite.config.ts coverage.thresholds.
  Tests failing to meet the per-layer targets above are non-blocking warnings
  but are recorded in the Definition of Done checklist.

1.4 What is Mocked vs Real in Each Layer
─────────────────────────────────────────

  Unit tests (services):
    MOCKED:  Xrm.WebApi (typed stub — buildMockWebApi() pattern, as in
             FormDefinitionService.test.ts and AuditLogService.test.ts)
    REAL:    All service logic, retry logic, attribute name constants,
             entity name constants, DTO mapping

  Unit tests (state):
    MOCKED:  Nothing — the Zustand store is real; tests call real actions
    REAL:    useDesignerStore, all actions, all selectors, Immer produce,
             undo/redo snapshot mechanism

  Unit tests (validation):
    MOCKED:  Nothing — pure functions, no external dependencies
    REAL:    validateForPublish, validateForDraftSave, Zod schemas

  Component tests:
    MOCKED:  Xrm.WebApi global (window.Xrm stub in tests/setup.ts),
             dnd-kit sensor events (cannot be fully simulated in jsdom)
    REAL:    React render tree, Zustand store (real store, reset per test),
             Fluent UI components, store dispatch on user interactions

  E2E tests (Playwright):
    MOCKED:  Xrm.WebApi (page.evaluate injection before each test —
             intercepts all createRecord / updateRecord / deleteRecord /
             retrieveMultipleRecords calls and returns seeded fixture data)
    REAL:    Full browser DOM, pointer events, dnd-kit drag gestures via
             Playwright's dragTo() / mouse.move() APIs, React rendering

1.5 TDD Enforcement (Constitution Article IV)
──────────────────────────────────────────────
Every implementation file must have a failing test committed before its
implementation. The CI pipeline runs tests on every push. A build cannot
pass with a red test suite. The sequence is:

  1. Write TC (failing test) — commit as "test: TC-XXX failing — [description]"
  2. Write implementation to make TC green — commit as "feat: TC-XXX passing"
  3. Refactor without breaking the test — commit as "refactor: TC-XXX"

No exceptions. The CI pipeline enforces: typecheck → lint → test:coverage →
build:check-size. All four must pass before a PR is mergeable.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — TEST ENVIRONMENT REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2.1 Unit and Component Test Environment
─────────────────────────────────────────

  Runtime:        Node.js 20 LTS
  Test runner:    Vitest 2.1 (as defined in package.json)
  DOM:            jsdom 25 (configured in vite.config.ts test.environment)
  Setup file:     tests/setup.ts — must configure:
                    - @testing-library/jest-dom matchers
                    - window.Xrm global stub (typed null-returning mock)
                    - window.parent.Xrm stub
                    - vi.clearAllMocks() in beforeEach
  Path alias:     @/ → src/ (configured in vite.config.ts resolve.alias)

  Required window.Xrm stub shape (tests/setup.ts):
    window.Xrm = {
      WebApi: {
        createRecord: vi.fn(),
        updateRecord: vi.fn(),
        deleteRecord: vi.fn(),
        retrieveRecord: vi.fn(),
        retrieveMultipleRecords: vi.fn(),
      },
      App: { addGlobalNotification: vi.fn() },
      Utility: {
        getGlobalContext: vi.fn().mockReturnValue({
          getUserId: vi.fn().mockReturnValue('{USER-001}'),
          getUserName: vi.fn().mockReturnValue('testuser'),
          getClientUrl: vi.fn().mockReturnValue('https://crm.test'),
        }),
        showProgressIndicator: vi.fn(),
        closeProgressIndicator: vi.fn(),
      },
    };

2.2 E2E Test Environment
─────────────────────────

  Browsers:       Chromium (primary), Chrome (secondary)
                  Both tested per NFR-002 (Edge Chromium and Chrome v100+)
  Test runner:    Playwright latest (add as devDependency)
  Config file:    playwright.config.ts (to be created)
  Base URL:       http://localhost:5173 (Vite dev server)
  CRM mock:       page.addInitScript() injects window.Xrm mock before React
                  mounts. All Xrm.WebApi calls are intercepted and resolved
                  from fixture JSON files in tests/fixtures/.
  Viewport:       1440x900 (desktop default); mobile tests override per scenario

2.3 Fixture Data Requirements
──────────────────────────────

  tests/fixtures/formList.json         — 5 qdb_form_definition records
                                         (1 Draft, 2 Published, 1 Archived, 1 Draft with invalid code)
  tests/fixtures/singleForm.json       — 1 complete form with 2 tabs, 3 sections,
                                         8 fields of mixed types including Dropdown and Lookup
  tests/fixtures/versionHistory.json   — 3 qdb_form_version records for the single form
  tests/fixtures/themes.json           — 2 qdb_theme records
  tests/fixtures/emptyForm.json        — Minimal form: 1 tab, 1 section, 0 fields

2.4 Test Account Requirements (SIT and UAT)
────────────────────────────────────────────

  BA test account:    CRM user with "Form Designer User" security role only
                      (tests role enforcement for all 16 tables)
  Admin test account: CRM user with System Administrator role
                      (used only for environment setup — never in functional tests)
  Read-only account:  CRM user with no qdb_* table privileges
                      (used for security negative tests — TC-SEC-001 through TC-SEC-004)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — UNIT TEST PLAN (VITEST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3.1 withRetry() — src/services/crmRetry.ts
────────────────────────────────────────────

EXISTING COVERAGE (tests/services/crmRetry.test.ts):
  - withRetry_succeeds_onFirstAttempt
  - withRetry_retries_onTransientFailure
  - withRetry_throws_CrmApiError_afterThreeFailures
  - withRetry_CrmApiError_containsOperationName

GAPS — the following test cases must be added:

TC-CRM-001: withRetry_exponentialBackoff_doublesDelayEachAttempt
  References: NFR-006, phase-3-arch.md "crmRetry (withRetry — exponential backoff, max 3)"
  Given: vi.useFakeTimers() is active; operation fails on first two attempts
  When: withRetry(operation, 'op') is called with two forced failures then success
  Then: first retry fires after ~500ms; second retry fires after ~1000ms (2^1 * 500);
        delay between attempts doubles (exponential, not linear)
  Priority: Critical
  Type: Unit

TC-CRM-002: withRetry_doesNotRetry_onSuccessfulFirstCall
  References: NFR-006
  Given: operation resolves on first call
  When: withRetry(operation, 'op') is called
  Then: operation is called exactly once; no delay is applied; result is returned immediately
  Priority: High
  Type: Unit

TC-CRM-003: withRetry_CrmApiError_wrapsOriginalCause
  References: NFR-006, common.md error handling section
  Given: operation always throws new Error('upstream failure')
  When: all retries are exhausted
  Then: the thrown CrmApiError.cause is the original Error instance ('upstream failure');
        the error is not swallowed
  Priority: High
  Type: Unit

TC-CRM-004: withRetry_propagatesResult_ofCorrectType
  References: NFR-006
  Given: operation resolves with { id: 'abc-123', entityType: 'qdb_form_definition' }
  When: withRetry(operation, 'createForm') is called
  Then: the returned value is exactly { id: 'abc-123', entityType: 'qdb_form_definition' };
        no unwrapping or transformation occurs
  Priority: Medium
  Type: Unit

TC-CRM-005: withRetry_handles_AsyncOperationTimeout
  References: NFR-004 (CRM API calls must complete within 3 seconds)
  Given: operation rejects with a timeout error (simulating a CRM server timeout)
  When: withRetry(operation, 'slowOp') exhausts all retries
  Then: CrmApiError is thrown with operationName = 'slowOp'; no uncaught promise rejection
  Priority: High
  Type: Unit

3.2 validateForPublish() — src/validation/publishValidation.ts
───────────────────────────────────────────────────────────────

EXISTING COVERAGE (tests/validation/publishValidation.test.ts):
  - validateForPublish_returnsValid_forWellFormedForm
  - validateForPublish_returnsError_whenFormNameIsEmpty
  - validateForPublish_returnsError_whenFormCodeIsInvalid
  - validateForPublish_returnsError_whenNoTabsExist
  - validateForPublish_returnsError_whenDuplicateFieldCodes
  - validateForPublish_returnsWarning_whenNoRequiredField

GAPS — the following test cases must be added:

TC-PV-001: validateForPublish_returnsError_PV001_whenFormNameExceeds200Chars
  References: US-17 / FR-053(a), phase-3-arch.md PV-001
  Given: form.name is a 201-character string (boundary: max + 1)
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains exactly one issue with code 'PV-001'
        and severity 'error'
  Priority: Critical
  Type: Unit

TC-PV-002: validateForPublish_returnsError_PV001_whenFormNameIsWhitespaceOnly
  References: US-17 / FR-053(a), BR-001
  Given: form.name is '   ' (three spaces, passes min length 1 on raw char count)
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-001 — whitespace-only names
        are semantically empty and must be rejected
  Confidence: 92%
  Note: This exposes a gap in the current Zod schema (min(1) passes '   ').
        The implementation must call .trim() before the min check.
  Priority: Critical
  Type: Unit

TC-PV-003: validateForPublish_returnsError_PV002_whenFormCodeContainsHyphen
  References: US-17 / FR-053(a), phase-3-arch.md PV-002 regex /^[a-z0-9_]+$/
  Given: form.code is 'my-form-code' (hyphens not permitted by regex)
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-002 with severity 'error'
  Priority: High
  Type: Unit

TC-PV-004: validateForPublish_returnsError_PV004_whenTabLabelIsEmpty
  References: US-17 / FR-053, phase-3-arch.md PV-004
  Given: one tab exists with label = ''
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-004 with severity 'error'
  Priority: Critical
  Type: Unit

TC-PV-005: validateForPublish_returnsError_PV005_whenTabHasNoSections
  References: US-17 / FR-053(c), phase-3-arch.md PV-005
  Given: one tab exists with label = 'Tab A'; sectionOrder for that tab is []
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-005 referencing 'Tab A'
  Priority: Critical
  Type: Unit

TC-PV-006: validateForPublish_returnsError_PV006_whenFieldLabelIsEmpty
  References: US-17 / FR-053(d), phase-3-arch.md PV-006
  Given: one field exists with label = '' and a valid code
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-006 with severity 'error'
  Priority: Critical
  Type: Unit

TC-PV-007: validateForPublish_returnsError_PV007_whenFieldCodeIsEmpty
  References: US-17 / FR-053(e), phase-3-arch.md PV-007
  Given: one field exists with label = 'Full Name' and code = ''
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-007 with severity 'error'
  Priority: Critical
  Type: Unit

TC-PV-008: validateForPublish_returnsError_PV009_whenDropdownHasNoOptions
  References: US-17 / FR-053(f), BR-005, phase-3-arch.md PV-009
  Given: one field of fieldType 'dropdown' exists with options = []
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-009 with severity 'error';
        the message references the field label or code
  Priority: Critical
  Type: Unit

TC-PV-009: validateForPublish_returnsError_PV009_forMultiSelectWithNoOptions
  References: US-17 / FR-053(f), BR-005
  Given: one field of fieldType 'multi_select' exists with options = []
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-009
  Priority: High
  Type: Unit

TC-PV-010: validateForPublish_doesNotReport_PV009_forTextFieldWithNoOptions
  References: US-17 / FR-053(f)
  Given: one field of fieldType 'text' exists with options = [] and isRequired = true
  When: validateForPublish(state) is called
  Then: result.isValid is true; no PV-009 issue is present — text fields do not
        require options
  Priority: High
  Type: Unit

TC-PV-011: validateForPublish_returnsError_PV010_whenLookupHasNoTargetEntity
  References: US-17 / FR-053(g), BR-006, phase-3-arch.md PV-010
  Given: one field of fieldType 'lookup' exists with lookupConfig = null
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-010 with severity 'error'
  Priority: Critical
  Type: Unit

TC-PV-012: validateForPublish_returnsError_PV011_whenFormHasNoEntityLogicalName
  References: US-17 / FR-053(h), phase-3-arch.md PV-011
  Given: form.entityLogicalName is '' (empty)
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-011 with severity 'error'
  Priority: Critical
  Type: Unit

TC-PV-013: validateForPublish_returnsMultipleErrors_whenSeveralGatesFail
  References: US-17 / FR-052, FR-054, BR-001
  Given: form.name is ''; form.code is 'INVALID'; tabOrder is []
  When: validateForPublish(state) is called
  Then: result.isValid is false; issues contains PV-001, PV-002, and PV-003;
        all three are present simultaneously (validation does not short-circuit
        after the first failure)
  Priority: Critical
  Type: Unit

TC-PV-014: validateForPublish_returnsValid_whenWarningsOnlyExist
  References: US-17 / FR-052, BR-001
  Given: well-formed state but form.fields has no required fields (triggers PV-012 warning)
  When: validateForPublish(state) is called
  Then: result.isValid is true; issues contains exactly one issue with code 'PV-012'
        and severity 'warning'; the Confirm Publish button must NOT be disabled
  Priority: Critical
  Type: Unit

3.3 validateForDraftSave() — src/validation/draftValidation.ts
───────────────────────────────────────────────────────────────

EXISTING COVERAGE (tests/validation/draftValidation.test.ts):
  - validateForDraftSave_returnsValid_whenFormHasName
  - validateForDraftSave_returnsInvalid_whenFormNameIsEmpty
  - validateForDraftSave_returnsInvalid_whenFormCodeIsEmpty

GAPS — the following test cases must be added:

TC-DV-001: validateForDraftSave_returnsValid_whenEntityLogicalNameIsEmpty
  References: US-15 / FR-048, FR-050; Note: entity is NOT required for draft save
  Given: form.name = 'My Form'; form.code = 'my_form'; form.entityLogicalName = ''
  When: validateForDraftSave(form) is called
  Then: result.isValid is true; draft save does not require entity configuration
        (that is a publish gate, PV-011, not a draft gate)
  Priority: High
  Type: Unit

TC-DV-002: validateForDraftSave_returnsInvalid_whenFormNameIsWhitespaceOnly
  References: US-15 / FR-050
  Given: form.name = '   '; form.code = 'valid_code'
  When: validateForDraftSave(form) is called
  Then: result.isValid is false; errors contains a message referencing 'name'
  Priority: High
  Type: Unit

TC-DV-003: validateForDraftSave_returnsMultipleErrors_whenBothNameAndCodeEmpty
  References: US-15 / FR-050
  Given: form.name = ''; form.code = ''
  When: validateForDraftSave(form) is called
  Then: result.isValid is false; errors.length >= 2; both name and code errors present
  Priority: High
  Type: Unit

TC-DV-004: validateForDraftSave_doesNotCheckTabOrFieldStructure
  References: US-15 / FR-048
  Given: form.name = 'Valid'; form.code = 'valid_code' (no tabs or fields passed)
  When: validateForDraftSave(form) is called
  Then: result.isValid is true — draft validation only checks form-level identity,
        not structural completeness (structure is a publish gate)
  Priority: High
  Type: Unit

3.4 useDesignerStore — State Mutations
────────────────────────────────────────

EXISTING COVERAGE (tests/state/designerStore.test.ts):
  - addTab_addsToTabsMap_andTabOrder
  - deleteTab_removesTab_andItsFieldsAndSections
  - addField_addsToFieldsMap_andFieldOrder
  - moveField_updatesSourceAndTargetSectionOrders
  - reorderTabs_updatesTabOrder_andSortOrders
  - undo_restoresPreviousSnapshot
  - redo_reappliesUndoneSnapshot
  - markSaved_clearsDirtyState
  - markSaved_withResolvedIds_replacesTempIdsWithRealGuids

GAPS — the following test cases must be added:

TC-STR-001: addTab_setsNewTab_inNewIdsArray
  References: US-07 / FR-026, ADR-008 (diff-based save)
  Given: store is reset; no form loaded
  When: addTab(newTab) is called
  Then: state.newIds contains the new tab's ID; state.dirtyIds does NOT contain
        it (new records are tracked in newIds, not dirtyIds)
  Priority: Critical
  Type: Unit

TC-STR-002: addSection_addsToSectionsMap_andSectionOrderForTab
  References: US-08 / FR-031
  Given: minimal form is loaded with one tab (tab-1)
  When: addSection(newSection) where newSection.tabId = 'tab-1' is called
  Then: state.sections contains the new section; state.sectionOrder['tab-1']
        includes the new section ID; state.isDirty is true
  Priority: Critical
  Type: Unit

TC-STR-003: addSection_setsSection_inNewIdsArray
  References: US-08 / FR-031, ADR-008
  Given: minimal form is loaded
  When: addSection(newSection) is called
  Then: state.newIds contains newSection.id
  Priority: High
  Type: Unit

TC-STR-004: deleteSection_removesSectionAndChildFields_fromState
  References: US-08 / FR-035, BR-007
  Given: form loaded with one tab, one section (section-1), and two fields (field-a, field-b)
  When: deleteSection('section-1') is called
  Then: state.sections['section-1'] is undefined; state.fields['field-a'] is
        undefined; state.fields['field-b'] is undefined; state.deletedIds contains
        all three IDs; state.fieldOrder['section-1'] does not exist or is empty
  Priority: Critical
  Type: Unit

TC-STR-005: updateField_marksDirty_andUpdatesFieldInMap
  References: US-10 / FR-024, FR-037, ADR-008
  Given: minimal form is loaded; field-1 is in state
  When: updateField('field-1', { label: 'Updated Label' }) is called
  Then: state.fields['field-1'].label is 'Updated Label'; state.dirtyIds contains
        'field-1'; state.isDirty is true
  Priority: Critical
  Type: Unit

TC-STR-006: reorderFields_updatesFieldOrder_withinSameSection
  References: US-06 / FR-013
  Given: form loaded with section-1 containing [field-a, field-b, field-c]
  When: reorderFields('section-1', ['field-c', 'field-a', 'field-b']) is called
  Then: state.fieldOrder['section-1'] is ['field-c', 'field-a', 'field-b'];
        state.fields['field-c'].sortOrder is 0;
        state.fields['field-a'].sortOrder is 1;
        state.isDirty is true
  Priority: Critical
  Type: Unit

TC-STR-007: undo_whenStackIsEmpty_doesNotThrow
  References: US-09 / FR-065
  Given: store is reset (undoStack is empty)
  When: undo() is called
  Then: no exception is thrown; state is unchanged; selectCanUndo returns false
  Priority: High
  Type: Unit

TC-STR-008: redo_whenStackIsEmpty_doesNotThrow
  References: US-09 / FR-066
  Given: store is reset (redoStack is empty)
  When: redo() is called
  Then: no exception is thrown; state is unchanged; selectCanRedo returns false
  Priority: High
  Type: Unit

TC-STR-009: newMutation_afterUndo_clearsRedoStack
  References: US-09 / FR-067, BR — redo stack must be cleared on new action
  Given: addTab is called; then undo() is called (redoStack now has one entry)
  When: addSection(newSection) is called (a new design action)
  Then: state.redoStack is empty; selectCanRedo returns false
  Priority: Critical
  Type: Unit

TC-STR-010: undoStack_neverExceeds_50Snapshots
  References: US-09 / FR-065 (minimum 50 operations), ADR-004
  Given: store is reset
  When: addTab is called 55 times (55 undoable actions)
  Then: state.undoStack.length is exactly 50 (the oldest 5 are evicted);
        state.tabOrder.length is 55 (data is correct, only history is capped)
  Priority: Critical
  Type: Unit

TC-STR-011: moveField_updatesFieldSectionId_inFieldsMap
  References: US-06 / FR-013, phase-3-arch.md Zone 3
  Given: form loaded with two sections; field-x is in section-a
  When: moveField('field-x', 'section-b', 0) is called
  Then: state.fields['field-x'].sectionId is 'section-b'; state.dirtyIds contains
        'field-x'
  Priority: Critical
  Type: Unit

TC-STR-012: markSaved_withResolvedIds_updatesFieldOrderReferences
  References: ADR-008, phase-3-arch.md "resolveId replaces all references"
  Given: addField is called with a tmp_field_001; field is added to fieldOrder
  When: markSaved({ 'tmp_field_001': 'real-guid-field' }) is called
  Then: state.fieldOrder[sectionId] contains 'real-guid-field' and does NOT
        contain 'tmp_field_001'
  Priority: Critical
  Type: Unit

TC-STR-013: autoSave_doesNotChange_formStatus
  References: FR-049, BR-011 (auto-save must not change statuscode)
  Given: form loaded with status 'draft' and isDirty = true
  When: the auto-save interval fires (simulated by calling the save handler directly)
  Then: state.form.status remains 'draft'; no updateRecord call with statuscode
        changes is observed in the WebApi mock
  Priority: Critical
  Type: Unit

3.5 FormDefinitionService — src/services/FormDefinitionService.ts
───────────────────────────────────────────────────────────────────

EXISTING COVERAGE (tests/services/FormDefinitionService.test.ts):
  - createForm_createsRecord_andReturnsId
  - listForms_withStatusFilter_appliesFilter
  - deleteForm_callsDeleteRecord_withCorrectId

GAPS — the following test cases must be added:

TC-FDS-001: createForm_setsStatus_toDraft
  References: US-02 / FR-010
  Given: webApi.createRecord resolves with { id: 'new-id' }
  When: service.createForm({ name: 'Test', code: 'test', ... }) is called
  Then: createRecord is called with qdb_form_definition payload where
        FORM_DEFINITION_ATTRS.STATUS === 'draft'
  Priority: Critical
  Type: Unit

TC-FDS-002: createForm_setsVersion_toZeroPointOne
  References: US-02 / FR-010 (v0.1 Draft version created by wizard)
  Given: webApi.createRecord resolves
  When: service.createForm(dto) is called
  Then: createRecord payload includes FORM_DEFINITION_ATTRS.CURRENT_VERSION = '0.1'
  Priority: High
  Type: Unit

TC-FDS-003: updateForm_callsUpdateRecord_withCorrectEntityAndId
  References: US-10 / FR-037
  Given: webApi.updateRecord resolves with undefined (204 No Content)
  When: service.updateForm('form-abc', { name: 'New Name' }) is called
  Then: updateRecord is called with entity = 'qdb_form_definition', id = 'form-abc',
        and a payload containing FORM_DEFINITION_ATTRS.NAME = 'New Name'
  Priority: Critical
  Type: Unit

TC-FDS-004: listForms_withNoFilter_omitsFilterClause
  References: US-01 / FR-001
  Given: webApi.retrieveMultipleRecords resolves with an empty entities array
  When: service.listForms() is called with no filter argument
  Then: retrieveMultipleRecords is called; the OData query string does NOT contain
        a $filter clause referencing qdb_status
  Priority: High
  Type: Unit

TC-FDS-005: listForms_withSearchTerm_appliesNameFilter
  References: US-01 / FR-002
  Given: webApi.retrieveMultipleRecords resolves with one matching entity
  When: service.listForms({ searchTerm: 'loan' }) is called
  Then: the OData query contains a contains(qdb_name, 'loan') clause
        (or equivalent filter for the name attribute)
  Priority: High
  Type: Unit

TC-FDS-006: deleteForm_propagatesError_whenCrmFails
  References: NFR-006, common.md error handling
  Given: webApi.deleteRecord rejects with new Error('CRM 403')
  When: service.deleteForm('form-id') is called
  Then: the returned promise rejects; the error is not swallowed;
        it propagates to the caller
  Priority: High
  Type: Unit

TC-FDS-007: getForm_mapsAllAttributes_toDesignerFormModel
  References: US-01 / FR-001, phase-3-arch.md "DesignerFormModel"
  Given: webApi.retrieveRecord resolves with a CRM record object containing all
         expected attribute logical names from FORM_DEFINITION_ATTRS
  When: service.getForm('form-id') is called
  Then: the returned DesignerFormModel has correctly mapped id, name, code,
        description, entityLogicalName, status, currentVersion, themeId,
        createdBy, createdOn, modifiedBy, modifiedOn
  Priority: Critical
  Type: Unit

3.6 VersionService — src/services/VersionService.ts
─────────────────────────────────────────────────────

(No existing tests for VersionService)

TC-VS-001: createVersion_callsCreateRecord_withSnapshotJson
  References: US-18 / FR-055, phase-3-arch.md VersionService
  Given: webApi.createRecord resolves with { id: 'version-id' }
  When: service.createVersion('form-id', '2.0', 'v2.0', snapshotObject, 'user-id')
        is called
  Then: createRecord is called with entity = 'qdb_form_version'; the payload includes
        a JSON-serialised snapshot (typeof payload.qdb_snapshot_json === 'string');
        the snapshot deserialises to the snapshotObject passed in
  Priority: Critical
  Type: Unit

TC-VS-002: createVersion_returnsNewVersionId
  References: US-18 / FR-055
  Given: webApi.createRecord resolves with { id: 'version-new-001' }
  When: service.createVersion(...) is called
  Then: the returned string is 'version-new-001'
  Priority: Critical
  Type: Unit

TC-VS-003: listVersions_returnsAllVersionsForForm_orderedByVersionDescending
  References: US-19 / FR-058
  Given: webApi.retrieveMultipleRecords resolves with 3 version records for form-1,
         returned in arbitrary order from CRM
  When: service.listVersions('form-1') is called
  Then: the returned array has 3 entries; they are sorted by version number
        descending (latest first); each entry has versionNumber, status,
        publishedOn, publishedBy fields populated
  Priority: Critical
  Type: Unit

TC-VS-004: listVersions_appliesFormIdFilter_inQuery
  References: US-19 / FR-058
  Given: webApi.retrieveMultipleRecords resolves with empty entities
  When: service.listVersions('form-xyz') is called
  Then: the OData query contains a filter on qdb_form_definition_id = 'form-xyz'
        (ensuring versions from other forms are not returned)
  Priority: High
  Type: Unit

TC-VS-005: incrementMinorVersion_incrementsMinorPart_only
  References: US-18 / FR-055, phase-3-arch.md incrementMinorVersion
  Given: currentVersion is '1.2'
  When: service.incrementMinorVersion('1.2') is called
  Then: result is '1.3'; major version 1 is unchanged
  Priority: High
  Type: Unit

TC-VS-006: incrementMajorVersion_incrementsMajor_andResetsMinorToZero
  References: US-18 / FR-055, phase-3-arch.md incrementMajorVersion
  Given: currentVersion is '1.5'
  When: service.incrementMajorVersion('1.5') is called
  Then: result is '2.0'; minor is reset to 0; major is 2
  Priority: High
  Type: Unit

TC-VS-007: incrementMinorVersion_handlesZeroPointOne_correctly
  References: US-02 / FR-010 (wizard creates v0.1)
  Given: currentVersion is '0.1' (initial wizard version)
  When: service.incrementMinorVersion('0.1') is called
  Then: result is '0.2'
  Priority: High
  Type: Unit

TC-VS-008: getVersionSnapshot_deserialises_snapshotJson_correctly
  References: US-20 / FR-060, phase-3-arch.md VersionService.getVersionSnapshot
  Given: webApi.retrieveRecord resolves with a record where qdb_snapshot_json
         is a JSON string representing { tabs: {...}, fields: {...} }
  When: service.getVersionSnapshot('version-id') is called
  Then: the returned object is the deserialised form — tabs and fields are
        JavaScript objects, not strings
  Priority: Critical
  Type: Unit


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — COMPONENT TEST PLAN (VITEST + RTL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

File location: tests/components/ (new directory, to be created)
Tooling: @testing-library/react + @testing-library/user-event
Store: real useDesignerStore, reset via resetDesigner() in beforeEach

4.1 DraggableToolboxItem — src/designer/toolbox/DraggableToolboxItem.tsx
──────────────────────────────────────────────────────────────────────────

TC-CMP-001: DraggableToolboxItem_renders_withCorrectLabel
  References: US-05 / FR-017, FR-018, FR-019
  Given: component is rendered with fieldType = 'text' and label = 'Text Field'
  When: the component mounts
  Then: the rendered output contains the text 'Text Field'; the element is visible
  Priority: High
  Type: Component

TC-CMP-002: DraggableToolboxItem_hasRole_button_forKeyboardAccess
  References: FR-077, NFR-009 (WCAG 2.1 AA), US-05
  Given: component renders a DraggableToolboxItem
  When: queried via getByRole('button') or getByRole('listitem')
  Then: the element is found; no role is absent
  Note: dnd-kit assigns role='button' to useDraggable elements by default
  Priority: High
  Type: Component

TC-CMP-003: DraggableToolboxItem_setsDataAttribute_withFieldType
  References: US-05 / FR-012, phase-3-arch.md Zone 1 drag data
  Given: component is rendered with fieldType = 'dropdown'
  When: the root element is inspected
  Then: data-field-type="dropdown" attribute is present (or the dnd-kit
        data.current.fieldType is 'dropdown' — verified via the store action
        dispatched in DragEnd, not the physical gesture)
  Priority: High
  Type: Component

TC-CMP-004: DraggableToolboxItem_isTabbable_forKeyboardNavigation
  References: FR-077, NFR-009
  Given: component is rendered
  When: the element is inspected
  Then: tabIndex is 0 or the element is naturally focusable (not tabIndex=-1)
  Priority: High
  Type: Component

4.2 FieldSlot — src/designer/canvas/FieldSlot.tsx
──────────────────────────────────────────────────

TC-CMP-005: FieldSlot_renders_fieldLabel_inCanvas
  References: US-10 / FR-011, FR-014
  Given: store is loaded with a form containing field-1 with label = 'Full Name'
  When: FieldSlot is rendered with fieldId = 'field-1'
  Then: the rendered output contains 'Full Name'
  Priority: High
  Type: Component

TC-CMP-006: FieldSlot_onClick_selectsField_inStore
  References: US-10 / FR-014 (click opens properties panel)
  Given: store is loaded with field-1; FieldSlot renders
  When: the user clicks on the FieldSlot element
  Then: useDesignerStore.getState().selectedId === 'field-1';
        useDesignerStore.getState().selectedType === 'field'
  Priority: Critical
  Type: Component

TC-CMP-007: FieldSlot_highlightsSelected_whenIsSelectedProp_isTrue
  References: US-10 / FR-014 (selected item highlights)
  Given: FieldSlot is rendered with the field-1 ID which is also the store's selectedId
  When: the component renders
  Then: the element has a CSS class or aria-selected attribute indicating selection
        (exact class name depends on implementation; test the aria-selected attribute)
  Priority: High
  Type: Component

TC-CMP-008: FieldSlot_hasAriaLabel_forScreenReader
  References: FR-078, NFR-009 (WCAG 2.1 AA)
  Given: FieldSlot renders with a field labelled 'Email Address'
  When: the element is queried
  Then: the element or a child has aria-label or aria-labelledby containing
        'Email Address' so screen readers can identify it
  Priority: High
  Type: Component

4.3 TabBar — src/designer/canvas/TabBar.tsx
────────────────────────────────────────────

TC-CMP-009: TabBar_renders_allTabLabels
  References: US-07 / FR-026
  Given: store loaded with tabs ['Personal Details', 'Employment', 'Consent']
  When: TabBar renders
  Then: all three labels are visible in the rendered output
  Priority: High
  Type: Component

TC-CMP-010: TabBar_addTab_createsTabWithTempId_andSelectsIt
  References: US-07 / FR-026, phase-3-arch.md Temp ID Strategy
  Given: store is loaded with one existing tab
  When: the user clicks the "Add Tab" button in TabBar
  Then: useDesignerStore.getState().tabOrder has a new entry with a
        tmp_tab_* prefixed ID; the new tab is the selectedId in the store;
        selectedType === 'tab'
  Priority: Critical
  Type: Component

TC-CMP-011: TabBar_addTab_setsNewTab_inNewIdsArray
  References: US-07 / FR-026, ADR-008
  Given: store is loaded; TabBar renders
  When: user clicks "Add Tab"
  Then: useDesignerStore.getState().newIds contains the new tab's temp ID
  Priority: High
  Type: Component

TC-CMP-012: TabBar_clickingTab_changesActiveTab_inStore
  References: US-07 / FR-011
  Given: store loaded with two tabs; second tab is inactive
  When: user clicks the second tab in TabBar
  Then: the store's selectedId equals the second tab's ID;
        the canvas should show the second tab's sections (this is UI state)
  Priority: High
  Type: Component

4.4 PropertiesPanel — src/designer/properties/PropertiesPanel.tsx
──────────────────────────────────────────────────────────────────

TC-CMP-013: PropertiesPanel_showsFormProperties_whenSelectedTypeIsForm
  References: US-10 / FR-021
  Given: store has selectedType = 'form' and selectedId = 'form-1'
  When: PropertiesPanel renders
  Then: FormProperties component is visible; TabProperties, SectionProperties,
        and FieldProperties are NOT in the DOM (or are hidden)
  Priority: Critical
  Type: Component

TC-CMP-014: PropertiesPanel_showsTabProperties_whenSelectedTypeIsTab
  References: US-07 / FR-022
  Given: store has selectedType = 'tab' and selectedId = 'tab-1'
  When: PropertiesPanel renders
  Then: TabProperties component is visible; other property components are absent
  Priority: Critical
  Type: Component

TC-CMP-015: PropertiesPanel_showsSectionProperties_whenSelectedTypeIsSection
  References: US-08 / FR-023
  Given: store has selectedType = 'section' and selectedId = 'section-1'
  When: PropertiesPanel renders
  Then: SectionProperties component is visible
  Priority: Critical
  Type: Component

TC-CMP-016: PropertiesPanel_showsTextFieldPanel_whenFieldTypeIsText
  References: US-10 / FR-024, FR-025
  Given: store has selectedType = 'field'; selected field has fieldType = 'text'
  When: PropertiesPanel renders
  Then: TextFieldPanel (which includes regex and min/max length controls) is visible
  Priority: Critical
  Type: Component

TC-CMP-017: PropertiesPanel_showsDropdownFieldPanel_whenFieldTypeIsDropdown
  References: US-11 / FR-025 (Option Set source for Dropdown)
  Given: store has selectedType = 'field'; selected field has fieldType = 'dropdown'
  When: PropertiesPanel renders
  Then: DropdownFieldPanel (which includes the options editor) is visible;
        TextFieldPanel is NOT visible
  Priority: Critical
  Type: Component

TC-CMP-018: PropertiesPanel_showsLookupFieldPanel_whenFieldTypeIsLookup
  References: US-12 / FR-025 (Lookup entity, filter, display field)
  Given: store has selectedType = 'field'; selected field has fieldType = 'lookup'
  When: PropertiesPanel renders
  Then: LookupFieldPanel is visible (showing entity, displayField, filter inputs)
  Priority: Critical
  Type: Component

TC-CMP-019: PropertiesPanel_showsNothingSelected_whenSelectedIdIsNull
  References: FR-020
  Given: store has selectedId = null; selectedType = null
  When: PropertiesPanel renders
  Then: a "no selection" placeholder message is visible; no property form is shown
  Priority: High
  Type: Component


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — E2E TEST PLAN (PLAYWRIGHT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5.1 Playwright Configuration
─────────────────────────────

  File: playwright.config.ts (create at project root)
  Projects: chromium (primary), chrome (secondary)
  Base URL: http://localhost:5173
  Global setup: inject window.Xrm mock via addInitScript before each test

  Xrm mock injection pattern (playwright.config.ts globalSetup):
    page.addInitScript(() => {
      window.Xrm = { /* typed mock returning fixture data */ };
      window.parent = window; // CRM iframe simulation
    });

  Fixture files: tests/fixtures/*.json (populated with realistic CRM response shapes)

5.2 E2E Test Cases
───────────────────

TC-E2E-001: createForm_viaWizard_landsOnDesignerWithCorrectTitle
  References: US-02 / FR-004 through FR-010, AC-001
  Given: Xrm mock returns success for createRecord on all wizard entities
  When: user navigates to FormListScreen; clicks "New Form"; completes all 5 wizard
        steps with valid inputs; clicks "Create"
  Then: DesignerScreen is visible; the command bar displays the new form name;
        status badge shows 'Draft'; form list screen is no longer visible;
        createRecord was called for qdb_form_definition, qdb_form_tab,
        qdb_form_section, and qdb_form_version (4 separate calls minimum)
  Priority: Critical
  Type: E2E

TC-E2E-002: dragFieldFromToolbox_toSection_appearsInCanvas
  References: US-05 / FR-012, FR-014, FR-015, AC-002
  Given: DesignerScreen loads with one tab and one empty section; Xrm mock is idle
  When: user drags a 'Text Field' item from the ComponentToolbox and drops it
        onto the section drop target (simulated with Playwright page.dragAndDrop
        or mouse.move + mouse.down + mouse.up sequence)
  Then: a new FieldSlot with default label appears inside the section container;
        the PropertiesPanel switches to show field properties;
        useDesignerStore.getState().isDirty is true;
        the new field's ID exists in state.newIds
  Priority: Critical
  Type: E2E

TC-E2E-003: dragFieldFromToolbox_toTabBar_doesNotCreateField
  References: FR-016, phase-3-arch.md "Skeptic Review Challenge 1"
  Given: DesignerScreen loads with one tab
  When: user attempts to drag a toolbox item and drop it onto the tab bar
        (invalid drop target)
  Then: no new field is created; state.fields has the same count as before;
        a visual rejection indicator appears briefly (aria-live region or
        visual style change)
  Confidence: 87%
  Priority: High
  Type: E2E

TC-E2E-004: editFieldLabel_updatesCanvasInRealTime
  References: US-10 / FR-014 (update live on canvas within 100ms), AC-002
  Given: DesignerScreen loads with a field labelled 'Old Label'
  When: user clicks the field; PropertiesPanel shows; user clears and types
        'New Label' in the label input
  Then: the FieldSlot on the canvas shows 'New Label' without any save action;
        state.fields[fieldId].label === 'New Label';
        state.dirtyIds contains the fieldId
  Priority: Critical
  Type: E2E

TC-E2E-005: publishValidation_showsErrorList_whenRequiredGatesFail
  References: US-17 / FR-052, FR-053, FR-054, AC-004, BR-001
  Given: DesignerScreen loads with a form missing entityLogicalName (PV-011)
         and containing one Dropdown field with no options (PV-009)
  When: user clicks "Publish" in the command bar
  Then: PublishValidationScreen is displayed; PV-009 and PV-011 both appear
        in the issues list with FAIL badges; the "Confirm Publish" button is
        disabled; PV-012 warning (if applicable) is shown but does not disable
        the button (only error-severity issues disable it)
  Priority: Critical
  Type: E2E

TC-E2E-006: publishValidation_succeeds_andCreatesVersionRecord
  References: US-18 / FR-055, FR-056, FR-057, AC-003
  Given: DesignerScreen loads with a fully valid form (all PV gates pass);
         Xrm mock returns success for all createRecord and updateRecord calls
  When: user clicks "Publish"; PublishValidationScreen shows all PASS items;
        user clicks "Confirm Publish"
  Then: createRecord is called for qdb_form_version;
        updateRecord is called for qdb_form_definition with status = 'published';
        createRecord is called for qdb_form_audit_log with action = 'PUBLISH';
        DesignerScreen shows status badge = 'Published';
        a CRM notification banner is visible
  Priority: Critical
  Type: E2E

TC-E2E-007: restoreVersion_resetsFormToSnapshot
  References: US-20 / FR-060, FR-061, AC-008
  Given: VersionHistoryScreen shows 3 versions; Xrm mock returns a snapshot for
         version 1.0 with 2 tabs; current form in designer has 3 tabs
  When: user clicks "Restore" on version 1.0 and confirms the destructive action
  Then: DesignerScreen reloads with 2 tabs (matching version 1.0 snapshot);
        status is 'draft'; createRecord is called for qdb_form_audit_log with
        action = 'RESTORE_VERSION'
  Priority: Critical
  Type: E2E

TC-E2E-008: saveDraft_writesAuditLog_withSaveDraftAction
  References: US-15 / FR-048, FR-051, AC-008
  Given: DesignerScreen loads with a dirty form (field label changed)
  When: user clicks "Save Draft"
  Then: updateRecord is called for qdb_form_field;
        createRecord is called for qdb_form_audit_log with the payload
        { action: 'SAVE_DRAFT', formId: expectedFormId };
        isDirty becomes false; lastSavedAt is a Date
  Priority: Critical
  Type: E2E

TC-E2E-009: undoRedo_revertsAndReapplies_designActions
  References: US-09 / FR-065, FR-066, FR-067, AC-005
  Given: DesignerScreen loads with 2 fields
  When: user drags a third field from toolbox (field added);
        presses Ctrl+Z (undo — field removed);
        presses Ctrl+Y (redo — field re-added)
  Then: after undo: state.fields has 2 entries; the third field's FieldSlot
        is not in the canvas DOM;
        after redo: state.fields has 3 entries; the FieldSlot reappears
  Priority: Critical
  Type: E2E

TC-E2E-010: preview_rendersForm_atMobileBreakpoint
  References: US-16 / FR-072, FR-073, FR-074, AC-006
  Given: DesignerScreen loads with a form containing 2 tabs and 4 fields
  When: user clicks "Preview"; breakpoint selector shows; user clicks "Mobile"
  Then: PreviewScreen is visible; the preview container's computed width is
        375px (or CSS transform scale equivalent); no editing controls are
        visible (toolbox, properties panel, command bar editing actions are
        hidden or disabled)
  Priority: High
  Type: E2E

TC-E2E-011: reorderTab_byDrag_updatesTabOrder_inCanvas
  References: US-07 / FR-028, AC-002
  Given: DesignerScreen loads with tabs ['Tab A', 'Tab B', 'Tab C']
  When: user drags 'Tab C' to the first position
  Then: TabBar renders tabs in order ['Tab C', 'Tab A', 'Tab B'];
        state.tabOrder[0] is 'Tab C's ID; state.isDirty is true
  Priority: High
  Type: E2E

TC-E2E-012: formList_filters_byPublishedStatus
  References: US-01 / FR-001, FR-002
  Given: FormListScreen loads; Xrm mock returns 3 forms (1 Draft, 2 Published)
  When: user selects 'Published' in the status filter dropdown
  Then: only the 2 Published forms are visible in the list; the 1 Draft form
        is not rendered; the retrieveMultipleRecords call includes a filter
        on qdb_status = 'published'
  Priority: High
  Type: E2E

TC-E2E-013: deleteForm_isOnlyAvailable_forDraftForms
  References: US-01 / FR-003, BR-007
  Given: FormListScreen loads with one Draft form and one Published form
  When: user inspects the action buttons on each row
  Then: the Draft form row has a "Delete" button; the Published form row
        does NOT have a "Delete" button (application-enforced constraint)
  Priority: High
  Type: E2E


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — PERFORMANCE BENCHMARKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Benchmark                                | Target      | Measurement Method           | Tool           |
|------------------------------------------|-------------|------------------------------|----------------|
| Initial render — empty form (0 fields)   | < 200ms     | Playwright performance.mark  | Playwright     |
| Initial render — large form (50 fields)  | < 500ms     | Playwright performance.mark  | Playwright     |
| Drag initiation frame budget             | < 16ms      | requestAnimationFrame timing | Playwright     |
| Label change → canvas update latency     | < 100ms     | Playwright performance.mark  | Playwright     |
| Theme colour change → canvas update      | < 500ms     | Playwright performance.mark  | Playwright     |
| Undo operation (1 step, 50-entry stack)  | < 5ms       | Vitest performance.now       | Vitest unit    |
| Redo operation (1 step)                  | < 5ms       | Vitest performance.now       | Vitest unit    |
| Save Draft — 10 dirty records            | < 3000ms    | Playwright network timing    | Playwright     |
| Publish flow — full pipeline             | < 5000ms    | Playwright network timing    | Playwright     |
| Bundle size (all chunks, uncompressed)   | < 4,096 KB  | scripts/checkBundleSize.js   | Node.js CI     |
| Bundle size (gzipped total estimate)     | < 500 KB    | Vite build reporter          | Vite           |
| Memory — 50 undo snapshots (50 fields)   | < 25 MB     | Chrome DevTools heap (manual)| DevTools       |

References:
  - NFR-004: < 100ms interaction response; < 16ms drag initiation; < 3s API calls
  - NFR-005: < 5MB bundle (hard limit); CI enforces < 4MB as working limit
  - ADR-004: 50 snapshots must be manageable in memory (see RISK-002)

Playwright performance measurement pattern (for CI integration):
  const startMark = await page.evaluate(() => performance.now());
  // trigger action
  const endMark = await page.evaluate(() => performance.now());
  expect(endMark - startMark).toBeLessThan(200);

Memory profiling for RISK-002 (manual, pre-UAT):
  Load a form with 50 fields. Make 50 sequential field label changes (50 undo entries).
  Open Chrome DevTools → Memory → Take heap snapshot.
  Assert total heap increase attributable to the Zustand store is < 25MB.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — ACCESSIBILITY CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

References: NFR-009, FR-077, FR-078, FR-079, US-09, phase-3-arch.md ADR-002 KeyboardSensor

7.1 Keyboard Navigation — Test Cases
──────────────────────────────────────

TC-A11Y-001: AllToolboxItems_areReachable_viaTabKey
  Given: FormListScreen and DesignerScreen have loaded with keyboard focus at the top
  When: user repeatedly presses Tab key
  Then: every toolbox item (Basic Fields, Layout, Advanced categories) receives
        focus in DOM order; no interactive element is skipped; focus indicator is
        visible on each element (not hidden by CSS outline:0 without alternative)
  Priority: High
  Type: E2E (Playwright with keyboard navigation)

TC-A11Y-002: ToolboxItem_isActivatable_viaEnterKey
  References: FR-077
  Given: a DraggableToolboxItem has keyboard focus (focused via Tab)
  When: user presses Enter
  Then: the keyboard-based drag-drop flow initiates (dnd-kit KeyboardSensor);
        an announcement is made to screen readers via aria-live region;
        the item is not activated by Space (Space should not trigger drag,
        as it conflicts with CRM frame scrolling)
  Priority: High
  Type: E2E

TC-A11Y-003: ArrowKeys_reorder_selectedCanvasItem
  References: FR-079
  Given: a FieldSlot has keyboard focus; it is in position 2 of 3 fields in a section
  When: user presses ArrowUp
  Then: the field moves to position 1; state.fieldOrder reflects the new order;
        a screen reader announcement confirms the reorder (e.g., 'Field moved up')
  Priority: High
  Type: E2E

TC-A11Y-004: AllTabs_haveRole_tab_andTabList_role_onContainer
  References: FR-078, WCAG 2.1 AA 4.1.2 (Name, Role, Value)
  Given: TabBar renders with three tabs
  When: the DOM is inspected
  Then: the tab container has role='tablist'; each tab button has role='tab';
        the active tab has aria-selected='true'; inactive tabs have aria-selected='false'
  Priority: High
  Type: Component (RTL)

TC-A11Y-005: DragOperation_announcesStart_andEnd_toScreenReader
  References: FR-078, NFR-009 (screen reader announcements for drag operations)
  Given: dnd-kit KeyboardSensor is active; a FieldSlot has focus
  When: user initiates a keyboard drag (Enter) and then drops (Enter)
  Then: an aria-live region (role='status' or aria-live='polite') announces
        the drag start (e.g., 'Text Field picked up. It is at position 2 of 3.')
        and the drop (e.g., 'Text Field dropped at position 1 of 3.')
  Priority: High
  Type: E2E

TC-A11Y-006: PublishValidationScreen_errorsAreListed_asAccessibleList
  References: US-17 / FR-052, WCAG 2.1 AA 1.3.1 (Info and Relationships)
  Given: PublishValidationScreen renders with 3 error-severity issues
  When: the DOM is inspected
  Then: the issues are rendered in an <ul> or <ol> element with individual <li>
        entries; each issue's severity is communicated via aria-label or visible
        text (not colour alone — WCAG 1.4.1 Use of Color)
  Priority: High
  Type: Component (RTL)

TC-A11Y-007: PropertiesPanel_inputs_haveAssociatedLabels
  References: WCAG 2.1 AA 1.3.1, 2.4.6
  Given: PropertiesPanel renders FieldProperties for a text field
  When: all form inputs are inspected via getByLabelText
  Then: every input (label, code, placeholder, help text, required checkbox)
        has an associated <label> element or aria-label attribute;
        no input is unlabelled
  Priority: High
  Type: Component (RTL)

TC-A11Y-008: DesignerScreen_hasSkipLink_orLogicalFocusOrder
  References: WCAG 2.1 AA 2.4.3 (Focus Order)
  Given: DesignerScreen loads
  When: user begins keyboard navigation
  Then: focus order follows logical reading order: command bar → toolbox →
        canvas → properties panel; or a skip-to-main-content link is provided
  Priority: Medium
  Type: E2E

7.2 ARIA Roles Reference (Implementation Guide)
─────────────────────────────────────────────────

  Component                 Required ARIA
  ─────────────────────     ─────────────────────────────────────────────
  TabBar container          role="tablist" + aria-label="Form tabs"
  Each SortableTab          role="tab" + aria-selected + aria-controls
  Tab content panel         role="tabpanel" + aria-labelledby
  DesignerCanvas            role="main" + aria-label="Form canvas"
  ComponentToolbox          role="navigation" + aria-label="Component toolbox"
  DraggableToolboxItem      role="button" + aria-grabbed (during drag)
  FieldSlot                 role="listitem" + aria-selected
  SectionContainer          role="list" + aria-label="Section fields"
  PublishValidation list    role="list" + aria-live="polite" on result changes
  DragOverlay ghost         aria-hidden="true" (ghost is decorative)
  Screen reader announcer   role="status" + aria-live="polite" (dnd-kit)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — CRM-SPECIFIC EDGE CASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

8.1 Xrm.WebApi Unavailable — Initialization Error Path
────────────────────────────────────────────────────────

TC-CRM-EDGE-001: CrmContextService_throwsCrmContextError_whenXrmUnavailable
  References: phase-3-arch.md CRM context acquisition pattern,
              phase-3-arch.md CHALLENGE 8 (CrmUserContext getUserId fix)
  Given: window.Xrm is undefined; window.parent.Xrm is undefined
  When: createCrmContextService() or acquireXrmContext() is called
  Then: CrmContextError is thrown with a descriptive message including
        'Xrm context not available'; the error is NOT swallowed;
        the application renders an error screen with actionable guidance
        ("This tool must be opened inside Dynamics CRM")
  Priority: Critical
  Type: Unit + E2E
  Confidence: 98%

TC-CRM-EDGE-002: App_rendersErrorBoundary_whenCrmContextFails
  References: phase-3-arch.md CHALLENGE 8, common.md "error boundaries at system entry points"
  Given: App.tsx renders; CrmContextService throws CrmContextError during init
  When: the React error boundary catches the error
  Then: a user-friendly error screen is shown; no unhandled error is propagated
        to window.onerror; the error boundary does not attempt to re-mount
        the full designer with a broken Xrm context
  Priority: Critical
  Type: Component + E2E

TC-CRM-EDGE-003: getUserContext_usesXrmUtility_notDeprecatedXrmPage
  References: phase-3-arch.md CHALLENGE 8 (CRITICAL BUG — must use
              Xrm.Utility.getGlobalContext().getUserId() not Xrm.Page)
  Given: the Xrm mock has Xrm.Utility.getGlobalContext returning a valid user;
         Xrm.Page is undefined (simulating UCI on-premise)
  When: CrmContextService.getUserContext() is called
  Then: the returned CrmUserContext has a non-empty userId and userFullName;
        no ReferenceError or TypeError is thrown; Xrm.Page is never accessed
  Priority: Critical
  Type: Unit
  Confidence: 98%
  Note: This tests the fix for the architecture bug identified in CHALLENGE 8.
        If this test fails, the getUserContext implementation still uses the
        deprecated Xrm.Page pattern and will fail on on-premise UCI environments.

8.2 Network Timeout — Retry Exhausted
───────────────────────────────────────

TC-CRM-EDGE-004: saveDraft_showsErrorNotification_whenRetryExhausted
  References: NFR-006 (retry up to 3 times; surface error to user after exhaustion)
  Given: Xrm mock's updateRecord always rejects with a network error;
         vi.useFakeTimers() simulates the retry backoff delays
  When: the user clicks "Save Draft" and all three retries fail
  Then: Xrm.App.addGlobalNotification is called with an error-type notification;
        state.isSaving becomes false (not stuck in loading state);
        state.isDirty remains true (changes were NOT lost — they are still in store);
        no uncaught promise rejection occurs
  Priority: Critical
  Type: Unit + E2E
  Confidence: 95%

TC-CRM-EDGE-005: publish_showsError_whenVersionCreateFails
  References: US-18 / FR-055, phase-3-arch.md Publish Flow Step 3
  Given: all prior save steps succeed (form and dirty records saved);
         the createRecord call for qdb_form_version rejects (CRM 500)
  When: the publish pipeline runs
  Then: PublishValidationScreen shows an error notification;
        state.form.status remains 'draft' (publish is transactional — partial
        success does not set status to 'published');
        state.isPublishing becomes false
  Priority: Critical
  Type: E2E
  Confidence: 88%
  Note: This tests the partial-save scenario identified in CHALLENGE 2 of the
        architecture skeptic review. The implementation MUST handle this; if the
        form status is set before the version record is created and the version
        create fails, the form status is incorrectly 'published' with no version.

8.3 Concurrent Edit — Another User Saved Newer Version
────────────────────────────────────────────────────────

TC-CRM-EDGE-006: saveDraft_detectsConcurrentEdit_andWarnsUser
  References: NFR-006, RISK-006 (form code uniqueness race condition)
  Given: designer is open with form version '1.0'; another user updates
         the same form in CRM (simulated by retrieveRecord returning
         modifiedOn timestamp newer than state.lastSavedAt)
  When: the user clicks "Save Draft"
  Then: before writing, the service detects the version conflict;
        a warning dialog appears: "This form was modified by [user] at [time].
        Saving will overwrite their changes. Continue?";
        if user cancels, no write occurs; if user confirms, save proceeds
  Priority: High
  Type: E2E
  Confidence: 82%
  Note: Concurrent edit detection is not explicitly in the BRD but is implied
        by NFR-006 and is a real production risk in a multi-user banking environment.
        The implementation approach (compare modifiedOn before write) should be
        confirmed with the architect before building this test.

8.4 CRM Form Context Missing Required Parameters
──────────────────────────────────────────────────

TC-CRM-EDGE-007: app_handlesNull_formIdQueryParam_gracefully
  References: FR-001, phase-3-arch.md "navigateTo (Zustand screen enum, no React Router)"
  Given: the web resource loads without a formId query parameter
         (e.g., opened from sitemap without a specific form context)
  When: the app initialises
  Then: FormListScreen is displayed (default screen); no crash occurs;
        CrmContextService.getCurrentFormId() returns null and the app routes
        to the list view rather than attempting to load a null form ID
  Priority: High
  Type: E2E

TC-CRM-EDGE-008: retrieveMultipleRecords_handlesEmpty_entitiesArray
  References: US-01 / FR-001
  Given: webApi.retrieveMultipleRecords resolves with { entities: [], nextLink: undefined }
         (CRM environment has no qdb_form_definition records yet)
  When: FormListScreen loads
  Then: the form list renders an empty state message (e.g., "No forms found.
        Click New Form to create one."); no runtime error occurs from attempting
        to map an empty array
  Priority: High
  Type: Unit + Component

8.5 Audit Log Append-Only Enforcement
───────────────────────────────────────

TC-CRM-EDGE-009: AuditLogService_neverCallsUpdate_onAnyAuditAction
  References: BR-010, NFR-010, FR-076, phase-3-arch.md CHALLENGE 6
  Given: AuditLogService is instantiated with a mock WebApi
  When: logAction is called for every supported AuditAction type
        (OPEN_FORM, SAVE_DRAFT, PUBLISH, CLONE, RESTORE_VERSION,
         DELETE_FORM, ARCHIVE_FORM, THEME_SAVE)
  Then: webApi.updateRecord is NEVER called for any of these actions;
        webApi.deleteRecord is NEVER called; only webApi.createRecord is called
  Priority: Critical
  Type: Unit
  Confidence: 99%

TC-CRM-EDGE-010: AuditLogService_timestampIsRecorded_inUTCIsoFormat
  References: FR-075, NFR-010 (banking compliance — 7-year retention)
  Given: logAction is called at a known mocked timestamp
  When: createRecord payload is inspected
  Then: the timestamp field contains a valid ISO 8601 string in UTC (ends with 'Z');
        it is not null or undefined; it is not a local timezone string
  Priority: High
  Type: Unit


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9 — SECURITY TEST CASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TC-SEC-001: noSecretsOrTokens_inCompiledBundle
  References: NFR-007, common.md "No secrets, credentials, or tokens in source code"
  Given: the Vite build completes and produces the bundle artifacts
  When: the compiled JS files are scanned for patterns:
        - 'password', 'secret', 'token', 'api_key', 'apikey', 'credential'
        - Any UUID/GUID that is not a test fixture
        - Any 'https://' URL referencing an external service
  Then: zero matches found in any compiled artifact
  Tool: scripts/checkBundleSize.js can be extended to include this regex scan
  Priority: Critical
  Type: Security (automated CI scan)

TC-SEC-002: xrmWebApi_isOnlyExternalCallMechanism
  References: NFR-007, BR-013, C-002 (no external API calls)
  Given: the compiled bundle is inspected
  When: network call patterns are searched:
        - fetch(, XMLHttpRequest, axios, $.ajax, navigator.sendBeacon
        - Any string containing 'http://' or 'https://' as a call target
  Then: zero direct fetch/XHR calls exist; all network calls go through
        Xrm.WebApi (confirmed by code review — the compiled bundle will not
        reference fetch directly if the service layer is pure Xrm.WebApi)
  Priority: Critical
  Type: Security (code review + CI scan)

TC-SEC-003: formCode_rejectedAtSave_whenDuplicateExists
  References: BR-002 (form code uniqueness enforced by application code)
  Given: webApi.retrieveMultipleRecords returns one existing form with code 'loan_app'
  When: a new form with code 'loan_app' is about to be saved via FormDefinitionService
  Then: the service throws a domain-specific error (DuplicateFormCodeError or similar);
        no createRecord call is made; the UI displays "This form code already exists"
  Priority: High
  Type: Unit
  Confidence: 85%
  Note: The uniqueness check before save (see phase-3-arch.md "Form code uniqueness")
        must be implemented in FormDefinitionService and tested here.

TC-SEC-004: noXrmPageUsage_inAnySourceFile
  References: NFR-008, C-004, phase-3-arch.md CHALLENGE 8
  Given: the entire src/ directory is scanned
  When: grep pattern 'Xrm\.Page' is run against all .ts and .tsx files
  Then: zero occurrences found — deprecated Xrm.Page is prohibited throughout
  Tool: CI lint rule or grep check in the pipeline
  Priority: Critical
  Type: Security / Compliance (automated CI check)

TC-SEC-005: noDocumentGetElementById_inAnySourceFile
  References: NFR-008, C-005 (deprecated DOM manipulation patterns prohibited)
  Given: the entire src/ directory is scanned
  When: patterns 'document\.getElementById', 'document\.querySelector',
        'document\.write', 'innerHTML\s*=' are searched in .ts/.tsx files
  Then: zero occurrences found
  Tool: ESLint rule (no-restricted-syntax or custom plugin)
  Priority: Critical
  Type: Security / Compliance (automated lint)

TC-SEC-006: bundleContainsNoEvalOrFunctionConstructor
  References: common.md "No eval() or Function() with dynamic strings"
  Given: the compiled bundle artifacts are scanned
  When: patterns 'eval(' and 'new Function(' are searched in output JS files
  Then: zero occurrences found (bundlers may produce these in minified form;
        rollup's output should be clean if source has none)
  Priority: Critical
  Type: Security (CI scan)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10 — BUSINESS RULE JSON SCHEMA CONFORMANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

References: CEO Condition C-001, BR-012, phase-3-arch.md BusinessRuleDefinition v1.0

These tests verify that the rule configuration panel writes the exact agreed
JSON schema to qdb_form_business_rule.qdb_rule_definition. Any deviation from
the schema breaks the Dynamic Form Engine renderer silently at runtime.

TC-BR-001: businessRuleJson_containsVersion_one_point_zero
  Given: a business rule is configured: trigger = 'field_a', condition = equals 'Yes',
         action = show_field 'field_b'
  When: BusinessRuleService.createRule(dto) is called
  Then: the createRecord payload's qdb_rule_definition field, when JSON.parsed,
        has { version: '1.0' }
  Priority: Critical
  Type: Unit

TC-BR-002: businessRuleJson_containsTriggerFieldCode_andTriggerEvent
  Given: business rule configured with trigger_field_code = 'income_source'
  When: createRule is called
  Then: parsed JSON has:
        trigger_field_code === 'income_source'
        trigger_event === 'on_change'
  Priority: Critical
  Type: Unit

TC-BR-003: businessRuleJson_conditionGroup_hasLogicalOperator_andConditionsArray
  Given: business rule has two conditions with AND logic
  When: createRule is called
  Then: parsed JSON.condition_group.logical_operator === 'AND';
        parsed JSON.condition_group.conditions is an array with 2 entries;
        each condition has field_code, operator, value properties
  Priority: Critical
  Type: Unit

TC-BR-004: businessRuleJson_value_isNull_forIsEmpty_operator
  References: phase-3-arch.md "value: string | null // null for is_empty/is_not_empty"
  Given: business rule condition has operator = 'is_empty'
  When: createRule is called
  Then: parsed JSON.condition_group.conditions[0].value === null (not '' or undefined)
  Priority: High
  Type: Unit

TC-BR-005: businessRuleJson_action_containsActionType_andTargetFieldCode
  Given: business rule has action: show_field targeting 'field_employer_name'
  When: createRule is called
  Then: parsed JSON.actions[0].action_type === 'show_field';
        parsed JSON.actions[0].target_field_code === 'field_employer_name';
        the 'value' key is absent (not undefined, absent) for action types that
        do not require a value
  Priority: Critical
  Type: Unit

TC-BR-006: businessRuleJson_setValue_action_includesValue_property
  Given: business rule has action: set_value targeting 'field_amount' with value '1000'
  When: createRule is called
  Then: parsed JSON.actions[0].action_type === 'set_value';
        parsed JSON.actions[0].value === '1000';
        the value key is present
  Priority: High
  Type: Unit


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11 — SPRINT 1 ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following criteria MUST ALL pass before UAT can begin. Each criterion
maps to one or more test cases defined in this document. Where publish
validation codes apply, they are noted.

AC-001: Form List loads and displays correct columns
  Criterion: FormListScreen renders all qdb_form_definition records with
             Name, Code, Status, Version, Modified On, Modified By columns.
             Status filter (Draft / Published / Archived) returns correct subsets.
  Tests: TC-FDS-004, TC-FDS-005, TC-E2E-012
  PV Gate: N/A

AC-002: New Form Wizard creates all required CRM records
  Criterion: Completing the 5-step wizard creates: qdb_form_definition (Draft),
             one qdb_form_tab, one qdb_form_section, one qdb_form_version (v0.1).
             Designer screen opens after create.
  Tests: TC-FDS-001, TC-FDS-002, TC-E2E-001
  PV Gate: N/A (wizard precedes publish)

AC-003: Drag-and-drop field creation works (toolbox to section)
  Criterion: Dragging any field type from the ComponentToolbox and dropping it
             onto a SectionContainer creates a new FieldSlot in the canvas with
             a tmp_ ID. The PropertiesPanel opens for the new field. isDirty = true.
  Tests: TC-CMP-003, TC-E2E-002
  PV Gate: N/A

AC-004: Drag-and-drop reorder works (fields within section, sections within tab, tabs)
  Criterion: Field reorder updates state.fieldOrder and field.sortOrder.
             Section reorder updates sectionOrder. Tab reorder updates tabOrder.
             All three reorder actions set isDirty = true.
  Tests: TC-STR-006, TC-E2E-011
  PV Gate: N/A

AC-005: Properties panel shows correct type-specific panel for every field type
  Criterion: Selecting a Text field shows TextFieldPanel. Selecting a Dropdown
             shows DropdownFieldPanel. Selecting a Lookup shows LookupFieldPanel.
             Selecting a Tab shows TabProperties. Selecting a Section shows
             SectionProperties.
  Tests: TC-CMP-013 through TC-CMP-018
  PV Gate: N/A

AC-006: Field label edit updates canvas in real time (< 100ms)
  Criterion: Changing the label input in PropertiesPanel updates the FieldSlot
             label on the canvas without a save action. Round-trip latency < 100ms.
  Tests: TC-E2E-004, performance benchmark (label change)
  PV Gate: N/A

AC-007: Save Draft persists dirty records only and writes audit log
  Criterion: Save Draft calls updateRecord/createRecord only for IDs in dirtyIds
             and newIds. Status remains 'draft'. One qdb_form_audit_log record
             with action = SAVE_DRAFT is created. isDirty becomes false.
  Tests: TC-STR-013, TC-E2E-008, TC-CRM-EDGE-009
  PV Gate: N/A (save draft bypasses publish gates)

AC-008: Publish validation gates PV-001 through PV-012 all function correctly
  Criterion: Each of the 12 publish validation codes produces the correct
             pass/fail result. PV-001 through PV-011 are error-severity and block
             publish. PV-012 is warning-severity and does not block publish.
  Tests: TC-PV-001 through TC-PV-014
  PV Gates: PV-001 — form name present and max 200 chars
            PV-002 — form code present, unique, lowercase [a-z0-9_]
            PV-003 — at least one tab exists
            PV-004 — no tab has empty label
            PV-005 — every tab has at least one section
            PV-006 — no field has empty label
            PV-007 — no field has empty code
            PV-008 — no duplicate field codes within the form
            PV-009 — Dropdown/MultiSelect/Radio each have >= 1 option
            PV-010 — Lookup fields have target entity configured
            PV-011 — form has target CRM entity for submission mapping
            PV-012 — at least one required field exists (warning only)

AC-009: Publish flow creates version record and sets form status to Published
  Criterion: When all PV gates pass and user confirms publish: one qdb_form_version
             record is created; qdb_form_definition.statuscode is updated to
             'published'; one qdb_form_audit_log record with action = PUBLISH
             is created; a CRM global notification banner is shown.
  Tests: TC-VS-001, TC-VS-002, TC-E2E-006
  PV Gate: All 11 error gates must pass

AC-010: Version history lists and restores versions correctly
  Criterion: VersionHistoryScreen lists all qdb_form_version records for the form.
             Restoring a version creates new CRM records from the snapshot and
             writes a RESTORE_VERSION audit entry. The designer opens as Draft.
  Tests: TC-VS-003, TC-VS-004, TC-VS-008, TC-E2E-007
  PV Gate: N/A

AC-011: Undo/redo with 50-entry stack works correctly
  Criterion: 50 sequential mutations create 50 undo snapshots (51st evicts oldest).
             Undo reverts to previous state. Redo re-applies. New action after
             undo clears the redo stack. No crash on undo/redo of empty stack.
  Tests: TC-STR-007, TC-STR-008, TC-STR-009, TC-STR-010, TC-E2E-009
  PV Gate: N/A

AC-012: Audit log is append-only (no update or delete)
  Criterion: AuditLogService never calls updateRecord or deleteRecord for any
             action type. All 8 AuditAction types produce only a createRecord
             call on qdb_form_audit_log.
  Tests: TC-CRM-EDGE-009, TC-CRM-EDGE-010, AuditLogService.test.ts existing suite
  PV Gate: N/A (governance requirement — BR-010)

AC-013: Xrm context error renders error boundary, not blank page
  Criterion: When window.Xrm and window.parent.Xrm are both unavailable, the
             application renders a user-readable error screen. No unhandled
             JavaScript exception reaches the browser console.
  Tests: TC-CRM-EDGE-001, TC-CRM-EDGE-002
  PV Gate: N/A

AC-014: Bundle size stays under 4MB (CI enforced)
  Criterion: scripts/checkBundleSize.js passes with exit code 0 after every build.
             Vite build reporter shows no chunk exceeding 500KB warning threshold.
  Tests: Bundle size CI gate (automated, runs in CI pipeline step 5)
  PV Gate: N/A (NFR-005)

AC-015: CRM user context uses Xrm.Utility.getGlobalContext, not Xrm.Page
  Criterion: CrmContextService.getUserContext() returns a valid CrmUserContext
             when Xrm.Page is undefined (on-premise UCI environment). No TypeError
             is thrown attempting to access Xrm.Page.
  Tests: TC-CRM-EDGE-003
  PV Gate: N/A (architecture bug fix — CHALLENGE 8)

AC-016: Keyboard navigation and ARIA roles are implemented correctly
  Criterion: All toolbox items are reachable via Tab key. All tabs have role='tab'.
             All inputs have associated labels. Drag operations announce to
             screen readers via aria-live regions.
  Tests: TC-A11Y-001 through TC-A11Y-008
  PV Gate: N/A (NFR-009, WCAG 2.1 AA)

AC-017: Business rule JSON schema matches agreed renderer contract (v1.0)
  Criterion: BusinessRuleService produces JSON with version='1.0', correct
             condition_group structure, and correctly typed action payloads.
             The null value for is_empty/is_not_empty operators is preserved.
  Tests: TC-BR-001 through TC-BR-006
  PV Gate: N/A (CEO Condition C-001)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 12 — AUTOMATION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

12.1 Automated Test Suites
───────────────────────────

  | Suite                    | Tool                        | When in CI          | Status           |
  |--------------------------|-----------------------------|---------------------|------------------|
  | Unit — services          | Vitest                      | Every push          | Partially written|
  | Unit — state/store       | Vitest                      | Every push          | Partially written|
  | Unit — validation        | Vitest                      | Every push          | Partially written|
  | Unit — business rules    | Vitest                      | Every push          | To be written    |
  | Component — RTL          | Vitest + RTL                | Every push          | To be written    |
  | E2E — Playwright         | Playwright (Chromium)       | PR to main only     | To be written    |
  | E2E — Playwright         | Playwright (Chrome)         | Nightly build       | To be written    |
  | Bundle size check        | Node.js (checkBundleSize.js)| Every push          | Built            |
  | Security scan (no eval)  | CI grep / ESLint custom     | Every push          | To be configured |
  | Accessibility — WCAG scan| Playwright + axe-core       | Nightly build       | To be configured |

12.2 CI Pipeline Steps (GitHub Actions / Azure DevOps)
───────────────────────────────────────────────────────

  Step 1: npm ci
  Step 2: npm run typecheck             (tsc --noEmit; must produce zero errors)
  Step 3: npm run lint                  (ESLint; zero warnings threshold)
  Step 4: npm run test:coverage         (80% threshold enforced by vitest coverage.thresholds)
  Step 5: npm run build:check-size      (Vite build + checkBundleSize.js; fails at 4MB)
  Step 6: [nightly only] npx playwright test  (E2E suite against Vite dev server)
  Step 7: node scripts/packageSolution.js     (produces CRM solution .zip artifact)

  Steps 1–5 run on every push to any branch.
  Steps 6–7 run on nightly scheduled build and on PR to main branch.

12.3 Manual Test Cases (Justification)
────────────────────────────────────────

  | Manual Test              | Reason not automated                                    |
  |--------------------------|---------------------------------------------------------|
  | Memory profiling (50     | Chrome DevTools heap snapshot requires manual           |
  | undo snapshots, 50 fields| interaction; cannot be automated in CI at this stage    |
  | — RISK-002 validation)   |                                                         |
  | WCAG 2.1 AA full audit   | Automated axe-core catches ~40% of issues; the rest     |
  | (pre-UAT)                | require manual screen reader testing (NVDA + Edge,      |
  |                          | JAWS + Chrome) — required before UAT sign-off           |
  | SIT CRM compatibility    | Requires live DEV and SIT CRM environments with actual  |
  | matrix verification      | Dynamics 365 v9.2 — cannot be replicated in CI          |
  | (CEO Condition C-003)    |                                                         |
  | CRM solution import      | Requires a CRM environment; no scripted import test     |
  | smoke test (DEV)         | available in CI without a cloud CRM instance            |
  | Concurrent edit test     | Requires two simultaneous CRM browser sessions          |
  | (TC-CRM-EDGE-006)        | — manual execution only in SIT environment              |
  | Cross-section field move | Physical drag cross-container requires careful pointer  |
  | E2E gesture              | event choreography — verified manually once then        |
  |                          | regression-locked via component-level store assertion   |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 13 — DEFINITION OF DONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A feature is not done until ALL of the following are true:

Automated Gates (CI enforced — no exceptions):
  [ ] npm run typecheck passes with zero TypeScript errors
  [ ] npm run lint passes with zero ESLint warnings
  [ ] npm run test:coverage passes with >= 80% line/branch/function/statement coverage
  [ ] npm run build:check-size passes (bundle <= 4MB)
  [ ] No failing test case in the Vitest suite
  [ ] No failing test case in the Playwright E2E suite (on PR to main)
  [ ] No new use of Xrm.Page in any source file (lint rule enforced)
  [ ] No new document.getElementById / direct DOM manipulation (lint rule enforced)

Functional Completeness:
  [ ] All 17 Sprint 1 acceptance criteria (AC-001 through AC-017) pass
  [ ] All publish validation gates PV-001 through PV-012 tested and passing
  [ ] withRetry exponential backoff tests pass (TC-CRM-001 through TC-CRM-005)
  [ ] AuditLogService never calls update or delete (TC-CRM-EDGE-009 passes)
  [ ] Business rule JSON schema conformance tests pass (TC-BR-001 through TC-BR-006)
  [ ] CrmContextError tested (TC-CRM-EDGE-001, TC-CRM-EDGE-002 pass)
  [ ] getUserContext uses Xrm.Utility.getGlobalContext (TC-CRM-EDGE-003 passes)

Security:
  [ ] No secrets, tokens, or external URLs in compiled bundle (TC-SEC-001 passes)
  [ ] No fetch() or XMLHttpRequest in compiled bundle (TC-SEC-002 passes)
  [ ] No eval() in compiled bundle (TC-SEC-006 passes)
  [ ] Form code duplicate detection implemented and tested (TC-SEC-003 passes)

Accessibility:
  [ ] All toolbox items keyboard-reachable (TC-A11Y-001 passes)
  [ ] All inputs have associated labels (TC-A11Y-007 passes)
  [ ] TabBar has correct ARIA roles (TC-A11Y-004 passes)
  [ ] Drag operations announce to screen readers (TC-A11Y-005 passes)

Pre-UAT gates (manual — signed off by QA Engineer before UAT begins):
  [ ] Memory profiling completed — heap growth < 25MB for 50-snapshot form
  [ ] WCAG 2.1 AA manual audit completed with NVDA + Edge and JAWS + Chrome
  [ ] SIT CRM compatibility matrix verified against actual v9.2 on-premise instance
  [ ] CRM solution import tested on a clean DEV environment
  [ ] Preview simulator shows "structure only — business rules not evaluated" warning
      (required per phase-3-arch.md CHALLENGE 5 — not in original BRD but mandatory)
  [ ] Renderer team has provided written confirmation of BusinessRuleDefinition v1.0
      schema acceptance (CEO Condition C-001 BUILD GATE — no rule panel ships without this)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 14 — HIGH-CONFIDENCE DEFECT FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following defects were identified during test case authoring by inspecting
the existing source files. They must be resolved before Sprint 1 closes.

DEFECT-001: Whitespace-Only Form Name Passes PV-001 Validation
  Confidence: 95%
  File: src/validation/publishValidation.ts — validateFormBasics()
  Issue: The Zod schema uses z.string().min(1). A name of '   ' (three spaces)
         has length > 0 and passes min(1). However, it is semantically empty
         and must be rejected by PV-001.
  Evidence: TC-PV-002 is specifically designed to expose this gap.
  Fix: Change the schema to z.string().trim().min(1, ...) so whitespace-only
       strings are trimmed before the minimum length check.

DEFECT-002: CrmUserContext May Use Deprecated Xrm.Page
  Confidence: 98%
  File: src/services/CrmContextService.ts — getUserContext()
  Issue: The architecture skeptic review (CHALLENGE 8, phase-3-arch.md) identifies
         that the original implementation used a fragile chain referencing Xrm.Page.
         This is prohibited by NFR-008, C-004, and will fail on Dynamics 365 on-premise
         UCI environments where Xrm.Page is undefined.
  Evidence: TC-CRM-EDGE-003 is designed to expose this at test execution time.
  Fix: Implementation must use Xrm.Utility.getGlobalContext().getUserId() and
       Xrm.Utility.getGlobalContext().getUserName(). The failing test TC-CRM-EDGE-003
       must be written first (TDD), then the fix applied.

DEFECT-003: VersionService Has No Test Coverage
  Confidence: 99%
  File: src/services/VersionService.ts
  Issue: The tests directory contains no VersionService.test.ts file. The service
         implements createVersion, listVersions, incrementMinorVersion,
         incrementMajorVersion, and getVersionSnapshot — all critical to the
         publish and restore flows. Zero coverage on this service is a gap that
         would allow silent regressions.
  Evidence: Confirmed by directory listing of tests/services/ which shows only
            FormDefinitionService.test.ts, AuditLogService.test.ts, and crmRetry.test.ts.
  Fix: Create tests/services/VersionService.test.ts with TC-VS-001 through TC-VS-008.

DEFECT-004: Publish Pipeline Partial Failure Leaves Form in Inconsistent State
  Confidence: 88%
  File: PublishValidationScreen.tsx (or wherever the publish pipeline is orchestrated)
  Issue: The architecture skeptic review (CHALLENGE 2) identifies that if the
         save pipeline fails midway (e.g., tabs created but section creation fails),
         the CRM is in a partially-saved state. For the publish flow specifically,
         if qdb_form_definition.statuscode is updated to 'published' BEFORE the
         qdb_form_version record is created, and the version creation fails, the
         form is 'Published' with no associated version record.
  Evidence: TC-E2E-005 (TC-CRM-EDGE-005) is designed to verify the publish flow
             handles this correctly by keeping the form in 'draft' until the full
             pipeline succeeds.
  Fix: The publish pipeline must update qdb_form_definition.statuscode to 'published'
       AFTER the version record is created successfully (step 4 in the sequence diagram
       must execute after step 3 — see phase-3-arch.md Publish Flow Sequence Diagram).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST CASE SUMMARY — TRACEABILITY MATRIX UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| User Story | FR References               | Test Cases (this document)              |
|------------|-----------------------------|-----------------------------------------|
| US-01      | FR-001, FR-002, FR-003      | TC-FDS-004, TC-FDS-005, TC-E2E-012,     |
|            |                             | TC-E2E-013, TC-CRM-EDGE-008             |
| US-02      | FR-004 to FR-010            | TC-FDS-001, TC-FDS-002, TC-E2E-001      |
| US-03      | FR-062 to FR-064            | TC-CRM-EDGE-009 (clone audit)           |
| US-04      | FR-003                      | TC-E2E-013                              |
| US-05      | FR-011, FR-012, FR-014,     | TC-CMP-001 to TC-CMP-004,               |
|            | FR-015, FR-036              | TC-E2E-002, TC-E2E-003                  |
| US-06      | FR-013, FR-036              | TC-STR-006, TC-STR-011, TC-E2E-011      |
| US-07      | FR-026 to FR-030            | TC-CMP-009 to TC-CMP-012,               |
|            |                             | TC-STR-001, TC-E2E-001 (tab creation)   |
| US-08      | FR-031 to FR-035            | TC-STR-002, TC-STR-003, TC-STR-004      |
| US-09      | FR-065, FR-066, FR-067      | TC-STR-007 to TC-STR-010, TC-E2E-009   |
| US-10      | FR-020, FR-024, FR-036,     | TC-CMP-005 to TC-CMP-008,               |
|            | FR-037                      | TC-CMP-013 to TC-CMP-019,               |
|            |                             | TC-STR-005, TC-E2E-004                  |
| US-11      | FR-042, FR-043              | TC-PV-008, TC-PV-009, TC-CMP-017        |
| US-12      | FR-044, FR-045              | TC-PV-011, TC-CMP-018                   |
| US-13      | FR-038, FR-039              | TC-PV-006, TC-PV-007                    |
| US-14      | FR-040, FR-041              | TC-BR-001 to TC-BR-006                  |
| US-15      | FR-048, FR-049, FR-050,     | TC-DV-001 to TC-DV-004,                 |
|            | FR-051                      | TC-STR-013, TC-E2E-008                  |
| US-16      | FR-072, FR-073, FR-074      | TC-E2E-010                              |
| US-17      | FR-052, FR-053, FR-054      | TC-PV-001 to TC-PV-014, TC-E2E-005      |
| US-18      | FR-055, FR-056, FR-057      | TC-VS-001, TC-VS-002, TC-E2E-006,       |
|            |                             | TC-CRM-EDGE-005                         |
| US-19      | FR-058, FR-059              | TC-VS-003, TC-VS-004                    |
| US-20      | FR-060, FR-061              | TC-VS-008, TC-E2E-007                   |
| US-21      | FR-068, FR-069              | (ThemeEditorScreen — deferred to post-Sprint 1 E2E) |
| US-22      | FR-070, FR-071              | Performance benchmark (< 500ms)         |
| US-23      | FR-075, FR-076              | TC-CRM-EDGE-009, TC-CRM-EDGE-010,       |
|            |                             | AuditLogService.test.ts existing suite  |

Total new test cases authored in this document: 87
  Unit (Vitest):        45 test cases  (TC-CRM-*, TC-PV-*, TC-DV-*, TC-STR-*, TC-FDS-*, TC-VS-*, TC-BR-*)
  Component (RTL):      19 test cases  (TC-CMP-*)
  E2E (Playwright):     13 test cases  (TC-E2E-*)
  Accessibility:         8 test cases  (TC-A11Y-*)
  Security:              6 test cases  (TC-SEC-*)
  CRM edge cases:       10 test cases  (TC-CRM-EDGE-*)

Existing test cases (from partial coverage before QA phase): 14
  crmRetry.test.ts:          4 cases (TC-CRM-001 through TC-CRM-004 pre-existed)
  publishValidation.test.ts: 6 cases
  draftValidation.test.ts:   3 cases
  designerStore.test.ts:     9 cases
  storeSelectors.test.ts:    4 cases
  AuditLogService.test.ts:   3 cases
  FormDefinitionService.test.ts: 3 cases

═══════════════════════════════════════════════════
END OF PHASE 5 QA DOCUMENT
QA Engineer — Maqsad AI | 2026-05-19 | FDWR-001
═══════════════════════════════════════════════════
