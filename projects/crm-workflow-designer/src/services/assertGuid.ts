const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Throws if value is not a valid GUID.
 * Call before any ID is used in a URL or $filter string.
 */
export function assertGuid(value: string, param: string): void {
  if (!GUID_RE.test(value)) {
    throw new Error(`Invalid GUID for "${param}": "${value}"`);
  }
}

/** Returns true if the string looks like a temporary ID (tmp_xxx). */
export function isTemporaryId(id: string): boolean {
  return id.startsWith('tmp_');
}
