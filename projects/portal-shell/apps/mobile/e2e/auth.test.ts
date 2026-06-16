// Detox E2E tests — Auth flow (Login → Dashboard → Logout)
// Prerequisites:
//   - App built with: eas build --profile development
//   - Detox configured for android.emu.debug (see package.json)
//   - API running at EXPO_PUBLIC_API_URL with test user seeded

import { by, device, element, expect as detoxExpect, waitFor } from 'detox';

const TEST_EMAIL = 'e2e-user@portal-test.com';
const TEST_PASSWORD = 'TestPass@9999';

describe('Auth Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('launchApp_noToken_showsLoginScreen', async () => {
    await waitFor(element(by.id('login-email-input')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('login_emptyForm_showsValidationErrors', async () => {
    await waitFor(element(by.id('login-submit-button'))).toBeVisible().withTimeout(5000);
    await element(by.id('login-submit-button')).tap();
    // Validation error for email field should appear
    await waitFor(element(by.text('auth.errors.invalidEmail')))
      .toBeVisible()
      .withTimeout(2000);
  });

  it('login_validCredentials_navigatesToDashboard', async () => {
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(5000);

    await element(by.id('login-email-input')).typeText(TEST_EMAIL);
    await element(by.id('login-password-input')).typeText(TEST_PASSWORD);
    await element(by.id('login-submit-button')).tap();

    // Dashboard quick stats should appear after successful login
    await waitFor(element(by.id('dashboard-quick-stats')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('logout_fromProfileTab_returnToLoginScreen', async () => {
    // Assumes we are logged in from previous test via fresh app state
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('login-email-input')).typeText(TEST_EMAIL);
    await element(by.id('login-password-input')).typeText(TEST_PASSWORD);
    await element(by.id('login-submit-button')).tap();

    await waitFor(element(by.id('dashboard-quick-stats'))).toBeVisible().withTimeout(10000);

    // Navigate to profile tab
    await element(by.text('navigation.profile')).tap();

    // Tap sign out
    await waitFor(element(by.id('profile-sign-out-button'))).toBeVisible().withTimeout(3000);
    await element(by.id('profile-sign-out-button')).tap();

    // Confirm sign out in alert
    await element(by.text('profile.signOutConfirmYes')).tap();

    // Should return to login
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(5000);
  });
});
