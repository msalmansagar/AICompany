/**
 * Registers SurveyTriggerPlugin (B2): uploads the assembly, registers the plugin type and the
 * Create + Update steps for every seed source, all steps DISABLED until the source is
 * activated (B4). Plan mode by default; `--apply` writes.
 *
 *   node --env-file=<dfe>/scripts/.env register-plugin.mjs --seed seed/org5869857f.json [--apply]
 *
 * Build first: dotnet build -c Release ../crm-plugins/Qdb.SurveyEngine
 * Live change: run --apply only with the user's explicit go-ahead for that org.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { SOLUTION } from './manifest.mjs';
import { createDataverseClient } from './lib/dataverse-client.mjs';
import { stepsForSources } from './lib/plugin-payloads.mjs';
import { ensureAssembly, ensurePluginType, ensureSteps, ensureActivationApis } from './lib/plugin-steps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DLL_PATH = resolve(HERE, '../crm-plugins/Qdb.SurveyEngine/bin/Release/net471/Qdb.SurveyEngine.dll');
const DLL_VERSION = '1.0.0.0';

async function run() {
  const { values } = parseArgs({ options: { seed: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  if (!values.seed) throw new Error('--seed <file> is required.');
  const seed = JSON.parse(readFileSync(values.seed, 'utf8'));
  const client = await createDataverseClient({ solutionUniqueName: SOLUTION.uniqueName });
  if (seed.org.replace(/\/$/, '') !== client.orgUrl) throw new Error(`Seed file is for ${seed.org}, but DV_DATAVERSE_URL is ${client.orgUrl}`);

  const report = (action, subject) => console.log(`  ${action.padEnd(7)} ${subject}`);
  const context = { client, isApply: values.apply, report, solutionUniqueName: SOLUTION.uniqueName };
  console.log(`${values.apply ? 'APPLY' : 'PLAN (no changes)'} — ${client.orgUrl}`);
  console.log('[1] Assembly');
  const assemblyId = await ensureAssembly({ ...context, dll: { base64: readFileSync(DLL_PATH).toString('base64'), version: DLL_VERSION } });
  console.log('[2] Plugin type');
  const pluginTypeId = await ensurePluginType({ ...context, assemblyId });
  console.log('[3] Steps (disabled)');
  await ensureSteps({ ...context, pluginTypeId, steps: stepsForSources(seed.sources) });
  console.log('[4] Source activation Custom APIs');
  await ensureActivationApis({ ...context, assemblyId });
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
