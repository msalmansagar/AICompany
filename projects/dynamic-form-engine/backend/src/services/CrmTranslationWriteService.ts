import { CrmBaseService } from './CrmBaseService.js';
import type { CrmAuthService } from './CrmAuthService.js';

export interface UpsertTranslationDto {
  entityName: string;
  recordId: string;
  fieldName: string;
  languageCode: string;
  value: string;
}

export interface SavedTranslation {
  translationId: string;
  entityName: string;
  recordId: string;
  fieldName: string;
  languageCode: string;
  value: string;
}

interface RawTranslationRecord {
  qdb_translationid: string;
  qdb_entity_name: string;
  qdb_record_id: string;
  qdb_field_name: string;
  qdb_language_code: string;
  qdb_translated_value: string;
}

interface ODataCollection<T> {
  value: T[];
}

export class CrmTranslationWriteService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async upsertTranslation(dto: UpsertTranslationDto): Promise<SavedTranslation> {
    const altKey = buildAlternateKey(dto);
    const raw = await this.crmFetch<RawTranslationRecord>(
      `/qdb_translations(${altKey})`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          qdb_translated_value: dto.value,
          qdb_is_active: true,
        }),
      },
    );
    return mapRawTranslation(raw);
  }

  async deleteTranslation(translationId: string): Promise<void> {
    await this.crmFetch<void>(`/qdb_translations(${translationId})`, { method: 'DELETE' });
  }

  async fetchTranslationsForRecord(
    entityName: string,
    recordId: string,
  ): Promise<SavedTranslation[]> {
    const safeEntity = entityName.replace(/'/g, "''");
    const safeRecord = recordId.replace(/'/g, "''");
    const filter =
      `qdb_entity_name eq '${safeEntity}' and qdb_record_id eq '${safeRecord}' and qdb_is_active eq true`;
    const select =
      'qdb_translationid,qdb_entity_name,qdb_record_id,qdb_field_name,qdb_language_code,qdb_translated_value';

    const response = await this.crmFetch<ODataCollection<RawTranslationRecord>>(
      `/qdb_translations?$filter=${encodeURIComponent(filter)}&$select=${select}`,
    );

    return response.value.map(mapRawTranslation);
  }
}

function buildAlternateKey(dto: UpsertTranslationDto): string {
  const e = dto.entityName.replace(/'/g, "''");
  const r = dto.recordId.replace(/'/g, "''");
  const f = dto.fieldName.replace(/'/g, "''");
  const l = dto.languageCode.replace(/'/g, "''");
  return `qdb_entity_name='${e}',qdb_record_id='${r}',qdb_field_name='${f}',qdb_language_code='${l}'`;
}

function mapRawTranslation(raw: RawTranslationRecord): SavedTranslation {
  return {
    translationId: raw.qdb_translationid,
    entityName: raw.qdb_entity_name,
    recordId: raw.qdb_record_id,
    fieldName: raw.qdb_field_name,
    languageCode: raw.qdb_language_code,
    value: raw.qdb_translated_value,
  };
}
