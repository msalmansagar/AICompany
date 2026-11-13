/**
 * OFFLINE. Reads two reports QDB IT sends back from an org and answers whether the step between them was
 * clean: each report's FAIL/WARN lines, and every published form whose render cache row changed between
 * the two. An import must change none; republishing is a separate step, named with --expect-changed.
 *
 *   node onprem/compare-reports.mjs <before.json> <after.json> [--expect-changed=<form code>,<form code>]
 *
 *   preflight  → post-import         the imports changed no published form (production)
 *   preflight  → first stage-2       stage 2 changed no published form (A2, test orgs)
 *   first stage-2 → second stage-2   only the three republished sample forms changed (A2, test orgs)
 *   second stage-2 → post-import     the SurveyEngine import changed no published form (test orgs)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const SurveyChecks = createRequire(import.meta.url)('./checks/survey-checks.js');
const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'expect-changed': { type: 'string', default: '' } } });
const [beforeFile, afterFile] = positionals;
if (!beforeFile || !afterFile) { console.error('usage: compare-reports.mjs <before.json> <after.json> [--expect-changed=<form code>,...]'); process.exit(2); }

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const before = read(beforeFile);
const after = read(afterFile);
const attention = (report) => report.checks.filter((check) => check.status === SurveyChecks.FAIL || check.status === SurveyChecks.WARN);

for (const report of [before, after]) {
  console.log(`${report.kind} — ${report.org} ${report.url} ${report.ranAt}`);
  const lines = attention(report);
  if (lines.length === 0) console.log('  all PASS');
  lines.forEach((check) => console.log(`  ${check.status} ${check.id} ${check.title}: ${check.detail}`));
}
const expectedFormCodes = values['expect-changed'].split(',').map((code) => code.trim()).filter(Boolean);
const { unexpected, notChanged } = SurveyChecks.renderCacheDifferences(before.renderCache, after.renderCache, expectedFormCodes);
if (unexpected.length === 0) {
  console.log(expectedFormCodes.length === 0
    ? `render cache: ${before.renderCache.length} published rows, none changed between the two reports`
    : `render cache: no form other than ${expectedFormCodes.join(', ')} changed`);
} else {
  console.log(`render cache CHANGED for: ${unexpected.join(', ')}`);
}
if (notChanged.length > 0) console.log(`render cache NOT republished: ${notChanged.join(', ')} (expected a new version)`);
const isClean = unexpected.length === 0 && notChanged.length === 0;
process.exitCode = isClean && attention(after).every((check) => check.status !== SurveyChecks.FAIL) ? 0 : 1;
