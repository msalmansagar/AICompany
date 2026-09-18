import { describe, expect, it } from 'vitest';
import { CollectionSettingsError } from '@dcp/domain';
import { CollectionConfigurationService } from '../services/collection/index.js';
import { requireRulesetCode } from '../services/collection/CollectionConfigurationService.js';
import { PlatformConfigurationService } from '../services/PlatformConfigurationService.js';
import { FakeCrmAdapter } from './helpers/FakeCrmAdapter.js';

const FLAGS = {
  snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'snapshotDate'],
  ruleEngineOperations: { eligibility: 'qdb_dcp_EvaluateEligibility', strategy: 'qdb_dcp_SelectStrategy' },
};

function buildService(overrides: Record<string, unknown> = {}) {
  const crm = new FakeCrmAdapter();
  crm.seed('qdb_platformconfigurations', 'qdb_platformconfigurationid', {
    qdb_platformtype: 100000121,
    qdb_organizationcode: 100000140,
    qdb_customerentity: 'contacts',
    qdb_customerbusinessidfield: 'governmentid',
    qdb_eligibilityrulesetcode: 'HL-ELIG',
    qdb_snapshotpolicy: 100000280,
    qdb_featureflags: JSON.stringify(FLAGS),
    qdb_isactive: true,
    ...overrides,
  });
  const platform = new PlatformConfigurationService(crm, { apiVersion: '9.2', cacheTtlMs: 60_000 });
  return { crm, service: new CollectionConfigurationService(platform, { cacheTtlMs: 60_000 }) };
}

describe('assembling the Collection runtime configuration', () => {
  it('resolves everything a synchronisation run needs', async () => {
    const { service } = buildService();
    const configuration = await service.get('HL');
    expect(configuration).toMatchObject({
      snapshotPolicy: 'AllReceived',
      snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'snapshotDate'],
      eligibilityRulesetCode: 'HL-ELIG',
      caseNumbering: 'Provisional',
    });
    expect(configuration.ruleEngineOperations.eligibility).toBe('qdb_dcp_EvaluateEligibility');
  });

  it('defaults the episode policy to "a new episode", the rule the architecture states', async () => {
    const { service } = buildService();
    expect((await service.get('HL')).episodePolicy).toEqual({});
  });

  it('defaults numbering to Provisional, because the QDB mechanism holds no configuration to defer to', async () => {
    const { service } = buildService();
    expect((await service.get('HL')).caseNumbering).toBe('Provisional');
  });

  it('honours a configured numbering source', async () => {
    const { service } = buildService({ qdb_featureflags: JSON.stringify({ ...FLAGS, caseNumbering: 'PlatformConfigured' }) });
    expect((await service.get('HL')).caseNumbering).toBe('PlatformConfigured');
  });
});

describe('no hidden defaults for critical configuration', () => {
  it('refuses an organisation with no snapshot policy, naming where to set it', async () => {
    const { service } = buildService({ qdb_snapshotpolicy: null });
    await expect(service.get('HL')).rejects.toThrow(/no snapshot policy on qdb_platformconfiguration/);
  });

  it('refuses an organisation with no eligibility ruleset', async () => {
    const { service } = buildService({ qdb_eligibilityrulesetcode: null });
    await expect(service.get('HL')).rejects.toThrow(/must fail closed rather than decide eligibility itself/);
  });

  it('refuses an organisation with no snapshot key composition', async () => {
    const { service } = buildService({ qdb_featureflags: JSON.stringify({ ruleEngineOperations: {} }) });
    await expect(service.get('HL')).rejects.toThrow(CollectionSettingsError);
  });

  it('refuses a strategy decision when no strategy ruleset is configured', async () => {
    const { service } = buildService();
    const configuration = await service.get('HL');
    expect(() => requireRulesetCode(configuration, 'strategy')).toThrow(/qdb_strategyrulesetcode/);
  });

  it('refuses a contact-hold decision when no hold ruleset is configured (KI-44)', async () => {
    const { service } = buildService();
    const configuration = await service.get('HL');
    expect(() => requireRulesetCode(configuration, 'contactHold')).toThrow(/qdb_contactholdrulesetcode/);
  });

  it('returns the ruleset code when the organisation has configured one', async () => {
    const { service } = buildService({ qdb_strategyrulesetcode: 'HL-STRAT' });
    expect(requireRulesetCode(await service.get('HL'), 'strategy')).toBe('HL-STRAT');
  });
});

describe('caching and invalidation', () => {
  it('reads the organisation once and serves the second call from cache', async () => {
    const { crm, service } = buildService();
    await service.get('HL');
    const readsAfterFirst = crm.touchedEntitySets.size;
    const queriesAfterFirst = crm.writes.length;
    await service.get('HL');
    expect(crm.touchedEntitySets.size).toBe(readsAfterFirst);
    expect(crm.writes.length).toBe(queriesAfterFirst);
  });

  it('reads again after the cache is cleared, so a published change takes effect', async () => {
    const { crm, service } = buildService();
    await service.get('HL');
    const before = countConfigurationReads(crm);
    service.clearCache();
    await service.get('HL');
    expect(countConfigurationReads(crm)).toBeGreaterThan(before);
  });
});

/** Counts reads of the configuration table by inspecting what the fake was asked for. */
function countConfigurationReads(crm: FakeCrmAdapter): number {
  return crm.queries.filter(q => q.entity === 'qdb_platformconfigurations').length;
}
