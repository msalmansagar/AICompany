// RED — failing until ComponentStyleResolver is implemented
import { describe, it, expect } from 'vitest';
import { ComponentStyleResolver } from './ComponentStyleResolver';
import type { FieldDesign } from '@dfe/shared';
import { LIGHT_THEME } from './themes';

function makeFieldDesign(
  overrides: Partial<FieldDesign> = {},
): FieldDesign {
  return {
    id: 'fld-1',
    fieldId: 'field-1',
    inputStyle: 'Outlined',
    width: 'Full',
    isActive: true,
    ...overrides,
  };
}

describe('ComponentStyleResolver.resolve', () => {
  it('returns_outlineAppearance_whenNoFieldDesign', () => {
    const result = ComponentStyleResolver.resolve(undefined, LIGHT_THEME);

    expect(result.appearance).toBe('outline');
  });

  it('maps_OutlinedInputStyle_toOutlineAppearance', () => {
    const design = makeFieldDesign({ inputStyle: 'Outlined' });

    const result = ComponentStyleResolver.resolve(design, LIGHT_THEME);

    expect(result.appearance).toBe('outline');
  });

  it('maps_FilledInputStyle_toFilledDarkerAppearance', () => {
    const design = makeFieldDesign({ inputStyle: 'Filled' });

    const result = ComponentStyleResolver.resolve(design, LIGHT_THEME);

    expect(result.appearance).toBe('filled-darker');
  });

  it('maps_StandardInputStyle_toUnderlineAppearance', () => {
    const design = makeFieldDesign({ inputStyle: 'Standard' });

    const result = ComponentStyleResolver.resolve(design, LIGHT_THEME);

    expect(result.appearance).toBe('underline');
  });

  it('includes_focusStyle_whenFieldDesignHasFocusStyle', () => {
    const focusStyle = { boxShadow: '0 0 0 2px blue' };
    const design = makeFieldDesign({ focusStyle });

    const result = ComponentStyleResolver.resolve(design, LIGHT_THEME);

    expect(result.style).toEqual(focusStyle);
  });

  it('returns_undefinedStyle_whenNoFocusStyle', () => {
    const design = makeFieldDesign({ focusStyle: undefined });

    const result = ComponentStyleResolver.resolve(design, LIGHT_THEME);

    expect(result.style).toBeUndefined();
  });
});
