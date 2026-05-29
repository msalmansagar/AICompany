import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useMsal } from '@azure/msal-react';
import type {
  FormDefinition,
  FormFieldValues,
  RuleEvaluationResult,
  DraftSubmission,
} from '@dfe/shared';
import { formApi } from '../api/formApi';
import { ruleEngine } from '../engine/RuleEngine';
import { validationEngine } from '../engine/ValidationEngine';

export interface FormContextValue {
  formCode: string;
  formDefinition: FormDefinition | null;
  isLoading: boolean;
  error: string | null;
  fieldValues: FormFieldValues;
  ruleState: RuleEvaluationResult;
  validationErrors: Record<string, string[]>;
  isDirty: boolean;
  isSubmitting: boolean;
  draftId: string | null;
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  submissionReference: string | null;
  isSubmitted: boolean;
  updateFieldValue: (fieldId: string, value: unknown) => void;
  saveDraft: () => Promise<void>;
  submitForm: () => Promise<void>;
  resetForm: () => void;
}

const EMPTY_RULE_STATE: RuleEvaluationResult = {
  fieldVisibility: {},
  sectionVisibility: {},
  tabVisibility: {},
  fieldRequired: {},
  fieldReadonly: {},
  fieldValues: {},
  filteredOptions: {},
};

const FormContext = createContext<FormContextValue | null>(null);

export interface FormProviderProps {
  formCode: string;
  recordId?: string;
  children: React.ReactNode;
}

export function FormProvider({ formCode, recordId, children }: FormProviderProps) {
  const { accounts } = useMsal();
  const currentUser = import.meta.env.VITE_SKIP_AUTH === 'true'
    ? ({ localAccountId: 'dev-user-id', name: 'Dev User', username: 'dev@local.dev' } as unknown as typeof accounts[number])
    : (accounts[0] ?? null);

  const [formDefinition, setFormDefinition] = useState<FormDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<FormFieldValues>({});
  const [ruleState, setRuleState] = useState<RuleEvaluationResult>(EMPTY_RULE_STATE);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [submissionReference, setSubmissionReference] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Debounce timer ref for rule evaluation
  const ruleDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load form metadata and initial data ──────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadForm() {
      setIsLoading(true);
      setError(null);

      try {
        const metaResponse = await formApi.getMetadata(formCode);
        const definition = (metaResponse as unknown as { data: FormDefinition }).data;

        if (cancelled) return;

        setFormDefinition(definition);

        const initialValues = buildInitialValues(definition);

        if (recordId) {
          const dataResponse = await formApi.getData(formCode, recordId);
          const existingData = (dataResponse as unknown as { data: FormFieldValues }).data;

          if (!cancelled) {
            setFieldValues({ ...initialValues, ...existingData });
          }
        } else {
          setFieldValues(initialValues);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load form',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadForm();

    return () => {
      cancelled = true;
    };
  }, [formCode, recordId]);

  // ── Debounced rule evaluation ─────────────────────────────────
  useEffect(() => {
    if (!formDefinition) return;

    if (ruleDebounceTimer.current) {
      clearTimeout(ruleDebounceTimer.current);
    }

    ruleDebounceTimer.current = setTimeout(() => {
      const allRules = collectAllRules(formDefinition);

      void ruleEngine.evaluate(allRules, fieldValues).then((result) => {
        setRuleState(result);

        // Apply setValue/clearValue/calculateValue from rules
        const ruleSetValues = result.fieldValues;
        const hasSetValues = Object.keys(ruleSetValues).length > 0;

        if (hasSetValues) {
          setFieldValues((prev) => {
            const updated = { ...prev };
            let changed = false;

            for (const [key, val] of Object.entries(ruleSetValues)) {
              if (updated[key] !== val) {
                updated[key] = val;
                changed = true;
              }
            }

            return changed ? updated : prev;
          });
        }
      });
    }, 150);

    return () => {
      if (ruleDebounceTimer.current) {
        clearTimeout(ruleDebounceTimer.current);
      }
    };
  }, [fieldValues, formDefinition]);

  // ── Field value update ────────────────────────────────────────
  const updateFieldValue = useCallback((fieldId: string, value: unknown) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    setIsDirty(true);

    // Clear validation error for this field when user edits it
    setValidationErrors((prev) => {
      if (!prev[fieldId]) return prev;

      const updated = { ...prev };
      delete updated[fieldId];
      return updated;
    });
  }, []);

  // ── Save draft ────────────────────────────────────────────────
  const saveDraft = useCallback(async () => {
    if (!formDefinition || !currentUser) return;

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + formDefinition.draftExpiryDays);

    const draft: DraftSubmission = {
      id: draftId ?? undefined,
      formDefinitionId: formDefinition.id,
      formCode: formDefinition.formCode,
      userId: currentUser.localAccountId,
      userDisplayName: currentUser.name ?? currentUser.username,
      formData: fieldValues,
      currentTabIndex: activeTabIndex,
      savedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const response = await formApi.saveDraft(formCode, draft);
    const savedDraft = (response as unknown as { data: DraftSubmission }).data;

    if (savedDraft.id) {
      setDraftId(savedDraft.id);
    }

    setIsDirty(false);
  }, [formDefinition, currentUser, draftId, fieldValues, activeTabIndex, formCode]);

  // ── Reset form ────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    if (!formDefinition) return;
    setFieldValues(buildInitialValues(formDefinition));
    setValidationErrors({});
    setIsDirty(false);
    setActiveTabIndex(0);
  }, [formDefinition]);

  // ── Submit form ───────────────────────────────────────────────
  const submitForm = useCallback(async () => {
    if (!formDefinition) return;

    // Compute visible fields before validation
    const visibleFieldIds = computeVisibleFieldIds(formDefinition, ruleState);

    const errors = validationEngine.validateForm(
      formDefinition,
      fieldValues,
      visibleFieldIds,
    );

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      // Strip hidden field values before submitting
      const submitValues = stripHiddenFieldValues(fieldValues, visibleFieldIds, formDefinition);

      const response = await formApi.submit(formCode, submitValues);
      const result = (response as unknown as { data: { referenceNumber: string } }).data;

      setSubmissionReference(result.referenceNumber ?? null);
      setIsSubmitted(true);
      setIsDirty(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [formDefinition, ruleState, fieldValues, formCode]);

  const contextValue: FormContextValue = {
    formCode,
    formDefinition,
    isLoading,
    error,
    fieldValues,
    ruleState,
    validationErrors,
    isDirty,
    isSubmitting,
    draftId,
    activeTabIndex,
    setActiveTabIndex,
    submissionReference,
    isSubmitted,
    updateFieldValue,
    saveDraft,
    submitForm,
    resetForm,
  };

  return (
    <FormContext.Provider value={contextValue}>
      {children}
    </FormContext.Provider>
  );
}

export function useFormContext(): FormContextValue {
  const context = useContext(FormContext);

  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }

  return context;
}

// ── Helpers ───────────────────────────────────────────────────

function buildInitialValues(formDefinition: FormDefinition): FormFieldValues {
  const values: FormFieldValues = {};

  for (const tab of formDefinition.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        values[field.schemaName] = field.defaultValue ?? null;
      }
    }
  }

  return values;
}

function collectAllRules(formDefinition: FormDefinition) {
  return formDefinition.tabs.flatMap((tab) =>
    tab.sections.flatMap((section) =>
      section.fields.flatMap((field) => field.businessRules),
    ),
  );
}

function computeVisibleFieldIds(
  formDefinition: FormDefinition,
  ruleState: RuleEvaluationResult,
): Set<string> {
  const visible = new Set<string>();

  for (const tab of formDefinition.tabs) {
    const tabVisible = ruleState.tabVisibility[tab.id] ?? tab.isVisible;
    if (!tabVisible) continue;

    for (const section of tab.sections) {
      const sectionVisible = ruleState.sectionVisibility[section.id] ?? section.isVisible;
      if (!sectionVisible) continue;

      for (const field of section.fields) {
        const fieldVisible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
        if (fieldVisible && !field.isHidden) {
          visible.add(field.id);
        }
      }
    }
  }

  return visible;
}

function stripHiddenFieldValues(
  fieldValues: FormFieldValues,
  visibleFieldIds: Set<string>,
  formDefinition: FormDefinition,
): FormFieldValues {
  const schemaNameToId: Record<string, string> = {};

  for (const tab of formDefinition.tabs) {
    for (const section of tab.sections) {
      for (const field of section.fields) {
        schemaNameToId[field.schemaName] = field.id;
      }
    }
  }

  const stripped: FormFieldValues = {};

  for (const [schemaName, value] of Object.entries(fieldValues)) {
    const fieldId = schemaNameToId[schemaName];

    if (!fieldId || visibleFieldIds.has(fieldId)) {
      stripped[schemaName] = value;
    }
  }

  return stripped;
}
