import {
  CollectionStrategySchema,
  StrategyActionSchema,
  type CollectionStrategy,
  type CrmCallContext,
  type CrmRecord,
  type ICrmAdapter,
  type StrategyAction,
} from '@dcp/domain';
import {
  ARREAR_BUCKET_VALUES,
  CUSTOMER_TYPE_VALUES,
  COMMUNICATION_CHANNEL_VALUES,
  ENTITY_SETS,
  STRATEGY,
  STRATEGY_ACTION,
  TRIGGER_EVENT_VALUES,
  labelOf,
} from './qdbBindings.js';

const STRATEGY_COLUMNS = [
  STRATEGY.id, STRATEGY.code, STRATEGY.name, STRATEGY.priority, STRATEGY.isActive,
  STRATEGY.effectiveFrom, STRATEGY.effectiveTo, STRATEGY.ruleCode, STRATEGY.noAutomatedContact,
  STRATEGY.description, STRATEGY.customerType, STRATEGY.productType, STRATEGY.dpdFrom, STRATEGY.dpdTo,
  STRATEGY.arrearsFrom, STRATEGY.arrearsTo, STRATEGY.exposureFrom, STRATEGY.exposureTo,
  STRATEGY.riskLevel, STRATEGY.nplFlag, STRATEGY.brokenPtpCountFrom, STRATEGY.legalStatus, STRATEGY.restructureStatus,
];

const ACTION_COLUMNS = [
  STRATEGY_ACTION.id, STRATEGY_ACTION.name, STRATEGY_ACTION.sequence, STRATEGY_ACTION.dayOffset,
  STRATEGY_ACTION.triggerEvent, STRATEGY_ACTION.communicationChannel, STRATEGY_ACTION.queueName,
  STRATEGY_ACTION.requiresApproval, STRATEGY_ACTION.isMandatory, STRATEGY_ACTION.stopOnPayment,
  STRATEGY_ACTION.stopOnPtp, STRATEGY_ACTION.escalateIfNotCompleted, STRATEGY_ACTION.escalationHours,
  STRATEGY_ACTION.processCode, STRATEGY_ACTION.ruleCode, STRATEGY_ACTION.isActive,
  // Lookups are selected by their `_<column>_value` form. Selecting the bare column returns nothing
  // for it — which made every action look unparented on the first live run.
  STRATEGY_ACTION.strategyLookupValue, STRATEGY_ACTION.activityTypeLookupValue,
];

/**
 * Reads Collection Strategy configuration and the actions that belong to it.
 *
 * It reads; it does not decide. Which strategy applies is the Rule Engine's answer, and the
 * lifecycle rules that narrow it to one live in the domain. This class exists so that neither of
 * those has to know a column name.
 */
export class StrategyRepository {
  constructor(private readonly crm: ICrmAdapter) {}

  /** Every configured strategy, active or not, with its actions. Callers filter by lifecycle. */
  async listAll(context: CrmCallContext = {}): Promise<CollectionStrategy[]> {
    const [strategyRows, actionRows] = await Promise.all([
      this.crm.retrieveMultiple(ENTITY_SETS.collectionStrategy, { select: STRATEGY_COLUMNS }, context),
      this.crm.retrieveMultiple(ENTITY_SETS.strategyAction, { select: ACTION_COLUMNS }, context),
    ]);

    const actionsByStrategy = new Map<string, StrategyAction[]>();
    const typeCodeById = await this.resolveActivityTypeCodes(actionRows, context);
    for (const row of actionRows) {
      const strategyId = row[STRATEGY_ACTION.strategyLookupValue];
      if (typeof strategyId !== 'string') continue;
      const list = actionsByStrategy.get(strategyId) ?? [];
      list.push(toAction(row, typeCodeById));
      actionsByStrategy.set(strategyId, list);
    }

    return strategyRows.map(row => {
      const id = String(row[STRATEGY.id]);
      return toStrategy(row, actionsByStrategy.get(id) ?? []);
    });
  }

  /** The strategies a set of codes names, with their actions. */
  async findByCodes(codes: readonly string[], context: CrmCallContext = {}): Promise<CollectionStrategy[]> {
    if (codes.length === 0) return [];
    const wanted = new Set(codes);
    const all = await this.listAll(context);
    return all.filter(strategy => wanted.has(strategy.code));
  }

  /**
   * Activity types are reference data matched by code, never by a GUID in source. The action rows
   * carry the lookup id, so one read turns those into codes.
   */
  private async resolveActivityTypeCodes(actionRows: readonly CrmRecord[], context: CrmCallContext): Promise<Map<string, string>> {
    const ids = new Set<string>();
    for (const row of actionRows) {
      const id = row[STRATEGY_ACTION.activityTypeLookupValue];
      if (typeof id === 'string') ids.add(id);
    }
    if (ids.size === 0) return new Map();

    const types = await this.crm.retrieveMultiple(ENTITY_SETS.collectionActivityType, {
      select: ['qdb_collectionactivitytypeid', 'qdb_code'],
    }, context);
    const map = new Map<string, string>();
    for (const type of types) {
      const id = String(type['qdb_collectionactivitytypeid']);
      if (ids.has(id) && typeof type['qdb_code'] === 'string') map.set(id, type['qdb_code']);
    }
    return map;
  }
}

function toStrategy(row: CrmRecord, actions: StrategyAction[]): CollectionStrategy {
  const optional = <T>(key: string, value: T | undefined | null): Record<string, T> =>
    value === undefined || value === null ? {} : { [key]: value };

  return CollectionStrategySchema.parse({
    id: String(row[STRATEGY.id]),
    code: String(row[STRATEGY.code] ?? row[STRATEGY.name]),
    name: String(row[STRATEGY.name] ?? ''),
    priority: Number(row[STRATEGY.priority] ?? 0),
    isActive: row[STRATEGY.isActive] === true,
    noAutomatedContact: row[STRATEGY.noAutomatedContact] === true,
    ...optional('ruleCode', asString(row[STRATEGY.ruleCode])),
    ...optional('description', asString(row[STRATEGY.description])),
    effective: {
      ...optional('effectiveFrom', asString(row[STRATEGY.effectiveFrom])),
      ...optional('effectiveTo', asString(row[STRATEGY.effectiveTo])),
    },
    criteria: {
      ...optional('customerType', labelOf(CUSTOMER_TYPE_VALUES, row[STRATEGY.customerType])),
      ...optional('productType', asString(row[STRATEGY.productType])),
      ...optional('dpdFrom', asNumber(row[STRATEGY.dpdFrom])),
      ...optional('dpdTo', asNumber(row[STRATEGY.dpdTo])),
      ...optional('arrearsFrom', asNumber(row[STRATEGY.arrearsFrom])),
      ...optional('arrearsTo', asNumber(row[STRATEGY.arrearsTo])),
      ...optional('exposureFrom', asNumber(row[STRATEGY.exposureFrom])),
      ...optional('exposureTo', asNumber(row[STRATEGY.exposureTo])),
      ...optional('riskLevel', asString(row[STRATEGY.riskLevel])),
      ...optional('nplFlag', typeof row[STRATEGY.nplFlag] === 'boolean' ? row[STRATEGY.nplFlag] : undefined),
      ...optional('brokenPtpCountFrom', asNumber(row[STRATEGY.brokenPtpCountFrom])),
      ...optional('legalStatus', asString(row[STRATEGY.legalStatus])),
      ...optional('restructureStatus', asString(row[STRATEGY.restructureStatus])),
    },
    actions,
  });
}

function toAction(row: CrmRecord, typeCodeById: Map<string, string>): StrategyAction {
  const optional = <T>(key: string, value: T | undefined): Record<string, T> =>
    value === undefined ? {} : { [key]: value };
  const typeId = row[STRATEGY_ACTION.activityTypeLookupValue];

  return StrategyActionSchema.parse({
    id: String(row[STRATEGY_ACTION.id]),
    name: String(row[STRATEGY_ACTION.name] ?? ''),
    sequence: Number(row[STRATEGY_ACTION.sequence] ?? 0),
    dayOffset: Number(row[STRATEGY_ACTION.dayOffset] ?? 0),
    triggerEvent: labelOf(TRIGGER_EVENT_VALUES, row[STRATEGY_ACTION.triggerEvent]) ?? 'Unknown',
    ...optional('activityTypeCode', typeof typeId === 'string' ? typeCodeById.get(typeId) : undefined),
    ...optional('communicationChannel', labelOf(COMMUNICATION_CHANNEL_VALUES, row[STRATEGY_ACTION.communicationChannel])),
    ...optional('queueName', asString(row[STRATEGY_ACTION.queueName])),
    ...optional('processCode', asString(row[STRATEGY_ACTION.processCode])),
    ...optional('ruleCode', asString(row[STRATEGY_ACTION.ruleCode])),
    ...optional('escalationHours', asNumber(row[STRATEGY_ACTION.escalationHours])),
    requiresApproval: row[STRATEGY_ACTION.requiresApproval] === true,
    isMandatory: row[STRATEGY_ACTION.isMandatory] === true,
    stopOnPayment: row[STRATEGY_ACTION.stopOnPayment] === true,
    stopOnPtp: row[STRATEGY_ACTION.stopOnPtp] === true,
    escalateIfNotCompleted: row[STRATEGY_ACTION.escalateIfNotCompleted] === true,
    isActive: row[STRATEGY_ACTION.isActive] === true,
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** Unused bucket map kept out of the strategy read; referenced so the binding stays one source. */
export const STRATEGY_BUCKET_VALUES = ARREAR_BUCKET_VALUES;
