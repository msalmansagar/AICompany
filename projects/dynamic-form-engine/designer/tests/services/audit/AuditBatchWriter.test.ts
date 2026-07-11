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
    changedBy: 'user-abc',
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
    writer = new AuditBatchWriter(webApi);
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

  it('writeEntries_doesNotThrow_whenCreateRecordFails', async () => {
    const failingWebApi = makeWebApi({
      createRecord: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const failingWriter = new AuditBatchWriter(failingWebApi);

    // Must not throw — audit failures are non-blocking
    await expect(failingWriter.writeEntries([makeAuditEntry()])).resolves.toBeUndefined();
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
    const mixedWriter = new AuditBatchWriter(mixedWebApi);
    const entries = [makeAuditEntry(), makeAuditEntry({ changePath: '/fields/other/label' })];

    await mixedWriter.writeEntries(entries);

    expect(mixedWebApi.createRecord).toHaveBeenCalledTimes(2);
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
    await writer.writeEntries([makeAuditEntry({ changedBy: 'user-xyz' })]);

    const [, record] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(record['qdb_changed_by@odata.bind']).toBe('/systemusers(user-xyz)');
  });
});
