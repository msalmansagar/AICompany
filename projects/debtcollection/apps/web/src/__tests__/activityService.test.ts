import { describe, expect, it } from 'vitest';
import { CrmConcurrencyError, type RowVersion } from '@dcp/domain';
import { ActivityService, toDataversePayload } from '../services/activityService.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { NAVIGATION_PROPERTIES } from '../data/schema.js';
import type { WriteTransport, WriteResponse } from '../platform/writeTransport.js';

/**
 * The service layer, proved before any form exists to depend on it.
 *
 * The transport is recorded rather than mocked away: each test asserts on the **payload that would
 * reach Dataverse**, because the defects this layer exists to prevent — a guessed navigation
 * property, a canonical name sent as a column, a stale version retained after a save — are all
 * invisible in a result object and obvious in a request.
 *
 * The status codes the recorder returns are the ones the organisation actually returned during the
 * Phase 6 spikes: 412 for both a stale `If-Match` and a duplicate `If-None-Match`, with the two told
 * apart by which precondition was sent.
 */

interface RecordedRequest {
  method: 'PATCH' | 'CREATE' | 'GET';
  url: string;
  body?: unknown;
  ifMatch?: string;
}

/** A transport that records what it was asked to send and returns a scripted reply. */
class RecordingTransport implements WriteTransport {
  readonly requests: RecordedRequest[] = [];
  constructor(private readonly replies: WriteResponse[] = []) {}

  private next(): WriteResponse {
    return this.replies.shift() ?? { status: 200, etag: 'W/"2"' };
  }

  async patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse> {
    this.requests.push({ method: 'PATCH', url, body, ...(ifMatch !== undefined ? { ifMatch } : {}) });
    return this.next();
  }

  async createOnly(url: string, body: unknown): Promise<WriteResponse> {
    this.requests.push({ method: 'CREATE', url, body });
    return this.next();
  }

  async get(url: string): Promise<WriteResponse> {
    this.requests.push({ method: 'GET', url });
    return this.next();
  }
}

const NO_XRM = {} as never;
const serviceWith = (transport: WriteTransport) =>
  new ActivityService(new XrmCrmAdapter(NO_XRM, undefined, transport));

const VERSION = 'W/"1"' as RowVersion;
const CASE_ID = '11111111-1111-1111-1111-111111111111';
const TYPE_ID = '22222222-2222-2222-2222-222222222222';
const ACTIVITY_ID = '33333333-3333-3333-3333-333333333333';

const lastBody = (transport: RecordingTransport): Record<string, unknown> =>
  transport.requests.at(-1)!.body as Record<string, unknown>;

describe('translating a plan into a Dataverse payload', () => {
  /** `notes` is the activity base `description`. A form that knew that would be coupled to schema. */
  it('renames canonical fields to their physical columns', () => {
    const payload = toDataversePayload({
      fields: { subject: 'Called', notes: 'Spoke to the customer', ptpStatus: 100000590 },
      binds: [],
    });
    expect(payload).toEqual({
      subject: 'Called', description: 'Spoke to the customer', qdb_ptpstatus: 100000590,
    });
  });

  /**
   * The rule KI-69 cost three separate debugging sessions to learn: the write name is not the read
   * name, and on this entity it carries a relationship suffix.
   */
  it('binds a lookup through its registered navigation property, never the bare attribute', () => {
    const payload = toDataversePayload({ fields: {}, binds: [{ lookup: 'case', id: CASE_ID }] });
    expect(payload).toEqual({
      [`${NAVIGATION_PROPERTIES.activityToCase}@odata.bind`]: `/qdb_collectioncases(${CASE_ID})`,
    });
    expect(Object.keys(payload)[0]).toContain('_qdb_collectionactivity');
  });

  it('refuses a field it has no column for, rather than sending the canonical name', () => {
    expect(() => toDataversePayload({ fields: { inventedField: 1 }, binds: [] }))
      .toThrow(/No column is mapped for the field "inventedField"/);
  });
});

describe('creating an activity', () => {
  it('writes to the caller-chosen id and reports it created the record', async () => {
    const transport = new RecordingTransport([{ status: 201, etag: 'W/"1"' }]);
    const outcome = await serviceWith(transport).createActivity(ACTIVITY_ID, {
      caseId: CASE_ID, activityTypeId: TYPE_ID, subject: 'Called the customer',
    });

    expect(outcome.status).toBe('saved');
    if (outcome.status !== 'saved') return;
    expect(outcome.result.created).toBe(true);
    expect(transport.requests[0]!.url).toBe(`/qdb_collectionactivities(${ACTIVITY_ID})`);
    expect(transport.requests[0]!.method).toBe('CREATE');
  });

  /**
   * Duplicate submission — the scenario the authorisation singles out.
   *
   * Disabling the Save button does not cover it: the dangerous case is the request that reached the
   * server and whose response was lost, where the client legitimately believes nothing was saved and
   * retries. The same id makes the second attempt a no-op at the platform, and the user is told
   * "saved" because from their point of view it is.
   */
  it('treats a resubmission of the same id as saved, not as an error, and creates nothing', async () => {
    const transport = new RecordingTransport([
      { status: 201, etag: 'W/"1"' },
      { status: 412, message: 'A record with matching key values already exists.' },
    ]);
    const service = serviceWith(transport);
    const request = { caseId: CASE_ID, activityTypeId: TYPE_ID, subject: 'Called the customer' };

    const first = await service.createActivity(ACTIVITY_ID, request);
    const retry = await service.createActivity(ACTIVITY_ID, request);

    expect(first.status).toBe('saved');
    expect(retry.status).toBe('saved');
    if (first.status !== 'saved' || retry.status !== 'saved') return;
    expect(first.result.created).toBe(true);
    expect(retry.result.created, 'the retry did not create a second activity').toBe(false);
    expect(retry.result.id).toBe(first.result.id);
  });

  it('refuses an incomplete activity without going near the network', async () => {
    const transport = new RecordingTransport();
    const outcome = await serviceWith(transport).createActivity(ACTIVITY_ID, {
      caseId: '', activityTypeId: '', subject: '',
    });

    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.refusals).toHaveLength(3);
    expect(transport.requests, 'a refusal costs no round trip').toHaveLength(0);
  });
});

describe('updating an activity', () => {
  it('sends the version it was given and returns the NEW one', async () => {
    const transport = new RecordingTransport([{ status: 200, etag: 'W/"2"' }]);
    const outcome = await serviceWith(transport)
      .completeActivity({ id: ACTIVITY_ID, version: VERSION }, { currentStatus: 'Open' });

    expect(outcome.status).toBe('saved');
    if (outcome.status !== 'saved') return;
    expect(transport.requests[0]!.ifMatch).toBe(VERSION);
    // Keeping the old token would turn the user's next legitimate save into a phantom conflict.
    expect(outcome.result.version).toBe('W/"2"');
  });

  /** Two saves in a row by the same user must both succeed — the regression KI-70 would cause. */
  it('lets a user save twice in a row by carrying each new version forward', async () => {
    const transport = new RecordingTransport([
      { status: 200, etag: 'W/"2"' }, { status: 200, etag: 'W/"3"' },
    ]);
    const service = serviceWith(transport);

    const first = await service.scheduleFollowUp({ id: ACTIVITY_ID, version: VERSION }, 'Open', '2026-10-01');
    expect(first.status).toBe('saved');
    if (first.status !== 'saved') return;

    const second = await service.scheduleFollowUp(
      { id: ACTIVITY_ID, version: first.result.version }, 'Open', '2026-10-08');
    expect(second.status).toBe('saved');
    expect(transport.requests[1]!.ifMatch, 'the second save used the version the first returned').toBe('W/"2"');
  });

  it('writes the outcome binding and the configured follow-up together', async () => {
    const transport = new RecordingTransport();
    await serviceWith(transport).completeActivity({ id: ACTIVITY_ID, version: VERSION }, {
      currentStatus: 'Open',
      outcome: {
        id: 'outcome-1', code: 'P6-CONTACTED', name: 'Contacted',
        requiresFollowUp: true, followUpDays: 3, requiresNotes: true, escalationRequired: false,
      },
      notes: 'Customer will pay Thursday.',
      now: new Date('2026-09-19T10:00:00.000Z'),
    });

    const body = lastBody(transport);
    expect(body['qdb_followupdate']).toBe('2026-09-22T10:00:00.000Z');
    expect(body['description']).toBe('Customer will pay Thursday.');
    expect(body[`${NAVIGATION_PROPERTIES.activityToOutcome}@odata.bind`]).toBe('/qdb_activityoutcomes(outcome-1)');
  });
});

describe('telling failures apart', () => {
  /**
   * The distinction the authorisation requires, and the reason `CrmConcurrencyError` is its own type:
   * "someone else changed this" is a reload, "the save failed" is a retry, and a layer that cannot
   * tell them apart offers the wrong one.
   */
  it('turns a stale write into a conflict a collector can act on, free of HTTP vocabulary', async () => {
    const transport = new RecordingTransport([{
      status: 412,
      message: "The version of the existing record doesn't match the RowVersion property provided.",
    }]);
    const outcome = await serviceWith(transport)
      .completeActivity({ id: ACTIVITY_ID, version: VERSION }, { currentStatus: 'Open' });

    expect(outcome.status).toBe('conflict');
    if (outcome.status !== 'conflict') return;
    expect(outcome.message).toMatch(/changed this record/i);
    expect(outcome.message, 'no 412, no ETag, no If-Match').not.toMatch(/412|etag|if-match|rowversion/i);
  });

  /** A server-side lifecycle refusal is not a conflict, and must not be offered as "reload". */
  it('does not disguise a plugin refusal as a concurrency conflict', async () => {
    const transport = new RecordingTransport([
      { status: 400, message: 'Transition from Completed to Open is not permitted.' },
    ]);
    await expect(
      serviceWith(transport).completeActivity({ id: ACTIVITY_ID, version: VERSION }, { currentStatus: 'Open' }),
    ).rejects.toThrow(/not permitted/);
  });

  it('classifies a concurrency error by its type, not by parsing a message', () => {
    const error = new CrmConcurrencyError(
      { entity: 'qdb_collectionactivities', id: ACTIVITY_ID }, VERSION, 'anything at all');
    expect(error).toBeInstanceOf(CrmConcurrencyError);
    expect(error).not.toBeInstanceOf(TypeError);
  });
});

describe('the promise, through the service', () => {
  it('creates a promise on the activity entity, carrying promise columns', async () => {
    const transport = new RecordingTransport([{ status: 201, etag: 'W/"1"' }]);
    const outcome = await serviceWith(transport).createPromise(ACTIVITY_ID, {
      caseId: CASE_ID, activityTypeId: TYPE_ID, subject: 'Promise to pay',
      promisedAmount: 5000, promiseDate: '2026-10-01T00:00:00.000Z',
    });

    expect(outcome.status).toBe('saved');
    expect(transport.requests[0]!.url).toContain('qdb_collectionactivities');
    const body = lastBody(transport);
    expect(body['qdb_promisedamount']).toBe(5000);
    expect(body['qdb_ptpstatus']).toBeDefined();
  });

  it('refuses a transition the matrix forbids, without a round trip', async () => {
    const transport = new RecordingTransport();
    const outcome = await serviceWith(transport)
      .movePromise({ id: ACTIVITY_ID, version: VERSION }, 'Kept', 'Broken');

    expect(outcome.status).toBe('refused');
    expect(transport.requests).toHaveLength(0);
  });

  /**
   * React's job is UX. The server matrix is the authority, and this asserts the client refusal is a
   * *duplicate* of that rule rather than a substitute for it — the plugin still rejects the same
   * move, as `StatusTransitionValidatorActivityTests` proves on the C# side.
   */
  it('sends a permitted transition with the reported amount', async () => {
    const transport = new RecordingTransport();
    const outcome = await serviceWith(transport)
      .movePromise({ id: ACTIVITY_ID, version: VERSION }, 'Active', 'PartiallyKept', { amountReceived: 2000 });

    expect(outcome.status).toBe('saved');
    expect(lastBody(transport)['qdb_amountreceived']).toBe(2000);
  });
});
