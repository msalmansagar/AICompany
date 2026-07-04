import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { FormMultiLookupField } from './FormMultiLookupField';
import { FormFileField } from './FormFileField';
import { FormRepeatingGridField } from './FormRepeatingGridField';
import { FormSelectionGridField } from './FormSelectionGridField';
import { FormBooleanField } from './FormBooleanField';
import { FormInteractiveGridField } from './FormInteractiveGridField';
import { FormInfoCardField } from './FormInfoCardField';
import { FormLabelField } from './FormLabelField';
import { useMobileFormContext } from '../../context/MobileFormContext';
import { ComponentRegistry } from '../../registry/ComponentRegistry';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  accessToken?: string;
  isTabActive?: boolean;
}

function TooltipIcon({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={tooltipStyles.icon}
        accessibilityRole="button"
        accessibilityLabel={`Info: ${text}`}
      >
        <Text style={tooltipStyles.iconText}>ℹ</Text>
      </Pressable>
      <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={tooltipStyles.backdrop} onPress={() => setVisible(false)}>
          <View style={tooltipStyles.bubble}>
            <Text style={tooltipStyles.bubbleText}>{text}</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const tooltipStyles = StyleSheet.create({
  icon: { paddingHorizontal: 4, paddingVertical: 2 },
  iconText: { fontSize: 14, color: '#0078d4' },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  bubble: { backgroundColor: '#fff', borderRadius: 8, padding: 16, maxWidth: '80%', elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
  bubbleText: { fontSize: 14, color: '#1a1a2e', lineHeight: 20 },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: -6, marginBottom: 2, paddingHorizontal: 2 },
  hintText: { fontSize: 12, color: '#555', flex: 1, lineHeight: 16 },
});

function resolveFieldComponent(
  field: FieldDefinition,
  control: Control<Record<string, unknown>>,
  accessToken: string,
  isTabActive: boolean,
): React.ReactElement | null {
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
      return <FormDropdownField field={field} control={control} />;
    case 'multiselect':
      return field.multiselectRenderStyle === 'checkboxes'
        ? <FormCheckboxGroupField field={field} control={control} />
        : <FormDropdownField field={field} control={control} />;
    case 'checkbox':
      return <FormCheckboxField field={field} control={control} />;
    case 'radio':
      return field.radioRenderStyle === 'cards'
        ? <FormRadioCardField field={field} control={control} />
        : <FormRadioField field={field} control={control} />;
    case 'lookup':
      return <FormLookupField field={field} control={control} />;
    case 'multiLookup':
      return <FormMultiLookupField field={field} control={control} />;
    case 'file':
      return <FormFileField field={field} control={control} accessToken={accessToken} />;
    case 'grid':
      return field.gridConfig?.mode === 'selection'
        ? (
          <FormSelectionGridField
            field={field}
            control={control}
            accessToken={accessToken}
            isTabActive={isTabActive}
          />
        )
        : <FormRepeatingGridField field={field} control={control} />;
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
    case 'label':
      return <FormLabelField field={field} control={control} />;
    case 'custom': {
      const customKey = (field as FieldDefinition & { componentKey?: string }).componentKey ?? '';
      const CustomField = ComponentRegistry.resolve(customKey);
      if (CustomField) return <CustomField field={field} control={control} />;
      return null;
    }
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

  const component = resolveFieldComponent(effectiveField, control, accessToken, isTabActive);

  if (!effectiveField.tooltip) {
    return component;
  }

  return (
    <View>
      {component}
      <View style={tooltipStyles.hintRow}>
        <TooltipIcon text={effectiveField.tooltip} />
        <Text style={tooltipStyles.hintText}>{effectiveField.tooltip}</Text>
      </View>
    </View>
  );
}
