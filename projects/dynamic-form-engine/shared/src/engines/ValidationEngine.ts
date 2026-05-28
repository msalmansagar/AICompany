import { z } from 'zod';
import { FieldDefinition } from '../types/form';

export class ValidationEngine {
  static buildZodSchema(fields: FieldDefinition[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const field of fields) {
      let schema: z.ZodTypeAny = z.string();

      for (const rule of field.validationRules) {
        switch (rule.ruleType) {
          case 'REQUIRED':
            schema = z.string().min(1, rule.errorMessage);
            break;
          case 'MIN_LENGTH':
            schema = z.string().min((rule.params?.minLength as number) ?? 1, rule.errorMessage);
            break;
          case 'MAX_LENGTH':
            schema = z.string().max((rule.params?.maxLength as number) ?? 255, rule.errorMessage);
            break;
          case 'EMAIL_FORMAT':
            schema = z.string().email(rule.errorMessage);
            break;
          case 'REGEX':
            schema = z.string().regex(new RegExp(rule.params?.pattern as string), rule.errorMessage);
            break;
          case 'CUSTOM_EXPRESSION':
            // Deferred to Phase 2 — skip silently
            break;
        }
      }

      shape[field.fieldKey] = field.isRequiredDefault ? schema : schema.optional();
    }

    return z.object(shape);
  }
}
