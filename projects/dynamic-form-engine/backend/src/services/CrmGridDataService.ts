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
  filterExpression?: string;
  dependsOnFilterTemplate?: string;
}

export interface GridRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface GridRecordPage {
  records: GridRecord[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  nextPageCookie?: string;
  isCapped: boolean;
  totalCount?: number;
  totalPages?: number;
}

interface FetchXmlCollection<T> {
  value: T[];
  '@Microsoft.Dynamics.CRM.morerecords'?: boolean;
  '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'?: string;
  '@Microsoft.Dynamics.CRM.totalrecordcount'?: number;
  '@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded'?: boolean;
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

interface BuildFetchXmlParams {
  baseXml: string;
  page: number;
  pageSize: number;
  pagingCookie: string | undefined;
  filterExpression: string | undefined;
  dependsOnFilterTemplate: string | undefined;
  dependsOnValue: string | undefined;
  searchText: string | undefined;
  searchAttributes: string[];
  sortBy: string | undefined;
  sortDirection: 'asc' | 'desc' | undefined;
}

// View querytype: 0 = System View. CEO condition BC-011: only System Views permitted.
const SYSTEM_VIEW_QUERY_TYPE = 0;

const TEXT_SEARCHABLE_FIELD_TYPES = new Set(['text', 'email', 'phone', 'textarea']);

export class CrmGridDataService extends CrmBaseService {
  private readonly viewCache: LRUCache<string, string>;

  constructor(
    authService: CrmAuthService,
    private readonly metadataCache: LRUCache<string, unknown>,
  ) {
    super(authService);
    this.viewCache = new LRUCache<string, string>({
      max: 200,
      ttl: 24 * 60 * 60 * 1000,
    });
  }

  async fetchGridRecords(
    fieldId: string,
    page: number,
    pageSize: number,
    correlationId: string,
    dependsOnValue?: string,
    pagingCookie?: string,
    searchText?: string,
    sortBy?: string,
    sortDirection?: 'asc' | 'desc',
  ): Promise<GridRecordPage> {
    const fieldConfig = await this.resolveFieldConfig(fieldId, correlationId);

    const recordsSeenSoFar = (page - 1) * pageSize;
    if (recordsSeenSoFar >= fieldConfig.maxRows) {
      return buildEmptyPage(page, pageSize);
    }

    const validatedSortBy = this.validateSortAttribute(sortBy, fieldConfig);

    const searchAttributes = resolveSearchAttributes(fieldConfig.columnConfigs);

    const baseFetchXml = await this.resolveViewFetchXml(fieldConfig.savedViewId, correlationId);

    const fetchXml = buildFetchXml({
      baseXml: baseFetchXml,
      page,
      pageSize,
      pagingCookie,
      filterExpression: fieldConfig.filterExpression,
      dependsOnFilterTemplate: fieldConfig.dependsOnFilterTemplate,
      dependsOnValue,
      searchText,
      searchAttributes,
      sortBy: validatedSortBy,
      sortDirection,
    });

    const url = `/${fieldConfig.targetEntity}s?fetchXml=${encodeURIComponent(fetchXml)}`;

    const startMs = Date.now();
    const response = await this.crmFetch<FetchXmlCollection<Record<string, unknown>>>(url);
    const latencyMs = Date.now() - startMs;

    const rawRecords = response.value;
    const hasMore = response['@Microsoft.Dynamics.CRM.morerecords'] ?? false;
    const rawCookie = response['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'];
    const rawTotal = response['@Microsoft.Dynamics.CRM.totalrecordcount'];
    const totalCountExceeded = response['@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded'] ?? false;

    const recordsReturnedSoFar = recordsSeenSoFar + rawRecords.length;
    const isCapped = recordsReturnedSoFar >= fieldConfig.maxRows && hasMore;
    const hasNextPage = hasMore && !isCapped;
    const nextPageCookie = hasNextPage && rawCookie
      ? Buffer.from(rawCookie).toString('base64')
      : undefined;

    const totalCount = !totalCountExceeded && rawTotal !== undefined && rawTotal >= 0
      ? Math.min(rawTotal, fieldConfig.maxRows)
      : undefined;

    const totalPages = totalCount !== undefined
      ? Math.ceil(totalCount / pageSize)
      : undefined;

    const columns = fieldConfig.columnConfigs.map((c) => c.targetAttribute);
    const records = rawRecords.map((raw) => {
      const entityIdAttr = `${fieldConfig.targetEntity}id`;
      const id = (raw[entityIdAttr] as string | undefined) ?? (raw['id'] as string | undefined) ?? '';
      return { id, values: buildRestrictedValues(raw, columns) };
    });

    logger.info(
      {
        correlationId,
        fieldId,
        page,
        pageSize,
        recordCount: records.length,
        hasNextPage,
        isCapped,
        totalCount,
        latencyMs,
        hasSearch: !!searchText,
        hasSortBy: !!validatedSortBy,
        operation: 'fetchGridRecords',
      },
      'selection_grid_load',
    );

    return { records, page, pageSize, hasNextPage, nextPageCookie, isCapped, totalCount, totalPages };
  }

  async resolveFieldConfig(
    fieldId: string,
    correlationId: string,
  ): Promise<GridFieldConfig> {
    const cacheKey = `grid-field-config:${fieldId}`;
    const cached = this.metadataCache.get(cacheKey) as GridFieldConfig | undefined;
    if (cached) return cached;

    const [fieldResponse, columnsResponse] = await Promise.all([
      this.crmFetch<{ value: RawGridField[] }>(
        `/qdb_form_fields?$filter=qdb_form_fieldid eq '${fieldId}'&$top=1` +
        `&$select=qdb_form_fieldid,qdb_grid_entity_name,qdb_saved_view_id,qdb_selection_mode,qdb_grid_max_rows` +
        `,qdb_grid_filter_expression,qdb_grid_depends_on_filter_template`,
      ),
      this.crmFetch<{ value: RawGridColumnConfig[] }>(
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
    logger.info({ correlationId, fieldId, operation: 'resolveFieldConfig' }, 'Grid field config resolved and cached');

    return fieldConfig;
  }

  private async resolveViewFetchXml(viewId: string, correlationId: string): Promise<string> {
    const cached = this.viewCache.get(viewId);
    if (cached) return cached;

    let rawView: RawSavedQuery;
    try {
      rawView = await this.crmFetch<RawSavedQuery>(
        `/savedqueries(${viewId})?$select=fetchxml,querytype`,
      );
    } catch (error) {
      if (error instanceof CrmApiError && error.crmStatusCode === 404) {
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

    if (rawView.querytype !== undefined && rawView.querytype !== SYSTEM_VIEW_QUERY_TYPE) {
      throw new ValidationError(
        'Only System Views are permitted for Selection Grid configuration. User Views are not allowed.',
      );
    }

    logger.info({ correlationId, viewId, operation: 'resolveViewFetchXml' }, 'Saved view fetchxml resolved');
    this.viewCache.set(viewId, rawView.fetchxml);
    return rawView.fetchxml;
  }

  // Validates that sortBy is a real column attribute in this field's config.
  // Rejects unknown attributes to prevent FetchXML injection.
  private validateSortAttribute(
    sortBy: string | undefined,
    config: GridFieldConfig,
  ): string | undefined {
    if (!sortBy) return undefined;
    const isValid = config.columnConfigs.some((c) => c.targetAttribute === sortBy);
    if (!isValid) {
      logger.warn({ sortBy, fieldId: config.fieldId }, 'Sort attribute rejected — not in column config');
      return undefined;
    }
    return sortBy;
  }
}

// ── FetchXML builder ───────────────────────────────────────────

function buildFetchXml(params: BuildFetchXmlParams): string {
  const {
    baseXml, page, pageSize, pagingCookie,
    filterExpression, dependsOnFilterTemplate, dependsOnValue,
    searchText, searchAttributes, sortBy, sortDirection,
  } = params;

  // Step 1: Strip existing page/count/top/paging-cookie/order attrs; inject fresh ones.
  let xml = baseXml.replace(
    /<fetch([^>]*)>/,
    (_match, existingAttrs: string) => {
      const cleaned = existingAttrs
        .replace(/\s+page="[^"]*"/g, '')
        .replace(/\s+count="[^"]*"/g, '')
        .replace(/\s+top="[^"]*"/g, '')
        .replace(/\s+paging-cookie="[^"]*"/g, '')
        .replace(/\s+returntotalrecordcount="[^"]*"/g, '');

      let newAttrs = `${cleaned} page="${page}" count="${pageSize}" returntotalrecordcount="true"`;
      if (pagingCookie) {
        const rawCookie = Buffer.from(pagingCookie, 'base64').toString('utf8');
        newAttrs += ` paging-cookie="${escapeXmlAttribute(rawCookie)}"`;
      }
      return `<fetch${newAttrs}>`;
    },
  );

  // Step 2: Strip existing <order> elements — user sort overrides view default.
  xml = xml.replace(/<order\b[^>]*\/>/g, '');
  xml = xml.replace(/<order\b[^>]*>[\s\S]*?<\/order>/g, '');

  // Step 3: Inject user sort before </entity> when active.
  if (sortBy) {
    const descending = sortDirection === 'desc' ? 'true' : 'false';
    xml = xml.replace('</entity>', `<order attribute="${sortBy}" descending="${descending}"/></entity>`);
  }

  // Step 4: Collect filter conditions (static + depends-on + search).
  const conditions: string[] = [];

  if (filterExpression) {
    const cond = parseFilterCondition(filterExpression);
    if (cond) conditions.push(cond);
  }

  if (dependsOnFilterTemplate && dependsOnValue !== undefined && dependsOnValue !== '') {
    const resolved = dependsOnFilterTemplate.replace(
      '{dependsOnValue}',
      sanitizeFilterValue(dependsOnValue),
    );
    const cond = parseFilterCondition(resolved);
    if (cond) conditions.push(cond);
  }

  if (searchText && searchText.trim() && searchAttributes.length > 0) {
    const escaped = escapeXmlAttribute(`%${searchText.trim()}%`);
    const orConditions = searchAttributes
      .map((attr) => `<condition attribute="${attr}" operator="like" value="${escaped}"/>`)
      .join('');
    conditions.push(`<filter type="or">${orConditions}</filter>`);
  }

  // Step 5: Inject conditions into existing <filter> or wrap in a new one.
  if (conditions.length > 0) {
    const conditionsXml = conditions.join('');
    if (/<filter/.test(xml)) {
      xml = xml.replace(/<filter([^>]*)>/, `<filter$1>${conditionsXml}`);
    } else {
      xml = xml.replace('</entity>', `<filter type="and">${conditionsXml}</filter></entity>`);
    }
  }

  return xml;
}

// ── Filter condition parser ────────────────────────────────────

function parseFilterCondition(expression: string): string {
  const expr = expression.trim();

  const navMatch = expr.match(/^_(\w+)_value\s+(eq|ne)\s+'([0-9a-f-]+)'$/i);
  if (navMatch) {
    const [, attr, op, val] = navMatch;
    return `<condition attribute="${attr}" operator="${op}" value="${escapeXmlAttribute(val)}"/>`;
  }

  const strMatch = expr.match(/^(\w+)\s+(eq|ne|like|not-like)\s+'([^']*)'$/i);
  if (strMatch) {
    const [, attr, op, val] = strMatch;
    return `<condition attribute="${attr}" operator="${op}" value="${escapeXmlAttribute(val)}"/>`;
  }

  const numMatch = expr.match(/^(\w+)\s+(eq|ne|lt|gt|le|ge)\s+(-?\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const [, attr, op, val] = numMatch;
    return `<condition attribute="${attr}" operator="${op}" value="${val}"/>`;
  }

  const nullMatch = expr.match(/^(\w+)\s+(eq|ne)\s+null$/i);
  if (nullMatch) {
    const [, attr, op] = nullMatch;
    return `<condition attribute="${attr}" operator="${op === 'eq' ? 'null' : 'not-null'}"/>`;
  }

  logger.warn({ expression: expr }, 'Grid filter: unrecognised condition format — skipped');
  return '';
}

// ── Helpers ────────────────────────────────────────────────────

function resolveSearchAttributes(columns: GridColumnConfig[]): string[] {
  return columns
    .filter((c) => TEXT_SEARCHABLE_FIELD_TYPES.has(c.columnFieldType))
    .map((c) => c.targetAttribute);
}

function assertGridFieldHasView(field: RawGridField, fieldId: string): void {
  if (!field.qdb_grid_entity_name) {
    throw new ValidationError(`Grid field '${fieldId}' has no target entity configured.`);
  }
  if (!field.qdb_saved_view_id) {
    throw new ValidationError(`Grid field '${fieldId}' has no saved view configured.`);
  }
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeFilterValue(value: string): string {
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
    if (columnSet.has(key)) { result[key] = value; continue; }
    if (key.endsWith(ODATA_ANNOTATION_SUFFIX)) {
      const baseKey = key.slice(0, -ODATA_ANNOTATION_SUFFIX.length);
      if (columnSet.has(baseKey)) result[key] = value;
    }
  }
  return result;
}

function buildEmptyPage(page: number, pageSize: number): GridRecordPage {
  return { records: [], page, pageSize, hasNextPage: false, isCapped: true };
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
