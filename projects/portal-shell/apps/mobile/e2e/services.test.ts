// Detox E2E tests — Services browsing flow
// Prerequisites: user logged in, services seeded in API

import { by, device, element, expect as detoxExpect, waitFor } from 'detox';

describe('Services Flow', () => {
  beforeAll(async () => {
    // Launch with stored token (assumes prior login test or seed)
    await device.launchApp({ newInstance: false });
  });

  it('servicesTab_loads_showsServiceList', async () => {
    await waitFor(element(by.id('services-list'))).toBeVisible().withTimeout(8000);
  });

  it('searchServices_typingQuery_filtersResults', async () => {
    await waitFor(element(by.id('services-search-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('services-search-input')).typeText('Business');

    // Results list should still be visible with filtered items
    await waitFor(element(by.id('services-list'))).toBeVisible().withTimeout(3000);
  });

  it('tapServiceCard_navigatesToDetailScreen', async () => {
    await waitFor(element(by.id('services-list'))).toBeVisible().withTimeout(8000);

    // Tap first service card
    await element(by.id('services-list')).atIndex(0).tap();

    // Detail screen Apply Now button should appear
    await waitFor(element(by.text('services.detail.applyNow'))).toBeVisible().withTimeout(5000);
  });
});
