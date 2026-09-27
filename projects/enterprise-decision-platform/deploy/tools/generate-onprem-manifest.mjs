#!/usr/bin/env node
// Regenerates deploy/onprem/actions-manifest.json from the registration contract.
//   node deploy/tools/generate-onprem-manifest.mjs          write the file
//   node deploy/tools/generate-onprem-manifest.mjs --check  exit 1 if the committed file is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadContract } from '../lib/registration-contract.mjs';
import { buildOnPremManifest, serialiseOnPremManifest } from '../lib/onprem-manifest.mjs';

const MANIFEST_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'onprem', 'actions-manifest.json');

const expected = serialiseOnPremManifest(buildOnPremManifest(loadContract()));

if (process.argv.includes('--check')) {
  const committed = readFileSync(MANIFEST_PATH, 'utf8').replace(/\r\n/g, '\n');
  if (committed !== expected) {
    console.error('onprem/actions-manifest.json is stale. Run: node deploy/tools/generate-onprem-manifest.mjs');
    process.exit(1);
  }
  console.log('onprem/actions-manifest.json matches the registration contract.');
} else {
  writeFileSync(MANIFEST_PATH, expected);
  console.log(`wrote ${path.relative(process.cwd(), MANIFEST_PATH)}`);
}
