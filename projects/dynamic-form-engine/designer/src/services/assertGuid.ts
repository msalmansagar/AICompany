const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can address a Dataverse record. Use where a non-GUID is expected and survivable. */
export function isGuid(value: string): boolean {
  return GUID_RE.test(value);
}

export function assertGuid(value: string, paramName: string): void {
  if (!isGuid(value)) {
    throw new Error(`Invalid GUID for parameter "${paramName}": "${value}"`);
  }
}
