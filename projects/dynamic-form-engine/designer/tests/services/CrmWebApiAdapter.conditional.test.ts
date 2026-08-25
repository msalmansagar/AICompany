// updateRecordConditional never reached Dataverse. It handed Xrm.WebApi.online.execute a
// hand-rolled update contract — operationType 2 with the entity's columns spread onto the
// request — and Xrm cannot serialise that shape:
//
//   "Cannot convert ODataContract with qdb_form_definition operation into a serialized request"
//
// The damage was silent and long-running: tabs, sections and fields save through plain
// create/update and persisted fine, so the designer looked like it worked, while every
// form-LEVEL edit was thrown away. Confirmed on org5869857f — two forms saved from the
// designer both still had modifiedon equal to createdon.
//
// It is now a plain PATCH with If-Match, which is what makes the update conditional.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrmWebApiAdapter } from '@/services/CrmWebApiAdapter';
import { ConcurrencyConflictError } from '@/services/concurrency/ConcurrencyConflictError';

const CLIENT_URL = 'https://org.crm4.dynamics.com';
const FORM_ID = '11111111-1111-1111-1111-111111111111';
const ETAG = 'W/"201971618"';

const mockFetch = vi.fn();

function buildAdapter() {
  // Only the members the adapter touches on this path.
  return new CrmWebApiAdapter({
    createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(), retrieveMultipleRecords: vi.fn(),
  } as unknown as typeof Xrm.WebApi);
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('Xrm', {
    Utility: { getGlobalContext: () => ({ getClientUrl: () => CLIENT_URL }) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CrmWebApiAdapter.updateRecordConditional', () => {
  it('sendsAPatch_notAnXrmExecuteRequest', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });

    await buildAdapter().updateRecordConditional(
      'qdb_form_definition', FORM_ID, { qdb_title: 'Vendor Onboarding' }, { ifMatch: ETAG },
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('PATCH');
  });

  // Without If-Match the update is not conditional at all and silently clobbers a concurrent edit.
  it('carriesTheEtagAsIfMatch', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });

    await buildAdapter().updateRecordConditional(
      'qdb_form_definition', FORM_ID, { qdb_title: 'x' }, { ifMatch: ETAG },
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['If-Match']).toBe(ETAG);
  });

  it('pluralisesTheLogicalNameIntoTheEntitySet', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });

    await buildAdapter().updateRecordConditional(
      'qdb_form_definition', FORM_ID, { qdb_title: 'x' }, { ifMatch: ETAG },
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${CLIENT_URL}/api/data/v9.2/qdb_form_definitions(${FORM_ID})`);
  });

  it('stripsBracesFromTheId', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });

    await buildAdapter().updateRecordConditional(
      'qdb_form_definition', `{${FORM_ID}}`, { qdb_title: 'x' }, { ifMatch: ETAG },
    );

    expect(mockFetch.mock.calls[0][0]).toContain(`(${FORM_ID})`);
  });

  it('sendsTheRecordAsTheBody', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });

    await buildAdapter().updateRecordConditional(
      'qdb_form_definition', FORM_ID, { qdb_title: 'Vendor', qdb_summary_mode: null }, { ifMatch: ETAG },
    );

    expect(JSON.parse(mockFetch.mock.calls[0][1].body))
      .toEqual({ qdb_title: 'Vendor', qdb_summary_mode: null });
  });

  // 412 is the whole point of the conditional update — somebody else changed the record.
  it('raisesAConcurrencyConflict_on412', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 412, text: async () => '' });

    await expect(
      buildAdapter().updateRecordConditional('qdb_form_definition', FORM_ID, { a: 1 }, { ifMatch: ETAG }),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  // A failure must be loud. This one was silent for a long time.
  it('throws_onAnyOtherFailureStatus', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request detail' });

    await expect(
      buildAdapter().updateRecordConditional('qdb_form_definition', FORM_ID, { a: 1 }, { ifMatch: ETAG }),
    ).rejects.toThrow(/failed with 400/);
  });

  it('resolvesA204AsSuccess', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });

    await expect(
      buildAdapter().updateRecordConditional('qdb_form_definition', FORM_ID, { a: 1 }, { ifMatch: ETAG }),
    ).resolves.toBeUndefined();
  });
});
