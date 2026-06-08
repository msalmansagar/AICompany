// Playwright E2E: Boolean field type (DFE-ADD-002).
// Tests toggle and radio-pair variants, and that submit correctly validates required booleans.

import { test, expect } from '@playwright/test';

// ── Toggle variant: state changes on click ────────────────────────────────

test('boolean_toggle_changes_state_on_click', async ({ page }) => {
  await page.goto('/forms/test-form-boolean');

  const toggle = page.getByRole('switch').first();
  await expect(toggle).toBeVisible();

  const initialChecked = await toggle.getAttribute('aria-checked');
  await toggle.click();

  // After click, aria-checked should have toggled.
  const newChecked = await toggle.getAttribute('aria-checked');
  expect(newChecked).not.toBe(initialChecked);
});

// ── Radio-pair variant: selecting Yes checks the correct radio ─────────────

test('boolean_radio_selects_correct_value', async ({ page }) => {
  await page.goto('/forms/test-form-boolean-radio');

  const yesRadio = page.getByLabel('Yes');
  const noRadio = page.getByLabel('No');

  await yesRadio.click();
  await expect(yesRadio).toBeChecked();
  await expect(noRadio).not.toBeChecked();

  await noRadio.click();
  await expect(noRadio).toBeChecked();
  await expect(yesRadio).not.toBeChecked();
});

// ── Required boolean validation ────────────────────────────────────────────

test('required_boolean_fails_validation_when_unset', async ({ page }) => {
  await page.goto('/forms/test-form-boolean-required');

  // Try to submit without selecting anything.
  await page.getByRole('button', { name: /submit/i }).click();

  // Validation error should appear.
  await expect(page.getByRole('alert')).toBeVisible();
});

// ── Accessibility: toggle has correct ARIA semantics ──────────────────────

test('boolean_toggle_has_correct_aria_attributes', async ({ page }) => {
  await page.goto('/forms/test-form-boolean');

  const toggle = page.getByRole('switch').first();
  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-checked');
});
