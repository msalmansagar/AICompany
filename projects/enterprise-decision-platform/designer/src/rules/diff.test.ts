import { describe, it, expect } from 'vitest';
import { diffPcrm } from './diff';

const base = () => ({
  name: 'Loan', targetEntity: 'account',
  inputs: [{ name: 'score', type: 'WholeNumber' }],
  outputs: [{ name: 'tier', type: 'Text' }],
  logic: {
    type: 'decisionTable', hitPolicy: 'First',
    rows: [
      { cells: [{ operator: 'GreaterThanOrEqual', value: 800 }], outputs: { tier: 'A' }, reasonCodes: ['HIGH'] },
      { cells: [{ any: true }], outputs: { tier: 'B' } },
    ],
  },
});

describe('diffPcrm', () => {
  it('reports identical when nothing changed', () => {
    const d = diffPcrm(base(), base());
    expect(d.identical).toBe(true);
    expect(d.rows).toHaveLength(0);
  });

  it('detects metadata changes', () => {
    const b = base(); b.name = 'Loan v2'; b.logic.hitPolicy = 'Priority';
    const d = diffPcrm(base(), b);
    expect(d.identical).toBe(false);
    expect(d.meta).toEqual([
      { field: 'name', from: 'Loan', to: 'Loan v2' },
      { field: 'hit policy', from: 'First', to: 'Priority' },
    ]);
  });

  it('detects added / removed / changed inputs', () => {
    const b = base();
    b.inputs = [{ name: 'score', type: 'Decimal' }, { name: 'region', type: 'Text' }];
    const d = diffPcrm(base(), b);
    expect(d.inputs.added).toEqual(['region']);
    expect(d.inputs.changed).toEqual([{ field: 'score', from: 'WholeNumber', to: 'Decimal' }]);
  });

  it('detects a changed row output and reason codes', () => {
    const b = base();
    b.logic.rows[0].outputs.tier = 'AA';
    b.logic.rows[0].reasonCodes = ['HIGH', 'EXEC'];
    const d = diffPcrm(base(), b);
    const r = d.rows.find((x) => x.index === 1)!;
    expect(r.kind).toBe('changed');
    expect(r.details).toContain('output tier: A → AA');
    expect(r.details.some((x) => x.startsWith('reason codes'))).toBe(true);
  });

  it('detects an added row', () => {
    const b = base();
    b.logic.rows.push({ cells: [{ operator: 'LessThan', value: 100 }], outputs: { tier: 'C' } } as any);
    const d = diffPcrm(base(), b);
    expect(d.rows.find((x) => x.kind === 'added')?.index).toBe(3);
  });

  it('detects a condition change', () => {
    const b = base();
    b.logic.rows[0].cells = [{ operator: 'GreaterThanOrEqual', value: 750 } as any];
    const d = diffPcrm(base(), b);
    const r = d.rows.find((x) => x.index === 1)!;
    expect(r.details).toContain('condition 1: GreaterThanOrEqual 800 → GreaterThanOrEqual 750');
  });
});
