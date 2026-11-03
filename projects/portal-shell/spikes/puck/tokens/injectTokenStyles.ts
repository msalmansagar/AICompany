/**
 * Token map → CSS custom properties.
 *
 * Copied deliberately from portal-shell's
 * `apps/web/src/lib/tokens/injectTokenStyles.ts` so the spike proves the real
 * naming convention: slug `font-family-base` becomes `--font-family-base`.
 */

/**
 * Read-time value guard. The API already sanitises via `sanitiseResolvedMap`;
 * this repeats the essential part so the spike is safe standalone.
 *
 * Note `url(` is neutralised — that is the constraint that forces @font-face
 * out of the token system and into a static stylesheet.
 */
function toCSSSafeValue(value: string): string {
  return value
    .replace(/;/g, '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/url\s*\(/gi, 'url-blocked(')
    .replace(/expression\s*\(/gi, 'expression-blocked(');
}

/**
 * Builds the declaration list for a `:root { … }` block.
 * Pure function — no side effects.
 */
export function buildCSSCustomProperties(tokenMap: Record<string, string>): string {
  return Object.entries(tokenMap)
    .map(([slug, value]) => `--${slug}: ${toCSSSafeValue(value)};`)
    .join(' ');
}
