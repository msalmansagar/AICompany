import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import type { GatewayConfig } from '../src/config.js';
import type { DecisionRuntime, EvaluateOutcome, ValidateOutcome } from '../src/envelope.js';
import { RuntimeError } from '../src/dataverseRuntime.js';

const baseConfig: GatewayConfig = {
  port: 0,
  apiKeys: ['secret-key'],
  dataverse: { url: 'https://example.crm.dynamics.com', tenantId: 't', clientId: 'c', clientSecret: 's' },
};

class FakeRuntime implements DecisionRuntime {
  resolveCalls: Array<{ id?: string; name?: string }> = [];
  evaluateCalls: Array<{ versionId: string; input: Record<string, unknown>; includeTrace: boolean }> = [];
  testCalls: Array<{ versionId: string; input: Record<string, unknown>; includeTrace: boolean }> = [];
  validateCalls: Array<{ versionId: string }> = [];
  ruleSetCalls: Array<{ ruleSetId: string; input: Record<string, unknown> }> = [];

  constructor(private readonly opts: { resolvedVersionId?: string; throwOnResolve?: boolean } = {}) {}

  async resolvePublishedVersion(ref: { id?: string; name?: string }): Promise<{ versionId: string }> {
    this.resolveCalls.push(ref);
    if (this.opts.throwOnResolve) throw new RuntimeError('rule_not_found', 'no published version');
    return { versionId: this.opts.resolvedVersionId ?? 'resolved-version' };
  }

  private outcome(): EvaluateOutcome {
    return { matched: true, outputs: { creditTier: 'Gold', discount: 15 }, trace: [{ kind: 'tableRow', priority: 1 }], diagnostics: null, elapsedMs: 14, executionId: 'exec-1' };
  }

  async evaluate(args: { versionId: string; input: Record<string, unknown>; includeTrace: boolean }): Promise<EvaluateOutcome> {
    this.evaluateCalls.push(args);
    return this.outcome();
  }

  async test(args: { versionId: string; input: Record<string, unknown>; includeTrace: boolean }): Promise<EvaluateOutcome> {
    this.testCalls.push(args);
    return { ...this.outcome(), executionId: null };
  }

  async validate(args: { versionId: string }): Promise<ValidateOutcome> {
    this.validateCalls.push(args);
    return { valid: false, diagnostics: [{ code: 'EDP001', severity: 'Warning', message: 'target entity not in metadata' }] };
  }

  async evaluateRuleSet(args: { ruleSetId: string; input: Record<string, unknown> }): Promise<{ result: unknown }> {
    this.ruleSetCalls.push(args);
    return { result: { policy: 'FirstMatch', matchedCount: 1, results: [{ key: 'a', matched: true }] } };
  }

  schemaCalls: Array<{ versionId: string }> = [];
  historyCalls: Array<{ id?: string; name?: string }> = [];
  explainCalls: Array<{ executionLogId: string }> = [];

  async getSchema(args: { versionId: string }): Promise<{ inputs: unknown; outputs: unknown }> {
    this.schemaCalls.push(args);
    return { inputs: [{ name: 'revenue', type: 'Currency' }], outputs: [{ name: 'creditTier' }] };
  }

  async getHistory(args: { id?: string; name?: string }): Promise<{ result: unknown }> {
    this.historyCalls.push(args);
    return { result: [{ version: 1, state: 'Published' }] };
  }

  async explain(args: { executionLogId: string }): Promise<{ result: unknown }> {
    this.explainCalls.push(args);
    return { result: { narration: 'Matched the Gold row because revenue >= 1000000.' } };
  }
}

const KEY = { 'x-api-key': 'secret-key' };
const V1 = '00000000-0000-0000-0000-000000000001';

describe('EDP gateway — decision surface', () => {
  it('health check needs no auth', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('rejects a request without a valid API key', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions/evaluate', payload: { rule: { versionId: V1 }, input: {} } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('evaluate: rejects an invalid envelope (no rule reference)', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions/evaluate', headers: KEY, payload: { input: {} } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
  });

  it('evaluate: by explicit version id, maps the response envelope', async () => {
    const runtime = new FakeRuntime();
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions/evaluate', headers: KEY, payload: { meta: { correlationId: 'corr-9' }, rule: { versionId: V1 }, input: { revenue: 1500000 } } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ matched: true, outputs: { creditTier: 'Gold', discount: 15 } });
    expect(body.meta).toMatchObject({ correlationId: 'corr-9', executionId: 'exec-1', elapsedMs: 14 });
    expect(body.trace).toBeUndefined();
    expect(runtime.resolveCalls).toHaveLength(0);
    expect(runtime.evaluateCalls[0]?.input).toEqual({ revenue: 1500000 });
  });

  it('evaluate: resolves a rule by name and includes trace when asked', async () => {
    const runtime = new FakeRuntime({ resolvedVersionId: 'ver-abc' });
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions/evaluate', headers: KEY, payload: { rule: { name: 'Account Credit Tier' }, input: { revenue: 500000 }, options: { includeTrace: true } } });
    expect(res.statusCode).toBe(200);
    expect(runtime.resolveCalls[0]).toEqual({ name: 'Account Credit Tier' });
    expect(runtime.evaluateCalls[0]?.versionId).toBe('ver-abc');
    expect(res.json().trace).toEqual([{ kind: 'tableRow', priority: 1 }]);
  });

  it('evaluate: 404 when the rule has no published version', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime({ throwOnResolve: true }) });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions/evaluate', headers: KEY, payload: { rule: { name: 'Missing' }, input: {} } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('rule_not_found');
  });

  it('test: runs the decision with no durable execution id', async () => {
    const runtime = new FakeRuntime();
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({ method: 'POST', url: '/v1/decisions/test', headers: KEY, payload: { rule: { versionId: V1 }, input: { revenue: 1500000 } } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ matched: true, meta: { executionId: null } });
    expect(runtime.testCalls).toHaveLength(1);
  });

  it('validate: resolves then returns valid + diagnostics', async () => {
    const runtime = new FakeRuntime({ resolvedVersionId: 'ver-v' });
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({ method: 'POST', url: '/v1/rules/validate', headers: KEY, payload: { rule: { name: 'Account Credit Tier' } } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.diagnostics).toHaveLength(1);
    expect(runtime.validateCalls[0]?.versionId).toBe('ver-v');
  });

  it('rule-sets: evaluates by id and passes the native aggregate through', async () => {
    const runtime = new FakeRuntime();
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({ method: 'POST', url: '/v1/rule-sets/evaluate', headers: KEY, payload: { ruleSetId: V1, input: { revenue: 2000 } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toMatchObject({ policy: 'FirstMatch', matchedCount: 1 });
    expect(runtime.ruleSetCalls[0]).toEqual({ ruleSetId: V1, input: { revenue: 2000 } });
  });

  it('rule-sets: rejects a non-uuid set id', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'POST', url: '/v1/rule-sets/evaluate', headers: KEY, payload: { ruleSetId: 'not-a-guid', input: {} } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
  });

  it('schema: resolves then returns inputs + outputs', async () => {
    const runtime = new FakeRuntime({ resolvedVersionId: 'ver-s' });
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({ method: 'POST', url: '/v1/rules/schema', headers: KEY, payload: { rule: { name: 'Account Credit Tier' } } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.inputs).toEqual([{ name: 'revenue', type: 'Currency' }]);
    expect(body.outputs).toEqual([{ name: 'creditTier' }]);
    expect(runtime.schemaCalls[0]?.versionId).toBe('ver-s');
  });

  it('history: passes the rule id/name straight to the runtime', async () => {
    const runtime = new FakeRuntime();
    const app = buildApp({ config: baseConfig, runtime });
    const res = await app.inject({ method: 'POST', url: '/v1/rules/history', headers: KEY, payload: { rule: { name: 'Account Credit Tier' } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toEqual([{ version: 1, state: 'Published' }]);
    expect(runtime.historyCalls[0]).toEqual({ id: undefined, name: 'Account Credit Tier' });
    expect(runtime.resolveCalls).toHaveLength(0); // history does not resolve a version
  });

  it('explain: requires a uuid execution-log id', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const bad = await app.inject({ method: 'POST', url: '/v1/decisions/explain', headers: KEY, payload: { executionLogId: 'nope' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/v1/decisions/explain', headers: KEY, payload: { executionLogId: V1 } });
    expect(ok.statusCode).toBe(200);
    expect((ok.json().result as { narration: string }).narration).toContain('Gold row');
  });

  it('serves the OpenAPI document without auth', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/v1/decisions/evaluate']).toBeDefined();
    expect(doc.paths['/v1/rules/schema']).toBeDefined();
  });

  it('serves the docs page without auth', async () => {
    const app = buildApp({ config: baseConfig, runtime: new FakeRuntime() });
    const res = await app.inject({ method: 'GET', url: '/docs' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
