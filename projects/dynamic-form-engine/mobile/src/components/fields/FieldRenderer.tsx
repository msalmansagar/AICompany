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
import { FormLookupField } from './FormLookupField';
import { FormFileField } from './FormFileField';
import { FormRepeatingGridField } from './FormRepeatingGridField';
import { FormBooleanField } from './FormBooleanField';
import { FormInteractiveGridField } from './FormInteractiveGridField';
import { FormInfoCardField } from './FormInfoCardField';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  accessToken?: string;
  isTabActive?: boolean;
}

export function FieldRenderer({ field, control, accessToken = '', isTabActive = false }: Props) {
  switch (field.fieldType) {
    case 'text':
      return <FormTextField field={field} control={control} />;
    case 'email':
      return <FormTextField field={field} control={control} keyboardType="email-address" />;
    case 'phone':
      return <FormTextField field={field} control={control} keyboardType="phone-pad" />;
    case 'number':
      return <FormNumericField field={field} control={control} />;
    case 'currency':
    case 'decimal':
      return <FormNumericField field={field} control={control} />;
    case 'textarea':
      return <FormTextAreaField field={field} control={control} />;
    case 'richtext':
      return <FormRichTextField field={field} control={control} />;
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
    case 'grid':
      return <FormRepeatingGridField field={field} control={control} />;
    case 'boolean':
      return <FormBooleanField field={field} control={control} />;
    case 'interactive-grid':
      return (
        <FormInteractiveGridField
          field={field}
          control={control}
          accessToken={accessToken}
          isTabActive={isTabActive}
        />
      );
    case 'info-card':
      return <FormInfoCardField field={field} />;
    default: {
      const exhaustive: never = field.fieldType;
      return (
        <Text style={{ color: '#999', fontSize: 13 }}>
          Unsupported field type: {String(exhaustive)}
        </Text>
      );
    }
  }
}
