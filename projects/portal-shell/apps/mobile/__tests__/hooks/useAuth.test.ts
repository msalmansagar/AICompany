// RED — failing tests written before implementation verification

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCurrentUser, useLogin, useLogout } from '../../src/hooks/useAuth';
import * as AuthStore from '../../src/lib/auth-store';
import * as ApiModule from '../../src/lib/api';
import type { AuthResult, UserProfile } from '@portal/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../src/lib/auth-store');
jest.mock('../../src/lib/api');
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

const mockUser: UserProfile = {
  id: 'user-001',
  email: 'test@example.com',
  displayName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  roles: ['citizen'],
  linkedEntityIds: [],
  preferredLanguage: 'en',
};

const mockAuthResult: AuthResult = {
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  user: mockUser,
};

// ---------------------------------------------------------------------------
// Test wrapper
// ---------------------------------------------------------------------------

function buildWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCurrentUser', () => {
  it('getStoredUserProfile_returnsUser_exposesUserData', async () => {
    (AuthStore.getStoredUserProfile as jest.Mock).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useCurrentUser(), { wrapper: buildWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockUser);
  });

  it('getStoredUserProfile_returnsNull_dataIsNull', async () => {
    (AuthStore.getStoredUserProfile as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() => useCurrentUser(), { wrapper: buildWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useLogin', () => {
  it('mutate_validCredentials_storesTokensAndNavigates', async () => {
    (ApiModule.api.post as jest.Mock).mockResolvedValue({ data: mockAuthResult });
    (AuthStore.storeTokens as jest.Mock).mockResolvedValue(undefined);
    (AuthStore.storeUserProfile as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useLogin(), { wrapper: buildWrapper() });

    act(() => {
      result.current.mutate({ email: 'test@example.com', password: 'Password@1234' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(AuthStore.storeTokens).toHaveBeenCalledWith(
      mockAuthResult.accessToken,
      mockAuthResult.refreshToken,
    );
    expect(AuthStore.storeUserProfile).toHaveBeenCalledWith(mockUser);
  });

  it('mutate_apiError_setsErrorState', async () => {
    const apiError = new ApiModule.ApiError(401, 'Unauthorized', null);
    (ApiModule.api.post as jest.Mock).mockRejectedValue(apiError);

    const { result } = renderHook(() => useLogin(), { wrapper: buildWrapper() });

    act(() => {
      result.current.mutate({ email: 'bad@example.com', password: 'wrong' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiModule.ApiError);
  });
});

describe('useLogout', () => {
  it('mutate_onSettled_clearsTokensAndNavigates', async () => {
    (ApiModule.api.post as jest.Mock).mockResolvedValue(undefined);
    (AuthStore.clearAllTokens as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useLogout(), { wrapper: buildWrapper() });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(AuthStore.clearAllTokens).toHaveBeenCalledTimes(1);
  });
});
