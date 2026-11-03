import { describe, expect, it } from 'vitest';
import {
  caseListFiltersFromScope, decodeCaseListFilters, encodeCaseListFilters, hasCaseListFilters, scopeFromCaseListFilters,
} from '../v2/data/caseListFilterUrl.js';

/**
 * One mapping between a reporting scope and V2's case-list filters, in both directions, so the
 * population a dashboard row counted is the population the list shows — and nothing is invented on
 * the way: a dimension the list cannot narrow by is not carried, and a label never filters.
 */
describe('ReportingScope ↔ V2 case-list filters', () => {
  it('maps every case-grain dimension and carries the origin and labels as context', () => {
    const filters = caseListFiltersFromScope(
      { sourceSystem: 'HL', bucket: '61-90', caseStatus: 'New', strategy: 's-1', owner: 'u-1' },
      'dashboard',
      { strategyLabel: 'Soft contact', ownerLabel: 'Officer One' },
    );

    expect(filters).toEqual({ scope: 'HL', bucket: '61-90', status: 'New', strategy: 's-1', strategyLabel: 'Soft contact', owner: 'u-1', ownerLabel: 'Officer One', from: 'dashboard' });
  });

  it('drops the dimensions a case list has no meaning for', () => {
    expect(caseListFiltersFromScope({ activityType: 't-1', activityState: 'open', dateFrom: '2026-09-01', dateTo: '2026-09-30' })).toEqual({});
  });

  it('survives the URL round trip with the new fields', () => {
    const filters = { bucket: '1-30', status: 'PTP Active', owner: 'u-2', ownerLabel: 'Officer Two', scope: 'BFD' as const, from: 'dashboard' as const };

    expect(decodeCaseListFilters(encodeCaseListFilters(filters))).toEqual(filters);
  });

  it('reverses into the same scope, without the labels and without the origin', () => {
    const filters = caseListFiltersFromScope({ sourceSystem: 'BFD', bucket: '>2000', strategy: 'none', caseStatus: 'New', owner: 'u-1' }, 'portfolio', { ownerLabel: 'x' });

    expect(scopeFromCaseListFilters(filters)).toEqual({ sourceSystem: 'BFD', bucket: '>2000', strategy: 'none', caseStatus: 'New', owner: 'u-1' });
  });

  it('counts status and owner as filters, and labels and origin as context only', () => {
    expect([hasCaseListFilters({ status: 'New' }), hasCaseListFilters({ owner: 'u-1' }), hasCaseListFilters({ from: 'dashboard', ownerLabel: 'x' })]).toEqual([true, true, false]);
  });

  it('ignores an origin it does not know', () => {
    expect(decodeCaseListFilters('from=elsewhere&bucket=1-30')).toEqual({ bucket: '1-30' });
  });
});
