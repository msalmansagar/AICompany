# ADR-006 — Versioning Engine: CRM Schema Delta and Graceful Degradation
**Project:** CWFD-001 — CRM Visual Workflow Designer
**Status:** Accepted
**Date:** 2026-06-01
**Decided by:** Architect — Maqsad AI

---

## Context

FR-14 requires semantic versioning (Major.Minor), workflow states (Draft, Published,
Archived), and version history with diff summaries. CEO Condition COND-02 (critical)
requires the architect to:
1. Identify exactly which CRM fields must be added to support versioning.
2. Specify their types, valid values, and required/optional status.
3. Define the graceful degradation path if the client cannot add these fields.

The base `qdb_work_item_record_type` entity (documented in the BRD) does not
include versioning fields. BRD Assumption A-03 flags these as potentially absent.
CEO Constraint C-CEO-02 makes this a release blocker: the client must sign off on
the schema delta before Phase 4 (Build) is authorized.

---

## Decision

### CRM Solution Delta — Required Field Additions

The following fields must be added to `qdb_work_item_record_type` as part of the
workflow designer CRM managed solution. All fields use the `qdb_` publisher prefix.

| Field Logical Name | Display Name | Type | Valid Values | Required | Default |
|---|---|---|---|---|---|
| `qdb_version_major` | Version Major | Integer (Whole Number) | Range: 1 to 999 | Yes (set to 1 on create) | 1 |
| `qdb_version_minor` | Version Minor | Integer (Whole Number) | Range: 0 to 999 | Yes (set to 0 on create) | 0 |
| `qdb_workflow_state` | Workflow State | Option Set (Global) | See below | Yes (set to Draft on create) | Draft |
| `qdb_workflow_snapshot` | Workflow Snapshot | Memo (Multiple Lines of Text / ntext) | JSON string — max 1048576 chars | No (nullable) | null |

**Option Set values for `qdb_workflow_state`:**
```
qdb_WorkflowState option set:
  Draft     = 100000000   (label: "Draft")
  Published = 100000001   (label: "Published")
  Archived  = 100000002   (label: "Archived")
```

This must be defined as a Global Option Set in the CRM solution (not an inline local
option set) so it can be reused if additional workflow entities are added in future.
Suggested global option set name: `qdb_workflowstate`.

**Additional field on qdb_work_item_record_type (optional but recommended):**

| Field Logical Name | Display Name | Type | Valid Values | Required | Default |
|---|---|---|---|---|---|
| `qdb_published_on` | Published On | Date and Time | Any valid UTC datetime | No | null |
| `qdb_cloned_from` | Cloned From | Lookup (qdb_work_item_record_type) | Self-referencing lookup | No | null |

These two fields are not required for v1 runtime behaviour but support the version
history panel (FR-14f) and clone audit trail (FR-15). They are included in the delta
for completeness.

---

### CRM Solution Package Additions

The managed solution (`qdb_WorkflowDesigner`) must include:
1. The four primary fields above as new Attributes on `qdb_work_item_record_type`.
2. The `qdb_workflowstate` Global Option Set.
3. No change to any existing field on any existing entity.
4. No change to the four base entities' forms, views, or security roles (those are
   managed by the client's existing solution).

**Solution XML component type references:**
- Attribute component type: `2`
- Global Option Set component type: `9`

---

### Version Increment Rules

**Save Draft:** No version change. `qdb_workflow_state` remains `Draft` (100000000).

**Publish:**
1. Run validation engine. Reject if any Error-severity violation exists.
2. Compare current snapshot JSON to the last published snapshot (retrieved from
   `qdb_workflow_snapshot` on the previously Published record).
3. Determine change severity:
   - **Minor change** (new outcome added, route filter changed, step name updated,
     description changed): increment `qdb_version_minor`. Example: 1.2 → 1.3.
   - **Breaking change** (step deleted, outcome deleted, sequence numbers changed
     for existing steps, entity bindings changed): increment `qdb_version_major`,
     reset `qdb_version_minor` to 0. Example: 1.3 → 2.0.
4. Archive the previously Published record: set its `qdb_workflow_state` to
   `Archived` (100000002).
5. Update the current record: set `qdb_workflow_state` to `Published` (100000001),
   `qdb_published_on` to UTC now, serialize current workflow to JSON and store in
   `qdb_workflow_snapshot`.

**Breaking change detection algorithm** (`src/services/VersioningService.ts`):
- Deserialize previous snapshot JSON (from last Published record's `qdb_workflow_snapshot`).
- Compare step ID sets: any step ID present in previous but absent in current →
  breaking change.
- Compare outcome ID sets per step: any outcome ID absent in current → breaking change.
- Compare `qdb_sequenceno` for each step: any change → breaking change.
- Compare `qdb_recordentity` per step: any change → breaking change.
- All other changes (names, descriptions, FetchXML conditions, new steps/outcomes) →
  minor change.

**Clone:** New process record created with `qdb_version_major = 1`, `qdb_version_minor = 0`,
`qdb_workflow_state = Draft`, `qdb_workflow_snapshot = null`.

---

### Graceful Degradation Path

If the versioning fields are absent from the CRM environment at runtime (detected by
a 400 error on first write to `qdb_version_major`), `VersioningService` activates
in-memory-only mode:

```typescript
class VersioningService {
  private degraded: boolean = false;
  private inMemoryVersion: { major: number; minor: number } = { major: 1, minor: 0 };
  private inMemoryState: WorkflowStateEnum = WorkflowStateEnum.Draft;

  async detectFieldAvailability(): Promise<void> {
    try {
      await this.adapter.getProcess(PROBE_PROCESS_ID);
      this.degraded = false;
    } catch (error) {
      if (isFieldNotFoundError(error)) {
        this.degraded = true;
        this.notifyDegradedMode();
      } else {
        throw error;
      }
    }
  }

  private notifyDegradedMode(): void {
    // Non-blocking banner — does not block workflow use
    notificationService.showWarning(
      'Versioning fields are not deployed in this environment. ' +
      'Version history will not be persisted across sessions. ' +
      'Contact your CRM administrator to deploy the workflow designer solution update.'
    );
  }
}
```

**Degraded mode behaviour:**
- Version numbers tracked in-memory only for the current session.
- `qdb_workflow_state` updates are skipped (the field does not exist).
- The Publish operation proceeds (saves steps, outcomes, routes) but does not set
  state or snapshot fields.
- The Version History panel shows "Version history unavailable — versioning fields
  not deployed" instead of the history list.
- All other designer features remain fully functional.
- The info banner remains visible for the duration of the session.

---

## Atomicity of Publish Operation

If the publish operation fails mid-way (e.g., the snapshot write succeeds but the
old record's state update fails), the workflow may be in an inconsistent state
(two Published records). The rollback strategy:

1. Publish is a two-step CRM operation. If Step 2 (archiving the old record) fails
   after Step 1 (publishing the new record) succeeds, the system retries Step 2
   up to 3 times with exponential backoff.
2. If Step 2 still fails after 3 retries, the designer surfaces the error and
   provides a "Repair Publish" action that attempts to archive all Published records
   except the one with the latest `qdb_version_major` / `qdb_version_minor`.
3. The repair action is logged to the structured logger with correlation ID.

This is acceptable risk for v1. A true saga/two-phase commit pattern would require
a server-side component, which is out of scope (C-01).

---

## Client Action Item

The following action is required from the client before Phase 4 (Build) authorization
(CEO Condition COND-02):

> The client's CRM platform team must review and approve the addition of the five
> fields listed above to `qdb_work_item_record_type`. Approval must be provided in
> writing before the Maqsad AI build team begins implementing the versioning engine.

This is documented as Assumption A-01 (existing entities) and flagged as a release
blocker in the architecture risk register.

---

## Consequences

**Positive:**
- COND-02 is fully resolved. The delta is precise and minimal — only five fields,
  no structural changes to existing entities.
- Graceful degradation ensures the designer is deployable even before the client
  approves the schema change. Core workflow design features work in degraded mode.
- The `qdb_workflow_snapshot` field enables diff-based version comparison without
  additional CRM queries (the full workflow state is stored at each publish).

**Negative / Risks:**
- `qdb_workflow_snapshot` is a Memo field (ntext, max ~1MB). For very large workflows
  (200 steps, each with 10 outcomes and 5 routes = ~1,000 records), the JSON snapshot
  may approach the field size limit. Mitigation: compress the JSON with LZ-String before
  storage (a 50–70% compression ratio is typical for structured JSON). If LZ-String
  is used, the compression library must be bundled and accounted for in the bundle budget.
- The breaking change detection algorithm compares by CRM ID. If a step is deleted
  and re-added in the same session (ID changes from `tmp_xxx` to a new real GUID),
  this is correctly detected as a breaking change even if the intent was an edit.
  This is an acceptable false-positive for v1.
- The atomicity guarantee for publish is best-effort. True atomicity without a server
  component is not achievable in a CRM web resource context.
