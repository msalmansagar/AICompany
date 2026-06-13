═══════════════════════════════════════════════════════════════════════
SOLUTION ARCHITECTURE — CWFD-002 SOP DESIGNER
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer — SOP Feature
Document:       phase-2-arch.md
Prepared by:    Architect — Maqsad AI
Date:           2026-06-12
Version:        1.0
Status:         PENDING CEO BUILD APPROVAL
Parent ADRs:    ADR-001 through ADR-007 (CWFD-001 adrs/)
BRD Version:    1.0 (sop-feature/brd.md)
CEO Conditions: COND-SOP-01 through COND-SOP-05 (brd-approval.md)
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — CEO CONDITION RESOLUTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All five CEO conditions from brd-approval.md are resolved here before
the architecture body is presented.

─────────────────────────────────────────────────────────────────────
COND-SOP-01 — Entity Logical Name Disambiguation (RESOLVED)
─────────────────────────────────────────────────────────────────────

Confirmed from live adapter source (src/services/DataverseAdapter.ts):

  Logical name:  qdb_work_item_record_type   (singular — confirmed)
  Entity set:    qdb_work_item_record_types   (plural — OData collection)

The BRD Section 9.2 contained a typo (`qdb_work_item_record_types` as
a lookup target). The correct lookup target for `qdb_sop.qdb_recordtype_id`
is the entity with logical name `qdb_work_item_record_type`.

All architecture and code artefacts in this document use the confirmed
singular logical name.

─────────────────────────────────────────────────────────────────────
COND-SOP-02 — ICrmAdapter Extension Impact Analysis (RESOLVED)
─────────────────────────────────────────────────────────────────────

Resolution: Interface Segregation via ISopAdapter sub-interface.

The existing ICrmAdapter covers the four original entities. Adding 16
SOP-related methods to ICrmAdapter would force ODataAdapter (On-Premise)
to implement SOP methods that On-Premise environments will never use.
The SOP feature is scoped to Online/Dataverse only.

ADR-008 (below) formalises the decision:

  interface ISopAdapter extends ICrmAdapter {
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
    createProcessFromSop(req: CreateProcessFromSopRequest): Promise<string>;
  }

DataverseAdapter implements ISopAdapter (extends ICrmAdapter).
ODataAdapter implements ICrmAdapter only — unchanged.

The SOP feature components receive ISopAdapter via a new
SopAdapterContext. SOP-feature components that need to check whether
the current environment supports SOPs call:

  const adapter = useSopAdapter(); // throws if not Online

useSopAdapter() performs a runtime guard: if the adapter injected into
SopAdapterContext is not an ISopAdapter instance, it throws a
FeatureUnavailableError with message "SOP Designer requires
Dynamics 365 Online". This surfaces a friendly error banner in the
SOP list screen.

Impact on existing code: ICrmAdapter is untouched. DataverseAdapter
gains new methods; ODataAdapter is untouched. Zero regression risk.

─────────────────────────────────────────────────────────────────────
COND-SOP-03 — SOP Canvas State Store Isolation (RESOLVED)
─────────────────────────────────────────────────────────────────────

Resolution: Separate sopStore (two independent stores).

Rationale (see ADR-009 below): The SOP canvas and Process canvas are
independent domain concerns with no shared state. They each carry their
own node sets, dirty tracking, undo history, and selection state.
Merging them into one store as slices would create hidden coupling
(e.g., a sopStore undo would affect workflowStore history if temporal
middleware is shared). Two separate stores is the correct Zustand pattern
for independent domains (Zustand discussion #2496 consensus).

sopStore interface mirrors workflowStore:

  interface SopDesignerState {
    sop: Sop | null;
    steps: Record<string, SopStep>;
    outcomes: Record<string, SopOutcome>;
    stepOrder: string[];
    outcomeOrder: Record<string, string[]>;
    nodePositions: Record<string, XYPosition>;
    newIds: Set<string>;
    dirtyIds: string[];
    deletedIds: string[];
    deletedEntityTypes: Record<string, 'sopstep' | 'sopoutcome'>;
    selectedId: string | null;
    isDirty: boolean;
    isSaving: boolean;
    previewMode: boolean;
    validationResults: SopValidationResult[];
  }

Wizard state (three-step "Create Process from SOP" form) lives in
local React useState within the WizardModal component — not in any
Zustand store. Wizard data is transient and does not survive component
unmount. This is intentional: if the user cancels and reopens the
wizard, they start fresh (consistent with the BRD intent).

─────────────────────────────────────────────────────────────────────
COND-SOP-04 — Plugin Transaction Scope (RESOLVED)
─────────────────────────────────────────────────────────────────────

Resolution: Custom API (not Custom Process Action).

As confirmed by GitHub Research (github-research.md), Dataverse Custom
API is the correct mechanism:

  Message name:   qdb_CreateProcessFromSop
  Binding:        Global (unbound) — not tied to a specific entity
  Execution mode: Synchronous
  Stage:          Post-operation (executes after the main operation;
                  "main operation" is the custom message itself)
  Transaction:    YES — Post-operation synchronous plugins on a Custom API
                  message participate in the platform database transaction.
                  If the plugin throws, all IOrganizationService operations
                  within the same plugin execution are rolled back.

Registration in Plugin Registration Tool:
  Assembly:    Qdb.WorkflowDesigner.Plugins.dll
  Plugin type: Qdb.WorkflowDesigner.Plugins.CreateProcessFromSopPlugin
  Step:        qdb_CreateProcessFromSop, Post-operation, Synchronous
  Entity:      none (global message)

Web API call from React:
  POST {orgUrl}/api/data/v9.2/qdb_CreateProcessFromSop
  Content-Type: application/json
  {
    "SopId": "qdb_sop@odata.bind=/qdb_sops({sopId})",
    "ProcessName": "...",
    "ProcessDescription": "...",
    "TaskEntity": "...",
    "RegardingField": "...",
    "ParentEntity": "...",
    "StepAssignments": "[{...}]"
  }

The DataverseAdapter.createProcessFromSop() method wraps this call.

─────────────────────────────────────────────────────────────────────
COND-SOP-05 — Bundle Size Delta (RESOLVED)
─────────────────────────────────────────────────────────────────────

CWFD-001 eager bundle baseline: ~532 KB gzip.
CI gate threshold: 4,500 KB.

SOP feature additions are all lazy-loaded (route-split on first
navigation to SOP or Roles screens):

| New Chunk | Contents | Est. Gzip |
|-----------|----------|-----------|
| lazy-sop | SOP list, SOP canvas, sopStore, ISopAdapter, SOP models, SOP validator | ~35 KB |
| lazy-wizard | CreateProcessFromSop wizard component (3 steps + Zod schemas) | ~12 KB |
| lazy-roles | Roles screen + CRUD dialogs | ~8 KB |
| SOP delta total | | ~55 KB |

Eager bundle impact: ~3–5 KB (AppProviders.tsx changes + navigation
tab addition + runtime ISopAdapter guard). Negligible.

Revised totals:

| | Size |
|---|---|
| Existing eager bundle | ~532 KB |
| SOP eager additions | ~4 KB |
| New eager total | ~536 KB |
| Existing lazy total | ~265 KB |
| New lazy (SOP feature) | ~55 KB |
| Peak total (all loaded) | ~856 KB |
| CI gate threshold | 4,500 KB |
| Headroom | ~3,644 KB |

Headroom is ample. The CI gate threshold of 4,500 KB is unchanged.
No new external npm packages are introduced by this feature.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — SYSTEM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The SOP Designer is a feature extension of the CWFD-001 CRM Visual
Workflow Designer. It lives entirely within the same single-artifact
web resource. No new deployable is introduced.

Architecturally, CWFD-002 adds:

1. FRONTEND: Three new lazy-loaded screen areas within the React app —
   SOP List + SOP Canvas (sopStore + SOP-specific ReactFlow nodes),
   the Create-Process-from-SOP Wizard (local state, RHF), and the
   Roles Management screen.

2. ADAPTER: A new ISopAdapter sub-interface extending ICrmAdapter,
   implemented only by DataverseAdapter. Fourteen new Dataverse API
   methods for qdb_role, qdb_sop, qdb_sopstep, qdb_sopoutcome entities,
   plus the Custom Action call.

3. PLUGIN: A new C# plugin class (CreateProcessFromSopPlugin) in the
   existing plugin assembly, registered as a Custom API handler.

4. SCHEMA: Four new Dataverse entities + one nullable lookup field on
   the existing qdb_work_item_record_type entity, packaged as a solution
   delta (version 1.1.0.0 of qdb_WorkflowDesigner).

ASCII Component Diagram:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Dynamics 365 UCI Shell                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                      Web Resource iframe                                │  │
│  │  (qdb_/workflow-designer/index.htm)                                     │  │
│  │                                                                         │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │  │
│  │  │  Top Navigation: [Processes] [SOPs] [Roles (Ops Excellence)]    │   │  │
│  │  └─────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                         │  │
│  │  Route: /processes  ──►  [EXISTING CWFD-001 Process Canvas]             │  │
│  │                          workflowStore | ICrmAdapter                    │  │
│  │                                                                         │  │
│  │  Route: /sops       ──►  [SOP List Screen]                    (lazy)    │  │
│  │                          ├── [SOP Canvas]                     (lazy)    │  │
│  │                          │   sopStore | ISopAdapter                     │  │
│  │                          │   SopStepNode | SopOutcomeNode               │  │
│  │                          │   SopCommandBar (Save/Publish/Retire)        │  │
│  │                          └── [Create Process from SOP Wizard]  (lazy)   │  │
│  │                              Local useState | RHF + Zod                 │  │
│  │                              ISopAdapter.createProcessFromSop()         │  │
│  │                                                                         │  │
│  │  Route: /roles      ──►  [Roles Screen]                       (lazy)    │  │
│  │                          ISopAdapter.getRoles/createRole/...            │  │
│  │                                                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │  │
│  │  │  Existing workflowStore (Zustand + Immer + Zundo) — unchanged    │  │  │
│  │  │  New sopStore (Zustand + Immer + Zundo) — SOP domain only        │  │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │  │
│  │  │  ICrmAdapter (existing) ◄── DataverseAdapter (implements both)   │  │  │
│  │  │  ISopAdapter (new)      ◄── DataverseAdapter                     │  │  │
│  │  │                             ODataAdapter (ICrmAdapter only)       │  │  │
│  │  └──────────────────────────┬───────────────────────────────────────┘  │  │
│  └────────────────────────────┼────────────────────────────────────────────┘  │
│                               │  Dataverse Web API v9.2                        │
│  ┌────────────────────────────▼────────────────────────────────────────────┐  │
│  │               Dataverse — qdb_* entities                                │  │
│  │  EXISTING: qdb_work_item_record_type  qdb_work_item_steps               │  │
│  │            qdb_outcome  qdb_outcomeworktasks                            │  │
│  │  NEW:      qdb_role  qdb_sop  qdb_sopstep  qdb_sopoutcome              │  │
│  │  MODIFIED: qdb_work_item_record_type + qdb_sop_id (nullable lookup)     │  │
│  │                                                                         │  │
│  │  Custom API: qdb_CreateProcessFromSop                                   │  │
│  │    ── CreateProcessFromSopPlugin (C#, synchronous, Post-op)             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — DATAVERSE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
New Entity: qdb_role
─────────────────────────────────────────────────────────────────────

Logical name:     qdb_role
Entity set name:  qdb_roles
Ownership:        User (OwnerId, OwningBusinessUnit — standard)
Primary field:    qdb_name

| Field Logical Name | Display Name | Type | Values / Notes | Required |
|--------------------|-------------|------|----------------|----------|
| qdb_name | Name | Text (100) | Role display name | Yes |
| qdb_description | Description | Memo | Role description | No |
| qdb_department | Department | Text (100) | Organisational dept | No |
| qdb_status | Status | Option Set (global: qdb_rolestatus) | Active=100000000, Inactive=100000001 | Yes (default: Active) |

─────────────────────────────────────────────────────────────────────
New Entity: qdb_sop
─────────────────────────────────────────────────────────────────────

Logical name:     qdb_sop
Entity set name:  qdb_sops
Ownership:        User
Primary field:    qdb_name

| Field Logical Name | Display Name | Type | Values / Notes | Required |
|--------------------|-------------|------|----------------|----------|
| qdb_name | Name | Text (200) | SOP display name | Yes |
| qdb_description | Description | Memo | — | No |
| qdb_purpose | Purpose | Memo | Business purpose | No |
| qdb_status | Status | Option Set (global: qdb_sopstatus) | Draft=100000000, Published=100000001, Retired=100000002 | Yes (default: Draft) |
| qdb_version | Version | Text (20) | Free-text label (e.g. "1.0") — entered by Ops Excellence | No |
| qdb_recordtype_id | Record Type | Lookup (qdb_work_item_record_type) | Governs which record type this SOP applies to | No |

Note on CLR-SOP-01 (version management): Version is free-text, entered
manually by Ops Excellence. No system-managed increment in v1. This resolves
the CEO clarification: the field is a label, not a counter.

─────────────────────────────────────────────────────────────────────
New Entity: qdb_sopstep
─────────────────────────────────────────────────────────────────────

Logical name:     qdb_sopstep
Entity set name:  qdb_sopsteps
Ownership:        User
Primary field:    qdb_name

| Field Logical Name | Display Name | Type | Values / Notes | Required |
|--------------------|-------------|------|----------------|----------|
| qdb_name | Name | Text (200) | Step display name | Yes |
| qdb_description | Description | Memo | — | No |
| qdb_sequenceno | Sequence No | Integer (Whole Number) | Step order within SOP | Yes |
| qdb_sop_id | SOP | Lookup (qdb_sop) | Parent SOP | Yes |
| qdb_role_id | Role | Lookup (qdb_role) | Responsible role | No |

─────────────────────────────────────────────────────────────────────
New Entity: qdb_sopoutcome
─────────────────────────────────────────────────────────────────────

Logical name:     qdb_sopoutcome
Entity set name:  qdb_sopoutcomes
Ownership:        User
Primary field:    qdb_name

| Field Logical Name | Display Name | Type | Values / Notes | Required |
|--------------------|-------------|------|----------------|----------|
| qdb_name | Name | Text (200) | Outcome display name | Yes |
| qdb_sequenceno | Sequence No | Integer (Whole Number) | Order within SOP step | Yes |
| qdb_sopstep_id | SOP Step | Lookup (qdb_sopstep) | Parent SOP step | Yes |
| qdb_nextsopstep_id | Next SOP Step | Lookup (qdb_sopstep) | Next step in flow (null = terminal) | No |

─────────────────────────────────────────────────────────────────────
Modified Entity: qdb_work_item_record_type (additive only)
─────────────────────────────────────────────────────────────────────

One new field added:

| Field Logical Name | Display Name | Type | Values / Notes | Required |
|--------------------|-------------|------|----------------|----------|
| qdb_sop_id | Source SOP | Lookup (qdb_sop) | Optional: SOP this process was derived from | No (nullable) |

No existing fields, views, forms, or relationships are modified.

─────────────────────────────────────────────────────────────────────
Entity OData Set Names (for adapter reference)
─────────────────────────────────────────────────────────────────────

```typescript
const SOP_LOGICAL = {
  role:       'qdb_role',
  sop:        'qdb_sop',
  sopstep:    'qdb_sopstep',
  sopoutcome: 'qdb_sopoutcome',
} as const;

const SOP_SET = {
  role:       'qdb_roles',
  sop:        'qdb_sops',
  sopstep:    'qdb_sopsteps',
  sopoutcome: 'qdb_sopoutcomes',
} as const;
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — FRONTEND ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
Navigation and Routing
─────────────────────────────────────────────────────────────────────

The existing App.tsx renders one active view based on a top-level
navigation state (not a URL router — this is a CRM Web Resource
with no address bar routing). CWFD-002 extends this:

```typescript
// src/app/App.tsx — extension
type AppView = 'processes' | 'sops' | 'roles';
```

The top-level tab bar renders all three tabs for Ops Excellence users
and hides "Roles" for BA users (privilege check via CrmEnvironmentService
user roles). The SOP, Wizard, and Roles screen components are
React.lazy() imports from the lazy-sop, lazy-wizard, and lazy-roles
chunks respectively.

─────────────────────────────────────────────────────────────────────
SOP Store (sopStore.ts)
─────────────────────────────────────────────────────────────────────

Location: src/store/sopStore.ts

```typescript
const useSopStore = create<SopDesignerState>()(
  temporal(
    immer(sopStoreImplementation),
    {
      partialize: (state) => ({
        sop: state.sop,
        steps: state.steps,
        outcomes: state.outcomes,
        stepOrder: state.stepOrder,
        outcomeOrder: state.outcomeOrder,
        nodePositions: state.nodePositions,
      }),
      limit: 50,
    }
  )
);
```

The same zundo temporal middleware as workflowStore. The two temporal
histories are completely independent — undoing on the SOP canvas does
not affect the process canvas undo stack.

─────────────────────────────────────────────────────────────────────
SOP Selectors
─────────────────────────────────────────────────────────────────────

Location: src/store/sopSelectors.ts

Mirrors the existing selectors.ts:
- `selectSopNodes()`: maps sopStore steps and outcomes to ReactFlow Node[]
- `selectSopEdges()`: maps sopStore outcomes to ReactFlow Edge[]
- SopStepNode renders from `SopStep` model via node data
- SopOutcomeNode renders from `SopOutcome` model via node data

─────────────────────────────────────────────────────────────────────
SOP Node Types
─────────────────────────────────────────────────────────────────────

| Node Type | CRM Entity | Handles | Additional Display |
|-----------|-----------|---------|-------------------|
| SopStepNode | qdb_sopstep | Top (target) + Bottom (source) | Name, sequence badge, Role Badge (role name + status colour) |
| SopOutcomeNode | qdb_sopoutcome | Left (target) + Right (source) | Name, sequence badge; colour-coded by name pattern (reuses OutcomeNode colour logic) |

SopStepNode Role Badge:
- Active role: blue pill, role name
- Inactive role: grey pill, role name + "(Inactive)" suffix
- No role: muted text "No Role Assigned"

─────────────────────────────────────────────────────────────────────
SOP Canvas Save Pipeline
─────────────────────────────────────────────────────────────────────

Mirrors the existing useWorkflowSave hook pattern:
Location: src/hooks/useSopSave.ts

```
Phase 1: Save qdb_sop (if new or dirty) — resolve SOP CRM ID
Phase 2: Save new/dirty qdb_sopstep records in stepOrder sequence
Phase 3: Save new/dirty qdb_sopoutcome records in outcomeOrder sequence
Phase 4: Execute deletions (outcomes first, then steps)
Phase 5: markSopSaved() — clear dirty tracking
```

─────────────────────────────────────────────────────────────────────
Wizard Architecture
─────────────────────────────────────────────────────────────────────

Location: src/components/CreateProcessWizard/

```
CreateProcessWizardModal.tsx   Modal shell; step counter; navigation
  Step1ProcessIdentity.tsx     RHF form: name, description (SOP + recordtype read-only)
  Step2CrmBinding.tsx          RHF form: taskEntity, regardingField, parentEntity
  Step3StepAssignments.tsx     Dynamic list of SopStepAssignmentCard per SOP step
  SopStepAssignmentCard.tsx    Per-step: taskSubject, assignToType, user/team/rr fields
  wizardSchemas.ts             Zod schemas for each step
  useWizardState.ts            useState hook managing wizard data and step index
```

Wizard state type:
```typescript
interface WizardState {
  currentStep: 0 | 1 | 2;
  step1: { processName: string; processDescription: string };
  step2: { taskEntity: string; regardingField: string; parentEntity: string };
  step3: StepAssignment[];
  isSubmitting: boolean;
  submitError: string | null;
}
```

Per-step validation: each step form calls `rhf.trigger(fieldNames)` on
Next click. If trigger returns false, the step does not advance.

Submission: Step3 Submit button calls
`ISopAdapter.createProcessFromSop(payload)`. On success, the wizard
closes and `onSuccess(newProcessId)` callback fires. AppController
switches to /processes view and opens the new process in the Edit Canvas.

─────────────────────────────────────────────────────────────────────
Roles Screen Architecture
─────────────────────────────────────────────────────────────────────

Location: src/components/RolesScreen/

```
RolesScreen.tsx            DataGrid of qdb_role records; Ops Excellence: edit/deactivate; BA: read-only
RoleFormDialog.tsx         Create/Edit dialog (Fluent UI Dialog + RHF + Zod)
roleSchemas.ts             Zod schema for qdb_role fields
useRoles.ts                React Query useQuery + useMutation for Role CRUD
```

Role deletion guard: UI "Delete" action is absent from the UI entirely.
Roles are managed by deactivation only (FR-SOP-05d policy: hard-delete
blocked server-side). The UI exposes only "Deactivate" for active roles
and "Activate" for inactive roles. The adapter updateRole() call sets
qdb_status = Inactive. If a future admin attempts hard-delete via direct
API call, the server-side delete plugin (see Section 5) will block it.

─────────────────────────────────────────────────────────────────────
SOP List Screen Architecture
─────────────────────────────────────────────────────────────────────

Location: src/components/SopListScreen/

```
SopListScreen.tsx          DataGrid of qdb_sop records
SopStatusBadge.tsx         Draft/Published/Retired colour badge
useSopList.ts              React Query for getSopList() with staleTime 30s
```

"Derived Process Count" column: Fetched via a single aggregate OData
query on initial load (one query, not N+1):

  GET /api/data/v9.2/qdb_work_item_record_types
  ?$select=qdb_work_item_record_typeid
  &$filter=_qdb_sop_id_value ne null
  &$apply=groupby((_qdb_sop_id_value),aggregate($count as derivedCount))

This provides a Map<sopId, count> for all SOPs in one round-trip.
(Resolves CEO clarification CLR-SOP-02.)

─────────────────────────────────────────────────────────────────────
"From SOP" Badge on Process List
─────────────────────────────────────────────────────────────────────

The existing Process List screen (in the CWFD-001 build) queries
qdb_work_item_record_type records. The query is extended to include
`_qdb_sop_id_value` and `_qdb_sop_id_value@OData.Community.Display.V1.FormattedValue`
(SOP name) in the $select clause.

The process list row component renders a Fluent UI `Badge` when
`_qdb_sop_id_value` is non-null. Clicking the badge fires
`onNavigateToSop(sopId)` which switches the view to /sops and opens
the referenced SOP in read-only mode.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — PLUGIN ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
CreateProcessFromSopPlugin
─────────────────────────────────────────────────────────────────────

Assembly:    Qdb.WorkflowDesigner.Plugins.dll (existing; new class added)
Namespace:   Qdb.WorkflowDesigner.Plugins
Class:       CreateProcessFromSopPlugin : IPlugin

Execution algorithm:

```
1. Retrieve input parameters from context.InputParameters:
   - SopId (EntityReference) — validated non-null
   - ProcessName (string) — validated non-empty
   - ProcessDescription (string) — nullable
   - TaskEntity (string) — validated non-empty
   - RegardingField (string) — nullable
   - ParentEntity (string) — nullable
   - StepAssignments (string) — JSON; validated before deserialise

2. Validate SOP exists and is Published:
   - service.Retrieve("qdb_sop", sopId, new ColumnSet("qdb_status"))
   - If qdb_status != 100000001 (Published): throw InvalidPluginExecutionException
     "SOP must be in Published status to derive a process."

3. Deserialise StepAssignments JSON:
   - Try JsonSerializer.Deserialize<List<StepAssignment>>(json)
   - On exception: throw InvalidPluginExecutionException
     "StepAssignments parameter contains invalid JSON."

4. Create qdb_work_item_record_type (Process):
   - Entity process = new Entity("qdb_work_item_record_type");
   - process["qdb_name"] = processName;
   - process["qdb_description"] = processDescription;
   - process["qdb_recordentity"] = taskEntity;
   - process["qdb_regardingfield"] = regardingField;
   - process["qdb_parententity"] = parentEntity;
   - process["qdb_sop_id"] = new EntityReference("qdb_sop", sopId);
   - Guid processId = service.Create(process);

5. Retrieve SOP steps ordered by qdb_sequenceno:
   - QueryExpression on qdb_sopstep
     where qdb_sop_id = sopId
     OrderBy qdb_sequenceno ascending
     Columns: qdb_sopstepid, qdb_name, qdb_sequenceno

6. For each sopStep: Create qdb_work_item_steps:
   - Lookup assignment config from StepAssignments by sopStepId
   - Entity step = new Entity("qdb_work_item_steps");
   - step["qdb_record_type"] = new EntityReference("qdb_work_item_record_type", processId);
   - step["qdb_name"] = sopStep["qdb_name"];
   - step["qdb_sequenceno"] = sopStep["qdb_sequenceno"];
   - step["qdb_tasksubject"] = assignment?.taskSubject ?? sopStep["qdb_name"];
   - step["qdb_recordentity"] = taskEntity;
   - step["qdb_regardingfield"] = regardingField;
   - step["qdb_parententity"] = parentEntity;
   - Apply assignment fields (qdb_task_assign_to, qdb_assigned_user,
     qdb_team, qdb_enableroundrobin, qdb_roundrobinteam) from config
   - Guid stepId = service.Create(step);
   - sopStepToWorkitemStep[sopStep.Id] = stepId;  // build mapping

7. For each sopStep: Retrieve SOP outcomes:
   - QueryExpression on qdb_sopoutcome
     where qdb_sopstep_id = sopStepId
     OrderBy qdb_sequenceno ascending
     Columns: qdb_sopoutcomeid, qdb_name, qdb_sequenceno, qdb_nextsopstep_id

8. For each sopOutcome: Create qdb_outcome:
   - Entity outcome = new Entity("qdb_outcome");
   - outcome["qdb_workitemstep"] = new EntityReference(
       "qdb_work_item_steps",
       sopStepToWorkitemStep[sopStepId]
     );
   - outcome["qdb_name"] = sopOutcome["qdb_name"];
   - outcome["qdb_sequencenumber"] = sopOutcome["qdb_sequenceno"];
   - Resolve next step: if nextsopstep_id != null:
       outcome["qdb_nextworkitemstep"] = new EntityReference(
         "qdb_work_item_steps",
         sopStepToWorkitemStep[nextsopstep_id]
       );
   - service.Create(outcome);

9. Set output parameters:
   - context.OutputParameters["ProcessId"] =
       new EntityReference("qdb_work_item_record_type", processId);

10. Plugin completes. Platform commits transaction.
    If ANY service.Create() above threw, the platform rolled back ALL
    creates automatically (no manual compensation needed).
```

─────────────────────────────────────────────────────────────────────
RoleDeletionGuardPlugin (new, supporting FR-SOP-05e)
─────────────────────────────────────────────────────────────────────

Class:    RoleDeletionGuardPlugin : IPlugin
Step:     Pre-validation of Delete on qdb_role, Synchronous
Logic:    Query qdb_sopstep where qdb_role_id = deletedRoleId;
          If any records found: throw InvalidPluginExecutionException
          "Cannot delete this role: it is assigned to one or more SOP steps.
          Deactivate the role instead."

This enforces FR-SOP-05e at the server side. The UI deactivation-only
pattern is the soft guard; this plugin is the hard guard.

─────────────────────────────────────────────────────────────────────
Plugin Assembly Sizing
─────────────────────────────────────────────────────────────────────

Two new plugin classes added to the existing assembly. Assembly size
increase is negligible. No new NuGet packages required (Microsoft.CrmSdk
already present from CWFD-001 plugin infrastructure).

Response time estimate for qdb_CreateProcessFromSop with 50 SOP steps:
- 1 Retrieve (SOP validation): ~100ms
- 1 Create (process): ~150ms
- 50 Creates (steps): ~50 × 150ms = 7,500ms
- 50 Retrieve (outcomes per step, batched via QueryExpression): ~500ms
- 50 Creates (outcomes): ~50 × 150ms = 7,500ms
- Total estimated: ~16 seconds
- CRM 2-minute limit: 120 seconds
- Headroom: ~104 seconds — well within limit

Optimisation available if needed: ExecuteMultipleRequest to batch step
creates in groups of 10 (reduces round-trips from 100 to 10). Not
required for 50-step SOP but available as a future optimisation.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — SECURITY ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
Security Role Privileges
─────────────────────────────────────────────────────────────────────

Two CRM security roles are extended (not created fresh — additive
privileges on existing CWFD-001 roles):

WorkflowDesignerOpsExcellence (new role, extends WorkflowDesignerUser):
  qdb_role:        Create, Read, Write, Delete (blocked by RoleDeletionGuardPlugin)
  qdb_sop:         Create, Read, Write, Delete
  qdb_sopstep:     Create, Read, Write, Delete
  qdb_sopoutcome:  Create, Read, Write, Delete
  qdb_work_item_record_type: Read (read-only view of processes)
  qdb_work_item_steps: Read
  qdb_outcome:     Read
  qdb_outcomeworktasks: Read

WorkflowDesignerBA (existing role — adds SOP read):
  qdb_role:        Read
  qdb_sop:         Read
  qdb_sopstep:     Read
  qdb_sopoutcome:  Read
  (all existing process entity privileges unchanged)

─────────────────────────────────────────────────────────────────────
Server-Side Privilege Enforcement
─────────────────────────────────────────────────────────────────────

Dataverse enforces the privilege matrix above automatically. If a BA
attempts to POST a qdb_sop record directly via the Web API (bypassing
the UI), Dataverse returns 403 Forbidden. No plugin logic is needed for
create/update privilege enforcement — it is handled by the platform.

The two plugins (CreateProcessFromSopPlugin, RoleDeletionGuardPlugin)
add business-rule-level enforcement beyond what security roles provide.

─────────────────────────────────────────────────────────────────────
StepAssignments JSON Validation in Plugin
─────────────────────────────────────────────────────────────────────

Per NFR-SOP-03c, the StepAssignments JSON string is validated before
deserialisation:
1. String.IsNullOrWhiteSpace check — throw if empty
2. JSON deserialise in try/catch — throw specific error on malformed JSON
3. For each StepAssignment: validate sopStepId is a well-formed GUID
   (Guid.TryParse); validate assignToType is one of the known option set
   values if provided; validate userId/teamId are well-formed GUIDs if provided
4. Validate that all sopStepIds in the array correspond to steps that
   belong to the requested SOP (prevents cross-SOP injection)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — COMPONENT FILE STRUCTURE (DELTA ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Only new or modified files. Existing CWFD-001 structure is unchanged
except where explicitly noted.

```
src/
│
├── adapters/
│   ├── ICrmAdapter.ts                    (UNCHANGED)
│   ├── ISopAdapter.ts                    (NEW) — extends ICrmAdapter
│   ├── DataverseAdapter.ts               (MODIFIED) — implements ISopAdapter
│   └── ODataAdapter.ts                   (UNCHANGED)
│
├── services/
│   └── (all existing services unchanged)
│
├── store/
│   ├── workflowStore.ts                  (UNCHANGED)
│   ├── selectors.ts                      (UNCHANGED)
│   ├── sopStore.ts                       (NEW)
│   └── sopSelectors.ts                   (NEW)
│
├── nodes/
│   ├── (all existing nodes unchanged)
│   ├── SopStepNode.tsx                   (NEW)
│   └── SopOutcomeNode.tsx                (NEW)
│
├── hooks/
│   ├── (existing hooks unchanged)
│   ├── useSopSave.ts                     (NEW)
│   └── useSopAutoLayout.ts               (NEW — thin wrapper on existing LayoutService)
│
├── models/
│   ├── (existing models unchanged)
│   ├── Sop.ts                            (NEW)
│   ├── SopStep.ts                        (NEW)
│   ├── SopOutcome.ts                     (NEW)
│   └── CrmRole.ts                        (NEW)
│
├── validators/
│   ├── (existing validators unchanged)
│   └── sopValidator.ts                   (NEW) — FR-SOP-11 checks
│
├── components/
│   ├── (existing components unchanged)
│   ├── SopListScreen/
│   │   ├── SopListScreen.tsx             (NEW)
│   │   ├── SopStatusBadge.tsx            (NEW)
│   │   └── useSopList.ts                 (NEW)
│   ├── SopCanvas/
│   │   ├── SopCanvas.tsx                 (NEW)
│   │   ├── SopCommandBar.tsx             (NEW)
│   │   ├── SopPropertiesPanel.tsx        (NEW)
│   │   ├── SopStepPanel.tsx              (NEW)
│   │   └── SopOutcomePanel.tsx           (NEW)
│   ├── CreateProcessWizard/
│   │   ├── CreateProcessWizardModal.tsx  (NEW)
│   │   ├── Step1ProcessIdentity.tsx      (NEW)
│   │   ├── Step2CrmBinding.tsx           (NEW)
│   │   ├── Step3StepAssignments.tsx      (NEW)
│   │   ├── SopStepAssignmentCard.tsx     (NEW)
│   │   ├── wizardSchemas.ts              (NEW)
│   │   └── useWizardState.ts             (NEW)
│   └── RolesScreen/
│       ├── RolesScreen.tsx               (NEW)
│       ├── RoleFormDialog.tsx            (NEW)
│       ├── roleSchemas.ts                (NEW)
│       └── useRoles.ts                   (NEW)
│
├── app/
│   ├── App.tsx                           (MODIFIED) — adds AppView types + navigation tabs
│   └── AppProviders.tsx                  (MODIFIED) — adds SopAdapterContext provider
│
└── types/
    └── SopTypes.ts                       (NEW) — SopStep, SopOutcome, Sop, CrmRole types

plugins/
└── Qdb.WorkflowDesigner.Plugins/
    ├── (existing plugin files unchanged)
    ├── CreateProcessFromSopPlugin.cs     (NEW)
    ├── RoleDeletionGuardPlugin.cs        (NEW)
    └── Models/
        └── StepAssignment.cs             (NEW) — JSON deserialisation target
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — OPEN ITEMS (CEO CLARIFICATIONS CLR-SOP-01 TO CLR-SOP-04)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These must be resolved by the product owner before the respective
Sprint. They do not block Phase 6 start.

CLR-SOP-01 — SOP Version Management
Architecture decision: `qdb_version` is free-text, manually entered by
Ops Excellence. No system increment. This is confirmed in Section 3.
No further input needed from product owner — architecture resolved this.

CLR-SOP-02 — Derived Process Count
Architecture decision: Single aggregate OData query on list load.
Real-time count (not cached). Confirmed in Section 4. Resolved.

CLR-SOP-03 — Role Deletion Policy
Architecture decision: Hard-delete is blocked server-side by
RoleDeletionGuardPlugin. UI exposes only Activate/Deactivate.
Product owner must confirm: should unreferenced roles (not assigned
to any SOP step) be hard-deleteable from the UI? If yes, the UI and
plugin must implement a reference check before surfacing Delete.
Architect recommendation: Yes, allow delete for unreferenced roles
(good housekeeping). The plugin already queries before throwing.
The UI should show Delete only for roles with zero SOP step references
(checked client-side via a count query). Flag for Sprint 2 planning.

CLR-SOP-04 — SOP Retire Consequences
Architecture decision:
- Processes derived from a Retired SOP remain fully functional.
- No cascade effect on derived processes.
- BA can continue editing processes derived from a Retired SOP.
- The "From SOP" badge on the process list will show "(Retired)" suffix
  on the SOP name tooltip if the source SOP is in Retired state.
- BA is not actively notified of SOP retirement (no notification system
  in scope for v1). The badge tooltip is the only signal.
Product owner must confirm this is acceptable or if a banner
notification on process open is required.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9 — ARCHITECTURE DECISION RECORDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Two new ADRs for CWFD-002. Filed in projects/crm-workflow-designer/adrs/
alongside ADR-001 through ADR-007 from CWFD-001.

─────────────────────────────────────────────────────────────────────
ADR-008: ISopAdapter Sub-Interface for Adapter Extension
─────────────────────────────────────────────────────────────────────

Status: Accepted

Context:
The SOP feature requires 14 new CRM adapter methods. Adding these to
ICrmAdapter would force ODataAdapter (On-Premise) to stub-implement
methods for a feature scoped to Online only, violating Interface
Segregation Principle (Constitution clean code standard).

Decision:
Introduce ISopAdapter extending ICrmAdapter. DataverseAdapter implements
ISopAdapter. ODataAdapter implements ICrmAdapter only. A runtime guard
(useSopAdapter hook) checks the injected adapter and surfaces a
FeatureUnavailableError for On-Prem environments.

Consequences:
- Clean separation of concerns; On-Prem adapter is unchanged.
- SOP feature is explicitly Online-only (documented limitation).
- Future: if On-Prem SOP support is needed, ODataAdapter can
  implement ISopAdapter independently.

Alternatives rejected:
- Add all 14 methods to ICrmAdapter with stub implementations in
  ODataAdapter: rejected (violates ISP; adds dead code).
- Completely separate SopAdapter (no ICrmAdapter relationship):
  rejected (duplicates metadata/user/team methods; increases bundle).

─────────────────────────────────────────────────────────────────────
ADR-009: Two Independent Zustand Stores (workflowStore + sopStore)
─────────────────────────────────────────────────────────────────────

Status: Accepted

Context:
COND-SOP-03 requires SOP canvas state to be isolated from the existing
workflowStore. Two approaches were evaluated: (a) Zustand slices within
one store; (b) two independent stores.

Decision:
Two independent stores. workflowStore remains unchanged. sopStore mirrors
the workflowStore structure for the SOP domain.

Rationale:
The SOP and Process canvas domains share no state. Zustand's own
community consensus (discussion #2496): "If each part of state is
independent from each other, multiple stores is the right path."
Sharing zundo temporal middleware across domains would couple undo
histories — an unacceptable side effect.

Consequences:
- Each canvas has its own independent undo/redo history (50 states each).
- No accidental cross-canvas state contamination.
- Slightly more boilerplate (two store files vs. one with slices).

Alternatives rejected:
- Single store with slices: rejected because shared temporal middleware
  couples undo histories across canvas domains.
- Single store without temporal (manual undo for SOP): rejected because
  undo is a first-class user requirement for the SOP canvas.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10 — DEPLOYMENT DELTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Solution version bump: 1.0.0.0 → 1.1.0.0 (additive delta only).

New solution components:
- Entity: qdb_role (with fields, views, forms)
- Entity: qdb_sop (with fields, views, forms)
- Entity: qdb_sopstep (with fields, views, forms)
- Entity: qdb_sopoutcome (with fields, views, forms)
- Field: qdb_work_item_record_type.qdb_sop_id (lookup)
- Security Role: WorkflowDesignerOpsExcellence
- Security Role update: WorkflowDesignerBA (SOP read privileges)
- Plugin Assembly: Qdb.WorkflowDesigner.Plugins.dll (updated)
- Custom API: qdb_CreateProcessFromSop (new message + plugin step)
- Plugin Step: RoleDeletionGuardPlugin on Delete of qdb_role
- Web Resource: updated qdb_/workflow-designer/index.htm + chunks

Deployment sequence:
1. Import managed solution 1.1.0.0 (entities + security roles first)
2. Deploy updated plugin assembly via Plugin Registration Tool
3. Register qdb_CreateProcessFromSop Custom API + plugin step
4. Register RoleDeletionGuardPlugin Pre-Validation Delete step on qdb_role
5. Deploy updated web resource chunks
6. Publish all customisations
7. Verify: create a test qdb_role, create a test qdb_sop, run wizard


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11 — ARCHITECTURAL RISKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Rank | Risk | P | I | Mitigation |
|------|------|---|---|------------|
| 1 | qdb_work_item_record_type.qdb_sop_id field addition breaks existing forms or views | L | M | Field is nullable, additive; test existing process CRUD post-deployment; form/view modifications are opt-in |
| 2 | CreateProcessFromSopPlugin exceeds 2-minute limit for SOPs with 50+ steps | L | H | Performance estimate shows ~16s for 50 steps; 50-step validation cap enforced in both UI (SOP validation FR-SOP-11) and plugin |
| 3 | DataverseAdapter ISopAdapter extension introduces regression in existing ICrmAdapter methods | L | H | ISopAdapter extends ICrmAdapter — no existing methods changed; compiler enforces contract; unit tests cover existing methods |
| 4 | sopStore zundo temporal middleware causes memory pressure when both canvases are open simultaneously | L | M | Each store capped at 50 history states; combined max ~10 MB heap (acceptable per CWFD-001 Section 6 analysis) |
| 5 | StepAssignments JSON parameter exceeds Dataverse Custom API string field limit | VL | M | 50 steps × ~200 bytes per assignment = ~10 KB; well within Memo field limits |
| 6 | Lazy chunk for SOP feature not loaded before user navigates to SOP screen causing perceptible delay | L | L | React.lazy + Suspense with Fluent UI Spinner fallback; SOP chunk ~35 KB gzip loads in <500ms on enterprise LAN |

═══════════════════════════════════════════════════════════════════════
SECTION 12 — CEO BUILD APPROVAL REQUEST
═══════════════════════════════════════════════════════════════════════

To:      CEO — Maqsad AI
From:    Architect — Maqsad AI
Re:      CWFD-002 Architecture Complete — Requesting Phase 6 Authorization
Date:    2026-06-12

All five CEO conditions from brd-approval.md are resolved:

| Condition | Resolution |
|-----------|-----------|
| COND-SOP-01: Entity logical name disambiguation | Confirmed from live adapter: qdb_work_item_record_type (singular) |
| COND-SOP-02: ICrmAdapter extension impact analysis | ISopAdapter sub-interface (ADR-008); ODataAdapter unchanged |
| COND-SOP-03: SOP canvas state store isolation | Two independent stores (ADR-009); sopStore mirrors workflowStore |
| COND-SOP-04: Plugin transaction scope | Custom API, Post-operation synchronous, platform transaction confirmed |
| COND-SOP-05: Bundle size delta | +55 KB lazy, +4 KB eager; new peak ~856 KB; headroom ~3,644 KB |

Two CEO clarifications still open (CLR-SOP-03, CLR-SOP-04) — both
have architecture-level defaults proposed and do not block Sprint 1.

Architecture is complete and internally consistent.
Two new ADRs (ADR-008, ADR-009) justify all new design decisions.
Zero new npm dependencies. Zero existing code broken.

This document requests CEO approval to authorize Phase 6 (Technical Build).

═══════════════════════════════════════════════════════════════════════
END OF DOCUMENT — CWFD-002 Architecture v1.0
Prepared by: Architect — Maqsad AI | 2026-06-12
Status: PENDING CEO BUILD APPROVAL
═══════════════════════════════════════════════════════════════════════
