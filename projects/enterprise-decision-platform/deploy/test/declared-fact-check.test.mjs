import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCoincidences, targetsWithDeclaredFacts } from '../lib/declared-fact-check.mjs';

const version = (inputs, targetEntity = 'account') => ({ ruleVersionId: 'v1', pcrm: JSON.stringify({ targetEntity, inputs }) });
const columns = new Map([['account', new Set(['revenue', 'tier_code'])]]);

test('findCoincidences_DeclaredFactNamedLikeAColumn_IsReported', () => {
  assert.deepEqual(findCoincidences([version([{ name: 'revenue', type: 'Decimal' }])], columns), [{ ruleVersionId: 'v1', targetEntity: 'account', input: 'revenue' }]);
});

test('findCoincidences_BoundInputNamedLikeAColumn_IsNotReported', () => {
  assert.deepEqual(findCoincidences([version([{ name: 'revenue', type: 'Decimal', binding: 'revenue' }])], columns), []);
});

test('findCoincidences_DeclaredFactWithNoMatchingColumn_IsNotReported', () => {
  assert.deepEqual(findCoincidences([version([{ name: 'tier', type: 'Text' }])], columns), []);
});

test('targetsWithDeclaredFacts_OnlyTargetsThatHaveDeclaredFacts', () => {
  assert.deepEqual(targetsWithDeclaredFacts([version([{ name: 'tier' }]), version([{ name: 'x', binding: 'x' }], 'contact')]), ['account']);
});
