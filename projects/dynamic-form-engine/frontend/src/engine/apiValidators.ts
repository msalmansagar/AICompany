import type { FieldDefinition, FormFieldValues, ValidationRule } from '@qdb/shared';
import { logger } from '../utils/logger';

/** What a front-end handler receives for one API validation rule (DFE-APIVAL-CAM-001). */
export interface ApiValidationRequest {
  /** The rule's validation key, e.g. "IBAN" — which external check to run. */
  key: string;
  value: unknown;
  fieldSchemaName: string;
  formCode: string;
  /** Every field's current value, for checks that need more than one field. */
  values: FormFieldValues;
}

/** A handler's answer. An invalid answer without a message shows the rule's own message. */
export interface ApiValidationResult {
  isValid: boolean;
  message?: string;
}

export type ApiValidator = (request: ApiValidationRequest) => Promise<ApiValidationResult>;

/**
 * Where the front end registers one handler per validation key. The form engine never calls
 * an API itself: it hands the value to the handler registered for the rule's key.
 */
export class ApiValidatorRegistry {
  private readonly validatorsByKey = new Map<string, ApiValidator>();

  /**
   * Registers the handler for a key, replacing any earlier one. Returns an unregister function.
   * A replacement is logged: any script on the page can call this, and a swapped handler could
   * pass every value or read the form's data, so it must never happen silently.
   */
  register(key: string, validator: ApiValidator): () => void {
    const normalisedKey = key.trim();
    const existing = this.validatorsByKey.get(normalisedKey);
    if (existing && existing !== validator) logger.warn('api_validator_replaced', { key: normalisedKey });
    this.validatorsByKey.set(normalisedKey, validator);
    return () => {
      if (this.validatorsByKey.get(normalisedKey) === validator) this.validatorsByKey.delete(normalisedKey);
    };
  }

  find(key: string): ApiValidator | undefined {
    return this.validatorsByKey.get(key.trim());
  }
}

/**
 * The registry the running form reads. It is shared on purpose: a host page registers its
 * handlers before or after the form mounts, from code the form engine does not own.
 */
export const apiValidatorRegistry = new ApiValidatorRegistry();

interface DynamicFormEngineGlobal {
  registerApiValidator?: (key: string, validator: ApiValidator) => () => void;
}

/**
 * Exposes registration as window.DynamicFormEngine.registerApiValidator, so a script on the
 * hosting page (including a CRM page around the in-CRM runtime) can register without
 * importing this bundle.
 */
export function exposeApiValidatorRegistration(registry: ApiValidatorRegistry = apiValidatorRegistry): void {
  const host = window as unknown as { DynamicFormEngine?: DynamicFormEngineGlobal };
  host.DynamicFormEngine = {
    ...host.DynamicFormEngine,
    registerApiValidator: (key, validator) => registry.register(key, validator),
  };
}

/** The API validation rules a field carries, active only. */
export function apiValidationRules(field: FieldDefinition): ValidationRule[] {
  return (field.validationRules ?? []).filter((rule) => rule.isActive && rule.ruleType === 'apiValidation');
}

interface ApiCheckInput {
  field: FieldDefinition;
  value: unknown;
  values: FormFieldValues;
  formCode: string;
  registry: ApiValidatorRegistry;
}

/**
 * Runs a field's API validation rules in order and returns the first failure's message, or
 * null when every rule passes. An empty value is not checked ("Required" is its own rule).
 * A rule with no key, or no handler for its key, passes with a warning. A handler that throws
 * fails with the rule's own message, so a broken integration is visible (BRD OQ-1).
 */
export async function runApiValidation(input: ApiCheckInput): Promise<string | null> {
  if (isEmptyValue(input.value)) return null;
  for (const rule of apiValidationRules(input.field)) {
    const failure = await runOneRule(rule, input);
    if (failure) return failure;
  }
  return null;
}

async function runOneRule(rule: ValidationRule, input: ApiCheckInput): Promise<string | null> {
  const key = rule.validationKey?.trim();
  const validator = key ? input.registry.find(key) : undefined;
  if (!key || !validator) {
    logger.warn('api_validator_missing', { formCode: input.formCode, field: input.field.schemaName, key: key ?? null });
    return null;
  }
  try {
    const result = await withTimeout(validator({
      key, value: input.value, fieldSchemaName: input.field.schemaName, formCode: input.formCode, values: input.values,
    }));
    return result.isValid ? null : (result.message || rule.errorMessage);
  } catch (error) {
    logger.error('api_validator_failed', {
      formCode: input.formCode, field: input.field.schemaName, key, reason: describeHandlerError(error),
    });
    return rule.errorMessage;
  }
}

/**
 * Longest a handler may take. One that never settles would leave the field "Checking…" and
 * submit waiting forever; past this it fails with the rule's own message, like a handler error.
 */
export const API_VALIDATION_TIMEOUT_MS = 15_000;

function withTimeout<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`handler did not answer within ${API_VALIDATION_TIMEOUT_MS} ms`)), API_VALIDATION_TIMEOUT_MS);
  });
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}

/** Longest handler error text logged; a handler may echo the value it was checking. */
const MAX_LOGGED_REASON_LENGTH = 200;

function describeHandlerError(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.length > MAX_LOGGED_REASON_LENGTH ? `${reason.slice(0, MAX_LOGGED_REASON_LENGTH)}…` : reason;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return Array.isArray(value) && value.length === 0;
}
