import type { FieldDefinition } from '@qdb/shared';
import type { RegisterOptions } from 'react-hook-form';

type Rules = RegisterOptions<Record<string, unknown>, string>;
type ValidateFn = (v: unknown) => true | string;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()+]{7,20}$/;

export function isFieldRequired(field: FieldDefinition): boolean {
  return (
    field.isRequiredDefault ||
    field.validationRules.some((r) => r.ruleType === 'required')
  );
}

export function buildValidationRules(field: FieldDefinition): Rules {
  const rules: Rules = {};
  const validators: Record<string, ValidateFn> = {};

  // Required: check both the field flag and any explicit required validation rule.
  // Using a custom validate (not built-in required) so we control exactly what "empty"
  // means for each field type â€” e.g. a required checkbox must be true, not just truthy.
  const explicitRequiredRule = field.validationRules.find((r) => r.ruleType === 'required');
  const isRequired = field.isRequiredDefault || explicitRequiredRule !== undefined;

  if (isRequired) {
    const message = explicitRequiredRule?.errorMessage ?? `${field.displayLabel} is required`;
    validators.required = (v) => {
      if (v === undefined || v === null || v === '') return message;
      if (Array.isArray(v) && v.length === 0) return message;
      if (field.fieldType === 'checkbox' && v === false) return message;
      return true;
    };
  }

  for (const rule of field.validationRules) {
    const { ruleType, errorMessage, params = {} } = rule;

    switch (ruleType) {
      case 'required':
        break; // handled above

      case 'minLength': {
        const min = params.minLength as number | undefined;
        if (min !== undefined) rules.minLength = { value: min, message: errorMessage };
        break;
      }

      case 'maxLength': {
        const max = params.maxLength as number | undefined;
        if (max !== undefined) rules.maxLength = { value: max, message: errorMessage };
        break;
      }

      case 'regex': {
        const pattern = params.regexPattern as string | undefined;
        if (pattern) rules.pattern = { value: new RegExp(pattern), message: errorMessage };
        break;
      }

      case 'email':
        validators.email = (v) => {
          if (!v || String(v).trim() === '') return true;
          return EMAIL_REGEX.test(String(v)) || errorMessage;
        };
        break;

      case 'phone':
        validators.phone = (v) => {
          if (!v || String(v).trim() === '') return true;
          return PHONE_REGEX.test(String(v)) || errorMessage;
        };
        break;

      case 'minValue': {
        const minVal = params.minValue as number | undefined;
        if (minVal !== undefined) {
          validators.minValue = (v) => {
            const n = Number(v);
            if (v === undefined || v === null || v === '' || isNaN(n)) return true;
            return n >= minVal || errorMessage;
          };
        }
        break;
      }

      case 'maxValue': {
        const maxVal = params.maxValue as number | undefined;
        if (maxVal !== undefined) {
          validators.maxValue = (v) => {
            const n = Number(v);
            if (v === undefined || v === null || v === '' || isNaN(n)) return true;
            return n <= maxVal || errorMessage;
          };
        }
        break;
      }
    }
  }

  if (Object.keys(validators).length > 0) {
    rules.validate = validators;
  }

  return rules;
}
