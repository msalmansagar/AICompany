const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertGuid(value: string, paramName: string): void {
  if (!GUID_RE.test(value)) {
    throw new Error(`Invalid GUID for parameter "${paramName}": "${value}"`);
  }
}
