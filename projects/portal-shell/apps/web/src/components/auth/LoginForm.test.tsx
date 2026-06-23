// RED → GREEN → REFACTOR — LoginForm component tests
// TC-WEB-001 through TC-WEB-007 (DFE-PORT-001 Phase 5 QA)
// References: FR: AUTH-001, AUTH-002, AUTH-003, PC-007

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn } from 'next-auth/react';
import { LoginForm } from './LoginForm.js';

// ---------------------------------------------------------------------------
// next-auth/react is mocked globally in test-setup.ts
// We can override signIn per test using vi.mocked()
// ---------------------------------------------------------------------------

const DEFAULT_PROPS = {
  logoUrl: null,
  portalName: 'Test Portal',
  ssoProviders: [] as Array<'microsoft' | 'google'>,
  registrationEnabled: true,
  locale: 'en',
  callbackUrl: '/en/dashboard',
};

beforeEach(() => {
  vi.mocked(signIn).mockReset();
});

// ---------------------------------------------------------------------------
// TC-WEB-001: LoginForm_Renders_EmailAndPasswordFields
// ---------------------------------------------------------------------------

describe('LoginForm — field rendering', () => {
  it('LoginForm_Renders_EmailAndPasswordFields', () => {
    render(<LoginForm {...DEFAULT_PROPS} />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('LoginForm_Renders_SubmitButton', () => {
    render(<LoginForm {...DEFAULT_PROPS} />);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeInTheDocument();
  });

  it('LoginForm_RegistrationEnabled_ShowsCreateAccountLink', () => {
    render(<LoginForm {...DEFAULT_PROPS} registrationEnabled={true} />);

    expect(screen.getByRole('link', { name: /create account/i })).toBeInTheDocument();
  });

  it('LoginForm_RegistrationDisabled_HidesCreateAccountLink', () => {
    render(<LoginForm {...DEFAULT_PROPS} registrationEnabled={false} />);

    expect(screen.queryByRole('link', { name: /create account/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TC-WEB-002: LoginForm_InvalidEmail_ShowsValidationError
// ---------------------------------------------------------------------------

describe('LoginForm — validation errors', () => {
  it('LoginForm_InvalidEmail_ShowsValidationError', async () => {
    const user = userEvent.setup();
    render(<LoginForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const alerts = screen.getAllByRole('alert');
    const emailAlert = alerts.find((el) => /email/i.test(el.textContent ?? ''));
    expect(emailAlert).toBeDefined();
  });

  // TC-WEB-003: LoginForm_EmptyPassword_ShowsValidationError
  it('LoginForm_EmptyPassword_ShowsValidationError', async () => {
    const user = userEvent.setup();
    render(<LoginForm {...DEFAULT_PROPS} />);

    // Fill email but leave password empty
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      // Password field should show required error (min(1) on local LoginSchema)
      const passwordField = screen.getByLabelText(/password/i);
      expect(passwordField).toHaveAttribute('aria-invalid', 'true');
    });
  });
});

// ---------------------------------------------------------------------------
// TC-WEB-004: LoginForm_ValidCredentials_CallsSignIn
// ---------------------------------------------------------------------------

describe('LoginForm — form submission', () => {
  it('LoginForm_ValidCredentials_CallsSignIn', async () => {
    vi.mocked(signIn).mockResolvedValue({ error: null, status: 200, ok: true, url: '/en/dashboard' });

    const user = userEvent.setup();
    render(<LoginForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'ValidPass1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(
        'credentials',
        expect.objectContaining({
          email: 'user@example.com',
          password: 'ValidPass1',
          redirect: false,
        }),
      );
    });
  });

  it('LoginForm_SignInReturnsError_ShowsGlobalErrorMessage', async () => {
    vi.mocked(signIn).mockResolvedValue({
      error: 'CredentialsSignin',
      status: 401,
      ok: false,
      url: null,
    });

    const user = userEvent.setup();
    render(<LoginForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'WrongPassword1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/invalid email or password/i);
    });
  });

  // TC-WEB-007: LoginForm_Submitting_ShowsLoadingState
  it('LoginForm_Submitting_ShowsLoadingState', async () => {
    // Never resolves — keeps form in submitting state
    vi.mocked(signIn).mockImplementation(() => new Promise(() => { /* pending */ }));

    const user = userEvent.setup();
    render(<LoginForm {...DEFAULT_PROPS} />);

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'ValidPass1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /signing in/i });
      expect(submitButton).toBeDisabled();
    });
  });
});

// ---------------------------------------------------------------------------
// TC-WEB-005: LoginForm_SsoProvidersMicrosoft_ShowsMicrosoftButton
// TC-WEB-006: LoginForm_SsoProvidersEmpty_DoesNotShowSsoButtons
// ---------------------------------------------------------------------------

describe('LoginForm — SSO buttons', () => {
  it('LoginForm_SsoProvidersMicrosoft_ShowsMicrosoftButton', () => {
    render(<LoginForm {...DEFAULT_PROPS} ssoProviders={['microsoft']} />);

    const microsoftButton = screen.getByRole('button', { name: /microsoft/i });
    expect(microsoftButton).toBeInTheDocument();
  });

  it('LoginForm_SsoProvidersGoogle_ShowsGoogleButton', () => {
    render(<LoginForm {...DEFAULT_PROPS} ssoProviders={['google']} />);

    const googleButton = screen.getByRole('button', { name: /google/i });
    expect(googleButton).toBeInTheDocument();
  });

  it('LoginForm_SsoProvidersBoth_ShowsBothButtons', () => {
    render(<LoginForm {...DEFAULT_PROPS} ssoProviders={['microsoft', 'google']} />);

    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
  });

  it('LoginForm_SsoProvidersEmpty_DoesNotShowSsoButtons', () => {
    render(<LoginForm {...DEFAULT_PROPS} ssoProviders={[]} />);

    expect(screen.queryByRole('button', { name: /microsoft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
  });

  it('LoginForm_MicrosoftSsoButton_CallsSignInWithMicrosoftProvider', async () => {
    vi.mocked(signIn).mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<LoginForm {...DEFAULT_PROPS} ssoProviders={['microsoft']} />);

    await user.click(screen.getByRole('button', { name: /microsoft/i }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(
        'microsoft-entra-id',
        expect.objectContaining({ callbackUrl: '/en/dashboard' }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Arabic locale rendering
// ---------------------------------------------------------------------------

describe('LoginForm — Arabic locale', () => {
  it('LoginForm_ArabicLocale_ShowsArabicWelcomeText', () => {
    render(<LoginForm {...DEFAULT_PROPS} locale="ar" />);

    expect(screen.getByText('مرحباً بعودتك')).toBeInTheDocument();
  });

  it('LoginForm_ArabicLocale_ShowsArabicErrorOnInvalidLogin', async () => {
    vi.mocked(signIn).mockResolvedValue({
      error: 'CredentialsSignin',
      status: 401,
      ok: false,
      url: null,
    });

    const user = userEvent.setup();
    render(<LoginForm {...DEFAULT_PROPS} locale="ar" />);

    // Use Arabic label to find the field (locale is 'ar' so label text changes)
    const emailInput = screen.getByLabelText(/البريد الإلكتروني/i);
    const passwordInput = screen.getByLabelText(/كلمة المرور/i);

    await user.type(emailInput, 'user@example.com');
    await user.type(passwordInput, 'WrongPassword1');
    await user.click(screen.getByRole('button', { name: /تسجيل الدخول/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/البريد الإلكتروني أو كلمة المرور غير صحيحة/);
    });
  });
});
