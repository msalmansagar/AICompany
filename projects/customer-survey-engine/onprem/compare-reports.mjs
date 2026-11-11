/**
 * OFFLINE. Reads the reports QDB IT sends back from an org and answers whether the import is clean:
 * the preflight and post-import FAIL/WARN lines, and every published form whose render cache row
 * changed between the two (the import must change none; republishing is a separate, safe step).
 *
 *   node onprem/compare-reports.mjs <survey-preflight-*.json> <survey-post-import-*.json>
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const SurveyChecks = createRequire(import.meta.url)('./checks/survey-checks.js');
const [preflightFile, postImportFile] = process.argv.slice(2);
if (!preflightFile || !postImportFile) { console.error('usage: compare-reports.mjs <preflight.json> <post-import.json>'); process.exit(2); }

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const preflight = read(preflightFile);
const postImport = read(postImportFile);
const attention = (report) => report.checks.filter((check) => check.status === SurveyChecks.FAIL || check.status === SurveyChecks.WARN);

for (const report of [preflight, postImport]) {
  console.log(`${report.kind} — ${report.org} ${report.url} ${report.ranAt}`);
  const lines = attention(report);
  if (lines.length === 0) console.log('  all PASS');
  lines.forEach((check) => console.log(`  ${check.status} ${check.id} ${check.title}: ${check.detail}`));
}
const changed = SurveyChecks.compareRenderCache(preflight.renderCache, postImport.renderCache);
console.log(changed.length === 0 ? `render cache: ${preflight.renderCache.length} published rows, none changed by the import` : `render cache CHANGED for: ${changed.join(', ')}`);
process.exitCode = changed.length === 0 && attention(postImport).every((check) => check.status !== SurveyChecks.FAIL) ? 0 : 1;
