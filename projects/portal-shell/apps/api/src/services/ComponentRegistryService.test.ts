// Unit tests for ComponentRegistryService — C6 / GGAP-006 / DXP-P1-001
// All Dataverse calls are intercepted via vi.fn() mocks; no network I/O.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type { DataverseClient, ODataListResult } from '@portal/dataverse-client';
import { ComponentRegistryService, RegistryError } from './ComponentRegistryService.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CORR = 'test-corr-001';
const DEF_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VER_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const NOW = '2026-06-18T10:00:00Z';

const dvDefinition = {
  qdb_component_definitionsid: DEF_ID,
  qdb_name: 'button',
  qdb_displayname: 'Button',
  qdb_displaynamear: null,
  qdb_description: 'A button',
  qdb_descriptionar: null,
  qdb_category: 1,
  qdb_rendertargets: '["portal"]',
  statecode: 0,
  createdon: NOW,
  modifiedon: NOW,
};

const dvVersion = {
  qdb_component_versionsid: VER_ID,
  qdb_versionnumber: '1.0.0',
  qdb_propsschema: null,
  qdb_islatest: false,
  qdb_changelog: null,
  '_qdb_definitionid_value': DEF_ID,
  statecode: 0,
  createdon: NOW,
};

function listOf<T>(...items: T[]): ODataListResult<T> {
  return { value: items, '@odata.count': items.length };
}

function emptyList<T>(): ODataListResult<T> {
  return { value: [] };
}

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

function makeDataverse(): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue(emptyList()),
    getById: vi.fn().mockResolvedValue(dvDefinition),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    executeAction: vi.fn().mockResolvedValue(undefined),
    executeBatch: vi.fn().mockResolvedValue(undefined),
  } as unknown as DataverseClient;
}

// ---------------------------------------------------------------------------
// listDefinitions
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.listDefinitions', () => {
  let dataverse: DataverseClient;
  let service: ComponentRegistryService;

  beforeEach(() => {
    dataverse = makeDataverse();
    service = new ComponentRegistryService(dataverse);
  });

  it('should_return_mapped_summaries_and_count_from_odata_count', async () => {
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      value: [dvDefinition],
      '@odata.count': 5,
    });

    const result = await service.listDefinitions({ top: 20, skip: 0 }, CORR);

    expect(result.total).toBe(5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(DEF_ID);
    expect(result.items[0]?.renderTargets).toEqual(['portal']);
  });

  it('should_fall_back_to_value_length_when_odata_count_is_absent', async () => {
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      value: [dvDefinition],
    });

    const result = await service.listDefinitions({ top: 20, skip: 0 }, CORR);

    expect(result.total).toBe(1);
  });

  it('should_append_category_filter_when_category_is_provided', async () => {
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyList());

    await service.listDefinitions({ category: 2, top: 20, skip: 0 }, CORR);

    const call = (dataverse.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = call[1] as { filter: string };
    expect(options.filter).toContain('qdb_category eq 2');
  });
});

// ---------------------------------------------------------------------------
// getDefinitionById
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.getDefinitionById', () => {
  it('should_return_mapped_definition_detail', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvDefinition);
    const service = new ComponentRegistryService(dataverse);

    const result = await service.getDefinitionById(DEF_ID, CORR);

    expect(result.id).toBe(DEF_ID);
    expect(result.name).toBe('button');
    expect(result.isActive).toBe(true);
    expect(result.descriptionEn).toBe('A button');
    expect(result.renderTargets).toEqual(['portal']);
  });
});

// ---------------------------------------------------------------------------
// createDefinition
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.createDefinition', () => {
  it('should_throw_RegistryError_409_when_name_already_exists', async () => {
    const dataverse = makeDataverse();
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      listOf({ qdb_component_definitionsid: DEF_ID, qdb_name: 'button' }),
    );
    const service = new ComponentRegistryService(dataverse);

    const error = await service
      .createDefinition({ name: 'button', displayName: 'Button', category: 1, renderTargets: ['portal'] }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('duplicate_component_name');
    expect((error as RegistryError).statusCode).toBe(409);
  });

  it('should_create_record_and_return_full_detail_on_success', async () => {
    const dataverse = makeDataverse();
    const getList = dataverse.getList as ReturnType<typeof vi.fn>;
    // 1. Duplicate check: not found
    getList.mockResolvedValueOnce(emptyList());
    // 2. Re-fetch by name after create: found
    getList.mockResolvedValueOnce(listOf({ qdb_component_definitionsid: DEF_ID, qdb_name: 'button' }));
    // 3. getDefinitionById (getById call)
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvDefinition);
    const service = new ComponentRegistryService(dataverse);

    const result = await service.createDefinition(
      { name: 'button', displayName: 'Button', category: 1, renderTargets: ['portal'] },
      CORR,
    );

    expect(result.id).toBe(DEF_ID);
    expect(dataverse.create).toHaveBeenCalledOnce();
  });

  it('should_throw_RegistryError_500_when_re_fetch_after_create_returns_empty', async () => {
    const dataverse = makeDataverse();
    const getList = dataverse.getList as ReturnType<typeof vi.fn>;
    getList.mockResolvedValueOnce(emptyList()); // duplicate check
    getList.mockResolvedValueOnce(emptyList()); // re-fetch fails
    const service = new ComponentRegistryService(dataverse);

    const error = await service
      .createDefinition({ name: 'button', displayName: 'Button', category: 1, renderTargets: ['portal'] }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('create_failed');
    expect((error as RegistryError).statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// patchDefinition
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.patchDefinition', () => {
  it('should_call_update_with_only_the_provided_fields', async () => {
    const dataverse = makeDataverse();
    const service = new ComponentRegistryService(dataverse);

    await service.patchDefinition(DEF_ID, { displayName: 'Updated', renderTargets: ['web'] }, CORR);

    expect(dataverse.update).toHaveBeenCalledOnce();
    const patchArg = (dataverse.update as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(patchArg).toMatchObject({ qdb_displayname: 'Updated', qdb_rendertargets: '["web"]' });
    expect(patchArg).not.toHaveProperty('qdb_descriptionar');
  });

  it('should_return_without_calling_update_when_body_is_empty', async () => {
    const dataverse = makeDataverse();
    const service = new ComponentRegistryService(dataverse);

    await service.patchDefinition(DEF_ID, {}, CORR);

    expect(dataverse.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deactivateDefinition
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.deactivateDefinition', () => {
  it('should_throw_RegistryError_409_when_active_versions_exist', async () => {
    const dataverse = makeDataverse();
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      listOf({ qdb_component_versionsid: VER_ID }),
    );
    const service = new ComponentRegistryService(dataverse);

    const error = await service.deactivateDefinition(DEF_ID, CORR).catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('component_has_versions');
    expect((error as RegistryError).statusCode).toBe(409);
  });

  it('should_update_statecode_to_1_when_no_active_versions_exist', async () => {
    const dataverse = makeDataverse();
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyList());
    const service = new ComponentRegistryService(dataverse);

    await service.deactivateDefinition(DEF_ID, CORR);

    expect(dataverse.update).toHaveBeenCalledWith(
      'qdb_component_definitionses',
      DEF_ID,
      { statecode: 1, statuscode: 2 },
      { correlationId: CORR },
    );
  });
});

// ---------------------------------------------------------------------------
// listVersions
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.listVersions', () => {
  it('should_return_mapped_version_summaries_and_total', async () => {
    const dataverse = makeDataverse();
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      value: [dvVersion],
      '@odata.count': 3,
    });
    const service = new ComponentRegistryService(dataverse);

    const result = await service.listVersions(DEF_ID, { top: 10, skip: 0 }, CORR);

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(VER_ID);
    expect(result.items[0]?.isLatest).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getVersionById
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.getVersionById', () => {
  it('should_return_mapped_version_detail_when_definition_matches', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvVersion);
    const service = new ComponentRegistryService(dataverse);

    const result = await service.getVersionById(DEF_ID, VER_ID, CORR);

    expect(result.id).toBe(VER_ID);
    expect(result.versionNumber).toBe('1.0.0');
    expect(result.propsSchema).toBeNull();
  });

  it('should_throw_DataverseNotFoundError_when_version_belongs_to_different_definition', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...dvVersion,
      '_qdb_definitionid_value': 'other-def-id',
    });
    const service = new ComponentRegistryService(dataverse);

    const error = await service.getVersionById('wrong-def-id', VER_ID, CORR).catch((e) => e);

    expect(error).toBeInstanceOf(DataverseNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// createVersion
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.createVersion', () => {
  it('should_throw_DataverseNotFoundError_when_definition_does_not_exist', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DataverseNotFoundError('qdb_component_definitionses', DEF_ID),
    );
    const service = new ComponentRegistryService(dataverse);

    const error = await service
      .createVersion(DEF_ID, { versionNumber: '1.0.0' }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(DataverseNotFoundError);
  });

  it('should_throw_RegistryError_409_when_version_number_already_exists', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvDefinition);
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      listOf({ qdb_component_versionsid: VER_ID }),
    );
    const service = new ComponentRegistryService(dataverse);

    const error = await service
      .createVersion(DEF_ID, { versionNumber: '1.0.0' }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('duplicate_version_number');
    expect((error as RegistryError).statusCode).toBe(409);
  });

  it('should_throw_RegistryError_400_when_propsSchema_exceeds_4000_chars', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvDefinition);
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyList());
    const service = new ComponentRegistryService(dataverse);

    const error = await service
      .createVersion(DEF_ID, { versionNumber: '1.0.0', propsSchema: 'x'.repeat(4001) }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('props_schema_too_large');
    expect((error as RegistryError).statusCode).toBe(400);
  });

  it('should_throw_RegistryError_400_when_propsSchema_is_not_valid_json', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvDefinition);
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyList());
    const service = new ComponentRegistryService(dataverse);

    const error = await service
      .createVersion(DEF_ID, { versionNumber: '1.0.0', propsSchema: 'not json' }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('invalid_props_schema');
    expect((error as RegistryError).statusCode).toBe(400);
  });

  it('should_throw_RegistryError_400_when_propsSchema_is_valid_json_but_not_a_valid_schema', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvDefinition);
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyList());
    const service = new ComponentRegistryService(dataverse);

    // AJV v6 throws when type is a number — type must be a string or array
    const error = await service
      .createVersion(DEF_ID, { versionNumber: '1.0.0', propsSchema: '{"type":42}' }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('invalid_props_schema');
    expect((error as RegistryError).statusCode).toBe(400);
  });

  it('should_create_and_return_version_detail_on_success', async () => {
    const dataverse = makeDataverse();
    const getById = dataverse.getById as ReturnType<typeof vi.fn>;
    const getList = dataverse.getList as ReturnType<typeof vi.fn>;
    getById.mockResolvedValueOnce(dvDefinition);     // definition exists
    getList.mockResolvedValueOnce(emptyList());       // no duplicate version
    getList.mockResolvedValueOnce(listOf(dvVersion)); // re-fetch after create
    const service = new ComponentRegistryService(dataverse);

    const result = await service.createVersion(DEF_ID, { versionNumber: '1.0.0' }, CORR);

    expect(result.id).toBe(VER_ID);
    expect(result.versionNumber).toBe('1.0.0');
    expect(dataverse.create).toHaveBeenCalledOnce();
  });

  it('should_throw_RegistryError_500_when_re_fetch_after_create_returns_empty', async () => {
    const dataverse = makeDataverse();
    const getById = dataverse.getById as ReturnType<typeof vi.fn>;
    const getList = dataverse.getList as ReturnType<typeof vi.fn>;
    getById.mockResolvedValueOnce(dvDefinition);
    getList.mockResolvedValueOnce(emptyList()); // no duplicate
    getList.mockResolvedValueOnce(emptyList()); // re-fetch fails
    const service = new ComponentRegistryService(dataverse);

    const error = await service
      .createVersion(DEF_ID, { versionNumber: '1.0.0' }, CORR)
      .catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('create_failed');
    expect((error as RegistryError).statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// patchVersion
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.patchVersion', () => {
  it('should_call_update_when_changeLog_is_provided', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvVersion);
    const service = new ComponentRegistryService(dataverse);

    await service.patchVersion(DEF_ID, VER_ID, { changeLog: 'Bug fix' }, CORR);

    expect(dataverse.update).toHaveBeenCalledWith(
      'qdb_component_versionses',
      VER_ID,
      { qdb_changelog: 'Bug fix' },
      { correlationId: CORR },
    );
  });

  it('should_return_early_without_calling_update_when_changeLog_is_undefined', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvVersion);
    const service = new ComponentRegistryService(dataverse);

    await service.patchVersion(DEF_ID, VER_ID, {}, CORR);

    expect(dataverse.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deactivateVersion
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.deactivateVersion', () => {
  it('should_throw_RegistryError_409_when_version_isLatest', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...dvVersion,
      qdb_islatest: true,
    });
    const service = new ComponentRegistryService(dataverse);

    const error = await service.deactivateVersion(DEF_ID, VER_ID, CORR).catch((e) => e);

    expect(error).toBeInstanceOf(RegistryError);
    expect((error as RegistryError).code).toBe('cannot_delete_latest_version');
    expect((error as RegistryError).statusCode).toBe(409);
  });

  it('should_update_statecode_to_1_when_version_is_not_latest', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvVersion);
    const service = new ComponentRegistryService(dataverse);

    await service.deactivateVersion(DEF_ID, VER_ID, CORR);

    expect(dataverse.update).toHaveBeenCalledWith(
      'qdb_component_versionses',
      VER_ID,
      { statecode: 1, statuscode: 2 },
      { correlationId: CORR },
    );
  });
});

// ---------------------------------------------------------------------------
// setLatestVersion
// ---------------------------------------------------------------------------

describe('ComponentRegistryService.setLatestVersion', () => {
  it('should_return_early_when_target_version_is_already_latest', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvVersion);
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      listOf({ qdb_component_versionsid: VER_ID }),
    );
    const service = new ComponentRegistryService(dataverse);

    await service.setLatestVersion(DEF_ID, VER_ID, CORR);

    expect(dataverse.update).not.toHaveBeenCalled();
    expect(dataverse.executeBatch).not.toHaveBeenCalled();
  });

  it('should_call_single_update_when_no_prior_latest_exists', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvVersion);
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyList());
    const service = new ComponentRegistryService(dataverse);

    await service.setLatestVersion(DEF_ID, VER_ID, CORR);

    expect(dataverse.update).toHaveBeenCalledWith(
      'qdb_component_versionses',
      VER_ID,
      { qdb_islatest: true },
      { correlationId: CORR },
    );
    expect(dataverse.executeBatch).not.toHaveBeenCalled();
  });

  it('should_call_executeBatch_to_atomically_swap_latest_flags', async () => {
    const dataverse = makeDataverse();
    (dataverse.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(dvVersion);
    (dataverse.getList as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      listOf({ qdb_component_versionsid: VER_ID_2 }),
    );
    const service = new ComponentRegistryService(dataverse);

    await service.setLatestVersion(DEF_ID, VER_ID, CORR);

    expect(dataverse.executeBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: VER_ID_2, body: { qdb_islatest: false } }),
        expect.objectContaining({ id: VER_ID, body: { qdb_islatest: true } }),
      ]),
      { correlationId: CORR },
    );
    expect(dataverse.update).not.toHaveBeenCalled();
  });
});
