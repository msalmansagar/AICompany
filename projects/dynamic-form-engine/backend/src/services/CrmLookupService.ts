import type { LookupResult, LookupDisplayColumn } from '@qdb/shared';
import type { CrmAuthService } from './CrmAuthService.js';
import { config } from '../config/env.js';
import {
  CrmLookupService as GlobalLookupService,
} from '../global/dataverse-lookup/node/CrmLookupService.js';
import type {
  EntityLookupQuery,
  LookupColumn,
  LookupOption,
} from '../global/dataverse-lookup/contract.js';

/**
 * DFE lookup service — a thin adapter over the shared @mss/dataverse-lookup
 * package (vendored under ../global, see GLOBAL-VERSION). The public API
 * (constructor + searchLookup) is unchanged, so route consumers are untouched.
 *
 * The adapter maps DFE's @qdb/shared shapes to the canonical contract and back;
 * multi-column, language-aware search and active-record filtering now live in
 * the shared package (its default active-record policy matches DFE's exactly:
 * statecode for most, isdisabled for systemuser, none for team).
 */
export class CrmLookupService {
  private readonly lookup: GlobalLookupService;

  constructor(authService: CrmAuthService) {
    // CrmAuthService already exposes getAccessToken() — it IS a TokenProvider.
    // A generous ceiling preserves the pre-migration behaviour of honouring the
    // caller's maxResults without an unexpected cap.
    this.lookup = new GlobalLookupService({
      dataverseUrl: config.DATAVERSE_URL,
      tokenProvider: authService,
      maxResultsCeiling: 5000,
    });
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
    const query: EntityLookupQuery = {
      entity: params.entityLogicalName,
      displayAttribute: params.displayAttribute,
      valueAttribute: params.valueAttribute,
      searchTerm: params.searchTerm,
      filter: params.filterExpression,
      maxResults: params.maxResults,
      columns: params.displayColumns?.map(toLookupColumn),
      language: params.lang,
    };

    const options = await this.lookup.searchEntity(query);
    return options.map((option) => toLookupResult(option, params.entityLogicalName));
  }
}

/** DFE column (arabicAttribute) → canonical column (localizedAttributes.ar). */
function toLookupColumn(column: LookupDisplayColumn): LookupColumn {
  return column.arabicAttribute
    ? { attribute: column.attribute, localizedAttributes: { ar: column.arabicAttribute } }
    : { attribute: column.attribute };
}

/** Canonical option → DFE @qdb/shared LookupResult. */
function toLookupResult(option: LookupOption, entityLogicalName: string): LookupResult {
  const result: LookupResult = {
    id: option.id,
    displayName: option.label,
    entityLogicalName,
  };
  if (option.columns) result.additionalAttributes = option.columns;
  return result;
}
