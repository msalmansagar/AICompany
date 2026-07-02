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

  /**
   * Opens the published form in the runtime. In-CRM: the qdb_form_runtime.html web resource
   * (reads ?data=<formDefinitionGuid>) — the same mechanism the ribbon Open command uses.
   * Local dev: the portal runtime on the same machine.
   */
  openFormRuntime(formDefinitionId: string, formCode: string): void {
    const id = formDefinitionId.replace(/[{}]/g, '');
    if (this.xrm) {
      this.xrm.Navigation.openWebResource('qdb_form_runtime.html', { height: 900, width: 1200 }, id);
      return;
    }
    // Local dev: open the SAME in-CRM runtime web resource on the cloud org, in a popup
    // window (matches the CRM form's Open command). Requires the user to be signed in to CRM.
    const popupFeatures = 'popup,width=1200,height=900';
    const dataverseUrl = import.meta.env.VITE_DATAVERSE_URL as string | undefined;
    if (dataverseUrl) {
      const runtimeUrl = `${dataverseUrl.replace(/\/$/, '')}/WebResources/qdb_form_runtime.html?data=${id}`;
      window.open(runtimeUrl, 'qdbFormRuntime', popupFeatures);
      return;
    }
    // Fallback (no org URL configured): the portal runtime, still as a popup.
    const portalBase = import.meta.env.VITE_PORTAL_BASE_URL ?? 'http://localhost:3000';
    window.open(`${portalBase}/forms/${encodeURIComponent(formCode)}`, 'qdbFormRuntime', popupFeatures);
  }

  /**
   * Returns true when running in standalone REST mode (outside Dynamics CRM UCI).
   * CRM custom actions (executeAction) are not available in REST mode.
   */
  isRestMode(): boolean {
    return this.xrm === null;
  }

  getUserContext(): CrmUserContext {
    if (this.xrm) {
      const globalContext = this.xrm.Utility.getGlobalContext();
      const rawUserId = globalContext.getUserId();
      if (!rawUserId) {
        throw new CrmContextError(
          'Xrm.Utility.getGlobalContext().getUserId() returned empty. Cannot record audit actor.'
        );
      }
      // getUserId() wraps the GUID in curly braces — strip them for OData compatibility
      const userId = rawUserId.replace(/[{}]/g, '');
      const userFullName = globalContext.getUserName() || userId;
      return { userId, userName: userId, userFullName };
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
