import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, type FieldErrors } from 'react-hook-form';
import type { FormButton, FormDefinition, FieldDefinition, SectionDefinition, TabDefinition } from '@qdb/shared';
import { FieldRenderer } from './fields/FieldRenderer';
import { InfoCardFlow } from './info-card/InfoCardFlow';
import { FormSummaryScreen } from './FormSummaryScreen';
import { MobileFormProvider, useMobileFormContext } from '../context/MobileFormContext';

type Phase = 'info-cards' | 'form' | 'summary';

interface Props {
  form: FormDefinition;
  accessToken: string;
  draftId?: string;
  /** Pre-populate field values, e.g. when resuming a saved draft. */
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  onSaveDraft?: (values: Record<string, unknown>, tabIndex: number, meta: DraftMeta) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

interface DraftMeta {
  infoCardViewed: boolean;
  gridSchemaHash: Record<string, never>;
}

function buildDefaultValues(
  form: FormDefinition,
  initialValues?: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const tab of form.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        defaults[field.fieldKey] = fieldTypeDefault(field);
      }
    }
  }
  return initialValues ? { ...defaults, ...initialValues } : defaults;
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

export function FormRenderer({
  form,
  accessToken,
  draftId,
  initialValues,
  onSubmit,
  onSaveDraft,
  onCancel,
  isSubmitting = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const tabs = useMemo(
    () => [...form.tabs].sort((a, b) => a.displayOrder - b.displayOrder),
    [form.tabs],
  );

  const [phase, setPhase] = useState<Phase>('form');
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [infoCardViewed, setInfoCardViewed] = useState(false);

  const finalTabDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finalTabId, setFinalTabId] = useState<string | undefined>(undefined);

  // Phase transition: show info-cards if present and not resuming a draft.
  useEffect(() => {
    const hasInfoCards = (form.infoCards ?? []).length > 0;
    const hasDraftResume = draftId !== undefined && draftId.length > 0;
    if (hasInfoCards && !hasDraftResume) {
      setPhase('info-cards');
    }
  }, [form.infoCards, draftId]);

  // Debounced final-tab computation (300 ms).
  useEffect(() => {
    if (finalTabDebounceRef.current !== null) {
      clearTimeout(finalTabDebounceRef.current);
    }
    finalTabDebounceRef.current = setTimeout(() => {
      const visibleTabs = tabs.filter((t) => t.sections.length > 0 || tabs.length === 1);
      const last = visibleTabs.reduce<TabDefinition | undefined>(
        (best, t) => (best === undefined || t.displayOrder > best.displayOrder ? t : best),
        undefined,
      );
      setFinalTabId(last?.tabId);
    }, 300);

    return () => {
      if (finalTabDebounceRef.current !== null) clearTimeout(finalTabDebounceRef.current);
    };
  }, [tabs]);

  const fieldKeyToLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tab of tabs) {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          map[field.fieldKey] = field.displayLabel;
        }
      }
    }
    return map;
  }, [tabs]);

  const fieldKeyToTabIndex = useMemo(() => {
    const map: Record<string, number> = {};
    tabs.forEach((tab, index) => {
      for (const section of tab.sections) {
        for (const field of section.fields) {
          map[field.fieldKey] = index;
        }
      }
    });
    return map;
  }, [tabs]);

  const defaultValues = useMemo(() => buildDefaultValues(form, initialValues), [form, initialValues]);

  const { control, handleSubmit, getValues, reset, setValue } = useForm<Record<string, unknown>>({
    mode: 'onBlur',
    defaultValues,
  });

  const activeTab = tabs[activeTabIndex];
  const activeTabId = activeTab?.tabId;
  const isOnFinalTab = finalTabId !== undefined && activeTabId === finalTabId;

  function handleFormSubmit(values: Record<string, unknown>): void {
    void onSubmit(values);
  }

  function handleInvalidSubmit(errors: FieldErrors<Record<string, unknown>>): void {
    const errorKeys = Object.keys(errors);

    const firstErrorTabIndex = errorKeys
      .map((key) => fieldKeyToTabIndex[key] ?? activeTabIndex)
      .sort((a, b) => a - b)[0] ?? activeTabIndex;

    if (firstErrorTabIndex !== activeTabIndex) {
      setActiveTabIndex(firstErrorTabIndex);
    }

    const failedLabels = errorKeys
      .map((key) => fieldKeyToLabel[key] ?? key)
      .slice(0, 5);
    const detail = failedLabels.length > 0
      ? `\n\n${failedLabels.map((l) => `• ${l}`).join('\n')}`
      : '';
    Alert.alert(
      'Validation Error',
      `Please fill in all required fields before submitting.${detail}`,
    );
  }

  function handleReset(): void {
    reset();
  }

  function handleInfoCardComplete(): void {
    setInfoCardViewed(true);
    setPhase('form');
  }

  if (phase === 'info-cards') {
    return (
      <InfoCardFlow
        formDefinition={form}
        accessToken={accessToken}
        onComplete={handleInfoCardComplete}
      />
    );
  }

  const showSummaryStep = form.showSummaryStep ?? false;
  const draftMeta: DraftMeta = { infoCardViewed, gridSchemaHash: {} };

  if (phase === 'summary') {
    return (
      <FormSummaryScreen
        form={form}
        values={getValues()}
        isSubmitting={isSubmitting}
        onBack={() => setPhase('form')}
        onEditTab={(tabIndex) => {
          setPhase('form');
          setActiveTabIndex(tabIndex);
        }}
        onSubmit={() => void handleSubmit(handleFormSubmit, handleInvalidSubmit)()}
      />
    );
  }

  const visibleButtons = (form.buttons ?? [])
    .filter((b) => b.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const buttons = visibleButtons.length > 0 ? visibleButtons : [DEFAULT_BUTTON];

  return (
    <MobileFormProvider form={form} control={control} setValue={setValue}>
      <View style={styles.container}>
        {tabs.length > 1 && activeTab?.hideTabBar !== true && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
            {tabs.map((tab, index) => (
              <Pressable
                key={tab.tabId}
                style={[styles.tab, activeTabIndex === index && styles.tabActive]}
                onPress={() => setActiveTabIndex(index)}
                accessibilityRole="tab"
                accessibilityLabel={tab.displayLabel}
                accessibilityState={{ selected: activeTabIndex === index }}
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
          contentContainerStyle={[styles.contentInner, { paddingBottom: Math.max(insets.bottom + 16, 40) }]}
          showsVerticalScrollIndicator={false}
        >
          {activeTab && (
            <TabContent
              tab={activeTab}
              control={control}
              accessToken={accessToken}
              activeTabId={activeTabId ?? ''}
            />
          )}

          <View style={styles.actions}>
            {buttons.map((button) => (
              <TabAwareFormButton
                key={button.buttonId}
                button={button}
                isSubmitting={isSubmitting}
                isOnFinalTab={isOnFinalTab}
                showSummaryStep={showSummaryStep}
                onSubmit={() => void handleSubmit(handleFormSubmit, handleInvalidSubmit)()}
                onEnterSummary={() => setPhase('summary')}
                onSaveDraft={
                  onSaveDraft
                    ? () => void onSaveDraft(getValues(), activeTabIndex, draftMeta)
                    : undefined
                }
                onCancel={onCancel}
                onReset={handleReset}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </MobileFormProvider>
  );
}

interface TabAwareFormButtonProps {
  button: FormButton;
  isSubmitting: boolean;
  isOnFinalTab: boolean;
  showSummaryStep: boolean;
  onSubmit: () => void;
  onEnterSummary: () => void;
  onSaveDraft?: () => void;
  onCancel?: () => void;
  onReset: () => void;
}

function TabAwareFormButton({
  button,
  isSubmitting,
  isOnFinalTab,
  showSummaryStep,
  onSubmit,
  onEnterSummary,
  onSaveDraft,
  onCancel,
  onReset,
}: TabAwareFormButtonProps) {
  if (button.action === 'submit' && !isOnFinalTab) return null;

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
    if (button.action === 'submit') {
      if (showSummaryStep && isOnFinalTab) onEnterSummary();
      else onSubmit();
    } else if (button.action === 'saveDraft') {
      onSaveDraft?.();
    } else if (button.action === 'cancel') {
      onCancel?.();
    } else if (button.action === 'reset') {
      onReset();
    }
  }

  const isPrimary = button.isPrimary;
  const isDisabled = isSubmitting || (button.action === 'saveDraft' && onSaveDraft === undefined);

  const containerStyle = [
    isPrimary ? styles.primaryButton : styles.secondaryButton,
    isDisabled && styles.buttonDisabled,
  ];
  const textStyle = isPrimary ? styles.primaryButtonText : styles.secondaryButtonText;

  return (
    <Pressable
      style={containerStyle}
      disabled={isDisabled}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={button.label}
      accessibilityState={{ disabled: isDisabled }}
    >
      <Text style={textStyle}>
        {isSubmitting && button.action === 'submit'
          ? 'Submitting…'
          : button.action === 'submit' && showSummaryStep && isOnFinalTab
          ? 'Review & Submit'
          : button.label}
      </Text>
    </Pressable>
  );
}

interface TabContentProps {
  tab: TabDefinition;
  control: ReturnType<typeof useForm<Record<string, unknown>>>['control'];
  accessToken: string;
  activeTabId: string;
}

function TabContent({ tab, control, accessToken, activeTabId }: TabContentProps) {
  const sections = [...tab.sections].sort((a, b) => a.displayOrder - b.displayOrder);
  const isActive = tab.tabId === activeTabId;
  return (
    <>
      {sections.map((section) => (
        <SectionContent
          key={section.sectionId}
          section={section}
          control={control}
          accessToken={accessToken}
          isTabActive={isActive}
        />
      ))}
    </>
  );
}

interface SectionContentProps {
  section: SectionDefinition;
  control: ReturnType<typeof useForm<Record<string, unknown>>>['control'];
  accessToken: string;
  isTabActive: boolean;
}

function SectionContent({ section, control, accessToken, isTabActive }: SectionContentProps) {
  const { ruleState } = useMobileFormContext();
  const [isCollapsed, setIsCollapsed] = useState(section.isCollapsedByDefault ?? false);

  const fields = [...section.fields].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={section.isCollapsible ? () => setIsCollapsed((c) => !c) : undefined}
        accessibilityRole={section.isCollapsible ? 'button' : 'none'}
        accessibilityLabel={section.isCollapsible ? `${isCollapsed ? 'Expand' : 'Collapse'} ${section.displayLabel}` : undefined}
      >
        <Text style={styles.sectionTitle}>{section.displayLabel}</Text>
        {section.isCollapsible && (
          <Text style={styles.chevron}>{isCollapsed ? '▶' : '▼'}</Text>
        )}
      </Pressable>

      {!isCollapsed && fields.map((field) => {
        // Rule-state visibility is also enforced inside FieldRenderer; this pre-filters
        // fields that are statically invisible to avoid unnecessary renders.
        const isVisible = ruleState.visibilityMap.has(field.fieldKey)
          ? ruleState.visibilityMap.get(field.fieldKey) === true
          : field.isVisibleDefault;
        if (!isVisible) return null;
        return (
          <FieldRenderer
            key={field.fieldId}
            field={field}
            control={control}
            accessToken={accessToken}
            isTabActive={isTabActive}
          />
        );
      })}
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
  contentInner: { padding: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', flex: 1 },
  chevron: { fontSize: 12, color: '#888', marginLeft: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  primaryButton: { flex: 1, backgroundColor: '#0078d4', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { borderWidth: 1, borderColor: '#0078d4', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#0078d4', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});
