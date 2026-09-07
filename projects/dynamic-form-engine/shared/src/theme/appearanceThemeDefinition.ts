// An appearance, expressed as a ThemeDefinition the form runtime can render.
//
// The runtime themes a form from the customer's ThemeDefinition in CRM, and that
// keeps owning any form they have styled. But most forms have never been styled
// and fall back to a built-in default, and those should follow the appearance the
// user chose rather than staying stubbornly light inside a dark application.
//
// So this states an appearance in the runtime's own vocabulary. It is applied
// only where no customer theme exists — branding is never overridden.

import type { ThemeDefinition } from '../types/design.types.js';
import { APPEARANCE_PALETTES, type AppearanceName } from './appearancePalettes.js';

const FONT_FAMILY = '"Segoe UI", system-ui, sans-serif';

/**
 * The appearance as a ThemeDefinition.
 *
 * `surfaceColor` takes the raised surface rather than the plain one: under glass
 * the plain surface is translucent, and a form is read against the page rather
 * than floating over more of itself.
 */
export function appearanceThemeDefinition(name: AppearanceName): ThemeDefinition {
  const palette = APPEARANCE_PALETTES[name];

  return {
    id: `appearance-${name}`,
    themeCode: name,
    themeName: `${name[0].toUpperCase()}${name.slice(1)} appearance`,
    primaryColor: palette.primary,
    secondaryColor: palette.primaryHover,
    backgroundColor: palette.bg,
    surfaceColor: palette.surfaceRaised,
    textPrimaryColor: palette.text,
    textSecondaryColor: palette.textSecondary,
    borderColor: palette.border,
    errorColor: palette.error,
    successColor: palette.success,
    warningColor: palette.warning,
    fontFamily: FONT_FAMILY,
    baseFontSize: '14px',
    borderRadius: palette.radiusLg,
    shadowStyle: 'Subtle',
    spacingScale: 'Normal',
    isDarkMode: palette.isDark,
    isActive: true,
  };
}
