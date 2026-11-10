/**
 * FR-CSE-024 — FormSaveService must hand every field property FieldService can
 * persist to createField/updateField. Sixteen of them were silently dropped on
 * Save (Rating style, number bar, camera mode, component key, document view
 * toggles, info-card list style, file download settings, label content), so a
 * designer-set value vanished on reload.
 */

import { describe, it, expect, vi } from 'vitest';
import { FormSaveService } from '@/services/FormSaveService';
import { DEFAULT_DESIGN_PAYLOAD } from '@/state/designerStore';
import {
  FORM_DEFINITION_ATTRS,
  FORM_FIELD_ATTRS,
  FORM_TYPE_TO_PICKLIST,
  FILE_CAPTURE_MODE_TO_PICKLIST,
  NUMBER_DISPLAY_STYLE_TO_PICKLIST,
  RADIO_RENDER_STYLE_TO_PICKLIST,
} from '@/constants/formAttributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { DesignerFieldModel, DesignerFormModel } from '@/state/models/DesignerFormModel';

type SaveableState = Parameters<FormSaveService['save']>[0];

const SECTION_ID = '11111111-1111-1111-1111-111111111111';
const EXISTING_FIELD_ID = '22222222-2222-2222-2222-222222222222';
const CREATED_RECORD_ID = '33333333-3333-3333-3333-333333333333';
const NEW_FIELD_TEMP_ID = 'tmp_field_1';

const DROPPED_PROPERTIES: Partial<DesignerFieldModel> = {
  radioRenderStyle: 'rating',
  numberDisplayStyle: 'bar',
  fileCaptureMode: 'camera',
  componentKey: 'signature-pad',
  barMaxFieldSchemaName: 'qdb_limit',
  barValueFieldSchemaName: 'qdb_used',
  showDocumentView: true,
  showDocumentDownload: false,
  infoCardListType: 'numbered-roman',
  infoCardListMarker: 'circle',
  infoCardDownloadIcon: 'ArrowDownload',
  fileDownloadLabel: 'Download template',
  fileDownloadIcon: 'DocumentArrowDown',
  uploadDocumentSetting: 'setting-upload',
  downloadDocumentSetting: 'setting-download',
  staticContent: 'Static label text',
  sourceFieldSchemaName: 'qdb_source',
};

const EXPECTED_ATTRIBUTES: Record<string, unknown> = {
  [FORM_FIELD_ATTRS.RADIO_RENDER_STYLE]: RADIO_RENDER_STYLE_TO_PICKLIST.rating,
  [FORM_FIELD_ATTRS.NUMBER_DISPLAY_STYLE]: NUMBER_DISPLAY_STYLE_TO_PICKLIST.bar,
  [FORM_FIELD_ATTRS.FILE_CAPTURE_MODE]: FILE_CAPTURE_MODE_TO_PICKLIST.camera,
  [FORM_FIELD_ATTRS.COMPONENT_KEY]: 'signature-pad',
  [FORM_FIELD_ATTRS.BAR_MAX_FIELD_SCHEMA]: 'qdb_limit',
  [FORM_FIELD_ATTRS.BAR_VALUE_FIELD_SCHEMA]: 'qdb_used',
  [FORM_FIELD_ATTRS.SHOW_DOCUMENT_VIEW]: true,
  [FORM_FIELD_ATTRS.SHOW_DOCUMENT_DOWNLOAD]: false,
  [FORM_FIELD_ATTRS.INFO_CARD_LIST_TYPE]: 'numbered-roman',
  [FORM_FIELD_ATTRS.INFO_CARD_LIST_MARKER]: 'circle',
  [FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_ICON]: 'ArrowDownload',
  [FORM_FIELD_ATTRS.FILE_DOWNLOAD_LABEL]: 'Download template',
  [FORM_FIELD_ATTRS.FILE_DOWNLOAD_ICON]: 'DocumentArrowDown',
  [FORM_FIELD_ATTRS.UPLOAD_DOCUMENT_SETTING]: 'setting-upload',
  [FORM_FIELD_ATTRS.DOWNLOAD_DOCUMENT_SETTING]: 'setting-download',
  [FORM_FIELD_ATTRS.STATIC_CONTENT]: 'Static label text',
  [FORM_FIELD_ATTRS.SOURCE_FIELD_SCHEMA_NAME]: 'qdb_source',
};

function makeWebApi(): IWebApiAdapter {
  return {
    createRecord: vi.fn().mockResolvedValue({ id: CREATED_RECORD_ID, entityType: 'entity' }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    retrieveRecord: vi.fn().mockResolvedValue({ '@odata.etag': 'W/"200"' }),
    retrieveMultipleRecords: vi.fn().mockResolvedValue({ entities: [] }),
    executeAction: vi.fn().mockResolvedValue({}),
    updateRecordConditional: vi.fn().mockResolvedValue(undefined),
  };
}

function makeField(id: string, overrides: Partial<DesignerFieldModel> = {}): DesignerFieldModel {
  return {
    id,
    sectionId: SECTION_ID,
    label: 'Satisfaction',
    code: `field_${id}`,
    fieldType: 'text',
    placeholder: '',
    helpText: '',
    isRequired: false,
    isReadOnly: false,
    isHidden: false,
    defaultValue: null,
    currencyCode: null,
    decimalPlaces: null,
    maxRows: null,
    sortOrder: 0,
    columnSpan: 1,
    options: [],
    lookupConfig: null,
    componentKey: null,
    boolRenderStyle: null,
    trueLabel: null,
    falseLabel: null,
    infoCardStyle: null,
    infoCardTitle: null,
    infoCardBody: null,
    infoCardIcon: null,
    infoCardDownloadUrl: null,
    infoCardDownloadLabel: null,
    infoCardDownloadIcon: null,
    fileDownloadLabel: null,
    fileDownloadIcon: null,
    uploadDocumentSetting: null,
    downloadDocumentSetting: null,
    prefix: null,
    suffix: null,
    gridMode: null,
    gridEntityName: null,
    gridSelectionMode: null,
    gridMinRows: null,
    gridSavedViewId: null,
    gridFilterExpression: null,
    gridDependsOnFieldId: null,
    gridDependsOnFilterTemplate: null,
    gridColumns: [],
    ...overrides,
  };
}

/** A tmp_ form id skips the business-rule and theme steps, which need extra mocks. */
function makeState(field: DesignerFieldModel, overrides: Partial<SaveableState>): SaveableState {
  return {
    form: {
      id: 'tmp_form_fieldprops',
      name: 'Field properties',
      code: 'field_props',
      description: '',
      entityLogicalName: 'account',
      status: 'draft',
      currentVersion: '1',
      themeId: null,
      allowSaveDraft: true,
      draftExpiryDays: null,
      showSummaryStep: false,
      summaryMode: null,
      showProgressBar: false,
      powerAutomateFlowId: null,
      confirmationMessage: null,
      confirmationRecordRefAttribute: null,
      accessGroupId: null,
      createdBy: 'user-1',
      createdOn: new Date('2026-01-01'),
      modifiedBy: 'user-1',
      modifiedOn: new Date('2026-01-01'),
    },
    tabs: {},
    sections: {},
    fields: { [field.id]: field },
    tabOrder: [],
    sectionOrder: {},
    fieldOrder: { [SECTION_ID]: [field.id] },
    newIds: [],
    dirtyIds: [],
    deletedIds: [],
    deletedEntityTypes: {},
    validationRules: {},
    businessRules: {},
    designPayload: DEFAULT_DESIGN_PAYLOAD,
    formEtag: 'W/"100"',
    ...overrides,
  };
}

function makeSaveService(webApi: IWebApiAdapter): FormSaveService {
  return new FormSaveService(webApi, { userId: 'user-1', userName: 'tester', userFullName: 'Tester' });
}

function fieldPayloadSentBy(mock: unknown): Record<string, unknown> {
  const calls = (mock as ReturnType<typeof vi.fn>).mock.calls;
  const fieldCall = calls.find(call => call.includes('qdb_form_field'));
  if (!fieldCall) throw new Error('No qdb_form_field write was made');
  return fieldCall[fieldCall.length - 1] as Record<string, unknown>;
}

describe('FormSaveService — form type write guard (FR-CSE-019)', () => {
  function formPatch(webApi: IWebApiAdapter): Record<string, unknown> {
    const call = (webApi.updateRecordConditional as ReturnType<typeof vi.fn>).mock.calls[0]!;
    return call[2] as Record<string, unknown>;
  }

  function stateWithFormType(form: Partial<DesignerFormModel>): SaveableState {
    const base = makeState(makeField(EXISTING_FIELD_ID), {});
    if (!base.form) throw new Error('makeState must provide a form');
    return { ...base, form: { ...base.form, ...form } };
  }

  it('save_typeChosenButColumnUnavailable_sendsNoFormType', async () => {
    // A maker can pick a type on an org that has no qdb_form_type column; naming it
    // would make that org reject the whole save of an existing form.
    const webApi = makeWebApi();

    await makeSaveService(webApi).save(stateWithFormType({ formType: 'Standard', isFormTypeAvailable: false }));

    expect(formPatch(webApi)).not.toHaveProperty(FORM_DEFINITION_ATTRS.FORM_TYPE);
  });

  it('save_surveyWithColumnAvailable_sendsSurvey', async () => {
    const webApi = makeWebApi();

    await makeSaveService(webApi).save(stateWithFormType({ formType: 'Survey', isFormTypeAvailable: true }));

    expect(formPatch(webApi)[FORM_DEFINITION_ATTRS.FORM_TYPE]).toBe(FORM_TYPE_TO_PICKLIST.Survey);
  });
});

describe('FormSaveService — field properties reach FieldService (FR-CSE-024)', () => {
  it('createField_newFieldWithAllProperties_persistsEveryProperty', async () => {
    const webApi = makeWebApi();
    const field = makeField(NEW_FIELD_TEMP_ID, DROPPED_PROPERTIES);

    await makeSaveService(webApi).save(makeState(field, { newIds: [field.id] }));

    expect(fieldPayloadSentBy(webApi.createRecord)).toMatchObject(EXPECTED_ATTRIBUTES);
  });

  it('updateField_dirtyFieldWithAllProperties_persistsEveryProperty', async () => {
    const webApi = makeWebApi();
    const field = makeField(EXISTING_FIELD_ID, DROPPED_PROPERTIES);

    await makeSaveService(webApi).save(makeState(field, { dirtyIds: [field.id] }));

    expect(fieldPayloadSentBy(webApi.updateRecord)).toMatchObject(EXPECTED_ATTRIBUTES);
  });

  it('updateField_propertiesAbsentOrNull_sendsNoAttributeForThem', async () => {
    // An org missing a newer column (e.g. qdb_file_capture_mode on-prem) rejects any
    // write naming it, so an unset property must not appear in the payload at all.
    const webApi = makeWebApi();
    const field = makeField(EXISTING_FIELD_ID);

    await makeSaveService(webApi).save(makeState(field, { dirtyIds: [field.id] }));

    const payload = fieldPayloadSentBy(webApi.updateRecord);
    for (const attribute of Object.keys(EXPECTED_ATTRIBUTES)) {
      expect(payload).not.toHaveProperty(attribute);
    }
  });
});
