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
  filterExpression?: string;        // static filter condition (OData-style, parsed to FetchXML)
  dependsOnFilterTemplate?: string; // template — {dependsOnValue} replaced at request time
}

export interface GridRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface GridRecordPage {
  records: GridRecord[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;        // true when more records exist beyond this page
  nextPageCookie?: string;     // opaque cursor — send back as pagingCookie for page+1
  isCapped: boolean;
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
    pagingCookie?: string,
  ): Promise<GridRecordPage> {
    const fieldConfig = await this.resolveFieldConfig(fieldId, correlationId);

    // Guard: if paging would exceed maxRows, return empty immediately.
    const recordsSeenSoFar = (page - 1) * pageSize;
    if (recordsSeenSoFar >= fieldConfig.maxRows) {
      return buildEmptyPage(page, pageSize);
    }

    const baseFetchXml = await this.resolveViewFetchXml(fieldConfig.savedViewId, correlationId);
    const columns = fieldConfig.columnConfigs.map((c) => c.targetAttribute);

    const fetchXml = buildFetchXml(
      baseFetchXml,
      page,
      pageSize,
      pagingCookie,
      fieldConfig.filterExpression,
      fieldConfig.dependsOnFilterTemplate,
      dependsOnValue,
    );

    const url = `/${fieldConfig.targetEntity}s?fetchXml=${encodeURIComponent(fetchXml)}`;

    const startMs = Date.now();
    const response = await this.crmFetch<FetchXmlCollection<Record<string, unknown>>>(url);
    const latencyMs = Date.now() - startMs;

    const rawRecords = response.value;
    const hasMore = response['@Microsoft.Dynamics.CRM.morerecords'] ?? false;
    const rawCookie = response['@Microsoft.Dynamics.CRM.fetchxmlpagingcookie'];

    // Cap: if we've already returned maxRows worth, don't serve beyond.
    const recordsReturnedSoFar = recordsSeenSoFar + rawRecords.length;
    const isCapped = recordsReturnedSoFar >= fieldConfig.maxRows && hasMore;
    const hasNextPage = hasMore && !isCapped;
    const nextPageCookie = hasNextPage && rawCookie
      ? Buffer.from(rawCookie).toString('base64')
      : undefined;

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
        hasNextPage,
        isCapped,
        latencyMs,
        operation: 'fetchGridRecords',
      },
      'selection_grid_load',
    );

    return { records, page, pageSize, hasNextPage, nextPageCookie, isCapped };
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

    logger.info(
      { correlationId, viewId, operation: 'resolveViewFetchXml' },
      'Saved view fetchxml resolved and cached for 24h',
    );

    this.viewCache.set(viewId, rawView.fetchxml);
    return rawView.fetchxml;
  }
}

// ── FetchXML builder ───────────────────────────────────────────

/**
 * Takes the saved view's base FetchXML and produces an execution-ready FetchXML with:
 * - page/count attributes set for cursor-based paging
 * - paging-cookie injected when navigating beyond page 1
 * - filter conditions injected directly into the XML (evaluated at SQL level)
 */
function buildFetchXml(
  baseXml: string,
  page: number,
  pageSize: number,
  pagingCookie: string | undefined,
  filterExpression: string | undefined,
  dependsOnFilterTemplate: string | undefined,
  dependsOnValue: string | undefined,
): string {
  // Step 1: strip any existing page/count/top/paging-cookie attrs, inject fresh ones.
  let xml = baseXml.replace(
    /<fetch([^>]*)>/,
    (_match, existingAttrs: string) => {
      const cleaned = existingAttrs
        .replace(/\s+page="[^"]*"/g, '')
        .replace(/\s+count="[^"]*"/g, '')
        .replace(/\s+top="[^"]*"/g, '')
        .replace(/\s+paging-cookie="[^"]*"/g, '');

      let newAttrs = `${cleaned} page="${page}" count="${pageSize}"`;
      if (pagingCookie) {
        // Cookie arrives base64-encoded from the frontend; decode to the raw XML string.
        const rawCookie = Buffer.from(pagingCookie, 'base64').toString('utf8');
        newAttrs += ` paging-cookie="${escapeXmlAttribute(rawCookie)}"`;
      }
      return `<fetch${newAttrs}>`;
    },
  );

  // Step 2: collect filter conditions to inject.
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

  // Step 3: inject conditions into existing <filter> or wrap in a new one.
  if (conditions.length > 0) {
    const conditionsXml = conditions.join('');
    if (/<filter/.test(xml)) {
      // Append conditions to the first filter block.
      xml = xml.replace(/<filter([^>]*)>/, `<filter$1>${conditionsXml}`);
    } else {
      // No filter in view — insert one before </entity>.
      xml = xml.replace('</entity>', `<filter type="and">${conditionsXml}</filter></entity>`);
    }
  }

  return xml;
}

// ── Filter condition parser ────────────────────────────────────

/**
 * Parses a simple OData-style filter condition into a FetchXML <condition> element.
 * Supports the subset used by DFE filter templates:
 *   - attribute eq/ne/lt/gt/le/ge numericValue
 *   - attribute eq/ne 'stringValue'
 *   - _lookupAttribute_value eq 'guid'       (navigation property → lookup condition)
 *   - attribute eq null / attribute ne null
 */
function parseFilterCondition(expression: string): string {
  const expr = expression.trim();

  // Navigation property: _attribute_value eq 'guid'
  const navMatch = expr.match(/^_(\w+)_value\s+(eq|ne)\s+'([0-9a-f-]+)'$/i);
  if (navMatch) {
    const [, attr, op, val] = navMatch;
    return `<condition attribute="${attr}" operator="${op}" value="${escapeXmlAttribute(val)}"/>`;
  }

  // String value: attribute op 'value'
  const strMatch = expr.match(/^(\w+)\s+(eq|ne|like|not-like)\s+'([^']*)'$/i);
  if (strMatch) {
    const [, attr, op, val] = strMatch;
    return `<condition attribute="${attr}" operator="${op}" value="${escapeXmlAttribute(val)}"/>`;
  }

  // Numeric value: attribute op number
  const numMatch = expr.match(/^(\w+)\s+(eq|ne|lt|gt|le|ge)\s+(-?\d+(?:\.\d+)?)$/);
  if (numMatch) {
    const [, attr, op, val] = numMatch;
    return `<condition attribute="${attr}" operator="${op}" value="${val}"/>`;
  }

  // Null checks: attribute eq null / attribute ne null
  const nullMatch = expr.match(/^(\w+)\s+(eq|ne)\s+null$/i);
  if (nullMatch) {
    const [, attr, op] = nullMatch;
    return `<condition attribute="${attr}" operator="${op === 'eq' ? 'null' : 'not-null'}"/>`;
  }

  logger.warn({ expression: expr }, 'Grid filter: unrecognised condition format — skipped');
  return '';
}

// ── Private helpers ────────────────────────────────────────────

function assertGridFieldHasView(field: RawGridField, fieldId: string): void {
  if (!field.qdb_grid_entity_name) {
    throw new ValidationError(`Grid field '${fieldId}' has no target entity configured.`);
  }
  if (!field.qdb_saved_view_id) {
    throw new ValidationError(`Grid field '${fieldId}' has no saved view configured.`);
  }
}

/** Escape a value for safe use in an XML attribute (double-quotes). */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Cap length and escape single-quotes before substituting into a filter template. */
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
