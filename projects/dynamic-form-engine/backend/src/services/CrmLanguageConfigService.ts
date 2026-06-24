import { LRUCache } from 'lru-cache';
import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { LanguageConfig } from '@qdb/shared';

const CACHE_KEY = 'language-config';

interface RawLanguageConfig {
  qdb_language_configid: string;
  qdb_language_code: string;
  qdb_display_name: string;
  qdb_display_name_native?: string;
  qdb_lcid?: number;
  qdb_is_default?: boolean;
  qdb_rtl_direction?: boolean;
  qdb_display_order?: number;
  qdb_is_active?: boolean;
}

interface ODataCollection<T> {
  value: T[];
}

export class CrmLanguageConfigService extends CrmBaseService {
  constructor(
    authService: CrmAuthService,
    private readonly cache: LRUCache<string, LanguageConfig[]>,
  ) {
    super(authService);
  }

  async getSupportedLanguages(): Promise<LanguageConfig[]> {
    const cached = this.cache.get(CACHE_KEY);
    if (cached) return cached;

    const languages = await this.fetchFromDataverse();
    this.cache.set(CACHE_KEY, languages);
    return languages;
  }

  async isLanguageCodeSupported(code: string): Promise<boolean> {
    if (code === 'en') return true; // always valid for bootstrap resilience
    const languages = await this.getSupportedLanguages();
    return languages.some((l) => l.code === code);
  }

  async getLcidForLanguageCode(code: string): Promise<number | undefined> {
    const languages = await this.getSupportedLanguages();
    return languages.find((l) => l.code === code)?.lcid;
  }

  invalidateCache(): void {
    this.cache.delete(CACHE_KEY);
  }

  private async fetchFromDataverse(): Promise<LanguageConfig[]> {
    try {
      const response = await this.crmFetch<ODataCollection<RawLanguageConfig>>(
        `/qdb_language_configs?$filter=qdb_is_active eq true&$orderby=qdb_display_order asc`,
      );
      return response.value.map(mapLanguageConfig);
    } catch (error) {
      logger.error(
        { error, operation: 'fetchLanguageConfigs' },
        'Failed to fetch language configs — returning English-only fallback',
      );
      return [englishFallback()];
    }
  }
}

function mapLanguageConfig(raw: RawLanguageConfig): LanguageConfig {
  return {
    code: raw.qdb_language_code,
    displayName: raw.qdb_display_name,
    displayNameNative: raw.qdb_display_name_native,
    lcid: raw.qdb_lcid,
    isDefault: raw.qdb_is_default ?? false,
    isRtl: raw.qdb_rtl_direction ?? false,
    displayOrder: raw.qdb_display_order ?? 99,
  };
}

function englishFallback(): LanguageConfig {
  return { code: 'en', displayName: 'English', isDefault: true, isRtl: false, displayOrder: 1, lcid: 1033 };
}
