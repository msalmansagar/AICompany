# DXP-P1-004 — Business Requirements Document
# DXP Platform Phase 4: Versioning & Snapshots

```
═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Engagement ID:  DXP-P1-004
Title:          DXP Platform Phase 4 — Versioning & Snapshots
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-06-18
Version:        1.0
Status:         DRAFT — Pending CEO Review
═══════════════════════════════════════════════════
```

---

## ⚠ Prerequisite Gate Notice

Per DXP-P1-001 CEO Phase 7 decision (2026-06-18), this BRD may be drafted but **architecture may not begin** until:

1. **GGAP-001 resolved via Path A** — OData `$batch` implemented in `DataverseClient` for atomic `set-latest`; ADR-only (Path B) is insufficient for P1-004.
2. **POST-1 delivered** — `GET /api/admin/components/:id/versions/latest` endpoint implemented.
3. **POST-3 delivered** — `qdb_deprecated_on` field provisioned in Dataverse and exposed in the API.

---

## 1. Executive Summary

When a QDB portal user submits a financing application, raises a service request, or interacts with a dynamic form, they are doing so against a specific version of each UI component, under a specific set of theme tokens, with specific RBAC-governed data visibility. For regulatory compliance under Qatar Financial Centre (QFC) requirements and internal QDB audit standards, QDB must be able to reconstruct — at any future point — exactly what the citizen saw and interacted with at the time of that transaction.

DXP-P1-004 delivers **Versioning & Snapshots**: a system that captures point-in-time snapshots of the platform state (component versions, token values, RBAC policy) at the moment a significant user event occurs, and preserves those snapshots immutably for the retention period mandated by QDB compliance.

Snapshots answer the question: *"On 12 March 2026, when Citizen 47291 submitted their home finance application, which version of the `request-form` component did they use, under what theme, and under what access policy?"*

---

## 2. Background and Problem Statement

### 2.1 Current State After DXP-P1-001/002/003

| System | State |
|--------|-------|
| Component Registry (P1-001) | Components versioned; `isLatest` pointer maintained |
| RBAC (P1-002) | Role assignments stored; audit log append-only |
| Theme Tokens (P1-003) | Token values versioned by publish event; history preserved |

None of these systems currently captures a **correlated, timestamped snapshot** that links a specific user session to the exact platform state at that moment. Dataverse `modifiedon` timestamps exist on individual records, but there is no mechanism to say "at time T, the platform state was snapshot S" and prove it immutably.

### 2.2 Problems Being Solved

| Problem | Regulatory / Business Impact |
|---------|------------------------------|
| No point-in-time platform state record | Cannot reconstruct what citizen saw during a dispute or audit |
| Component version at submission time unknown | Cannot prove regulatory compliance of the form used |
| Token set at render time unrecorded | Cannot prove visual/accessibility compliance at the time of interaction |
| RBAC policy at access time unrecorded | Cannot prove correct access control was in effect |
| No snapshot lifecycle (deprecation) | Old component versions stay active indefinitely; no managed sunset |

### 2.3 Strategic Fit

Snapshots are the audit and compliance layer of the DXP platform. They do not change how the platform works — they record what it did. This is the capstone of the four foundational DXP phases.

---

## 3. Stakeholders

| Role | Interest |
|------|---------|
| QDB Compliance / Legal | Regulatory audit trail; 7-year retention; immutability |
| QDB IT Director | Snapshot storage cost; retention lifecycle; archival strategy |
| Portal Admin | Managing component version deprecation; triggering snapshots |
| QDB Auditor (internal) | Querying snapshot history for a given user event |
| QDB Developer | Snapshot API integration at event trigger points |
| QDB Citizen | Indirect — their submissions are associated with snapshots |

---

## 4. Functional Requirements

### 4.1 Snapshot Definition

**FR-001:** A **snapshot** is an immutable, timestamped record of the platform state at a specific moment, linked to a triggering event. It captures:
- The component version(s) active for the relevant component slugs (via `isLatest` at the time)
- The resolved token set for the relevant render target, locale, and service
- The RBAC policy version (the `qdb_rbac_user_roles` state for the relevant user)
- The triggering event metadata (event type, user ID, session ID, timestamp)

**FR-002:** Snapshots shall be **write-once, read-many**. No UPDATE or DELETE operations shall be permitted on snapshot records. Soft-delete (`statecode`) shall not be applied to snapshots — they are permanent records.

**FR-003:** Snapshot records shall be stored in a dedicated Dataverse entity `qdb_platform_snapshots` within the `QdbDxpPlatform` solution.

**FR-004:** Each snapshot shall have a unique `qdb_snapshot_id` (GUID) and a human-readable `qdb_reference_code` (e.g. `SNAP-2026-03-12-047291`) for use in audit queries.

### 4.2 Snapshot Triggers

**FR-005:** The following events shall trigger automatic snapshot creation:

| Event Type | Trigger | Snapshot scope |
|-----------|---------|----------------|
| `form_submission` | Citizen submits a dynamic form | Component versions for the form's component slug; token set for the service; RBAC state for the user |
| `service_request` | Citizen submits a service request | As above |
| `component_version_promoted` | Admin calls `set-latest` | Component version snapshot for the promoted component |
| `component_version_deprecated` | Admin sets `qdb_deprecated_on` | Component version state at deprecation |
| `token_published` | Admin calls `POST /api/admin/tokens/publish` | Full token set snapshot for all render targets |
| `rbac_role_assigned` | Admin assigns a role to a user (DXP-P1-002) | RBAC policy snapshot for the affected user |
| `rbac_role_revoked` | Admin revokes a role | As above |

**FR-006:** Snapshot creation shall be **asynchronous** — the triggering API call shall not block waiting for the snapshot to be persisted. The snapshot shall be enqueued and written within **30 seconds** of the trigger event.

**FR-007:** If snapshot creation fails (e.g. Dataverse write error), the failure shall be logged with the full event context and a structured error entry written to `qdb_snapshot_errors`. The triggering operation shall not be rolled back — snapshot failure is non-fatal to the business operation.

### 4.3 Snapshot Content

**FR-008:** The `qdb_platform_snapshots` entity shall store:

| SchemaName | Type | Notes |
|-----------|------|-------|
| `qdb_SnapshotId` | Uniqueidentifier | Primary key (GUID) |
| `qdb_ReferenceCode` | String(50) | Human-readable, unique (SNAP-{date}-{userRef}) |
| `qdb_EventType` | Picklist | form_submission / service_request / component_promoted / component_deprecated / token_published / rbac_assigned / rbac_revoked |
| `qdb_EventTimestamp` | DateTime | UTC timestamp of the triggering event |
| `qdb_TriggeredByUserId` | String(100) | User ID (or `system`) who triggered the event |
| `qdb_SessionId` | String(100) | Portal session ID (for citizen events) |
| `qdb_ServiceSlug` | String(100) | Service context (nullable for platform-level events) |
| `qdb_ComponentSlug` | String(100) | Component context (nullable for non-component events) |
| `qdb_ComponentVersionId` | Lookup | FK to `qdb_component_versions` (nullable) |
| `qdb_ComponentVersionNumber` | String(50) | Denormalised version number at snapshot time |
| `qdb_TokenSetHash` | String(64) | SHA-256 hash of the resolved token JSON at snapshot time |
| `qdb_TokenSetJson` | Memo(1048576) | Full resolved token JSON at snapshot time |
| `qdb_RbacPolicyHash` | String(64) | SHA-256 hash of the user's role assignments at snapshot time |
| `qdb_RbacPolicyJson` | Memo(65536) | User's active role assignments at snapshot time |
| `qdb_PropsSchemaHash` | String(64) | SHA-256 hash of the component's propsSchema at snapshot time |
| `qdb_CreatedOn` | DateTime | Dataverse standard; auto-populated |

**FR-009:** The `qdb_TokenSetHash` and `qdb_RbacPolicyHash` fields shall be computed server-side before the Dataverse write. The hash algorithm shall be SHA-256 applied to the canonicalised (alphabetically sorted keys) JSON string.

**FR-010:** The `qdb_TokenSetJson` and `qdb_RbacPolicyJson` Memo fields shall store the full JSON at snapshot time, not a reference to a live record. Even if the live token or role record is later modified, the snapshot preserves the exact state at the event time.

### 4.4 Component Version Deprecation

**FR-011:** The `qdb_deprecated_on` field (DateTime) shall be added to `qdb_component_versions`. When populated, it indicates the version has been sunset and should not appear in new snapshots after that date.

**FR-012:** A component version with `qdb_deprecated_on` set to a past date shall not be returned by `GET /api/admin/components/:id/versions/latest`.

**FR-013:** Deprecating a version that is currently `isLatest = true` shall return HTTP 409 (`cannot_deprecate_latest_version`). The admin must promote another version to latest before deprecating the current latest.

**FR-014:** The API shall expose `qdb_deprecated_on` on `GET /api/admin/components/:id/versions/:versionId` response and in the version list.

**FR-015:** A `PATCH /api/admin/components/:id/versions/:versionId` shall accept `deprecatedOn` as a settable field (ISO 8601 datetime string). Once set to a non-null value, it cannot be cleared (immutable deprecation record).

### 4.5 Snapshot Query API

**FR-016:** An admin-only endpoint shall allow querying snapshots:

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/snapshots | List snapshots (filterable by eventType, userId, serviceSlug, componentSlug, dateRange) |
| GET | /api/admin/snapshots/:id | Get full snapshot detail including tokenSetJson and rbacPolicyJson |
| GET | /api/admin/snapshots/by-reference/:code | Get snapshot by reference code (for audit queries) |

**FR-017:** The snapshot list shall support date range filtering (`from`, `to` as ISO 8601 dates) and shall be ordered by `qdb_EventTimestamp` descending by default.

**FR-018:** Snapshot queries shall be read-only. No write operations shall be exposed on the snapshot API.

### 4.6 Snapshot Lifecycle and Retention

**FR-019:** Snapshots shall be retained for a minimum of **7 years** from the `qdb_EventTimestamp` date, consistent with NFR-011 from DXP-P1-002.

**FR-020:** After year 2, snapshots older than 2 years shall be eligible for archival to Azure Blob Storage. The Dataverse record shall remain with `qdb_TokenSetJson` and `qdb_RbacPolicyJson` replaced by a `qdb_ArchiveUrl` pointer to the Azure Blob location.

**FR-021:** Archival shall be performed by a scheduled Dataverse workflow or Power Automate flow, not by the API. The API shall remain read-capable on archived snapshots by fetching from `qdb_ArchiveUrl` if the JSON fields are null.

### 4.7 GET /versions/latest Endpoint (P1-001 POST-1 dependency)

**FR-022:** `GET /api/admin/components/:id/versions/latest` shall return the single version record where `qdb_islatest = true` and `qdb_deprecated_on` is null or in the future.

**FR-023:** If no non-deprecated latest version exists, the endpoint shall return HTTP 404 with code `no_active_latest_version`.

---

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|----|------------|--------|
| NFR-001 | Snapshot creation latency (async) | Written to Dataverse within 30 s of trigger |
| NFR-002 | Snapshot query p95 latency | ≤ 800 ms for list; ≤ 400 ms for single record |
| NFR-003 | Snapshot failure does not affect triggering operation | Triggering API returns success even if snapshot enqueue fails |
| NFR-004 | Snapshot immutability | No UPDATE or DELETE on `qdb_platform_snapshots` — enforced at API and Dataverse security role level |
| NFR-005 | Retention | Minimum 7 years from event timestamp |
| NFR-006 | Hash integrity | SHA-256 hashes computed server-side before Dataverse write; verifiable on read |
| NFR-007 | Auth | JWT Bearer, `portal-admin` role on all snapshot query routes |
| NFR-008 | No PII storage beyond user ID | Snapshot stores only user ID and session ID, not name, email, or document content |
| NFR-009 | Async queue durability | If the Fastify API restarts before a snapshot is written, the queued event must survive (durable queue required) |
| NFR-010 | Deprecation immutability | `qdb_deprecated_on` once set cannot be nulled; enforced at API layer |

---

## 6. Data Model

```
qdb_component_versions (existing — DXP-P1-001)
  + qdb_deprecated_on   DateTime   (NEW — POST-3 prerequisite)

qdb_platform_snapshots (NEW)
  qdb_SnapshotId          Uniqueidentifier  PK
  qdb_ReferenceCode       String(50)        unique
  qdb_EventType           Picklist
  qdb_EventTimestamp      DateTime
  qdb_TriggeredByUserId   String(100)
  qdb_SessionId           String(100)
  qdb_ServiceSlug         String(100)
  qdb_ComponentSlug       String(100)
  qdb_ComponentVersionId  Lookup → qdb_component_versions
  qdb_ComponentVersionNumber String(50)     denormalised
  qdb_TokenSetHash        String(64)
  qdb_TokenSetJson        Memo(1048576)
  qdb_RbacPolicyHash      String(64)
  qdb_RbacPolicyJson      Memo(65536)
  qdb_PropsSchemaHash     String(64)
  qdb_ArchiveUrl          String(500)       populated on archival
  qdb_CreatedOn           DateTime          Dataverse standard

qdb_snapshot_errors (NEW — error log)
  qdb_EventType           Picklist
  qdb_EventTimestamp      DateTime
  qdb_ErrorMessage        Memo(4000)
  qdb_EventPayloadJson    Memo(4000)
  qdb_CreatedOn           DateTime
```

---

## 7. Integration Points

| System | Integration |
|--------|------------|
| DXP-P1-001 Component Registry | `isLatest`, `qdb_deprecated_on`, `GET /versions/latest`; component version GUID captured in snapshot |
| DXP-P1-002 RBAC | User role assignments serialised into `qdb_RbacPolicyJson` at snapshot time |
| DXP-P1-003 Theme Tokens | Resolved token map serialised into `qdb_TokenSetJson` at snapshot time |
| Dynamic Form Engine (DFE) | `form_submission` events trigger snapshots; DFE calls `POST /api/snapshots/trigger` |
| Azure Blob Storage | Archival target for snapshots older than 2 years |
| Durable queue (TBD) | Async snapshot writes buffered through a durable queue (Azure Service Bus or equivalent) |

---

## 8. Out of Scope

- Snapshot diffing UI (comparing two snapshots side-by-side) — future engagement
- Citizen-facing access to their own snapshots — future engagement
- Automatic rollback of platform state to a snapshot — out of scope permanently (snapshots are audit records, not rollback points)
- Document content storage in snapshots (form field values, uploaded files) — DFE responsibility
- Real-time snapshot streaming or webhooks — future engagement
- Snapshot compression or deduplication — architecture decision

---

## 9. Assumptions

| ID | Assumption |
|----|-----------|
| A-001 | A durable queue (Azure Service Bus or equivalent) is available for async snapshot writes |
| A-002 | Azure Blob Storage is available for the archival tier |
| A-003 | The Dynamic Form Engine (DFE) team will integrate `POST /api/snapshots/trigger` at their submission event points |
| A-004 | `qdb_deprecated_on` will be provisioned as part of P1-001 POST-3 before this engagement's architecture begins |
| A-005 | The `isLatest` $batch atomicity fix (P1-001 GGAP-001 Path A) will be in place before snapshots go live |
| A-006 | Snapshot storage cost is accepted by QDB IT — `qdb_TokenSetJson` up to 1 MB per snapshot |

---

## 10. Open Questions

| ID | Question | Owner | Impact |
|----|---------|-------|--------|
| OQ-001 | Which durable queue technology is available in QDB's Azure environment — Service Bus, Storage Queue, or other? | QDB IT / DevOps | Drives async snapshot architecture |
| OQ-002 | What is the expected snapshot volume per day? (drives storage cost estimate and archival schedule) | QDB Business / IT | Retention and cost planning |
| OQ-003 | Should snapshot reference codes be predictable (SNAP-{date}-{userId}) or opaque GUIDs? Predictable codes are more auditor-friendly but expose user IDs in URLs. | QDB Compliance | FR-004 reference code format |
| OQ-004 | Is Azure Blob Storage available and approved for archival of QDB platform data under QCB/QFC data residency requirements? | QDB IT / Compliance | FR-020 archival strategy |
| OQ-005 | Should the `form_submission` snapshot include a hash of the submitted form data (not the data itself) for tamper evidence? | QDB Compliance | FR-008 snapshot content |

---

## 11. Prerequisites (Hard Gates — from DXP-P1-001 Phase 7 CEO)

The following must be delivered before DXP-P1-004 architecture begins:

| Item | Source | Status |
|------|--------|--------|
| GGAP-001 resolved via Path A ($batch implementation) | DXP-P1-001 | PENDING |
| POST-1: `GET /versions/latest` endpoint implemented | DXP-P1-001 | PENDING |
| POST-3: `qdb_deprecated_on` field provisioned and exposed | DXP-P1-001 | PENDING |
| DXP-P1-002 JWT `permissions` claim structure frozen | DXP-P1-002 | PENDING (architecture gated) |
| DXP-P1-003 token resolution API stable | DXP-P1-003 | PENDING (architecture gated) |

---

## 12. Acceptance Criteria

| ID | Criterion |
|----|----------|
| AC-001 | A `form_submission` event triggers creation of a `qdb_platform_snapshots` record within 30 seconds, containing the correct component version number and token set hash |
| AC-002 | The `qdb_TokenSetJson` field in the snapshot matches the output of `GET /api/tokens/resolve` at the moment of the event, byte-for-byte (verified by comparing hashes) |
| AC-003 | Attempting to UPDATE or DELETE a snapshot record via the API returns HTTP 405 / HTTP 403 |
| AC-004 | `GET /api/admin/snapshots?eventType=form_submission&from=2026-01-01&to=2026-12-31` returns only snapshots of that type within the date range, ordered by timestamp descending |
| AC-005 | `GET /api/admin/snapshots/by-reference/SNAP-2026-03-12-047291` returns the correct snapshot |
| AC-006 | Deprecating a component version that is `isLatest=true` returns HTTP 409 (`cannot_deprecate_latest_version`) |
| AC-007 | After deprecating version 1.0.0 and setting version 2.0.0 as latest, `GET /versions/latest` returns 2.0.0 and not 1.0.0 |
| AC-008 | `GET /versions/latest` when all versions are deprecated or no versions exist returns HTTP 404 (`no_active_latest_version`) |
| AC-009 | Setting `deprecatedOn` on a version via PATCH and then attempting to clear it (PATCH with `deprecatedOn: null`) returns HTTP 400 (`deprecated_on_immutable`) |
| AC-010 | A snapshot creation failure (simulated Dataverse error) does not cause the triggering API call to return an error — the triggering operation returns its normal success response |
| AC-011 | The snapshot error is recorded in `qdb_snapshot_errors` when creation fails |
| AC-012 | `qdb_TokenSetHash` equals the SHA-256 of the alphabetically sorted canonical JSON of `qdb_TokenSetJson` — verified on read |
| AC-013 | Unauthenticated request to `GET /api/admin/snapshots` returns HTTP 401 |
| AC-014 | A `component_version_promoted` event (set-latest call) creates a snapshot recording the promoted version ID and version number |
| AC-015 | A `token_published` snapshot captures the full resolved token set for all render targets at the moment of publish |

---

## 13. Glossary

| Term | Definition |
|------|-----------|
| Snapshot | An immutable, timestamped record of the DXP platform state at the moment of a triggering event |
| Reference Code | A human-readable unique identifier for a snapshot (e.g. `SNAP-2026-03-12-047291`) used in audit queries |
| Deprecation | The act of setting `qdb_deprecated_on` on a component version, marking it as sunset and excluded from new snapshots |
| Hash | SHA-256 digest of the serialised platform state at snapshot time, used to verify data integrity |
| Archival | Moving snapshot JSON content to Azure Blob Storage after 2 years while retaining the Dataverse record pointer |
| Durable Queue | A message queue that survives API restarts (Azure Service Bus or equivalent), used for async snapshot writes |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
DXP-P1-004 Versioning & Snapshots — BRD v1.0
Maqsad AI — Business Analyst
2026-06-18
═══════════════════════════════════════════════════
```
