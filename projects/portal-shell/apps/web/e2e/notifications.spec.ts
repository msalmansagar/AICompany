// Playwright E2E — notification flows
// TC-E2E-005, TC-E2E-006 (DFE-PORT-001 Phase 5 QA)
// References: FR: NOT-*
//
// Prerequisites:
//   - User 'portal_user@test.com' is seeded with 3 unread notifications in Dataverse
//   - App dev server running on http://localhost:3000
//   - Auth state stored at ./e2e/.auth/portal-user.json (from auth setup fixture)

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Auth setup — reuse stored session state for all notification tests
// ---------------------------------------------------------------------------

test.use({ storageState: './e2e/.auth/portal-user.json' });

// ---------------------------------------------------------------------------
// Scenario: TC-E2E-005 — Notification bell shows unread count
// ---------------------------------------------------------------------------

test.describe('Notification bell — unread count badge', () => {
  test('Notifications_Bell_ShowsUnreadCountBadge', async ({ page }) => {
    // Given: I am logged in with 3 unread notifications
    await page.goto('/en/dashboard');

    // When: the page loads (React Query fetches notifications on mount)
    // Then: the notification bell badge shows '3'
    const badge = page.getByTestId('notification-badge');
    await expect(badge).toBeVisible({ timeout: 8000 });
    await expect(badge).toHaveText('3');
  });

  test('Notifications_Bell_HidesBadge_WhenAllNotificationsRead', async ({ page }) => {
    // Given: I am logged in and all notifications are already read
    // (covered by TC-E2E-006 post-condition — run after mark-all-read test)
    await page.goto('/en/dashboard');

    // The badge should not be visible when unread count is 0
    const badge = page.getByTestId('notification-badge');
    // If no unread notifications exist, badge is absent or shows 0
    const badgeVisible = await badge.isVisible().catch(() => false);
    if (badgeVisible) {
      const text = await badge.textContent();
      expect(text).toBe('0');
    } else {
      // Badge hidden when count is 0 — this is the expected behavior
      await expect(badge).not.toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario: TC-E2E-006 — Mark all notifications as read
// ---------------------------------------------------------------------------

test.describe('Notification panel — mark all read', () => {
  test('Notifications_MarkAllRead_ClearsBadge', async ({ page }) => {
    // Given: I am logged in with unread notifications
    await page.goto('/en/dashboard');

    // Verify there are unread notifications
    const badge = page.getByTestId('notification-badge');
    await expect(badge).toBeVisible({ timeout: 8000 });

    // When: I open the notification panel
    await page.getByTestId('notification-bell').click();

    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // And: I click "Mark all read"
    await page.getByRole('button', { name: /mark all read/i }).click();

    // Then: all notifications show as read (no unread indicators)
    await expect(panel.getByTestId('unread-indicator')).toHaveCount(0, { timeout: 5000 });

    // And: the bell badge disappears
    await expect(badge).not.toBeVisible({ timeout: 5000 });
  });

  test('Notifications_Panel_ShowsNotificationTitles', async ({ page }) => {
    // Given: I am logged in
    await page.goto('/en/dashboard');

    // When: I open the notification panel
    await page.getByTestId('notification-bell').click();

    // Then: notification items are visible
    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    const items = panel.getByTestId('notification-item');
    await expect(items).toHaveCount(3, { timeout: 5000 });
  });

  test('Notifications_MarkSingleNotificationRead_MarksOnlyThatOne', async ({ page }) => {
    // Given: I am logged in with 3 unread notifications
    await page.goto('/en/dashboard');

    // When: I open the notification panel
    await page.getByTestId('notification-bell').click();

    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });

    // And: I click "mark as read" on the first notification
    const firstItem = panel.getByTestId('notification-item').first();
    await firstItem.getByRole('button', { name: /mark as read/i }).click();

    // Then: that notification is marked read (unread indicator gone on first item)
    await expect(firstItem.getByTestId('unread-indicator')).not.toBeVisible({ timeout: 3000 });

    // And: the other notifications remain unread
    const unreadIndicators = panel.getByTestId('unread-indicator');
    await expect(unreadIndicators).toHaveCount(2, { timeout: 3000 });
  });
});
