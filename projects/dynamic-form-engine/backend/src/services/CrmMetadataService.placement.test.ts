import { describe, it, expect } from 'vitest';
import { placementFromCode } from './CrmMetadataService.js';

describe('placementFromCode (DFE-TABZONE-001)', () => {
  it('maps the Header optionset code to header', () => {
    expect(placementFromCode(100000000)).toBe('header');
  });

  it('maps the Footer optionset code to footer', () => {
    expect(placementFromCode(100000001)).toBe('footer');
  });

  it('maps the Body optionset code to body', () => {
    expect(placementFromCode(100000002)).toBe('body');
  });

  it('falls back to body for absent placement (legacy records)', () => {
    expect(placementFromCode(undefined)).toBe('body');
    expect(placementFromCode(null)).toBe('body');
  });

  it('falls back to body for an unknown/malformed placement code', () => {
    expect(placementFromCode(999)).toBe('body');
    expect(placementFromCode(-1)).toBe('body');
  });
});
