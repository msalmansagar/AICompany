import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScopedButton, ScopedButtonAction } from '@qdb/shared';

const { mockUseFormContext } = vi.hoisted(() => ({ mockUseFormContext: vi.fn() }));
vi.mock('../../contexts/FormContext', () => ({ useFormContext: mockUseFormContext }));

import { useScopedButtonAction } from './useScopedButtonAction';

const submitForm = vi.fn();
const saveDraft = vi.fn();
const setActiveTabIndex = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFormContext.mockReturnValue({
    formDefinition: { tabs: [{ id: 'tab-a' }, { id: 'tab-b' }, { id: 'tab-c' }] },
    activeTabIndex: 0,
    setActiveTabIndex,
    submitForm,
    saveDraft,
  });
});

function button(action: ScopedButtonAction): ScopedButton {
  return {
    id: 'b',
    placementScope: 'tab',
    placementId: 'tab-a',
    label: 'x',
    displayOrder: 0,
    isPrimary: false,
    isVisible: true,
    confirmationRequired: false,
    action,
    isActive: true,
  };
}

describe('useScopedButtonAction', () => {
  it('finalSubmit_dispatches_submitForm_with_the_button_id', () => {
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'finalSubmit', extraParams: [] }));
    expect(submitForm).toHaveBeenCalledWith('b');
  });

  it('saveDraft_dispatches_saveDraft', () => {
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'saveDraft' }));
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('navigate_nextStep_advances_the_active_tab', () => {
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'navigate', target: 'nextStep' }));
    expect(setActiveTabIndex).toHaveBeenCalledWith(1);
  });

  it('navigate_tab_jumps_to_the_target_tab_index', () => {
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'navigate', target: 'tab', targetTabId: 'tab-c' }));
    expect(setActiveTabIndex).toHaveBeenCalledWith(2);
  });

  it('navigate_section_scrolls_to_the_section_anchor', () => {
    const anchor = document.createElement('div');
    anchor.id = 'section-sec-9';
    anchor.scrollIntoView = vi.fn();
    document.body.appendChild(anchor);

    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'navigate', target: 'section', targetSectionId: 'sec-9' }));

    expect(anchor.scrollIntoView).toHaveBeenCalled();
    document.body.removeChild(anchor);
  });

  it('callApi_is_gated_and_neither_submits_nor_navigates', () => {
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'callApi', endpointKey: 'k', method: 'POST' }));
    expect(submitForm).not.toHaveBeenCalled();
    expect(setActiveTabIndex).not.toHaveBeenCalled();
  });

  it('navigate_externalUrl_is_gated_and_does_not_navigate', () => {
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'navigate', target: 'externalUrl', externalUrlKey: 'k' }));
    expect(setActiveTabIndex).not.toHaveBeenCalled();
  });
});
