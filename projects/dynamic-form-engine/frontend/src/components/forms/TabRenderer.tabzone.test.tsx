import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { FieldDefinition, TabDefinition } from '@qdb/shared';

vi.mock('../../contexts/FormContext', () => ({
  useFormContext: () => ({
    ruleState: {
      fieldVisibility: {},
      sectionVisibility: {},
      tabVisibility: {},
      fieldRequired: {},
      fieldReadonly: {},
      fieldValues: {},
      filteredOptions: {},
    },
    validationErrors: {},
  }),
}));
vi.mock('./FieldRenderer', () => ({
  FieldRenderer: ({ field }: { field: FieldDefinition }) => <div data-testid="field">{field.label}</div>,
}));
vi.mock('./SectionRenderer', () => ({
  SectionRenderer: ({ section }: { section: { label: string } }) => (
    <div data-testid="section">{section.label}</div>
  ),
}));
vi.mock('./ScopedButtonBar', () => ({ ScopedButtonBar: () => null }));
vi.mock('./SaveDraftButton', () => ({ SaveDraftButton: () => null }));
vi.mock('./SubmitButton', () => ({ SubmitButton: () => null }));

// eslint-disable-next-line import/first
import { TabRenderer } from './TabRenderer';

function zoneField(id: string, label: string, placement: 'header' | 'footer'): FieldDefinition {
  return {
    id,
    sectionId: '',
    schemaName: id,
    label,
    fieldType: 'text',
    displayOrder: 1,
    columnSpan: 4,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    placement,
  } as FieldDefinition;
}

function baseTab(over: Partial<TabDefinition> = {}): TabDefinition {
  return {
    id: 'tab-1',
    formDefinitionId: 'form-1',
    label: 'Details',
    displayOrder: 1,
    isVisible: true,
    requiresPreviousTabComplete: false,
    sections: [
      {
        id: 'sec-1',
        tabId: 'tab-1',
        label: 'Section A',
        displayOrder: 1,
        columns: 1,
        isCollapsible: false,
        isCollapsedByDefault: false,
        isVisible: true,
        fields: [],
      },
    ],
    ...over,
  } as TabDefinition;
}

function renderTab(tab: TabDefinition) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TabRenderer tab={tab} isVisible={true} isTabActive />
    </FluentProvider>,
  );
}

describe('TabRenderer header/footer zones', () => {
  it('renders header-placed fields in the tab header zone', () => {
    renderTab(baseTab({ headerFields: [zoneField('h1', 'Header Field', 'header')] }));

    const zone = screen.getByRole('group', { name: 'Details header' });
    expect(within(zone).getByText('Header Field')).toBeTruthy();
  });

  it('renders footer-placed fields in the tab footer zone', () => {
    renderTab(baseTab({ footerFields: [zoneField('f1', 'Footer Field', 'footer')] }));

    const zone = screen.getByRole('group', { name: 'Details footer' });
    expect(within(zone).getByText('Footer Field')).toBeTruthy();
  });

  it('renders sections and no zones for legacy tabs (backward compatible)', () => {
    renderTab(baseTab());

    expect(screen.getByTestId('section')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Details header' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Details footer' })).toBeNull();
  });

  it('hides a header field whose visibility rule is off', () => {
    renderTab(baseTab({ headerFields: [{ ...zoneField('h1', 'Hidden', 'header'), isHidden: true }] }));

    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
