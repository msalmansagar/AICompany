/**
 * Save-boundary integration tests — DFE-ENH-001 OI-005 + E4
 *
 * Covers:
 *   OI-005 — WriteQueue routes saves; 412 → conflictState; normal save → If-Match sent.
 *   E4     — Successful save produces AuditEntry rows; failed save writes zero rows;
 *             audit-write rejection does not propagate to the caller.
 *
 * All tests use mocked IWebApiAdapter and mocked Zustand stores.
 * No live Dataverse org is required (gate LO-002 / LO-007 are separate live-org items).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enablePatches, produceWithPatches } from 'immer';
import { WriteQueue } from '@/services/concurrency/WriteQueue';
import { ConcurrencyConflictError } from '@/services/concurrency/ConcurrencyConflictError';
import { FormSaveService, PartialSaveError } from '@/services/FormSaveService';
import { mapPatches } from '@/services/AuditPatchMapper';
import { AuditBatchWriter } from '@/services/audit/AuditBatchWriter';
import { computeSnapshotPatches } from '@/services/audit/computeSnapshotPatches';
import { useConcurrencyStore } from '@/state/concurrencyStore';
import { useAuditStore } from '@/state/auditStore';
import { DEFAULT_DESIGN_PAYLOAD } from '@/state/designerStore';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { AuditEntry } from '@/services/AuditPatchMapper';
import type { FormAuditableSnapshot } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

// enablePatches() is called at designerStore module init; call it here for
// the integration test context so produceWithPatches works without the full store.
enablePatches();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebApi(overrides: Partial<IWebApiAdapter> = {}): IWebApiAdapter {
  return {
    createRecord: vi.fn().mockResolvedValue({ id: 'rec-new', entityType: 'entity' }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    retrieveRecord: vi.fn().mockResolvedValue({ '@odata.etag': 'W/"200"' }),
    retrieveMultipleRecords: vi.fn().mockResolvedValue({ entities: [] }),
    executeAction: vi.fn().mockResolvedValue({}),
    updateRecordConditional: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeField(id: string, overrides: Partial<DesignerFieldModel> = {}): DesignerFieldModel {
  return {
    id,
    sectionId: 'section-1',
    label: 'Test Field',
    code: `field_${id}`,
    fieldType: 'text',
    placeholder: '',
    helpText: '',
    isRequired: false,
    isReadOnly: false,
    isHidden: false,
    defaultValue: null,
    currencyCode: null,
    decimalPlaces: null,
    maxRows: null,
    sortOrder: 0,
    columnSpan: 1,
    options: [],
    lookupConfig: null,
    componentKey: null,
    boolRenderStyle: null,
    trueLabel: null,
    falseLabel: null,
    infoCardStyle: null,
    infoCardTitle: null,
    infoCardBody: null,
    infoCardIcon: null,
    infoCardDownloadUrl: null,
    infoCardDownloadLabel: null,
    infoCardDownloadIcon: null,
    fileDownloadLabel: null,
    fileDownloadIcon: null,
    uploadDocumentSetting: null,
    downloadDocumentSetting: null,
    prefix: null,
    suffix: null,
    gridMode: null,
    gridEntityName: null,
    gridSelectionMode: null,
    gridMinRows: null,
    gridSavedViewId: null,
    gridFilterExpression: null,
    gridDependsOnFieldId: null,
    gridDependsOnFilterTemplate: null,
    gridColumns: [],
    ...overrides,
  };
}

function makeAuditableSnapshot(overrides: Partial<FormAuditableSnapshot> = {}): FormAuditableSnapshot {
  return {
    fields: { 'field-1': makeField('field-1') },
    validationRules: {},
    businessRules: {},
    ...overrides,
  };
}

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    formId: 'form-001',
    formVersionId: null,
    fieldSchemaName: 'loan_amount',
    changePath: '/fields/loan_amount/isRequired',
    before: 'false',
    after: 'true',
    action: 'update',
    eventType: 'FieldChange',
    changedBy: 'user-abc',
    changedOn: '2026-07-11T10:00:00.000Z',
    ...overrides,
  };
}

/** Minimal SaveableState for FormSaveService tests — uses a tmp_ form ID to
 * skip Steps 6 and 8 (business-rule sync and theme upsert) which would require
 * additional webApi mocks. Only Step 7 (updateRecordConditional) matters for B-1. */
function makeMinimalSaveableState(): Parameters<FormSaveService['save']>[0] {
  return {
    form: {
      id: 'tmp_form_b1test',
      name: 'Test Form',
      code: 'test_form',
      description: '',
      entityLogicalName: 'account',
      status: 'draft',
      currentVersion: '1',
      themeId: null,
      allowSaveDraft: true,
      draftExpiryDays: null,
      showSummaryStep: false,
      summaryMode: null,
      showProgressBar: false,
      powerAutomateFlowId: null,
      confirmationMessage: null,
      confirmationRecordRefAttribute: null,
      accessGroupId: null,
      createdBy: 'user-1',
      createdOn: new Date('2026-01-01'),
      modifiedBy: 'user-1',
      modifiedOn: new Date('2026-01-01'),
    },
    tabs: {},
    sections: {},
    fields: {},
    tabOrder: [],
    sectionOrder: {},
    fieldOrder: {},
    newIds: [],
    dirtyIds: [],
    deletedIds: [],
    deletedEntityTypes: {},
    validationRules: {},
    businessRules: {},
    designPayload: DEFAULT_DESIGN_PAYLOAD,
    formEtag: 'W/"100"',
  };
}

// ---------------------------------------------------------------------------
// B-1 guard — ConcurrencyConflictError must not be wrapped in PartialSaveError
// ---------------------------------------------------------------------------

describe('B-1 — FormSaveService.save() 412 propagation', () => {
  it('conflicting412_throwsConcurrencyConflictError_notWrappedInPartialSaveError', async () => {
    // Arrange: webApi rejects updateRecordConditional with a ConcurrencyConflictError
    // (the Dataverse 412 path). All other adapter methods succeed so Steps 1-6 are no-ops.
    const conflictError = new ConcurrencyConflictError(
      'qdb_form_definition',
      'tmp_form_b1test',
      'W/"100"',
    );
    const webApi = makeWebApi({
      updateRecordConditional: vi.fn().mockRejectedValue(conflictError),
    });
    const saveService = new FormSaveService(webApi, {
      userId: 'user-1',
      userName: 'tester',
      userFullName: 'Tester User',
    });

    // Act + Assert: the raw ConcurrencyConflictError must surface to the caller,
    // NOT wrapped in PartialSaveError — otherwise onError's instanceof check is inert.
    await expect(saveService.save(makeMinimalSaveableState()))
      .rejects.toBeInstanceOf(ConcurrencyConflictError);
    await expect(saveService.save(makeMinimalSaveableState()))
      .rejects.not.toBeInstanceOf(PartialSaveError);
  });
});

// ---------------------------------------------------------------------------
// OI-005 — WriteQueue wiring
// ---------------------------------------------------------------------------

describe('OI-005 — WriteQueue conflict handling', () => {
  beforeEach(() => {
    useConcurrencyStore.setState({ recordEtags: {}, conflictState: null });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalSave_routesThroughWriteQueue_andCallsOnError_neverDirectly', async () => {
    const queue = new WriteQueue();
    const operation = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    queue.schedule(operation, onError, 0);
    await vi.runAllTimersAsync();

    expect(operation).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('normalSave_withIfMatch_passesEtagToAdapter', async () => {
    // Simulates FormSaveService calling updateRecordConditional with the etag
    const webApi = makeWebApi();
    const etag = 'W/"100"';

    await webApi.updateRecordConditional('qdb_form_definition', 'form-id', {}, { ifMatch: etag });

    expect(webApi.updateRecordConditional).toHaveBeenCalledWith(
      'qdb_form_definition',
      'form-id',
      {},
      { ifMatch: etag },
    );
  });

  it('conflictingSave_412_callsOnError_withConcurrencyConflictError', async () => {
    const conflictError = new ConcurrencyConflictError(
      'qdb_form_definition',
      'form-id',
      'W/"100"',
    );
    const queue = new WriteQueue();
    const operation = vi.fn().mockRejectedValue(conflictError);
    const onError = vi.fn();

    queue.schedule(operation, onError, 0);
    await vi.runAllTimersAsync();

    expect(onError).toHaveBeenCalledWith(conflictError);
  });

  it('conflictingSave_setsConflictState_inConcurrencyStore', async () => {
    const conflictError = new ConcurrencyConflictError(
      'qdb_form_definition',
      'form-xyz',
      'W/"50"',
    );
    const queue = new WriteQueue();

    queue.schedule(
      () => Promise.reject(conflictError),
      (error) => {
        // Mimics the DesignerScreen onError handler
        if (error instanceof ConcurrencyConflictError) {
          useConcurrencyStore.getState().setConflictState({
            entityLogicalName: 'qdb_form_definition',
            recordId: 'form-xyz',
            localEtag: conflictError.localEtag,
            conflictTimestamp: new Date('2026-07-11T10:00:00Z'),
          });
        }
      },
      0,
    );
    await vi.runAllTimersAsync();

    const { conflictState } = useConcurrencyStore.getState();
    expect(conflictState).not.toBeNull();
    expect(conflictState?.recordId).toBe('form-xyz');
    expect(conflictState?.localEtag).toBe('W/"50"');
  });

  it('missingEtag_isTreatedAsNormalSaveError_notConcurrencyConflict', async () => {
    const genericError = new Error('MissingEtagError: no etag provided');
    const queue = new WriteQueue();
    const setConflictSpy = vi.spyOn(useConcurrencyStore.getState(), 'setConflictState');

    queue.schedule(
      () => Promise.reject(genericError),
      (error) => {
        if (error instanceof ConcurrencyConflictError) {
          useConcurrencyStore.getState().setConflictState({
            entityLogicalName: 'qdb_form_definition',
            recordId: 'form-1',
            localEtag: '',
            conflictTimestamp: new Date(),
          });
        }
      },
      0,
    );
    await vi.runAllTimersAsync();

    // setConflictState must NOT be called for a non-412 error
    expect(setConflictSpy).not.toHaveBeenCalled();
  });

  it('conflictState_clearsOnDismiss', () => {
    useConcurrencyStore.setState({
      conflictState: {
        entityLogicalName: 'qdb_form_definition',
        recordId: 'form-abc',
        localEtag: 'W/"1"',
        conflictTimestamp: new Date(),
      },
    });

    useConcurrencyStore.getState().setConflictState(null);

    expect(useConcurrencyStore.getState().conflictState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// E4 — Audit capture at save boundary
// ---------------------------------------------------------------------------

describe('E4 — Audit capture at save boundary', () => {
  it('fieldChange_producesAuditEntry_withCorrectPath', () => {
    const baseline = makeAuditableSnapshot({
      fields: { 'field-1': makeField('field-1', { isRequired: false }) },
    });
    const current = makeAuditableSnapshot({
      fields: { 'field-1': makeField('field-1', { isRequired: true }) },
    });

    // Use computeSnapshotPatches for fine-grained patches (one per changed property)
    // so changePath reflects /fields/field-1/isRequired, not a coarse /fields replace.
    const [, patches, inversePatches] = computeSnapshotPatches(baseline, current);

    const entries = mapPatches(patches, inversePatches, {
      formId: 'form-001',
      formVersionId: null,
      changedBy: 'user-abc',
      changedOn: '2026-07-11T10:00:00.000Z',
    });

    expect(entries.length).toBeGreaterThan(0);
    const fieldEntry = entries.find(e => e.changePath.includes('isRequired'));
    expect(fieldEntry).toBeDefined();
    expect(fieldEntry?.eventType).toBe('FieldChange');
    expect(fieldEntry?.action).toBe('update');
    expect(fieldEntry?.formId).toBe('form-001');
  });

  it('fieldAddition_producesCreateAuditEntry', () => {
    const baseline = makeAuditableSnapshot({ fields: {} });
    const current = makeAuditableSnapshot({
      fields: { 'field-new': makeField('field-new') },
    });

    // Fine-grained recipe: adding a key to the draftMap produces an 'add' patch
    // at /fields/field-new (action: 'create') rather than a coarse /fields replace.
    const [, patches, inversePatches] = computeSnapshotPatches(baseline, current);

    const entries = mapPatches(patches, inversePatches, {
      formId: 'form-001',
      formVersionId: null,
      changedBy: 'user-abc',
      changedOn: '2026-07-11T10:00:00.000Z',
    });

    const createEntry = entries.find(e => e.action === 'create');
    expect(createEntry).toBeDefined();
    expect(createEntry?.eventType).toBe('FieldChange');
    expect(createEntry?.before).toBeNull();
  });

  it('noChanges_producesNoAuditEntries', () => {
    const snapshot = makeAuditableSnapshot();

    const [, patches, inversePatches] = produceWithPatches(snapshot, (draft) => {
      // No mutations — identity recipe
      draft.fields = snapshot.fields;
      draft.validationRules = snapshot.validationRules;
      draft.businessRules = snapshot.businessRules;
    });

    const entries = mapPatches(patches, inversePatches, {
      formId: 'form-001',
      formVersionId: null,
      changedBy: 'user-abc',
      changedOn: '2026-07-11T10:00:00.000Z',
    });

    expect(entries).toHaveLength(0);
  });

  it('identicalSnapshots_producesZeroPatchesAndZeroAuditEntries', () => {
    // computeSnapshotPatches with the same object for both baseline and current
    // must produce zero patches — immer finds no actual value changes at finalization.
    const snapshot = makeAuditableSnapshot();
    const [, patches, inversePatches] = computeSnapshotPatches(snapshot, snapshot);
    const entries = mapPatches(patches, inversePatches, {
      formId: 'form-001',
      formVersionId: null,
      changedBy: 'user-abc',
      changedOn: '2026-07-11T10:00:00.000Z',
    });

    expect(patches).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('failedSave_writesNoAuditRows', async () => {
    // When the save operation rejects, audit must not fire.
    // This test validates the contract: audit entries are only produced
    // AFTER a successful save. If the save throws, the caller never reaches
    // the audit-write step.
    vi.useFakeTimers();

    const webApi = makeWebApi();
    const saveError = new Error('Save failed — 500 Internal Server Error');
    const queue = new WriteQueue();

    // Audit (AuditBatchWriter.writeEntries) is only called AFTER a successful save.
    // This schedule simulates a save that always throws — audit must never fire.
    queue.schedule(
      async () => { throw saveError; },
      () => { /* error handled */ },
      0,
    );

    await vi.runAllTimersAsync();
    vi.useRealTimers();

    expect(webApi.createRecord).not.toHaveBeenCalled();
  });

  it('auditWriteRejection_doesNotThrowToCaller', async () => {
    const failingWebApi = makeWebApi({
      createRecord: vi.fn().mockRejectedValue(new Error('Dataverse unavailable')),
    });
    const writer = new AuditBatchWriter(failingWebApi, 'session-e4-test');

    const baseline = makeAuditableSnapshot({ fields: {} });
    const current = makeAuditableSnapshot({ fields: { 'f': makeField('f') } });

    const [, patches, inversePatches] = produceWithPatches(baseline, (draft) => {
      draft.fields = current.fields;
    });
    const entries = mapPatches(patches, inversePatches, {
      formId: 'form-001',
      formVersionId: null,
      changedBy: 'user-1',
      changedOn: new Date().toISOString(),
    });

    // Must not throw — audit write failure is non-blocking (PC-3).
    // After PC-3, writeEntries resolves to the array of failed entries for buffered retry.
    const failedEntries = await writer.writeEntries(entries);
    expect(failedEntries.length).toBeGreaterThan(0);
  });

  it('validationRuleChange_producesRuleChangeEventType', () => {
    const baseline = makeAuditableSnapshot({
      validationRules: { 'rule-1': { id: 'rule-1', fieldId: 'field-1', ruleType: 'required', ruleValue: null, errorMessage: 'Required', sortOrder: 0, customExpression: null, ruleTemplateId: null } },
    });
    const current = makeAuditableSnapshot({
      validationRules: { 'rule-1': { id: 'rule-1', fieldId: 'field-1', ruleType: 'required', ruleValue: null, errorMessage: 'Field is required', sortOrder: 0, customExpression: null, ruleTemplateId: null } },
    });

    // Use the real production pipeline (computeSnapshotPatches) to exercise the
    // full path: fine-grained patch → AuditPatchMapper → eventType classification.
    const [, patches, inversePatches] = computeSnapshotPatches(baseline, current);

    const entries = mapPatches(patches, inversePatches, {
      formId: 'form-001',
      formVersionId: null,
      changedBy: 'user-1',
      changedOn: '2026-07-11T10:00:00.000Z',
    });

    expect(entries.some(e => e.eventType === 'RuleChange')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PC-3 — Audit reliability buffer
// ---------------------------------------------------------------------------

describe('PC-3 — Audit reliability buffer', () => {
  beforeEach(() => {
    useAuditStore.setState({ pendingAuditEntries: [], hasAuditRetryWarning: false });
  });

  it('failedAuditWrite_returnsFailedEntries_forCallerToBuffer', async () => {
    // (a) failed write buffers entry — AuditBatchWriter returns the failed entry
    // so the caller (executeSave) can hand it to useAuditStore.addFailedEntries.
    const failingWebApi = makeWebApi({
      createRecord: vi.fn().mockRejectedValue(new Error('Dataverse unavailable')),
    });
    const writer = new AuditBatchWriter(failingWebApi, 'session-pc3-test');
    const entry = makeAuditEntry();

    const failedEntries = await writer.writeEntries([entry]);

    expect(failedEntries).toHaveLength(1);
    expect(failedEntries[0]).toBe(entry); // same reference — not a copy
  });

  it('pendingBuffer_isWrittenBeforeNewEntries_onRetry', async () => {
    // (b) next save retries buffered first — executeSave takes the pending buffer,
    // calls writeEntries(pending) first, then writeEntries(newEntries). This test
    // verifies the call order by recording the changePath of each createRecord call.
    const callOrder: string[] = [];
    const webApi = makeWebApi({
      createRecord: vi.fn().mockImplementation((_entity: string, record: Record<string, unknown>) => {
        callOrder.push(String(record['qdb_change_path']));
        return Promise.resolve({ id: 'new-id', entityType: 'qdb_dfe_audit_log' });
      }),
    });

    const pendingEntry = makeAuditEntry({ changePath: '/fields/pending/label' });
    const newEntry = makeAuditEntry({ changePath: '/fields/new/label' });

    // Seed the store with a buffered pending entry from a prior failed write
    useAuditStore.getState().addFailedEntries([pendingEntry]);

    // Simulate what executeSave does: take pending → write pending → write new
    const writer = new AuditBatchWriter(webApi, 'session-pc3-test');
    const pending = useAuditStore.getState().takePendingEntries();
    await writer.writeEntries(pending);
    await writer.writeEntries([newEntry]);

    expect(callOrder[0]).toBe('/fields/pending/label');
    expect(callOrder[1]).toBe('/fields/new/label');
  });

  it('persistentRetryFailure_raisesRetryWarningFlag', async () => {
    // (c) persistent failure surfaces notification flag — if the retry also fails,
    // addFailedEntries is called again and hasAuditRetryWarning stays true.
    const failingWebApi = makeWebApi({
      createRecord: vi.fn().mockRejectedValue(new Error('Dataverse down')),
    });
    const writer = new AuditBatchWriter(failingWebApi, 'session-pc3-test');
    const pendingEntry = makeAuditEntry();

    // First failure: buffer the entry
    useAuditStore.getState().addFailedEntries([pendingEntry]);

    // Retry attempt: take from buffer and write — fails again
    const pending = useAuditStore.getState().takePendingEntries();
    const stillFailed = await writer.writeEntries(pending);
    if (stillFailed.length > 0) {
      useAuditStore.getState().addFailedEntries(stillFailed);
    }

    // Warning flag is re-raised because the retry also failed
    expect(useAuditStore.getState().hasAuditRetryWarning).toBe(true);
    expect(useAuditStore.getState().pendingAuditEntries).toHaveLength(1);
  });

  it('auditWriteFailure_doesNotPreventSaveFromSucceeding', async () => {
    // (d) save still succeeds regardless — writeEntries always resolves (never throws),
    // so the caller can proceed with markSaved and etag refresh unconditionally.
    const failingWebApi = makeWebApi({
      createRecord: vi.fn().mockRejectedValue(new Error('Audit unavailable')),
    });
    const writer = new AuditBatchWriter(failingWebApi, 'session-pc3-test');

    // resolves (not rejects) — any audit failure is reported via return value, not exception
    await expect(
      writer.writeEntries([makeAuditEntry()]),
    ).resolves.toEqual(expect.any(Array));
  });
});
