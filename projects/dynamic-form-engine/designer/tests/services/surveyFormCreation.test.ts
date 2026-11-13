// FR-CSE-071 — createForm isSurvey flag and probeFormTypeAvailability.
// RED until FormDefinitionService is updated.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormDefinitionService } from '@/services/FormDefinitionService';
import { FORM_DEFINITION_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

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

describe('FormDefinitionService — survey creation (FR-CSE-071)', () => {
  let webApi: IWebApiAdapter;
  let service: FormDefinitionService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new FormDefinitionService(webApi);
  });

  // ---------------------------------------------------------------------------
  // createForm with isSurvey
  // ---------------------------------------------------------------------------

  describe('createForm', () => {
    it('survey_form_sets_allowSaveDraft_to_false', async () => {
      vi.mocked(webApi.createRecord).mockResolvedValue({
        id: 'survey-id',
        entityType: 'qdb_form_definition',
      });

      await service.createForm({
        name: 'Customer Feedback',
        code: 'srv_customer_feedback',
        description: '',
        entityLogicalName: '',
        themeId: null,
        isSurvey: true,
      });

      const [, payload] = vi.mocked(webApi.createRecord).mock.calls[0];
      expect(payload[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]).toBe(false);
    });

    it('survey_form_does_not_write_entity_logical_name', async () => {
      vi.mocked(webApi.createRecord).mockResolvedValue({
        id: 'survey-id',
        entityType: 'qdb_form_definition',
      });

      await service.createForm({
        name: 'Customer Feedback',
        code: 'srv_customer_feedback',
        description: '',
        entityLogicalName: 'contact', // ignored for surveys
        themeId: null,
        isSurvey: true,
      });

      const [, payload] = vi.mocked(webApi.createRecord).mock.calls[0];
      expect(payload).not.toHaveProperty(FORM_DEFINITION_ATTRS.ENTITY_LOGICAL_NAME);
    });

    it('normal_form_payload_is_unchanged_from_today', async () => {
      vi.mocked(webApi.createRecord).mockResolvedValue({
        id: 'normal-id',
        entityType: 'qdb_form_definition',
      });

      await service.createForm({
        name: 'Normal Form',
        code: 'normal_form',
        description: 'A description',
        entityLogicalName: 'contact',
        themeId: null,
      });

      const [, payload] = vi.mocked(webApi.createRecord).mock.calls[0];
      expect(payload[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]).toBe(true);
      expect(payload[FORM_DEFINITION_ATTRS.ENTITY_LOGICAL_NAME]).toBe('contact');
    });

    it('explicit_isSurvey_false_gives_same_payload_as_omitted', async () => {
      vi.mocked(webApi.createRecord).mockResolvedValue({
        id: 'normal-id',
        entityType: 'qdb_form_definition',
      });

      await service.createForm({
        name: 'Normal Form',
        code: 'normal_form',
        description: '',
        entityLogicalName: 'account',
        themeId: null,
        isSurvey: false,
      });

      const [, payload] = vi.mocked(webApi.createRecord).mock.calls[0];
      expect(payload[FORM_DEFINITION_ATTRS.ALLOW_SAVE_DRAFT]).toBe(true);
      expect(payload[FORM_DEFINITION_ATTRS.ENTITY_LOGICAL_NAME]).toBe('account');
    });
  });

  // ---------------------------------------------------------------------------
  // probeFormTypeAvailability
  // ---------------------------------------------------------------------------

  describe('probeFormTypeAvailability', () => {
    it('returns_true_when_form_type_column_accessible', async () => {
      vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });

      const result = await service.probeFormTypeAvailability();

      expect(result).toBe(true);
      const [, query] = vi.mocked(webApi.retrieveMultipleRecords).mock.calls[0];
      expect(query).toContain(FORM_DEFINITION_ATTRS.FORM_TYPE);
    });

    it('returns_false_when_form_type_column_missing', async () => {
      vi.mocked(webApi.retrieveMultipleRecords).mockRejectedValue(
        new Error('Could not find a property named qdb_form_type'),
      );

      const result = await service.probeFormTypeAvailability();

      expect(result).toBe(false);
    });

    it('rethrows_errors_that_are_not_missing_column_errors', async () => {
      vi.mocked(webApi.retrieveMultipleRecords).mockRejectedValue(
        new Error('Principal user is missing privilege'),
      );

      await expect(service.probeFormTypeAvailability()).rejects.toThrow('Principal user');
    });
  });
});
