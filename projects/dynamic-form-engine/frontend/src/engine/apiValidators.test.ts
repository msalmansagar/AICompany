import { describe, it, expect, vi } from 'vitest';
import {
  API_VALIDATION_TIMEOUT_MS,
  ApiValidatorRegistry,
  exposeApiValidatorRegistration,
  runApiValidation,
} from './apiValidators';
import type { FieldDefinition, ValidationRule } from '@qdb/shared';

function apiRule(overrides: Partial<ValidationRule> = {}): ValidationRule {
  return {
    id: 'r1', fieldId: 'f1', ruleType: 'apiValidation', errorMessage: 'Enter a valid IBAN',
    isActive: true, priority: 1, validationKey: 'IBAN', ...overrides,
  };
}

function ibanField(rules: ValidationRule[] = [apiRule()]): FieldDefinition {
  return { id: 'f1', schemaName: 'iban', label: 'IBAN', fieldType: 'text', validationRules: rules } as unknown as FieldDefinition;
}

function check(registry: ApiValidatorRegistry, value: unknown, field = ibanField()) {
  return runApiValidation({ field, value, values: { iban: value, holder: 'A. Customer' }, formCode: 'demo', registry });
}

describe('runApiValidation', () => {
  it('runApiValidation_HandlerSaysValid_ReturnsNoError', async () => {
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', async () => ({ isValid: true }));

    expect(await check(registry, 'QA58DOHB00001234567890ABCDEFG')).toBeNull();
  });

  it('runApiValidation_HandlerSaysInvalidWithMessage_ReturnsThatMessage', async () => {
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', async () => ({ isValid: false, message: 'Account is closed' }));

    expect(await check(registry, 'QA00')).toBe('Account is closed');
  });

  it('runApiValidation_HandlerSaysInvalidWithoutMessage_ReturnsTheRuleMessage', async () => {
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', async () => ({ isValid: false }));

    expect(await check(registry, 'QA00')).toBe('Enter a valid IBAN');
  });

  it('runApiValidation_HandlerThrows_FailsWithTheRuleMessage', async () => {
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', async () => { throw new Error('timeout'); });

    expect(await check(registry, 'QA00')).toBe('Enter a valid IBAN');
  });

  it('runApiValidation_HandlerNeverAnswers_FailsWithTheRuleMessageAfterTheTimeout', async () => {
    vi.useFakeTimers();
    try {
      const registry = new ApiValidatorRegistry();
      registry.register('IBAN', () => new Promise(() => undefined));

      const pending = check(registry, 'QA00');
      await vi.advanceTimersByTimeAsync(API_VALIDATION_TIMEOUT_MS);

      expect(await pending).toBe('Enter a valid IBAN');
    } finally {
      vi.useRealTimers();
    }
  });

  it('runApiValidation_NoHandlerForTheKey_Passes', async () => {
    expect(await check(new ApiValidatorRegistry(), 'QA00')).toBeNull();
  });

  it('runApiValidation_EmptyValue_CallsNoHandler', async () => {
    const registry = new ApiValidatorRegistry();
    const handler = vi.fn(async () => ({ isValid: false }));
    registry.register('IBAN', handler);

    await check(registry, '   ');

    expect(handler).not.toHaveBeenCalled();
  });

  it('runApiValidation_HandlerReceivesKeyValueAndOtherFields', async () => {
    const registry = new ApiValidatorRegistry();
    const handler = vi.fn(async () => ({ isValid: true }));
    registry.register('IBAN', handler);

    await check(registry, 'QA58');

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      key: 'IBAN', value: 'QA58', fieldSchemaName: 'iban', formCode: 'demo', values: expect.objectContaining({ holder: 'A. Customer' }),
    }));
  });

  it('runApiValidation_TwoRules_ReturnsTheFirstFailure', async () => {
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', async () => ({ isValid: true }));
    registry.register('SANCTIONS', async () => ({ isValid: false, message: 'Blocked account' }));
    const field = ibanField([apiRule(), apiRule({ id: 'r2', validationKey: 'SANCTIONS' })]);

    expect(await check(registry, 'QA58', field)).toBe('Blocked account');
  });

  it('runApiValidation_InactiveRule_IsSkipped', async () => {
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', async () => ({ isValid: false }));

    expect(await check(registry, 'QA58', ibanField([apiRule({ isActive: false })]))).toBeNull();
  });
});

describe('ApiValidatorRegistry replacement', () => {
  it('register_SameKeyTwice_LogsTheReplacement', async () => {
    const { logger } = await import('../utils/logger');
    const warn = vi.spyOn(logger, 'warn');
    const registry = new ApiValidatorRegistry();
    registry.register('IBAN', async () => ({ isValid: true }));

    registry.register('IBAN', async () => ({ isValid: true }));

    expect(warn).toHaveBeenCalledWith('api_validator_replaced', { key: 'IBAN' });
  });
});

describe('ApiValidatorRegistry', () => {
  it('register_ReturnedFunction_Unregisters', () => {
    const registry = new ApiValidatorRegistry();
    const unregister = registry.register('IBAN', async () => ({ isValid: true }));

    unregister();

    expect(registry.find('IBAN')).toBeUndefined();
  });

  it('exposeApiValidatorRegistration_WindowFunction_RegistersInTheRegistry', () => {
    const registry = new ApiValidatorRegistry();
    exposeApiValidatorRegistration(registry);
    const handler = async () => ({ isValid: true });

    (window as unknown as { DynamicFormEngine: { registerApiValidator: (k: string, h: typeof handler) => void } })
      .DynamicFormEngine.registerApiValidator('IBAN', handler);

    expect(registry.find('IBAN')).toBe(handler);
  });
});
