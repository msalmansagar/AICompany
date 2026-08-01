// Languages for a translation export, read from qdb_language_config.
//
// Not wrapped in a fallback. TranslationsPanel falls back to English-only when this query
// fails, which is right for a panel — the designer stays usable. An export is different: a
// workbook silently missing a language sends a translator away with nothing to fill in and no
// way to tell. Failing here is the honest outcome.
//
// The source language is the one flagged default in the org, not a hardcoded 'en'.

import type { IWebApiAdapter, WebApiRecord } from '../IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { LANGUAGE_CONFIG_ATTRS } from '@/constants/attributeNames';

export interface ExportLanguage {
  readonly code: string;
  /** From qdb_rtl_direction. Which languages read right to left is configuration, not a guess. */
  readonly isRtl: boolean;
}

export interface ExportLanguages {
  /** The language the form is authored in — the "Source" column. */
  readonly source: string;
  /** Everything else active, in display order. One workbook column each. */
  readonly targets: readonly ExportLanguage[];
}

export class LanguageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LanguageConfigError';
  }
}

const LANGUAGE_SELECT = [
  LANGUAGE_CONFIG_ATTRS.LANGUAGE_CODE,
  LANGUAGE_CONFIG_ATTRS.RTL_DIRECTION,
  LANGUAGE_CONFIG_ATTRS.IS_DEFAULT,
  LANGUAGE_CONFIG_ATTRS.DISPLAY_ORDER,
].join(',');

export class LanguageConfigService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async load(): Promise<ExportLanguages> {
    const active = await this.readActive();
    const source = active.find((language) => language.isDefault);

    if (!source) {
      throw new LanguageConfigError(
        'No active language is flagged as default, so the export cannot tell which column is the source.',
      );
    }

    return { source: source.code, targets: dedupe(active, source.code) };
  }

  private async readActive(): Promise<readonly ConfiguredLanguage[]> {
    const filter = encodeURIComponent(`${LANGUAGE_CONFIG_ATTRS.IS_ACTIVE} eq true`);
    const orderBy = encodeURIComponent(`${LANGUAGE_CONFIG_ATTRS.DISPLAY_ORDER} asc`);

    const result = await this.webApi.retrieveMultipleRecords(
      ENTITY_NAMES.LANGUAGE_CONFIG,
      `?$select=${LANGUAGE_SELECT}&$filter=${filter}&$orderby=${orderBy}`,
    );

    return result.entities.map(toConfiguredLanguage).filter((language) => language.code !== '');
  }
}

interface ConfiguredLanguage extends ExportLanguage {
  readonly isDefault: boolean;
}

function toConfiguredLanguage(raw: WebApiRecord): ConfiguredLanguage {
  return {
    code: String(raw[LANGUAGE_CONFIG_ATTRS.LANGUAGE_CODE] ?? '').trim(),
    isRtl: Boolean(raw[LANGUAGE_CONFIG_ATTRS.RTL_DIRECTION] ?? false),
    isDefault: Boolean(raw[LANGUAGE_CONFIG_ATTRS.IS_DEFAULT] ?? false),
  };
}

function dedupe(
  languages: readonly ConfiguredLanguage[],
  sourceCode: string,
): readonly ExportLanguage[] {
  const seen = new Set<string>([sourceCode.toLowerCase()]);
  const targets: ExportLanguage[] = [];

  for (const { code, isRtl } of languages) {
    if (seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    targets.push({ code, isRtl });
  }

  return targets;
}
