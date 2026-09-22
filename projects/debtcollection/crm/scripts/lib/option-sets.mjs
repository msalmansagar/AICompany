/**
 * option-sets.mjs
 * Creates global option sets on the org, idempotently.
 */
import { apiGet, apiPost } from './crm-client.mjs';
import { addToSolution, COMPONENT_TYPE } from './solution.mjs';

/** @param {object} cfg @param {string} token @param {string} solutionName @param {string} name */
export async function globalOptionSetExists(cfg, token, solutionName, name) {
  const result = await apiGet(cfg, token, solutionName, `/GlobalOptionSetDefinitions(Name='${name}')?$select=Name`);
  return result !== null;
}

/**
 * Updates any option whose label drifted from the definition, via UpdateOptionValue,
 * so a corrected taxonomy reaches an org that was provisioned before the correction.
 * @returns {Promise<number>} number of labels updated
 */
async function reconcileLabels(cfg, token, solutionName, { name, definition }) {
  const current = await apiGet(cfg, token, solutionName, `/GlobalOptionSetDefinitions(Name='${name}')`);
  const byValue = new Map((current?.Options ?? []).map(o => [o.Value, o.Label?.UserLocalizedLabel?.Label]));
  let updated = 0;
  for (const option of definition.Options) {
    const wanted = option.Label.UserLocalizedLabel.Label;
    if (!byValue.has(option.Value) || byValue.get(option.Value) === wanted) continue;
    await apiPost(cfg, token, solutionName, '/UpdateOptionValue', { OptionSetName: name, Value: option.Value, Label: option.Label, MergeLabels: false });
    updated++;
  }
  return updated;
}

/**
 * Creates a global option set if it does not exist, then adds it to the solution.
 * Returns 'created' | 'skipped'.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {{ name: string, definition: object }} optionSetDef
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureOptionSet(cfg, token, solutionName, optionSetDef) {
  const { name, definition } = optionSetDef;
  if (await globalOptionSetExists(cfg, token, solutionName, name)) {
    const relabelled = await reconcileLabels(cfg, token, solutionName, optionSetDef);
    console.log(`  [SKIP] Option set ${name}${relabelled ? ` (${relabelled} labels updated)` : ''}`);
    return relabelled ? 'created' : 'skipped';
  }
  const { data } = await apiPost(cfg, token, solutionName, '/GlobalOptionSetDefinitions', definition);
  const optionSetId = data?.MetadataId ?? data?.metadataId;
  if (optionSetId) {
    await addToSolution(cfg, token, solutionName, optionSetId, COMPONENT_TYPE.OPTION_SET);
  }
  console.log(`  [CREATED] Option set ${name}`);
  return 'created';
}
