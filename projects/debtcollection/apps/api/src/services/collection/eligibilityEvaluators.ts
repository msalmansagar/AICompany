import {
  EligibilityOutcomeSchema,
  type CrmCallContext,
  type EligibilityDecision,
  type EligibilityInput,
  type EligibilityOutcome,
  type ICrmAdapter,
  type IEligibilityEvaluator,
} from '@dcp/domain';

/**
 * Evaluates eligibility through the Rule Engine, by operation name. The name is configuration
 * (`eligibilityOperation` in the platform feature flags): a Custom API on cloud, a Process Action
 * on-premises, reached through the same `ICrmAdapter.execute`.
 *
 * The response contract — an `Outcome` from the approved set, an optional `Reason`, and the
 * `RulesetVersion` that decided — is provisional until the DCP-facing operation exists on the Rule
 * Engine. Anything outside that set fails closed: an unknown answer is not a decision.
 */
export class RuleEngineEligibilityEvaluator implements IEligibilityEvaluator {
  constructor(private readonly crm: ICrmAdapter, private readonly operationName: string) {
    if (!operationName.trim()) throw new Error('RuleEngineEligibilityEvaluator needs the configured operation name');
  }

  async evaluate(input: EligibilityInput, context: CrmCallContext = {}): Promise<EligibilityDecision> {
    const response = await this.crm.execute(this.operationName, {
      RulesetCode: input.rulesetCode,
      Observation: JSON.stringify(input.record),
      Customer: input.customer ? JSON.stringify(input.customer) : null,
      ActiveCase: input.activeCase ? JSON.stringify(input.activeCase) : null,
    }, context);
    return parseDecision(response, input.rulesetCode);
  }
}

function parseDecision(response: unknown, rulesetCode: string): EligibilityDecision {
  const body = (response ?? {}) as Record<string, unknown>;
  const outcome = EligibilityOutcomeSchema.safeParse(body['Outcome']);
  if (!outcome.success) {
    throw new Error(`Ruleset ${rulesetCode} returned an outcome outside the approved set: ${JSON.stringify(body['Outcome'])}`);
  }
  const version = body['RulesetVersion'];
  if (typeof version !== 'string' || version === '') {
    throw new Error(`Ruleset ${rulesetCode} returned no ruleset version; the decision cannot be attributed`);
  }
  return {
    outcome: outcome.data,
    ...(typeof body['Reason'] === 'string' ? { reason: body['Reason'] } : {}),
    rulesetCode,
    rulesetVersion: version,
    evaluatedOn: new Date().toISOString(),
  };
}

/**
 * A deterministic evaluator for tests and controlled demonstrations. It is NOT a ruleset: it holds
 * no thresholds, only whatever decision function the caller hands it, and it labels every decision
 * with a version that says so.
 */
export class StaticEligibilityEvaluator implements IEligibilityEvaluator {
  constructor(
    private readonly decide: (input: EligibilityInput) => EligibilityOutcome,
    private readonly label = 'static-evaluator',
  ) {}

  async evaluate(input: EligibilityInput): Promise<EligibilityDecision> {
    return {
      outcome: this.decide(input),
      reason: `decided by ${this.label}; not a configured ruleset`,
      rulesetCode: input.rulesetCode,
      rulesetVersion: this.label,
      evaluatedOn: new Date().toISOString(),
    };
  }
}
