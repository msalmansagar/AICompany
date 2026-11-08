// The acknowledgement label column was widened from 200 to 1000 characters. A single-line
// Input cannot show a sentence that long — the maker types into a scrolling slot and cannot
// read back what they wrote — so both panels bind it to a Textarea that states the ceiling.
//
// The ceiling matters beyond ergonomics: typing past the column's MaxLength fails at save
// with a raw OData error, which reads to a maker as "the designer is broken".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUBMIT_CONFIRMATION_LABEL_MAX_LENGTH } from '@/constants/columnLimits';

const mockUpdateTab = vi.fn();

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn((selector: (state: MockState) => unknown) => selector(mockState)),
}));

interface MockTab {
  label: string;
  iconName: string | null;
  isVisible: boolean;
  requiresPreviousTabComplete: boolean;
  hideTabBar: boolean;
  revealsSectionsOneAtATime: boolean;
  requireSubmitConfirmation: boolean;
  submitConfirmationLabel: string | null;
  submitConfirmationMessage: string | null;
}

interface MockState {
  tabs: Record<string, MockTab>;
  sectionOrder: Record<string, string[]>;
  sections: Record<string, unknown>;
  updateTab: typeof mockUpdateTab;
  updateSection: () => void;
  form: { code: string } | null;
}

const mockState: MockState = {
  tabs: {
    'tab-1': {
      label: 'My Tab',
      iconName: null,
      isVisible: true,
      requiresPreviousTabComplete: false,
      hideTabBar: false,
      revealsSectionsOneAtATime: false,
      requireSubmitConfirmation: true,
      submitConfirmationLabel: null,
      submitConfirmationMessage: null,
    },
  },
  sectionOrder: { 'tab-1': [] },
  sections: {},
  updateTab: mockUpdateTab,
  updateSection: vi.fn(),
  form: { code: 'test_form' },
};

import { TabProperties } from '@/designer/properties/TabProperties';

const PANELS = [
  join(__dirname, '../../src/designer/properties/TabProperties.tsx'),
  join(__dirname, '../../src/designer/properties/FormProperties.tsx'),
];

describe('submit confirmation label accepts the full widened column', () => {
  beforeEach(() => {
    mockUpdateTab.mockClear();
  });

  it('tabConfirmationLabel_rendersAsMultiLine_notASingleLineInput', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <TabProperties tabId="tab-1" />
      </FluentProvider>
    );

    const control = screen.getByLabelText('Submit Confirmation Label');

    expect(control.tagName).toBe('TEXTAREA');
  });

  it('tabConfirmationLabel_statesTheColumnCeiling', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <TabProperties tabId="tab-1" />
      </FluentProvider>
    );

    const control = screen.getByLabelText('Submit Confirmation Label');

    expect(control.getAttribute('maxlength')).toBe(String(SUBMIT_CONFIRMATION_LABEL_MAX_LENGTH));
  });

  // Source rule: jsdom can prove the tab panel, but FormProperties needs the whole designer
  // store to render. The invariant both must hold is that neither hardcodes the ceiling —
  // widening the column again should be one edit to columnLimits.ts, not a hunt through panels.
  it.each(PANELS)('%s_importsTheCeilingRatherThanHardcodingIt', file => {
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('SUBMIT_CONFIRMATION_LABEL_MAX_LENGTH');
    expect(source).not.toContain('maxLength={1000}');
  });
});
