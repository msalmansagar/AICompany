import { describe, it, expect, vi } from 'vitest';
import { FieldService, type CreateFieldDto } from './FieldService';
import { FORM_FIELD_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from './IWebApiAdapter';

function makeApi(): IWebApiAdapter {
  return {
    createRecord: vi.fn().mockResolvedValue({ id: 'new-guid' }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn().mockResolvedValue({ entities: [] }),
  } as unknown as IWebApiAdapter;
}

function baseDto(over: Partial<CreateFieldDto> = {}): CreateFieldDto {
  return {
    sectionId: 'sec-1',
    label: 'X',
    code: 'x',
    fieldType: 'text',
    placeholder: '',
    helpText: '',
    isRequired: false,
    isReadOnly: false,
    defaultValue: null,
    sortOrder: 0,
    columnSpan: 1,
    ...over,
  };
}

function lastCreatePayload(api: IWebApiAdapter): Record<string, unknown> {
  return (api.createRecord as ReturnType<typeof vi.fn>).mock.calls[0][1];
}

describe('FieldService placement (DFE-TABZONE-001)', () => {
  it('writes qdb_placement Header code + tab bind for header placement', async () => {
    const api = makeApi();
    await new FieldService(api).createField(baseDto({ placement: 'header', tabId: 'tab-1' }));

    const payload = lastCreatePayload(api);
    expect(payload[FORM_FIELD_ATTRS.PLACEMENT]).toBe(100000000);
    expect(payload['qdb_form_tab_id@odata.bind']).toBe('/qdb_form_tabs(tab-1)');
  });

  it('writes Body code and no tab bind for body placement', async () => {
    const api = makeApi();
    await new FieldService(api).createField(baseDto({ placement: 'body' }));

    const payload = lastCreatePayload(api);
    expect(payload[FORM_FIELD_ATTRS.PLACEMENT]).toBe(100000002);
    expect(payload['qdb_form_tab_id@odata.bind']).toBeUndefined();
  });

  it('reads placement + tabId back from a record', async () => {
    const api = makeApi();
    (api.retrieveMultipleRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      entities: [
        {
          [FORM_FIELD_ATTRS.ID]: 'f1',
          [FORM_FIELD_ATTRS.SECTION_ID_VALUE]: 'sec-1',
          [FORM_FIELD_ATTRS.PLACEMENT]: 100000001,
          [FORM_FIELD_ATTRS.TAB_ID_VALUE]: 'tab-9',
          [FORM_FIELD_ATTRS.FIELD_TYPE]: 1,
          [FORM_FIELD_ATTRS.COLUMN_SPAN]: 1,
        },
      ],
    });

    const [model] = await new FieldService(api).listFieldsForSection('sec-1');
    expect(model.placement).toBe('footer');
    expect(model.tabId).toBe('tab-9');
  });

  it('defaults a legacy record (no placement code) to body', async () => {
    const api = makeApi();
    (api.retrieveMultipleRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      entities: [
        {
          [FORM_FIELD_ATTRS.ID]: 'f1',
          [FORM_FIELD_ATTRS.SECTION_ID_VALUE]: 'sec-1',
          [FORM_FIELD_ATTRS.FIELD_TYPE]: 1,
          [FORM_FIELD_ATTRS.COLUMN_SPAN]: 1,
        },
      ],
    });

    const [model] = await new FieldService(api).listFieldsForSection('sec-1');
    expect(model.placement).toBe('body');
    expect(model.tabId).toBeNull();
  });
});
