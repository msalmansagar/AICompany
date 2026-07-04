═══════════════════════════════════════════════════════════════════════
PHASE 5 — QA TEST STRATEGY
═══════════════════════════════════════════════════════════════════════
Project:        DFE-BTN-001 — Tab/Section Buttons, Button Navigation
                & Final-Submission Parameters
Client:         Qatar Development Bank (QDB)
Product:        Dynamic Form Engine (DFE)
Prepared by:    Maqsad AI — QA Engineer
Date:           2026-06-30
Version:        1.0
References:
  brd-buttons.md           (FR-001..FR-055, BR-001..BR-010, US-01..US-07)
  brd-buttons-approval.md  (8 CEO conditions, 3 hard gates G-1/G-2/G-3)
  phase-3-arch-buttons.md  (ADR-BTN-001..007, security architecture)
  phase-4-review-buttons.md (M1-M4 fixed; m1-m6/n1 open minors)
Engagement status:
  Build complete. Code review APPROVED WITH FIXES. M1-M4 resolved.
  Backend: 252 tests green. Frontend: 180 tests green. Typecheck clean.
  C-006 parity gate green.
═══════════════════════════════════════════════════════════════════════


DEFECTS FOUND DURING QA AUTHORING
═══════════════════════════════════════════════════════════════════════

Three real gaps were identified while reading the implemented code.
They are called out here so the developer can fix before the test suite
is formally run. Each maps to a test case in the body of this document.

DEF-001 — ExtraParams computed expression error produces HTTP 400
  instead of null substitution (FR-042 and AC-C4 violated).
  Confidence: 95%

  ExtraParamsAssemblyService.evaluateComputed() catches both
  ExpressionTimeoutError and ExpressionError and re-throws them as
  ExtraParamsError (HTTP 400), causing the submission to be rejected.

  FR-042 requires: "If an expression fails to evaluate (syntax error,
  reference error), the backend SHALL log the failure with the
  correlationId, substitute a null value for that key in the resolved
  extraParams, and SHALL NOT reject the submission."

  AC-C4 requires: "A computed expression that times out after 50ms
  results in a null value for that key in the persisted extraParams.
  The submission is accepted and logged."

  The existing route test TC-EP-011-existing (file:
  forms.routes.submit.test.ts, case
  'rejects_an_invalid_computed_expression_with_400') therefore asserts
  the WRONG outcome — a 400 that must be a 201.

  Fix: In evaluateComputed(), catch ExpressionTimeoutError and
  ExpressionError, log them with correlationId, and return null rather
  than throwing. Update the route-level test to expect 201.

  Mapped to: TC-EP-010, TC-EP-011, TC-EP-012.

DEF-002 — Navigate:NextStep and Navigate:PreviousStep do not skip
  invisible tabs (BR-001 violated).
  Confidence: 90%

  scopedButtonNavigation.resolveNavigationTabIndex() for 'nextStep'
  returns Math.min(activeTabIndex + 1, tabs.length - 1) with no
  filtering on isVisible. BR-001 requires the runtime to advance only
  to the next tab where isVisible is true; invisible tabs must be
  skipped. Same gap applies to 'previousStep'.

  Fix: Filter tabs to the visible subset, find the current position
  within that subset, then advance ±1 within the visible subset.

  Mapped to: TC-NAV-009.

DEF-003 — requiresPreviousTabsComplete flag is not checked in the
  navigation dispatcher (BR-002 partially ungated).
  Confidence: 85%

  ScopedButton carries requiresPreviousTabsComplete: boolean (default
  false per OQ-006 CEO ruling). Neither resolveNavigationTabIndex nor
  useScopedButtonAction reads or checks this flag. BR-002 specifies
  that when the flag is true, the runtime must run validation on all
  preceding tabs and show a summary if any required fields fail.

  Since the designer write path is not yet built, no buttons with
  requiresPreviousTabsComplete=true can currently be authored. The gap
  is latent but must be addressed before the designer slice ships.

  Mapped to: TC-NAV-010.


1. TEST STRATEGY SUMMARY
═══════════════════════════════════════════════════════════════════════

1.1 Approach
────────────────────────────────────────────────────────────────────────

The engagement adds two independent capability slices: (A) scoped button
rendering at tab/section level with four action types; (B) the ExtraParams
envelope on FinalSubmit with four param sources resolved server-side.
Unit tests written during Phase 4 cover pure logic (ButtonAssembler,
ExtraParamsAssemblyService, scopedButtonNavigation, ExpressionEngineServer).
This strategy focuses on the layers those unit tests do NOT cover:

  Route-level integration — the submit wiring (submitButtonId → spec lookup
    → envelope resolve → HTTP response) with a real Fastify/Express app
    but no mocked internal services. Five route tests exist in
    forms.routes.submit.test.ts; this strategy adds eleven more cases
    that cover the FR-042 null-substitution behavior (DEF-001), the
    spoof case (C-004), the 64KB exact boundary, and cross-form compat.

  E2E — full portal flow from user click to Dataverse submission log.
    No BTN-001 Playwright tests exist yet. Must be authored and run
    against the staging environment before Phase 7 approval.

  Security probes — explicit open-redirect and SSRF non-reachability
    probes for G-1 gated features; sandbox escape attempts on the
    ExpressionEngineServer; spoof probes for C-004.

  Cross-surface parity — portal now; mobile and CRM on-prem when
    their respective slices ship (cases authored here, deferred execution).

  Regression / backward compatibility — forms without any ScopedButtons
    must render identically to pre-engagement behavior.

TDD posture: DEF-001, DEF-002, DEF-003 require new or corrected unit
tests to be written BEFORE the fixes land (Red → Green → Refactor).

1.2 Test levels
────────────────────────────────────────────────────────────────────────

Level         | Tool                        | Execution gate
──────────────|─────────────────────────────|──────────────────────────
Unit (new)    | Vitest                      | PR gate (every push)
Integration   | Vitest + Supertest (real    | CI main branch
              | Express, real Zod, real     |
              | ExpressionEngineServer)     |
E2E           | Playwright (headed Chromium)| Staging pre-release
Performance   | k6 (submit) / Vitest bench  | Staging one-time UAT
Security      | Manual + automated probes   | Staging before Phase 7
Cross-surface | Manual (portal), deferred   | When mobile/on-prem ship
              | (mobile/CRM on-prem)        |

1.3 Coverage targets
────────────────────────────────────────────────────────────────────────

  Unit:          >= 80% line coverage on new/modified files
  Integration:   All four ExtraParam source types × resolution path
  E2E:           All cleared action types (navigate/submit/draft)
                 All confirmed CEO success criteria (C-004 spoof proof,
                 C-006 drift proof, backward compat)
  Security:      All security threat/control pairs in arch Section 9
  Performance:   NFR-001 (p95 ≤ 2,000ms submit) + NFR-002 (tab switch)

1.4 CI integration
────────────────────────────────────────────────────────────────────────

Stage 1 — PR gate (every push):
  - TypeScript strict compile: all 4 packages must pass
  - Unit tests: backend 252+ / frontend 180+ (includes new DEF-001 fix tests)
  - C-006 check: npx tsx shared/scripts/check-shared-type-sync.mjs exits 0
  - Zod schema validation self-test (no unknown keys in submitSchema)

Stage 2 — Main branch (merge):
  - Integration tests (TC-EP-* route suite against real Express app)
  - ButtonAssembler integration against a seeded RawScopedButton fixture set
  - DEF-002 fix regression: visible-tab-skip navigation unit test

Stage 3 — Staging pre-release:
  - E2E suite (Playwright, headed Chromium against staging portal)
  - Security probe suite
  - Performance benchmark: k6 submit scenario with ExtraParams
  - C-006 induced-drift CI demonstration (TC-CI-002)


2. TEST ENVIRONMENT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════

2.1 Required accounts and roles
────────────────────────────────────────────────────────────────────────

  qa-form-user          Portal user authenticated via Azure AD / JWT
                        aud=dev; oid='qa-user-001'; name='QA Engineer'
                        (for happy path and spoof tests)

  qa-form-admin         Form-administrator role in org5869857f
                        (for publishing test forms)

  spoofed-user-token    A second valid JWT with oid='real-user-002'
                        used to verify C-004: client sends oid='admin'
                        in extraParams but the backend must stamp
                        'real-user-002' from the JWT claims.

  No special role needed for portal submission (anonymous or basic auth
  sufficient depending on the staging policy config).

2.2 Test fixtures and data setup
────────────────────────────────────────────────────────────────────────

FIXTURE A — All-Sources FinalSubmit Form (for ExtraParams tests)
  A published form with one tab, one section, and one FinalSubmit
  ScopedButton configured with:
    - 1 Static param:         key='channel', value='portal'
    - 1 HiddenField param:    key='submitterName', fieldSchemaName='applicant_name'
    - 3 RuntimeContext params: userId, formVersion, submittedAt
    - 1 Computed param:       key='fullName',
                              expression="concat({firstName}, ' ', {lastName})"
  Fields: applicant_name (text), firstName (text), lastName (text)
  Published to render cache via qdb_publish_job.

FIXTURE B — Multi-Tab Navigation Form (for navigation tests)
  3 tabs (Tab1, Tab2 visible; Tab3 invisible isVisible=false), each with:
    - A Navigate:NextStep ScopedButton on Tab1
    - A Navigate:PreviousStep ScopedButton on Tab2
    - A Navigate:Tab(tabId=Tab1) ScopedButton on Tab2
  Sections have Navigate:Section buttons pointing within the tab.
  requiresPreviousTabsComplete=true on one button on Tab1 (for BR-002).

FIXTURE C — Button-less Backward-Compat Form (for regression tests)
  An existing published form with ONLY form-level FormButton records
  (submit/saveDraft/cancel). No ScopedButton records. Must be a REAL
  form that existed before this engagement.
  Baseline screenshot required before any BTN-001 schema change.

FIXTURE D — Large ExtraParams Form (for size boundary tests)
  One FinalSubmit button with a Static param whose value is
  'x'.repeat(65_535) bytes (just under cap) and a separate version
  with 65_536 bytes (just over cap).

FIXTURE E — Confirmation-Dialog Form
  One tab button with confirmationRequired=true,
  confirmationMessage='Confirm your submission?'
  One without confirmationRequired (default false).

FIXTURE F — SaveDraft Form (for US-05)
  3-tab form, each tab has a SaveDraft ScopedButton.

2.3 Service dependencies
────────────────────────────────────────────────────────────────────────

  - Backend Fastify service running with env vars:
      MAX_EXTRA_PARAMS_BYTES=65536
      EXPRESSION_MAX_OPS=1000
  - Portal (Next.js) running against staging org5869857f render cache
  - Dataverse org5869857f with FIXTURE A–F provisioned
  - qdb_form_button entity provisioned (QdbDfeButtons_v1_0_0_0 solution)
  - qdb_form_audit_log with qdb_extra_params_json column (pending G-2)

2.4 Test scope boundaries
────────────────────────────────────────────────────────────────────────

IN SCOPE FOR IMMEDIATE EXECUTION:
  - Portal (Next.js) rendering and submission flows
  - Backend route integration (Express/Fastify + Supertest)
  - Unit tests for all pure logic modules
  - C-006 CI check validation
  - Security probes on cleared surfaces

DEFERRED (cases authored now, executed when slice lands):
  - Mobile (React Native) — G-3 and cross-surface parity cases
  - CRM on-prem runtime — qdb_form_runtime.html button rendering
  - Designer write path — button creation, edit, delete in Dataverse
  - G-2 audit persistence — ExtraParams JSON column write
  - ExternalUrl navigation — G-1 gated
  - CallApi action — G-1 + G-2 gated
  - Navigate:AnotherForm — hard gate C-003 design resolved, but no
    portal router wiring yet


3. TEST CASES — GROUP 1: BUTTON PLACEMENT
═══════════════════════════════════════════════════════════════════════
References: FR-011, FR-012, FR-015, FR-017, FR-052..FR-055, US-01, US-02

TC-PL-001: Tab buttons render below sections in ascending displayOrder
  References: FR-011, US-01
  Given: FIXTURE B is loaded in the portal; Tab1 is active
  When: The tab content renders
  Then: The ScopedButtonBar containing the Navigate:NextStep button
        appears as the last child element below all section components,
        NOT inside any section; buttons are ordered by displayOrder
        ascending (lowest number first)
  Priority: Critical
  Type: E2E
  Surface: Portal

TC-PL-002: Section buttons render below field grid in ascending displayOrder
  References: FR-012, US-02
  Given: FIXTURE A is loaded; Tab1/Section1 contains a FinalSubmit ScopedButton
  When: The section renders
  Then: The ScopedButtonBar for the section appears immediately below
        the last field row and above the tab-level ScopedButtonBar
        (if both exist); within the bar, buttons are sorted by
        displayOrder ascending
  Priority: Critical
  Type: E2E
  Surface: Portal

TC-PL-003: isVisible=false button is absent from DOM
  References: FR-015
  Given: A published form whose Tab1 has two ScopedButtons:
         Button A (isVisible=true) and Button B (isVisible=false)
  When: Tab1 renders in the portal
  Then: Button A is present in the DOM (querySelector returns a node);
        Button B is NOT present in the DOM at all (not just CSS-hidden);
        the ARIA group for the button bar contains exactly one button
  Priority: Critical
  Type: E2E
  Surface: Portal

TC-PL-004: isActive=false button is absent from DOM
  References: ScopedButtonBar.tsx filter on isActive
  Given: A tab button with isActive=false in the FormDefinition
  When: The tab renders
  Then: The button is not rendered (ScopedButtonBar filters by isActive
        in addition to isVisible)
  Priority: High
  Type: Unit (ScopedButtonBar rendering test)
  Surface: Portal

TC-PL-005: Button-less form renders FormActionBar unchanged (backward compat)
  References: FR-052, FR-055, AC-A3
  Given: FIXTURE C (a pre-engagement published form with only form-level
         FormButton records and no ScopedButton records)
  When: The form loads in the portal
  Then: The FormActionBar (Submit / Save Draft / Cancel buttons) is
        present and functional exactly as before this engagement;
        no additional ScopedButtonBar elements appear anywhere in the
        form; submission via the form-level Submit button succeeds with
        a 201 response; no regression on any tab or section layout
  Priority: Critical
  Type: E2E + visual regression (screenshot diff vs baseline)
  Surface: Portal

TC-PL-006: Tab ScopedButtonBar and FormActionBar coexist without conflict
  References: FR-017
  Given: A form that has both a FinalSubmit ScopedButton on Tab1 AND
         a form-level Submit button in FormActionBar
  When: The user views Tab1
  Then: Both button bars are rendered independently;
        clicking the scoped button executes submission (with ExtraParams);
        clicking the form-level Submit button executes submission (no
        ExtraParams, backward compat); neither interferes with the other
  Priority: High
  Type: E2E
  Surface: Portal

TC-PL-007: Button sort by displayOrder is by numeric value, not insertion order
  References: FR-011, FR-012
  Given: Three ScopedButtons on a tab with displayOrder values [30, 10, 20]
         returned from Dataverse in insertion order [30, 10, 20]
  When: ButtonAssembler.assemble() processes the raw records
  Then: The resulting ScopedButton[] is ordered [10, 20, 30]
  Priority: High
  Type: Unit (ButtonAssembler)
  Surface: Backend

TC-PL-008: isPrimary=true renders as Fluent UI primary appearance
  References: FR-005 (isPrimary field), ScopedButtonBar.tsx appearance logic
  Given: A ScopedButton with isPrimary=true and another with isPrimary=false
  When: Both render in ScopedButtonBar
  Then: The primary button has Fluent UI appearance='primary' (filled blue);
        the secondary button has appearance='secondary'
  Priority: Medium
  Type: Unit (React component rendering)
  Surface: Portal


4. TEST CASES — GROUP 2: NAVIGATION
═══════════════════════════════════════════════════════════════════════
References: FR-018..FR-023, BR-001..BR-002, BR-009, US-01, AC-B1..B2

TC-NAV-001: Navigate:Tab switches to the configured tabId
  References: FR-018, AC-B1
  Given: FIXTURE B is loaded; Tab2 has a Navigate:Tab button
         targeting Tab1 (tabId); active tab is Tab2 (index 1)
  When: The user clicks the Navigate:Tab button
  Then: The active tab switches to Tab1 (index 0) immediately;
        Tab1 content is visible; Tab2 content is hidden;
        no error message is shown
  Priority: Critical
  Type: E2E
  Surface: Portal

TC-NAV-002: Navigate:NextStep advances to the next visible tab (happy path)
  References: FR-020, US-01, AC-B2
  Given: FIXTURE B is loaded with Tab1 active (index 0); Tab2 is visible
  When: The user clicks the NextStep ScopedButton on Tab1
  Then: The active tab changes to Tab2 (index 1)
  Priority: Critical
  Type: Unit (scopedButtonNavigation) + E2E
  Surface: Portal

TC-NAV-003: Navigate:NextStep on last visible tab stays on that tab
  References: FR-020
  Given: A form where Tab2 is the last visible tab and Tab2 is active
  When: The user clicks the NextStep button on Tab2
  Then: The active tab remains Tab2; no error is thrown; the button
        may be disabled or show a 'No next step' indication
  Priority: High
  Type: Unit (scopedButtonNavigation) + E2E
  Surface: Portal

TC-NAV-004: Navigate:PreviousStep returns to the previous visible tab
  References: FR-021
  Given: FIXTURE B with Tab2 active (index 1)
  When: The user clicks the PreviousStep ScopedButton on Tab2
  Then: The active tab changes to Tab1 (index 0)
  Priority: Critical
  Type: Unit (scopedButtonNavigation) + E2E
  Surface: Portal

TC-NAV-005: Navigate:PreviousStep on first tab stays on first tab
  References: FR-021
  Given: Tab1 is active (index 0, the first visible tab)
  When: The user clicks PreviousStep
  Then: The active tab remains Tab1; no error; no negative index
  Priority: High
  Type: Unit (scopedButtonNavigation)
  Surface: Portal / Backend

TC-NAV-006: Navigate:Tab to non-existent tabId shows error, no crash
  References: FR-018
  Given: A Navigate:Tab button whose targetTabId='tab-does-not-exist'
  When: The user clicks the button
  Then: resolveNavigationTabIndex returns null; setActiveTabIndex is NOT
        called; a user-facing error message is displayed; the application
        does not throw or unmount
  Priority: High
  Type: Unit (scopedButtonNavigation) + Integration
  Surface: Portal

TC-NAV-007: Navigate:Section scrolls to the section within current tab
  References: FR-019, BR-009
  Given: FIXTURE B Tab1 has a Navigate:Section button targeting
         sectionId='section-details'; an element with
         id='section-section-details' exists in the DOM
  When: The user clicks the section-scroll button
  Then: document.getElementById('section-section-details').scrollIntoView
        is called with { behavior:'smooth', block:'start' };
        the active tab does NOT change (BR-009: section scroll is
        within-tab only)
  Priority: High
  Type: Unit (useScopedButtonAction, DOM mock)
  Surface: Portal

TC-NAV-008: Navigate:Section with missing sectionId shows error
  References: FR-019
  Given: A Navigate:Section button where targetSectionId points to a
         section that does not exist in the rendered tab
  When: The user clicks the button
  Then: document.getElementById returns null; the runtime displays a
        user-facing error message; no crash or unhandled exception
  Priority: Medium
  Type: Unit (useScopedButtonAction)
  Surface: Portal

TC-NAV-009: Navigate:NextStep skips invisible tabs [DEF-002 regression]
  References: BR-001, DEF-002
  Given: Three tabs: Tab1 (visible, active), Tab2 (invisible, isVisible=false),
         Tab3 (visible)
  When: The user clicks Navigate:NextStep from Tab1
  Then: The active tab switches to Tab3, skipping Tab2;
        Tab2 is never activated
  Note: This test MUST FAIL on the current implementation (confirming
        DEF-002) and MUST PASS after the fix to resolveNavigationTabIndex
  Priority: Critical
  Type: Unit (scopedButtonNavigation) — write failing test first
  Surface: Portal

TC-NAV-010: requiresPreviousTabsComplete blocks navigation when prior tabs incomplete [DEF-003]
  References: BR-002, DEF-003, OQ-006 (default false)
  Given: Tab1 has a required field (firstName) that is empty;
         Tab2 has a Navigate:Tab button with requiresPreviousTabsComplete=true
         pointing back to Tab3 (or a NextStep with that flag)
  When: The user is on Tab2 and clicks the button
  Then: Client-side validation runs on Tab1; validation errors for
        firstName are shown; the tab switch does NOT occur
  Note: Requires the flag to be read and acted on in useScopedButtonAction —
        DEF-003 confirms this is currently absent. Write failing test first.
  Priority: High
  Type: Unit (useScopedButtonAction) — Red→Green
  Surface: Portal

TC-NAV-011: requiresPreviousTabsComplete=false (default) allows free navigation
  References: BR-002, OQ-006 CEO ruling (default off)
  Given: Tab1 has a required field (firstName) that is empty;
         a Navigate:NextStep button has requiresPreviousTabsComplete=false
  When: The user clicks the button
  Then: Tab switches to Tab2 without running validation;
        the empty firstName field triggers no error from this action
  Priority: High
  Type: Unit (useScopedButtonAction)
  Surface: Portal


5. TEST CASES — GROUP 3: FINALSUBMIT + EXTRAPARAMS
═══════════════════════════════════════════════════════════════════════
References: FR-024..FR-026, FR-039..FR-044, BR-003..BR-004, BR-006,
            BR-010, US-02, US-03, US-07, AC-C1..C4, NFR-005..NFR-007,
            CEO conditions C-004, C-005, C-007

TC-EP-001: FinalSubmit ScopedButton executes full form validation before submit
  References: FR-024, BR-003
  Given: FIXTURE A loaded; applicant_name field is required and empty
  When: The user clicks the FinalSubmit ScopedButton
  Then: Client-side validation fires across all tabs/sections;
        the required-field error for applicant_name is shown;
        POST /api/forms/:formCode/submit is NOT called
  Priority: Critical
  Type: E2E
  Surface: Portal

TC-EP-002: FinalSubmit — Static ExtraParam resolves to design-time value
  References: FR-039(a), AC-C1, US-03
  Given: FIXTURE A; submitButtonId='btn-final'; formData includes all required fields
  When: POST /api/forms/all-sources/submit body includes submitButtonId='btn-final'
  Then: Response is 201; resolved extraParams in server logs contain
        channel='portal' (the configured static value)
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-003: FinalSubmit — HiddenField ExtraParam resolves to current field value
  References: FR-039(b), BR-010, AC-C1
  Given: FIXTURE A; formData = { applicant_name: 'Ahmed Al-Rashidi', firstName: 'Ahmed', lastName: 'Al-Rashidi' }
  When: POST submit with submitButtonId='btn-final'
  Then: Resolved extraParams contain submitterName='Ahmed Al-Rashidi'
        (read from formData['applicant_name'])
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-004: FinalSubmit — HiddenField resolves to null when field absent from formData
  References: BR-010
  Given: FIXTURE A; formData does NOT contain 'applicant_name' key
  When: POST submit with submitButtonId='btn-final'
  Then: Response is 201; resolved extraParams contain submitterName=null
  Priority: High
  Type: Integration (route)
  Surface: Backend

TC-EP-005: FinalSubmit — RuntimeContext userId stamped from JWT, not client body
  References: FR-041, NFR-005, C-004, AC-C2
  Given: JWT has oid='real-user-002'; request body formData does NOT
         contain any userId reference (client-side assembly sends
         runtimeContext as-is, but client is NOT expected to send
         userId in the request body for this test)
  When: POST submit with submitButtonId='btn-final'
  Then: Resolved extraParams contain userId='real-user-002' (from JWT);
        no other value is used for userId
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-006: FinalSubmit — formVersion stamped from published form definition
  References: FR-041, US-03
  Given: FIXTURE A has form version=3 in the published FormDefinition
  When: POST submit with submitButtonId='btn-final'
  Then: Resolved extraParams contain formVersion='3'
  Priority: High
  Type: Integration (route)
  Surface: Backend

TC-EP-007: FinalSubmit — submittedAt is server-generated UTC ISO 8601 timestamp
  References: FR-041, US-03
  Given: Any FinalSubmit submission
  When: POST submit; note the time before and after the request
  Then: Resolved extraParams contain submittedAt matching
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/ within ±5s
        of the server clock (the client cannot supply this)
  Priority: High
  Type: Integration (route)
  Surface: Backend

TC-EP-008: Client-supplied userId in extraParams body is discarded — spoof test [C-004]
  References: NFR-005, C-004, AC-C2, CEO success criteria #1
  Given: JWT has oid='real-user-002'
  When: POST submit with body = { formData: {}, submitButtonId: 'btn-final',
         extraParams: { params: [{ kind: 'runtimeContext', key: 'userId' }] } }
         AND the button's spec in the published form has a runtimeContext source for userId
  Then: The resolved extraParams envelope returned to CrmSubmissionService
        contains userId='real-user-002' (JWT claim);
        the value 'admin' or any other client-supplied string is never written
  Note: This is the C-004 proof test required for Phase 7 CEO approval.
  Priority: Critical (CEO gate)
  Type: Integration (route) + Security
  Surface: Backend

TC-EP-009: FinalSubmit — Computed ExtraParam evaluates expression at submit time
  References: FR-042, US-07, C-005
  Given: FIXTURE A; formData = { firstName: 'Ahmed', lastName: 'Al-Rashidi' }
  When: POST submit with submitButtonId='btn-final'
  Then: Resolved extraParams contain fullName='Ahmed Al-Rashidi';
        no eval() or Function() was used (verified by code inspection in Phase 4)
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-010: Computed expression referencing missing field evaluates to null [DEF-001 / FR-042]
  References: FR-042, BR-007, DEF-001
  Given: Button spec has computed key='fullName'
         expression="concat({firstName}, ' ', {lastName})";
         formData does NOT contain firstName or lastName
  When: POST submit with submitButtonId='btn-final'
  Then: Response is 201 (submission accepted);
        resolved extraParams contain fullName=null;
        the correlationId is logged with the expression error;
        CrmSubmissionService.submitForm is called exactly once
  Note: MUST FAIL on current code (DEF-001) — fix ExtraParamsAssemblyService
        to return null instead of throwing ExtraParamsError.
  Priority: Critical
  Type: Integration (route) — write failing test first
  Surface: Backend

TC-EP-011: Computed expression timeout substitutes null, does not reject [DEF-001 / AC-C4]
  References: FR-042, AC-C4, NFR-006, C-005, DEF-001
  Given: An expression that exceeds MAX_EXPRESSION_OPS (craft a deeply
         nested concat that hits the 1000-op limit, OR mock
         ExpressionEngineServer.evaluate to throw ExpressionTimeoutError)
  When: POST submit with submitButtonId referencing that button
  Then: Response is 201 (submission accepted);
        resolved extraParams contain that key=null;
        a WARN log is emitted with the expression and correlationId;
        CrmSubmissionService.submitForm is called
  Note: MUST FAIL on current code (DEF-001 — code re-throws as 400).
  Priority: Critical
  Type: Integration (route) + Unit (ExtraParamsAssemblyService)
  Surface: Backend

TC-EP-012: Computed expression syntax error substitutes null, does not reject [DEF-001]
  References: FR-042, DEF-001
  Given: Button spec has expression='1 +' (invalid syntax → ExpressionError)
  When: POST submit
  Then: Response is 201; affected key = null; other params resolved normally
  Note: The EXISTING test 'rejects_an_invalid_computed_expression_with_400'
        in forms.routes.submit.test.ts asserts 400 and MUST BE UPDATED to
        assert 201 after DEF-001 is fixed.
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-013: ExtraParams payload exceeding 64KB is rejected with 422
  References: FR-043, NFR-007, AC-C3, C-007
  Given: FIXTURE D (Static param value = 70KB string)
  When: POST submit with submitButtonId pointing at that button
  Then: Response is 422 with error code 'EXTRA_PARAMS_TOO_LARGE';
        CrmSubmissionService.submitForm is NOT called;
        the submission is not persisted to Dataverse
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-014: Submit without submitButtonId succeeds with no ExtraParams
  References: FR-040, FR-053
  Given: FIXTURE A; request body = { formData: { firstName: 'Ahmed' } }
         (no submitButtonId field)
  When: POST submit
  Then: Response is 201; CrmSubmissionService.submitForm is called with
        no extraParams argument; existing submission pipeline unaffected
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-015: Submit with unknown submitButtonId succeeds with no ExtraParams
  References: ADR-BTN-005; existing test confirmed
  Given: Request body includes submitButtonId='does-not-exist' (not in form)
  When: POST submit
  Then: Response is 201; a WARN is logged; no extraParams resolved;
        findFinalSubmitButton returns null and the submit proceeds normally
  Priority: High
  Type: Integration (route)
  Surface: Backend

TC-EP-016: Button ExtraParams spec is read from PUBLISHED form, not client body
  References: ADR-BTN-005, security architecture
  Given: The published form has button 'btn-final' with params=[static:channel=portal];
         the client sends submitButtonId='btn-final' but NO extraParams field in body
  When: POST submit
  Then: The backend calls findFinalSubmitButton(form, 'btn-final') to get the spec;
        resolved extraParams include channel='portal' from the published spec;
        the client's absence of an extraParams body field is irrelevant
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-EP-017: Static key matching a reserved RuntimeContext key is overridden (BR-004)
  References: BR-004, NFR-005, C-004
  Given: Button spec has a Static param { key: 'userId', value: 'hacker' }
         AND a RuntimeContext param for userId
  When: POST submit (JWT oid='real-user-002')
  Then: Resolved extraParams contain userId='real-user-002' (JWT);
        the static value 'hacker' is silently overridden;
        no error is returned to the client
  Priority: High
  Type: Integration (route)
  Surface: Backend

TC-EP-018: Exactly 50 params accepted; 51 params rejected with 422
  References: NFR-010
  Given: A button whose spec has exactly 50 Static params
  When: POST submit
  Then: Response is 201

  Given: Same button spec with 51 Static params
  When: POST submit
  Then: Response is 422 with appropriate error code
  Priority: High
  Type: Integration (route)
  Surface: Backend


6. TEST CASES — GROUP 4: SAVEDRAFT + CONFIRMATION DIALOG
═══════════════════════════════════════════════════════════════════════
References: FR-016, FR-027, US-05

TC-SD-001: SaveDraft ScopedButton POSTs to draft endpoint with correct payload
  References: FR-027, US-05
  Given: FIXTURE F multi-tab form loaded; user is on Tab2 (index 1);
         formData contains partially filled fields
  When: The user clicks the SaveDraft ScopedButton on Tab2
  Then: POST /api/forms/:formCode/draft is called with body containing
        formData (current field values) and currentTabIndex=1;
        no other tabs' data is lost; the response is 200 or 201 (draft saved);
        a success confirmation is displayed identical to the form-level
        SaveDraft confirmation
  Priority: High
  Type: E2E
  Surface: Portal

TC-SD-002: SaveDraft confirmation matches form-level save experience
  References: FR-027, FR-017
  Given: FIXTURE F; a SaveDraft ScopedButton on Tab1 AND the form-level
         SaveDraft button in FormActionBar are both present
  When: Each is clicked on separate test runs
  Then: Both produce the same visual confirmation message and the same
        API call; UX is indistinguishable to the end user
  Priority: Medium
  Type: E2E (visual comparison)
  Surface: Portal

TC-CD-001: confirmationRequired=true shows dialog before action fires
  References: FR-016, FIXTURE E
  Given: FIXTURE E loaded; one ScopedButton has confirmationRequired=true
         and confirmationMessage='Confirm your submission?'
  When: The user clicks the button
  Then: A modal dialog appears containing the text 'Confirm your submission?';
        the underlying action (submit/navigate/saveDraft) is NOT yet executed;
        the dialog has Cancel and Confirm controls
  Priority: High
  Type: E2E
  Surface: Portal

TC-CD-002: Clicking Cancel in confirmation dialog aborts the action
  References: FR-016
  Given: TC-CD-001 precondition; the dialog is open
  When: The user clicks Cancel
  Then: The dialog closes; the action is NOT executed;
        no POST to /submit or /draft; the form remains in its pre-click state
  Priority: High
  Type: E2E
  Surface: Portal

TC-CD-003: Clicking Confirm in confirmation dialog executes the action
  References: FR-016
  Given: TC-CD-001 precondition; the dialog is open
  When: The user clicks Confirm
  Then: The dialog closes; the configured action executes;
        for a FinalSubmit button: POST /submit is called and the
        submission flow completes
  Priority: High
  Type: E2E
  Surface: Portal


7. TEST CASES — GROUP 5: GATED FEATURES (G-1, G-2, G-3)
═══════════════════════════════════════════════════════════════════════
References: CEO conditions C-001, C-002; hard gates G-1/G-2/G-3;
            NFR-003, NFR-004; phase-4-review-buttons.md notes m2/n1

TC-GT-001: ExternalUrl button click produces no navigation in portal (G-1)
  References: G-1, NFR-003
  Given: A form in the render cache that contains a ScopedButton with
         action.type='navigate' and action.target='externalUrl';
         no qdb_api_endpoint allowlist record exists (G-1 not yet active)
  When: The button renders and the user clicks it
  Then: window.open is NOT called; no navigation occurs;
        the browser URL does not change;
        logger.warn is called with tag 'scoped_button_navigation_gated';
        no user-facing error breaks the form;
        the form remains fully functional
  Note: This verifies the gated NO-OP, not the allowlist (which is built
        when G-1 is cleared). This test must PASS on current code.
  Priority: Critical
  Type: Unit (useScopedButtonAction) + E2E
  Surface: Portal

TC-GT-002: No SSRF — ExternalUrl button does NOT call backend URL endpoint (G-1)
  References: G-1, NFR-003 (open redirect prevention)
  Given: Same precondition as TC-GT-001
  When: The button is clicked
  Then: No HTTP request is made to GET /api/admin/button-endpoints/validate
        or to any external URL;
        network monitor shows zero outbound requests from the click handler;
        the open-redirect surface is NOT reachable in this v1 build
  Priority: Critical (security)
  Type: E2E (browser network inspector) + Unit
  Surface: Portal

TC-GT-003: CallApi button click produces no API call in portal (G-1)
  References: G-1, NFR-004 (SSRF prevention)
  Given: A form with a ScopedButton where action.type='callApi'
  When: The button renders and the user clicks it
  Then: No POST to /api/forms/:formCode/call-api is made;
        logger.warn is called with tag 'scoped_button_callapi_gated';
        no user-facing error; form remains functional
  Priority: Critical
  Type: Unit (useScopedButtonAction) + E2E
  Surface: Portal

TC-GT-004: AnotherForm button click is a no-op in portal (C-003 resolved in arch, portal wiring deferred)
  References: C-003 (ADR-BTN-003), useScopedButtonAction navigate dispatch
  Given: A button with action.target='anotherForm'
  When: The button is clicked
  Then: No form reload or route change occurs; logger.warn fires;
        this case is DEFERRED for execution when portal router wiring ships
  Priority: High
  Type: Unit (useScopedButtonAction)
  Surface: Portal (deferred E2E)

TC-GT-005: G-2 — ExtraParams resolved but NOT persisted to audit log column (G-2 gate)
  References: phase-4-review-buttons.md nit n1, G-2, FR-044
  Given: FIXTURE A; POST submit with valid submitButtonId
  When: The submission completes (201)
  Then: The resolvedExtraParams value IS computed and logged (log level INFO)
        but is NOT written to qdb_extra_params_json on qdb_form_audit_log;
        the Dataverse audit record for this submission contains
        qdb_extra_params_json = null (column exists, value absent);
        this is the EXPECTED state before G-2 is cleared
  Note: When G-2 ships, this test inverts — the column must contain the
        resolved JSON. Track as a gate blocker.
  Priority: High
  Type: Integration (route + Dataverse read-back)
  Surface: Backend

TC-GT-006: G-3 — Mobile Navigate:Section deferred
  References: G-3, OQ-003, ADR-BTN-003
  Given: Mobile app slice is not yet built
  Then: This case is authored here for completeness;
        execution is DEFERRED until mobile section-scroll implementation
        ships. The test will verify that clicking Navigate:Section
        on mobile scrolls to the configured section Y-offset (or equivalent
        fallback as per OQ-003 Mobile Developer resolution).
  Priority: Medium
  Type: Mobile E2E (Detox) — deferred
  Surface: Mobile


8. TEST CASES — GROUP 6: SCHEMA / CI PARITY (C-006)
═══════════════════════════════════════════════════════════════════════
References: C-006, ADR-BTN-007, NFR-012, CR-002, CEO success criteria #4

TC-CI-001: C-006 check passes on current codebase with no drift
  References: C-006, NFR-012
  Given: Current shared/src/types/form.types.ts and form.ts as built
  When: node shared/scripts/check-shared-type-sync.mjs is run
  Then: Exit code 0; stdout contains
        'Shared-type parity OK — 16 DFE-BTN-001 types match across both files'
  Priority: Critical
  Type: CI (automated, runs in Stage 1 PR gate)
  Surface: CI / Shared package

TC-CI-002: Induced drift in form.ts causes C-006 to fail (Phase 7 required demonstration)
  References: C-006, CEO success criteria #4
  Given: A test commit that renames one property in ScopedButton in
         form.ts only (e.g., renames 'displayOrder' to 'order')
  When: check-shared-type-sync.mjs is run
  Then: Exit code 1; stderr contains 'DRIFT in ScopedButton' and shows
        the symmetric difference; the build is rejected
  Note: This demonstration is a required Phase 7 deliverable (CEO #4).
        It must be a reversible test commit, not a permanent change.
  Priority: Critical (CEO gate)
  Type: CI (manual demonstration with reverting commit)
  Surface: CI

TC-CI-003: New BTN-001 type added to form.types.ts but not form.ts is caught
  References: C-006, SYNCED_TYPES list
  Given: A type name is added to SYNCED_TYPES in the script AND the type
         is added only to form.types.ts (not form.ts)
  When: check-shared-type-sync.mjs is run
  Then: Exit code 1; stderr reports 'MISSING in form.ts (mobile): <TypeName>'
  Priority: High
  Type: CI
  Surface: CI

TC-CI-004: All 16 SYNCED_TYPES are present in both shared type files
  References: C-006, ADR-BTN-007, SYNCED_TYPES list in check-shared-type-sync.mjs
  Given: The SYNCED_TYPES list: ButtonPlacementScope, ScopedButtonActionType,
         NavigationTargetType, UnsavedDataPolicy, NavigateActionConfig,
         ExtraParamSource, RuntimeContextKey, ExtraParamSpec,
         FinalSubmitActionConfig, SaveDraftActionConfig, CallApiRequestFieldRef,
         CallApiResponseMapping, CallApiActionConfig, ScopedButtonAction,
         ScopedButton, ResolvedExtraParams
  When: check-shared-type-sync.mjs runs
  Then: None of the 16 types is reported as MISSING in either file
  Priority: High
  Type: CI
  Surface: CI / Shared package


9. TEST CASES — GROUP 7: BACKWARD COMPATIBILITY
═══════════════════════════════════════════════════════════════════════
References: FR-052..FR-055, BO-005, CEO success criteria #5

TC-BC-001: Existing button-less form renders identically to pre-engagement baseline
  References: FR-052, FR-055, BO-005
  Given: FIXTURE C (pre-engagement published form);
         a baseline screenshot captured before BTN-001 schema provisioning
  When: The form is loaded in the portal after BTN-001 deployment
  Then: Pixel diff between baseline and current screenshot shows zero
        visible difference; no ScopedButtonBar elements appear in the DOM;
        the existing FormActionBar is intact and functional
  Priority: Critical (CEO gate)
  Type: E2E + Visual regression (Playwright screenshot diff)
  Surface: Portal

TC-BC-002: Form-level FormActionBar unaffected by ScopedButton records
  References: FR-052, FR-054
  Given: A form with both ScopedButtons AND form-level FormButton records
  When: The form renders
  Then: FormActionBar still contains the form-level buttons (Submit/SaveDraft/Cancel);
        qdb_button_design entity is not touched by BTN-001 code paths;
        DFE-STYLE-001 styling of FormButton is unaffected
  Priority: High
  Type: E2E
  Surface: Portal

TC-BC-003: POST /submit without extraParams or submitButtonId — unmodified behavior
  References: FR-053, FR-040
  Given: An existing form consumer that sends { formData: { a: 1 } } only
  When: POST /api/forms/:formCode/submit
  Then: Response is 201; ExtraParamsAssemblyService is NOT invoked;
        CrmSubmissionService.submitForm receives no extraParams argument;
        no schema validation error for missing submitButtonId
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-BC-004: Render cache for existing form does not include buttons arrays
  References: FR-055
  Given: FIXTURE C published form in qdb_form_render_cache
  When: GET /api/forms/:formCode/metadata
  Then: tabs[*].buttons is either absent or an empty array [];
        sections[*].buttons is either absent or an empty array [];
        existing consumers that do not read buttons are unaffected;
        the cache payload size has not changed significantly
  Priority: High
  Type: Integration (metadata route)
  Surface: Backend


10. TEST CASES — GROUP 8: SECURITY
═══════════════════════════════════════════════════════════════════════
References: NFR-003..NFR-007, C-004, C-005, CEO success criteria #1..#3,
            Security architecture section 9 of phase-3-arch-buttons.md

TC-SEC-001: Unauthenticated POST /submit returns 401
  References: NFR-005 (auth enforcement)
  Given: No Authorization header in the POST /submit request
  When: POST /api/forms/:formCode/submit
  Then: Response is 401; no form processing occurs; no log of formData
  Priority: Critical
  Type: Integration (route)
  Surface: Backend

TC-SEC-002: C-005 — Expression cannot access Node.js process object
  References: NFR-006, C-005
  Given: A Computed ExtraParam expression = 'process.env.DATABASE_URL'
         (attempting Node.js process access)
  When: ExpressionEngineServer.evaluate is called with this expression
  Then: ExpressionError is thrown (unknown identifier or parse error);
        after DEF-001 fix: submission returns 201 with that key=null;
        no environment variable value leaks into the response or logs
  Priority: Critical (security)
  Type: Unit (ExpressionEngineServer)
  Surface: Backend

TC-SEC-003: C-005 — Expression cannot access prototype chain
  References: NFR-006, C-005
  Given: Expression = '__proto__.polluted' or 'constructor.constructor'
  When: ExpressionEngineServer.evaluate is called
  Then: Expression is rejected (parse error or unknown identifier);
        no prototype chain access; no pollution of shared objects
  Priority: Critical (security)
  Type: Unit (ExpressionEngineServer)
  Surface: Backend

TC-SEC-004: C-005 — XSS payload in expression evaluates to a string, not executed code
  References: NFR-006, C-005
  Given: Expression = 'concat("<script>alert(1)</script>", {name})'
  When: Expression is evaluated with formData = { name: 'test' }
  Then: The result is the literal string '<script>alert(1)</script>test';
        it is NOT executed as script; when serialized in ExtraParams and
        returned to the client, the string is JSON-encoded (double-quoted),
        preventing DOM injection
  Priority: High
  Type: Unit (ExpressionEngineServer)
  Surface: Backend

TC-SEC-005: G-1 open-redirect probe — no external URL navigation reachable via submit body
  References: NFR-003, G-1, CEO success criteria #2
  Given: Client sends POST /submit with extraParams containing
         a Static param { key: 'redirect', value: 'https://evil.com' }
  When: Backend processes the submission
  Then: The value is stored as a string in ExtraParams (Static values are
        not interpreted as URLs); no HTTP redirect is issued by the backend;
        the frontend does NOT navigate to 'https://evil.com';
        the open-redirect surface is confirmed non-reachable in v1
  Note: G-1 gated features cannot perform any external URL navigation
        until the allowlist is active. This verifies the boundary.
  Priority: Critical (CEO gate)
  Type: Integration + Security probe
  Surface: Backend + Portal

TC-SEC-006: G-1 SSRF probe — endpointKey validation rejects non-alphanumeric values
  References: NFR-004, G-1, CEO success criteria #2
  Given: A request to POST /api/forms/:formCode/call-api with
         endpointKey='../../../etc/passwd' or 'http://internal.host/secret'
  When: The Zod schema (SAFE_FORM_CODE pattern /^[a-zA-Z0-9_-]{1,100}$/)
        is applied to the endpointKey (or the call-api route validates it)
  Then: Request is rejected with 400 (Zod validation error) before
        any forwarding logic runs; no external request is made
  Note: The call-api route is gated (G-1) and will not forward in v1,
        but this test verifies the input guard also blocks the attack vector.
  Priority: Critical (security)
  Type: Integration (route or unit — Zod validation)
  Surface: Backend

TC-SEC-007: XSS in ScopedButton label is rendered as text, not HTML
  References: Security by default (OWASP A03)
  Given: A ScopedButton in the FormDefinition has
         label='<script>alert(1)</script>'
  When: ScopedButtonBar renders that button in the portal
  Then: The Fluent UI Button's text content is the literal string
        '<script>alert(1)</script>'; it is NOT inserted as innerHTML;
        no alert fires; React's JSX rendering prevents DOM injection
  Priority: High
  Type: Unit (ScopedButtonBar render)
  Surface: Portal

TC-SEC-008: SQL injection in ExtraParams key/value is rejected by Dataverse SDK
  References: Security — parameterized writes
  Given: A Static ExtraParam with key="'; DROP TABLE--" value="payload"
  When: The submission proceeds and (G-2 cleared) ExtraParams is written
        to qdb_extra_params_json via Dataverse WebAPI
  Then: The value is JSON.stringify'd before write; Dataverse Web API uses
        OData parameterized payloads; no SQL injection reaches the DB;
        the stored JSON string contains the literal key safely encoded
  Note: Deferred execution until G-2 audit write ships.
  Priority: High
  Type: Integration (deferred G-2)
  Surface: Backend → Dataverse

TC-SEC-009: submitButtonId path traversal rejected by Zod
  References: submitSchema, Zod: z.string().max(100)
  Given: POST /submit with submitButtonId='../../admin' or
         submitButtonId containing null bytes
  When: Zod parses the submitSchema
  Then: For path traversal: submitButtonId passes max(100) Zod check
        (no regex on submitButtonId specifically) but findFinalSubmitButton
        will return null (no button with that id exists) and the submit
        proceeds normally with no extra params — no injection
  Note: The current submitSchema uses z.string().max(100) with no regex.
        findFinalSubmitButton does a string equality check against
        button.id (a UUID from Dataverse). Path traversal cannot match
        a UUID. Injection surface is minimal. Flag for future hardening
        (add regex /^[a-zA-Z0-9_-]{1,100}$/ consistent with SAFE_FORM_CODE).
  Priority: Medium
  Type: Integration (route)
  Surface: Backend

TC-SEC-010: Audit record append-only — no UPDATE on qdb_form_audit_log
  References: Article VI (constitution), ADR-BTN-005, NFR-009
  Given: A form is submitted successfully (201)
  When: The audit log entry is written (G-2 cleared)
  Then: The CrmAuditService only issues a POST (create) to
        qdb_form_audit_log; no PATCH or DELETE is issued on that record
        at any point; the Dataverse entity is configured with append-only
        access (verified by checking plugin registration and service code)
  Note: Deferred execution for the write path (G-2); code inspection
        can be done now to confirm no UPDATE call path exists.
  Priority: High
  Type: Integration (deferred G-2) + Code inspection
  Surface: Backend → Dataverse

TC-SEC-011: Audit log ExtraParams contains server-resolved values, not client payload
  References: FR-044, ADR-BTN-005, NFR-009
  Given: G-2 cleared; client sends submitButtonId='btn-final';
         JWT has oid='real-user-002'
  When: Submission is written to Dataverse audit log
  Then: qdb_extra_params_json on the audit record contains the RESOLVED
        envelope (userId='real-user-002', channel='portal', fullName computed);
        the raw client extraParams body (if any) is never written;
        the persisted value is immutable after write
  Note: Deferred until G-2 ships.
  Priority: Critical (CEO gate)
  Type: Integration (deferred G-2)
  Surface: Backend → Dataverse


11. TEST CASES — GROUP 9: EDGE AND NEGATIVE CASES
═══════════════════════════════════════════════════════════════════════
References: FR-018, FR-019, FR-042, BR-007, BR-010, ADR-BTN-006

TC-EN-001: Malformed action JSON in Dataverse causes button to be dropped, not crash
  References: ButtonAssembler.parseAction, M2 fix
  Given: A RawScopedButton record with qdb_action_config_json='{invalid-json'
  When: ButtonAssembler.mapRawButton processes the record
  Then: The button returns null (dropped); a WARN is logged;
        the remaining buttons in the form are assembled normally;
        no exception propagates to the form metadata response
  Priority: High
  Type: Unit (ButtonAssembler)
  Surface: Backend

TC-EN-002: Navigate button with missing required sub-field is dropped (M2 fix)
  References: ButtonAssembler.isValidActionConfig, M2 fix
  Given: A RawScopedButton with action_type='navigate' and
         action_config_json='{"type":"navigate","target":"tab"}'
         (missing targetTabId, which is required when target='tab')
  When: ButtonAssembler.mapRawButton processes the record
  Then: isValidActionConfig returns false; button is dropped with WARN log;
        form renders without that button; no runtime error
  Priority: High
  Type: Unit (ButtonAssembler)
  Surface: Backend

TC-EN-003: CallApi button without endpointKey is dropped (M2 fix)
  References: ButtonAssembler.isValidActionConfig, M2 fix
  Given: A RawScopedButton with action_type='callApi' and
         action_config_json='{"type":"callApi","method":"POST"}'
         (missing endpointKey)
  When: ButtonAssembler.mapRawButton processes the record
  Then: Button is dropped; WARN is logged; form unaffected
  Priority: High
  Type: Unit (ButtonAssembler)
  Surface: Backend

TC-EN-004: FinalSubmit button targeting a deleted tab renders without crash
  References: FR-018, Skeptic challenge 5 (qdb_placement_id as Text(36))
  Given: A ScopedButton's placementId points to a tab that no longer
         exists in the FormDefinition (e.g., the tab was deleted after
         the button was created)
  When: ButtonAssembler.assemble() indexes the button
  Then: The button is included in byTabId under the orphaned placementId;
        because no tab in the FormDefinition has buttons[that id],
        the button never renders; no crash; an INFO/WARN is logged
        in ButtonAssembler or the metadata assembler when embedding
        buttons into tabs
  Priority: High
  Type: Unit (ButtonAssembler + CacheAssemblyService)
  Surface: Backend

TC-EN-005: Empty extraParamsConfig (params=[]) resolves to empty envelope
  References: FR-042, extraParamsOf()
  Given: A FinalSubmit button with extraParamsConfig.params=[]
  When: POST submit with that submitButtonId
  Then: Response is 201; resolvedExtraParams = {} (empty object);
        CrmSubmissionService.submitForm receives extraParams = {};
        size check passes (empty object is < 64KB)
  Priority: Medium
  Type: Integration (route)
  Surface: Backend

TC-EN-006: Expression longer than 1000 characters is rejected
  References: C-005, MAX_EXPRESSION_LENGTH=1000
  Given: A Computed ExtraParam with expression='concat(' + 'a,'.repeat(200) + 'b)'
         totalling > 1000 characters
  When: ExpressionEngineServer.evaluate is called
  Then: ExpressionError is thrown immediately (length guard);
        after DEF-001 fix: submission returns 201 with affected key=null;
        no expression evaluation work is done (fast rejection)
  Priority: High
  Type: Unit (ExpressionEngineServer) + Integration (route after DEF-001 fix)
  Surface: Backend

TC-EN-007: Unicode in Static ExtraParam value serializes correctly
  References: FR-043 (size check uses UTF-8 bytes, not UTF-16 chars)
  Given: A Static param with value='القيمة باللغة العربية' (Arabic, 22 chars,
         ~44 UTF-8 bytes for Arabic multi-byte encoding)
  When: POST submit with that button
  Then: Response is 201; the Arabic value appears correctly in the
        resolved envelope; Buffer.byteLength(JSON.stringify(resolved), 'utf8')
        accurately counts multi-byte characters; no data corruption
  Priority: Medium
  Type: Integration (route)
  Surface: Backend

TC-EN-008: formData with null values for HiddenField refs resolves to null
  References: BR-010
  Given: Button spec has HiddenField { key:'submitterName', fieldSchemaName:'applicant_name' };
         formData = { applicant_name: null }
  When: POST submit
  Then: Response is 201; resolved extraParams contain submitterName=null;
        ExtraParamsAssemblyService.coerce(null) returns null correctly
  Priority: Medium
  Type: Unit (ExtraParamsAssemblyService)
  Surface: Backend

TC-EN-009: ExtraParams 64KB exact boundary — 65535 bytes passes, 65536 bytes rejects
  References: NFR-007, FR-043, MAX_EXTRA_PARAMS_BYTES=65536
  Given: A Static param with value='x'.repeat(65_533) → envelope ≈ 65535 bytes UTF-8
  When: POST submit
  Then: Response is 201

  Given: A Static param with value='x'.repeat(65_534) → envelope ≈ 65536 bytes UTF-8
  When: POST submit
  Then: Response is 413 (EXTRA_PARAMS_TOO_LARGE)

  Note: Exact byte count depends on key name and JSON wrapper overhead;
        use assertWithinSizeLimit's actual calculation to pin test values.
  Priority: High
  Type: Integration (route)
  Surface: Backend

TC-EN-010: Multiple FinalSubmit buttons on different tabs each resolve their own spec
  References: FR-026, BR-006
  Given: A form with FinalSubmit button 'btn-tab1' on Tab1 (params: static channel='tabOne')
         and FinalSubmit button 'btn-tab2' on Tab2 (params: static channel='tabTwo')
  When: Two separate submissions — first with submitButtonId='btn-tab1',
        second with submitButtonId='btn-tab2'
  Then: First submission resolvedExtraParams.channel='tabOne';
        second submission resolvedExtraParams.channel='tabTwo';
        each button's spec is resolved independently without cross-contamination
  Priority: High
  Type: Integration (route)
  Surface: Backend


12. PERFORMANCE BENCHMARKS
═══════════════════════════════════════════════════════════════════════
References: NFR-001, NFR-002, NFR-006, C-005

TC-PF-001: POST /submit with 5 computed ExtraParam expressions — p95 ≤ 2,000ms
  References: NFR-001 (existing SLA), NFR-006 (200ms max expression overhead)
  Scenario: 50 concurrent virtual users each posting to
            /api/forms/test-form/submit with 5 computed expressions
            (concat of 3 fields each, total expression ops well under limit)
  Benchmark: p95 response time ≤ 2,000ms; p99 ≤ 3,000ms
  Baseline: Existing submit without ExtraParams (pre-engagement p95 benchmark)
  Overhead assertion: expression evaluation adds ≤ 200ms to baseline submit p95
  Tool: k6 (30s ramp-up, 50 VU, 120s steady state)

TC-PF-002: ExpressionEngineServer single expression evaluates in ≤ 50ms
  References: NFR-006, C-005, MAX_EXPRESSION_DURATION_MS=50
  Scenario: 1000 consecutive evaluations of the most complex legitimate
            expression (concat of 10 fields with conditionals and formatDate)
  Benchmark: No single evaluation takes > 50ms on the test server
  Tool: Vitest benchmark (describe.concurrent with performance.now())

TC-PF-003: Expression at maxOps=999 completes within 50ms (step-count calibration)
  References: C-005, ADR-BTN-004, MAX_EXPRESSION_OPS=1000
  Scenario: Craft a legitimate but deeply nested expression that consumes
            exactly 999 ops; verify it completes within the wall-clock limit
  Benchmark: Evaluation completes (no ExpressionTimeoutError); elapsed < 50ms
  Note: This calibration verifies that the op budget and the wall-clock
        ceiling are not in conflict for legitimate expressions.
  Tool: Unit test in ExpressionEngineServer.test.ts

TC-PF-004: Tab switch overhead with 10 ScopedButtons ≤ 100ms
  References: NFR-002
  Scenario: A tab carrying 10 ScopedButtons (mix of action types); measure
            time from click event to tab content visible in DOM
  Benchmark: p95 tab-switch latency ≤ baseline + 100ms
  Tool: Playwright performance.measure() in E2E suite; baseline = same tab
        switch on the same form without ScopedButtons

Performance Benchmark Table:
──────────────────────────────────────────────────────────────────────
Scenario                              Target p95    Target throughput  Tool
────────────────────────────────────────────────────────────────────────────────
Submit with 5 Computed expressions    ≤ 2,000ms     ≥ 10 req/s        k6
Submit with no ExtraParams (baseline) ≤ 800ms       ≥ 30 req/s        k6
Single expression eval (micro)        ≤ 50ms        ─                 Vitest bench
Tab switch with 10 buttons            baseline+100ms ─                 Playwright


13. AUTOMATION PLAN
═══════════════════════════════════════════════════════════════════════

Test Group              | Cases         | Automated?  | CI Stage  | Tool
─────────────────────────────────────────────────────────────────────────
Placement (PL)          | TC-PL-001..008 | Yes (7/8)  | 1,3       | Vitest + Playwright
Navigation (NAV)        | TC-NAV-001..011| Yes (9/11) | 1,2,3     | Vitest + Playwright
FinalSubmit/ExtraParams | TC-EP-001..018 | Yes (16/18)| 1,2,3     | Vitest/Supertest + Playwright
SaveDraft + Dialog      | TC-SD/CD 1..5  | Yes        | 3         | Playwright
Gated features (GT)     | TC-GT-001..006 | Yes (4/6)  | 1,3       | Vitest unit + Playwright network
Schema/CI parity (CI)   | TC-CI-001..004 | Yes        | 1         | node (check-shared-type-sync.mjs)
Backward compat (BC)    | TC-BC-001..004 | Yes (3/4)  | 2,3       | Playwright + Supertest
Security (SEC)          | TC-SEC-001..011| Yes (7/11) | 3         | Supertest + Playwright + manual
Edge/Negative (EN)      | TC-EN-001..010 | Yes (9/10) | 1,2       | Vitest unit + Supertest
Performance (PF)        | TC-PF-001..004 | Yes        | Staging   | k6 + Playwright + Vitest bench

MANUAL ONLY cases (4):
  TC-BC-001 visual regression baseline comparison (needs human sign-off)
  TC-CI-002 induced-drift CI demonstration (run once, reverting commit)
  TC-SEC-009 endpointKey hardening recommendation (advisory, not blocked)
  TC-GT-006 mobile deferred (no mobile E2E harness yet)

DEFERRED EXECUTION cases (9):
  TC-GT-004, TC-GT-006 — navigation not wired yet
  TC-GT-005 — G-2 gate (ExtraParams write not active)
  TC-SEC-008, TC-SEC-010, TC-SEC-011 — G-2 gate (audit write deferred)
  TC-EN-004 partial — orphaned button render path (deferred CacheAssembly wiring)
  Mobile surface cases — no Detox harness yet
  CRM on-prem surface cases — on-prem slice not shipped


14. COVERAGE MAP — CEO CONDITIONS TO TEST CASE IDs
═══════════════════════════════════════════════════════════════════════

Condition         | Description (abbreviated)              | Test Case IDs
─────────────────────────────────────────────────────────────────────────
C-001 (G-1 gate)  | Single admin-managed allowlist          | TC-GT-001, TC-GT-002, TC-GT-003,
                  | ExternalUrl+CallApi blocked             | TC-SEC-005, TC-SEC-006
C-002 (G-1 gate)  | CallApi auth model (forwarded JWT)      | TC-GT-003 (gated no-op); deferred
C-003 (AnotherForm| Cross-surface AnotherForm behaviour     | TC-GT-004 (deferred portal wiring)
      gate)       |                                         |
C-004             | RuntimeContext is backend-authoritative  | TC-EP-005, TC-EP-007, TC-EP-008,
                  | (spoof prevention)                      | TC-EP-017, TC-SEC-001
C-005             | Computed expression sandbox             | TC-EP-009, TC-EP-010, TC-EP-011,
                  | (no eval, timeout = null substitution)  | TC-EP-012, TC-PF-002, TC-PF-003,
                  |                                         | TC-SEC-002, TC-SEC-003, TC-SEC-004,
                  |                                         | TC-EN-006
C-006             | Shared-type CI consistency check        | TC-CI-001, TC-CI-002, TC-CI-003,
                  |                                         | TC-CI-004
C-007             | ExtraParams persistence + 64KB cap      | TC-EP-013, TC-EP-018, TC-EN-009,
                  |                                         | TC-SEC-010 (deferred G-2),
                  |                                         | TC-SEC-011 (deferred G-2), TC-GT-005
C-008             | DFE-STYLE-001 coordination              | TC-BC-002 (FormButton unchanged),
                  |                                         | TC-CI-001 (shared types no regression)
OQ-006 ruling     | requiresPreviousTabsComplete default=false | TC-NAV-010, TC-NAV-011
DEF-001           | Expression error → null substitution    | TC-EP-010, TC-EP-011, TC-EP-012
DEF-002           | NextStep/PrevStep visible-tab skip      | TC-NAV-009
DEF-003           | requiresPreviousTabsComplete check      | TC-NAV-010

CEO Phase 7 success criteria → test coverage:
  #1 (spoofed userId never written)   → TC-EP-008, TC-SEC-005
  #2 (allowlist blocks non-listed)    → TC-GT-001..003, TC-SEC-005, TC-SEC-006
  #3 (expressions cannot exec code)   → TC-SEC-002, TC-SEC-003, TC-SEC-004, TC-EP-011
  #4 (C-006 CI check live + fails)    → TC-CI-001, TC-CI-002
  #5 (backward compat verified)       → TC-BC-001..004, TC-EP-014
  #6 (cross-surface parity)           → TC-PL-001..002 (portal), TC-GT-006 (mobile, deferred),
                                         CRM on-prem cases (deferred)


15. ACCEPTANCE CRITERIA AND EXIT CONDITIONS FOR PHASE 5
═══════════════════════════════════════════════════════════════════════

MUST PASS before Phase 5 sign-off:

  FIXES REQUIRED FIRST (before any test suite is formally run):
  [ ] DEF-001 fixed: ExtraParamsAssemblyService.evaluateComputed returns
      null on ExpressionTimeoutError and ExpressionError instead of throwing;
      forms.routes.submit.test.ts case updated from expect(400) to expect(201)
  [ ] DEF-002 fixed: resolveNavigationTabIndex filters to visible tabs
      before computing next/previous step index
  [ ] DEF-003 fixed (or formally accepted as latent until designer ships):
      useScopedButtonAction checks requiresPreviousTabsComplete and runs
      validation before dispatching tab switch

  UNIT / INTEGRATION TESTS (Stage 1 + 2):
  [ ] All 81 new + modified test cases pass (excluding deferred cases)
  [ ] Backend test count >= 265 (252 existing + DEF-001/DEF-002 fixes + new cases)
  [ ] Frontend test count >= 190
  [ ] TypeScript strict compile: all 4 packages clean
  [ ] C-006 check exits 0 on current codebase (TC-CI-001)

  E2E (Stage 3 Playwright):
  [ ] TC-PL-001, TC-PL-002, TC-PL-003 pass on portal
  [ ] TC-NAV-001..005 pass on portal
  [ ] TC-EP-001 pass (validation before submit)
  [ ] TC-BC-001 visual regression diff: zero visible change vs baseline
  [ ] TC-GT-001, TC-GT-002 pass (no navigation on gated features)
  [ ] TC-CD-001, TC-CD-002, TC-CD-003 pass

  SECURITY:
  [ ] TC-EP-008 (C-004 spoof) passes — documented as CEO gate proof
  [ ] TC-SEC-002, TC-SEC-003, TC-SEC-004 pass (expression sandbox)
  [ ] TC-SEC-005 passes (no open-redirect via extraParams values)
  [ ] TC-CI-002 induced-drift demonstration executed and recorded

  PERFORMANCE:
  [ ] TC-PF-002 single expression <= 50ms on staging server
  [ ] k6 baseline captured (TC-PF-001 — may be advisory for Phase 5)

BLOCKED — Phase 5 sign-off does NOT require these (deferred by gates):
  [ ] TC-SEC-008, TC-SEC-010, TC-SEC-011 — blocked by G-2 (audit write)
  [ ] TC-GT-003, TC-SEC-006 — blocked by G-1 (CallApi route active)
  [ ] TC-GT-006 — blocked by G-3 + mobile slice
  [ ] TC-GT-004 — blocked by portal router wiring for AnotherForm
  [ ] CRM on-prem surface cases — blocked by on-prem slice delivery
  [ ] TC-GT-005 write-back assertion — deferred to G-2 gate clearance


DEFINITION OF DONE (DFE-BTN-001 Phase 5)
═══════════════════════════════════════════════════════════════════════

A feature is considered Phase 5 complete when ALL of the following are true:

  [ ] DEF-001, DEF-002, DEF-003 defects either fixed with green tests
      or formally accepted as latent with a GitHub issue tracking them
  [ ] All 81 test cases in this document executed or explicitly deferred
      with a documented gate reference
  [ ] Zero P0/P1 (Critical/High) test failures that are not gated
  [ ] TC-CI-002 induced-drift demonstration executed and result recorded
  [ ] TC-EP-008 C-004 spoof test result documented as CEO sign-off artifact
  [ ] Performance benchmarks recorded in writing (even if advisory)
  [ ] This document (phase-5-qa-buttons.md) linked from phase-7-ceo-buttons.md
      when that phase is authored

═══════════════════════════════════════════════════════════════════════
DEFECT RESOLUTION — fixed 2026-06-30 (verified against BRD)
───────────────────────────────────────────────────────────────────────
DEF-001 — FIXED. ExtraParamsAssemblyService.evaluateComputed now LOGS and
  substitutes null on any ExpressionError/ExpressionTimeoutError (and missing
  expression) instead of throwing — submission is accepted (FR-042 / NFR-006c /
  AC-C4). Backend route test corrected to assert 201 + null, and the assembly
  tests assert null substitution. (TC-EP-010/011/012.)
DEF-002 — FIXED. resolveNavigationTabIndex now skips effectively-invisible tabs
  on nextStep/previousStep and returns null (stay put) when none remain in that
  direction (BR-001). The hook passes effective visibility from ruleState. (TC-NAV-009.)
DEF-003 — FIXED. useScopedButtonAction now blocks Navigate:Tab/NextStep to a tab
  with requiresPreviousTabComplete=true (or the button flag) when preceding
  required+visible fields are incomplete (BR-002), via arePrecedingTabsComplete.
  NOTE: it blocks + logs; surfacing a full validation SUMMARY in the UI needs a
  FormContext validation hook and is tracked as a follow-up. (TC-NAV-010.)
EXTRA — FR-043 status code corrected: oversized envelope now returns HTTP 422
  (was 413). (TC-EP-013.)
Post-fix: backend 252 tests, frontend 185, all typecheck clean, parity gate green.
═══════════════════════════════════════════════════════════════════════
END OF PHASE 5 QA STRATEGY — DFE-BTN-001
Prepared by: Maqsad AI — QA Engineer
Date: 2026-06-30
═══════════════════════════════════════════════════════════════════════

