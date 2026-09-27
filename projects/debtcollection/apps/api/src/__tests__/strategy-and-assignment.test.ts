import { describe, expect, it } from 'vitest';
import { AssignmentError, StrategyConfigurationError, UnavailableSmartAssignment, type CrmRecord } from '@dcp/domain';
import {
  AssignmentRepository,
  AssignmentService,
  StrategyRepository,
  StrategyService,
  StubRuleEngine,
} from '../services/collection/index.js';
import { FakeCrmAdapter } from './helpers/FakeCrmAdapter.js';
import { MemoryLogger } from './helpers/collectionFixtures.js';

const NOW = '2026-07-01T00:00:00.000Z';
const caseFacts = { facilityNumber: '123456789', sourceSystem: 'HL', status: 'New', episodeNumber: 1, organizationCode: 'HL', dpd: 45 };

function seedStrategy(crm: FakeCrmAdapter, overrides: CrmRecord = {}): string {
  return crm.seed('qdb_collectionstrategies', 'qdb_collectionstrategyid', {
    qdb_code: 'EARLY', qdb_name: 'Early Collection', qdb_priority: 10, qdb_isactive: true,
    qdb_noautomatedcontact: false, qdb_dpdfrom: 1, qdb_dpdto: 30, qdb_customertype: 100000020, ...overrides,
  });
}

function seedAction(crm: FakeCrmAdapter, strategyId: string, overrides: CrmRecord = {}): string {
  return crm.seed('qdb_strategyactions', 'qdb_strategyactionid', {
    qdb_name: 'Reminder SMS', qdb_sequence: 10, qdb_dayoffset: 1, qdb_triggerevent: 100000240,
    qdb_communicationchannel: 100000100, qdb_requiresapproval: false, qdb_ismandatory: true,
    qdb_stoponpayment: true, qdb_stoponptp: true, qdb_escalateifnotcompleted: false, qdb_isactive: true,
    _qdb_strategyid_value: strategyId, ...overrides,
  });
}

function buildStrategyService(crm: FakeCrmAdapter, codes: string[]) {
  const logger = new MemoryLogger();
  const service = new StrategyService(
    new StubRuleEngine({ strategy: () => codes }), new StrategyRepository(crm), logger, () => NOW);
  return { service, logger };
}

describe('strategy configuration', () => {
  it('resolves the strategy the ruleset selected, with its actions in order', async () => {
    const crm = new FakeCrmAdapter();
    const id = seedStrategy(crm);
    seedAction(crm, id, { qdb_name: 'Second', qdb_sequence: 20 });
    seedAction(crm, id, { qdb_name: 'First', qdb_sequence: 10 });

    const { service } = buildStrategyService(crm, ['EARLY']);
    const resolution = await service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' });

    expect(resolution.strategy.code).toBe('EARLY');
    expect(resolution.actions.map(a => a.name)).toEqual(['First', 'Second']);
  });

  it('reads the criteria as data and the channel as a label', async () => {
    const crm = new FakeCrmAdapter();
    const id = seedStrategy(crm);
    seedAction(crm, id);
    const { service } = buildStrategyService(crm, ['EARLY']);
    const resolution = await service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' });
    expect(resolution.strategy.criteria).toMatchObject({ dpdFrom: 1, dpdTo: 30, customerType: 'Individual' });
    expect(resolution.actions[0]).toMatchObject({ communicationChannel: 'SMS', triggerEvent: 'DayOffset' });
  });

  it('resolves the activity type by code, never by the lookup GUID', async () => {
    const crm = new FakeCrmAdapter();
    const typeId = crm.seed('qdb_collectionactivitytypes', 'qdb_collectionactivitytypeid', { qdb_code: 'SMS_REMINDER' });
    const id = seedStrategy(crm);
    seedAction(crm, id, { _qdb_activitytypeid_value: typeId });
    const { service } = buildStrategyService(crm, ['EARLY']);
    const resolution = await service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' });
    expect(resolution.actions[0]?.activityTypeCode).toBe('SMS_REMINDER');
  });

  it('omits a deactivated action', async () => {
    const crm = new FakeCrmAdapter();
    const id = seedStrategy(crm);
    seedAction(crm, id, { qdb_name: 'Retired', qdb_isactive: false });
    seedAction(crm, id, { qdb_name: 'Live' });
    const { service } = buildStrategyService(crm, ['EARLY']);
    expect((await service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' })).actions.map(a => a.name)).toEqual(['Live']);
  });

  it('refuses when the ruleset applies no strategy', async () => {
    const { service } = buildStrategyService(new FakeCrmAdapter(), []);
    await expect(service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' })).rejects.toThrow(StrategyConfigurationError);
  });

  it('refuses when the selected strategy is not configured', async () => {
    const { service } = buildStrategyService(new FakeCrmAdapter(), ['GHOST']);
    await expect(service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' })).rejects.toThrow(/no Collection Strategy configuration defines/);
  });

  it('refuses a deactivated strategy', async () => {
    const crm = new FakeCrmAdapter();
    seedStrategy(crm, { qdb_isactive: false });
    const { service } = buildStrategyService(crm, ['EARLY']);
    await expect(service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' })).rejects.toThrow(/inactive or outside its effective period/);
  });

  it('refuses a strategy outside its effective period', async () => {
    const crm = new FakeCrmAdapter();
    seedStrategy(crm, { qdb_effectivefrom: '2026-09-01T00:00:00Z' });
    const { service } = buildStrategyService(crm, ['EARLY']);
    await expect(service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' })).rejects.toThrow(/effective period/);
  });

  it('refuses two active configurations sharing a code and a priority', async () => {
    const crm = new FakeCrmAdapter();
    seedStrategy(crm);
    seedStrategy(crm, { qdb_name: 'Duplicate' });
    const { service } = buildStrategyService(crm, ['EARLY']);
    await expect(service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' })).rejects.toThrow(/cannot say which treatment applies/);
  });

  it('logs the failure with a kind an administrator can act on', async () => {
    const { service, logger } = buildStrategyService(new FakeCrmAdapter(), ['GHOST']);
    await service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' }).catch(() => undefined);
    expect(logger.entries.some(e => e.severity === 'Error' && e.errorCode === 'strategy_NotFound')).toBe(true);
  });

  it('logs the resolution with the ruleset version that chose it', async () => {
    const crm = new FakeCrmAdapter();
    seedStrategy(crm);
    const { service, logger } = buildStrategyService(crm, ['EARLY']);
    await service.resolveForCase({ case: caseFacts, rulesetCode: 'HL-STRAT' });
    expect(logger.entries.some(e => e.succeeded && String(e.errorMessage).includes('stub-rule-engine'))).toBe(true);
  });
});

describe('assignment configuration', () => {
  function seedAssignment(crm: FakeCrmAdapter, overrides: CrmRecord = {}): string {
    return crm.seed('qdb_assignmentconfigurations', 'qdb_assignmentconfigurationid', {
      qdb_name: 'Default', qdb_assignmentmethod: 100000220, qdb_priority: 10, qdb_isactive: true, qdb_slahours: 24, ...overrides,
    });
  }

  function buildAssignmentService(crm: FakeCrmAdapter, engines: ConstructorParameters<typeof AssignmentService>[1] = {}) {
    const logger = new MemoryLogger();
    return { logger, service: new AssignmentService(new AssignmentRepository(crm), engines, logger, () => NOW) };
  }

  it('reads the method as a label from the provisioned choice', async () => {
    const crm = new FakeCrmAdapter();
    seedAssignment(crm, { qdb_assignmentmethod: 100000223, qdb_smartassignmentref: 'REF-1' });
    const { service } = buildAssignmentService(crm);
    const configuration = await service.resolveConfiguration();
    expect(configuration).toMatchObject({ method: 'SmartAssignment', smartAssignmentRef: 'REF-1', slaHours: 24 });
  });

  it('refuses when no configuration is active', async () => {
    const crm = new FakeCrmAdapter();
    seedAssignment(crm, { qdb_isactive: false });
    const { service } = buildAssignmentService(crm);
    await expect(service.resolveConfiguration()).rejects.toThrow(AssignmentError);
  });

  it('refuses a priority tie', async () => {
    const crm = new FakeCrmAdapter();
    seedAssignment(crm);
    seedAssignment(crm, { qdb_name: 'Other' });
    const { service } = buildAssignmentService(crm);
    await expect(service.resolveConfiguration()).rejects.toThrow(/share priority 10/);
  });

  it('hands the case to the engine its configuration names', async () => {
    const crm = new FakeCrmAdapter();
    seedAssignment(crm);
    const { service } = buildAssignmentService(crm, {
      RoundRobin: { assign: async () => ({ method: 'RoundRobin' as const, queueName: 'Early Collection' }) },
    });
    await expect(service.assign({ facilityNumber: '1', sourceSystem: 'HL', organizationCode: 'HL' }))
      .resolves.toMatchObject({ queueName: 'Early Collection' });
  });

  it('refuses when the configured method has no engine wired', async () => {
    const crm = new FakeCrmAdapter();
    seedAssignment(crm, { qdb_assignmentmethod: 100000222 });
    const { service, logger } = buildAssignmentService(crm);
    await expect(service.assign({ facilityNumber: '1', sourceSystem: 'HL', organizationCode: 'HL' }))
      .rejects.toThrow(/no engine is wired/);
    expect(logger.entries.some(e => e.errorCode === 'assignment_Unavailable')).toBe(true);
  });

  it('refuses Smart Assignment rather than routing without QDB\'s contract (KI-09)', async () => {
    const crm = new FakeCrmAdapter();
    seedAssignment(crm, { qdb_assignmentmethod: 100000223 });
    const { service } = buildAssignmentService(crm, { SmartAssignment: new UnavailableSmartAssignment() });
    await expect(service.assign({ facilityNumber: '1', sourceSystem: 'HL', organizationCode: 'HL' }))
      .rejects.toThrow(/KI-09/);
  });
});
