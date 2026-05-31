'use strict';

// packageSolution.js — assembles the CRM solution ZIP from the Vite build output.
//
// Usage:  node scripts/packageSolution.js [--version <x.y.z>]
// Before: npm run build  (populates deploy/webresources/qdb_/form-designer/)
// Output: deploy/FormDesignerWebResource_<version>.zip
//
// WHY this script exists:
//   Vite adds content-hash suffixes to chunk filenames (vendor-react-BHvl9KQs.js).
//   The static customizations.xml committed to source control cannot know those hashes
//   in advance, so this script generates a fresh customizations.xml from the actual
//   build output on every package run.

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

function buildWebResourceEntry(relativePath, crmVersion) {
  const ext = path.extname(relativePath).toLowerCase();
  const type = getWebResourceType(ext);
  const logicalName = `qdb_/form-designer/${relativePath}`;
  const name = xmlEscape(logicalName);
  // Leading slash required: CRM reads the solution ZIP via the .NET OPC API
  // (System.IO.Packaging), which requires every part URI to start with '/'.
  const fileName = xmlEscape(`/webresources/qdb_/form-designer/${relativePath}`);
  const displayName = xmlEscape(inferDisplayName(relativePath));
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

function generateCustomizationsXml(distFiles, crmVersion) {
  const webResourceEntries = distFiles.map(f => buildWebResourceEntry(f, crmVersion)).join('\n');

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

function generateSolutionXml(crmVersion, distFiles) {
  let xml = fs.readFileSync(path.join(SOLUTION_TEMPLATE_DIR, 'solution.xml'), 'utf8');

  // Update version
  xml = xml.replace(/<Version>[^<]*<\/Version>/, `<Version>${crmVersion}</Version>`);

  // Rebuild RootComponents with every actual web resource file.
  // Both id and schemaName are required:
  //   schemaName — CRM validates "is this component declared?" by name match
  //   id         — CRM resolves the record by GUID after customizations.xml creates it
  const webResourceLines = distFiles
    .map(f => {
      const logicalName = `qdb_/form-designer/${f}`;
      const guid = deterministicGuid(logicalName);
      return `      <RootComponent type="61" id="{${guid}}" schemaName="${logicalName}" behavior="0" />`;
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

function generateContentTypesXml(distFiles) {
  const extensions = new Set(distFiles.map(f => path.extname(f).replace('.', '')));
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

function createZip(stagingDir, outputPath) {
  removeDir(outputPath);

  if (process.platform === 'win32') {
    const src = stagingDir.replace(/\//g, '\\');
    const dest = outputPath.replace(/\//g, '\\');
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${src}\\*' -DestinationPath '${dest}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`cd "${stagingDir}" && zip -r "${outputPath}" .`, { stdio: 'inherit', shell: true });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function run() {
  const version = parseVersion(process.argv.slice(2));
  const crmVersion = toCrmVersion(version);
  const zipName = `FormDesignerWebResource_${version}.zip`;
  const zipPath = path.join(OUTPUT_DIR, zipName);

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

  // 4. Copy security roles
  const rolesSource = path.join(SOLUTION_TEMPLATE_DIR, 'Roles');
  if (fs.existsSync(rolesSource)) {
    fs.cpSync(rolesSource, path.join(STAGING_DIR, 'Roles'), { recursive: true });
  }

  // 5. Generate XML files
  console.log('\nGenerating solution XML...');
  fs.writeFileSync(
    path.join(STAGING_DIR, 'customizations.xml'),
    generateCustomizationsXml(distFiles, crmVersion),
    'utf8'
  );
  fs.writeFileSync(
    path.join(STAGING_DIR, 'solution.xml'),
    generateSolutionXml(crmVersion, distFiles),
    'utf8'
  );
  fs.writeFileSync(
    path.join(STAGING_DIR, '[Content_Types].xml'),
    generateContentTypesXml(distFiles),
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
