import { LRUCache } from 'lru-cache';
import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';
import { CrmApiError, NotFoundError, ValidationError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

// ── Types ──────────────────────────────────────────────────────

export interface GridColumnConfig {
  columnId: string;
  displayOrder: number;
  columnLabel: string;
  targetAttribute: string;
  columnFieldType: string;
}

export interface GridFieldConfig {
  fieldId: string;
  targetEntity: string;
  savedViewId: string;
  selectionMode: 'single' | 'multi';
  maxRows: number;
  columnConfigs: GridColumnConfig[];
  filterExpression?: string;        // static OData $filter appended to every query
  dependsOnFilterTemplate?: string; // template — {dependsOnValue} replaced at request time
}

export interface GridRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface GridRecordPage {
  records: GridRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isCapped: boolean;
}

interface ODataCollection<T> {
  value: T[];
  '@odata.count'?: number;
}

interface RawGridField {
  qdb_form_fieldid: string;
  qdb_grid_entity_name?: string;
  qdb_saved_view_id?: string;
  qdb_selection_mode?: number;
  qdb_grid_max_rows?: number;
  qdb_grid_filter_expression?: string;
  qdb_grid_depends_on_filter_template?: string;
}

interface RawGridColumnConfig {
  qdb_grid_column_configid: string;
  qdb_display_order: number;
  qdb_column_label: string;
  qdb_column_attribute: string;
  qdb_column_field_type: string;
  qdb_column_options_json?: string;
}

interface RawSavedQuery {
  fetchxml?: string;
  querytype?: number;
}

// View querytype: 0 = System View (savedquery). User views live in userquery entity.
// CEO condition BC-011: only System Views permitted.
const SYSTEM_VIEW_QUERY_TYPE = 0;

export class CrmGridDataService extends CrmBaseService {
  // 24-hour LRU cache for saved View fetchxml — reuses the existing cache pattern.
  private readonly viewCache: LRUCache<string, string>;

  constructor(
    authService: CrmAuthService,
    private readonly metadataCache: LRUCache<string, unknown>,
  ) {
    super(authService);
    this.viewCache = new LRUCache<string, string>({
      max: 200,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  async fetchGridRecords(
    fieldId: string,
    page: number,
    pageSize: number,
    correlationId: string,
    dependsOnValue?: string,
  ): Promise<GridRecordPage> {
    const fieldConfig = await this.resolveFieldConfig(fieldId, correlationId);
    const fetchXml = await this.resolveViewFetchXml(fieldConfig.savedViewId, correlationId);

    const columns = fieldConfig.columnConfigs.map((c) => c.targetAttribute);
    const skip = (page - 1) * pageSize;
    const effectiveTop = Math.min(pageSize, fieldConfig.maxRows - skip);

    if (effectiveTop <= 0) {
      return buildEmptyPage(page, pageSize, fieldConfig.maxRows);
    }

    const selectClause = columns.join(',');
    // Execute using OData with fetchxml parameter — Dataverse supports this for saved views.
    const url = buildGridQueryUrl(
      fieldConfig.targetEntity,
      fieldConfig.savedViewId,
      selectClause,
      effectiveTop,
      skip,
      fieldConfig.filterExpression,
      fieldConfig.dependsOnFilterTemplate,
      dependsOnValue,
    );

    const startMs = Date.now();
    const response = await this.crmFetch<ODataCollection<Record<string, unknown>>>(url);
    const latencyMs = Date.now() - startMs;

    const rawRecords = response.value;
    const rawCount = response['@odata.count'] ?? rawRecords.length;

    // Apply the max-rows cap. If the view returns more than maxRows, cap it.
    const isCapped = rawCount > fieldConfig.maxRows;
    const totalCount = isCapped ? fieldConfig.maxRows : rawCount;
    const totalPages = Math.ceil(totalCount / pageSize);

    const records = rawRecords.map((raw) => {
      const entityIdAttr = `${fieldConfig.targetEntity}id`;
      const id = (raw[entityIdAttr] as string | undefined) ?? (raw['id'] as string | undefined) ?? '';
      const values = buildRestrictedValues(raw, columns);
      return { id, values };
    });

    logger.info(
      {
        correlationId,
        fieldId,
        page,
        pageSize,
        recordCount: records.length,
        latencyMs,
        isCapped,
        operation: 'fetchGridRecords',
      },
      'selection_grid_load',
    );

    return { records, totalCount, page, pageSize, totalPages, isCapped };
  }

  async resolveFieldConfig(
    fieldId: string,
    correlationId: string,
  ): Promise<GridFieldConfig> {
    const cacheKey = `grid-field-config:${fieldId}`;
    const cached = this.metadataCache.get(cacheKey) as GridFieldConfig | undefined;
    if (cached) return cached;

    const [fieldResponse, columnsResponse] = await Promise.all([
      this.crmFetch<ODataCollection<RawGridField>>(
        `/qdb_form_fields?$filter=qdb_form_fieldid eq '${fieldId}'&$top=1` +
        `&$select=qdb_form_fieldid,qdb_grid_entity_name,qdb_saved_view_id,qdb_selection_mode,qdb_grid_max_rows` +
        `,qdb_grid_filter_expression,qdb_grid_depends_on_filter_template`,
      ),
      this.crmFetch<ODataCollection<RawGridColumnConfig>>(
        `/qdb_grid_column_configs?$filter=_qdb_form_field_id_value eq '${fieldId}' and qdb_is_visible eq true&$orderby=qdb_display_order asc`,
      ),
    ]);

    const rawField = fieldResponse.value[0];
    if (!rawField) {
      throw new NotFoundError(`Grid field '${fieldId}'`);
    }

    assertGridFieldHasView(rawField, fieldId);

    const fieldConfig: GridFieldConfig = {
      fieldId: rawField.qdb_form_fieldid,
      targetEntity: rawField.qdb_grid_entity_name!,
      savedViewId: rawField.qdb_saved_view_id!,
      selectionMode: rawField.qdb_selection_mode === 100000001 ? 'multi' : 'single',
      maxRows: rawField.qdb_grid_max_rows ?? 200,
      filterExpression: rawField.qdb_grid_filter_expression ?? undefined,
      dependsOnFilterTemplate: rawField.qdb_grid_depends_on_filter_template ?? undefined,
      columnConfigs: columnsResponse.value.map((c) => ({
        columnId: c.qdb_grid_column_configid,
        displayOrder: c.qdb_display_order,
        columnLabel: c.qdb_column_label,
        targetAttribute: c.qdb_column_attribute,
        columnFieldType: c.qdb_column_field_type,
        options: parseGridColumnOptions(c.qdb_column_options_json),
      })),
    };

    this.metadataCache.set(cacheKey, fieldConfig as unknown);
    logger.info(
      { correlationId, fieldId, operation: 'resolveFieldConfig' },
      'Grid field config resolved and cached',
    );

    return fieldConfig;
  }

  private async resolveViewFetchXml(
    viewId: string,
    correlationId: string,
  ): Promise<string> {
    const cached = this.viewCache.get(viewId);
    if (cached) return cached;

    // CEO condition BC-011: verify this is a System View, not a User View.
    // System Views are in savedquery entity; User Views are in userquery entity.
    let rawView: RawSavedQuery;
    try {
      rawView = await this.crmFetch<RawSavedQuery>(
        `/savedqueries(${viewId})?$select=fetchxml,querytype`,
      );
    } catch (error) {
      if (error instanceof CrmApiError && error.crmStatusCode === 404) {
        // CEO condition BC-004: View not found must return user-facing 400, not 502.
        throw new ValidationError(
          `The configured grid view (${viewId}) was not found. Please contact your administrator.`,
        );
      }
      throw error;
    }

    if (!rawView.fetchxml) {
      throw new ValidationError(
        `The configured grid view (${viewId}) has no query definition. Please contact your administrator.`,
      );
    }

    // CEO condition BC-011: reject if querytype is not a system view.
    if (rawView.querytype !== undefined && rawView.querytype !== SYSTEM_VIEW_QUERY_TYPE) {
      throw new ValidationError(
        'Only System Views are permitted for Selection Grid configuration. User Views are not allowed.',
      );
    }

    logger.info(
      { correlationId, viewId, operation: 'resolveViewFetchXml' },
      'Saved view fetchxml resolved and cached for 24h',
    );

    this.viewCache.set(viewId, rawView.fetchxml);
    return rawView.fetchxml;
  }
}

// ── Private helpers ────────────────────────────────────────────

function assertGridFieldHasView(field: RawGridField, fieldId: string): void {
  if (!field.qdb_grid_entity_name) {
    throw new ValidationError(
      `Grid field '${fieldId}' has no target entity configured.`,
    );
  }
  if (!field.qdb_saved_view_id) {
    throw new ValidationError(
      `Grid field '${fieldId}' has no saved view configured.`,
    );
  }
}

function buildGridQueryUrl(
  entity: string,
  savedQueryId: string,
  selectClause: string,
  top: number,
  skip: number,
  filterExpression?: string,
  dependsOnFilterTemplate?: string,
  dependsOnValue?: string,
): string {
  const filters: string[] = ['statecode eq 0'];

  if (filterExpression) {
    filters.push(`(${filterExpression})`);
  }

  if (dependsOnFilterTemplate && dependsOnValue !== undefined && dependsOnValue !== '') {
    const safeValue = sanitizeODataValue(dependsOnValue);
    filters.push(`(${dependsOnFilterTemplate.replace('{dependsOnValue}', safeValue)})`);
  }

  const params = new URLSearchParams({
    savedQuery: savedQueryId,
    $select: selectClause,
    $top: String(top),
    $count: 'true',
    $filter: filters.join(' and '),
  });
  if (skip > 0) params.set('$skip', String(skip));
  return `/${entity}s?${params.toString()}`;
}

// Escapes a user-supplied value before substituting into an OData filter string.
// Single quotes are doubled (OData escaping), and length is capped at 200 chars.
function sanitizeODataValue(value: string): string {
  return value.slice(0, 200).replace(/'/g, "''");
}

const ODATA_ANNOTATION_SUFFIX = '@OData.Community.Display.V1.FormattedValue';

function buildRestrictedValues(
  raw: Record<string, unknown>,
  allowedColumns: string[],
): Record<string, unknown> {
  const columnSet = new Set(allowedColumns);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    // Always include plain column values
    if (columnSet.has(key)) {
      result[key] = value;
      continue;
    }
    // Also include formatted-value annotations for picklist/lookup columns
    if (key.endsWith(ODATA_ANNOTATION_SUFFIX)) {
      const baseKey = key.slice(0, -ODATA_ANNOTATION_SUFFIX.length);
      if (columnSet.has(baseKey)) {
        result[key] = value;
      }
    }
  }
  return result;
}

function buildEmptyPage(page: number, pageSize: number, totalCount: number): GridRecordPage {
  return {
    records: [],
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
    isCapped: true,
  };
}

function parseGridColumnOptions(json: string | null | undefined): Array<{ value: string; label: string }> | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<{ value: string; label: string }>) : undefined;
  } catch {
    return undefined;
  }
}
