// The rule that keeps the two theme systems from fighting.
//
// Appearance themes the application. The customer's ThemeDefinition themes the
// form. Where a form has no theme of its own the runtime serves a built-in
// fallback, and only those follow the appearance — otherwise picking Dark would
// quietly repaint a bank's branded form, which is a defect, not a feature.

import { describe, it, expect } from 'vitest';
import { appearanceThemeDefinition, APPEARANCE_NAMES } from '@qdb/shared';
import { LIGHT_THEME, DARK_THEME, CORPORATE_QDB_THEME, isBuiltInDefaultTheme } from './themes';

describe('isBuiltInDefaultTheme', () => {
  it('recognises_the_light_fallback', () => {
    expect(isBuiltInDefaultTheme(LIGHT_THEME)).toBe(true);
  });

  it('recognises_the_dark_fallback', () => {
    expect(isBuiltInDefaultTheme(DARK_THEME)).toBe(true);
  });

  it('does_not_claim_a_customer_authored_theme', () => {
    expect(isBuiltInDefaultTheme(CORPORATE_QDB_THEME)).toBe(false);
  });

  it('does_not_claim_an_appearance_theme_as_a_fallback_to_replace_again', () => {
    expect(isBuiltInDefaultTheme(appearanceThemeDefinition('dark'))).toBe(false);
  });
});

describe('appearanceThemeDefinition', () => {
  it('produces_a_theme_for_every_appearance_offered', () => {
    for (const appearance of APPEARANCE_NAMES) {
      expect(appearanceThemeDefinition(appearance).themeCode).toBe(appearance);
    }
  });

  it('marks_only_dark_as_dark_so_glass_and_vibrant_keep_light_text_treatments', () => {
    expect(appearanceThemeDefinition('dark').isDarkMode).toBe(true);
    expect(appearanceThemeDefinition('glass').isDarkMode).toBe(false);
    expect(appearanceThemeDefinition('vibrant').isDarkMode).toBe(false);
    expect(appearanceThemeDefinition('light').isDarkMode).toBe(false);
  });

  it('carries_the_appearance_brand_colour_onto_the_form', () => {
    expect(appearanceThemeDefinition('vibrant').primaryColor).toBe('#7c3aed');
  });

  it('takes_the_raised_surface_so_a_form_is_readable_under_glass', () => {
    // The plain glass surface is 55% translucent; a form rendered on it would be
    // read through whatever is behind the page.
    expect(appearanceThemeDefinition('glass').surfaceColor).toBe('rgba(255, 255, 255, .72)');
  });

  it('gives_every_appearance_the_text_colours_its_palette_states', () => {
    expect(appearanceThemeDefinition('dark').textPrimaryColor).toBe('#f3f2f1');
    expect(appearanceThemeDefinition('light').textPrimaryColor).toBe('#201f1e');
  });
});
