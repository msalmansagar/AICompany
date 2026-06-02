'use strict';

/**
 * packageSolution.js — assembles the CRM Workflow Designer solution ZIP
 *
 * Usage:
 *   node scripts/packageSolution.js [--version <x.y.z>]
 *
 * Before running, build the app:
 *   npm run build
 *
 * Output:
 *   deploy/QdbWorkflowDesigner_<version>.zip
 *
 * The script is Windows-aware: ZIP creation uses PowerShell Compress-Archive
 * on win32, and the built-in zip CLI on Linux/macOS.
 *
 * WHY this script generates customizations.xml at build time:
 *   The workflow designer compiles to a single self-contained .htm file via
 *   vite-plugin-singlefile. The GUID in customizations.xml and solution.xml
 *   must match the actual logical name of that file. Rather than hard-coding
 *   a GUID that would diverge from the file name if the name ever changed,
 *   this script derives a deterministic GUID from the logical name using MD5.
 *   Same name → same GUID → CRM treats re-imports as updates, not duplicates.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const SOLUTION_TEMPLATE_DIR = path.join(ROOT, 'deploy', 'solution');
const STAGING_DIR = path.join(ROOT, 'deploy', '.staging');
const OUTPUT_DIR = path.join(ROOT, 'deploy');

// Logical web resource path inside CRM (without leading slash)
const WR_LOGICAL_PREFIX = 'qdb_/workflow-designer';
const WR_FILENAME = 'workflow-designer.htm';

// ── CRM web resource type mapping ─────────────────────────────────────────────

const WEB_RESOURCE_TYPE = {
  '.html': 1,
  '.htm':  1,
  '.css':  2,
  '.js':   3,
  '.xml':  4,
  '.png':  5,
  '.jpg':  6,
  '.gif':  7,
  '.svg': 11,
  '.ico': 10,
};

function getWebResourceType(ext) {
  return WEB_RESOURCE_TYPE[ext.toLowerCase()] ?? 4;
}

// ── File system helpers ───────────────────────────────────────────────────────

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// ── Version helpers ───────────────────────────────────────────────────────────

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

// ── Deterministic GUID generation ────────────────────────────────────────────

// Derives a stable GUID from the web resource logical name using MD5.
// Using the same seed prefix as the DFE project keeps the generation
// algorithm consistent across solutions — changing this prefix would
// produce different GUIDs and cause CRM to create duplicate records on
// the next import instead of updating existing ones.
function deterministicGuid(logicalName) {
  const hash = crypto
    .createHash('md5')
    .update(`maqsad_qdb_${logicalName}`)
    .digest('hex');

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Customizations XML ────────────────────────────────────────────────────────

function buildWebResourceEntry(crmVersion) {
  const logicalName = `${WR_LOGICAL_PREFIX}/${WR_FILENAME}`;
  const ext = path.extname(WR_FILENAME).toLowerCase();
  const type = getWebResourceType(ext);
  const guid = deterministicGuid(logicalName);

  // Leading slash is required: CRM's OPC packaging API (System.IO.Packaging)
  // requires every part URI to begin with '/'.
  const fileName = xmlEscape(`/webresources/${logicalName}`);
  const name = xmlEscape(logicalName);

  return `
    <WebResource>
      <WebResourceId>{${guid}}</WebResourceId>
      <WebResourceType>${type}</WebResourceType>
      <Name>${name}</Name>
      <DisplayName>Workflow Designer</DisplayName>
      <Description>CRM Visual Workflow Designer — single-file SPA packaged by packageSolution.js</Description>
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

function generateCustomizationsXml(crmVersion) {
  const webResourceEntry = buildWebResourceEntry(crmVersion);

  return `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.0.0.0"
                 SolutionPackageVersion="9.0"
                 languagecode="1033"
                 generatedBy="packageSolution.js"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <WebResources>${webResourceEntry}
  </WebResources>

  <SiteMap>
    <SiteMapNodes>
      <Area Id="qdb_workflowdesigner_area"
            Title="Workflow Designer"
            Icon="/_imgs/globe.gif"
            ShowGroups="true"
            Lcid="1033">
        <Group Id="qdb_workflowdesigner_group"
               Title="Workflow Designer"
               IsProfile="false">
          <SubArea Id="qdb_workflowdesigner_subarea"
                   Icon="/_imgs/ico_16_webresource.gif"
                   Title="Workflow Designer"
                   Url="$webresource:${WR_LOGICAL_PREFIX}/${WR_FILENAME}"
                   Client="All"
                   AvailableOffline="false"
                   PassParams="false"
                   Sku="All">
            <Titles>
              <Title LCID="1033" Title="Workflow Designer" />
            </Titles>
            <Descriptions>
              <Description LCID="1033" Description="Open the visual workflow designer to create and manage CRM workflow processes." />
            </Descriptions>
          </SubArea>
        </Group>
      </Area>
    </SiteMapNodes>
  </SiteMap>

</ImportExportXml>
`;
}

// ── Solution XML ──────────────────────────────────────────────────────────────

function generateSolutionXml(crmVersion) {
  let xml = fs.readFileSync(path.join(SOLUTION_TEMPLATE_DIR, 'solution.xml'), 'utf8');

  // Update version to match the current build.
  xml = xml.replace(/<Version>[^<]*<\/Version>/, `<Version>${crmVersion}</Version>`);

  const logicalName = `${WR_LOGICAL_PREFIX}/${WR_FILENAME}`;
  const wrGuid = deterministicGuid(logicalName);

  // type="61" = Web Resource
  // type="62" = SiteMap
  const rootComponents =
    `<RootComponents>\n` +
    `      <!-- Web Resources -->\n` +
    `      <RootComponent type="61" id="{${wrGuid}}" schemaName="${logicalName}" behavior="0" />\n` +
    `      <!-- Security Roles -->\n` +
    `      <RootComponent type="9" id="{B2C3D4E5-F6A7-8901-BCDE-F12345678901}" behavior="0" />\n` +
    `      <!-- SiteMap -->\n` +
    `      <RootComponent type="62" behavior="0" />\n` +
    `    </RootComponents>`;

  xml = xml.replace(/<RootComponents>[\s\S]*?<\/RootComponents>/, rootComponents);

  return xml;
}

// ── Content Types XML ─────────────────────────────────────────────────────────

function generateContentTypesXml() {
  // Minimum required extensions: the .htm web resource + the solution XML files.
  const extensions = ['htm', 'xml'];

  const defaults = extensions
    .map(ext => `  <Default Extension="${ext}" ContentType="application/octet-stream"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
${defaults}
</Types>
`;
}

// ── ZIP creation ──────────────────────────────────────────────────────────────

function createZip(stagingDir, outputPath) {
  // Remove any previous zip at the same path to avoid Compress-Archive errors.
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  if (process.platform === 'win32') {
    // PowerShell path: replace forward slashes with backslashes for reliability.
    const src = stagingDir.replace(/\//g, '\\');
    const dest = outputPath.replace(/\//g, '\\');
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${src}\\*' -DestinationPath '${dest}' -Force"`,
      { stdio: 'inherit' },
    );
  } else {
    // macOS / Linux: native zip, change into staging dir so paths inside the
    // archive are relative (CRM requires relative paths in the ZIP).
    execSync(`cd "${stagingDir}" && zip -r "${outputPath}" .`, {
      stdio: 'inherit',
      shell: true,
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function run() {
  const version = parseVersion(process.argv.slice(2));
  const crmVersion = toCrmVersion(version);
  const zipName = `QdbWorkflowDesigner_${version}.zip`;
  const zipPath = path.join(OUTPUT_DIR, zipName);

  console.log(`\nPackaging QDB Workflow Designer v${version}`);
  console.log('─'.repeat(48));

  // 1. Validate build output
  const htmSourcePath = path.join(DIST_DIR, WR_FILENAME);
  if (!fs.existsSync(htmSourcePath)) {
    console.error('\nERROR: Build output not found.');
    console.error(`       Expected: ${htmSourcePath}`);
    console.error('       Run:      npm run build\n');
    process.exit(1);
  }

  const htmSizeKb = (fs.statSync(htmSourcePath).size / 1024).toFixed(1);
  console.log(`\nBuild artifact: ${WR_FILENAME} (${htmSizeKb} KB)`);

  // 2. Set up staging directory
  removeDir(STAGING_DIR);
  ensureDir(STAGING_DIR);

  // 3. Copy web resource file into the staging tree.
  //    CRM reads the ZIP via the OPC API which requires the file at the path
  //    declared in customizations.xml <FileName> — including the leading slash.
  const stagingWebDir = path.join(STAGING_DIR, 'webresources', 'qdb_', 'workflow-designer');
  ensureDir(stagingWebDir);
  fs.copyFileSync(htmSourcePath, path.join(stagingWebDir, WR_FILENAME));

  // 4. Copy security roles
  const rolesSource = path.join(SOLUTION_TEMPLATE_DIR, 'Roles');
  if (fs.existsSync(rolesSource)) {
    fs.cpSync(rolesSource, path.join(STAGING_DIR, 'Roles'), { recursive: true });
    console.log('Copied security roles.');
  } else {
    console.warn('WARNING: deploy/solution/Roles/ not found — security role will not be included.');
  }

  // 5. Generate XML manifest files
  console.log('\nGenerating solution XML…');

  fs.writeFileSync(
    path.join(STAGING_DIR, 'customizations.xml'),
    generateCustomizationsXml(crmVersion),
    'utf8',
  );

  fs.writeFileSync(
    path.join(STAGING_DIR, 'solution.xml'),
    generateSolutionXml(crmVersion),
    'utf8',
  );

  fs.writeFileSync(
    path.join(STAGING_DIR, '[Content_Types].xml'),
    generateContentTypesXml(),
    'utf8',
  );

  // 6. Create ZIP
  console.log(`\nCreating ${zipName}…`);
  ensureDir(OUTPUT_DIR);
  createZip(STAGING_DIR, zipPath);

  // 7. Clean up staging
  removeDir(STAGING_DIR);

  // 8. Report file size
  const zipSizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
  console.log('\n' + '─'.repeat(48));
  console.log(`Package ready: deploy/${zipName} (${zipSizeKb} KB)`);
  console.log('\nNext steps:');
  console.log('  1. Settings > Solutions > Import > upload this ZIP');
  console.log('  2. Publish All Customizations');
  console.log(`  3. Navigate to: /WebResources/${WR_LOGICAL_PREFIX}/${WR_FILENAME}\n`);
}

run();
