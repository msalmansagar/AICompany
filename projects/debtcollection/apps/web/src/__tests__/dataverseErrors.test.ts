import { describe, expect, it } from 'vitest';
import { interpretRejection, OBJECT_DOES_NOT_EXIST } from '../platform/dataverseErrors.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { loadLitigation } from '../data/legalQueries.js';
import { loadComplaintCase } from '../data/complaintQueries.js';
import { loadDeceasedReview } from '../data/deceasedQueries.js';

/**
 * One interpreter, because three screens guessed separately and two guessed wrongly.
 *
 * The rejections below are the shapes the platform actually produces, not shapes that make the
 * code look right. The client API's was read from `org5869857f` by asking for a record that was
 * never created; the transport's are ordinary HTTP.
 */

/** Exactly what `Xrm.WebApi` throws: a plain object, not an `Error`, with no `status`. */
const clientApiNotFound = {
  errorCode: OBJECT_DOES_NOT_EXIST,
  message: 'The requested record was not found.',
  code: '0x80040217',
  title: 'Not Found',
};

describe('classifying a rejection', () => {
  it('reads the observed client-API code as absence', () => {
    expect(interpretRejection(clientApiNotFound)).toEqual({ kind: 'notFound' });
  });

  it('reads a transport 404 as absence', () => {
    expect(interpretRejection({ status: 404 })).toEqual({ kind: 'notFound' });
  });

  it('reads a transport 403 as refusal, which is not absence', () => {
    expect(interpretRejection({ status: 403 })).toEqual({ kind: 'accessDenied' });
  });

  it('reads a transport 401 as refusal too', () => {
    expect(interpretRejection({ status: 401 })).toEqual({ kind: 'accessDenied' });
  });

  it('reads throttling and server errors as worth retrying', () => {
    expect(interpretRejection({ status: 429 }).kind).toBe('transient');
    expect(interpretRejection({ status: 503 }).kind).toBe('transient');
  });

  /**
   * The rule that matters most. Anything unrecognised must stay unrecognised — a failure quietly
   * classified as absence tells an officer that a record does not exist when nobody established
   * that, and on this organisation the Legal record is exactly where that lie would land.
   */
  it('refuses to call an unrecognised failure absence', () => {
    for (const rejection of [
      {},
      { errorCode: 123456 },
      { status: 400 },
      { message: 'something went wrong' },
      new Error('boom'),
      'a string',
      null,
      undefined,
    ]) {
      expect(interpretRejection(rejection).kind, JSON.stringify(rejection) ?? 'undefined')
        .not.toBe('notFound');
    }
  });

  it('does not treat an ordinary Error as anything in particular', () => {
    expect(interpretRejection(new Error('boom')).kind).toBe('unknown');
  });

  it('never uses instanceof Error to decide — an Error carrying the code is still absence', () => {
    const wrapped = Object.assign(new Error('gone'), { errorCode: OBJECT_DOES_NOT_EXIST });

    expect(interpretRejection(wrapped)).toEqual({ kind: 'notFound' });
  });
});

// ── The three callers that used to decide for themselves ────────────────────

function adapterRejecting(rejection: unknown): XrmCrmAdapter {
  const xrm = {
    WebApi: {
      retrieveRecord: async () => { throw rejection; },
      retrieveMultipleRecords: async () => ({ entities: [] }),
    },
  } as unknown as XrmLike;
  return new XrmCrmAdapter(xrm);
}

describe('every by-id read shares the one interpreter', () => {
  it('Legal reports absence as absence', async () => {
    const fetch = await loadLitigation(adapterRejecting(clientApiNotFound), 'legal-1');

    expect(fetch.kind).toBe('notFound');
  });

  it('Legal reports a refusal as withheld, never as absence', async () => {
    const fetch = await loadLitigation(adapterRejecting({ status: 403 }), 'legal-1');

    expect(fetch.kind).toBe('forbidden');
  });

  it('Legal reports an unclassified failure as unavailable, never as absence', async () => {
    const fetch = await loadLitigation(adapterRejecting({ message: 'odd' }), 'legal-1');

    expect(fetch.kind).toBe('unavailable');
  });

  it('Complaint uses the same interpreter', async () => {
    expect((await loadComplaintCase(adapterRejecting(clientApiNotFound), 'case-1')).kind)
      .toBe('notFound');
    expect((await loadComplaintCase(adapterRejecting({ status: 403 }), 'case-1')).kind)
      .toBe('forbidden');
  });

  /**
   * The Deceased Review asks its question *by* asking for a record that may not exist, so absence
   * is its normal answer. Before the interpreter existed this threw, and the card showed an error
   * on every case that had no review — the defect that made the whole capability invisible.
   */
  it('Deceased Review treats absence as "no review recorded"', async () => {
    const review = await loadDeceasedReview(adapterRejecting(clientApiNotFound), 'case-1', 'FAC-1');

    expect(review).toBeNull();
  });

  it('Deceased Review still raises an unclassified failure rather than reporting no review', async () => {
    await expect(loadDeceasedReview(adapterRejecting({ message: 'odd' }), 'case-1', 'FAC-1'))
      .rejects.toBeDefined();
  });
});
