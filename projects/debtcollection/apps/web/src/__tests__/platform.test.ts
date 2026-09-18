import { describe, expect, it, vi } from 'vitest';
import {
  CrmContextError,
  findXrm,
  normaliseId,
  readCrmContext,
  toApiVersion,
  type XrmLike,
} from '../platform/crmContext.js';
import { DEFAULT_LOGICAL_NAMES, XrmCrmAdapter, buildOptions, toOptionsString } from '../platform/XrmCrmAdapter.js';

/** A client API stand-in. The live spike proves the platform's side; this proves ours. */
function fakeXrm(overrides: Partial<{
  version: string;
  entities: Record<string, unknown>[];
  nextLink: string;
  count: number;
  onRetrieveMultiple: (logicalName: string, options?: string, maxPageSize?: number) => void;
  retrieveRecordError: unknown;
}> = {}): XrmLike {
  return {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => overrides.version ?? '9.2.24091.00203',
        userSettings: {
          userId: '{61086FE4-1234-4321-ABCD-000000000001}',
          userName: 'Salman Sagar',
          languageId: 1033,
          securityRoles: ['{AAAA0000-0000-0000-0000-000000000001}'],
        },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord() {
        if (overrides.retrieveRecordError) throw overrides.retrieveRecordError;
        return { activityid: 'a-1' };
      },
      async retrieveMultipleRecords(logicalName: string, options?: string, maxPageSize?: number) {
        overrides.onRetrieveMultiple?.(logicalName, options, maxPageSize);
        return {
          entities: overrides.entities ?? [{ activityid: 'a-1' }],
          ...(overrides.nextLink !== undefined ? { nextLink: overrides.nextLink } : {}),
          ...(overrides.count !== undefined ? { '@odata.count': overrides.count } : {}),
        };
      },
      async createRecord() { return { id: '{11111111-1111-1111-1111-111111111111}' }; },
      async updateRecord() { return { id: 'x' }; },
    },
  };
}

describe('finding the host', () => {
  it('prefers the parent window, because a full-page web resource runs in an iframe', () => {
    const parentXrm = fakeXrm();
    const win = { parent: { Xrm: parentXrm }, top: {} } as unknown as Window;
    expect(findXrm(win)).toBe(parentXrm);
  });

  it('falls back to the window itself', () => {
    const ownXrm = fakeXrm();
    const win = { parent: {}, top: {}, Xrm: ownXrm } as unknown as Window;
    expect(findXrm(win)).toBe(ownXrm);
  });

  it('survives a cross-origin parent that throws on access', () => {
    const ownXrm = fakeXrm();
    const win = {
      get parent(): Window { throw new Error('cross-origin'); },
      top: {},
      Xrm: ownXrm,
    } as unknown as Window;
    expect(findXrm(win)).toBe(ownXrm);
  });

  it('returns null when nothing looks like the client API', () => {
    expect(findXrm({ parent: {}, top: {} } as unknown as Window)).toBeNull();
  });

  it('rejects an object that merely claims to be Xrm', () => {
    const win = { parent: {}, top: {}, Xrm: { Utility: {} } } as unknown as Window;
    expect(findXrm(win)).toBeNull();
  });
});

describe('reading the CRM context', () => {
  it('takes the organisation URL from the host rather than a constant', () => {
    expect(readCrmContext(fakeXrm()).clientUrl).toBe('https://org5869857f.crm4.dynamics.com');
  });

  it('reads the API version rather than assuming 9.2 — the KI-02 defect', () => {
    expect(readCrmContext(fakeXrm({ version: '9.1.0000.3456' })).apiVersion).toBe('9.1');
  });

  it('composes the API base from what the host reported', () => {
    expect(readCrmContext(fakeXrm({ version: '9.1.0000.3456' })).apiBase)
      .toBe('https://org5869857f.crm4.dynamics.com/api/data/v9.1');
  });

  it('strips the braces the client API wraps ids in', () => {
    expect(readCrmContext(fakeXrm()).userId).toBe('61086fe4-1234-4321-abcd-000000000001');
  });

  it('carries the security roles for UX gating', () => {
    expect(readCrmContext(fakeXrm()).securityRoleIds).toHaveLength(1);
  });

  it('explains that there is no standalone mode when no host is present', () => {
    expect(() => readCrmContext(null)).toThrow(/no standalone mode/i);
  });

  it('names a missing host NoHost rather than failing obscurely', () => {
    try {
      readCrmContext(null);
      expect.unreachable('should have refused');
    } catch (error) {
      expect((error as CrmContextError).kind).toBe('NoHost');
    }
  });

  it('refuses a version it cannot turn into an API path', () => {
    expect(() => toApiVersion('not-a-version')).toThrow(CrmContextError);
  });

  it('normalises an id consistently', () => {
    expect(normaliseId('{ABC-DEF}')).toBe('abc-def');
  });
});

describe('entity set to logical name', () => {
  const adapter = new XrmCrmAdapter(fakeXrm());

  it('drops a simple trailing s', () => {
    expect(adapter.toLogicalName('qdb_collectioncases')).toBe('qdb_collectioncase');
  });

  it('turns -ies back into -y', () => {
    expect(adapter.toLogicalName('qdb_collectionstrategies')).toBe('qdb_collectionstrategy');
  });

  it('knows the irregular set a plural rule gets wrong', () => {
    // qdb_crmlogs is served at qdb_crmlogses. The naive rule yields qdb_crmlogse, which 404s —
    // and did, on the first run of the Phase 4 spike.
    expect(adapter.toLogicalName('qdb_crmlogses')).toBe('qdb_crmlogs');
  });

  it('maps the customer masters', () => {
    expect(adapter.toLogicalName('contacts')).toBe('contact');
    expect(adapter.toLogicalName('accounts')).toBe('account');
  });

  it('lists every override as a real logical name, never a guess', () => {
    for (const [set, logical] of Object.entries(DEFAULT_LOGICAL_NAMES)) {
      expect(set.startsWith(logical.split('_')[0]!)).toBe(true);
    }
  });
});

describe('the options string the adapter emits', () => {
  it('always selects explicitly', () => {
    expect(buildOptions({ select: ['a', 'b'] })).toBe('?$select=a,b');
  });

  it('passes a filter through to the platform', () => {
    expect(buildOptions({ select: ['a'], filter: 'statecode eq 0' })).toContain('$filter=statecode eq 0');
  });

  it('orders by every sort column, because ties span page boundaries', () => {
    const options = buildOptions({ select: ['a'], sort: [{ field: 'x', descending: true }, { field: 'y' }] });
    expect(options).toContain('$orderby=x desc,y asc');
  });

  it('omits orderby entirely when no sort is asked for', () => {
    expect(buildOptions({ select: ['a'], sort: [] })).not.toContain('$orderby');
  });

  it('asks for a count only when requested', () => {
    expect(buildOptions({ select: ['a'], count: true })).toContain('$count=true');
    expect(buildOptions({ select: ['a'] })).not.toContain('$count');
  });

  /**
   * `Xrm.WebApi` composes the request URL itself and refuses anything that is not an options
   * string — "UciError: Option Parameter should begin with \"?\"". Dataverse returns its
   * `@odata.nextLink` as an absolute URL, so following a continuation has to reduce it.
   *
   * This went undetected because the node shim in the platform spike built the URL itself and
   * happily accepted the absolute link: the stand-in was more permissive than the real thing, so
   * the continuation path passed against the shim and failed in Dynamics. The shim now enforces the
   * same rule.
   */
  it('reduces a continuation nextLink to the options string the client API accepts', () => {
    const nextLink = 'https://org5869857f.crm4.dynamics.com/api/data/v9.2/qdb_collectioncases'
      + '?$select=qdb_casenumber&$filter=statecode%20eq%200&$skiptoken=%3ccookie%20page%3d%221%22%2f%3e';
    const options = toOptionsString(nextLink);
    expect(options.startsWith('?'), options.slice(0, 40)).toBe(true);
    expect(options).toContain('$skiptoken=');
    expect(options).toContain('$select=qdb_casenumber');
    expect(options).not.toContain('https://');
  });

  it('leaves an options string that already begins with ? alone', () => {
    expect(toOptionsString('?$select=a&$top=1')).toBe('?$select=a&$top=1');
  });

  it('refuses a continuation carrying no query string rather than sending it', () => {
    expect(() => toOptionsString('https://org.crm4.dynamics.com/api/data/v9.2/qdb_collectioncases'))
      .toThrow(/must carry a query string/);
  });

  /**
   * A count asks for no columns. Sending `$select=` blank is rejected by the platform — "'select'
   * and 'expand' cannot be both null or empty" — which the live query smoke caught and no mocked
   * adapter would have: a stand-in accepts whatever string it is handed.
   */
  it('omits $select entirely when no column is wanted, rather than sending it blank', () => {
    const options = buildOptions({ select: [], count: true });
    expect(options).not.toContain('$select');
    expect(options).toBe('?$count=true');
  });

  it('still produces a valid option string when a count is the only thing asked for', () => {
    expect(buildOptions({ select: [], filter: 'statecode eq 0', count: true }))
      .toBe('?$filter=statecode eq 0&$count=true');
  });
});

describe('paging through the client API', () => {
  it('always sends a page size — an unbounded read is the whole table', async () => {
    const seen: { maxPageSize?: number }[] = [];
    const adapter = new XrmCrmAdapter(fakeXrm({
      onRetrieveMultiple: (_l, _o, maxPageSize) => seen.push({ ...(maxPageSize !== undefined ? { maxPageSize } : {}) }),
    }));

    await adapter.retrievePage('qdb_crmlogses', { select: ['activityid'], pageSize: 25 });

    expect(seen[0]?.maxPageSize).toBe(25);
  });

  it('offers an opaque continuation when the platform returns a nextLink', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm({ nextLink: 'https://org/api/data/v9.2/x?$skiptoken=<cookie/>' }));
    const page = await adapter.retrievePage('qdb_crmlogses', { select: ['activityid'], pageSize: 1 });

    expect(page.hasMore).toBe(true);
    expect(page.continuation).not.toContain('skiptoken');
  });

  it('reports the end when the platform returns no nextLink', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm());
    const page = await adapter.retrievePage('qdb_crmlogses', { select: ['activityid'], pageSize: 10 });
    expect(page.hasMore).toBe(false);
  });

  /**
   * The platform's paging position is followed, never recomputed — but it is handed over as an
   * options string, because `Xrm.WebApi` builds the URL itself.
   *
   * This test previously asserted the absolute `nextLink` was passed through unchanged, which is
   * what the service-side client does and what the node shim tolerated. In Dynamics it produced
   * "UciError: Option Parameter should begin with \"?\"" on every list with a second page. The test
   * encoded the defect, so it had to change with the fix.
   */
  it('follows a continuation by its query string, not by rebuilding the query', async () => {
    const link = 'https://org/api/data/v9.2/qdb_crmlogses?$skiptoken=%3Ccookie%20page%3D%222%22%2F%3E';
    const seen: string[] = [];
    const adapter = new XrmCrmAdapter(fakeXrm({
      nextLink: link,
      onRetrieveMultiple: (_l, options) => { if (options) seen.push(options); },
    }));

    const first = await adapter.retrievePage('qdb_crmlogses', { select: ['activityid'], pageSize: 1 });
    await adapter.retrievePage('qdb_crmlogses', { select: ['activityid'], pageSize: 1, continuation: first.continuation! });

    expect(seen).toHaveLength(2);
    expect(seen[1]!.startsWith('?'), `the client API refuses anything else: ${seen[1]}`).toBe(true);
    // The platform's own position is carried through untouched; only the origin and path are dropped.
    expect(seen[1]).toBe('?$skiptoken=%3Ccookie%20page%3D%222%22%2F%3E');
  });

  it('never hands the client API an option string that does not begin with ?', async () => {
    const seen: string[] = [];
    const adapter = new XrmCrmAdapter(fakeXrm({
      nextLink: 'https://org/api/data/v9.2/qdb_crmlogses?$skiptoken=abc',
      onRetrieveMultiple: (_l, options) => { if (options !== undefined) seen.push(options); },
    }));

    const first = await adapter.retrievePage('qdb_crmlogses', { select: ['activityid'], pageSize: 1, includeTotalCount: true });
    await adapter.retrievePage('qdb_crmlogses', { select: ['activityid'], pageSize: 1, continuation: first.continuation! });

    expect(seen.length, 'no calls were observed').toBeGreaterThan(1);
    for (const options of seen) expect(options.startsWith('?'), options.slice(0, 60)).toBe(true);
  });

  it('refuses a continuation carried across a changed filter', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm({ nextLink: 'https://org/next' }));
    const first = await adapter.retrievePage('qdb_crmlogses', {
      select: ['activityid'], pageSize: 1, filter: 'a eq 1',
    });

    await expect(adapter.retrievePage('qdb_crmlogses', {
      select: ['activityid'], pageSize: 1, filter: 'a eq 2', continuation: first.continuation!,
    })).rejects.toThrow(/different query/);
  });

  it('carries a total when the platform supplies one', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm({ count: 1295 }));
    const page = await adapter.retrievePage('qdb_crmlogses', {
      select: ['activityid'], pageSize: 10, includeTotalCount: true,
    });
    expect(page.totalCount).toBe(1295);
  });
});

describe('single records', () => {
  it('reads a record by id', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm());
    await expect(adapter.retrieve({ entity: 'qdb_crmlogses', id: 'a-1' }, ['activityid']))
      .resolves.toMatchObject({ activityid: 'a-1' });
  });

  it('turns a 404 into null, because a missing record is an ordinary answer', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm({ retrieveRecordError: { status: 404 } }));
    await expect(adapter.retrieve({ entity: 'qdb_crmlogses', id: 'nope' }, ['activityid'])).resolves.toBeNull();
  });

  it('lets a real failure through rather than reporting an empty organisation', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm({ retrieveRecordError: { status: 500 } }));
    await expect(adapter.retrieve({ entity: 'qdb_crmlogses', id: 'x' }, ['activityid'])).rejects.toBeTruthy();
  });

  it('strips the braces from a created id', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm());
    await expect(adapter.create('qdb_crmlogses', {})).resolves.toBe('11111111-1111-1111-1111-111111111111');
  });
});

describe('operations stay server-side', () => {
  it('refuses to invoke a server operation from the browser, and says why', async () => {
    const adapter = new XrmCrmAdapter(fakeXrm());
    await expect(adapter.execute('qdb_dcp_EvaluateEligibility', {}))
      .rejects.toThrow(/keeps the decision server-side/);
  });
});

describe('no business rule lives in the adapter', () => {
  it('implements the whole CRM seam and nothing resembling a decision', () => {
    const adapter = new XrmCrmAdapter(fakeXrm());
    // The transport surface the interface requires, present and callable.
    for (const method of ['retrieve', 'retrieveByKey', 'retrieveMultiple', 'retrievePage', 'create', 'update', 'execute']) {
      expect(typeof (adapter as unknown as Record<string, unknown>)[method]).toBe('function');
    }
    // No method name suggests a decision. Asserting on intent rather than on an exact list, which
    // would only break on the next refactor without telling anyone anything useful.
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter));
    expect(names.filter(n => /decide|evaluate|calculate|score|assign|eligib/i.test(n))).toEqual([]);
  });

  it('computes no delinquency figure of any kind', () => {
    const source = XrmCrmAdapter.toString();
    for (const forbidden of ['dpd', 'arrear', 'bucket', 'eligib', 'strategy']) {
      expect(source.toLowerCase()).not.toContain(forbidden);
    }
  });
});

vi.stubGlobal('window', globalThis.window ?? {});
