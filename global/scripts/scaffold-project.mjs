#!/usr/bin/env node
/**
 * Scaffold a new project from global/templates/project-base, vendoring the
 * shared @mss packages so it inherits metadata, lookup, and look-and-feel.
 * MSS Technologies global library. Read-only against global/; writes only
 * under projects/<name>/.
 *
 *   node global/scripts/scaffold-project.mjs <project-name>
 *   node global/scripts/scaffold-project.mjs --resync <project-name>   # re-vendor packages, bump version
 *   node global/scripts/scaffold-project.mjs --dry-run <project-name>  # show what would happen
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GLOBAL_DIR = join(REPO_ROOT, 'global');
const TEMPLATE_DIR = join(GLOBAL_DIR, 'templates', 'project-base');
const PACKAGES_DIR = join(GLOBAL_DIR, 'packages');

const args = process.argv.slice(2);
const resync = args.includes('--resync');
const dryRun = args.includes('--dry-run');
const name = args.find((a) => !a.startsWith('--'));

if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  fail('usage: scaffold-project.mjs [--resync|--dry-run] <project-name>  (kebab-case)');
}

const targetDir = join(REPO_ROOT, 'projects', name);
const today = new Date().toISOString().slice(0, 10);

if (!resync && existsSync(targetDir)) {
  fail(`projects/${name} already exists. Use --resync to re-vendor the global packages into it.`);
}
if (resync && !existsSync(targetDir)) {
  fail(`projects/${name} does not exist — scaffold it first (without --resync).`);
}

// The global version = a content hash of everything under global/packages.
const version = hashPackages();

if (dryRun) {
  log(`[dry-run] ${resync ? 're-vendor' : 'scaffold'} projects/${name}`);
  log(`[dry-run] global version: ${version}`);
  log(`[dry-run] packages to vendor: ${listPackages().join(', ')}`);
  process.exit(0);
}

if (!resync) {
  copyTemplate();
}
vendorPackages();
stampVersion(version);

log(`${resync ? 're-vendored' : 'scaffolded'} projects/${name}`);
log(`  global version: ${version}`);
log(`  packages: ${listPackages().join(', ')}`);
log(`  next: cd projects/${name} && supply a TokenProvider in src/dataverse.ts`);

// --- steps ---

function copyTemplate() {
  mkdirSync(targetDir, { recursive: true });
  cpSync(TEMPLATE_DIR, targetDir, { recursive: true });
  // Substitute placeholders in text files.
  for (const rel of ['README.md']) {
    const file = join(targetDir, rel);
    if (!existsSync(file)) continue;
    const filled = readFileSync(file, 'utf8')
      .replaceAll('{{PROJECT_NAME}}', name)
      .replaceAll('{{SCAFFOLD_DATE}}', today);
    writeFileSync(file, filled);
  }
}

function vendorPackages() {
  const dest = join(targetDir, 'src', 'global');
  mkdirSync(dest, { recursive: true });
  for (const pkg of listPackages()) {
    const src = join(PACKAGES_DIR, pkg, 'src');
    if (!existsSync(src)) continue;
    cpSync(src, join(dest, pkg), { recursive: true });
  }
}

function stampVersion(v) {
  writeFileSync(
    join(targetDir, 'GLOBAL-VERSION'),
    `${v}\nvendored: ${today}\npackages: ${listPackages().join(', ')}\n`,
  );
}

// --- helpers ---

function listPackages() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function hashPackages() {
  const hash = createHash('sha256');
  for (const pkg of listPackages()) {
    walk(join(PACKAGES_DIR, pkg, 'src'), (file) => {
      hash.update(file);
      hash.update(readFileSync(file));
    });
  }
  return hash.digest('hex').slice(0, 16);
}

function walk(dir, onFile) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}
