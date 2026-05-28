import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { appConfig } from '../config/appConfig';
import { logger } from '../logger';

WebBrowser.maybeCompleteAuthSession();

const SECURE_STORE_ACCESS_TOKEN  = 'qdb_access_token';
const SECURE_STORE_REFRESH_TOKEN = 'qdb_refresh_token';
const SECURE_STORE_ACCOUNT_INFO  = 'qdb_account_info';

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `https://login.microsoftonline.com/${appConfig.azureAdTenantId}/oauth2/v2.0/authorize`,
  tokenEndpoint:         `https://login.microsoftonline.com/${appConfig.azureAdTenantId}/oauth2/v2.0/token`,
  endSessionEndpoint:    `https://login.microsoftonline.com/${appConfig.azureAdTenantId}/oauth2/v2.0/logout`,
};

// Scopes must reference the backend API app registration, not this mobile client.
const API_SCOPES = [
  `api://${appConfig.backendAppClientId}/access_as_user`,
  'openid',
  'profile',
  'offline_access',
];

export interface AccountInfo {
  oid: string;
  displayName: string;
  email: string;
}

interface MsalContextValue {
  account: AccountInfo | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  acquireToken: () => Promise<string>;
  isLoading: boolean;
  authError: string | null;
}

const MsalContext = createContext<MsalContextValue | null>(null);

export function MsalProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount]     = useState<AccountInfo | null>(null);
  const [accessToken, setAccessToken]   = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'qdbforms' });
  if (__DEV__) console.log('[Auth] redirectUri =', redirectUri);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     appConfig.msalClientId,
      scopes:       API_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE:      true,
    },
    discovery
  );

  // Restore session from SecureStore on mount
  useEffect(() => {
    void restoreSession();
  }, []);

  // Exchange auth code for tokens when the OAuth redirect returns
  useEffect(() => {
    if (response?.type === 'success') {
      void exchangeCodeForTokens(response.params.code);
    } else if (response?.type === 'error') {
      setAuthError(response.error?.message ?? 'Sign-in was cancelled or failed.');
    }
  }, [response]);

  async function restoreSession(): Promise<void> {
    try {
      const [storedToken, storedRefresh, storedAccount] = await Promise.all([
        SecureStore.getItemAsync(SECURE_STORE_ACCESS_TOKEN),
        SecureStore.getItemAsync(SECURE_STORE_REFRESH_TOKEN),
        SecureStore.getItemAsync(SECURE_STORE_ACCOUNT_INFO),
      ]);
      if (storedToken && storedAccount) {
        setAccessToken(storedToken);
        setRefreshToken(storedRefresh);
        setAccount(JSON.parse(storedAccount) as AccountInfo);
      }
    } catch (error) {
      logger.error({ message: 'Failed to restore session', context: { error } });
    } finally {
      setIsLoading(false);
    }
  }

  async function exchangeCodeForTokens(code: string): Promise<void> {
    if (!request?.codeVerifier) return;
    try {
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId:     appConfig.msalClientId,
          code,
          redirectUri,
          extraParams:  { code_verifier: request.codeVerifier },
        },
        discovery
      );

      const idTokenPayload = parseJwt(tokenResponse.idToken ?? '');
      const accountInfo: AccountInfo = {
        oid:         idTokenPayload.oid ?? '',
        displayName: idTokenPayload.name ?? '',
        email:       idTokenPayload.preferred_username ?? idTokenPayload.email ?? '',
      };

      await Promise.all([
        SecureStore.setItemAsync(SECURE_STORE_ACCESS_TOKEN,  tokenResponse.accessToken),
        SecureStore.setItemAsync(SECURE_STORE_REFRESH_TOKEN, tokenResponse.refreshToken ?? ''),
        SecureStore.setItemAsync(SECURE_STORE_ACCOUNT_INFO,  JSON.stringify(accountInfo)),
      ]);

      setAccessToken(tokenResponse.accessToken);
      setRefreshToken(tokenResponse.refreshToken ?? null);
      setAccount(accountInfo);
    } catch (error) {
      logger.error({ message: 'Token exchange failed', context: { error } });
      setAuthError('Sign-in failed. Please try again.');
    }
  }

  async function signIn(): Promise<void> {
    await promptAsync();
  }

  async function signOut(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_STORE_ACCESS_TOKEN),
      SecureStore.deleteItemAsync(SECURE_STORE_REFRESH_TOKEN),
      SecureStore.deleteItemAsync(SECURE_STORE_ACCOUNT_INFO),
    ]);
    setAccount(null);
    setAccessToken(null);
    setRefreshToken(null);
  }

  // useCallback keeps the reference stable so dependent useEffects don't re-fire.
  const acquireToken = useCallback(async (): Promise<string> => {
    if (!account) throw new Error('Not authenticated');

    if (accessToken) return accessToken;

    if (!refreshToken) throw new Error('Session expired — please sign in again.');

    const refreshed = await AuthSession.refreshAsync(
      { clientId: appConfig.msalClientId, refreshToken, scopes: API_SCOPES },
      discovery
    );

    await SecureStore.setItemAsync(SECURE_STORE_ACCESS_TOKEN, refreshed.accessToken);
    if (refreshed.refreshToken) {
      await SecureStore.setItemAsync(SECURE_STORE_REFRESH_TOKEN, refreshed.refreshToken);
      setRefreshToken(refreshed.refreshToken);
    }
    setAccessToken(refreshed.accessToken);
    return refreshed.accessToken;
  }, [account, accessToken, refreshToken]);

  return (
    <MsalContext.Provider value={{ account, signIn, signOut, acquireToken, isLoading, authError }}>
      {children}
    </MsalContext.Provider>
  );
}

export function useMsal(): MsalContextValue {
  const context = useContext(MsalContext);
  if (!context) throw new Error('useMsal must be used within MsalProvider');
  return context;
}

function parseJwt(token: string): Record<string, string> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as Record<string, string>;
  } catch {
    return {};
  }
}
