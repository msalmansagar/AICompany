import type { DataverseClient } from '@portal/dataverse-client';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type {
  ComponentDefinitionSummary,
  ComponentDefinitionDetail,
  ComponentVersionSummary,
  ComponentVersionDetail,
} from '@portal/types';
import Ajv from 'ajv';

const DEFINITIONS_ENTITY = 'qdb_component_definitionses';
const VERSIONS_ENTITY = 'qdb_component_versionses';

const ajv = new Ajv();

// ---------------------------------------------------------------------------
// Dataverse record shapes
// ---------------------------------------------------------------------------

interface DataverseDefinition {
  qdb_component_definitionsid: string;
  qdb_name: string;
  qdb_displayname: string;
  qdb_displaynamear: string | null;
  qdb_description: string | null;
  qdb_descriptionar: string | null;
  qdb_category: number;
  qdb_rendertargets: string;
  statecode: number;
  createdon: string;
  modifiedon: string;
}

interface DataverseVersion {
  qdb_component_versionsid: string;
  qdb_versionnumber: string;
  qdb_propsschema: string | null;
  qdb_defaultprops: string | null;
  qdb_bundleurl: string | null;
  qdb_deprecatedon: string | null;
  qdb_islatest: boolean;
  qdb_changelog: string | null;
  '_qdb_definitionid_value': string;
  statecode: number;
  createdon: string;
}

// Re-export the shared types so routes can import from one place
export type {
  ComponentDefinitionSummary,
  ComponentDefinitionDetail,
  ComponentVersionSummary,
  ComponentVersionDetail,
} from '@portal/types';

export interface CreateDefinitionBody {
  name: string;
  displayName: string;
  displayNameAr?: string | undefined;
  descriptionEn?: string | undefined;
  descriptionAr?: string | undefined;
  category: number;
  renderTargets: string[];
}

export interface PatchDefinitionBody {
  displayName?: string | undefined;
  displayNameAr?: string | undefined;
  descriptionEn?: string | undefined;
  descriptionAr?: string | undefined;
  renderTargets?: string[] | undefined;
}

export interface CreateVersionBody {
  versionNumber: string;
  propsSchema?: string | undefined;
  defaultProps?: string | undefined;
  bundleUrl?: string | undefined;
  changeLog?: string | undefined;
}

export interface PatchVersionBody {
  changeLog?: string | undefined;
  bundleUrl?: string | undefined;
  deprecatedOn?: string | undefined;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class RegistryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ComponentRegistryService {
  private readonly dataverse: DataverseClient;

  constructor(dataverse: DataverseClient) {
    this.dataverse = dataverse;
  }

  async listDefinitions(
    params: { category?: number; top: number; skip: number },
    correlationId: string,
  ): Promise<{ items: ComponentDefinitionSummary[]; total: number }> {
    let filter = 'statecode eq 0';
    if (params.category !== undefined) {
      filter += ` and qdb_category eq ${params.category}`;
    }

    // Dataverse OData v9.2 does not support $skip — cursor pagination via
    // $skiptoken (from @odata.nextLink) is the correct approach. The skip param
    // is accepted by the API layer for future cursor implementation; ignored here.
    const result = await this.dataverse.getList<DataverseDefinition>(
      DEFINITIONS_ENTITY,
      {
        select: [
          'qdb_component_definitionsid',
          'qdb_name',
          'qdb_displayname',
          'qdb_displaynamear',
          'qdb_category',
          'qdb_rendertargets',
          'statecode',
          'createdon',
          'modifiedon',
        ],
        filter,
        orderBy: 'qdb_name asc',
        top: params.top,
        count: true,
      },
      { correlationId },
    );

    return {
      items: result.value.map(mapToDefinitionSummary),
      total: result['@odata.count'] ?? result.value.length,
    };
  }

  async getDefinitionById(id: string, correlationId: string): Promise<ComponentDefinitionDetail> {
    const record = await this.dataverse.getById<DataverseDefinition>(
      DEFINITIONS_ENTITY,
      id,
      {
        select: [
          'qdb_component_definitionsid',
          'qdb_name',
          'qdb_displayname',
          'qdb_displaynamear',
          'qdb_description',
          'qdb_descriptionar',
          'qdb_category',
          'qdb_rendertargets',
          'statecode',
          'createdon',
          'modifiedon',
        ],
      },
      { correlationId },
    );
    return mapToDefinitionDetail(record);
  }

  async createDefinition(
    body: CreateDefinitionBody,
    correlationId: string,
  ): Promise<ComponentDefinitionDetail> {
    const existing = await this.findDefinitionByName(body.name, correlationId);
    if (existing !== null) {
      throw new RegistryError('duplicate_component_name', `Component '${body.name}' already exists`, 409);
    }

    // Dataverse POST returns 204 — DataverseClient returns undefined.
    // Re-fetch by name to get the full record with its assigned GUID.
    await this.dataverse.create<unknown>(
      DEFINITIONS_ENTITY,
      {
        qdb_name: body.name,
        qdb_displayname: body.displayName,
        ...(body.displayNameAr !== undefined && { qdb_displaynamear: body.displayNameAr }),
        ...(body.descriptionEn !== undefined && { qdb_description: body.descriptionEn }),
        ...(body.descriptionAr !== undefined && { qdb_descriptionar: body.descriptionAr }),
        qdb_category: body.category,
        qdb_rendertargets: JSON.stringify(body.renderTargets),
      },
      { correlationId },
    );

    const newRecord = await this.findDefinitionByName(body.name, correlationId);
    if (newRecord === null) {
      throw new RegistryError('create_failed', 'Component definition was created but could not be retrieved', 500);
    }
    return this.getDefinitionById(newRecord.qdb_component_definitionsid, correlationId);
  }

  async patchDefinition(
    id: string,
    body: PatchDefinitionBody,
    correlationId: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (body.displayName !== undefined) patch['qdb_displayname'] = body.displayName;
    if (body.displayNameAr !== undefined) patch['qdb_displaynamear'] = body.displayNameAr;
    if (body.descriptionEn !== undefined) patch['qdb_description'] = body.descriptionEn;
    if (body.descriptionAr !== undefined) patch['qdb_descriptionar'] = body.descriptionAr;
    if (body.renderTargets !== undefined) patch['qdb_rendertargets'] = JSON.stringify(body.renderTargets);

    if (Object.keys(patch).length === 0) return;

    await this.dataverse.update(DEFINITIONS_ENTITY, id, patch, { correlationId });
  }

  async deactivateDefinition(id: string, correlationId: string): Promise<void> {
    const activeVersions = await this.dataverse.getList<{ qdb_component_versionsid: string }>(
      VERSIONS_ENTITY,
      {
        select: ['qdb_component_versionsid'],
        filter: `_qdb_definitionid_value eq ${id} and statecode eq 0`,
        top: 1,
      },
      { correlationId },
    );

    if (activeVersions.value.length > 0) {
      throw new RegistryError(
        'component_has_versions',
        'Cannot deactivate a component definition that has active versions. Deactivate all versions first.',
        409,
      );
    }

    await this.dataverse.update(
      DEFINITIONS_ENTITY,
      id,
      { statecode: 1, statuscode: 2 },
      { correlationId },
    );
  }

  async listVersions(
    definitionId: string,
    params: { top: number; skip: number },
    correlationId: string,
  ): Promise<{ items: ComponentVersionSummary[]; total: number }> {
    const result = await this.dataverse.getList<DataverseVersion>(
      VERSIONS_ENTITY,
      {
        select: [
          'qdb_component_versionsid',
          'qdb_versionnumber',
          'qdb_islatest',
          'qdb_changelog',
          'qdb_bundleurl',
          'qdb_deprecatedon',
          '_qdb_definitionid_value',
          'statecode',
          'createdon',
        ],
        filter: `_qdb_definitionid_value eq ${definitionId} and statecode eq 0`,
        orderBy: 'createdon desc',
        top: params.top,
        count: true,
      },
      { correlationId },
    );

    return {
      items: result.value.map(mapToVersionSummary),
      total: result['@odata.count'] ?? result.value.length,
    };
  }

  async getVersionById(
    definitionId: string,
    versionId: string,
    correlationId: string,
  ): Promise<ComponentVersionDetail> {
    const record = await this.dataverse.getById<DataverseVersion>(
      VERSIONS_ENTITY,
      versionId,
      {
        select: [
          'qdb_component_versionsid',
          'qdb_versionnumber',
          'qdb_propsschema',
          'qdb_defaultprops',
          'qdb_bundleurl',
          'qdb_deprecatedon',
          'qdb_islatest',
          'qdb_changelog',
          '_qdb_definitionid_value',
          'statecode',
          'createdon',
        ],
      },
      { correlationId },
    );

    if (record['_qdb_definitionid_value'] !== definitionId) {
      throw new DataverseNotFoundError(VERSIONS_ENTITY, versionId);
    }

    return mapToVersionDetail(record);
  }

  async createVersion(
    definitionId: string,
    body: CreateVersionBody,
    correlationId: string,
  ): Promise<ComponentVersionDetail> {
    // Validate definition exists
    await this.getDefinitionById(definitionId, correlationId);

    // Check for duplicate version number
    const duplicate = await this.dataverse.getList<{ qdb_component_versionsid: string }>(
      VERSIONS_ENTITY,
      {
        select: ['qdb_component_versionsid'],
        filter: `_qdb_definitionid_value eq ${definitionId} and qdb_versionnumber eq '${escapeODataString(body.versionNumber)}' and statecode eq 0`,
        top: 1,
      },
      { correlationId },
    );

    if (duplicate.value.length > 0) {
      throw new RegistryError(
        'duplicate_version_number',
        `Version '${body.versionNumber}' already exists for this component`,
        409,
      );
    }

    if (body.propsSchema !== undefined) {
      validatePropsSchema(body.propsSchema);
    }

    // Dataverse POST returns 204 — re-fetch by version number to get the full record.
    await this.dataverse.create<unknown>(
      VERSIONS_ENTITY,
      {
        qdb_versionnumber: body.versionNumber,
        ...(body.propsSchema !== undefined && { qdb_propsschema: body.propsSchema }),
        ...(body.defaultProps !== undefined && { qdb_defaultprops: body.defaultProps }),
        ...(body.bundleUrl !== undefined && { qdb_bundleurl: body.bundleUrl }),
        ...(body.changeLog !== undefined && { qdb_changelog: body.changeLog }),
        qdb_islatest: false,
        // Navigation property bind uses SchemaName (PascalCase), not logical name
        'qdb_DefinitionId@odata.bind': `/${DEFINITIONS_ENTITY}(${definitionId})`,
      },
      { correlationId },
    );

    const newVersionList = await this.dataverse.getList<DataverseVersion>(
      VERSIONS_ENTITY,
      {
        select: [
          'qdb_component_versionsid', 'qdb_versionnumber', 'qdb_propsschema',
          'qdb_defaultprops', 'qdb_bundleurl', 'qdb_deprecatedon',
          'qdb_islatest', 'qdb_changelog', '_qdb_definitionid_value', 'statecode', 'createdon',
        ],
        filter: `_qdb_definitionid_value eq ${definitionId} and qdb_versionnumber eq '${escapeODataString(body.versionNumber)}' and statecode eq 0`,
        top: 1,
      },
      { correlationId },
    );

    const newVersion = newVersionList.value[0];
    if (newVersion === undefined) {
      throw new RegistryError('create_failed', 'Version was created but could not be retrieved', 500);
    }
    return mapToVersionDetail(newVersion);
  }

  async patchVersion(
    definitionId: string,
    versionId: string,
    body: PatchVersionBody,
    correlationId: string,
  ): Promise<void> {
    await this.getVersionById(definitionId, versionId, correlationId);

    const patch: Record<string, unknown> = {};
    if (body.changeLog !== undefined) patch['qdb_changelog'] = body.changeLog;
    if (body.bundleUrl !== undefined) patch['qdb_bundleurl'] = body.bundleUrl;
    if (body.deprecatedOn !== undefined) patch['qdb_deprecatedon'] = body.deprecatedOn;

    if (Object.keys(patch).length === 0) return;

    await this.dataverse.update(VERSIONS_ENTITY, versionId, patch, { correlationId });
  }

  async deactivateVersion(
    definitionId: string,
    versionId: string,
    correlationId: string,
  ): Promise<void> {
    const version = await this.getVersionById(definitionId, versionId, correlationId);

    if (version.isLatest) {
      throw new RegistryError(
        'cannot_delete_latest_version',
        'Cannot deactivate the latest version. Promote another version to latest first.',
        409,
      );
    }

    await this.dataverse.update(
      VERSIONS_ENTITY,
      versionId,
      { statecode: 1, statuscode: 2 },
      { correlationId },
    );
  }

  async setLatestVersion(
    definitionId: string,
    versionId: string,
    correlationId: string,
  ): Promise<void> {
    // Verify the target version belongs to the definition
    await this.getVersionById(definitionId, versionId, correlationId);

    // Find the current latest version for this definition
    const currentLatest = await this.dataverse.getList<{ qdb_component_versionsid: string }>(
      VERSIONS_ENTITY,
      {
        select: ['qdb_component_versionsid'],
        filter: `_qdb_definitionid_value eq ${definitionId} and qdb_islatest eq true and statecode eq 0`,
        top: 1,
      },
      { correlationId },
    );

    const currentLatestId = currentLatest.value[0]?.qdb_component_versionsid;

    if (currentLatestId === versionId) {
      // Already the latest — no writes needed
      return;
    }

    if (currentLatestId === undefined) {
      // No prior latest exists — single write is sufficient
      await this.dataverse.update(VERSIONS_ENTITY, versionId, { qdb_islatest: true }, { correlationId });
      return;
    }

    // Two writes needed: clear the old flag and set the new one.
    // Use a $batch changeSet so both succeed or both fail atomically —
    // sequential PATCHes could leave the dataset with zero or two latest versions
    // if a failure occurs between them (GGAP-001 / DXP-P1-001 C3).
    await this.dataverse.executeBatch(
      [
        { method: 'PATCH', entity: VERSIONS_ENTITY, id: currentLatestId, body: { qdb_islatest: false } },
        { method: 'PATCH', entity: VERSIONS_ENTITY, id: versionId, body: { qdb_islatest: true } },
      ],
      { correlationId },
    );
  }

  async getLatestVersion(
    definitionId: string,
    correlationId: string,
  ): Promise<ComponentVersionDetail> {
    const result = await this.dataverse.getList<DataverseVersion>(
      VERSIONS_ENTITY,
      {
        select: [
          'qdb_component_versionsid', 'qdb_versionnumber', 'qdb_propsschema',
          'qdb_defaultprops', 'qdb_bundleurl', 'qdb_deprecatedon',
          'qdb_islatest', 'qdb_changelog', '_qdb_definitionid_value', 'statecode', 'createdon',
        ],
        filter: `_qdb_definitionid_value eq ${definitionId} and qdb_islatest eq true and statecode eq 0 and qdb_deprecatedon eq null`,
        top: 1,
      },
      { correlationId },
    );

    const version = result.value[0];
    if (version === undefined) {
      throw new RegistryError('no_active_latest_version', 'No active latest version found for this component', 404);
    }

    return mapToVersionDetail(version);
  }

  private async findDefinitionByName(
    name: string,
    correlationId: string,
  ): Promise<DataverseDefinition | null> {
    const result = await this.dataverse.getList<DataverseDefinition>(
      DEFINITIONS_ENTITY,
      {
        select: ['qdb_component_definitionsid', 'qdb_name'],
        filter: `qdb_name eq '${escapeODataString(name)}'`,
        top: 1,
      },
      { correlationId },
    );
    return result.value[0] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePropsSchema(schemaString: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaString) as unknown;
  } catch {
    throw new RegistryError('invalid_props_schema', 'propsSchema is not valid JSON', 400);
  }

  try {
    ajv.compile(parsed as object);
  } catch {
    throw new RegistryError('invalid_props_schema', 'propsSchema is not a valid JSON Schema', 400);
  }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapToDefinitionSummary(record: DataverseDefinition): ComponentDefinitionSummary {
  return {
    id: record.qdb_component_definitionsid,
    name: record.qdb_name,
    displayName: record.qdb_displayname,
    displayNameAr: record.qdb_displaynamear ?? null,
    category: record.qdb_category,
    renderTargets: parseRenderTargets(record.qdb_rendertargets),
    createdOn: record.createdon,
    modifiedOn: record.modifiedon,
  };
}

function mapToDefinitionDetail(record: DataverseDefinition): ComponentDefinitionDetail {
  return {
    ...mapToDefinitionSummary(record),
    descriptionEn: record.qdb_description ?? null,
    descriptionAr: record.qdb_descriptionar ?? null,
    isActive: record.statecode === 0,
  };
}

function mapToVersionSummary(record: DataverseVersion): ComponentVersionSummary {
  return {
    id: record.qdb_component_versionsid,
    versionNumber: record.qdb_versionnumber,
    isLatest: record.qdb_islatest,
    changeLog: record.qdb_changelog ?? null,
    bundleUrl: record.qdb_bundleurl ?? null,
    deprecatedOn: record.qdb_deprecatedon ?? null,
    definitionId: record['_qdb_definitionid_value'],
    createdOn: record.createdon,
  };
}

function mapToVersionDetail(record: DataverseVersion): ComponentVersionDetail {
  return {
    ...mapToVersionSummary(record),
    propsSchema: record.qdb_propsschema ?? null,
    defaultProps: record.qdb_defaultprops ?? null,
  };
}

function parseRenderTargets(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
