═══════════════════════════════════════════════════════════════════
PHASE 4 — QA STRATEGY
Dynamic Form Engine — Mobile Rendering Extension (QDB)
═══════════════════════════════════════════════════════════════════
Prepared by:    Maqsad AI — QA Agent
Date:           2026-05-20
Version:        1.0
Architecture:   projects/dynamic-form-engine/mobile/phase-2-arch.md
Build:          projects/dynamic-form-engine/mobile/phase-3-tech.md
Code Review:    projects/dynamic-form-engine/mobile/code-review.md (PASS)
═══════════════════════════════════════════════════════════════════


1. TEST STRATEGY OVERVIEW
─────────────────────────────────────────────────────────────────────

Four layers of testing apply to the mobile extension:

Layer 1 — Shared package unit tests (Jest, Hermes transform)
  RuleEngine and ValidationEngine tested in isolation using the Hermes
  Jest preset. These are the highest-value tests: a failing rule engine
  breaks every form on both web and mobile.

Layer 2 — Mobile component tests (Jest + React Native Testing Library)
  Each of the 17 field components tested in isolation. The form
  renderer tested with mock metadata. Hooks tested with mock services.

Layer 3 — Backend unit + integration tests (Jest + Supertest)
  GET /api/forms endpoint (new), X-Client-Platform audit channel header,
  qdb_channel Dataverse column write. Integration tests run against a
  mock Dataverse server (existing mock pattern in the web backend).

Layer 4 — E2E tests (Detox, iOS Simulator + Android Emulator)
  Full user journeys: login, form list, form render, draft, submission,
  file upload. Run on every PR targeting main.

Coverage target: 80% minimum across all layers (constitution Article IV).

Test naming convention: descriptive behaviour:
  should_[expected_result]_when_[scenario]
  e.g.: should_hide_field_b_when_field_a_equals_no


2. SHARED PACKAGE TESTS
─────────────────────────────────────────────────────────────────────

MTC-001: RuleEngine — SHOW_FIELD rule fires when condition matches
  Given: BusinessRule { condition: fieldA === 'yes', action: SHOW_FIELD, target: fieldB }
  When: RuleEngine.evaluate({ fieldA: 'yes', fieldB: '' })
  Then: result.visibilityMap.get('fieldB') === true

MTC-002: RuleEngine — HIDE_FIELD rule fires and clears value
  Given: HIDE_FIELD rule for fieldB when fieldA === 'no'
  When: RuleEngine.evaluate({ fieldA: 'no', fieldB: 'some value' })
  Then: result.visibilityMap.get('fieldB') === false
    AND result.clearedFields has 'fieldB'

MTC-003: RuleEngine — compound AND condition requires all facts
  Given: Rule with AND [ fieldA === 'yes', fieldC > 1000 ]
  When: facts = { fieldA: 'yes', fieldC: 500 }
  Then: rule does NOT fire (AND requires both)

MTC-004: RuleEngine — compound OR condition fires on first match
  Given: Rule with OR [ fieldA === 'yes', fieldB === 'active' ]
  When: facts = { fieldA: 'no', fieldB: 'active' }
  Then: rule fires

MTC-005: RuleEngine — HERMES COMPATIBILITY — no DOM globals required
  Given: Jest configured with Hermes transform (no browser globals)
  When: RuleEngine.evaluate() is called with any valid facts
  Then: evaluation completes without ReferenceError on window/document

MTC-006: ValidationEngine — REQUIRED rule produces Zod error on empty string
  Given: FieldDefinition with ValidationRule { ruleType: REQUIRED, errorMessage: 'Field is required' }
  When: ValidationEngine.buildZodSchema([field]).safeParse({ fieldKey: '' })
  Then: result.success === false AND result.error.issues[0].message === 'Field is required'

MTC-007: ValidationEngine — MIN_LENGTH rule rejects short input
  Given: ValidationRule { ruleType: MIN_LENGTH, params: { minLength: 3 }, errorMessage: 'Too short' }
  When: schema.safeParse({ fieldKey: 'ab' })
  Then: error message is 'Too short'

MTC-008: ValidationEngine — EMAIL_FORMAT rule rejects malformed email
  Given: ValidationRule { ruleType: EMAIL_FORMAT }
  When: schema.safeParse({ fieldKey: 'not-an-email' })
  Then: validation fails

MTC-009: ValidationEngine — CROSS_FIELD comparison validates sibling field
  Given: fieldA must equal fieldB (cross-field rule)
  When: schema.safeParse({ fieldA: 'abc', fieldB: 'xyz' })
  Then: validation fails with cross-field error message

MTC-010: ValidationEngine — CUSTOM_EXPRESSION is skipped with warning log
  Given: ValidationRule { ruleType: CUSTOM_EXPRESSION }
  When: ValidationEngine.buildZodSchema([field])
  Then: schema is built without the custom expression rule
    AND a structured warning is logged (no exception thrown)


3. FIELD COMPONENT TESTS (Jest + RNTL)
─────────────────────────────────────────────────────────────────────

MTC-011: NativeTextField — renders label and TextInput
  Given: FieldDefinition { displayLabel: 'Full Name', fieldType: 'text' }
  When: component renders
  Then: label text 'Full Name' is present AND TextInput is accessible

MTC-012: NativeTextField — calls onChange on text input
  Given: rendered NativeTextField
  When: user types 'Ahmed Al-Mansoori'
  Then: onChange is called with 'Ahmed Al-Mansoori'

MTC-013: NativeTextField — applies readonly style when isReadonly is true
  Given: isReadonly: true
  When: component renders
  Then: TextInput is not editable (editable={false})

MTC-014: NativeEmailField — uses email-address keyboardType
  Given: NativeEmailField renders
  When: TextInput props are inspected
  Then: keyboardType === 'email-address' AND autoCapitalize === 'none'

MTC-015: NativeNumberField — uses numeric keyboardType
  Given: NativeNumberField renders
  When: TextInput props are inspected
  Then: keyboardType === 'numeric'

MTC-016: NativeDropdownField — renders all active options
  Given: 3 OptionValue records (2 active, 1 inactive)
  When: NativeDropdownField renders and picker is opened
  Then: only 2 options are visible (inactive filtered out)

MTC-017: NativeDropdownField — calls onChange with selected value
  Given: options = [{ value: 'qr', label: 'Qatar' }, { value: 'ae', label: 'UAE' }]
  When: user selects 'UAE'
  Then: onChange is called with 'ae'

MTC-018: NativeCheckboxField — toggles value on press
  Given: initial value = false
  When: Switch is toggled
  Then: onChange called with true

MTC-019: NativeDateField — displays placeholder when no value
  Given: value = null, placeholder = 'Select date'
  When: component renders
  Then: 'Select date' is visible

MTC-020: NativeDateField — displays formatted date when value is set
  Given: value = '2026-03-15'
  When: component renders
  Then: formatted date string for 2026-03-15 is visible

MTC-021: NativeDateTimeField — Android two-step: shows date picker first
  Given: Platform.OS = 'android', user taps the datetime trigger
  When: trigger pressed
  Then: date picker mode='date' is rendered (not time picker)

MTC-022: NativeDateTimeField — Android two-step: shows time picker after date confirmed
  Given: Android date picker is visible
  When: date selection confirmed
  Then: time picker mode='time' renders with the selected date in state

MTC-023: NativeFileUploadField — validateFileSize returns false for oversized file
  Given: maxFileSizeMb = 5, fileSize = 6 * 1024 * 1024
  When: validateFileSize called
  Then: returns false AND Alert.alert called with 'File too large'

MTC-024: NativeFileUploadField — isUploadedFile type guard accepts valid object
  Given: value = { uploadId: 'u1', fileName: 'doc.pdf', fileSizeBytes: 1024 }
  When: isUploadedFile(value) is called
  Then: returns true

MTC-025: NativeFileUploadField — isUploadedFile rejects invalid object
  Given: value = 'plain string'
  When: isUploadedFile(value) is called
  Then: returns false

MTC-026: NativeLookupField — does not call API until 3 characters entered
  Given: NativeLookupField renders
  When: user types 2 characters
  Then: lookupService.search is NOT called

MTC-027: NativeLookupField — calls API after 3 characters with 300ms debounce
  Given: NativeLookupField renders
  When: user types 3 characters and waits 300ms
  Then: lookupService.search called once with the 3-character term

MTC-028: NativeMultiSelectField — renders all selected items as chips
  Given: value = ['opt1', 'opt2']
  When: component renders
  Then: 2 chip tags are visible below the trigger

MTC-029: ValidationMessage — triggers haptic on first error render
  Given: expo-haptics mock installed
  When: ValidationMessage renders with message = 'Field is required'
  Then: Haptics.notificationAsync called with NotificationFeedbackType.Error

MTC-030: ValidationMessage — does not trigger haptic if message unchanged
  Given: ValidationMessage already rendered with 'Field is required'
  When: component re-renders with same message
  Then: Haptics.notificationAsync NOT called again

MTC-031: GridUnavailableField — renders notice and browser link button
  Given: definition.fieldKey = 'grid_1'
  When: GridUnavailableField renders
  Then: 'Open in browser' button is visible with correct accessibilityRole='link'

MTC-032: GridUnavailableField — shows Alert when browser cannot open URL
  Given: Linking.canOpenURL returns false
  When: user presses 'Open in browser'
  Then: Alert.alert called with 'Cannot open browser' message

MTC-033: RichTextReadOnlyField — renders label and read-only text
  Given: value = '<p>Some <strong>rich</strong> text</p>'
  When: RichTextReadOnlyField renders
  Then: label is visible AND HTML tags are stripped from display text

MTC-034: MobileFieldRenderer — returns null for hidden field
  Given: isVisible = false
  When: MobileFieldRenderer renders
  Then: component returns null (no output in tree)

MTC-035: MobileFieldRenderer — renders ValidationMessage below field on error
  Given: fieldState.error = { message: 'Required' }
  When: MobileFieldRenderer renders
  Then: ValidationMessage with 'Required' is present in the tree


4. HOOK TESTS
─────────────────────────────────────────────────────────────────────

MTC-036: useFormMetadata — returns loading state initially
  Given: apiGet is pending
  When: hook renders
  Then: state.status === 'loading'

MTC-037: useFormMetadata — returns success with FormDefinition on resolve
  Given: apiGet resolves with a valid FormDefinition
  When: hook renders and effect completes
  Then: state.status === 'success' AND state.formDefinition is the fetched definition

MTC-038: useFormMetadata — returns error state on API failure
  Given: apiGet throws ApiError(503, 'Service unavailable')
  When: hook renders and effect completes
  Then: state.status === 'error' AND state.message is set

MTC-039: useFormMetadata — does not set state after unmount (cancelled = true)
  Given: component unmounts before apiGet resolves
  When: apiGet resolves after unmount
  Then: setState is NOT called (no React setState-after-unmount warning)

MTC-040: useRuleEngine — evaluates rules after 50ms debounce
  Given: useRuleEngine with one SHOW_FIELD rule
  When: formValues change
  Then: after 50ms, ruleEngine.evaluate is called once

MTC-041: useRuleEngine — does not re-evaluate before debounce period
  Given: multiple rapid formValue changes within 50ms
  When: changes occur
  Then: ruleEngine.evaluate called only once (debounce collapses events)

MTC-042: useSubmission — submitForm sets isSubmitting = true during call
  Given: submissionService.submit is pending
  When: submitForm is called
  Then: isSubmitting === true during the pending period

MTC-043: useSubmission — sets lastReferenceNumber on success
  Given: submissionService.submit resolves with 'REF-001'
  When: submitForm completes
  Then: lastReferenceNumber === 'REF-001' AND isSubmitting === false

MTC-044: useSubmission — sets submissionError on failure
  Given: submissionService.submit throws an error
  When: submitForm completes
  Then: submissionError is not null AND lastReferenceNumber === null

MTC-045: useSubmission — removeHiddenFields excludes hidden field keys
  Given: hiddenFields = Set(['fieldB'])
  When: submitForm called with values = { fieldA: 'x', fieldB: 'y' }
  Then: submission payload does not contain fieldB


5. BACKEND TESTS (GET /api/forms)
─────────────────────────────────────────────────────────────────────

MTC-046: GET /api/forms — returns 401 without Bearer token
  Given: request with no Authorization header
  When: GET /api/forms
  Then: 401 response

MTC-047: GET /api/forms — returns 200 with form list for authenticated user
  Given: authenticated user with access to 3 forms
  When: GET /api/forms with valid Bearer token
  Then: 200 response with data array of 3 FormListItem objects

MTC-048: GET /api/forms — filters forms by AD group
  Given: user is in group-A only; form-1 is restricted to group-A, form-2 to group-B
  When: GET /api/forms
  Then: response contains form-1 only (form-2 excluded)

MTC-049: GET /api/forms — requiresDesktop = true for form with required grid field
  Given: form-3 has a qdb_field_type='grid' field with qdb_is_required_default=true
  When: GET /api/forms
  Then: form-3.requiresDesktop === true

MTC-050: GET /api/forms — hasDraft = true when user has active draft for form
  Given: authenticated user has an active qdb_form_draft for form-1
  When: GET /api/forms
  Then: form-1.hasDraft === true

MTC-051: GET /api/forms — returns 200 with empty array when no accessible forms
  Given: user has no accessible forms
  When: GET /api/forms
  Then: 200 with data: []

MTC-052: Audit log — X-Client-Platform header sets qdb_channel = 'mobile'
  Given: POST /api/forms/:formCode/submit with header X-Client-Platform: mobile
  When: submission succeeds
  Then: audit log entry written with qdb_channel = 'mobile'

MTC-053: Audit log — missing X-Client-Platform header defaults qdb_channel = 'web'
  Given: POST /api/forms/:formCode/submit with no X-Client-Platform header
  When: submission succeeds
  Then: audit log entry written with qdb_channel = 'web'

MTC-054: FormListController — uses LRU cache on second call for same user
  Given: first GET /api/forms populates cache for userOid-1
  When: second GET /api/forms for userOid-1
  Then: CrmFormListService.fetchAccessibleForms is NOT called (cache hit)

MTC-055: FormListController — does not share cache between different users
  Given: cache populated for userOid-1
  When: GET /api/forms for userOid-2 (different user)
  Then: CrmFormListService.fetchAccessibleForms IS called (separate cache key)


6. E2E TESTS (Detox — iOS Simulator + Android Emulator)
─────────────────────────────────────────────────────────────────────

MTC-056: E2E — Login flow completes and navigates to form list
  Given: app is launched with no cached session
  When: user taps "Sign In" and completes Azure AD authentication (mocked in E2E)
  Then: app navigates to the form list screen AND the user's name is visible

MTC-057: E2E — Form list displays available forms
  Given: authenticated user with access to 2 forms
  When: form list screen renders
  Then: 2 form cards are visible with correct display names

MTC-058: E2E — Form list shows "Desktop required" badge
  Given: one form has requiresDesktop = true
  When: form list renders
  Then: "Desktop required" badge is visible on that form card

MTC-059: E2E — Form list shows "In progress" badge for draft
  Given: user has an active draft for form-1
  When: form list renders
  Then: "In progress" badge is visible on form-1 card

MTC-060: E2E — Opening a form renders all tabs in bottom tab bar
  Given: Loan Application form has 5 tabs
  When: user taps the form card
  Then: form screen opens with 5 tab items in the bottom tab bar

MTC-061: E2E — Text field accepts keyboard input (iOS)
  Given: first tab has a text field 'Full Name'
  When: user taps the field and types 'Ahmed Al-Mansoori'
  Then: 'Ahmed Al-Mansoori' is displayed in the field

MTC-062: E2E — Date field opens native date picker (iOS)
  Given: a date field is visible on the form
  When: user taps the date field trigger
  Then: a modal bottom sheet opens containing the DateTimePicker component

MTC-063: E2E — Dropdown field opens ActionSheet on iOS
  Given: a dropdown field with 3 options is visible
  When: user taps the dropdown trigger on iOS
  Then: an ActionSheet appears with the 3 option labels

MTC-064: E2E — Validation error shown and haptic fired on empty required field
  Given: a required text field is empty
  When: user taps Next / Submit
  Then: an error message appears below the field (red text visible)
    AND (on device with haptic support) the device vibrates

MTC-065: E2E — Save draft persists values and shows confirmation
  Given: user has filled field 'Full Name' with 'Test User'
  When: user taps 'Save Draft'
  Then: a success toast/confirmation is shown
    AND a second GET /api/drafts confirms the draft record exists

MTC-066: E2E — Resume draft pre-populates field values
  Given: user has a draft with field 'Full Name' = 'Test User'
  When: user opens the form and selects 'Resume saved draft'
  Then: 'Full Name' field displays 'Test User'

MTC-067: E2E — Form submission creates CRM record and shows confirmation screen
  Given: all required fields are filled with valid values
  When: user taps Submit
  Then: confirmation screen is shown with a non-empty reference number

MTC-068: E2E — File upload opens action sheet and shows file name on success (iOS)
  Given: a file upload field is visible
  When: user taps the upload button and selects 'Choose File'
    AND selects a small PDF from the document picker
  Then: the file name is displayed below the upload button

MTC-069: E2E — Rule engine hides field when condition is met
  Given: the Loan Application form has a conditional rule hiding 'Guarantor Name'
    when 'Loan Type' === 'Personal'
  When: user selects 'Personal' in the Loan Type dropdown
  Then: 'Guarantor Name' field disappears from the form immediately

MTC-070: E2E — Grid field shows "Desktop required" notice
  Given: a form with a required grid field
  When: the grid section is visible
  Then: the notice card "This section requires the QDB web portal" is visible
    AND an "Open in browser" button is present

MTC-071: E2E — Sign out clears session and returns to login screen
  Given: user is authenticated and on the form list screen
  When: user navigates to Profile and taps Sign Out
  Then: app navigates to the login screen
    AND the SecureStore token cache is cleared

MTC-072: E2E — Accessibility: VoiceOver labels are correct on form list
  Given: VoiceOver is enabled (iOS Simulator)
  When: accessibility inspector scans the form list screen
  Then: each form card has a non-empty accessibilityLabel
    AND the accessibilityHint is "Double tap to open this form"

MTC-073: E2E — Form submission blocked when required field is empty
  Given: a required field 'National ID' is empty
  When: user taps Submit
  Then: submission is NOT sent to the API
    AND the form scrolls to the 'National ID' field
    AND an error message is displayed below it

MTC-074: E2E — Network error on submission shows retriable error message
  Given: the backend API returns 500 on POST /submit (mocked)
  When: user taps Submit with all fields filled
  Then: an error banner is shown with a "Try Again" option
    AND field values are retained (not cleared)

MTC-075: E2E — App displays error screen on metadata fetch failure
  Given: GET /api/forms/:formCode/metadata returns 503 (mocked)
  When: user opens a form
  Then: an error screen is shown with a "Retry" button
    AND no crash occurs


7. PERFORMANCE TESTS
─────────────────────────────────────────────────────────────────────

MTC-076: Rule engine benchmark — 200 rules evaluated within 100ms P95
  Framework: Jest benchmark (shared/ package)
  Method: Run RuleEngine.evaluate(facts) 1,000 times with a 200-rule
    set and 50 facts. Assert P95 < 100ms.
  Failure action: If P95 > 100ms, investigate rule evaluation order
    and consider rule set partitioning before UAT.

MTC-077: Form render benchmark — 50-field form renders in < 500ms
  Framework: RNTL render time measurement
  Method: Measure time from MobileDynamicFormRenderer mount to
    all 50 FieldRenderer components visible.
  Failure action: Identify slowest field components. Consider
    React.memo on field components that receive stable props.

MTC-078: Lookup debounce — API called exactly once per 300ms window
  Framework: Jest with fake timers
  Method: Trigger 10 onChange events within 300ms. Assert
    lookupService.search called exactly once.

MTC-079: File service — upload completes within 10 seconds for 5MB file
  Framework: Detox E2E with a real (non-mocked) test backend
  Method: Upload a 5MB PDF and assert the file name appears within
    10 seconds. Validates MFR-037 (progress indicator and completion).


8. SECURITY TESTS
─────────────────────────────────────────────────────────────────────

MTC-080: No token in AsyncStorage after authentication
  Given: user completes MSAL authentication
  When: AsyncStorage.getAllKeys() is called
  Then: no key containing 'msal' or 'token' exists in AsyncStorage

MTC-081: No field values in AsyncStorage during form fill
  Given: user fills all 50 fields on the Loan Application form
  When: AsyncStorage.getAllKeys() is called
  Then: no form field data exists in AsyncStorage

MTC-082: Authorization header is not logged
  Given: requestLogger middleware is active
  When: any authenticated API call is made
  Then: the structured log output does NOT contain the string 'Bearer'

MTC-083: Validation error on API with invalid formCode characters
  Given: formCode contains special characters '../../../etc'
  When: GET /api/forms/../../../etc/metadata
  Then: 400 response (formCode regex guard rejects it)

MTC-084: Backend rejects submission payload with hidden field values
  Given: a field is hidden by the rule engine
  When: mobile client sends a submission payload containing the hidden field
    (simulating a tampered request)
  Then: the backend removes the hidden field value before Dataverse write
    (server-side BR-002 enforcement)


9. REQUIREMENTS TRACEABILITY MATRIX
─────────────────────────────────────────────────────────────────────

| User Story | Functional Requirements                 | Test Cases              | Status  |
|------------|-----------------------------------------|-------------------------|---------|
| MUS-01     | MFR-001, MFR-002, MFR-003, MFR-004     | MTC-056, MTC-080, MTC-081 | Defined |
| MUS-02     | MFR-009, MFR-010, MFR-012, MFR-013     | MTC-060, MTC-061, MTC-062, MTC-063 | Defined |
| MUS-03     | MFR-022, MFR-023, MFR-024, MFR-025     | MTC-001–005, MTC-069    | Defined |
| MUS-04     | MFR-031, MFR-032, MFR-033              | MTC-065, MTC-066        | Defined |
| MUS-05     | MFR-035, MFR-036, MFR-037, MFR-038    | MTC-068, MTC-079        | Defined |
| MUS-06     | MFR-026, MFR-027, MFR-028, MFR-029, MFR-030 | MTC-064, MTC-073   | Defined |
| MUS-07     | MFR-040, MFR-041, MFR-042              | MTC-067, MTC-074        | Defined |
| MUS-08     | MFR-006, MFR-007, MFR-009              | MTC-036, MTC-037, MTC-038 | Defined |
| MUS-09     | MFR-045, MFR-046                       | MTC-052, MTC-053        | Defined |
| MUS-10     | MFR-021, MNFR-011                      | MTC-072                 | Defined |


10. DEFECT CLASSIFICATION GUIDE
─────────────────────────────────────────────────────────────────────

P0 — UAT blocker (must fix before UAT begins):
  - Any authentication failure (users cannot sign in)
  - Rule engine not evaluating rules (businessRules: [] bug — BLOCKER-10
    on web must be fixed first)
  - Form submission failing with data loss
  - Token stored in unencrypted location (MNFR-007 violation)

P1 — Sprint blocker (fix within sprint):
  - File upload not functional
  - Draft save/resume broken
  - Validation not firing on required fields
  - Date/datetime picker not responding on either platform

P2 — Release blocker (fix before production):
  - jailbreak/root detection not implemented (MNFR-008)
  - Any audit log entry missing qdb_channel
  - VoiceOver/TalkBack accessibility failures on form fields

P3 — Post-release (Phase 2):
  - Android bottom-sheet for dropdown (currently Alert — TODO MAI-MOBILE-001)
  - richtext field editing on mobile
  - grid field rendering on mobile
  - Offline draft support

═══════════════════════════════════════════════════════════════════
END OF QA STRATEGY
Dynamic Form Engine — Mobile Rendering Extension
Maqsad AI — QA Agent — 2026-05-20
═══════════════════════════════════════════════════════════════════
