// FR-CSE-023: survey form codes carry a reserved prefix. The render cache is keyed by form
// code, so the prefix keeps a survey and a standard form from ever sharing a cache entry.
// Codes are lowercase and may use hyphens and underscores (publish rule PV-002). The wizard
// derives srv_, while the org's earlier surveys use srv-, so both separators count.

import type { DesignerFormModel } from '@/state/models/DesignerFormModel';
import { FORM_CODE_HINT } from '@/utils/formCodeUtils';

const SURVEY_CODE_PREFIX_PATTERN = /^srv[-_]/;

export const SURVEY_CODE_PREFIX_MESSAGE =
  'A survey form code must start with srv_ or srv- (for example srv_customer-feedback)';

/** The hint shown under the Form Code box of a survey form. */
export const SURVEY_FORM_CODE_HINT = `Survey codes start with srv_ or srv-. ${FORM_CODE_HINT}`;

/** True when the code starts with the reserved survey prefix. */
export function hasSurveyCodePrefix(code: string): boolean {
  return SURVEY_CODE_PREFIX_PATTERN.test(code);
}

/** The prefix error for a survey form without it; null for every other form. */
export function findSurveyCodeError(form: Pick<DesignerFormModel, 'formType' | 'code'>): string | null {
  if (form.formType !== 'Survey') return null;
  return hasSurveyCodePrefix(form.code) ? null : SURVEY_CODE_PREFIX_MESSAGE;
}
