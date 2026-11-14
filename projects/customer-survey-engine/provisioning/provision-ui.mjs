/**
 * SurveyEngine UI provisioner (B8): public views, charts, main forms and the Survey Engine app.
 * Plan mode by default; `--apply` writes. Safe to re-run: existing items are updated to match
 * ui-manifest.mjs. Run provision.mjs first (the tables and roles must exist).
 *
 *   node --env-file=<dfe>/scripts/.env provision-ui.mjs            # plan
 *   node --env-file=<dfe>/scripts/.env provision-ui.mjs --apply    # live write
 *
 * Live change: run --apply only with the user's explicit go-ahead for that org.
 */
import { parseArgs } from 'node:util';
import { SOLUTION } from './manifest.mjs';
import { VIEWS, CHARTS, FORMS, APP } from './ui-manifest.mjs';
import { createDataverseClient } from './lib/dataverse-client.mjs';
import { ICONS, iconResourceName } from './ui-icons.mjs';
import { ensureViews, readViewIds, ensureCharts, ensureForms, ensureIcons, publishTables, ensureApp } from './lib/ui-steps.mjs';

async function run() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
  const client = await createDataverseClient({ solutionUniqueName: SOLUTION.uniqueName });
  const counts = {};
  const report = (action, subject) => { counts[action] = (counts[action] ?? 0) + 1; console.log(`  ${action.padEnd(7)} ${subject}`); };
  const context = { client, isApply: values.apply, report };
  console.log(`${values.apply ? 'APPLY' : 'PLAN (no changes)'} — ${client.orgUrl}`);
  console.log('[1] Views'); await ensureViews({ ...context, views: VIEWS });
  console.log('[2] Charts'); await ensureCharts({ ...context, charts: CHARTS });
  console.log('[3] Forms'); await ensureForms({ ...context, forms: FORMS, viewIdFor: await readViewIds({ client, views: VIEWS }) });
  console.log('[4] Icons'); await ensureIcons({ ...context, icons: ICONS, resourceNameFor: iconResourceName });
  // Publishing a platform table would also ship anyone's unpublished changes to it.
  const ownViews = VIEWS.filter((view) => !view.isPlatformTable);
  console.log('[5] Publish'); await publishTables({ ...context, tables: [...new Set([...ownViews, ...CHARTS, ...FORMS, ...Object.keys(ICONS).map((table) => ({ table }))].map((item) => item.table))] });
  console.log('[6] App'); await ensureApp({ ...context, app: APP });
  console.log(`\nSummary: ${Object.entries(counts).map(([action, count]) => `${action} ${count}`).join(', ')}`);
}

run().catch((error) => { console.error('✗', error); process.exit(1); });
