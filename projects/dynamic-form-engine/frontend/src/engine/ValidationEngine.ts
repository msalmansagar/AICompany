import { z, ZodTypeAny } from 'zod';
import type {
  FieldDefinition,
  ValidationRule,
  FormDefinition,
  FormFieldValues,
  StructuredCondition,
  CrossFieldComparisonOperator,
} from '@qdb/shared';
import { ExpressionEngine, type ExpressionContext } from '@qdb/shared';

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

    // isRequired is the Dataverse flag. If no explicit required validation rule
    // exists, enforce it here so the form cannot be submitted with the field empty.
    const hasExplicitRequiredRule = field.validationRules.some(
      (r) => r.ruleType === 'required' && r.isActive,
    );
    if (field.isRequired && !hasExplicitRequiredRule) {
      const error = this.validateRequired(value, `${field.label} is required`);
      if (error) errors.push(error);
    }

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

      // DFE-ADD-002: Boolean field — value must be true or false (not undefined) when required.
      // BC-010 enforcement for boolean: required validation applies regardless of tab visit state.
      case 'boolean':
        schema = isRequired
          ? z
              .boolean()
              .optional()
              .refine(
                (val) => val !== undefined,
                'This field is required',
              )
          : z.boolean().optional();
        break;

      // DFE-ADD-002: Interactive Grid — required validation applies even if tab was never visited.
      // BC-010 enforcement: Zod schema built at form level, not on interaction.
      case 'interactive-grid': {
        const selectionSchema = z.union([z.string(), z.array(z.string())]);
        const entrySchema = z.array(z.record(z.unknown()));
        // Accept either selection or entry format; required check is non-empty.
        schema = isRequired
          ? z
              .union([selectionSchema, entrySchema])
              .optional()
              .refine(
                (val) => {
                  if (val === undefined || val === null) return false;
                  if (Array.isArray(val)) return val.length > 0;
                  if (typeof val === 'string') return val.length > 0;
                  return false;
                },
                'Please make a selection or add at least one row',
              )
          : z.union([selectionSchema, entrySchema]).optional();
        break;
      }

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

      case 'customExpression':
        return this.validateCustomExpression(value, rule, allValues);

      // DFE-ENH-001 FR-006
      case 'conditionalRequired':
        return this.validateConditionalRequired(value, rule, allValues);

      default:
        return null;
    }
  }

  private validateRequired(value: unknown, errorMessage: string): string | null {
    if (value === null || value === undefined || value === '') return errorMessage;

    // Boolean false is a valid required answer — only undefined/null signals missing.
    if (typeof value === 'boolean') return null;

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

  /** DFE-ENH-001 FR-007: extended cross-field comparison using operator + targetFieldRef. */
  private validateCrossField(
    value: unknown,
    rule: ValidationRule,
    allValues: FormFieldValues,
  ): string | null {
    const targetRef = rule.crossFieldTargetRef ?? rule.compareToFieldId;
    if (!targetRef) return null;

    const targetValue = allValues[targetRef];
    const operator = rule.crossFieldOperator ?? '==';

    return applyCrossFieldOperator(value, targetValue, operator) ? null : rule.errorMessage;
  }

  /** DFE-ENH-001 FR-006: evaluate all structured conditions; require the field if all are true. */
  private validateConditionalRequired(
    value: unknown,
    rule: ValidationRule,
    allValues: FormFieldValues,
  ): string | null {
    const conditions = rule.conditions;
    if (!conditions || conditions.length === 0) return null;

    const allConditionsMet = conditions.every(c => evaluateStructuredCondition(c, allValues));
    if (!allConditionsMet) return null;

    return this.validateRequired(value, rule.errorMessage);
  }

  private validateCustomExpression(
    _value: unknown,
    rule: ValidationRule,
    allValues: FormFieldValues,
  ): string | null {
    if (!rule.customExpression) return null;

    try {
      const ctx = this.buildExpressionContext(allValues);
      return ExpressionEngine.evaluateBoolean(rule.customExpression, ctx)
        ? null
        : rule.errorMessage;
    } catch {
      return null;
    }
  }

  private buildExpressionContext(values: FormFieldValues): ExpressionContext {
    const ctx: ExpressionContext = {};
    for (const [key, val] of Object.entries(values)) {
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        ctx[key] = val;
      } else {
        ctx[key] = null;
      }
    }
    return ctx;
  }

  private collectAllFields(formDefinition: FormDefinition): FieldDefinition[] {
    // DFE-TABZONE-001: validate header/footer zone fields, not only section fields.
    return formDefinition.tabs.flatMap((tab) => [
      ...(tab.headerFields ?? []),
      ...tab.sections.flatMap((section) => section.fields),
      ...(tab.footerFields ?? []),
    ]);
  }
}

export const validationEngine = new ValidationEngine();

// ── Pure comparison helpers (exported for testing) ─────────────────────────────

/**
 * Returns true when the cross-field comparison holds (no error should be raised).
 * The operator semantics match the designer's intent: the rule fires when the
 * comparison FAILS, so the caller inverts the result to determine whether to show an error.
 *
 * The public param is typed as CrossFieldComparisonOperator for call-site safety.
 * The private dispatch helpers accept string so their default branches remain reachable
 * at runtime for any future extension without a TypeScript exhaustiveness error here.
 */
export function applyCrossFieldOperator(
  sourceValue: unknown,
  targetValue: unknown,
  operator: CrossFieldComparisonOperator,
): boolean {
  if (sourceValue === null || sourceValue === undefined) return true; // nothing to compare
  if (targetValue === null || targetValue === undefined) return true;

  const bothDates = looksLikeDate(String(sourceValue)) && looksLikeDate(String(targetValue));
  if (bothDates) {
    return applyDateOperator(new Date(String(sourceValue)), new Date(String(targetValue)), operator);
  }

  const sourceNum = Number(sourceValue);
  const targetNum = Number(targetValue);
  if (!isNaN(sourceNum) && !isNaN(targetNum)) {
    return applyNumericOperator(sourceNum, targetNum, operator);
  }

  // String: restrict to == and != only (lexicographic comparison on arbitrary strings is misleading)
  return applyStringOperator(String(sourceValue), String(targetValue), operator);
}

function applyDateOperator(source: Date, target: Date, operator: string): boolean {
  const s = source.getTime();
  const t = target.getTime();
  switch (operator) {
    case '==': return s === t;
    case '!=': return s !== t;
    case '<':  return s <  t;
    case '<=': return s <= t;
    case '>':  return s >  t;
    case '>=': return s >= t;
    default:   return true;
  }
}

function applyNumericOperator(source: number, target: number, operator: string): boolean {
  switch (operator) {
    case '==': return source === target;
    case '!=': return source !== target;
    case '<':  return source <  target;
    case '<=': return source <= target;
    case '>':  return source >  target;
    case '>=': return source >= target;
    default:   return true;
  }
}

function applyStringOperator(source: string, target: string, operator: string): boolean {
  switch (operator) {
    case '==': return source === target;
    case '!=': return source !== target;
    default:   return true; // non-equality string operators not supported; treat as passing
  }
}

function looksLikeDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

/** Returns true when a single structured condition is satisfied by the current form values. */
export function evaluateStructuredCondition(
  condition: StructuredCondition,
  allValues: FormFieldValues,
): boolean {
  const fieldValue = allValues[condition.fieldRef];

  switch (condition.operator) {
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    case 'equals':
      return String(fieldValue ?? '') === String(condition.value ?? '');
    case 'not_equals':
      return String(fieldValue ?? '') !== String(condition.value ?? '');
    case 'greater_than':
      return Number(fieldValue) > Number(condition.value);
    case 'less_than':
      return Number(fieldValue) < Number(condition.value);
    case 'greater_than_or_equal':
      return Number(fieldValue) >= Number(condition.value);
    case 'less_than_or_equal':
      return Number(fieldValue) <= Number(condition.value);
    default:
      return false;
  }
}
