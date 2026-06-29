import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormDesignRepository } from '@/services/FormDesignRepository';
import { FORM_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { FORM_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
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

describe('FormDesignRepository picklist round-trip', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let repo: FormDesignRepository;

  beforeEach(() => {
    webApi = buildMockWebApi();
    repo = new FormDesignRepository(webApi);
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'fd-1', entityType: 'qdb_form_design' });
  });

  it('upsert_writesPicklistIntegerCodes_forAllEnums', async () => {
    await repo.upsertFormDesign({
      formId: 'f1', themeId: null, customCss: '',
      tabStyle: 'Stepper', layoutType: 'Grid', labelPosition: 'Left',
      buttonStyle: 'Outline', alignment: 'Center', sectionStyle: 'Flat',
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[FORM_DESIGN_ATTRS.TAB_STYLE]).toBe(100000002);
    expect(payload[FORM_DESIGN_STYLE_ATTRS.LAYOUT_TYPE]).toBe(100000003);
    expect(payload[FORM_DESIGN_STYLE_ATTRS.LABEL_POSITION]).toBe(100000002);
    expect(payload[FORM_DESIGN_STYLE_ATTRS.FORM_BUTTON_STYLE]).toBe(100000002);
    expect(payload[FORM_DESIGN_STYLE_ATTRS.ALIGNMENT]).toBe(100000002);
    expect(payload[FORM_DESIGN_STYLE_ATTRS.SECTION_STYLE]).toBe(100000002);
  });

  it('get_readsPicklistCodesBackToTypedValues', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{
        [FORM_DESIGN_ATTRS.ID]: 'fd-1',
        [FORM_DESIGN_ATTRS.TAB_STYLE]: 100000002,
        [FORM_DESIGN_STYLE_ATTRS.LAYOUT_TYPE]: 100000003,
        [FORM_DESIGN_STYLE_ATTRS.LABEL_POSITION]: 100000002,
        [FORM_DESIGN_STYLE_ATTRS.FORM_BUTTON_STYLE]: 100000002,
        [FORM_DESIGN_STYLE_ATTRS.ALIGNMENT]: 100000002,
        [FORM_DESIGN_STYLE_ATTRS.SECTION_STYLE]: 100000002,
      }],
    });
    const fd = await repo.getFormDesign('f1');
    expect(fd?.tabStyle).toBe('Stepper');
    expect(fd?.layoutType).toBe('Grid');
    expect(fd?.labelPosition).toBe('Left');
    expect(fd?.buttonStyle).toBe('Outline');
    expect(fd?.alignment).toBe('Center');
    expect(fd?.sectionStyle).toBe('Flat');
  });
});
