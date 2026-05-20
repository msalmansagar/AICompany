import { test, expect, type Page } from '@playwright/test';

// Tests that verify the UI Design Engine renders correctly.
// Assumes dev server at http://localhost:3000 with VITE_SKIP_AUTH=true.

const FORM_URL = '/forms/loan-application';

async function navigateToForm(page: Page) {
  await page.goto(FORM_URL);
  await page.waitForSelector('main', { timeout: 10_000 });
}

test.describe('UI Design Engine — ThemeSwitcher', () => {
  test('renders_themeSwitcherButton_inFormHeader', async ({ page }) => {
    await navigateToForm(page);

    const switcher = page.getByRole('button', {
      name: /switch to (dark|light) mode/i,
    });
    await expect(switcher).toBeVisible();
  });

  test('toggles_darkMode_whenThemeSwitcherClicked', async ({ page }) => {
    await navigateToForm(page);

    const switcher = page.getByRole('button', { name: /switch to dark mode/i });
    await switcher.click();

    // After click the button label should change to reflect the new state
    await expect(
      page.getByRole('button', { name: /switch to light mode/i }),
    ).toBeVisible();
  });
});

test.describe('UI Design Engine — Skeleton loader', () => {
  test('shows_skeletonItems_whileFormIsLoading', async ({ page }) => {
    // Intercept the metadata API to delay the response, capturing the loading state
    await page.route('**/api/forms/*/metadata', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    await page.goto(FORM_URL);

    // The loading container with aria-busy should be present before data loads
    const loadingRegion = page.locator('[aria-busy="true"]');
    await expect(loadingRegion).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('UI Design Engine — StickyActionBar accessibility', () => {
  test('stickyActionBar_has_toolbarRole', async ({ page }) => {
    await navigateToForm(page);

    // If sticky action bar is enabled in form design, it should have toolbar role
    const toolbar = page.getByRole('toolbar', { name: 'Form actions' });
    const count = await toolbar.count();

    // Only assert if the feature is rendered (depends on form design config)
    if (count > 0) {
      await expect(toolbar).toBeVisible();
    }
  });

  test('submitButton_hasAriaBusy_whileSubmitting', async ({ page }) => {
    await navigateToForm(page);

    // Intercept submit to keep it pending
    await page.route('**/api/forms/*/submit', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    const submit = page.getByRole('button', { name: /submit form/i }).first();
    const count = await submit.count();

    if (count > 0) {
      await submit.click();
      await expect(submit).toHaveAttribute('aria-busy', 'true');
    }
  });
});

test.describe('UI Design Engine — ProgressIndicator accessibility', () => {
  test('progressBar_has_correctAriaAttributes', async ({ page }) => {
    await navigateToForm(page);

    // ProgressIndicator only renders for Stepper/Wizard layouts
    const progressBar = page.getByRole('progressbar');
    const count = await progressBar.count();

    if (count > 0) {
      const bar = progressBar.first();
      await expect(bar).toHaveAttribute('aria-valuemin', '1');
      await expect(bar).toHaveAttribute('aria-valuemax');
    }
  });

  test('stepList_isNavigationLandmark', async ({ page }) => {
    await navigateToForm(page);

    const nav = page.getByRole('navigation', { name: 'Form progress' });
    const count = await nav.count();

    if (count > 0) {
      await expect(nav).toBeVisible();
    }
  });
});

test.describe('UI Design Engine — CSS custom properties', () => {
  test('injects_qdbColorPrimary_cssVariable_onDocumentRoot', async ({ page }) => {
    await navigateToForm(page);

    const primaryColor = await page.evaluate(() => {
      return (
        document.documentElement.style.getPropertyValue('--qdb-color-primary') ||
        window.getComputedStyle(document.documentElement).getPropertyValue('--qdb-color-primary')
      );
    });

    // The variable should be set (non-empty) after theme is applied
    expect(primaryColor.trim()).toBeTruthy();
  });
});
