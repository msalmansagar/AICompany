import { DevXrmWebApiShim } from './DevXrmWebApiShim';
import type { XrmPort } from './DevXrmWebApiShim';

export type { XrmPort };

const ONLINE_URL_PATTERNS = [
  '.dynamics.com',
  '.microsoftdynamics.de',
  '.dynamics.cn',
  '.appsplatform.us',
];

export class CrmContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmContextError';
  }
}

export class CrmEnvironmentService {
  private readonly xrm: typeof Xrm | null;
  private readonly devShim: DevXrmWebApiShim | null;
  readonly isDevMode: boolean;

  constructor() {
    try {
      this.xrm = resolveXrm();
      this.devShim = null;
      this.isDevMode = false;
    } catch (err) {
      // In Vite dev mode fall back to the fetch-based shim instead of crashing.
      if (!import.meta.env.DEV) throw err;
      this.xrm = null;
      this.devShim = new DevXrmWebApiShim();
      this.isDevMode = true;
    }
  }

  // Returns the narrow WebApi interface — same shape whether CRM or local dev.
  getXrm(): XrmPort {
    if (this.devShim) {
      return { WebApi: this.devShim };
    }
    // Safe cast: real Xrm.WebApi satisfies XrmPort.WebApi.
    return this.xrm as unknown as XrmPort;
  }

  // Returns the full Xrm object for adapters that need write operations.
  // Throws in dev mode — write operations always require a real CRM session.
  getCrmXrm(): typeof Xrm {
    if (!this.xrm) throw new CrmContextError('Write operations require CRM context (not available in dev mode).');
    return this.xrm;
  }

  isOnline(): boolean {
    if (this.isDevMode) return true;
    const clientUrl = this.getClientUrl().toLowerCase();
    const versionSignalsOnline = this.detectOnlineFromVersion();
    if (versionSignalsOnline !== null) return versionSignalsOnline;
    return ONLINE_URL_PATTERNS.some((pattern) => clientUrl.includes(pattern));
  }

  getApiVersion(): string {
    return 'v9.2';
  }

  getClientUrl(): string {
    if (this.isDevMode) return 'https://org5869857f.crm4.dynamics.com';
    return this.xrm!.Utility.getGlobalContext().getClientUrl();
  }

  getUserContext(): { userId: string; userName: string; orgName: string } {
    if (this.isDevMode) return { userId: 'dev', userName: 'Dev User', orgName: 'dev' };
    const ctx = this.xrm!.Utility.getGlobalContext();
    return {
      userId: ctx.getUserId().replace(/[{}]/g, ''),
      userName: ctx.getUserName(),
      orgName: ctx.getOrgUniqueName(),
    };
  }

  getObjectTypeCode(entityLogicalName: string): Promise<number> {
    return fetchObjectTypeCode(this.getClientUrl(), this.getApiVersion(), entityLogicalName);
  }

  private detectOnlineFromVersion(): boolean | null {
    try {
      const version = this.xrm!.Utility.getGlobalContext().getVersion();
      if (!version) return null;
      const major = parseInt(version.split('.')[0] ?? '0', 10);
      return major >= 9 ? null : false;
    } catch {
      return null;
    }
  }
}

function resolveXrm(): typeof Xrm {
  const parentXrm = (window.parent as Window & { Xrm?: typeof Xrm }).Xrm;
  if (parentXrm) return parentXrm;
  const selfXrm = (window as Window & { Xrm?: typeof Xrm }).Xrm;
  if (selfXrm) return selfXrm;
  throw new CrmContextError(
    'Xrm context not found. This page must be loaded as a CRM web resource.'
  );
}

async function fetchObjectTypeCode(
  clientUrl: string,
  apiVersion: string,
  entityLogicalName: string
): Promise<number> {
  const url =
    `${clientUrl}/api/data/${apiVersion}/EntityDefinitions` +
    `?$select=ObjectTypeCode&$filter=LogicalName eq '${entityLogicalName}'`;

  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ObjectTypeCode for ${entityLogicalName}: ${response.status}`);
  }

  const data = (await response.json()) as { value: Array<{ ObjectTypeCode: number }> };
  const first = data.value[0];
  if (!first) throw new Error(`Entity not found: ${entityLogicalName}`);
  return first.ObjectTypeCode;
}
