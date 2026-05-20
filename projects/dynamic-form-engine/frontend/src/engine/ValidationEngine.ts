import { z, ZodTypeAny } from 'zod';
import type {
  FieldDefinition,
  ValidationRule,
  FormDefinition,
  FormFieldValues,
} from '@dfe/shared';

type ZodShape = Record<string, ZodTypeAny>;

export class ValidationEngine {
  /**
   * Generates a Zod schema from FieldDefinition validation rules.
   * Only includes fields that are currently visible — hidden fields are excluded
   * so they cannot fail validation and block submission.
   */
  buildZodSchema(
    fields: FieldDefinition[],
    visibleFields: Set<string>,
  ): z.ZodObject<ZodShape> {
    const shape: ZodShape = {};

    for (const field of fields) {
      if (!visibleFields.has(field.id)) continue;

      shape[field.schemaName] = this.buildFieldSchema(field);
    }

    return z.object(shape);
  }

  /**
   * Validates a single field value against its definition rules.
   * Returns an array of error messages; empty array means the field is valid.
   */
  validateField(
    field: FieldDefinition,
    value: unknown,
    allValues: FormFieldValues,
  ): string[] {
    const errors: string[] = [];

    for (const rule of field.validationRules.filter((r) => r.isActive)) {
      const error = this.evaluateRule(rule, value, allValues);

      if (error) errors.push(error);
    }

    return errors;
  }

  /**
   * Validates all visible fields in a form and returns a map of
   * fieldId → error messages for fields that failed validation.
   */
  validateForm(
    formDefinition: FormDefinition,
    values: FormFieldValues,
    visibleFields: Set<string>,
  ): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    const allFields = this.collectAllFields(formDefinition);

    for (const field of allFields) {
      if (!visibleFields.has(field.id)) continue;

      const fieldValue = values[field.schemaName];
      const fieldErrors = this.validateField(field, fieldValue, values);

      if (fieldErrors.length > 0) {
        errors[field.id] = fieldErrors;
      }
    }

    return errors;
  }

  private buildFieldSchema(field: FieldDefinition): ZodTypeAny {
    let schema: ZodTypeAny = z.unknown();

    const hasRequired = field.validationRules.some(
      (r) => r.ruleType === 'required' && r.isActive,
    );
    const isRequired = field.isRequired || hasRequired;

    switch (field.fieldType) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'phone':
      case 'richText':
        schema = this.buildStringSchema(field, isRequired);
        break;

      case 'number':
      case 'currency':
      case 'decimal':
        schema = this.buildNumberSchema(field, isRequired);
        break;

      case 'date':
      case 'datetime':
        schema = isRequired
          ? z.string().min(1, 'This field is required')
          : z.string().optional();
        break;

      case 'checkbox':
        schema = isRequired
          ? z.boolean().refine((v) => v === true, 'This field must be checked')
          : z.boolean().optional();
        break;

      case 'dropdown':
      case 'radio':
        schema = isRequired
          ? z.string().min(1, 'Please select an option')
          : z.string().optional();
        break;

      case 'multiselect':
        schema = isRequired
          ? z.array(z.string()).min(1, 'Please select at least one option')
          : z.array(z.string()).optional();
        break;

      case 'lookup':
        schema = isRequired
          ? z.object({ id: z.string(), displayName: z.string() })
          : z.object({ id: z.string(), displayName: z.string() }).optional();
        break;

      case 'file':
        schema = isRequired
          ? z.array(z.string()).min(1, 'Please upload at least one file')
          : z.array(z.string()).optional();
        break;

      case 'repeatingGrid':
        schema = isRequired
          ? z.array(z.record(z.unknown())).min(1, 'Please add at least one row')
          : z.array(z.record(z.unknown())).optional();
        break;

      default:
        schema = isRequired ? z.unknown() : z.unknown().optional();
    }

    return schema;
  }

  private buildStringSchema(field: FieldDefinition, isRequired: boolean): ZodTypeAny {
    let schema = z.string();

    if (isRequired) {
      schema = schema.min(1, 'This field is required');
    }

    for (const rule of field.validationRules.filter((r) => r.isActive)) {
      if (rule.ruleType === 'minLength' && rule.minLength !== undefined) {
        schema = schema.min(rule.minLength, rule.errorMessage);
      }

      if (rule.ruleType === 'maxLength' && rule.maxLength !== undefined) {
        schema = schema.max(rule.maxLength, rule.errorMessage);
      }

      if (rule.ruleType === 'email') {
        schema = schema.email(rule.errorMessage);
      }

      if (rule.ruleType === 'regex' && rule.regexPattern) {
        schema = schema.regex(new RegExp(rule.regexPattern), rule.errorMessage);
      }
    }

    return isRequired ? schema : schema.optional();
  }

  private buildNumberSchema(field: FieldDefinition, isRequired: boolean): ZodTypeAny {
    let schema = z.number({ invalid_type_error: 'Must be a number' });

    for (const rule of field.validationRules.filter((r) => r.isActive)) {
      if (rule.ruleType === 'minValue' && rule.minValue !== undefined) {
        schema = schema.min(rule.minValue, rule.errorMessage);
      }

      if (rule.ruleType === 'maxValue' && rule.maxValue !== undefined) {
        schema = schema.max(rule.maxValue, rule.errorMessage);
      }
    }

    return isRequired ? schema : schema.optional();
  }

  private evaluateRule(
    rule: ValidationRule,
    value: unknown,
    allValues: FormFieldValues,
  ): string | null {
    switch (rule.ruleType) {
      case 'required':
        return this.validateRequired(value, rule.errorMessage);

      case 'minLength':
        return this.validateMinLength(value, rule.minLength ?? 0, rule.errorMessage);

      case 'maxLength':
        return this.validateMaxLength(value, rule.maxLength ?? Infinity, rule.errorMessage);

      case 'minValue':
        return this.validateMinValue(value, rule.minValue ?? -Infinity, rule.errorMessage);

      case 'maxValue':
        return this.validateMaxValue(value, rule.maxValue ?? Infinity, rule.errorMessage);

      case 'email':
        return this.validateEmail(value, rule.errorMessage);

      case 'phone':
        return this.validatePhone(value, rule.errorMessage);

      case 'regex':
        return this.validateRegex(value, rule.regexPattern ?? '', rule.errorMessage);

      case 'dateBefore':
        return this.validateDateBefore(value, rule, allValues);

      case 'dateAfter':
        return this.validateDateAfter(value, rule, allValues);

      case 'crossField':
        return this.validateCrossField(value, rule, allValues);

      default:
        return null;
    }
  }

  private validateRequired(value: unknown, errorMessage: string): string | null {
    if (value === null || value === undefined || value === '') return errorMessage;

    if (Array.isArray(value) && value.length === 0) return errorMessage;

    return null;
  }

  private validateMinLength(value: unknown, min: number, errorMessage: string): string | null {
    if (typeof value !== 'string') return null;

    return value.length < min ? errorMessage : null;
  }

  private validateMaxLength(value: unknown, max: number, errorMessage: string): string | null {
    if (typeof value !== 'string') return null;

    return value.length > max ? errorMessage : null;
  }

  private validateMinValue(value: unknown, min: number, errorMessage: string): string | null {
    if (typeof value !== 'number') return null;

    return value < min ? errorMessage : null;
  }

  private validateMaxValue(value: unknown, max: number, errorMessage: string): string | null {
    if (typeof value !== 'number') return null;

    return value > max ? errorMessage : null;
  }

  private validateEmail(value: unknown, errorMessage: string): string | null {
    if (!value) return null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(value)) ? null : errorMessage;
  }

  private validatePhone(value: unknown, errorMessage: string): string | null {
    if (!value) return null;

    const phoneRegex = /^\+?[\d\s\-().]{7,20}$/;
    return phoneRegex.test(String(value)) ? null : errorMessage;
  }

  private validateRegex(value: unknown, pattern: string, errorMessage: string): string | null {
    if (!value) return null;

    try {
      return new RegExp(pattern).test(String(value)) ? null : errorMessage;
    } catch {
      return null;
    }
  }

  private validateDateBefore(
    value: unknown,
    rule: ValidationRule,
    allValues: FormFieldValues,
  ): string | null {
    if (!value) return null;

    const compareDate = rule.compareToFieldId
      ? new Date(String(allValues[rule.compareToFieldId] ?? ''))
      : rule.compareToValue
        ? new Date(rule.compareToValue)
        : null;

    if (!compareDate || isNaN(compareDate.getTime())) return null;

    return new Date(String(value)) < compareDate ? null : rule.errorMessage;
  }

  private validateDateAfter(
    value: unknown,
    rule: ValidationRule,
    allValues: FormFieldValues,
  ): string | null {
    if (!value) return null;

    const compareDate = rule.compareToFieldId
      ? new Date(String(allValues[rule.compareToFieldId] ?? ''))
      : rule.compareToValue
        ? new Date(rule.compareToValue)
        : null;

    if (!compareDate || isNaN(compareDate.getTime())) return null;

    return new Date(String(value)) > compareDate ? null : rule.errorMessage;
  }

  private validateCrossField(
    value: unknown,
    rule: ValidationRule,
    allValues: FormFieldValues,
  ): string | null {
    if (!rule.compareToFieldId) return null;

    const compareValue = allValues[rule.compareToFieldId];

    return value === compareValue ? null : rule.errorMessage;
  }

  private collectAllFields(formDefinition: FormDefinition): FieldDefinition[] {
    return formDefinition.tabs.flatMap((tab) =>
      tab.sections.flatMap((section) => section.fields),
    );
  }
}

export const validationEngine = new ValidationEngine();
