// RED — failing (written before implementation per TDD mandate)
import { describe, it, expect } from 'vitest';
import {
  BOOLEAN_TOKEN_SLUGS,
  toCSSSafeValue,
  buildCSSCustomProperties,
} from './injectTokenStyles';

// ── toCSSSafeValue ────────────────────────────────────────────────────────────

describe('toCSSSafeValue', () => {
  describe('icon-mirror (boolean token slug — ADR-003-005)', () => {
    it('should_convert_true_to_1_for_icon_mirror', () => {
      expect(toCSSSafeValue('icon-mirror', 'true')).toBe('1');
    });

    it('should_convert_false_to_0_for_icon_mirror', () => {
      expect(toCSSSafeValue('icon-mirror', 'false')).toBe('0');
    });

    it('should_convert_unknown_value_to_0_for_icon_mirror', () => {
      // Any non-"true" value for a boolean slug collapses to "0"
      expect(toCSSSafeValue('icon-mirror', 'yes')).toBe('0');
    });
  });

  describe('non-boolean token slugs', () => {
    it('should_return_value_unchanged_for_color_token', () => {
      expect(toCSSSafeValue('color-primary', '#1a4d8f')).toBe('#1a4d8f');
    });

    it('should_return_value_unchanged_for_spacing_token', () => {
      expect(toCSSSafeValue('spacing-md', '16px')).toBe('16px');
    });

    it('should_return_value_unchanged_for_text_direction_token', () => {
      // text-direction is NOT in BOOLEAN_TOKEN_SLUGS; stored as "rtl"/"ltr"
      expect(toCSSSafeValue('text-direction', 'rtl')).toBe('rtl');
    });

    it('should_return_value_unchanged_for_font_family_token', () => {
      const fontValue = "'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif";
      expect(toCSSSafeValue('font-family-body', fontValue)).toBe(fontValue);
    });
  });

  describe('BOOLEAN_TOKEN_SLUGS set', () => {
    it('should_contain_icon_mirror', () => {
      expect(BOOLEAN_TOKEN_SLUGS.has('icon-mirror')).toBe(true);
    });

    it('should_not_contain_text_direction', () => {
      // text-direction is a direction token but its value is already CSS-safe
      expect(BOOLEAN_TOKEN_SLUGS.has('text-direction')).toBe(false);
    });
  });
});

// ── buildCSSCustomProperties ──────────────────────────────────────────────────

describe('buildCSSCustomProperties', () => {
  it('should_generate_css_custom_property_for_single_token', () => {
    const result = buildCSSCustomProperties({ 'color-primary': '#1a4d8f' });
    expect(result).toBe('--color-primary: #1a4d8f;');
  });

  it('should_generate_multiple_css_custom_properties_separated_by_space', () => {
    const result = buildCSSCustomProperties({
      'color-primary': '#1a4d8f',
      'spacing-md': '16px',
    });
    expect(result).toBe('--color-primary: #1a4d8f; --spacing-md: 16px;');
  });

  it('should_apply_adr_003_005_conversion_for_icon_mirror_true', () => {
    const result = buildCSSCustomProperties({ 'icon-mirror': 'true' });
    expect(result).toBe('--icon-mirror: 1;');
  });

  it('should_apply_adr_003_005_conversion_for_icon_mirror_false', () => {
    const result = buildCSSCustomProperties({ 'icon-mirror': 'false' });
    expect(result).toBe('--icon-mirror: 0;');
  });

  it('should_not_convert_non_boolean_tokens_alongside_icon_mirror', () => {
    const result = buildCSSCustomProperties({
      'color-primary': '#1a4d8f',
      'icon-mirror': 'true',
      'text-direction': 'rtl',
    });

    expect(result).toContain('--color-primary: #1a4d8f;');
    expect(result).toContain('--icon-mirror: 1;');
    expect(result).toContain('--text-direction: rtl;');
  });

  it('should_return_empty_string_for_empty_token_map', () => {
    expect(buildCSSCustomProperties({})).toBe('');
  });

  it('should_prefix_each_slug_with_double_dash', () => {
    const result = buildCSSCustomProperties({ 'font-size-body': '16px' });
    expect(result.startsWith('--')).toBe(true);
  });
});
