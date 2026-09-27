import { describe, expect, it } from 'vitest';
import { CaseNumberSourceKindSchema, caseNumberFor, composeProvisionalCaseNumber } from './caseNumbering.js';

const facility = { facilityNumber: '123456789', sourceSystem: 'HL' };

describe('provisional case numbering (KI-49)', () => {
  it('composes from business identity', () => {
    expect(composeProvisionalCaseNumber(facility, 1)).toBe('HL-123456789-E1');
  });

  it('is unique per facility and episode by construction', () => {
    const numbers = new Set([
      composeProvisionalCaseNumber(facility, 1),
      composeProvisionalCaseNumber(facility, 2),
      composeProvisionalCaseNumber({ ...facility, sourceSystem: 'BFD' }, 1),
      composeProvisionalCaseNumber({ ...facility, facilityNumber: '987654321' }, 1),
    ]);
    expect(numbers.size).toBe(4);
  });
});

describe('choosing the numbering source', () => {
  it('returns a number when DCP composes it', () => {
    expect(caseNumberFor('Provisional', facility, 3)).toBe('HL-123456789-E3');
  });

  it('returns nothing when the configured QDB mechanism owns the column', () => {
    expect(caseNumberFor('PlatformConfigured', facility, 3)).toBeUndefined();
  });

  it('offers exactly two sources — DCP does not build a third numbering engine', () => {
    expect(CaseNumberSourceKindSchema.options).toEqual(['Provisional', 'PlatformConfigured']);
  });
});
