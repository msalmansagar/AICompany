import { type BusinessRuleDefinition } from '@/types/businessRule';

export type ValidationRuleType =
  | 'required'
  | 'min_length'
  | 'max_length'
  | 'regex'
  | 'min_value'
  | 'max_value';

export interface DesignerValidationRule {
  id: string;
  fieldId: string;
  ruleType: ValidationRuleType;
  ruleValue: string | null;
  errorMessage: string;
  sortOrder: number;
}

export interface DesignerBusinessRule {
  id: string;
  formId: string;
  name: string;
  definition: BusinessRuleDefinition;
  isActive: boolean;
  sortOrder: number;
}
