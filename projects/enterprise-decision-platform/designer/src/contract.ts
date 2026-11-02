// Single source for contract-level constants (IC-3).
// The contract JSON lives at contract/rule-engine-contract.json (one level above designer/).
// Every module that needs input types, RuleKey pattern, or Outcome values imports from here.
// Nothing duplicates these values — the CI check finds any second copy by pattern.

import CONTRACT from '../../contract/rule-engine-contract.json';

export const RULE_KEY_PATTERN = new RegExp(CONTRACT.ruleKey.pattern);
export const RULE_KEY_MIN_LENGTH: number = CONTRACT.ruleKey.minLength;
export const RULE_KEY_MAX_LENGTH: number = CONTRACT.ruleKey.maxLength;

export const STRICT_SCHEMA_VERSION: string = CONTRACT.strictContract.schemaVersion;
export const STRICT_INPUT_CONTRACT: string = CONTRACT.strictContract.inputContract;
export const LENIENT_INPUT_CONTRACT: string = CONTRACT.strictContract.lenientInputContract;

export type InputContractMode = 'strict' | 'lenient';

export type InputTypeName = (typeof CONTRACT.inputTypes)[number]['name'];
export const INPUT_TYPES = CONTRACT.inputTypes as readonly {
  readonly name: string;
  readonly strict: string | null;
  readonly label: string;
}[];

// Types whose strict value is non-null — valid in a strict rule (FR-B2-04, FR-B1-07).
// Lookup has strict: null and is excluded (EDP066).
export const STRICT_COMPATIBLE_TYPES = INPUT_TYPES.filter((t) => t.strict !== null);

export type Outcome = (typeof CONTRACT.outcomes)[number];
export const OUTCOMES = CONTRACT.outcomes as readonly string[];
