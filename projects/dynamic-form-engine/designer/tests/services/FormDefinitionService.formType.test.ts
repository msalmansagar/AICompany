/**
 * FR-CSE-019 — Form Type (Standard / Survey) on qdb_form_definition.
 *
 * The qdb_form_type column is not provisioned on every org yet. Naming it in a
 * $select or a PATCH on such an org fails the whole request, so loading must fall
 * back without it and saving must never name it unless a type was explicitly set.
 */

import { describe, it, expect, vi } from 'vitest';
import { FormDefinitionService } from '@/services/FormDefinitionService';
import { FORM_DEFINITION_ATTRS, FORM_TYPE_TO_PICKLIST } from '@/constants/formAttributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

const FORM_ID = '44444444-4444-4444-4444-444444444444';

const FORM_RECORD = {
  '@odata.etag': 'W/"7"',
  [FORM_DEFINITION_ATTRS.ID]: FORM_ID,
  [FORM_DEFINITION_ATTRS.NAME]: 'Customer feedback',
  [FORM_DEFINITION_ATTRS.CODE]: 'srv_customer_feedback',
};

function webApiWith(retrieve: (query: string) => Promise<Record<string, unknown>>): IWebApiAdapter {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn((_entity: string, _id: string, query: string) => retrieve(query)),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
    updateRecordConditional: vi.fn().mockResolvedValue(undefined),
  } as unknown as IWebApiAdapter;
}

function patchedData(webApi: IWebApiAdapter): Record<string, unknown> {
  const call = (webApi.updateRecordConditional as ReturnType<typeof vi.fn>).mock.calls[0]!;
  return call[2] as Record<string, unknown>;
}

describe('FormDefinitionService — form type', () => {
  it('getFormWithEtag_columnDeployedWithSurvey_readsSurvey', async () => {
    const service = new FormDefinitionService(webApiWith(async () => ({
      ...FORM_RECORD,
      [FORM_DEFINITION_ATTRS.FORM_TYPE]: FORM_TYPE_TO_PICKLIST.Survey,
    })));

    const { model } = await service.getFormWithEtag(FORM_ID);

    expect(model.formType).toBe('Survey');
  });

  it('getFormWithEtag_columnMissingOnOrg_loadsFormWithoutType', async () => {
    const queries: string[] = [];
    const service = new FormDefinitionService(webApiWith(async (query) => {
      queries.push(query);
      if (query.includes(FORM_DEFINITION_ATTRS.FORM_TYPE)) {
        throw new Error(`Could not find a property named '${FORM_DEFINITION_ATTRS.FORM_TYPE}'`);
      }
      return FORM_RECORD;
    }));

    const { model, etag } = await service.getFormWithEtag(FORM_ID);

    expect(model.code).toBe('srv_customer_feedback');
    expect(model.formType).toBeUndefined();
    expect(etag).toBe('W/"7"');
    expect(queries[queries.length - 1]).not.toContain(FORM_DEFINITION_ATTRS.FORM_TYPE);
  });

  it('getFormWithEtag_columnDeployed_marksFormTypeAvailable', async () => {
    const service = new FormDefinitionService(webApiWith(async () => FORM_RECORD));

    const { model } = await service.getFormWithEtag(FORM_ID);

    expect(model.isFormTypeAvailable).toBe(true);
  });

  it('getFormWithEtag_columnMissingOnOrg_marksFormTypeUnavailable', async () => {
    const service = new FormDefinitionService(webApiWith(async (query) => {
      if (query.includes(FORM_DEFINITION_ATTRS.FORM_TYPE)) {
        throw new Error(`Could not find a property named '${FORM_DEFINITION_ATTRS.FORM_TYPE}'`);
      }
      return FORM_RECORD;
    }));

    const { model } = await service.getFormWithEtag(FORM_ID);

    expect(model.isFormTypeAvailable).toBe(false);
  });

  it('getFormWithEtag_networkFailure_propagatesInsteadOfFallingBack', async () => {
    const retrieve = vi.fn(async () => { throw new Error('Request failed (403)'); });
    const service = new FormDefinitionService(webApiWith(retrieve));

    await expect(service.getFormWithEtag(FORM_ID)).rejects.toThrow(/403/);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('getForm_columnDeployedButEmpty_leavesTypeUnset', async () => {
    const service = new FormDefinitionService(webApiWith(async () => FORM_RECORD));

    const model = await service.getForm(FORM_ID);

    expect(model.formType).toBeUndefined();
  });

  it('updateForm_formTypeUnset_sendsNoFormTypeAttribute', async () => {
    const webApi = webApiWith(async () => FORM_RECORD);

    await new FormDefinitionService(webApi).updateForm(FORM_ID, { name: 'Renamed' }, 'W/"7"');

    expect(patchedData(webApi)).not.toHaveProperty(FORM_DEFINITION_ATTRS.FORM_TYPE);
  });

  it('updateForm_formTypeSurvey_sendsSurveyPicklistValue', async () => {
    const webApi = webApiWith(async () => FORM_RECORD);

    await new FormDefinitionService(webApi).updateForm(FORM_ID, { formType: 'Survey' }, 'W/"7"');

    expect(patchedData(webApi)[FORM_DEFINITION_ATTRS.FORM_TYPE]).toBe(FORM_TYPE_TO_PICKLIST.Survey);
  });
});
