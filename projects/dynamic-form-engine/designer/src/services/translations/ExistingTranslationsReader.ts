// Translations already stored for a set of records, keyed the same way the round trip keys them.
//
// Reads qdb_source_value alongside the value: it is the English the translation was made from,
// and without it the export cannot tell a translation that is still current from one whose
// source has moved on.

import type { IWebApiAdapter, WebApiRecord } from '../IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { TRANSLATION_ATTRS } from '@/constants/attributeNames';
import { translationKey } from './translatableSpec';

/** Dataverse rejects a filter built from too many ids at once, so records are read in batches. */
const RECORDS_PER_REQUEST = 20;

export interface ExistingTranslation {
  readonly value: string;
  /** Empty when the row predates source snapshots — it cannot be compared, only reported. */
  readonly sourceSnapshot: string;
}

const TRANSLATION_SELECT = [
  TRANSLATION_ATTRS.ENTITY_NAME,
  TRANSLATION_ATTRS.RECORD_ID,
  TRANSLATION_ATTRS.FIELD_NAME,
  TRANSLATION_ATTRS.LANGUAGE_CODE,
  TRANSLATION_ATTRS.TRANSLATED_VALUE,
  TRANSLATION_ATTRS.SOURCE_VALUE,
].join(',');

export class ExistingTranslationsReader {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async forRecords(recordIds: readonly string[]): Promise<Map<string, ExistingTranslation>> {
    const found = new Map<string, ExistingTranslation>();

    for (const batch of chunk([...new Set(recordIds)], RECORDS_PER_REQUEST)) {
      for (const raw of await this.readBatch(batch)) {
        addTo(found, raw);
      }
    }

    return found;
  }

  private async readBatch(recordIds: readonly string[]): Promise<readonly WebApiRecord[]> {
    const filter = recordIds
      .map((id) => `${TRANSLATION_ATTRS.RECORD_ID} eq '${id.replace(/'/g, "''")}'`)
      .join(' or ');

    const result = await this.webApi.retrieveMultipleRecords(
      ENTITY_NAMES.TRANSLATION,
      `?$select=${TRANSLATION_SELECT}&$filter=${encodeURIComponent(filter)}`,
    );
    return result.entities;
  }
}

function addTo(found: Map<string, ExistingTranslation>, raw: WebApiRecord): void {
  const key = translationKey(
    String(raw[TRANSLATION_ATTRS.ENTITY_NAME] ?? ''),
    String(raw[TRANSLATION_ATTRS.RECORD_ID] ?? ''),
    String(raw[TRANSLATION_ATTRS.FIELD_NAME] ?? ''),
    String(raw[TRANSLATION_ATTRS.LANGUAGE_CODE] ?? ''),
  );

  found.set(key, {
    value: String(raw[TRANSLATION_ATTRS.TRANSLATED_VALUE] ?? ''),
    sourceSnapshot: String(raw[TRANSLATION_ATTRS.SOURCE_VALUE] ?? ''),
  });
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}
