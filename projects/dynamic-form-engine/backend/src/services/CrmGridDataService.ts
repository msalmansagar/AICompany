import { LRUCache } from 'lru-cache';
import { CrmBaseService } from './CrmBaseService.js';
import { EntitySetNameResolver } from './EntitySetNameResolver.js';
import { buildDependsOnFilter, buildDependsOnFilterParts } from './gridFilterExpression.js';
import { LookupTargetResolver } from './LookupTargetResolver.js';
import { collectLookupPathAttributes, type LookupJoinTarget } from '@qdb/shared';
import { logger } from '../utils/logger.js';
import { CrmApiError, NotFoundError, ValidationError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

// ── Types ──────────────────────────────────────────────────────

export type GridColumnFilterType = 'text' | 'optionset' | 'lookup' | 'none';

export interface GridColumnConfig {
  columnId: string;
  displayOrder: number;
  columnLabel: string;
  targetAttribute: string;
  columnFieldType: string;
  filterType: GridColumnFilterType;
  lookupTargetEntity?: string;
  lookupDisplayAttribute?: string;
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
  // The saved view lives in the form's Grid Config section; qdb_saved_view_id is the
  // legacy Lookup Config twin, still read so pre-migration fields keep working.
  qdb_grid_saved_view_id?: string;
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
  filterExpression: string | undefined;
  dependsOnFilterTemplate: string | undefined;
  dependsOnValues: Record<string, string> | undefined;
  searchText: string | undefined;
  searchAttributes: string[];
  sortBy: string | undefined;
  sortDirection: 'asc' | 'desc' | undefined;
  columnFilters: Record<string, string> | undefined;
  columnConfigs: GridColumnConfig[];
  /**
   * Related table per lookup attribute the depends-on template searches by text
   * (`company/name like …`). Resolved by the caller because it needs metadata.
   */
  lookupJoinTargets: Record<string, LookupJoinTarget>;
}

// View querytype: 0 = System View. CEO condition BC-011: only System Views permitted.
const SYSTEM_VIEW_QUERY_TYPE = 0;

const TEXT_SEARCHABLE_FIELD_TYPES = new Set(['text', 'email', 'phone', 'textarea']);

export class CrmGridDataService extends CrmBaseService {
  private readonly viewCache: LRUCache<string, string>;

  private readonly entitySetNames: EntitySetNameResolver;

  private readonly lookupTargets: LookupTargetResolver;

  constructor(
    authService: CrmAuthService,
    private readonly metadataCache: LRUCache<string, object>,
  ) {
    super(authService);
    this.entitySetNames = new EntitySetNameResolver((path) => this.crmFetch(path));
    this.lookupTargets = new LookupTargetResolver((path) => this.crmFetch(path));
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
    // Map of {placeholder name → value} resolving the depends-on filter template.
    // Single-field forms send { dependsOnValue }; multi-field forms send one entry per field schema.
    dependsOnValues?: Record<string, string>,
    // Retained for positional-signature stability. Cursor cookies are no longer used —
    // the grid pages by page-number (see buildFetchXml). Callers may still pass a value; it is ignored.
    _pagingCookie?: string,
    searchText?: string,
    sortBy?: string,
    sortDirection?: 'asc' | 'desc',
    columnFilters?: Record<string, string>,
  ): Promise<GridRecordPage> {
    const fieldConfig = await this.resolveFieldConfig(fieldId, correlationId);

    const recordsSeenSoFar = (page - 1) * pageSize;
    if (recordsSeenSoFar >= fieldConfig.maxRows) {
      return buildEmptyPage(page, pageSize);
    }

    const validatedSortBy = this.validateSortAttribute(sortBy, fieldConfig);

    const searchAttributes = resolveSearchAttributes(fieldConfig.columnConfigs);
    const validatedColumnFilters = validateColumnFilters(columnFilters, fieldConfig.columnConfigs);

    const baseFetchXml = await this.resolveViewFetchXml(fieldConfig.savedViewId, correlationId);

    const lookupJoinTargets = await this.resolveLookupJoinTargets(fieldConfig);

    const fetchXml = buildFetchXml({
      baseXml: baseFetchXml,
      page,
      pageSize,
      filterExpression: fieldConfig.filterExpression,
      dependsOnFilterTemplate: fieldConfig.dependsOnFilterTemplate,
      dependsOnValues,
      searchText,
      searchAttributes,
      sortBy: validatedSortBy,
      sortDirection,
      columnFilters: validatedColumnFilters,
      columnConfigs: fieldConfig.columnConfigs,
      lookupJoinTargets,
    });

    const entitySet = await this.entitySetNames.resolve(fieldConfig.targetEntity);
    const url = `/${entitySet}?fetchXml=${encodeURIComponent(fetchXml)}`;

    const startMs = Date.now();
    const response = await this.crmFetch<FetchXmlCollection<Record<string, unknown>>>(url);
    const latencyMs = Date.now() - startMs;

    const rawRecords = response.value;
    const hasMore = response['@Microsoft.Dynamics.CRM.morerecords'] ?? false;
    const rawTotal = response['@Microsoft.Dynamics.CRM.totalrecordcount'];
    const totalCountExceeded = response['@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded'] ?? false;

    const recordsReturnedSoFar = recordsSeenSoFar + rawRecords.length;
    const isCapped = recordsReturnedSoFar >= fieldConfig.maxRows && hasMore;
    const hasNextPage = hasMore && !isCapped;

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
        hasColumnFilters: validatedColumnFilters ? Object.keys(validatedColumnFilters).length > 0 : false,
        operation: 'fetchGridRecords',
      },
      'selection_grid_load',
    );

    return { records, page, pageSize, hasNextPage, isCapped, totalCount, totalPages };
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
        `&$select=qdb_form_fieldid,qdb_grid_entity_name,qdb_grid_saved_view_id,qdb_saved_view_id,qdb_selection_mode,qdb_grid_max_rows` +
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
      savedViewId: resolveSavedViewId(rawField)!,
      selectionMode: rawField.qdb_selection_mode === 100000001 ? 'multi' : 'single',
      maxRows: rawField.qdb_grid_max_rows ?? 200,
      filterExpression: rawField.qdb_grid_filter_expression ?? undefined,
      dependsOnFilterTemplate: rawField.qdb_grid_depends_on_filter_template ?? undefined,
      columnConfigs: columnsResponse.value.map((c) => {
        const meta = parseColumnMetadata(c.qdb_column_options_json);
        return {
          columnId: c.qdb_grid_column_configid,
          displayOrder: c.qdb_display_order,
          columnLabel: c.qdb_column_label,
          targetAttribute: c.qdb_column_attribute,
          columnFieldType: c.qdb_column_field_type,
          filterType: meta.filterType ?? deriveFilterType(c.qdb_column_field_type),
          lookupTargetEntity: meta.lookupTargetEntity,
          lookupDisplayAttribute: meta.lookupDisplayAttribute,
          options: meta.options,
        };
      }),
    };

    this.metadataCache.set(cacheKey, fieldConfig as object);
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

  /**
   * Join targets for every lookup the depends-on template searches by display text.
   * A column already configured as a lookup filter carries its target, so only lookups
   * that are not displayed columns cost a metadata call.
   */
  private async resolveLookupJoinTargets(
    config: GridFieldConfig,
  ): Promise<Record<string, LookupJoinTarget>> {
    const attributes = collectLookupPathAttributes(config.dependsOnFilterTemplate ?? '');
    if (attributes.length === 0) return {};

    const knownTargets: Record<string, string | undefined> = {};
    for (const column of config.columnConfigs) {
      if (column.lookupTargetEntity) knownTargets[column.targetAttribute] = column.lookupTargetEntity;
    }

    return this.lookupTargets.resolveAll(config.targetEntity, attributes, knownTargets);
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
    baseXml, page, pageSize,
    filterExpression, dependsOnFilterTemplate, dependsOnValues,
    searchText, searchAttributes, sortBy, sortDirection,
    columnFilters, columnConfigs, lookupJoinTargets,
  } = params;

  // Step 0: Ensure every configured column attribute is present in the FetchXML select list.
  // The saved view may not include all columns the grid layout needs to display.
  let xml = baseXml;
  for (const col of columnConfigs) {
    const attr = col.targetAttribute;
    if (!new RegExp(`<attribute[^>]+name="${attr}"`).test(xml)) {
      xml = xml.replace('</entity>', `<attribute name="${attr}"/></entity>`);
    }
  }

  // Step 1: Strip existing page/count/top/paging-cookie/order attrs; inject fresh ones.
  // We deliberately do NOT emit a paging-cookie: page-number paging (page + count) is
  // correct and stable for the row-capped result sets this grid serves, and avoids the
  // fragile Web API cursor-cookie round-trip that fails with 0x80041129
  // ("Paging Cookie And Query Do Not Match") when the query's order and the cookie's
  // encoded order columns diverge.
  xml = xml.replace(
    /<fetch([^>]*)>/,
    (_match, existingAttrs: string) => {
      const cleaned = existingAttrs
        .replace(/\s+page="[^"]*"/g, '')
        .replace(/\s+count="[^"]*"/g, '')
        .replace(/\s+top="[^"]*"/g, '')
        .replace(/\s+paging-cookie="[^"]*"/g, '')
        .replace(/\s+returntotalrecordcount="[^"]*"/g, '');
      return `<fetch${cleaned} page="${page}" count="${pageSize}" returntotalrecordcount="true">`;
    },
  );

  // Step 2/3: Ordering. A user sort overrides the view default; otherwise the view's own
  // <order> is preserved so paging stays deterministic. Only strip the view order when the
  // user has chosen a sort — removing it unconditionally left unsorted grids with no order.
  if (sortBy) {
    xml = xml.replace(/<order\b[^>]*\/>/g, '');
    xml = xml.replace(/<order\b[^>]*>[\s\S]*?<\/order>/g, '');
    const descending = sortDirection === 'desc' ? 'true' : 'false';
    xml = xml.replace('</entity>', `<order attribute="${sortBy}" descending="${descending}"/></entity>`);
  }

  // Step 4: Collect filter conditions (static + depends-on + search).
  const conditions: string[] = [];

  if (filterExpression) {
    const cond = parseFilterCondition(filterExpression);
    if (cond) conditions.push(cond);
  }

  // Depends-on filter: a maker-authored boolean template (and/or/grouping) whose
  // {placeholder} tokens resolve from the form-field values. Compiles to a FetchXML
  // subtree; empty/missing field values prune their conditions (partial filtering).
  // A template may also search a lookup by display text (`company/name like '%{x}%'`),
  // which needs a join alongside the condition.
  const dependsOnLinkEntities: string[] = [];
  if (dependsOnFilterTemplate) {
    const parts = buildDependsOnFilterParts(
      dependsOnFilterTemplate, dependsOnValues ?? {}, lookupJoinTargets,
    );
    if (parts.filterXml) conditions.push(parts.filterXml);
    if (parts.linkEntityXml) dependsOnLinkEntities.push(parts.linkEntityXml);
  }

  if (searchText && searchText.trim() && searchAttributes.length > 0) {
    const escaped = escapeXmlAttribute(`%${searchText.trim()}%`);
    const orConditions = searchAttributes
      .map((attr) => `<condition attribute="${attr}" operator="like" value="${escaped}"/>`)
      .join('');
    conditions.push(`<filter type="or">${orConditions}</filter>`);
  }

  // Step 5b: Per-column filter conditions (text and optionset).
  const linkEntityClauses: string[] = [];
  if (columnFilters && columnConfigs) {
    for (const [attrName, filterValue] of Object.entries(columnFilters)) {
      const trimmed = filterValue.trim();
      if (!trimmed) continue;
      const col = columnConfigs.find((c) => c.targetAttribute === attrName);
      if (!col) continue;

      switch (col.filterType) {
        case 'text': {
          const escaped = escapeXmlAttribute(`%${trimmed}%`);
          conditions.push(`<condition attribute="${attrName}" operator="like" value="${escaped}"/>`);
          break;
        }
        case 'optionset': {
          const intVal = parseInt(trimmed, 10);
          if (!isNaN(intVal)) {
            conditions.push(`<condition attribute="${attrName}" operator="eq" value="${intVal}"/>`);
          }
          break;
        }
        case 'lookup': {
          if (col.lookupTargetEntity && col.lookupDisplayAttribute) {
            const escaped = escapeXmlAttribute(`%${trimmed}%`);
            // Unique alias: truncate to 20 chars to stay within FetchXML alias limits.
            const alias = `lnk_${attrName.replace(/\W/g, '_').slice(0, 15)}`;
            linkEntityClauses.push(
              `<link-entity name="${col.lookupTargetEntity}" ` +
              `from="${col.lookupTargetEntity}id" to="${attrName}" ` +
              `alias="${alias}" link-type="inner">` +
              `<filter><condition attribute="${col.lookupDisplayAttribute}" operator="like" value="${escaped}"/></filter>` +
              `</link-entity>`,
            );
          }
          break;
        }
      }
    }
  }

  // Step 5c: Inject filter conditions into existing <filter> or wrap in a new one.
  if (conditions.length > 0) {
    const conditionsXml = conditions.join('');
    if (/<filter/.test(xml)) {
      xml = xml.replace(/<filter([^>]*)>/, `<filter$1>${conditionsXml}`);
    } else {
      xml = xml.replace('</entity>', `<filter type="and">${conditionsXml}</filter></entity>`);
    }
  }

  // Step 5d: Inject link-entity joins before </entity>. A join can never sit inside a
  // <filter> — the per-column ones carry their own filter, the depends-on ones are plain
  // outer joins whose conditions stay in the filter tree above (preserving and/or).
  const allLinkEntities = [...linkEntityClauses, ...dependsOnLinkEntities];
  if (allLinkEntities.length > 0) {
    xml = xml.replace('</entity>', `${allLinkEntities.join('')}</entity>`);
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

function deriveFilterType(fieldType: string): GridColumnFilterType {
  if (TEXT_SEARCHABLE_FIELD_TYPES.has(fieldType)) return 'text';
  if (['dropdown', 'status', 'picklist'].includes(fieldType)) return 'optionset';
  if (fieldType === 'lookup') return 'lookup';
  return 'none';
}

// Validates columnFilters: keys must match a known targetAttribute.
// Silently drops unknown attributes to prevent FetchXML injection.
function validateColumnFilters(
  filters: Record<string, string> | undefined,
  columns: GridColumnConfig[],
): Record<string, string> | undefined {
  if (!filters) return undefined;
  const knownAttrs = new Set(columns.map((c) => c.targetAttribute));
  const validated: Record<string, string> = {};
  for (const [attr, value] of Object.entries(filters)) {
    if (knownAttrs.has(attr) && value && value.trim()) {
      validated[attr] = value.slice(0, 200);
    }
  }
  return Object.keys(validated).length > 0 ? validated : undefined;
}

function resolveSavedViewId(field: RawGridField): string | undefined {
  return field.qdb_grid_saved_view_id ?? field.qdb_saved_view_id ?? undefined;
}

function assertGridFieldHasView(field: RawGridField, fieldId: string): void {
  if (!field.qdb_grid_entity_name) {
    throw new ValidationError(`Grid field '${fieldId}' has no target entity configured.`);
  }
  if (!resolveSavedViewId(field)) {
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

const ODATA_ANNOTATION_SUFFIX = '@OData.Community.Display.V1.FormattedValue';

function buildRestrictedValues(
  raw: Record<string, unknown>,
  allowedColumns: string[],
): Record<string, unknown> {
  const columnSet = new Set(allowedColumns);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    // Direct attribute match (text, number, optionset).
    if (columnSet.has(key)) { result[key] = value; continue; }

    if (key.endsWith(ODATA_ANNOTATION_SUFFIX)) {
      const baseKey = key.slice(0, -ODATA_ANNOTATION_SUFFIX.length);
      // Annotation on a direct attribute (e.g. gendercode@...FormattedValue).
      if (columnSet.has(baseKey)) { result[key] = value; continue; }
      // Annotation on a lookup navigation property (_parentcustomerid_value@...FormattedValue)
      // → remap to parentcustomerid@...FormattedValue for the frontend.
      if (baseKey.startsWith('_') && baseKey.endsWith('_value')) {
        const attrName = baseKey.slice(1, -6);
        if (columnSet.has(attrName)) result[`${attrName}${ODATA_ANNOTATION_SUFFIX}`] = value;
      }
      continue;
    }

    // Lookup navigation property (_parentcustomerid_value → parentcustomerid).
    if (key.startsWith('_') && key.endsWith('_value')) {
      const attrName = key.slice(1, -6);
      if (columnSet.has(attrName)) result[attrName] = value;
    }
  }
  return result;
}

function buildEmptyPage(page: number, pageSize: number): GridRecordPage {
  return { records: [], page, pageSize, hasNextPage: false, isCapped: true };
}

interface ColumnMetadata {
  options?: Array<{ value: string; label: string }>;
  filterType?: GridColumnFilterType;
  lookupTargetEntity?: string;
  lookupDisplayAttribute?: string;
}

// Parses the qdb_column_options_json field which uses one of two formats:
//   v1 (legacy): a JSON array — [{"value":"1","label":"Active"}]
//   v2 (extended): a JSON object — {"v":2,"options":[...],"filterType":"optionset",...}
function parseColumnMetadata(json: string | null | undefined): ColumnMetadata {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) {
      return { options: parsed as Array<{ value: string; label: string }> };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return {
        options: Array.isArray(obj['options'])
          ? (obj['options'] as Array<{ value: string; label: string }>)
          : undefined,
        filterType: isValidFilterType(obj['filterType']) ? obj['filterType'] : undefined,
        lookupTargetEntity: typeof obj['lookupTargetEntity'] === 'string' ? obj['lookupTargetEntity'] : undefined,
        lookupDisplayAttribute: typeof obj['lookupDisplayAttribute'] === 'string' ? obj['lookupDisplayAttribute'] : undefined,
      };
    }
    return {};
  } catch {
    return {};
  }
}

function isValidFilterType(value: unknown): value is GridColumnFilterType {
  return value === 'text' || value === 'optionset' || value === 'lookup' || value === 'none';
}
