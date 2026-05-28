import React from 'react';
import { Text } from 'react-native';
import type { Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/form-engine-shared';
import { FormTextField } from './FormTextField';
import { FormTextAreaField } from './FormTextAreaField';
import { FormDateField } from './FormDateField';
import { FormDropdownField } from './FormDropdownField';
import { FormCheckboxField } from './FormCheckboxField';
import { FormRadioField } from './FormRadioField';
import { FormLookupField } from './FormLookupField';
import { FormFileField } from './FormFileField';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FieldRenderer({ field, control }: Props) {
  switch (field.fieldType) {
    case 'text':
      return <FormTextField field={field} control={control} />;
    case 'email':
      return <FormTextField field={field} control={control} keyboardType="email-address" />;
    case 'phone':
      return <FormTextField field={field} control={control} keyboardType="phone-pad" />;
    case 'number':
      return <FormTextField field={field} control={control} keyboardType="numeric" />;
    case 'currency':
    case 'decimal':
      return <FormTextField field={field} control={control} keyboardType="decimal-pad" />;
    case 'textarea':
    case 'richtext':
      return <FormTextAreaField field={field} control={control} />;
    case 'date':
    case 'datetime':
      return <FormDateField field={field} control={control} />;
    case 'dropdown':
    case 'multiselect':
      return <FormDropdownField field={field} control={control} />;
    case 'checkbox':
      return <FormCheckboxField field={field} control={control} />;
    case 'radio':
      return <FormRadioField field={field} control={control} />;
    case 'lookup':
      return <FormLookupField field={field} control={control} />;
    case 'file':
      return <FormFileField field={field} control={control} />;
    default:
      return <Text style={{ color: '#999', fontSize: 13 }}>Unsupported field type: {field.fieldType}</Text>;
  }
}
