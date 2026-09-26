import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCrmSession } from '../App.js';
import { ENTITY_SETS } from '../data/schema.js';
import type { XrmLike } from '../platform/crmContext.js';
import type { RowVersion } from '@dcp/domain';

/**
 * The session the workspace actually runs on.
 *
 * This file exists because of a defect that reached a user. `App` built its adapter as
 * `new XrmCrmAdapter(xrm)` — with **no write transport** — so every read worked, every screen
 * rendered, 241 tests passed, and the first attempt to log a collection action failed with
 * *"this adapter was built without a write transport"*. Every versioned read failed with it too, so
 * opening an existing activity was broken as well.
 *
 * Nothing caught it because every other test **builds its own adapter and passes a transport in**.
 * The one place that assembles the real thing had no test at all, and a component test could not
 * have found it: the failure is in the wiring, not the rendering.
 *
 * So these tests drive the real factory and assert the composed object can do the things the
 * workspace needs — not that it was constructed, but that a write leaves it. `fetch` is stubbed
 * because that is the boundary; everything above it is production code.
 */

const ACTIVITY_ID = '33333333-3333-3333-3333-333333333333';

function fakeXrm(): XrmLike {
  return {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{61086FE4-0000-0000-0000-000000000001}', userName: 'Tester', languageId: 1033 },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord() { return {}; },
      async retrieveMultipleRecords() { return { entities: [] }; },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  } as unknown as XrmLike;
}

/** A `fetch` that records the request and answers as Dataverse would. */
function stubFetch(response: { status: number; etag?: string; body?: unknown } = { status: 200, etag: 'W/"2"' }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (response.etag) headers.set('ETag', response.etag);

  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response.body ?? {}), { status: response.status, headers });
  });
  return calls;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the session the workspace runs on', () => {
  it('reads the organisation and API version from the host rather than assuming them', () => {
    const { context } = createCrmSession(fakeXrm());
    expect(context.apiBase).toBe('https://org5869857f.crm4.dynamics.com/api/data/v9.2');
    // On-premises answers 9.1. Composing the path from a constant is KI-02.
    expect(context.apiVersion).toBe('9.2');
  });

  /**
   * The regression itself.
   *
   * Asserted by making the write and watching a request leave, rather than by inspecting a private
   * field — a test that checked "a transport was passed" would pass against a transport pointed at
   * the wrong host.
   */
  it('can create a record idempotently, which is what logging an action needs', async () => {
    const calls = stubFetch({ status: 201, etag: 'W/"1"' });
    const { adapter } = createCrmSession(fakeXrm());

    const result = await adapter.createIdempotent(
      ENTITY_SETS.collectionActivity, ACTIVITY_ID, { subject: 'Called the customer' });

    expect(result.created).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `https://org5869857f.crm4.dynamics.com/api/data/v9.2/qdb_collectionactivities(${ACTIVITY_ID})`);
    // Create-only, not a blind upsert — the guard that makes a repeat submission harmless.
    expect((calls[0]!.init.headers as Record<string, string>)['If-None-Match']).toBe('*');
  });

  it('can read a record with its version, which is what opening an activity needs', async () => {
    const calls = stubFetch({ status: 200, etag: 'W/"7"', body: { activityid: ACTIVITY_ID, subject: 'x' } });
    const { adapter } = createCrmSession(fakeXrm());

    const record = await adapter.retrieveVersioned(
      { entity: ENTITY_SETS.collectionActivity, id: ACTIVITY_ID }, ['activityid', 'subject']);

    expect(record?.version).toBe('W/"7"');
    expect(calls[0]!.url).toContain('/api/data/v9.2/qdb_collectionactivities(');
  });

  it('can update with a version, which is what saving an edit needs', async () => {
    const calls = stubFetch({ status: 200, etag: 'W/"3"' });
    const { adapter } = createCrmSession(fakeXrm());

    const version = await adapter.updateVersioned(
      { entity: ENTITY_SETS.collectionActivity, id: ACTIVITY_ID },
      { subject: 'edited' },
      'W/"2"' as RowVersion,
    );

    expect(version).toBe('W/"3"');
    expect((calls[0]!.init.headers as Record<string, string>)['If-Match']).toBe('W/"2"');
  });

  /**
   * The header that carries the session. A write that lost it would fail as an authorisation error
   * and read as a permissions problem, which is an expensive thing to debug.
   */
  it('sends the write same-origin, so CRM applies the signed-in user\'s security', async () => {
    const calls = stubFetch();
    const { adapter } = createCrmSession(fakeXrm());
    await adapter.updateVersioned(
      { entity: ENTITY_SETS.collectionActivity, id: ACTIVITY_ID }, { subject: 'x' }, 'W/"1"' as RowVersion);

    expect(calls[0]!.init.credentials).toBe('same-origin');
  });

  /** Both directives, joined. Replacing one with the other is the Phase 4 defect, and KI-70. */
  it('asks for the representation and the annotations together on a write', async () => {
    const calls = stubFetch();
    const { adapter } = createCrmSession(fakeXrm());
    await adapter.updateVersioned(
      { entity: ENTITY_SETS.collectionActivity, id: ACTIVITY_ID }, { subject: 'x' }, 'W/"1"' as RowVersion);

    const prefer = (calls[0]!.init.headers as Record<string, string>)['Prefer'] ?? '';
    expect(prefer).toContain('return=representation');
    expect(prefer).toContain('odata.include-annotations');
  });

  it('refuses clearly when there is no host, rather than building a half-working session', () => {
    expect(() => createCrmSession(null)).toThrow(/no standalone mode|client API was found/i);
  });
});

describe('the session carries the Report Engine', () => {
  /**
   * Same lesson as the write transport: the one place that assembles the real session is the one
   * place a missing wire would hide, because every other test passes its own service in.
   */
  it('runs a report through the same client API the workspace reads with', async () => {
    const xrm = fakeXrm();
    const requests: unknown[] = [];
    xrm.WebApi.execute = async (request: unknown) => {
      requests.push(request);
      return new Response(JSON.stringify({ resultJson: JSON.stringify({ reportId: 'r-1', columns: [], rows: [], rowCount: 0 }) }), { status: 200 });
    };

    const session = createCrmSession(xrm);
    const outcome = await session.reporting!.runReport({ reportId: 'r-1', scope: { sourceSystem: 'BFD' } });

    expect([outcome.status, (requests[0] as { parametersJson: string }).parametersJson]).toEqual(['ok', '{"SourceSystem":"BFD"}']);
  });
});
