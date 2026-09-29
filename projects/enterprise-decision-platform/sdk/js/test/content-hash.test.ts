import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizePcrm, computeContentHash, EXCLUDED_TOP_LEVEL, EXCLUDED_TOP_LEVEL_PREFIX, MAX_EXPONENT_MAGNITUDE } from '../src/contentHash.js';
import { RULE_KEY_PATTERN, DECISION_OUTCOMES } from '../src/index.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// ── Load shared contract files ────────────────────────────────────────────────

interface Vector {
  id: string;
  description: string;
  pcrm: string;
  canonical?: string;
  sha256?: string;
  sameHashAs?: string;
  differentHashFrom?: string;
}

interface VectorsFile {
  vectors: Vector[];
}

interface ContractFile {
  outcomes: string[];
  ruleKey: { pattern: string };
}

function loadVectors(): VectorsFile {
  return JSON.parse(
    readFileSync(resolve(PROJECT_ROOT, 'contract/content-hash-vectors.json'), 'utf8'),
  ) as VectorsFile;
}

function loadContract(): ContractFile {
  return JSON.parse(
    readFileSync(resolve(PROJECT_ROOT, 'contract/rule-engine-contract.json'), 'utf8'),
  ) as ContractFile;
}

// ── Content hash vector tests (FR-B4-06) ─────────────────────────────────────

describe('canonicalizePcrm — shared vectors', () => {
  const { vectors } = loadVectors();

  for (const vector of vectors) {
    if (vector.canonical === undefined) continue;

    it(`${vector.id}: canonical form matches expected`, () => {
      expect(canonicalizePcrm(vector.pcrm)).toBe(vector.canonical);
    });
  }
});

describe('computeContentHash — shared vectors', () => {
  const { vectors } = loadVectors();
  const hashById = new Map<string, string>();

  // First pass: compute and cache hashes for all vectors with sha256
  for (const vector of vectors) {
    if (vector.sha256 !== undefined) {
      hashById.set(vector.id, computeContentHash(vector.pcrm));
    }
  }

  for (const vector of vectors) {
    if (vector.sha256 !== undefined) {
      it(`${vector.id}: sha256 matches expected`, () => {
        expect(computeContentHash(vector.pcrm)).toBe(vector.sha256);
      });
    }

    if (vector.sameHashAs !== undefined) {
      it(`${vector.id}: hash equals ${vector.sameHashAs} (sameHashAs)`, () => {
        const thisHash = computeContentHash(vector.pcrm);
        const otherHash = hashById.get(vector.sameHashAs!);
        expect(thisHash).toBe(otherHash);
      });
    }

    if (vector.differentHashFrom !== undefined) {
      it(`${vector.id}: hash differs from ${vector.differentHashFrom} (differentHashFrom)`, () => {
        const thisHash = computeContentHash(vector.pcrm);
        const otherHash = hashById.get(vector.differentHashFrom!);
        expect(thisHash).not.toBe(otherHash);
      });
    }
  }
});

// ── Contract parity (IC-3) ────────────────────────────────────────────────────

describe('SDK contract parity (IC-3)', () => {
  it('hash exclusions and exponent limit match the contract', () => {
    const hash = (JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'contract/rule-engine-contract.json'), 'utf8')) as {
      contentHash: { excludedTopLevelProperties: string[]; excludedTopLevelPropertyPrefix: string; maxExponentMagnitude: number };
    }).contentHash;
    expect([[...EXCLUDED_TOP_LEVEL].sort(), EXCLUDED_TOP_LEVEL_PREFIX, MAX_EXPONENT_MAGNITUDE])
      .toEqual([[...hash.excludedTopLevelProperties].sort(), hash.excludedTopLevelPropertyPrefix, hash.maxExponentMagnitude]);
  });

  it('outcome literals match the shared contract exactly', () => {
    const contract = loadContract();
    expect([...DECISION_OUTCOMES]).toEqual(contract.outcomes);
  });

  it('RULE_KEY_PATTERN matches the contract pattern', () => {
    const contract = loadContract();
    // Verify our pattern string equals the contract pattern string
    expect(RULE_KEY_PATTERN.source).toBe(new RegExp(contract.ruleKey.pattern).source);
  });

  it('RULE_KEY_PATTERN rejects upper-case keys', () => {
    expect(RULE_KEY_PATTERN.test('My-Rule')).toBe(false);
    expect(RULE_KEY_PATTERN.test('MYRULE')).toBe(false);
  });

  it('RULE_KEY_PATTERN accepts valid lower-case keys', () => {
    expect(RULE_KEY_PATTERN.test('my-rule')).toBe(true);
    expect(RULE_KEY_PATTERN.test('account.credit.tier')).toBe(true);
    expect(RULE_KEY_PATTERN.test('rule1')).toBe(true);
    expect(RULE_KEY_PATTERN.test('a-b_c.d')).toBe(true);
  });
});

// ── canonicalizePcrm edge cases ───────────────────────────────────────────────

describe('canonicalizePcrm — edge cases', () => {
  it('throws on a non-object root value', () => {
    expect(() => canonicalizePcrm('[1,2,3]')).toThrow('PCRM must be a JSON object.');
  });

  it('throws on duplicate keys after NFC normalization', () => {
    // Two keys that are identical after NFC — synthesise by direct repetition
    expect(() => canonicalizePcrm('{"a":1,"a":2}')).toThrow(/Duplicate key/);
  });

  it('throws when exponent exceeds 1000', () => {
    expect(() => canonicalizePcrm('{"x":1e1001}')).toThrow(/allowed range/);
  });

  it('drops null-valued object members at every depth', () => {
    const result = canonicalizePcrm('{"a":null,"b":1,"c":{"d":null,"e":2}}');
    expect(result).toBe('{"b":1,"c":{"e":2}}');
  });

  it('keeps null values inside arrays', () => {
    const result = canonicalizePcrm('{"arr":[1,null,"x"]}');
    expect(result).toBe('{"arr":[1,null,"x"]}');
  });
});
