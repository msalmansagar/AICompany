import { describe, it, expect } from 'vitest';
import {
  LanguageConfigService,
  LanguageConfigError,
} from '@/services/translations/LanguageConfigService';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FakeWebApi } from './fakeWebApi';

function language(code: string, isDefault: boolean, isRtl = false): Record<string, unknown> {
  return {
    qdb_language_code: code,
    qdb_is_default: isDefault,
    qdb_rtl_direction: isRtl,
  };
}

function serviceWith(...languages: Record<string, unknown>[]): LanguageConfigService {
  return new LanguageConfigService(
    new FakeWebApi({ [ENTITY_NAMES.LANGUAGE_CONFIG]: languages }),
  );
}

describe('LanguageConfigService', () => {
  it('load_takesSourceLanguage_fromTheDefaultFlag', async () => {
    const { source } = await serviceWith(language('en', true), language('ar', false, true)).load();

    expect(source).toBe('en');
  });

  it('load_excludesTheSourceLanguage_fromTargets', async () => {
    const { targets } = await serviceWith(language('en', true), language('ar', false, true)).load();

    expect(targets.map((t) => t.code)).toEqual(['ar']);
  });

  it('load_carriesRtl_fromConfigurationNotFromTheCode', async () => {
    const { targets } = await serviceWith(language('en', true), language('he', false, true)).load();

    expect(targets[0]).toEqual({ code: 'he', isRtl: true });
  });

  it('load_dropsDuplicateCodes_keepingTheFirst', async () => {
    const { targets } = await serviceWith(
      language('en', true),
      language('ar', false, true),
      language('ar', false, false),
    ).load();

    expect(targets).toHaveLength(1);
  });

  it('load_throws_whenNoLanguageIsFlaggedDefault', async () => {
    await expect(serviceWith(language('en', false), language('ar', false)).load()).rejects.toBeInstanceOf(
      LanguageConfigError,
    );
  });

  it('load_requestsOnlyActiveLanguages_inDisplayOrder', async () => {
    const api = new FakeWebApi({ [ENTITY_NAMES.LANGUAGE_CONFIG]: [language('en', true)] });

    await new LanguageConfigService(api).load();

    const options = decodeURIComponent(api.requestsFor(ENTITY_NAMES.LANGUAGE_CONFIG)[0].options ?? '');
    expect(options).toContain('qdb_is_active eq true');
    expect(options).toContain('qdb_display_order asc');
  });

  it('load_propagatesFailure_ratherThanFallingBackToEnglish', async () => {
    const api = new FakeWebApi({}, { [ENTITY_NAMES.LANGUAGE_CONFIG]: new Error('403 Forbidden') });

    await expect(new LanguageConfigService(api).load()).rejects.toThrow('403 Forbidden');
  });
});
