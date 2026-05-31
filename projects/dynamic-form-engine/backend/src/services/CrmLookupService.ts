import type { LookupResult } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import type { CrmAuthService } from './CrmAuthService.js';

interface ODataCollection<T> {
  value: T[];
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

    const filters: string[] = ['statecode eq 0'];

    if (searchTerm) {
      filters.push(`contains(${displayAttribute},'${searchTerm.replace(/'/g, "''")}')`);
    }

    if (filterExpression) {
      filters.push(filterExpression);
    }

    const query = [
      `$select=${displayAttribute},${valueAttribute}`,
      `$filter=${filters.join(' and ')}`,
      `$top=${maxResults}`,
      `$orderby=${displayAttribute} asc`,
    ].join('&');

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
