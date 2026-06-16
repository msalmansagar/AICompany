// RED — failing tests written before implementation verification

import React from 'react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock all native modules before importing the screen
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(false),
  isEnrolledAsync: jest.fn().mockResolvedValue(false),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([]),
  authenticateAsync: jest.fn().mockResolvedValue({ success: false }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openBrowserAsync: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn().mockReturnValue('portal://redirect'),
  useAuthRequest: jest.fn().mockReturnValue([null, null, jest.fn()]),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  Redirect: () => null,
}));

jest.mock('../../src/lib/api', () => ({
  api: {
    post: jest.fn(),
    get: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

jest.mock('../../src/i18n', () => ({
  t: (key: string) => key,
  initI18n: jest.fn(),
  getCurrentLocale: () => 'en',
  isCurrentLocaleRtl: () => false,
}));

import LoginScreen from '../../app/auth/login';
import * as ApiModule from '../../src/lib/api';

function buildWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders_loginScreen_showsEmailAndPasswordInputs', async () => {
    const { getByTestId } = render(<LoginScreen />, { wrapper: buildWrapper() });

    // Wait for biometric check to complete
    await waitFor(() => expect(getByTestId('login-email-input')).toBeTruthy());
    expect(getByTestId('login-password-input')).toBeTruthy();
    expect(getByTestId('login-submit-button')).toBeTruthy();
  });

  it('submit_emptyEmail_showsValidationError', async () => {
    const { getByTestId } = render(<LoginScreen />, { wrapper: buildWrapper() });

    await waitFor(() => expect(getByTestId('login-submit-button')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    await waitFor(() => {
      expect(screen.getByText('auth.errors.invalidEmail')).toBeTruthy();
    });
  });

  it('submit_validCredentials_callsLoginMutation', async () => {
    (ApiModule.api.post as jest.Mock).mockResolvedValue({
      data: {
        accessToken: 'token-abc',
        refreshToken: 'refresh-xyz',
        expiresAt: Date.now() / 1000 + 3600,
        user: {
          id: 'u1',
          email: 'user@example.com',
          displayName: 'Test User',
          firstName: 'Test',
          lastName: 'User',
          avatarUrl: null,
          roles: [],
          linkedEntityIds: [],
          preferredLanguage: 'en',
        },
      },
    });

    const { getByTestId } = render(<LoginScreen />, { wrapper: buildWrapper() });

    await waitFor(() => expect(getByTestId('login-email-input')).toBeTruthy());

    await act(async () => {
      fireEvent.changeText(getByTestId('login-email-input'), 'user@example.com');
      fireEvent.changeText(getByTestId('login-password-input'), 'ValidPass@1');
      fireEvent.press(getByTestId('login-submit-button'));
    });

    await waitFor(() => {
      expect(ApiModule.api.post).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({ email: 'user@example.com' }),
      );
    });
  });

  it('submit_apiReturns401_showsInlineError', async () => {
    (ApiModule.api.post as jest.Mock).mockRejectedValue(
      new ApiModule.ApiError(401, 'Unauthorized', null),
    );

    const { getByTestId } = render(<LoginScreen />, { wrapper: buildWrapper() });

    await waitFor(() => expect(getByTestId('login-email-input')).toBeTruthy());

    await act(async () => {
      fireEvent.changeText(getByTestId('login-email-input'), 'wrong@example.com');
      fireEvent.changeText(getByTestId('login-password-input'), 'WrongPass@1');
      fireEvent.press(getByTestId('login-submit-button'));
    });

    await waitFor(() => {
      expect(screen.getByText('auth.errors.loginFailed')).toBeTruthy();
    });
  });
});
