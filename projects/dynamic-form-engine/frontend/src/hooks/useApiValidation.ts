import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldDefinition, FormDefinition, FormFieldValues } from '@qdb/shared';
import {
  apiValidationRules,
  apiValidatorRegistry,
  runApiValidation,
  type ApiValidatorRegistry,
} from '../engine/apiValidators';
import { getAllFormFields } from '../components/forms/tabFields';

interface UseApiValidationOptions {
  formDefinition: FormDefinition | null;
  formCode: string;
  fieldValues: FormFieldValues;
  /** Fields shown right now. A field a rule hides is neither checked nor reported. Absent = all. */
  visibleFieldIds?: ReadonlySet<string>;
  registry?: ApiValidatorRegistry;
}

export interface ApiValidationState {
  /** One message per failing field, keyed by field id. */
  apiErrors: Record<string, string>;
  /** Fields whose check is still running. */
  checkingFieldIds: ReadonlySet<string>;
  /** Checks the given fields now and resolves with the failures, keyed by field id. */
  checkFields: (fields: FieldDefinition[], values: FormFieldValues) => Promise<Record<string, string>>;
  /** Drops a field's API error once the user edits it. Keyed by schema name, as edits are. */
  clearFieldError: (fieldSchemaName: string) => void;
  /** The form's fields that carry at least one API validation rule. */
  apiFields: FieldDefinition[];
}

/**
 * API validation state for one form (DFE-APIVAL-CAM-001). A field is checked when focus leaves
 * the form after its value changed, and again on submit. An answer for a value the user has
 * since changed is discarded, so a slow API can never show a stale result.
 */
export function useApiValidation({
  formDefinition, formCode, fieldValues, visibleFieldIds, registry = apiValidatorRegistry,
}: UseApiValidationOptions): ApiValidationState {
  const [allApiErrors, setApiErrors] = useState<Record<string, string>>({});
  // Read by the focusout listener, so the listener is attached once rather than per keystroke.
  const fieldValuesRef = useRef(fieldValues);
  fieldValuesRef.current = fieldValues;
  const isShown = useCallback(
    (fieldId: string) => !visibleFieldIds || visibleFieldIds.has(fieldId),
    [visibleFieldIds],
  );
  // An error on a field a rule has since hidden is kept, but not reported while it is hidden.
  const apiErrors = useMemo(
    () => Object.fromEntries(Object.entries(allApiErrors).filter(([fieldId]) => isShown(fieldId))),
    [allApiErrors, isShown],
  );
  const [checkingFieldIds, setCheckingFieldIds] = useState<ReadonlySet<string>>(() => new Set());
  const latestRequestedValues = useRef(new Map<string, unknown>());
  const lastCheckedValues = useRef(new Map<string, unknown>());

  const apiFields = useMemo(
    () => (formDefinition ? getAllFormFields(formDefinition).filter((field) => apiValidationRules(field).length > 0) : []),
    [formDefinition],
  );

  const checkOneField = useCallback(async (field: FieldDefinition, values: FormFieldValues): Promise<string | null> => {
    const value = values[field.schemaName];
    latestRequestedValues.current.set(field.id, value);
    setCheckingFieldIds((previous) => new Set(previous).add(field.id));
    const failure = await runApiValidation({ field, value, values, formCode, registry });
    if (latestRequestedValues.current.get(field.id) !== value) return null;
    lastCheckedValues.current.set(field.id, value);
    setCheckingFieldIds((previous) => withoutId(previous, field.id));
    setApiErrors((previous) => withFieldError(previous, field.id, failure));
    return failure;
  }, [formCode, registry]);

  const checkFields = useCallback(async (fields: FieldDefinition[], values: FormFieldValues) => {
    const failures = await Promise.all(fields.map(async (field) => [field.id, await checkOneField(field, values)] as const));
    return Object.fromEntries(failures.filter((entry): entry is readonly [string, string] => entry[1] !== null));
  }, [checkOneField]);

  const clearFieldError = useCallback((fieldSchemaName: string) => {
    const field = apiFields.find((candidate) => candidate.schemaName === fieldSchemaName);
    if (field) setApiErrors((previous) => withFieldError(previous, field.id, null));
  }, [apiFields]);

  // Leaving a field is a focusout somewhere in the document; only shown fields whose value
  // changed since their last check are sent, so tabbing through the form calls nothing.
  useEffect(() => {
    if (apiFields.length === 0) return undefined;
    function checkChangedFields(): void {
      const values = fieldValuesRef.current;
      const changed = apiFields.filter((field) =>
        isShown(field.id) && lastCheckedValues.current.get(field.id) !== values[field.schemaName]);
      if (changed.length > 0) void checkFields(changed, values);
    }
    document.addEventListener('focusout', checkChangedFields);
    return () => document.removeEventListener('focusout', checkChangedFields);
  }, [apiFields, checkFields, isShown]);

  return { apiErrors, checkingFieldIds, checkFields, clearFieldError, apiFields };
}

function withoutId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(ids);
  next.delete(id);
  return next;
}

function withFieldError(errors: Record<string, string>, fieldId: string, failure: string | null): Record<string, string> {
  if (failure) return { ...errors, [fieldId]: failure };
  if (!(fieldId in errors)) return errors;
  const { [fieldId]: _removed, ...rest } = errors;
  return rest;
}
