import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FieldDesignRepository } from '@/services/FieldDesignRepository';
import { FIELD_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { FIELD_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

function buildMockWebApi() {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as IWebApiAdapter;
}

describe('FieldDesignRepository round-trip', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let repo: FieldDesignRepository;

  beforeEach(() => {
    webApi = buildMockWebApi();
    repo = new FieldDesignRepository(webApi);
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'fld-1', entityType: 'qdb_field_design' });
  });

  it('upsert_writesPicklistCodes_and_cssClass', async () => {
    await repo.upsertFieldDesign({
      fieldId: 'fld1', width: 'Half', inputStyle: 'Filled',
      cssClass: 'qdb-highlight', focusStyleJson: '{"outline":"2px solid"}',
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[FIELD_DESIGN_STYLE_ATTRS.WIDTH]).toBe(100000002);
    expect(payload[FIELD_DESIGN_ATTRS.INPUT_STYLE]).toBe(100000002);
    expect(payload[FIELD_DESIGN_STYLE_ATTRS.CSS_CLASS]).toBe('qdb-highlight');
    expect(payload[FIELD_DESIGN_STYLE_ATTRS.FOCUS_STYLE_JSON]).toBe('{"outline":"2px solid"}');
  });

  it('get_readsPicklistCodes_cssClass_and_jsonStyles', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{
        [FIELD_DESIGN_ATTRS.ID]: 'fld-1',
        [FIELD_DESIGN_ATTRS.FIELD_ID]: 'fld1',
        [FIELD_DESIGN_STYLE_ATTRS.WIDTH]: 100000003,
        [FIELD_DESIGN_ATTRS.INPUT_STYLE]: 100000003,
        [FIELD_DESIGN_STYLE_ATTRS.CSS_CLASS]: 'qdb-highlight',
        [FIELD_DESIGN_STYLE_ATTRS.FOCUS_STYLE_JSON]: '{"outline":"2px solid"}',
      }],
    });
    const [fld] = await repo.getFieldDesigns('fd1');
    expect(fld.width).toBe('Custom');
    expect(fld.inputStyle).toBe('Standard');
    expect(fld.cssClassName).toBe('qdb-highlight');
    expect(fld.focusStyle).toEqual({ outline: '2px solid' });
  });
});
