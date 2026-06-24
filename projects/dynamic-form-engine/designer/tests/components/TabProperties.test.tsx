// RED — failing until TabProperties renders the hideTabBar Switch.
// Tests:
//   1. The "Hide tab bar" switch is rendered.
//   2. Toggling it calls updateTab with { hideTabBar: true }.
//   3. When tab.hideTabBar is true the switch is checked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

// ── Store mock ────────────────────────────────────────────────────────────────
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
}

interface MockSection {
  label: string;
  columnCount: number;
}

interface MockState {
  tabs: Record<string, MockTab>;
  sectionOrder: Record<string, string[]>;
  sections: Record<string, MockSection>;
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
    },
  },
  sectionOrder: { 'tab-1': [] },
  sections: {},
  updateTab: mockUpdateTab,
  updateSection: vi.fn(),
  form: { code: 'test_form' },
};

// ── Component under test ──────────────────────────────────────────────────────
import { TabProperties } from '@/designer/properties/TabProperties';

function renderTabProperties(tabId = 'tab-1') {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TabProperties tabId={tabId} />
    </FluentProvider>
  );
}

describe('TabProperties — hideTabBar toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.tabs['tab-1'].hideTabBar = false;
  });

  it('renders_hideTabBarSwitch', () => {
    renderTabProperties();
    expect(
      screen.getByRole('switch', { name: /hide tab bar/i })
    ).toBeInTheDocument();
  });

  it('renders_hintText_forHideTabBar', () => {
    renderTabProperties();
    expect(screen.getByText(/sections and fields on this tab still render/i)).toBeInTheDocument();
  });

  it('switch_isUnchecked_whenHideTabBarIsFalse', () => {
    mockState.tabs['tab-1'].hideTabBar = false;
    renderTabProperties();
    const switchEl = screen.getByRole('switch', { name: /hide tab bar/i });
    expect(switchEl).not.toBeChecked();
  });

  it('switch_isChecked_whenHideTabBarIsTrue', () => {
    mockState.tabs['tab-1'].hideTabBar = true;
    renderTabProperties();
    const switchEl = screen.getByRole('switch', { name: /hide tab bar/i });
    expect(switchEl).toBeChecked();
  });

  it('toggling_switch_callsUpdateTabWithHideTabBarTrue', async () => {
    const user = userEvent.setup();
    mockState.tabs['tab-1'].hideTabBar = false;
    renderTabProperties();

    const switchEl = screen.getByRole('switch', { name: /hide tab bar/i });
    await user.click(switchEl);

    expect(mockUpdateTab).toHaveBeenCalledOnce();
    expect(mockUpdateTab).toHaveBeenCalledWith('tab-1', { hideTabBar: true });
  });
});
