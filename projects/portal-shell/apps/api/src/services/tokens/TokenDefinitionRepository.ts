/**
 * TokenDefinitionRepository — Dataverse data access for qdb_token_definitions.
 *
 * Field names follow the Dataverse OData logical name convention (SchemaName.toLowerCase()).
 * See Section 6.2 of phase-3-arch.md for the full entity schema.
 *
 * Entity set name: qdb_token_definitionses
 * (Dataverse appends 'es' when the logical name ends in 's')
 */

import type { DataverseClient } from '@portal/dataverse-client';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type {
  TokenDefinition,
  CreateTokenDefinitionPayload,
  UpdateTokenDefinitionPayload,
} from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Entity set name
// ---------------------------------------------------------------------------

const DEFINITION_ENTITY = 'qdb_token_definitionses';

// ---------------------------------------------------------------------------
// Dataverse record shape
// ---------------------------------------------------------------------------

interface DataverseTokenDefinition {
  qdb_token_definitionsid: string;
  qdb_name: string;
  qdb_slug: string;
  qdb_tokentype: number;
  qdb_description: string | null;
  qdb_defaultvalue: string | null;
  qdb_isactive: boolean;
  statecode: number;
  createdon: string;
  modifiedon: string;
}

// ---------------------------------------------------------------------------
// Field selection
// ---------------------------------------------------------------------------

const SELECT_FIELDS: (keyof DataverseTokenDefinition)[] = [
  'qdb_token_definitionsid',
  'qdb_name',
  'qdb_slug',
  'qdb_tokentype',
  'qdb_description',
  'qdb_defaultvalue',
  'qdb_isactive',
  'statecode',
  'createdon',
  'modifiedon',
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ITokenDefinitionRepository {
  findAll(options: { activeOnly: boolean }): Promise<TokenDefinition[]>;
  findBySlug(slug: string): Promise<TokenDefinition | null>;
  findById(id: string): Promise<TokenDefinition | null>;
  countActive(): Promise<number>;
  create(payload: CreateTokenDefinitionPayload): Promise<TokenDefinition>;
  update(id: string, payload: UpdateTokenDefinitionPayload): Promise<void>;
  deactivate(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Dataverse implementation of ITokenDefinitionRepository.
 * All Dataverse calls go through the shared DataverseClient (OData v9.2).
 */
export class DataverseTokenDefinitionRepository implements ITokenDefinitionRepository {
  private readonly dataverse: DataverseClient;

  constructor(dataverse: DataverseClient) {
    this.dataverse = dataverse;
  }

  /**
   * Returns all token definition records.
   * When activeOnly is true, filters to statecode eq 0 (active Dataverse records).
   */
  async findAll(options: { activeOnly: boolean }): Promise<TokenDefinition[]> {
    const filter = options.activeOnly ? 'statecode eq 0' : undefined;

    const result = await this.dataverse.getList<DataverseTokenDefinition>(
      DEFINITION_ENTITY,
      {
        select: SELECT_FIELDS as string[],
        filter,
        orderBy: 'qdb_slug asc',
      },
    );

    return result.value.map(mapToDefinition);
  }

  /**
   * Returns a single token definition by its kebab-case slug, or null if not found.
   * Only searches active records (statecode eq 0).
   */
  async findBySlug(slug: string): Promise<TokenDefinition | null> {
    const result = await this.dataverse.getList<DataverseTokenDefinition>(
      DEFINITION_ENTITY,
      {
        select: SELECT_FIELDS as string[],
        filter: `qdb_slug eq '${escapeODataString(slug)}' and statecode eq 0`,
        top: 1,
      },
    );

    return result.value[0] ? mapToDefinition(result.value[0]) : null;
  }

  /**
   * Returns a single token definition by its Dataverse GUID, or null if not found.
   */
  async findById(id: string): Promise<TokenDefinition | null> {
    try {
      const record = await this.dataverse.getById<DataverseTokenDefinition>(
        DEFINITION_ENTITY,
        id,
        { select: SELECT_FIELDS as string[] },
      );
      return mapToDefinition(record);
    } catch (error) {
      if (error instanceof DataverseNotFoundError) return null;
      throw error;
    }
  }

  /**
   * Returns the count of active (statecode eq 0) token definition records.
   * Used for soft-limit enforcement (ADR-003-006).
   */
  async countActive(): Promise<number> {
    const result = await this.dataverse.getList<DataverseTokenDefinition>(
      DEFINITION_ENTITY,
      {
        select: ['qdb_token_definitionsid'],
        filter: 'statecode eq 0',
        top: 1,
        count: true,
      },
    );

    return (result as { '@odata.count'?: number })['@odata.count'] ?? result.value.length;
  }

  /**
   * Creates a new token definition record in Dataverse.
   *
   * Note: The MSCRM.SolutionUniqueName header (Article XI of constitution) should
   * be included to ensure the record is created in QdbDxpPlatform. The DataverseClient
   * does not currently expose per-request custom headers. When the client is updated
   * to support this, add: { 'MSCRM.SolutionUniqueName': 'QdbDxpPlatform' }.
   */
  async create(payload: CreateTokenDefinitionPayload): Promise<TokenDefinition> {
    const body = buildCreatePayload(payload);
    const created = await this.dataverse.create<DataverseTokenDefinition>(
      DEFINITION_ENTITY,
      body,
    );
    return mapToDefinition(created);
  }

  /**
   * Updates mutable fields (name, description, defaultValue) on a definition record.
   * slug and tokenType are immutable and must not be included in the payload.
   */
  async update(id: string, payload: UpdateTokenDefinitionPayload): Promise<void> {
    const patch = buildUpdatePayload(payload);
    await this.dataverse.update(DEFINITION_ENTITY, id, patch);
  }

  /**
   * Soft-deletes a token definition by setting qdb_isactive=false and statecode=1.
   */
  async deactivate(id: string): Promise<void> {
    await this.dataverse.update(DEFINITION_ENTITY, id, {
      qdb_isactive: false,
      statecode: 1,
      statuscode: 2,
    });
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapToDefinition(record: DataverseTokenDefinition): TokenDefinition {
  return {
    id: record.qdb_token_definitionsid,
    name: record.qdb_name,
    slug: record.qdb_slug,
    tokenType: record.qdb_tokentype,
    description: record.qdb_description ?? null,
    defaultValue: record.qdb_defaultvalue ?? null,
    isActive: record.qdb_isactive,
    createdOn: record.createdon,
    modifiedOn: record.modifiedon,
  };
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function buildCreatePayload(payload: CreateTokenDefinitionPayload): Record<string, unknown> {
  return {
    qdb_name: payload.name,
    qdb_slug: payload.slug,
    qdb_tokentype: payload.tokenType,
    ...(payload.description !== undefined ? { qdb_description: payload.description } : {}),
    ...(payload.defaultValue !== undefined ? { qdb_defaultvalue: payload.defaultValue } : {}),
    qdb_isactive: true,
  };
}

function buildUpdatePayload(payload: UpdateTokenDefinitionPayload): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (payload.name !== undefined) patch['qdb_name'] = payload.name;
  if (payload.description !== undefined) patch['qdb_description'] = payload.description;
  if (payload.defaultValue !== undefined) patch['qdb_defaultvalue'] = payload.defaultValue;

  return patch;
}

// ---------------------------------------------------------------------------
// OData utility
// ---------------------------------------------------------------------------

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
