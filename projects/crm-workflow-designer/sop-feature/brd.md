# Business Requirements Document
## SOP Designer — Two-Tier Process Design System
**Parent Project:** CRM Visual Workflow Designer (CWFD-001)
**Feature Code:** CWFD-002
**Project Name:** SOP Designer
**Prepared By:** Maqsad AI — Business Analyst Agent
**Date:** 2026-06-12
**Version:** 1.0 — Draft for CEO Review
**Status:** Awaiting CEO Approval

---

## Table of Contents

1. Executive Summary
2. Business Context and Objectives
3. Stakeholders
4. Scope
5. Confirmed Design Decisions (Pre-Approved Constraints)
6. Functional Requirements
7. Non-Functional Requirements
8. User Stories and Acceptance Criteria
9. CRM Schema and Data Model
10. UI/UX Requirements
11. Integration Requirements
12. Assumptions
13. Constraints
14. Dependencies
15. Risks and Mitigations
16. Glossary

---

## 1. Executive Summary

The SOP Designer extends the CRM Visual Workflow Designer (CWFD-001) with a two-tier process design system. The current designer allows Business Analysts to create workflow processes directly against Dataverse entities. The new tier introduces Standard Operating Procedures (SOPs) as organisation-level blueprints managed by an Ops Excellence team. BAs then derive concrete workflow processes from published SOPs through a guided wizard, or continue to create processes directly as before.

This feature adds five new Dataverse entities, one optional lookup field on an existing entity, a new SOP canvas within the existing React web resource, a Roles management screen, a three-step "Create Process from SOP" wizard, and a single transactional Dataverse Custom Action plugin that performs all SOP-to-Process derivation server-side.

The feature is delivered entirely within the existing CRM web resource artifact (single `.htm` + bundled JS/CSS). No new server-side components or separate deployables are introduced.

---

## 2. Business Context and Objectives

### 2.1 Problem Statement

Currently all workflow processes are created ad hoc by Business Analysts with no enforced organisational standard. This produces:
- Inconsistent task assignment strategies across similar record types
- No organisation-wide definition of who is responsible for which step type (role-based accountability)
- Duplication of effort: multiple BAs design near-identical processes independently
- No traceability between a final deployed process and the governing operational procedure that mandated it
- No mechanism for Ops Excellence to publish authoritative process blueprints that BAs must use as a starting point

### 2.2 Business Objectives

| ID | Objective |
|----|-----------|
| BO-01 | Enable Ops Excellence to define and publish authoritative SOPs as organisational process blueprints |
| BO-02 | Allow BAs to derive concrete workflow processes from published SOPs, pre-filling structure and role assignments |
| BO-03 | Maintain backward compatibility: BAs can still create processes directly without an SOP |
| BO-04 | Introduce a Role entity so that SOPs reference roles rather than specific users or teams, enabling reuse across contexts |
| BO-05 | Enforce a transactional, server-side derivation pipeline so that SOP-to-Process creation is atomic and auditable |
| BO-06 | Provide traceable linkage from a live process back to its source SOP for governance and impact analysis |

### 2.3 Success Criteria

| ID | Criterion | Measurement |
|----|-----------|-------------|
| SC-01 | Ops Excellence can publish a complete SOP with steps, outcomes, and role assignments from the SOP canvas | Validated by E2E test against Dataverse |
| SC-02 | BA can derive a full process from a published SOP in three wizard steps with zero manual re-entry of structure | Validated by E2E test; process record count matches SOP step/outcome count |
| SC-03 | SOP-to-Process derivation is atomic: either all records are created or none | Custom Action plugin wrapped in CRM transaction; validated by fault-injection test |
| SC-04 | Processes derived from an SOP show a "From SOP" badge in the process list | Validated by UI test |
| SC-05 | BAs creating processes without an SOP are not impacted — existing UX flow unchanged | Regression test suite passes in full |
| SC-06 | Ops Excellence role CRUD (qdb_role) is accessible from the designer and requires no CRM form navigation | Validated by UAT |

---

## 3. Stakeholders

| Role | Responsibility | Engagement Level |
|------|---------------|-----------------|
| Ops Excellence Team | Define and publish SOPs; manage qdb_role records; view (read-only) derived processes | Primary user of new SOP canvas and Roles screen |
| Business Analyst | Create/Edit workflow processes; optionally derive from SOP; configure CRM bindings and assignments | Primary user of wizard; existing canvas unchanged |
| System Administrator | Deploy solution, configure security roles, manage entity permissions | Technical approver |
| CRM Platform Team | Deploy Dataverse entities, register plugin, manage solution versioning | Sponsor / approver |
| End Users (work item assignees) | Affected by workflow definitions — not direct users of designer | Impacted party |

---

## 4. Scope

### 4.1 In Scope

- Five new Dataverse entities: `qdb_role`, `qdb_sop`, `qdb_sopstep`, `qdb_sopoutcome`, and the junction/extension field `qdb_sop_id` on `qdb_workitemprocess`
- SOP list screen within the existing React web resource
- SOP edit canvas (ReactFlow-based, simplified): role badge on step nodes instead of user/team assignment controls
- "Create Process from SOP" three-step wizard (screen flow within the web resource)
- Roles screen: CRUD management for `qdb_role` records (Ops Excellence only)
- "From SOP" badge on process list entries where `qdb_sop_id` is populated
- Dataverse Custom Action `qdb_CreateProcessFromSop` (C# plugin, registered and transactional)
- Security role updates: Ops Excellence and BA privilege separation on new entities
- CRM managed solution delta: new entities + plugin + web resource update

### 4.2 Out of Scope

- Changes to the existing process canvas or step/outcome editing flows (except optional SOP badge display)
- Enforcement that every process must derive from an SOP (the SOP link remains optional)
- SOP versioning or SOP lifecycle states beyond Draft / Published / Retired (future phase)
- SOP export / import
- Mobile version of the SOP canvas or wizard
- Integration with an external document management system for SOP documentation
- Automated process synchronisation when an SOP is updated (future phase)

---

## 5. Confirmed Design Decisions (Pre-Approved Constraints)

The following decisions were confirmed by the product owner prior to this BRD and are constraints — not options. They must not be re-questioned during architecture or build phases.

### 5.1 Architecture Option: Separate SOP Entities (Option B)

Brand new Dataverse entities are created for the SOP tier. Existing process entities (`qdb_workitemprocess`, `qdb_workitemstep`, `qdb_workitemoutcome`) are not structurally changed except for the single nullable lookup field `qdb_sop_id` on `qdb_workitemprocess`. All SOP data lives in the new entities exclusively.

**Rationale:** Zero risk to existing process data; clean domain separation; allows SOP and Process schemas to evolve independently.

### 5.2 SOP-to-Process Link: Optional

The `qdb_sop_id` lookup on `qdb_workitemprocess` is nullable. BAs may create processes directly without any SOP. This preserves 100% backward compatibility with the existing CWFD-001 build.

### 5.3 Cardinality Rules

- One record type (`qdb_work_item_record_type`) → many SOPs. Ops Excellence enforces that only one SOP per record type is in Published state at any time (business policy, not a hard database constraint).
- One SOP → many Processes. Multiple BAs may derive separate processes from the same published SOP.

### 5.4 User Group Permissions

| Entity | Ops Excellence | BA |
|--------|---------------|-----|
| `qdb_role` | Create, Write, Read, Delete | Read |
| `qdb_sop` | Create, Write, Read, Delete | Read |
| `qdb_sopstep` | Create, Write, Read, Delete | Read |
| `qdb_sopoutcome` | Create, Write, Read, Delete | Read |
| `qdb_workitemprocess` | Read | Create, Write, Read |
| `qdb_workitemstep` | Read | Create, Write, Read |
| `qdb_workitemoutcome` | Read | Create, Write, Read |

### 5.5 SOP-to-Process Derivation: Server-Side Plugin

All record creation during derivation occurs inside a single Dataverse Custom Action `qdb_CreateProcessFromSop`. The plugin is transactional: if any step fails, all records created in that invocation are rolled back. The React web resource calls the action once with the complete wizard payload and receives the new `ProcessId` on success.

### 5.6 Post-Derivation Navigation

After successful process creation, the web resource receives the new `ProcessId` from the plugin response and opens the process directly in the existing Edit Canvas. No intermediate confirmation screen is required.

---

## 6. Functional Requirements

### FR-SOP-01 — SOP List Screen
**Priority:** Critical
The system shall provide a SOP list screen accessible to Ops Excellence and BA users. The screen shall:
- FR-SOP-01a: Display all `qdb_sop` records in a searchable, sortable grid (columns: Name, Record Type, Status, Version, Modified On)
- FR-SOP-01b: Allow Ops Excellence users to create a new SOP (opens SOP canvas)
- FR-SOP-01c: Allow Ops Excellence users to open an existing SOP for editing
- FR-SOP-01d: Allow BA users to view SOPs in read-only mode
- FR-SOP-01e: Allow BA users to select a Published SOP and launch the "Create Process from SOP" wizard
- FR-SOP-01f: Display SOP status as a coloured badge: Draft (grey), Published (green), Retired (red)
- FR-SOP-01g: Navigate between the Process list and SOP list via a tab or toggle within the existing designer shell

### FR-SOP-02 — SOP Edit Canvas
**Priority:** Critical
The system shall provide a SOP edit canvas based on the existing ReactFlow canvas component. The SOP canvas shall:
- FR-SOP-02a: Render `qdb_sopstep` records as SOP Step nodes
- FR-SOP-02b: Render `qdb_sopoutcome` records as SOP Outcome nodes
- FR-SOP-02c: Connect outcomes to their next SOP step via directed edges (using `qdb_nextsopstep_id`)
- FR-SOP-02d: Display a Role Badge on each SOP Step node showing the assigned `qdb_role` name (not a user or team)
- FR-SOP-02e: Provide a simplified Properties Panel for SOP steps (name, description, sequence, role picker) — no entity binding fields, no user/team lookups
- FR-SOP-02f: Provide a Properties Panel for SOP outcomes (name, sequence, next step selector)
- FR-SOP-02g: Support Save (Draft) and Publish actions in the command bar
- FR-SOP-02h: Support SOP status transitions: Draft → Published → Retired
- FR-SOP-02i: A Published SOP canvas shall be read-only (no drag, no edit, no delete)
- FR-SOP-02j: Retired SOPs are accessible in read-only mode for reference
- FR-SOP-02k: Support auto-layout (ELK/Dagre) inherited from the existing layout engine
- FR-SOP-02l: Support undo/redo (Zustand zundo) for SOP canvas edits

### FR-SOP-03 — SOP Step Node
**Priority:** Critical
Each SOP Step node shall display:
- Step name
- Sequence number badge
- Role badge (role name from `qdb_role_id`) — colour-coded by role status (Active: blue; Inactive: grey)
- Step description (truncated tooltip on hover)

### FR-SOP-04 — SOP Outcome Node
**Priority:** Critical
Each SOP Outcome node shall display:
- Outcome name
- Sequence number badge
- Directed edge to the next SOP step (or an End marker if `qdb_nextsopstep_id` is null — terminal)

### FR-SOP-05 — Roles Screen
**Priority:** Critical
The system shall provide a Roles management screen accessible to Ops Excellence users. The screen shall:
- FR-SOP-05a: List all `qdb_role` records in a grid (columns: Name, Department, Status, Description)
- FR-SOP-05b: Allow Ops Excellence users to create a new role (inline form or dialog)
- FR-SOP-05c: Allow Ops Excellence users to edit an existing role
- FR-SOP-05d: Allow Ops Excellence users to deactivate (set status to Inactive) a role
- FR-SOP-05e: Prevent deletion of a role that is referenced by one or more `qdb_sopstep` records; display a clear error message
- FR-SOP-05f: BA users can view the Roles screen in read-only mode (no create/edit/delete controls shown)

### FR-SOP-06 — "Create Process from SOP" Wizard
**Priority:** Critical
The wizard shall be a three-step modal or full-screen flow within the web resource. It shall:

**Step 1 — Process Identity**
- FR-SOP-06a: Pre-fill Process Name from SOP name (editable by BA)
- FR-SOP-06b: Display the source SOP name and Record Type (read-only — inherited from SOP)
- FR-SOP-06c: Allow BA to provide a Process Description

**Step 2 — CRM Binding**
- FR-SOP-06d: Allow BA to select Task Entity (lookup against CRM entity metadata)
- FR-SOP-06e: Allow BA to select Regarding Field (attribute lookup, filtered by Task Entity)
- FR-SOP-06f: Allow BA to select Parent Entity (lookup against CRM entity metadata)
- FR-SOP-06g: These bindings apply to all steps derived from the SOP (global to the process)

**Step 3 — Per-Step Assignment**
- FR-SOP-06h: Display each SOP step in sequence order, showing step name and role badge
- FR-SOP-06i: For each step, allow BA to configure:
  - Assign To type (option set matching existing `qdb_task_assign_to`: Specific User / Team)
  - Specific User lookup (if Specific User selected)
  - Team lookup (if Team selected)
  - Enable Round Robin toggle (if Team selected)
  - Round Robin Team lookup (if Round Robin enabled)
  - Task Subject (pre-filled from SOP step name; editable)
- FR-SOP-06j: BA may leave assignment fields blank to configure post-creation in the canvas
- FR-SOP-06k: Wizard navigation: Back/Next between steps; Cancel at any step discards all inputs

**Submission**
- FR-SOP-06l: On Submit (Step 3), the web resource shall call `qdb_CreateProcessFromSop` Custom Action with the complete payload
- FR-SOP-06m: Show a progress indicator during the plugin call
- FR-SOP-06n: On success, receive `ProcessId` and navigate directly to the Edit Canvas for the new process
- FR-SOP-06o: On failure, display the plugin error message; allow the BA to retry or cancel

### FR-SOP-07 — Custom Action: qdb_CreateProcessFromSop
**Priority:** Critical
The server-side plugin shall:
- FR-SOP-07a: Accept input parameters: `SopId` (GUID), `ProcessName` (string), `ProcessDescription` (string), `TaskEntity` (string), `RegardingField` (string), `ParentEntity` (string), `StepAssignments` (string — JSON-serialised array of per-step assignment configs)
- FR-SOP-07b: Validate that the referenced SOP exists and is in Published status; throw if not
- FR-SOP-07c: Validate that all required parameters are non-empty; throw specific validation errors
- FR-SOP-07d: Create one `qdb_workitemprocess` record with: name, description, task entity binding, regarding field, parent entity, and `qdb_sop_id` set to the source SOP GUID
- FR-SOP-07e: Load all `qdb_sopstep` records for the SOP ordered by `qdb_sequenceno`
- FR-SOP-07f: For each SOP step, create one `qdb_workitemstep` record: copy name and sequence; apply the BA-provided assignment config for that step; set task subject
- FR-SOP-07g: Build a mapping: `sopStepGuid → newWorkitemStepGuid` for all created steps
- FR-SOP-07h: Load all `qdb_sopoutcome` records for each SOP step
- FR-SOP-07i: For each SOP outcome, create one `qdb_workitemoutcome` record: copy name and sequence; resolve `qdb_nextsopstep_id` using the sopStep-to-workitemStep mapping; if `qdb_nextsopstep_id` is null, leave the next-step reference null (terminal outcome)
- FR-SOP-07j: Execute all record creations within a single CRM transaction (plugin registered in a transaction-aware step); if any creation fails, the entire operation rolls back
- FR-SOP-07k: Return output parameter `ProcessId` (GUID of the newly created `qdb_workitemprocess` record) on success
- FR-SOP-07l: Plugin must complete within the CRM 2-minute plugin execution limit; if SOP step count exceeds a safe threshold (TBD in architecture, expected maximum 50 steps), the action must still complete within the limit

### FR-SOP-08 — "From SOP" Badge on Process List
**Priority:** High
The process list screen shall:
- FR-SOP-08a: Display a "From SOP" badge on any process record where `qdb_sop_id` is non-null
- FR-SOP-08b: Hovering the badge shall show a tooltip with the source SOP name
- FR-SOP-08c: Clicking the badge shall navigate to the SOP canvas for the referenced SOP (read-only for BA; editable for Ops Excellence)

### FR-SOP-09 — SOP Record Type Lookup
**Priority:** High
The SOP canvas Properties Panel (process-level) shall include a lookup to `qdb_work_item_record_type` for the `qdb_recordtype_id` field. This determines which record type the SOP governs. Ops Excellence users may select any existing record type. The selected record type is shown read-only in the BA wizard (Step 1).

### FR-SOP-10 — SOP Role Picker in Step Properties
**Priority:** High
Within the SOP Step properties panel, the Role field shall:
- FR-SOP-10a: Display a searchable dropdown/combobox populated from active `qdb_role` records
- FR-SOP-10b: Show role name and department in the dropdown option
- FR-SOP-10c: Allow clearing the role selection (role assignment is optional on a SOP step)
- FR-SOP-10d: Display the selected role as a Role Badge on the SOP Step node canvas representation

### FR-SOP-11 — SOP Validation Before Publish
**Priority:** High
Before a SOP can be Published, the system shall validate:
- FR-SOP-11a: SOP has at least one step defined
- FR-SOP-11b: Each SOP step has a name
- FR-SOP-11c: Sequence numbers within the SOP are unique and sequential
- FR-SOP-11d: All `qdb_nextsopstep_id` references point to steps that exist within the same SOP
- FR-SOP-11e: No circular references in the SOP outcome-to-step graph (DFS check)
- FR-SOP-11f: SOP has a Record Type assigned (`qdb_recordtype_id` is non-null)

Violations shall be displayed in a validation panel consistent with the existing `WorkflowValidationEngine` pattern (violation code, severity, affected node, human-readable message, jump-to-node action).

### FR-SOP-12 — SOP Save and Persist
**Priority:** Critical
SOP canvas save operations shall:
- FR-SOP-12a: Persist `qdb_sop`, `qdb_sopstep`, and `qdb_sopoutcome` records via the existing `ICrmAdapter` interface (new adapter methods added)
- FR-SOP-12b: Follow the same dependency-ordered save pipeline as the existing process save (SOP → SOP steps → SOP outcomes)
- FR-SOP-12c: Follow the same upsert semantics (create if new ID, update if dirty ID)
- FR-SOP-12d: Persist SOP draft state to sessionStorage with key `cwfd_sop_autosave_{sopId}`

---

## 7. Non-Functional Requirements

### NFR-SOP-01 — Performance
- NFR-SOP-01a: SOP canvas with up to 50 steps must load and render within 2 seconds
- NFR-SOP-01b: Wizard step transitions (including lookup population) must complete within 1 second
- NFR-SOP-01c: `qdb_CreateProcessFromSop` plugin must complete within 30 seconds for a 50-step SOP (well within the 2-minute CRM plugin limit)

### NFR-SOP-02 — Bundle Size
- NFR-SOP-02a: The SOP feature additions must not push the total eager bundle past the existing 4,500 KB CI gate
- NFR-SOP-02b: New SOP-specific components (wizard, SOP canvas screens) should be lazy-loaded where possible

### NFR-SOP-03 — Security
- NFR-SOP-03a: All Ops Excellence actions (Create/Write SOP, manage roles) must be enforced by CRM security role privileges on the respective entities — not by UI hiding alone
- NFR-SOP-03b: The `qdb_CreateProcessFromSop` plugin must run in the context of the calling user; it must not use an elevated service account
- NFR-SOP-03c: The JSON-serialised `StepAssignments` parameter must be validated and sanitised within the plugin before deserialisation

### NFR-SOP-04 — Compatibility
- NFR-SOP-04a: All new features must work within the existing Dynamics 365 Online (Dataverse) environment
- NFR-SOP-04b: The SOP canvas and wizard must function within the CRM UCI iframe with no new external dependencies

### NFR-SOP-05 — Maintainability
- NFR-SOP-05a: SOP domain models (`Sop`, `SopStep`, `SopOutcome`, `Role`) shall follow the same model pattern as the existing `WorkflowProcess`, `WorkflowStep`, `WorkflowOutcome`, `WorkflowRoute` models
- NFR-SOP-05b: New adapter methods for SOP entities shall be added to `ICrmAdapter` following the existing interface contract pattern
- NFR-SOP-05c: The wizard state shall be managed in a dedicated Zustand slice or local React state — not mixed into the existing `workflowStore`
- NFR-SOP-05d: TypeScript strict mode; no `any` types; all new public interfaces documented with JSDoc

### NFR-SOP-06 — Reliability
- NFR-SOP-06a: If the `qdb_CreateProcessFromSop` plugin fails, the BA must receive a clear error message derived from the plugin fault; the partial state message must not expose internal CRM error codes in production
- NFR-SOP-06b: The wizard input state must be preserved in memory if the user navigates backwards through wizard steps; no data loss on Back navigation

---

## 8. User Stories and Acceptance Criteria

### US-SOP-01 — Define a New SOP
**As an** Ops Excellence team member,
**I want to** create a new SOP on a visual canvas, define steps with role assignments and outcomes,
**So that** I can publish an authoritative process blueprint for BAs to use.

**Acceptance Criteria:**
- AC-SOP-01a: Ops Excellence user can create a new SOP, add SOP steps and outcomes from a toolbox
- AC-SOP-01b: Each step can have a role assigned from a searchable role picker
- AC-SOP-01c: Step node on canvas shows the role badge with the role name
- AC-SOP-01d: Saving the SOP persists all records to Dataverse without duplicates
- AC-SOP-01e: Publishing the SOP transitions its status to Published and makes the canvas read-only

### US-SOP-02 — Manage Roles
**As an** Ops Excellence team member,
**I want to** create and manage role records,
**So that** I can assign roles to SOP steps and keep the role list current.

**Acceptance Criteria:**
- AC-SOP-02a: Ops Excellence user can create a new role with name, department, and description
- AC-SOP-02b: Ops Excellence user can edit existing role records
- AC-SOP-02c: Ops Excellence user can set a role to Inactive
- AC-SOP-02d: Attempting to delete a role that is referenced by a SOP step shows a clear blocking error
- AC-SOP-02e: BA users see the Roles screen in read-only mode with no edit controls

### US-SOP-03 — Derive a Process from a Published SOP
**As a** Business Analyst,
**I want to** create a workflow process from a published SOP using a guided wizard,
**So that** the process structure and role context are pre-filled and I only need to provide CRM bindings and specific assignments.

**Acceptance Criteria:**
- AC-SOP-03a: BA selects a Published SOP from the SOP list and clicks "Create Process from SOP"
- AC-SOP-03b: Wizard Step 1 pre-fills the process name from the SOP name (editable); shows Record Type read-only
- AC-SOP-03c: Wizard Step 2 allows BA to select Task Entity, Regarding Field, Parent Entity
- AC-SOP-03d: Wizard Step 3 shows each SOP step with the role badge; BA can assign a specific user or team per step
- AC-SOP-03e: Submitting the wizard calls the Custom Action; a progress indicator is shown
- AC-SOP-03f: On success, the new process opens directly in the Edit Canvas
- AC-SOP-03g: The derived process record has `qdb_sop_id` populated with the source SOP GUID
- AC-SOP-03h: The process list shows a "From SOP" badge on the derived process

### US-SOP-04 — View Source SOP from Process List
**As a** Business Analyst,
**I want to** see which SOP a process was derived from and navigate to it,
**So that** I can understand the governing standard and review it if needed.

**Acceptance Criteria:**
- AC-SOP-04a: The "From SOP" badge is visible on the process list row for SOP-derived processes
- AC-SOP-04b: Hovering the badge shows the source SOP name as a tooltip
- AC-SOP-04c: Clicking the badge opens the referenced SOP in read-only mode (for BA users)

### US-SOP-05 — Create a Process Directly (Backward Compatibility)
**As a** Business Analyst,
**I want to** continue creating workflow processes directly without using an SOP,
**So that** my existing workflow is not disrupted.

**Acceptance Criteria:**
- AC-SOP-05a: The "New Process" flow is unchanged from CWFD-001
- AC-SOP-05b: `qdb_sop_id` on the process record is null for directly-created processes
- AC-SOP-05c: No "From SOP" badge appears on directly-created processes
- AC-SOP-05d: All existing CWFD-001 regression tests continue to pass

### US-SOP-06 — Ops Excellence Views Processes Derived from Their SOPs
**As an** Ops Excellence team member,
**I want to** see all processes that have been derived from a given SOP,
**So that** I can understand adoption and impact before retiring or revising the SOP.

**Acceptance Criteria:**
- AC-SOP-06a: The SOP canvas or list shows a count of processes derived from each SOP
- AC-SOP-06b: Ops Excellence can navigate to the process list filtered to show only processes linked to a specific SOP
- AC-SOP-06c: Process records are shown in read-only mode for Ops Excellence users

### US-SOP-07 — Transactional Derivation: Failure Recovery
**As a** Business Analyst,
**I want to** receive a clear error if the process creation fails, with no partial records created,
**So that** I can safely retry without cleaning up orphaned data.

**Acceptance Criteria:**
- AC-SOP-07a: If the plugin throws at any point during record creation, no partial records remain in Dataverse
- AC-SOP-07b: The wizard displays the error message returned by the plugin
- AC-SOP-07c: The Retry button on the error screen re-invokes the wizard submission with the same payload
- AC-SOP-07d: After a failed invocation, the wizard retains all BA-entered data

---

## 9. CRM Schema and Data Model

### 9.1 New Entity: qdb_role (Role)

| Field | Logical Name | Type | Description | Required |
|-------|-------------|------|-------------|----------|
| Name | `qdb_name` | Text (100) | Role display name | Yes |
| Description | `qdb_description` | Memo | Role description | No |
| Department | `qdb_department` | Text (100) | Organisational department | No |
| Status | `qdb_status` | Option Set | Active (100000000) / Inactive (100000001) | Yes (default: Active) |

Ownership: User or Team owned (standard Dataverse pattern).

### 9.2 New Entity: qdb_sop (Standard Operating Procedure)

| Field | Logical Name | Type | Description | Required |
|-------|-------------|------|-------------|----------|
| Name | `qdb_name` | Text (200) | SOP display name | Yes |
| Description | `qdb_description` | Memo | SOP description | No |
| Purpose | `qdb_purpose` | Memo | Business purpose statement | No |
| Status | `qdb_status` | Option Set | Draft (100000000) / Published (100000001) / Retired (100000002) | Yes (default: Draft) |
| Version | `qdb_version` | Text (20) | SOP version label (e.g. "1.0") | No |
| Record Type | `qdb_recordtype_id` | Lookup (`qdb_work_item_record_types`) | The work item record type this SOP governs | No |

### 9.3 New Entity: qdb_sopstep (SOP Step)

| Field | Logical Name | Type | Description | Required |
|-------|-------------|------|-------------|----------|
| Name | `qdb_name` | Text (200) | Step display name | Yes |
| Description | `qdb_description` | Memo | Step description | No |
| Sequence No | `qdb_sequenceno` | Integer (Whole Number) | Step order within SOP | Yes |
| SOP | `qdb_sop_id` | Lookup (`qdb_sop`) | Parent SOP reference | Yes |
| Role | `qdb_role_id` | Lookup (`qdb_role`) | Responsible role | No |

### 9.4 New Entity: qdb_sopoutcome (SOP Outcome)

| Field | Logical Name | Type | Description | Required |
|-------|-------------|------|-------------|----------|
| Name | `qdb_name` | Text (200) | Outcome display name | Yes |
| Sequence No | `qdb_sequenceno` | Integer (Whole Number) | Outcome order within step | Yes |
| SOP Step | `qdb_sopstep_id` | Lookup (`qdb_sopstep`) | Parent SOP step reference | Yes |
| Next SOP Step | `qdb_nextsopstep_id` | Lookup (`qdb_sopstep`) | Next step in SOP flow (null = terminal) | No |

### 9.5 Modified Entity: qdb_workitemprocess (add one field)

| Field | Logical Name | Type | Description | Required |
|-------|-------------|------|-------------|----------|
| Source SOP | `qdb_sop_id` | Lookup (`qdb_sop`) | Optional: source SOP this process was derived from | No |

> This is the only change to an existing entity. The field is nullable; all existing process records remain unaffected.

### 9.6 Entity Relationship Diagram

```
qdb_work_item_record_types (1)
    └── (1:N qdb_recordtype_id) ──► qdb_sop (SOP)
              qdb_name | qdb_description | qdb_purpose
              qdb_status | qdb_version | qdb_recordtype_id
              │
              ├── (1:N qdb_sop_id) ──► qdb_sopstep (SOP Step)
              │         qdb_name | qdb_description | qdb_sequenceno
              │         qdb_sop_id | qdb_role_id ──► qdb_role
              │         │
              │         └── (1:N qdb_sopstep_id) ──► qdb_sopoutcome (SOP Outcome)
              │                   qdb_name | qdb_sequenceno
              │                   qdb_sopstep_id
              │                   qdb_nextsopstep_id ──► qdb_sopstep (nullable)
              │
              └── (1:N qdb_sop_id) ──► qdb_workitemprocess (Process — existing)
                        + qdb_sop_id (new nullable lookup)

qdb_role
    qdb_name | qdb_description | qdb_department | qdb_status
```

### 9.7 Custom Action: qdb_CreateProcessFromSop

**Input Parameters:**

| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| `SopId` | EntityReference | The source SOP record | Yes |
| `ProcessName` | String | Name for the new process | Yes |
| `ProcessDescription` | String | Description for the new process | No |
| `TaskEntity` | String | CRM entity logical name for tasks | Yes |
| `RegardingField` | String | Attribute on the task entity | No |
| `ParentEntity` | String | Parent entity logical name | No |
| `StepAssignments` | String | JSON array of per-step assignment configs | Yes |

**StepAssignments JSON Schema:**
```typescript
interface StepAssignment {
  sopStepId: string;          // GUID of the source qdb_sopstep
  taskSubject: string;        // Task subject for the derived step
  assignToType: number | null; // 100000000 = Specific User, 100000002 = Team, null = unassigned
  assignedUserId?: string;    // GUID of systemuser (if assignToType = 100000000)
  teamId?: string;            // GUID of team (if assignToType = 100000002)
  enableRoundRobin?: boolean; // Round-robin flag (if Team)
  roundRobinTeamId?: string;  // GUID of round-robin team (if round-robin enabled)
}
```

**Output Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `ProcessId` | EntityReference | The newly created qdb_workitemprocess record |

---

## 10. UI/UX Requirements

### 10.1 Navigation — Tab Structure

The existing designer shell shall be extended with a top-level navigation toggle or tab bar:
- Processes (existing — default)
- SOPs (new)
- Roles (new — Ops Excellence only; hidden or read-only for BA)

### 10.2 SOP List Screen

| Column | Source | Sortable |
|--------|--------|----------|
| Name | `qdb_name` | Yes |
| Record Type | `qdb_recordtype_id.name` | Yes |
| Status | `qdb_status` (badge) | Yes |
| Version | `qdb_version` | No |
| Modified On | `modifiedon` | Yes |
| Derived Processes | Computed count | No |

Actions per row (Ops Excellence): Edit, Retire
Actions per row (BA): View (read-only), Create Process from SOP (Published SOPs only)

### 10.3 SOP Canvas — Simplified Command Bar

| Control | Available to | Action |
|---------|-------------|--------|
| Save | Ops Excellence | Persist current SOP as Draft |
| Publish | Ops Excellence | Validate then publish |
| Retire | Ops Excellence | Retire the SOP |
| Auto Layout | Ops Excellence | Apply ELK/Dagre layout |
| Create Process from SOP | BA | Launch three-step wizard |

### 10.4 SOP Step Node — Visual Spec

```
┌─────────────────────────────────────────┐
│  [seq#]  Step Name                       │
│          ──────────────────────────────  │
│          [Role Badge: Role Name]         │
└─────────────────────────────────────────┘
```

Role Badge: blue pill for Active role; grey pill for Inactive role; empty state shows "No Role Assigned" in muted text.

### 10.5 SOP Outcome Node — Visual Spec

Same styling as existing `OutcomeNode` (colour-coded by name pattern) with no additional badges.

### 10.6 "Create Process from SOP" Wizard

Step indicator shows current step position (1 of 3, 2 of 3, 3 of 3).

**Step 1 — Identity:**
- Process Name (text input, pre-filled from SOP name, required)
- Source SOP (read-only display field)
- Record Type (read-only display field, from SOP)
- Description (textarea, optional)

**Step 2 — CRM Binding:**
- Task Entity (searchable lookup, required)
- Regarding Field (dependent lookup, optional)
- Parent Entity (searchable lookup, optional)

**Step 3 — Step Assignments:**
- Rendered as a vertical list of cards, one per SOP step in sequence order
- Each card: step name, role badge (from SOP), task subject (pre-filled from step name, editable), Assign To type selector, conditional user/team/round-robin fields

Footer buttons: Cancel | Back | Next (Steps 1–2) | Submit (Step 3)

### 10.7 Roles Screen

Simple data grid (Fluent UI DataGrid):

| Column | Type |
|--------|------|
| Name | Text |
| Department | Text |
| Status | Badge (Active/Inactive) |
| Description | Text (truncated) |
| Actions | Edit / Deactivate (Ops Excellence only) |

---

## 11. Integration Requirements

### 11.1 Dataverse Entities — New Entity Setup

All five schema changes (four new entities + one field) must be packaged in the CRM managed solution `qdb_WorkflowDesigner` as an additive delta. Solution version: 1.1.0.0.

### 11.2 Dataverse Custom Action Registration

`qdb_CreateProcessFromSop` must be registered as a Dataverse Custom Action (message) via the Plugin Registration Tool. Plugin assembly: `Qdb.WorkflowDesigner.Plugins.dll`. Step registration: synchronous, pre-operation, server scope. Transaction enabled: yes.

### 11.3 ICrmAdapter Extension

New methods to be added to `ICrmAdapter` (and implemented in both `DataverseAdapter` and `ODataAdapter`):

```typescript
// Role CRUD
getRoles(search?: string): Promise<CrmRole[]>;
createRole(data: CreateRoleRequest): Promise<string>;
updateRole(id: string, data: UpdateRoleRequest): Promise<void>;
deleteRole(id: string): Promise<void>;

// SOP CRUD
getSopList(): Promise<SopSummary[]>;
getSop(id: string): Promise<Sop>;
createSop(data: CreateSopRequest): Promise<string>;
updateSop(id: string, data: UpdateSopRequest): Promise<void>;

// SOP Steps
getSopSteps(sopId: string): Promise<SopStep[]>;
createSopStep(data: CreateSopStepRequest): Promise<string>;
updateSopStep(id: string, data: UpdateSopStepRequest): Promise<void>;
deleteSopStep(id: string): Promise<void>;

// SOP Outcomes
getSopOutcomes(sopStepId: string): Promise<SopOutcome[]>;
createSopOutcome(data: CreateSopOutcomeRequest): Promise<string>;
updateSopOutcome(id: string, data: UpdateSopOutcomeRequest): Promise<void>;
deleteSopOutcome(id: string): Promise<void>;

// Derivation
createProcessFromSop(request: CreateProcessFromSopRequest): Promise<string>; // returns new ProcessId
```

---

## 12. Assumptions

| ID | Assumption |
|----|------------|
| A-SOP-01 | The existing four CRM entities from CWFD-001 are deployed and accessible — this feature builds on that confirmed baseline |
| A-SOP-02 | The existing `qdb_workitemprocess` entity can accept the new nullable `qdb_sop_id` lookup field without breaking existing forms, views, or plugins |
| A-SOP-03 | The Dataverse org at `https://org5869857f.crm4.dynamics.com` is used for development and testing; the managed solution will be targeted at this org |
| A-SOP-04 | The client CRM platform team will approve the new entity schema additions before Phase 4 (Build) begins |
| A-SOP-05 | Ops Excellence and BA are distinct Dataverse security roles that can be targeted with separate privilege sets |
| A-SOP-06 | The plugin infrastructure (C# .NET, Plugin Registration Tool access) used for CWFD-001 is available for CWFD-002 |
| A-SOP-07 | The `qdb_work_item_record_types` entity (record type lookup target for `qdb_sop.qdb_recordtype_id`) is the same entity as used in the existing process entity (`qdb_work_item_record_type`) — confirmation required if logical name differs |
| A-SOP-08 | Maximum SOP depth is 50 steps; this keeps the Custom Action well within the 2-minute plugin execution limit |

---

## 13. Constraints

| ID | Constraint |
|----|------------|
| C-SOP-01 | All new functionality must be delivered within the existing single CRM Web Resource artifact — no new separate web resources or SPAs |
| C-SOP-02 | The `qdb_CreateProcessFromSop` Custom Action must operate within the 2-minute CRM plugin execution limit |
| C-SOP-03 | No changes to existing process, step, or outcome entities beyond the single nullable `qdb_sop_id` lookup on `qdb_workitemprocess` |
| C-SOP-04 | Publisher prefix `qdb` is fixed (inherited from CWFD-001 constraint C-07) |
| C-SOP-05 | The feature must not add new external npm dependencies that push the eager bundle past the 4,500 KB CI gate |
| C-SOP-06 | Security enforcement for Ops Excellence vs. BA privilege separation must be at the Dataverse entity privilege level, not solely at the UI layer |
| C-SOP-07 | The SOP canvas must reuse the existing ReactFlow canvas component and Zustand store architecture — no parallel canvas implementation |

---

## 14. Dependencies

| ID | Dependency | Type | Risk |
|----|-----------|------|------|
| D-SOP-01 | CWFD-001 build complete and deployed — new entities, adapter, store, and canvas patterns are the base | Internal | Low — CWFD-001 Phase 4 is complete |
| D-SOP-02 | Dataverse environment `org5869857f` accessible for development and testing | Client infrastructure | Low |
| D-SOP-03 | Plugin Registration Tool access for registering `qdb_CreateProcessFromSop` | Client infrastructure | Low |
| D-SOP-04 | Client CRM platform team approval for new entity schema | Client approval | Medium |
| D-SOP-05 | Existing `ICrmAdapter` interface — extension must not break existing adapter consumers | Internal | Low — additive extension only |
| D-SOP-06 | `qdb_work_item_record_types` entity schema (for `qdb_sop.qdb_recordtype_id` lookup target) | Client infrastructure | Low — confirmed present from CWFD-001 |

---

## 15. Risks and Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|-----------|
| R-SOP-01 | Plugin execution time exceeds 2-minute limit for very large SOPs | Low | High | Cap SOP step count at 50 (validation in plugin); architect to confirm safe threshold during Phase 3 extension |
| R-SOP-02 | `qdb_sop_id` field addition to existing process entity breaks existing views, forms, or plugins | Low | Medium | Add field as nullable with no default; test existing process CRUD end-to-end after field addition |
| R-SOP-03 | Security role privilege misconfiguration allows BA to create/edit SOPs or Ops Excellence to create processes | Medium | High | Architecture to define exact privilege set per role; validated by E2E test with each user group |
| R-SOP-04 | Bundle size increase from wizard and SOP canvas components pushes eager bundle past CI gate | Low | Medium | Wizard and SOP canvas components lazy-loaded; measured in Sprint 1 |
| R-SOP-05 | Ops Excellence does not enforce one Published SOP per record type (business policy, not hard constraint) | Medium | Low | Documented as a business policy in training material; future phase can add a hard uniqueness constraint |
| R-SOP-06 | BA leaves assignment fields blank for many steps; resulting process requires significant post-creation editing | Medium | Low | Wizard clearly communicates that assignments can be left blank; fields are optional per step |
| R-SOP-07 | `StepAssignments` JSON deserialisation in plugin fails due to malformed input | Low | Medium | Plugin validates JSON schema before deserialisation; returns specific validation error on failure |

---

## 16. Glossary

| Term | Definition |
|------|-----------|
| SOP | Standard Operating Procedure — an Ops Excellence-defined blueprint for a class of workflow process |
| SOP Step | A step within an SOP, representing a phase of the procedure assigned to a Role |
| SOP Outcome | A decision output from an SOP step, connecting to the next SOP step in the flow |
| Role | An organisational role (e.g., "Senior Case Manager", "Compliance Officer") managed by Ops Excellence and assignable to SOP steps |
| Derivation | The act of creating a concrete `qdb_workitemprocess` (with steps and outcomes) from a published SOP blueprint |
| qdb_CreateProcessFromSop | Dataverse Custom Action (server-side C# plugin) that performs the transactional derivation of a process from an SOP |
| Ops Excellence | The user group responsible for defining, publishing, and maintaining SOPs and roles |
| BA | Business Analyst — the user group responsible for configuring and managing workflow processes |
| Two-Tier System | The architectural pattern where Tier 1 is SOP blueprints (Ops Excellence) and Tier 2 is concrete processes (BA) |
| "From SOP" Badge | A visual indicator on the process list showing that a process was derived from a published SOP |
| Terminal Outcome | An SOP outcome or process outcome where `qdb_nextsopstep_id` / next step reference is null, indicating the end of the flow |
| ICrmAdapter | The TypeScript interface in CWFD-001 that abstracts all Dataverse/CRM API calls; extended in this feature with SOP and Role methods |

---

*End of Business Requirements Document — CWFD-002 SOP Designer v1.0*
*Prepared by Maqsad AI Business Analyst Agent | 2026-06-12*
*Parent Project: CWFD-001 CRM Visual Workflow Designer*
