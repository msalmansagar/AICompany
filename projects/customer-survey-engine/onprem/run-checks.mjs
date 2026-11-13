/**
 * READ-ONLY. Runs the on-prem checks (onprem/checks/survey-checks.js) from Node against the cloud
 * org, with the service principal, so the same code QDB IT pastes into the browser is exercised here.
 *
 *   node --env-file=<dfe>/scripts/.env onprem/run-checks.mjs --date=2026-11-11 --check=preflight|stage-2|post-import [--org=BFD|HL]
 *
 * stage-2 FAILs S1 on the cloud org by design: SurveyEngine is installed there, so only an on-prem org
 * between runbook stages 2 and 4 can produce A2 evidence.
 *
 * The cloud org mirrors BFD, so --org=BFD is the meaningful configuration to check it with.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createDataverseClient } from '../provisioning/lib/dataverse-client.mjs';
import { SOLUTION } from '../provisioning/manifest.mjs';
import { readKitFacts } from './lib/kit-facts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SurveyChecks = createRequire(import.meta.url)('./checks/survey-checks.js');
const CHECKS = {
  preflight: ({ get, kit, config }) => SurveyChecks.preflight({ get, kit, config }),
  'stage-2': ({ get, kit }) => SurveyChecks.formEngineOnly({ get, kit }),
  'post-import': ({ get, kit }) => SurveyChecks.postImport({ get, kit }),
};

async function run() {
  const { values } = parseArgs({ options: { date: { type: 'string' }, check: { type: 'string' }, org: { type: 'string', default: 'BFD' } } });
  const kitDir = resolve(HERE, `../onprem-deploy/${values.date}`);
  const kit = readKitFacts(kitDir);
  const config = JSON.parse(readFileSync(resolve(kitDir, `config/${values.org}.json`), 'utf8'));
  const client = await createDataverseClient({ solutionUniqueName: SOLUTION.uniqueName });
  const get = async (path) => (await client.send('GET', path)).json;
  const runCheck = CHECKS[values.check ?? 'preflight'];
  if (!runCheck) throw new Error(`unknown --check=${values.check}; use ${Object.keys(CHECKS).join(', ')}`);
  const report = await runCheck({ get, kit, config });
  console.log(`${report.kind} on ${client.orgUrl} (config ${values.org})`);
  report.checks.forEach((check) => console.log(`  ${check.status.padEnd(4)} ${check.id.padEnd(6)} ${check.title} — ${check.detail}`));
  console.log(`  render cache: ${Array.isArray(report.renderCache) ? `${report.renderCache.length} rows` : report.renderCache.error}`);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
