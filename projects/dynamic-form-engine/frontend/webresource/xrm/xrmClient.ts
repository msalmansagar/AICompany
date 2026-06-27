// Thin wrapper over Xrm.WebApi for the in-CRM form-engine web resource.
// Replaces the portal's axios apiClient — all data flows through the CRM Web API,
// so the web resource is self-contained (no external backend at runtime).
import { ungzip } from 'pako';

// Minimal Xrm surface we depend on (avoids a full @types/xrm dependency).
interface XrmWebApi {
  retrieveMultipleRecords(entityLogicalName: string, options?: string): Promise<{ entities: Record<string, unknown>[] }>;
  retrieveRecord(entityLogicalName: string, id: string, options?: string): Promise<Record<string, unknown>>;
  createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<{ id: string }>;
  updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<{ id: string }>;
  deleteRecord(entityLogicalName: string, id: string): Promise<{ id: string }>;
}
interface XrmGlobal { WebApi: XrmWebApi; }
declare global {
  // eslint-disable-next-line no-var
  var Xrm: XrmGlobal | undefined;
}

/** Returns the CRM Web API, or throws when the web resource is not hosted inside CRM. */
export function webApi(): XrmWebApi {
  const xrm = (window.parent as unknown as { Xrm?: XrmGlobal }).Xrm ?? globalThis.Xrm;
  if (!xrm?.WebApi) {
    throw new Error('Xrm.WebApi is unavailable — this page must run as a CRM web resource.');
  }
  return xrm.WebApi;
}

/** Decodes the render-cache payload: Base64 → (optional) gunzip → JSON string. */
export function decodeRuntimeJson(base64: string, isCompressed: boolean): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (!isCompressed) return new TextDecoder().decode(bytes);
  return ungzip(bytes, { to: 'string' });
}

/** Strips braces from a CRM GUID so it can be used in OData URLs / bindings. */
export function cleanGuid(id: string): string {
  return id.replace(/[{}]/g, '').toLowerCase();
}
