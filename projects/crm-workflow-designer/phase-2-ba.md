═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-04-29
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════


---

## 1. EXECUTIVE SUMMARY

The organisation operates a Dynamics CRM on-premise (v9.1) environment in which a custom plugin already reads and executes workflow definitions stored as JSON on a custom CRM entity. Currently, creating and editing those workflow definitions requires direct JSON manipulation, which is error-prone, inaccessible to non-technical staff, and produces no visual audit trail of workflow logic. This project delivers a self-contained HTML Web Resource — bundled React 18 + React Flow — deployed inside CRM, that gives administrators and business analysts a drag-and-drop visual canvas for designing, configuring, saving, and loading workflow definitions. The tool writes its output to the same custom entity the existing execution plugin already reads, requiring zero changes to backend code. Success is measured by eliminating manual JSON editing entirely and enabling a non-developer administrator to build and publish a complete workflow within 15 minutes without support.


---

## 2. BUSINESS OBJECTIVES

1. Enable **CRM Administrators** to create workflow definitions visually so that manual JSON authoring is eliminated and human-error-induced execution failures are reduced to zero.
2. Enable **Business Analysts** to read and review existing workflow logic as a visual diagram so that workflow intent can be verified and communicated without developer involvement.
3. Enable **System Administrators** to save and version workflow definitions as standard CRM records so that workflow changes are tracked, auditable, and rollback-capable using native CRM record history.
4. Enable **CRM Administrators** to configure trigger conditions, branching logic, and multi-step action sequences through a guided UI so that workflows reaching the execution plugin are always structurally valid and schema-compliant.
5. Enable **Business Process Owners** to link workflow definitions to specific CRM entity records so that context-specific automation is discoverable and manageable without navigating raw entity lists.


---

## 3. STAKEHOLDERS

| Stakeholder | Role | Interest in this project |
|---|---|---|
| CRM Administrator | Primary user — designs and publishes workflows | Needs an intuitive, error-free UI to replace JSON editing |
| Business Analyst | Secondary user — reviews and documents workflow logic | Needs a readable visual diagram of automation rules |
| Business Process Owner | Approver — owns the business rules encoded in each workflow | Needs confidence that the visual representation matches intent |
| CRM Developer / Plugin Owner | Technical owner of the execution plugin | Needs the designer's JSON output to remain schema-compatible with the existing plugin |
| IT System Administrator | Deploys and maintains the web resource in CRM | Needs a deployable artifact (HTML + bundled JS/CSS) with clear deployment instructions |
| End Users (CRM record owners) | Indirectly affected — automation runs on their records | Not direct users of the designer; impacted by workflow correctness |
| Maqsad AI — Delivery Team | Builder | Needs complete, unambiguous requirements before building |


---

## 4. SCOPE

### 4.1 In Scope

- A single HTML Web Resource (HTML + bundled JS + CSS, one build artifact) deployable to Dynamics CRM on-premise v9.1.
- Visual canvas using React Flow for creating, editing, and viewing workflow node graphs.
- Support for all five node types: Trigger, Condition, Action (all five subtypes), Approval, and End.
- Node configuration panels that allow property entry per node type (entity selection, field selection, operator selection, value entry, user/team assignment, email template selection, delay duration).
- Dynamic loading of entity metadata (allowed-list entities and their fields) from CRM Web API (OData v4) at design time.
- Saving a completed workflow definition as a JSON string to the existing custom workflow entity via CRM Web API.
- Loading and re-rendering an existing workflow definition from the custom entity record.
- Linking a workflow definition record to a target CRM entity record (the entity the workflow fires on).
- Opening the designer in the context of an existing CRM record (via Xrm JavaScript API context).
- Opening the designer standalone from the custom workflow entity form.
- Client-side structural validation before save (schema conformance, no orphaned branches, every branch path terminates at an End node).
- Read-only / view mode for rendering existing workflows without edit capability.
- Build pipeline configuration (Vite or esbuild) that produces a single deployable bundle.
- Support for Microsoft Edge Chromium (modern, not IE Mode).

### 4.2 Out of Scope

- Workflow execution logic — the existing CRM plugin is unchanged; this project does not touch it.
- Modifications to the existing custom workflow entity schema (fields, relationships) — the entity is treated as-is.
- Creation or modification of CRM plugins, assemblies, or server-side code of any kind.
- User authentication or permission management — CRM's native role-based security governs access to the web resource.
- Workflow versioning UI (version history browsing, diff views) — CRM native audit log is the versioning mechanism.
- Real-time collaboration (multiple users editing the same workflow simultaneously).
- Workflow simulation or test-run capability within the designer.
- Import/export of workflow definitions to/from external systems or files.
- Mobile or tablet optimisation — desktop Edge Chromium only.
- Support for Internet Explorer or IE Compatibility Mode.
- Dynamics 365 Online / Dataverse cloud deployment — on-premise v9.1 only.
- Configuration of the administrator-managed allowed-list of entities/fields — that configuration is managed outside this tool.
- Email template creation or management — templates are selected from existing CRM email templates only.


---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Canvas and Navigation

**FR-001:** The system shall render an interactive, pannable, and zoomable canvas using React Flow when the web resource is loaded in a supported browser.

**FR-002:** The system shall display a toolbar with buttons to Add Node, Save, Load, Validate, and Toggle View Mode when the canvas is active.

**FR-003:** The system shall support zoom levels between 25% and 200% via mouse wheel and explicit zoom controls.

**FR-004:** The system shall allow the user to drag any node to reposition it on the canvas without losing its connections.

**FR-005:** The system shall allow the user to connect two nodes by dragging from a source handle to a target handle on a different node.

**FR-006:** The system shall allow the user to delete a node by selecting it and pressing the Delete key or clicking a delete icon, and shall simultaneously remove all edges connected to that node.

**FR-007:** The system shall allow the user to delete an edge by selecting it and pressing the Delete key or clicking a delete icon.

**FR-008:** The system shall auto-fit the workflow graph to the visible canvas area when a workflow definition is loaded from a CRM record.

### 5.2 Node Types and Configuration

**FR-009:** The system shall support exactly one Trigger node per workflow graph; attempting to add a second Trigger node shall display an error message and prevent the addition.

**FR-010:** The system shall render a Trigger node with the following configurable properties: target entity (selected from the allowed-list), trigger event (Created / Updated / Deleted), and an optional field condition filter (field, operator, value).

**FR-011:** The system shall render a Condition node with the following configurable properties: field (from the target entity's allowed field list), comparison operator (Equals / Not Equals / Greater Than / Less Than / Contains / Is Null / Is Not Null), and comparison value; the node shall expose exactly two output handles labelled "True" and "False".

**FR-012:** The system shall render an Action node — subtype Update Field — with the following configurable properties: target record scope (current record / related record), target entity (from allowed-list), target field (from allowed field list), and new value.

**FR-013:** The system shall render an Action node — subtype Send Email — with the following configurable properties: recipient type (Owner / Specific User / Team), recipient identifier (user or team lookup from CRM), and email template (selected from existing CRM email templates via Web API).

**FR-014:** The system shall render an Action node — subtype Create Record — with the following configurable properties: target entity (from allowed-list) and a list of field-value pairs to populate on the new record.

**FR-015:** The system shall render an Action node — subtype Assign Record — with the following configurable properties: target record scope (current record / related record) and new owner (user or team lookup from CRM).

**FR-016:** The system shall render an Action node — subtype Wait/Delay — with the following configurable properties: duration (integer) and unit (Hours / Days).

**FR-017:** The system shall render an Approval node with the following configurable properties: assigned-to type (User / Team), assigned-to identifier (lookup from CRM), and an optional instructions text field; the node shall expose exactly two output handles labelled "Approved" and "Rejected".

**FR-018:** The system shall render an End node with the following configurable properties: terminal status (Completed / Error) and an optional status reason text field.

**FR-019:** The system shall open a configuration side-panel or modal when the user double-clicks any node, displaying that node's editable properties and a Save / Cancel action.

**FR-020:** The system shall persist node configuration changes to the in-memory graph state when the user confirms via the side-panel Save action, without writing to CRM until the canvas-level Save action is invoked.

### 5.3 Dynamic Metadata Loading

**FR-021:** The system shall retrieve the administrator-configured allowed-list of entities from CRM (via Web API or a dedicated configuration record) when the canvas initialises and before any entity selection control is rendered.

**FR-022:** The system shall retrieve field metadata for a selected entity from the CRM Web API (OData v4 EntityDefinitions endpoint) when an entity is selected in a node configuration panel, and shall populate the field selection dropdown with the fields present in that entity's allowed field list.

**FR-023:** The system shall display a loading indicator while entity metadata is being retrieved and shall not permit node configuration submission during a pending metadata fetch.

**FR-024:** The system shall display a user-readable error message if a metadata fetch fails and shall allow the user to retry the fetch without reloading the page.

**FR-025:** The system shall retrieve the list of active CRM email templates via Web API when the Send Email action node configuration panel is opened.

**FR-026:** The system shall retrieve the list of active CRM users and teams via Web API when a node configuration panel requires a user/team assignment field.

### 5.4 Save and Load

**FR-027:** The system shall serialise the complete workflow graph — all nodes, their positions, their configuration properties, and all edges — into a JSON string conforming to the defined workflow definition schema when the Save action is invoked.

**FR-028:** The system shall write the serialised JSON string to the designated JSON field on the workflow definition custom entity record via a CRM Web API PATCH request when Save is invoked for an existing record.

**FR-029:** The system shall create a new workflow definition custom entity record via a CRM Web API POST request and write the serialised JSON to the designated field when Save is invoked for a new workflow that has not yet been persisted.

**FR-030:** The system shall display a success notification visible for at least 3 seconds after a successful save operation.

**FR-031:** The system shall display a descriptive error notification and preserve the unsaved canvas state if a save operation fails due to a CRM Web API error.

**FR-032:** The system shall read the JSON field value from a workflow definition custom entity record via CRM Web API when the user opens the designer from an existing record context.

**FR-033:** The system shall deserialise the loaded JSON and reconstruct the workflow graph — all nodes with their positions and configuration, and all edges — on the canvas after a successful load.

**FR-034:** The system shall detect when the Xrm context provides a current record ID and shall automatically load that record's workflow definition on canvas initialisation without requiring a manual Load action.

### 5.5 Validation

**FR-035:** The system shall validate that the workflow graph contains exactly one Trigger node before allowing a save operation to proceed.

**FR-036:** The system shall validate that every Condition node has both its "True" and "False" output handles connected to a downstream node before allowing a save operation to proceed.

**FR-037:** The system shall validate that every Approval node has both its "Approved" and "Rejected" output handles connected to a downstream node before allowing a save operation to proceed.

**FR-038:** The system shall validate that every branch path in the graph terminates at an End node and does not contain a cycle before allowing a save operation to proceed.

**FR-039:** The system shall validate that every required configuration property on every node is populated before allowing a save operation to proceed.

**FR-040:** The system shall display a validation error panel listing all validation failures — identified by node label or type — when validation fails, and shall not proceed with the save.

**FR-041:** The system shall highlight nodes that have validation failures on the canvas with a visible error indicator (red border or icon) until the failures are resolved.

### 5.6 View Mode

**FR-042:** The system shall provide a read-only View Mode in which all node editing, dragging, and connection actions are disabled and no save controls are visible.

**FR-043:** The system shall allow toggling between Edit Mode and View Mode via a button in the toolbar without reloading the canvas or losing unsaved changes.

**FR-044:** The system shall render the workflow graph in View Mode when the current CRM user does not have write privilege on the workflow definition entity, as determined by the Xrm privilege check at load time.

### 5.7 Record Linking

**FR-045:** The system shall accept a target entity name and target record ID as parameters (via the web resource URL data parameter or Xrm context) and shall pre-populate the workflow definition's target entity field with those values when creating a new workflow from a record's form.

**FR-046:** The system shall store the target entity logical name on the workflow definition record when saving, so that the execution plugin can identify which entity the workflow applies to.


---

## 6. NON-FUNCTIONAL REQUIREMENTS

**NFR-001: Performance — Initial Load**
The web resource canvas, including React Flow bundle initialisation and the initial allowed-list metadata fetch, shall complete and render an interactive canvas within 4 seconds on a client machine meeting the minimum spec (4 GB RAM, Edge Chromium, LAN connection to CRM server).

**NFR-002: Performance — Save Operation**
A save operation for a workflow containing up to 50 nodes and 60 edges shall complete (Web API PATCH/POST round-trip acknowledged) within 3 seconds under normal LAN network conditions.

**NFR-003: Performance — Metadata Fetch**
The field metadata fetch for any single entity shall return and populate the field dropdown within 2 seconds from the moment of entity selection under normal LAN conditions.

**NFR-004: Performance — Canvas Rendering**
Dragging, connecting, and deleting nodes on a graph containing up to 50 nodes shall maintain a minimum 30 frames per second render rate with no perceptible jank on a modern desktop CPU.

**NFR-005: Availability**
The web resource is served directly from CRM; its availability is equal to and dependent on the CRM on-premise instance availability. No additional availability requirement is imposed on the web resource itself.

**NFR-006: Browser Compatibility**
The web resource shall function correctly in Microsoft Edge Chromium version 110 and above. No requirement exists for Internet Explorer, IE Mode, Firefox, or Chrome.

**NFR-007: Bundle Size**
The total size of the deployable bundle (HTML + JS + CSS, all assets) shall not exceed 5 MB uncompressed, to remain within CRM web resource upload limits and ensure acceptable load time on LAN.

**NFR-008: Security — No Credential Storage**
The web resource shall not store, log, or transmit any CRM user credentials. All API calls shall use the authenticated CRM session cookie established by the CRM login context; no additional authentication tokens shall be introduced.

**NFR-009: Security — Input Sanitisation**
All text inputs within node configuration panels (free-text fields such as instructions, status reason, email content parameters) shall be sanitised before being serialised to JSON to prevent stored XSS payloads being rendered by downstream components.

**NFR-010: Security — API Call Scope**
All CRM Web API calls made by the web resource shall be scoped to the OData endpoints already exposed by the CRM server. The web resource shall not call any external URLs, CDNs, or third-party services at runtime. All library dependencies shall be bundled at build time.

**NFR-011: Scalability — Node Volume**
The designer shall support workflow graphs of up to 50 nodes and 60 edges without degradation in interaction performance below the thresholds defined in NFR-004.

**NFR-012: Scalability — Concurrent Users**
The web resource places load on the CRM Web API only at save/load and metadata-fetch events. The tool shall not introduce any persistent server-side state; concurrent use by up to 20 simultaneous designers shall be supported without additional infrastructure.

**NFR-013: Compliance — CRM Data Residency**
All workflow definition data shall be stored exclusively within the on-premise CRM SQL Server database via the standard CRM entity storage mechanism. No workflow data shall leave the on-premise environment.

**NFR-014: Maintainability — Build Reproducibility**
The build pipeline shall be fully specified in a checked-in configuration file (vite.config.ts or esbuild config) such that any developer can reproduce the identical bundle by running a single documented command.

**NFR-015: Accessibility**
All interactive controls (buttons, dropdowns, text inputs) within the web resource shall have accessible labels (aria-label or associated label elements) to meet WCAG 2.1 Level AA for keyboard navigation and screen-reader compatibility.


---

## 7. BUSINESS RULES

**BR-001:** A workflow definition record must have exactly one Trigger node. A graph without a Trigger node, or with more than one Trigger node, is invalid and must not be saved.

**BR-002:** Every execution path from the Trigger node must terminate at an End node. Dangling branches (edges leading to nothing) constitute an invalid graph.

**BR-003:** Cycles in the workflow graph are prohibited. A node may not, through any sequence of directed edges, reach itself.

**BR-004:** Every Condition node must have exactly two outgoing edges — one from the "True" handle and one from the "False" handle. A Condition node with a missing or unconnected branch is invalid.

**BR-005:** Every Approval node must have exactly two outgoing edges — one from the "Approved" handle and one from the "Rejected" handle. An Approval node with a missing or unconnected branch is invalid.

**BR-006:** An End node must have no outgoing edges. An End node with an outgoing edge is invalid.

**BR-007:** The target entity on a workflow definition record must be a member of the administrator-configured allowed-list. Entities not on the allowed-list must not appear in any entity selection control.

**BR-008:** The fields available for selection within any node configuration panel must be restricted to the fields present in the allowed field list for the selected entity. Fields not on the allowed field list must not be selectable.

**BR-009:** The JSON workflow definition stored on the CRM entity must conform to the schema expected by the existing execution plugin. Any deviation from that schema, detectable at save time via client-side schema validation, must block the save.

**BR-010:** A Wait/Delay node duration value must be a positive integer greater than zero. Zero or negative delay values are invalid.

**BR-011:** Email template selection in a Send Email action node is mandatory. A Send Email node without an assigned template is invalid.

**BR-012:** User/team assignment in an Approval node is mandatory. An Approval node without an assignee is invalid.

**BR-013:** A workflow definition record must have a unique name within the CRM organisation. The designer must display an error if a save would create a duplicate name, as enforced by the CRM entity constraint.

**BR-014:** Read-only View Mode must be enforced automatically when the CRM user's security role does not grant write privilege on the workflow definition entity. The UI must not offer edit controls in this case.

**BR-015:** Field value inputs in node configuration must respect the data type of the selected CRM field. Date fields must accept date values, numeric fields must accept numeric values, and option set fields must present a dropdown of valid option set labels.


---

## 8. USER STORIES

---

**US-01**
As a **CRM Administrator**, I want to open a blank visual canvas from the workflow definition entity form so that I can start designing a new workflow without editing raw JSON.

Priority: Must Have

Acceptance Criteria:
- Given: A CRM user with write access on the workflow definition entity navigates to the New record form
- When: The HTML web resource embedded on the form loads
- Then: An empty React Flow canvas is displayed with a toolbar containing Add Node, Save, Validate, and Toggle View Mode controls, and the canvas is interactive within 4 seconds

---

**US-02**
As a **CRM Administrator**, I want to add a Trigger node and configure which entity and event fires the workflow so that the execution plugin knows when to run this workflow.

Priority: Must Have

Acceptance Criteria:
- Given: An empty or partially built canvas
- When: The user adds a Trigger node and opens its configuration panel
- Then: The entity dropdown is populated with the allowed-list entities, the event dropdown offers Created / Updated / Deleted, and saving the panel reflects the configuration on the node label
- And: Attempting to add a second Trigger node displays an error and no second Trigger node appears on the canvas

---

**US-03**
As a **CRM Administrator**, I want to add Condition nodes and connect them so that the workflow can branch based on field values on the triggering record.

Priority: Must Have

Acceptance Criteria:
- Given: A canvas with a Trigger node
- When: The user adds a Condition node, connects it from the Trigger node, and opens its configuration panel
- Then: The field dropdown is populated with the allowed fields for the Trigger node's selected entity, the operator dropdown offers all supported operators, and the node renders two output handles labelled "True" and "False"
- And: When both handles are connected to downstream nodes, no validation error is raised for this node

---

**US-04**
As a **CRM Administrator**, I want to add Action nodes of each subtype and configure their properties so that the workflow can perform updates, emails, record creation, assignments, and delays.

Priority: Must Have

Acceptance Criteria:
- Given: A canvas with at least one preceding node
- When: The user adds an Action node and selects a subtype (Update Field / Send Email / Create Record / Assign Record / Wait/Delay)
- Then: The configuration panel displays only the properties relevant to that subtype
- And: For Send Email, the email template dropdown is populated from live CRM email templates
- And: For Assign Record, the owner lookup is populated from live CRM users and teams
- And: For Wait/Delay, a numeric duration input and a unit dropdown (Hours / Days) are present

---

**US-05**
As a **CRM Administrator**, I want to add an Approval node and configure its assignee so that the workflow can pause and wait for a human decision before continuing.

Priority: Must Have

Acceptance Criteria:
- Given: A canvas with at least one preceding node
- When: The user adds an Approval node and opens its configuration panel
- Then: Assignee type (User / Team) and assignee lookup controls are present
- And: The node renders two output handles labelled "Approved" and "Rejected"
- And: Saving the panel without selecting an assignee displays a validation error on the panel

---

**US-06**
As a **CRM Administrator**, I want to add End nodes to each terminal branch so that the execution plugin knows each path in the workflow has a defined conclusion.

Priority: Must Have

Acceptance Criteria:
- Given: One or more branch paths on the canvas that have no downstream connection
- When: The user adds an End node and connects it to the final node on a branch
- Then: The End node renders with a status dropdown (Completed / Error) and an optional status reason text field
- And: The End node has no output handles

---

**US-07**
As a **CRM Administrator**, I want to save the completed workflow definition to the CRM record so that the execution plugin can read and run it.

Priority: Must Have

Acceptance Criteria:
- Given: A valid workflow graph (passes all FR-035 through FR-039 checks) on the canvas
- When: The user clicks Save
- Then: The graph is serialised to JSON and written to the designated field on the CRM workflow entity record via Web API
- And: A success notification is displayed for at least 3 seconds
- And: No page reload occurs

---

**US-08**
As a **CRM Administrator**, I want to see clear validation errors when my workflow graph is incomplete so that I understand exactly what must be fixed before the workflow can be saved.

Priority: Must Have

Acceptance Criteria:
- Given: A workflow graph with one or more validation failures (missing branch, unconnected handle, missing required property)
- When: The user clicks Save or Validate
- Then: A validation error panel lists each failure with the affected node identified by label or type
- And: Each failing node is highlighted with a visible red border or error icon on the canvas
- And: The save does not proceed

---

**US-09**
As a **CRM Administrator**, I want to reload an existing workflow definition from a CRM record onto the canvas so that I can edit a previously saved workflow.

Priority: Must Have

Acceptance Criteria:
- Given: A CRM workflow entity record with a populated JSON definition field
- When: The web resource loads in the context of that record
- Then: The graph is automatically deserialised and rendered on the canvas with all nodes in their saved positions and all configuration preserved
- And: All edges between nodes are re-rendered correctly

---

**US-10**
As a **Business Analyst**, I want to view an existing workflow as a visual diagram in read-only mode so that I can understand and communicate the automation logic without risking accidental changes.

Priority: Must Have

Acceptance Criteria:
- Given: An existing workflow definition record loaded on the canvas
- When: The user is in View Mode (either toggled manually or enforced by insufficient write privileges)
- Then: All nodes and edges are rendered but no node can be moved, edited, connected, or deleted
- And: The Save button is not visible
- And: The canvas can still be panned and zoomed

---

**US-11**
As a **Business Process Owner**, I want to link a workflow definition to a specific CRM entity record so that the workflow is discoverable from within that record's context.

Priority: Should Have

Acceptance Criteria:
- Given: The designer is opened from a specific CRM entity record (e.g. an Account record)
- When: The canvas initialises
- Then: The target entity and record ID are pre-populated from the Xrm context
- And: The workflow definition record is saved with a lookup/reference to that originating record

---

**US-12**
As an **IT System Administrator**, I want the web resource to be deployable as a single build artifact so that I can upload it to CRM without managing multiple file dependencies.

Priority: Must Have

Acceptance Criteria:
- Given: The developer runs the documented build command
- Then: A single HTML file (with all JS and CSS inlined or bundled and referenced relatively) is produced in the output directory
- And: That single artifact can be uploaded directly to CRM as a web resource and functions correctly without any additional files being uploaded separately
- And: Total artifact size does not exceed 5 MB

---

## 9. DATA REQUIREMENTS

| Entity | Volume | Retention | Sensitivity |
|---|---|---|---|
| Workflow Definition (custom CRM entity — existing) | Up to 500 records per CRM organisation | Indefinite — retained as long as the workflow is in use; deleted manually by administrator | Internal |
| Workflow JSON Definition Field (text field on above entity) | Up to 100 KB per record | Same as parent record | Internal |
| CRM Entity Metadata (EntityDefinitions — read at runtime) | Read-only, not stored by designer; sourced live from CRM Web API | Not applicable — not persisted by the designer | Internal |
| CRM Email Templates (read at runtime) | Read-only list, not stored by designer | Not applicable | Internal |
| CRM Users and Teams (read at runtime for lookups) | Read-only list, not stored by designer | Not applicable | Internal |
| Allowed-list Configuration (entity/field allow-list — read at init) | One configuration record or set of records per deployment | Managed by administrator; not owned by this feature | Internal |

Notes:
- No personally identifiable information (PII) is created or stored by the designer itself. User/team names are stored as references (GUIDs) in the workflow JSON, not as copied data.
- No data leaves the on-premise environment. All API calls target the local CRM OData endpoint.
- The workflow JSON field must support a minimum of 100 KB of text to accommodate complex workflow graphs of up to 50 nodes.


---

## 10. (SECTION RESERVED — NOT APPLICABLE)

Section 10 is not part of the standard BRD template. Numbering continues at 11 to maintain template alignment.


---

## 11. INTEGRATION DEPENDENCIES

| System | Integration Type | Data Exchanged | Direction |
|---|---|---|---|
| Dynamics CRM On-Premise v9.1 — Custom Workflow Entity | CRM Web API (OData v4) REST — PATCH / POST | Workflow definition JSON string; workflow name; target entity; record linkage | Designer WRITES to CRM |
| Dynamics CRM On-Premise v9.1 — Custom Workflow Entity | CRM Web API (OData v4) REST — GET | Workflow definition JSON string for load/edit | Designer READS from CRM |
| Dynamics CRM On-Premise v9.1 — Entity Metadata (EntityDefinitions) | CRM Web API (OData v4) REST — GET | Entity logical names, field logical names, field data types, option set values | Designer READS from CRM |
| Dynamics CRM On-Premise v9.1 — Email Templates (templates entity) | CRM Web API (OData v4) REST — GET | Template ID, template name/subject | Designer READS from CRM |
| Dynamics CRM On-Premise v9.1 — SystemUser and Team entities | CRM Web API (OData v4) REST — GET | User/team GUIDs and display names for assignment lookups | Designer READS from CRM |
| Dynamics CRM On-Premise v9.1 — Allowed-list Configuration Record | CRM Web API (OData v4) REST — GET | List of allowed entity logical names and their permitted field logical names per deployment | Designer READS from CRM |
| Xrm JavaScript API (CRM client-side SDK) | In-process JavaScript API — no network call | Current record ID, current entity logical name, current user ID, user privilege check result | Designer READS from Xrm context |
| Existing CRM Execution Plugin (C# assembly — already deployed) | None — indirect coupling only | The plugin reads the JSON field written by the designer; no direct API call between designer and plugin | Plugin READS what Designer WRITES (decoupled via entity record) |
| Build Pipeline (Vite or esbuild — development time only) | Local build tool — not a runtime integration | Source TypeScript/JSX + React Flow dependency bundled into deployable artifact | Build-time only; not a runtime dependency |


---

## 12. ASSUMPTIONS

1. The existing custom workflow definition entity already has a text/memo field of sufficient size (minimum 100 KB) to store the serialised workflow JSON. If the field size is smaller, a schema change will be required before development begins — this is outside this project's scope but must be confirmed before FR-027 is implemented.

2. The existing CRM execution plugin reads a JSON field on the custom entity. The JSON schema that the plugin expects is fully documented and available to the delivery team before UI development begins. The designer's serialisation must conform exactly to this schema.

3. The CRM on-premise v9.1 Web API (OData v4) endpoint is enabled, accessible from the client browser on the same network, and supports the EntityDefinitions, email templates, systemuser, and team entity sets without additional configuration.

4. The administrator-managed allowed-list of entities and fields is stored as a readable CRM record or configuration entity. The exact entity/field names for that configuration record will be provided to the delivery team before FR-021 is implemented.

5. Edge Chromium (version 110+) is the standard browser deployed to all users who will access the visual designer. No legacy browser support is required.

6. The CRM deployment environment does not enforce a Content Security Policy (CSP) that would block inline scripts or prevent the bundled web resource from executing. If a CSP is in place, it will be adjusted by the IT System Administrator prior to deployment.

7. React Flow (reactflow.dev) is licensed under the MIT licence for the version to be adopted, making it suitable for enterprise use without royalty obligations.

8. The build step (Vite or esbuild) will be executed by a developer on a machine with Node.js installed. The CRM server is not involved in the build process.

9. CRM Web API calls made from within a web resource use the authenticated session established by CRM login; no additional CORS configuration, OAuth token management, or API key management is required.

10. The CRM organisation has no more than 500 workflow definition records at any time within the planning horizon, keeping entity data volumes manageable within the thresholds defined in section 9.

11. The delivery team has access to a Dynamics CRM on-premise v9.1 development environment that mirrors the production configuration for local testing and web resource deployment.

12. Email templates referenced in Send Email action nodes already exist in CRM before the workflow is designed. The designer does not create or manage templates.


---

## 13. CONSTRAINTS

1. **Deployment target:** The output must be a single HTML web resource deployable via the CRM Customisations > Web Resources interface. CRM on-premise v9.1 imposes a maximum web resource upload size; the bundle must not exceed 5 MB uncompressed (NFR-007).

2. **No server-side code:** The project may not introduce any new server-side components (no Node.js servers, no Azure Functions, no new CRM plugins or assemblies). All logic runs client-side within the web resource.

3. **No external runtime dependencies:** The web resource runs within the CRM browser context and must not make HTTP requests to any URL outside the CRM server. All JavaScript libraries (React, React Flow, etc.) must be bundled at build time.

4. **Execution plugin schema immutability:** The JSON schema written by the designer is dictated entirely by the existing execution plugin. The designer must adapt to that schema; the schema must not be changed to accommodate the designer.

5. **CRM SDK compatibility:** All CRM Web API calls must use OData v4 syntax compatible with CRM on-premise v9.1. CRM online-specific endpoints, Dataverse-specific APIs, or features introduced after v9.1 must not be used.

6. **Xrm API version:** The Xrm JavaScript API usage must be compatible with CRM v9.1 client API. No preview or online-only Xrm features may be used.

7. **Technology stack:** Per Maqsad AI standards, the frontend implementation uses React 18 + TypeScript + React Flow. Any deviation from these defaults requires an Architecture Decision Record (ADR) approved before implementation begins.

8. **Timeline:** Not specified by the requestor. To be determined during project planning following CEO BRD approval.

9. **Budget:** Not specified by the requestor. To be determined following CEO BRD approval.


---

## 14. RISKS AND OPEN QUESTIONS

| Risk / Question | Impact | Owner | Resolution Needed By |
|---|---|---|---|
| The exact JSON schema expected by the existing execution plugin has not been provided. If the schema is undocumented or ambiguous, the designer's serialisation may produce incompatible output. | HIGH — could render saved workflows unexecutable; breaks FR-027, BR-009 | CRM Developer / Plugin Owner | Before frontend development begins |
| The custom workflow entity's JSON text field may be sized below 100 KB. If so, complex graphs cannot be saved. | HIGH — blocks FR-027, FR-028, FR-029 | IT System Administrator | Before development begins; schema change may be needed |
| The structure and entity/field names of the allowed-list configuration record are unknown. If the format differs from assumptions, FR-021 and FR-022 cannot be implemented as specified. | HIGH — blocks all entity/field metadata loading | IT System Administrator / CRM Administrator | Before FR-021 development begins |
| A Content Security Policy on the CRM server may block inline scripts in the bundled web resource, preventing the React application from loading. | HIGH — would prevent the web resource from functioning at all | IT System Administrator | Before deployment to any environment |
| React Flow's commercial licence terms: the MIT licence assumption (Assumption 7) must be verified for the exact version adopted. The Pro/Enterprise tier has a different licence. | MEDIUM — could introduce licence compliance obligation | Delivery Team Lead / Legal | Before dependency adoption; github-researcher must confirm |
| The CRM Web API (EntityDefinitions) endpoint may return large payloads for entities with many fields, causing metadata fetches to exceed the 2-second NFR-003 threshold. | MEDIUM — degrades UX; NFR-003 may need adjustment or field-level filtering may be needed | Delivery Team — Frontend | During technical spike before full build |
| Simultaneous editing of the same workflow definition record by two administrators will result in a last-write-wins conflict with no warning. | MEDIUM — could silently overwrite another user's changes | Product / Business Process Owner | Accepted as known limitation (real-time collaboration is out of scope); consider adding a last-modified timestamp warning in a future version |
| The Xrm privilege check at load time (FR-044) must correctly map CRM security role privileges to the designer's edit/view mode toggle. If the privilege API behaves differently across CRM on-premise v9.1 patch levels, view-mode enforcement may not be reliable. | LOW-MEDIUM — a user without write access might see edit controls | Delivery Team — Frontend | During development; to be tested against the specific patch level in use |


---

## 15. GLOSSARY

| Term | Definition |
|---|---|
| Allowed-list | The administrator-configured set of CRM entities and, within each entity, the fields that are permitted to appear in the designer's entity and field selection controls. Entities and fields outside this list are not visible to designers. |
| Action Node | A workflow node that performs a side-effecting operation: Update Field, Send Email, Create Record, Assign Record, or Wait/Delay. Action nodes have one input handle and one output handle (no branching). |
| Approval Node | A workflow node that pauses execution and awaits a human approval decision. Exposes two output handles: "Approved" and "Rejected". |
| BRD | Business Requirements Document. The formal specification of what is to be built, agreed before design or code begins. |
| Bundle | The single deployable JavaScript file (and associated HTML wrapper) produced by the build step (Vite or esbuild) that combines all source code and library dependencies into one file for upload to CRM. |
| Canvas | The interactive graphical area rendered by React Flow within the web resource, on which nodes and edges are placed and connected. |
| Condition Node | A workflow node that evaluates a boolean expression against a field value and routes execution to a "True" or "False" branch. |
| CRM Web API | The OData v4 REST API exposed by Dynamics CRM on-premise v9.1, used by the designer to read metadata and save/load workflow records. |
| Custom Workflow Entity | The existing CRM custom entity that stores workflow definition records. This entity was created prior to this project and is not modified by this project. |
| Dataverse | Microsoft's cloud data platform underlying Dynamics 365 Online. Not applicable to this project (on-premise only), but mentioned for disambiguation. |
| Edge | A directed connection between two nodes on the React Flow canvas, representing the execution flow from one step to the next. |
| End Node | A terminal workflow node that marks the conclusion of a branch. Has no output handles. |
| Execution Plugin | The existing C# CRM plugin assembly (already deployed) that reads the workflow JSON from the custom entity and executes the defined steps when a CRM record event fires. Not modified by this project. |
| Handle | A connection point on a React Flow node. Source handles produce outgoing edges; target handles accept incoming edges. |
| HTML Web Resource | A CRM deployment artifact type: a self-contained HTML file (with embedded or bundled JS/CSS) hosted and served by CRM, rendered in an iframe within a CRM form or as a standalone page. |
| Node | A single step in the workflow graph, represented as a visual block on the canvas. Nodes have a type (Trigger, Condition, Action, Approval, End) and a set of configuration properties. |
| OData v4 | The protocol used by the CRM Web API for querying and mutating CRM data via HTTP. |
| React Flow | The open-source JavaScript library (reactflow.dev) used to render the interactive node graph canvas. Provides the drag-and-drop, edge-connection, and zoom/pan behaviours. |
| Trigger Node | The single entry-point node of every workflow graph. Defines which entity event (Created / Updated / Deleted) causes the execution plugin to invoke the workflow. |
| View Mode | A read-only rendering of the workflow canvas in which no editing actions are available. Used by analysts reviewing logic and enforced automatically for users without write privilege. |
| Workflow Definition | A complete, saved description of an automated business process, encoded as a JSON string on a custom CRM entity record, and rendered visually by this designer. |
| Xrm JavaScript API | The client-side JavaScript API provided by Dynamics CRM that gives web resources access to the current form context, record ID, user information, and privilege data. |


---

## 16. REQUIREMENTS TRACEABILITY MATRIX

| User Story | Functional Requirements | Test Case (QA fills) | Status |
|---|---|---|---|
| US-01 | FR-001, FR-002, FR-003 | TC-XXX (pending) | Draft |
| US-02 | FR-009, FR-010, FR-021, FR-022, FR-023, FR-024 | TC-XXX (pending) | Draft |
| US-03 | FR-005, FR-011, FR-021, FR-022 | TC-XXX (pending) | Draft |
| US-04 | FR-012, FR-013, FR-014, FR-015, FR-016, FR-019, FR-020, FR-025, FR-026 | TC-XXX (pending) | Draft |
| US-05 | FR-017, FR-019, FR-020, FR-026 | TC-XXX (pending) | Draft |
| US-06 | FR-018, FR-019, FR-020 | TC-XXX (pending) | Draft |
| US-07 | FR-027, FR-028, FR-029, FR-030, FR-031, FR-035, FR-036, FR-037, FR-038, FR-039, FR-040, FR-041 | TC-XXX (pending) | Draft |
| US-08 | FR-035, FR-036, FR-037, FR-038, FR-039, FR-040, FR-041 | TC-XXX (pending) | Draft |
| US-09 | FR-032, FR-033, FR-034, FR-004, FR-008 | TC-XXX (pending) | Draft |
| US-10 | FR-042, FR-043, FR-044 | TC-XXX (pending) | Draft |
| US-11 | FR-045, FR-046 | TC-XXX (pending) | Draft |
| US-12 | NFR-007, NFR-014 | TC-XXX (pending) | Draft |


---

## 17. APPROVAL

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | Pending | PENDING | |
| Requestor | Pending | PENDING | |

═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════

---

BRD is complete. Submitting to CEO for approval before any design or code begins.