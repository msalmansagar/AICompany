/**
 * ENT-008 (DFE-ENH-001) — WCAG 2.1 AA automated component scan
 *
 * Layer 2 harness: vitest-axe runs axe-core against the jsdom-rendered
 * TabProperties panel and asserts zero AA violations.
 *
 * RED — failing if the component has any unremediated WCAG 2.1 AA violations.
 * Violations found here are recorded in the F4 scan inventory in phase-4-tech-F.md.
 * Remediation is gated on the F5 workstream — do NOT fix violations in this file.
 *
 * Scope: WCAG 2.1 Level AA (wcag2a + wcag2aa tags).
 * Manual checks (NVDA / VoiceOver): see projects/dfe-designer-enhancements/a11y-manual-checklist.md
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { axe } from 'vitest-axe';

// ── Store mock — mirrors the pattern used in tests/components/TabProperties.test.tsx ──

const mockUpdateTab = vi.fn();
const mockUpdateSection = vi.fn();

interface MockTab {
  label: string;
  iconName: string | null;
  isVisible: boolean;
  requiresPreviousTabComplete: boolean;
  hideTabBar: boolean;
  description?: string;
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
  updateSection: typeof mockUpdateSection;
  form: { code: string } | null;
  navigateTo: () => void;
}

/**
 * Returns a fresh default MockTab. Called in beforeEach to reset shared state
 * between tests — prevents mutation in one test from leaking into the next.
 */
function buildDefaultMockTab(): MockTab {
  return {
    label: 'Personal Information',
    iconName: null,
    isVisible: true,
    requiresPreviousTabComplete: false,
    hideTabBar: false,
    description: '',
  };
}

// Shared state object — individual fields are reset in beforeEach via buildDefaultMockTab().
const mockState: MockState = {
  tabs: { 'tab-a11y': buildDefaultMockTab() },
  sectionOrder: { 'tab-a11y': ['section-a11y'] },
  sections: {
    'section-a11y': { label: 'Contact Details', columnCount: 1 },
  },
  updateTab: mockUpdateTab,
  updateSection: mockUpdateSection,
  form: { code: 'loan-application' },
  navigateTo: vi.fn(),
};

vi.mock('@/state/designerStore', () => ({
  useDesignerStore: vi.fn((selector: (state: MockState) => unknown) => selector(mockState)),
}));

// Prevent TranslationsPanel / ScopedButtonsPanel from making real HTTP requests.
// The component renders fetch calls inside accordions that start collapsed;
// this stub ensures no network errors surface during the axe scan.
vi.stubGlobal('fetch', vi.fn().mockImplementation(
  () => new Promise(() => { /* intentionally pending */ })
));

// ── Component under test ──────────────────────────────────────────────────────
import { TabProperties } from '@/designer/properties/TabProperties';

function renderTabPropertiesInTheme(tabId = 'tab-a11y'): HTMLElement {
  const { container } = render(
    <FluentProvider theme={webLightTheme}>
      <main>
        {/* Wrap in <main> so landmark-one-main rule is satisfied during the scan. */}
        <TabProperties tabId={tabId} />
      </main>
    </FluentProvider>
  );
  return container;
}

// ── axe configuration ─────────────────────────────────────────────────────────

const AXE_AA_CONFIG = {
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa'],
  },
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('TabProperties — WCAG 2.1 AA automated scan (ENT-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the tab to its default state before every test so that mutations
    // made in one test (e.g. setting hideTabBar = true) do not leak forward.
    mockState.tabs['tab-a11y'] = buildDefaultMockTab();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('TabProperties_defaultState_hasNoWcag2aaViolations', async () => {
    // RED — this test fails if any WCAG 2.1 AA violations exist.
    // Failures are inventoried in phase-4-tech-F.md; remediation is F5.
    const container = renderTabPropertiesInTheme();
    const results = await axe(container, AXE_AA_CONFIG);
    expect(results).toHaveNoViolations();
  });

  it('TabProperties_hideTabBarEnabled_hasNoWcag2aaViolations', async () => {
    // Scan the alternate render path where hideTabBar = true changes visible switches.
    // Safe to mutate — beforeEach restores to default before the next test.
    mockState.tabs['tab-a11y'].hideTabBar = true;
    const container = renderTabPropertiesInTheme();
    const results = await axe(container, AXE_AA_CONFIG);
    expect(results).toHaveNoViolations();
  });
});
