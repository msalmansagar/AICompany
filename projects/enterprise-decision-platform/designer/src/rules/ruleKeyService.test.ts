import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateRuleKey, suggestRuleKey, checkRuleKeyAvailability } from './ruleKeyService';
import { RULE_KEY_PATTERN, RULE_KEY_MIN_LENGTH, RULE_KEY_MAX_LENGTH } from '../contract';

// ── validateRuleKey ───────────────────────────────────────────────────────────

describe('validateRuleKey', () => {
  it('should_accept_valid_lower_case_dot_separated_key', () => {
    expect(validateRuleKey('loan.approval').valid).toBe(true);
  });

  it('should_accept_key_with_hyphens_and_underscores', () => {
    expect(validateRuleKey('credit-check_v2').valid).toBe(true);
  });

  it('should_reject_empty_key', () => {
    const r = validateRuleKey('');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/required/i);
  });

  it('should_reject_upper_case_with_message_not_silent_lower_case_FR_B3_13', () => {
    const r = validateRuleKey('Loan.Approval');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/lower-case/i);
    // Must NOT silently downcase — the error should call out the upper case explicitly
  });

  it('should_reject_key_shorter_than_min_length', () => {
    const r = validateRuleKey('ab');
    expect(r.valid).toBe(false);
    expect(r.error).toContain(String(RULE_KEY_MIN_LENGTH));
  });

  it('should_reject_key_longer_than_max_length', () => {
    const tooLong = 'a'.repeat(RULE_KEY_MAX_LENGTH + 1);
    const r = validateRuleKey(tooLong);
    expect(r.valid).toBe(false);
    expect(r.error).toContain(String(RULE_KEY_MAX_LENGTH));
  });

  it('should_reject_key_with_spaces', () => {
    expect(validateRuleKey('loan approval').valid).toBe(false);
  });

  it('should_reject_key_starting_with_separator', () => {
    expect(validateRuleKey('.loan').valid).toBe(false);
  });

  it('should_pattern_come_from_contract_not_hardcoded', () => {
    // The pattern used in validation must be the contract pattern (IC-3).
    const key = 'abc';
    const contractSaysValid = RULE_KEY_PATTERN.test(key);
    expect(validateRuleKey(key).valid).toBe(contractSaysValid);
  });
});

// ── suggestRuleKey ────────────────────────────────────────────────────────────

describe('suggestRuleKey', () => {
  it('should_produce_lower_case_dot_separated_slug', () => {
    const slug = suggestRuleKey('Loan Approval');
    expect(slug).toBe('loan.approval');
    expect(validateRuleKey(slug).valid).toBe(true);
  });

  it('should_strip_special_characters', () => {
    const slug = suggestRuleKey('Loan Approval — Sample');
    expect(slug).toMatch(/^[a-z0-9.]+$/);
  });

  it('should_fall_back_to_rule_for_empty_name', () => {
    expect(suggestRuleKey('')).toBe('rule');
    expect(suggestRuleKey('   ')).toBe('rule');
  });

  it('should_not_exceed_max_length', () => {
    const long = 'a'.repeat(200);
    expect(suggestRuleKey(long).length).toBeLessThanOrEqual(RULE_KEY_MAX_LENGTH);
  });
});

// ── checkRuleKeyAvailability ──────────────────────────────────────────────────

interface MockCall { method: string; path: string; }
const calls: MockCall[] = [];

function mockFetch(handler: (c: MockCall) => unknown) {
  (globalThis as any).fetch = vi.fn(async (url: string, init?: any) => {
    const call: MockCall = { method: init?.method ?? 'GET', path: String(url) };
    calls.push(call);
    const result = handler(call) ?? {};
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(result) };
  });
}

beforeEach(() => {
  calls.length = 0;
  (globalThis as any).window = {};
  (globalThis as any).location = { hostname: 'localhost' };
});
afterEach(() => vi.restoreAllMocks());

describe('checkRuleKeyAvailability', () => {
  it('should_return_available_when_key_not_in_use_and_not_retired', async () => {
    mockFetch(() => ({ value: [] }));
    const r = await checkRuleKeyAvailability('loan.approval');
    expect(r.available).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('should_return_unavailable_when_key_exists_on_another_rule', async () => {
    mockFetch((c) => {
      if (c.path.includes('qdb_edp_rules')) return { value: [{ qdb_edp_ruleid: 'some-id' }] };
      return { value: [] };
    });
    const r = await checkRuleKeyAvailability('loan.approval');
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/already held/i);
  });

  it('should_return_unavailable_when_key_is_retired_FR_B3_14', async () => {
    mockFetch((c) => {
      if (c.path.includes('ruleaudits')) return { value: [{ qdb_edp_ruleauditid: 'audit-1' }] };
      return { value: [] };
    });
    const r = await checkRuleKeyAvailability('retired.key');
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/deleted rule/i);
  });

  it('should_check_both_rules_and_audits_in_parallel', async () => {
    mockFetch(() => ({ value: [] }));
    await checkRuleKeyAvailability('test.key');
    const ruleQuery = calls.some((c) => c.path.includes('qdb_edp_rules'));
    const auditQuery = calls.some((c) => c.path.includes('qdb_edp_ruleaudits'));
    expect(ruleQuery).toBe(true);
    expect(auditQuery).toBe(true);
  });
});
