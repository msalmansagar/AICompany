═══════════════════════════════════════════════════════════════════
PHASE 5 — QA PLAN ADDENDA (PART 1 OF 2)
Dynamic Form Engine Portal — QDB
DFE-ADD-001 (Info-Card Screens) + DFE-ADD-002 (Boolean Field,
Interactive Grid, Tab-Aware Buttons)
═══════════════════════════════════════════════════════════════════
Prepared by:    Maqsad AI — QA Engineer
Date:           2026-06-07
Version:        1.0
Status:         COMPLETE
Parent:         phase-5-qa.md v1.0 (TC-001 through TC-075)
                Test numbering in this document: TC-A001 onward
                Part 2 continues at TC-076 in phase-5-qa-addenda-part2.md
References:     brd.md (FR-048–FR-153, BR-013–BR-027)
                phase-3-arch-addenda.md v1.0
                phase-7-ceo.md (BC-001–BC-011)
═══════════════════════════════════════════════════════════════════


═══════════════════════════════════════════════════════════════════
SECTION 1 — SCOPE
═══════════════════════════════════════════════════════════════════

1.1 In Scope
───────────────────────────────────────────────────────────────────
Feature                              Requirements
───────────────────────────────────────────────────────────────────
Info-Card Screens (ADD-001)          FR-048–FR-087
  Screen/Section/Item hierarchy      FR-049–FR-057
  Section types (3)                  FR-053–FR-057
  Navigation buttons                 FR-060–FR-066
  Skip control                       FR-067–FR-069
  Nav button label config            ADD-001-C1
  Draft resume bypass                ADD-001-C2
  First-view audit                   FR-070–FR-073, BC-006
Boolean Field (ADD-002)              FR-088–FR-101
Selection Grid (ADD-002)             FR-102–FR-117, BC-011
Entry Grid (ADD-002)                 FR-118–FR-135, BC-001–BC-003
Tab-aware Buttons (ADD-002)          FR-136–FR-153, BC-008
───────────────────────────────────────────────────────────────────

1.2 Out of Scope
───────────────────────────────────────────────────────────────────
- Core form engine (covered in phase-5-qa.md TC-001–TC-075)
- Admin info-card CRUD UI
- Mobile (React Native) — separate engagement

1.3 Entry Gates
───────────────────────────────────────────────────────────────────
GATE-1  Dataverse schema deployed — all 5 new entities present ✓
GATE-2  Seed data present (2 screens, 4 sections, 9 items) ✓
GATE-3  Backend TypeScript compiles without errors
GATE-4  Frontend TypeScript compiles without errors
GATE-5  Phase 4 code review passed ✓


═══════════════════════════════════════════════════════════════════
SECTION 2 — TEST STRATEGY
═══════════════════════════════════════════════════════════════════

Layer           Tooling                     Location
───────────────────────────────────────────────────────────────────
Unit (backend)  Vitest + nock               backend/src/__tests__/
Unit (frontend) Vitest + RTL + user-event   frontend/src/__tests__/
Integration     Supertest                   backend/src/__tests__/integration/
E2E             Playwright                  e2e/
───────────────────────────────────────────────────────────────────

Coverage target: 80% line/branch per new file (Constitution Article IV).
All BC-001–BC-011 conditions must have at least one named test case.

Fixture files required before testing begins:
  fixtures/batchResponses.ts   — captured $batch response bodies
  fixtures/infoCardMetadata.ts — FormDefinition with infoCards
  fixtures/gridColumnConfigs.ts — GridColumnConfig arrays for hash tests


═══════════════════════════════════════════════════════════════════
SECTION 3 — BACKEND UNIT TESTS
═══════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────────
3.1 CrmInfoCardService
File: backend/src/__tests__/services/CrmInfoCardService.test.ts
───────────────────────────────────────────────────────────────────

TC-A001 | fetchInfoCardScreens_ReturnsEmptyArray_WhenNoScreensExist
  Given: Dataverse returns { value: [] } for qdb_info_card_screens
  Then:  Returns []
  Refs:  FR-049

TC-A002 | fetchInfoCardScreens_ReturnsSortedScreens_ByDisplayOrder
  Given: 3 screens with displayOrder 3, 1, 2
  Then:  Returns screens sorted [1, 2, 3]
  Refs:  FR-050

TC-A003 | fetchInfoCardScreens_AssemblesSectionsWithItems
  Given: 2 screens, 2 sections each, 3 items each section
  Then:  Returns fully assembled tree — 2 screens, 4 sections, 12 items
  Refs:  FR-053

TC-A004 | fetchInfoCardScreens_ExcludesInactiveScreens
  Given: 3 screens; 1 has statecode = 1
  Then:  Returns 2 screens only
  Refs:  FR-049

TC-A005 | mapSectionType_ReturnsNumberedSteps_For100000000
  Given: qdb_section_type = 100000000
  Then:  Returns 'numbered-steps'
  Refs:  FR-053, Bug-2-regression

TC-A006 | mapSectionType_ReturnsIconList_For100000001
  Given: qdb_section_type = 100000001
  Then:  Returns 'icon-list'
  Refs:  FR-055, Bug-2-regression

TC-A007 | mapSectionType_ReturnsDownloadList_For100000002
  Given: qdb_section_type = 100000002
  Then:  Returns 'download-list'
  Refs:  FR-057, Bug-2-regression

TC-A008 | mapSectionType_FallsBackToNumberedSteps_ForUnknownCode
  Given: qdb_section_type = 999999999
  Then:  Returns 'numbered-steps' — no throw
  Refs:  FR-053

TC-A009 | recordInfoCardView_CreatesRecord_OnFirstView
  Given: Dataverse POST returns 204
  Then:  POST made with correct qdb_user_aad_object_id and @odata.bind
  Refs:  FR-071, BC-006

TC-A010 | recordInfoCardView_DoesNotThrow_WhenDuplicateAlternateKey
  Given: Dataverse returns 412 with code 0x80060892
  Then:  No exception — function returns void
  Refs:  BC-006

TC-A011 | recordInfoCardView_DoesNotThrow_WhenNetworkFails
  Given: Dataverse POST throws network error
  Then:  No exception — error logged, swallowed
  Refs:  FR-073 (fire-and-forget)

TC-A012 | hasUserViewedInfoCard_ReturnsTrue_WhenRecordExists
  Given: Dataverse returns 1 record for user+form composite
  Then:  Returns true
  Refs:  FR-070

TC-A013 | hasUserViewedInfoCard_ReturnsFalse_WhenNoRecord
  Given: Dataverse returns { value: [] }
  Then:  Returns false
  Refs:  FR-070

───────────────────────────────────────────────────────────────────
3.2 GridSchemaHashService
File: backend/src/__tests__/services/GridSchemaHashService.test.ts
───────────────────────────────────────────────────────────────────

TC-A014 | computeHash_ReturnsConsistentHash_ForSameColumns
  Given: ['attr_a', 'attr_b', 'attr_c'] called twice
  Then:  Both return identical 16-char hex string
  Refs:  BC-001

TC-A015 | computeHash_ReturnsDifferentHash_WhenColumnAdded
  Given: baseline from ['attr_a', 'attr_b']
  Then:  computeHash(['attr_a', 'attr_b', 'attr_c']) differs
  Refs:  BC-001

TC-A016 | computeHash_IsOrderIndependent
  Given: ['attr_c', 'attr_a', 'attr_b']
  Then:  Same hash as ['attr_a', 'attr_b', 'attr_c']
  Refs:  BC-001 (sort before hash)

TC-A017 | hashComparison_NullStoredHash_AlwaysInvalidates
  Given: storedHash = null, currentHash = 'abc123'
  Then:  isHashStale returns true
  Refs:  BC-001

TC-A018 | hashComparison_MatchingHash_DoesNotInvalidate
  Given: storedHash = currentHash = 'abc123'
  Then:  isHashStale returns false
  Refs:  BC-001

───────────────────────────────────────────────────────────────────
3.3 BatchChangesetBuilder
File: backend/src/__tests__/services/BatchChangesetBuilder.test.ts
───────────────────────────────────────────────────────────────────

TC-A019 | build_ProducesValidMultipartMime_WithBoundary
  Given: 2 operations (parent + child)
  Then:  Returns multipart/mixed MIME with one changeset part
  Refs:  ADR-ADD-002

TC-A020 | build_AssignsSequentialContentIds
  Given: 3 operations
  Then:  Parts have Content-ID 1, 2, 3
  Refs:  ADR-ADD-002

TC-A021 | build_ReferencesParentContentId_InChildBind
  Given: child op with '@odata.bind' referencing '$1'
  Then:  Body contains '@odata.bind': '$1'
  Refs:  ADR-ADD-002

TC-A022 | parseBatchResponse_ReturnsAllSuccess
  Given: All parts return 200/201
  Then:  { succeeded: [all], failed: [] }
  Refs:  BC-003

TC-A023 | parseBatchResponse_MapsFailedParts_ToRowIndex
  Given: Part 2 returns 400
  Then:  { failed: [{ rowIndex: 1, error: ... }] }
  Refs:  BC-003

TC-A024 | parseBatchResponse_ReturnsAllFailed_WhenChangesetRollsBack
  Given: Top-level changeset 400
  Then:  { succeeded: [], failed: [all rows] }
  Refs:  BC-003

───────────────────────────────────────────────────────────────────
3.4 CrmGridDataService
File: backend/src/__tests__/services/CrmGridDataService.test.ts
───────────────────────────────────────────────────────────────────

TC-A025 | getGridRecords_ReturnsPagedResults_HappyPath
  Given: Valid fieldId, System View, page=1, pageSize=25
  Then:  Returns GridRecordPage with records and isCapped=false
  Refs:  FR-103

TC-A026 | getGridRecords_Returns400_WhenViewNotFound
  Given: savedViewId references non-existent view
  Then:  Throws UserFacingError HTTP 400 (not 502)
  Refs:  BC-004

TC-A027 | getGridRecords_Rejects_WhenPageSizeExceeds100
  Given: pageSize = 101
  Then:  Throws ValidationError HTTP 400 before Dataverse call
  Refs:  FR-105

TC-A028 | getGridRecords_RejectsUserViews
  Given: View exists but IsUserView = true
  Then:  Throws UserFacingError 'System Views only'
  Refs:  BC-011

TC-A029 | getGridRecords_SetsisCapped_WhenResultsAtMaxRows
  Given: maxRows = 50, Dataverse returns 50 records
  Then:  isCapped = true
  Refs:  FR-106

───────────────────────────────────────────────────────────────────
3.5 CrmBatchSubmissionService
File: backend/src/__tests__/services/CrmBatchSubmissionService.test.ts
───────────────────────────────────────────────────────────────────

TC-A030 | submitAll_SendsSingleChangeset_ContainingAllOperations
  Given: parent + 3 grid rows = 4 operations
  Then:  Exactly one POST to /$batch; all 4 ops in one changeset
  Refs:  BC-002, ADR-ADD-002

TC-A031 | submitAll_Allows_ExactlyFiveHundredOperations
  Given: payload with exactly 500 operations
  Then:  $batch POST made — no error
  Refs:  BC-002

TC-A032 | submitAll_Rejects_WhenOperationsExceedFiveHundred
  Given: payload with 501 operations
  Then:  Throws BatchSizeExceededError BEFORE any Dataverse call
  Refs:  BC-002

TC-A033 | submitAll_ReturnsPartialFailure_WithRowAttribution
  Given: $batch response with part 3 returning 400
  Then:  BatchResult.failed[0].rowIndex = 2
  Refs:  ADR-ADD-002, BC-003


═══════════════════════════════════════════════════════════════════
SECTION 4 — API INTEGRATION TESTS (SUPERTEST)
═══════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────────
4.1 Metadata endpoint — infoCards
File: backend/src/__tests__/integration/metadata.addenda.test.ts
───────────────────────────────────────────────────────────────────

TC-A034 | GET_metadata_ReturnsInfoCardsArray_WhenScreensExist
  GET /api/forms/loan-application-legacy/metadata
  Mock: 2 screens with sections and items
  Then: data.infoCards.length = 2
        data.infoCards[0].sections[0].sectionType = 'numbered-steps'
  Refs: FR-049

TC-A035 | GET_metadata_ReturnsEmptyInfoCardsArray_WhenNoScreens
  Mock: Dataverse { value: [] } for screens
  Then: data.infoCards = []

TC-A036 | GET_metadata_ReturnsInfocardLabelFields_WhenSet
  Mock: qdb_infocard_start_label = 'Begin'
  Then: data.infocardStartLabel = 'Begin'
  Refs: ADD-001-C1

TC-A037 | GET_metadata_ReturnsAllowInfocardSkip
  Mock: qdb_allow_infocard_skip = true
  Then: data.allowInfocardSkip = true
  Refs: FR-067

───────────────────────────────────────────────────────────────────
4.2 Grid records endpoint
File: backend/src/__tests__/integration/grids.addenda.test.ts
───────────────────────────────────────────────────────────────────

TC-A038 | GET_gridRecords_Returns200_WithPagedResults
  GET /api/grids/:fieldId/records?page=1&pageSize=25
  Then: 200 { records, totalCount, isCapped: false }
  Refs: FR-103

TC-A039 | GET_gridRecords_Returns400_WhenViewNotFound
  Mock: Dataverse 404 for view lookup
  Then: 400 user-facing message; NOT 502
  Refs: BC-004

TC-A040 | GET_gridRecords_Returns400_WhenPageSizeExceedsLimit
  GET ...?pageSize=101
  Then: 400 before Dataverse call; error.code = 'INVALID_PAGE_SIZE'
  Refs: FR-105

TC-A041 | GET_gridRecords_Returns401_WhenUnauthenticated
  SKIP_AUTH=false, no auth header
  Then: 401 Unauthorized
  Refs: NFR-008

TC-A042 | GET_gridRecords_Returns404_WhenFieldIdUnknown
  GET /api/grids/00000000-.../records
  Then: 404 error.code = 'FIELD_NOT_FOUND'
  Refs: FR-103

TC-A043 | GET_gridRecords_RejectsUserView_Returns400
  Mock: view IsUserView = true
  Then: 400 'System Views only'
  Refs: BC-011

───────────────────────────────────────────────────────────────────
4.3 Info-card view endpoint
File: backend/src/__tests__/integration/infoCardView.addenda.test.ts
───────────────────────────────────────────────────────────────────

TC-A044 | POST_infocardViewed_Returns204_OnSuccess
  POST /api/forms/:formCode/info-card-viewed
  Then: 204 No Content
  Refs: FR-072

TC-A045 | POST_infocardViewed_Returns204_WhenDuplicateKey
  Mock: Dataverse 412 code 0x80060892
  Then: 204 — non-fatal, client unaffected
  Refs: BC-006

TC-A046 | POST_infocardViewed_Returns401_WhenUnauthenticated
  SKIP_AUTH=false
  Then: 401

TC-A047 | POST_infocardViewed_Returns404_WhenFormNotFound
  POST /api/forms/unknown-form/info-card-viewed
  Then: 404 error.code = 'FORM_NOT_FOUND'
  Refs: FR-072

───────────────────────────────────────────────────────────────────
4.4 Draft save — addenda extensions
File: backend/src/__tests__/integration/drafts.addenda.test.ts
───────────────────────────────────────────────────────────────────

TC-A048 | POST_saveDraft_PersistsGridSchemaHash
  body: { gridSchemaHash: { 'field-id': 'abc123' } }
  Then: 204; qdb_grid_schema_hash written as JSON string
  Refs: BC-001

TC-A049 | POST_saveDraft_PersistsInfoCardViewed
  body: { infoCardViewed: true }
  Then: 204; qdb_info_card_viewed = true
  Refs: ADD-001-C2

TC-A050 | GET_getDraft_ReturnsGridSchemaHash
  Mock: draft.qdb_grid_schema_hash = '{"f1":"abc"}'
  Then: draft.gridSchemaHash = { f1: 'abc' }
  Refs: BC-001

TC-A051 | GET_getDraft_ReturnsInfoCardViewed
  Mock: draft.qdb_info_card_viewed = true
  Then: draft.infoCardViewed = true
  Refs: ADD-001-C2



---

SECTION 5 — FRONTEND UNIT TESTS
═══════════════════════════════════════════════════════════════════

Framework: Vitest + React Testing Library + @testing-library/user-event
Coverage target: 80% minimum per file (Constitution Article IV)
Location convention: src/__tests__/ mirroring src/ tree
Naming convention: MethodName_Scenario_ExpectedResult

All tests must pass in isolation. No shared mutable state between
test cases. Each test file seeds its own fixtures. Real Zod schemas
are used; no validation mocking.

───────────────────────────────────────────────────────────────────
5.1 DynamicFormRenderer — Phase State Machine
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/components/DynamicFormRenderer.phase.test.tsx

TC-076: phaseStateMachine_InitialisesInfoCardsPhase_WhenInfoCardsExistAndNoDraft
  (references US-13 / FR-048, FR-052)
  Given: formDefinition.infoCards.length = 3 AND isDraftResume = false
  When:  DynamicFormRenderer renders
  Then:  component renders InfoCardFlow (not DynamicFormRenderer's
         tab tree); phase state is 'info-cards'; screenIndex = 0
  Priority: Critical
  Type: Unit

TC-077: phaseStateMachine_InitialisesFormPhase_WhenNoInfoCardsExist
  (references FR-052)
  Given: formDefinition.infoCards.length = 0 AND isDraftResume = false
  When:  DynamicFormRenderer renders
  Then:  InfoCardFlow is not mounted; TabRenderer is mounted with
         activeTabId = formDefinition.tabs[0].tabId
  Priority: Critical
  Type: Unit

TC-078: phaseStateMachine_SkipsDraftResume_ToFormPhaseDirectly
  (references US-22 / FR-024, ADD-001-C2)
  Given: formDefinition.infoCards.length = 2 AND isDraftResume = true
         AND draft.lastSavedTabId = 'tab-3'
  When:  DynamicFormRenderer renders
  Then:  phase state is 'form' immediately; activeTabId = 'tab-3';
         InfoCardFlow is never mounted
  Priority: Critical
  Type: Unit

TC-079: phaseStateMachine_NextTransition_AdvancesScreenIndex
  (references FR-059)
  Given: phase = 'info-cards', screenIndex = 0, total screens = 3
  When:  NEXT action dispatched (user clicks Continue)
  Then:  screenIndex = 1; phase remains 'info-cards'
  Priority: High
  Type: Unit

TC-080: phaseStateMachine_NextTransition_OnLastScreen_TransitionsToForm
  (references FR-061)
  Given: phase = 'info-cards', screenIndex = 2, total screens = 3
  When:  NEXT action dispatched (user clicks Start)
  Then:  phase = 'form'; activeTabId = formDefinition.tabs[0].tabId
  Priority: Critical
  Type: Unit

TC-081: phaseStateMachine_BackTransition_DecrementsScreenIndex
  (references FR-060)
  Given: phase = 'info-cards', screenIndex = 2
  When:  BACK action dispatched
  Then:  screenIndex = 1; phase remains 'info-cards'
  Priority: High
  Type: Unit

TC-082: phaseStateMachine_BackTransition_NoEffectOnFirstScreen
  (references FR-060)
  Given: phase = 'info-cards', screenIndex = 0
  When:  BACK action dispatched
  Then:  screenIndex remains 0; no state change; no error thrown
  Priority: High
  Type: Unit

TC-083: phaseStateMachine_SkipTransition_TransitionsToFormImmediately
  (references US-16 / FR-064)
  Given: phase = 'info-cards', screenIndex = 1,
         formDefinition.allowInfocardSkip = true
  When:  SKIP action dispatched
  Then:  phase = 'form'; activeTabId = formDefinition.tabs[0].tabId
         regardless of current screenIndex
  Priority: Critical
  Type: Unit

TC-084: phaseStateMachine_FinalTabId_RecomputedOnVisibilityChange
  (references BC-008 / BR-025)
  Given: form with tabs at displayOrder [10, 20, 30]; rule engine
         hides tab at displayOrder 30 (previously finalTabId)
  When:  visibilityMap emits tab-visibility-change
  Then:  finalTabId recomputes to tab at displayOrder 20;
         recomputation is debounced 300ms before reflecting in DOM
  Priority: Critical
  Type: Unit

TC-085: phaseStateMachine_FinalTabId_NotRecomputedOnFieldVisibilityChange
  (references BC-008)
  Given: form with established finalTabId; rule engine emits
         field-visibility-change (not tab-visibility-change)
  When:  visibilityMap updates only field-level keys
  Then:  finalTabId is NOT recomputed; no Submit button flicker
  Priority: High
  Type: Unit

───────────────────────────────────────────────────────────────────
5.2 InfoCardFlow — Sorted Screens + First-View Audit
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/components/info-card/InfoCardFlow.test.tsx

TC-086: InfoCardFlow_SortedScreens_RendersInAscendingDisplayOrder
  (references FR-051)
  Given: infoCards with displayOrder [30, 10, 20] in array
  When:  InfoCardFlow renders
  Then:  first rendered screen has displayOrder=10;
         screenIndex=0 maps to displayOrder=10 screen
  Priority: Critical
  Type: Unit

TC-087: InfoCardFlow_SortedScreens_TiebreakByHeadingAlpha
  (references FR-051)
  Given: two screens with identical displayOrder=10;
         headings are "Zebra" and "Apple"
  When:  InfoCardFlow renders
  Then:  screen with heading "Apple" renders first (screenIndex=0)
  Priority: Medium
  Type: Unit

TC-088: InfoCardFlow_FirstViewAudit_CallsViewStatusOnMount
  (references FR-076 / ADD-001-C1)
  Given: mockAuditService.hasViewedInfoCard returns { hasViewed: false }
  When:  InfoCardFlow mounts
  Then:  GET /api/forms/:formCode/infocard-view-status is called
         exactly once; result is cached in component state
  Priority: Critical
  Type: Unit

TC-089: InfoCardFlow_FirstViewAudit_WritesAuditEventOnFirstView
  (references FR-076)
  Given: hasViewedInfoCard returns { hasViewed: false }
  When:  InfoCardFlow mounts
  Then:  audit event 'info_card_screen_viewed' is posted to audit log;
         qdb_info_card_view_record is created; exactly one POST issued
  Priority: Critical
  Type: Unit

TC-090: InfoCardFlow_FirstViewAudit_SkipsAuditWriteOnSubsequentView
  (references FR-076)
  Given: hasViewedInfoCard returns { hasViewed: true }
  When:  InfoCardFlow mounts
  Then:  no audit event is posted; no qdb_info_card_view_record created
  Priority: Critical
  Type: Unit

TC-091: InfoCardFlow_FirstViewAudit_FireAndForget_DoesNotBlockNavigation
  (references phase-3-arch-addenda.md section 2.4)
  Given: auditService throws a network error on view-status check
  When:  InfoCardFlow mounts
  Then:  InfoCardScreen[0] still renders; user can navigate freely;
         error is logged with correlationId; no user-facing error shown
  Priority: Critical
  Type: Unit

TC-092: InfoCardFlow_OnComplete_CallsOnCompleteCallback
  (references FR-061)
  Given: InfoCardFlow with 2 screens; onComplete callback spy
  When:  NEXT dispatched on last screen (screenIndex=1)
  Then:  onComplete() is called exactly once with no arguments
  Priority: High
  Type: Unit

───────────────────────────────────────────────────────────────────
5.3 useInfoCardNavigation Hook
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/hooks/useInfoCardNavigation.test.ts

TC-093: useInfoCardNavigation_InitialState_FirstScreenFlags
  (references FR-059, FR-060)
  Given: hook initialised with totalScreens=3
  When:  hook mounts (no actions taken)
  Then:  currentIndex=0; isFirstScreen=true; isLastScreen=false;
         canGoBack=false
  Priority: High
  Type: Unit

TC-094: useInfoCardNavigation_GoNext_IncrementsIndex
  (references FR-059)
  Given: currentIndex=1, totalScreens=3
  When:  goNext() called
  Then:  currentIndex=2; isLastScreen=true; isFirstScreen=false
  Priority: High
  Type: Unit

TC-095: useInfoCardNavigation_GoPrev_DecrementsIndex
  (references FR-060)
  Given: currentIndex=2, totalScreens=3
  When:  goPrev() called
  Then:  currentIndex=1; canGoBack=true; isFirstScreen=false
  Priority: High
  Type: Unit

TC-096: useInfoCardNavigation_GoPrev_ClampedAtZero
  (references FR-060)
  Given: currentIndex=0, totalScreens=3
  When:  goPrev() called
  Then:  currentIndex remains 0; no error thrown
  Priority: Medium
  Type: Unit

TC-097: useInfoCardNavigation_SkipAll_ReturnsSkipAllTrue
  (references FR-064)
  Given: hook initialised with totalScreens=3; currentIndex=1
  When:  skipAll() called
  Then:  hook returns { skipAll: true } or equivalent signal;
         currentIndex not relevant after skip
  Priority: High
  Type: Unit

TC-098: useInfoCardNavigation_SingleScreen_IsFirstAndLastScreen
  (references FR-061)
  Given: hook initialised with totalScreens=1
  When:  hook mounts
  Then:  isFirstScreen=true; isLastScreen=true; canGoBack=false
  Priority: Medium
  Type: Unit

TC-099: useInfoCardNavigation_HasNoSideEffects_PureState
  (references phase-3-arch-addenda.md section 2.2 "pure state hook")
  Given: hook with totalScreens=3
  When:  goNext() called three times; goPrev() called once
  Then:  currentIndex=2; no external calls; no writes to any service;
         re-render of test host component not triggered beyond index update
  Priority: Medium
  Type: Unit

───────────────────────────────────────────────────────────────────
5.4 InfoCardNavBar — Label Props, Skip/Back Visibility
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/components/info-card/InfoCardNavBar.test.tsx

TC-100: InfoCardNavBar_ContinueButton_PresentOnNonLastScreen
  (references FR-059)
  Given: isFirstScreen=false, isLastScreen=false,
         allowInfocardSkip=false
  When:  InfoCardNavBar renders
  Then:  "Continue" button is present in the DOM;
         "Start" button is absent
  Priority: Critical
  Type: Unit

TC-101: InfoCardNavBar_StartButton_PresentOnLastScreen
  (references FR-061)
  Given: isFirstScreen=false, isLastScreen=true
  When:  InfoCardNavBar renders
  Then:  "Start" button is present in the DOM;
         "Continue" button is absent
  Priority: Critical
  Type: Unit

TC-102: InfoCardNavBar_BackButton_AbsentOnFirstScreen
  (references FR-060)
  Given: isFirstScreen=true, isLastScreen=false
  When:  InfoCardNavBar renders
  Then:  "Back" button is either absent from DOM or has
         aria-disabled="true"; clicking it triggers no state change
  Priority: Critical
  Type: Unit

TC-103: InfoCardNavBar_BackButton_PresentOnNonFirstScreen
  (references FR-060)
  Given: isFirstScreen=false
  When:  InfoCardNavBar renders
  Then:  "Back" button is present and enabled in the DOM
  Priority: High
  Type: Unit

TC-104: InfoCardNavBar_SkipButton_PresentWhenAllowSkipTrue
  (references US-16 / FR-063)
  Given: allowInfocardSkip=true
  When:  InfoCardNavBar renders
  Then:  "Skip" button (or "Skip Introduction") is present in DOM
  Priority: Critical
  Type: Unit

TC-105: InfoCardNavBar_SkipButton_AbsentWhenAllowSkipFalse
  (references FR-065)
  Given: allowInfocardSkip=false
  When:  InfoCardNavBar renders
  Then:  no element with text matching /skip/i is present in DOM
  Priority: Critical
  Type: Unit

TC-106: InfoCardNavBar_AllControls_AreNativeButtonElements
  (references FR-073)
  Given: any combination of props
  When:  InfoCardNavBar renders
  Then:  all rendered interactive controls are <button> elements
         or <a> elements with role="button"; no <div onClick> present
  Priority: High
  Type: Unit

───────────────────────────────────────────────────────────────────
5.5 InfoCardScreen + Section Renderers
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/components/info-card/InfoCardScreen.test.tsx
Test file: src/__tests__/components/info-card/sections/NumberedStepsSection.test.tsx
Test file: src/__tests__/components/info-card/sections/IconListSection.test.tsx
Test file: src/__tests__/components/info-card/sections/DownloadListSection.test.tsx

TC-107: InfoCardScreen_SetsPageTitleOnMount
  (references FR-071)
  Given: screen.heading="Loan Eligibility", formDefinition.displayName="Loan Application"
  When:  InfoCardScreen renders
  Then:  document.title = "Loan Eligibility — Loan Application"
  Priority: High
  Type: Unit

TC-108: InfoCardScreen_MovesKeyboardFocusToH1OnRender
  (references FR-072)
  Given: a screen with heading = "Step 1"
  When:  InfoCardScreen renders
  Then:  document.activeElement is the H1 element containing "Step 1"
  Priority: High
  Type: Unit

TC-109: InfoCardScreen_RendersIconWithAltText
  (references FR-054)
  Given: screen with iconUrl="https://cdn.qdb.qa/icon.png"
         and iconAltText="Loan process overview"
  When:  InfoCardScreen renders
  Then:  <img src="https://cdn.qdb.qa/icon.png"
              alt="Loan process overview"> is present
  Priority: High
  Type: Unit

TC-110: InfoCardScreen_OmitsIconWhenUrlAbsent
  (references FR-054)
  Given: screen with iconUrl=null
  When:  InfoCardScreen renders
  Then:  no <img> element is rendered; no empty layout gap exists
  Priority: Medium
  Type: Unit

TC-111: InfoCardScreen_RendersHeadingAsH1
  (references FR-055)
  Given: screen.heading = "What you need to prepare"
  When:  InfoCardScreen renders
  Then:  getByRole('heading', { level: 1 }) returns the element
         with text "What you need to prepare"
  Priority: Critical
  Type: Unit

TC-112: InfoCardScreen_RendersSubHeadingWhenPresent
  (references FR-056)
  Given: screen.subHeading = "Gather these before starting"
  When:  InfoCardScreen renders
  Then:  paragraph element with text "Gather these before starting"
         is present immediately below the H1
  Priority: Medium
  Type: Unit

TC-113: InfoCardScreen_NoFormInputsRendered
  (references BR-013 / NFR-016)
  Given: any InfoCardScreen with sections and items
  When:  InfoCardScreen renders
  Then:  no <input>, <textarea>, <select>, or form element is present
         in the component tree
  Priority: Critical
  Type: Unit

TC-114: NumberedStepsSection_RendersItemsAsOrderedList
  (references FR-079)
  Given: section.sectionType='numbered-steps'; 3 items with
         titles ["Prepare ID", "Fill form", "Submit"]
  When:  NumberedStepsSection renders
  Then:  an <ol> contains 3 <li> elements in order;
         first <li> shows "1" or equivalent ordinal indicator
         and title "Prepare ID"
  Priority: High
  Type: Unit

TC-115: IconListSection_RendersItemsWithIconAndTitle
  (references FR-079)
  Given: section.sectionType='icon-list'; item with
         iconReference="DocumentPdfRegular" and title="Income Statement"
  When:  IconListSection renders
  Then:  Fluent UI icon "DocumentPdfRegular" is rendered alongside
         text "Income Statement"
  Priority: Medium
  Type: Unit

TC-116: DownloadListSection_RendersDownloadAnchorWithNoopenerRel
  (references FR-083, FR-084)
  Given: section.sectionType='download-list'; item with
         downloadUrl="https://docs.qdb.qa/form.pdf" and
         title="Application Form"
  When:  DownloadListSection renders
  Then:  <a href="https://docs.qdb.qa/form.pdf" target="_blank"
              rel="noopener noreferrer"> contains text "Application Form"
  Priority: Critical
  Type: Unit

TC-117: DownloadListSection_HidesDownloadControlWhenUrlNull
  (references FR-083)
  Given: download-list item with downloadUrl=null
  When:  DownloadListSection renders
  Then:  no <a> element with target="_blank" is rendered for that item
  Priority: High
  Type: Unit

TC-118: SectionRenderer_RendersNoteCalloutWhenNoteTextPresent
  (references FR-080)
  Given: section.noteText = "Note: Originals required"
  When:  InfoCardSectionRenderer renders
  Then:  a visually distinct callout block containing
         "Note: Originals required" is present below the items
  Priority: Medium
  Type: Unit

TC-119: SectionRenderer_OmitsNoteCalloutWhenNoteTextNull
  (references FR-080)
  Given: section.noteText = null
  When:  InfoCardSectionRenderer renders
  Then:  no callout block element is present
  Priority: Low
  Type: Unit

───────────────────────────────────────────────────────────────────
5.6 BooleanControl — Toggle Mode, Radio Mode, Missing Labels
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/components/fields/BooleanField.test.tsx

TC-120: BooleanField_ToggleMode_RendersFluentUISwitchWithLabels
  (references US-18 / FR-093)
  Given: field with renderStyle='toggle', trueLabel='Yes', falseLabel='No'
  When:  BooleanField renders
  Then:  Fluent UI <Switch> is present; "Yes" label and "No" label
         are both visible in the DOM
  Priority: Critical
  Type: Unit

TC-121: BooleanField_ToggleMode_StoresBooleanTrueInRHF
  (references FR-095 / BR-020)
  Given: BooleanField in toggle mode with RHF integration
  When:  user activates the toggle (clicks from false to true)
  Then:  RHF field value is the boolean primitive true,
         not the string "true" or "Yes"
  Priority: Critical
  Type: Unit

TC-122: BooleanField_ToggleMode_StoresBooleanFalseInRHF
  (references FR-095)
  Given: BooleanField in toggle mode; current value = true
  When:  user deactivates the toggle
  Then:  RHF field value is the boolean primitive false
  Priority: Critical
  Type: Unit

TC-123: BooleanField_RadioMode_RendersRadioGroupWithBothOptions
  (references FR-094)
  Given: field with renderStyle='radio-pair', trueLabel='Agree',
         falseLabel='Disagree'
  When:  BooleanField renders
  Then:  Fluent UI <RadioGroup> is present with two <Radio> children:
         first with label "Agree", second with label "Disagree"
  Priority: Critical
  Type: Unit

TC-124: BooleanField_RadioMode_SelectingTrueOptionStoresBooleanTrue
  (references FR-095)
  Given: BooleanField in radio-pair mode
  When:  user selects the "Agree" (true) option
  Then:  RHF field value is boolean true
  Priority: Critical
  Type: Unit

TC-125: BooleanField_UntouchedField_RHFValueIsUndefined
  (references FR-096)
  Given: BooleanField with no defaultValue and no user interaction
  When:  form value is read from RHF
  Then:  field value is undefined (not null, not false, not "")
  Priority: Critical
  Type: Unit

TC-126: BooleanField_RequiredValidation_FailsWhenUndefined
  (references FR-101 / BR-020)
  Given: BooleanField with REQUIRED validation rule; value = undefined
  When:  Zod schema validates the field on submit
  Then:  validation produces an error using the configured error message
  Priority: Critical
  Type: Unit

TC-127: BooleanField_RequiredValidation_PassesWhenFalse
  (references FR-101)
  Given: BooleanField with REQUIRED validation rule; value = false
  When:  Zod schema validates the field
  Then:  no validation error (false is a valid boolean value)
  Priority: Critical
  Type: Unit

TC-128: BooleanField_MissingLabels_RendersNothingAndLogsError
  (references BR-019)
  Given: field with fieldType='boolean' but trueLabel='' AND falseLabel=''
  When:  FieldRenderer dispatches to BooleanField
  Then:  nothing is rendered in the DOM for that field;
         logger.error is called with error='boolean_field_missing_labels'
         containing fieldId and fieldKey
  Priority: Critical
  Type: Unit

TC-129: BooleanField_MissingTrueLabelOnly_RendersNothingAndLogsError
  (references BR-019)
  Given: field with fieldType='boolean'; trueLabel='Yes'; falseLabel=''
  When:  FieldRenderer attempts to render BooleanField
  Then:  nothing is rendered; error is logged
  Priority: High
  Type: Unit

TC-130: BooleanField_ReadonlyState_RendersDisabledControl
  (references FR-098)
  Given: BooleanField with value=true; rule engine emits READONLY_FIELD
  When:  BooleanField re-renders with isReadOnly=true
  Then:  the Fluent UI Switch or RadioGroup has disabled={true};
         current value (true) remains visible
  Priority: High
  Type: Unit

TC-131: BooleanField_DefaultValue_PrePopulatesOnLoad
  (references FR-092)
  Given: field with defaultValue=true and no prior user interaction
  When:  BooleanField mounts
  Then:  RHF field value initialised to boolean true at mount
  Priority: High
  Type: Unit

TC-132: BooleanField_DraftPersistence_ResumesWithBoolean
  (references FR-102)
  Given: draft JSON contains { "agreementField": true }
  When:  useDraft restores fieldValues to RHF
  Then:  BooleanField shows "true" state (toggle on or radio Agree);
         RHF value is boolean true, not string "true"
  Priority: Critical
  Type: Unit

───────────────────────────────────────────────────────────────────
5.7 SelectionGridField — Lazy Load, Single/Multi Select,
    Required on Unvisited Tab
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/components/fields/SelectionGridField.test.tsx
Test file: src/__tests__/hooks/useSelectionGridData.test.ts

TC-133: useSelectionGridData_InitialState_IsIdle
  (references phase-3-arch-addenda.md section 4.2.1)
  Given: hook initialised with a field definition
  When:  hook mounts with no tab activation signal
  Then:  status='idle'; records=[]; error=null
  Priority: High
  Type: Unit

TC-134: useSelectionGridData_TriggersLoad_OnTabActivation
  (references ADR-ADD-003 / ADD-002-C4)
  Given: hook subscribed to GridDataLoadContext
  When:  GridDataLoadContext emits tab activation for the hook's tabId
  Then:  status transitions to 'loading'; GET /api/grids/:fieldId/records
         is called with page=1 and pageSize=50
  Priority: Critical
  Type: Unit

TC-135: useSelectionGridData_TransitionsToLoaded_OnSuccess
  (references FR-118)
  Given: GET /api/grids/:fieldId/records returns GridRecordPage
         with 5 records
  When:  fetch completes
  Then:  status='loaded'; records.length=5;
         SelectionGridField renders a table with 5 rows
  Priority: Critical
  Type: Unit

TC-136: useSelectionGridData_NoRefetch_OnSubsequentTabActivation
  (references ADR-ADD-003)
  Given: data already loaded (status='loaded')
  When:  GridDataLoadContext emits tab activation again
  Then:  GET /api/grids/:fieldId/records is NOT called again;
         cached records are served from component state
  Priority: High
  Type: Unit

TC-137: useSelectionGridData_AbortsInFlight_OnUnmount
  (references ADR-ADD-003)
  Given: GET is in-flight (status='loading')
  When:  SelectionGridField unmounts
  Then:  AbortController.abort() is called; no state update occurs
         after unmount (no "cannot set state on unmounted component" warning)
  Priority: High
  Type: Unit

TC-138: useSelectionGridData_TransitionsToError_OnFailure
  (references FR-118)
  Given: GET /api/grids/:fieldId/records returns HTTP 502
  When:  fetch fails
  Then:  status='error'; error contains a user-facing message;
         SelectionGridField renders error message with "Retry" button
  Priority: High
  Type: Unit

TC-139: useSelectionGridData_Retry_ReIssuesFetch
  (references FR-118)
  Given: status='error' after a failed fetch
  When:  user clicks the Retry button
  Then:  status transitions to 'loading'; fetch is re-issued
  Priority: High
  Type: Unit

TC-140: SelectionGridField_SingleSelect_RendersRadioButtonPerRow
  (references FR-114)
  Given: field.gridConfig.selectionMode='single'; 3 loaded records
  When:  SelectionGridField renders in 'loaded' state
  Then:  each row contains a <input type="radio"> in the leftmost cell;
         no checkboxes; selecting row 2 deselects row 1
  Priority: Critical
  Type: Unit

TC-141: SelectionGridField_MultiSelect_RendersCheckboxPerRow
  (references FR-115)
  Given: field.gridConfig.selectionMode='multi'; 3 loaded records
  When:  SelectionGridField renders in 'loaded' state
  Then:  each row contains a <input type="checkbox">;
         a "select all" checkbox is in the column header;
         selecting two rows results in RHF value = Set of 2 GUIDs
  Priority: Critical
  Type: Unit

TC-142: SelectionGridField_SingleSelect_StoresOneGUIDInRHF
  (references FR-116, FR-117)
  Given: single-select grid with records; user selects row with
         id = "b1c2d3e4-..."
  When:  form value is read from RHF
  Then:  RHF field value = "b1c2d3e4-..." (single GUID string,
         not array)
  Priority: Critical
  Type: Unit

TC-143: SelectionGridField_MultiSelect_StoresGUIDArrayInRHF
  (references FR-117)
  Given: multi-select grid; user selects 3 rows
  When:  form value is read from RHF
  Then:  RHF field value = array of 3 GUID strings
  Priority: Critical
  Type: Unit

TC-144: SelectionGridField_Required_FailsValidationWhenUnvisitedTab
  (references BC-010 / FR-131)
  Given: form with Selection Grid on Tab 2; field.isRequired=true;
         user never navigates to Tab 2 (records never loaded)
  When:  Zod schema validates all fields on submit attempt
  Then:  validation error produced for the Selection Grid field;
         submission is blocked; "required" error message displayed
         when user is directed to Tab 2
  Priority: Critical
  Type: Unit

TC-145: SelectionGridField_IsCapped_ShowsInfoNotice
  (references FR-113)
  Given: response includes isCapped=true; totalCount=200
  When:  SelectionGridField renders
  Then:  informational notice is visible indicating results are capped
  Priority: High
  Type: Unit

TC-146: SelectionGridField_PaginationNext_FetchesNextPage
  (references FR-113 / Q-010 resolution)
  Given: records loaded; totalPages=3; currentPage=1
  When:  user clicks Next Page
  Then:  GET /api/grids/:fieldId/records?page=2&pageSize=50 is issued;
         displayed rows update; previously selected rows from page 1
         remain in RHF selection Set
  Priority: High
  Type: Unit

TC-147: SelectionGridField_DeletedViewReference_ShowsUserFacingError
  (references BC-004)
  Given: GET /api/grids/:fieldId/records returns 404
         (saved View no longer exists)
  When:  SelectionGridField processes the error response
  Then:  user-facing message displayed:
         "This grid's configuration is unavailable — please contact
          your administrator"
         (no unhandled 502 surfaces to user)
  Priority: Critical
  Type: Unit

───────────────────────────────────────────────────────────────────
5.8 EntryGridField — Row Add/Remove, 400-op Warning,
    Required Validation
───────────────────────────────────────────────────────────────────

Test file: src/__tests__/components/fields/EntryGridField.test.tsx
Test file: src/__tests__/hooks/useEntryGridRows.test.ts

TC-148: useEntryGridRows_InitialState_EmptyRowsArray
  (references FR-120)
  Given: hook initialised with field definition
  When:  hook mounts
  Then:  rows=[]; isAtMinRows=true (0 >= minRows=0);
         isAtMaxRows=false
  Priority: High
  Type: Unit

TC-149: useEntryGridRows_AddRow_AppendsPureClientSideRow
  (references FR-121 / NFR-020)
  Given: rows=[] initially; no network mock needed
  When:  addRow() called
  Then:  rows.length=1; new row has all columns set to undefined;
         NO HTTP request is issued; operation completes synchronously
  Priority: Critical
  Type: Unit

TC-150: useEntryGridRows_UpdateCell_UpdatesSpecificCell
  (references FR-122)
  Given: rows=[{ name: 'Alice', age: undefined }]
  When:  updateCell(0, 'age', 30) called
  Then:  rows[0].age=30; rows[0].name='Alice' unchanged
  Priority: High
  Type: Unit

TC-151: useEntryGridRows_DeleteRow_RemovesRowByIndex
  (references FR-123)
  Given: rows=[row0, row1, row2]
  When:  deleteRow(1) called
  Then:  rows=[row0, row2]; rows.length=2
  Priority: High
  Type: Unit

TC-152: useEntryGridRows_IsAtMaxRows_TrueAtLimit
  (references FR-125)
  Given: field.gridConfig.maxRows=3; rows=[row0, row1, row2]
  When:  state is read
  Then:  isAtMaxRows=true
  Priority: High
  Type: Unit

TC-153: EntryGridField_AddRowButton_DisabledAtMaxRows
  (references FR-125)
  Given: maxRows=2; 2 rows already present
  When:  EntryGridField renders
  Then:  "Add Row" button has disabled attribute or aria-disabled="true";
         visible message informs user the maximum is reached
  Priority: High
  Type: Unit

TC-154: EntryGridField_MinRowsValidation_FailsOnSubmitWhenBelowMin
  (references FR-124)
  Given: field.gridConfig.minRows=2; rows=[] (0 rows)
  When:  Zod schema validates the grid field on submit attempt
  Then:  validation error produced; submission blocked;
         configured error message displayed
  Priority: Critical
  Type: Unit

TC-155: EntryGridField_RendersCorrectCellInputByColumnType
  (references FR-121 / phase-3-arch-addenda.md section 4.3.2)
  Given: column with columnFieldType='number'
  When:  EntryGridField renders an editable row
  Then:  the cell renders <Input type="number"> for the number column;
         NOT a text input
  Priority: High
  Type: Unit

TC-156: EntryGridField_GridSchemaHash_NullHashInvalidatesRows
  (references BC-001)
  Given: resumed draft has gridSchemaHash=null for this field
  When:  useDraft restores grid state
  Then:  EntryGrid row data is discarded (rows=[]);
         notification banner displayed: "The [FieldLabel] section was
         updated since you last saved. Please re-enter your data for
         this section."
  Priority: Critical
  Type: Unit

TC-157: EntryGridField_GridSchemaHash_MismatchInvalidatesRows
  (references BC-001 / ADD-002-C1)
  Given: draft.gridSchemaHash['field-1'] = 'aabbcc...' (16 hex chars);
         live metadata columnConfigHash for 'field-1' = 'ddeeff...'
  When:  useDraft compares hashes
  Then:  row data for 'field-1' discarded; banner shown on that tab;
         other fields' draft data unaffected
  Priority: Critical
  Type: Unit

TC-158: EntryGridField_GridSchemaHash_MatchRestoresRows
  (references ADD-002-C1)
  Given: draft.gridSchemaHash['field-1'] matches live columnConfigHash
  When:  useDraft compares hashes
  Then:  rows restored from draft; no banner shown for that field
  Priority: Critical
  Type: Unit

TC-159: EntryGridField_400OpWarning_DisplaysWhenApproachingBatchCeiling
  (references BC-009)
  Given: form with 2 Entry Grid fields; grid1.maxRows=200,
         grid2.maxRows=201 (200+201+1 parent = 402 ops > 400)
  When:  admin saves this configuration on the admin screen
  Then:  admin UI warning is displayed: batch operation count exceeds
         80% of the 500-operation ceiling
  Priority: High
  Type: Unit

TC-160: EntryGridField_BatchSizeGuard_Returns400WhenExceeds500
  (references ADR-ADD-002)
  Given: rows array contains 499 rows (499+1 parent = 500 ops,
         which equals but does not exceed 500 cap)
  When:  CrmSubmissionService.buildBatchChangeset() counts operations
  Then:  the batch is allowed (500 = max allowed, not exceeded)
  Priority: High
  Type: Unit

TC-161: EntryGridField_BatchSizeGuard_Returns400WhenExceeds500Strict
  (references ADR-ADD-002)
  Given: rows array + standard children total 501 operations
  When:  CrmSubmissionService.buildBatchChangeset() counts operations
  Then:  returns 400 { error: 'submission_too_large' } before issuing
         any Dataverse call; frontend displays:
         "Too many rows. Please remove some rows before submitting."
  Priority: Critical
  Type: Unit


═══════════════════════════════════════════════════════════════════
SECTION 6 — E2E SCENARIOS (PLAYWRIGHT)
═══════════════════════════════════════════════════════════════════

Framework: Playwright v1.x
Environment: local dev (npm run dev) against Dataverse dev-proxy
             or mocked API responses via Playwright route intercept
Test data: seed records per Section 10 below
Location: e2e/addenda/

All E2E tests use a named portal user account (portal-user@qdb.qa)
pre-authenticated via MSAL mock (or real token for integration E2E).
The Loan Application form is the reference form for all E2E scenarios.

───────────────────────────────────────────────────────────────────
6.1 Info-Card Flow — Golden Path
───────────────────────────────────────────────────────────────────

TC-162: E2E_InfoCardFlow_UserSeesFirstScreenOnFormOpen
  (references US-14 / FR-048, FR-053)
  Given: Loan Application form has 3 Info-Card Screens configured;
         user is authenticated; no existing draft
  When:  user navigates to /form/loan-application
  Then:  Info-Card Screen 1 heading is visible in the page;
         no form fields (tab content) are visible;
         page title contains screen 1 heading and form name
  Priority: Critical
  Type: E2E

TC-163: E2E_InfoCardFlow_ContinueAdvancesToScreen2
  (references FR-059)
  Given: user is on Info-Card Screen 1 of 3
  When:  user clicks "Continue"
  Then:  screen 2 heading is visible; screen 1 heading is gone;
         keyboard focus is on the H1 of screen 2
  Priority: Critical
  Type: E2E

TC-164: E2E_InfoCardFlow_BackReturnsToScreen1
  (references US-15 / FR-060)
  Given: user is on Info-Card Screen 2 of 3
  When:  user clicks "Back"
  Then:  screen 1 heading is visible; "Back" button is absent or
         disabled on screen 1
  Priority: High
  Type: E2E

TC-165: E2E_InfoCardFlow_StartButtonOnLastScreenLoadsForm
  (references US-14 / FR-061)
  Given: user is on Info-Card Screen 3 of 3 (the last screen)
  When:  user clicks "Start"
  Then:  first form tab is visible and active; no Info-Card Screen
         content is visible; RHF context is initialised (field renders)
  Priority: Critical
  Type: E2E

TC-166: E2E_InfoCardFlow_AuditEventWrittenOnFirstView
  (references FR-076 / ADD-001-C1)
  Given: user has no prior view record in qdb_info_card_view_records
  When:  user navigates to the form and Info-Card Screen 1 renders
  Then:  qdb_form_audit_log contains a record with
         eventType='info_card_screen_viewed' for the current user and form;
         qdb_info_card_view_record contains one record for (userId, formId)
  Priority: Critical
  Type: E2E (integration)

TC-167: E2E_InfoCardFlow_AuditEventNotDuplicatedOnReturn
  (references FR-076)
  Given: user already has a qdb_info_card_view_record for this form
  When:  user navigates to the form again (second session)
  Then:  no new audit log entry is added; view record count stays at 1
  Priority: High
  Type: E2E (integration)

───────────────────────────────────────────────────────────────────
6.2 Info-Card Skip
───────────────────────────────────────────────────────────────────

TC-168: E2E_InfoCardSkip_ClickSkipLoadsFormImmediately
  (references US-16 / FR-064)
  Given: form with allowInfocardSkip=true; user is on screen 1 of 3
  When:  user clicks "Skip" (or "Skip Introduction")
  Then:  first form tab renders immediately; no additional Info-Card
         screens are shown; RHF context initialised
  Priority: Critical
  Type: E2E

TC-169: E2E_InfoCardSkip_ButtonAbsentWhenSkipDisabled
  (references FR-065)
  Given: form with allowInfocardSkip=false
  When:  user views any Info-Card Screen
  Then:  no element matching /skip/i is visible on screen
  Priority: High
  Type: E2E

───────────────────────────────────────────────────────────────────
6.3 Draft Resume — Info-Cards Bypassed
───────────────────────────────────────────────────────────────────

TC-170: E2E_DraftResume_DirectURL_InfoCardsSkipped
  (references ADD-001-C2 / FR-024)
  Given: existing draft for loan-application with lastSavedTabId='tab-2';
         form has 2 Info-Card Screens configured
  When:  user navigates to /form/loan-application?draftId=<guid>
  Then:  Info-Card Screens are NOT shown; form loads directly on Tab 2
         with draft values pre-populated
  Priority: Critical
  Type: E2E

TC-171: E2E_DraftResume_SessionTimeoutResume_InfoCardsSkipped
  (references ADD-001-C2)
  Given: user session expires mid-form on Tab 3; existing draft saved;
         form has Info-Card Screens
  When:  user re-authenticates and is redirected back to the form
  Then:  Info-Card Screens are NOT shown; form opens at Tab 3
  Priority: Critical
  Type: E2E

TC-172: E2E_DraftResume_SaveAndDraftResume_InfoCardsSkipped
  (references ADD-001-C2)
  Given: user has completed Info-Card Screens; is on Tab 1; clicks
         "Save & Draft"; later returns to the form
  When:  user clicks "Resume Draft" from the draft prompt
  Then:  Info-Card Screens are NOT shown; form opens at Tab 1
  Priority: Critical
  Type: E2E

───────────────────────────────────────────────────────────────────
6.4 Boolean Field — Toggle and Radio
───────────────────────────────────────────────────────────────────

TC-173: E2E_BooleanToggle_ClickTogglesState
  (references US-19 / FR-093)
  Given: form with a boolean field (toggle mode) labelled "Are you a
         Qatari national?" with trueLabel="Yes", falseLabel="No"
  When:  user clicks the toggle (initial state: unchecked/unset)
  Then:  toggle is in "on" position; "Yes" label is highlighted
  Priority: Critical
  Type: E2E

TC-174: E2E_BooleanRadio_SelectingOptionHighlightsChoice
  (references FR-094)
  Given: form with boolean field in radio-pair mode; trueLabel="Agree",
         falseLabel="Disagree"
  When:  user clicks the "Agree" radio option
  Then:  "Agree" radio is selected; "Disagree" is deselected
  Priority: High
  Type: E2E

TC-175: E2E_BooleanField_SubmittedValueIsBoolean
  (references FR-095 / BR-020)
  Given: user has selected "Yes" on a boolean toggle field and submits
  When:  submission payload is captured (network intercept)
  Then:  the field's value in the payload is the boolean true,
         not the string "Yes" or "true"
  Priority: Critical
  Type: E2E

TC-176: E2E_BooleanField_RequiredError_ShownWhenNotInteracted
  (references FR-101)
  Given: form with a required boolean field (no default); user does not
         interact with it and clicks Submit
  When:  validation runs on submit
  Then:  validation error message is visible below the boolean field;
         submission does not proceed
  Priority: Critical
  Type: E2E

───────────────────────────────────────────────────────────────────
6.5 Selection Grid — Load on Tab Activation, Select Row, Submit
───────────────────────────────────────────────────────────────────

TC-177: E2E_SelectionGrid_LoadsOnTabActivation
  (references ADR-ADD-003 / FR-118)
  Given: form with Selection Grid on Tab 2; user is on Tab 1
  When:  user clicks Tab 2
  Then:  skeleton rows appear briefly; then data table rows are visible;
         no data fetch occurred before tab activation
  Priority: Critical
  Type: E2E

TC-178: E2E_SelectionGrid_NotLoadedBeforeTabVisit
  (references ADR-ADD-003)
  Given: form opened; Selection Grid is on Tab 2
  When:  user stays on Tab 1 (never navigates to Tab 2)
  Then:  GET /api/grids/:fieldId/records was never called
         (verified via Playwright network intercept)
  Priority: High
  Type: E2E

TC-179: E2E_SelectionGrid_SingleSelectRowAndSubmit
  (references US-20 / FR-116, FR-117)
  Given: single-select Selection Grid loaded with 5 products
  When:  user clicks the radio on row 3; completes form; submits
  Then:  submission payload contains the GUID of row 3 product;
         parent CRM record is created with the product lookup populated
  Priority: Critical
  Type: E2E (integration)

TC-180: E2E_SelectionGrid_MultiSelectAndSubmit
  (references FR-115, FR-117)
  Given: multi-select Selection Grid; user checks rows 1 and 3
  When:  user submits the form
  Then:  submission payload contains an array of 2 GUIDs
  Priority: High
  Type: E2E

TC-181: E2E_SelectionGrid_RequiredError_WhenTabNeverVisited
  (references BC-010)
  Given: form with required Selection Grid on Tab 2; user never visits
         Tab 2; user clicks Submit on final tab
  When:  validation runs across all tabs
  Then:  validation error for the Selection Grid field is surfaced;
         user is directed to Tab 2; error message is visible
  Priority: Critical
  Type: E2E

───────────────────────────────────────────────────────────────────
6.6 Entry Grid — Add Rows, Submit, See $batch Result
───────────────────────────────────────────────────────────────────

TC-182: E2E_EntryGrid_AddRowPurelyClientSide
  (references FR-121 / NFR-020)
  Given: Entry Grid field rendered on a form tab
  When:  user clicks "Add Row"
  Then:  a new editable row appears in < 100 ms;
         no HTTP request was issued (network intercept confirms)
  Priority: Critical
  Type: E2E

TC-183: E2E_EntryGrid_FillRowsAndSaveDraft
  (references US-22 / FR-128)
  Given: Entry Grid with columns Name and Amount
  When:  user adds 2 rows (Alice/5000, Bob/3000); clicks "Save & Draft"
  Then:  draft record in Dataverse contains the 2 rows serialised in
         qdb_field_values_json; no child records created yet
  Priority: Critical
  Type: E2E (integration)

TC-184: E2E_EntryGrid_ResumedDraftRestoresRows
  (references FR-129)
  Given: draft saved with 2 Entry Grid rows; user resumes draft
  When:  form loads from draft
  Then:  Entry Grid shows 2 rows pre-populated with Alice/5000 and
         Bob/3000 exactly as entered
  Priority: Critical
  Type: E2E (integration)

TC-185: E2E_EntryGrid_SubmitCreatesChildRecords
  (references US-21 / FR-126, FR-127)
  Given: Entry Grid with 2 beneficiary rows; user submits the form
  When:  submission completes successfully
  Then:  parent record created; 2 qdb_beneficiary child records created
         in Dataverse, each with parentLookup = parent record GUID;
         confirmation screen shows parent record reference number
  Priority: Critical
  Type: E2E (integration)

TC-186: E2E_EntryGrid_PartialChildFailure_AllRecordsRolledBack
  (references ADD-002-C3 / FR-127 / BR-023)
  Given: Entry Grid with 3 rows; API mock causes row 2's child record
         creation to return a 400 within the $batch changeset
  When:  user submits
  Then:  no parent record exists in Dataverse; no child records exist;
         user sees error message attributing failure to row 2;
         draft is preserved
  Priority: Critical
  Type: E2E

TC-187: E2E_EntryGrid_MaxRowsReached_AddRowDisabled
  (references FR-125)
  Given: Entry Grid with maxRows=3; user has added 3 rows
  When:  user attempts to click "Add Row"
  Then:  "Add Row" button is disabled; message visible indicating
         maximum rows reached
  Priority: High
  Type: E2E

───────────────────────────────────────────────────────────────────
6.7 Tab-Aware Buttons — Save & Draft on Every Tab, Submit Only on Final
───────────────────────────────────────────────────────────────────

TC-188: E2E_TabAwareButtons_SaveDraftOnEveryTab
  (references US-23 / FR-139)
  Given: form with qdb_allow_save_draft=true and 4 active tabs
  When:  user navigates to each of the 4 tabs in sequence
  Then:  "Save & Draft" button is visible and enabled on every tab
  Priority: Critical
  Type: E2E

TC-189: E2E_TabAwareButtons_SubmitOnFinalTabOnly
  (references US-24 / FR-142, FR-143, BR-027)
  Given: form with 4 tabs; final tab = highest displayOrder
  When:  user visits tabs 1, 2, and 3
  Then:  "Submit" button is NOT present in the DOM on tabs 1, 2, 3
         (not just hidden — absent from DOM)
  Priority: Critical
  Type: E2E

TC-190: E2E_TabAwareButtons_SubmitVisibleOnFinalTab
  (references FR-142 / BR-027)
  Given: same form; user navigates to tab 4 (final tab)
  When:  Tab 4 renders
  Then:  "Submit" button is visible and operable
  Priority: Critical
  Type: E2E

TC-191: E2E_TabAwareButtons_SaveDraftSavesWithoutNavigation
  (references FR-145)
  Given: user is on Tab 2; has entered data in Tab 2 fields;
         Tab 1 has a required field that is empty
  When:  user clicks "Save & Draft" on Tab 2
  Then:  draft is saved successfully; user remains on Tab 2;
         no validation error about Tab 1's required field is shown;
         inline success confirmation is displayed
  Priority: Critical
  Type: E2E

TC-192: E2E_TabAwareButtons_NoSaveDraftWhenFlagFalse
  (references FR-140)
  Given: form with qdb_allow_save_draft=false
  When:  user visits any tab
  Then:  no "Save & Draft" button is present on any tab
  Priority: High
  Type: E2E

TC-193: E2E_TabAwareButtons_FinalTabRecomputedAfterTabReorder
  (references US-25 / FR-144, BR-025)
  Given: form with 4 tabs; current final = tab with displayOrder=40;
         admin changes tab displayOrder=40 to 15
         (making displayOrder=30 the new final); user reloads the form
  When:  form loads with updated metadata
  Then:  "Submit" button appears on the tab with displayOrder=30;
         "Submit" absent from the tab now at displayOrder=15
  Priority: High
  Type: E2E


═══════════════════════════════════════════════════════════════════
SECTION 7 — CEO CONDITION VERIFICATION MATRIX
═══════════════════════════════════════════════════════════════════

The following table maps every named build condition (BC-001 through
BC-011) from the Phase 7 Architecture Review (CEO sign-off 2026-06-06)
to the test case that verifies it. Every condition must have a passing
test before QA sign-off is granted for its associated feature.

Legend: PRE-QA = must pass before any QA sign-off.
        PRE-ENTRY-GRID-QA = must pass before Entry Grid QA sign-off.
        PRE-ADD-001-QA = must pass before Info-Card Screen QA sign-off.

┌──────────┬──────────────────────────────────────────────────────┬──────────────────┬────────────────────────┬─────────────────────────────────────────────────────────────────────┐
│ Condition│ Description                                          │ Test Type        │ Test Name              │ Pass Criteria                                                       │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-001   │ Null qdb_grid_schema_hash on resumed draft must       │ Unit             │ TC-156                 │ Entry Grid rows are discarded; notification banner rendered;         │
│ (PRE-QA) │ unconditionally invalidate all Entry Grid fields;     │                 │ TC-157                 │ "null hash = valid" never executes in useDraft; verified by          │
│          │ "null hash = valid" is not acceptable                 │                 │                        │ inspecting useDraft source and test assertion on banner text          │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-002   │ Dataverse $batch changeset submission path must be    │ Unit + E2E       │ TC-185                 │ CrmSubmissionService.submitForm() uses $batch for ALL parent+child   │
│ (PRE-QA) │ adopted universally — not only for Entry Grid; the   │ (integration)    │ TC-186                 │ submissions; compensating DELETE code path removed; code review       │
│          │ original sequential compensating-DELETE path removed  │                 │ Code review gate       │ must confirm removal before QA sign-off                              │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-003   │ parseBatchResponse() unit-tested against 3 captured   │ Unit             │ TC-194                 │ All three Dataverse response fixture cases pass; fixtures must be    │
│ (PRE-    │ Dataverse batch response fixtures: all-success,       │                 │ TC-195                 │ captured from org5869857f (or Qatar North replacement), not          │
│ ENTRY-   │ partial failure (error in part body), partial failure │                 │ TC-196                 │ synthesised from OData spec alone                                    │
│ GRID-QA) │ (top-level error)                                     │                 │                        │                                                                     │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-004   │ Selection Grid backend must return user-facing error  │ Unit + E2E       │ TC-147                 │ When saved View returns 404: user sees configured error message;     │
│ (PRE-QA) │ when saved View returns 404; must log missing View   │                 │ TC-197                 │ backend logs include the missing View GUID and fieldId;              │
│          │ GUID; must not surface as unhandled 502               │                 │                        │ no unhandled exception reaches the portal user                       │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-005   │ qdb_field_values_json must be a Dataverse Memo column │ Schema           │ TC-198                 │ Solution manifest XML confirms attribute type = Memo (nvarchar max)  │
│ (SCHEMA- │ (nvarchar max), not a bounded String; this is a hard  │ inspection       │                        │ before deployment to any environment; QA inspects manifest file      │
│ CREATION │ schema creation requirement                           │                 │                        │ as part of deployment gate                                           │
│ -GATE)   │                                                       │                 │                        │                                                                     │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-006   │ DataverseClient must handle error code 0x80060892    │ Unit             │ TC-199                 │ When POST to qdb_info_card_view_records returns 0x80060892:         │
│ (PRE-QA) │ (alternate key uniqueness) on info-card view POST    │                 │                        │ DataverseClient treats it as success (not retry); no exception       │
│          │ as non-fatal success; must not retry                  │                 │                        │ thrown; view record creation is idempotent                           │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-007   │ Written confirmation from QDB Compliance that         │ Process gate     │ TC-200                 │ A signed written confirmation from QDB Compliance is filed in        │
│ (PRE-    │ info_card_screen_viewed is a UX analytics event,     │ (doc review)     │                        │ the project folder before Phase 4 for ADD-001 begins; QA verifies   │
│ ADD-001- │ not a QCB regulatory record subject to QCB audit     │                 │                        │ the document exists at QA entry gate; if classified as regulatory,   │
│ QA)      │ requirements                                          │                 │                        │ architecture must be revised before build starts                     │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-008   │ finalTabId recomputation in DynamicFormRenderer must  │ Unit             │ TC-084                 │ TC-084 confirms debounce >= 300ms; TC-085 confirms field-level       │
│ (PRE-QA) │ be debounced >= 300ms; triggered only by tab-level   │                 │ TC-085                 │ changes do not trigger recomputation; Submit button does not          │
│          │ visibility changes, not field-level changes           │                 │                        │ flicker in E2E test TC-190 when rules toggle field visibility        │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-009   │ Admin screen must warn when Entry Grid maxRows        │ Unit             │ TC-159                 │ Admin screen warning is visible when sum of all Entry Grid           │
│ (PRE-QA) │ product across all grid fields exceeds 400 ops        │                 │                        │ maxRows on the form exceeds 400 (80% of 500 ceiling); warning        │
│          │ (80% of 500 ceiling); warning at save time            │                 │                        │ shown at config save time, not only at runtime submission            │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-010   │ Zod schema for interactive-grid must fail validation  │ Unit + E2E       │ TC-144                 │ TC-144 confirms unit-level Zod validation fails for empty           │
│ (PRE-    │ when field is required and selection is empty or      │                 │ TC-181                 │ required grid; TC-181 confirms E2E submission is blocked when        │
│ ENTRY-   │ undefined — even when records were never loaded        │                 │                        │ tab was never visited; records do not need to be loaded for          │
│ GRID-QA) │                                                       │                 │                        │ validation to fire                                                   │
├──────────┼──────────────────────────────────────────────────────┼──────────────────┼────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ BC-011   │ Admin screen must enforce only System Views           │ Unit + E2E       │ TC-201                 │ Admin screen does not offer User Views in qdb_grid_saved_view_id    │
│ (PRE-QA) │ (savedquery entity) for qdb_grid_saved_view_id;      │                 │ TC-202                 │ picker; backend rejects a form definition referencing a userquery   │
│          │ backend must reject userquery GUIDs at metadata       │                 │                        │ GUID with a configuration error before serving it to the portal      │
│          │ assembly time                                          │                 │                        │                                                                     │
└──────────┴──────────────────────────────────────────────────────┴──────────────────┴────────────────────────┴─────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════
SECTION 8 — REGRESSION TESTS (TWO FIXED BUGS + ADJACENT CASES)
═══════════════════════════════════════════════════════════════════

Background: Two bugs were identified and fixed during Phase 4 build
before this QA plan was authored. These regression tests prevent
reintroduction and validate the adjacent cases most likely to regress.

───────────────────────────────────────────────────────────────────
Bug 1 — Phase Init Race Condition
───────────────────────────────────────────────────────────────────
Description: The navigation state machine initialised the phase
before the metadata fetch resolved. This caused a brief 'form' phase
to render (triggering RHF and rule engine initialisation) before
switching to 'info-cards' when metadata arrived. Symptom: first
Info-Card Screen flash replaced by a blank or partially initialised
form tab before the Info-Card rendered correctly.

Root cause: phase = 'form' was the hardcoded initial state; the
useEffect that checks infoCards.length fired after the first render.

TC-203: PhaseMachine_Regression_NoFormFlashBeforeInfoCards
  (references Bug 1 fix)
  Given: metadata fetch returns 3 Info-Card Screens; response delayed
         100ms via test intercept
  When:  DynamicFormRenderer renders
  Then:  phase NEVER transitions through 'form' before settling on
         'info-cards'; no TabRenderer or RHF Provider mounted during
         the loading interval; first stable render shows InfoCardFlow
  Priority: Critical
  Type: Unit

TC-204: PhaseMachine_Regression_FormRendersCorrectly_AfterMetadataDelay
  (references Bug 1 fix adjacent case — no info-cards)
  Given: metadata fetch returns 0 Info-Card Screens; response delayed
         100ms
  When:  DynamicFormRenderer renders
  Then:  phase initialises as 'form' after metadata resolves; RHF
         Provider mounts exactly once; no double-mount detected
  Priority: High
  Type: Unit

TC-205: PhaseMachine_Regression_DraftResume_NeverEntersInfoCardsPhase
  (references Bug 1 fix adjacent case — draft resume)
  Given: metadata includes Info-Card Screens; isDraftResume=true;
         metadata fetch delayed 100ms
  When:  DynamicFormRenderer renders
  Then:  phase is NEVER 'info-cards' at any point; form renders
         directly at draft's lastSavedTabId after metadata resolves
  Priority: Critical
  Type: Unit

───────────────────────────────────────────────────────────────────
Bug 2 — Section Type Picklist Off-by-One
───────────────────────────────────────────────────────────────────
Description: The qdb_section_type picklist values for Info-Card
Sections were mapped with an off-by-one index:
  numbered-steps = 1, icon-list = 2, download-list = 3
The renderer was reading raw integer values and mapping them as:
  1 → icon-list, 2 → download-list, 3 → numbered-steps
This caused all section types to render the wrong component.

Root cause: Dataverse picklist integer values were 1-indexed but the
renderer switch-case used 0-indexed mapping from a stale version of
the data model documentation.

TC-206: SectionRenderer_Regression_NumberedSteps_MapsToCorrectComponent
  (references Bug 2 fix / FR-079)
  Given: section with raw picklist integer value = 1
         (which maps to 'numbered-steps')
  When:  InfoCardSectionRenderer processes the section
  Then:  NumberedStepsSection component is rendered, NOT IconListSection
         or DownloadListSection
  Priority: Critical
  Type: Unit

TC-207: SectionRenderer_Regression_IconList_MapsToCorrectComponent
  (references Bug 2 fix / FR-079)
  Given: section with raw picklist integer value = 2
         (which maps to 'icon-list')
  When:  InfoCardSectionRenderer processes the section
  Then:  IconListSection is rendered, NOT NumberedStepsSection
  Priority: Critical
  Type: Unit

TC-208: SectionRenderer_Regression_DownloadList_MapsToCorrectComponent
  (references Bug 2 fix / FR-079)
  Given: section with raw picklist integer value = 3
         (which maps to 'download-list')
  When:  InfoCardSectionRenderer processes the section
  Then:  DownloadListSection is rendered with a download anchor;
         NOT NumberedStepsSection or IconListSection
  Priority: Critical
  Type: Unit

TC-209: SectionRenderer_Regression_UnknownPicklistValue_FallsBackGracefully
  (references Bug 2 adjacent case)
  Given: section with raw picklist integer value = 99 (unknown)
  When:  InfoCardSectionRenderer processes the section
  Then:  no component crashes; a fallback "unsupported section type"
         placeholder is rendered; logger.error is called with
         { sectionId, sectionType: 99 }
  Priority: High
  Type: Unit

TC-210: SectionRenderer_Regression_AllThreeTypes_OnSameScreen
  (references Bug 2 adjacent case — all types coexisting)
  Given: one Info-Card Screen with three sections:
         section 1 = numbered-steps (value=1),
         section 2 = icon-list (value=2),
         section 3 = download-list (value=3)
  When:  InfoCardScreen renders
  Then:  each section renders its correct component; the three
         components appear in display order; no type is substituted
         for another
  Priority: Critical
  Type: Unit


═══════════════════════════════════════════════════════════════════
SECTION 9 — PERFORMANCE BENCHMARKS
═══════════════════════════════════════════════════════════════════

Tool: k6 (load testing) for API throughput and latency benchmarks.
Tool: Playwright performance.timing API for browser-side benchmarks.
Tool: Vitest bench() for pure client-side computation benchmarks.

All benchmarks measured against the development Dataverse environment
(or its Qatar North replacement per GATE-B). Benchmarks failing in
development are blocking before QA sign-off on the affected feature.

───────────────────────────────────────────────────────────────────
Benchmark 1 — Metadata Cache TTL and API Latency (NFR-001 extension)
───────────────────────────────────────────────────────────────────

┌────────────────────────────────────────────────┬──────────────┬──────────────────┬────────────────────────────────────┐
│ Scenario                                       │ Target P95   │ Target           │ Tool                               │
│                                                │             │ Throughput       │                                    │
├────────────────────────────────────────────────┼──────────────┼──────────────────┼────────────────────────────────────┤
│ GET /metadata — form with 3 Info-Card Screens  │ 500ms        │ 100 req/s        │ k6 with ramp from 10 to 100 VUs    │
│ (cache hit, LRU hit rate >= 95% under steady   │             │                  │ over 5 minutes                     │
│ load) — confirms Info-Card payload does not    │             │                  │                                    │
│ breach NFR-001                                 │             │                  │                                    │
├────────────────────────────────────────────────┼──────────────┼──────────────────┼────────────────────────────────────┤
│ GET /metadata — form with 2 grid fields        │ 500ms        │ 100 req/s        │ k6                                 │
│ (LRU cache hit, grid column config included)   │             │                  │                                    │
├────────────────────────────────────────────────┼──────────────┼──────────────────┼────────────────────────────────────┤
│ GET /metadata — cache miss (first request per  │ 2,000ms      │ 10 req/s         │ k6 (cold start scenario)           │
│ form, full Dataverse fetch including info-card │             │                  │                                    │
│ screens + grid column configs)                 │             │                  │                                    │
├────────────────────────────────────────────────┼──────────────┼──────────────────┼────────────────────────────────────┤
│ Metadata LRU cache TTL correctness: after      │ n/a          │ n/a              │ Vitest integration test            │
│ TTL expires (300s default), next request       │             │                  │ (TC-203 variant)                   │
│ triggers a fresh Dataverse fetch within 3      │             │                  │                                    │
│ seconds of expiry                              │             │                  │                                    │
└────────────────────────────────────────────────┴──────────────┴──────────────────┴────────────────────────────────────┘

───────────────────────────────────────────────────────────────────
Benchmark 2 — Selection Grid Pagination and Load Time (NFR-019)
───────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────┬──────────────┬──────────────────┬───────────────────────────────────────┐
│ Scenario                                             │ Target P95   │ Target           │ Tool                                  │
│                                                      │             │ Throughput       │                                       │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ GET /api/grids/:fieldId/records?page=1&pageSize=50   │ 1,500ms tab  │ 100 req/s        │ k6 — measure from tab activation     │
│ — first page, tab activation to interactive           │ activation  │                  │ (simulated onTabActivated) to first   │
│ (tab activation → API → render)                      │ to interact. │                  │ row visible in DOM (Playwright        │
│                                                      │             │                  │ performance.timing)                   │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ GET /api/grids/:fieldId/records?page=2&pageSize=50   │ 800ms        │ 100 req/s        │ k6 (subsequent page — cache warm)     │
│ — pagination next page                               │             │                  │                                       │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Selection Grid: page size boundary — pageSize=100    │ 2,000ms      │ 50 req/s         │ k6 (max allowed pageSize)             │
│ (max allowed per API contract)                       │             │                  │                                       │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Selection Grid: pageSize=101 (above max)             │ n/a          │ n/a              │ API contract test (Supertest) —       │
│ must return 400 Bad Request                          │             │                  │ verifies boundary enforcement         │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Selection Grid: qdb_grid_max_rows=200, view          │ 1,500ms      │ 100 req/s        │ k6 — confirm isCapped=true in         │
│ returns 300 records — capping applied server-side    │             │                  │ response; totalCount capped at 200     │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Selection Grid: 100 concurrent users activating      │ 1,500ms      │ 100 VUs          │ k6 — ramp to 100 VUs; measure        │
│ same tab simultaneously (burst load)                 │             │                  │ P95 under sustained burst; confirm    │
│                                                      │             │                  │ circuit breaker does not trip         │
└──────────────────────────────────────────────────────┴──────────────┴──────────────────┴───────────────────────────────────────┘

───────────────────────────────────────────────────────────────────
Benchmark 3 — $batch 500-Operation Cap and Submission Throughput
───────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────┬──────────────┬──────────────────┬───────────────────────────────────────┐
│ Scenario                                             │ Target P95   │ Target           │ Tool                                  │
│                                                      │             │ Throughput       │                                       │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ POST /submit — 1 parent + 0 entry grid rows          │ 3,000ms      │ 20 req/s         │ k6 — baseline submission with         │
│ (baseline $batch changeset)                          │             │                  │ no entry grid rows                    │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ POST /submit — 1 parent + 10 entry grid rows         │ 4,000ms      │ 15 req/s         │ k6                                    │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ POST /submit — 1 parent + 50 entry grid rows         │ 8,000ms      │ 5 req/s          │ k6 — confirms large grid still        │
│ (one batch, well within 500 op cap)                  │             │                  │ completes atomically                  │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ POST /submit — 500 ops exactly (at cap)              │ n/a (must    │ n/a              │ Supertest — confirms allowed          │
│                                                      │ succeed)    │                  │                                       │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ POST /submit — 501 ops (one over cap)                │ n/a (must    │ n/a              │ Supertest — confirms 400 returned     │
│                                                      │ return 400) │                  │ with error: 'submission_too_large'    │
│                                                      │             │                  │ before any Dataverse call             │
└──────────────────────────────────────────────────────┴──────────────┴──────────────────┴───────────────────────────────────────┘

───────────────────────────────────────────────────────────────────
Benchmark 4 — Info-Card Section Load Time (NFR-015)
───────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────┬──────────────┬──────────────────┬───────────────────────────────────────┐
│ Scenario                                             │ Target P95   │ Target           │ Tool                                  │
│                                                      │             │ Throughput       │                                       │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Info-Card Continue/Back transition                   │ 50ms         │ n/a              │ Vitest bench() — pure in-memory       │
│ (pure client-side state change, no network call)     │             │                  │ state transition; confirms NFR-015    │
│                                                      │             │                  │ target of 500ms has > 90% headroom    │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ GET /api/forms/:formCode/infocard-view-status        │ 100ms        │ 200 req/s        │ k6 — single Dataverse lookup by       │
│ (single indexed alternate key lookup)                │             │                  │ alternate key; confirms NFR target    │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Full Info-Card flow: form open → all 3 screens       │ 3,000ms TTI  │ n/a              │ Playwright performance.timing         │
│ navigated → Start → first form tab interactive       │             │                  │ (end-to-end, real network)            │
│ (confirms NFR-001 and NFR-015 together)              │             │                  │                                       │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Entry Grid: add row (purely client-side)             │ 100ms        │ n/a              │ Playwright — from click to new row    │
│                                                      │             │                  │ visible (NFR-020)                     │
├──────────────────────────────────────────────────────┼──────────────┼──────────────────┼───────────────────────────────────────┤
│ Entry Grid: 50 rows rendered simultaneously          │ No frame     │ n/a              │ Playwright — measure frame rate;      │
│ (NFR-022: frame rate >= 30fps; input latency         │ drops below  │                  │ type in last row cell; measure        │
│ <= 100ms when 50 rows present)                       │ 30fps        │                  │ input event to value update latency   │
└──────────────────────────────────────────────────────┴──────────────┴──────────────────┴───────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════
SECTION 10 — TEST DATA REQUIREMENTS
═══════════════════════════════════════════════════════════════════

All seed records must be created in the dev Dataverse environment
before test execution begins. They are prerequisite for E2E and
integration tests. Unit tests use in-process fixtures (TypeScript
objects); no Dataverse records needed for unit test execution.

The data setup script is located at:
  backend/scripts/seed-qa-addenda.ts
Run with: npx ts-node backend/scripts/seed-qa-addenda.ts

───────────────────────────────────────────────────────────────────
10.1 Info-Card Screen Test Data
───────────────────────────────────────────────────────────────────

Needed for: TC-162 through TC-172, TC-203 through TC-210

Form Definition Record (loan-application):
  qdb_allow_infocard_skip = true
  qdb_infocard_counts_in_progress = false

Info-Card Screens (3 active records, 1 inactive):
  Screen 1: displayOrder=10; heading="What is this form?";
            subHeading="A guide to the Loan Application";
            iconUrl="https://cdn.qdb.qa/icons/loan.png";
            iconAltText="Loan icon"; statecode=Active
  Screen 2: displayOrder=20; heading="Documents you need";
            subHeading=null; statecode=Active
  Screen 3: displayOrder=30; heading="Eligibility criteria";
            subHeading="Please read before starting"; statecode=Active
  Screen 4: displayOrder=40; heading="Old screen (inactive)";
            statecode=Inactive

Info-Card Sections (one per active screen):
  Section A (on Screen 1): sectionType=numbered-steps; displayOrder=10;
    sectionTitle="Steps"; noteText="These take 10 minutes";
    3 items with titles ["Register", "Complete", "Submit"]
  Section B (on Screen 2): sectionType=download-list; displayOrder=10;
    sectionTitle="Downloads";
    2 items: item1 { downloadUrl="https://qdb.qa/doc1.pdf",
    title="Income Statement" };
    item2 { downloadUrl=null, title="Optional Guide" }
  Section C (on Screen 3): sectionType=icon-list; displayOrder=10;
    sectionTitle="Criteria"; noteText=null;
    2 items: item1 { iconReference="CheckmarkRegular",
    title="Age >= 21" }; item2 { title="Qatari national or resident" }

Alternate-form with skip disabled:
  Form Definition: loan-application-no-skip
  qdb_allow_infocard_skip = false
  2 Info-Card Screens (same structure as above, different form)

Prior view record (for TC-167):
  qdb_info_card_view_record: userId=portal-user-oid,
  formDefinitionId=loan-application-id

───────────────────────────────────────────────────────────────────
10.2 Boolean Field Test Data
───────────────────────────────────────────────────────────────────

Needed for: TC-173 through TC-176, TC-132

qdb_form_field record on loan-application Tab 3 (Declaration):
  fieldKey="is_qatari_national"; fieldType=boolean;
  displayLabel="Are you a Qatari national?";
  qdb_true_label="Yes"; qdb_false_label="No";
  qdb_bool_render_style=toggle(1); defaultValue=null

qdb_form_field record on loan-application Tab 3:
  fieldKey="terms_agreed"; fieldType=boolean;
  displayLabel="Do you agree to the terms?";
  qdb_true_label="Agree"; qdb_false_label="Disagree";
  qdb_bool_render_style=radio-pair(2); defaultValue=null

Validation rule record:
  fieldId=terms_agreed; ruleType=REQUIRED;
  errorMessage="You must agree to the terms to proceed"

Misconfigured field (for TC-128/TC-129 — unit test only, not in Dataverse):
  TypeScript fixture: { fieldType: 'boolean', trueLabel: '', falseLabel: '' }

───────────────────────────────────────────────────────────────────
10.3 Selection Grid Test Data
───────────────────────────────────────────────────────────────────

Needed for: TC-133 through TC-147, TC-177 through TC-181

qdb_form_field record on loan-application Tab 2 (Facility Details):
  fieldKey="selected_product"; fieldType=interactive-grid;
  gridMode=selection(1); gridTargetEntity="qdb_product";
  gridSavedViewId=<GUID of "Active Products" System View>;
  gridSelectionMode=single(1); gridMaxRows=200

qdb_grid_column_config records (2 columns for selected_product):
  col1: displayOrder=10; columnHeader="Product Name";
        targetAttribute="qdb_name"; isEditable=false
  col2: displayOrder=20; columnHeader="Product Code";
        targetAttribute="qdb_product_code"; isEditable=false

qdb_product seed records (10 active records):
  product1 through product10 — all statecode=Active;
  varying qdb_name and qdb_product_code values

Multi-select grid field on loan-application Tab 2:
  fieldKey="selected_branches"; gridSelectionMode=multi(2);
  gridTargetEntity="qdb_branch"; gridSavedViewId=<"Active Branches" view>

qdb_branch seed records (5 active records)

Validation rule for selected_product: REQUIRED;
  errorMessage="Please select a product to continue"

System View "Active Products" (savedquery record):
  Must be a savedquery (System View), NOT a userquery
  Points to qdb_product; filter: statecode eq 0

Broken view reference field (for TC-147 / BC-004):
  qdb_form_field record: gridSavedViewId=<GUID that does not exist>
  Used only in targeted API test (not in standard form flow)

───────────────────────────────────────────────────────────────────
10.4 Entry Grid Test Data
───────────────────────────────────────────────────────────────────

Needed for: TC-148 through TC-161, TC-182 through TC-187

qdb_form_field record on loan-application Tab 4 (Beneficiaries):
  fieldKey="beneficiaries"; fieldType=interactive-grid;
  gridMode=entry(2); gridTargetEntity="qdb_beneficiary";
  gridRelationshipAttribute="qdb_loan_application_id";
  gridMinRows=1; gridMaxRows=5

qdb_grid_column_config records (2 columns for beneficiaries):
  col1: displayOrder=10; columnHeader="Full Name";
        targetAttribute="qdb_full_name"; columnFieldType=text;
        isEditable=true
  col2: displayOrder=20; columnHeader="Relationship";
        targetAttribute="qdb_relationship"; columnFieldType=dropdown;
        isEditable=true

qdb_form_option_value records for Relationship dropdown:
  opt1: displayLabel="Spouse"; value="spouse"
  opt2: displayLabel="Child"; value="child"
  opt3: displayLabel="Parent"; value="parent"

Draft record (for TC-183/TC-184 — draft with grid rows):
  formCode="loan-application"; userId=portal-user-oid;
  fieldValues JSON includes:
    "beneficiaries": [
      { "qdb_full_name": "Alice", "qdb_relationship": "spouse" },
      { "qdb_full_name": "Bob", "qdb_relationship": "child" }
    ]
  gridSchemaHash: { "beneficiaries": "<current-hash>" }
  status=active

Draft record with null hash (for TC-156 — BC-001 test):
  Same as above but gridSchemaHash=null

Draft record with stale hash (for TC-157 — BC-001 test):
  gridSchemaHash: { "beneficiaries": "aabbccdd11223344" }
  (this hash does not match the current live column config hash)

Entry Grid with large row count (for TC-159 / BC-009):
  Two Entry Grid fields on the same form:
    grid1: gridMaxRows=200 (200 rows)
    grid2: gridMaxRows=201 (201 rows)
  Total ops = 200 + 201 + 1 parent = 402 > 400 threshold

───────────────────────────────────────────────────────────────────
10.5 Tab-Aware Button Test Data
───────────────────────────────────────────────────────────────────

Needed for: TC-188 through TC-193

qdb_form_definition record: loan-application
  qdb_allow_save_draft = true

Tab records (4 active tabs):
  tab1: displayOrder=10; isActive=true; label="Customer Information"
  tab2: displayOrder=20; isActive=true; label="Facility Details"
  tab3: displayOrder=30; isActive=true; label="Documents"
  tab4: displayOrder=40; isActive=true; label="Declaration"
  (finalTabId = tab4 per BR-025)

qdb_button_design records:
  record1: buttonType=save_draft; label="Save & Draft";
           style=secondary
  record2: buttonType=submit; label="Submit Application";
           style=primary

Form with no button design records (for TC-191 fallback test):
  Form Definition: loan-application-no-button-design
  qdb_allow_save_draft=true; no qdb_button_design records
  Expected: fallback labels "Save & Draft" and "Submit" used

Form with save draft disabled (for TC-192):
  Form Definition: loan-application-no-draft
  qdb_allow_save_draft=false

Reordering scenario (for TC-193):
  After initial setup, script updates tab3.displayOrder = 50
  (making tab3 the new final tab with displayOrder=50 > tab4's 40)

───────────────────────────────────────────────────────────────────
10.6 Regression Test Data
───────────────────────────────────────────────────────────────────

Needed for: TC-203 through TC-210

All regression tests use in-process TypeScript fixtures for unit
tests. No additional Dataverse records required beyond those already
defined in sections 10.1 through 10.5 above.

Additional in-process fixture for TC-209:
  InfoCardSection with sectionType = 99 (unrecognised integer)
  Must not be in Dataverse — used only in unit test

───────────────────────────────────────────────────────────────────
10.7 Test Accounts Required
───────────────────────────────────────────────────────────────────

| Account                    | Role              | Purpose                                      |
|----------------------------|-------------------|----------------------------------------------|
| portal-user@qdb.qa         | Portal User       | All E2E and integration tests                |
| portal-user-2@qdb.qa       | Portal User       | Draft conflict tests (TC-172 concurrent)     |
| admin-user@qdb.qa          | CRM Config Team   | Admin screen tests (TC-159 / BC-009)         |
| testunauth@qdb.qa          | No form access    | Security / RBAC tests (carries over from     |
|                            |                   | original phase-5-qa.md TC-061)               |

───────────────────────────────────────────────────────────────────
10.8 Environment-Level Prerequisites
───────────────────────────────────────────────────────────────────

Before any E2E test run:

  1. All seed records from sections 10.1–10.5 created and active.
  2. "Active Products" and "Active Branches" System Views published
     in Dataverse (not User Views — BC-011).
  3. qdb_field_values_json column confirmed as Memo type in the
     solution manifest (BC-005 schema gate).
  4. BC-007 written confirmation from QDB Compliance filed in
     projects/dynamic-form-engine/ before ADD-001 E2E tests run.
  5. Backend API running and accessible; MSAL token available for
     portal-user@qdb.qa.
  6. Network intercept baseline: Playwright route intercepts
     configured for /api/grids/ to capture call counts for
     TC-178 (zero-load assertion on unvisited tab).

═══════════════════════════════════════════════════════════════════
TEST CASE SUMMARY
═══════════════════════════════════════════════════════════════════

Numbering continues from phase-5-qa.md (TC-001 through TC-075).

  TC-076 to TC-161:  Frontend Unit Tests (86 test cases)
  TC-162 to TC-202:  E2E Scenarios — Playwright (41 test cases)
    Note: TC-194 through TC-202 are named in Section 7 CEO matrix
    as test references; full Given/When/Then details are:

    TC-194: parseBatchResponse_AllSuccessFixture_ReturnsAllContentIds
      Given: captured all-success $batch response from Dataverse org
      When: parseBatchResponse(body) called
      Then: returns array with all Content-ID results marked success
      Priority: Critical | Type: Unit

    TC-195: parseBatchResponse_PartialFailureInPartBody_IdentifiesFailingId
      Given: captured partial-failure response (error in part body)
      When: parseBatchResponse(body) called
      Then: failing Content-ID identified; error code and message extracted
      Priority: Critical | Type: Unit

    TC-196: parseBatchResponse_PartialFailureTopLevelError_HandledGracefully
      Given: captured top-level error response from Dataverse batch
      When: parseBatchResponse(body) called
      Then: returns appropriate error result; does not throw; caller
            receives structured failure info
      Priority: Critical | Type: Unit

    TC-197: SelectionGridController_MissingView_LogsMissingGUIDAndFieldId
      Given: GET /api/grids/:fieldId/records; saved View returns 404
      When: CrmGridDataService attempts to resolve the View
      Then: logger.error called with { missingViewGuid, fieldId };
            response to frontend is user-facing error string
      Priority: Critical | Type: Unit

    TC-198: SolutionManifest_FieldValuesJson_IsMemoColuMNType
      Given: solution package manifest XML
      When: attribute definition for qdb_field_values_json is inspected
      Then: type attribute = "Memo" (nvarchar max); NOT "String" (bounded)
      Priority: Critical | Type: Schema inspection

    TC-199: DataverseClient_AlternateKeyViolation_TreatedAsSuccess
      Given: DataverseClient.post() call returns Dataverse error 0x80060892
      When: error handler in DataverseClient processes the response
      Then: no exception is thrown; method returns as-if successful;
            error is NOT enqueued for retry
      Priority: Critical | Type: Unit

    TC-200: ProcessGate_BC007_QDBComplianceConfirmationFiled
      Given: projects/dynamic-form-engine/ directory
      When: QA enters Phase 4 ADD-001 gate check
      Then: a document file confirming QDB Compliance's classification
            of info_card_screen_viewed as UX analytics (not regulatory)
            exists in the project folder; QA engineer signs off
      Priority: Critical | Type: Process gate (manual)

    TC-201: AdminScreen_ViewPicker_ShowsOnlySystemViews
      Given: admin screen for configuring qdb_grid_saved_view_id
      When: admin opens the View selection dropdown
      Then: only savedquery (System View) records are shown;
            userquery records do not appear in the list
      Priority: Critical | Type: E2E (admin flow)

    TC-202: CrmMetadataService_UserQueryReference_RejectsWithConfigError
      Given: qdb_form_field.qdb_grid_saved_view_id references a GUID
             that belongs to a userquery record
      When: CrmMetadataService.assembleFormDefinition() processes the field
      Then: the form definition is rejected before being served to the portal;
            response includes { error: 'invalid_view_type', viewType: 'userquery' }
      Priority: Critical | Type: Unit

  TC-203 to TC-210:  Regression Tests (8 test cases)

TOTAL NEW TEST CASES IN THIS DOCUMENT: 135
TOTAL INCLUDING PARENT DOCUMENT: 210

Automation target: 100% of TC-076 through TC-202 automated (Vitest
or Playwright). TC-200 (process gate) is manual. TC-203 through
TC-210 are automated and added to the existing regression suite
that runs on every PR via GitHub Actions.

═══════════════════════════════════════════════════════════════════
DEFINITION OF DONE — ADDENDA FEATURES
═══════════════════════════════════════════════════════════════════

A feature is not QA-complete until every item below passes.

DFE-ADD-001 (Info-Card Screens) — Entry Gate Checklist:
  [ ] BC-007 process gate cleared (QDB Compliance confirmation filed)
  [ ] TC-086 through TC-119 pass (unit tests)
  [ ] TC-162 through TC-172 pass (E2E golden path + edge cases)
  [ ] TC-166, TC-167 pass against real Dataverse (integration)
  [ ] TC-199 passes (alternate key idempotency — BC-006)
  [ ] TC-203 through TC-210 pass (regression, both bugs)
  [ ] NFR-015 benchmark passes (< 50ms transition, Vitest bench)
  [ ] Playwright accessibility check: all Info-Card controls
      tab-focusable; H1 receives focus on screen transition

DFE-ADD-002 Boolean + Tab-Aware Buttons — Entry Gate Checklist:
  [ ] TC-120 through TC-132 pass (BooleanField unit tests)
  [ ] TC-173 through TC-176 pass (E2E boolean)
  [ ] TC-188 through TC-193 pass (E2E tab-aware buttons)
  [ ] TC-084, TC-085 pass (debounce — BC-008)

DFE-ADD-002 Selection Grid — Entry Gate Checklist:
  [ ] BC-004 condition met: TC-147, TC-197 pass
  [ ] BC-010 condition met: TC-144, TC-181 pass
  [ ] BC-011 condition met: TC-201, TC-202 pass
  [ ] TC-133 through TC-147 pass (unit tests)
  [ ] TC-177 through TC-181 pass (E2E)
  [ ] NFR-019 benchmark passes (< 1,500ms P95 tab activation → interactive)

DFE-ADD-002 Entry Grid — Entry Gate Checklist:
  [ ] BC-001 condition met: TC-156, TC-157, TC-158 pass
  [ ] BC-002 condition met: code review confirms sequential DELETE path removed
  [ ] BC-003 condition met: TC-194, TC-195, TC-196 pass against org fixtures
  [ ] BC-005 condition met: TC-198 schema inspection passes
  [ ] BC-009 condition met: TC-159 passes (admin 400-op warning)
  [ ] TC-148 through TC-161 pass (unit tests)
  [ ] TC-182 through TC-187 pass (E2E)
  [ ] TC-160, TC-161 pass (batch size boundary tests)
  [ ] NFR-020 benchmark passes (< 100ms add row)
  [ ] NFR-022 benchmark passes (50 rows at >= 30fps, input latency <= 100ms)

All Features — Global Checklist:
  [ ] 80% minimum Vitest coverage on all new source files
  [ ] No new console.log in committed code
  [ ] All new API endpoints covered by Supertest contract tests
  [ ] Regression suite (TC-203 through TC-210) passes in CI
  [ ] k6 performance benchmarks run and results filed in
      projects/dynamic-form-engine/perf-results-addenda.md
  [ ] This QA plan traceability matrix updated with PASS/FAIL
      status for all 135 test cases before Phase 6 Audit begins

═══════════════════════════════════════════════════════════════════
END OF PHASE 5 QA ADDENDA — PART 2
Prepared by: Maqsad AI — QA Engineer
Date: 2026-06-07
═══════════════════════════════════════════════════════════════════
