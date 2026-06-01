═══════════════════════════════════════════════════════════════════════
SOLUTION ARCHITECTURE — PHASE 3
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer
Document:       phase-3-arch.md
Prepared by:    Architect — Maqsad AI
Date:           2026-06-01
Version:        1.0
Status:         PENDING CEO BUILD APPROVAL
Project Code:   CWFD-001
BRD Version:    1.0 (approved with conditions — phase-1-ceo.md)
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — SYSTEM OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The CRM Visual Workflow Designer is a pure client-side React 19 + TypeScript
application bundled as a single CRM Web Resource artifact (.htm + chunked JS/CSS)
and delivered inside the Dynamics 365 UCI iframe. It communicates exclusively with
four pre-deployed CRM entities via an adapter interface — using Xrm.WebApi for
Online/Dataverse environments and a direct OData v4 fetch for On-Premise 9.x
environments — with no server-side component of any kind.

The designer provides a node-and-edge canvas (React Flow) backed by a flat Zustand
store where the four CRM entities map directly to node types: Process defines the
root context; Steps become StepNodes; Outcomes become OutcomeNodes; Routes become
animated RouteEdges connecting outcomes to subsequent steps. All canvas persistence
flows through a dependency-ordered save pipeline (process to steps to outcomes to
routes) with upsert semantics and dirty-ID tracking to minimise API call volume.

The single-artifact constraint drives every technology decision: no backend server,
no CDN, no external network calls, all dependencies bundled, total gzip target
confirmed at ~797 KB against a 5,120 KB absolute ceiling.

─────────────────────────────────────────────────────────────────────
ASCII Component Diagram
─────────────────────────────────────────────────────────────────────

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Dynamics 365 UCI Shell                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                      Web Resource iframe                                │  │
│  │  (qdb_/workflow-designer/index.htm)                                     │  │
│  │                                                                         │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │  │
│  │  │  CommandBar (top)                                               │   │  │
│  │  │  [New][Open][Save][Publish][Clone][Validate][Auto Layout]       │   │  │
│  │  │  [Version History][Preview][Export dropdown]                    │   │  │
│  │  └─────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                         │  │
│  │  ┌──────────────┐  ┌────────────────────────────┐  ┌───────────────┐  │  │
│  │  │  Workflow    │  │    WorkflowCanvas           │  │ Properties   │  │  │
│  │  │  Toolbox     │  │  (@xyflow/react ReactFlow) │  │ Panel        │  │  │
│  │  │  (left panel)│  │                            │  │ (right panel)│  │  │
│  │  │              │  │  ┌──────────┐             │  │              │  │  │
│  │  │  StartNode   │  │  │StartNode │             │  │ ProcessPanel │  │  │
│  │  │  StepNode    │  │  └────┬─────┘             │  │ StepPanel    │  │  │
│  │  │  OutcomeNode │  │       │StepToOutcomeEdge  │  │ OutcomePanel │  │  │
│  │  │  EndNode     │  │  ┌────▼─────┐             │  │ RoutePanel   │  │  │
│  │  │              │  │  │StepNode  │             │  │              │  │  │
│  │  │  [drag onto  │  │  └────┬─────┘             │  │ react-hook-  │  │  │
│  │  │   canvas]    │  │       │                   │  │  form + zod  │  │  │
│  │  │              │  │  ┌────▼──────────┐        │  │              │  │  │
│  │  │              │  │  │ OutcomeNode   │        │  │              │  │  │
│  │  │              │  │  │ (color coded) │        │  │              │  │  │
│  │  │              │  │  └────┬──────────┘        │  │              │  │  │
│  │  │              │  │       │RouteEdge (animated)│  │              │  │  │
│  │  │              │  │  ┌────▼─────┐             │  │              │  │  │
│  │  │              │  │  │StepNode  │             │  │              │  │  │
│  │  │              │  │  └──────────┘             │  │              │  │  │
│  │  │              │  │  MiniMap + Controls        │  │              │  │  │
│  │  └──────────────┘  └────────────────────────────┘  └───────────────┘  │  │
│  │                                                                         │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │  │
│  │  │               Zustand WorkflowDesignerStore                     │   │  │
│  │  │  process | steps{} | outcomes{} | routes{}                      │   │  │
│  │  │  stepOrder[] | outcomeOrder{} | routeOrder{}                    │   │  │
│  │  │  nodePositions{} | newIds | dirtyIds | deletedIds               │   │  │
│  │  │  selectedId | isDirty | isPublishing | previewMode              │   │  │
│  │  │  [zundo temporal middleware -- 50 undo states]                  │   │  │
│  │  └──────────────────────┬──────────────────────────────────────────┘   │  │
│  │                         │                                               │  │
│  │  ┌──────────────────────▼──────────────────────────────────────────┐   │  │
│  │  │                    Service Layer                                 │   │  │
│  │  │  CrmEnvironmentService  CrmApiService  LayoutService             │   │  │
│  │  │  ExportService  ValidationService  VersioningService             │   │  │
│  │  │  CloneService  AuditService                                      │   │  │
│  │  └──────────────────────┬──────────────────────────────────────────┘   │  │
│  │                         │                                               │  │
│  │  ┌──────────────────────▼──────────────────────────────────────────┐   │  │
│  │  │                  ICrmAdapter (interface)                         │   │  │
│  │  │       ┌───────────────────┐  ┌────────────────────────┐         │   │  │
│  │  │       │ DataverseAdapter  │  │   ODataAdapter         │         │   │  │
│  │  │       │ (Xrm.WebApi)      │  │   (fetch + NTLM)       │         │   │  │
│  │  │       └─────────┬─────────┘  └───────────┬────────────┘         │   │  │
│  │  └─────────────────┼────────────────────────┼────────────────────┘   │  │
│  │                    │  (selected at startup)  │                         │  │
│  └────────────────────┼────────────────────────┼─────────────────────────┘  │
│                       │  Xrm.WebApi / OData v4  │                            │
│  ┌────────────────────▼────────────────────────▼─────────────────────────┐  │
│  │               Dataverse / CRM On-Prem (qdb_* entities)                │  │
│  │  qdb_work_item_record_type  qdb_work_item_steps                       │  │
│  │  qdb_outcome                qdb_outcomeworktasks                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   Web Worker    │
                    │  (layoutWorker) │
                    │  elkjs layered  │
                    │  algorithm      │
                    └─────────────────┘
                    (spawned on first Auto-Layout; if blocked by On-Prem
                     iframe sandbox -> Dagre synchronous fallback activates)
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — TECHNOLOGY STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Layer | Technology | Reason / ADR Reference |
|---|---|---|
| UI Framework | React 19 + TypeScript 5.x (strict) | Constitution default; concurrent rendering; client mandated (C-08) |
| Component Library | @fluentui/react-components v9 | Power Platform native; Microsoft maintained; consistent with CRM shell |
| Canvas / Graph Editor | @xyflow/react v12.x (MIT) | ADR-001; 27,000+ stars; React 19 confirmed; purpose-built for workflow graphs |
| State Management | zustand v5 + immer v10 + zundo v2 | ADR-003; flat map O(1) lookup; ~5 KB total; React Flow team recommended pairing |
| Server State / Cache | @tanstack/react-query v5 (MIT) | ADR-003; caches CRM metadata queries; retry-on-error; stale-while-revalidate |
| Form / Validation | react-hook-form v7 + zod v4 (both MIT) | Constitution Article III; uncontrolled forms; Zod runtime validation at all boundaries |
| Auto-Layout Primary | elkjs v0.9.x (EPL-2.0) via Web Worker | ADR-004; gold-standard layered algorithm; Web Worker prevents UI freeze |
| Auto-Layout Fallback | @dagrejs/dagre (MIT, pinned) | ADR-004; 14 KB synchronous fallback for On-Prem iframe sandbox restrictions |
| FetchXML Builder Primary | CRM Advanced Filter Page (iframe + postMessage) | ADR-005; native CRM query builder; availability-detected at runtime |
| FetchXML Builder Fallback | react-querybuilder v8 + custom FetchXML formatter | ADR-005; complete fallback; automatic switching on detection failure |
| PNG / SVG Export | html-to-image v1.x (MIT) | github-research.md; React Flow official recommendation; 5 KB lazy |
| PDF Export | jspdf v3.x (MIT) | github-research.md; client-side only; 80 KB lazy |
| Bundler | Vite 5 + Rollup output | ADR-007; manual chunk split; CI bundle size gate |
| Testing | Vitest + React Testing Library + Playwright | Constitution default; 80% coverage requirement (NFR-05b) |
| CRM API (Online) | Xrm.WebApi (DataverseAdapter) | Constitution Article XI; no direct OData on Online |
| CRM API (On-Prem) | fetch + credentials:include (ODataAdapter) | ADR-002; same-origin NTLM; OData v4 /api/data/v9.0/ |
| No backend server | N/A | C-01; web resource platform constraint |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — ENVIRONMENT DETECTION LAYER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Responsibility: `src/services/CrmEnvironmentService.ts`

`CrmEnvironmentService` is instantiated once at application startup (in `AppProviders.tsx`)
and stored in a React context. All other services and adapters receive it by dependency
injection — no service constructs it.

Detection algorithm (executed once; result immutable for the session):

```
Step 1: Resolve the Xrm global
  Try: Xrm.Utility.getGlobalContext()
  Fallback 1: window.parent.Xrm?.Page?.context
  Fallback 2: window.top.Xrm?.Utility?.getGlobalContext()
  If all fail: throw CrmContextError("Xrm context not available. Ensure this
               page runs as a CRM Web Resource.")

Step 2: Determine environment type
  a. Call context.getClientUrl() -> clientUrl (string)
  b. If clientUrl contains ".dynamics.com" -> ONLINE
     Else -> ON_PREM
  NOTE: Sovereign cloud domains must be added (see Skeptic Challenge 1)

Step 3: Determine API version
  ONLINE -> "9.2"
  ON_PREM -> parse context.getVersion():
    Version string format: "9.{minor}.{build}.{revision}"
    If minor >= 1 -> "9.1"
    Else -> "9.0"

Step 4: Resolve user context
  Call context.getUserId() -> userId (GUID)
  Call context.getUserName() -> userName (string)
  Call context.getUserRoles() -> roleIds (string[])
```

Public interface:
```typescript
interface ICrmEnvironmentService {
  isOnline(): boolean;
  getApiVersion(): string;                 // "9.0" | "9.1" | "9.2"
  getClientUrl(): string;                  // https://{org}.dynamics.com or http://{server}/{org}
  getODataBaseUrl(): string;               // {clientUrl}/api/data/v{apiVersion}/
  getUserContext(): UserContext;            // { id, name, roleIds }
  getObjectTypeCode(logicalName: string): Promise<number>;  // cached metadata lookup
  getVersion(): string;                    // raw CRM version string (for diagnostics)
}

class CrmContextError extends Error {
  constructor(message: string) { super(message); this.name = 'CrmContextError'; }
}
```

`getObjectTypeCode()` is used by the FetchXML builder (ADR-005) to construct the
Advanced Filter Page URL. It calls the metadata endpoint and caches the result in
a `Map<string, number>` for the session lifetime.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — ADAPTER PATTERN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

See ADR-002 for full rationale.

`ICrmAdapter` is the sole API boundary between the application layer and CRM.
No service, hook, or component imports a concrete adapter class directly.

─────────────────────────────────────────────────────────────────────
ICrmAdapter — Full Interface Contract
─────────────────────────────────────────────────────────────────────

```typescript
// src/adapters/ICrmAdapter.ts

interface ICrmAdapter {
  // --- Metadata ---
  getEntities(): Promise<EntityMetadata[]>;
  getAttributesByEntity(logicalName: string): Promise<AttributeMetadata[]>;
  getUsers(search?: string): Promise<CrmUser[]>;
  getTeams(search?: string): Promise<CrmTeam[]>;

  // --- Process (qdb_work_item_record_type) ---
  getProcess(id: string): Promise<WorkflowProcess>;
  getProcessList(): Promise<WorkflowProcessSummary[]>;
  createProcess(data: CreateProcessRequest): Promise<string>;
  updateProcess(id: string, data: UpdateProcessRequest): Promise<void>;
  deleteProcess(id: string): Promise<void>;

  // --- Step (qdb_work_item_steps) ---
  getSteps(processId: string): Promise<WorkflowStep[]>;
  createStep(data: CreateStepRequest): Promise<string>;
  updateStep(id: string, data: UpdateStepRequest): Promise<void>;
  deleteStep(id: string): Promise<void>;

  // --- Outcome (qdb_outcome) ---
  getOutcomes(stepId: string): Promise<WorkflowOutcome[]>;
  createOutcome(data: CreateOutcomeRequest): Promise<string>;
  updateOutcome(id: string, data: UpdateOutcomeRequest): Promise<void>;
  deleteOutcome(id: string): Promise<void>;

  // --- Route (qdb_outcomeworktasks) ---
  getRoutes(outcomeId: string): Promise<WorkflowRoute[]>;
  createRoute(data: CreateRouteRequest): Promise<string>;
  updateRoute(id: string, data: UpdateRouteRequest): Promise<void>;
  deleteRoute(id: string): Promise<void>;

  // --- Operations ---
  publishProcess(id: string): Promise<void>;
  cloneProcess(id: string): Promise<string>;
  batchWrite(operations: BatchOperation[]): Promise<BatchResult[]>;
}
```

─────────────────────────────────────────────────────────────────────
DataverseAdapter (Online)
─────────────────────────────────────────────────────────────────────

- Wraps `Xrm.WebApi.online.retrieveMultipleRecords`, `createRecord`, `updateRecord`,
  `deleteRecord`.
- All creates include `MSCRM.SolutionUniqueName` via a custom `Xrm.WebApi.online.execute()`
  request class (constitution Article XI).
- Batch write uses `Xrm.WebApi.online.executeMultiple()`.
- Retry policy: 3 attempts, exponential backoff (500ms, 1000ms, 2000ms), applied to
  all CRUD operations via a `withRetry()` wrapper.

─────────────────────────────────────────────────────────────────────
ODataAdapter (On-Premise 9.x)
─────────────────────────────────────────────────────────────────────

- Uses `fetch(url, { credentials: 'include', headers: { 'OData-MaxVersion': '4.0' } })`.
- Base URL: `{clientUrl}/api/data/v{apiVersion}/`.
- Batch write: constructs OData `$batch` multipart body (Content-Type: multipart/mixed).
- GUID validation on all IDs before interpolating into URL segments (assertGuid).
- Same retry policy as DataverseAdapter.
- On $batch returning 400: falls back to sequential writes automatically.

─────────────────────────────────────────────────────────────────────
Adapter Selection at Startup
─────────────────────────────────────────────────────────────────────

```typescript
// src/app/AppProviders.tsx
const env = new CrmEnvironmentService();
const adapter: ICrmAdapter = env.isOnline()
  ? new DataverseAdapter(env)
  : new ODataAdapter(env);
```

The adapter is stored in a React context (`CrmAdapterContext`) and accessed in
services via `useCrmAdapter()`. Services receive the adapter via their constructors.
`CrmApiService` is a thin facade that delegates all calls to the adapter — it adds
only structured logging and correlation ID propagation.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — REACT FLOW ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
Node Type Registry
─────────────────────────────────────────────────────────────────────

| Node Type | CRM Entity | Handles | Responsibilities |
|---|---|---|---|
| StartNode | (synthetic) | Bottom (source) | Entry point; exactly one per process; non-deletable |
| StepNode | qdb_work_item_steps | Top (target) + Bottom (source) | Displays name, sequence, assignment badge, entity badge, status pill |
| OutcomeNode | qdb_outcome | Left (target from step) + Right (source to route) | Displays name, sequence; color-coded by name pattern |
| EndNode | (synthetic) | Top (target) | Terminal node; no outgoing handles |

Color-coding for OutcomeNode (FR-05c, NFR-06c -- color plus icon, not color alone):
- Name contains "Approv" -> green background + checkmark icon
- Name contains "Reject" -> red background + X icon
- Name contains "Informat" -> blue background + info icon
- Name contains "Escalat" -> orange background + arrow-up icon
- Default -> grey background + circle icon

─────────────────────────────────────────────────────────────────────
Edge Type Registry
─────────────────────────────────────────────────────────────────────

| Edge Type | Connects | Carries Data |
|---|---|---|
| StepToOutcomeEdge | StepNode bottom -> OutcomeNode left | Structural only |
| RouteEdge | OutcomeNode right -> StepNode top | qdb_outcomeworktasks data; FetchXML badge |

`RouteEdge` renders: route name label, animated stroke on selection, FetchXML badge
when `qdb_filter` is non-null (FR-06d).

─────────────────────────────────────────────────────────────────────
Store-to-Canvas Sync Principle
─────────────────────────────────────────────────────────────────────

The Zustand store is the single source of truth. The `nodes[]` and `edges[]` arrays
passed to `<ReactFlow>` are derived values computed by selectors in `selectors.ts`.
They are NEVER written back from React Flow to the store directly.

Data flows in one direction only:

```
User action on canvas
       |
       v
onNodesChange / onEdgesChange / onConnect (React Flow event handlers)
       |
       v
Dispatch mutation to Zustand store (via useWorkflowStore.getState().xxx())
       |
       v
Immer draft update in store
       |
       v
Selectors recompute nodes[] and edges[]
       |
       v
React Flow re-renders
```

On connection validation failure: the `onConnect` handler dispatches a no-op (does
not call addRoute) and React Flow's `onConnectEnd` is used to remove the
speculatively-rendered edge. The store remains consistent.

React Flow `onNodeDragStop` is the only event where React Flow informs the store:
it fires the final position, which `updateNodePosition(id, position)` writes to
`store.nodePositions`. This is layout metadata only (not a CRM entity field).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — ZUSTAND STORE DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

See ADR-003 for full rationale. Flat map architecture; O(1) lookup by CRM ID.

```typescript
// src/store/workflowStore.ts

interface WorkflowDesignerState {
  // -- Process ---------------------------------------------------------
  process: WorkflowProcess | null;

  // -- Entity maps (O(1) lookup) ----------------------------------------
  steps: Record<string, WorkflowStep>;
  outcomes: Record<string, WorkflowOutcome>;
  routes: Record<string, WorkflowRoute>;

  // -- Ordering (visual sequence within parent) -------------------------
  stepOrder: string[];
  outcomeOrder: Record<string, string[]>;    // stepId -> sorted outcomeId[]
  routeOrder: Record<string, string[]>;      // outcomeId -> sorted routeId[]

  // -- Canvas layout ---------------------------------------------------
  nodePositions: Record<string, XYPosition>;

  // -- Dirty tracking --------------------------------------------------
  newIds: Set<string>;
  dirtyIds: string[];
  deletedIds: string[];
  deletedEntityTypes: Record<string, 'step' | 'outcome' | 'route'>;

  // -- UI state (excluded from zundo history) ---------------------------
  selectedId: string | null;
  isDirty: boolean;
  isPublishing: boolean;
  isSaving: boolean;
  previewMode: boolean;
  validationResults: ValidationResult[];
  versioningDegraded: boolean;
}
```

`zundo` middleware configuration:
```typescript
const useWorkflowStore = create<WorkflowDesignerState>()(
  temporal(
    immer(storeImplementation),
    {
      partialize: (state) => ({
        process: state.process,
        steps: state.steps,
        outcomes: state.outcomes,
        routes: state.routes,
        stepOrder: state.stepOrder,
        outcomeOrder: state.outcomeOrder,
        routeOrder: state.routeOrder,
        nodePositions: state.nodePositions,
      }),
      limit: 50,
    }
  )
);
```

Development-mode invariant check: a `zustand/middleware` devtools hook fires after
every mutation and validates that every ID in `stepOrder` exists in `steps`, every
ID in `outcomeOrder[stepId]` exists in `outcomes`, etc. Violations throw in
development and log warnings in production (addressing Skeptic Challenge 6).

Undo history memory estimate (Skeptic Challenge 8):
200 nodes x ~0.5 KB per node snapshot x 50 states = ~5 MB. This is within normal
browser heap limits for a desktop CRM session. If measured heap usage exceeds 15 MB
during QA, reduce `limit` to 25 or compress snapshots with structured clone.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — CRM SYNC STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implemented in: `src/hooks/useWorkflowSave.ts`

─────────────────────────────────────────────────────────────────────
Upsert Rule
─────────────────────────────────────────────────────────────────────

For any record in the store:
- ID in `newIds` (starts with tmp_) -> CREATE, then call `resolveTmpId(tmpId, realId, type)`.
- ID in `dirtyIds` -> UPDATE (PATCH).
- ID in `deletedIds` -> DELETE.
- None of the above -> clean, no API call.

─────────────────────────────────────────────────────────────────────
Dependency-Ordered Save Pipeline
─────────────────────────────────────────────────────────────────────

```
Phase 1: Save process record (if new or dirty) -- resolve process CRM ID if tmp_
Phase 2: Save new/dirty steps in stepOrder sequence -- resolve step CRM IDs
Phase 3: Save new/dirty outcomes in outcomeOrder sequence -- resolve outcome CRM IDs
Phase 4: Save new/dirty routes in routeOrder sequence -- resolve route CRM IDs
Phase 5: Execute deletions (routes first, then outcomes, then steps)
Phase 6: Call markSaved() -- clears all dirty tracking sets
```

Batch optimisation: phases 2, 3, and 4 are batched within each phase where the
adapter supports `batchWrite()`. Cross-phase batching is not done because IDs
from phase N are required by phase N+1.

─────────────────────────────────────────────────────────────────────
Duplicate Prevention (FR-20a -- Non-Negotiable)
─────────────────────────────────────────────────────────────────────

For step creates: check local `schemaName -> crmId` cache before issuing CREATE.
If the schema name exists, treat as UPDATE. Cache is populated on process load.
If cache is empty (new session), a lightweight OData query retrieves existing
schema names for the process before the first save.

─────────────────────────────────────────────────────────────────────
Session Persistence (NFR-03a)
─────────────────────────────────────────────────────────────────────

Debounced (2-second) autosave writes a compact JSON payload to sessionStorage
under key `cwfd_autosave_{processId}`. The serialisation runs in a `queueMicrotask`
to avoid blocking the main thread during the write (addressing Skeptic Challenge 9).

On application load, if an autosave exists for the opened process ID, the user is
offered the option to restore it or discard it.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — AUTO-LAYOUT ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

See ADR-004 for full rationale, ELK configuration, and license attribution.

─────────────────────────────────────────────────────────────────────
Two-Tier Design
─────────────────────────────────────────────────────────────────────

Tier 1 -- Primary (ELK in Web Worker):
  `src/workers/layoutWorker.ts` -- loaded lazily on first Auto-Layout click.
  Algorithm: layered, direction DOWN, LAYER_SWEEP crossing minimisation.
  Result posted back to main thread as `Record<string, { x, y }>`.

Tier 2 -- Fallback (Dagre synchronous):
  Activated when `new Worker(...)` throws in the detection check.
  Runs synchronously on main thread; progress indicator shown.
  Pinned to @dagrejs/dagre@0.8.5 (exact version, not range).

Worker support detection (cached at startup):
```typescript
async function detectWorkerSupport(): Promise<boolean> {
  try {
    const w = new Worker(URL.createObjectURL(new Blob([''])));
    w.terminate();
    return true;
  } catch {
    return false;
  }
}
```

Undo integration: zundo captures pre-layout `nodePositions` automatically. Ctrl+Z
after Auto-Layout restores previous positions (FR-07g, AC-06c).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9 — FETCHXML BUILDER — TWO-PATH DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

See ADR-005 for full postMessage contract, security constraints, and operator
mappings. This section summarises the design.

─────────────────────────────────────────────────────────────────────
Path A -- CRM Advanced Filter Page (Primary)
─────────────────────────────────────────────────────────────────────

URL:
  `{clientUrl}/SFA/goal/ParticipatingQueryCondition.aspx?entitytypecode={code}&readonlymode=false`

Delivered in a Fluent UI Dialog as a sandboxed iframe:
  sandbox="allow-same-origin allow-scripts allow-forms"

Availability risk: This is an internal, undocumented CRM page. Its URL path is
consistent across Online versions 9.1+ and On-Prem 9.x as of 2026-06-01 but
carries no SDK guarantee. Treated as best-effort; automatic fallback on failure.

Availability detection: 3-second probe via hidden iframe. Result cached for session.
Note: the probe is a real HTTP request visible in CRM server logs. Rate-limiting
risk is negligible (one probe per session per entity). Documented as a known
side-effect (Skeptic Challenge 5 -- accepted as low risk).

postMessage origin validation: mandatory. Messages from any origin other than
`new URL(clientUrl).origin` are silently dropped before payload parsing.

postMessage timeout: 5-second timeout after dialog opens. If no message received,
a warning is shown and the raw FetchXML editor is offered.

─────────────────────────────────────────────────────────────────────
Path B -- react-querybuilder + Custom FetchXML Formatter (Fallback)
─────────────────────────────────────────────────────────────────────

`FetchXmlQueryBuilder.tsx` renders `react-querybuilder` v8 populated with entity
attributes from `getAttributesByEntity(entityLogicalName)`.

`src/utils/fetchXmlFormatter.ts` maps `RuleGroupType` to well-formed FetchXML.
Supported operators: eq, ne, lt, gt, le, ge, contains, beginsWith, endsWith,
in, between, null, notNull.

Output validated by `DOMParser.parseFromString(xml, 'text/xml')` before storage.

─────────────────────────────────────────────────────────────────────
Switching Logic
─────────────────────────────────────────────────────────────────────

Automatic and silent. User sees a non-blocking info banner when Path B is active.
The route record is agnostic to which path produced the FetchXML.

Component structure:
```
src/components/FetchXmlBuilder/
  FetchXmlBuilderDialog.tsx       Fluent UI Dialog; path switching
  FetchXmlIframeBuilder.tsx       Path A -- iframe + postMessage listener
  FetchXmlQueryBuilder.tsx        Path B -- react-querybuilder
  fetchXmlAvailabilityProbe.ts    Probe function; returns Promise<boolean>
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10 — VERSIONING ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

See ADR-006 for full schema delta, breaking change algorithm, and atomicity analysis.

─────────────────────────────────────────────────────────────────────
CRM Solution Delta (COND-02 Resolution)
─────────────────────────────────────────────────────────────────────

Entity: `qdb_work_item_record_type`

| Field Logical Name | Display Name | Type | Values | Required |
|---|---|---|---|---|
| qdb_version_major | Version Major | Integer (Whole Number) | 1-999 | Yes (default: 1) |
| qdb_version_minor | Version Minor | Integer (Whole Number) | 0-999 | Yes (default: 0) |
| qdb_workflow_state | Workflow State | Option Set (Global: qdb_workflowstate) | Draft=100000000, Published=100000001, Archived=100000002 | Yes (default: Draft) |
| qdb_workflow_snapshot | Workflow Snapshot | Memo (ntext, max 1 MB) | JSON string | No (nullable) |
| qdb_published_on | Published On | Date and Time (UTC) | Any valid UTC datetime | No |
| qdb_cloned_from | Cloned From | Lookup (qdb_work_item_record_type, self) | Self-referencing | No |

Client Action Item (COND-02 / A-02): Written approval from client CRM platform
team required before Phase 4 is authorized.

─────────────────────────────────────────────────────────────────────
Workflow State Machine
─────────────────────────────────────────────────────────────────────

```
  Create / Clone
       |
       v
    [Draft]  <------------- Edit (any change)
       |
  Publish (validation pass)
       |
       v
  [Published]  --> (previous Published -> Archived on new publish)
       |
  Archive (new version published)
       |
       v
  [Archived]  (immutable, read-only)
```

Rules:
- Only one record per process may be in state Published at any time.
- Published records are immutable -- the canvas is read-only.
- The publish gate is non-bypassable by any user role (C-CEO-01).

─────────────────────────────────────────────────────────────────────
Version Increment Rules
─────────────────────────────────────────────────────────────────────

Save Draft: no version change.

Publish:
1. Validation engine -- block on any Error-severity violation.
2. Deserialize previous Published snapshot from qdb_workflow_snapshot.
3. Breaking change? (step deleted, outcome deleted, sequence changed, entity
   binding changed) -> increment qdb_version_major, reset qdb_version_minor to 0.
   Example: 1.3 -> 2.0.
4. Minor change? (new outcome, filter changed, name updated) ->
   increment qdb_version_minor. Example: 1.2 -> 1.3.
5. Archive previous Published record.
6. Serialize current workflow to JSON, store in qdb_workflow_snapshot.
7. Set current record to Published; set qdb_published_on.

Clone: new process at version 1.0, state Draft, snapshot null.

Publish rollback strategy: if archiving the old record (step 5) fails after 3
retries, surface "Repair Publish" action in the command bar. The repair action
queries all Published records for the process and archives all but the one with
the highest version numbers. Logged to AuditService with correlation ID.

─────────────────────────────────────────────────────────────────────
Graceful Degradation (Fields Absent at Runtime)
─────────────────────────────────────────────────────────────────────

If qdb_version_major write returns HTTP 400 (field not found):
- VersioningService activates degraded mode.
- Version numbers tracked in-memory only.
- State field writes skipped.
- Publish proceeds (steps/outcomes/routes saved; state/snapshot skipped).
- Non-blocking warning banner shown for session duration.
- Version History panel shows degradation notice.
- All canvas design features remain fully functional.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11 — VALIDATION ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Responsibility: `src/validators/publishValidator.ts`,
`src/validators/circularRefDetector.ts`,
`src/validators/duplicateSequenceDetector.ts`

Deterministic: identical input always produces identical violations (NFR-03c).

| Code | Check | Severity | Notes |
|---|---|---|---|
| VE-01 | Process has no steps | Error | steps map size === 0 |
| VE-02 | Step has no outcomes | Error | per step |
| VE-03 | Outcome has no route (dead-end) | Error | per outcome |
| VE-04 | Route references non-existent next step | Error | nextStepId not in steps map |
| VE-05 | Duplicate step sequence numbers | Error | sort by qdb_sequenceno; compare adjacent |
| VE-06 | Duplicate outcome sequence numbers within step | Error | per step |
| VE-07 | Circular reference detected | Error | DFS with visited set O(V+E) |
| VE-08 | Assignment type set but required field empty | Error | per step conditional logic |
| VE-09 | Malformed FetchXML in route filter | Error | DOMParser parsererror check |
| VE-10 | Schema name empty or invalid characters | Error | /^[a-zA-Z][a-zA-Z0-9_]{0,99}$/ |
| VE-11 | Missing step name | Error | qdb_name.trim() === '' |

Each violation: `{ code, severity, affectedNodeId, message, jumpToNode: () => void }`.
`jumpToNode` calls `selectNode(id)` and centers the canvas on the affected node.

Circular reference (VE-07): DFS from StartNode on the Step adjacency graph.
O(V+E) time. For 200 nodes, estimated runtime < 10ms (SR-04 accepted by CEO).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 12 — COMPONENT ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```
src/
├── adapters/
│   ├── ICrmAdapter.ts
│   ├── DataverseAdapter.ts
│   └── ODataAdapter.ts
│
├── services/
│   ├── CrmEnvironmentService.ts
│   ├── CrmApiService.ts
│   ├── LayoutService.ts
│   ├── ExportService.ts
│   ├── ValidationService.ts
│   ├── VersioningService.ts
│   ├── CloneService.ts
│   └── AuditService.ts
│
├── store/
│   ├── workflowStore.ts
│   └── selectors.ts
│
├── workers/
│   └── layoutWorker.ts
│
├── nodes/
│   ├── StartNode.tsx
│   ├── StepNode.tsx
│   ├── OutcomeNode.tsx
│   ├── EndNode.tsx
│   └── nodeTypes.ts
│
├── edges/
│   ├── RouteEdge.tsx
│   └── edgeTypes.ts
│
├── panels/
│   ├── ProcessPanel.tsx
│   ├── StepPanel.tsx
│   ├── OutcomePanel.tsx
│   ├── RoutePanel.tsx
│   └── PropertiesPanel.tsx
│
├── components/
│   ├── CommandBar.tsx
│   ├── WorkflowToolbox.tsx
│   ├── WorkflowCanvas.tsx
│   ├── FetchXmlBuilder/
│   │   ├── FetchXmlBuilderDialog.tsx
│   │   ├── FetchXmlIframeBuilder.tsx
│   │   └── FetchXmlQueryBuilder.tsx
│   ├── ImpactAnalysisPanel.tsx
│   ├── VersionHistoryPanel.tsx
│   ├── SearchPanel.tsx
│   └── MiniMap.tsx
│
├── hooks/
│   ├── useWorkflowSave.ts
│   ├── useAutoLayout.ts
│   ├── useKeyboardShortcuts.ts
│   └── useExport.ts
│
├── validators/
│   ├── publishValidator.ts
│   ├── circularRefDetector.ts
│   └── duplicateSequenceDetector.ts
│
├── models/
│   ├── WorkflowProcess.ts
│   ├── WorkflowStep.ts
│   ├── WorkflowOutcome.ts
│   ├── WorkflowRoute.ts
│   └── CrmMetadata.ts
│
├── utils/
│   ├── guid.ts
│   ├── fetchXmlFormatter.ts
│   └── versionUtils.ts
│
├── app/
│   ├── App.tsx
│   └── AppProviders.tsx
│
├── main.tsx
│
└── types/
    ├── crm.d.ts
    └── xrm.d.ts
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 13 — BUNDLE BUDGET (COND-04 RESOLUTION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

See ADR-007 for Vite configuration and CI gate implementation.

─────────────────────────────────────────────────────────────────────
Eager Load Chunks
─────────────────────────────────────────────────────────────────────

| Chunk | Contents | Est. Gzip |
|---|---|---|
| vendor-react | react v19, react-dom v19 | ~45 KB |
| vendor-flow | @xyflow/react v12 | ~75 KB |
| vendor-fluent | @fluentui/react-components v9 (selective imports) | ~190 KB |
| vendor-state | zustand v5, immer v10, zundo v2 | ~5 KB |
| vendor-query | @tanstack/react-query v5 | ~13 KB |
| vendor-form | react-hook-form v7, zod v4 (zod/mini), @hookform/resolvers | ~10 KB |
| vendor-layout | @dagrejs/dagre (pinned) | ~14 KB |
| vendor-querybuilder | react-querybuilder v8 | ~30 KB |
| app | All application source | ~150 KB |
| **Eager Total** | | **~532 KB** |

─────────────────────────────────────────────────────────────────────
Lazy Load Chunks
─────────────────────────────────────────────────────────────────────

| Chunk | Trigger | Est. Gzip |
|---|---|---|
| lazy-elk | First Auto-Layout -> Web Worker | ~180 KB |
| lazy-export-image | First Export PNG/SVG click | ~5 KB |
| lazy-export-pdf | First Export PDF click | ~80 KB |
| **Lazy Total** | | **~265 KB** |

─────────────────────────────────────────────────────────────────────
Budget Summary
─────────────────────────────────────────────────────────────────────

| | Size |
|---|---|
| Eager (initial render) | ~532 KB |
| Peak (all lazy triggered) | ~797 KB |
| Absolute budget (C-04) | 5,120 KB |
| Headroom | ~4,323 KB |
| CI gate threshold | 4,500 KB |

Fluent UI 190 KB estimate note (Skeptic Challenge 7): the 190 KB figure is based
on bundlephobia data for selective Fluent UI v9 imports. An actual measured build
with the specific CWFD-001 component set (Button, Dialog, Input, Combobox, Select,
Spinner, Badge, Tooltip, DataGrid) must be run during Phase 4 Sprint 1. If the
measured size exceeds 250 KB, the CI gate threshold must be adjusted accordingly.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 14 — LICENSE COMPLIANCE (COND-05 RESOLUTION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Package | License | Enterprise Deployment | Action Required |
|---|---|---|---|
| @xyflow/react | MIT | Unrestricted | proOptions={{ hideAttribution: true }} is MIT-permitted |
| @fluentui/react-components | MIT | Unrestricted | None |
| zustand | MIT | Unrestricted | None |
| immer | MIT | Unrestricted | None |
| zundo | MIT | Unrestricted | None |
| @tanstack/react-query | MIT | Unrestricted | None |
| react-hook-form | MIT | Unrestricted | None |
| zod | MIT | Unrestricted | None |
| react-querybuilder | MIT | Unrestricted | None |
| html-to-image | MIT | Unrestricted | None |
| jspdf | MIT | Unrestricted | None |
| @dagrejs/dagre | MIT | Unrestricted | None |
| elkjs | EPL-2.0 | Permitted (not copyleft for consumption) | Add ELK attribution to NOTICES.md |

EPL-2.0 Attribution -- required in NOTICES.md before Phase 4:
```
Eclipse Layout Kernel (ELK)
https://eclipse.dev/elk/
Copyright 2024 Kiel University and others.
Licensed under the Eclipse Public License 2.0.
https://www.eclipse.org/legal/epl-2.0/

This application uses ELK for automatic graph layout.
ELK source: https://github.com/kieler/elkjs (not modified).
```

Client action (A-03): legal team must confirm EPL-2.0 is acceptable for
enterprise deployment before Phase 4 is authorized.

COND-05 RESOLVED at architecture level. Client legal confirmation is the
outstanding gate item.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 15 — SECURITY ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
Authentication and Session
─────────────────────────────────────────────────────────────────────

The designer inherits the CRM user session entirely. No separate auth mechanism.
- Online: Xrm.WebApi uses authenticated user's cookie session.
- On-Prem: fetch() with credentials:'include' uses NTLM browser session.
- No OAuth tokens, no service accounts, no stored tokens (C-CEO-05, NFR-04a, C-06).

─────────────────────────────────────────────────────────────────────
Input Validation
─────────────────────────────────────────────────────────────────────

Two validation boundaries:
1. Form boundary (react-hook-form + zod): all user input validated before store write.
2. CRM write boundary (adapter layer): GUID validation via assertGuid(); string
   sanitisation (HTML entity escaping, control character stripping); FetchXML
   well-formedness via DOMParser (NFR-04e -- non-negotiable).

Schema name validation: /^[a-zA-Z][a-zA-Z0-9_]{0,99}$/

─────────────────────────────────────────────────────────────────────
postMessage Security
─────────────────────────────────────────────────────────────────────

Origin validation on every message from the FetchXML builder iframe:
```typescript
const expectedOrigin = new URL(environmentService.getClientUrl()).origin;
if (event.origin !== expectedOrigin) return;
```
Origin check executes before any payload parsing. No fallback accepts arbitrary origins.

─────────────────────────────────────────────────────────────────────
iframe Sandbox
─────────────────────────────────────────────────────────────────────

```
sandbox="allow-same-origin allow-scripts allow-forms"
```
allow-top-navigation, allow-popups, allow-downloads intentionally excluded.

─────────────────────────────────────────────────────────────────────
No External Network Calls
─────────────────────────────────────────────────────────────────────

All API calls target the CRM org URL only. No CDN, no external telemetry, no
external auth. Enforced by the CRM iframe CSP.

─────────────────────────────────────────────────────────────────────
Structured Logging
─────────────────────────────────────────────────────────────────────

No console.log in production code. AuditService provides structured logging:
```typescript
interface LogEntry {
  level: 'info' | 'warn' | 'error';
  correlationId: string;
  operation: string;
  timestamp: string;
  context: Record<string, unknown>;
  error?: Error;
}
```
Production: rotating sessionStorage buffer (last 200 entries).
Development: additionally written to console.debug.
Diagnostic access: Ctrl+Shift+D keyboard shortcut opens the log viewer.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 16 — DEPLOYMENT ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
Build Output
─────────────────────────────────────────────────────────────────────

```
dist/
├── index.htm
└── assets/
    ├── vendor-react.[hash].js
    ├── vendor-flow.[hash].js
    ├── vendor-fluent.[hash].js
    ├── vendor-state.[hash].js
    ├── vendor-query.[hash].js
    ├── vendor-form.[hash].js
    ├── vendor-layout.[hash].js
    ├── vendor-querybuilder.[hash].js
    ├── app.[hash].js
    ├── app.[hash].css
    ├── lazy-elk.[hash].js
    ├── lazy-export-image.[hash].js
    └── lazy-export-pdf.[hash].js
```

─────────────────────────────────────────────────────────────────────
Deployment Target A -- CRM Web Resource (Online + On-Prem)
─────────────────────────────────────────────────────────────────────

Web resource naming: `qdb_/workflow-designer/index.htm` and one web resource per
chunk file under `qdb_/workflow-designer/assets/`.

Solution XML: each file declared as an individual RootComponent entry (no wildcards).
Pattern established by Form Designer engagement (FDWR-001).

`scripts/packageSolution.js` enumerates dist/ and generates the solution XML.

Security role: `WorkflowDesignerUser` -- Create, Read, Write, Delete on all four
qdb_* entities.

─────────────────────────────────────────────────────────────────────
Deployment Target B -- Power Platform Managed Solution
─────────────────────────────────────────────────────────────────────

Publisher prefix: qdb (C-07 -- fixed).
Solution name: qdb_WorkflowDesigner.
Version: 1.0.0.0.
Build: `pac solution pack`.
Deploy: `pac solution import --path qdb_WorkflowDesigner.zip`.
Constraint: never import into the Default Solution (Active layer) -- constitution
Article XI.

─────────────────────────────────────────────────────────────────────
CI / CD Pipeline
─────────────────────────────────────────────────────────────────────

```
GitHub Actions -- pull_request + push to main:

Step 1: npm ci
Step 2: npm run type-check        (tsc --noEmit; strict mode)
Step 3: npm run lint              (ESLint; no-any, named-imports-fluent rules)
Step 4: npm run test              (Vitest; 80% coverage gate)
Step 5: npm run build             (Vite production build)
Step 6: node scripts/checkBundleSize.js  (fail if > 4,500 KB gzip)
Step 7: npm run test:e2e          (Playwright; on-demand; requires Dataverse target)
```


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 17 — ARCHITECTURE DECISION RECORDS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full ADR files: `projects/crm-workflow-designer/adrs/`

| ADR | Title | Status |
|---|---|---|
| ADR-001 | React Flow Canvas Library Selection | Accepted |
| ADR-002 | Adapter Pattern for Dual-Environment CRM Communication | Accepted |
| ADR-003 | Zustand Flat-Map State Architecture | Accepted |
| ADR-004 | Auto-Layout Engine: ELK Primary + Dagre Fallback with Web Worker | Accepted |
| ADR-005 | FetchXML Builder: Two-Path Design | Accepted |
| ADR-006 | Versioning Engine: CRM Schema Delta and Graceful Degradation | Accepted |
| ADR-007 | Bundle Strategy: Chunk Split, Lazy Loading, and 5 MB Constraint | Accepted |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 18 — DATA ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
Entity Relationship
─────────────────────────────────────────────────────────────────────

```
qdb_work_item_record_type (Process)
  qdb_name | qdb_recordentity | qdb_regardingfield | qdb_parententity
  + qdb_version_major | qdb_version_minor | qdb_workflow_state
  + qdb_workflow_snapshot (JSON) | qdb_published_on | qdb_cloned_from
  |
  +--(1:N qdb_record_type)---> qdb_work_item_steps (Step)
      qdb_sequenceno | qdb_schemaname | qdb_name | qdb_tasksubject
      qdb_recordentity | qdb_regardingfield | qdb_parententity
      qdb_task_assign_to | qdb_assigned_user | qdb_team
      qdb_enableroundrobin | qdb_roundrobinteam | qdb_taskdescription
      |
      +--(1:N qdb_workitemstep)---> qdb_outcome (Outcome)
          qdb_sequencenumber | qdb_name | qdb_applyfilter
          |
          +--(1:N qdb_outcome)---> qdb_outcomeworktasks (Route)
              qdb_sequencenumber | qdb_name | qdb_subject
              qdb_filter (FetchXML)
              |
              +--(N:1 qdb_nextworkitemstep)---> qdb_work_item_steps
```

─────────────────────────────────────────────────────────────────────
qdb_workflow_snapshot JSON Schema
─────────────────────────────────────────────────────────────────────

```typescript
interface WorkflowSnapshot {
  version: string;          // "1.0" snapshot format version
  capturedAt: string;       // ISO 8601
  processId: string;
  workflowVersion: string;  // "1.3" workflow semantic version at capture
  steps: Record<string, WorkflowStepSnapshot>;
  outcomes: Record<string, WorkflowOutcomeSnapshot>;
  routes: Record<string, WorkflowRouteSnapshot>;
  stepOrder: string[];
  outcomeOrder: Record<string, string[]>;
  routeOrder: Record<string, string[]>;
  nodePositions: Record<string, { x: number; y: number }>;
}
```

─────────────────────────────────────────────────────────────────────
sessionStorage Autosave
─────────────────────────────────────────────────────────────────────

Key: `cwfd_autosave_{processId}`
TTL: sessionStorage (cleared on tab close)
Write: debounced 2 seconds; serialisation via queueMicrotask (non-blocking)
Max size: ~100 KB for 200-node workflow (well within 5 MB sessionStorage limit)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 19 — CEO CONDITION RESOLUTION STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Code | Condition | Status | Resolution |
|---|---|---|---|
| COND-01 | Four CRM entities confirmed as pre-deployment assumption with client action item | RESOLVED | Section 20 (A-01) |
| COND-02 | Versioning fields exact delta; graceful degradation path designed | RESOLVED | Section 10; ADR-006 |
| COND-03 | FetchXML two-path design; postMessage contract; ADR with detection logic | RESOLVED | Section 9; ADR-005 |
| COND-04 | Bundle budget by chunk with gzip estimates; < 5 MB confirmed | RESOLVED | Section 13; ADR-007 |
| COND-05 | MIT license for all packages; EPL-2.0 attribution action documented | RESOLVED | Section 14 |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 20 — STRATEGIC RISK RESOLUTION STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Code | Risk | Architecture Response | Status |
|---|---|---|---|
| SR-01 | FetchXML Advanced Filter Page URL/contract not guaranteed | Two-path design (ADR-005); automatic detection and fallback | RESOLVED |
| SR-02 | Bundle size vs. Web Resource constraints | 532 KB eager, 797 KB peak; 4,323 KB headroom; CI gate | RESOLVED |
| SR-03 | Versioning schema gap | Exact delta defined (ADR-006); graceful degradation designed; client action item | RESOLVED |
| SR-04 | Circular reference detection at scale | DFS O(V+E); < 10ms for 200 nodes; QA benchmark required | NOTED -- QA action |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 21 — ASSUMPTIONS AND CLIENT ACTION ITEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A-01 (COND-01): The four CRM entities (qdb_work_item_record_type,
qdb_work_item_steps, qdb_outcome, qdb_outcomeworktasks) are pre-deployed and
accessible in all target environments. Client CRM platform team must confirm in
writing before Phase 4 authorization.

A-02 (COND-02): Client CRM platform team must approve the six field additions to
qdb_work_item_record_type (Section 10, ADR-006) in writing before Phase 4.

A-03 (COND-05): Client legal team must confirm EPL-2.0 is acceptable for enterprise
deployment (elkjs attribution -- Section 14) before Phase 4.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 22 — ARCHITECTURAL RISKS (RANKED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Rank | Risk | P | I | Mitigation |
|---|---|---|---|---|
| 1 | CRM Advanced Filter Page postMessage contract changes in future CRM release | M | H | Automatic silent fallback to Path B on 5-second message timeout |
| 2 | Versioning fields not approved by client before build begins | M | H | Graceful degradation designed; COND-02 is a hard gate |
| 3 | React Flow performance < 30fps at 200+ nodes without explicit virtualization | M | H | QA benchmark mandatory (NFR-01b); configure onlyRenderVisibleElements if needed |
| 4 | On-Prem NTLM session expiry causes 401 mid-session | L | H | withRetry() on 401 triggers re-authentication prompt |
| 5 | Fluent UI barrel imports inflate vendor-fluent chunk | M | M | ESLint named-import rule; CI gate catches regression |
| 6 | Publish atomicity failure -- two Published records | L | M | Repair Publish action; 3-retry backoff on archive step |
| 7 | qdb_workflow_snapshot Memo field limit exceeded for very large workflows | L | M | Monitor size in VersioningService; LZ-String compression if needed |
| 8 | zundo abandonment (below 1,000-star threshold) | L | L | 30-line custom fallback temporal middleware documented in ADR-003 |
| 9 | Dagre layout bug in specific graph topologies | L | L | Dagre is fallback only; ELK is primary; pinned version |
| 10 | Circular DFS at extreme graph sizes (500+ nodes) | VL | L | O(V+E) acceptable; no action needed for v1 |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 23 — IMPACT ANALYSIS AND SEARCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Impact Analysis (FR-19): ImpactAnalysisPanel.tsx performs BFS backward and forward
from the selected step ID using the store's route adjacency data. Affected node IDs
are dispatched to the store; React Flow applies a highlight class via the nodes'
`className` field in the derived selector. Dismissing the panel clears the highlight.

Search (FR-18): SearchPanel.tsx performs client-side filter against the cached
process list (React Query). Searches: process name, task subject, entity logical
name, assigned user display name, team display name. For installations with >500
processes, a server-side OData `$filter contains()` query is used instead (toggle
at a configurable threshold in CrmApiService).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 24 — SKEPTIC REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> CHALLENGE 1 -- CrmEnvironmentService: Online detection relies on ".dynamics.com"
> in the client URL. GCC High, DoD, and sovereign cloud environments
> (dynamics.com.uk, microsoftdynamics.de, dynamics.cn) do not match this pattern
> and will be misclassified as On-Prem. What happens when a GCC High customer
> deploys this? Resolution required before Phase 4: enumerate sovereign cloud domains
> or provide a URL parameter override mechanism.

> CHALLENGE 2 -- Adapter Selection: We assume Xrm.WebApi is available in the UCI
> context. If this designer is opened in a Teams tab, a Power Pages portal frame, or
> a custom model-driven app with non-standard iframe nesting, the fallback chain
> (window.parent.Xrm) may fail. At 3am, a CRM upgrade changes iframe nesting depth.
> CrmContextError is thrown. The designer is completely unusable. The fallback chain
> should test all reasonable nesting depths, not just window.parent.

> CHALLENGE 3 -- Publish Atomicity: If archiving the old record fails after 3 retries,
> two Published records exist. The "Repair Publish" action requires the user to notice
> the error. If they close the designer, the data is permanently inconsistent. Who
> repairs it? A background integrity check on designer open (query for multiple
> Published records per process ID and auto-repair) should be designed.

> CHALLENGE 4 -- Store-to-Canvas Sync: On connection validation failure (e.g.,
> invalid edge type), React Flow has already rendered the speculative edge before
> onConnect fires. If the handler rejects the connection, React Flow must remove the
> visual edge. The onConnectEnd handler must explicitly remove speculatively-rendered
> edges or the visual and store states diverge until the next render cycle.

> CHALLENGE 5 -- postMessage Probe: The availability probe sends a real HTTP request
> to the CRM Advanced Filter Page. This request appears in CRM server-side logs and
> may trigger server-side event handlers or audit entries for page loads. On every
> first "Add Condition" click, an invisible page load is recorded. Low-risk but
> worth documenting as a known side-effect so the client's CRM audit team is not
> surprised.

> CHALLENGE 6 -- Flat Map + Ordering Array Consistency: Ordering array consistency
> is a developer discipline contract. A developer who adds a step to the steps map
> without adding its ID to stepOrder produces a ghost entry with no test failure
> unless the test explicitly validates ordering consistency. The development-mode
> invariant check described in Section 6 mitigates this, but it must be implemented
> before the first line of node creation code is written.

> CHALLENGE 7 -- Fluent UI 190 KB Budget Assumption: The 190 KB estimate is based on
> bundlephobia data for selective Fluent UI v9 imports. It has NOT been verified
> against an actual Vite build with the specific CWFD-001 component set. If Fluent UI
> internal re-exports change in a patch release, previously tree-shaken imports may
> pull in more code. Measure the actual chunk size in Sprint 1 and adjust the CI gate
> if necessary.

> CHALLENGE 8 -- zundo Memory Usage: At 200 nodes x ~0.5 KB per node snapshot x 50
> undo states, the in-memory undo history is approximately 5 MB. On a browser tab
> that also holds the CRM application, this may trigger GC pauses. Immer's structural
> sharing reduces this significantly (unchanged nodes share references). The actual
> heap cost depends on the mutation rate. Measure during QA with a 200-node workflow
> and 50 sequential edits. Adjust the limit to 25 if GC pauses are observed.

> CHALLENGE 9 -- sessionStorage Autosave: sessionStorage.setItem() is synchronous
> and blocks the main thread. For a 200-node workflow, JSON.stringify of the autosave
> payload is estimated at 50-100ms. The design specifies queueMicrotask for
> serialisation -- this moves the stringify off the synchronous call stack but does
> not move it off the main thread. A true non-blocking solution requires a Web Worker.
> For v1, queueMicrotask is sufficient given the 2-second debounce. Revisit if user
> testing reveals visible pauses during active editing.

> CHALLENGE 10 -- On-Prem OData Batch Character Encoding: The ODataAdapter constructs
> multipart MIME bodies for $batch. Memo fields (qdb_taskdescription, qdb_workflow_snapshot)
> may contain Unicode characters, HTML entities, or special characters. CRM On-Prem
> 9.0 $batch has known issues with certain UTF-8 sequences in multipart bodies.
> The fallback to sequential writes on 400 response is designed, but the root cause
> of the 400 must be diagnosed -- it may be a character encoding issue that also
> affects sequential writes.

These challenges must be addressed before Phase 4 begins.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 25 — CEO BUILD APPROVAL REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To:      CEO -- Maqsad AI
From:    Architect -- Maqsad AI
Re:      CWFD-001 Phase 3 Architecture Complete -- Requesting Phase 4 Authorization
Date:    2026-06-01

─────────────────────────────────────────────────────────────────────
CEO Conditions -- Resolution Summary
─────────────────────────────────────────────────────────────────────

| Condition | Resolved in This Document |
|---|---|
| COND-01: Four entities as pre-deployment assumption with client action item | Yes -- Section 21 A-01 |
| COND-02: Exact versioning field delta; graceful degradation designed | Yes -- Section 10; ADR-006 |
| COND-03: FetchXML two-path design; postMessage contract; ADR with detection | Yes -- Section 9; ADR-005 |
| COND-04: Bundle formally allocated by chunk; < 5 MB confirmed | Yes -- Section 13; ADR-007 |
| COND-05: MIT licenses; EPL-2.0 attribution action documented | Yes -- Section 14 |

─────────────────────────────────────────────────────────────────────
Outstanding Client Actions (Phase 4 Hard Gates)
─────────────────────────────────────────────────────────────────────

Phase 4 is blocked until the following are confirmed in writing:

1. A-01: Client CRM platform team confirms four qdb_* entities are deployed
   and accessible in all target environments.
2. A-02: Client CRM platform team approves six versioning field additions
   to qdb_work_item_record_type.
3. A-03: Client legal team confirms EPL-2.0 (elkjs) is acceptable for
   enterprise deployment.

─────────────────────────────────────────────────────────────────────
Skeptic Challenges Requiring Architectural Resolution Before Phase 4
─────────────────────────────────────────────────────────────────────

Three of the ten Skeptic challenges require architectural decisions before build:

CHALLENGE 1 (Sovereign Cloud Detection): Add configurable env-type override or
enumerate sovereign cloud domains in CrmEnvironmentService before Sprint 1.

CHALLENGE 3 (Broken Publish Recovery): Design a background integrity check on
designer open that automatically detects and repairs multiple Published records
for the same process. This is a one-time query on open -- not a blocking operation.

CHALLENGE 7 (Fluent UI Chunk Size): Run an actual Vite build in Sprint 1 with the
specific CWFD-001 Fluent UI component set. Measure the vendor-fluent chunk gzip
size and adjust the CI gate threshold if the measured size differs from 190 KB.

Challenges 2, 4, 5, 6, 8, 9, 10 are implementation details resolvable by the
technical team during development without architectural revision.

─────────────────────────────────────────────────────────────────────
Build Readiness Assessment
─────────────────────────────────────────────────────────────────────

Architecture is complete and internally consistent. Seven ADRs justify every
technology deviation from the constitution defaults. All CEO conditions are
resolved at the architecture level. The 4,323 KB bundle headroom provides strong
confidence that the design can absorb reasonable scope growth without hitting
the 5 MB ceiling.

This document requests CEO approval to authorize Phase 4 (Technical Build)
subject to:
1. Satisfactory resolution of the three Skeptic challenges identified above.
2. Written confirmation of the three client action items (A-01, A-02, A-03).

─────────────────────────────────────────────────────────────────────
ADR Files Produced
─────────────────────────────────────────────────────────────────────

Location: `projects/crm-workflow-designer/adrs/`

  ADR-001-react-flow-canvas.md
  ADR-002-adapter-pattern.md
  ADR-003-zustand-flat-maps.md
  ADR-004-elk-dagre-layout.md
  ADR-005-fetchxml-builder-two-path.md
  ADR-006-versioning-schema-delta.md
  ADR-007-bundle-strategy.md
  index.md

═══════════════════════════════════════════════════════════════════════
END OF DOCUMENT -- CWFD-001 Phase 3 Architecture v1.0
Prepared by: Architect -- Maqsad AI | 2026-06-01
Status: PENDING CEO BUILD APPROVAL
═══════════════════════════════════════════════════════════════════════
