// Required / nullable for record-bound inputs (FR-B2-12). Declared facts carry their own flags;
// these rules cover every other input, whichever surface (table, conditions, canvas) produced it.

import { isDeclaredInput } from './declaredFacts';

export interface InputRule {
  readonly required: boolean;
  readonly nullable: boolean;
}

export type InputRules = Readonly<Record<string, InputRule>>;

const DEFAULT_RULE: InputRule = { required: false, nullable: true };

type PcrmInputRecord = Record<string, unknown>;

function inputsOf(pcrm: unknown): PcrmInputRecord[] {
  const inputs = (pcrm as { inputs?: unknown })?.inputs;
  return Array.isArray(inputs) ? inputs.filter((i): i is PcrmInputRecord => typeof i === 'object' && i !== null) : [];
}

/** Names of the record-bound inputs of a PCRM, in order. */
export function boundInputNames(pcrm: unknown): string[] {
  return inputsOf(pcrm).filter((i) => !isDeclaredInput(i)).map((i) => String(i['name'] ?? '')).filter(Boolean);
}

/** The rule for one input; an input with no rule is optional and nullable (the PCRM defaults). */
export function ruleFor(rules: InputRules, name: string): InputRule {
  return rules[name] ?? DEFAULT_RULE;
}

/** The PCRM with each bound input's required / nullable written, only where it differs from the defaults. */
export function applyInputRules<T>(pcrm: T, rules: InputRules): T {
  const inputs = inputsOf(pcrm).map((input) => {
    if (isDeclaredInput(input)) return input;
    const rule = ruleFor(rules, String(input['name'] ?? ''));
    return { ...input, ...(rule.required ? { required: true } : {}), ...(rule.nullable ? {} : { nullable: false }) };
  });
  return { ...(pcrm as object), inputs } as T;
}

/** The rules a saved PCRM carries for its bound inputs, so they survive a reload. */
export function extractInputRules(pcrmInputs: unknown[]): InputRules {
  const bound = (Array.isArray(pcrmInputs) ? pcrmInputs : [])
    .filter((i): i is PcrmInputRecord => typeof i === 'object' && i !== null && !isDeclaredInput(i as PcrmInputRecord));
  return Object.fromEntries(bound
    .filter((i) => i['required'] === true || i['nullable'] === false)
    .map((i) => [String(i['name']), { required: i['required'] === true, nullable: i['nullable'] !== false }]));
}
