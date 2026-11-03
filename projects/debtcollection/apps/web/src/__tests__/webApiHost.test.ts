import { describe, expect, it } from 'vitest';
import { WebApiHostError, createWebApiHost, organisationUrlOf } from '../platform/webApiHost.js';
import { readCrmContext } from '../platform/crmContext.js';

/**
 * The workspace at its raw web resource URL: no client API, the organisation's Web API in its place.
 * The host must ask — never assume — who is signed in and which version answers, and must speak to
 * the rest of the workspace exactly as `Xrm.WebApi` does, failures included.
 */

const ORIGIN = 'https://org5869857f.crm4.dynamics.com';
const USER_ID = '61086fe4-0000-0000-0000-000000000001';

interface Sent { url: string; method: string; headers: Record<string, string>; body?: string }

function organisation(answers: Partial<Record<string, (sent: Sent) => Response>> = {}) {
  const sent: Sent[] = [];
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const request: Sent = {
      url, method: init.method ?? 'GET', headers: Object.fromEntries(Object.entries(init.headers ?? {})),
      ...(typeof init.body === 'string' ? { body: init.body } : {}),
    };
    sent.push(request);
    const path = url.slice(ORIGIN.length).split('?')[0]!;
    const custom = Object.entries(answers).find(([prefix]) => path.startsWith(prefix))?.[1];
    if (custom) return custom(request);
    if (path === '/api/data/v9.0/RetrieveVersion()') return json({ Version: '9.2.24091.00203' });
    if (path === '/api/data/v9.2/WhoAmI') return json({ UserId: USER_ID, OrganizationId: 'org-1' });
    if (path.startsWith(`/api/data/v9.2/systemusers(${USER_ID})`)) return json({ fullname: 'Tester One' });
    if (path.startsWith('/api/data/v9.2/usersettingscollection(')) return json({ uilanguageid: 1025 });
    if (path.startsWith('/api/data/v9.2/qdb_collectioncases')) return json({ value: [{ qdb_collectioncaseid: 'c-1' }], '@odata.nextLink': `${ORIGIN}/api/data/v9.2/qdb_collectioncases?$skiptoken=x` });
    return json({ error: { code: '0x80040217', message: 'Does Not Exist' } }, 404);
  };
  return { sent, fetchImpl };
}

describe('which organisation the page belongs to', () => {
  const at = (origin: string, pathname: string) => organisationUrlOf({ origin, pathname });

  it('uses the origin online, where the organisation is the host', () => {
    expect(at('https://org5869857f.crm4.dynamics.com', '/WebResources/qdb_dcp_workspace.html'))
      .toBe('https://org5869857f.crm4.dynamics.com');
  });

  it('keeps the organisation path on-premises, where the bare origin answers 500', () => {
    expect(at('https://mcdynccatdev01', '/HousingLoan/webresources/qdb_dcp_workspace.html'))
      .toBe('https://mcdynccatdev01/HousingLoan');
  });

  it('drops the cache token segment, online and on-premises', () => {
    expect(at('https://org5869857f.crm4.dynamics.com', '/%7b639123%7d/webresources/qdb_dcp_workspace.html'))
      .toBe('https://org5869857f.crm4.dynamics.com');
    expect(at('https://mcdynccatdev01', '/HousingLoan/%7b639123%7d/WebResources/qdb_dcp_workspace.html'))
      .toBe('https://mcdynccatdev01/HousingLoan');
  });

  it('falls back to the origin when the page is not a web resource', () => {
    expect(at('https://mcdynccatdev01', '/HousingLoan/main.aspx')).toBe('https://mcdynccatdev01');
  });
});

describe('the context', () => {
  it('reads the version, the signed-in user and their name from the organisation, then composes the API base from them', async () => {
    const org = organisation();

    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });
    const context = readCrmContext(host);

    expect([context.apiBase, context.userId, context.userName, context.languageId, org.sent[0]!.url])
      .toEqual([`${ORIGIN}/api/data/v9.2`, USER_ID, 'Tester One', 1025, `${ORIGIN}/api/data/v9.0/RetrieveVersion()`]);
  });

  it('refuses plainly when the browser is not signed in to the organisation', async () => {
    const org = organisation({ '/api/data/v9.0/RetrieveVersion()': () => new Response('', { status: 401 }) });

    await expect(createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl }))
      .rejects.toMatchObject({ status: 401, message: expect.stringContaining('not signed in') });
  });
});

describe('reading', () => {
  it('lists records through the entity set with the annotations the client API would supply, and hands back the next link', async () => {
    const org = organisation();
    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });

    const page = await host.WebApi.retrieveMultipleRecords('qdb_collectioncase', '?$select=qdb_casenumber', 50);
    const request = org.sent.at(-1)!;

    expect([request.url, request.headers['Prefer'], page.entities.length, Boolean(page.nextLink)])
      .toEqual([`${ORIGIN}/api/data/v9.2/qdb_collectioncases?$select=qdb_casenumber`, 'odata.include-annotations="*",odata.maxpagesize=50', 1, true]);
  });

  it('asks the organisation for an entity set it does not know, once', async () => {
    const org = organisation({
      "/api/data/v9.2/EntityDefinitions(LogicalName='qdb_widget')": () => new Response(JSON.stringify({ EntitySetName: 'qdb_widgetz' }), { status: 200 }),
      '/api/data/v9.2/qdb_widgetz': () => new Response(JSON.stringify({ value: [] }), { status: 200 }),
    });
    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });

    await host.WebApi.retrieveMultipleRecords('qdb_widget');
    await host.WebApi.retrieveMultipleRecords('qdb_widget');

    expect(org.sent.filter(request => request.url.includes('EntityDefinitions')).length).toBe(1);
  });

  it('rejects as the client API rejects — a plain object with the platform code as a number', async () => {
    const org = organisation();
    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });

    await expect(host.WebApi.retrieveRecord('contact', '{00000000-0000-0000-0000-000000000009}'))
      .rejects.toEqual({ status: 404, errorCode: 0x80040217, message: 'Does Not Exist' });
  });
});

describe('writing', () => {
  it('reads a created record\'s id from OData-EntityId, the only place a create returns it', async () => {
    const org = organisation({
      '/api/data/v9.2/qdb_collectionactivities': () => new Response(null, { status: 204, headers: { 'OData-EntityId': `${ORIGIN}/api/data/v9.2/qdb_collectionactivities(aaaaaaaa-1111-1111-1111-111111111111)` } }),
    });
    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });

    const created = await host.WebApi.createRecord('qdb_collectionactivity', { subject: 'Call' });
    const request = org.sent.at(-1)!;

    expect([created.id, request.method, request.body]).toEqual(['aaaaaaaa-1111-1111-1111-111111111111', 'POST', '{"subject":"Call"}']);
  });

  it('patches an update to the record by its bare id', async () => {
    const org = organisation({ '/api/data/v9.2/contacts(': () => new Response(null, { status: 204 }) });
    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });

    await host.WebApi.updateRecord('contact', '{cust-1}', { firstname: 'A' });

    expect([org.sent.at(-1)!.method, org.sent.at(-1)!.url]).toEqual(['PATCH', `${ORIGIN}/api/data/v9.2/contacts(cust-1)`]);
  });
});

describe('executing', () => {
  it('posts an unbound action with its parameters and returns the platform\'s response as it is', async () => {
    const org = organisation({ '/api/data/v9.2/qdb_RunReport': () => new Response(JSON.stringify({ rowCount: 2 }), { status: 200 }) });
    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });

    const response = await host.WebApi.execute!({ reportId: 'r-1', getMetadata: () => ({ boundParameter: null, operationType: 0, operationName: 'qdb_RunReport', parameterTypes: {} }) });
    const request = org.sent.at(-1)!;

    expect([request.method, request.body, response.status, await response.json()]).toEqual(['POST', '{"reportId":"r-1"}', 200, { rowCount: 2 }]);
  });

  it('hands a refusal back as a response for the caller to read, not as a thrown object', async () => {
    const org = organisation({ '/api/data/v9.2/qdb_RunReport': () => new Response(JSON.stringify({ error: { message: 'No such report' } }), { status: 400 }) });
    const host = await createWebApiHost({ origin: ORIGIN, fetchImpl: org.fetchImpl });

    const response = await host.WebApi.execute!({ getMetadata: () => ({ boundParameter: null, operationType: 0, operationName: 'qdb_RunReport', parameterTypes: {} }) });

    expect([response.ok, response.status]).toEqual([false, 400]);
  });

  it('is a WebApiHostError, not a rejection object, when the organisation cannot be reached at all', async () => {
    const fetchImpl: typeof fetch = async () => { throw new TypeError('Failed to fetch'); };

    await expect(createWebApiHost({ origin: ORIGIN, fetchImpl })).rejects.toBeInstanceOf(WebApiHostError);
  });
});
