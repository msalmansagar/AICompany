// CRM context acquisition service.
// Safely obtains the Xrm context from the current window or parent frame.
// Throws a typed error if context is unavailable — never returns null.

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
  private readonly xrm: typeof Xrm;

  constructor(xrm: typeof Xrm) {
    this.xrm = xrm;
  }

  getWebApi(): typeof Xrm.WebApi {
    return this.xrm.WebApi;
  }

  getClientUrl(): string {
    return this.xrm.Utility.getGlobalContext().getClientUrl();
  }

  getUserContext(): CrmUserContext {
    // In web resource context, user context is available via global Xrm
    // This is a safe pattern for UCI web resources
    const userId = (this.xrm as unknown as { Page?: { context?: { getUserId?: () => string } } })
      ?.Page?.context?.getUserId?.() ?? 'unknown';
    return {
      userId,
      userName: userId,
      userFullName: 'Current User',
    };
  }
}

/**
 * Factory function that safely acquires Xrm context from the web resource iframe environment.
 * Checks current window first, then parent frame (CRM UCI pattern).
 */
export function createCrmContextService(): CrmContextService {
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
    'Xrm context not available. Ensure this web resource runs inside Dynamics CRM UCI.'
  );
}
