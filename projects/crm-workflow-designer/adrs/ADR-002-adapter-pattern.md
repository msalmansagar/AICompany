# ADR-002 — Adapter Pattern for Dual-Environment CRM Communication
**Project:** CWFD-001 — CRM Visual Workflow Designer
**Status:** Accepted
**Date:** 2026-06-01
**Decided by:** Architect — Maqsad AI

---

## Context

The CRM Visual Workflow Designer must operate identically in two distinct environments
from a single deployable artifact (C-01, BO-05):

1. **Dynamics 365 Online / Dataverse** — API access via `Xrm.WebApi` (UCI context object).
   The `Xrm` global is injected by the CRM shell. Batch operations use the Dataverse
   `$batch` endpoint. Solution header `MSCRM.SolutionUniqueName` required on all creates.

2. **Dynamics CRM On-Premise 9.x** — The `Xrm.WebApi` object is available but has a
   reduced feature surface on older 9.x builds. Certain operations (notably `Xrm.WebApi.online`)
   are unavailable. The fallback is a direct `fetch()` against the OData v4 endpoint
   (`/api/data/v9.0/`) with `credentials: 'include'` for Windows Integrated Authentication.

If the application layer calls either API surface directly, every component that
touches the network would need a branch for each environment. This violates the
Single Responsibility Principle and makes both environments untestable in isolation.

---

## Decision

Implement the Adapter pattern with a shared `ICrmAdapter` interface as the sole
API boundary. The application layer depends on `ICrmAdapter` only — it never
imports or calls `DataverseAdapter` or `ODataAdapter` directly.

**Interface contract** (key operations, full definition in `src/adapters/ICrmAdapter.ts`):
```typescript
interface ICrmAdapter {
  // Metadata
  getEntities(): Promise<EntityMetadata[]>;
  getAttributesByEntity(logicalName: string): Promise<AttributeMetadata[]>;
  getUsers(search?: string): Promise<CrmUser[]>;
  getTeams(): Promise<CrmTeam[]>;

  // Process CRUD
  getProcess(id: string): Promise<WorkflowProcess>;
  getProcessList(): Promise<WorkflowProcessSummary[]>;
  createProcess(data: CreateProcessRequest): Promise<string>;
  updateProcess(id: string, data: UpdateProcessRequest): Promise<void>;
  deleteProcess(id: string): Promise<void>;

  // Step CRUD
  getSteps(processId: string): Promise<WorkflowStep[]>;
  createStep(data: CreateStepRequest): Promise<string>;
  updateStep(id: string, data: UpdateStepRequest): Promise<void>;
  deleteStep(id: string): Promise<void>;

  // Outcome CRUD
  getOutcomes(stepId: string): Promise<WorkflowOutcome[]>;
  createOutcome(data: CreateOutcomeRequest): Promise<string>;
  updateOutcome(id: string, data: UpdateOutcomeRequest): Promise<void>;
  deleteOutcome(id: string): Promise<void>;

  // Route CRUD
  getRoutes(outcomeId: string): Promise<WorkflowRoute[]>;
  createRoute(data: CreateRouteRequest): Promise<string>;
  updateRoute(id: string, data: UpdateRouteRequest): Promise<void>;
  deleteRoute(id: string): Promise<void>;

  // Operations
  publishProcess(id: string): Promise<void>;
  cloneProcess(id: string): Promise<string>;
  batchWrite(operations: BatchOperation[]): Promise<BatchResult[]>;
}
```

Two concrete implementations:
- **`DataverseAdapter`** — wraps `Xrm.WebApi.online.*` and `Xrm.WebApi.offline.*`.
  Uses `Xrm.WebApi.execute()` for batch operations. Adds `MSCRM.SolutionUniqueName`
  header via a custom request class on all creates.
- **`ODataAdapter`** — uses `fetch()` with `credentials: 'include'` against the
  `/api/data/v9.0/` endpoint. Constructs OData `$batch` multipart bodies manually.
  Handles NTLM/Windows Integrated Authentication transparently (same-origin cookie).

**Adapter selection** is performed once at application startup by `CrmEnvironmentService`:
```typescript
const adapter: ICrmAdapter = environmentService.isOnline()
  ? new DataverseAdapter(environmentService)
  : new ODataAdapter(environmentService);
```

The adapter instance is stored in a React context and accessed via `useCrmAdapter()`.
No component or service imports an adapter class directly.

---

## Alternatives Considered

**Option A — Feature detection on every call:**
Each service method checks `isOnline()` and branches inline.
Rejected: duplicates branching logic across all services; makes unit testing require
mocking the environment service everywhere.

**Option B — Single implementation using only stable Xrm.WebApi methods:**
Use only the common Xrm.WebApi subset available on both environments.
Rejected: the stable subset is too limited — batch write (`executeMultiple`) is not
reliable on older On-Prem 9.0 builds. Forcing sequential saves for Online to maintain
parity wastes API throughput unnecessarily.

**Option C — Adapter pattern (chosen):**
Clean interface boundary. Each environment's adapter is testable in isolation by
mocking `CrmEnvironmentService`. The application layer has zero knowledge of which
adapter is active.

---

## Consequences

**Positive:**
- The application layer is 100% environment-agnostic.
- Each adapter is unit-tested independently against its own API surface.
- Adding a third environment (e.g., Dataverse for Teams) requires only a new
  `ICrmAdapter` implementation — no application-layer changes.
- `ICrmAdapter` serves as the contract for the QA test harness: the integration
  test suite can swap the real adapter for a deterministic in-memory stub.

**Negative / Risks:**
- Two parallel implementations must be kept in sync when new CRM entity fields are
  added. A shared `CrmFieldMapper` class (maps raw OData response to typed domain
  models) mitigates this — both adapters use the same mapper.
- On-Prem OData adapter must handle NTLM 401 challenges gracefully. The `fetch()`
  call with `credentials: 'include'` relies on the browser's native NTLM handling;
  this is correct for same-origin Web Resource context but must be verified against
  the target On-Prem CRM server configuration during QA (US-08, AC-08c).
