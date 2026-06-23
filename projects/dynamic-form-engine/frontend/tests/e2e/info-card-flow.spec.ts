// Playwright E2E: Info-Card Screen flow (DFE-ADD-001).
// Tests the primary user journey through info-card screens before reaching the form.
// Assumes the dev server is running at http://localhost:3000 with VITE_SKIP_AUTH=true
// and a test form code "test-form" that has info-card screens configured.

import { test, expect } from '@playwright/test';

// ── Happy path: complete info-card flow and reach the form ────────────────

test('info_card_flow_completes_and_reaches_form', async ({ page }) => {
  // Navigate to a form that has info-card screens.
  await page.goto('/forms/test-form');

  // Wait for info-card screen to render.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Click "Continue" to advance through screens (assumes at least 2 screens).
  const continueButton = page.getByRole('button', { name: /continue/i });

  if (await continueButton.isVisible()) {
    await continueButton.click();
  }

  // Click "Start" on the last screen to transition to the form.
  await page.getByRole('button', { name: /start/i }).click();

  // The form's tab navigation should now be visible.
  await expect(page.getByRole('navigation', { name: /form sections/i })).toBeVisible();
});

// ── Accessibility: heading has focus on screen transition ─────────────────

test('info_card_screen_heading_receives_focus_on_render', async ({ page }) => {
  await page.goto('/forms/test-form');

  // After page loads, check the H1 element has focus (FR-072).
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
});

// ── Draft resume bypasses info cards (ADD-001-C2) ─────────────────────────

test('draft_resume_skips_info_card_screens', async ({ page }) => {
  // Navigate with draftId param — should skip info-card screens entirely.
  await page.goto('/forms/test-form?draftId=test-draft-id');

  // The form navigation tabs should be immediately visible (no info cards).
  await expect(page.getByRole('navigation', { name: /form sections/i })).toBeVisible();

  // No "Start" or "Continue" buttons should be rendered.
  await expect(page.getByRole('button', { name: /start/i })).not.toBeVisible();
});

// ── Skip link (when allowInfocardSkip is true) ────────────────────────────

test('skip_link_navigates_directly_to_form', async ({ page }) => {
  // This test assumes the form has allowInfocardSkip = true.
  await page.goto('/forms/test-form-skippable');

  const skipButton = page.getByRole('button', { name: /skip/i });
  await expect(skipButton).toBeVisible();
  await skipButton.click();

  // After skipping, the form should render.
  await expect(page.getByRole('navigation', { name: /form sections/i })).toBeVisible();
});

// ── Download list section: opens URL in new tab ───────────────────────────

test('download_button_opens_url_in_new_tab', async ({ page }) => {
  // Navigate to a form with a download-list section.
  await page.goto('/forms/test-form-downloads');

  // Find a download link (rendered as a button with rel=noopener noreferrer).
  const downloadLink = page.getByRole('link', { name: /download/i }).first();

  // Playwright checks target attribute.
  await expect(downloadLink).toHaveAttribute('target', '_blank');
  await expect(downloadLink).toHaveAttribute('rel', /noopener noreferrer/);
});

// ── Accessibility snapshot ─────────────────────────────────────────────────

test('info_card_screen_accessibility_snapshot', async ({ page }) => {
  await page.goto('/forms/test-form');

  // Wait for content to render.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Verify accessible navigation landmarks are in place.
  await expect(page.getByRole('navigation', { name: /info card navigation/i })).toBeVisible();
});
