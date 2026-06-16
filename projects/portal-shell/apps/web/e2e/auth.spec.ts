// Playwright E2E — auth flows
// TC-E2E-001, TC-E2E-002, TC-E2E-003, TC-RTL-003 (DFE-PORT-001 Phase 5 QA)
// References: FR: AUTH-002, AUTH-007, PC-009, CEO C3
//
// Prerequisites:
//   - Next.js dev server running on http://localhost:3000
//   - Fastify API running on http://localhost:4000
//   - Test account 'portal_user@test.com' / 'TestP@ss12!' exists in Dataverse
//   - E2E auth state stored at ./e2e/.auth/ (excluded from git)

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Scenario: TC-E2E-001 — Login with valid credentials
// ---------------------------------------------------------------------------

test.describe('Login — valid credentials', () => {
  test('Login_ValidCredentials_RedirectsToDashboard', async ({ page }) => {
    // Given: I am on the login page
    await page.goto('/en/login');
    await expect(page).toHaveURL(/\/en\/login/);

    // When: I enter valid email and password
    await page.getByLabel(/email address/i).fill('portal_user@test.com');
    await page.getByLabel(/password/i).fill('TestP@ss12!');

    // And: I click Sign In
    await page.getByRole('button', { name: /sign in/i }).click();

    // Then: I am redirected to the dashboard
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Scenario: TC-E2E-002 — Login with invalid credentials
// ---------------------------------------------------------------------------

test.describe('Login — invalid credentials', () => {
  test('Login_InvalidPassword_ShowsError_StaysOnLoginPage', async ({ page }) => {
    // Given: I am on the login page
    await page.goto('/en/login');

    // When: I enter an invalid password
    await page.getByLabel(/email address/i).fill('portal_user@test.com');
    await page.getByLabel(/password/i).fill('WrongPassword1!');

    // And: I click Sign In
    await page.getByRole('button', { name: /sign in/i }).click();

    // Then: I see an error message
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i);

    // And: I remain on the login page
    await expect(page).toHaveURL(/\/en\/login/);
  });
});

// ---------------------------------------------------------------------------
// Scenario: TC-E2E-003 — Unauthenticated access to portal
// ---------------------------------------------------------------------------

test.describe('Unauthenticated access', () => {
  test('UnauthenticatedAccess_Dashboard_RedirectsToLogin', async ({ page }) => {
    // Given: I am not logged in (fresh context — no cookies)
    // When: I navigate to /en/dashboard
    await page.goto('/en/dashboard');

    // Then: I am redirected to /en/login
    await expect(page).toHaveURL(/\/en\/login/, { timeout: 8000 });
  });

  test('UnauthenticatedAccess_MyRequests_RedirectsToLoginWithCallbackUrl', async ({ page }) => {
    // Given: I am not logged in
    // When: I navigate directly to /en/my-requests
    await page.goto('/en/my-requests');

    // Then: redirected to login; callbackUrl preserved for deep-link resume
    await expect(page).toHaveURL(/\/en\/login/, { timeout: 8000 });

    // The callbackUrl should be present in the URL so the deep link is resumed post-auth
    const url = page.url();
    expect(url).toMatch(/callbackUrl/i);
  });

  test('UnauthenticatedAccess_AdminPortal_RedirectsToLogin', async ({ page }) => {
    // Given: I am not logged in
    // When: I navigate to admin settings
    await page.goto('/en/portal');

    // Then: redirected to login
    await expect(page).toHaveURL(/\/en\/login/, { timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Scenario: TC-RTL-003 — RTL layout in Arabic locale (CEO Condition 3)
// ---------------------------------------------------------------------------

test.describe('RTL — Arabic locale', () => {
  test('ArabicLocale_LoginPage_DirAttributeIsRtl', async ({ page }) => {
    // Given: I navigate to /ar/login
    await page.goto('/ar/login');

    // Then: the html element has attribute dir="rtl"
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('dir', 'rtl', { timeout: 5000 });
  });

  test('ArabicLocale_LoginPage_TextIsInArabic', async ({ page }) => {
    await page.goto('/ar/login');

    // The welcome heading renders in Arabic
    await expect(page.getByText('مرحباً بعودتك')).toBeVisible({ timeout: 5000 });
  });

  test('EnglishLocale_LoginPage_DirAttributeIsLtr', async ({ page }) => {
    await page.goto('/en/login');

    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('dir', 'ltr', { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Scenario: Forgot password — email enumeration prevention
// ---------------------------------------------------------------------------

test.describe('Forgot password', () => {
  test('ForgotPassword_UnknownEmail_DoesNotRevealExistence', async ({ page }) => {
    // Given: I am on the forgot password page
    await page.goto('/en/forgot-password');

    // When: I submit with a non-existent email
    await page.getByLabel(/email/i).fill('nobody@example.com');
    await page.getByRole('button', { name: /send reset/i }).click();

    // Then: success message is shown (not a failure — prevents email enumeration)
    await expect(
      page.getByText(/check your email|if an account exists/i),
    ).toBeVisible({ timeout: 5000 });
  });
});
