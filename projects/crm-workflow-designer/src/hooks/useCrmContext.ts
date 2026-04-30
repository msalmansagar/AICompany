import type { CrmContext } from '../types/CrmTypes';

declare global {
  interface Window {
    Xrm?: XrmStub;
  }
}

interface XrmStub {
  Page?: {
    data?: {
      entity: {
        getId: () => string;
        getEntityName: () => string;
      };
    };
    context?: {
      getUserId: () => string;
      getClientUrl: () => string;
    };
  };
}

export function readCrmContext(): CrmContext {
  const xrm = window.Xrm ?? (window.parent as Window | null)?.Xrm;
  const orgUrl = resolveOrgUrl(xrm);

  if (xrm?.Page?.data && xrm.Page.context) {
    return {
      recordId: stripBraces(xrm.Page.data.entity.getId()),
      entityName: xrm.Page.data.entity.getEntityName(),
      userId: stripBraces(xrm.Page.context.getUserId()),
      orgUrl,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    recordId: params.get('recordId'),
    entityName: params.get('entityName'),
    userId: null,
    orgUrl,
  };
}

function resolveOrgUrl(xrm: XrmStub | undefined): string {
  if (xrm?.Page?.context) {
    return xrm.Page.context.getClientUrl();
  }
  return window.location.origin;
}

function stripBraces(id: string): string {
  return id.replace(/[{}]/g, '');
}
