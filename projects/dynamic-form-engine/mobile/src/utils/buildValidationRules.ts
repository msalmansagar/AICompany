import type { FieldDefinition } from '@qdb/form-engine-shared';
import type { RegisterOptions } from 'react-hook-form';

type Rules = RegisterOptions<Record<string, unknown>, string>;
type ValidateFn = (v: unknown) => true | string;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()+]{7,20}$/;

export function buildValidationRules(field: FieldDefinition): Rules {
  const rules: Rules = {};
  const validators: Record<string, ValidateFn> = {};

  if (field.isRequiredDefault) {
    rules.required = `${field.displayLabel} is required`;
  }

  for (const rule of field.validationRules) {
    const { ruleType, errorMessage, params = {} } = rule;

    switch (ruleType) {
      case 'required':
        rules.required = errorMessage;
        break;

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
