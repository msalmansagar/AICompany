/**
 * AuditBatchWriter unit tests — DFE-ENH-001 E4
 *
 * All tests use a mocked IWebApiAdapter. The qdb_dfe_audit_log entity
 * is NOT provisioned in org5869857f yet (gate LO-002) — tests must not
 * require a live org.
 *
 * TDD: RED tests are written first per Article IV.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditBatchWriter } from '@/services/audit/AuditBatchWriter';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { AuditEntry } from '@/services/AuditPatchMapper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SESSION_ID = 'session-test-001';

function makeWebApi(overrides: Partial<IWebApiAdapter> = {}): IWebApiAdapter {
  return {
    createRecord: vi.fn().mockResolvedValue({ id: 'new-id-001', entityType: 'qdb_dfe_audit_log' }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    retrieveRecord: vi.fn().mockResolvedValue({}),
    retrieveMultipleRecords: vi.fn().mockResolvedValue({ entities: [] }),
    executeAction: vi.fn().mockResolvedValue({}),
    updateRecordConditional: vi.fn().mockResolvedValue(undefined),
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
    changedBy: '4f2b9c1e-7a3d-4e5f-8b6a-1c2d3e4f5a6b',
    changedOn: '2026-07-11T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditBatchWriter', () => {
  let webApi: IWebApiAdapter;
  let writer: AuditBatchWriter;

  beforeEach(() => {
    webApi = makeWebApi();
    writer = new AuditBatchWriter(webApi, TEST_SESSION_ID);
  });

  it('writeEntries_callsCreateRecord_forEachEntry', async () => {
    const entries = [makeAuditEntry(), makeAuditEntry({ changePath: '/fields/guarantor/label' })];

    await writer.writeEntries(entries);

    expect(webApi.createRecord).toHaveBeenCalledTimes(2);
  });

  it('writeEntries_callsCreateRecord_withCorrectEntity', async () => {
    await writer.writeEntries([makeAuditEntry()]);

    const [entityName] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(entityName).toBe('qdb_dfe_audit_log');
  });

  it('writeEntries_buildsOdataBindForFormId', async () => {
    await writer.writeEntries([makeAuditEntry({ formId: 'form-xyz' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_form_id@odata.bind']).toBe('/qdb_form_definitions(form-xyz)');
  });

  it('writeEntries_setsActionPicklistValue_forUpdate', async () => {
    await writer.writeEntries([makeAuditEntry({ action: 'update' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_action']).toBe(100000002);
  });

  it('writeEntries_setsActionPicklistValue_forCreate', async () => {
    await writer.writeEntries([makeAuditEntry({ action: 'create' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_action']).toBe(100000001);
  });

  it('writeEntries_setsActionPicklistValue_forDelete', async () => {
    await writer.writeEntries([makeAuditEntry({ action: 'delete' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_action']).toBe(100000003);
  });

  it('writeEntries_setsEventTypePicklist_forFieldChange', async () => {
    await writer.writeEntries([makeAuditEntry({ eventType: 'FieldChange' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_event_type']).toBe(100000001);
  });

  // PC-1: session ID must appear on every written record
  it('writeEntries_populatesSessionId_inRecord', async () => {
    const sessionId = 'my-designer-session-abc123';
    const sessionWriter = new AuditBatchWriter(webApi, sessionId);

    await sessionWriter.writeEntries([makeAuditEntry()]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_session_id']).toBe(sessionId);
  });

  it('writeEntries_sessionId_isNonEmpty_forDefaultTestWriter', async () => {
    await writer.writeEntries([makeAuditEntry()]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof record['qdb_session_id']).toBe('string');
    expect((record['qdb_session_id'] as string).length).toBeGreaterThan(0);
  });

  // PC-3: failed writes must be returned, not swallowed
  it('writeEntries_doesNotThrow_whenCreateRecordFails', async () => {
    const failingWebApi = makeWebApi({
      createRecord: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const failingWriter = new AuditBatchWriter(failingWebApi, TEST_SESSION_ID);
    const entry = makeAuditEntry();

    // Must not throw — audit failures are non-blocking. Failed entry is returned for retry.
    const failedEntries = await failingWriter.writeEntries([entry]);
    expect(failedEntries).toHaveLength(1);
  });

  it('writeEntries_returnsFailedEntry_asTheSameReference', async () => {
    const failingWebApi = makeWebApi({
      createRecord: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const failingWriter = new AuditBatchWriter(failingWebApi, TEST_SESSION_ID);
    const entry = makeAuditEntry();

    const failedEntries = await failingWriter.writeEntries([entry]);

    expect(failedEntries[0]).toBe(entry);
  });

  it('writeEntries_returnsEmptyArray_whenAllWritesSucceed', async () => {
    const failedEntries = await writer.writeEntries([makeAuditEntry()]);

    expect(failedEntries).toHaveLength(0);
  });

  it('writeEntries_continuesWritingOtherEntries_whenOneEntryFails', async () => {
    let callCount = 0;
    const mixedWebApi = makeWebApi({
      createRecord: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('First entry fails'));
        return Promise.resolve({ id: 'new-id', entityType: 'qdb_dfe_audit_log' });
      }),
    });
    const mixedWriter = new AuditBatchWriter(mixedWebApi, TEST_SESSION_ID);
    const entries = [makeAuditEntry(), makeAuditEntry({ changePath: '/fields/other/label' })];

    await mixedWriter.writeEntries(entries);

    expect(mixedWebApi.createRecord).toHaveBeenCalledTimes(2);
  });

  it('writeEntries_returnsOnlyFailedEntries_whenSomeFail', async () => {
    let callCount = 0;
    const mixedWebApi = makeWebApi({
      createRecord: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('First entry fails'));
        return Promise.resolve({ id: 'new-id', entityType: 'qdb_dfe_audit_log' });
      }),
    });
    const mixedWriter = new AuditBatchWriter(mixedWebApi, TEST_SESSION_ID);
    const failingEntry = makeAuditEntry({ changePath: '/fields/a/label' });
    const succeedingEntry = makeAuditEntry({ changePath: '/fields/b/label' });

    const failedEntries = await mixedWriter.writeEntries([failingEntry, succeedingEntry]);

    // Only the first entry failed — the second succeeded, so it must NOT be returned
    expect(failedEntries).toHaveLength(1);
    expect(failedEntries[0]).toBe(failingEntry);
  });

  it('writeEntries_doesNothingAndReturns_whenEntriesArrayIsEmpty', async () => {
    await writer.writeEntries([]);

    expect(webApi.createRecord).not.toHaveBeenCalled();
  });

  it('writeEntries_includesBeforeAndAfterValues', async () => {
    await writer.writeEntries([makeAuditEntry({ before: '"old"', after: '"new"' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_before_value']).toBe('"old"');
    expect(record['qdb_after_value']).toBe('"new"');
  });

  it('writeEntries_omitsBeforeValue_forCreateAction', async () => {
    await writer.writeEntries([makeAuditEntry({ action: 'create', before: null })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_before_value']).toBeUndefined();
  });

  it('writeEntries_omitsAfterValue_forDeleteAction', async () => {
    await writer.writeEntries([makeAuditEntry({ action: 'delete', after: null })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_after_value']).toBeUndefined();
  });

  it('writeEntries_includesChangedByLookupBind_whenChangedByPresent', async () => {
    const actorId = '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d';

    await writer.writeEntries([makeAuditEntry({ changedBy: actorId })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_changed_by@odata.bind']).toBe(`/systemusers(${actorId})`);
  });

  // Running the designer standalone there is no signed-in user, so the context substitutes
  // the placeholder 'rest-mode-user'. Bound into /systemusers(...) Dataverse rejects the whole
  // create — "')' or ',' expected at position 5" — and every save reported that its change
  // history could not be written. The entry is worth keeping without an actor.
  it('writeEntries_omitsTheChangedByBind_whenTheActorIsNotAGuid', async () => {
    await writer.writeEntries([makeAuditEntry({ changedBy: 'rest-mode-user' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_changed_by@odata.bind']).toBeUndefined();
  });

  it('writeEntries_stillWritesTheEntry_whenTheActorIsNotAGuid', async () => {
    const failed = await writer.writeEntries([makeAuditEntry({ changedBy: 'rest-mode-user' })]);

    expect(webApi.createRecord).toHaveBeenCalledOnce();
    expect(failed).toEqual([]);
  });
});
