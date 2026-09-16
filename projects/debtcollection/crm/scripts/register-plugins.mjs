/**
 * register-plugins.mjs
 * Registers the Msst.DebtCollection.Plugins assembly and all processing steps.
 * Idempotent: creates missing components, patches the assembly if the DLL
 * content hash differs, and skips components that are already correct.
 *
 * Usage:
 *   node --env-file="<path>/.env" projects/debtcollection/crm/scripts/register-plugins.mjs
 *   node --env-file="<path>/.env" projects/debtcollection/crm/scripts/register-plugins.mjs --dry-run
 *   node --env-file="<path>/.env" projects/debtcollection/crm/scripts/register-plugins.mjs --dll <path>
 *
 * Required env vars: DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET, DV_DATAVERSE_URL
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import {
  hashDll,
  buildStepName,
  resolveMessage,
  resolveFilter,
  ensureAssembly,
  ensurePluginType,
  ensureStep,
  ensureImage,
} from './lib/plugin-registration.mjs';
import { PLUGIN_STEPS, ASSEMBLY_NAME, SOLUTION_NAME } from './lib/plugin-steps.mjs';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, '../plugins/Msst.DebtCollection.Plugins/bin/Release/net471');
const NAMESPACE  = 'Msst.DebtCollection.Plugins.Plugins';

// ── CLI parsing ───────────────────────────────────────────────────────────────

/**
 * @returns {{ dryRun: boolean, dllPath: string }}
 */
function parseCli() {
  const args   = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dllIdx = args.indexOf('--dll');
  const dllPath = dllIdx !== -1 && args[dllIdx + 1]
    ? resolve(args[dllIdx + 1])
    : resolve(PLUGIN_DIR, `${ASSEMBLY_NAME}.dll`);
  return { dryRun, dllPath };
}

// ── DLL loading ───────────────────────────────────────────────────────────────

/**
 * @param {string} dllPath
 * @returns {{ buffer: Buffer, hash: string }}
 */
function loadDll(dllPath) {
  try {
    const buffer = readFileSync(dllPath);
    const hash   = hashDll(buffer);
    console.log(`  DLL path : ${dllPath}`);
    console.log(`  DLL size : ${buffer.length.toLocaleString()} bytes`);
    console.log(`  DLL hash : sha256:${hash.slice(0, 16)}...`);
    return { buffer, hash };
  } catch (err) {
    throw new Error(
      `Cannot read DLL at ${dllPath}.\n` +
      `Run: dotnet build -c Release in crm/plugins/Msst.DebtCollection.Plugins/\n` +
      `Original: ${err.message}`,
    );
  }
}

// ── Dry-run plan printer ──────────────────────────────────────────────────────

/** @param {{ dllPath: string, dllHash: string }} params */
function printDryRunPlan({ dllPath, dllHash }) {
  const uniqueTypes   = [...new Set(PLUGIN_STEPS.map(s => s.pluginType))];
  const stepsWithImg  = PLUGIN_STEPS.filter(s => s.image !== null);

  console.log('\n=== DRY RUN — no API calls will be made ===\n');
  console.log(`Assembly : ${ASSEMBLY_NAME}`);
  console.log(`Solution : ${SOLUTION_NAME}`);
  console.log(`DLL      : ${dllPath}`);
  console.log(`Hash     : sha256:${dllHash.slice(0, 16)}...\n`);

  console.log(`Plugin types (${uniqueTypes.length}):`);
  for (const t of uniqueTypes) console.log(`  ${NAMESPACE}.${t}`);

  console.log(`\nProcessing steps (${PLUGIN_STEPS.length}):`);
  for (const step of PLUGIN_STEPS) {
    const name  = buildStepName(step.pluginType, step.entity, step.message, step.stage);
    const img   = step.image ? ` [image: ${step.image.alias}]` : '';
    const mode  = step.mode === 0 ? 'Sync' : 'Async';
    const flt   = step.filterAttributes ? ` filter:${step.filterAttributes}` : '';
    console.log(`  ${name} (${mode})${flt}${img}`);
  }

  console.log(`\nImages : ${stepsWithImg.length}`);
  console.log('\nNo changes applied.');
}

// ── Live registration ─────────────────────────────────────────────────────────

/** Resolves and caches all SDK message IDs for the step table. */
async function fetchMessageIds({ cfg, token }) {
  const names   = [...new Set(PLUGIN_STEPS.map(s => s.message))];
  const entries = await Promise.all(
    names.map(async (n) => [n, await resolveMessage({ cfg, token, solutionName: SOLUTION_NAME, messageName: n })]),
  );
  return Object.fromEntries(entries);
}

/** Resolves and caches all SDK message filter IDs for the step table. */
async function fetchFilterIds({ cfg, token, messageIds }) {
  const pairs = [...new Map(PLUGIN_STEPS.map(s => [`${s.entity}:${s.message}`, s])).values()];
  const entries = await Promise.all(
    pairs.map(async (s) => {
      const filterId = await resolveFilter({
        cfg, token, solutionName: SOLUTION_NAME,
        messageId: messageIds[s.message], entity: s.entity, dryRun: false,
      });
      return [`${s.entity}:${s.message}`, filterId];
    }),
  );
  return Object.fromEntries(entries);
}

/** Ensures all plugin types and returns a shortName → id map. */
async function ensureAllTypes({ cfg, token, assemblyId }) {
  const shortNames = [...new Set(PLUGIN_STEPS.map(s => s.pluginType))];
  const counts     = { created: 0, skipped: 0 };
  const typeIds    = {};
  for (const shortName of shortNames) {
    const { id, action } = await ensurePluginType({
      cfg, token, solutionName: SOLUTION_NAME, assemblyId,
      namespace: NAMESPACE, shortName, dryRun: false,
    });
    typeIds[shortName] = id;
    counts[action]++;
  }
  return { typeIds, counts };
}

/** Ensures all steps and their images; returns counts. */
async function ensureAllSteps({ cfg, token, typeIds, messageIds, filterIds }) {
  const counts = { steps: { created: 0, skipped: 0 }, images: { created: 0, skipped: 0 } };
  for (const step of PLUGIN_STEPS) {
    const stepName = buildStepName(step.pluginType, step.entity, step.message, step.stage);
    const filterId = filterIds[`${step.entity}:${step.message}`];
    const { id: stepId, action: stepAction } = await ensureStep({
      cfg, token, solutionName: SOLUTION_NAME,
      typeId:    typeIds[step.pluginType],
      messageId: messageIds[step.message],
      filterId, step, stepName, dryRun: false,
    });
    counts.steps[stepAction]++;
    if (step.image) {
      const { action: imgAction } = await ensureImage({
        cfg, token, solutionName: SOLUTION_NAME,
        stepId, image: step.image, dryRun: false,
      });
      counts.images[imgAction]++;
      if (imgAction === 'created' && stepAction === 'skipped' && !dryRun) {
        await refreshStep({ cfg, token, solutionName: SOLUTION_NAME, stepId });
      }
    }
  }
  return counts;
}

/** Prints the registered step list for the assembly (read-back verification). */
async function printRegisteredSteps({ cfg, token, assemblyId }) {
  const result = await apiGet(
    cfg, token, SOLUTION_NAME,
    `/sdkmessageprocessingsteps` +
    `?$select=name,stage,mode,rank,asyncautodelete` +
    `&$filter=plugintypeid/_pluginassemblyid_value eq ${assemblyId}` +
    `&$orderby=name`,
  );
  const rows = result?.value ?? [];
  console.log(`\nRegistered steps for assembly (${rows.length}):`);
  for (const r of rows) {
    const stage = { 10: 'PreValidation', 20: 'PreOperation', 40: 'PostOperation' }[r.stage] ?? r.stage;
    const mode  = r.mode === 0 ? 'Sync' : 'Async';
    console.log(`  [${stage}/${mode}] ${r.name}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== ${ASSEMBLY_NAME} — Dataverse Plugin Registration ===\n`);

  const { dryRun, dllPath } = parseCli();

  console.log('1. Loading DLL...');
  const { buffer: dllBuffer, hash: dllHash } = loadDll(dllPath);

  if (dryRun) {
    printDryRunPlan({ dllPath, dllHash });
    return;
  }

  const cfg   = loadConfig();
  console.log('\n2. Authenticating...');
  const token = await acquireToken(cfg);

  console.log('\n3. Ensuring assembly...');
  const { id: assemblyId, action: asmAction } = await ensureAssembly({
    cfg, token, solutionName: SOLUTION_NAME,
    assemblyName: ASSEMBLY_NAME, dllBuffer, dllHash, dryRun: false,
  });
  console.log(`   Assembly ID: ${assemblyId} (${asmAction})`);

  console.log('\n4. Ensuring plugin types...');
  const { typeIds, counts: typeCounts } = await ensureAllTypes({ cfg, token, assemblyId });

  console.log('\n5. Resolving SDK messages...');
  const messageIds = await fetchMessageIds({ cfg, token });
  console.log(`   Resolved: ${Object.keys(messageIds).join(', ')}`);

  console.log('\n6. Resolving SDK message filters...');
  const filterIds = await fetchFilterIds({ cfg, token, messageIds });
  console.log(`   Resolved ${Object.keys(filterIds).length} unique entity+message filters`);

  console.log('\n7. Ensuring processing steps and images...');
  const { steps: stepCounts, images: imageCounts } = await ensureAllSteps({
    cfg, token, typeIds, messageIds, filterIds,
  });

  console.log('\n=== Summary ===');
  console.log(`  Assembly   : ${asmAction}`);
  console.log(`  Types      : ${typeCounts.created} created, ${typeCounts.skipped} skipped`);
  console.log(`  Steps      : ${stepCounts.created} created, ${stepCounts.skipped} skipped`);
  console.log(`  Images     : ${imageCounts.created} created, ${imageCounts.skipped} skipped`);

  console.log('\n8. Reading back registered steps...');
  await printRegisteredSteps({ cfg, token, assemblyId });
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
