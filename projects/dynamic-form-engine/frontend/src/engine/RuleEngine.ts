import { Engine, ConditionProperties, Event } from 'json-rules-engine';
import type {
  BusinessRule,
  FormFieldValues,
  RuleEvaluationResult,
  RuleCondition,
  BusinessRuleAction,
  OptionValue,
  ScopedButton,
  ButtonConditionSet,
  RuleTriggerEvent,
} from '@qdb/shared';
import { DEFAULT_RULE_TRIGGER_EVENT } from '@qdb/shared';
import { ExpressionEngine, type ExpressionContext } from '@qdb/shared';
import { logger } from '../utils/logger';

/**
 * Suffix for the second fact carrying a lookup's display name.
 *
 * Chosen to be unusable as a Dataverse schema name, so it can never collide with a real
 * field's fact.
 */
const DISPLAY_FACT_SUFFIX = '::displayName';

function displayFactName(fieldId: string): string {
  return `${fieldId}${DISPLAY_FACT_SUFFIX}`;
}

/** A lookup cell's stored shape: the record it points at, plus the text the user saw. */
function isLookupValue(value: unknown): value is { id: string; displayName: string } {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { displayName?: unknown }).displayName === 'string'
  );
}

/** Operators whose paired lookup conditions must both hold — see convertCondition. */
const NEGATIVE_OPERATORS: ReadonlySet<string> = new Set(['notEquals', 'notInList', 'notContains']);

const OPERATOR_MAP: Record<string, string> = {
  equals: 'equal',
  notEquals: 'notEqual',
  greaterThan: 'greaterThan',
  greaterThanOrEqual: 'greaterThanOrEqualTo',
  lessThan: 'lessThan',
  lessThanOrEqual: 'lessThanOrEqualTo',
  // Deliberately NOT json-rules-engine's built-in 'contains'/'doesNotContain'. Those are
  // registered with Array.isArray as their fact validator, so a STRING fact can never
  // satisfy them — a "contains" rule on any text or lookup field silently never fired.
  // See registerTextOperators.
  contains: 'textContains',
  notContains: 'textNotContains',
  inList: 'in',
  notInList: 'notIn',
};

/**
 * The moments a rule's conditions can be read against.
 *
 * Every trigger event reads the same conditions; they differ only in which snapshot of the
 * form supplies the values. Omitting a moment falls back to the live values, so a caller
 * that does not track snapshots keeps the original on-every-change behaviour.
 */
export interface RuleEvaluationMoments {
  /** The values the form loaded with. */
  atLoad?: FormFieldValues;
  /** The values as at the last time a field lost focus. */
  atLastBlur?: FormFieldValues;
  /** The values submitted. Explicitly null until the user has attempted a save. */
  atSave?: FormFieldValues | null;
}

function groupByTriggerEvent(rules: BusinessRule[]): Map<RuleTriggerEvent, BusinessRule[]> {
  const grouped = new Map<RuleTriggerEvent, BusinessRule[]>();

  for (const rule of rules) {
    const triggerEvent = rule.triggerEvent ?? DEFAULT_RULE_TRIGGER_EVENT;
    const existing = grouped.get(triggerEvent);
    if (existing) existing.push(rule);
    else grouped.set(triggerEvent, [rule]);
  }

  return grouped;
}

/**
 * The values one trigger event reads, or null when it has nothing to read yet — an on_save
 * rule before the user has submitted anything has no submitted values to judge.
 */
function resolveMomentValues(
  triggerEvent: RuleTriggerEvent,
  liveValues: FormFieldValues,
  moments: RuleEvaluationMoments,
): FormFieldValues | null {
  switch (triggerEvent) {
    case 'on_load':
      return moments.atLoad ?? liveValues;
    case 'on_blur':
      return moments.atLastBlur ?? liveValues;
    case 'on_save':
      return moments.atSave === undefined ? liveValues : moments.atSave;
    default:
      return liveValues;
  }
}

/** The message to log for a rule the engine refused, whatever was thrown. */
function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Substring operators that work on the values this product actually holds.
 *
 * json-rules-engine ships `contains` for ARRAYS only. Form values are overwhelmingly strings
 * — a text box, or a lookup's display name — so every `contains` rule evaluated to false
 * without complaint. These replace it under distinct names so the array behaviour is still
 * available to anything that wants it.
 *
 * Matching is case-SENSITIVE, consistent with `equals` and every other operator here.
 */
function registerTextOperators(engine: Engine): void {
  engine.addOperator('textContains', (factValue: unknown, compareValue: unknown) =>
    containsValue(factValue, compareValue));
  engine.addOperator('textNotContains', (factValue: unknown, compareValue: unknown) =>
    !containsValue(factValue, compareValue));
}

function containsValue(factValue: unknown, compareValue: unknown): boolean {
  if (factValue === null || factValue === undefined) return false;
  if (Array.isArray(factValue)) return factValue.includes(compareValue);
  return String(factValue).includes(String(compareValue));
}

interface RuleEvent {
  type: string;
  params: {
    action: BusinessRuleAction;
    targetFieldId?: string;
    targetSectionId?: string;
    targetTabId?: string;
    actionValue?: string;
  };
}

// DFE-CBTN-001: event shape emitted by evaluateButtons().
interface ButtonRuleEvent {
  type: string;
  params?: {
    buttonId?: string;
    axis?: 'visible' | 'enabled';
  };
}

function buildExpressionContext(values: FormFieldValues): ExpressionContext {
  const ctx: ExpressionContext = {};
  for (const [key, val] of Object.entries(values)) {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      ctx[key] = val;
    } else {
      ctx[key] = null;
    }
  }
  return ctx;
}

function buildEmptyResult(): RuleEvaluationResult {
  return {
    fieldVisibility: {},
    sectionVisibility: {},
    tabVisibility: {},
    fieldRequired: {},
    fieldReadonly: {},
    fieldValues: {},
    filteredOptions: {},
    buttonVisibility: {},
    buttonEnabledState: {},
  };
}

export class RuleEngine {
  /**
   * Evaluates all active business rules against the current field values and
   * returns the computed visibility, required, readonly, and value states.
   */
  async evaluate(
    rules: BusinessRule[],
    fieldValues: FormFieldValues,
    moments: RuleEvaluationMoments = {},
  ): Promise<RuleEvaluationResult> {
    const activeRules = rules.filter((rule) => rule.isActive);

    if (activeRules.length === 0) {
      return buildEmptyResult();
    }

    // One engine run per trigger event: each group reads its own snapshot of the form, and a
    // single fact map cannot hold two different values for the same field.
    const events: RuleEvent[] = [];
    for (const [triggerEvent, group] of groupByTriggerEvent(activeRules)) {
      const values = resolveMomentValues(triggerEvent, fieldValues, moments);
      if (values === null) continue;
      events.push(...await this.runRuleGroup(group, values));
    }

    return this.mapEventsToResult(events, fieldValues);
  }

  private async runRuleGroup(
    rules: BusinessRule[],
    values: FormFieldValues,
  ): Promise<RuleEvent[]> {
    const engine = new Engine();
    registerTextOperators(engine);
    rules.forEach((rule) => this.registerRule(engine, rule));

    const { events } = await engine.run(this.buildFacts(values));
    return events as RuleEvent[];
  }

  /**
   * DFE-CBTN-001: evaluates each scoped button's `visibleWhen` / `enabledWhen`
   * condition sets against the current field values. A button id appears in a
   * map only when it declares the corresponding set; callers fall back to the
   * button's static `isVisible` / `isActive` flag when it is absent. Reuses the
   * same operator machinery (`convertCondition` / `buildFacts`) as `evaluate`.
   */
  async evaluateButtons(
    buttons: ScopedButton[],
    fieldValues: FormFieldValues,
  ): Promise<{
    buttonVisibility: Record<string, boolean>;
    buttonEnabledState: Record<string, boolean>;
  }> {
    const buttonVisibility: Record<string, boolean> = {};
    const buttonEnabledState: Record<string, boolean> = {};

    const engine = new Engine();
    registerTextOperators(engine);
    let ruleCount = 0;

    for (const button of buttons) {
      if (this.hasConditions(button.visibleWhen)) {
        buttonVisibility[button.id] = false;
        this.registerButtonRule(engine, button, 'visible');
        ruleCount += 1;
      }
      if (this.hasConditions(button.enabledWhen)) {
        buttonEnabledState[button.id] = false;
        this.registerButtonRule(engine, button, 'enabled');
        ruleCount += 1;
      }
    }

    if (ruleCount === 0) {
      return { buttonVisibility, buttonEnabledState };
    }

    const facts = this.buildFacts(fieldValues);
    const { events } = await engine.run(facts);

    for (const event of events as ButtonRuleEvent[]) {
      const buttonId = event.params?.buttonId;
      if (!buttonId) continue;
      if (event.params?.axis === 'visible') buttonVisibility[buttonId] = true;
      else if (event.params?.axis === 'enabled') buttonEnabledState[buttonId] = true;
    }

    return { buttonVisibility, buttonEnabledState };
  }

  private hasConditions(set?: ButtonConditionSet): boolean {
    return !!set && Array.isArray(set.conditions) && set.conditions.length > 0;
  }

  /**
   * Adds one rule to the engine, or skips it.
   *
   * Every rule on a form is registered against a single engine before any of them runs, so a
   * rule that could not be built used to throw out of the registration loop and take the whole
   * form's conditional behaviour with it. A rule the engine cannot express is that rule's own
   * defect: it is dropped, and the rest of the form keeps working.
   */
  private registerRule(engine: Engine, rule: BusinessRule): void {
    try {
      engine.addRule({
        conditions: this.buildConditions(rule),
        event: this.buildEvent(rule),
        priority: rule.priority,
      });
    } catch (error) {
      logger.error('rule_skipped', {
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        reason: describeFailure(error),
      });
    }
  }

  /**
   * Adds one axis of a scoped button's conditions, or skips it. The caller has already
   * defaulted the axis to false, so a button gated by conditions that cannot be built stays
   * hidden or disabled rather than falling open.
   */
  private registerButtonRule(
    engine: Engine,
    button: ScopedButton,
    axis: 'visible' | 'enabled',
  ): void {
    const conditionSet = axis === 'visible' ? button.visibleWhen : button.enabledWhen;
    try {
      engine.addRule({
        conditions: this.buildConditionSet(conditionSet!),
        event: { type: `${axis}:${button.id}`, params: { buttonId: button.id, axis } },
      });
    } catch (error) {
      logger.error('button_rule_skipped', {
        buttonId: button.id,
        axis,
        reason: describeFailure(error),
      });
    }
  }

  private buildConditionSet(
    set: ButtonConditionSet,
  ): { all: ConditionProperties[] } | { any: ConditionProperties[] } {
    const mapped = set.conditions.map((condition) => this.convertCondition(condition));

    if (set.logic === 'AND') {
      return { all: mapped };
    }

    return { any: mapped };
  }

  private buildConditions(
    rule: BusinessRule,
  ): { all: ConditionProperties[] } | { any: ConditionProperties[] } {
    const mapped = rule.conditions.map((condition) =>
      this.convertCondition(condition),
    );

    if (rule.conditionsLogic === 'AND') {
      return { all: mapped };
    }

    return { any: mapped };
  }

  private convertCondition(condition: RuleCondition): ConditionProperties {
    // Emptiness is a property of the value itself, so the id fact answers it alone —
    // pairing here would make "is empty" true whenever EITHER half was blank.
    if (condition.operator === 'isEmpty') {
      return {
        fact: condition.fieldId,
        operator: 'equal',
        value: null,
      } as ConditionProperties;
    }

    if (condition.operator === 'isNotEmpty') {
      return {
        fact: condition.fieldId,
        operator: 'notEqual',
        value: null,
      } as ConditionProperties;
    }

    const engineOperator = OPERATOR_MAP[condition.operator];

    if (!engineOperator) {
      throw new Error(
        `Unsupported condition operator: ${condition.operator}`,
      );
    }

    const value = condition.value ?? null;
    const onId = { fact: condition.fieldId, operator: engineOperator, value } as ConditionProperties;
    const onDisplay = { fact: displayFactName(condition.fieldId), operator: engineOperator, value } as ConditionProperties;

    // A lookup matches on either its id or its display name. Which combinator that needs
    // depends on the operator: "equals X" holds if EITHER half is X, but "not equals X"
    // only holds if BOTH halves differ — an `any` there would make every lookup condition
    // true, since the two halves are never both equal to the same string.
    return (NEGATIVE_OPERATORS.has(condition.operator)
      ? { all: [onId, onDisplay] }
      : { any: [onId, onDisplay] }) as unknown as ConditionProperties;
  }

  private buildEvent(rule: BusinessRule): Event {
    const params: RuleEvent['params'] = {
      action: rule.action,
      targetFieldId: rule.targetFieldId,
      targetSectionId: rule.targetSectionId,
      targetTabId: rule.targetTabId,
      actionValue: rule.actionValue,
    };

    return {
      type: rule.id,
      params,
    };
  }

  private buildFacts(fieldValues: FormFieldValues): Record<string, unknown> {
    // json-rules-engine requires non-undefined fact values
    const facts: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(fieldValues)) {
      const normalised = value ?? null;

      if (isLookupValue(normalised)) {
        // A lookup stores { id, displayName }. Comparing that object against a maker's
        // string never matched, so no lookup could ever drive a rule. Both halves become
        // facts and convertCondition tries each — a maker may reasonably have configured
        // either the record id or the name they see on screen.
        facts[key] = normalised.id;
        facts[displayFactName(key)] = normalised.displayName;
        continue;
      }

      facts[key] = normalised;
      // Registered for every field so the paired condition below is always well defined;
      // for a non-lookup both facts hold the same value and the pair is a no-op.
      facts[displayFactName(key)] = normalised;
    }

    return facts;
  }

  private mapEventsToResult(events: RuleEvent[], fieldValues: FormFieldValues): RuleEvaluationResult {
    const result = buildEmptyResult();

    for (const event of events) {
      const { action, targetFieldId, targetSectionId, targetTabId, actionValue } =
        event.params;

      switch (action) {
        case 'showField':
          if (targetFieldId) result.fieldVisibility[targetFieldId] = true;
          break;

        case 'hideField':
          if (targetFieldId) result.fieldVisibility[targetFieldId] = false;
          break;

        case 'showSection':
          if (targetSectionId) result.sectionVisibility[targetSectionId] = true;
          break;

        case 'hideSection':
          if (targetSectionId) result.sectionVisibility[targetSectionId] = false;
          break;

        case 'showTab':
          if (targetTabId) result.tabVisibility[targetTabId] = true;
          break;

        case 'hideTab':
          if (targetTabId) result.tabVisibility[targetTabId] = false;
          break;

        case 'makeRequired':
          if (targetFieldId) result.fieldRequired[targetFieldId] = true;
          break;

        case 'makeOptional':
          if (targetFieldId) result.fieldRequired[targetFieldId] = false;
          break;

        case 'makeReadonly':
          if (targetFieldId) result.fieldReadonly[targetFieldId] = true;
          break;

        case 'makeEditable':
          if (targetFieldId) result.fieldReadonly[targetFieldId] = false;
          break;

        case 'setValue':
          if (targetFieldId) result.fieldValues[targetFieldId] = actionValue ?? '';
          break;

        case 'clearValue':
          if (targetFieldId) result.fieldValues[targetFieldId] = null;
          break;

        case 'calculateValue':
          if (targetFieldId && actionValue) {
            const ctx = buildExpressionContext(fieldValues);
            try {
              result.fieldValues[targetFieldId] = ExpressionEngine.evaluate(actionValue, ctx);
            } catch {
              result.fieldValues[targetFieldId] = null;
            }
          }
          break;

        case 'filterOptions':
          if (targetFieldId && actionValue) {
            result.filteredOptions[targetFieldId] = this.parseFilteredOptions(actionValue);
          }
          break;

        default:
          break;
      }
    }

    return result;
  }

  private parseFilteredOptions(optionsJson: string): OptionValue[] {
    try {
      const parsed: unknown = JSON.parse(optionsJson);

      if (Array.isArray(parsed)) {
        return parsed as OptionValue[];
      }

      return [];
    } catch {
      return [];
    }
  }
}

// Singleton for use throughout the app
export const ruleEngine = new RuleEngine();
