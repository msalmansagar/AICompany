import {
  buildLogSource,
  type CrmCallContext,
  type ICollectionLogger,
  type ICrmAdapter,
  type MisDelinquencyRecord,
  type StrategyAction,
} from '@dcp/domain';
import { ENTITY_SETS, NAVIGATION, bind } from './qdbBindings.js';
import type { StrategyService } from './StrategyService.js';
import type { RecordOutcome } from './DelinquencySyncService.js';

const SOURCE = buildLogSource('StrategyOrchestration');

/** What happened to the strategy decision for one case. Never a silent absence. */
export interface StrategyAssignment {
  applied: boolean;
  strategyCode?: string;
  /** Actions the strategy defines, in sequence. Phase 4 records them; it does not execute them. */
  actions?: readonly StrategyAction[];
  /** Present when no strategy was applied. Always says why, in terms an administrator can act on. */
  reason?: string;
}

/** Outcomes that own a case and can therefore carry a treatment. */
const CASE_BEARING = new Set(['CaseCreated', 'CaseUpdated', 'CaseReopened']);

/**
 * The boundary between "this facility has a case" and "this case has a treatment".
 *
 * It sits **after** the synchronisation pipeline rather than inside it, deliberately. Eligibility
 * gates whether a case exists at all and already fails closed inside the pipeline; strategy is the
 * next question, and its absence must not destroy a case that MIS says is delinquent. So a strategy
 * that cannot be resolved leaves the case **without a current strategy and with a stated reason**,
 * rather than failing the record.
 *
 * What it does not do is decide. Which strategy applies is the Rule Engine's answer and the
 * configuration's definition — `StrategyService` composes those, and this class writes the result to
 * the case. **No threshold, no matching rule and no fallback strategy exists here.**
 *
 * Phase 4 stops at recording the treatment. Scheduling the strategy's actions as Collection
 * activities is Phase 8's automation, and building it here would be building that engine early.
 */
export class CaseStrategyOrchestrator {
  constructor(
    private readonly strategies: StrategyService,
    private readonly crm: ICrmAdapter,
    private readonly logger: ICollectionLogger,
    private readonly strategyRulesetCode: string | undefined,
    private readonly organizationCode: string,
  ) {}

  /**
   * Resolves and records the treatment for a case-bearing outcome.
   *
   * Returns an assignment rather than throwing: the caller is mid-run over thousands of records, and
   * a strategy that cannot be resolved is information, not a reason to stop.
   */
  async apply(
    outcome: RecordOutcome,
    record: MisDelinquencyRecord,
    context: CrmCallContext = {},
  ): Promise<StrategyAssignment> {
    if (!CASE_BEARING.has(outcome.action) || !outcome.caseId) {
      return { applied: false, reason: `outcome '${outcome.action}' owns no case, so it carries no treatment` };
    }
    if (!this.strategyRulesetCode) {
      // Fail closed, and say where to fix it. The case still exists and is still worked.
      const reason = `Organisation ${this.organizationCode} has no strategy ruleset configured ` +
        '(qdb_platformconfiguration.qdb_strategyrulesetcode), so no treatment was assigned. ' +
        'The case is unaffected.';
      await this.log(outcome, 'Warn', 'strategy_not_configured', reason, context);
      return { applied: false, reason };
    }

    try {
      const resolution = await this.strategies.resolveForCase({
        case: {
          id: outcome.caseId,
          facilityNumber: record.facilityNumber,
          sourceSystem: record.sourceSystem,
          status: 'New',
          episodeNumber: outcome.episodeNumber ?? 1,
          organizationCode: this.organizationCode,
          ...(record.dpd !== undefined ? { dpd: record.dpd } : {}),
          ...(record.arrearBucket !== undefined ? { arrearBucket: record.arrearBucket } : {}),
          ...(record.totalArrears !== undefined ? { totalArrears: record.totalArrears } : {}),
          ...(record.loanBalance !== undefined ? { loanBalance: record.loanBalance } : {}),
          ...(record.installmentAmount !== undefined ? { installmentAmount: record.installmentAmount } : {}),
        },
        rulesetCode: this.strategyRulesetCode,
      }, context);

      await this.crm.update(
        { entity: ENTITY_SETS.collectionCase, id: outcome.caseId },
        bind(NAVIGATION.caseStrategy, ENTITY_SETS.collectionStrategy, resolution.strategy.id),
        context);

      await this.log(outcome, 'Info', undefined,
        `Strategy ${resolution.strategy.code} assigned with ${resolution.actions.length} action(s), ` +
        `chosen by ruleset ${resolution.selection.rulesetCode} version ${resolution.selection.rulesetVersion}`,
        context);

      return { applied: true, strategyCode: resolution.strategy.code, actions: resolution.actions };
    } catch (error) {
      // Every refusal StrategyService raises is already named and already logged by it. Here it
      // becomes a per-record fact so the run report can enumerate it.
      const reason = error instanceof Error ? error.message : String(error);
      await this.log(outcome, 'Warn', 'strategy_unresolved', reason, context);
      return { applied: false, reason };
    }
  }

  private async log(
    outcome: RecordOutcome,
    severity: 'Info' | 'Warn',
    errorCode: string | undefined,
    message: string,
    context: CrmCallContext,
  ): Promise<void> {
    await this.logger.log({
      source: SOURCE,
      operation: 'assignStrategy',
      operationKind: 'CaseLifecycle',
      severity,
      succeeded: severity === 'Info',
      sourceReference: outcome.facilityNumber,
      ...(errorCode !== undefined ? { errorCode } : {}),
      errorMessage: message,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    });
  }
}

