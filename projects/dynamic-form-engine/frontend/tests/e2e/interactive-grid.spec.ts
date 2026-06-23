// Playwright E2E: Interactive Grid — Selection and Entry modes (DFE-ADD-002).
// Covers the primary user journeys for both grid modes.

import { test, expect } from '@playwright/test';

// ── Selection Grid: records load on tab activation ─────────────────────────

test('selection_grid_loads_records_on_tab_activation', async ({ page }) => {
  await page.goto('/forms/test-form-selection-grid');

  // Navigate to the tab containing the Selection Grid.
  await page.getByRole('tab', { name: /select records/i }).click();

  // Loading skeleton should appear then resolve.
  // Wait for skeleton to disappear and table to appear.
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 5000 });
});

// ── Selection Grid: single-select works ───────────────────────────────────

test('selection_grid_single_select_selects_row', async ({ page }) => {
  await page.goto('/forms/test-form-selection-grid');

  await page.getByRole('tab', { name: /select records/i }).click();
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 5000 });

  // Click the first data row.
  const firstRow = page.getByRole('row').nth(1); // skip header
  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-selected', 'true');
});

// ── Selection Grid: pagination controls ───────────────────────────────────

test('selection_grid_shows_pagination_when_multiple_pages_exist', async ({ page }) => {
  await page.goto('/forms/test-form-selection-grid-large');

  await page.getByRole('tab', { name: /select records/i }).click();
  await expect(page.getByRole('grid')).toBeVisible({ timeout: 5000 });

  // Pagination controls should appear.
  await expect(page.getByRole('button', { name: /next page/i })).toBeVisible();
});

// ── Selection Grid: required validation fails if unselected ───────────────

test('required_selection_grid_fails_validation_when_nothing_selected', async ({ page }) => {
  await page.goto('/forms/test-form-selection-grid-required');

  // Navigate to the final tab (Submit button tab).
  const tabs = page.getByRole('tab');
  await tabs.last().click();

  // Submit without making a selection.
  await page.getByRole('button', { name: /submit/i }).click();

  // Validation error badge should appear.
  await expect(page.locator('[aria-label*="validation error"]')).toBeVisible();
});

// ── Entry Grid: add row and enter data ────────────────────────────────────

test('entry_grid_adds_row_and_accepts_text_input', async ({ page }) => {
  await page.goto('/forms/test-form-entry-grid');

  await page.getByRole('tab', { name: /enter data/i }).click();

  // Click "Add row".
  await page.getByRole('button', { name: /add new row/i }).click();

  // A new row should appear with an input cell.
  const cellInput = page.getByRole('textbox').first();
  await expect(cellInput).toBeVisible();

  await cellInput.fill('Test entry');
  await expect(cellInput).toHaveValue('Test entry');
});

// ── Entry Grid: delete row ────────────────────────────────────────────────

test('entry_grid_deletes_row_on_delete_click', async ({ page }) => {
  await page.goto('/forms/test-form-entry-grid');

  await page.getByRole('tab', { name: /enter data/i }).click();

  // Add a row.
  await page.getByRole('button', { name: /add new row/i }).click();

  // Count rows before delete.
  const rowsBefore = await page.getByRole('row').count();

  // Click delete on the first row.
  await page.getByRole('button', { name: /delete row 1/i }).click();

  const rowsAfter = await page.getByRole('row').count();
  expect(rowsAfter).toBe(rowsBefore - 1);
});

// ── BC-009: Warning banner near operation limit ────────────────────────────

test('entry_grid_shows_warning_when_approaching_operation_limit', async ({ page }) => {
  // This test assumes a form configured with a large number of rows already loaded.
  // In practice this would need a test fixture with many pre-populated rows.
  await page.goto('/forms/test-form-entry-grid-large');

  await page.getByRole('tab', { name: /enter data/i }).click();

  // Warning banner should be visible when approaching the 400+ operation threshold.
  await expect(page.getByText(/approaching submission limit/i)).toBeVisible({ timeout: 3000 });
});
