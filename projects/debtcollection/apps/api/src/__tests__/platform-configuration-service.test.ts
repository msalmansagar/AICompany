import { describe, expect, it } from 'vitest';
import type { CrmQuery, CrmRecord, ICrmAdapter } from '@dcp/domain';
import { PlatformConfigurationService } from '../services/PlatformConfigurationService.js';

/** Option values as provisioned under the QDB publisher on 2026-09-17. */
const ORG_CODE_HL = 100000140;
const PLATFORM_CLOUD = 100000121;
const PLATFORM_ONPREM = 100000120;
const BUSINESS_OBJECT_CUSTOMER = 100000380;
const ACCESS_MODE_READ = 100000400;
const SNAPSHOT_POLICY_ELIGIBLE_ONLY = 100000281;

const configurationRow: CrmRecord = {
  qdb_platformtype: PLATFORM_CLOUD,
  qdb_organizationcode: ORG_CODE_HL,
  qdb_customerentity: 'contacts',
  qdb_customerbusinessidfield: 'qdb_qid',
  qdb_facilityentity: null,
  qdb_snapshotpolicy: SNAPSHOT_POLICY_ELIGIBLE_ONLY,
  qdb_isactive: true,
};

const mappingRow: CrmRecord = {
  qdb_businessobject: BUSINESS_OBJECT_CUSTOMER,
  qdb_canonicalfield: 'businessId',
  qdb_crmentitylogicalname: 'contact',
  qdb_crmfieldlogicalname: 'qdb_qid',
  qdb_isrequired: true,
  qdb_accessmode: ACCESS_MODE_READ,
};

/** Records what was asked for and answers with whatever the test supplies. */
class FakeCrmAdapter implements ICrmAdapter {
  readonly queries: { entity: string; query: CrmQuery }[] = [];

  constructor(private readonly rowsByEntity: Record<string, CrmRecord[]>) {}

  async retrieveMultiple(entity: string, query: CrmQuery): Promise<CrmRecord[]> {
    this.queries.push({ entity, query });
    return this.rowsByEntity[entity] ?? [];
  }

  async retrieve(): Promise<CrmRecord | null> { throw new Error('not used'); }
  async retrieveByKey(): Promise<CrmRecord | null> { throw new Error('not used'); }
  async create(): Promise<string> { throw new Error('not used'); }
  async update(): Promise<void> { throw new Error('not used'); }
  async execute(): Promise<unknown> { throw new Error('not used'); }
}

function buildService(rows: Record<string, CrmRecord[]>, apiVersion = '9.2') {
  const crm = new FakeCrmAdapter(rows);
  const service = new PlatformConfigurationService(crm, { apiVersion, cacheTtlMs: 60_000 });
  return { crm, service };
}

const happyRows = {
  qdb_platformconfigurations: [configurationRow],
  qdb_platformmappings: [mappingRow],
};

describe('PlatformConfigurationService', () => {
  it('resolves the customer master from configuration rather than a constant', async () => {
    const { service } = buildService(happyRows);

    const configuration = await service.getConfiguration('HL');

    expect(configuration.customerEntity).toBe('contacts');
  });

  it('translates the platform type choice into the canonical vocabulary', async () => {
    const { service } = buildService({
      ...happyRows,
      qdb_platformconfigurations: [{ ...configurationRow, qdb_platformtype: PLATFORM_ONPREM }],
    });

    const configuration = await service.getConfiguration('HL');

    expect(configuration.platformType).toBe('OnPrem');
  });

  it('carries the api version of the target it was built for', async () => {
    const { service } = buildService(happyRows, '9.1');

    const configuration = await service.getConfiguration('HL');

    expect(configuration.apiVersion).toBe('9.1');
  });

  it('translates the snapshot policy choice', async () => {
    const { service } = buildService(happyRows);

    const configuration = await service.getConfiguration('HL');

    expect(configuration.snapshotPolicy).toBe('EligibleOnly');
  });

  it('leaves an unconfigured facility master absent rather than inventing one', async () => {
    const { service } = buildService(happyRows);

    const configuration = await service.getConfiguration('HL');

    expect(configuration.facilityEntity).toBeUndefined();
  });

  it('filters the configuration query by the organisation choice value', async () => {
    const { crm, service } = buildService(happyRows);

    await service.getConfiguration('HL');

    expect(crm.queries[0]?.query.filter).toContain(String(ORG_CODE_HL));
  });

  it('returns the mappings the organisation has published', async () => {
    const { service } = buildService(happyRows);

    const configuration = await service.getConfiguration('HL');

    expect(configuration.mappings).toEqual([{
      businessObject: 'Customer',
      canonicalField: 'businessId',
      entity: 'contact',
      field: 'qdb_qid',
      isRequired: true,
      accessMode: 'Read',
    }]);
  });

  it('skips a mapping row whose business object this version does not model', async () => {
    const { service } = buildService({
      ...happyRows,
      qdb_platformmappings: [{ ...mappingRow, qdb_businessobject: 999999999 }],
    });

    const configuration = await service.getConfiguration('HL');

    expect(configuration.mappings).toEqual([]);
  });

  it('refuses to guess when the organisation has no active configuration row', async () => {
    const { service } = buildService({ qdb_platformconfigurations: [], qdb_platformmappings: [] });

    await expect(service.getConfiguration('HL')).rejects.toThrow(/No active qdb_platformconfiguration/);
  });

  it('refuses to choose when more than one configuration row is active', async () => {
    const { service } = buildService({
      ...happyRows,
      qdb_platformconfigurations: [configurationRow, configurationRow],
    });

    await expect(service.getConfiguration('HL')).rejects.toThrow(/More than one active/);
  });

  it('refuses to infer the target when the platform type is not set', async () => {
    const { service } = buildService({
      ...happyRows,
      qdb_platformconfigurations: [{ ...configurationRow, qdb_platformtype: null }],
    });

    await expect(service.getConfiguration('HL')).rejects.toThrow(/no platform type/);
  });

  it('reads the organisation once and serves the second call from cache', async () => {
    const { crm, service } = buildService(happyRows);

    await service.getConfiguration('HL');
    await service.getConfiguration('HL');

    expect(crm.queries).toHaveLength(2); // one configuration read, one mapping read
  });

  it('reads again after the cache is cleared', async () => {
    const { crm, service } = buildService(happyRows);

    await service.getConfiguration('HL');
    service.clearCache();
    await service.getConfiguration('HL');

    expect(crm.queries).toHaveLength(4);
  });
});

describe('PlatformConfigurationService — Phase 2 settings', () => {
  it('parses the feature-flag JSON so Collection settings can be read from it', async () => {
    const { service } = buildService({
      ...happyRows,
      qdb_platformconfigurations: [{ ...configurationRow, qdb_featureflags: '{"snapshotKeyComposition":["sourceSystem","facilityNumber","snapshotDate"]}' }],
    });
    const configuration = await service.getConfiguration('HL');
    expect(configuration.featureFlags).toEqual({ snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'snapshotDate'] });
  });

  it('refuses malformed feature-flag JSON rather than proceeding with an empty bag', async () => {
    const { service } = buildService({
      ...happyRows,
      qdb_platformconfigurations: [{ ...configurationRow, qdb_featureflags: '{not json' }],
    });
    await expect(service.getConfiguration('HL')).rejects.toThrow(/not valid JSON/);
  });

  it('reads the deployment default customer type from its choice value', async () => {
    const { service } = buildService({
      ...happyRows,
      qdb_platformconfigurations: [{ ...configurationRow, qdb_customertype: 100000020 }],
    });
    expect((await service.getConfiguration('HL')).defaultCustomerType).toBe('Individual');
  });
});
