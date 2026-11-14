/**
 * OFFLINE. Builds the Form Engine part of the on-prem kit (B9 item 3, readiness review "Form Engine
 * changes the on-prem orgs also need") into onprem-deploy/<date>/form-engine/:
 *   1  QdbFormEngineSurveyUpdate_1_0_0_0_onprem_unmanaged.zip: the six survey columns, down-levelled
 *      from the export written by export-form-engine-patch.mjs
 *   2  FormDesignerWebResource_<version>.zip: designer + runtime, built by the Form Engine's own
 *      designer/scripts/packageSolution.js --runtime; checked here to carry the same bytes as the
 *      cloud org (the local builds passed in)
 *   3  Qdb.FormEngine.Plugins.dll: the merged plugin, shipped as a file for the Plugin Registration
 *      Tool because installing it on-prem is gated on the grid-column census (DEF-002)
 *
 *   node onprem/build-form-engine-update.mjs --date=2026-11-11 --webresources=<zip> --designer=<index.html> --runtime=<index.html> --dll=<dll>
 */
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { GENERIC_TRANSFORMS } from './lib/survey-onprem-transforms.mjs';
import { PATCH_COLUMNS, columnsIn, transformPatchManifest } from './lib/form-engine-patch.mjs';
import { applyTransforms, extract, repack, sha256OfFile } from './lib/package-tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const options = { date: { type: 'string' }, webresources: { type: 'string' }, designer: { type: 'string' }, runtime: { type: 'string' }, dll: { type: 'string' } };
const { values } = parseArgs({ options });
const missing = Object.keys(options).filter((name) => !values[name]);
if (missing.length > 0) { console.error(`✗ required: ${missing.map((name) => `--${name}`).join(' ')}`); process.exit(2); }
const OUT = resolve(HERE, `../onprem-deploy/${values.date}/form-engine`);
const PATCH_SOURCE = join(OUT, 'source', 'QdbFormEngineSurveyUpdate_cloud_unmanaged.zip');
const PATCH_ZIP = join(OUT, 'QdbFormEngineSurveyUpdate_1_0_0_0_onprem_unmanaged.zip');

function buildPatch() {
  const workDir = mkdtempSync(join(tmpdir(), 'dfe-patch-'));
  try {
    extract(PATCH_SOURCE, workDir);
    const { applied } = applyTransforms(join(workDir, 'customizations.xml'), GENERIC_TRANSFORMS);
    const columns = columnsIn(readFileSync(join(workDir, 'customizations.xml'), 'utf8'));
    if (columns.join() !== [...PATCH_COLUMNS].sort().join()) throw new Error(`the patch carries ${columns.join(', ')}, not exactly the six survey columns`);
    const manifest = transformPatchManifest(readFileSync(join(workDir, 'solution.xml'), 'utf8'));
    writeFileSync(join(workDir, 'solution.xml'), manifest.text);
    console.log(`  patch: ${columns.length} columns; ${manifest.keptPrerequisites} Form Engine prerequisites kept as import checks`);
    const entries = repack(workDir, PATCH_ZIP, ['[Content_Types].xml', 'customizations.xml', 'solution.xml']);
    return { file: basename(PATCH_ZIP), sha256: sha256OfFile(PATCH_ZIP), bytes: statSync(PATCH_ZIP).size, source: { file: 'source/QdbFormEngineSurveyUpdate_cloud_unmanaged.zip', sha256: sha256OfFile(PATCH_SOURCE) }, rootAfter: manifest.rootAfter, columns, keptPrerequisites: manifest.keptPrerequisites, customizationTransforms: applied, entries };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** The web-resource zip must carry the designer and runtime builds byte for byte. */
function copyWebResources() {
  const workDir = mkdtempSync(join(tmpdir(), 'dfe-webresources-'));
  try {
    extract(values.webresources, workDir);
    const packed = readdirSync(workDir, { recursive: true }).map((name) => join(workDir, name)).filter((file) => statSync(file).isFile());
    const shipped = { designer: sha256OfFile(values.designer), runtime: sha256OfFile(values.runtime) };
    for (const [surface, hash] of Object.entries(shipped)) {
      if (!packed.some((file) => sha256OfFile(file) === hash)) throw new Error(`${basename(values.webresources)} does not carry the ${surface} build passed in`);
    }
    const target = join(OUT, basename(values.webresources));
    copyFileSync(values.webresources, target);
    return { file: basename(target), sha256: sha256OfFile(target), bytes: statSync(target).size, designerSha256: shipped.designer, runtimeSha256: shipped.runtime };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function copyPlugin() {
  const target = join(OUT, basename(values.dll));
  copyFileSync(values.dll, target);
  return { file: basename(target), sha256: sha256OfFile(target), bytes: statSync(target).size, deploy: 'Plugin Registration Tool → Update assembly; only after the qdb_grid_column_config census (DEF-002)' };
}

try {
  const result = { builtAt: new Date().toISOString(), target: 'Dynamics 365 CE 9.1 on-prem: HL CRM and BFD CRM / QDB1', patch: buildPatch(), webResources: copyWebResources(), plugin: copyPlugin() };
  writeFileSync(join(OUT, 'package-manifest.json'), JSON.stringify(result, null, 2));
  console.log(`\nbuilt ${OUT}\n  ${result.patch.file} ${result.patch.sha256}\n  ${result.webResources.file} ${result.webResources.sha256}\n  ${result.plugin.file} ${result.plugin.sha256}`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
