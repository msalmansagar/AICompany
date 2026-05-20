// Draft save validation — lightweight checks before saving a draft.
// Less strict than publish validation — allows incomplete forms to be saved.

import type { DesignerFormModel } from '@/state/models/DesignerFormModel';

export interface DraftValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateForDraftSave(form: DesignerFormModel): DraftValidationResult {
  const errors: string[] = [];

  if (!form.name || form.name.trim() === '') {
    errors.push('Form name is required before saving');
  }

  if (!form.code || form.code.trim() === '') {
    errors.push('Form code is required before saving');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
