import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import type { FormDefinition, SectionDefinition, TabDefinition } from '@qdb/form-engine-shared';
import { FieldRenderer } from './fields/FieldRenderer';

interface Props {
  form: FormDefinition;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  onSaveDraft?: (values: Record<string, unknown>, tabIndex: number) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function FormRenderer({ form, onSubmit, onSaveDraft, isSubmitting = false }: Props) {
  const tabs = [...form.tabs].sort((a, b) => a.displayOrder - b.displayOrder);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const { control, handleSubmit, getValues } = useForm<Record<string, unknown>>({ mode: 'onBlur' });

  const activeTab = tabs[activeTabIndex];

  function handleFormSubmit(values: Record<string, unknown>): void {
    void onSubmit(values);
  }

  function handleInvalidSubmit(): void {
    Alert.alert('Validation Error', 'Please fill in all required fields before submitting.');
  }

  function handleNext(): void {
    const nextIndex = activeTabIndex + 1;
    if (onSaveDraft) {
      void onSaveDraft(getValues(), activeTabIndex);
    }
    setActiveTabIndex(nextIndex);
  }

  const isLastTab = activeTabIndex === tabs.length - 1;

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

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {activeTab && <TabContent tab={activeTab} control={control} />}

        <View style={styles.actions}>
          {activeTabIndex > 0 && (
            <Pressable style={styles.backButton} onPress={() => setActiveTabIndex(activeTabIndex - 1)}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}
          {form.allowSaveDraft && onSaveDraft && (
            <Pressable
              style={styles.draftButton}
              onPress={() => void onSaveDraft(getValues(), activeTabIndex)}
            >
              <Text style={styles.draftButtonText}>Save Draft</Text>
            </Pressable>
          )}
          {isLastTab ? (
            <Pressable
              style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
              disabled={isSubmitting}
              onPress={() => void handleSubmit(handleFormSubmit, handleInvalidSubmit)()}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Submitting…' : 'Submit Application'}
              </Text>
            </Pressable>
          ) : (
            <Pressable style={styles.nextButton} onPress={handleNext}>
              <Text style={styles.nextButtonText}>Next</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function TabContent({ tab, control }: { tab: TabDefinition; control: ReturnType<typeof useForm<Record<string, unknown>>>['control'] }) {
  const sections = [...tab.sections].sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <>
      {sections.map((section) => (
        <SectionContent key={section.sectionId} section={section} control={control} />
      ))}
    </>
  );
}

function SectionContent({ section, control }: { section: SectionDefinition; control: ReturnType<typeof useForm<Record<string, unknown>>>['control'] }) {
  const fields = [...section.fields].sort((a, b) => a.displayOrder - b.displayOrder).filter((f) => f.isVisibleDefault);
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
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  backButton: { flex: 1, borderWidth: 1, borderColor: '#0078d4', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  backButtonText: { color: '#0078d4', fontSize: 16, fontWeight: '600' },
  nextButton: { flex: 1, backgroundColor: '#0078d4', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  draftButton: { borderWidth: 1, borderColor: '#0078d4', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  draftButtonText: { color: '#0078d4', fontSize: 15, fontWeight: '600' },
  submitButton: { flex: 1, backgroundColor: '#2e7d32', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
});
