import { describe, it, expect } from 'vitest';
import { toDataversePriority, fromDataversePriority } from '@/services/priorityCodec';

describe('priorityCodec', () => {
  it('toDataversePriority_shiftsZeroBasedSortOrder_toMinimumOne', () => {
    expect(toDataversePriority(0)).toBe(1);
    expect(toDataversePriority(1)).toBe(2);
    expect(toDataversePriority(9)).toBe(10);
  });

  it('fromDataversePriority_shiftsBack_toZeroBasedSortOrder', () => {
    expect(fromDataversePriority(1)).toBe(0);
    expect(fromDataversePriority(2)).toBe(1);
    expect(fromDataversePriority(10)).toBe(9);
  });

  it('fromDataversePriority_neverReturnsNegative', () => {
    expect(fromDataversePriority(0)).toBe(0);
  });

  it('roundTrips_everyIndex_backToItself', () => {
    for (let sortOrder = 0; sortOrder < 5; sortOrder++) {
      expect(fromDataversePriority(toDataversePriority(sortOrder))).toBe(sortOrder);
    }
  });

  it('everyPersistedPriority_isAtLeastOne', () => {
    for (let sortOrder = 0; sortOrder < 5; sortOrder++) {
      expect(toDataversePriority(sortOrder)).toBeGreaterThanOrEqual(1);
    }
  });
});
