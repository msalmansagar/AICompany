/**
 * OFFLINE. Builds the ONE SurveyEngine package for Dynamics 365 CE 9.1 on-prem (HL CRM and BFD CRM /
 * QDB1) from the cloud export written by export-survey-solution.mjs. Touches no organisation.
 *
 *   node onprem/build-onprem-kit.mjs --date=2026-11-11 [--schemas=<dir with CustomizationsSolution.xsd>]
 *
 * Steps: extract → named transforms (lib/survey-onprem-transforms.mjs) → solution.xml stamped 9.0 with
 * no missing dependency left → optional XSD check against Microsoft's on-prem schema → repack with
 * forward-slash entry names → package-manifest.json (changes, counts, contents, SHA-256).
 * Stops on any unsafe transform or any missing dependency that remains.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CUSTOMIZATION_TRANSFORMS, transformSurveySolutionManifest } from './lib/survey-onprem-transforms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TAR = 'C:/Windows/System32/tar.exe';
const XSD_SCRIPT = resolve(HERE, '../../debtcollection/crm/scripts/validate-solution-xsd.ps1');
const LOCAL_DLL = resolve(HERE, '../crm-plugins/Qdb.SurveyEngine/bin/Release/net471/Qdb.SurveyEngine.dll');
const PACKAGE_ENTRIES = ['[Content_Types].xml', 'customizations.xml', 'solution.xml', 'PluginAssemblies', 'WebResources', 'customapis'];
const { values } = parseArgs({ options: { date: { type: 'string' }, schemas: { type: 'string' } } });
const KIT = resolve(HERE, `../onprem-deploy/${values.date ?? new Date().toISOString().slice(0, 10)}`);
const SOURCE_ZIP = join(KIT, 'source', 'SurveyEngine_cloud_unmanaged.zip');
const PACKAGE_ZIP = join(KIT, 'SurveyEngine_1_0_0_0_onprem_unmanaged.zip');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function applyCustomizationTransforms(workDir) {
  const file = join(workDir, 'customizations.xml');
  let text = readFileSync(file, 'utf8');
  const applied = [];
  let removedStepIds = [];
  for (const [name, why, transform] of CUSTOMIZATION_TRANSFORMS) {
    const result = transform(text);
    text = result.text;
    if (result.removedIds) removedStepIds = result.removedIds;
    applied.push({ name, why, removed: result.removed, ...(result.added === undefined ? {} : { added: result.added }), ...(result.dropped ? { dropped: result.dropped } : {}) });
    console.log(`  ${String(result.removed + (result.added ?? 0)).padStart(4)} × ${name}`);
  }
  writeFileSync(file, text);
  return { applied, removedStepIds };
}

function applyManifestTransform(workDir, removedStepIds) {
  const file = join(workDir, 'solution.xml');
  const result = transformSurveySolutionManifest(readFileSync(file, 'utf8'), { removedStepIds });
  if (result.remainingDependencies > 0) throw new Error(`${result.remainingDependencies} missing dependency(ies) remain in solution.xml; review before shipping`);
  writeFileSync(file, result.text);
  console.log(`  manifest stamped ${result.rootAfter}; removed ${result.removedRootComponents} step root components, ${result.removedSurveyDependencies + result.removedDependencies} dependencies; 0 remain`);
  const { rootBefore, rootAfter, removedRootComponents, removedSurveyDependencies, removedDependencies } = result;
  return { rootBefore, rootAfter, removedRootComponents, removedDependencies: removedSurveyDependencies + removedDependencies, remainingDependencies: 0 };
}

/** Advisory, as in the Debt Collection kit: the published 9.0.0.2090 schema predates a current 9.1 server. */
function validateAgainstXsd(workDir) {
  if (!values.schemas) return { status: 'not run: --schemas not given (Microsoft CRM SDK Schemas\\9.0.0.2090 not on this machine)' };
  const report = join(workDir, 'xsd-report.json');
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', XSD_SCRIPT, '-Customizations', join(workDir, 'customizations.xml'), '-SchemaDir', values.schemas, '-Report', report], { encoding: 'utf8' });
    return { status: 'valid' };
  } catch (error) {
    if (error.status !== 1) throw error;
    return { status: 'advisory findings', findings: [JSON.parse(readFileSync(report, 'utf8').replace(/^\uFEFF/, ''))].flat() };
  }
}

/** The assembly in the export is what runs on the cloud org; it must be the local build being shipped. */
function compareAssembly(workDir) {
  const folder = join(workDir, 'PluginAssemblies', readdirSync(join(workDir, 'PluginAssemblies'))[0]);
  const embedded = readFileSync(join(folder, readdirSync(folder)[0]));
  const local = readFileSync(LOCAL_DLL);
  const result = { embeddedSha256: sha256(embedded), localBuildSha256: sha256(local), isLocalBuild: embedded.equals(local) };
  if (!result.isLocalBuild) throw new Error('The exported assembly differs from the local Release build; deploy and re-export, or rebuild the matching commit.');
  return result;
}

function describeContents(workDir) {
  const customizations = readFileSync(join(workDir, 'customizations.xml'), 'utf8');
  const count = (pattern) => (customizations.match(pattern) ?? []).length;
  const roleNames = [...customizations.matchAll(/<Role id="[^"]+" name="([^"]+)"/g)].map((m) => m[1]).sort();
  return {
    tables: count(/<Entity>\s*<Name /g), roleNames, relationships: count(/<EntityRelationship Name=/g),
    pluginSteps: [...customizations.matchAll(/<SdkMessageProcessingStep Name="([^"]+)"/g)].map((m) => m[1]),
    customApis: readdirSync(join(workDir, 'customapis')).sort(),
    webResources: readdirSync(join(workDir, 'WebResources')).length, appModules: count(/<AppModule>/g), siteMaps: count(/<AppModuleSiteMap>/g),
  };
}

/** Files only, forward slashes: CRM's own exports carry no directory entries. */
function packageFiles(workDir) {
  const files = [];
  const walk = (relative) => {
    if (!statSync(join(workDir, relative)).isDirectory()) { files.push(relative.replace(/\\/g, '/')); return; }
    readdirSync(join(workDir, relative)).forEach((child) => walk(`${relative}/${child}`));
  };
  PACKAGE_ENTRIES.forEach(walk);
  return files;
}

function repack(workDir) {
  rmSync(PACKAGE_ZIP, { force: true });
  execFileSync(TAR, ['-a', '-cf', PACKAGE_ZIP, '-C', workDir, '--no-recursion', ...packageFiles(workDir)]);
  const entries = execFileSync(TAR, ['-tf', PACKAGE_ZIP], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  if (entries.some((entry) => entry.includes('\\'))) throw new Error('zip has backslash entry names');
  return entries;
}

function build(workDir) {
  console.log(`source ${SOURCE_ZIP}`);
  execFileSync(TAR, ['-xf', SOURCE_ZIP, '-C', workDir]);
  const { applied, removedStepIds } = applyCustomizationTransforms(workDir);
  const manifest = applyManifestTransform(workDir, removedStepIds);
  const assembly = compareAssembly(workDir);
  const xsd = validateAgainstXsd(workDir);
  const contents = describeContents(workDir);
  const entries = repack(workDir);
  return {
    builtAt: new Date().toISOString(), package: PACKAGE_ZIP.split(/[\\/]/).pop(), sha256: sha256(readFileSync(PACKAGE_ZIP)), bytes: statSync(PACKAGE_ZIP).size,
    source: { file: 'source/SurveyEngine_cloud_unmanaged.zip', sha256: sha256(readFileSync(SOURCE_ZIP)) },
    target: 'Dynamics 365 CE 9.1 on-prem: HL CRM and BFD CRM / QDB1 (one package)',
    manifest, customizationTransforms: applied, assembly, xsd, contents, entries,
  };
}

const workDir = mkdtempSync(join(tmpdir(), 'survey-onprem-'));
try {
  const result = build(workDir);
  writeFileSync(join(KIT, 'package-manifest.json'), JSON.stringify(result, null, 2));
  console.log(`\nbuilt ${result.package} (${result.bytes} bytes) sha256 ${result.sha256}`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
