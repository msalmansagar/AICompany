import { IPublicClientApplication } from '@azure/msal-browser';
import { loginRequest, msalInstance } from './msalConfig';

/**
 * Acquires a Bearer token silently, falling back to interaction on failure.
 * Operates on the module-level msalInstance so it can be called outside
 * React component context (e.g., from the axios interceptor).
 */
export async function acquireBearerToken(
  pca: IPublicClientApplication = msalInstance,
): Promise<string> {
  if (import.meta.env.VITE_SKIP_AUTH === 'true') {
    return 'dev-bypass-token';
  }

  const accounts = pca.getAllAccounts();

  if (accounts.length === 0) {
    await pca.loginPopup(loginRequest);
    return acquireBearerToken(pca);
  }

  const result = await pca.acquireTokenSilent({
    ...loginRequest,
    account: accounts[0],
  });

  return result.accessToken;
}
