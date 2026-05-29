import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm, type FieldErrors } from 'react-hook-form';
import type { FormButton, FormDefinition, FieldDefinition, SectionDefinition, TabDefinition } from '@qdb/form-engine-shared';
import { FieldRenderer } from './fields/FieldRenderer';

interface Props {
  form: FormDefinition;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  onSaveDraft?: (values: Record<string, unknown>, tabIndex: number) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

function buildDefaultValues(form: FormDefinition): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const tab of form.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        defaults[field.fieldKey] = fieldTypeDefault(field);
      }
    }
  }
  return defaults;
}

function fieldTypeDefault(field: FieldDefinition): unknown {
  switch (field.fieldType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'textarea':
    case 'richtext':
      return '';
    case 'checkbox':
      return false;
    default:
      return null;
  }
}

const DEFAULT_BUTTON: FormButton = {
  buttonId: '__submit__',
  label: 'Submit',
  action: 'submit',
  displayOrder: 0,
  isVisible: true,
  isPrimary: true,
  confirmationRequired: false,
};

export function FormRenderer({ form, onSubmit, onSaveDraft, onCancel, isSubmitting = false }: Props) {
  const tabs = [...form.tabs].sort((a, b) => a.displayOrder - b.displayOrder);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const fieldKeyToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tab of form.tabs) {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          map[field.fieldKey] = field.displayLabel;
        }
      }
    }
    return map;
  }, [form]);

  const defaultValues = useMemo(() => buildDefaultValues(form), [form]);

  const { control, handleSubmit, getValues, reset } = useForm<Record<string, unknown>>({
    mode: 'onBlur',
    defaultValues,
  });

  const activeTab = tabs[activeTabIndex];

  function handleFormSubmit(values: Record<string, unknown>): void {
    void onSubmit(values);
  }

  function handleInvalidSubmit(errors: FieldErrors<Record<string, unknown>>): void {
    const failedLabels = Object.keys(errors)
      .map((key) => fieldKeyToLabel[key] ?? key)
      .slice(0, 5);
    const detail = failedLabels.length > 0
      ? `\n\n${failedLabels.map((l) => `• ${l}`).join('\n')}`
      : '';
    Alert.alert('Validation Error', `Please fill in all required fields before submitting.${detail}`);
  }

  function handleReset(): void {
    reset();
  }

  const visibleButtons = (form.buttons ?? [])
    .filter((b) => b.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const buttons = visibleButtons.length > 0 ? visibleButtons : [DEFAULT_BUTTON];

  return (
    <View style={styles.container}>
      {tabs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
          {tabs.map((tab, index) => (
            <Pressable
              key={tab.tabId}
              style={[styles.tab, activeTabIndex === index && styles.tabActive]}
              onPress={() => setActiveTabIndex(index)}
            >
              <Text style={[styles.tabText, activeTabIndex === index && styles.tabTextActive]}>
                {tab.displayLabel}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {activeTab && <TabContent tab={activeTab} control={control} />}

        <View style={styles.actions}>
          {buttons.map((button) => (
            <FormButtonItem
              key={button.buttonId}
              button={button}
              isSubmitting={isSubmitting}
              onSubmit={() => void handleSubmit(handleFormSubmit, handleInvalidSubmit)()}
              onSaveDraft={onSaveDraft ? () => void onSaveDraft(getValues(), activeTabIndex) : undefined}
              onCancel={onCancel}
              onReset={handleReset}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

interface FormButtonItemProps {
  button: FormButton;
  isSubmitting: boolean;
  onSubmit: () => void;
  onSaveDraft?: () => void;
  onCancel?: () => void;
  onReset: () => void;
}

function FormButtonItem({ button, isSubmitting, onSubmit, onSaveDraft, onCancel, onReset }: FormButtonItemProps) {
  function handlePress(): void {
    if (button.confirmationRequired) {
      Alert.alert(
        button.label,
        button.confirmationMessage ?? 'Are you sure? Any unsaved changes will be lost.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => executeAction() },
        ],
      );
    } else {
      executeAction();
    }
  }

  function executeAction(): void {
    if (button.action === 'submit') onSubmit();
    else if (button.action === 'saveDraft') onSaveDraft?.();
    else if (button.action === 'cancel') onCancel?.();
    else if (button.action === 'reset') onReset();
  }

  const isPrimary = button.isPrimary;
  const isDisabled = isSubmitting || (button.action === 'saveDraft' && !onSaveDraft);

  const containerStyle = [
    isPrimary ? styles.primaryButton : styles.secondaryButton,
    isDisabled && styles.buttonDisabled,
    !isPrimary && { flex: undefined as number | undefined },
  ];

  const textStyle = isPrimary ? styles.primaryButtonText : styles.secondaryButtonText;

  return (
    <Pressable style={containerStyle} disabled={isDisabled} onPress={handlePress}>
      <Text style={textStyle}>
        {isSubmitting && button.action === 'submit' ? 'Submitting…' : button.label}
      </Text>
    </Pressable>
  );
}

function TabContent({
  tab,
  control,
}: {
  tab: TabDefinition;
  control: ReturnType<typeof useForm<Record<string, unknown>>>['control'];
}) {
  const sections = [...tab.sections].sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <>
      {sections.map((section) => (
        <SectionContent key={section.sectionId} section={section} control={control} />
      ))}
    </>
  );
}

function SectionContent({
  section,
  control,
}: {
  section: SectionDefinition;
  control: ReturnType<typeof useForm<Record<string, unknown>>>['control'];
}) {
  const fields = [...section.fields]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .filter((f) => f.isVisibleDefault);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{section.displayLabel}</Text>
      {fields.map((field) => (
        <FieldRenderer key={field.fieldId} field={field} control={control} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', flexGrow: 0 },
  tab: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0078d4' },
  tabText: { fontSize: 14, color: '#666', fontWeight: '500' },
  tabTextActive: { color: '#0078d4', fontWeight: '700' },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 40 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  primaryButton: { flex: 1, backgroundColor: '#0078d4', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { borderWidth: 1, borderColor: '#0078d4', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#0078d4', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});
