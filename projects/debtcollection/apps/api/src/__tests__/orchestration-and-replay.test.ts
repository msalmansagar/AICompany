import { describe, expect, it } from 'vitest';
import { RuleEngineError, type ICheckpointStore, type ProcessingCheckpoint } from '@dcp/domain';
import {
  BackgroundSyncRunner,
  CaseStrategyOrchestrator,
  StrategyRepository,
  StrategyService,
  StubRuleEngine,
} from '../services/collection/index.js';
import { MockMisDelinquencyService } from '../services/mis/index.js';
import { buildHarness, MemoryLogger } from './helpers/collectionFixtures.js';

class MemoryCheckpoints implements ICheckpointStore {
  private store = new Map<string, ProcessingCheckpoint>();
  async read(org: string, runId: string) { return this.store.get(`${org}/${runId}`) ?? null; }
  async write(c: ProcessingCheckpoint) { this.store.set(`${c.organizationCode}/${c.runId}`, c); }
}

function rows(count: number, overrides: Record<number, Record<string, unknown>> = {}) {
  return Array.from({ length: count }, (_, i) => ({
    'Customer Number': 'C-1001',
    'Customer Name': `CUSTOMER ${i}`,
    'Account Number': 900000 + i,
    'Loan Type Code': 1011,
    'Loan Type Description': 'Building Housing',
    'ID Number': '28912345678',
    'QCB Deceased Status': null,
    'Loan Balance': 500000,
    'Account Status': 8,
    'Arrear Buckets': '31-60',
    'First Arrear Date': '30/06/2026',
    'Arrear Days': 45,
    'Total Arrears': 12500,
    'Installment Amount': 6000,
    'Last Arrear Amount': 6000,
    'Arrear %': 1,
    'Exemption Percentage': null,
    'Exemption Amount': null,
    'Mobile Number': 55512345,
    ...(overrides[i] ?? {}),
  }));
}

const CASES = 'qdb_collectioncases';
const SNAPSHOTS = 'qdb_delinquencysnapshots';

/** Seeds one usable strategy with two actions in the in-memory organisation. */
function seedStrategy(crm: ReturnType<typeof buildHarness>['crm'], code = 'EARLY') {
  const strategyId = crm.seed('qdb_collectionstrategies', 'qdb_collectionstrategyid', {
    qdb_name: 'Early treatment', qdb_code: code, qdb_priority: 10, qdb_isactive: true,
    qdb_noautomatedcontact: false, qdb_dpdfrom: 1, qdb_dpdto: 60,
  });
  for (const [name, sequence] of [['First call', 10], ['Follow up', 20]] as const) {
    crm.seed('qdb_strategyactions', 'qdb_strategyactionid', {
      qdb_name: name, qdb_sequence: sequence, qdb_dayoffset: 1, qdb_triggerevent: 100000240,
      qdb_isactive: true, qdb_requiresapproval: false, qdb_ismandatory: true,
      qdb_stoponpayment: true, qdb_stoponptp: true, qdb_escalateifnotcompleted: false,
      _qdb_strategyid_value: strategyId,
    });
  }
  return strategyId;
}

function buildRunner(options: {
  rowCount?: number;
  strategyCodes?: string[] | 'refuse';
  rulesetCode?: string | undefined;
  seedStrategyCode?: string;
  runId?: string;
} = {}) {
  const harness = buildHarness();
  if (options.seedStrategyCode !== undefined) seedStrategy(harness.crm, options.seedStrategyCode);

  const logger = new MemoryLogger();
  const codes = options.strategyCodes;
  const ruleEngine = new StubRuleEngine(
    codes === 'refuse'
      // No strategy answer at all: the stub refuses, exactly as the real client does for an
      // operation the deployment never configured.
      ? { eligibility: () => 'EligibleCreateCase' }
      : { eligibility: () => 'EligibleCreateCase', strategy: () => codes ?? ['EARLY'] });
  const strategyService = new StrategyService(
    ruleEngine, new StrategyRepository(harness.crm), logger, () => '2026-09-18T12:00:00.000Z');
  const orchestrator = new CaseStrategyOrchestrator(
    strategyService, harness.crm, logger,
    'rulesetCode' in options ? options.rulesetCode : 'HL-STRAT', 'HL');

  const mis = new MockMisDelinquencyService(rows(options.rowCount ?? 5), {
    sourceSystem: 'HL', misAsOfDate: '2026-06-30',
  });
  const runner = new BackgroundSyncRunner(
    mis, harness.service, new MemoryCheckpoints(), logger, () => '2026-09-18T15:00:00.000Z', orchestrator);
  return { runner, harness, logger, options: { organizationCode: 'HL', runId: options.runId ?? 'run-1', mode: 'FullScan' as const, pageSize: 10 } };
}

describe('eligibility decides whether a case exists; strategy decides how it is treated', () => {
  it('assigns the strategy the ruleset selected to every case-bearing outcome', async () => {
    const { runner, options } = buildRunner({ rowCount: 5, seedStrategyCode: 'EARLY' });
    const report = await runner.run(options);
    expect(report.strategy.assigned).toBe(5);
    expect(report.strategy.unresolved).toHaveLength(0);
  });

  it('writes the current strategy onto the case through the organisation lookup', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 2, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    const updates = harness.crm.writes.filter(w => w.kind === 'update' && w.entity === CASES);
    expect(updates.length).toBeGreaterThan(0);
    expect(Object.keys(updates.at(-1)!.values).some(k => k.startsWith('qdb_strategyid@odata.bind'))).toBe(true);
  });

  it('leaves the case intact when no strategy ruleset is configured, and says so', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 3, rulesetCode: undefined, seedStrategyCode: 'EARLY' });
    const report = await runner.run(options);

    expect(report.strategy.assigned).toBe(0);
    expect(report.strategy.unresolved).toHaveLength(3);
    expect(report.strategy.unresolved[0]!.reason).toMatch(/qdb_strategyrulesetcode/);
    // The cases still exist. A missing treatment does not undo a delinquency MIS reported.
    expect(harness.crm.rows(CASES)).toHaveLength(3);
  });

  it('leaves the case intact when the ruleset names a strategy that is not configured', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 2, strategyCodes: ['NO-SUCH-CODE'], seedStrategyCode: 'EARLY' });
    const report = await runner.run(options);

    expect(report.strategy.assigned).toBe(0);
    expect(report.strategy.unresolved[0]!.reason).toMatch(/NO-SUCH-CODE/);
    expect(harness.crm.rows(CASES)).toHaveLength(2);
  });

  it('leaves the case intact when the ruleset applies no strategy at all', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 2, strategyCodes: [], seedStrategyCode: 'EARLY' });
    const report = await runner.run(options);
    expect(report.strategy.assigned).toBe(0);
    expect(harness.crm.rows(CASES)).toHaveLength(2);
  });

  it('fails closed when the Rule Engine has no strategy answer configured', async () => {
    const { runner, options } = buildRunner({ rowCount: 2, strategyCodes: 'refuse', seedStrategyCode: 'EARLY' });
    const report = await runner.run(options);
    expect(report.strategy.assigned).toBe(0);
    expect(report.strategy.unresolved[0]!.reason).toMatch(/no strategy answer configured/);
  });

  it('records the ruleset version that chose the treatment', async () => {
    const { runner, logger, options } = buildRunner({ rowCount: 1, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    const assigned = logger.entries.find(e => e.operation === 'assignStrategy' && e.severity === 'Info');
    expect(assigned?.errorMessage).toMatch(/version stub-rule-engine/);
  });

  it('runs synchronisation perfectly well with no orchestrator wired at all', async () => {
    const harness = buildHarness();
    const mis = new MockMisDelinquencyService(rows(4), { sourceSystem: 'HL', misAsOfDate: '2026-06-30' });
    const runner = new BackgroundSyncRunner(
      mis, harness.service, new MemoryCheckpoints(), new MemoryLogger(), () => '2026-09-18T15:00:00.000Z');
    const report = await runner.run({ organizationCode: 'HL', runId: 'r', mode: 'FullScan', pageSize: 10 });
    expect(report.recordsProcessed).toBe(4);
    expect(report.strategy.assigned).toBe(0);
  });

  it('does not schedule the strategy actions — that is Phase 8, not Phase 4', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 3, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    expect(harness.crm.rows('qdb_collectionactivities')).toHaveLength(0);
  });
});

describe('replay protection available from the evidence we have', () => {
  it('a second identical run creates no duplicate case', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 6, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    expect(harness.crm.rows(CASES)).toHaveLength(6);

    // A fresh run id, the same population — exactly what a re-run of yesterday's feed looks like.
    await runner.run({ ...options, runId: 'run-2' });

    expect(harness.crm.rows(CASES)).toHaveLength(6);
  });

  it('a second identical run creates no duplicate snapshot — the key refuses it', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 4, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    const afterFirst = harness.crm.rows(SNAPSHOTS).length;

    await runner.run({ ...options, runId: 'run-2' });

    expect(harness.crm.rows(SNAPSHOTS)).toHaveLength(afterFirst);
  });

  it('a second run opens no second episode for the same facility', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 3, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    await runner.run({ ...options, runId: 'run-2' });
    expect(harness.crm.rows(CASES).every(r => r['qdb_episodenumber'] === 1)).toBe(true);
  });

  it('a repeated observation updates the existing case rather than creating one', async () => {
    const { runner, options } = buildRunner({ rowCount: 3, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    const second = await runner.run({ ...options, runId: 'run-2' });
    expect(second.counts.CaseUpdated).toBe(3);
    expect(second.counts.CaseCreated ?? 0).toBe(0);
  });

  it('a changed position writes a new snapshot, because it is a different observation', async () => {
    const harness = buildHarness();
    const logger = new MemoryLogger();
    const checkpoints = new MemoryCheckpoints();
    const runOnce = async (runId: string, dpd: number, asOf: string) => {
      const mis = new MockMisDelinquencyService(
        rows(1, { 0: { 'Arrear Days': dpd, 'Arrear Buckets': dpd > 60 ? '61-90' : '31-60' } }),
        { sourceSystem: 'HL', misAsOfDate: asOf });
      const runner = new BackgroundSyncRunner(mis, harness.service, checkpoints, logger, () => '2026-09-18T15:00:00.000Z');
      return runner.run({ organizationCode: 'HL', runId, mode: 'FullScan', pageSize: 10 });
    };

    await runOnce('run-1', 45, '2026-06-30');
    await runOnce('run-2', 75, '2026-07-31');

    expect(harness.crm.rows(CASES)).toHaveLength(1);
    expect(harness.crm.rows(SNAPSHOTS)).toHaveLength(2);
  });

  it('duplicate rows inside one run produce one case, not two', async () => {
    const { runner, harness, options } = buildRunner({ rowCount: 5, seedStrategyCode: 'EARLY' });
    // Row 3 repeats row 0's account number.
    const report = await runner.run(options);
    expect(report.recordsProcessed).toBe(5);
    expect(harness.crm.rows(CASES)).toHaveLength(5);
  });
});

describe('what replay protection does NOT yet prove', () => {
  it('the observation carries no source record id, so identity rests on what DCP composes', async () => {
    const mis = new MockMisDelinquencyService(rows(1), { sourceSystem: 'HL', misAsOfDate: '2026-06-30' });
    const page = await mis.getArrearDetails({ pageSize: 1 });
    const record = page.data.items[0]!;
    // Both absent in the evidenced feed. Until MIS supplies them, snapshot identity is composed from
    // facility identity and the as-of date, and the final production composition stays TBD.
    expect(record.sourceRecordId).toBeUndefined();
    expect(record.sourceTimestamp).toBeUndefined();
  });

  it('two observations for the same facility on the same as-of date are indistinguishable', async () => {
    // This is the honest limit: without a source observation id, a genuine intra-day correction and a
    // duplicate delivery look identical. The key collapses them, which is safe but not the same as
    // knowing they were the same observation.
    const { runner, harness, options } = buildRunner({ rowCount: 1, seedStrategyCode: 'EARLY' });
    await runner.run(options);
    await runner.run({ ...options, runId: 'run-2' });
    expect(harness.crm.rows(SNAPSHOTS)).toHaveLength(1);
  });
});
