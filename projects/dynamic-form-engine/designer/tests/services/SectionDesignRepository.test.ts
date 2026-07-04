import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SectionDesignRepository } from '@/services/SectionDesignRepository';
import { SECTION_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { SECTION_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
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

describe('SectionDesignRepository round-trip', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let repo: SectionDesignRepository;

  beforeEach(() => {
    webApi = buildMockWebApi();
    repo = new SectionDesignRepository(webApi);
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'sec-1', entityType: 'qdb_section_design' });
  });

  it('upsert_writesPicklistCodes_cssClass_and_headerStyle', async () => {
    await repo.upsertSectionDesign({
      sectionId: 's1', columnLayout: 3, cardStyle: 'Elevated',
      collapsibleStyle: 'Animated', visibilityAnimation: 'Fade',
      cssClass: 'qdb-promo', headerStyleJson: '{"fontWeight":"bold"}',
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[SECTION_DESIGN_STYLE_ATTRS.COLUMN_LAYOUT]).toBe(100000003);
    expect(payload[SECTION_DESIGN_STYLE_ATTRS.CARD_STYLE]).toBe(100000002);
    expect(payload[SECTION_DESIGN_STYLE_ATTRS.COLLAPSIBLE_STYLE]).toBe(100000002);
    expect(payload[SECTION_DESIGN_STYLE_ATTRS.VISIBILITY_ANIMATION]).toBe(100000002);
    expect(payload[SECTION_DESIGN_STYLE_ATTRS.CSS_CLASS]).toBe('qdb-promo');
    expect(payload[SECTION_DESIGN_STYLE_ATTRS.HEADER_STYLE_JSON]).toBe('{"fontWeight":"bold"}');
  });

  it('get_readsPicklistCodes_cssClass_and_headerStyle', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{
        [SECTION_DESIGN_ATTRS.ID]: 'sec-1',
        [SECTION_DESIGN_ATTRS.SECTION_ID]: 's1',
        [SECTION_DESIGN_STYLE_ATTRS.COLUMN_LAYOUT]: 100000002,
        [SECTION_DESIGN_STYLE_ATTRS.CARD_STYLE]: 100000003,
        [SECTION_DESIGN_STYLE_ATTRS.COLLAPSIBLE_STYLE]: 100000001,
        [SECTION_DESIGN_STYLE_ATTRS.VISIBILITY_ANIMATION]: 100000003,
        [SECTION_DESIGN_STYLE_ATTRS.CSS_CLASS]: 'qdb-promo',
        [SECTION_DESIGN_STYLE_ATTRS.HEADER_STYLE_JSON]: '{"fontWeight":"bold"}',
      }],
    });
    const [sec] = await repo.getSectionDesigns('fd1');
    expect(sec.columnLayout).toBe(2);
    expect(sec.cardStyle).toBe('Outlined');
    expect(sec.collapsibleStyle).toBe('None'); // 100000001, not 100000000
    expect(sec.visibilityAnimation).toBe('Slide');
    expect(sec.cssClassName).toBe('qdb-promo');
    expect(sec.headerStyle).toEqual({ fontWeight: 'bold' }); // NEW-001: was dropped on read
  });

  it('get_headerStyle_isUndefined_whenAbsentOrMalformed', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{
        [SECTION_DESIGN_ATTRS.ID]: 'sec-1',
        [SECTION_DESIGN_ATTRS.SECTION_ID]: 's1',
        [SECTION_DESIGN_STYLE_ATTRS.HEADER_STYLE_JSON]: 'not-json',
      }],
    });
    const [sec] = await repo.getSectionDesigns('fd1');
    expect(sec.headerStyle).toBeUndefined();
    expect(sec.collapsibleStyle).toBe('None'); // default when picklist absent
  });
});
