import { describe, expect, it } from 'vitest';
import { deceasedReviewId, INDICATION_LABEL } from '@dcp/domain';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { recordDeceasedReview } from '../data/deceasedQueries.js';

/**
 * Recording a deceased review, and everything it must not do.
 *
 * The capability was modelled, read and displayed before it could be written — the card offered
 * "Awaiting review" on every case and nothing in the product could move it, because the officer
 * action was documented and never wired. These tests assert the write exists, that it is the same
 * write every time, and that it touches nothing else on the case.
 */

const CASE_ID = 'aa11bb22-0000-4000-8000-000000000001';
const FACILITY = 'DEMO-HL-8801';
const TYPE_ID = 'cc33dd44-0000-4000-8000-000000000002';

interface Attempt { url: string; body: Record<string, unknown>; }

function adapterRecording(statuses: number[]) {
  const attempts: Attempt[] = [];
  let call = 0;
  const transport = {
    async createOnly(url: string, body: unknown) {
      attempts.push({ url, body: body as Record<string, unknown> });
      const status = statuses[call++] ?? 204;
      return { status };
    },
    async get() { return { status: 200 }; },
    async patch() { return { status: 204 }; },
    async post() { return { status: 204 }; },
  };
  const xrm = { WebApi: {} } as unknown as XrmLike;
  return { adapter: new XrmCrmAdapter(xrm, undefined, transport as never), attempts };
}

const record = (adapter: XrmCrmAdapter) =>
  recordDeceasedReview(adapter, { caseId: CASE_ID, facilityNumber: FACILITY, activityTypeId: TYPE_ID });

describe('recording a deceased review', () => {
  it('writes at the derived id, which is how the card finds it again', async () => {
    const { adapter, attempts } = adapterRecording([204]);

    const result = await record(adapter);

    expect(result.reviewId).toBe(deceasedReviewId(CASE_ID, FACILITY));
    expect(attempts[0]!.url).toContain(deceasedReviewId(CASE_ID, FACILITY));
    expect(result.created).toBe(true);
  });

  it('says what it is — an indication requiring verification, not a death', async () => {
    const { adapter, attempts } = adapterRecording([204]);

    await record(adapter);

    expect(attempts[0]!.body['subject']).toBe(INDICATION_LABEL);
    expect(String(attempts[0]!.body['subject'])).not.toMatch(/confirmed|verified|deceased customer/i);
  });

  /**
   * A repeat is refused by the platform with 412, and that is success: the record the officer
   * asked for exists. Reporting it as a failure would invite them to try again.
   */
  it('a retry reaches the same record rather than creating a second', async () => {
    const { adapter, attempts } = adapterRecording([204, 412]);

    const first = await record(adapter);
    const second = await record(adapter);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reviewId).toBe(first.reviewId);
    expect(new Set(attempts.map(a => a.url)).size, 'both wrote to one address').toBe(1);
  });

  it('two officers at once resolve to one review', async () => {
    const { adapter } = adapterRecording([204, 412, 412, 412, 412]);

    const results = await Promise.all(Array.from({ length: 5 }, () => record(adapter)));

    expect(results.filter(r => r.created)).toHaveLength(1);
    expect(new Set(results.map(r => r.reviewId)).size).toBe(1);
  });

  /**
   * The side-effect invariant, asserted on the request rather than on the outcome.
   *
   * Nothing about the case, the customer, the strategy, communications or Legal may ride along
   * with a review. None of those has an agreed rule behind it (KI-124, KI-127), so the safest
   * write is the one that says only what happened.
   */
  it('writes nothing but the review itself', async () => {
    const { adapter, attempts } = adapterRecording([204]);

    await record(adapter);

    const keys = Object.keys(attempts[0]!.body);
    expect(keys).toHaveLength(3);
    expect(attempts[0]!.url).toContain('qdb_collectionactivities');

    const forbidden = /statecode|statuscode|qdb_collectionpaused|creditonhold|donotemail|donotphone|qdb_currentdpd|qdb_arrears|qdb_strategyid|qdb_legalrequestid|deceasedflag|exemption/i;
    for (const key of keys) expect(key, `${key} must not ride along`).not.toMatch(forbidden);
  });

  it('makes exactly one request — no read-then-create race', async () => {
    const { adapter, attempts } = adapterRecording([204]);

    await record(adapter);

    expect(attempts).toHaveLength(1);
  });

  it('binds the case and the configured activity type, and nothing else', async () => {
    const { adapter, attempts } = adapterRecording([204]);

    await record(adapter);

    const binds = Object.keys(attempts[0]!.body).filter(key => key.includes('@odata.bind'));
    expect(binds).toHaveLength(2);
    expect(String(attempts[0]!.body[binds[0]!])).toContain(CASE_ID);
    expect(String(attempts[0]!.body[binds[1]!])).toContain(TYPE_ID);
  });

  it('does not set an owner, leaving native security to decide', async () => {
    const { adapter, attempts } = adapterRecording([204]);

    await record(adapter);

    expect(Object.keys(attempts[0]!.body).join(',')).not.toMatch(/owner/i);
  });
});
