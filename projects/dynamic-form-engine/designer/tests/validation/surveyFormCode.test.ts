/**
 * FR-CSE-023 — a survey form's code carries the reserved survey prefix. The render
 * cache is keyed by form code, so the prefix keeps survey and standard forms from
 * ever sharing a cache entry. Codes are lowercase and may use either separator (publish
 * rule PV-002); the wizard derives `srv_` and earlier org surveys use `srv-`, so both count.
 */

import { describe, it, expect } from 'vitest';
import { hasSurveyCodePrefix, findSurveyCodeError } from '@/validation/surveyFormCode';
import { validateForDraftSave } from '@/validation/draftValidation';
import type { DesignerFormModel } from '@/state/models/DesignerFormModel';

function makeForm(overrides: Partial<DesignerFormModel> = {}): DesignerFormModel {
  return {
    id: 'tmp_form_001',
    name: 'Customer feedback',
    code: 'srv_customer_feedback',
    description: '',
    entityLogicalName: '',
    status: 'draft',
    currentVersion: '1',
    themeId: null,
    allowSaveDraft: true,
    draftExpiryDays: null,
    showSummaryStep: false,
    powerAutomateFlowId: null,
    confirmationMessage: null,
    confirmationRecordRefAttribute: null,
    accessGroupId: null,
    createdBy: 'user-1',
    createdOn: new Date(),
    modifiedBy: 'user-1',
    modifiedOn: new Date(),
    ...overrides,
  };
}

describe('hasSurveyCodePrefix', () => {
  it.each(['srv_feedback', 'srv-feedback'])('hasSurveyCodePrefix_%s_returnsTrue', code => {
    expect(hasSurveyCodePrefix(code)).toBe(true);
  });

  it.each(['cust_001', 'survey_feedback', 'srvfeedback', 'my_srv_form'])('hasSurveyCodePrefix_%s_returnsFalse', code => {
    expect(hasSurveyCodePrefix(code)).toBe(false);
  });
});

describe('findSurveyCodeError', () => {
  it('findSurveyCodeError_surveyWithoutPrefix_returnsMessage', () => {
    const form = makeForm({ formType: 'Survey', code: 'cust_001' });

    expect(findSurveyCodeError(form)).toMatch(/srv_/);
  });

  it('findSurveyCodeError_surveyWithoutPrefix_namesBothAcceptedPrefixes', () => {
    const form = makeForm({ formType: 'Survey', code: 'cust_001' });

    expect(findSurveyCodeError(form)).toMatch(/srv_ or srv-/);
  });

  it('findSurveyCodeError_surveyWithPrefix_returnsNull', () => {
    const form = makeForm({ formType: 'Survey', code: 'srv_001' });

    expect(findSurveyCodeError(form)).toBeNull();
  });

  it('findSurveyCodeError_standardFormWithAnyCode_returnsNull', () => {
    const form = makeForm({ formType: 'Standard', code: 'cust_001' });

    expect(findSurveyCodeError(form)).toBeNull();
  });

  it('findSurveyCodeError_untypedFormWithAnyCode_returnsNull', () => {
    const form = makeForm({ code: 'cust_001' });

    expect(findSurveyCodeError(form)).toBeNull();
  });
});

describe('validateForDraftSave — survey code prefix', () => {
  it('validateForDraftSave_surveyWithoutPrefix_isInvalid', () => {
    const result = validateForDraftSave(makeForm({ formType: 'Survey', code: 'cust_001' }));

    expect(result.isValid).toBe(false);
  });

  it('validateForDraftSave_surveyWithPrefix_isValid', () => {
    const result = validateForDraftSave(makeForm({ formType: 'Survey', code: 'srv_001' }));

    expect(result.isValid).toBe(true);
  });
});
