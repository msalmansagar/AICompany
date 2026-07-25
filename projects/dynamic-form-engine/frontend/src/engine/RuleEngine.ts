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
} from '@qdb/shared';
import { ExpressionEngine, type ExpressionContext } from '@qdb/shared';

const OPERATOR_MAP: Record<string, string> = {
  equals: 'equal',
  notEquals: 'notEqual',
  greaterThan: 'greaterThan',
  greaterThanOrEqual: 'greaterThanOrEqualTo',
  lessThan: 'lessThan',
  lessThanOrEqual: 'lessThanOrEqualTo',
  contains: 'contains',
  inList: 'in',
  notInList: 'notIn',
};

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
  ): Promise<RuleEvaluationResult> {
    const activeRules = rules.filter((rule) => rule.isActive);

    if (activeRules.length === 0) {
      return buildEmptyResult();
    }

    const engine = new Engine();

    activeRules.forEach((rule) => {
      const conditions = this.buildConditions(rule);
      const event = this.buildEvent(rule);

      engine.addRule({
        conditions,
        event,
        priority: rule.priority,
      });
    });

    const facts = this.buildFacts(fieldValues);
    const { events } = await engine.run(facts);

    return this.mapEventsToResult(events as RuleEvent[], fieldValues);
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
    let ruleCount = 0;

    for (const button of buttons) {
      if (this.hasConditions(button.visibleWhen)) {
        buttonVisibility[button.id] = false;
        engine.addRule({
          conditions: this.buildConditionSet(button.visibleWhen!),
          event: { type: `vis:${button.id}`, params: { buttonId: button.id, axis: 'visible' } },
        });
        ruleCount += 1;
      }
      if (this.hasConditions(button.enabledWhen)) {
        buttonEnabledState[button.id] = false;
        engine.addRule({
          conditions: this.buildConditionSet(button.enabledWhen!),
          event: { type: `en:${button.id}`, params: { buttonId: button.id, axis: 'enabled' } },
        });
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

    return {
      fact: condition.fieldId,
      operator: engineOperator,
      value: condition.value ?? null,
    } as ConditionProperties;
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
      facts[key] = value ?? null;
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
