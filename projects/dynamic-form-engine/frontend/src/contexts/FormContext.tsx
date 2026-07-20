import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMsal } from '@azure/msal-react';
import type {
  FormDefinition,
  FormFieldValues,
  RuleEvaluationResult,
  DraftSubmission,
  ScopedButton,
} from '@qdb/shared';
import { formApi } from '../api/formApi';
import { ruleEngine } from '../engine/RuleEngine';
import { validationEngine } from '../engine/ValidationEngine';
import { getAllFormFields, getAllTabFields, getTabZoneFields } from '../components/forms/tabFields';

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
  // DFE-SUBMITCONFIRM-001: user has acknowledged the submit-confirmation gate.
  submitAcknowledged: boolean;
  setSubmitAcknowledged: (acknowledged: boolean) => void;
  updateFieldValue: (fieldId: string, value: unknown) => void;
  saveDraft: () => Promise<void>;
  submitForm: (submitButtonId?: string) => Promise<void>;
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
  buttonVisibility: {},
  buttonEnabledState: {},
};

const FormContext = createContext<FormContextValue | null>(null);

export interface FormProviderProps {
  formCode: string;
  recordId?: string;
  /** BCP-47 language code passed as ?lang= to the metadata API (FR-023). */
  lang?: string;
  children: React.ReactNode;
}

export function FormProvider({ formCode, recordId, lang, children }: FormProviderProps) {
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
  // DFE-SUBMITCONFIRM-001: acknowledgement gate state (only meaningful when the form
  // has submitConfirmation configured).
  const [submitAcknowledged, setSubmitAcknowledged] = useState(false);

  // Debounce timer ref for rule evaluation
  const ruleDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether this is the first load for the current formCode so we apply
  // initial field values on first fetch but preserve them on language switches.
  const isFirstLoadRef = useRef(true);
  const prevFormCodeRef = useRef(formCode);

  // Reset first-load sentinel when the form itself changes (not just lang).
  if (prevFormCodeRef.current !== formCode) {
    prevFormCodeRef.current = formCode;
    isFirstLoadRef.current = true;
  }

  // â”€â”€ Load form metadata and initial data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    let cancelled = false;

    async function loadForm() {
      setIsLoading(true);
      setError(null);

      try {
        const metaResponse = await formApi.getMetadata(formCode, lang);
        const definition = (metaResponse as unknown as { data: FormDefinition }).data;

        if (cancelled) return;

        setFormDefinition(definition);

        // Only re-initialise field values on first load or when formCode changes.
        // Language switches must NOT reset entered values (AC-007 / FR-015).
        if (isFirstLoadRef.current) {
          isFirstLoadRef.current = false;

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
    // lang is intentionally included so metadata re-fetches on language switch.
    // recordId is excluded from the dependency array after first load to avoid
    // double-fetching; the isFirstLoadRef guards the data fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formCode, lang]);

  // â”€â”€ Debounced rule evaluation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!formDefinition) return;

    if (ruleDebounceTimer.current) {
      clearTimeout(ruleDebounceTimer.current);
    }

    ruleDebounceTimer.current = setTimeout(() => {
      const allRules = collectAllRules(formDefinition);
      const allButtons = collectAllButtons(formDefinition);

      void Promise.all([
        ruleEngine.evaluate(allRules, fieldValues),
        ruleEngine.evaluateButtons(allButtons, fieldValues),
      ]).then(([fieldResult, buttonResult]) => {
        // DFE-CBTN-001: fold per-button conditional state into the rule state so
        // ScopedButtonBar reads visibility/enablement from a single source.
        const result: RuleEvaluationResult = {
          ...fieldResult,
          buttonVisibility: buttonResult.buttonVisibility,
          buttonEnabledState: buttonResult.buttonEnabledState,
        };
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

  // â”€â”€ Field value update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Save draft â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Reset form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const resetForm = useCallback(() => {
    if (!formDefinition) return;
    setFieldValues(buildInitialValues(formDefinition));
    setValidationErrors({});
    setIsDirty(false);
    setActiveTabIndex(0);
  }, [formDefinition]);

  // â”€â”€ Submit form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const submitForm = useCallback(async (submitButtonId?: string) => {
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
      const firstErrorTabIndex = findFirstErrorTabIndex(formDefinition, errors);
      if (firstErrorTabIndex !== null) {
        setActiveTabIndex(firstErrorTabIndex);
      }
      return;
    }

    setIsSubmitting(true);

    try {
      // Strip hidden field values before submitting
      const submitValues = stripHiddenFieldValues(fieldValues, visibleFieldIds, formDefinition);

      const response = await formApi.submit(formCode, submitValues, submitButtonId);
      const result = (response as unknown as { data: { referenceNumber: string } }).data;

      setSubmissionReference(result.referenceNumber ?? null);
      setIsSubmitted(true);
      setIsDirty(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [formDefinition, ruleState, fieldValues, formCode]);

  // Memoize contextValue so consumers only re-render when something they
  // actually care about changes — not on every internal FormProvider re-render.
  const contextValue = useMemo<FormContextValue>(
    () => ({
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
      submitAcknowledged,
      setSubmitAcknowledged,
      updateFieldValue,
      saveDraft,
      submitForm,
      resetForm,
    }),
    [
      formCode, formDefinition, isLoading, error, fieldValues, ruleState,
      validationErrors, isDirty, isSubmitting, draftId, activeTabIndex,
      submissionReference, isSubmitted, submitAcknowledged, updateFieldValue, saveDraft, submitForm, resetForm,
    ],
  );

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

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildInitialValues(formDefinition: FormDefinition): FormFieldValues {
  const values: FormFieldValues = {};

  // DFE-TABZONE-001: include header/footer zone fields, not only section fields.
  for (const field of getAllFormFields(formDefinition)) {
    values[field.schemaName] = field.defaultValue ?? null;
  }

  return values;
}

function collectAllRules(formDefinition: FormDefinition) {
  // DFE-TABZONE-001: header/footer fields can trigger business rules too.
  return getAllFormFields(formDefinition).flatMap((field) => field.businessRules);
}

// DFE-CBTN-001: every scoped button in the form (tab- and section-placed), so
// their conditional visibility/enablement can be evaluated each rule cycle.
function collectAllButtons(formDefinition: FormDefinition): ScopedButton[] {
  const buttons: ScopedButton[] = [];
  for (const tab of formDefinition.tabs) {
    if (tab.buttons) buttons.push(...tab.buttons);
    for (const section of tab.sections) {
      if (section.buttons) buttons.push(...section.buttons);
    }
  }
  return buttons;
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

    // DFE-TABZONE-001: header/footer fields are gated by tab visibility only
    // (they belong to no section).
    for (const field of getTabZoneFields(tab)) {
      const fieldVisible = ruleState.fieldVisibility[field.id] ?? field.isVisible;
      if (fieldVisible && !field.isHidden) {
        visible.add(field.id);
      }
    }
  }

  return visible;
}

function findFirstErrorTabIndex(
  formDefinition: FormDefinition,
  errors: Record<string, string[]>,
): number | null {
  const sortedTabs = [...formDefinition.tabs].sort((a, b) => a.displayOrder - b.displayOrder);

  for (let i = 0; i < sortedTabs.length; i++) {
    const tab = sortedTabs[i];
    // DFE-TABZONE-001: an error on a header/footer field must also focus its tab.
    for (const field of getAllTabFields(tab)) {
      if (errors[field.id]) return i;
    }
  }

  return null;
}

function stripHiddenFieldValues(
  fieldValues: FormFieldValues,
  visibleFieldIds: Set<string>,
  formDefinition: FormDefinition,
): FormFieldValues {
  const schemaNameToId: Record<string, string> = {};

  // DFE-TABZONE-001: include header/footer fields so their values are not
  // incorrectly stripped on submit.
  for (const field of getAllFormFields(formDefinition)) {
    schemaNameToId[field.schemaName] = field.id;
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
