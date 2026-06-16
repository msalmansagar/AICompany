// Playwright E2E — portal navigation flows
// TC-E2E-007, TC-E2E-008, TC-E2E-009 (DFE-PORT-001 Phase 5 QA)
// References: FR: NAV-002, PC-002, PC-009, CEO C3
//
// Prerequisites:
//   - Auth state stored at ./e2e/.auth/portal-user.json
//   - Staging Dataverse has portal config seeded:
//     - config-sidebar: navLayout = 'sidebar'
//     - config-topnav: navLayout = 'top-nav'
//   - PORTAL_CONFIG_ID env var selects which config to use per test

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Sidebar navigation — LTR (TC-E2E-007)
// ---------------------------------------------------------------------------

test.describe('Sidebar navigation — LTR English', () => {
  test.use({ storageState: './e2e/.auth/portal-user.json' });

  test('SidebarNav_LTR_RendersOnLeftSide', async ({ page }) => {
    // Given: I am logged in with sidebar nav layout and English locale
    await page.goto('/en/dashboard');

    // Then: the sidebar is visible
    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar).toBeVisible({ timeout: 8000 });

    // And: it is positioned on the left side (inline-start in LTR)
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox).not.toBeNull();
    if (sidebarBox) {
      // Left edge of sidebar must be at or near x=0 (left side of viewport)
      expect(sidebarBox.x).toBeLessThan(100);
    }
  });

  test('SidebarNav_ClickingServicesItem_NavigatesToServicesPage', async ({ page }) => {
    // Given: I am logged in
    await page.goto('/en/dashboard');

    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar).toBeVisible({ timeout: 8000 });

    // When: I click the "Services" nav item
    await sidebar.getByRole('link', { name: /services/i }).click();

    // Then: I navigate to /en/services
    await expect(page).toHaveURL(/\/en\/services/, { timeout: 5000 });
  });

  test('SidebarNav_ActiveItem_IsHighlighted', async ({ page }) => {
    // Given: I am on the dashboard
    await page.goto('/en/dashboard');

    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar).toBeVisible({ timeout: 8000 });

    // Then: the Dashboard nav item has an active state attribute
    const dashboardItem = sidebar.getByTestId('nav-item-dashboard');
    await expect(dashboardItem).toHaveAttribute('data-active', 'true', { timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Sidebar navigation — RTL Arabic (TC-E2E-008)
// ---------------------------------------------------------------------------

test.describe('Sidebar navigation — RTL Arabic', () => {
  test.use({
    storageState: './e2e/.auth/portal-user.json',
    locale: 'ar',
    baseURL: 'http://localhost:3000/ar',
  });

  test('SidebarNav_RTL_RendersOnRightSide', async ({ page }) => {
    // Given: I am on the Arabic locale (dir=rtl is set on html)
    await page.goto('/ar/dashboard');

    // Verify RTL is active
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl', { timeout: 5000 });

    // Then: the sidebar renders on the right side
    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar).toBeVisible({ timeout: 8000 });

    const viewportWidth = page.viewportSize()?.width ?? 1280;
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox).not.toBeNull();
    if (sidebarBox) {
      // In RTL, the sidebar's right edge should be at or near the viewport right edge
      const sidebarRightEdge = sidebarBox.x + sidebarBox.width;
      expect(sidebarRightEdge).toBeGreaterThan(viewportWidth - 320);
    }
  });
});

// ---------------------------------------------------------------------------
// Top-nav layout (TC-E2E-009)
// ---------------------------------------------------------------------------

test.describe('Top-nav layout', () => {
  test.use({ storageState: './e2e/.auth/portal-user.json' });

  test('TopNavLayout_TopBarVisible_SidebarNotRendered', async ({ page }) => {
    // Given: portal config has navLayout = 'top-nav'
    // The test environment must have a portal config seeded with top-nav layout.
    // We pass a query param or use a specific route that forces top-nav mode.
    await page.goto('/en/dashboard?navLayout=top-nav');

    // Then: the top navigation bar is visible
    const topNav = page.getByTestId('top-nav');
    await expect(topNav).toBeVisible({ timeout: 8000 });

    // And: the sidebar is not rendered
    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar).not.toBeVisible({ timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Navigation badge — live count (FR: NAV-002)
// ---------------------------------------------------------------------------

test.describe('Nav badge — live count', () => {
  test.use({ storageState: './e2e/.auth/portal-user.json' });

  test('NavBadge_PendingRequestsCount_IsVisibleOnRequestsItem', async ({ page }) => {
    // Given: the Requests nav item has badgeSource='query' configured
    await page.goto('/en/dashboard');

    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar).toBeVisible({ timeout: 8000 });

    // Then: the badge is visible on the Requests item
    const requestsBadge = sidebar.getByTestId('nav-badge-requests');
    // Badge may be 0 — just verify it renders without error
    await expect(requestsBadge).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Sub-item expansion (FR: NAV-003)
// ---------------------------------------------------------------------------

test.describe('Nav sub-item expansion', () => {
  test.use({ storageState: './e2e/.auth/portal-user.json' });

  test('NavSubItems_ParentItemClick_ExpandsChildren', async ({ page }) => {
    // Given: a nav item with children exists (e.g. Admin)
    await page.goto('/en/dashboard');

    const sidebar = page.getByTestId('sidebar-nav');
    await expect(sidebar).toBeVisible({ timeout: 8000 });

    const adminItem = sidebar.getByTestId('nav-item-admin');
    // Only run this assertion if the admin item exists (role-dependent)
    const itemExists = await adminItem.isVisible().catch(() => false);
    if (!itemExists) {
      test.skip();
      return;
    }

    // When: I click the parent item
    await adminItem.click();

    // Then: child items expand
    const childItems = sidebar.getByTestId('nav-children-admin');
    await expect(childItems).toBeVisible({ timeout: 3000 });
  });
});
