import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RULE_KEY_PATTERN, RULE_KEY_MIN_LENGTH, RULE_KEY_MAX_LENGTH, CORRELATION_ID_MAX_LENGTH, DECISION_OUTCOMES } from '../src/envelope.js';

// IC-3: the gateway container cannot read the repository contract at runtime (its build context is
// gateway/), so it keeps its own copy of these values and this test holds that copy equal.
const contractPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'contract', 'rule-engine-contract.json');
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as {
  ruleKey: { pattern: string; minLength: number; maxLength: number };
  correlationId: { minLength: number; maxLength: number };
  outcomes: Array<string | { name: string }>;
};
const outcomeNames = contract.outcomes.map((o) => (typeof o === 'string' ? o : o.name));

describe('contract parity (IC-3)', () => {
  it('ruleKeyPattern_EqualsTheContract', () => {
    expect(RULE_KEY_PATTERN.source).toBe(contract.ruleKey.pattern);
  });
  it('ruleKeyLengths_EqualTheContract', () => {
    expect([RULE_KEY_MIN_LENGTH, RULE_KEY_MAX_LENGTH]).toEqual([contract.ruleKey.minLength, contract.ruleKey.maxLength]);
  });
  it('correlationIdMaximum_EqualsTheContract', () => {
    expect(CORRELATION_ID_MAX_LENGTH).toBe(contract.correlationId.maxLength);
  });
  it('outcomes_EqualTheContract', () => {
    expect([...DECISION_OUTCOMES]).toEqual(outcomeNames);
  });
});
