/**
 * Token slugs whose Dataverse value is stored as `"true"` / `"false"` but must
 * be emitted as numeric CSS values `1` / `0` (ADR-003-005).
 *
 * CSS `scaleX(var(--icon-mirror))` requires a number, not a string boolean.
 */
export const BOOLEAN_TOKEN_SLUGS: Set<string> = new Set(['icon-mirror']);

/**
 * Converts a raw Dataverse token value to a CSS-safe string.
 *
 * For boolean token slugs (e.g. `icon-mirror`): maps `"true"` → `"1"` and
 * anything else → `"0"`. For all other slugs: returns the value unchanged.
 *
 * Pure function — no side effects.
 */
export function toCSSSafeValue(slug: string, value: string): string {
  if (!BOOLEAN_TOKEN_SLUGS.has(slug)) return value;
  return value === 'true' ? '1' : '0';
}

/**
 * Converts a resolved token map to a CSS custom property block suitable for
 * embedding inside a `:root { ... }` rule.
 *
 * Applies ADR-003-005 conversion for boolean token slugs before emitting.
 *
 * Pure function — no side effects.
 *
 * @example
 * buildCSSCustomProperties({ 'color-primary': '#1a4d8f', 'icon-mirror': 'true' })
 * // Returns: "--color-primary: #1a4d8f; --icon-mirror: 1;"
 */
export function buildCSSCustomProperties(
  tokenMap: Record<string, string>,
): string {
  return Object.entries(tokenMap)
    .map(([slug, value]) => `--${slug}: ${toCSSSafeValue(slug, value)};`)
    .join(' ');
}
