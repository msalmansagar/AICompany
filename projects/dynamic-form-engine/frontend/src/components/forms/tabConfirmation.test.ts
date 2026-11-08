import { describe, it, expect } from 'vitest';
import type { TabDefinition } from '@qdb/shared';
import { evaluateTabConfirmation } from './tabConfirmation';

function makeTab(overrides: Partial<TabDefinition>): TabDefinition {
  return {
    id: 'tab-1',
    formDefinitionId: 'form-1',
    label: 'Tab',
    displayOrder: 1,
    isVisible: true,
    requiresPreviousTabComplete: false,
    sections: [],
    ...overrides,
  } as TabDefinition;
}

const GATED = makeTab({
  id: 'terms',
  label: 'Terms',
  submitConfirmation: { checkboxLabel: 'I accept the terms' },
});
const UNGATED = makeTab({ id: 'details', label: 'Details' });

describe('evaluateTabConfirmation', () => {
  it('allowsLeavingATabThatRequiresNothing', () => {
    const state = evaluateTabConfirmation([UNGATED], {});

    expect(state.canLeaveTab(UNGATED)).toBe(true);
    expect(state.isSubmitBlocked).toBe(false);
  });

  it('blocksLeavingAGatedTabUntilItIsAcknowledged', () => {
    expect(evaluateTabConfirmation([GATED], {}).canLeaveTab(GATED)).toBe(false);
    expect(evaluateTabConfirmation([GATED], { terms: true }).canLeaveTab(GATED)).toBe(true);
  });

  it('blocksSubmitForATabTheUserNeverOpened', () => {
    // The reason submit re-checks: a jump-to-tab button can land the user on the final tab
    // without ever passing through the gated one, so navigation alone is not enough.
    const state = evaluateTabConfirmation([UNGATED, GATED], {});

    expect(state.isSubmitBlocked).toBe(true);
    expect(state.unacknowledgedTabs.map((tab) => tab.label)).toEqual(['Terms']);
  });

  it('releasesSubmitOnceEveryGatedTabIsAcknowledged', () => {
    const state = evaluateTabConfirmation([UNGATED, GATED], { terms: true });

    expect(state.isSubmitBlocked).toBe(false);
    expect(state.unacknowledgedTabs).toEqual([]);
  });

  it('namesEveryOutstandingTab_soTheUserKnowsWhereToGo', () => {
    const second = makeTab({
      id: 'privacy',
      label: 'Privacy',
      submitConfirmation: { checkboxLabel: 'I accept the privacy notice' },
    });

    const state = evaluateTabConfirmation([GATED, second], {});

    expect(state.unacknowledgedTabs.map((tab) => tab.label)).toEqual(['Terms', 'Privacy']);
  });

  it('treatsAnUntickedBoxAsUnacknowledged', () => {
    expect(evaluateTabConfirmation([GATED], { terms: false }).isSubmitBlocked).toBe(true);
  });

  it('leavesFormsWithNoGatedTabsCompletelyUnaffected', () => {
    const state = evaluateTabConfirmation([UNGATED, makeTab({ id: 'other' })], {});

    expect(state.isSubmitBlocked).toBe(false);
    expect(state.canLeaveTab(undefined)).toBe(true);
  });
});
