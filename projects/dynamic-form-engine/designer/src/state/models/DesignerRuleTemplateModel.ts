import type { ValidationRuleType } from './DesignerRuleModel';

export interface DesignerRuleTemplateModel {
  /** CRM GUID or 'tmp_rt_<timestamp>' for unsaved templates */
  id: string;
  name: string;
  ruleType: ValidationRuleType;
  errorMessage: string;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  regexPattern: string | null;
  customExpression: string | null;
}
