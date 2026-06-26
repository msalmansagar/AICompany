import { gunzipSync } from 'node:zlib';
import type { FormDefinition } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { CacheMissError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { IRenderCacheStore } from './RenderCacheStore.js';
import type { CrmLanguageConfigService } from './CrmLanguageConfigService.js';
import { config } from '../config/env.js';

// Mirrors the SAFE_FORM_CODE_PATTERN used across the codebase.
const SAFE_FORM_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
// BCP-47 short code — same constraint as LANG_PARAM_REGEX in forms.routes.ts
const LANG_CODE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

// OData status picklist: Active = 2
const RENDER_CACHE_STATUS_ACTIVE = 2;

interface RenderCacheRecord {
  qdb_form_render_cacheid: string;
  qdb_form_code: string;
  qdb_language_code: string;
  qdb_published_version: number;
  qdb_runtime_json: string;
  qdb_is_compressed: boolean;
  qdb_json_hash?: string;
  qdb_status: number;
  qdb_is_active: boolean;
}

interface ODataCollection<T> {
  value: T[];
}

export class PublishedFormService extends CrmBaseService {
  constructor(
    authService: CrmAuthService,
    private readonly cacheStore: IRenderCacheStore,
    private readonly languageConfigService: CrmLanguageConfigService | null,
  ) {
    super(authService);
  }

  /**
   * Returns a pre-generated FormDefinition from the Dataverse render cache entity.
   * Falls back to the default language when the requested language is absent.
   * Throws CacheMissError when no active record exists.
   */
  async getPublishedJson(
    formCode: string,
    lang: string,
    version?: number,
  ): Promise<FormDefinition> {
    this.assertValidFormCode(formCode);
    this.assertValidLangCode(lang);

    const cacheKey = buildCacheKey(formCode, version, lang);
    const cached = await this.cacheStore.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as FormDefinition;
    }

    const records = await this.fetchActiveRecords(formCode);
    const record = await this.selectRecord(records, lang);

    const decoded = this.decodeRuntimeJson(record.qdb_runtime_json, record.qdb_is_compressed);

    await this.cacheStore.set(cacheKey, JSON.stringify(decoded), config.RENDER_CACHE_TTL_SECONDS);

    return decoded;
  }

  /** Decode a render-cache runtime JSON payload to a FormDefinition. */
  private decodeRuntimeJson(raw: string, isCompressed: boolean): FormDefinition {
    if (!raw || raw.trim() === '') {
      throw new CacheMissError('Render cache record has empty qdb_runtime_json');
    }

    const buffer = Buffer.from(raw, 'base64');

    if (isCompressed) {
      const decompressed = gunzipSync(buffer);
      return JSON.parse(decompressed.toString('utf8')) as FormDefinition;
    }

    return JSON.parse(buffer.toString('utf8')) as FormDefinition;
  }

  private async fetchActiveRecords(formCode: string): Promise<RenderCacheRecord[]> {
    // formCode already validated — safe for OData interpolation.
    const filter = [
      `qdb_form_code eq '${formCode}'`,
      `qdb_is_active eq true`,
      `qdb_status eq ${RENDER_CACHE_STATUS_ACTIVE}`,
    ].join(' and ');

    const select = [
      'qdb_form_render_cacheid',
      'qdb_form_code',
      'qdb_language_code',
      'qdb_published_version',
      'qdb_runtime_json',
      'qdb_is_compressed',
      'qdb_json_hash',
    ].join(',');

    const response = await this.crmFetch<ODataCollection<RenderCacheRecord>>(
      `/qdb_form_render_caches?$filter=${encodeURIComponent(filter)}&$select=${select}`,
    );

    return response.value;
  }

  private async selectRecord(
    records: RenderCacheRecord[],
    requestedLang: string,
  ): Promise<RenderCacheRecord> {
    if (records.length === 0) {
      throw new CacheMissError('No active render cache records found');
    }

    const exactMatch = records.find((r) => r.qdb_language_code === requestedLang);
    if (exactMatch) return exactMatch;

    const defaultLang = await this.resolveDefaultLanguage();

    logger.debug(
      { requestedLang, defaultLang, available: records.map((r) => r.qdb_language_code) },
      'Render cache: requested language absent — falling back to default language',
    );

    const defaultMatch = records.find((r) => r.qdb_language_code === defaultLang);
    if (defaultMatch) return defaultMatch;

    // Last resort: any record in the set.
    const fallback = records[0];
    if (fallback) {
      logger.warn(
        { requestedLang, defaultLang, usedLang: fallback.qdb_language_code },
        'Render cache: default language also absent — using first available record',
      );
      return fallback;
    }

    throw new CacheMissError(`No render cache record for form language '${requestedLang}'`);
  }

  private async resolveDefaultLanguage(): Promise<string> {
    if (!this.languageConfigService) return 'en';

    try {
      const languages = await this.languageConfigService.getSupportedLanguages();
      const defaultLang = languages.find((l) => l.isDefault);
      return defaultLang?.code ?? 'en';
    } catch (error) {
      logger.warn({ error }, 'Failed to resolve default language — using en');
      return 'en';
    }
  }

  private assertValidFormCode(formCode: string): void {
    if (!SAFE_FORM_CODE_PATTERN.test(formCode)) {
      throw new ValidationError(`Invalid form code: '${formCode}'`);
    }
  }

  private assertValidLangCode(lang: string): void {
    if (!LANG_CODE_PATTERN.test(lang)) {
      throw new ValidationError(`Invalid language code: '${lang}'`);
    }
  }
}

function buildCacheKey(formCode: string, version: number | undefined, lang: string): string {
  return `${formCode}:${version ?? 'latest'}:${lang}`;
}
