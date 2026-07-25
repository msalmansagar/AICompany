import { describe, it, expect } from 'vitest';
import type { RuleRow } from '../dataverse/client';
import { effectiveState, statusCounts, entitiesPresent, filterCatalog } from './catalog';

function row(over: Partial<RuleRow> = {}): RuleRow {
  return {
    ruleId: 'r', name: 'Rule', entity: 'account', status: 'Published',
    versionNumber: 1, versionId: 'v', modifiedOn: '', owner: 'Ada Lovelace',
    effectiveFrom: null, effectiveTo: null, ...over,
  };
}
const NOW = '2026-07-11T00:00:00Z';
const label = (ln: string) => (ln === 'account' ? 'Account' : ln);

describe('effectiveState', () => {
  it('is none when not published', () => {
    expect(effectiveState(row({ status: 'Draft', effectiveFrom: '2020-01-01T00:00:00Z' }), NOW)).toBe('none');
  });
  it('is none when published with no window', () => {
    expect(effectiveState(row(), NOW)).toBe('none');
  });
  it('is scheduled when the start is in the future', () => {
    expect(effectiveState(row({ effectiveFrom: '2099-01-01T00:00:00Z' }), NOW)).toBe('scheduled');
  });
  it('is expired when the end has passed', () => {
    expect(effectiveState(row({ effectiveTo: '2020-01-01T00:00:00Z' }), NOW)).toBe('expired');
  });
  it('is active inside an open window', () => {
    expect(effectiveState(row({ effectiveFrom: '2020-01-01T00:00:00Z' }), NOW)).toBe('active');
  });
});

describe('facets', () => {
  const rows = [row({ status: 'Published', entity: 'account' }), row({ status: 'Draft', entity: 'contact' }), row({ status: 'Published', entity: '' })];
  it('counts statuses with an All total', () => {
    const c = statusCounts(rows);
    expect(c.All).toBe(3);
    expect(c.Published).toBe(2);
    expect(c.Draft).toBe(1);
  });
  it('lists distinct non-blank entities sorted', () => {
    expect(entitiesPresent(rows)).toEqual(['account', 'contact']);
  });
});

describe('filterCatalog', () => {
  const rows = [
    row({ name: 'Loan Approval', status: 'Published', entity: 'account', owner: 'Ada Lovelace' }),
    row({ name: 'Refund Check', status: 'Draft', entity: 'contact', owner: 'Alan Turing' }),
  ];
  it('filters by status', () => {
    expect(filterCatalog(rows, { query: '', status: 'Draft', entity: '' }, label).map((r) => r.name)).toEqual(['Refund Check']);
  });
  it('filters by entity', () => {
    expect(filterCatalog(rows, { query: '', status: '', entity: 'account' }, label).map((r) => r.name)).toEqual(['Loan Approval']);
  });
  it('keyword matches owner', () => {
    expect(filterCatalog(rows, { query: 'turing', status: '', entity: '' }, label).map((r) => r.name)).toEqual(['Refund Check']);
  });
  it('combines status and keyword', () => {
    expect(filterCatalog(rows, { query: 'loan', status: 'Draft', entity: '' }, label)).toHaveLength(0);
  });
});
