import type { LookupResult } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import type { CrmAuthService } from './CrmAuthService.js';

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
  }): Promise<LookupResult[]> {
    const {
      entityLogicalName,
      displayAttribute,
      searchTerm,
      filterExpression,
      maxResults,
    } = params;
    const valueAttribute = params.valueAttribute ?? `${entityLogicalName}id`;

    const filters: string[] = [];
    const activeFilter = activeRecordFilter(entityLogicalName);
    if (activeFilter) filters.push(activeFilter);

    if (searchTerm) {
      filters.push(`contains(${displayAttribute},'${searchTerm.replace(/'/g, "''")}')`);
    }

    if (filterExpression) {
      filters.push(filterExpression);
    }

    const query = [
      `$select=${displayAttribute},${valueAttribute}`,
      filters.length > 0 ? `$filter=${filters.join(' and ')}` : null,
      `$top=${maxResults}`,
      `$orderby=${displayAttribute} asc`,
    ].filter(Boolean).join('&');

    const response = await this.crmFetch<ODataCollection<Record<string, unknown>>>(
      `/${entityLogicalName}s?${query}`,
    );

    return response.value.map((record) => ({
      id: String(record[valueAttribute] ?? record[`${entityLogicalName}id`] ?? ''),
      displayName: String(record[displayAttribute] ?? ''),
      entityLogicalName,
    }));
  }
}
