import {
  RuleEngineError,
  type ContactHoldEvaluation,
  type ContactHoldInput,
  type EligibilityDecision,
  type EligibilityInput,
  type EligibilityOutcome,
  type IRuleEngine,
  type StrategyInput,
  type StrategySelection,
} from '@dcp/domain';

/** What the stub should answer for each decision. An absent answer means "not stubbed". */
export interface StubRuleEngineAnswers {
  eligibility?: (input: EligibilityInput) => EligibilityOutcome;
  strategy?: (input: StrategyInput) => string[];
  contactHold?: (input: ContactHoldInput) => boolean;
}

/**
 * A deterministic Rule Engine for tests and controlled demonstrations.
 *
 * It is **not a ruleset and must never stand in for one in production**. It holds no thresholds — the
 * caller supplies the answer function — and it labels every decision with a version that says plainly
 * where it came from, so a decision made by this class is identifiable in `qdb_crmlogs` and on the
 * snapshot long afterwards. A decision it was not given an answer for is refused, not defaulted: the
 * same failure mode as the real client meeting an unconfigured operation.
 */
export class StubRuleEngine implements IRuleEngine {
  static readonly VERSION = 'stub-rule-engine';

  constructor(private readonly answers: StubRuleEngineAnswers = {}) {}

  async evaluateEligibility(input: EligibilityInput): Promise<EligibilityDecision> {
    const decide = this.answers.eligibility;
    if (!decide) throw new RuleEngineError('StubRuleEngine has no eligibility answer configured', input.rulesetCode);
    return {
      outcome: decide(input),
      reason: `decided by ${StubRuleEngine.VERSION}; not a configured ruleset`,
      rulesetCode: input.rulesetCode,
      rulesetVersion: StubRuleEngine.VERSION,
      evaluatedOn: new Date().toISOString(),
    };
  }

  async selectStrategy(input: StrategyInput): Promise<StrategySelection> {
    const decide = this.answers.strategy;
    if (!decide) throw new RuleEngineError('StubRuleEngine has no strategy answer configured', input.rulesetCode);
    return {
      strategyCodes: decide(input),
      reason: `decided by ${StubRuleEngine.VERSION}; not a configured ruleset`,
      rulesetCode: input.rulesetCode,
      rulesetVersion: StubRuleEngine.VERSION,
      evaluatedOn: new Date().toISOString(),
    };
  }

  async evaluateContactHold(input: ContactHoldInput): Promise<ContactHoldEvaluation> {
    const decide = this.answers.contactHold;
    if (!decide) throw new RuleEngineError('StubRuleEngine has no contact-hold answer configured', input.rulesetCode);
    return {
      hold: decide(input),
      reason: `decided by ${StubRuleEngine.VERSION}; not a configured ruleset`,
      rulesetCode: input.rulesetCode,
      rulesetVersion: StubRuleEngine.VERSION,
      evaluatedOn: new Date().toISOString(),
    };
  }
}
