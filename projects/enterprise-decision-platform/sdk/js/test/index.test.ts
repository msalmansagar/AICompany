import { describe, it, expect, vi } from 'vitest';
import { EdpClient, EdpDecisionError } from '../src/index.js';

function fakeFetch(status: number, json: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('EdpClient', () => {
  it('builds the canonical envelope and posts to the gateway', async () => {
    const fetchMock = fakeFetch(200, {
      meta: { correlationId: 'c1', requestId: 'r1', executionId: 'e1', elapsedMs: 12 },
      matched: true,
      outputs: { creditTier: 'Gold', discount: 15 },
    });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com/', apiKey: 'k', fetch: fetchMock });

    const result = await client.evaluate({ rule: { name: 'Account Credit Tier' }, input: { revenue: 1500000 }, correlationId: 'c1' });

    expect(result.matched).toBe(true);
    expect(result.outputs).toEqual({ creditTier: 'Gold', discount: 15 });

    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://gw.example.com/v1/decisions:evaluate');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect(JSON.parse(init.body as string)).toEqual({
      meta: { correlationId: 'c1' },
      rule: { name: 'Account Credit Tier' },
      input: { revenue: 1500000 },
      options: { includeTrace: false },
    });
  });

  it('omits the api key header when none is configured', async () => {
    const fetchMock = fakeFetch(200, { meta: {}, matched: false, outputs: {} });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', fetch: fetchMock });
    await client.evaluate({ rule: { versionId: '00000000-0000-0000-0000-000000000001' } });
    const [, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect((init.headers as Record<string, string>)['x-api-key']).toBeUndefined();
  });

  it('throws a typed error on a non-2xx response', async () => {
    const fetchMock = fakeFetch(404, { error: { code: 'rule_not_found', message: 'no published version' } });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    await expect(client.evaluate({ rule: { name: 'Missing' } })).rejects.toMatchObject({
      name: 'EdpDecisionError',
      code: 'rule_not_found',
      status: 404,
    });
    await expect(client.evaluate({ rule: { name: 'Missing' } })).rejects.toBeInstanceOf(EdpDecisionError);
  });
});
