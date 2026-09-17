import { describe, expect, it, vi } from 'vitest';
import { CrmApiError } from './CrmApiError.js';
import { DataverseCrmAdapter } from './DataverseCrmAdapter.js';
import type { DataverseClient } from './DataverseClient.js';

/** Builds an adapter over a client stubbed with just the methods a test exercises. */
function buildAdapter(client: Partial<DataverseClient>) {
  return new DataverseCrmAdapter(client as DataverseClient);
}

describe('DataverseCrmAdapter.retrieve', () => {
  it('returns the record the client read', async () => {
    const adapter = buildAdapter({ getById: vi.fn().mockResolvedValue({ qdb_qid: 'Q1' }) });

    const record = await adapter.retrieve({ entity: 'contacts', id: 'id-1' }, ['qdb_qid']);

    expect(record).toEqual({ qdb_qid: 'Q1' });
  });

  it('treats a missing record as an ordinary empty answer', async () => {
    const adapter = buildAdapter({
      getById: vi.fn().mockRejectedValue(new CrmApiError('gone', '0x80040217', 404)),
    });

    await expect(adapter.retrieve({ entity: 'contacts', id: 'id-1' }, ['qdb_qid']))
      .resolves.toBeNull();
  });

  it('lets a server failure through rather than reporting an empty organisation', async () => {
    const adapter = buildAdapter({
      getById: vi.fn().mockRejectedValue(new CrmApiError('boom', '0x80040216', 500)),
    });

    await expect(adapter.retrieve({ entity: 'contacts', id: 'id-1' }, ['qdb_qid']))
      .rejects.toThrow('boom');
  });
});

describe('DataverseCrmAdapter.retrieveByKey', () => {
  it('reads by the business key the caller named', async () => {
    const getByAlternateKey = vi.fn().mockResolvedValue({ qdb_casenumber: 'C-1' });
    const adapter = buildAdapter({ getByAlternateKey });

    await adapter.retrieveByKey(
      'qdb_collectioncases', { field: 'qdb_casenumber', value: 'C-1' }, ['qdb_casenumber'],
    );

    expect(getByAlternateKey).toHaveBeenCalledWith(
      'qdb_collectioncases', 'qdb_casenumber', 'C-1', { select: ['qdb_casenumber'] }, {},
    );
  });

  it('returns null when no record carries that key', async () => {
    const adapter = buildAdapter({
      getByAlternateKey: vi.fn().mockRejectedValue(new CrmApiError('gone', '0x80040217', 404)),
    });

    await expect(adapter.retrieveByKey(
      'qdb_collectioncases', { field: 'qdb_casenumber', value: 'C-1' }, ['qdb_casenumber'],
    )).resolves.toBeNull();
  });
});

describe('DataverseCrmAdapter.retrieveMultiple', () => {
  it('unwraps the OData envelope so callers see plain records', async () => {
    const adapter = buildAdapter({
      getList: vi.fn().mockResolvedValue({ value: [{ a: 1 }, { a: 2 }] }),
    });

    const records = await adapter.retrieveMultiple('qdb_collectioncases', { select: ['a'] });

    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('translates an ordering into the OData spelling', async () => {
    const getList = vi.fn().mockResolvedValue({ value: [] });
    const adapter = buildAdapter({ getList });

    await adapter.retrieveMultiple('qdb_collectioncases', {
      select: ['qdb_currentdpd'],
      orderBy: { field: 'qdb_currentdpd', descending: true },
    });

    expect(getList).toHaveBeenCalledWith(
      'qdb_collectioncases',
      { select: ['qdb_currentdpd'], orderBy: 'qdb_currentdpd desc' },
      {},
    );
  });

  it('omits options the caller did not set', async () => {
    const getList = vi.fn().mockResolvedValue({ value: [] });
    const adapter = buildAdapter({ getList });

    await adapter.retrieveMultiple('qdb_collectioncases', { select: ['a'] });

    expect(getList).toHaveBeenCalledWith('qdb_collectioncases', { select: ['a'] }, {});
  });
});

describe('DataverseCrmAdapter writes', () => {
  it('returns the id of the record it created', async () => {
    const adapter = buildAdapter({ create: vi.fn().mockResolvedValue({ id: 'new-id' }) });

    await expect(adapter.create('qdb_collectioncases', { qdb_casenumber: 'C-1' }))
      .resolves.toBe('new-id');
  });

  it('applies a partial update through the client', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const adapter = buildAdapter({ update });

    await adapter.update({ entity: 'qdb_collectioncases', id: 'id-1' }, { statuscode: 100000601 });

    expect(update).toHaveBeenCalledWith(
      'qdb_collectioncases', 'id-1', { statuscode: 100000601 }, {},
    );
  });

  it('invokes a named server-side operation by name, not by platform', async () => {
    const executeAction = vi.fn().mockResolvedValue({ ok: true });
    const adapter = buildAdapter({ executeAction });

    await adapter.execute('qdb_EvaluateEligibility', { facilityNumber: 'F-1' });

    expect(executeAction).toHaveBeenCalledWith(
      'qdb_EvaluateEligibility', { facilityNumber: 'F-1' }, {},
    );
  });
});
