// RED — failing: FormInfoCardField renders display-only info card with style variants
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FormInfoCardField } from '../components/fields/FormInfoCardField';
import type { FieldDefinition } from '@qdb/shared';

function buildField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    fieldId: 'f1',
    fieldKey: 'notice',
    fieldType: 'info-card',
    displayLabel: 'Notice',
    displayOrder: 1,
    isRequiredDefault: false,
    isReadonlyDefault: false,
    isVisibleDefault: true,
    validationRules: [],
    optionValues: [],
    ...overrides,
  };
}

describe('FormInfoCardField', () => {
  it('renders_title_and_body_text', () => {
    const field = buildField({
      infoCardStyle: 'info',
      infoCardTitle: 'Important Notice',
      infoCardBody: 'Please read the terms carefully.',
    });
    render(<FormInfoCardField field={field} />);
    expect(screen.getByText('Important Notice')).toBeTruthy();
    expect(screen.getByText('Please read the terms carefully.')).toBeTruthy();
  });

  it('renders_info_fallback_icon_when_no_icon_name_and_style_is_info', () => {
    const field = buildField({ infoCardStyle: 'info', infoCardTitle: 'Info' });
    render(<FormInfoCardField field={field} />);
    expect(screen.getByText('ℹ')).toBeTruthy();
  });

  it('renders_warning_fallback_icon_when_style_is_warning', () => {
    const field = buildField({ infoCardStyle: 'warning', infoCardTitle: 'Warning' });
    render(<FormInfoCardField field={field} />);
    expect(screen.getByText('⚠')).toBeTruthy();
  });

  it('renders_success_fallback_icon_when_style_is_success', () => {
    const field = buildField({ infoCardStyle: 'success', infoCardTitle: 'Done' });
    render(<FormInfoCardField field={field} />);
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('renders_error_fallback_icon_when_style_is_error', () => {
    const field = buildField({ infoCardStyle: 'error', infoCardTitle: 'Error' });
    render(<FormInfoCardField field={field} />);
    expect(screen.getByText('✗')).toBeTruthy();
  });

  it('has_accessibilityRole_note_on_container', () => {
    const field = buildField({ infoCardStyle: 'info', infoCardTitle: 'Notice' });
    const { UNSAFE_getByProps } = render(<FormInfoCardField field={field} />);
    expect(UNSAFE_getByProps({ accessibilityRole: 'note' })).toBeTruthy();
  });

  it('renders_without_body_when_infoCardBody_is_omitted', () => {
    const field = buildField({ infoCardStyle: 'info', infoCardTitle: 'Title only' });
    render(<FormInfoCardField field={field} />);
    expect(screen.getByText('Title only')).toBeTruthy();
  });

  it('uses_InfoCardIcon_when_infoCardIcon_is_set', () => {
    const field = buildField({
      infoCardStyle: 'warning',
      infoCardTitle: 'Alert',
      infoCardIcon: 'WarningRegular',
    });
    // Should NOT render the text fallback ⚠ when a named icon is provided
    render(<FormInfoCardField field={field} />);
    expect(screen.queryByText('⚠')).toBeNull();
  });

  it('defaults_to_info_style_when_infoCardStyle_is_omitted', () => {
    const field = buildField({ infoCardTitle: 'Default style' });
    render(<FormInfoCardField field={field} />);
    // No crash — renders with info defaults
    expect(screen.getByText('Default style')).toBeTruthy();
  });
});
