/**
 * SurveyEngine provisioner (B1). Plan mode by default: reads the org and prints what it would
 * create, writing nothing. `--apply` creates what is missing. Safe to re-run either way.
 *
 *   node --env-file=<dfe>/scripts/.env provision.mjs --seed seed/org5869857f.json            # plan
 *   node --env-file=<dfe>/scripts/.env provision.mjs --seed seed/org5869857f.json --apply    # live write
 *
 * Live schema change: run --apply only with the user's explicit go-ahead for that org.
 * On-prem (Windows auth) is not supported by this client; on-prem ships the solution ZIP.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { SOLUTION, TABLES, RELATIONSHIPS, ALTERNATE_KEYS, ROLES } from './manifest.mjs';
import { findManifestProblems } from './lib/validate-manifest.mjs';
import { createDataverseClient } from './lib/dataverse-client.mjs';
import { ensureSolution, ensureTables, ensureRelationships, publishTables, ensureTableAuditing, ensureAlternateKeys } from './lib/schema-steps.mjs';
import { ensureRoles } from './lib/role-steps.mjs';
import { ensureSeedRows } from './lib/seed-steps.mjs';

const LANGUAGE_CODE = 1033;

function createReporter() {
  const counts = {};
  const report = (action, subject, isQuiet = false) => {
    counts[action] = (counts[action] ?? 0) + 1;
    if (!isQuiet) console.log(`  ${action.padEnd(7)} ${subject}`);
  };
  return { report, counts };
}

async function run() {
  const { values } = parseArgs({ options: { seed: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  if (!values.seed) throw new Error('--seed <file> is required (per-org seed data).');
  const problems = findManifestProblems({ tables: TABLES, relationships: RELATIONSHIPS, alternateKeys: ALTERNATE_KEYS, roles: ROLES });
  if (problems.length > 0) throw new Error(`Manifest problems:\n  ${problems.join('\n  ')}`);

  const seed = JSON.parse(readFileSync(values.seed, 'utf8'));
  const client = await createDataverseClient({ solutionUniqueName: SOLUTION.uniqueName });
  if (seed.org.replace(/\/$/, '') !== client.orgUrl) throw new Error(`Seed file is for ${seed.org}, but DV_DATAVERSE_URL is ${client.orgUrl}`);

  const { report, counts } = createReporter();
  console.log(`${values.apply ? 'APPLY' : 'PLAN (no changes)'} — ${client.orgUrl}`);
  await runSteps({ client, isApply: values.apply, report, languageCode: LANGUAGE_CODE }, seed);
  console.log(`\nSummary: ${Object.entries(counts).map(([action, count]) => `${action} ${count}`).join(', ')}`);
}

async function runSteps(context, seed) {
  console.log('[1] Solution'); await ensureSolution({ ...context, solution: SOLUTION });
  console.log('[2] Tables and columns'); await ensureTables({ ...context, tables: TABLES });
  console.log('[3] Relationships'); await ensureRelationships({ ...context, relationships: RELATIONSHIPS });
  console.log('[4] Publish'); await publishTables({ ...context, tableNames: TABLES.map((t) => t.name) });
  console.log('[4b] Table auditing'); await ensureTableAuditing({ ...context, tables: TABLES });
  console.log('[5] Alternate keys'); await ensureAlternateKeys({ ...context, alternateKeys: ALTERNATE_KEYS });
  console.log('[6] Roles'); await ensureRoles({ ...context, roles: ROLES, solutionUniqueName: SOLUTION.uniqueName });
  console.log('[7] Seed rows'); await ensureSeedRows({ ...context, seed });
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
