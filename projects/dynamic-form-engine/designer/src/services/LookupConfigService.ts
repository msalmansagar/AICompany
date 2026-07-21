import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_LOOKUP_CONFIG_ATTRS } from '@/constants/attributeNames';
import type { DesignerLookupConfig } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

export interface UpsertLookupConfigDto {
  fieldId: string;
  targetEntity: string;
  displayField: string;
  valueField: string;
  filterQuery: string | null;
  searchMinChars?: number;
  maxResults?: number;
  // DFE-APILOOKUP-001 — external-API source.
  source?: 'entity' | 'api';
  apiEndpointKey?: string | null;
  apiValuePath?: string | null;
  apiLabelPath?: string | null;
  apiSearchParamName?: string | null;
  apiSearchMode?: 'typeahead' | 'fetchAll' | null;
}

export class LookupConfigService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertLookupConfig(dto: UpsertLookupConfigDto): Promise<string> {
    const existing = await this.findExistingConfigId(dto.fieldId);
    if (existing !== null) {
      await this.updateExistingConfig(existing, dto);
      return existing;
    }
    return this.createNewConfig(dto);
  }

  async deleteLookupConfig(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_LOOKUP_CONFIG, id),
      'deleteLookupConfig'
    );
  }

  async getLookupConfigForField(fieldId: string): Promise<DesignerLookupConfig | null> {
    const select = [
      FORM_LOOKUP_CONFIG_ATTRS.TARGET_ENTITY,
      FORM_LOOKUP_CONFIG_ATTRS.DISPLAY_FIELD,
      FORM_LOOKUP_CONFIG_ATTRS.VALUE_FIELD,
      FORM_LOOKUP_CONFIG_ATTRS.FILTER_QUERY,
      FORM_LOOKUP_CONFIG_ATTRS.SEARCH_MIN_CHARS,
      FORM_LOOKUP_CONFIG_ATTRS.MAX_RESULTS,
      FORM_LOOKUP_CONFIG_ATTRS.SOURCE,
      FORM_LOOKUP_CONFIG_ATTRS.API_ENDPOINT_KEY,
      FORM_LOOKUP_CONFIG_ATTRS.API_VALUE_PATH,
      FORM_LOOKUP_CONFIG_ATTRS.API_LABEL_PATH,
      FORM_LOOKUP_CONFIG_ATTRS.API_SEARCH_PARAM,
      FORM_LOOKUP_CONFIG_ATTRS.API_SEARCH_MODE,
    ].join(',');

    const filter = `${FORM_LOOKUP_CONFIG_ATTRS.FIELD_ID_VALUE} eq ${fieldId}`;

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_LOOKUP_CONFIG,
          `?$select=${select}&$filter=${filter}&$top=1`
        ),
      'getLookupConfigForField'
    );

    if (result.entities.length === 0) return null;
    return this.mapRecordToModel(result.entities[0]);
  }

  private async findExistingConfigId(fieldId: string): Promise<string | null> {
    const filter = `${FORM_LOOKUP_CONFIG_ATTRS.FIELD_ID_VALUE} eq ${fieldId}`;
    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_LOOKUP_CONFIG,
          `?$select=${FORM_LOOKUP_CONFIG_ATTRS.ID}&$filter=${filter}&$top=1`
        ),
      'findExistingLookupConfig'
    );

    if (result.entities.length === 0) return null;
    return String(result.entities[0][FORM_LOOKUP_CONFIG_ATTRS.ID] ?? '');
  }

  private async updateExistingConfig(id: string, dto: UpsertLookupConfigDto): Promise<void> {
    const data: Record<string, unknown> = {
      [FORM_LOOKUP_CONFIG_ATTRS.TARGET_ENTITY]: dto.targetEntity,
      [FORM_LOOKUP_CONFIG_ATTRS.DISPLAY_FIELD]: dto.displayField,
      [FORM_LOOKUP_CONFIG_ATTRS.VALUE_FIELD]: dto.valueField,
      [FORM_LOOKUP_CONFIG_ATTRS.FILTER_QUERY]: dto.filterQuery,
      ...apiFieldData(dto),
    };
    if (dto.searchMinChars !== undefined) data[FORM_LOOKUP_CONFIG_ATTRS.SEARCH_MIN_CHARS] = dto.searchMinChars;
    if (dto.maxResults !== undefined) data[FORM_LOOKUP_CONFIG_ATTRS.MAX_RESULTS] = dto.maxResults;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_LOOKUP_CONFIG, id, data),
      'updateLookupConfig'
    );
  }

  private async createNewConfig(dto: UpsertLookupConfigDto): Promise<string> {
    const payload: Record<string, unknown> = {
      [`${FORM_LOOKUP_CONFIG_ATTRS.FIELD_ID}@odata.bind`]: `/qdb_form_fields(${dto.fieldId})`,
      [FORM_LOOKUP_CONFIG_ATTRS.TARGET_ENTITY]: dto.targetEntity,
      [FORM_LOOKUP_CONFIG_ATTRS.DISPLAY_FIELD]: dto.displayField,
      [FORM_LOOKUP_CONFIG_ATTRS.VALUE_FIELD]: dto.valueField,
      [FORM_LOOKUP_CONFIG_ATTRS.FILTER_QUERY]: dto.filterQuery,
      [FORM_LOOKUP_CONFIG_ATTRS.SEARCH_MIN_CHARS]: dto.searchMinChars ?? 3,
      [FORM_LOOKUP_CONFIG_ATTRS.MAX_RESULTS]: dto.maxResults ?? 10,
      ...apiFieldData(dto),
    };

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FORM_LOOKUP_CONFIG, payload),
      'createLookupConfig'
    );
    return result.id;
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerLookupConfig {
    const source = record[FORM_LOOKUP_CONFIG_ATTRS.SOURCE];
    const searchMode = record[FORM_LOOKUP_CONFIG_ATTRS.API_SEARCH_MODE];
    return {
      targetEntity: String(record[FORM_LOOKUP_CONFIG_ATTRS.TARGET_ENTITY] ?? ''),
      displayField: String(record[FORM_LOOKUP_CONFIG_ATTRS.DISPLAY_FIELD] ?? ''),
      valueField: String(record[FORM_LOOKUP_CONFIG_ATTRS.VALUE_FIELD] ?? 'id'),
      filterQuery: record[FORM_LOOKUP_CONFIG_ATTRS.FILTER_QUERY]
        ? String(record[FORM_LOOKUP_CONFIG_ATTRS.FILTER_QUERY])
        : null,
      searchMinChars: Number(record[FORM_LOOKUP_CONFIG_ATTRS.SEARCH_MIN_CHARS] ?? 3),
      maxResults: Number(record[FORM_LOOKUP_CONFIG_ATTRS.MAX_RESULTS] ?? 10),
      source: source === 'api' ? 'api' : source === 'entity' ? 'entity' : undefined,
      apiEndpointKey: nullableString(record[FORM_LOOKUP_CONFIG_ATTRS.API_ENDPOINT_KEY]),
      apiValuePath: nullableString(record[FORM_LOOKUP_CONFIG_ATTRS.API_VALUE_PATH]),
      apiLabelPath: nullableString(record[FORM_LOOKUP_CONFIG_ATTRS.API_LABEL_PATH]),
      apiSearchParamName: nullableString(record[FORM_LOOKUP_CONFIG_ATTRS.API_SEARCH_PARAM]),
      apiSearchMode: searchMode === 'typeahead' || searchMode === 'fetchAll' ? searchMode : null,
    };
  }
}

// DFE-APILOOKUP-001 — the API-source columns for a create/update payload. Always written
// (null when unset) so switching a field back to entity source clears stale API config.
function apiFieldData(dto: UpsertLookupConfigDto): Record<string, unknown> {
  const isApi = dto.source === 'api';
  return {
    [FORM_LOOKUP_CONFIG_ATTRS.SOURCE]: dto.source ?? 'entity',
    [FORM_LOOKUP_CONFIG_ATTRS.API_ENDPOINT_KEY]: isApi ? dto.apiEndpointKey ?? null : null,
    [FORM_LOOKUP_CONFIG_ATTRS.API_VALUE_PATH]: isApi ? dto.apiValuePath ?? null : null,
    [FORM_LOOKUP_CONFIG_ATTRS.API_LABEL_PATH]: isApi ? dto.apiLabelPath ?? null : null,
    [FORM_LOOKUP_CONFIG_ATTRS.API_SEARCH_PARAM]: isApi ? dto.apiSearchParamName ?? null : null,
    [FORM_LOOKUP_CONFIG_ATTRS.API_SEARCH_MODE]: isApi ? dto.apiSearchMode ?? 'typeahead' : null,
  };
}

function nullableString(value: unknown): string | null {
  return value ? String(value) : null;
}
