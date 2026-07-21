/**
 * Escapes a user-supplied value for safe interpolation into an OData string
 * literal. Doubles single quotes (OData's own literal-escape) and then
 * URL-encodes, so free-text search input cannot terminate the quoted value or
 * inject additional query clauses into a `$filter`.
 */
export function escapeODataLiteral(value: string): string {
  return encodeURIComponent(value.replace(/'/g, "''"));
}
