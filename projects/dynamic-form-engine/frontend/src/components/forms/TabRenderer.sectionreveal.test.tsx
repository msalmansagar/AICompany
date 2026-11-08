import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { SectionDefinition, TabDefinition } from '@qdb/shared';

// The active section index comes from FormContext; each test sets it before rendering.
const formContext = {
  ruleState: {
    fieldVisibility: {},
    sectionVisibility: {} as Record<string, boolean>,
    tabVisibility: {},
    fieldRequired: {},
    fieldReadonly: {},
    fieldValues: {},
    filteredOptions: {},
  },
  validationErrors: {},
  activeSectionIndex: 0,
};

vi.mock('../../contexts/FormContext', () => ({
  useFormContext: () => formContext,
}));
vi.mock('./FieldRenderer', () => ({ FieldRenderer: () => null }));
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

function section(id: string, label: string, displayOrder: number): SectionDefinition {
  return { id, label, displayOrder, isVisible: true, fields: [] } as unknown as SectionDefinition;
}

function tabWith(revealsOneAtATime: boolean): TabDefinition {
  return {
    id: 'tab-1',
    formDefinitionId: 'form-1',
    label: 'Details',
    displayOrder: 1,
    isVisible: true,
    requiresPreviousTabComplete: false,
    revealsSectionsOneAtATime: revealsOneAtATime,
    sections: [
      section('sec-1', 'Applicant', 1),
      section('sec-2', 'Company details', 2),
      section('sec-3', 'Documents', 3),
    ],
  } as unknown as TabDefinition;
}

function renderTab(tab: TabDefinition) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TabRenderer tab={tab} isVisible />
    </FluentProvider>,
  );
}

function shownSections(): string[] {
  return screen.queryAllByTestId('section').map((node) => node.textContent ?? '');
}

describe('TabRenderer — reveal sections one at a time', () => {
  it('renders_every_section_when_the_tab_shows_them_all_at_once', () => {
    formContext.activeSectionIndex = 0;
    formContext.ruleState.sectionVisibility = {};

    renderTab(tabWith(false));

    expect(shownSections()).toEqual(['Applicant', 'Company details', 'Documents']);
  });

  it('renders_only_the_first_section_when_revealing_one_at_a_time', () => {
    formContext.activeSectionIndex = 0;
    formContext.ruleState.sectionVisibility = {};

    renderTab(tabWith(true));

    expect(shownSections()).toEqual(['Applicant']);
  });

  it('renders_the_section_at_the_active_index', () => {
    formContext.activeSectionIndex = 2;
    formContext.ruleState.sectionVisibility = {};

    renderTab(tabWith(true));

    expect(shownSections()).toEqual(['Documents']);
  });

  it('counts_the_index_against_visible_sections_only', () => {
    // A rule hides the middle section, so index 1 is the third section, not the second.
    formContext.activeSectionIndex = 1;
    formContext.ruleState.sectionVisibility = { 'sec-2': false };

    renderTab(tabWith(true));

    expect(shownSections()).toEqual(['Documents']);
  });

  it('falls_back_to_the_last_section_when_a_rule_hides_the_one_the_user_was_on', () => {
    // Index 2 with only two sections left would otherwise render an empty tab, stranding
    // the user with no button to move on.
    formContext.activeSectionIndex = 2;
    formContext.ruleState.sectionVisibility = { 'sec-3': false };

    renderTab(tabWith(true));

    expect(shownSections()).toEqual(['Company details']);
  });

  it('renders_nothing_rather_than_crashing_when_every_section_is_hidden', () => {
    formContext.activeSectionIndex = 1;
    formContext.ruleState.sectionVisibility = { 'sec-1': false, 'sec-2': false, 'sec-3': false };

    renderTab(tabWith(true));

    expect(shownSections()).toEqual([]);
  });
});
