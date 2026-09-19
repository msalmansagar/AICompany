/**
 * The one place in the workspace that speaks HTTP.
 *
 * `Xrm.WebApi.updateRecord` takes an entity name, an id and a data object — there is no parameter
 * for a header, so `If-Match` cannot be sent through it and Dataverse's optimistic concurrency is
 * unreachable (ADR-DCP-18). A concurrency-controlled write therefore goes to the Web API directly.
 *
 * It is confined to this file on purpose. React never composes a URL, never sees an ETag and never
 * calls `fetch`; a view calls the adapter and handles two outcomes — it saved, or the record moved.
 * The moment transport details leak into components, the dual-platform guarantee goes with them.
 *
 * The request is same-origin: a web resource is served from the organisation's own host, so the
 * user's session authenticates it and CRM's security applies exactly as it does to `Xrm.WebApi`.
 * The identity is the same; only the mechanism for attaching a header differs.
 */

/** What a transport must do. Small on purpose — it is the whole platform-specific surface. */
export interface WriteTransport {
  /** PATCH with an optional `If-Match`. Returns the platform's status and the new version. */
  patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse>;
  /**
   * PATCH with `If-None-Match: *` — create only, refusing if the id already exists.
   *
   * Separate from `patch` because the two send opposite preconditions and mean opposite things, and
   * because both fail with **412**. Keeping them distinct is what lets the adapter tell a duplicate
   * submission from a stale write *by which request it made*, rather than by parsing a message.
   */
  createOnly(url: string, body: unknown): Promise<WriteResponse>;
  /** GET returning the record and its ETag, for reads that intend to write. */
  get(url: string): Promise<WriteResponse>;
}

export interface WriteResponse {
  status: number;
  /** The new `ETag`, when the platform issued one. */
  etag?: string | undefined;
  body?: unknown;
  /** The platform's own message, for a failure worth showing or logging. */
  message?: string | undefined;
}

/** Status the platform returns when `If-Match` did not match the stored version. */
export const PRECONDITION_FAILED = 412;

/**
 * The `Prefer` header every write sends, as a comma-separated list.
 *
 * `return=representation` is not a nicety. A plain Dataverse PATCH answers `204 No Content` with
 * **no ETag**, so the caller is left holding the version it read — already stale — and its next
 * write fails for a reason that looks like a concurrency conflict but is really a missing token.
 * Asking for the representation makes the response a `200` carrying the updated record *and* its new
 * version, in one round trip rather than a write followed by a re-read.
 *
 * The write smoke found this on its first run, before any form existed to inherit it.
 *
 * `odata.include-annotations` rides along so the returned record has the same shape a read gives —
 * formatted values and lookup targets — and nothing downstream has to special-case a write. The two
 * are **joined, never substituted**: `Prefer` is a list, and replacing it is the Phase 4 defect that
 * silently dropped annotations from every paged read.
 */
export const WRITE_PREFER = 'return=representation,odata.include-annotations="*"';

/** The `Prefer` a read sends — annotations only; there is no representation to ask for. */
export const READ_PREFER = 'odata.include-annotations="*"';

/**
 * The browser implementation: a same-origin request carrying the session.
 *
 * `credentials: 'same-origin'` is explicit rather than relied upon. The default would usually do the
 * right thing, but a write that silently lost its credentials would fail as an authorisation error
 * and look like a permissions problem, which is an expensive thing to debug.
 */
export class SameOriginWriteTransport implements WriteTransport {
  constructor(private readonly apiBase: string) {}

  async patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse> {
    return this.send('PATCH', url, body, ifMatch);
  }

  async createOnly(url: string, body: unknown): Promise<WriteResponse> {
    // `*` here means "no version at all", i.e. the record must not exist — the exact opposite of
    // `If-Match: *`, which means "any version, so long as it does exist" (KI-68).
    return this.send('PATCH', url, body, undefined, '*');
  }

  async get(url: string): Promise<WriteResponse> {
    return this.send('GET', url);
  }

  private async send(
    method: string, url: string, body?: unknown, ifMatch?: string, ifNoneMatch?: string,
  ): Promise<WriteResponse> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: method === 'GET' ? READ_PREFER : WRITE_PREFER,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
    if (ifMatch !== undefined) headers['If-Match'] = ifMatch;
    if (ifNoneMatch !== undefined) headers['If-None-Match'] = ifNoneMatch;

    const response = await fetch(`${this.apiBase}${url}`, {
      method,
      credentials: 'same-origin',
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    return readResponse(response);
  }
}

/**
 * Turns a platform response into the shape the adapter expects.
 *
 * Shared rather than duplicated, because the smoke harness runs the *same* parsing against the real
 * organisation — a harness that read the response differently from production would prove the
 * harness works.
 */
export async function readResponse(response: Response): Promise<WriteResponse> {
  const etag = response.headers.get('ETag') ?? undefined;
  if (response.status === 204) return { status: 204, etag };

  const text = await response.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { parsed = undefined; }

  const message = (parsed as { error?: { message?: string } } | undefined)?.error?.message
    ?? (text ? text.slice(0, 400) : undefined);

  return {
    status: response.status,
    // A GET carries its version in the body as well as the header, and the body is the one a caller
    // keeps — the two were proved to agree by the Phase 6 concurrency spike.
    etag: etag ?? (parsed as { '@odata.etag'?: string } | undefined)?.['@odata.etag'],
    body: parsed,
    ...(response.ok ? {} : { message }),
  };
}
