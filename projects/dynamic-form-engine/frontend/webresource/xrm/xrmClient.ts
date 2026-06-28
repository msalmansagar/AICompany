// Thin wrapper over Xrm.WebApi for the in-CRM form-engine web resource.
// Replaces the portal's axios apiClient — all data flows through the CRM Web API,
// so the web resource is self-contained (no external backend at runtime).

interface XrmExecuteResponse {
  ok: boolean;
  json(): Promise<Record<string, unknown>>;
}
type XrmExecute = (request: unknown) => Promise<XrmExecuteResponse>;

// Minimal Xrm surface we depend on (avoids a full @types/xrm dependency).
interface XrmWebApi {
  retrieveMultipleRecords(entityLogicalName: string, options?: string, maxPageSize?: number): Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>;
  retrieveRecord(entityLogicalName: string, id: string, options?: string): Promise<Record<string, unknown>>;
  createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<{ id: string }>;
  updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<{ id: string }>;
  deleteRecord(entityLogicalName: string, id: string): Promise<{ id: string }>;
  execute?: XrmExecute;
  online?: { execute: XrmExecute };
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

/** A single typed argument for an unbound CRM action. structuralProperty 1 = primitive. */
export interface ActionParameter {
  value: unknown;
  typeName: string;
  structuralProperty: number;
}

/**
 * Invokes an unbound (global) CRM action via Xrm.WebApi and returns its parsed response.
 * Uses online.execute where present, falling back to the cross-client execute, so the same
 * call works in a model-driven iframe and an on-prem openWebResource window.
 */
export async function executeUnboundAction(
  actionName: string,
  parameters: Record<string, ActionParameter>,
): Promise<Record<string, unknown>> {
  const api = webApi();
  const execute = api.online?.execute ?? api.execute;
  if (!execute) {
    throw new Error('Xrm.WebApi.execute is unavailable — this page must run as a CRM web resource.');
  }

  const parameterTypes: Record<string, { typeName: string; structuralProperty: number }> = {};
  const request: Record<string, unknown> = {
    getMetadata: () => ({
      boundParameter: null,
      operationType: 0,
      operationName: actionName,
      parameterTypes,
    }),
  };
  for (const [name, parameter] of Object.entries(parameters)) {
    request[name] = parameter.value;
    parameterTypes[name] = { typeName: parameter.typeName, structuralProperty: parameter.structuralProperty };
  }

  const response = await execute.call(api.online ?? api, request);
  return response.json();
}

/** Strips braces from a CRM GUID so it can be used in OData URLs / bindings. */
export function cleanGuid(id: string): string {
  return id.replace(/[{}]/g, '').toLowerCase();
}
