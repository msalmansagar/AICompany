import { describe, it, expect } from 'vitest';
import type { ExtraParamSpec, FormDefinition, ScopedButton } from '@qdb/shared';
import {
  ExtraParamsAssemblyService,
  ExtraParamsError,
  ExtraParamsTooLargeError,
  findFinalSubmitButton,
  extraParamsOf,
  MAX_EXTRA_PARAMS_BYTES,
  type SubmissionRuntimeContext,
} from './ExtraParamsAssemblyService.js';

const service = new ExtraParamsAssemblyService();

function makeContext(overrides: Partial<SubmissionRuntimeContext> = {}): SubmissionRuntimeContext {
  return {
    userId: 'user-real-001',
    userDisplayName: 'Real User',
    formId: 'form-001',
    formCode: 'loan-application',
    formVersion: '7',
    submittedAt: '2026-06-30T00:00:00.000Z',
    sessionId: 'corr-001',
    tenantSegment: 'SME',
    locale: 'en',
    ...overrides,
  };
}

describe('ExtraParamsAssemblyService.resolve', () => {
  it('static_source_returns_the_configured_constant', () => {
    const specs: ExtraParamSpec[] = [{ key: 'channel', source: 'static', staticValue: 'portal' }];
    const result = service.resolve(specs, {}, makeContext());
    expect(result.channel).toBe('portal');
  });

  it('hiddenField_source_returns_the_current_field_value', () => {
    const specs: ExtraParamSpec[] = [{ key: 'amount', source: 'hiddenField', fieldSchemaName: 'qdb_amount' }];
    const result = service.resolve(specs, { qdb_amount: 25000 }, makeContext());
    expect(result.amount).toBe(25000);
  });

  it('hiddenField_source_coerces_object_values_to_json', () => {
    const specs: ExtraParamSpec[] = [{ key: 'tags', source: 'hiddenField', fieldSchemaName: 'qdb_tags' }];
    const result = service.resolve(specs, { qdb_tags: ['a', 'b'] }, makeContext());
    expect(result.tags).toBe('["a","b"]');
  });

  it('runtimeContext_source_is_stamped_from_server_context', () => {
    const specs: ExtraParamSpec[] = [{ key: 'who', source: 'runtimeContext', contextKey: 'userId' }];
    const result = service.resolve(specs, {}, makeContext());
    expect(result.who).toBe('user-real-001');
  });

  it('runtimeContext_cannot_be_spoofed_by_client_formData (C-004)', () => {
    // A malicious client puts a fake userId in formData; it must NOT influence the stamped value.
    const specs: ExtraParamSpec[] = [{ key: 'who', source: 'runtimeContext', contextKey: 'userId' }];
    const result = service.resolve(specs, { userId: 'admin', qdb_userid: 'admin' }, makeContext());
    expect(result.who).toBe('user-real-001');
  });

  it('computed_source_evaluates_the_expression_against_formData (C-005)', () => {
    const specs: ExtraParamSpec[] = [
      { key: 'fullName', source: 'computed', expression: "concat({firstName}, ' ', {lastName})" },
    ];
    const result = service.resolve(specs, { firstName: 'Ada', lastName: 'Lovelace' }, makeContext());
    expect(result.fullName).toBe('Ada Lovelace');
  });

  it('computed_source_substitutes_null_for_a_malformed_expression (FR-042)', () => {
    const specs: ExtraParamSpec[] = [{ key: 'x', source: 'computed', expression: '1 +' }];
    expect(service.resolve(specs, {}, makeContext())).toEqual({ x: null });
  });

  it('computed_source_substitutes_null_for_an_over_length_expression (FR-042)', () => {
    const specs: ExtraParamSpec[] = [{ key: 'x', source: 'computed', expression: `'${'a'.repeat(2000)}'` }];
    expect(service.resolve(specs, {}, makeContext())).toEqual({ x: null });
  });

  it('missing_key_throws', () => {
    const specs = [{ key: '', source: 'static', staticValue: 'x' }] as ExtraParamSpec[];
    expect(() => service.resolve(specs, {}, makeContext())).toThrow(ExtraParamsError);
  });

  it('missing_contextKey_throws', () => {
    const specs = [{ key: 'k', source: 'runtimeContext' }] as ExtraParamSpec[];
    expect(() => service.resolve(specs, {}, makeContext())).toThrow(ExtraParamsError);
  });

  it('oversized_envelope_throws_422 (C-007 / FR-043)', () => {
    const huge = 'x'.repeat(MAX_EXTRA_PARAMS_BYTES + 1);
    const specs: ExtraParamSpec[] = [{ key: 'big', source: 'static', staticValue: huge }];
    expect(() => service.resolve(specs, {}, makeContext())).toThrow(ExtraParamsTooLargeError);
  });

  it('resolves_a_mixed_envelope_end_to_end', () => {
    const specs: ExtraParamSpec[] = [
      { key: 'channel', source: 'static', staticValue: 'portal' },
      { key: 'amount', source: 'hiddenField', fieldSchemaName: 'qdb_amount' },
      { key: 'submittedBy', source: 'runtimeContext', contextKey: 'userId' },
      { key: 'doubled', source: 'computed', expression: '{qdb_amount} * 2' },
    ];
    const result = service.resolve(specs, { qdb_amount: 100 }, makeContext());
    expect(result).toEqual({
      channel: 'portal',
      amount: 100,
      submittedBy: 'user-real-001',
      doubled: 200,
    });
  });
});

describe('findFinalSubmitButton / extraParamsOf', () => {
  const finalSubmitButton: ScopedButton = {
    id: 'btn-submit',
    placementScope: 'section',
    placementId: 'sec-1',
    label: 'Submit',
    displayOrder: 0,
    isPrimary: true,
    isVisible: true,
    confirmationRequired: false,
    action: { type: 'finalSubmit', extraParams: [{ key: 'channel', source: 'static', staticValue: 'portal' }] },
    isActive: true,
  };
  const navButton: ScopedButton = {
    id: 'btn-next',
    placementScope: 'tab',
    placementId: 'tab-1',
    label: 'Next',
    displayOrder: 0,
    isPrimary: false,
    isVisible: true,
    confirmationRequired: false,
    action: { type: 'navigate', target: 'nextStep' },
    isActive: true,
  };

  const form = {
    id: 'form-001',
    formCode: 'loan-application',
    version: 7,
    tabs: [
      { id: 'tab-1', buttons: [navButton], sections: [{ id: 'sec-1', buttons: [finalSubmitButton], fields: [] }] },
    ],
  } as unknown as FormDefinition;

  it('finds_a_section_scoped_finalSubmit_button', () => {
    expect(findFinalSubmitButton(form, 'btn-submit')?.id).toBe('btn-submit');
  });

  it('returns_null_for_a_navigate_button', () => {
    expect(findFinalSubmitButton(form, 'btn-next')).toBeNull();
  });

  it('returns_null_for_an_unknown_id', () => {
    expect(findFinalSubmitButton(form, 'nope')).toBeNull();
  });

  it('extraParamsOf_returns_the_finalSubmit_specs', () => {
    expect(extraParamsOf(finalSubmitButton)).toHaveLength(1);
    expect(extraParamsOf(navButton)).toEqual([]);
  });
});
