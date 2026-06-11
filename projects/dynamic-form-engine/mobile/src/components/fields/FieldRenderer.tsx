import React from 'react';
import { Text } from 'react-native';
import type { Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { FormTextField } from './FormTextField';
import { FormTextAreaField } from './FormTextAreaField';
import { FormRichTextField } from './FormRichTextField';
import { FormNumericField } from './FormNumericField';
import { FormDateField } from './FormDateField';
import { FormDropdownField } from './FormDropdownField';
import { FormCheckboxField } from './FormCheckboxField';
import { FormRadioField } from './FormRadioField';
import { FormRadioCardField } from './FormRadioCardField';
import { FormCheckboxGroupField } from './FormCheckboxGroupField';
import { FormLookupField } from './FormLookupField';
import { FormFileField } from './FormFileField';
import { FormRepeatingGridField } from './FormRepeatingGridField';
import { FormSelectionGridField } from './FormSelectionGridField';
import { FormBooleanField } from './FormBooleanField';
import { FormInteractiveGridField } from './FormInteractiveGridField';
import { FormInfoCardField } from './FormInfoCardField';
import { useMobileFormContext } from '../../context/MobileFormContext';
import { ComponentRegistry } from '../../registry/ComponentRegistry';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  accessToken?: string;
  isTabActive?: boolean;
}

export function FieldRenderer({ field, control, accessToken = '', isTabActive = false }: Props) {
  const { ruleState } = useMobileFormContext();

  // Rule-based visibility — fall back to the static default.
  const isVisible = ruleState.visibilityMap.has(field.fieldKey)
    ? ruleState.visibilityMap.get(field.fieldKey) === true
    : field.isVisibleDefault;

  if (!isVisible) return null;

  // Overlay required / readonly from rule state onto a shallow field copy.
  const effectiveField: FieldDefinition = {
    ...field,
    isRequiredDefault: ruleState.requiredMap.get(field.fieldKey) ?? field.isRequiredDefault,
    isReadonlyDefault: ruleState.readonlyMap.get(field.fieldKey) ?? field.isReadonlyDefault,
  };

  switch (effectiveField.fieldType) {
    case 'text':
      return <FormTextField field={effectiveField} control={control} />;
    case 'email':
      return <FormTextField field={effectiveField} control={control} keyboardType="email-address" />;
    case 'phone':
      return <FormTextField field={effectiveField} control={control} keyboardType="phone-pad" />;
    case 'number':
      return <FormNumericField field={effectiveField} control={control} />;
    case 'currency':
    case 'decimal':
      return <FormNumericField field={effectiveField} control={control} />;
    case 'textarea':
      return <FormTextAreaField field={effectiveField} control={control} />;
    case 'richtext':
      return <FormRichTextField field={effectiveField} control={control} />;
    case 'date':
    case 'datetime':
      return <FormDateField field={effectiveField} control={control} />;
    case 'dropdown':
      return <FormDropdownField field={effectiveField} control={control} />;
    case 'multiselect':
      return effectiveField.multiselectRenderStyle === 'checkboxes'
        ? <FormCheckboxGroupField field={effectiveField} control={control} />
        : <FormDropdownField field={effectiveField} control={control} />;
    case 'checkbox':
      return <FormCheckboxField field={effectiveField} control={control} />;
    case 'radio':
      return effectiveField.radioRenderStyle === 'cards'
        ? <FormRadioCardField field={effectiveField} control={control} />
        : <FormRadioField field={effectiveField} control={control} />;
    case 'lookup':
      return <FormLookupField field={effectiveField} control={control} />;
    case 'file':
      return <FormFileField field={effectiveField} control={control} />;
    case 'grid':
      return effectiveField.gridConfig?.mode === 'selection'
        ? (
          <FormSelectionGridField
            field={effectiveField}
            control={control}
            accessToken={accessToken}
            isTabActive={isTabActive}
          />
        )
        : <FormRepeatingGridField field={effectiveField} control={control} />;
    case 'boolean':
      return <FormBooleanField field={effectiveField} control={control} />;
    case 'interactive-grid':
      return (
        <FormInteractiveGridField
          field={effectiveField}
          control={control}
          accessToken={accessToken}
          isTabActive={isTabActive}
        />
      );
    case 'info-card':
      return <FormInfoCardField field={effectiveField} />;
    default: {
      // Try custom registry before failing.
      const componentKey = (effectiveField as FieldDefinition & { componentKey?: string }).componentKey ?? '';
      const Custom = ComponentRegistry.resolve(componentKey);
      if (Custom) return <Custom field={effectiveField} control={control} />;
      const exhaustive: never = effectiveField.fieldType;
      return (
        <Text style={{ color: '#999', fontSize: 13 }}>
          Unsupported field type: {String(exhaustive)}
        </Text>
      );
    }
  }
}
