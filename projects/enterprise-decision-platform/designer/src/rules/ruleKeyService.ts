// Rule Key business logic: validation, slug suggestion, and availability checks.
// The single Dataverse write lives in client.ts:writeRuleKey — imported here for orchestration.
// FR-B3-04, FR-B3-05, FR-B3-13, FR-B3-14, FR-B3-15.

import { RULE_KEY_PATTERN, RULE_KEY_MIN_LENGTH, RULE_KEY_MAX_LENGTH } from '../contract';
import { writeRuleKey, isRuleKeyUsedByAnotherRule, isRuleKeyRetired } from '../dataverse/client';

export interface RuleKeyValidation {
  readonly valid: boolean;
  readonly error?: string;
}

export interface RuleKeyAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

/**
 * Validate a rule key against the contract pattern and lengths (FR-B3-02, FR-B3-13).
 * Upper-case is REJECTED with a message — never silently lower-cased (FR-B3-13).
 */
export function validateRuleKey(key: string): RuleKeyValidation {
  if (!key) return { valid: false, error: 'Rule key is required.' };
  if (key !== key.toLowerCase()) return { valid: false, error: 'Rule key must be entirely lower-case. Upper-case letters are not allowed.' };
  if (key.length < RULE_KEY_MIN_LENGTH) return { valid: false, error: `Rule key must be at least ${RULE_KEY_MIN_LENGTH} characters.` };
  if (key.length > RULE_KEY_MAX_LENGTH) return { valid: false, error: `Rule key must be at most ${RULE_KEY_MAX_LENGTH} characters.` };
  if (!RULE_KEY_PATTERN.test(key)) return { valid: false, error: 'Rule key must match pattern: lower-case letters, digits, and dot/hyphen/underscore separators (e.g. loan.approval or credit-check).' };
  return { valid: true };
}

/**
 * Suggest a slug from a display name.
 * Example: "Loan Approval — Sample" → "loan.approval.sample"
 */
export function suggestRuleKey(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, RULE_KEY_MAX_LENGTH) || 'rule';
}

/**
 * Check whether a proposed key is available (not held by any rule and not retired).
 * FR-B3-14: retired rule keys must not be reused.
 */
export async function checkRuleKeyAvailability(key: string): Promise<RuleKeyAvailability> {
  const [inUse, retired] = await Promise.all([
    isRuleKeyUsedByAnotherRule(key),
    isRuleKeyRetired(key),
  ]);
  if (retired) return { available: false, reason: 'This key belonged to a deleted rule and cannot be reused (FR-B3-14).' };
  if (inUse) return { available: false, reason: 'This key is already held by another rule.' };
  return { available: true };
}

/**
 * Set the rule key on a rule record for the first (and only) time.
 * Validates the key before writing. After this write the key is read-only in the designer (FR-B3-05).
 * This function exists to route all ruleKey writes through one call site — it delegates to
 * client.ts:writeRuleKey which is the single Dataverse write location (FR-B3-05).
 */
export async function setRuleKeyOnce(ruleId: string, key: string): Promise<void> {
  const problem = await ruleKeyProblem(key, true);
  if (problem) throw new Error(problem);
  await writeRuleKey(ruleId, key);
}

/**
 * Why a key cannot be set now, or null when it can. Checked BEFORE the rule is saved, so a new
 * rule is never created without a usable key (FR-B3-04). A rule being created must have a key;
 * an existing rule with no key (legacy, pre-backfill) may be saved without one.
 */
export async function ruleKeyProblem(key: string | null, isRequired: boolean): Promise<string | null> {
  if (!key) return isRequired ? 'A rule key is required when creating a rule.' : null;
  const validation = validateRuleKey(key);
  if (!validation.valid) return validation.error ?? 'Invalid rule key.';
  const availability = await checkRuleKeyAvailability(key);
  return availability.available ? null : (availability.reason ?? 'This key is not available.');
}
