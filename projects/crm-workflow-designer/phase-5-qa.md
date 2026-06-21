═══════════════════════════════════════════════════════════════════════
QA PHASE — TEST STRATEGY AND TEST CASES
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer
Document:       phase-5-qa.md
Prepared by:    QA Engineer — Maqsad AI
Date:           2026-06-21
Version:        1.0
Status:         READY FOR REVIEW
Project Code:   CWFD-001 / CWFD-002
BRD Version:    1.0 (phase-2-ba.md)
Arch Version:   1.0 (phase-3-arch.md)
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — TEST STRATEGY SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The CRM Visual Workflow Designer is a pure client-side React 19 + TypeScript
single-artifact web resource. There is no backend server under test. All
persistence is via the CRM Web API (Xrm.WebApi / OData v4) and all business
logic lives in the Zustand store, the ValidationService, the graph builders,
and the path enumerator. These service-layer units are the highest-risk code
and are the primary focus of the test pyramid.

TDD MANDATE (Article IV — Constitution)
Red → Green → Refactor. Every acceptance criterion in this document maps to
a failing test that must be written before the implementation that makes it
pass. No test suite may ship in a state where any test is skipped or
commented out.

APPROACH
1. Unit layer (Vitest): pure functions and class methods — ValidationService,
   TechNewGraphBuilder, PathEnumerator, workflowStore actions, resolveAssigneeName,
   buildOutcomeEdge, edge-classification helpers.
2. Component layer (Vitest + @testing-library/react): EditStepNode, RouteEdge,
   EditCanvas — render correctness, visual state (error border, selection border),
   interaction events.
3. Integration layer (Vitest + @testing-library/react + MSW for Web API): full
   useEditMode hook wired to a real Zustand store instance; save pipeline;
   loadWorkflow; simulation flows.
4. E2E layer (Playwright): critical user journeys executed in Edge Chromium against
   a running Vite dev server with a mocked CRM adapter. Five journeys mandatory
   before any release.
5. Performance layer (Lighthouse CI + manual FPS profiling): initial load, canvas
   render FPS at 50 nodes, save latency benchmarks from NFR-001 – NFR-004.

TOOLS
- Unit / component / integration: Vitest 1.x, @testing-library/react 14,
  @testing-library/user-event 14, MSW 2.x
- E2E: Playwright 1.44+ with Edge Chromium channel
- Performance: Lighthouse CI, Chrome DevTools Performance panel (manual),
  performance.now() assertions in unit tests where timing matters
- Coverage: Vitest --coverage (Istanbul v8 provider), minimum 80% per file,
  100% required on ValidationService and workflowStore actions

CI INTEGRATION
- Pull Request gate: unit + component + integration suites must pass (< 3 min)
- Merge to main gate: all suites including E2E must pass
- Weekly scheduled run: E2E against a real CRM sandbox (if available)
- Coverage report uploaded as PR artefact; coverage drop blocks merge

TARGET COVERAGE
- ValidationService.ts: 100% branch coverage (17 violation codes tested)
- workflowStore.ts: 100% action coverage (every exported action has at least
  one test for the happy path and one for the no-op/guard path)
- TechNewGraphBuilder.ts: 90% branch coverage
- useEditMode.ts: 85% branch coverage
- EditStepNode.tsx: 90% branch coverage
- RouteEdge.tsx: 85% branch coverage
- Overall project: minimum 80% line coverage


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — TEST ENVIRONMENT REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UNIT AND COMPONENT TESTS
- Node.js 20 LTS, Vitest 1.x, jsdom environment
- No CRM connection required
- Seed fixtures: minimum one WorkflowProcess, three WorkflowSteps
  (sequenceNo 1-2-3), four WorkflowOutcomes (two forward, one back-edge,
  one terminal), two WorkflowRoutes (one with FetchXML filter, one fallback)
- Fixtures live in: src/__tests__/fixtures/workflowFixtures.ts

E2E TESTS
- Playwright 1.44+ with Edge Chromium channel
- Running Vite dev server on localhost:5173
- CrmAdapter replaced with MockCrmAdapter returning fixture data
- Test accounts: one admin user (write access), one read-only user
- Environment variable: PLAYWRIGHT_BASE_URL=http://localhost:5173

PERFORMANCE TESTS
- Same machine as CI: 4-core CPU, 8 GB RAM, 100 Mbps LAN (or equivalent)
- Canvas initialised with exactly 50 step nodes for FPS benchmarks
- Web API latency simulated at 50 ms for save-latency tests


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — TEST CASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
3.1 FUNCTIONAL — HAPPY PATH
─────────────────────────────────────────────────────────────────────

TC-001: ValidationService returns no violations for a well-formed workflow
(references FR-035, FR-036, FR-038, FR-039)
Given: A store state with process set, three steps (seqNo 1-2-3), each step
       has at least one outcome, at least one terminal outcome (nextStepId null),
       all steps have non-empty names and task subjects, assignment targets
       are populated, no duplicate sequence numbers, no cycles
When: ValidationService.validate(state) is called
Then: The returned Violations array is empty
Priority: Critical
Type: Unit

TC-002: workflowStore.addStep appends step and marks store dirty
(references FR-002, FR-020)
Given: A fresh store with a process set and stepOrder = ['step-A']
When: addStep is called with a new WorkflowStep { crmId: 'step-B', sequenceNo: 2, ... }
Then: store.steps['step-B'] exists
      store.stepOrder is ['step-A', 'step-B']
      store.newIds contains 'step-B'
      store.isDirty is true
Priority: Critical
Type: Unit

TC-003: workflowStore.addStepAfter creates step AND auto-connecting outcome
(references FR-002, FR-005)
Given: A store with process set, one existing step 'step-A'
When: addStepAfter('step-A') is called
Then: A new step exists in store.steps with processId matching process.crmId
      A new outcome exists in store.outcomes linking stepId='step-A' to the new step
      store.isDirty is true
      store.selectedId matches the new step node id
Priority: Critical
Type: Unit

TC-004: workflowStore.deleteStep cascades to outcomes and routes
(references FR-006)
Given: A store with step-A owning outcome-1, outcome-1 owning route-1
When: deleteStep('step-A') is called
Then: store.steps['step-A'] is undefined
      store.outcomes['outcome-1'] is undefined
      store.routes['route-1'] is undefined
      store.deletedIds contains all three IDs
      store.deletedEntityTypes maps each ID to the correct entity type
      store.isDirty is true
Priority: Critical
Type: Unit

TC-005: workflowStore.loadWorkflow populates all collections in sequence order
(references FR-032, FR-033)
Given: Arrays of three steps with sequenceNo [3, 1, 2] (out of order),
       two outcomes, one route, and a positions map
When: loadWorkflow(process, steps, outcomes, routes, positions) is called
Then: store.stepOrder is ['step-seq-1-id', 'step-seq-2-id', 'step-seq-3-id']
      store.isDirty is false
      store.validationResults is empty
      store.newIds is empty
      store.deletedIds is empty
Priority: Critical
Type: Unit

TC-006: useEditMode builds correct node list from store state
(references FR-001, FR-004)
Given: A store with two steps and their outcomes
When: The hook's nodes memo is evaluated
Then: Returned nodes include START_NODE_ID, END_NODE_ID,
      and one 'editStep' node per step in stepOrder
      Each editStep node position matches nodePositions or the computed default
      isSelected is true only for the node matching selectedId
Priority: Critical
Type: Integration

TC-007: EditStepNode renders name, sequenceNo, and assignee chip
(references FR-019, FR-041)
Given: EditStepData { stepId, name: 'Review', sequenceNo: 2, assignTo: 'team',
       assigneeName: 'Legal Team', isSelected: false, hasError: false }
When: EditStepNode is rendered with that data
Then: The text 'Review' is visible
      The text '2' (sequence badge) is visible
      The text 'Team' (assign chip label) is visible
      The text 'Legal Team' (assignee name) is visible
      The container border color is #334155 (no error, no selection)
Priority: High
Type: Component

TC-008: EditStepNode shows error styling when hasError is true
(references FR-041)
Given: EditStepData with hasError: true, isSelected: false
When: EditStepNode is rendered
Then: The container border color is #ef4444
      The container background is #fff8f8
      The box-shadow contains 'rgba(239,68,68'
Priority: Critical
Type: Component

TC-009: EditStepNode shows selection styling when isSelected is true
(references FR-019)
Given: EditStepData with hasError: false, isSelected: true
When: EditStepNode is rendered
Then: The container border color is #2563eb
      The box-shadow contains 'rgba(37,99,235'
Priority: High
Type: Component

TC-010: RouteEdge renders fallback badge and green stroke for fallback route
(references FR-011, FR-017)
Given: RouteEdgeData { isFallback: true, hasFilter: false, name: 'Default' }
       isPreviewMode: false, selected: false
When: RouteEdge is rendered
Then: The ELSE badge is visible
      The edge stroke is #16a34a
      No delete button is visible (not hovered)
Priority: High
Type: Component

TC-011: RouteEdge renders FetchXML badge and amber stroke for conditional route
(references FR-011)
Given: RouteEdgeData { isFallback: false, hasFilter: true, name: 'VIP' }
When: RouteEdge is rendered
Then: The FetchXML badge is visible
      The edge stroke is #d97706
      The strokeDasharray is '6 3'
Priority: High
Type: Component

TC-012: RouteEdge delete button is hidden in preview mode
(references FR-042)
Given: RouteEdge rendered with isPreviewMode: true, isHovered: true
When: The label container is hovered
Then: The delete button is not rendered
Priority: High
Type: Component

TC-013: TechNewGraphBuilder.buildTechNewGraph TB layout positions start and end nodes
(references FR-001, FR-008)
Given: Two steps with one outcome each, dir='TB', no routes
When: buildTechNewGraph(steps, outcomes, 'TB', []) is called
Then: The returned nodes include a node with id 'tn_start' and type 'viewStart'
      The returned nodes include a node with id 'tn_end' and type 'viewEnd'
      The start node y position is less than the first step node y position
      The end node y position is greater than the last step node y position
Priority: High
Type: Unit

TC-014: TechNewGraphBuilder.buildTechNewGraph LR layout positions steps horizontally
(references FR-001)
Given: Two steps with one outcome each, dir='LR', no routes
When: buildTechNewGraph(steps, outcomes, 'LR', []) is called
Then: All step nodes share the same y position (LR_STEP_Y = 160)
      step[1].position.x > step[0].position.x
Priority: High
Type: Unit

TC-015: workflowStore.simTakeOutcome advances simulation to the next step
(references FR-001 — simulation feature)
Given: Simulation started, simCurrentStepId = 'step-A',
       outcome { crmId: 'oc-1', stepId: 'step-A', nextStepId: 'step-B' } exists
When: simTakeOutcome('oc-1') is called
Then: store.simCurrentStepId === 'step-B'
      store.simVisitedStepIds contains 'step-A'
      store.simTakenOutcomeIds contains 'oc-1'
      store.simHistory has one entry { stepId: 'step-A', outcomeId: 'oc-1' }
Priority: High
Type: Unit

TC-016: workflowStore.simStepBack undoes the last simulation step
(references FR-001 — simulation feature)
Given: simHistory = [{ stepId: 'step-A', outcomeId: 'oc-1' }],
       simCurrentStepId = 'step-B',
       simVisitedStepIds = ['step-A'],
       simTakenOutcomeIds = ['oc-1']
When: simStepBack() is called
Then: store.simCurrentStepId === 'step-A'
      store.simVisitedStepIds does not contain 'step-A'
      store.simTakenOutcomeIds does not contain 'oc-1'
      store.simHistory is empty
Priority: High
Type: Unit

TC-017: workflowStore.resolveTemporaryId replaces tmp step ID in all collections
(references FR-027, FR-028, FR-029)
Given: Store has step with crmId='tmp_abc', stepOrder=['tmp_abc'],
       nodePositions['tmp_abc'] = { x: 100, y: 200 }
When: resolveTemporaryId('tmp_abc', 'real-guid-1', 'step') is called
Then: store.steps['real-guid-1'] exists and store.steps['tmp_abc'] is undefined
      store.stepOrder is ['real-guid-1']
      store.nodePositions['real-guid-1'] is { x: 100, y: 200 }
      store.nodePositions['tmp_abc'] is undefined
      store.newIds does not contain 'tmp_abc'
Priority: Critical
Type: Unit

TC-018: workflowStore temporal undo restores previous state
(references FR-001 — UX)
Given: Store with two steps; step 'step-A' exists; addStep called with 'step-B'
When: useWorkflowStore.temporal.getState().undo() is called
Then: store.steps['step-B'] is undefined
      store.stepOrder does not contain 'step-B'
Priority: High
Type: Unit

TC-019: E2E — CRM Admin creates a two-step workflow and saves successfully
(references US-01 / FR-027, FR-028, FR-029, FR-030)
Given: Designer loaded in Edge with MockCrmAdapter; canvas is empty
When: User clicks "Add Step", enters name "Initial Review", sets assignTo "Team",
      selects team "Legal"; clicks "Add Step" again, enters "Final Approval",
      sets assignTo "User", selects user "John Smith"; drags edge from step 1 to step 2;
      clicks the end node to create a terminal outcome on step 2; clicks "Save"
Then: MockCrmAdapter.createRecord is called once for the process
      MockCrmAdapter.createRecord is called twice for the steps (in order)
      MockCrmAdapter.createRecord is called for the outcome
      A success toast is visible for at least 3 seconds
      store.isDirty is false after the save
Priority: Critical
Type: E2E

TC-020: E2E — Designer loads existing workflow and renders correct node count
(references US-02 / FR-032, FR-033, FR-034)
Given: MockCrmAdapter returns a fixture workflow with 3 steps and 4 outcomes
When: Designer is mounted with a recordId parameter pointing to that fixture
Then: The canvas renders exactly 5 nodes (start + 3 steps + end)
      Each step node displays the correct name and sequenceNo
      The validation panel is not visible
Priority: Critical
Type: E2E

TC-021: E2E — Validation panel appears and step turns red when required field missing
(references US-03 / FR-039, FR-040, FR-041)
Given: Designer loaded with one step that has assignTo='user' but no assignedUserId
When: User clicks "Validate" in the toolbar
Then: The validation panel is visible and lists at least one violation
      The step node border is red (#ef4444)
      Clicking the violation in the panel selects the corresponding step node
Priority: Critical
Type: E2E

TC-022: E2E — View mode disables all editing interactions
(references US-04 / FR-042, FR-043)
Given: Designer mounted in read-only mode (isPreviewMode: true)
When: User attempts to drag a step node and attempts to click "Add Step"
Then: Step nodes are not repositioned (position unchanged after drag attempt)
      The "Add Step" button is either absent or non-functional
      No outcomes can be created by dragging between nodes
Priority: Critical
Type: E2E

TC-023: E2E — Auto-simulation plays through all paths and completes
(references FR-001 — simulation feature)
Given: Designer loaded with a linear 2-step workflow (step-A -> step-B -> End)
When: User clicks "Auto Simulate"
Then: step-A highlights, then step-B highlights, then the simulation reaches 'done' phase
      autoSimPhase === 'done' in the store after the animation completes
Priority: High
Type: E2E

─────────────────────────────────────────────────────────────────────
3.2 BOUNDARY CONDITIONS
─────────────────────────────────────────────────────────────────────

TC-024: ValidationService detects step with empty string name (whitespace only)
(references FR-039 / ViolationCode MISSING_STEP_NAME)
Given: One step with name: '   ' (whitespace only)
When: validate(state) is called
Then: Violations contains exactly one entry with code 'MISSING_STEP_NAME'
      That violation's nodeId matches the step's crmId
      That violation's severity is 'error'
Confidence: 99% — checkMissingStepNames uses name?.trim() so this case is covered
Priority: Critical
Type: Unit

TC-025: ValidationService detects single-step workflow with no terminal outcome
(references FR-038 / ViolationCode NO_TERMINAL_OUTCOME)
Given: One step with two outcomes both having non-null nextStepId pointing to each other
When: validate(state) is called
Then: Violations contains entry with code 'NO_TERMINAL_OUTCOME'
      Violations contains entry with code 'DEAD_LOOP'
Priority: Critical
Type: Unit

TC-026: ValidationService does NOT flag back-edge cycle as dead loop when an exit exists
(references FR-038 / ViolationCode DEAD_LOOP)
Given: Steps A, B, C; A→B→C (forward), C has one outcome to B (back-edge) and
       one terminal outcome (nextStepId null)
When: validate(state) is called
Then: No violation with code 'DEAD_LOOP' is returned
      (The back-edge cycle is valid because C has an exit)
Confidence: 95% — checkDeadLoops hasExit logic checks for null next step
Priority: Critical
Type: Unit

TC-027: ValidationService flags dead loop when no exit exists
(references FR-038 / ViolationCode DEAD_LOOP)
Given: Steps A and B; A has one outcome pointing to B; B has one outcome
       pointing to A; neither has a terminal outcome
When: validate(state) is called
Then: Violations contains one entry with code 'DEAD_LOOP'
      affectedNodeIds contains both step IDs
Priority: Critical
Type: Unit

TC-028: ValidationService flags MISSING_FALLBACK_ROUTE when all routes are conditional
(references FR-011 / ViolationCode MISSING_FALLBACK_ROUTE)
Given: Outcome with applyFilter=true, two routes both having non-empty filter strings
When: validate(state) is called
Then: Violations contains one entry with code 'MISSING_FALLBACK_ROUTE'
      severity is 'warning'
Priority: High
Type: Unit

TC-029: ValidationService flags TOO_MANY_OUTCOMES at threshold of exactly 5
(references ViolationCode TOO_MANY_OUTCOMES — THRESHOLD constant = 5)
Given: One step with exactly 5 outcomes in outcomeOrder
When: validate(state) is called
Then: Violations contains one entry with code 'TOO_MANY_OUTCOMES'
Note: THRESHOLD is hardcoded at 5 in ValidationService.ts line 394.
      This is a constitution violation (Article V — No Hardcoding). Flagged
      as a defect in Section 4.
Priority: High
Type: Unit

TC-030: TechNewGraphBuilder handles zero steps gracefully
(references FR-001)
Given: buildTechNewGraph([], [], 'TB', []) called with empty arrays
When: Function executes
Then: Returns { nodes: [startNode, endNode], edges: [] } without throwing
      The start-to-first-step edge is NOT included (no steps)
Priority: High
Type: Unit

TC-031: TechNewGraphBuilder handles outcome with applyFilter=true and zero routes
(references FR-011)
Given: One step, one outcome with applyFilter=true but routesByOutcome has no entry
When: buildTechNewGraph called
Then: No route edges are emitted for that outcome
      No exception thrown
Priority: High
Type: Unit

TC-032: workflowStore.moveStepUp is a no-op for the first step
(references FR-002)
Given: stepOrder = ['step-A', 'step-B']
When: moveStepUp('step-A') is called
Then: stepOrder remains ['step-A', 'step-B'] (unchanged)
Priority: Medium
Type: Unit

TC-033: workflowStore.moveStepDown is a no-op for the last step
(references FR-002)
Given: stepOrder = ['step-A', 'step-B']
When: moveStepDown('step-B') is called
Then: stepOrder remains ['step-A', 'step-B'] (unchanged)
Priority: Medium
Type: Unit

TC-034: workflowStore.addStepAfter is a no-op when process is null
(references FR-002)
Given: store.process is null
When: addStepAfter('step-A') is called
Then: store.steps is unchanged
      store.stepOrder is unchanged
      store.isDirty remains false
Priority: Medium
Type: Unit

TC-035: useEditMode.handleAddStep is a no-op when process is null
(references FR-002)
Given: useEditMode hook initialised with store.process = null
When: addStep() (returned from hook) is called
Then: No new nodes are added
      store.steps is unchanged
Priority: Medium
Type: Unit

TC-036: conditionLabel truncation in TechNewGraphBuilder at exactly 28 characters
(references FR-001 — graph builder label display)
Given: A route with filter producing a conditionLabel string of exactly 29 characters
When: buildEdges processes that route
Then: The edge label is the first 28 characters followed by '…' (ellipsis)
Priority: Medium
Type: Unit

TC-037: workflowStore temporal history limit does not exceed 50 entries
(references workflowStore.ts line 731 — { limit: 50 })
Given: 51 consecutive addStep calls on a store with temporal middleware
When: The 51st undo is attempted
Then: The store returns to the state after the 1st addStep call, not before it
      (The 51st undo is silently ignored — history is capped at 50)
Priority: Medium
Type: Unit

─────────────────────────────────────────────────────────────────────
3.3 BUSINESS RULE VALIDATION
─────────────────────────────────────────────────────────────────────

TC-038: INVALID_ASSIGNMENT violation for user assignTo with no assignedUserId
(references FR-039 / ValidationService checkInvalidAssignment)
Given: Step with assignTo='user', assignedUserId=null
When: validate(state) is called
Then: Violations contains code 'INVALID_ASSIGNMENT'
      Message contains 'Specific User'
      nodeId matches step.crmId
Priority: Critical
Type: Unit

TC-039: INVALID_ASSIGNMENT violation for team assignTo with no teamId
(references FR-039)
Given: Step with assignTo='team', teamId=null
When: validate(state) is called
Then: Violations contains code 'INVALID_ASSIGNMENT'
      Message contains 'Team'
Priority: Critical
Type: Unit

TC-040: INVALID_ASSIGNMENT violation for roundRobin assignTo with no roundRobinTeamId
(references FR-039)
Given: Step with assignTo='roundRobin', roundRobinTeamId=null
When: validate(state) is called
Then: Violations contains code 'INVALID_ASSIGNMENT'
      Message contains 'Round Robin'
Priority: Critical
Type: Unit

TC-041: MISSING_FETCHXML violation when applyFilter=true and all routes have empty filter
(references FR-011 / ViolationCode MISSING_FETCHXML)
Given: Outcome with applyFilter=true; one route with filter='' (empty string)
When: validate(state) is called
Then: Violations contains code 'MISSING_FETCHXML'
      severity is 'error'
Priority: Critical
Type: Unit

TC-042: MISSING_FETCHXML is NOT raised when at least one route has a non-empty filter
(references FR-011)
Given: Outcome with applyFilter=true; one route with filter='<fetch>...</fetch>'
When: validate(state) is called
Then: No violation with code 'MISSING_FETCHXML' is returned
Priority: High
Type: Unit

TC-043: ORPHAN_STEP violation for non-start step unreachable by any route
(references FR-038 / ViolationCode ORPHAN_STEP)
Given: Steps A (seqNo 1) and B (seqNo 2); no route points to step-B
When: validate(state) is called
Then: Violations contains code 'ORPHAN_STEP' with nodeId = step-B's crmId
      severity is 'warning'
Priority: High
Type: Unit

TC-044: ORPHAN_STEP is NOT raised for the start step (sequenceNo === 1)
(references FR-038)
Given: One step with sequenceNo=1; no routes exist yet
When: validate(state) is called
Then: No violation with code 'ORPHAN_STEP' is returned
Priority: High
Type: Unit

TC-045: DUPLICATE_SEQUENCE violation when two steps share the same sequence number
(references ValidationService checkDuplicateSequence)
Given: Steps A and B both with sequenceNo=1
When: validate(state) is called
Then: Violations contains one entry with code 'DUPLICATE_SEQUENCE'
      Message contains both step names
Priority: High
Type: Unit

TC-046: DUPLICATE_OUTCOME_NAME violation is case-insensitive
(references ValidationService checkDuplicateOutcomeNames)
Given: Step with two outcomes named 'Approved' and 'APPROVED'
When: validate(state) is called
Then: Violations contains code 'DUPLICATE_OUTCOME_NAME'
      (Case-insensitive comparison via toLowerCase())
Priority: High
Type: Unit

TC-047: MISSING_START violation when no step has sequenceNo === 1
(references FR-035 / ViolationCode MISSING_START)
Given: Steps all with sequenceNo >= 2
When: validate(state) is called
Then: Violations contains code 'MISSING_START'
Priority: High
Type: Unit

TC-048: INVALID_NEXT_STEP violation when route points to deleted step
(references FR-006 / ViolationCode INVALID_NEXT_STEP)
Given: Route with nextStepId='step-deleted' where 'step-deleted' is NOT in state.steps
When: validate(state) is called
Then: Violations contains code 'INVALID_NEXT_STEP'
Priority: High
Type: Unit

TC-049: isReturnEdge detects back-edge correctly based on sequenceNo comparison
(references TechNewGraphBuilder isReturnEdge function)
Given: stepById with step-A (seqNo=2), step-B (seqNo=1);
       outcome { stepId: 'step-A', nextStepId: 'step-B' }
When: isReturnEdge(outcome, stepById) is called
Then: Returns true (next step has lower sequenceNo than source)
Priority: High
Type: Unit

TC-050: isReturnEdge returns false for forward edge
(references TechNewGraphBuilder)
Given: step-A (seqNo=1), step-B (seqNo=2); outcome { stepId='step-A', nextStepId='step-B' }
When: isReturnEdge(outcome, stepById) is called
Then: Returns false
Priority: Medium
Type: Unit

TC-051: buildOutcomeEdge emits type 'editBack' and amber stroke for back-edge
(references useEditMode buildOutcomeEdge)
Given: isBackEdge=true, isConditional=false
When: buildOutcomeEdge(outcome, 'step_A', 'step_B', true, 0) is called
Then: Edge type is 'editBack'
      style.stroke is '#d97706'
      style.strokeDasharray is '5 4'
      style.opacity is 0.45
Priority: High
Type: Unit

TC-052: buildOutcomeEdge emits type 'outcome' and blue stroke for conditional forward edge
(references useEditMode)
Given: isBackEdge=false, isConditional=true (outcome.applyFilter=true)
When: buildOutcomeEdge called
Then: Edge type is 'outcome'
      style.stroke is '#3b82f6'
      style.strokeWidth is 1.5
Priority: Medium
Type: Unit

TC-053: resolveAssigneeName returns null for unknown assignTo value
(references useEditMode resolveAssigneeName)
Given: WorkflowStep with assignTo as an unexpected value (e.g. 'queue')
When: resolveAssigneeName(step) is called
Then: Returns null without throwing
Note: The function has no default case — any value outside 'user'/'team'/'roundRobin'
      falls through to `return null`. This is correct but relies on TypeScript
      discriminated union enforcement at the boundary. Flagged for awareness.
Priority: Medium
Type: Unit

─────────────────────────────────────────────────────────────────────
3.4 INTEGRATION TESTS
─────────────────────────────────────────────────────────────────────

TC-054: useEditMode.onConnect creates a new outcome linking source to target step
(references FR-005)
Given: Hook initialised with two steps; params = { source: 'step_step-A',
       target: 'step_step-B', sourceHandle: 'out', targetHandle: 'in' }
When: onConnect(params) is called
Then: store.outcomes has a new entry with stepId='step-A', nextStepId='step-B'
      store.newIds contains the new outcome's crmId
      store.isDirty is true
Priority: Critical
Type: Integration

TC-055: useEditMode.onConnect creates terminal outcome when target is END_NODE_ID
(references FR-005, FR-038)
Given: Hook with one step; params.target = 'edit_end'
When: onConnect(params) is called
Then: New outcome has nextStepId = null (terminal)
Priority: Critical
Type: Integration

TC-056: useEditMode.reLayout assigns positions to all step nodes
(references FR-008)
Given: Hook with three steps, nodePositions empty
When: reLayout() is called
Then: store.nodePositions has entries for all three step node IDs
      Each position has both x and y as numbers
Priority: High
Type: Integration

TC-057: useEditMode auto-layout runs once on first render when no positions stored
(references FR-008)
Given: Hook mounted with two steps, nodePositions = {}
When: Component mounts (useEffect fires)
Then: setNodePositions was called exactly once
      After re-render, nodePositions is populated
Priority: High
Type: Integration

TC-058: useEditMode auto-layout does NOT run when positions already exist
(references FR-008)
Given: Hook mounted with two steps; nodePositions already has 'step_step-A'
When: Component mounts
Then: setNodePositions is NOT called during mount
Priority: High
Type: Integration

TC-059: useEditMode.onNodeClick selects the clicked step node
(references FR-019)
Given: Hook with two steps
When: onNodeClick(mockEvent, { id: 'step_step-A', ... }) is called
Then: store.selectedId === 'step_step-A'
Priority: High
Type: Integration

TC-060: useEditMode.onNodeClick ignores clicks on start and end sentinel nodes
(references FR-001)
Given: store.selectedId = 'step_step-A'
When: onNodeClick(mockEvent, { id: 'edit_start', ... }) is called
Then: store.selectedId remains 'step_step-A' (unchanged)
Priority: Medium
Type: Integration

TC-061: workflowStore.moveStepUp updates sequenceNo on all steps
(references FR-002)
Given: stepOrder = ['step-A', 'step-B', 'step-C'],
       steps A/B/C have sequenceNo 1/2/3
When: moveStepUp('step-C') is called
Then: stepOrder = ['step-A', 'step-C', 'step-B']
      step-C.sequenceNo === 2
      step-B.sequenceNo === 3
      store.dirtyIds contains both 'step-C' and 'step-B'
Priority: High
Type: Integration

TC-062: workflowStore.assignOutcomeToStep moves outcome between step buckets
(references FR-005)
Given: outcome-1 in outcomeOrder['step-A']; reassigned to 'step-B'
When: assignOutcomeToStep('outcome-1', 'step-B') is called
Then: store.outcomeOrder['step-A'] does not contain 'outcome-1'
      store.outcomeOrder['step-B'] contains 'outcome-1'
      store.outcomes['outcome-1'].stepId === 'step-B'
      store.dirtyIds contains 'outcome-1'
Priority: High
Type: Integration

─────────────────────────────────────────────────────────────────────
3.5 E2E TESTS — CRITICAL USER JOURNEYS (PLAYWRIGHT)
─────────────────────────────────────────────────────────────────────

TC-063: E2E — Full create-validate-save journey (the 15-minute admin scenario)
(references NFR from BRD executive summary: "complete within 15 minutes")
Given: Empty canvas, MockCrmAdapter
When: Admin adds 3 steps, connects them in sequence, sets all required fields,
      clicks Validate (no errors), clicks Save
Then: All CRM API calls complete within 3 seconds total (NFR-002)
      Success toast visible >= 3 seconds
      isDirty === false
      Canvas re-renders without losing node positions
Priority: Critical
Type: E2E

TC-064: E2E — Load → Edit → Save round-trip preserves all data
(references FR-032, FR-033, FR-027, FR-028)
Given: MockCrmAdapter returns a 3-step workflow fixture on load
When: User modifies step-2 name to 'Revised Review', clicks Save
Then: MockCrmAdapter.updateRecord is called for step-2 with the new name
      createRecord is NOT called for step-2 (it already exists — not a new ID)
      The canvas still displays the correct 3 steps after save
Priority: Critical
Type: E2E

TC-065: E2E — Delete step removes it and its edges from the canvas
(references FR-006)
Given: Two steps connected by an outcome; step-B selected
When: User presses Delete key (or clicks delete icon)
Then: step-B node is removed from the canvas
      The edge between step-A and step-B is removed
      store.deletedIds contains step-B's crmId
      store.isDirty is true
Priority: Critical
Type: E2E

TC-066: E2E — Simulation correctly steps through a branching workflow
(references FR-001 — simulation feature)
Given: Step-A with two outcomes (Approved → Step-B, Rejected → End)
When: User starts simulation, clicks "Approved" outcome
Then: Canvas highlights Step-B as the current step
      simVisitedStepIds contains Step-A's crmId
      simTakenOutcomeIds contains the Approved outcome's crmId
Priority: High
Type: E2E

TC-067: E2E — Layout toggle TB vs LR switches orientation without data loss
(references FR-001 — Technical New view)
Given: A loaded 2-step workflow in TB layout
When: User toggles layout to LR
Then: Step nodes reposition to a horizontal layout (x varies, y constant)
      The same nodes and edges are present (no data lost)
      Back-edge (return edge) renders in purple bezier style
Priority: High
Type: E2E

─────────────────────────────────────────────────────────────────────
3.6 PERFORMANCE BENCHMARKS
─────────────────────────────────────────────────────────────────────

TC-068: Initial canvas render completes within 4 seconds (NFR-001)
Given: Edge Chromium, LAN, MockCrmAdapter returns allowed-list synchronously
When: Designer loads from cold start
Then: Time from navigation start to interactive canvas (React Flow mounted) <= 4000 ms
Tool: Lighthouse CI (--preset=desktop) + performance.mark in component mount
Priority: Critical
Type: Performance

TC-069: Save operation for 50-node workflow completes within 3 seconds (NFR-002)
Given: 50 steps, 60 outcomes, 30 routes pre-loaded; all marked dirty
When: Save action is invoked
Then: All CRM API calls (create/update per entity) complete within 3000 ms wall-clock
Tool: performance.now() in useWorkflowSave, MSW with 50 ms per-request delay
Priority: Critical
Type: Performance

TC-070: Canvas renders at >= 30 FPS with 50 nodes during drag (NFR-004)
Given: 50 EditStepNode nodes rendered on canvas
When: User drags a node continuously for 2 seconds
Then: Chrome DevTools FPS meter records >= 30 FPS throughout the drag
Tool: Manual measurement using Chrome DevTools Performance panel; record the
      slowest 200 ms window
Priority: High
Type: Performance

TC-071: Bundle size does not exceed 5 MB uncompressed (NFR-007)
Given: Production Vite build (vite build)
When: Build completes and dist/ artefacts are measured
Then: Total size of all JS + CSS + HTML files <= 5,120 KB
      (Architecture doc targets ~797 KB gzip; uncompressed <= 5 MB per NFR-007)
Tool: du -sh dist/ or Vite bundle analyser in CI
Priority: Critical
Type: Performance

─────────────────────────────────────────────────────────────────────
3.7 SECURITY
─────────────────────────────────────────────────────────────────────

TC-072: RouteEdge delete button calls deleteElements — not a direct store mutation
(references Article VII — Security by Default; input validation at boundary)
Given: RouteEdge rendered with isPreviewMode=false
When: Delete button is clicked
Then: useReactFlow().deleteElements is called with the edge ID
      No direct store.deleteRoute call is made by the component
      (The component delegates deletion; no bypassing of React Flow lifecycle)
Priority: High
Type: Unit

TC-073: Preview mode prevents route deletion via RouteEdge UI
(references FR-042, Article VII)
Given: isPreviewMode=true in store; RouteEdge rendered and hovered
When: The label area is hovered
Then: The delete button is not rendered
      No deleteElements call is triggered
Priority: Critical
Type: Component

TC-074: No console.log statements in production bundle
(references CLAUDE.md common.md: "No console.log in committed code")
Given: Production Vite build
When: The dist/ bundle is searched for 'console.log'
Then: Zero matches found
Tool: grep -r 'console\.log' dist/
Priority: High
Type: Security

TC-075: Temporary IDs (tmp_*) are never persisted to CRM
(references FR-028, FR-029 — save pipeline must resolve IDs before CRM write)
Given: A store with one step having crmId='tmp_abc123'
When: The save pipeline runs (useWorkflowSave)
Then: The CRM createRecord call receives the new entity data
      After the save resolves, resolveTemporaryId is called to replace
      'tmp_abc123' with the real GUID returned by CRM
      No subsequent PATCH call uses 'tmp_abc123' as an entity ID
Priority: Critical
Type: Integration

TC-076: Input to WorkflowStep.name is not evaluated as code
(references Article VII — injection prevention)
Given: A step name set to '<script>alert(1)</script>'
When: EditStepNode renders that name
Then: The text '<script>alert(1)</script>' is displayed as literal text
      No alert or script is executed (React escapes by default)
Priority: High
Type: Component


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — DEFECTS AND GAPS IDENTIFIED DURING TEST PLANNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following findings were identified by reading the source files. Each
meets the >80% confidence threshold required for reporting.

─────────────────────────────────────────────────────────────────────
DEFECT-001: Hardcoded TOO_MANY_OUTCOMES threshold
File: projects/crm-workflow-designer/src/services/ValidationService.ts, line 394
Confidence: 99%
Severity: Medium (Constitution Article V violation)

The constant THRESHOLD = 5 is embedded in the private method body. It is not
loaded from configuration and is not exposed as a named module constant. Any
change to the allowed outcome count requires a code change and redeploy.

Fix: Extract to a named module-level constant (OUTCOME_COUNT_WARNING_THRESHOLD)
or accept it via a constructor parameter so callers can supply it. Add a unit
test that passes a custom threshold.

─────────────────────────────────────────────────────────────────────
DEFECT-002: checkEndNodes uses routes but not outcomes for reachability check
File: projects/crm-workflow-designer/src/services/ValidationService.ts, lines 86-103
Confidence: 90%
Severity: Medium (logic gap)

checkEndNodes builds allNextStepIds from state.routes only
(line 86: `Object.values(state.routes).map(r => r.nextStepId)`). When an
outcome does NOT have applyFilter set (i.e. uses the direct nextStepId field
without routes), that step is excluded from the reachability set and may be
incorrectly flagged as a dead end. Steps reachable only via direct outcomes
(applyFilter=false) will trigger a false MISSING_END warning.

Fix: Merge nextStepIds from both outcomes (where applyFilter=false) and routes
into allNextStepIds.

TC to verify the fix: Add TC after TC-048 —
  Given: step-B is the nextStepId of an outcome (applyFilter=false) on step-A
  When: validate(state) is called
  Then: No MISSING_END warning for step-B

─────────────────────────────────────────────────────────────────────
DEFECT-003: checkOrphanSteps uses routes but not outcomes for reachability
File: projects/crm-workflow-designer/src/services/ValidationService.ts, lines 109-123
Confidence: 90%
Severity: Medium (same root cause as DEFECT-002)

Identical pattern to DEFECT-002. checkOrphanSteps builds allNextStepIds from
routes only. A step reachable via a direct (non-filtered) outcome will be
incorrectly flagged as ORPHAN_STEP.

Fix: Same as DEFECT-002 — merge outcome.nextStepId (where applyFilter=false)
into the reachability set.

─────────────────────────────────────────────────────────────────────
DEFECT-004: workflowStore.addStep does not initialise outcomeOrder for the new step
File: projects/crm-workflow-designer/src/store/workflowStore.ts, lines 215-221
Confidence: 85%
Severity: Low (potential NPE risk)

addStep pushes the step into steps and stepOrder but does not initialise
state.outcomeOrder[step.crmId] = []. Callers that subsequently read
state.outcomeOrder[step.crmId] without null-guarding will receive undefined.
addOutcome (line 288) does guard with `if (!state.outcomeOrder[outcome.stepId])`,
but ValidationService.checkDuplicateOutcomeNames (line 370) reads
`state.outcomeOrder[stepId] ?? []` which is safe. The risk is in any future
caller that assumes the bucket exists. Consider pre-initialising defensively
in addStep.

─────────────────────────────────────────────────────────────────────
DEFECT-005: RouteEdge delete relies on useReactFlow().deleteElements, which
            bypasses the store's cascade delete logic
File: projects/crm-workflow-designer/src/edges/RouteEdge.tsx, lines 45-48
Confidence: 88%
Severity: High (data integrity)

When the user deletes a route via the RouteEdge delete button, the code calls
`deleteElements({ edges: [{ id }] })` from React Flow. This removes the edge
from the React Flow graph but does NOT call store.deleteRoute, so:
- The route remains in store.routes
- The route's ID does not appear in store.deletedIds
- On the next save, the dangling route record in CRM is not deleted

The correct path is to call the store's deleteRoute action so the dirty-tracking
and cascade logic runs.

Fix: Replace the deleteElements call with useWorkflowStore.getState().deleteRoute(id)
(or the equivalent subscribed action), then rely on the store's React Flow sync
to update the edge list. Alternatively, hook into React Flow's onEdgesDelete
callback at the canvas level and dispatch to the store from there.

─────────────────────────────────────────────────────────────────────
DEFECT-006: autoLayoutDone ref is module-scoped, not reset on unmount
File: projects/crm-workflow-designer/src/hooks/useEditMode.ts, lines 212-223
Confidence: 82%
Severity: Low (UX — layout does not re-run after remount)

The autoLayoutDone ref is initialised to false on hook creation, but because
the hook is tied to the component lifecycle, a second mount (e.g. after
navigation away and back) will create a new ref and re-run layout. This is
actually the correct behaviour in React strict mode (double-mount in dev).
However, the eslint-disable-next-line comment on line 222 suppresses a
dependency warning for the effect, hiding the fact that the effect depends on
`nodePositions` (checked via `hasAnyPosition`) but `nodePositions` is not in
the dependency array. If positions change externally after mount without
changing `stepOrder.length`, the auto-layout condition is not re-evaluated.

Fix: Either add `nodePositions` to the dependency array and guard with the ref,
or document in a comment exactly why the omission is intentional.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — PERFORMANCE BENCHMARKS TABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Scenario                                   | NFR Ref  | Target p95       | Tool                        |
|--------------------------------------------|----------|------------------|-----------------------------|
| Cold start → interactive canvas            | NFR-001  | <= 4 000 ms      | Lighthouse CI (desktop)     |
| Save: 50 nodes / 60 edges                  | NFR-002  | <= 3 000 ms      | perf.now() + MSW 50 ms/req  |
| Entity metadata fetch → dropdown populated | NFR-003  | <= 2 000 ms      | MSW + perf.now()            |
| Canvas drag FPS at 50 nodes               | NFR-004  | >= 30 FPS        | Chrome DevTools Perf panel  |
| Production bundle size (uncompressed)     | NFR-007  | <= 5 120 KB      | Vite build + du             |
| ValidationService.validate (50 steps)     | Internal | <= 5 ms          | Vitest bench                |
| buildTechNewGraph (50 steps, 60 outcomes) | Internal | <= 10 ms         | Vitest bench                |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — AUTOMATION PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALL TESTS ARE AUTOMATED EXCEPT WHERE NOTED

| Test ID Range | Type        | Automated? | CI Stage          | Runner              |
|---------------|-------------|------------|-------------------|---------------------|
| TC-001–053    | Unit        | Yes        | PR gate           | Vitest              |
| TC-054–062    | Integration | Yes        | PR gate           | Vitest + RTL        |
| TC-063–067    | E2E         | Yes        | Merge gate        | Playwright          |
| TC-068        | Performance | Partial    | Merge gate        | Lighthouse CI       |
| TC-069        | Performance | Yes        | Merge gate        | Vitest bench + MSW  |
| TC-070        | Performance | Manual     | Pre-release only  | Chrome DevTools     |
| TC-071        | Performance | Yes        | PR gate           | Vite build + shell  |
| TC-072–076    | Security    | Yes        | PR gate           | Vitest / Playwright |

MANUAL TESTS (TC-070 only)
TC-070 (canvas FPS) requires a human to run Chrome DevTools Performance panel
with a real mouse drag on a real browser instance. It cannot be reliably
automated with Playwright because Playwright's synthetic pointer events do not
exercise the GPU compositor path that causes FPS drops. This test is run by
the QA engineer before every release candidate build.

FILE LOCATIONS (to be created by the dev team)
- Unit/integration specs:  src/__tests__/
- E2E specs:               e2e/
- Fixtures:                src/__tests__/fixtures/workflowFixtures.ts
- Vitest config:           vitest.config.ts (already expected per stack)
- Playwright config:       playwright.config.ts


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — DEFINITION OF DONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A feature (step, outcome, route, validation rule, simulation, graph builder
change) is NOT done unless ALL of the following are true:

[ ] The failing test for that feature was written BEFORE the implementation
    (Red step documented by commit timestamp)
[ ] The implementation makes the failing test pass without modifying the test
    (Green step)
[ ] No existing test was broken or skipped to make the new test pass
    (Refactor step clean)
[ ] ValidationService: 100% branch coverage confirmed by Vitest coverage report
[ ] workflowStore.ts: every action has at least one unit test covering the
    happy path and one covering the guard/no-op path
[ ] TechNewGraphBuilder: 90% branch coverage
[ ] All 6 defects listed in Section 4 are either fixed (with regression test)
    or have a recorded, CEO-approved deferral decision
[ ] No console.log statements in committed source files
[ ] The bundle size check (TC-071) passes on the production build
[ ] All 5 E2E critical journeys (TC-063–067) pass against Edge Chromium
[ ] Performance benchmarks TC-068, TC-069, TC-071 pass in CI
[ ] Manual FPS test TC-070 recorded as passed by QA engineer in a release note
[ ] DEFECT-005 (RouteEdge bypass of store cascade) is fixed before any
    integration test for the save pipeline is marked complete; this defect
    causes silent data loss and blocks release
