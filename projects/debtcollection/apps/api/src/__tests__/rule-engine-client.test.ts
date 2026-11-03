import { describe, expect, it } from 'vitest';
import { RuleEngineError } from '@dcp/domain';
import { RuleEngineClient } from '../services/collection/index.js';
import { FakeCrmAdapter } from './helpers/FakeCrmAdapter.js';
import { MemoryLogger, delinquentRecord } from './helpers/collectionFixtures.js';

const OPERATIONS = { eligibility: 'qdb_dcp_EvaluateEligibility', strategy: 'qdb_dcp_SelectStrategy', contactHold: 'qdb_dcp_EvaluateContactHold' };

function build(answer: (operation: string, parameters: Record<string, unknown>) => unknown, operations = OPERATIONS) {
  const crm = new FakeCrmAdapter();
  crm.executeHandler = answer;
  const logger = new MemoryLogger();
  return { crm, logger, client: new RuleEngineClient(crm, operations, logger) };
}

const eligibilityInput = { record: delinquentRecord(), rulesetCode: 'HL-ELIG' };
const strategyInput = {
  case: { facilityNumber: '1', sourceSystem: 'HL', status: 'New', episodeNumber: 1, organizationCode: 'HL' },
  rulesetCode: 'HL-STRAT',
};
const holdInput = { customer: { entity: 'contact', id: 'c1', businessId: 'Q1' }, rulesetCode: 'HL-HOLD' };

describe('eligibility', () => {
  it('calls the configured operation by name', async () => {
    const { crm, client } = build(() => ({ Outcome: 'EligibleCreateCase', RulesetVersion: '2.1' }));
    await client.evaluateEligibility(eligibilityInput);
    expect(crm.executed[0]?.operation).toBe('qdb_dcp_EvaluateEligibility');
  });

  it('returns the decision with the version that made it', async () => {
    const { client } = build(() => ({ Outcome: 'GraceMonitor', Reason: 'below one instalment', RulesetVersion: '2.1' }));
    await expect(client.evaluateEligibility(eligibilityInput)).resolves.toMatchObject({
      outcome: 'GraceMonitor', reason: 'below one instalment', rulesetCode: 'HL-ELIG', rulesetVersion: '2.1',
    });
  });

  it('refuses an outcome outside the approved set', async () => {
    const { client } = build(() => ({ Outcome: 'ProbablyFine', RulesetVersion: '2.1' }));
    await expect(client.evaluateEligibility(eligibilityInput)).rejects.toThrow(RuleEngineError);
  });

  it('refuses a decision with no ruleset version — an unattributable decision is not a decision', async () => {
    const { client } = build(() => ({ Outcome: 'EligibleCreateCase' }));
    await expect(client.evaluateEligibility(eligibilityInput)).rejects.toThrow(/rulesetVersion/i);
  });

  it('refuses an empty response rather than defaulting', async () => {
    const { client } = build(() => null);
    await expect(client.evaluateEligibility(eligibilityInput)).rejects.toThrow(RuleEngineError);
  });
});

describe('strategy selection', () => {
  it('accepts a list of codes', async () => {
    const { client } = build(() => ({ StrategyCodes: ['EARLY', 'FALLBACK'], RulesetVersion: '1.0' }));
    await expect(client.selectStrategy(strategyInput)).resolves.toMatchObject({ strategyCodes: ['EARLY', 'FALLBACK'] });
  });

  it('accepts a single code, because a ruleset may return one', async () => {
    const { client } = build(() => ({ StrategyCode: 'EARLY', RulesetVersion: '1.0' }));
    await expect(client.selectStrategy(strategyInput)).resolves.toMatchObject({ strategyCodes: ['EARLY'] });
  });

  it('carries an empty selection through — "no strategy applies" is an answer, not a failure here', async () => {
    const { client } = build(() => ({ StrategyCodes: [], RulesetVersion: '1.0' }));
    await expect(client.selectStrategy(strategyInput)).resolves.toMatchObject({ strategyCodes: [] });
  });

  it('refuses a selection with no ruleset version', async () => {
    const { client } = build(() => ({ StrategyCodes: ['EARLY'] }));
    await expect(client.selectStrategy(strategyInput)).rejects.toThrow(RuleEngineError);
  });
});

describe('contact hold', () => {
  it('returns the hold decision with its provenance', async () => {
    const { client } = build(() => ({ Hold: true, Reason: 'estate in administration', RulesetVersion: '3.0' }));
    await expect(client.evaluateContactHold(holdInput)).resolves.toMatchObject({ hold: true, reason: 'estate in administration', rulesetVersion: '3.0' });
  });

  it('refuses an unreadable answer rather than reading it as "no hold"', async () => {
    const { client } = build(() => ({ Hold: 'maybe', RulesetVersion: '3.0' }));
    await expect(client.evaluateContactHold(holdInput)).rejects.toThrow(RuleEngineError);
  });

  it('sends only identity and channel — no invented deceased flag', async () => {
    const { crm, client } = build(() => ({ Hold: false, RulesetVersion: '3.0' }));
    await client.evaluateContactHold({ ...holdInput, channel: 'SMS' });
    expect(Object.keys(crm.executed[0]!.parameters).sort())
      .toEqual(['CaseId', 'Channel', 'Customer', 'FacilityNumber', 'RulesetCode', 'SourceSystem'].sort());
  });
});

describe('failing closed', () => {
  it('refuses when the deployment has not configured the operation name', async () => {
    const { client } = build(() => ({}), { eligibility: 'op' } as never);
    await expect(client.selectStrategy(strategyInput)).rejects.toThrow(/has not configured a Rule Engine operation for 'strategy'/);
  });

  it('refuses when the operation itself fails', async () => {
    const { client } = build(() => { throw new Error('Custom API not found'); });
    await expect(client.evaluateEligibility(eligibilityInput)).rejects.toThrow(/Custom API not found/);
  });

  it('logs every refusal to the technical log', async () => {
    const { logger, client } = build(() => ({ Outcome: 'nonsense', RulesetVersion: '1' }));
    await client.evaluateEligibility(eligibilityInput).catch(() => undefined);
    expect(logger.entries.some(e => e.severity === 'Error' && e.errorCode === 'rule_engine_unusable' && e.sourceReference === 'HL-ELIG')).toBe(true);
  });

  it('never returns a decision it could not read', async () => {
    const { client } = build(() => ({ Outcome: undefined, RulesetVersion: undefined }));
    const result = await client.evaluateEligibility(eligibilityInput).then(() => 'decided', () => 'refused');
    expect(result).toBe('refused');
  });
});
