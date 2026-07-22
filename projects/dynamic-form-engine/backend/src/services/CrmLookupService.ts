import type { LookupResult, LookupDisplayColumn } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import type { CrmAuthService } from './CrmAuthService.js';

// DFE-LKPCOL-001 — the source attribute for a column, resolved for the current language.
function effectiveAttribute(column: LookupDisplayColumn, lang?: string): string {
  return lang === 'ar' && column.arabicAttribute ? column.arabicAttribute : column.attribute;
}

interface ODataCollection<T> {
  value: T[];
}

// Not every entity has a `statecode` column. systemuser/team are active-by-default
// system entities that use `isdisabled`; entities without any active flag get none.
const ACTIVE_RECORD_FILTER: Record<string, string | null> = {
  systemuser: 'isdisabled eq false',
  team: null,
};

function activeRecordFilter(entityLogicalName: string): string | null {
  return entityLogicalName in ACTIVE_RECORD_FILTER
    ? ACTIVE_RECORD_FILTER[entityLogicalName]
    : 'statecode eq 0';
}

export class CrmLookupService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async searchLookup(params: {
    entityLogicalName: string;
    displayAttribute: string;
    valueAttribute?: string;
    searchTerm?: string;
    filterExpression?: string;
    maxResults: number;
    displayColumns?: LookupDisplayColumn[];
    lang?: string;
  }): Promise<LookupResult[]> {
    const {
      entityLogicalName,
      displayAttribute,
      searchTerm,
      filterExpression,
      maxResults,
      displayColumns,
      lang,
    } = params;
    const valueAttribute = params.valueAttribute ?? `${entityLogicalName}id`;

    // Multi-column: the first column is the primary (drives search/order + displayName);
    // every column also contributes to additionalAttributes. Falls back to the single
    // displayAttribute when no columns are configured (backward compatible).
    const columns = displayColumns && displayColumns.length > 0 ? displayColumns : undefined;
    const primaryAttribute = columns ? effectiveAttribute(columns[0], lang) : displayAttribute;
    const selectAttributes = new Set<string>([valueAttribute, primaryAttribute]);
    if (columns) for (const c of columns) selectAttributes.add(effectiveAttribute(c, lang));

    const filters: string[] = [];
    const activeFilter = activeRecordFilter(entityLogicalName);
    if (activeFilter) filters.push(activeFilter);
    if (searchTerm) {
      filters.push(`contains(${primaryAttribute},'${searchTerm.replace(/'/g, "''")}')`);
    }
    if (filterExpression) filters.push(filterExpression);

    const query = [
      `$select=${[...selectAttributes].join(',')}`,
      filters.length > 0 ? `$filter=${filters.join(' and ')}` : null,
      `$top=${maxResults}`,
      `$orderby=${primaryAttribute} asc`,
    ].filter(Boolean).join('&');

    const response = await this.crmFetch<ODataCollection<Record<string, unknown>>>(
      `/${entityLogicalName}s?${query}`,
    );

    return response.value.map((record) => {
      const result: LookupResult = {
        id: String(record[valueAttribute] ?? record[`${entityLogicalName}id`] ?? ''),
        displayName: String(record[primaryAttribute] ?? ''),
        entityLogicalName,
      };
      if (columns) {
        // Key by the column's base attribute so the frontend (which has the config) can pair
        // each configured column with its language-resolved value.
        const additional: Record<string, unknown> = {};
        for (const c of columns) additional[c.attribute] = record[effectiveAttribute(c, lang)] ?? '';
        result.additionalAttributes = additional;
      }
      return result;
    });
  }
}
