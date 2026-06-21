/**
 * cssUtils — shared CSS value sanitisation utilities.
 *
 * Used at both write time (TokenValueService.sanitizeCssValue) and read time
 * (resolve.ts, preview.ts) to prevent CSS injection through token values.
 *
 * Applying sanitisation at read time (B-003) is defence-in-depth: it protects
 * against values seeded directly into Dataverse via the provisioning script or
 * direct Dataverse writes that bypass the API write path.
 *
 * Reference: Section 13 of phase-3-arch.md, Skeptic Challenge 4.
 */

const DISALLOWED_PATTERNS = [
  { pattern: /url\s*\(/gi, replacement: 'url-blocked(' },
  { pattern: /expression\s*\(/gi, replacement: 'expression-blocked(' },
  { pattern: /import\s*\(/gi, replacement: 'import-blocked(' },
];

/**
 * Sanitises a single CSS value string at read time.
 *
 * Strips semicolons (which would terminate the CSS property and inject new rules)
 * and neutralises disallowed CSS functions (url, expression, import).
 *
 * Unlike the write-time sanitiser (TokenValueService.sanitizeCssValue), this
 * function does NOT throw — it neutralises silently. Throwing at read time would
 * break the portal for every visitor when a bad value reaches the cache.
 *
 * Pure function — no side effects.
 */
function sanitiseCssValue(value: string): string {
  let sanitised = value.replace(/;/g, '');
  for (const { pattern, replacement } of DISALLOWED_PATTERNS) {
    sanitised = sanitised.replace(pattern, replacement);
  }
  return sanitised;
}

/**
 * Applies read-time sanitisation to every value in a resolved token map.
 * Returns a new object — does not mutate the input.
 *
 * Pure function — no side effects.
 */
export function sanitiseResolvedMap(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [slug, value] of Object.entries(map)) {
    result[slug] = sanitiseCssValue(value);
  }
  return result;
}
