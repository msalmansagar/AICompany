/**
 * Utility functions for Form Code derivation and sanitization.
 *
 * The Form Code identifies a form in the DFE runtime. It must be URL-safe
 * and consist of lowercase letters, digits, and hyphens only.
 *
 * Two operations are provided:
 *   - `slugifyFormCode`  — converts a human-readable Form Name to a valid code
 *                          (used for auto-derive while the user has not manually
 *                          edited the Code field)
 *   - `sanitizeFormCode` — strips disallowed characters from a code string as the
 *                          user types directly in the Code input
 */

const MAX_CODE_LENGTH = 50;

/**
 * Derives a Form Code from a Form Name.
 *
 * Algorithm (per FR-012(a) architecture spec §2.8.1):
 *   1. Lowercase the input.
 *   2. Replace every sequence of characters that are not [a-z0-9] with a single hyphen.
 *      Existing hyphens collapse with adjacent non-alphanumeric characters into one hyphen.
 *   3. Strip any leading or trailing hyphens produced by the replacement.
 *   4. Truncate to MAX_CODE_LENGTH characters.
 *
 * Example: "Loan Application Form (2026)" → "loan-application-form-2026"
 */
export function slugifyFormCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_CODE_LENGTH);
}

/**
 * Sanitizes a Form Code string entered directly by the user.
 *
 * Replaces every character outside [a-z0-9-] with a hyphen so that the user
 * can see in real-time which characters are disallowed. Intentionally does NOT
 * collapse consecutive hyphens — the user retains full control over spacing
 * once they have taken manual ownership of the field.
 */
export function sanitizeFormCode(rawCode: string): string {
  return rawCode
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
}
