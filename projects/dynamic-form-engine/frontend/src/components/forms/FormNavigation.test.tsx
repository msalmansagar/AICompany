// RED — failing until hideTabBar suppression is implemented in FormNavigation
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FormNavigation } from './FormNavigation';
import type { TabDefinition } from '@qdb/shared';

// ── Context mocks ─────────────────────────────────────────────────────────────

vi.mock('../../contexts/FormContext', () => ({
  useFormContext: () => ({
    formDefinition: null,
    ruleState: {
      fieldVisibility: {},
      sectionVisibility: {},
      tabVisibility: {},
      fieldRequired: {},
      fieldReadonly: {},
      fieldValues: {},
      filteredOptions: {},
    },
    fieldValues: {},
    validationErrors: {},
  }),
}));

vi.mock('../../contexts/DesignContext', () => ({
  useDesignContext: () => ({
    theme: { themeCode: 'default' },
    formDesign: {
      tabStyle: 'Tabs',
      layoutType: 'SingleColumn',
      labelPosition: 'Top',
      sectionStyle: 'Card',
      buttonStyle: 'Primary',
      animationEnabled: false,
      alignment: 'Left',
      stickyActionBar: false,
    },
    sectionDesigns: {},
    fieldDesigns: {},
    buttonDesigns: {},
    layoutGrid: [],
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTab(overrides: Partial<TabDefinition> = {}): TabDefinition {
  return {
    id: `tab-${Math.random().toString(36).slice(2)}`,
    formDefinitionId: 'form-001',
    label: 'Tab Label',
    displayOrder: 1,
    isVisible: true,
    sections: [],
    requiresPreviousTabComplete: false,
    ...overrides,
  };
}

function renderNav(
  tabs: TabDefinition[],
  activeTabIndex: number,
  onTabChange = vi.fn(),
) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <FormNavigation
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        onTabChange={onTabChange}
      />
    </FluentProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FormNavigation — hideTabBar suppression', () => {
  it('renders_tabStrip_whenActiveTabHasNoHideTabBar', () => {
    const tabs = [
      makeTab({ label: 'Step One', hideTabBar: false }),
      makeTab({ label: 'Step Two' }),
    ];

    renderNav(tabs, 0);

    expect(screen.getByRole('navigation')).toBeTruthy();
  });

  it('renders_tabStrip_whenActiveTabHideTabBarIsUndefined', () => {
    const tabs = [
      makeTab({ label: 'Personal Info' }),
      makeTab({ label: 'Documents' }),
    ];

    renderNav(tabs, 0);

    expect(screen.getByRole('navigation')).toBeTruthy();
  });

  it('suppresses_tabStrip_whenActiveTabHasHideTabBarTrue', () => {
    const tabs = [
      makeTab({ label: 'Normal Tab' }),
      makeTab({ label: 'Hidden Nav Tab', hideTabBar: true }),
    ];

    const { container } = renderNav(tabs, 1);

    // No <nav> element must exist when the active tab has hideTabBar === true.
    expect(container.querySelector('nav')).toBeNull();
  });

  it('renders_tabStrip_onFirstTab_whenOnlySecondTabHasHideTabBar', () => {
    const tabs = [
      makeTab({ label: 'Intro' }),
      makeTab({ label: 'Hidden', hideTabBar: true }),
    ];

    // Active tab is index 0 — strip must still render.
    renderNav(tabs, 0);

    expect(screen.getByRole('navigation')).toBeTruthy();
  });

  it('suppresses_tabStrip_whenSingleTabHasHideTabBarTrue', () => {
    const tabs = [makeTab({ label: 'Only Tab', hideTabBar: true })];

    const { container } = renderNav(tabs, 0);

    expect(container.querySelector('nav')).toBeNull();
  });

  it('renders_allTabLabels_inStrip_whenActiveTabHasNoHideTabBar', () => {
    const tabs = [
      makeTab({ label: 'Alpha', hideTabBar: false }),
      makeTab({ label: 'Beta', hideTabBar: true }),
    ];

    renderNav(tabs, 0);

    // The strip for the active (non-hidden) tab must show all tab labels.
    // Fluent UI Tab renders the label text twice (visible + reserved-space clone),
    // so we use getAllByText and assert at least one match exists.
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
  });
});
