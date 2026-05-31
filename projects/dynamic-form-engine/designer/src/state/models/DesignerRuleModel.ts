import { type BusinessRuleDefinition } from '@/types/businessRule';

export type ValidationRuleType =
  | 'required'
  | 'min_length'
  | 'max_length'
  | 'regex'
  | 'min_value'
  | 'max_value'
  // Sprint 3
  | 'custom_expression';

export interface DesignerValidationRule {
  id: string;
  fieldId: string;
  ruleType: ValidationRuleType;
  ruleValue: string | null;
  errorMessage: string;
  sortOrder: number;
  // Sprint 3 — populated when ruleType = 'custom_expression'
  customExpression: string | null;
  // Sprint 3 — optional link to a reusable rule template
  ruleTemplateId: string | null;
}

export interface DesignerBusinessRule {
  id: string;
  formId: string;
  name: string;
  definition: BusinessRuleDefinition;
  isActive: boolean;
  sortOrder: number;
}
