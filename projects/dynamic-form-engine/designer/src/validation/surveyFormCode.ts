// FR-CSE-023: survey form codes carry a reserved prefix. The render cache is keyed by form
// code, so the prefix keeps a survey and a standard form from ever sharing a cache entry.
// Codes are lowercase (publish rule PV-002) and the Code box turns hyphens into underscores,
// so both separators count.

import type { DesignerFormModel } from '@/state/models/DesignerFormModel';

const SURVEY_CODE_PREFIX_PATTERN = /^srv[-_]/;

export const SURVEY_CODE_PREFIX_MESSAGE =
  'A survey form code must start with srv_ (for example srv_customer_feedback)';

/** True when the code starts with the reserved survey prefix. */
export function hasSurveyCodePrefix(code: string): boolean {
  return SURVEY_CODE_PREFIX_PATTERN.test(code);
}

/** The prefix error for a survey form without it; null for every other form. */
export function findSurveyCodeError(form: Pick<DesignerFormModel, 'formType' | 'code'>): string | null {
  if (form.formType !== 'Survey') return null;
  return hasSurveyCodePrefix(form.code) ? null : SURVEY_CODE_PREFIX_MESSAGE;
}
