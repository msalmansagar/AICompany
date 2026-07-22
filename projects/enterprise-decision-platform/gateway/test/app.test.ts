import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import type { GatewayConfig } from '../src/config.js';
import type { DecisionRuntime } from '../src/envelope.js';
import { RuntimeError } from '../src/dataverseRuntime.js';

const baseConfig: GatewayConfig = {
  port: 0,
  apiKeys: ['secret-key'],
  dataverse: { url: 'https://example.crm.dynamics.com', tenantId: 't', clientId: 'c', clientSecret: 's' },
};

class FakeRuntime implements DecisionRuntime {
  resolveCalls: Array<{ id?: string; name?: string }> = [];
  evaluateCalls: Array<{ versionId: string; input: Record<string, unknown>; includeTrace: boolean }> = [];

  constructor(private readonly opts: { resolvedVersionId?: string; throwOnResolve?: boolean } = {}) {}

  async resolvePublishedVersion(ref: { id?: string; name?: string }): Promise<{ versionId: string }> {
    this.resolveCalls.push(ref);
    if (this.opts.throwOnResolve) throw new RuntimeError('rule_not_found', 'no published version');
    return { versionId: this.opts.resolvedVersionId ?? 'resolved-version' };
  }

  async evaluate(args: { versionId: string; input: Record<string, unknown>; includeTrace: boolean }) {
    this.evaluateCalls.push(args);
    return {
      matched: true,
      outputs: { creditTier: 'Gold', discount: 15 },
      trace: [{ kind: 'tableRow', priority: 1 }],
      diagnostics: null,
      elapsedMs: 14,
      executionId: 'exec-1',
    };
  }
}

const KEY = { 'x-api-key': 'secret-key' };

describe('EDP gateway — POST /v1/decisions:evaluate', () => {
  it('health check needs no auth', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('rejects a request without a valid API key', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions:evaluate', payload: { rule: { versionId: '00000000-0000-0000-0000-000000000001' }, input: {} } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('rejects an invalid envelope (no rule reference)', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions:evaluate', headers: KEY, payload: { input: {} } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
  });

  it('evaluates by explicit version id and maps the response envelope', async () => {
    const runtime = new FakeRuntime();
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/decisions:evaluate',
      headers: KEY,
      payload: { meta: { correlationId: 'corr-9' }, rule: { versionId: '00000000-0000-0000-0000-000000000001' }, input: { revenue: 1500000 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.matched).toBe(true);
    expect(body.outputs).toEqual({ creditTier: 'Gold', discount: 15 });
    expect(body.meta).toMatchObject({ correlationId: 'corr-9', executionId: 'exec-1', elapsedMs: 14 });
    expect(body.trace).toBeUndefined(); // includeTrace defaults false
    expect(runtime.resolveCalls).toHaveLength(0); // versionId given -> no resolution
    expect(runtime.evaluateCalls[0]?.input).toEqual({ revenue: 1500000 });
  });

  it('resolves a rule by name before evaluating', async () => {
    const runtime = new FakeRuntime({ resolvedVersionId: 'ver-abc' });
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/decisions:evaluate',
      headers: KEY,
      payload: { rule: { name: 'Account Credit Tier' }, input: { revenue: 500000 }, options: { includeTrace: true } },
    });
    expect(res.statusCode).toBe(200);
    expect(runtime.resolveCalls[0]).toEqual({ name: 'Account Credit Tier' });
    expect(runtime.evaluateCalls[0]?.versionId).toBe('ver-abc');
    expect(res.json().trace).toEqual([{ kind: 'tableRow', priority: 1 }]);
  });

  it('returns 404 when the rule has no published version', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime({ throwOnResolve: true }) });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions:evaluate', headers: KEY, payload: { rule: { name: 'Missing' }, input: {} } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('rule_not_found');
  });
});
