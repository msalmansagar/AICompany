import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { TranslationMap, TranslationMapKey } from '@qdb/shared';

const BATCH_SIZE = 200;

interface RawTranslation {
  qdb_entity_name: string;
  qdb_record_id: string;
  qdb_field_name: string;
  qdb_translated_value: string;
}

interface ODataCollection<T> {
  value: T[];
}

export class CrmTranslationQueryService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async fetchTranslationMap(
    recordIds: Set<string>,
    languageCode: string,
    correlationId: string,
  ): Promise<TranslationMap> {
    if (recordIds.size === 0) return new Map();

    const safeLocale = languageCode.replace(/'/g, "''");
    const batches = chunkSet(recordIds, BATCH_SIZE);

    try {
      const results = await Promise.all(
        batches.map((batch) => this.fetchBatch(batch, safeLocale)),
      );
      return buildTranslationMap(results.flat());
    } catch (error) {
      logger.error(
        { error, correlationId, languageCode, operation: 'fetchTranslationMap' },
        'Translation query failed — returning empty map (English fallback applies)',
      );
      return new Map();
    }
  }

  private async fetchBatch(
    batchIds: string[],
    safeLocale: string,
  ): Promise<RawTranslation[]> {
    const idFilter = batchIds
      .map((id) => `qdb_record_id eq '${id}'`)
      .join(' or ');

    const response = await this.crmFetch<ODataCollection<RawTranslation>>(
      `/qdb_translations?$filter=qdb_language_code eq '${safeLocale}' and qdb_is_active eq true and (${idFilter})` +
      `&$select=qdb_entity_name,qdb_record_id,qdb_field_name,qdb_translated_value`,
    );

    return response.value;
  }
}

function chunkSet(set: Set<string>, size: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const id of set) {
    current.push(id);
    if (current.length === size) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function buildTranslationMap(rows: RawTranslation[]): TranslationMap {
  const map: TranslationMap = new Map();
  for (const row of rows) {
    const key: TranslationMapKey = `${row.qdb_entity_name}:${row.qdb_record_id}:${row.qdb_field_name}`;
    map.set(key, row.qdb_translated_value);
  }
  return map;
}
