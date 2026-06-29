import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeDesignRepository } from '@/services/ThemeDesignRepository';
import { THEME_STYLE_ATTRS } from '@/constants/styleAttributeNames';
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

describe('ThemeDesignRepository shadow/spacing picklist round-trip', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let repo: ThemeDesignRepository;

  beforeEach(() => {
    webApi = buildMockWebApi();
    repo = new ThemeDesignRepository(webApi);
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'thm-1', entityType: 'qdb_theme' });
  });

  it('upsert_writesShadowAndSpacingPicklistCodes', async () => {
    await repo.upsertTheme({
      name: 'Brand', themeCode: 'brand', primaryColor: '#003366',
      shadowStyle: 'Subtle', spacingScale: 'Comfortable',
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[THEME_STYLE_ATTRS.SHADOW_STYLE]).toBe(100000002);
    expect(payload[THEME_STYLE_ATTRS.SPACING_SCALE]).toBe(100000003);
  });

  it('upsert_writesNull_whenShadowSpacingOmitted', async () => {
    await repo.upsertTheme({ name: 'Plain', themeCode: 'plain', primaryColor: '#000000' });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[THEME_STYLE_ATTRS.SHADOW_STYLE]).toBeNull();
    expect(payload[THEME_STYLE_ATTRS.SPACING_SCALE]).toBeNull();
  });

  it('get_readsCodesBackToTypedValues_andUndefinedWhenAbsent', async () => {
    vi.mocked(webApi.retrieveRecord).mockResolvedValueOnce({
      [THEME_STYLE_ATTRS.SHADOW_STYLE]: 100000003,
      [THEME_STYLE_ATTRS.SPACING_SCALE]: 100000001,
    });
    const theme = await repo.getTheme('thm-1');
    expect(theme.shadowStyle).toBe('Strong');
    expect(theme.spacingScale).toBe('Compact');

    vi.mocked(webApi.retrieveRecord).mockResolvedValueOnce({});
    const bare = await repo.getTheme('thm-2');
    expect(bare.shadowStyle).toBeUndefined();
    expect(bare.spacingScale).toBeUndefined();
  });
});
