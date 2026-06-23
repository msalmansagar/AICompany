// RED — failing until InfoCardField is implemented.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { InfoCardField } from './InfoCardField';
import type { FieldDefinition } from '@qdb/shared';

function makeInfoCardField(
  overrides: Partial<FieldDefinition> = {},
): FieldDefinition {
  return {
    id: 'field-info-1',
    sectionId: 'section-1',
    fieldType: 'info-card',
    schemaName: 'infoField',
    label: 'Info Card',
    displayOrder: 1,
    columnSpan: 4,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    infoCardStyle: 'info',
    infoCardTitle: 'Please note',
    infoCardBody: 'All fields are required before submission.',
    ...overrides,
  };
}

function renderInfoCard(field: FieldDefinition) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <InfoCardField field={field} />
    </FluentProvider>,
  );
}

describe('InfoCardField', () => {
  it('renders_noteRole_withAriaLabel_forTitle', () => {
    const field = makeInfoCardField();

    renderInfoCard(field);

    const note = screen.getByRole('note');
    expect(note).toBeTruthy();
    expect(note.getAttribute('aria-label')).toBe('Please note');
  });

  it('renders_title_whenInforCardTitleIsProvided', () => {
    const field = makeInfoCardField({ infoCardTitle: 'Important notice' });

    renderInfoCard(field);

    expect(screen.getByText('Important notice')).toBeTruthy();
  });

  it('renders_body_whenInfoCardBodyIsProvided', () => {
    const field = makeInfoCardField({
      infoCardBody: 'Please read this carefully.',
    });

    renderInfoCard(field);

    expect(screen.getByText('Please read this carefully.')).toBeTruthy();
  });

  it('renders_withoutTitle_whenInfoCardTitleIsAbsent', () => {
    const field = makeInfoCardField({ infoCardTitle: undefined });

    renderInfoCard(field);

    // Body still renders even if title is absent.
    expect(
      screen.getByText('All fields are required before submission.'),
    ).toBeTruthy();
  });

  it('renders_withoutBody_whenInfoCardBodyIsAbsent', () => {
    const field = makeInfoCardField({
      infoCardBody: undefined,
      infoCardTitle: 'Title only',
    });

    renderInfoCard(field);

    expect(screen.getByText('Title only')).toBeTruthy();
  });

  it('renders_warningVariant_withNoteRole', () => {
    const field = makeInfoCardField({
      infoCardStyle: 'warning',
      infoCardTitle: 'Warning',
      infoCardBody: 'Be careful.',
    });

    renderInfoCard(field);

    const note = screen.getByRole('note');
    expect(note).toBeTruthy();
    expect(screen.getByText('Warning')).toBeTruthy();
    expect(screen.getByText('Be careful.')).toBeTruthy();
  });

  it('renders_successVariant', () => {
    const field = makeInfoCardField({
      infoCardStyle: 'success',
      infoCardTitle: 'Done',
      infoCardBody: 'Your application is complete.',
    });

    renderInfoCard(field);

    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Your application is complete.')).toBeTruthy();
  });

  it('renders_errorVariant', () => {
    const field = makeInfoCardField({
      infoCardStyle: 'error',
      infoCardTitle: 'Error',
      infoCardBody: 'Fix all validation issues.',
    });

    renderInfoCard(field);

    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('Fix all validation issues.')).toBeTruthy();
  });

  it('renders_defaultInfoVariant_whenStyleIsAbsent', () => {
    const field = makeInfoCardField({ infoCardStyle: undefined });

    renderInfoCard(field);

    const note = screen.getByRole('note');
    expect(note).toBeTruthy();
  });

  it('does_not_register_formInput_element', () => {
    const field = makeInfoCardField();

    const { container } = renderInfoCard(field);

    // info-card is display-only — no input, select or textarea should exist.
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });
});
