// FR-CSE-075 — cloning a survey produces a survey.
// RED until FormCloneService is updated.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormCloneService } from '@/services/FormCloneService';
import { FORM_DEFINITION_ATTRS, FORM_TYPE_TO_PICKLIST } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

const SOURCE_FORM_ID = 'source-form-id';
const NEW_FORM_ID = 'new-form-id';

function buildSurveyFormRecord(id: string, etag: string): Record<string, unknown> {
  return {
    '@odata.etag': etag,
    [FORM_DEFINITION_ATTRS.ID]: id,
    [FORM_DEFINITION_ATTRS.NAME]: 'Customer Feedback',
    [FORM_DEFINITION_ATTRS.CODE]: 'srv_customer_feedback',
    [FORM_DEFINITION_ATTRS.DESCRIPTION]: '',
    [FORM_DEFINITION_ATTRS.ENTITY_LOGICAL_NAME]: null,
    [FORM_DEFINITION_ATTRS.STATUS]: 100000001,
    [FORM_DEFINITION_ATTRS.CURRENT_VERSION]: 1,
    [FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]: false,
    [FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS]: null,
    [FORM_DEFINITION_ATTRS.SHOW_SUMMARY_STEP]: false,
    [FORM_DEFINITION_ATTRS.SUMMARY_MODE]: null,
    [FORM_DEFINITION_ATTRS.SHOW_PROGRESS_BAR]: false,
    [FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID]: null,
    [FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE]: null,
    [FORM_DEFINITION_ATTRS.CONFIRMATION_RECORD_REF_ATTRIBUTE]: null,
    [FORM_DEFINITION_ATTRS.ACCESS_GROUP_ID]: null,
    [FORM_DEFINITION_ATTRS.ICON_NAME]: null,
    [FORM_DEFINITION_ATTRS.IMAGE_URL]: null,
    [FORM_DEFINITION_ATTRS.HEADER_TEXT]: null,
    [FORM_DEFINITION_ATTRS.HEADER_IMAGE_URL]: null,
    [FORM_DEFINITION_ATTRS.FOOTER_TEXT]: null,
    [FORM_DEFINITION_ATTRS.FOOTER_IMAGE_URL]: null,
    createdby: 'user-1',
    createdon: '2026-01-01T00:00:00Z',
    modifiedby: 'user-1',
    modifiedon: '2026-01-01T00:00:00Z',
    [FORM_DEFINITION_ATTRS.FORM_TYPE]: FORM_TYPE_TO_PICKLIST.Survey,
    [FORM_DEFINITION_ATTRS.SCORING_MODE]: 100000000,
  };
}

function buildNormalFormRecord(id: string): Record<string, unknown> {
  return {
    '@odata.etag': '"normal-etag"',
    [FORM_DEFINITION_ATTRS.ID]: id,
    [FORM_DEFINITION_ATTRS.NAME]: 'Loan Application',
    [FORM_DEFINITION_ATTRS.CODE]: 'loan_application',
    [FORM_DEFINITION_ATTRS.DESCRIPTION]: '',
    [FORM_DEFINITION_ATTRS.ENTITY_LOGICAL_NAME]: 'contact',
    [FORM_DEFINITION_ATTRS.STATUS]: 100000000,
    [FORM_DEFINITION_ATTRS.CURRENT_VERSION]: 1,
    [FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]: true,
    [FORM_DEFINITION_ATTRS.DRAFT_EXPIRY_DAYS]: null,
    [FORM_DEFINITION_ATTRS.SHOW_SUMMARY_STEP]: false,
    [FORM_DEFINITION_ATTRS.SUMMARY_MODE]: null,
    [FORM_DEFINITION_ATTRS.SHOW_PROGRESS_BAR]: false,
    [FORM_DEFINITION_ATTRS.POWER_AUTOMATE_FLOW_ID]: null,
    [FORM_DEFINITION_ATTRS.CONFIRMATION_MESSAGE]: null,
    [FORM_DEFINITION_ATTRS.CONFIRMATION_RECORD_REF_ATTRIBUTE]: null,
    [FORM_DEFINITION_ATTRS.ACCESS_GROUP_ID]: null,
    [FORM_DEFINITION_ATTRS.ICON_NAME]: null,
    [FORM_DEFINITION_ATTRS.IMAGE_URL]: null,
    [FORM_DEFINITION_ATTRS.HEADER_TEXT]: null,
    [FORM_DEFINITION_ATTRS.HEADER_IMAGE_URL]: null,
    [FORM_DEFINITION_ATTRS.FOOTER_TEXT]: null,
    [FORM_DEFINITION_ATTRS.FOOTER_IMAGE_URL]: null,
    createdby: 'user-1',
    createdon: '2026-01-01T00:00:00Z',
    modifiedby: 'user-1',
    modifiedon: '2026-01-01T00:00:00Z',
    [FORM_DEFINITION_ATTRS.FORM_TYPE]: FORM_TYPE_TO_PICKLIST.Standard,
    [FORM_DEFINITION_ATTRS.SCORING_MODE]: 100000000,
  };
}

function buildMockWebApi(): IWebApiAdapter {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
    updateRecordConditional: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as IWebApiAdapter;
}

describe('FormCloneService — survey clone (FR-CSE-075)', () => {
  let webApi: IWebApiAdapter;
  let service: FormCloneService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new FormCloneService(webApi);
    // Tabs, sections, fields, options, lookup configs, rules — all empty for these tests
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
    vi.mocked(webApi.createRecord).mockResolvedValue({
      id: NEW_FORM_ID,
      entityType: 'qdb_form_definition',
    });
    vi.mocked(webApi.updateRecordConditional).mockResolvedValue(undefined);
  });

  it('clone_of_survey_calls_updateRecordConditional_with_Survey_formType', async () => {
    // Source retrieval (Tier-1 succeed on first call), new form etag retrieval (second call)
    vi.mocked(webApi.retrieveRecord)
      .mockResolvedValueOnce(buildSurveyFormRecord(SOURCE_FORM_ID, '"source-etag"'))
      .mockResolvedValueOnce(buildSurveyFormRecord(NEW_FORM_ID, '"new-etag"'));

    await service.cloneForm(SOURCE_FORM_ID);

    expect(webApi.updateRecordConditional).toHaveBeenCalledOnce();
    const [, , payload, options] = vi.mocked(webApi.updateRecordConditional).mock.calls[0];
    expect(payload[FORM_DEFINITION_ATTRS.FORM_TYPE]).toBe(FORM_TYPE_TO_PICKLIST.Survey);
    expect((options as { ifMatch: string }).ifMatch).toBe('"new-etag"');
  });

  it('clone_of_survey_creates_form_record_with_allowSaveDraft_false', async () => {
    vi.mocked(webApi.retrieveRecord)
      .mockResolvedValueOnce(buildSurveyFormRecord(SOURCE_FORM_ID, '"source-etag"'))
      .mockResolvedValueOnce(buildSurveyFormRecord(NEW_FORM_ID, '"new-etag"'));

    await service.cloneForm(SOURCE_FORM_ID);

    const [, createPayload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(createPayload[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]).toBe(false);
  });

  it('cloned_survey_code_preserves_srv_prefix_from_source', async () => {
    vi.mocked(webApi.retrieveRecord)
      .mockResolvedValueOnce(buildSurveyFormRecord(SOURCE_FORM_ID, '"source-etag"'))
      .mockResolvedValueOnce(buildSurveyFormRecord(NEW_FORM_ID, '"new-etag"'));

    await service.cloneForm(SOURCE_FORM_ID);

    const [, createPayload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(String(createPayload[FORM_DEFINITION_ATTRS.CODE])).toMatch(/^srv_/);
  });

  it('clone_of_normal_form_does_not_call_updateRecordConditional_for_formType', async () => {
    vi.mocked(webApi.retrieveRecord).mockResolvedValue(buildNormalFormRecord(SOURCE_FORM_ID));

    await service.cloneForm(SOURCE_FORM_ID);

    expect(webApi.updateRecordConditional).not.toHaveBeenCalled();
  });

  it('clone_of_normal_form_keeps_allowSaveDraft_true', async () => {
    vi.mocked(webApi.retrieveRecord).mockResolvedValue(buildNormalFormRecord(SOURCE_FORM_ID));

    await service.cloneForm(SOURCE_FORM_ID);

    const [, createPayload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(createPayload[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]).toBe(true);
  });

  // F-3 — RED until FormCloneService restores the srv_ prefix when the source survey
  // has a manually-edited code that no longer starts with srv_.
  it('cloned_survey_code_starts_with_srv_even_when_source_code_lacks_the_prefix', async () => {
    const sourceWithManualCode = {
      ...buildSurveyFormRecord(SOURCE_FORM_ID, '"source-etag"'),
      [FORM_DEFINITION_ATTRS.CODE]: 'customer_feedback', // manually stripped srv_
    };
    vi.mocked(webApi.retrieveRecord)
      .mockResolvedValueOnce(sourceWithManualCode)
      .mockResolvedValueOnce(buildSurveyFormRecord(NEW_FORM_ID, '"new-etag"'));

    await service.cloneForm(SOURCE_FORM_ID);

    const [, createPayload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(String(createPayload[FORM_DEFINITION_ATTRS.CODE])).toMatch(/^srv_/);
  });

  // F-01 (edge) — RED until FormCloneService truncates the clone code base so the
  // full clone code (_copy_ + 13-digit timestamp) stays within 100 chars.
  it('cloned_survey_code_stays_within_100_chars_when_source_code_is_long', async () => {
    // 82-char source code: 'srv_' (4) + 78 chars of name = 82 chars.
    // Without truncation: 82 + 6 ('_copy_') + 13 (epoch) = 101 chars.
    const longCode = 'srv_' + 'a'.repeat(78);
    const sourceWithLongCode = {
      ...buildSurveyFormRecord(SOURCE_FORM_ID, '"source-etag"'),
      [FORM_DEFINITION_ATTRS.CODE]: longCode,
    };
    vi.mocked(webApi.retrieveRecord)
      .mockResolvedValueOnce(sourceWithLongCode)
      .mockResolvedValueOnce(buildSurveyFormRecord(NEW_FORM_ID, '"new-etag"'));

    await service.cloneForm(SOURCE_FORM_ID);

    const [, createPayload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(String(createPayload[FORM_DEFINITION_ATTRS.CODE]).length).toBeLessThanOrEqual(100);
  });
});
