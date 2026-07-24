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

  it('renders_jsonItems_asRows_sortedByOrder', () => {
    const field = makeInfoCardField({
      infoCardBody: JSON.stringify([
        { Order: 2, Label: 'Second step', icon: 'info' },
        { Order: 1, Label: 'First step', icon: 'info' },
      ]),
    });

    renderInfoCard(field);

    const first = screen.getByText('First step');
    const second = screen.getByText('Second step');
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    // First step (Order 1) must appear before Second step (Order 2) in the DOM.
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('renders_legacyPlainText_unchanged', () => {
    const field = makeInfoCardField({ infoCardBody: 'Just some plain guidance.' });

    renderInfoCard(field);

    expect(screen.getByText('Just some plain guidance.')).toBeTruthy();
  });

  it('renders_invalidJson_asPlainTextFallback', () => {
    const broken = '[{ "Order": 1, "Label": "oops"';
    const field = makeInfoCardField({ infoCardBody: broken });

    renderInfoCard(field);

    // Does not crash; the raw string is shown as a fallback.
    expect(screen.getByText(broken)).toBeTruthy();
  });

  // DFE-INFOLIST-001 — configurable body list styles.

  // CEO condition C-GO-003 — backward compatibility: a field with no list type
  // renders exactly as before, with no list container introduced.
  it('renders_noListContainer_whenListTypeIsAbsent', () => {
    const field = makeInfoCardField({
      infoCardBody: 'Line one\nLine two',
    });

    const { container } = renderInfoCard(field);

    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('ol')).toBeNull();
    // The body still renders as plain text (unchanged legacy behaviour).
    expect(screen.getByText('Line one Line two')).toBeTruthy();
  });

  it('renders_bulletList_asUnorderedList_oneItemPerLine', () => {
    const field = makeInfoCardField({
      infoCardListType: 'bullet',
      infoCardBody: 'First point\nSecond point\nThird point',
    });

    const { container } = renderInfoCard(field);

    const list = container.querySelector('ul');
    expect(list).toBeTruthy();
    expect(list?.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('First point')).toBeTruthy();
    expect(screen.getByText('Third point')).toBeTruthy();
  });

  it('renders_arabicNumberedList_asOrderedList', () => {
    const field = makeInfoCardField({
      infoCardListType: 'numbered-arabic',
      infoCardBody: 'Alpha\nBeta',
    });

    const { container } = renderInfoCard(field);

    const list = container.querySelector('ol');
    expect(list).toBeTruthy();
    expect(list?.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('renders_romanNumeralMarkers_forRomanListType', () => {
    const field = makeInfoCardField({
      infoCardListType: 'numbered-roman',
      infoCardBody: 'One\nTwo\nThree',
    });

    renderInfoCard(field);

    expect(screen.getByText('I')).toBeTruthy();
    expect(screen.getByText('II')).toBeTruthy();
    expect(screen.getByText('III')).toBeTruthy();
  });

  it('renders_noMarkers_whenListMarkerIsNone', () => {
    const field = makeInfoCardField({
      infoCardListType: 'numbered-arabic',
      infoCardListMarker: 'none',
      infoCardBody: 'Alpha\nBeta',
    });

    renderInfoCard(field);

    // Item text present, but no marker glyphs rendered.
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('renders_ignoresBlankLines_betweenItems', () => {
    const field = makeInfoCardField({
      infoCardListType: 'bullet',
      infoCardBody: 'First\n\n   \nSecond',
    });

    const { container } = renderInfoCard(field);

    // Blank / whitespace-only lines are dropped — only two real items.
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});
