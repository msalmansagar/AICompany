// The rule that keeps the two theme systems from fighting.
//
// Appearance themes the application. The customer's ThemeDefinition themes the
// form. Where a form has no theme of its own the runtime serves a built-in
// fallback, and only those follow the appearance — otherwise picking Dark would
// quietly repaint a bank's branded form, which is a defect, not a feature.

import { describe, it, expect } from 'vitest';
import {
  appearanceThemeDefinition,
  APPEARANCE_NAMES,
  APPEARANCE_PALETTES,
  fluentTokenOverrides,
  isAppearanceName,
} from '@qdb/shared';
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

// ThemeProvider decides whether to restate the design system's neutrals on Fluent
// by looking at the theme's id prefix and themeCode. That is a contract between two
// files, so it is asserted rather than assumed — a renamed id would silently send
// every form back to Fluent's stock neutrals.
describe('an appearance theme is recognisable to ThemeProvider', () => {
  for (const appearance of APPEARANCE_NAMES) {
    it(`identifies_${appearance}_by_id_prefix_and_theme_code`, () => {
      const theme = appearanceThemeDefinition(appearance);

      expect(theme.id.startsWith('appearance-')).toBe(true);
      expect(isAppearanceName(theme.themeCode)).toBe(true);
    });
  }

  it('does_not_mistake_a_customer_theme_for_an_appearance', () => {
    expect(CORPORATE_QDB_THEME.id.startsWith('appearance-')).toBe(false);
  });

  it('restates_the_dark_surface_Fluent_would_otherwise_get_wrong', () => {
    // Fluent's own dark surface is #292929; the design system's is #292827. One
    // shade apart, which reads as a rendering fault rather than a choice.
    expect(fluentTokenOverrides(APPEARANCE_PALETTES.dark).colorNeutralBackground1).toBe('#292827');
  });
});
