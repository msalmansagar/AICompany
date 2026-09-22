/**
 * Collection Strategy configuration — the treatment a case receives, and the actions that make it up.
 *
 * The separation the architecture insists on, and that this module encodes:
 *
 *   Rule Engine   decides *which* strategy applies (a ruleset, versioned, business-owned)
 *   Strategy      is the configuration describing that treatment
 *   Strategy Action is what the treatment consists of, in order
 *
 * So there is no `selectStrategyByDpd` here and there never will be. What this module does own is
 * *lifecycle* validation — active, effective today, exactly one winner — which is not business
 * policy but the integrity of the configuration itself, and belongs in code where it can be tested.
 */

import { z } from 'zod';

/** Criteria columns the configuration carries. Read by the ruleset; never evaluated here. */
export const StrategyCriteriaSchema = z.object({
  customerType: z.string().optional(),
  productType: z.string().optional(),
  dpdFrom: z.number().int().optional(),
  dpdTo: z.number().int().optional(),
  arrearsFrom: z.number().optional(),
  arrearsTo: z.number().optional(),
  exposureFrom: z.number().optional(),
  exposureTo: z.number().optional(),
  riskLevel: z.string().optional(),
  nplFlag: z.boolean().optional(),
  brokenPtpCountFrom: z.number().int().optional(),
  legalStatus: z.string().optional(),
  restructureStatus: z.string().optional(),
});
export type StrategyCriteria = z.infer<typeof StrategyCriteriaSchema>;

/** When a configuration row is in force. Absent bounds mean "open-ended", not "now". */
export const EffectivePeriodSchema = z.object({
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
});
export type EffectivePeriod = z.infer<typeof EffectivePeriodSchema>;

export const StrategyActionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  /** Order within the strategy. The sequence is the treatment. */
  sequence: z.number().int(),
  /** The Collection Activity type this action produces, by code — never a GUID in code. */
  activityTypeCode: z.string().optional(),
  /** Channel for a communication action. Delivery is the Communication phase's job, not this one. */
  communicationChannel: z.string().optional(),
  communicationTemplateCode: z.string().optional(),
  /** Days relative to the trigger event. */
  dayOffset: z.number().int(),
  triggerEvent: z.string(),
  queueName: z.string().optional(),
  requiresApproval: z.boolean(),
  isMandatory: z.boolean(),
  stopOnPayment: z.boolean(),
  stopOnPtp: z.boolean(),
  escalateIfNotCompleted: z.boolean(),
  escalationHours: z.number().int().optional(),
  processCode: z.string().optional(),
  ruleCode: z.string().optional(),
  isActive: z.boolean(),
});
export type StrategyAction = z.infer<typeof StrategyActionSchema>;

export const CollectionStrategySchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  /** Lower wins when the ruleset offers several. A tie at the top is a configuration conflict. */
  priority: z.number().int(),
  criteria: StrategyCriteriaSchema,
  effective: EffectivePeriodSchema,
  /** The ruleset this strategy expects to be selected by, where the configuration names one. */
  ruleCode: z.string().optional(),
  /** Suppresses automated contact for cases under this strategy. */
  noAutomatedContact: z.boolean(),
  description: z.string().optional(),
  isActive: z.boolean(),
  actions: z.array(StrategyActionSchema).default([]),
});
export type CollectionStrategy = z.infer<typeof CollectionStrategySchema>;

/** Raised when the configuration cannot yield exactly one applicable strategy. */
export class StrategyConfigurationError extends Error {
  constructor(message: string, readonly kind: 'NoneApplicable' | 'Conflict' | 'NotFound' | 'NotEffective') {
    super(message);
    this.name = 'StrategyConfigurationError';
  }
}

/** True when the row is active and today falls inside its effective period. */
export function isEffective(period: EffectivePeriod, asOf: string): boolean {
  const at = Date.parse(asOf);
  if (Number.isNaN(at)) return false;
  if (period.effectiveFrom) {
    const from = Date.parse(period.effectiveFrom);
    if (!Number.isNaN(from) && at < from) return false;
  }
  if (period.effectiveTo) {
    const to = Date.parse(period.effectiveTo);
    if (!Number.isNaN(to) && at > to) return false;
  }
  return true;
}

export function isUsable(strategy: CollectionStrategy, asOf: string): boolean {
  return strategy.isActive && isEffective(strategy.effective, asOf);
}

/**
 * Picks the one strategy that applies, from the codes the ruleset offered and the configuration that
 * exists. The ruleset's order is respected first — it offers "most specific first" — and `priority`
 * breaks ties only among candidates the ruleset ranked equally, which in practice means the first
 * code it gave.
 *
 * Every way this can fail is a distinct, named error, because "no strategy" and "two strategies"
 * need different human responses and neither may be resolved by picking one.
 */
export function resolveApplicableStrategy(
  candidateCodes: readonly string[],
  configured: readonly CollectionStrategy[],
  asOf: string,
): CollectionStrategy {
  if (candidateCodes.length === 0) {
    throw new StrategyConfigurationError('The strategy ruleset returned no applicable strategy for this case', 'NoneApplicable');
  }

  const byCode = new Map<string, CollectionStrategy[]>();
  for (const strategy of configured) {
    const list = byCode.get(strategy.code) ?? [];
    list.push(strategy);
    byCode.set(strategy.code, list);
  }

  const firstCode = candidateCodes[0]!;
  const rows = byCode.get(firstCode) ?? [];
  if (rows.length === 0) {
    throw new StrategyConfigurationError(
      `The strategy ruleset selected '${firstCode}', which no Collection Strategy configuration defines`, 'NotFound');
  }

  const usable = rows.filter(s => isUsable(s, asOf));
  if (usable.length === 0) {
    throw new StrategyConfigurationError(
      `Strategy '${firstCode}' exists but is inactive or outside its effective period on ${asOf}`, 'NotEffective');
  }
  if (usable.length > 1) {
    const topPriority = Math.min(...usable.map(s => s.priority));
    const winners = usable.filter(s => s.priority === topPriority);
    if (winners.length > 1) {
      throw new StrategyConfigurationError(
        `Strategy code '${firstCode}' matches ${winners.length} active configurations at priority ${topPriority}; ` +
        'the configuration cannot say which treatment applies', 'Conflict');
    }
    return winners[0]!;
  }
  return usable[0]!;
}

/** The actions of a strategy that are active, in the order the treatment runs. */
export function orderedActions(strategy: CollectionStrategy): StrategyAction[] {
  return strategy.actions
    .filter(action => action.isActive)
    .slice()
    .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
}
