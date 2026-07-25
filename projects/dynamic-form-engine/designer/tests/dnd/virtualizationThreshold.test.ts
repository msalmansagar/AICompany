// RED → GREEN test suite for the virtualisation threshold decision function.
// Tests the shouldVirtualizeFieldList pure function and the VIRTUALIZATION_THRESHOLD constant.

import { describe, it, expect } from 'vitest';
import { shouldVirtualizeFieldList, VIRTUALIZATION_THRESHOLD } from '@/designer/dnd/dndConstants';

describe('VIRTUALIZATION_THRESHOLD', () => {
  it('VIRTUALIZATION_THRESHOLD_equals_40', () => {
    expect(VIRTUALIZATION_THRESHOLD).toBe(40);
  });
});

describe('shouldVirtualizeFieldList', () => {
  it('shouldVirtualizeFieldList_returnsFalse_whenCountIsZero', () => {
    expect(shouldVirtualizeFieldList(0)).toBe(false);
  });

  it('shouldVirtualizeFieldList_returnsFalse_whenCountEqualsThreshold', () => {
    // Exactly at the threshold does NOT trigger virtualisation — threshold is exclusive.
    expect(shouldVirtualizeFieldList(VIRTUALIZATION_THRESHOLD)).toBe(false);
  });

  it('shouldVirtualizeFieldList_returnsFalse_whenCountIsBelowThreshold', () => {
    expect(shouldVirtualizeFieldList(VIRTUALIZATION_THRESHOLD - 1)).toBe(false);
  });

  it('shouldVirtualizeFieldList_returnsTrue_whenCountExceedsThreshold', () => {
    expect(shouldVirtualizeFieldList(VIRTUALIZATION_THRESHOLD + 1)).toBe(true);
  });

  it('shouldVirtualizeFieldList_returnsTrue_forLargeFieldCount', () => {
    expect(shouldVirtualizeFieldList(1000)).toBe(true);
  });
});
