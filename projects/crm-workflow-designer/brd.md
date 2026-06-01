# Business Requirements Document
## CRM Visual Workflow Designer
**Project Code:** CWFD-001
**Project Name:** CRM Workflow Designer
**Prepared By:** Maqsad AI — Business Analyst Agent
**Date:** 2026-06-01
**Version:** 1.0 — Draft for CEO Review
**Status:** Awaiting CEO Approval

---

## Table of Contents

1. Executive Summary
2. Business Context and Objectives
3. Stakeholders
4. Scope
5. Functional Requirements
6. Non-Functional Requirements
7. User Stories and Acceptance Criteria
8. CRM Schema and Data Model
9. UI/UX Requirements
10. Integration Requirements
11. Assumptions
12. Constraints
13. Dependencies
14. Risks and Mitigations
15. Glossary

---

## 1. Executive Summary

The CRM Visual Workflow Designer is a production-grade, React-based web resource that enables business and technical users to visually design, manage, publish, version, and reason about workflow processes within Dynamics 365 Online, Microsoft Dataverse, Power Platform, and Dynamics CRM On-Premise 9.x environments.

The designer operates as a single CRM Web Resource with a shared codebase — one React 19+ application that uses an adapter pattern to communicate with either the Dataverse Web API (cloud) or the Organization Service OData endpoint (on-premise). All workflow state is persisted directly to four CRM entities: `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcome`, and `qdb_outcomeworktasks`.

The system replaces manual, form-by-form CRM data entry for workflow definition with a canvas-first, drag-and-drop experience backed by a validation engine, versioning engine, auto-layout, and an advanced FetchXML-based conditional routing builder.

---

## 2. Business Context and Objectives

### 2.1 Problem Statement

Currently, workflow process definitions are managed through individual CRM record forms across four related entities. This approach:
- Has no visual representation of the end-to-end process flow
- Makes it impossible to detect orphaned steps, invalid routes, or circular references without manual audit
- Requires technical knowledge to configure FetchXML routing conditions
- Provides no versioning, cloning, or diff capability between workflow iterations
- Forces sequential data entry with no bulk operations

### 2.2 Business Objectives

| ID | Objective |
|----|-----------|
| BO-01 | Reduce workflow configuration time by providing a drag-and-drop visual canvas |
| BO-02 | Eliminate configuration errors through automated validation before publish |
| BO-03 | Enable non-technical business users to design workflow processes without CRM form expertise |
| BO-04 | Provide version control and audit trail for all workflow changes |
| BO-05 | Support both Dynamics 365 Online and CRM On-Premise 9.x from a single deployable artifact |
| BO-06 | Enable workflow reuse through cloning and template capability |
| BO-07 | Provide impact analysis to safely modify live workflow processes |

### 2.3 Success Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-01 | Workflow creation time reduced vs. form-by-form entry | Baseline measured pre-launch; target 70% reduction |
| SC-02 | Zero invalid workflow configurations reach Published state | Validated by validation engine gate before publish |
| SC-03 | Designer loads and is fully interactive within 3 seconds on a standard enterprise laptop | Lighthouse performance budget enforced in CI |
| SC-04 | All CRM saves complete without data loss or duplicate record creation | E2E test suite with real Dataverse environment |
| SC-05 | Designer operates identically on Online and On-Premise 9.x | Tested against both environments before release |

---

## 3. Stakeholders

| Role | Responsibility | Engagement Level |
|------|---------------|-----------------|
| Business Analyst / Process Owner | Define workflow processes using the designer | Primary user |
| System Administrator | Deploy web resource, configure permissions, manage published workflows | Primary user |
| Developer / Technical Configurator | Build FetchXML conditions, manage advanced routing | Secondary user |
| CRM Platform Team | Deploy solution packages, manage environments | Sponsor / approver |
| End Users (work item assignees) | Affected by workflow definitions — not direct users of designer | Impacted party |

---

## 4. Scope

### 4.1 In Scope

- React 19+ web resource deployable as a CRM Web Resource (.htm + bundled JS/CSS)
- Visual canvas using React Flow for workflow process design
- Full CRUD operations against all four CRM entities
- Environment detection: Online (Dataverse Web API) and On-Premise 9.x (OData endpoint)
- Adapter pattern isolating API communication behind a shared interface
- Workflow versioning (Major/Minor, Draft/Published/Archived)
- Workflow clone (full deep copy of steps, outcomes, routes)
- Workflow validation engine (pre-publish gate)
- Auto-layout engine (Dagre or ELK)
- Advanced FetchXML builder using the CRM Advanced Filter Page
- Impact analysis view
- Version history diff summary
- Export (JSON, PNG, SVG, PDF)
- Lookup controls for all relationship fields (entity, user, team)
- Deployment guide: CRM Web Resource + Power Platform managed solution

### 4.2 Out of Scope

- Workflow execution engine (runtime processing of work items — this designer defines the blueprint only)
- Email notifications triggered by workflow transitions
- Power Automate cloud flows or Logic Apps integration
- Mobile-native version of the designer
- External user / customer-facing portal access to the designer
- Custom PCF control wrapper (standard Web Resource deployment only in v1)

---

## 5. Functional Requirements

### FR-01 — Environment Detection
**Priority:** Critical
The system shall automatically detect whether it is running in Dynamics 365 Online/Dataverse or CRM On-Premise 9.x using `CrmEnvironmentService`. Detection shall use `Xrm.Utility.getGlobalContext()` with fallback to `window.parent.Xrm.Page.context`. The service shall expose: environment type (online/on-prem), API base URL, CRM server URL, API version, current user context (id, name, roles). URLs shall never be hardcoded.

### FR-02 — Dual-Adapter CRM Communication
**Priority:** Critical
The system shall implement an adapter interface `ICrmApiAdapter` with two concrete implementations:
- `DataverseApiAdapter`: Dynamics 365 Online / Dataverse Web API v9.2
- `OnPremODataAdapter`: Dynamics CRM On-Premise 9.x OData endpoint

All CRM operations (CRUD, lookup, publish, clone, version) shall route through the adapter. The application layer shall never call either adapter directly — it shall depend on the `ICrmApiAdapter` interface only.

### FR-03 — Process (qdb_work_item_record_type) Management
**Priority:** Critical
The system shall support:
- FR-03a: Create a new process definition with name, record entity, regarding field, and parent entity
- FR-03b: Open an existing process from the CRM record list
- FR-03c: Save a process in Draft state
- FR-03d: Publish a process (triggers validation gate; only valid processes may be published)
- FR-03e: Archive a previously published process
- FR-03f: Clone an entire process (deep copy — all steps, outcomes, routes)
- FR-03g: View version history for a process

### FR-04 — Step (qdb_work_item_steps) Management
**Priority:** Critical
The system shall support:
- FR-04a: Add a step node to the canvas via drag-and-drop from the toolbox
- FR-04b: Edit step properties: name, sequence number, schema name, task subject, task description
- FR-04c: Configure entity binding: qdb_recordentity, qdb_regardingfield, qdb_parententity (auto-populated from process; read-only by default)
- FR-04d: Configure assignment: qdb_task_assign_to (option set), with conditional field display per FR-08
- FR-04e: Delete a step from the canvas (deactivates or deletes CRM record)
- FR-04f: Re-sequence steps via drag and canvas ordering
- FR-04g: Steps display: name, sequence number, assignment info, entity info, and status badge

### FR-05 — Outcome (qdb_outcome) Management
**Priority:** Critical
The system shall support:
- FR-05a: Add an outcome node connected to a step node
- FR-05b: Edit outcome properties: name, sequence number
- FR-05c: Visual color-coding by outcome type: green (Approved), red (Rejected), blue (Information), orange (Escalation)
- FR-05d: Delete an outcome node (removes CRM record)
- FR-05e: Each outcome node stores its parent step reference (qdb_workitemstep)

### FR-06 — Route (qdb_outcomeworktasks) Management
**Priority:** Critical
The system shall support:
- FR-06a: Add a route edge connecting an outcome node to a next step node
- FR-06b: Edit route properties: name, sequence number, subject
- FR-06c: Attach a FetchXML condition to a route (qdb_filter field) using the Advanced Filter Builder (FR-12)
- FR-06d: Visual indicator on route edge when a FetchXML condition is present
- FR-06e: Delete a route edge (removes CRM record)
- FR-06f: Each route stores: outcome reference, next step reference, optional FetchXML filter

### FR-07 — Canvas Interactions
**Priority:** Critical
The canvas shall support:
- FR-07a: Drag-and-drop node placement
- FR-07b: Zoom in / zoom out / fit-to-view
- FR-07c: Pan (click and drag on canvas background)
- FR-07d: Mini-map for navigation on large workflows
- FR-07e: Snap-to-grid alignment
- FR-07f: Multi-select (rubber-band selection or Ctrl+Click)
- FR-07g: Undo / Redo (minimum 50 history states)
- FR-07h: Copy / Paste selected nodes
- FR-07i: Delete selected nodes/edges (Delete or Backspace key)
- FR-07j: Keyboard shortcuts (documented in help panel)

### FR-08 — Assignment Logic — Conditional Field Display
**Priority:** High
When configuring a step's `qdb_task_assign_to` option set:
- Value 100000000 (Specific User): show `qdb_assigned_user` lookup; hide all team fields
- Value 100000002 (Team): show `qdb_team` lookup and `qdb_enableroundrobin` toggle; if round-robin enabled, additionally show `qdb_roundrobinteam` lookup

### FR-09 — Lookup Controls
**Priority:** High
The system shall provide searchable lookup controls for:
- FR-09a: `qdb_recordentity` — entity table lookup (Display Name + Logical Name), populated from CRM metadata API
- FR-09b: `qdb_regardingfield` — attribute lookup, dynamically filtered by the selected `qdb_recordentity`; cleared when parent entity changes
- FR-09c: `qdb_parententity` — entity table lookup (same source as FR-09a)
- FR-09d: `qdb_assigned_user` — System User lookup (active users)
- FR-09e: `qdb_team` — Team lookup (active teams)
- FR-09f: `qdb_roundrobinteam` — Round Robin Team lookup

### FR-10 — Auto-Population of Step Fields from Process
**Priority:** High
When a step is added to a process canvas, the system shall auto-populate the following fields from the parent process:
- `qdb_recordentity`
- `qdb_regardingfield`
- `qdb_parententity`

These fields shall be read-only on the step by default. An administrator-level override toggle shall allow editing per step. This override must be explicitly confirmed by the user.

### FR-11 — Command Bar
**Priority:** High
The top command bar shall provide the following actions:
- New: clear the canvas and start a new process definition
- Open: open an existing process from a CRM record list (searchable)
- Save: persist current state to CRM as Draft
- Save Draft: explicit Draft save with confirmation
- Publish: trigger validation gate then publish; display validation errors if gate fails
- Clone: deep-clone the current process
- Validate: run validation engine and display results panel
- Auto Layout: apply automatic graph layout (Dagre or ELK)
- Version History: open version history drawer
- Preview: switch canvas to read-only preview mode
- Export: dropdown with JSON / PNG / SVG / PDF options

### FR-12 — Advanced FetchXML Builder
**Priority:** High
For conditional routes, the system shall launch the CRM Advanced Filter Page in a modal/popup:
```
{CRMServerURL}/SFA/goal/ParticipatingQueryCondition.aspx?entitytypecode={ObjectTypeCode}&readonlymode=false
```
The FetchXML produced by the CRM page shall be captured, validated as well-formed XML, and stored in `qdb_outcomeworktasks.qdb_filter`. The route edge shall display a condition indicator badge. The system shall also support viewing/editing the raw FetchXML string directly for technical users.

### FR-13 — Workflow Validation Engine
**Priority:** High
The validation engine shall detect and report the following violations before allowing publish:
- VE-01: Process has no steps defined
- VE-02: Step has no outcomes defined
- VE-03: Outcome has no route defined (dead-end outcome)
- VE-04: Route references a next step that does not exist on the canvas
- VE-05: Duplicate step sequence numbers within the same process
- VE-06: Duplicate outcome sequence numbers within the same step
- VE-07: Circular reference detected (step A routes to step B which routes back to step A through any path)
- VE-08: Step assignment type is set but required assignment fields are empty (e.g., Team selected but no team chosen)
- VE-09: Malformed FetchXML in a route filter
- VE-10: Step schema name is empty or contains invalid characters
- VE-11: Missing required step name

Each violation shall include: violation code, severity (Error/Warning), affected node ID, human-readable message, and a "jump to node" action.

### FR-14 — Versioning Engine
**Priority:** High
The system shall support:
- FR-14a: Semantic versioning scheme — Major.Minor (e.g., 1.0, 1.1, 2.0)
- FR-14b: Workflow states: Draft, Published, Archived
- FR-14c: Only one Published version per process at any time
- FR-14d: Publishing a new version archives the previously published version
- FR-14e: Draft versions may be freely edited; Published versions are immutable
- FR-14f: Version history panel shows all versions with: version number, state, created by, created on, published on, and change summary
- FR-14g: Diff summary between two versions: added steps, removed steps, modified steps, added/removed routes

### FR-15 — Workflow Clone
**Priority:** High
The Clone operation shall:
- FR-15a: Create a new process record with "(Clone)" appended to the name
- FR-15b: Deep-copy all step records with new GUIDs, preserving all field values
- FR-15c: Deep-copy all outcome records with new GUIDs, re-linking to cloned steps
- FR-15d: Deep-copy all route records with new GUIDs, re-linking to cloned outcomes and steps
- FR-15e: Set the cloned process to Draft state, version 1.0
- FR-15f: Present the clone in the canvas immediately after creation

### FR-16 — Auto Layout
**Priority:** Medium
The system shall apply graph auto-layout using Dagre or ELK (whichever is adopted after GitHub research). The layout shall:
- FR-16a: Arrange nodes in a top-to-bottom hierarchical flow
- FR-16b: Minimize edge crossings
- FR-16c: Preserve relative grouping of outcomes under their parent steps
- FR-16d: Apply layout without losing any node/edge data
- FR-16e: Allow undo of the layout operation

### FR-17 — Preview Mode
**Priority:** Medium
Preview Mode shall:
- FR-17a: Set the entire canvas to read-only (no drag, no edit, no delete)
- FR-17b: Display all node and edge properties in a read-only panel
- FR-17c: Highlight the active path for a simulated workflow execution (optional v1 enhancement — listed as future)
- FR-17d: Provide a clear visual indicator that the canvas is in preview mode
- FR-17e: Exit preview mode via a prominent "Exit Preview" button

### FR-18 — Search
**Priority:** Medium
The system shall support searching across process definitions by:
- Process name
- Task subject
- Entity logical name
- Assigned user name
- Team name

Search results shall open directly in the designer canvas.

### FR-19 — Impact Analysis
**Priority:** Medium
For a selected step or outcome, the system shall display:
- All upstream steps that can reach the selected node
- All downstream steps reachable from the selected node
- All routes that reference the selected step as a target
- A visual highlight overlay on the canvas showing the impact path

### FR-20 — Save / Sync Logic
**Priority:** Critical
All canvas save operations shall:
- FR-20a: Never create duplicate CRM records — check for existing record by GUID; update if exists, create if not
- FR-20b: Delete CRM records for nodes/edges removed from the canvas
- FR-20c: Deactivate (not hard-delete) CRM records when soft-delete is appropriate per entity configuration
- FR-20d: Maintain CRM record GUIDs in React Flow node metadata throughout the session
- FR-20e: Perform save operations as a batched request (OData $batch or Dataverse ExecuteMultiple) to minimize round-trips
- FR-20f: Report partial-save failures clearly — identify which records failed and why, and allow retry

### FR-21 — Export
**Priority:** Low
The system shall export the current process:
- JSON: structured representation of process + steps + outcomes + routes
- PNG: rasterized canvas screenshot
- SVG: vector canvas export
- PDF: printable layout with node details

### FR-22 — Keyboard Shortcuts
**Priority:** Low
The system shall support and document the following keyboard shortcuts:
- Ctrl+S: Save Draft
- Ctrl+Shift+S: Save and Publish
- Ctrl+Z: Undo
- Ctrl+Y / Ctrl+Shift+Z: Redo
- Delete / Backspace: Delete selected node or edge
- Ctrl+C: Copy selected
- Ctrl+V: Paste
- Ctrl+A: Select all
- Ctrl+F: Focus search
- Escape: Deselect all / close panel

---

## 6. Non-Functional Requirements

### NFR-01 — Performance
- NFR-01a: Initial load time (web resource to interactive) <= 3 seconds on a standard enterprise laptop (Core i5, 8 GB RAM, Chrome/Edge)
- NFR-01b: Canvas must handle workflows with up to 200 nodes without frame rate drop below 30 fps
- NFR-01c: CRM API operations (single record save/load) must complete within 2 seconds under normal network conditions
- NFR-01d: Auto-layout computation for 200-node workflows must complete within 1 second

### NFR-02 — Compatibility
- NFR-02a: Must function as a CRM Web Resource in Dynamics 365 Online (all current releases)
- NFR-02b: Must function in Dynamics CRM On-Premise 9.x
- NFR-02c: Must function within Microsoft Edge (Chromium) and Google Chrome — latest two major versions
- NFR-02d: Must function correctly when loaded inside a CRM iframe (MDD/UCI/Model-Driven App context)
- NFR-02e: Must not depend on external CDN resources — all dependencies bundled into the web resource artifact

### NFR-03 — Reliability
- NFR-03a: Canvas state must survive a browser refresh — local state persisted to sessionStorage as auto-save draft
- NFR-03b: Failed CRM API calls must display a user-friendly error message; never silently fail
- NFR-03c: Validation engine must produce deterministic results — same input always produces same violations

### NFR-04 — Security
- NFR-04a: The designer inherits the CRM session context — no separate authentication
- NFR-04b: All CRM API calls use the authenticated user's session token (CRM Web Resource context)
- NFR-04c: No credentials, tokens, or environment-specific values hardcoded in source code
- NFR-04d: All user input (step names, FetchXML, schema names) sanitized before display and before CRM persistence
- NFR-04e: FetchXML strings must be validated as well-formed XML before storage — no raw string injection

### NFR-05 — Maintainability
- NFR-05a: TypeScript strict mode throughout — no `any` types
- NFR-05b: Minimum 80% unit test coverage on all service and engine classes
- NFR-05c: All public interfaces documented with JSDoc
- NFR-05d: Folder structure as specified in Section 9.4 — no deviation without ADR

### NFR-06 — Accessibility
- NFR-06a: All interactive controls must have ARIA labels
- NFR-06b: Canvas keyboard navigation must be documented
- NFR-06c: Color-coding on outcome nodes must also use shape or label differentiation (not color alone)

### NFR-07 — Deployability
- NFR-07a: Entire application builds to a single .htm + bundled .js/.css that can be uploaded as a CRM Web Resource
- NFR-07b: No server-side component required — runs entirely in the browser within the CRM iframe
- NFR-07c: Must be packageable as a CRM managed solution with publisher prefix `qdb`

---

## 7. User Stories and Acceptance Criteria

### US-01 — Design a New Workflow Process
**As a** Business Analyst,
**I want to** drag steps and outcomes onto a canvas and connect them with routes,
**So that** I can design a workflow process visually without navigating multiple CRM forms.

**Acceptance Criteria:**
- AC-01a: Dragging a Step node from the toolbox places it on the canvas
- AC-01b: Connecting two nodes creates a route edge
- AC-01c: Clicking a node opens its property panel on the right
- AC-01d: Pressing Save persists all canvas nodes/edges to CRM without duplicates
- AC-01e: All required fields are validated before save; errors displayed inline

### US-02 — Publish a Workflow After Validation
**As a** System Administrator,
**I want to** run validation and publish a workflow,
**So that** only structurally valid workflows reach active use.

**Acceptance Criteria:**
- AC-02a: Clicking Publish triggers the validation engine
- AC-02b: If validation fails, a panel lists all violations with severity, code, and jump-to-node links
- AC-02c: If validation passes, the process state changes to Published in CRM
- AC-02d: Previously Published version is archived automatically
- AC-02e: A Published workflow canvas is read-only

### US-03 — Configure Conditional Routing with FetchXML
**As a** Technical Configurator,
**I want to** attach a FetchXML filter to a route,
**So that** the workflow engine can evaluate conditions at runtime.

**Acceptance Criteria:**
- AC-03a: Clicking "Add Condition" on a route edge opens the CRM Advanced Filter Page
- AC-03b: The FetchXML produced by the filter page is captured and stored on the route
- AC-03c: The route edge displays a condition badge when FetchXML is present
- AC-03d: Malformed XML is rejected with a clear error message
- AC-03e: The raw FetchXML is viewable and editable in a code editor panel

### US-04 — Clone a Workflow Process
**As a** Business Analyst,
**I want to** clone an existing workflow,
**So that** I can use it as a template for a new but similar process.

**Acceptance Criteria:**
- AC-04a: Clicking Clone prompts for a confirmation with the new name pre-filled as "[Original Name] (Clone)"
- AC-04b: All steps, outcomes, and routes are deep-copied with new CRM record GUIDs
- AC-04c: The clone is created in Draft state, version 1.0
- AC-04d: The clone opens in the canvas immediately
- AC-04e: The original process is unmodified

### US-05 — View Version History and Diff
**As a** System Administrator,
**I want to** see the history of published versions of a workflow,
**So that** I can understand what changed between versions.

**Acceptance Criteria:**
- AC-05a: Version History panel lists all versions with number, state, created by, date
- AC-05b: Selecting any two versions shows a diff: added steps (green), removed steps (red), modified steps (yellow)
- AC-05c: Each version can be opened in preview (read-only) mode
- AC-05d: The currently Published version is clearly marked

### US-06 — Auto-Layout a Complex Workflow
**As a** Business Analyst,
**I want to** apply automatic layout to a messy canvas,
**So that** the workflow is presented in a readable top-to-bottom flow.

**Acceptance Criteria:**
- AC-06a: Clicking Auto Layout arranges nodes in a hierarchical top-to-bottom flow
- AC-06b: No nodes overlap after layout
- AC-06c: Auto layout can be undone with Ctrl+Z
- AC-06d: All edges remain connected after layout

### US-07 — Run Impact Analysis on a Step
**As a** System Administrator,
**I want to** see all steps and routes that depend on a specific step,
**So that** I can safely modify or delete it.

**Acceptance Criteria:**
- AC-07a: Right-clicking a step node shows "Impact Analysis" option
- AC-07b: The impact panel lists all upstream and downstream steps
- AC-07c: The canvas highlights the impact path visually
- AC-07d: The highlight is dismissed when the panel is closed

### US-08 — Operate in On-Premise CRM 9.x
**As a** CRM Platform Team member (On-Premise),
**I want to** use the same workflow designer deployed to On-Premise CRM 9.x,
**So that** we do not need a separate application.

**Acceptance Criteria:**
- AC-08a: The web resource loads correctly when deployed to CRM On-Premise 9.x
- AC-08b: Environment detection identifies the on-prem environment automatically
- AC-08c: All CRUD operations work against the On-Prem OData endpoint
- AC-08d: No Online-specific API calls are made in on-prem mode

---

## 8. CRM Schema and Data Model

### 8.1 Entity: qdb_work_item_record_type (Process Definition)

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| qdb_name | Text (100) | Process display name | Yes |
| qdb_recordentity | Text (100) | Logical name of the primary CRM entity | Yes |
| qdb_regardingfield | Text (100) | Field on qdb_recordentity used as regarding reference | No |
| qdb_parententity | Text (100) | Logical name of parent entity | No |

Designer-managed fields (not in base schema — added by versioning engine as needed):
| Field | Type | Description |
|-------|------|-------------|
| qdb_version_major | Integer | Major version number |
| qdb_version_minor | Integer | Minor version number |
| qdb_workflow_state | Option Set | Draft (1) / Published (2) / Archived (3) |
| qdb_published_on | DateTime | Timestamp of last publish |
| qdb_cloned_from | Lookup (self) | Reference to source process if cloned |

> Note: The versioning fields above are additive to the existing schema. If the CRM solution already contains these fields they are reused. If not, the solution package must include them. This is an assumption to be confirmed with the client.

### 8.2 Entity: qdb_work_item_steps (Workflow Step)

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| qdb_sequenceno | Integer | Step order within process | Yes |
| qdb_schemaname | Text (100) | Technical schema identifier | Yes |
| qdb_name | Text (100) | Step display name | Yes |
| qdb_tasksubject | Text (200) | Subject of the task created at this step | No |
| qdb_recordentity | Text (100) | Inherited from process (see FR-10) | No |
| qdb_regardingfield | Text (100) | Inherited from process | No |
| qdb_parententity | Text (100) | Inherited from process | No |
| qdb_task_assign_to | Option Set | Assignment type: Specific User (100000000), Team (100000002) | No |
| qdb_assigned_user | Lookup (systemuser) | Specific user assignment | Conditional |
| qdb_team | Lookup (team) | Team assignment | Conditional |
| qdb_enableroundrobin | Boolean | Enable round-robin within team | No |
| qdb_roundrobinteam | Lookup (team) | Round-robin team (if enabled) | Conditional |
| qdb_taskdescription | Memo | Full task description | No |
| qdb_record_type | Lookup (qdb_work_item_record_type) | Parent process reference | Yes |

### 8.3 Entity: qdb_outcome (Outcome Definition)

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| qdb_sequencenumber | Integer | Outcome order within step | Yes |
| qdb_name | Text (100) | Outcome display name | Yes |
| qdb_applyfilter | Boolean | Whether a filter condition applies | No |
| qdb_workitemstep | Lookup (qdb_work_item_steps) | Parent step reference | Yes |

### 8.4 Entity: qdb_outcomeworktasks (Routing Definition)

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| qdb_sequencenumber | Integer | Route evaluation order | Yes |
| qdb_name | Text (100) | Route display name | Yes |
| qdb_subject | Text (200) | Subject description for this route | No |
| qdb_nextworkitemstep | Lookup (qdb_work_item_steps) | Target step reference | Yes |
| qdb_filter | Memo | FetchXML conditional filter | No |
| qdb_outcome | Lookup (qdb_outcome) | Parent outcome reference | Yes |

### 8.5 Entity Relationship Diagram (Textual)

```
qdb_work_item_record_type (1)
    ├── (1:N) qdb_work_item_steps  [via qdb_record_type]
    │           ├── (1:N) qdb_outcome  [via qdb_workitemstep]
    │           │           └── (1:N) qdb_outcomeworktasks  [via qdb_outcome]
    │           │                           └── (N:1) qdb_work_item_steps  [via qdb_nextworkitemstep]
    │           └── (N:1 self-reference via route)
```

---

## 9. UI/UX Requirements

### 9.1 Top Command Bar

| Control | Action | Keyboard Shortcut |
|---------|--------|-------------------|
| New | Clear canvas, prompt save if unsaved changes | — |
| Open | Open process search dialog | Ctrl+O |
| Save | Save all changes as Draft | Ctrl+S |
| Save Draft | Explicit Draft save with confirmation | — |
| Publish | Run validation gate, then publish | Ctrl+Shift+S |
| Clone | Deep-clone current process | — |
| Validate | Run validation, show results panel | Ctrl+Shift+V |
| Auto Layout | Apply graph auto-layout | — |
| Version History | Open version history drawer | — |
| Preview | Toggle read-only preview mode | — |
| Export | Dropdown: JSON / PNG / SVG / PDF | — |

### 9.2 Left Toolbox — Node Types

| Node Type | Description | CRM Entity |
|-----------|-------------|------------|
| Start Step | Entry point of the workflow | qdb_work_item_steps (type: Start) |
| Task Step | Standard work item step | qdb_work_item_steps (type: Task) |
| Approval Step | Approval gate step | qdb_work_item_steps (type: Approval) |
| Review Step | Review and sign-off step | qdb_work_item_steps (type: Review) |
| Parallel Step | Fork — parallel branch start | qdb_work_item_steps (type: Parallel) |
| Merge Step | Join — parallel branch end | qdb_work_item_steps (type: Merge) |
| Outcome | Decision output from a step | qdb_outcome |
| Conditional Route | Route with FetchXML condition | qdb_outcomeworktasks |
| End Step | Terminal node of the workflow | qdb_work_item_steps (type: End) |

### 9.3 Right Property Panel — Dynamic Content

| Selected Node Type | Panel Content |
|--------------------|--------------|
| Process (canvas background) | Process name, record entity, regarding field, parent entity, version info |
| Step Node | All qdb_work_item_steps fields — tabbed: General / Assignment / Entity / Description |
| Outcome Node | Outcome name, sequence, type (color), parent step ref |
| Route Edge | Route name, sequence, subject, FetchXML condition (with editor) |
| Nothing selected | Getting started guide / quick tips |

### 9.4 Source Folder Structure

```
src/
├── components/
│   ├── CommandBar/
│   ├── Toolbox/
│   ├── Canvas/
│   ├── PropertyPanel/
│   └── shared/
├── nodes/
│   ├── StepNode/
│   ├── OutcomeNode/
│   └── StartEndNode/
├── edges/
│   └── RouteEdge/
├── panels/
│   ├── ProcessPanel/
│   ├── StepPanel/
│   ├── OutcomePanel/
│   └── RoutePanel/
├── services/
│   ├── CrmEnvironmentService.ts
│   ├── CrmApiService.ts
│   ├── adapters/
│   │   ├── ICrmApiAdapter.ts
│   │   ├── DataverseApiAdapter.ts
│   │   └── OnPremODataAdapter.ts
│   └── FetchXmlService.ts
├── hooks/
│   ├── useProcessLoader.ts
│   ├── useCanvasSave.ts
│   ├── useLookup.ts
│   └── useValidation.ts
├── store/
│   └── workflowStore.ts  (Zustand)
├── models/
│   ├── Process.ts
│   ├── Step.ts
│   ├── Outcome.ts
│   └── Route.ts
├── utils/
│   ├── fetchXmlValidator.ts
│   ├── circularReferenceDetector.ts
│   └── exportUtils.ts
├── layouts/
│   └── autoLayoutEngine.ts
└── validators/
    └── WorkflowValidationEngine.ts
```

---

## 10. Integration Requirements

### 10.1 CRM Metadata API
The designer shall call the CRM metadata endpoint to populate entity and attribute lookup controls:
- Online: `GET {orgUrl}/api/data/v9.2/EntityDefinitions?$select=DisplayName,LogicalName`
- On-Prem: `GET {orgUrl}/api/data/v9.0/EntityDefinitions?$select=DisplayName,LogicalName`
- Attributes: `GET .../EntityDefinitions(LogicalName='{entity}')/Attributes?$select=DisplayName,LogicalName,AttributeType`

### 10.2 CRM Advanced Filter Page (FetchXML Builder)
Integration via `window.open()` or an iframe modal pointing to:
```
{CRMServerURL}/SFA/goal/ParticipatingQueryCondition.aspx?entitytypecode={ObjectTypeCode}&readonlymode=false
```
The page returns FetchXML via `window.postMessage` or a shared callback — the exact mechanism shall be confirmed during architecture phase (CRM version-dependent).

### 10.3 Dataverse Web API (Online)
- Base URL: `{orgUrl}/api/data/v9.2/`
- Authentication: inherits CRM session (cookie-based within Web Resource context)
- Batch operations: `POST $batch` for multi-record saves
- Solution header: `MSCRM.SolutionUniqueName` on all create operations

### 10.4 OData Endpoint (On-Premise 9.x)
- Base URL: `{orgUrl}/api/data/v9.0/`
- Authentication: Windows Integrated / NTLM (inherited from CRM session)
- Batch operations: OData $batch

---

## 11. Assumptions

| ID | Assumption |
|----|------------|
| A-01 | The four CRM entities (qdb_work_item_record_type, qdb_work_item_steps, qdb_outcome, qdb_outcomeworktasks) already exist and are deployed in the target environments |
| A-02 | The qdb publisher prefix is owned by the client and available in all target environments |
| A-03 | The versioning fields (qdb_version_major, qdb_version_minor, qdb_workflow_state) do not yet exist and must be added to the CRM solution — client to confirm |
| A-04 | The CRM Advanced Filter Page URL path is consistent across target CRM versions — to be validated during architecture |
| A-05 | The web resource runs inside the CRM application frame and has access to the Xrm context object |
| A-06 | Users accessing the designer have standard CRM entity permissions (read/write) on all four entities |
| A-07 | No integration with the workflow execution runtime is required for v1 — the designer produces the data blueprint only |
| A-08 | The react-flow library license (MIT) is acceptable for enterprise deployment |
| A-09 | The CRM on-prem environments are version 9.x — earlier versions are out of scope |
| A-10 | All dependencies will be bundled into the web resource artifact — no CDN access required at runtime |

---

## 12. Constraints

| ID | Constraint |
|----|------------|
| C-01 | The entire application must run as a single CRM Web Resource (.htm + bundled assets) — no server-side backend |
| C-02 | No external CDN dependencies at runtime — all libraries bundled |
| C-03 | Must operate within the CRM iframe security sandbox — no cross-origin requests except to the hosting CRM org |
| C-04 | Bundle size must be kept reasonable — target < 5 MB total (gzipped), to keep web resource load time within NFR-01a |
| C-05 | All data persisted to the four specified CRM entities only — no additional tables or external databases |
| C-06 | CRM session authentication is used — no OAuth flows or external identity providers in the web resource |
| C-07 | Publisher prefix `qdb` is fixed — no deviation |
| C-08 | React 19+ and TypeScript are mandated by the client — no version downgrade |

---

## 13. Dependencies

| ID | Dependency | Type | Risk |
|----|-----------|------|------|
| D-01 | React Flow library (react-flow / @xyflow/react) | External OSS library | Low — 25k+ stars, MIT license |
| D-02 | Dagre or ELK auto-layout library | External OSS library | Low — both well-established |
| D-03 | Fluent UI React (@fluentui/react or @fluentui/react-components) | External OSS library | Low — Microsoft supported |
| D-04 | Zustand state management | External OSS library | Low — 45k+ stars, MIT |
| D-05 | React Query (@tanstack/react-query) | External OSS library | Low — 40k+ stars, MIT |
| D-06 | React Hook Form + Zod | External OSS library | Low — industry standard |
| D-07 | Vite build tooling | Build tool | Low — standard for React projects |
| D-08 | CRM entity schema (four entities) | Client infrastructure | High — entities must exist pre-deployment |
| D-09 | CRM Advanced Filter Page availability | CRM platform | Medium — URL path may differ across CRM versions |
| D-10 | Versioning fields addition to CRM solution | Client approval | Medium — requires solution change approval |

---

## 14. Risks and Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|-----------|
| R-01 | CRM Advanced Filter Page URL differs between On-Prem 9.x versions | Medium | High | Architect phase to confirm URL + postMessage contract; build configurable URL per environment |
| R-02 | React Flow bundle size causes web resource load time to exceed 3 seconds | Medium | High | Tree-shake aggressively; measure bundle size in CI; consider lazy loading non-critical panels |
| R-03 | FetchXML postMessage callback not available in some CRM versions | Medium | High | Fallback: manual FetchXML text input with XML validation; test against target versions early |
| R-04 | OData $batch not supported on On-Prem 9.0 | Low | Medium | Test early against on-prem; fallback to sequential saves with progress indicator |
| R-05 | Xrm API differences between UCI and legacy web client | Low | Medium | Use only stable Xrm.Utility.getGlobalContext() APIs; test in UCI and legacy |
| R-06 | Canvas performance degrades with 200+ nodes in React Flow | Medium | Medium | Benchmark during architecture phase; implement node virtualization if needed |
| R-07 | Versioning schema additions rejected by client CRM team | Low | High | Flag A-03 early; design versioning engine to degrade gracefully if fields absent |
| R-08 | Circular reference detection has polynomial worst-case performance | Low | Low | Use DFS with visited set — O(V+E); acceptable for typical workflow sizes |

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| Process | A workflow blueprint defined in qdb_work_item_record_type |
| Step | A discrete work item task defined in qdb_work_item_steps |
| Outcome | A decision output from a step defined in qdb_outcome |
| Route | A conditional connection from an outcome to a next step defined in qdb_outcomeworktasks |
| FetchXML | Microsoft Dynamics CRM's proprietary XML-based query language used for conditional routing filters |
| Web Resource | A file hosted within Dynamics CRM that runs in a browser iframe |
| UCI | Unified Client Interface — the modern CRM UI framework |
| OData | Open Data Protocol — the REST API convention used by both Dataverse and CRM On-Prem 9.x |
| Adapter Pattern | A software design pattern that converts one interface to another; used here to abstract Online vs. On-Prem API differences |
| Round Robin | A task assignment strategy that distributes tasks sequentially across team members |
| Draft | A workflow version in progress — editable, not yet active |
| Published | A workflow version that is active and immutable |
| Archived | A previously published workflow version that is no longer active |
| ADR | Architecture Decision Record — a document capturing a significant architectural decision |

---

*End of Business Requirements Document — CWFD-001 v1.0*
*Prepared by Maqsad AI Business Analyst Agent | 2026-06-01*
