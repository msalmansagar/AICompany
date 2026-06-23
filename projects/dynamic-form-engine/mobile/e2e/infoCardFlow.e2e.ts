// Detox E2E — Info-Card Flow + Boolean Field + Interactive Grid
// Run: detox test --configuration ios.sim.debug -t "Info Card"

import { device, element, by, expect as detoxExpect } from 'detox';

describe('Info Card Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should display first info-card screen on form open', async () => {
    // Navigate to a form that has info-cards configured
    await element(by.id('form-list-item-INFO_CARD_FORM')).tap();
    await detoxExpect(element(by.text('Welcome to the Form'))).toBeVisible();
  });

  it('should navigate to the next info-card screen when Continue is tapped', async () => {
    await element(by.id('form-list-item-INFO_CARD_FORM')).tap();
    await detoxExpect(element(by.text('Welcome to the Form'))).toBeVisible();
    await element(by.label('Continue')).tap();
    await detoxExpect(element(by.text('What to Expect'))).toBeVisible();
  });

  it('should show Start button on the last info-card screen', async () => {
    await element(by.id('form-list-item-INFO_CARD_FORM')).tap();
    await element(by.label('Continue')).tap();
    await detoxExpect(element(by.label('Start'))).toBeVisible();
  });

  it('should transition to form phase when Start is tapped', async () => {
    await element(by.id('form-list-item-INFO_CARD_FORM')).tap();
    await element(by.label('Continue')).tap();
    await element(by.label('Start')).tap();
    await detoxExpect(element(by.id('form-renderer'))).toBeVisible();
  });

  it('should skip to form phase when Skip is tapped', async () => {
    await element(by.id('form-list-item-INFO_CARD_FORM')).tap();
    await element(by.label('Skip')).tap();
    await detoxExpect(element(by.id('form-renderer'))).toBeVisible();
  });

  it('should navigate back to previous info-card screen', async () => {
    await element(by.id('form-list-item-INFO_CARD_FORM')).tap();
    await element(by.label('Continue')).tap();
    await detoxExpect(element(by.label('Back'))).toBeVisible();
    await element(by.label('Back')).tap();
    await detoxExpect(element(by.text('Welcome to the Form'))).toBeVisible();
  });

  it('should bypass info-cards when resuming a draft', async () => {
    // Navigate with an existing draft ID — should land directly on form
    await element(by.id('draft-resume-INFO_CARD_FORM')).tap();
    await detoxExpect(element(by.id('form-renderer'))).toBeVisible();
    await detoxExpect(element(by.text('Welcome to the Form'))).not.toBeVisible();
  });
});

describe('Boolean Field', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    await element(by.id('form-list-item-BOOL_FORM')).tap();
    await element(by.label('Start')).tap();
  });

  it('should render toggle switch for boolean toggle field', async () => {
    await detoxExpect(element(by.id('boolean-toggle-agree'))).toBeVisible();
  });

  it('should toggle value when switch is tapped', async () => {
    await element(by.id('boolean-toggle-agree')).tap();
    await detoxExpect(element(by.id('boolean-toggle-agree'))).toHaveValue('1');
  });

  it('should render two radio options for boolean radio field', async () => {
    await detoxExpect(element(by.label('Yes'))).toBeVisible();
    await detoxExpect(element(by.label('No'))).toBeVisible();
  });

  it('should select true option when Yes radio is tapped', async () => {
    await element(by.label('Yes')).tap();
    await detoxExpect(element(by.label('Yes'))).toHaveAccessibilityValue({ checked: true });
  });
});

describe('Interactive Grid — Tab-aware Load', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    await element(by.id('form-list-item-GRID_FORM')).tap();
    await element(by.label('Start')).tap();
  });

  it('should not load grid records until tab becomes active', async () => {
    // Grid is on tab 2 — when on tab 1, no loading spinner visible
    await detoxExpect(element(by.id('grid-loading-spinner'))).not.toBeVisible();
  });

  it('should load grid records when its tab becomes active', async () => {
    await element(by.text('Records Tab')).tap();
    await detoxExpect(element(by.id('grid-loading-spinner'))).toBeVisible();
    await waitFor(element(by.id('grid-record-row-0'))).toBeVisible().withTimeout(5000);
  });

  it('should select a record in single-select mode', async () => {
    await element(by.text('Records Tab')).tap();
    await waitFor(element(by.id('grid-record-row-0'))).toBeVisible().withTimeout(5000);
    await element(by.id('grid-record-row-0')).tap();
    await detoxExpect(element(by.id('grid-record-row-0'))).toHaveAccessibilityValue({ checked: true });
  });
});

describe('Tab-aware Submit Button', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    await element(by.id('form-list-item-MULTI_TAB_FORM')).tap();
    await element(by.label('Start')).tap();
  });

  it('should hide Submit button on non-final tabs', async () => {
    // On first tab
    await detoxExpect(element(by.label('Submit'))).not.toBeVisible();
  });

  it('should show Submit button only on the final tab', async () => {
    // Navigate to last tab
    await element(by.text('Final Tab')).tap();
    await detoxExpect(element(by.label('Submit'))).toBeVisible();
  });

  it('should show Save Draft button on all tabs', async () => {
    await detoxExpect(element(by.label('Save Draft'))).toBeVisible();
    await element(by.text('Final Tab')).tap();
    await detoxExpect(element(by.label('Save Draft'))).toBeVisible();
  });
});
