#!/usr/bin/env node
/**
 * Report which scaffolded projects have fallen behind the current global/
 * shared packages. Read-only. MSS Technologies global library.
 *
 *   node global/scripts/check-global-drift.mjs            all projects
 *   node global/scripts/check-global-drift.mjs <project>  one project
 *   node global/scripts/check-global-drift.mjs --strict   non-zero exit if any drift
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'global', 'packages');
const PROJECTS_DIR = join(REPO_ROOT, 'projects');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.find((a) => !a.startsWith('--'));

const current = hashPackages();
process.stdout.write(`\nGlobal drift — current global version: ${current}\n`);
process.stdout.write('==================================================\n');

const projects = only ? [only] : readdirSync(PROJECTS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let drifted = 0;
let tracked = 0;

for (const name of projects.sort()) {
  const marker = join(PROJECTS_DIR, name, 'GLOBAL-VERSION');
  if (!existsSync(marker)) continue; // not a scaffolded project
  tracked++;
  const stamped = readFileSync(marker, 'utf8').split('\n')[0].trim();
  if (stamped === current) {
    process.stdout.write(`  [current] ${name}\n`);
  } else {
    drifted++;
    process.stdout.write(`  [BEHIND]  ${name}  (has ${stamped || 'unstamped'})\n`);
  }
}

process.stdout.write('--------------------------------------------------\n');
if (tracked === 0) {
  process.stdout.write('No scaffolded projects found (none carry a GLOBAL-VERSION).\n');
} else {
  process.stdout.write(`${tracked} scaffolded project(s); ${drifted} behind.\n`);
  if (drifted > 0) {
    process.stdout.write('Re-sync a project: node global/scripts/scaffold-project.mjs --resync <project>\n');
  }
}
process.stdout.write('\n');

if (strict && drifted > 0) process.exit(1);
process.exit(0);

function hashPackages() {
  const hash = createHash('sha256');
  const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const pkg of packages) walk(join(PACKAGES_DIR, pkg, 'src'), hash);
  return hash.digest('hex').slice(0, 16);
}

function walk(dir, hash) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, hash);
    else {
      hash.update(full);
      hash.update(readFileSync(full));
    }
  }
}
