import { describe, expect, it } from 'vitest';
import { decodeScope, encodeScope, hasScope } from '../data/caseListScopeUrl.js';

describe('a reporting scope in the list URL', () => {
  it('round-trips every dimension in a fixed order, codes only', () => {
    const encoded = encodeScope({ owner: 'u-1', bucket: '61-90', sourceSystem: 'HL', strategy: 'none' });

    expect([encoded, decodeScope(encoded)]).toEqual(['sourceSystem=HL&bucket=61-90&strategy=none&owner=u-1', { sourceSystem: 'HL', bucket: '61-90', strategy: 'none', owner: 'u-1' }]);
  });

  it('drops what the contract does not recognise rather than letting a URL widen a question', () => {
    expect(decodeScope('bucket=180%2B&riskGrade=high')).toEqual({});
    expect(decodeScope(undefined)).toEqual({});
  });

  it('knows an empty scope from a narrowing one', () => {
    expect([hasScope({}), hasScope({ caseStatus: 'New' })]).toEqual([false, true]);
  });
});
