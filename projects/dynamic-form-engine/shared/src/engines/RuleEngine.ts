import { Engine } from 'json-rules-engine';
import { BusinessRule } from '../types/form';

export interface RuleEvaluationResult {
  visibilityMap: Map<string, boolean>;
  requiredMap: Map<string, boolean>;
  readonlyMap: Map<string, boolean>;
  clearedFields: Set<string>;
  calculatedValues: Map<string, unknown>;
}

export class RuleEngine {
  private readonly engine: Engine;

  constructor(rules: BusinessRule[]) {
    this.engine = new Engine();
    for (const rule of rules) {
      this.engine.addRule(rule as never);
    }
  }

  async evaluate(facts: Record<string, unknown>): Promise<RuleEvaluationResult> {
    const result = await this.engine.run(facts);
    const visibilityMap = new Map<string, boolean>();
    const requiredMap = new Map<string, boolean>();
    const readonlyMap = new Map<string, boolean>();
    const clearedFields = new Set<string>();
    const calculatedValues = new Map<string, unknown>();

    for (const event of result.events) {
      const { type, params } = event as { type: string; params?: Record<string, unknown> };
      const target = params?.target as string | undefined;
      if (!target) continue;
      switch (type) {
        case 'SHOW_FIELD': visibilityMap.set(target, true); break;
        case 'HIDE_FIELD': visibilityMap.set(target, false); clearedFields.add(target); break;
        case 'REQUIRE_FIELD': requiredMap.set(target, true); break;
        case 'OPTIONAL_FIELD': requiredMap.set(target, false); break;
        case 'READONLY_FIELD': readonlyMap.set(target, true); break;
        case 'SET_VALUE': calculatedValues.set(target, params?.value); break;
        case 'CLEAR_VALUE': clearedFields.add(target); break;
      }
    }

    return { visibilityMap, requiredMap, readonlyMap, clearedFields, calculatedValues };
  }
}
