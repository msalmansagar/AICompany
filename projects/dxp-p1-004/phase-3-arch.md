# DXP-P1-004 — Phase 3: Architecture
# DXP Platform Phase 4: Versioning & Snapshots

```
═══════════════════════════════════════════════════
ARCHITECTURE DOCUMENT
═══════════════════════════════════════════════════
Engagement ID:  DXP-P1-004
Title:          DXP Platform Phase 4 — Versioning & Snapshots
Prepared by:    Maqsad AI — Architect
Date:           2026-06-22
Version:        1.0
Status:         COMPLETE — Pending CEO Gate Conditions (OQ-001 through OQ-005, NFR-008)
═══════════════════════════════════════════════════
```

---

## ⚠ Gate Status at Architecture Entry

| Gate | Condition | Status |
|------|-----------|--------|
| GGAP-001 via Path A ($batch isLatest) | DXP-P1-001 delivery | **ASSUMED CLEARED** — implement POST-1 + GGAP-001 in P1-004 tech phase as prerequisite delivery items; see ADR-004-001 |
| POST-1: GET /versions/latest | DXP-P1-001 delivery | **IMPLEMENT IN P1-004** — no code found; tech phase delivers it |
| POST-3: qdb_deprecated_on provisioned | DXP-P1-001 delivery | **IMPLEMENT IN P1-004** — provisioning script extended in tech phase |
| DXP-P1-002 JWT permissions claim frozen | P1-002 completion | **CLEARED** — P1-002 CEO APPROVED, all phases complete (2026-06-21) |
| DXP-P1-003 token resolution API stable | P1-003 completion | **CLEARED** — P1-003 CEO APPROVED, RedisTokenCache + sanitisation committed (2026-06-22) |
| OQ-001 Durable queue technology | QDB IT/DevOps | **ASSUMED** — Azure Service Bus Standard; see ADR-004-002 |
| OQ-002 Daily snapshot volume | QDB Business/IT | **ASSUMED** — ≤2,000 snapshots/day peak; see ADR-004-003 |
| OQ-003 Reference code format | QDB Compliance | **ASSUMED** — opaque format SNAP-{YYYYMMDD}-{8hex}; see ADR-004-004 |
| OQ-004 Azure Blob data residency | QDB IT/Compliance | **ASSUMED** — Qatar Central primary, UAE North GRS; see ADR-004-005 |
| OQ-005 Form submission data hash | QDB Compliance | **ASSUMED** — YES, include SHA-256 hash; see ADR-004-006 |
| NFR-008 User ID-only posture | QDB Compliance | **ASSUMED** — confirmed sufficient; see ADR-004-007 |

Architecture proceeds on assumed answers per ADRs below. All ADRs marked PENDING CLIENT CONFIRMATION must be resolved in writing before build begins.

---

## 1. Architecture Overview

DXP-P1-004 adds a compliance audit layer to the existing DXP platform without touching the operational write path. The design principle is **observe, not participate**: snapshot creation is fully asynchronous, never blocks a triggering operation, and never causes data loss in the triggering system.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  TRIGGERING SYSTEMS                                                          │
│                                                                              │
│  Portal API (Fastify)       DFE Submission       Portal Admin Actions       │
│  ┌─────────────────────┐   ┌─────────────────┐  ┌────────────────────────┐ │
│  │ RBAC events         │   │ form_submission  │  │ set-latest             │ │
│  │ token publish       │   │ service_request  │  │ deprecate-version      │ │
│  │ component ops       │   └────────┬────────┘  └──────────┬─────────────┘ │
│  └────────┬────────────┘            │                       │               │
└───────────┼─────────────────────────┼───────────────────────┼───────────────┘
            │                         │                       │
            ▼                         ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  SNAPSHOT ENQUEUE LAYER  (runs synchronously in the triggering request)      │
│                                                                              │
│  SnapshotTriggerService                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Materialise token state    → call TokenResolutionService (P1-003)   │ │
│  │ 2. Materialise RBAC state     → query qdb_rbac_user_roles (P1-002)     │ │
│  │ 3. Materialise component ver  → call GET /versions/latest (POST-1)     │ │
│  │ 4. Compute SHA-256 hashes     → canonical JSON, sorted keys            │ │
│  │ 5. Set qdb_QueuedAt           → current UTC timestamp                  │ │
│  │ 6. Publish to Service Bus     → fire-and-forget; failure is non-fatal  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬────────────────────────────────────────────────┘
                              │ Service Bus message
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  AZURE SERVICE BUS (Standard Tier)                                           │
│                                                                              │
│  Queue: qdb-snapshot-events        DLQ: qdb-snapshot-events/$DeadLetterQueue│
│  ┌────────────────────────────┐    ┌────────────────────────────────────────┐│
│  │ MaxDeliveryCount: 3        │    │ ReconciliationWorker                   ││
│  │ LockDuration: 5 min        │    │  → retry with backoff                  ││
│  │ MessageTTL: 14 days        │    │  → alert ops after 3 failures           ││
│  │ DuplicateDetection: 1 hour │    │  → write to qdb_snapshot_errors        ││
│  └────────────┬───────────────┘    └────────────────────────────────────────┘│
└──────────────┼───────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  SNAPSHOT CONSUMER (Fastify background worker — same process, separate loop) │
│                                                                              │
│  SnapshotConsumerService                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Poll Service Bus (peek-lock)                                         │ │
│  │ 2. Validate message schema (Zod)                                        │ │
│  │ 3. Generate qdb_ReferenceCode (SNAP-{YYYYMMDD}-{nanoid-8})             │ │
│  │ 4. Write qdb_platform_snapshots to Dataverse                            │ │
│  │ 5. Complete message (remove from queue)                                 │ │
│  │ 6. On failure: abandon → Service Bus retries → DLQ after MaxDelivery   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DATAVERSE  (QdbDxpPlatform solution)                                        │
│                                                                              │
│  qdb_platform_snapshots  ─────── qdb_component_versions (Lookup)            │
│  qdb_snapshot_errors                                                         │
│  qdb_component_versions  (+ qdb_deprecated_on field — POST-3)               │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key invariant:** Token state, RBAC state, and component version are all captured **at enqueue time** inside the triggering request. By the time the consumer writes to Dataverse (up to 30 seconds later), the source records may have changed. The snapshot message carries the full materialised state, not a pointer to be re-fetched at write time.

---

## 2. Prerequisite Delivery Items (Tech Phase — pre-build)

Three P1-001 items are not yet implemented and must be delivered in P1-004's tech phase before the snapshot system can be built. They are treated as prerequisite implementation tasks, not blockers that delay the architecture.

### 2.1 POST-1 — GET /versions/latest Endpoint

```
GET /api/admin/components/:id/versions/latest
Authorization: Bearer <portal-admin JWT>

Response 200:
{
  "versionId": "uuid",
  "componentId": "uuid",
  "versionNumber": "2.1.0",
  "isLatest": true,
  "deprecatedOn": null,
  "propsSchema": { ... },
  "createdOn": "2026-06-22T10:00:00Z"
}

Response 404 (code: no_active_latest_version):
  No version with isLatest=true and deprecatedOn null/future

OData query:
  qdb_component_versionses?$filter=_qdb_componentid_value eq {id}
    and qdb_islatest eq true
    and (qdb_deprecated_on eq null or qdb_deprecated_on gt {now})
  &$top=1
```

### 2.2 POST-3 — qdb_deprecated_on Field

Added to `qdb_component_versions` in the existing P1-001 provisioning solution:

```typescript
{
  '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
  SchemaName: 'qdb_deprecated_on',
  LogicalName: 'qdb_deprecated_on',
  DisplayName: { LocalizedLabels: [{ Label: 'Deprecated On', LanguageCode: 1033 }] },
  RequiredLevel: { Value: 'None' },
  DateTimeBehavior: { Value: 'TimeZoneIndependent' },
}
```

API behaviour:
- `PATCH /api/admin/components/:id/versions/:versionId` with `{ "deprecatedOn": "2026-07-01T00:00:00Z" }`
- Immutability enforced: if `qdb_deprecated_on` is already non-null, reject with HTTP 400 `deprecated_on_immutable`
- Deprecating `isLatest=true` version: HTTP 409 `cannot_deprecate_latest_version`

### 2.3 GGAP-001 — $batch for isLatest Atomicity (Path A)

The `set-latest` operation must be atomic: clear `isLatest=false` on all sibling versions and set `isLatest=true` on the target in a single `$batch` request. This prevents concurrent promotions creating two `isLatest=true` records, which would corrupt snapshot version resolution.

```
POST /api/data/v9.2/$batch
Content-Type: multipart/mixed; boundary=batch_001

--batch_001
Content-Type: application/http
Content-Transfer-Encoding: binary

PATCH [org]/api/data/v9.2/qdb_component_versionses({currentLatestId})
Content-Type: application/json

{ "qdb_islatest": false }

--batch_001
Content-Type: application/http
Content-Transfer-Encoding: binary

PATCH [org]/api/data/v9.2/qdb_component_versionses({targetId})
Content-Type: application/json

{ "qdb_islatest": true }

--batch_001--
```

Implemented in `DataverseHttpClient.patchBatch(operations)` using the existing client pattern.

---

## 3. Data Model

### 3.1 New Entity: qdb_platform_snapshots

Write-once. No UPDATE or DELETE permitted at API or Dataverse security role layer.

| SchemaName | OData Type | Length | Notes |
|-----------|-----------|--------|-------|
| `qdb_SnapshotId` | UniqueidentifierAttributeMetadata | — | PK (auto-generated GUID) |
| `qdb_ReferenceCode` | StringAttributeMetadata | 50 | `SNAP-{YYYYMMDD}-{8hex}` — unique; see ADR-004-004 |
| `qdb_EventType` | PicklistAttributeMetadata | — | Global option set `qdb_snapshot_event_type` |
| `qdb_EventTimestamp` | DateTimeAttributeMetadata | — | UTC; triggering event time |
| `qdb_QueuedAt` | DateTimeAttributeMetadata | — | UTC; time message was enqueued — SLA measurement start |
| `qdb_TriggeredByUserId` | StringAttributeMetadata | 100 | JWT `sub` claim or `system` |
| `qdb_SessionId` | StringAttributeMetadata | 100 | Portal session ID (nullable for system events) |
| `qdb_ServiceSlug` | StringAttributeMetadata | 100 | Service context (nullable for platform-level events) |
| `qdb_ComponentSlug` | StringAttributeMetadata | 100 | Component context (nullable) |
| `qdb_ComponentVersionId` | LookupAttributeMetadata | — | FK → `qdb_component_versions`; no-cascade (see §3.4) |
| `qdb_ComponentVersionNumber` | StringAttributeMetadata | 50 | Denormalised at snapshot time |
| `qdb_TokenSetHash` | StringAttributeMetadata | 64 | SHA-256 hex of canonical token JSON |
| `qdb_TokenSetJson` | MemoAttributeMetadata | 1048576 | Full resolved token map at enqueue time; null after archival |
| `qdb_RbacPolicyHash` | StringAttributeMetadata | 64 | SHA-256 hex of canonical RBAC JSON |
| `qdb_RbacPolicyJson` | MemoAttributeMetadata | 65536 | User role assignments at enqueue time; null after archival |
| `qdb_PropsSchemaHash` | StringAttributeMetadata | 64 | SHA-256 hex of component propsSchema (nullable for non-component events) |
| `qdb_FormDataHash` | StringAttributeMetadata | 64 | SHA-256 hex of submitted form payload — DFE-provided (see ADR-004-006) |
| `qdb_ArchiveUrl` | StringAttributeMetadata | 500 | Azure Blob URL; populated by archival flow; null until archival |
| `qdb_CreatedOn` | — | — | Dataverse standard; auto-populated on write |

### 3.2 New Entity: qdb_snapshot_errors

Append-only failure log. Access: operations-scope only (not portal-admin).

| SchemaName | OData Type | Length | Notes |
|-----------|-----------|--------|-------|
| `qdb_EventType` | PicklistAttributeMetadata | — | Same global option set as snapshots |
| `qdb_EventTimestamp` | DateTimeAttributeMetadata | — | From original trigger event |
| `qdb_ErrorCode` | StringAttributeMetadata | 100 | Structured error code (e.g. `dataverse_write_failed`) |
| `qdb_ErrorMessage` | MemoAttributeMetadata | 4000 | Full error message (no stack trace in prod) |
| `qdb_EventPayloadJson` | MemoAttributeMetadata | 4000 | Sanitised event payload (no token/RBAC JSON — too large) |
| `qdb_AttemptCount` | IntegerAttributeMetadata | — | How many times this event was retried |
| `qdb_ResolvedAt` | DateTimeAttributeMetadata | — | Populated by ReconciliationWorker on successful replay |
| `qdb_CreatedOn` | — | — | Dataverse standard |

### 3.3 New Global Option Set: qdb_snapshot_event_type

Option value range: 860006001–860006010

| Code | Label |
|------|-------|
| 860006001 | Form Submission |
| 860006002 | Service Request |
| 860006003 | Component Version Promoted |
| 860006004 | Component Version Deprecated |
| 860006005 | Token Published |
| 860006006 | RBAC Role Assigned |
| 860006007 | RBAC Role Revoked |

### 3.4 ComponentVersionId Lookup — Cascade Decision

**Decision: No-cascade (no restrict-delete).**

Rationale: The `qdb_ComponentVersionNumber` field is denormalised on every snapshot at write time. The Lookup FK serves only referential navigation (linking in the Dataverse UI) — data integrity does not depend on the FK target remaining active. Over a 7-year retention horizon, imposing restrict-delete on component versions would block legitimate version cleanup operations and create operational burden disproportionate to the navigational benefit. The denormalised version number is the authoritative audit field; the FK is a convenience pointer.

The Dataverse relationship is therefore configured with `CascadeConfiguration.Delete = 'RemoveLink'` — if a component version is deactivated, the FK pointer on the snapshot is cleared, but the snapshot record and its denormalised version number remain intact.

---

## 4. Service Architecture

All new services live in `projects/portal-shell/apps/api/src/services/snapshots/`.

### 4.1 SnapshotTriggerService

Called from within every trigger event handler. Runs synchronously inside the request (fast path) but its failure must never propagate to the caller.

```typescript
interface SnapshotTriggerPayload {
  readonly eventType: SnapshotEventType;
  readonly eventTimestamp: Date;
  readonly triggeredByUserId: string;
  readonly sessionId?: string;
  readonly serviceSlug?: string;
  readonly componentSlug?: string;
  readonly componentVersionId?: string;
}

class SnapshotTriggerService {
  async enqueue(payload: SnapshotTriggerPayload): Promise<void>
  // Internal steps:
  // 1. materializeTokenState(payload.serviceSlug, payload.sessionId)
  // 2. materializeRbacState(payload.triggeredByUserId)
  // 3. materializeComponentVersion(payload.componentVersionId)
  // 4. computeHashes(tokenJson, rbacJson, propsSchema)
  // 5. buildServiceBusMessage({ ...payload, qdb_QueuedAt: new Date(), tokenJson, rbacJson, hashes })
  // 6. serviceBusClient.sendMessages(message) — fire-and-forget with try/catch
  // Failure: log at ERROR level, write to qdb_snapshot_errors, return void (non-fatal)
}
```

**State materialisation rules:**
- `form_submission` / `service_request`: token state for `serviceSlug` + `locale` from session; RBAC state for `triggeredByUserId`; component version for `componentSlug` via GET /versions/latest
- `component_version_promoted`: component version is the promoted version itself (already known at call site); RBAC state = null; token state = null
- `token_published`: full resolved token map for all render targets; RBAC state = null; component state = null
- `rbac_role_assigned` / `rbac_role_revoked`: RBAC state for the affected user; token state = null; component state = null
- `component_version_deprecated`: component version state at deprecation; RBAC = null; token = null

### 4.2 SnapshotConsumerService

Background worker within the Fastify process. Uses a long-poll loop against the Service Bus queue.

```typescript
class SnapshotConsumerService {
  async start(): Promise<void>  // called on app startup
  async stop(): Promise<void>   // called on graceful shutdown
  private async processMessage(message: ServiceBusMessage): Promise<void>
  // 1. Validate with Zod schema
  // 2. Generate ReferenceCode: `SNAP-${format(eventTimestamp, 'yyyyMMdd')}-${nanoid(8)}`
  // 3. Write to qdb_platform_snapshots via DataverseHttpClient (POST, no solution header — snapshot entity)
  // 4. Complete message on success
  // 5. Abandon on failure → Service Bus retry → DLQ after MaxDeliveryCount (3)
}
```

### 4.3 ReconciliationService

Polls the dead-letter queue on a 5-minute schedule. Attempts replay; on persistent failure, creates a `qdb_snapshot_errors` record and alerts via structured log (Pino ERROR) for ops team pickup.

```typescript
class ReconciliationService {
  async reconcileDeadLettered(): Promise<void>
  // 1. Receive from DLQ (batch of 10)
  // 2. Attempt replay (re-process as if fresh message)
  // 3. On success: complete DLQ message; update qdb_snapshot_errors.qdb_ResolvedAt
  // 4. On failure: log ERROR with correlation ID; write/update qdb_snapshot_errors; dead-letter permanently
  // Compliance events (form_submission, service_request): always write qdb_snapshot_errors even on first failure
}
```

**Dead-letter SLA for compliance events:** A `form_submission` or `service_request` snapshot that reaches the DLQ must trigger an ERROR log within 5 minutes. The ops team must resolve and replay within 24 hours per operational procedure (see Phase 4 tech deliverable — ops runbook).

### 4.4 SnapshotQueryService

Read-only. Powers the admin query API.

```typescript
class SnapshotQueryService {
  async listSnapshots(filters: SnapshotListFilters): Promise<PaginatedResult<SnapshotSummary>>
  async getById(snapshotId: string): Promise<SnapshotDetail>
  async getByReferenceCode(code: string): Promise<SnapshotDetail>
  // getById / getByReferenceCode: if qdb_TokenSetJson/qdb_RbacPolicyJson are null,
  //   fetch from qdb_ArchiveUrl and return; archive fetch failure returns 503
}
```

### 4.5 Hash Utility

```typescript
// src/services/snapshots/hashUtils.ts
function computeCanonicalHash(value: unknown): string
// 1. JSON.stringify with sorted keys (recursive sort via replacer)
// 2. crypto.createHash('sha256').update(canonical).digest('hex')
// Returns 64-char hex string

function canonicalJson(value: unknown): string
// Returns alphabetically sorted JSON string for storage
```

---

## 5. API Contract

All routes under `/api/admin/` — protected by JWT `portal-admin` role (DXP-P1-002 guard).

### 5.1 GET /api/admin/snapshots

```
Query params:
  eventType    string (optional) — one of the 7 event type codes
  userId       string (optional) — filter by triggeredByUserId
  serviceSlug  string (optional)
  componentSlug string (optional)
  from         ISO 8601 date (optional) — qdb_EventTimestamp >=
  to           ISO 8601 date (optional) — qdb_EventTimestamp <=
  cursor       string (optional) — opaque pagination cursor
  pageSize     integer (optional, default 50, max 200)

Response 200:
{
  "items": [
    {
      "snapshotId": "uuid",
      "referenceCode": "SNAP-20260322-a3f8b2c1",
      "eventType": "form_submission",
      "eventTimestamp": "2026-03-22T09:14:22Z",
      "queuedAt": "2026-03-22T09:14:23Z",
      "triggeredByUserId": "uuid",
      "serviceSlug": "home-finance",
      "componentSlug": "request-form",
      "componentVersionNumber": "2.1.0",
      "tokenSetHash": "a3f8...",
      "rbacPolicyHash": "b9c1...",
      "isArchived": false
    }
  ],
  "nextCursor": "...",
  "totalCount": 142
}
```

### 5.2 GET /api/admin/snapshots/:id

Returns full detail including `tokenSetJson` and `rbacPolicyJson` (or fetched from archive if null).

### 5.3 GET /api/admin/snapshots/by-reference/:code

Identical response to `/:id`, addressed by `qdb_ReferenceCode`.

### 5.4 Snapshot Trigger Endpoint (internal — DFE integration)

DFE calls this endpoint at form submission time to trigger the snapshot. The endpoint returns immediately; all state materialisation happens server-side.

```
POST /api/internal/snapshots/trigger
Authorization: Bearer <service-account JWT>  (not portal-admin — internal service role)

Body:
{
  "eventType": "form_submission",
  "sessionId": "...",
  "serviceSlug": "home-finance",
  "componentSlug": "request-form",
  "triggeredByUserId": "...",
  "formDataHash": "sha256-hex-from-dfe"   // DFE computes this; see ADR-004-006
}

Response 202 Accepted (always — even if enqueue fails internally)
```

---

## 6. Async Pipeline — Dead-Letter and Reconciliation Design

*(Architect-owned deliverable — CEO condition 8)*

### 6.1 Service Bus Configuration

```
Queue name:            qdb-snapshot-events
MaxDeliveryCount:      3
LockDuration:          PT5M (5 minutes — allows Dataverse retry within lock window)
DefaultMessageTTL:     P14D (14 days — compliance event must not silently expire)
DuplicateDetection:    PT1H window; MessageId = {eventType}:{triggeredByUserId}:{eventTimestamp}
EnableDeadLettering:   true
```

### 6.2 Retry Flow

```
Message received by consumer
        │
        ▼
  Dataverse write succeeds?
  ┌─── YES ────────────────────────────────────────────────────────────────────┐
  │                Complete message (remove from queue)                        │
  └────────────────────────────────────────────────────────────────────────────┘
  │
  └─── NO ────────────────────────────────────────────────────────────────────┐
          Abandon message (visibility timeout expires; redelivered by SB)    │
          Retry 1 after ~30s, Retry 2 after ~60s, Retry 3 after ~120s       │
                   │                                                          │
                   ▼ (MaxDeliveryCount=3 exhausted)                          │
          Message moves to Dead-Letter Queue                                  │
                   │                                                          │
                   ▼ (ReconciliationService polls every 5 min)               │
          Attempt replay (re-materialise state from original payload)         │
                   │                                                          │
          Success? → Complete DLQ message; update qdb_snapshot_errors        │
                                                                              │
          Failure? → Write/update qdb_snapshot_errors.qdb_ErrorCode          │
                   → Pino ERROR log (correlation ID, event type, user ID)    │
                   → Dead-letter permanently                                  │
                                                                              │
          Compliance events (form_submission, service_request):               │
                   → ERROR log triggers PagerDuty/ops alert (DevOps config)  │
                   → Ops SLA: resolve within 24 hours                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Regulatory Notification Obligation

The BRD is silent on whether a persistent snapshot failure triggers a regulatory notification under QFC standards. **This must be answered by QDB Compliance before build begins.** Architect's default design: write to `qdb_snapshot_errors`, alert ops, and document the gap in the audit trail — no automatic QFC notification is emitted. If QDB Compliance requires notification, a separate notification service must be specified and falls outside P1-004 scope.

---

## 7. Latency SLA Observability

*(Architect-owned deliverable — CEO condition 9)*

### 7.1 qdb_QueuedAt Field

`qdb_QueuedAt` (DateTime, TimeZoneIndependent) is set at enqueue time inside `SnapshotTriggerService`. It is carried in the Service Bus message body and written to the Dataverse record by the consumer.

End-to-end latency = `qdb_CreatedOn` − `qdb_QueuedAt`.

### 7.2 Production Monitoring

A Dataverse-based monitoring query runs every 5 minutes:

```odata
GET qdb_platform_snapshots
  ?$filter=qdb_QueuedAt gt {5minutesAgo}
  &$select=qdb_SnapshotId,qdb_QueuedAt,qdb_CreatedOn,qdb_EventType
```

If any record shows `qdb_CreatedOn − qdb_QueuedAt > 30 seconds`, the monitoring job logs a WARNING. If `> 60 seconds` (2x SLA), it logs ERROR and alerts ops.

The DevOps agent must configure this as an Azure Monitor alert or Application Insights custom metric in Phase 4 tech.

---

## 8. qdb_snapshot_errors Access Control

*(Architect-owned deliverable — CEO condition 10)*

| Principal | Access |
|-----------|--------|
| `portal-admin` Dataverse security role | **NO ACCESS** — read or write. Error records must not be visible to general admin users. |
| `qdb_ops_admin` Dataverse security role (NEW) | Read + Create. Operations team only. |
| Service principal (API) | Create-only via service principal identity. API never exposes `qdb_snapshot_errors` to any HTTP endpoint. |
| Dataverse System Administrator | Full access (standard Dataverse SA behaviour). |

The `qdb_ops_admin` role must be provisioned in the P1-004 provisioning script and documented in the ops runbook.

**API access policy:** No `GET /api/admin/snapshot-errors` endpoint is provided. The operations team queries `qdb_snapshot_errors` directly through Dataverse / Power Apps or through the monitoring dashboard. This reduces the attack surface: an authenticated portal admin cannot enumerate which events failed to produce audit records.

---

## 9. Component Version Deprecation API Design

*(POST-3 prerequisite — implement in tech phase)*

### 9.1 PATCH /api/admin/components/:id/versions/:versionId

```
Body (partial update — only deprecatedOn is settable via this endpoint):
{
  "deprecatedOn": "2026-07-01T00:00:00Z"
}

Validation:
  1. Version must exist and belong to component :id → 404 if not
  2. Version must not already have qdb_deprecated_on set → 400 deprecated_on_immutable
  3. Version must not be isLatest=true → 409 cannot_deprecate_latest_version
  4. deprecatedOn must be a valid ISO 8601 datetime string → 422

Response 200 — updated version object
Response 400 — deprecated_on_immutable (body: { code: 'deprecated_on_immutable', message: '...' })
Response 409 — cannot_deprecate_latest_version
```

### 9.2 Deprecation Snapshot Trigger

When a version is deprecated, the `component_version_deprecated` snapshot is triggered immediately within the same request (enqueued, not blocked):

```typescript
await snapshotTriggerService.enqueue({
  eventType: 'component_version_deprecated',
  eventTimestamp: new Date(),
  triggeredByUserId: req.user.sub,
  componentSlug: component.qdb_slug,
  componentVersionId: versionId,
});
```

---

## 10. Archival Strategy

*(FR-020, FR-021 — Azure Blob Storage)*

### 10.1 Archival Trigger

Power Automate scheduled flow (daily at 02:00 UTC) queries:

```odata
GET qdb_platform_snapshots
  ?$filter=qdb_EventTimestamp lt {2YearsAgo} and qdb_ArchiveUrl eq null
  &$select=qdb_SnapshotId,qdb_TokenSetJson,qdb_RbacPolicyJson
  &$top=500
```

### 10.2 Archival Process (per record)

1. Write JSON payload to Azure Blob: `container: qdb-snapshots / blob: {snapshotId}.json`
2. PATCH `qdb_platform_snapshots({id})`:
   - Set `qdb_ArchiveUrl` to the Blob URL
   - Clear `qdb_TokenSetJson` to null (Dataverse PATCH with explicit null)
   - Clear `qdb_RbacPolicyJson` to null
3. On failure: log error; leave record unchanged (retry on next daily run)

### 10.3 Azure Blob Configuration

```
Storage account:  qdbdxpsnapshots{env}   (QDB IT provisions; see ADR-004-005)
Container:        qdb-snapshots
Tier:             Hot → Cool after 2 years (lifecycle policy)
Region:           Qatar Central (primary)
Replication:      GRS (Qatar Central → UAE North)
Retention policy: 7-year immutable blob storage policy (WORM via Azure Blob immutability)
Access:           Private; service principal SAS token for archival flow; no public access
```

### 10.4 Read-Through on Archived Snapshots

If `GET /api/admin/snapshots/:id` returns a record where `qdb_TokenSetJson` is null and `qdb_ArchiveUrl` is set:

1. Fetch JSON from `qdb_ArchiveUrl` using Azure Blob SDK (service principal SAS)
2. Parse and include in the response as `tokenSetJson` and `rbacPolicyJson`
3. On Blob fetch failure: return HTTP 503 `archive_unavailable` with the `snapshotId` and the error message

---

## 11. BRD Addendum — AC-001 and AC-002 Updates

*(CEO condition 13 — BA deliverable; recorded here per architect instruction)*

### AC-001 (updated)

> A `form_submission` event triggers creation of a `qdb_platform_snapshots` record. The record's `qdb_CreatedOn` must be within 30 seconds of `qdb_QueuedAt` (not within 30 seconds of the HTTP request timestamp). The 30-second SLA is measured as `qdb_CreatedOn − qdb_QueuedAt`. QA must verify using a test that: (a) calls the trigger endpoint; (b) records the response timestamp; (c) polls for the snapshot record for up to 35 seconds using `$filter=qdb_QueuedAt gt {testStart}`; (d) asserts that `qdb_CreatedOn − qdb_QueuedAt ≤ 30s`.

### AC-002 (updated)

> The `qdb_TokenSetJson` field in the snapshot must equal the resolved token map as it existed **at the moment of enqueue** (when `qdb_QueuedAt` was set), not at the moment the consumer wrote the record to Dataverse. The verification approach: (a) call `POST /api/internal/snapshots/trigger` for a `token_published` event; (b) simultaneously call `GET /api/tokens/resolve` with the same render target and locale; (c) change the token set in Dataverse (to simulate a subsequent publish); (d) wait for the snapshot to be written; (e) assert `qdb_TokenSetHash` in the snapshot equals the SHA-256 of the token state captured in step (b), not the changed state. This test verifies enqueue-time materialisation.

---

## 12. Architectural Decision Records

### ADR-004-001 — P1-001 Prerequisite Items Delivered Within P1-004 Tech Phase

**Status:** DECIDED  
**Decision:** GGAP-001 ($batch isLatest), POST-1 (GET /versions/latest), and POST-3 (qdb_deprecated_on) are not present in the codebase. Rather than blocking P1-004 until a separate P1-001 patch is delivered and merged, these three items are treated as prerequisite implementation tasks within P1-004's tech phase. They will be committed to the portal-shell API before the snapshot system is built. This mirrors the P1-001 CEO Phase 7 condition faithfully — the items will be implemented via Path A — and avoids an additional cross-engagement coordination gate.  
**Consequences:** P1-004 tech phase has three pre-work tasks before snapshot implementation begins. The tech phase estimate must account for this.

### ADR-004-002 — Azure Service Bus Standard Tier for Durable Queue

**Status:** ASSUMED — PENDING QDB IT/DEVOPS CONFIRMATION (OQ-001)  
**Assumed answer:** Azure Service Bus Standard tier.  
**Rationale:** Service Bus Standard provides durable queue semantics, dead-letter queues, message lock (up to 5 minutes), duplicate detection (1-hour window), and 14-day message TTL — all required for the compliance snapshot pipeline. It does not require sessions (Premium) because snapshot messages are independent and ordering within an event type is not required for correctness. Storage Queue was rejected: it lacks native dead-letter queue and duplicate detection, which are required for the audit system. BullMQ (Redis-backed) was rejected: it adds a Redis dependency already present (P1-003), but it requires in-process persistence and does not survive a full Azure node failure without Redis AOF — insufficient durability for a compliance system.  
**If QDB IT confirms a different technology:** Architecture and implementation must be revisited before build.

### ADR-004-003 — Snapshot Volume Assumed ≤2,000/day Peak

**Status:** ASSUMED — PENDING QDB BUSINESS/IT CONFIRMATION (OQ-002)  
**Assumed answer:** ≤2,000 snapshots per day peak.  
**Rationale:** At 2,000 snapshots/day × 1 MB (worst case, token_published event with full token JSON) = 2 GB/day Dataverse write. This is within Dataverse capacity for an enterprise environment with appropriate storage add-on. The 2-year active / 5-year Blob archival split keeps Dataverse storage bounded at ~1.46 TB (active tier). At ≤2,000/day the Power Automate archival flow can process the 2-year backlog in daily batches of ≤500 records without hitting Dataverse API limits.  
**If volume is >10,000/day:** The MemoAttributeMetadata approach becomes cost-prohibitive. Architecture must shift to Blob-primary storage (Dataverse record contains only metadata; JSON written directly to Blob at write time). Revisit before build if volume estimate exceeds 10,000/day.

### ADR-004-004 — Opaque Reference Code Format: SNAP-{YYYYMMDD}-{8hex}

**Status:** ASSUMED — PENDING QDB COMPLIANCE CONFIRMATION (OQ-003)  
**Assumed answer:** Opaque format: `SNAP-{YYYYMMDD}-{nanoid(8, hex alphabet)}`.  
**Rationale:** Predictable formats (`SNAP-{date}-{userId}`) expose user IDs in URLs, enabling enumeration by authenticated admin users. The date prefix preserves auditor-friendly ordering and allows date-based lookup. The 8-character hex suffix provides 4 billion combinations per day — negligible collision probability at ≤2,000 snapshots/day. An auditor searching for "all snapshots for Citizen 47291 on 12 March 2026" uses the list API with `userId` filter, not reference code guessing.  
**If QDB Compliance requires predictable codes:** FR-004 changes to `SNAP-{YYYYMMDD}-{userId-last-8}` and `GET /api/admin/snapshots/by-reference/:code` must rate-limit to prevent enumeration.

### ADR-004-005 — Azure Blob Storage: Qatar Central Primary, UAE North GRS

**Status:** ASSUMED — PENDING QDB IT/COMPLIANCE CONFIRMATION (OQ-004)  
**Assumed answer:** Storage account provisioned in Azure Qatar Central (`qatarcentral`), GRS replication to UAE North.  
**Rationale:** Qatar Central is Microsoft's nearest GCC-local Azure region. GRS to UAE North keeps data within the Gulf region, consistent with QDB's likely data localisation obligations under Qatar's Personal Data Privacy Protection Law. WORM (Write Once Read Many) immutable storage policy is available in Qatar Central.  
**If Qatar Central is not available or not approved:** Architecture must evaluate UAE North as primary with GRS to UAE Central, or reconsider the archival tier entirely (e.g. Dataverse with extended storage rather than Blob). This must be confirmed before the provisioning script for the storage account is written.

### ADR-004-006 — Form Submission Data Hash Included (DFE-Provided)

**Status:** ASSUMED — PENDING QDB COMPLIANCE CONFIRMATION (OQ-005)  
**Assumed answer:** YES — include SHA-256 hash of submitted form payload.  
**Design:** DFE computes `SHA-256(JSON.stringify(formPayload, sortedKeys))` before calling `POST /api/internal/snapshots/trigger` and passes it as `formDataHash`. The portal API stores it in `qdb_FormDataHash` (String 64). The raw payload never leaves DFE. In a future dispute, DFE retrieves the original submission and recomputes the hash; if it matches `qdb_FormDataHash`, the submission has not been tampered with between DFE storage and the audit snapshot.  
**If QDB Compliance says NO:** The `qdb_FormDataHash` field is omitted from the entity and the trigger contract. The snapshot still records the component version and platform state — it cannot certify the submitted data.

### ADR-004-007 — User ID-Only Storage Sufficient (NFR-008)

**Status:** ASSUMED — PENDING QDB COMPLIANCE CONFIRMATION (NFR-008)  
**Assumed answer:** User ID (GUID, JWT `sub` claim) alone is sufficient.  
**Rationale:** The user ID is traceable to a human identity via the QDB Active Directory or identity provider — an auditor performs the lookup offline. Storing the name or national ID in the snapshot adds PII risk without technical benefit; the user ID is the durable, change-proof identifier. For QFC audit purposes, the user ID + session ID in the snapshot creates an audit trail that can be cross-referenced to the identity store at audit time.  
**If QDB Compliance requires a masked identifier:** Add `qdb_TriggeredByUserRef` (String 100) to the entity, containing a hashed (SHA-256 of national ID + salt) or masked (first 3 chars + asterisks) identifier. FR-008 must be updated before build.

---

## 13. Integration Contracts

### 13.1 DFE → Portal API (form_submission trigger)

DFE must call `POST /api/internal/snapshots/trigger` with `formDataHash` at the point of form submission acceptance — before returning the success response to the citizen. The DFE team must update their submission handler. This is a cross-team dependency tracked in the engagement record.

### 13.2 P1-003 TokenResolutionService → SnapshotTriggerService

`SnapshotTriggerService` calls `TokenResolutionService.resolve(serviceSlug, locale, renderTarget)` directly (in-process). This is the same path as the existing API. No additional HTTP hop is introduced for token state materialisation.

### 13.3 P1-002 RBAC → SnapshotTriggerService

`SnapshotTriggerService` queries `qdb_rbac_user_roles` via `DataverseHttpClient` for the triggering user's active roles at enqueue time. RBAC state is serialised as `{ userId, roles: [{ roleId, roleName, serviceSlug, assignedOn }] }`.

### 13.4 Outbound Dependencies

| Dependency | Used by | Required before build |
|-----------|---------|----------------------|
| Azure Service Bus SDK (`@azure/service-bus`) | SnapshotTriggerService, SnapshotConsumerService, ReconciliationService | GitHub research required — star count, license, fit |
| Azure Storage Blob SDK (`@azure/storage-blob`) | SnapshotQueryService (read-through) | GitHub research required |
| `nanoid` | ReferenceCode generation | Already evaluated in prior phases |
| `crypto` (Node built-in) | SHA-256 hashing | No additional dependency |

---

## 14. File Structure

```
projects/portal-shell/apps/api/src/
  services/snapshots/
    SnapshotTriggerService.ts
    SnapshotConsumerService.ts
    ReconciliationService.ts
    SnapshotQueryService.ts
    hashUtils.ts
    referenceCodeUtils.ts
    schemas/
      snapshotMessage.schema.ts       (Zod schema for Service Bus message)
      snapshotTrigger.schema.ts       (Zod schema for POST /internal/snapshots/trigger)
      snapshotList.schema.ts          (Zod schema for query filters)
  routes/
    admin/
      snapshots.routes.ts             (GET /admin/snapshots, /:id, /by-reference/:code)
    internal/
      snapshots.routes.ts             (POST /internal/snapshots/trigger)

projects/portal-shell/apps/api/src/services/
  components/
    ComponentVersionService.ts        (PATCH deprecatedOn — POST-3)
    ComponentVersionService.test.ts

projects/dxp-p1-004/scripts/provision-schema/
  (mirrors P1-003 structure)
  src/
    entities/definitions/
      snapshotEntities.ts             (qdb_platform_snapshots, qdb_snapshot_errors)
    optionsets/
      GlobalOptionSetProvisioner.ts   (qdb_snapshot_event_type — codes 860006001–860006007)
    components/
      ComponentVersionFieldProvisioner.ts  (qdb_deprecated_on on existing entity)
    roles/
      OpsAdminRoleProvisioner.ts      (qdb_ops_admin security role)
    index.ts
```

---

## 15. Tech Stack Additions

| Addition | Purpose | Note |
|---------|---------|------|
| `@azure/service-bus` | Service Bus producer + consumer | GitHub research required before adoption |
| `@azure/storage-blob` | Blob archive read-through | GitHub research required before adoption |
| `nanoid` | Reference code hex suffix | Likely already in package.json; verify |

No new framework or ORM additions. All new services follow the existing Fastify + Prisma + Dataverse pattern established in P1-001 through P1-003.

---

## 16. Phase Summary

| Phase | Deliverable | Status |
|-------|------------|--------|
| Phase 1 (CEO) | Approved with conditions | COMPLETE |
| Phase 2 (BA BRD) | BRD v1.0 | COMPLETE |
| Phase 3 (Architecture) | This document | COMPLETE |
| GitHub Research | @azure/service-bus, @azure/storage-blob | NEXT |
| Phase 4 (Tech Build) | Pre-work: GGAP-001, POST-1, POST-3; then snapshot system | BLOCKED until GitHub research |
| Phase 5 (QA) | Test plan including AC-001 and AC-002 (updated) | PENDING |
| Phase 6 (Audit) | Security + compliance review | PENDING |
| Phase 7 (CEO) | Final decision | PENDING |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
DXP-P1-004 Versioning & Snapshots — Architecture v1.0
Maqsad AI — Architect
2026-06-22
═══════════════════════════════════════════════════
```
