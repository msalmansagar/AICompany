# DFE-ENH-001 Phase 4 — Save-Boundary Integration

**Branch:** `feat/dfe-enh-save-integration`
**Engagement:** DFE-ENH-001 Phase 1 (Designer Enhancements)
**Workstreams completed:** OI-005 (GC-02) — WriteQueue + concurrency wiring; E4 (GC-01) — Audit capture at save boundary

---

## Delivery Summary

This document covers the two build items QA flagged as unbuilt in `phase-5-qa.md`:

| QA ref | FR | What was missing | What was built |
|--------|----|-----------------|----------------|
| GC-02 / OI-005 | FR-001 (concurrency) | Designer PATCH bypassed WriteQueue; no If-Match header; 412 not routed to ConflictResolutionDialog | WriteQueue.schedule wraps every save; FormSaveService passes etag via If-Match; ConcurrencyConflictError caught → concurrencyStore.setConflictState → dialog opens |
| GC-01 / E4 | ENT-005 (audit) | enablePatches() not called; no lastSavedAuditSnapshot baseline; mapPatches result never written to Dataverse | enablePatches() at store init; lastSavedAuditSnapshot tracked; computeSnapshotPatches produces fine-grained patches; AuditBatchWriter writes to qdb_dfe_audit_log; non-blocking (never aborts save) |

---

## Files Changed

### New files

| File | Purpose |
|------|---------|
| `src/constants/dfeAuditLogAttributeNames.ts` | Logical column names, action picklist (create=100000001, update=100000002, delete=100000003), event-type picklist for qdb_dfe_audit_log |
| `src/services/audit/AuditBatchWriter.ts` | Per-row createRecord to qdb_dfe_audit_log; catches each failure individually; never throws to caller |
| `src/services/audit/computeSnapshotPatches.ts` | Fine-grained immer recipe (Object.assign per field/rule produces one patch per changed property); used at save boundary and in E4 tests |
| `tests/services/audit/AuditBatchWriter.test.ts` | 13 unit tests: entity name, OData bind for formId/changedBy, picklist values, non-blocking on failure, continues after partial failure, empty no-op |
| `tests/integration/saveBoundary.integration.test.ts` | OI-005 suite (5 tests) + E4 suite (6 tests); mocked webApi + Zustand stores; no live org |

### Modified files

| File | Change |
|------|--------|
| `src/constants/entityNames.ts` | Added `DFE_AUDIT_LOG: 'qdb_dfe_audit_log'` |
| `src/state/designerStore.ts` | `enablePatches()` at module init; `FormAuditableSnapshot` interface exported; `lastSavedAuditSnapshot` state field; `captureAuditSnapshot()` helper; `loadForm` + `markSaved` set/update snapshot |
| `src/services/FormSaveService.ts` | `SaveableState` gains `formEtag: string`; `save()` passes etag to `updateForm` |
| `src/screens/FormListScreen.tsx` | `handleOpenForm` uses `getFormWithEtag`; stores etag in `concurrencyStore.setRecordEtag` |
| `src/screens/DesignerScreen.tsx` | WriteQueue ref; `executeSave` useCallback; `handleSaveDraft` converted to synchronous scheduler; `handlePublish` flushes queue; `ConflictResolutionDialog` wired end-to-end; `writeAuditEntriesNonBlocking` fires after save success |

---

## OI-005 — Concurrency wiring (GC-02 / FR-001)

### Save flow after this change

1. User edits → `handleSaveDraft()` (synchronous) captures current etag + audit baseline, calls `writeQueueRef.current.schedule(operation, onError, 800)`.
2. WriteQueue debounces at 800 ms then calls `executeSave(snapshot, baseline)`.
3. `executeSave` calls `FormSaveService.save()` which calls `FormDefinitionService.updateForm(id, payload, etag)`.
4. `updateForm` calls `webApi.updateRecordConditional(entity, id, payload, { ifMatch: etag })` — sends `If-Match` header.
5. **Happy path**: 204 returned. `markSaved()` updates store. etag refreshed via `getFormWithEtag`. Audit entries written non-blocking.
6. **412 conflict**: adapter throws `ConcurrencyConflictError`. WriteQueue calls `onError(error)`. `onError` calls `concurrencyStore.setConflictState(...)`. `ConflictResolutionDialog` opens.
7. **Other error**: `onError(error)` logs and re-throws (not swallowed, not routed to conflict dialog).

### Etag lifecycle

- **On form open** (`FormListScreen.handleOpenForm`): `getFormWithEtag` → stores etag via `setRecordEtag(formId, etag)`.
- **After successful PATCH** (`executeSave`): `getFormWithEtag` again → updates stored etag so sequential saves never use a stale value.
- **On conflict** (`handleConflictReload`): `resetConcurrencyState()` clears etag; fresh `getFormWithEtag` fetches the server version.

---

## E4 — Audit capture at save boundary (GC-01 / ENT-005)

### Patch computation

`computeSnapshotPatches(baseline, current)` uses fine-grained immer mutations:
- Existing entity: `Object.assign(draftMap[id], entity)` — immer proxy intercepts each property write; at finalization only changed properties produce patches (e.g., `/fields/loan_amount/isRequired` not `/fields`).
- New entity: `draftMap[id] = entity` — immer produces `op: 'add'` → `action: 'create'`.
- Removed entity: `delete draftMap[id]` — immer produces `op: 'remove'` → `action: 'delete'`.

This was the critical fix versus the initial broad assignment (`draft.fields = current.fields`) which produced one coarse `replace` at `/fields` and made `AuditPatchMapper` produce un-queryable paths.

### Non-blocking guarantee

`writeAuditEntriesNonBlocking` is fire-and-forget (`void writer.writeEntries(...)`). `AuditBatchWriter.writeEntries` catches per-entry failures with `console.error` and continues. The save result (204 or error) is never affected by audit outcome.

### Org deployment gate

`qdb_dfe_audit_log` entity is not yet provisioned in org5869857f. Gate: **LO-002** (Dataverse schema migration). Audit writes will 404 silently until LO-002 is cleared. No code change needed at that point — `AuditBatchWriter` targets `ENTITY_NAMES.DFE_AUDIT_LOG` which resolves to `'qdb_dfe_audit_log'`.

---

## Test Results

All 26 test files, 171 tests — green.

```
Test Files  26 passed (26)
Tests       171 passed (171)
```

`npx tsc --noEmit` — exits 0, no errors.

---

## Items NOT in scope (org-deployment-only)

The following are live-org gates, not code items. No code changes needed.

| Gate | Description |
|------|-------------|
| LO-002 | Provision qdb_dfe_audit_log Dataverse entity + security role grants |
| LO-007 | Verify ConflictResolutionDialog renders in CRM web resource iframe |
| FR-001 live test | Trigger a real 412 conflict against org5869857f to confirm end-to-end dialog flow |

---

## Branch lineage

```
feat/dfe-enh-concurrency  →  feat/dfe-enh-audit  →  feat/dfe-enh-save-integration
```

`feat/dfe-enh-audit` was merged into this branch. No merge conflicts were encountered.
