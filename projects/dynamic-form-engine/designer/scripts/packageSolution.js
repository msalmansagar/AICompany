'use strict';

// packageSolution.js — assembles the CRM solution ZIP from the Vite build output.
//
// Usage:  node scripts/packageSolution.js [--version <x.y.z>] [--runtime <index.html>]
//         --runtime also packages the in-CRM form runtime as qdb_form_runtime.html, so a
//         single import carries both surfaces. That is the on-prem update path.
// Before: npm run build  (populates deploy/webresources/qdb_/form-designer/)
// Output: deploy/FormDesignerWebResource_<version>.zip
//
// WHY this script exists:
//   The set of emitted chunks depends on Vite's manualChunks config and can change
//   between builds (a vendor split added/removed, a lazy chunk introduced). Rather than
//   hand-maintain the WebResource + RootComponent manifest, this script walks the actual
//   build output and generates customizations.xml, solution.xml RootComponents, and
//   [Content_Types].xml fresh on every run — so the manifest always matches what was
//   built. Each web resource gets a deterministic GUID (name-derived) so re-imports
//   update the same records instead of creating duplicates.
//   On-prem note: individual RootComponents are emitted per file (no folder wildcards),
//   which the on-prem CRM solution importer requires.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'deploy', 'webresources', 'qdb_', 'form-designer');
const SOLUTION_TEMPLATE_DIR = path.join(ROOT, 'deploy', 'solution');
const STAGING_DIR = path.join(ROOT, 'deploy', '.staging');
const OUTPUT_DIR = path.join(ROOT, 'deploy');
/** Entry list handed to the zip writer, so no path has to survive shell quoting. */
const ENTRY_MANIFEST_PATH = path.join(ROOT, 'deploy', '.zip-entries.json');
const ZIP_SCRIPT_PATH = path.join(ROOT, 'deploy', '.zip-entries.ps1');

// ─── CRM web resource type mapping ───────────────────────────────────────────

// CRM webresourcetype option set values (same in both solution XML and Web API)
const WEB_RESOURCE_TYPE = {
  '.html': 1,  // Webpage (HTML)
  '.css':  2,  // Style Sheet (CSS)
  '.js':   3,  // Script (JScript)
  '.xml':  4,  // Data (XML)
  '.png':  5,  // PNG format
  '.jpg':  6,  // JPG format
  '.gif':  7,  // GIF format
  '.svg': 11,  // Vector format (SVG)
  '.ico': 10,  // ICO format
};

function getWebResourceType(ext) {
  return WEB_RESOURCE_TYPE[ext.toLowerCase()] ?? 4;
}

// ─── File system helpers ──────────────────────────────────────────────────────

function walkDir(dir, baseDir = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir));
    } else {
      results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return results;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// ─── Version helpers ─────────────────────────────────────────────────────────

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return pkg.version ?? '1.0.0';
}

function parseVersion(argv) {
  const flag = argv.indexOf('--version');
  if (flag !== -1 && argv[flag + 1]) return argv[flag + 1];
  return readPackageVersion();
}

/**
 * Path to the built in-CRM runtime bundle, when the caller asked for it to travel in the
 * same solution. On-prem has no scripted deploy, so shipping the designer and the runtime
 * as one import is the difference between one manual step and two.
 */
function parseRuntimePath(argv) {
  const flag = argv.indexOf('--runtime');
  if (flag === -1) return null;
  if (!argv[flag + 1]) throw new Error('--runtime needs the path to the built runtime index.html');
  return path.resolve(argv[flag + 1]);
}

// CRM solution.xml requires a 4-part version (1.0.0.0). npm uses 3-part (1.0.0).
function toCrmVersion(semver) {
  const parts = semver.split('.');
  while (parts.length < 4) parts.push('0');
  return parts.slice(0, 4).join('.');
}

// ─── Deterministic GUID generation ───────────────────────────────────────────

// Generates a stable GUID from the web resource name using MD5.
// Same name → same GUID on every run, which lets CRM recognise updates
// across re-imports (same record ID = update, not duplicate).
function deterministicGuid(webResourceName) {
  const hash = crypto.createHash('md5').update(`maqsad_qdb_${webResourceName}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ─── Display name inference ───────────────────────────────────────────────────

function inferDisplayName(relativePath) {
  const base = path.basename(relativePath, path.extname(relativePath));
  if (relativePath === 'index.html') return 'Form Designer';
  if (base.startsWith('vendor-react')) return 'Form Designer — React Bundle';
  if (base.startsWith('vendor-fluent')) return 'Form Designer — Fluent UI Bundle';
  if (base.startsWith('vendor-dnd')) return 'Form Designer — DnD Kit Bundle';
  if (base.startsWith('vendor-state')) return 'Form Designer — State Bundle';
  if (relativePath.endsWith('.css')) return 'Form Designer — Stylesheet';
  if (base === 'index') return 'Form Designer — App Bundle';
  return `Form Designer — ${base}`;
}

// ─── XML generation ──────────────────────────────────────────────────────────

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A web resource to package: the CRM logical name, the path it takes under webresources/
// inside the ZIP, and the display name a maker sees. Designer chunks and the single-file
// runtime bundle differ only in these three values.
function designerResource(relativePath) {
  return {
    logicalName: `qdb_/form-designer/${relativePath}`,
    zipPath: `qdb_/form-designer/${relativePath}`,
    displayName: inferDisplayName(relativePath),
  };
}

/** The in-CRM form runtime, which lives at the web resource root rather than under a folder. */
const RUNTIME_RESOURCE = {
  logicalName: 'qdb_form_runtime.html',
  zipPath: 'qdb_form_runtime.html',
  displayName: 'Form Runtime',
};

function buildWebResourceEntry(resource, crmVersion) {
  const ext = path.extname(resource.logicalName).toLowerCase();
  const type = getWebResourceType(ext);
  const logicalName = resource.logicalName;
  const name = xmlEscape(logicalName);
  // Leading slash required: CRM reads the solution ZIP via the .NET OPC API
  // (System.IO.Packaging), which requires every part URI to start with '/'.
  const fileName = xmlEscape(`/webresources/${resource.zipPath}`);
  const displayName = xmlEscape(resource.displayName);
  // WebResourceId is required: without a GUID, CRM cannot create the record and
  // throws "Cannot add a Root Component ... because it is not in the target system".
  // Deterministic GUID ensures re-imports update the same record, not create duplicates.
  const guid = deterministicGuid(logicalName);

  return `
    <WebResource>
      <WebResourceId>{${guid}}</WebResourceId>
      <WebResourceType>${type}</WebResourceType>
      <Name>${name}</Name>
      <DisplayName>${displayName}</DisplayName>
      <Description>Packaged by packageSolution.js</Description>
      <FileName>${fileName}</FileName>
      <IsEnabledForMobileClient>0</IsEnabledForMobileClient>
      <IsAvailableForMobileOffline>0</IsAvailableForMobileOffline>
      <IsCustomizable>
        <Value>1</Value>
        <CanBeChanged>1</CanBeChanged>
        <IntroducedVersion>${crmVersion}</IntroducedVersion>
      </IsCustomizable>
      <IntroducedVersion>${crmVersion}</IntroducedVersion>
    </WebResource>`;
}

function generateCustomizationsXml(resources, crmVersion) {
  const webResourceEntries = resources.map(r => buildWebResourceEntry(r, crmVersion)).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.0.0.0"
                 SolutionPackageVersion="9.0"
                 languagecode="1033"
                 generatedBy="packageSolution.js"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <WebResources>${webResourceEntries}
  </WebResources>

  <SiteMap>
    <SiteMapNodes>
      <Area Id="maqsad_formmanagement_area"
            Title="Form Management"
            Icon="/_imgs/globe.gif"
            ShowGroups="true"
            Lcid="1033">
        <Group Id="maqsad_formdesigner_group"
               Title="Form Designer"
               IsProfile="false">
          <SubArea Id="maqsad_formdesigner_subarea"
                   Icon="/_imgs/ico_16_webresource.gif"
                   Title="Form Designer"
                   Url="$webresource:qdb_/form-designer/index.html"
                   Client="All"
                   AvailableOffline="false"
                   PassParams="false"
                   Sku="All">
            <Titles>
              <Title LCID="1033" Title="Form Designer" />
            </Titles>
            <Descriptions>
              <Description LCID="1033" Description="Open the drag-and-drop form designer to create and manage dynamic CRM forms." />
            </Descriptions>
          </SubArea>
        </Group>
      </Area>
    </SiteMapNodes>
  </SiteMap>

</ImportExportXml>
`;
}

function generateSolutionXml(crmVersion, resources) {
  let xml = fs.readFileSync(path.join(SOLUTION_TEMPLATE_DIR, 'solution.xml'), 'utf8');

  // Update version
  xml = xml.replace(/<Version>[^<]*<\/Version>/, `<Version>${crmVersion}</Version>`);

  // Rebuild RootComponents with every actual web resource file.
  // Both id and schemaName are required:
  //   schemaName — CRM validates "is this component declared?" by name match
  //   id         — CRM resolves the record by GUID after customizations.xml creates it
  const webResourceLines = resources
    .map(resource => {
      const guid = deterministicGuid(resource.logicalName);
      return `      <RootComponent type="61" id="{${guid}}" schemaName="${resource.logicalName}" behavior="0" />`;
    })
    .join('\n');

  const rootComponents =
    `<RootComponents>\n` +
    `      <!-- Web Resources -->\n` +
    webResourceLines + '\n' +
    `      <!-- SiteMap -->\n` +
    `      <RootComponent type="62" behavior="0" />\n` +
    `    </RootComponents>`;

  xml = xml.replace(/<RootComponents>[\s\S]*?<\/RootComponents>/, rootComponents);

  return xml;
}

function generateContentTypesXml(resources) {
  const extensions = new Set(resources.map(r => path.extname(r.logicalName).replace('.', '')));
  extensions.add('xml');

  const defaults = [...extensions]
    .sort()
    .map(ext => `  <Default Extension="${ext}" ContentType="application/octet-stream"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
${defaults}
</Types>
`;
}

// ─── Zip ─────────────────────────────────────────────────────────────────────

/**
 * Writes the ZIP with forward-slash entry names and no directory entries.
 *
 * PowerShell's Compress-Archive writes Windows separators into the entry names. The ZIP
 * specification requires forward slashes, and CRM reads a solution through the .NET OPC
 * API, which resolves each entry name as a part URI — a backslash entry does not resolve
 * to the FileName declared in customizations.xml, and the import fails on a file it can
 * plainly see in the archive. Every CRM-exported solution uses forward slashes.
 */
function createZip(stagingDir, outputPath) {
  removeDir(outputPath);

  const entries = walkDir(stagingDir).map(relativePath => ({
    source: path.join(stagingDir, relativePath),
    entryName: relativePath.replace(/\\/g, '/'),
  }));

  // The script reads its inputs from a JSON file rather than from arguments, so no path
  // has to survive two layers of shell quoting.
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$manifest = Get-Content -Raw -LiteralPath $args[0] | ConvertFrom-Json
$archive = [System.IO.Compression.ZipFile]::Open($args[1], 'Create')
try {
  foreach ($entry in $manifest) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $entry.source, $entry.entryName) | Out-Null
  }
} finally {
  $archive.Dispose()
}
`;

  fs.writeFileSync(ENTRY_MANIFEST_PATH, JSON.stringify(entries), 'utf8');
  fs.writeFileSync(ZIP_SCRIPT_PATH, script, 'utf8');
  try {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${ZIP_SCRIPT_PATH}" "${ENTRY_MANIFEST_PATH}" "${outputPath}"`,
      { stdio: 'inherit' },
    );
  } finally {
    fs.rmSync(ENTRY_MANIFEST_PATH, { force: true });
    fs.rmSync(ZIP_SCRIPT_PATH, { force: true });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function run() {
  const version = parseVersion(process.argv.slice(2));
  const runtimePath = parseRuntimePath(process.argv.slice(2));
  const crmVersion = toCrmVersion(version);
  const zipName = `FormDesignerWebResource_${version}.zip`;
  const zipPath = path.join(OUTPUT_DIR, zipName);

  if (runtimePath && !fs.existsSync(runtimePath)) {
    console.error(`\nERROR: runtime bundle not found: ${runtimePath}`);
    console.error('       Build it: cd ../frontend && npx vite build --config vite.webresource.config.ts\n');
    process.exit(1);
  }

  console.log(`\nPackaging Form Designer Web Resource v${version}`);
  console.log('─'.repeat(48));

  // 1. Validate build output
  if (!fs.existsSync(DIST_DIR)) {
    console.error('\nERROR: Build output not found.');
    console.error(`       Expected: ${DIST_DIR}`);
    console.error('       Run:      npm run build\n');
    process.exit(1);
  }

  const distFiles = walkDir(DIST_DIR);
  if (distFiles.length === 0) {
    console.error('\nERROR: Build output directory is empty. Run: npm run build\n');
    process.exit(1);
  }

  console.log(`\nFound ${distFiles.length} file(s) in build output:`);
  distFiles.forEach(f => console.log(`  ${f}`));

  // 2. Set up staging directory
  removeDir(STAGING_DIR);
  ensureDir(STAGING_DIR);

  // 3. Copy web resource files
  const stagingWebDir = path.join(STAGING_DIR, 'webresources', 'qdb_', 'form-designer');
  ensureDir(stagingWebDir);
  fs.cpSync(DIST_DIR, stagingWebDir, { recursive: true });

  const resources = distFiles.map(designerResource);
  if (runtimePath) {
    fs.copyFileSync(runtimePath, path.join(STAGING_DIR, 'webresources', RUNTIME_RESOURCE.zipPath));
    resources.push(RUNTIME_RESOURCE);
    const sizeKb = (fs.statSync(runtimePath).size / 1024).toFixed(0);
    console.log(`\nIncluding the runtime bundle as ${RUNTIME_RESOURCE.logicalName} (${sizeKb} KB)`);
  }

  // 4. Copy security roles
  const rolesSource = path.join(SOLUTION_TEMPLATE_DIR, 'Roles');
  if (fs.existsSync(rolesSource)) {
    fs.cpSync(rolesSource, path.join(STAGING_DIR, 'Roles'), { recursive: true });
  }

  // 5. Generate XML files
  console.log('\nGenerating solution XML...');
  fs.writeFileSync(
    path.join(STAGING_DIR, 'customizations.xml'),
    generateCustomizationsXml(resources, crmVersion),
    'utf8'
  );
  fs.writeFileSync(
    path.join(STAGING_DIR, 'solution.xml'),
    generateSolutionXml(crmVersion, resources),
    'utf8'
  );
  fs.writeFileSync(
    path.join(STAGING_DIR, '[Content_Types].xml'),
    generateContentTypesXml(resources),
    'utf8'
  );

  // 6. Create ZIP
  console.log(`\nCreating ${zipName}...`);
  ensureDir(OUTPUT_DIR);
  createZip(STAGING_DIR, zipPath);

  // 7. Clean up staging
  removeDir(STAGING_DIR);

  // 8. Report
  const zipSize = fs.statSync(zipPath).size;
  const zipSizeKb = (zipSize / 1024).toFixed(1);
  console.log('\n' + '─'.repeat(48));
  console.log(`Package ready: deploy/${zipName} (${zipSizeKb} KB)`);
  console.log('\nImport into Dynamics CRM:');
  console.log('  Settings > Solutions > Import > upload this ZIP');
  console.log('  After import: Publish All Customizations\n');
}

run();
