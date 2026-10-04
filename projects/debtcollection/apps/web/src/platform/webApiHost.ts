import type { XrmGlobalContext, XrmLike, XrmWebApi } from './crmContext.js';
import { DEFAULT_LOGICAL_NAMES } from './XrmCrmAdapter.js';
import { describeFailure } from './errors.js';

/**
 * The workspace without a model-driven app around it.
 *
 * Opened at its raw `/WebResources/` URL — or from any page on the organisation's host that carries
 * no `Xrm` — the workspace has no client API to ask who is signed in, which version the platform
 * runs, or to read a record through. What it does have is the organisation's own Web API on the same
 * origin, authenticated by the browser session exactly as the client API is (user instruction,
 * 2026-09-27: the workspace must work without an app).
 *
 * This module speaks that Web API and presents it in the one shape the rest of the workspace
 * already consumes, `XrmLike`, so nothing above it knows which host it is running in. The identity is
 * the signed-in user, the security is CRM's, and the API version is **read** from the organisation —
 * never assumed (KI-02). Nothing here caches data, decides anything, or holds a credential.
 */

export class WebApiHostError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'WebApiHostError';
  }
}

export interface WebApiHostOptions {
  /** The organisation origin, `https://org.crm4.dynamics.com`. Defaults to where the page came from. */
  origin?: string;
  fetchImpl?: typeof fetch;
}

const HEADERS: Readonly<Record<string, string>> = {
  Accept: 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  'Content-Type': 'application/json; charset=utf-8',
};

/** Every read asks for the annotations the client API supplies by default — formatted values and lookup names. */
const ANNOTATIONS = 'odata.include-annotations="*"';

/** The client API's rejection shape, which the adapter and `describeFailure` already understand. */
interface WebApiRejection {
  status: number;
  errorCode?: number;
  message: string;
}

/**
 * The organisation's base URL for a page served as a web resource. Online it is the origin
 * (`https://org.crm4.dynamics.com/WebResources/…`); on-premises the organisation is the first path
 * segment (`https://server/HousingLoan/WebResources/…`), and calling the Web API at the bare origin
 * answers 500 (HL CRM test, 2026-10-04). A cache token segment (`/%7b…%7d/`) is not part of it.
 */
export function organisationUrlOf(location: Pick<Location, 'origin' | 'pathname'>): string {
  const segments = location.pathname.split('/').filter(Boolean);
  const webResources = segments.findIndex(segment => segment.toLowerCase() === 'webresources');
  if (webResources < 0) return location.origin;
  const isCacheToken = (segment: string) => /^(%7b|\{).*(%7d|\})$/i.test(segment);
  const organisation = segments.slice(0, webResources).filter(segment => !isCacheToken(segment));
  return organisation.length > 0 ? `${location.origin}/${organisation.join('/')}` : location.origin;
}

/**
 * Builds the host. It asks the organisation who is signed in and which version it runs, and refuses
 * with a plain reason when the page is not on an organisation host or the session is not signed in.
 */
export async function createWebApiHost(options: WebApiHostOptions = {}): Promise<XrmLike> {
  const origin = (options.origin ?? organisationUrlOf(window.location)).replace(/\/+$/, '');
  // Called as a method of the client below, so the browser's fetch must keep the window as its receiver.
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const client = new WebApiClient(origin, fetchImpl);
  const context = await client.readContext();
  return {
    Utility: { getGlobalContext: () => context },
    WebApi: new FetchWebApi(client),
  };
}

/** The HTTP surface: composes URLs, sends the same-origin request, and shapes a failure. */
class WebApiClient {
  private apiBase: string | undefined;
  private readonly entitySets = new Map<string, string>(Object.entries(DEFAULT_LOGICAL_NAMES).map(([set, logical]) => [logical, set]));

  constructor(private readonly origin: string, private readonly fetchImpl: typeof fetch) {}

  /** Who is signed in and which version answers — read from the organisation, never assumed. */
  async readContext(): Promise<XrmGlobalContext> {
    const version = await this.readVersion();
    this.apiBase = `${this.origin}/api/data/v${version}`;
    const who = await this.getJson(`${this.apiBase}/WhoAmI`) as { UserId?: string; OrganizationId?: string };
    if (typeof who.UserId !== 'string') throw new WebApiHostError('The organisation did not say who is signed in.');
    const user = await this.getJson(`${this.apiBase}/systemusers(${who.UserId})?$select=fullname`) as { fullname?: string };
    const settings = await this.getJson(`${this.apiBase}/usersettingscollection(${who.UserId})?$select=uilanguageid`).catch(() => ({})) as { uilanguageid?: number };
    return {
      getClientUrl: () => this.origin,
      getVersion: () => version,
      userSettings: {
        userId: who.UserId,
        userName: typeof user.fullname === 'string' ? user.fullname : who.UserId,
        languageId: typeof settings.uilanguageid === 'number' ? settings.uilanguageid : 1033,
        securityRoles: [],
      },
      ...(typeof who.OrganizationId === 'string' ? { organizationSettings: { organizationId: who.OrganizationId } } : {}),
    };
  }

  /**
   * The platform version, from the one endpoint that exists on every version. `RetrieveVersion`
   * answers under `v9.0` on-premises and on Dataverse alike; the answer then names the path to use.
   */
  private async readVersion(): Promise<string> {
    const answer = await this.getJson(`${this.origin}/api/data/v9.0/RetrieveVersion()`) as { Version?: string };
    const match = typeof answer.Version === 'string' ? /^(\d+)\.(\d+)/.exec(answer.Version) : null;
    if (!match) throw new WebApiHostError('The organisation did not report a platform version of the form 9.x.');
    return `${match[1]}.${match[2]}`;
  }

  get base(): string {
    if (!this.apiBase) throw new WebApiHostError('The host has not read the organisation context yet.');
    return this.apiBase;
  }

  /** The entity set behind a logical name — from the workspace's own table, or the organisation's metadata once. */
  async entitySetOf(logicalName: string): Promise<string> {
    const known = this.entitySets.get(logicalName);
    if (known) return known;
    const definition = await this.getJson(`${this.base}/EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`) as { EntitySetName?: string };
    if (typeof definition.EntitySetName !== 'string') throw new WebApiHostError(`The organisation has no table named ${logicalName}.`);
    this.entitySets.set(logicalName, definition.EntitySetName);
    return definition.EntitySetName;
  }

  async getJson(url: string, prefer: string = ANNOTATIONS): Promise<unknown> {
    const response = await this.send(url, { method: 'GET', headers: { ...HEADERS, Prefer: prefer } });
    return response.status === 204 ? {} : response.json();
  }

  async send(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, credentials: 'same-origin' });
    } catch (failure: unknown) {
      throw new WebApiHostError(`The organisation could not be reached: ${describeFailure(failure)}`);
    }
    if (response.ok) return response;
    throw await this.toRejection(response);
  }

  /** The client API rejects with `{ errorCode, message }`; callers already read that shape, so it is kept. */
  private async toRejection(response: Response): Promise<WebApiRejection> {
    const text = await response.text().catch(() => '');
    let code: number | undefined;
    let message = response.status === 401
      ? 'The organisation refused the request: you are not signed in to it in this browser.'
      : `The organisation answered ${response.status}.`;
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
      if (typeof parsed.error?.message === 'string') message = parsed.error.message;
      if (typeof parsed.error?.code === 'string') code = Number.parseInt(parsed.error.code, 16);
    } catch { /* not JSON: the status line is the message */ }
    return { status: response.status, ...(code !== undefined && !Number.isNaN(code) ? { errorCode: code } : {}), message };
  }
}

/** `Xrm.WebApi`, spoken over HTTP. Each method composes the URL the client API would have. */
class FetchWebApi implements XrmWebApi {
  constructor(private readonly client: WebApiClient) {}

  async retrieveRecord(logicalName: string, id: string, options = ''): Promise<Record<string, unknown>> {
    const set = await this.client.entitySetOf(logicalName);
    return await this.client.getJson(`${this.client.base}/${set}(${bareId(id)})${options}`) as Record<string, unknown>;
  }

  async retrieveMultipleRecords(logicalName: string, options = '', maxPageSize?: number) {
    const set = await this.client.entitySetOf(logicalName);
    const prefer = maxPageSize !== undefined ? `${ANNOTATIONS},odata.maxpagesize=${maxPageSize}` : ANNOTATIONS;
    const answer = await this.client.getJson(`${this.client.base}/${set}${options}`, prefer) as { value?: Record<string, unknown>[]; '@odata.nextLink'?: string };
    return { entities: answer.value ?? [], ...(answer['@odata.nextLink'] ? { nextLink: answer['@odata.nextLink'] } : {}) };
  }

  /**
   * A create answers `204 No Content` with the new id **only** in `OData-EntityId` — reading it from a
   * body that is never sent silently yields `undefined` (the EDP designer duplicated rules that way).
   */
  async createRecord(logicalName: string, data: Record<string, unknown>): Promise<{ id: string }> {
    const set = await this.client.entitySetOf(logicalName);
    const response = await this.client.send(`${this.client.base}/${set}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(data) });
    const location = response.headers.get('OData-EntityId') ?? '';
    const id = /\(([0-9a-f-]{36})\)/i.exec(location)?.[1];
    if (!id) throw new WebApiHostError('The organisation created the record but did not return its id.');
    return { id };
  }

  async updateRecord(logicalName: string, id: string, data: Record<string, unknown>): Promise<{ id: string }> {
    const set = await this.client.entitySetOf(logicalName);
    await this.client.send(`${this.client.base}/${set}(${bareId(id)})`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(data) });
    return { id: bareId(id) };
  }

  /**
   * An unbound Custom API or action, as `Xrm.WebApi.execute` takes it: a request object whose
   * `getMetadata()` names the operation and whose other properties are its parameters. Returned as
   * the raw `Response`, which is what the caller reads; a refusal is whatever status the platform sent.
   */
  async execute(request: unknown): Promise<Response> {
    const { getMetadata, ...parameters } = request as { getMetadata: () => { operationName: string; operationType: number } } & Record<string, unknown>;
    const metadata = getMetadata();
    const url = `${this.client.base}/${metadata.operationName}`;
    const init: RequestInit = metadata.operationType === 1
      ? { method: 'GET', headers: HEADERS }
      : { method: 'POST', headers: HEADERS, body: JSON.stringify(parameters) };
    try {
      return await this.client.send(url, init);
    } catch (failure: unknown) {
      // The reporting service reads the status and body itself, so a platform refusal travels as a Response.
      if (isRejection(failure)) return new Response(JSON.stringify({ error: { message: failure.message } }), { status: failure.status, headers: { 'Content-Type': 'application/json' } });
      throw failure;
    }
  }
}

function isRejection(value: unknown): value is WebApiRejection {
  return typeof value === 'object' && value !== null && typeof (value as WebApiRejection).status === 'number' && typeof (value as WebApiRejection).message === 'string';
}

function bareId(id: string): string {
  return id.replace(/[{}]/g, '');
}
