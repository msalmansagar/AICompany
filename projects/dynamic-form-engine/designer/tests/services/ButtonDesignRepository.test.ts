import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ButtonDesignRepository } from '@/services/ButtonDesignRepository';
import { BUTTON_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { BUTTON_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
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

describe('ButtonDesignRepository picklist round-trip', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let repo: ButtonDesignRepository;

  beforeEach(() => {
    webApi = buildMockWebApi();
    repo = new ButtonDesignRepository(webApi);
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'btn-1', entityType: 'qdb_button_design' });
  });

  it('upsert_writesPicklistIntegerCodes_notStrings', async () => {
    await repo.upsertButtonDesign({
      formId: 'f1', buttonType: 'Submit',
      size: 'Large', alignment: 'Center', hoverEffect: 'Elevate', loadingStyle: 'Dots',
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[BUTTON_DESIGN_STYLE_ATTRS.SIZE]).toBe(100000003);
    expect(payload[BUTTON_DESIGN_STYLE_ATTRS.ALIGNMENT]).toBe(100000002);
    expect(payload[BUTTON_DESIGN_STYLE_ATTRS.HOVER_EFFECT]).toBe(100000002);
    expect(payload[BUTTON_DESIGN_STYLE_ATTRS.LOADING_STYLE]).toBe(100000002);
  });

  it('get_readsPicklistCodesBackToTypedValues', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{
        [BUTTON_DESIGN_ATTRS.ID]: 'btn-1',
        [BUTTON_DESIGN_ATTRS.BUTTON_TYPE]: 100000001,
        [BUTTON_DESIGN_STYLE_ATTRS.SIZE]: 100000003,
        [BUTTON_DESIGN_STYLE_ATTRS.ALIGNMENT]: 100000002,
        [BUTTON_DESIGN_STYLE_ATTRS.HOVER_EFFECT]: 100000003,
        [BUTTON_DESIGN_STYLE_ATTRS.LOADING_STYLE]: 100000003,
      }],
    });
    const [btn] = await repo.getButtonDesigns('f1');
    expect(btn.buttonType).toBe('Submit');
    expect(btn.size).toBe('Large');
    expect(btn.alignment).toBe('Center');
    expect(btn.hoverEffect).toBe('ColorShift');
    expect(btn.loadingStyle).toBe('Pulse');
  });

  it('get_fallsBackToDefaults_whenPicklistAbsent', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{ [BUTTON_DESIGN_ATTRS.ID]: 'btn-1', [BUTTON_DESIGN_ATTRS.BUTTON_TYPE]: 100000002 }],
    });
    const [btn] = await repo.getButtonDesigns('f1');
    expect(btn.buttonType).toBe('SaveDraft');
    expect(btn.size).toBe('Medium');
    expect(btn.alignment).toBe('Right');
  });
});
