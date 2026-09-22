import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ForwardingWriteTransport, PRECONDITION_FAILED, READ_PREFER, SameOriginWriteTransport, WRITE_PREFER,
  type WriteResponse, type WriteTransport,
} from '../platform/writeTransport.js';

/**
 * One contract, applied to every transport that exists.
 *
 * A transport is the only thing in the workspace that speaks HTTP, so a transport that is subtly
 * wrong is a defect no other test can see. Two have already happened: the production adapter was
 * assembled with **no** transport at all and every save failed (KI-75), and the live concurrency
 * smoke died on `transport.post is not a function` because its wrapper predated the method.
 *
 * Both share a shape — an implementation that satisfied the *compiler* for its own file while being
 * incomplete where it was actually used. So the checks below are deliberately of two kinds:
 *
 *   • **the shape contract**, run against every implementation, including test doubles and wrappers,
 *     which is what catches a missing operation;
 *   • **the wire contract**, run against the implementations that really speak HTTP, which is what
 *     pins the headers the platform's behaviour depends on.
 *
 * A double that only satisfies the first is still a double — but it can no longer be missing a
 * method that production calls.
 */

// ── The shape contract ───────────────────────────────────────────────────────

const OPERATIONS = ['patch', 'createOnly', 'post', 'get'] as const;

/** Every operation the interface declares, callable on the instance that is really used. */
function assertShapeContract(name: string, build: () => WriteTransport): void {
  it(`${name}: implements every operation`, () => {
    const transport = build();
    for (const operation of OPERATIONS) {
      expect(typeof transport[operation], `${name}.${operation}`).toBe('function');
    }
  });
}

/** A minimal store, so a wrapper has something real to forward to. */
class StubTransport implements WriteTransport {
  readonly calls: string[] = [];
  async patch(url: string): Promise<WriteResponse> { this.calls.push(`patch ${url}`); return { status: 200 }; }
  async createOnly(url: string): Promise<WriteResponse> { this.calls.push(`createOnly ${url}`); return { status: 201 }; }
  async post(url: string): Promise<WriteResponse> { this.calls.push(`post ${url}`); return { status: 204 }; }
  async get(url: string): Promise<WriteResponse> { this.calls.push(`get ${url}`); return { status: 200 }; }
}

describe('every transport implements the whole interface', () => {
  assertShapeContract('SameOriginWriteTransport', () => new SameOriginWriteTransport('/api/data/v9.2'));
  assertShapeContract('ForwardingWriteTransport', () => new ForwardingWriteTransport(new StubTransport()));
  assertShapeContract('a wrapper that overrides one operation', () => {
    class Counting extends ForwardingWriteTransport {
      attempts = 0;
      override createOnly(url: string, body: unknown) { this.attempts++; return super.createOnly(url, body); }
    }
    return new Counting(new StubTransport());
  });
});

describe('a wrapper forwards every operation it did not override', () => {
  it('reaches the inner transport for all four', async () => {
    const inner = new StubTransport();
    const wrapper = new ForwardingWriteTransport(inner);

    await wrapper.patch('/a', {});
    await wrapper.createOnly('/b', {});
    await wrapper.post('/c', {});
    await wrapper.get('/d');

    expect(inner.calls).toEqual(['patch /a', 'createOnly /b', 'post /c', 'get /d']);
  });

  it('still forwards the operations around the one it overrides', async () => {
    const inner = new StubTransport();
    class Counting extends ForwardingWriteTransport {
      attempts = 0;
      override createOnly(url: string, body: unknown) { this.attempts++; return super.createOnly(url, body); }
    }
    const wrapper = new Counting(inner);

    await wrapper.createOnly('/b', {});
    await wrapper.post('/c', {});

    expect(wrapper.attempts, 'the override ran').toBe(1);
    expect(inner.calls, 'and nothing was swallowed').toEqual(['createOnly /b', 'post /c']);
  });
});

// ── The wire contract ────────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function captureFetch(status = 204): { requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    requests.push({
      url: String(url),
      method: String(init.method ?? 'GET'),
      headers: { ...(init.headers as Record<string, string>) },
    });
    return new Response(null, { status, headers: { ETag: 'W/"7"' } });
  });
  return { requests };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the wire contract the platform actually enforces', () => {
  const build = () => new SameOriginWriteTransport('/api/data/v9.2');

  it('a versioned update sends If-Match and asks for the new representation', async () => {
    const { requests } = captureFetch(200);
    await build().patch('/qdb_collectionactivities(1)', { subject: 'x' }, 'W/"3"');

    const [request] = requests;
    expect(request?.method).toBe('PATCH');
    expect(request?.headers['If-Match']).toBe('W/"3"');
    // Without this a PATCH answers 204 with no ETag, and the caller is left holding a stale
    // version whose next write fails looking like a concurrency conflict (KI-70).
    expect(request?.headers['Prefer']).toBe(WRITE_PREFER);
  });

  it('Prefer stays a list — annotations are joined to the representation, never replaced', () => {
    expect(WRITE_PREFER).toContain('return=representation');
    expect(WRITE_PREFER).toContain('odata.include-annotations');
    expect(WRITE_PREFER.split(',').length, 'two directives, one header').toBe(2);
  });

  it('an idempotent create sends If-None-Match: * and no If-Match', async () => {
    const { requests } = captureFetch(201);
    await build().createOnly('/faxes(1)', { subject: 'x' });

    const [request] = requests;
    // `If-None-Match: *` is "must not exist"; `If-Match: *` is "must exist, any version" (KI-68).
    // They are opposites, both answer 412, and sending the wrong one is undetectable afterwards.
    expect(request?.method).toBe('PATCH');
    expect(request?.headers['If-None-Match']).toBe('*');
    expect(request?.headers['If-Match']).toBeUndefined();
  });

  it('appending a party does NOT ask for a representation', async () => {
    const { requests } = captureFetch(204);
    await build().post('/faxes(1)/fax_activity_parties', { participationtypemask: 2 });

    const [request] = requests;
    expect(request?.method).toBe('POST');
    // The organisation answers 500 'Unable to cast EntityMetadata to XrmMetadataEntityMetadata'
    // when a collection append is asked to return one. Proved, not assumed (KI-85).
    expect(request?.headers['Prefer']).toBe(READ_PREFER);
    expect(request?.headers['Prefer']).not.toContain('return=representation');
  });

  it('a read asks for annotations and sends no precondition', async () => {
    const { requests } = captureFetch(200);
    await build().get('/qdb_collectionactivities(1)?$select=subject');

    const [request] = requests;
    expect(request?.method).toBe('GET');
    expect(request?.headers['Prefer']).toBe(READ_PREFER);
    expect(request?.headers['If-Match']).toBeUndefined();
  });

  it('carries the session explicitly rather than relying on the default', async () => {
    const credentials: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit = {}) => {
      credentials.push(init.credentials);
      return new Response(null, { status: 204 });
    });
    await build().patch('/x(1)', {});

    // A write that silently lost its credentials fails as an authorisation error and reads as a
    // permissions problem — an expensive thing to debug for a one-word default.
    expect(credentials).toEqual(['same-origin']);
  });

  it('reports a refused precondition as 412 rather than throwing', async () => {
    captureFetch(PRECONDITION_FAILED);
    const response = await build().patch('/x(1)', {}, 'W/"1"');

    // The adapter turns this into a concurrency error or an idempotent no-op depending on which
    // request it made. A thrown exception here would lose that distinction.
    expect(response.status).toBe(PRECONDITION_FAILED);
  });
});
