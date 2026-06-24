// RED — failing: FormRenderer suppresses tab bar when active tab has hideTabBar=true
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FormRenderer } from '../components/FormRenderer';
import type { FormDefinition, TabDefinition, SectionDefinition, FieldDefinition } from '@qdb/shared';

// ── module mocks ──────────────────────────────────────────────────────────────

jest.mock('../services/apiClient', () => ({
  apiGet: jest.fn(() => Promise.resolve({ records: [], totalCount: 0 })),
  apiPost: jest.fn(() => Promise.resolve(undefined)),
}));

// Safe-area context has no native module in Jest — stub it with zero insets.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// MobileFormContext depends on RuleEngine which pulls in json-rules-engine.
// Mock the whole module so the rule-engine machinery is absent from test runs.
jest.mock('../context/MobileFormContext', () => {
  const React = require('react');
  const emptyRuleState = {
    visibilityMap: new Map<string, boolean>(),
    requiredMap: new Map<string, boolean>(),
    readonlyMap: new Map<string, boolean>(),
    clearedFields: new Set<string>(),
    calculatedValues: new Map<string, unknown>(),
  };
  const Ctx = React.createContext({ ruleState: emptyRuleState });
  return {
    MobileFormProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { ruleState: emptyRuleState } }, children),
    useMobileFormContext: () => React.useContext(Ctx),
  };
});

// ── helpers ──────────────────────────────────────────────────────────────────

function buildField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    fieldId: 'f1',
    fieldKey: 'full_name',
    fieldType: 'text',
    displayLabel: 'Full Name',
    displayOrder: 1,
    isRequiredDefault: false,
    isReadonlyDefault: false,
    isVisibleDefault: true,
    validationRules: [],
    optionValues: [],
    ...overrides,
  };
}

function buildSection(sectionId: string, fields: FieldDefinition[]): SectionDefinition {
  return {
    sectionId,
    displayLabel: 'Section',
    displayOrder: 1,
    isCollapsible: false,
    fields,
  };
}

function buildTab(
  overrides: Partial<TabDefinition> & { tabId: string; displayLabel: string; displayOrder: number },
): TabDefinition {
  return {
    sections: [],
    ...overrides,
  };
}

function buildForm(tabs: TabDefinition[]): FormDefinition {
  return {
    formId: 'form-1',
    formCode: 'TEST',
    displayName: 'Test Form',
    description: '',
    version: 1,
    allowSaveDraft: false,
    confirmationMessage: 'Done',
    tabs,
    buttons: [],
    businessRules: [],
    submissionMappings: [],
    infoCards: [],
    allowInfocardSkip: false,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FormRenderer — hideTabBar', () => {
  it('renders_tab_bar_when_active_tab_has_no_hideTabBar', () => {
    const tabs: TabDefinition[] = [
      buildTab({ tabId: 't1', displayLabel: 'Step 1', displayOrder: 1, sections: [buildSection('s1', [buildField()])] }),
      buildTab({ tabId: 't2', displayLabel: 'Step 2', displayOrder: 2, sections: [buildSection('s2', [buildField({ fieldId: 'f2', fieldKey: 'field2', displayLabel: 'Field 2' })])] }),
    ];
    render(
      <FormRenderer
        form={buildForm(tabs)}
        accessToken="tok"
        onSubmit={jest.fn() as (values: Record<string, unknown>) => void}
      />,
    );
    // Tab labels visible as accessible tab buttons.
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    expect(screen.getByText('Step 1')).toBeTruthy();
    expect(screen.getByText('Step 2')).toBeTruthy();
  });

  it('suppresses_tab_bar_when_active_tab_has_hideTabBar_true', () => {
    const tabs: TabDefinition[] = [
      buildTab({
        tabId: 't1',
        displayLabel: 'E-Sign',
        displayOrder: 1,
        hideTabBar: true,
        sections: [buildSection('s1', [buildField()])],
      }),
      buildTab({
        tabId: 't2',
        displayLabel: 'Review',
        displayOrder: 2,
        sections: [buildSection('s2', [buildField({ fieldId: 'f2', fieldKey: 'field2', displayLabel: 'Field 2' })])],
      }),
    ];
    render(
      <FormRenderer
        form={buildForm(tabs)}
        accessToken="tok"
        onSubmit={jest.fn() as (values: Record<string, unknown>) => void}
      />,
    );
    // The tab bar must NOT be rendered — no elements with role="tab".
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('still_renders_active_tab_content_when_hideTabBar_is_true', () => {
    const tabs: TabDefinition[] = [
      buildTab({
        tabId: 't1',
        displayLabel: 'Disclosure',
        displayOrder: 1,
        hideTabBar: true,
        sections: [buildSection('s1', [buildField({ displayLabel: 'Consent Field' })])],
      }),
    ];
    render(
      <FormRenderer
        form={buildForm(tabs)}
        accessToken="tok"
        onSubmit={jest.fn() as (values: Record<string, unknown>) => void}
      />,
    );
    // Section heading rendered — confirming tab content is present.
    expect(screen.getByText('Section')).toBeTruthy();
    // No tab navigation bar.
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('shows_tab_bar_when_first_active_tab_does_not_have_hideTabBar', () => {
    // First tab (lowest displayOrder) is normal, second has hideTabBar.
    // Renderer starts on the first tab by default.
    const tabs: TabDefinition[] = [
      buildTab({
        tabId: 't1',
        displayLabel: 'Normal Tab',
        displayOrder: 1,
        sections: [buildSection('s1', [buildField()])],
      }),
      buildTab({
        tabId: 't2',
        displayLabel: 'Hidden Bar Tab',
        displayOrder: 2,
        hideTabBar: true,
        sections: [buildSection('s2', [buildField({ fieldId: 'f2', fieldKey: 'field2', displayLabel: 'Field 2' })])],
      }),
    ];
    render(
      <FormRenderer
        form={buildForm(tabs)}
        accessToken="tok"
        onSubmit={jest.fn() as (values: Record<string, unknown>) => void}
      />,
    );
    // Active tab (t1) has no hideTabBar — bar should be visible.
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    expect(screen.getByText('Normal Tab')).toBeTruthy();
    expect(screen.getByText('Hidden Bar Tab')).toBeTruthy();
  });
});
