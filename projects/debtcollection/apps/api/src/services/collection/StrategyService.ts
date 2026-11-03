import {
  StrategyConfigurationError,
  buildLogSource,
  orderedActions,
  resolveApplicableStrategy,
  type CollectionStrategy,
  type CrmCallContext,
  type ICollectionLogger,
  type IRuleEngine,
  type StrategyAction,
  type StrategyInput,
  type StrategySelection,
} from '@dcp/domain';
import type { StrategyRepository } from './StrategyRepository.js';

const SOURCE = buildLogSource('StrategyService');

export interface StrategyResolution {
  strategy: CollectionStrategy;
  actions: StrategyAction[];
  selection: StrategySelection;
}

/**
 * Decides which Collection Strategy treats a case, and what that treatment consists of.
 *
 * The decision is the Rule Engine's; this service asks it, then checks the answer against the
 * configuration that actually exists — active, effective today, exactly one winner. Those checks are
 * not business policy, they are the integrity of the configuration, and every way they can fail is a
 * distinct named error because "no strategy applies" and "two strategies apply" need different
 * human responses and neither may be resolved by picking one.
 *
 * Nothing here evaluates a DPD band, an arrears floor or an exposure range. Those columns exist on
 * the configuration for the ruleset to read.
 */
export class StrategyService {
  constructor(
    private readonly ruleEngine: IRuleEngine,
    private readonly strategies: StrategyRepository,
    private readonly logger: ICollectionLogger,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Resolves the treatment for a case.
   * @throws StrategyConfigurationError when the configuration cannot yield exactly one strategy.
   * @throws RuleEngineError when the ruleset is unconfigured or answers outside its contract.
   */
  async resolveForCase(input: StrategyInput, context: CrmCallContext = {}): Promise<StrategyResolution> {
    const selection = await this.ruleEngine.selectStrategy(input, context);
    const candidates = await this.strategies.findByCodes(selection.strategyCodes, context);

    try {
      const strategy = resolveApplicableStrategy(selection.strategyCodes, candidates, this.now());
      const actions = orderedActions(strategy);
      await this.logResolution(input, selection, strategy, actions.length, context);
      return { strategy, actions, selection };
    } catch (error) {
      if (error instanceof StrategyConfigurationError) await this.logFailure(input, selection, error, context);
      throw error;
    }
  }

  private async logResolution(
    input: StrategyInput, selection: StrategySelection, strategy: CollectionStrategy, actionCount: number, context: CrmCallContext,
  ): Promise<void> {
    await this.logger.log({
      source: SOURCE, operation: 'resolveForCase', operationKind: 'CaseLifecycle', severity: 'Info', succeeded: true,
      sourceReference: `${input.case.sourceSystem}/${input.case.facilityNumber}`,
      errorMessage: `strategy ${strategy.code} (ruleset ${selection.rulesetCode} v${selection.rulesetVersion}), ${actionCount} action(s)`,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    });
  }

  private async logFailure(
    input: StrategyInput, selection: StrategySelection, error: StrategyConfigurationError, context: CrmCallContext,
  ): Promise<void> {
    await this.logger.log({
      source: SOURCE, operation: 'resolveForCase', operationKind: 'CaseLifecycle', severity: 'Error', succeeded: false,
      sourceReference: `${input.case.sourceSystem}/${input.case.facilityNumber}`,
      errorCode: `strategy_${error.kind}`,
      errorMessage: `${error.message} (ruleset ${selection.rulesetCode} v${selection.rulesetVersion} offered [${selection.strategyCodes.join(', ')}])`,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    });
  }
}
