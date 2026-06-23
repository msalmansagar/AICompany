/**
 * TokenValueRepository — Dataverse data access for qdb_token_values.
 *
 * Field names follow the Dataverse OData logical name convention.
 * See Section 6.3 of phase-3-arch.md for the full entity schema.
 *
 * Entity set name: qdb_token_valueses
 * Lookup field: qdb_tokendefinitionid → OData returns _qdb_tokendefinitionid_value
 *
 * Context uniqueness is enforced at the API layer (GET-before-POST) because
 * Dataverse does not support composite alternate keys involving Lookup fields.
 */

import type { DataverseClient } from '@portal/dataverse-client';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type { TokenValue } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Entity set names
// ---------------------------------------------------------------------------

const VALUE_ENTITY = 'qdb_token_valueses';
const DEFINITION_ENTITY = 'qdb_token_definitionses';

// ---------------------------------------------------------------------------
// Dataverse record shape
// ---------------------------------------------------------------------------

interface DataverseTokenValue {
  qdb_token_valuesid: string;
  '_qdb_tokendefinitionid_value': string;
  qdb_level: number;
  qdb_rendertarget: string | null;
  qdb_category: number | null;
  qdb_componentslug: string | null;
  qdb_serviceslug: string | null;
  qdb_locale: string | null;
  qdb_value: string;
  qdb_publishedon: string | null;
  qdb_publishedby: string | null;
  qdb_isactive: boolean;
  statecode: number;
  createdon: string;
  modifiedon: string;
}

// ---------------------------------------------------------------------------
// Field selection
// ---------------------------------------------------------------------------

const SELECT_FIELDS: (keyof DataverseTokenValue)[] = [
  'qdb_token_valuesid',
  '_qdb_tokendefinitionid_value',
  'qdb_level',
  'qdb_rendertarget',
  'qdb_category',
  'qdb_componentslug',
  'qdb_serviceslug',
  'qdb_locale',
  'qdb_value',
  'qdb_publishedon',
  'qdb_publishedby',
  'qdb_isactive',
  'statecode',
  'createdon',
  'modifiedon',
];

// ---------------------------------------------------------------------------
// Context query parameters
// ---------------------------------------------------------------------------

export interface TokenValueContextQuery {
  definitionId: string;
  level: number;
  renderTarget?: string | null;
  category?: number | null;
  componentSlug?: string | null;
  serviceSlug?: string | null;
  locale?: string | null;
}

// ---------------------------------------------------------------------------
// Create payload
// ---------------------------------------------------------------------------

export interface CreateTokenValuePayload {
  definitionId: string;
  level: number;
  renderTarget?: string | null;
  category?: number | null;
  componentSlug?: string | null;
  serviceSlug?: string | null;
  locale?: string | null;
  value: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ITokenValueRepository {
  findAllActive(): Promise<TokenValue[]>;
  findByDefinitionId(definitionId: string, activeOnly: boolean): Promise<TokenValue[]>;
  findById(id: string): Promise<TokenValue | null>;
  findMatchingContext(params: TokenValueContextQuery): Promise<TokenValue | null>;
  create(payload: CreateTokenValuePayload): Promise<TokenValue>;
  deactivate(id: string): Promise<void>;
  deactivateAllForDefinition(definitionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Dataverse implementation of ITokenValueRepository.
 */
export class DataverseTokenValueRepository implements ITokenValueRepository {
  private readonly dataverse: DataverseClient;

  constructor(dataverse: DataverseClient) {
    this.dataverse = dataverse;
  }

  /**
   * Returns all active token value records (statecode eq 0 and qdb_isactive eq true).
   * Used for raw cache population on publish.
   */
  async findAllActive(): Promise<TokenValue[]> {
    const result = await this.dataverse.getList<DataverseTokenValue>(
      VALUE_ENTITY,
      {
        select: SELECT_FIELDS as string[],
        filter: 'statecode eq 0 and qdb_isactive eq true',
        orderBy: 'createdon asc',
      },
    );

    return result.value.map((r) => mapToValue(r, ''));
  }

  /**
   * Returns token values for a specific definition, optionally filtering to active only.
   */
  async findByDefinitionId(definitionId: string, activeOnly: boolean): Promise<TokenValue[]> {
    const baseFilter = `_qdb_tokendefinitionid_value eq ${definitionId}`;
    const filter = activeOnly
      ? `${baseFilter} and statecode eq 0 and qdb_isactive eq true`
      : baseFilter;

    const result = await this.dataverse.getList<DataverseTokenValue>(
      VALUE_ENTITY,
      {
        select: SELECT_FIELDS as string[],
        filter,
        orderBy: 'createdon asc',
      },
    );

    return result.value.map((r) => mapToValue(r, ''));
  }

  /**
   * Returns a single token value by its Dataverse GUID, or null if not found.
   */
  async findById(id: string): Promise<TokenValue | null> {
    try {
      const record = await this.dataverse.getById<DataverseTokenValue>(
        VALUE_ENTITY,
        id,
        { select: SELECT_FIELDS as string[] },
      );
      return mapToValue(record, '');
    } catch (error) {
      if (error instanceof DataverseNotFoundError) return null;
      throw error;
    }
  }

  /**
   * Returns the first active value record that exactly matches the provided context,
   * or null if no such record exists. Used for context uniqueness enforcement.
   */
  async findMatchingContext(params: TokenValueContextQuery): Promise<TokenValue | null> {
    const filter = buildContextFilter(params);

    const result = await this.dataverse.getList<DataverseTokenValue>(
      VALUE_ENTITY,
      {
        select: SELECT_FIELDS as string[],
        filter,
        top: 1,
      },
    );

    return result.value[0] ? mapToValue(result.value[0], '') : null;
  }

  /**
   * Creates a new token value record in Dataverse.
   * Uses odata.bind to set the lookup to qdb_token_definitions.
   *
   * Note: MSCRM.SolutionUniqueName header omitted — see TokenDefinitionRepository for rationale.
   */
  async create(payload: CreateTokenValuePayload): Promise<TokenValue> {
    const body = buildCreatePayload(payload);
    const created = await this.dataverse.create<DataverseTokenValue>(VALUE_ENTITY, body);
    return mapToValue(created, payload.definitionId);
  }

  /**
   * Soft-deletes a token value by setting qdb_isactive=false and statecode=1.
   */
  async deactivate(id: string): Promise<void> {
    await this.dataverse.update(VALUE_ENTITY, id, {
      qdb_isactive: false,
      statecode: 1,
      statuscode: 2,
    });
  }

  /**
   * Soft-deletes all active token values for a given definition.
   * Used for cascade deactivation when a definition is soft-deleted (AC-017).
   * Fetches active values then PATCHes each individually (no OData $batch support yet).
   */
  async deactivateAllForDefinition(definitionId: string): Promise<void> {
    const activeValues = await this.findByDefinitionId(definitionId, true);

    await Promise.all(activeValues.map((v) => this.deactivate(v.id)));
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapToValue(record: DataverseTokenValue, fallbackDefinitionId: string): TokenValue {
  return {
    id: record.qdb_token_valuesid,
    definitionId: record['_qdb_tokendefinitionid_value'] ?? fallbackDefinitionId,
    definitionSlug: '',
    level: record.qdb_level,
    renderTarget: record.qdb_rendertarget ?? null,
    category: record.qdb_category ?? null,
    componentSlug: record.qdb_componentslug ?? null,
    serviceSlug: record.qdb_serviceslug ?? null,
    locale: record.qdb_locale ?? null,
    value: record.qdb_value,
    publishedOn: record.qdb_publishedon ?? null,
    publishedBy: record.qdb_publishedby ?? null,
    isActive: record.qdb_isactive,
    createdOn: record.createdon,
    modifiedOn: record.modifiedon,
  };
}

// ---------------------------------------------------------------------------
// OData filter builders
// ---------------------------------------------------------------------------

function buildContextFilter(params: TokenValueContextQuery): string {
  const parts: string[] = [
    `_qdb_tokendefinitionid_value eq ${params.definitionId}`,
    `qdb_level eq ${params.level}`,
    'statecode eq 0',
    'qdb_isactive eq true',
  ];

  if (params.renderTarget !== undefined) {
    parts.push(
      params.renderTarget === null
        ? 'qdb_rendertarget eq null'
        : `qdb_rendertarget eq '${escapeODataString(params.renderTarget)}'`,
    );
  }

  if (params.category !== undefined) {
    parts.push(
      params.category === null
        ? 'qdb_category eq null'
        : `qdb_category eq ${params.category}`,
    );
  }

  if (params.componentSlug !== undefined) {
    parts.push(
      params.componentSlug === null
        ? 'qdb_componentslug eq null'
        : `qdb_componentslug eq '${escapeODataString(params.componentSlug)}'`,
    );
  }

  if (params.serviceSlug !== undefined) {
    parts.push(
      params.serviceSlug === null
        ? 'qdb_serviceslug eq null'
        : `qdb_serviceslug eq '${escapeODataString(params.serviceSlug)}'`,
    );
  }

  if (params.locale !== undefined) {
    parts.push(
      params.locale === null
        ? 'qdb_locale eq null'
        : `qdb_locale eq '${escapeODataString(params.locale)}'`,
    );
  }

  return parts.join(' and ');
}

function buildCreatePayload(payload: CreateTokenValuePayload): Record<string, unknown> {
  return {
    [`qdb_TokenDefinitionId@odata.bind`]: `/${DEFINITION_ENTITY}(${payload.definitionId})`,
    qdb_level: payload.level,
    ...(payload.renderTarget !== undefined ? { qdb_rendertarget: payload.renderTarget } : {}),
    ...(payload.category !== undefined ? { qdb_category: payload.category } : {}),
    ...(payload.componentSlug !== undefined ? { qdb_componentslug: payload.componentSlug } : {}),
    ...(payload.serviceSlug !== undefined ? { qdb_serviceslug: payload.serviceSlug } : {}),
    ...(payload.locale !== undefined ? { qdb_locale: payload.locale } : {}),
    qdb_value: payload.value,
    qdb_isactive: true,
  };
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
