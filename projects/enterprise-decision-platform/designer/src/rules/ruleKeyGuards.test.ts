import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ruleKeyProblem, setRuleKeyOnce } from './ruleKeyService';
import { isRuleKeyRetired, retiredRuleKeyMarker } from '../dataverse/client';

// FR-B3-04 / 05 / 14 at the Dataverse boundary: the key is checked before anything is written,
// and the retired-key check queries the column the delete audit actually writes.

interface Call { method: string; path: string; body: unknown; }
const calls: Call[] = [];

function mockFetch(handler: (c: Call) => unknown) {
  (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
    const call: Call = { method: init?.method ?? 'GET', path: decodeURIComponent(String(url)), body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const result = handler(call) ?? {};
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(result) };
  });
}

const noMatches = () => ({ value: [] });
const retired = (c: Call) => (c.path.includes('qdb_edp_ruleaudits') ? { value: [{ qdb_edp_ruleauditid: 'a1' }] } : { value: [] });

beforeEach(() => {
  calls.length = 0;
  (globalThis as any).window = {};
  (globalThis as any).location = { hostname: 'localhost' };
});
afterEach(() => vi.restoreAllMocks());

describe('isRuleKeyRetired', () => {
  it('should_match_the_marker_at_the_end_of_the_audit_details', async () => {
    mockFetch(noMatches);
    await isRuleKeyRetired('demo.risk-tier');
    expect(calls[0].path).toContain("endswith(qdb_edp_details,'ruleKey=demo.risk-tier')");
  });

  it('should_never_filter_on_a_rulekey_column_the_audit_table_does_not_have', async () => {
    mockFetch(noMatches);
    await isRuleKeyRetired('demo.risk-tier');
    expect(calls[0].path).not.toContain('qdb_edp_rulekey eq');
  });

  it('should_use_the_marker_the_delete_audit_plugin_writes', () => {
    expect(retiredRuleKeyMarker('demo.risk-tier')).toBe('ruleKey=demo.risk-tier');
  });
});

describe('ruleKeyProblem', () => {
  it('should_require_a_key_when_creating_a_rule', async () => {
    expect(await ruleKeyProblem('', true)).toMatch(/required/i);
  });

  it('should_allow_an_existing_unkeyed_rule_to_be_saved_without_one', async () => {
    expect(await ruleKeyProblem(null, false)).toBeNull();
  });

  it('should_reject_upper_case_without_calling_dataverse', async () => {
    mockFetch(noMatches);
    expect(await ruleKeyProblem('Demo.Tier', true)).toMatch(/lower-case/i);
    expect(calls).toHaveLength(0);
  });

  it('should_refuse_a_retired_key', async () => {
    mockFetch(retired);
    expect(await ruleKeyProblem('demo.old', true)).toMatch(/deleted rule/i);
  });

  it('should_accept_an_available_key', async () => {
    mockFetch(noMatches);
    expect(await ruleKeyProblem('demo.new', true)).toBeNull();
  });
});

describe('setRuleKeyOnce', () => {
  it('should_write_nothing_when_the_key_is_retired', async () => {
    mockFetch(retired);
    await expect(setRuleKeyOnce('rule-1', 'demo.old')).rejects.toThrow(/deleted rule/i);
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('should_write_only_the_rule_key_when_available', async () => {
    mockFetch(noMatches);
    await setRuleKeyOnce('rule-1', 'demo.new');
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ qdb_edp_rulekey: 'demo.new' });
  });
});
