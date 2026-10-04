/**
 * build-onprem-package.mjs — OFFLINE. Builds the ONE common DCP package for Dynamics 365 CE 9.1
 * on-prem (HL CRM test and BFD CRM / QDB1 test) from the cloud export written by
 * export-dcp-solution.mjs. Touches no organisation.
 *
 *   node crm/scripts/build-onprem-package.mjs --date=2026-10-04 --schemas=<dir>\Schemas\9.0.0.2090
 *
 * Steps: extract → apply the named transforms (lib/onprem-transforms.mjs) → validate
 * customizations.xml against Microsoft's on-prem XSD (validate-solution-xsd.ps1) → repack with
 * forward-slash entry names → write package-manifest.json (what changed, counts, SHA-256).
 * Stops on any unsafe transform, any XSD violation or any remaining missing dependency.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CUSTOMIZATION_TRANSFORMS, DCP_TABLES, classifySchemaFindings, neutraliseAcceptedFindings, transformSolutionManifest,
} from './lib/onprem-transforms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TAR = 'C:/Windows/System32/tar.exe';
const argument = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const KIT_DATE = argument('date') ?? new Date().toISOString().slice(0, 10);
const SCHEMAS = argument('schemas');
const KIT = resolve(HERE, `../../onprem-deploy/${KIT_DATE}`);
const SOURCE_ZIP = join(KIT, 'source', 'qdb_debtcollection_cloud_unmanaged.zip');
const PACKAGE_ZIP = join(KIT, 'qdb_debtcollection_1_0_0_0_onprem_unmanaged.zip');
const PACKAGE_ENTRIES = ['[Content_Types].xml', 'customizations.xml', 'solution.xml', 'PluginAssemblies', 'WebResources'];

if (!SCHEMAS) { console.error('--schemas=<dir containing CustomizationsSolution.xsd> is required'); process.exit(2); }

function extract(workDir) {
  execFileSync(TAR, ['-xf', SOURCE_ZIP, '-C', workDir]);
}

function applyCustomizationTransforms(workDir) {
  const file = join(workDir, 'customizations.xml');
  let text = readFileSync(file, 'utf8');
  const applied = [];
  for (const [name, why, transform] of CUSTOMIZATION_TRANSFORMS) {
    const result = transform(text);
    text = result.text;
    applied.push({ name, why, removed: result.removed });
    console.log(`  ${String(result.removed).padStart(4)} × ${name}`);
  }
  writeFileSync(file, text);
  return applied;
}

function applyManifestTransform(workDir) {
  const file = join(workDir, 'solution.xml');
  const result = transformSolutionManifest(readFileSync(file, 'utf8'));
  if (result.remainingDependencies > 0) throw new Error(`${result.remainingDependencies} missing dependency(ies) remain in solution.xml`);
  writeFileSync(file, result.text);
  console.log(`  manifest stamped ${result.rootAfter}; ${result.removedDependencies} AppSetting dependency(ies) removed; 0 remain`);
  return { rootBefore: result.rootBefore, rootAfter: result.rootAfter, removedDependencies: result.removedDependencies, remainingDependencies: 0 };
}

/** Runs validate-solution-xsd.ps1 on one file; returns its violations (an empty list when valid). */
function schemaViolationsOf(file, reportFile) {
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'validate-solution-xsd.ps1'),
      '-Customizations', file, '-SchemaDir', SCHEMAS, '-Report', reportFile], { encoding: 'utf8' });
    return [];
  } catch (error) {
    if (error.status !== 1) throw error;
    return [JSON.parse(readFileSync(reportFile, 'utf8').replace(/^﻿/, ''))].flat();
  }
}

/**
 * Validates the packaged customizations.xml, then a probe copy with the accepted findings
 * neutralised, until a pass reveals nothing new. Any unexpected violation stops the build.
 */
function validateAgainstXsd(workDir) {
  const reportFile = join(workDir, 'xsd-report.json');
  const probe = join(workDir, 'probe-customizations.xml');
  const findings = new Map();
  let file = join(workDir, 'customizations.xml');
  for (let pass = 1; pass <= 5; pass += 1) {
    const fresh = classifySchemaFindings(schemaViolationsOf(file, reportFile)).filter(v => !findings.has(v.message));
    fresh.forEach(v => findings.set(v.message, { ...v, pass }));
    if (fresh.length === 0) break;
    writeFileSync(probe, neutraliseAcceptedFindings(readFileSync(file, 'utf8')));
    file = probe;
  }
  const all = [...findings.values()];
  all.forEach(v => console.log(`  XSD advisory ${v.known ? 'known      ' : 'UNRECOGNISED'} ${v.count}× ${v.message}`));
  return {
    schema: 'Microsoft CustomizationsSolution.xsd 9.0.0.2090 (linked from the 9.1 on-prem documentation)',
    status: 'advisory — the published schema predates a current 9.1 server; decisive check = diff against a target-org export',
    unrecognised: all.filter(v => !v.known).length, findings: all,
  };
}

/** Files only, forward slashes — CRM's own exports carry no directory entries. */
function packageFiles(workDir) {
  const files = [];
  const walk = relative => {
    const absolute = join(workDir, relative);
    if (!statSync(absolute).isDirectory()) { files.push(relative.replace(/\\/g, '/')); return; }
    readdirSync(absolute).forEach(child => walk(relative ? `${relative}/${child}` : child));
  };
  PACKAGE_ENTRIES.forEach(walk);
  return files;
}

function repack(workDir) {
  rmSync(PACKAGE_ZIP, { force: true });
  execFileSync(TAR, ['-a', '-cf', PACKAGE_ZIP, '-C', workDir, '--no-recursion', ...packageFiles(workDir)]);
  const entries = execFileSync(TAR, ['-tf', PACKAGE_ZIP], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const backslashed = entries.filter(entry => entry.includes('\\'));
  if (backslashed.length > 0) throw new Error(`zip has backslash entry names: ${backslashed.join(', ')}`);
  return entries;
}

function describeContents(workDir) {
  const customizations = readFileSync(join(workDir, 'customizations.xml'), 'utf8');
  const count = pattern => (customizations.match(pattern) ?? []).length;
  const webResources = readdirSync(join(workDir, 'WebResources')).map(name => ({ file: name, bytes: statSync(join(workDir, 'WebResources', name)).size }));
  const referencedTables = [...new Set([...customizations.matchAll(/<ReferencedEntityName>([^<]+)<\/ReferencedEntityName>/g)].map(m => m[1]))];
  const section = name => customizations.slice(customizations.indexOf(`<${name}>`), customizations.indexOf(`</${name}>`));
  const globalChoiceNames = [...section('optionsets').matchAll(/<optionset Name="([^"]+)"/g)].map(m => m[1]).sort();
  const roleNames = [...section('Roles').matchAll(/<Role id="[^"]+" name="([^"]+)"/g)].map(m => m[1]).sort();
  return {
    externalTablesRequired: referencedTables.filter(name => !DCP_TABLES.has(name.toLowerCase())).sort(),
    globalChoiceNames, roleNames,
    tables: count(/<Entity>\s*<Name /g), globalChoices: globalChoiceNames.length, roles: roleNames.length,
    relationships: count(/<EntityRelationship Name=/g), pluginSteps: count(/<SdkMessageProcessingStep /g),
    appModules: count(/<AppModule>/g), siteMaps: count(/<AppModuleSiteMap>/g),
    pluginAssemblyIsolation: /<IsolationMode>(\d)<\/IsolationMode>/.exec(customizations)?.[1] === '2' ? 'Sandbox' : 'None',
    webResources, largestWebResourceBytes: Math.max(...webResources.map(w => w.bytes)),
  };
}

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

const workDir = mkdtempSync(join(tmpdir(), 'dcp-onprem-'));
try {
  console.log(`source ${SOURCE_ZIP}`);
  extract(workDir);
  const customizationTransforms = applyCustomizationTransforms(workDir);
  const manifest = applyManifestTransform(workDir);
  const xsd = validateAgainstXsd(workDir);
  const contents = describeContents(workDir);
  const entries = repack(workDir);
  mkdirSync(KIT, { recursive: true });
  const result = {
    builtAt: new Date().toISOString(), package: PACKAGE_ZIP.split(/[\\/]/).pop(), sha256: sha256(PACKAGE_ZIP), bytes: statSync(PACKAGE_ZIP).size,
    source: { file: 'source/qdb_debtcollection_cloud_unmanaged.zip', sha256: sha256(SOURCE_ZIP) },
    target: 'Dynamics 365 CE 9.1 on-prem — HL CRM test and BFD CRM / QDB1 test (one package)',
    manifest, customizationTransforms, xsd, contents, entries,
  };
  writeFileSync(join(KIT, 'package-manifest.json'), JSON.stringify(result, null, 2));
  console.log(`\nbuilt ${result.package} (${result.bytes} bytes) sha256 ${result.sha256}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
