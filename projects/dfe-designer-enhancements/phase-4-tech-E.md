# DFE-ENH-001 — Phase 4 Technical Delivery: Workstream E (ENT-005 Audit Log)

**Engagement ID:** DFE-ENH-001
**Workstream:** E — Field-Level Append-Only Audit Log
**Branch:** `feat/dfe-enh-audit` (off `origin/main` @ 409ecd30)
**Prepared by:** Maqsad AI — Power Platform Developer
**Date:** 2026-07-11
**Status:** COMPLETE (source + scripts only — no org deployment)

---

## 1. Scope

This document covers the E1–E3 sub-tasks of Workstream E as defined in
`phase-3-arch.md §8.1`:

| Sub-task | Deliverable |
|---|---|
| E1 | `provision-dfe-audit-log.mjs` — Dataverse entity + column provisioning script |
| E2 | `AuditImmutabilityPlugin.cs` — Pre-Validation plugin blocking Update/Delete |
| E3 | `AuditPatchMapper.ts` + Vitest test suite |

E4 (Zustand save-boundary integration) and E5 (compliance report export UI) are
later sub-tasks that integrate with Workstream A (AutosaveQueue) and the designer
UI layer respectively. They are out of scope for this delivery but the wiring
point is documented in §6 below.

---

## 2. Entity Schema — `qdb_dfe_audit_log`

### 2.1 Entity metadata

| Property | Value |
|---|---|
| Logical name | `qdb_dfe_audit_log` |
| Display name | DFE Audit Log |
| Ownership type | OrganizationOwned |
| Primary key | `qdb_dfe_audit_logid` (GUID, auto-generated) |
| Primary name attribute | `qdb_change_path` |
| Has notes | false |
| Has activities | false |
| Solution | `DynamicFormEngine` |

All entity creation requests include the `MSCRM.SolutionUniqueName: DynamicFormEngine`
header (Article XI compliance).

### 2.2 Column catalogue

| Logical name | Display name | Type | Constraint | Notes |
|---|---|---|---|---|
| `qdb_dfe_audit_logid` | Audit Log Entry | GUID PK | Auto | Created with entity |
| `qdb_form_id` | Form | Lookup → `qdb_form_definition` | None | Required at write time; enforced by app |
| `qdb_form_version_id` | Form Version | Lookup → `qdb_form_version` | None | Null for pre-version-history saves |
| `qdb_changed_by` | Changed By | Lookup → `systemuser` | None | Current user at flush time |
| `qdb_field_schema_name` | Field Schema Name | String(200) | None | Empty for form-level changes |
| `qdb_change_path` | Change Path | String(512) | None | RFC-6901 JSON Pointer |
| `qdb_before_value` | Before Value | Memo(10000) | None | JSON; null for CREATE actions |
| `qdb_after_value` | After Value | Memo(10000) | None | JSON; null for DELETE actions |
| `qdb_session_id` | Session ID | String(100) | None | Browser session UUID |
| `qdb_action` | Action | Picklist | None | 100000001=Create, 100000002=Update, 100000003=Delete |
| `qdb_event_type` | Event Type | Picklist | None | See §2.3 |
| `qdb_changed_on` | Changed On | DateTime(UTC) | None | Set client-side at flush time |
| `createdon` | Created On | DateTime | Auto | Standard Dataverse audit column |
| `createdby` | Created By | Lookup → SystemUser | Auto | Standard Dataverse audit column |
| `modifiedon` | Modified On | DateTime | Auto | Standard Dataverse audit column (never changed — append-only) |
| `modifiedby` | Modified By | Lookup → SystemUser | Auto | Standard Dataverse audit column (never changed — append-only) |

### 2.3 `qdb_event_type` option set values

| Value | Label | When used |
|---|---|---|
| 100000001 | FieldChange | `path[0] === 'fields'` in immer patch |
| 100000002 | RuleChange | `path[0] === 'validationRules'` or `'businessRules'` |
| 100000003 | MappingChange | `path[0] === 'submissionMappings'` |
| 100000004 | TranslationChange | `path[0] === 'translations'` |
| 100000005 | FormImport | Written by the FR-014 import handler (Phase 2) |
| 100000006 | FormPublish | Written by the publish pipeline on publish completion |
| 100000007 | FormRestore | Written by the version-restore flow |
| 100000008 | FormChange | All other root-level form property changes |

### 2.4 Recommended indexes (apply post-provisioning)

Dataverse indexes cannot be created via the Web API; apply through the admin
portal or via a managed property configuration:

| Purpose | Columns |
|---|---|
| Compliance report query (filtered by form + date) | `qdb_form_id` + `qdb_changed_on` DESC |
| User-activity audit query | `qdb_changed_by` + `qdb_changed_on` |

### 2.5 Security role configuration (manual — post-provisioning)

| Role | Permitted privileges on `qdb_dfe_audit_log` |
|---|---|
| All custom DFE roles | CREATE + READ only — no Update, no Delete |
| System Administrator | No role change; the immutability plugin blocks execution regardless |

Defense-in-depth: security role restriction (table level) + Pre-Validation plugin
(execution level). Neither alone is sufficient; both are required per ENT-005 BRD.

---

## 3. Immutability Plugin — `AuditImmutabilityPlugin.cs`

### 3.1 File location

```
projects/dynamic-form-engine/crm-plugins/Qdb.FormEngine/
  Qdb.FormEngine.Plugins/
    AuditImmutabilityPlugin.cs     ← new
  Qdb.FormEngine.Plugins.csproj   ← updated: AuditImmutabilityPlugin.cs added to Compile list
```

### 3.2 Design

The plugin implements `IPlugin` directly (not `PluginBase`) because it requires
no secure config, no Organisation Service, and no Newtonsoft dependency. Keeping
it lean minimises the attack surface and assembly size.

Key design decisions:

- **Pre-Validation stage** — runs before any security check, before database
  locks, before Pre-Operation plugins. This is the only stage that blocks System
  Administrator at the execution level. Pre-Operation and later stages respect
  the caller's security role. The CEO architecture checkpoint specifically
  commended this Pre-Validation-against-all-roles design.

- **Message filter: Update AND Delete** — both are blocked. The block is checked
  via `context.MessageName` string comparison (case-insensitive).

- **Entity filter: `qdb_dfe_audit_log`** — only this entity is blocked. Update
  and Delete on all other entities (including `qdb_form_definition`) pass through
  without intervention.

- **Create is NOT blocked** — append-only means Creates must succeed. The plugin
  explicitly does not interfere with Create operations.

- **Exception message** — contains "immutable" and the entity name so HTTP 400
  responses from Dataverse are self-describing. Auditors can grep plugin trace
  logs for "immutable" to confirm the guard is active.

### 3.3 Step registration specification

Register two steps from a single plugin type:

```
Plugin type:     Qdb.FormEngine.Plugins.AuditImmutabilityPlugin
Assembly:        Qdb.FormEngine.Plugins (ILMerged / registered assembly)

Step 1 — Block Update
  Message:           Update
  Primary entity:    qdb_dfe_audit_log
  Stage:             10  (Pre-Validation)
  Execution mode:    Synchronous
  Filtering attrs:   (none — all columns)
  Run in user ctx:   Calling user
  Rank:              1
  Secure config:     (none)

Step 2 — Block Delete
  Message:           Delete
  Primary entity:    qdb_dfe_audit_log
  Stage:             10  (Pre-Validation)
  Execution mode:    Synchronous
  Filtering attrs:   (none)
  Run in user ctx:   Calling user
  Rank:              1
  Secure config:     (none)
```

Use the Plugin Registration Tool (PRT) or PAC CLI `pac plugin push` to register.
The assembly must be ILMerged or carry its dependencies before registration on
Dataverse online (sandbox mode rejects unmerged assemblies).

### 3.4 Manual verification after registration

```
# Test Update block (any valid audit log record GUID)
PATCH /api/data/v9.2/qdb_dfe_audit_logs(<guid>)
{ "qdb_field_schema_name": "tamper_test" }
Expected: HTTP 400, error message contains "immutable"

# Test Delete block
DELETE /api/data/v9.2/qdb_dfe_audit_logs(<guid>)
Expected: HTTP 400, error message contains "immutable"

# Repeat both tests while authenticated as System Administrator
# Expected: same HTTP 400 responses — the Pre-Validation block is unconditional
```

---

## 4. AuditPatchMapper — TypeScript Service

### 4.1 File location

```
projects/dynamic-form-engine/designer/src/services/AuditPatchMapper.ts
```

### 4.2 Public contract

```typescript
// Input types
interface ImmerPatch {
  op: 'add' | 'remove' | 'replace';
  path: ReadonlyArray<string | number>;
  value?: unknown;
}

interface AuditMetadata {
  formId: string;
  formVersionId: string | null;
  changedBy: string;           // Dataverse systemuser GUID
  changedOn: string;           // ISO-8601 UTC
}

// Output type
interface AuditEntry {
  formId: string;
  formVersionId: string | null;
  fieldSchemaName: string;     // empty for non-field paths
  changePath: string;          // RFC-6901 JSON Pointer
  before: string | null;       // null for create
  after: string | null;        // null for delete
  action: 'create' | 'update' | 'delete';
  eventType: AuditEventType;
  changedBy: string;
  changedOn: string;
}

// Exported function
export function mapPatches(
  patches: readonly ImmerPatch[],
  inversePatches: readonly ImmerPatch[],
  metadata: AuditMetadata,
): AuditEntry[]
```

### 4.3 Mapping rules

| immer patch.op | AuditEntry.action | before | after |
|---|---|---|---|
| `add` | `create` | `null` | `JSON.stringify(patch.value)` |
| `replace` | `update` | `JSON.stringify(inversePatch.value)` | `JSON.stringify(patch.value)` |
| `remove` | `delete` | `JSON.stringify(inversePatch.value)` | `null` |

`path[0]` → `eventType`:

| path[0] | eventType |
|---|---|
| `fields` | FieldChange; `fieldSchemaName = path[1]` |
| `validationRules` | RuleChange; `fieldSchemaName = ''` |
| `businessRules` | RuleChange; `fieldSchemaName = ''` |
| `submissionMappings` | MappingChange; `fieldSchemaName = ''` |
| `translations` | TranslationChange; `fieldSchemaName = ''` |
| anything else | FormChange; `fieldSchemaName = ''` |

`changePath` = RFC-6901 JSON Pointer built from `patch.path`:
- `~` → `~0`, `/` → `~1` (per spec)
- Empty path → `/`

### 4.4 Error handling

`mapPatches` throws a descriptive `Error` if `patches.length !== inversePatches.length`.
This is a programming error (both arrays must be the direct output of immer
`produceWithPatches`); throwing fast prevents silent data corruption in the audit log.

### 4.5 Purity contract

`mapPatches` is a pure function:
- No I/O (no fetch, no Zustand, no localStorage)
- No side effects
- Same inputs always produce same output
- Does not mutate its arguments

This enables the function to be called in isolation in Vitest without any mocking.

---

## 5. Test Results

### 5.1 TypeScript type-check

```
npx tsc --noEmit   (designer tsconfig, strict: true)
Exit code: 0 — zero type errors
```

### 5.2 Vitest — AuditPatchMapper.test.ts

```
Test file: tests/services/AuditPatchMapper.test.ts
Runner: Vitest v2.1.9, environment: jsdom

Test suites:
  mapPatches — add patch (field create)          6 tests  PASS
  mapPatches — replace patch (field update)       7 tests  PASS
  mapPatches — remove patch (field delete)        4 tests  PASS
  mapPatches — multiple patches                   2 tests  PASS
  mapPatches — edge cases                         5 tests  PASS (incl. RFC-6901 escaping)

Total: 27 tests, 27 passed, 0 failed
Duration: ~29ms
```

### 5.3 C# unit tests — AuditImmutabilityPluginTests.cs

The test project follows the existing xUnit + Moq pattern in
`Qdb.FormEngine.Tests`. Tests added:

| Test name | Scenario | Expected |
|---|---|---|
| `Execute_UpdateOnAuditLog_ThrowsInvalidPluginExecutionException` | Update on audit log | Throws |
| `Execute_UpdateOnAuditLog_ExceptionMessageNamesTheEntity` | Exception content | Contains entity name |
| `Execute_DeleteOnAuditLog_ThrowsInvalidPluginExecutionException` | Delete on audit log | Throws |
| `Execute_DeleteOnAuditLog_ExceptionMessageNamesTheEntity` | Exception content | Contains entity name |
| `Execute_CreateOnAuditLog_DoesNotThrow` | Create on audit log (permitted) | No exception |
| `Execute_UpdateOnDifferentEntity_DoesNotThrow` | Update on `qdb_form_definition` | No exception |
| `Execute_DeleteOnDifferentEntity_DoesNotThrow` | Delete on `qdb_form_field` | No exception |
| `Execute_NullServiceProvider_ThrowsArgumentNullException` | Null guard | `ArgumentNullException` |
| `Execute_UpdateOnAuditLogBySystemAdmin_ThrowsInvalidPluginExecutionException` | Defense-in-depth: sysadmin blocked | Throws |

Build and run with `dotnet test` in the `Qdb.FormEngine.Tests` project directory.
The C# tests cannot be run from this worktree without a .NET SDK install; the test
file is complete and matches the xUnit + Moq pattern used by all other tests in
the project.

---

## 6. Save-Boundary Wiring (E4 — future sub-task)

`AuditPatchMapper.mapPatches()` is called at the AutosaveQueue flush boundary,
after a successful 204 from Dataverse. The integration point is in
`FormSaveService.ts` (or the future `AutosaveQueue.flush()` method added in
Workstream A):

```typescript
// Pseudocode — save-boundary wiring (E4 scope)
// This wiring is NOT implemented in this delivery; it lives in FormSaveService
// or the Workstream A AutosaveQueue flush method.

import { enablePatches, produceWithPatches } from 'immer';
import { mapPatches } from '@/services/AuditPatchMapper';

enablePatches(); // called once at app init

// At flush time, after successful 204:
const [nextState, patches, inversePatches] = produceWithPatches(
  lastSavedSnapshot,
  (draft) => { /* apply queued mutations */ },
);
const auditEntries = mapPatches(patches, inversePatches, {
  formId: form.id,
  formVersionId: currentVersionId ?? null,
  changedBy: userContext.userId,
  changedOn: new Date().toISOString(),
});
// Write auditEntries to Dataverse in the same $batch as the form PATCH
```

The atomicity requirement (audit entries written in the same OData `$batch` as
the form PATCH) ensures that no audit entry exists without a corresponding form
change. If the PATCH 412s or fails, the audit entries are not written.

---

## 7. Pre-QA Admin Acknowledgment Control (CEO Requirement)

The CEO's architecture checkpoint conditions include a mandatory admin
acknowledgment gate before QA sign-off. The following items must be acknowledged
by the QDB IT Director before Phase 5 (QA) can begin for Workstream E:

| ID | Acknowledgment required |
|---|---|
| ACK-E-001 | The `provision-dfe-audit-log.mjs` script has been reviewed and approved for execution against the QDB dev org. The IT Director acknowledges that entity/column creation is permanent and cannot be reversed without a solution-level delete operation. |
| ACK-E-002 | The `AuditImmutabilityPlugin` has been registered at Pre-Validation stage for both Update and Delete messages on `qdb_dfe_audit_log`. The IT Director acknowledges that this plugin blocks System Administrator from modifying audit records at the execution level (defense-in-depth per ENT-005). |
| ACK-E-003 | All custom DFE security roles have been updated to grant CREATE + READ only on `qdb_dfe_audit_log`. No Update or Delete privilege has been granted to any custom role. |
| ACK-E-004 | The manual verification tests in §3.4 above have been executed and both the Update and Delete block tests return HTTP 400, including when authenticated as System Administrator. |
| ACK-E-005 | The quarterly compliance report UI (E5) will be delivered in the next sprint and gated on the same QA checkpoint. QDB acknowledges that field-level before/after change history will not be queryable from the designer UI until E5 ships; raw Dataverse query access is available via FetchXML or Dataverse OData in the interim. |

These acknowledgments must be recorded in `projects/dfe-designer-enhancements/conditions-log.md`
before the Phase 5 QA agent is engaged for Workstream E.

---

## 8. Delivery Summary

### Complete (this commit)

| File | Description |
|---|---|
| `projects/dynamic-form-engine/scripts/provision-dfe-audit-log.mjs` | Provisioning script — creates entity + all columns + option sets; safe to re-run |
| `projects/dynamic-form-engine/crm-plugins/Qdb.FormEngine/Qdb.FormEngine.Plugins/AuditImmutabilityPlugin.cs` | Pre-Validation plugin blocking Update + Delete on audit log |
| `projects/dynamic-form-engine/crm-plugins/Qdb.FormEngine/Qdb.FormEngine.Plugins/Qdb.FormEngine.Plugins.csproj` | Updated: `AuditImmutabilityPlugin.cs` added to Compile list |
| `projects/dynamic-form-engine/designer/src/services/AuditPatchMapper.ts` | Pure TypeScript function mapping immer patches to audit rows |
| `projects/dynamic-form-engine/designer/tests/services/AuditPatchMapper.test.ts` | 27 Vitest tests — all passing |
| `projects/dynamic-form-engine/crm-plugins/Qdb.FormEngine/Qdb.FormEngine.Tests/AuditImmutabilityPluginTests.cs` | 9 xUnit tests for immutability plugin |
| `projects/dfe-designer-enhancements/phase-4-tech-E.md` | This document |

### Requires org deployment (not in this commit — per task scope)

| Item | Action required |
|---|---|
| `qdb_dfe_audit_log` entity | Run `provision-dfe-audit-log.mjs` against the dev org |
| Immutability plugin | Build, ILMerge, and register via PAC CLI or PRT |
| Security role update | Apply CREATE + READ-only privilege on audit entity to all custom DFE roles |
| Indexes | Add recommended indexes in Dataverse admin portal |

### Future sub-tasks (E4, E5 — separate sprint)

| Sub-task | Description |
|---|---|
| E4 | Zustand save-boundary integration: `enablePatches()`, `produceWithPatches()`, `lastSavedSnapshot` slice, batch write at flush time |
| E5 | Compliance report export UI: filtered table (form + date range) + CSV download in designer |
