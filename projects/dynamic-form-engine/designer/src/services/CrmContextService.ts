import type { IWebApiAdapter } from './IWebApiAdapter';
import { CrmWebApiAdapter } from './CrmWebApiAdapter';
import { RestWebApiAdapter } from './RestWebApiAdapter';

export class CrmContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmContextError';
  }
}

export interface CrmUserContext {
  userId: string;
  userName: string;
  userFullName: string;
}

export class CrmContextService {
  private readonly webApiAdapter: IWebApiAdapter;
  private readonly xrm: typeof Xrm | null;

  constructor(xrm: typeof Xrm | null, authToken: string | null = null) {
    this.xrm = xrm;
    this.webApiAdapter = xrm
      ? new CrmWebApiAdapter(xrm.WebApi)
      : new RestWebApiAdapter(authToken);
  }

  getWebApi(): IWebApiAdapter {
    return this.webApiAdapter;
  }

  getClientUrl(): string {
    if (this.xrm) {
      return this.xrm.Utility.getGlobalContext().getClientUrl();
    }
    return import.meta.env.VITE_API_BASE_URL ?? '';
  }

  getUserContext(): CrmUserContext {
    if (this.xrm) {
      const userId = (this.xrm as unknown as { Page?: { context?: { getUserId?: () => string } } })
        ?.Page?.context?.getUserId?.() ?? 'unknown';
      return { userId, userName: userId, userFullName: 'Current User' };
    }
    return { userId: 'rest-mode-user', userName: 'rest-mode-user', userFullName: 'REST Mode User' };
  }
}

/**
 * Factory that acquires Xrm context from the web resource iframe, or falls back to
 * REST mode when VITE_USE_REST_API=true (local dev / standalone).
 */
export function createCrmContextService(): CrmContextService {
  if (import.meta.env.VITE_USE_REST_API === 'true') {
    return new CrmContextService(null);
  }

  if (typeof Xrm !== 'undefined') {
    return new CrmContextService(Xrm);
  }

  if (
    typeof window !== 'undefined' &&
    window.parent &&
    typeof window.parent.Xrm !== 'undefined'
  ) {
    return new CrmContextService(window.parent.Xrm);
  }

  throw new CrmContextError(
    'Xrm context not available. Ensure this web resource runs inside Dynamics CRM UCI, or set VITE_USE_REST_API=true for standalone mode.'
  );
}
