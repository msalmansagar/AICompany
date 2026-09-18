/**
 * The CRM context a web resource runs inside.
 *
 * A workspace hosted as a Dynamics web resource does not know its own organisation URL, its API
 * version or who is looking at it until it asks the host. Everything here asks; nothing is assumed,
 * and nothing is hard-coded — the API version in particular, because on-premises answers `9.1` and
 * Dataverse answers `9.2`, and Phase 1 recorded a defect (KI-02) caused by assuming the latter.
 */

/** The slice of the Dynamics client API this workspace uses. Deliberately small. */
export interface XrmGlobalContext {
  getClientUrl(): string;
  getVersion(): string;
  userSettings: {
    userId: string;
    userName: string;
    languageId: number;
    securityRoles?: string[];
  };
  organizationSettings?: {
    uniqueName?: string;
    organizationId?: string;
  };
}

export interface XrmWebApi {
  retrieveRecord(entityLogicalName: string, id: string, options?: string): Promise<Record<string, unknown>>;
  retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string,
    maxPageSize?: number,
  ): Promise<{ entities: Record<string, unknown>[]; nextLink?: string }>;
  createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<{ id: string }>;
  updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<{ id: string }>;
  execute?(request: unknown): Promise<Response>;
}

export interface XrmLike {
  Utility: { getGlobalContext(): XrmGlobalContext };
  WebApi: XrmWebApi;
  Navigation?: unknown;
}

export class CrmContextError extends Error {
  constructor(message: string, readonly kind: 'NoHost' | 'NoContext' | 'Malformed') {
    super(message);
    this.name = 'CrmContextError';
  }
}

/** What the workspace needs to know about where it is running. */
export interface CrmContext {
  /** Organisation URL, from the host. Never a constant. */
  clientUrl: string;
  /** `9.1` on-premises, `9.2` on Dataverse — read, not assumed (KI-02). */
  apiVersion: string;
  /** `https://org.crm4.dynamics.com/api/data/v9.2` — composed from the two above. */
  apiBase: string;
  userId: string;
  userName: string;
  languageId: number;
  securityRoleIds: readonly string[];
  organizationUniqueName?: string;
}

/**
 * Finds the Dynamics client API.
 *
 * A full-page web resource runs in an iframe whose parent carries `Xrm`, so `window.Xrm` alone is not
 * enough — this is the exact trap that produced a blank Form Engine designer: the page works at the
 * raw `/WebResources/` path and fails at `main.aspx`, which is the only URL a user ever opens.
 * `parent` is therefore checked first, then `window`.
 */
export function findXrm(win: Window = window): XrmLike | null {
  const candidates: unknown[] = [];
  try { candidates.push((win.parent as unknown as { Xrm?: unknown })?.Xrm); } catch { /* cross-origin parent */ }
  candidates.push((win as unknown as { Xrm?: unknown }).Xrm);
  try { candidates.push((win.top as unknown as { Xrm?: unknown })?.Xrm); } catch { /* cross-origin top */ }

  for (const candidate of candidates) {
    if (isXrm(candidate)) return candidate;
  }
  return null;
}

function isXrm(value: unknown): value is XrmLike {
  if (value === null || typeof value !== 'object') return false;
  const x = value as Partial<XrmLike>;
  return typeof x.Utility?.getGlobalContext === 'function' && typeof x.WebApi?.retrieveMultipleRecords === 'function';
}

/** Normalises the version the host reports (`9.2.24091.xxxxx`) to the `9.2` the API path wants. */
export function toApiVersion(rawVersion: string): string {
  const match = /^(\d+)\.(\d+)/.exec(rawVersion.trim());
  if (!match) {
    throw new CrmContextError(
      `The host reported version '${rawVersion}', which is not of the form 9.x. The API path cannot be composed from it.`,
      'Malformed');
  }
  return `${match[1]}.${match[2]}`;
}

/** Reads the context from the host, or explains precisely what was missing. */
export function readCrmContext(xrm: XrmLike | null = findXrm()): CrmContext {
  if (!xrm) {
    throw new CrmContextError(
      'No Dynamics client API was found on window, parent or top. This workspace is hosted as a CRM web ' +
      'resource and has no standalone mode: open it through main.aspx rather than a direct /WebResources/ URL.',
      'NoHost');
  }

  let global: XrmGlobalContext;
  try {
    global = xrm.Utility.getGlobalContext();
  } catch (error) {
    throw new CrmContextError(
      `The host exposed Xrm but getGlobalContext() failed: ${error instanceof Error ? error.message : String(error)}`,
      'NoContext');
  }

  const clientUrl = global.getClientUrl().replace(/\/+$/, '');
  const apiVersion = toApiVersion(global.getVersion());

  return {
    clientUrl,
    apiVersion,
    apiBase: `${clientUrl}/api/data/v${apiVersion}`,
    userId: normaliseId(global.userSettings.userId),
    userName: global.userSettings.userName,
    languageId: global.userSettings.languageId,
    securityRoleIds: (global.userSettings.securityRoles ?? []).map(normaliseId),
    ...(global.organizationSettings?.uniqueName !== undefined
      ? { organizationUniqueName: global.organizationSettings.uniqueName }
      : {}),
  };
}

/** The client API returns ids wrapped in braces; every other surface wants them bare. */
export function normaliseId(id: string): string {
  return id.replace(/[{}]/g, '').toLowerCase();
}
