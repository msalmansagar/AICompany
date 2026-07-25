import { describe, it, expect, vi } from 'vitest';
import { EdpClient, EdpDecisionError } from '../src/index.js';

function fakeFetch(status: number, json: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

function lastCall(fetchMock: typeof fetch): [string, RequestInit] {
  return (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
}

describe('EdpClient', () => {
  it('evaluate: builds the canonical envelope and posts to the gateway', async () => {
    const fetchMock = fakeFetch(200, { meta: { correlationId: 'c1', requestId: 'r1', executionId: 'e1', elapsedMs: 12 }, matched: true, outputs: { creditTier: 'Gold', discount: 15 } });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com/', apiKey: 'k', fetch: fetchMock });

    const result = await client.evaluate({ rule: { name: 'Account Credit Tier' }, input: { revenue: 1500000 }, correlationId: 'c1' });

    expect(result.matched).toBe(true);
    expect(result.outputs).toEqual({ creditTier: 'Gold', discount: 15 });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('https://gw.example.com/v1/decisions/evaluate');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect(JSON.parse(init.body as string)).toEqual({
      meta: { correlationId: 'c1' },
      rule: { name: 'Account Credit Tier' },
      input: { revenue: 1500000 },
      options: { includeTrace: false },
    });
  });

  it('test: posts to the test endpoint', async () => {
    const fetchMock = fakeFetch(200, { meta: { correlationId: 'c', requestId: 'r', executionId: null }, matched: true, outputs: {} });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    await client.test({ rule: { versionId: '00000000-0000-0000-0000-000000000001' }, input: { revenue: 100 } });
    expect(lastCall(fetchMock)[0]).toBe('https://gw.example.com/v1/decisions/test');
  });

  it('validate: posts the rule ref to the validate endpoint', async () => {
    const fetchMock = fakeFetch(200, { meta: { correlationId: 'c', requestId: 'r' }, valid: true, diagnostics: [] });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    const res = await client.validate({ rule: { name: 'Account Credit Tier' } });
    expect(res.valid).toBe(true);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('https://gw.example.com/v1/rules/validate');
    expect(JSON.parse(init.body as string)).toEqual({ rule: { name: 'Account Credit Tier' } });
  });

  it('evaluateRuleSet: posts the set id + input', async () => {
    const fetchMock = fakeFetch(200, { meta: { correlationId: 'c', requestId: 'r' }, result: { policy: 'FirstMatch', matchedCount: 1 } });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    const res = await client.evaluateRuleSet({ ruleSetId: '00000000-0000-0000-0000-000000000009', input: { revenue: 5 } });
    expect((res.result as { matchedCount: number }).matchedCount).toBe(1);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('https://gw.example.com/v1/rule-sets/evaluate');
    expect(JSON.parse(init.body as string)).toEqual({ ruleSetId: '00000000-0000-0000-0000-000000000009', input: { revenue: 5 } });
  });

  it('getSchema: posts the rule ref to the schema endpoint', async () => {
    const fetchMock = fakeFetch(200, { meta: {}, inputs: [{ name: 'revenue' }], outputs: [{ name: 'creditTier' }] });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    const res = await client.getSchema({ rule: { name: 'Account Credit Tier' } });
    expect(res.inputs).toEqual([{ name: 'revenue' }]);
    expect(lastCall(fetchMock)[0]).toBe('https://gw.example.com/v1/rules/schema');
  });

  it('getHistory: posts the rule ref to the history endpoint', async () => {
    const fetchMock = fakeFetch(200, { meta: {}, result: [{ version: 1 }] });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    await client.getHistory({ rule: { id: '00000000-0000-0000-0000-000000000001' } });
    expect(lastCall(fetchMock)[0]).toBe('https://gw.example.com/v1/rules/history');
  });

  it('explain: posts the execution-log id', async () => {
    const fetchMock = fakeFetch(200, { meta: {}, result: { narration: 'x' } });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    await client.explain({ executionLogId: '00000000-0000-0000-0000-000000000009' });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('https://gw.example.com/v1/decisions/explain');
    expect(JSON.parse(init.body as string)).toEqual({ executionLogId: '00000000-0000-0000-0000-000000000009' });
  });

  it('omits the api key header when none is configured', async () => {
    const fetchMock = fakeFetch(200, { meta: {}, matched: false, outputs: {} });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', fetch: fetchMock });
    await client.evaluate({ rule: { versionId: '00000000-0000-0000-0000-000000000001' } });
    expect((lastCall(fetchMock)[1].headers as Record<string, string>)['x-api-key']).toBeUndefined();
  });

  it('throws a typed error on a non-2xx response', async () => {
    const fetchMock = fakeFetch(404, { error: { code: 'rule_not_found', message: 'no published version' } });
    const client = new EdpClient({ baseUrl: 'https://gw.example.com', apiKey: 'k', fetch: fetchMock });
    await expect(client.evaluate({ rule: { name: 'Missing' } })).rejects.toMatchObject({ name: 'EdpDecisionError', code: 'rule_not_found', status: 404 });
    await expect(client.evaluate({ rule: { name: 'Missing' } })).rejects.toBeInstanceOf(EdpDecisionError);
  });
});
