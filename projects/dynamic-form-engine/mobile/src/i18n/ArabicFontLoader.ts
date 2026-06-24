/**
 * ArabicFontLoader — loads the Arabic font assets via expo-font when Arabic
 * is the active language (FR-018).
 *
 * Uses expo-font (bundled in Expo SDK) to load Fontsource Cairo font files.
 * Font loading does not block the initial render — expo-font loads asynchronously.
 *
 * WHY Cairo: variable-weight font covering both Arabic and Latin scripts in one
 * family (per dependencies-i18n.md ADOPT decision). If @fontsource-variable/cairo
 * is installed in the project, its raw font files are available as assets.
 *
 * FONT INSTALLATION NOTE (C-002 path):
 *   Run: npm install @fontsource-variable/cairo @fontsource/noto-sans-arabic
 *   The font files are loaded from the npm package's files/ directory.
 *   Until installed, loadArabicFonts() returns false gracefully (system font fallback).
 */
import * as Font from 'expo-font';

let fontsLoaded = false;

/**
 * Loads Arabic font assets asynchronously. Safe to call multiple times —
 * no-ops after first successful load.
 *
 * Returns true if fonts loaded, false if packages not installed (graceful
 * degradation to system Arabic font).
 */
export async function loadArabicFonts(): Promise<boolean> {
  if (fontsLoaded) return true;

  try {
    // Attempt to load Cairo from @fontsource-variable/cairo if installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cairoRegular = require('@fontsource-variable/cairo/files/cairo-arabic-wght-normal.woff2');
    await Font.loadAsync({
      'Cairo-Regular': cairoRegular,
    });
    fontsLoaded = true;
    return true;
  } catch {
    // Package not installed or font file path changed — fall back to system font.
    // The app continues working with the default system Arabic font.
    return false;
  }
}

/** Returns whether Arabic fonts have been loaded by this module. */
export function areArabicFontsLoaded(): boolean {
  return fontsLoaded;
}

/**
 * Resets the loaded flag (for testing only).
 * @internal
 */
export function resetFontLoadedState(): void {
  fontsLoaded = false;
}
