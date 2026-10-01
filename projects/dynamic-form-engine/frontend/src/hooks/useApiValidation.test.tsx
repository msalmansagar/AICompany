import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useApiValidation } from './useApiValidation';
import { ApiValidatorRegistry, type ApiValidationResult } from '../engine/apiValidators';
import type { FieldDefinition, FormDefinition, FormFieldValues } from '@qdb/shared';

const IBAN_FIELD = {
  id: 'f-iban', schemaName: 'iban', label: 'IBAN', fieldType: 'text',
  validationRules: [{ id: 'r', fieldId: 'f-iban', ruleType: 'apiValidation', validationKey: 'IBAN', errorMessage: 'Invalid IBAN', isActive: true, priority: 1 }],
} as unknown as FieldDefinition;

const FORM = { tabs: [{ id: 't', sections: [{ id: 's', fields: [IBAN_FIELD] }] }] } as unknown as FormDefinition;

function setup(handler: (value: unknown) => Promise<ApiValidationResult>, values: FormFieldValues = { iban: 'QA1' }) {
  const registry = new ApiValidatorRegistry();
  registry.register('IBAN', ({ value }) => handler(value));
  return renderHook(
    ({ fieldValues }) => useApiValidation({ formDefinition: FORM, formCode: 'demo', fieldValues, registry }),
    { initialProps: { fieldValues: values } },
  );
}

describe('useApiValidation', () => {
  it('useApiValidation_InvalidAnswer_RecordsTheFieldError', async () => {
    const { result } = setup(async () => ({ isValid: false, message: 'Account closed' }));

    await act(async () => { await result.current.checkFields([IBAN_FIELD], { iban: 'QA1' }); });

    expect(result.current.apiErrors).toEqual({ 'f-iban': 'Account closed' });
  });

  it('useApiValidation_AnswerForAnOldValue_IsDiscarded', async () => {
    const answers: Array<(result: ApiValidationResult) => void> = [];
    const { result } = setup((value) => new Promise((resolve) => { answers.push(resolve); void value; }));

    let firstCheck!: Promise<Record<string, string>>;
    act(() => { firstCheck = result.current.checkFields([IBAN_FIELD], { iban: 'OLD' }); });
    let secondCheck!: Promise<Record<string, string>>;
    act(() => { secondCheck = result.current.checkFields([IBAN_FIELD], { iban: 'NEW' }); });
    await act(async () => { answers[1]!({ isValid: true }); await secondCheck; });
    await act(async () => { answers[0]!({ isValid: false, message: 'stale' }); await firstCheck; });

    expect(result.current.apiErrors).toEqual({});
  });

  it('useApiValidation_WhileRunning_MarksTheFieldAsChecking', async () => {
    let answer!: (result: ApiValidationResult) => void;
    const { result } = setup(() => new Promise((resolve) => { answer = resolve; }));

    let check!: Promise<Record<string, string>>;
    act(() => { check = result.current.checkFields([IBAN_FIELD], { iban: 'QA1' }); });
    expect(result.current.checkingFieldIds.has('f-iban')).toBe(true);

    await act(async () => { answer({ isValid: true }); await check; });
    expect(result.current.checkingFieldIds.has('f-iban')).toBe(false);
  });

  it('useApiValidation_FocusoutAfterAChange_ChecksOnce', async () => {
    const handler = vi.fn(async () => ({ isValid: true }));
    setup(handler, { iban: 'QA1' });

    act(() => { document.dispatchEvent(new FocusEvent('focusout')); });
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    act(() => { document.dispatchEvent(new FocusEvent('focusout')); });

    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  });

  it('useApiValidation_HiddenField_IsNotCheckedOnFocusout', async () => {
    const handler = vi.fn(async () => ({ isValid: true }));
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', handler);
    renderHook(() => useApiValidation({
      formDefinition: FORM, formCode: 'demo', fieldValues: { iban: 'QA1' }, visibleFieldIds: new Set(), registry,
    }));

    act(() => { document.dispatchEvent(new FocusEvent('focusout')); });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handler).not.toHaveBeenCalled();
  });

  it('useApiValidation_ClearFieldError_DropsTheError', async () => {
    const { result } = setup(async () => ({ isValid: false }));
    await act(async () => { await result.current.checkFields([IBAN_FIELD], { iban: 'QA1' }); });

    act(() => { result.current.clearFieldError('iban'); });

    expect(result.current.apiErrors).toEqual({});
  });
});
