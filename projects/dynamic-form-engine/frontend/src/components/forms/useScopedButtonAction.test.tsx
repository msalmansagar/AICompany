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
    formDefinition: {
      tabs: [
        { id: 'tab-a', isVisible: true, sections: [] },
        { id: 'tab-b', isVisible: true, sections: [] },
        { id: 'tab-c', isVisible: true, sections: [] },
      ],
    },
    ruleState: { tabVisibility: {}, fieldVisibility: {}, fieldRequired: {}, sectionVisibility: {}, fieldReadonly: {} },
    fieldValues: {},
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

  it('blocks_navigation_to_a_requiresPreviousTabComplete_tab_when_incomplete (BR-002)', () => {
    mockUseFormContext.mockReturnValue({
      formDefinition: {
        tabs: [
          { id: 't0', isVisible: true, sections: [{ id: 's0', fields: [{ id: 'f1', schemaName: 'qdb_x', isVisible: true, isRequired: true }] }] },
          { id: 't1', isVisible: true, requiresPreviousTabComplete: true, sections: [] },
        ],
      },
      ruleState: { tabVisibility: {}, fieldVisibility: {}, fieldRequired: {}, sectionVisibility: {}, fieldReadonly: {} },
      fieldValues: {}, // required field qdb_x is empty → preceding tab incomplete
      activeTabIndex: 0,
      setActiveTabIndex,
      submitForm,
      saveDraft,
    });
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'navigate', target: 'tab', targetTabId: 't1' }));
    expect(setActiveTabIndex).not.toHaveBeenCalled();
  });

  it('allows_navigation_to_a_requiresPreviousTabComplete_tab_when_complete', () => {
    mockUseFormContext.mockReturnValue({
      formDefinition: {
        tabs: [
          { id: 't0', isVisible: true, sections: [{ id: 's0', fields: [{ id: 'f1', schemaName: 'qdb_x', isVisible: true, isRequired: true }] }] },
          { id: 't1', isVisible: true, requiresPreviousTabComplete: true, sections: [] },
        ],
      },
      ruleState: { tabVisibility: {}, fieldVisibility: {}, fieldRequired: {}, sectionVisibility: {}, fieldReadonly: {} },
      fieldValues: { qdb_x: 'filled' },
      activeTabIndex: 0,
      setActiveTabIndex,
      submitForm,
      saveDraft,
    });
    const { result } = renderHook(() => useScopedButtonAction());
    result.current(button({ type: 'navigate', target: 'tab', targetTabId: 't1' }));
    expect(setActiveTabIndex).toHaveBeenCalledWith(1);
  });
});
