// Detox E2E tests — My Requests flow

import { by, device, element, expect as detoxExpect, waitFor } from 'detox';

describe('My Requests Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: false });
  });

  it('myRequestsTab_loads_showsRequestList', async () => {
    await waitFor(element(by.id('requests-list'))).toBeVisible().withTimeout(8000);
  });

  it('filterChip_underReview_filtersRequestList', async () => {
    await waitFor(element(by.id('filter-chip-under-review'))).toBeVisible().withTimeout(5000);
    await element(by.id('filter-chip-under-review')).tap();

    // List should still be visible (may be empty if no matching requests)
    await waitFor(element(by.id('requests-list'))).toBeVisible().withTimeout(3000);
  });

  it('tapRequestCard_navigatesToDetailWithTimeline', async () => {
    // Reset filter to All first
    await waitFor(element(by.id('filter-chip-all'))).toBeVisible().withTimeout(3000);
    await element(by.id('filter-chip-all')).tap();

    await waitFor(element(by.id('requests-list'))).toBeVisible().withTimeout(5000);

    // Tap first request
    await element(by.id('requests-list')).atIndex(0).tap();

    // Timeline section should appear on detail screen
    await waitFor(element(by.text('requests.detail.timeline'))).toBeVisible().withTimeout(5000);
  });
});
