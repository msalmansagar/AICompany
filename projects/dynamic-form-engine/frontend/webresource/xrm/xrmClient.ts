// Thin wrapper over Xrm.WebApi for the in-CRM form-engine web resource.
// Replaces the portal's axios apiClient — all data flows through the CRM Web API,
// so the web resource is self-contained (no external backend at runtime).
import { ungzip } from 'pako';

// Minimal Xrm surface we depend on (avoids a full @types/xrm dependency).
interface XrmWebApi {
  retrieveMultipleRecords(entityLogicalName: string, options?: string, maxPageSize?: number): Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>;
  retrieveRecord(entityLogicalName: string, id: string, options?: string): Promise<Record<string, unknown>>;
  createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<{ id: string }>;
  updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<{ id: string }>;
  deleteRecord(entityLogicalName: string, id: string): Promise<{ id: string }>;
}
interface XrmGlobal {
  WebApi: XrmWebApi;
  Utility?: { getGlobalContext?: () => { getClientUrl?: () => string } };
}

function resolveXrm(): XrmGlobal | undefined {
  const hosts: Array<XrmGlobal | undefined> = [
    globalThis.Xrm,
    (window as unknown as { Xrm?: XrmGlobal }).Xrm,
    (window.parent as unknown as { Xrm?: XrmGlobal } | null)?.Xrm,
    (window.opener as unknown as { Xrm?: XrmGlobal } | null)?.Xrm,
  ];
  return hosts.find((candidate) => candidate?.WebApi);
}

/** The org Web API base URL (e.g. https://host/org/api/data/v9.2) for metadata calls Xrm.WebApi cannot make. */
export function webApiBaseUrl(): string {
  const xrm = resolveXrm();
  const clientUrl = xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.() ?? window.location.origin;
  return `${clientUrl}/api/data/v9.2`;
}
declare global {
  // eslint-disable-next-line no-var
  var Xrm: XrmGlobal | undefined;
}

/**
 * Returns the CRM Web API across every hosting mode: iframe on a form/dashboard or the
 * navigateTo dialog (window.parent), a new window opened via openWebResource on-prem
 * (window.opener), or the page itself (globalThis).
 */
export function webApi(): XrmWebApi {
  const xrm = resolveXrm();
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
