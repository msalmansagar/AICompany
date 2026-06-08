import React from 'react';
import { Text } from 'react-native';
import type { Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { FormSelectionGridField } from './FormSelectionGridField';
import { FormEntryGridField } from './FormEntryGridField';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  accessToken: string;
  isTabActive: boolean;
}

export function FormInteractiveGridField({ field, control, accessToken, isTabActive }: Props) {
  const mode = field.gridConfig?.mode;

  if (mode === 'selection') {
    return (
      <FormSelectionGridField
        field={field}
        control={control}
        accessToken={accessToken}
        isTabActive={isTabActive}
      />
    );
  }

  if (mode === 'entry') {
    return <FormEntryGridField field={field} control={control} />;
  }

  return (
    <Text style={{ color: '#999', fontSize: 13 }}>
      Interactive grid missing gridConfig.mode configuration.
    </Text>
  );
}
