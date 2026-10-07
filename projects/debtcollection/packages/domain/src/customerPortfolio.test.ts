import { describe, it, expect } from 'vitest';
import { countPortfolio, dpdChange, pastDueStateOf } from './customerPortfolio.js';

describe('pastDueStateOf', () => {
  it('pastDueStateOf_anyDayPastDue_isPastDue', () => { expect(pastDueStateOf(1)).toBe('pastDue'); });
  it('pastDueStateOf_zero_isCurrent', () => { expect(pastDueStateOf(0)).toBe('current'); });
  it('pastDueStateOf_notReported_isUnknownNotCurrent', () => { expect(pastDueStateOf(undefined)).toBe('unknown'); });
});

describe('countPortfolio', () => {
  it('countPortfolio_mixedUnits_countsEachGroupAndLeavesUnknownOut', () => {
    expect(countPortfolio([30, 0, 92, undefined])).toEqual({ units: 4, pastDue: 2, current: 1 });
  });
});

describe('dpdChange', () => {
  it('dpdChange_rising_isPositive', () => { expect(dpdChange(62, 92)).toBe(30); });
  it('dpdChange_falling_isNegative', () => { expect(dpdChange(42, 30)).toBe(-12); });
  it('dpdChange_missingObservation_isUndefined', () => { expect(dpdChange(undefined, 30)).toBeUndefined(); });
});
