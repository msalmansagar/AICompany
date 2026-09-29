#!/usr/bin/env node
// Update the qdb_EdpRuleRuntime plug-in package content with a reviewed build (A7 §4 step 5).
// DRY RUN unless --apply. Refuses unless the file's SHA-256 equals --sha256, so only the build
// that was reviewed can be uploaded. Backs up the current content first. Targets the existing
// package record by id (the documented update path: PATCH pluginpackages(<id>)); never creates,
// never deletes.
//
//   node deploy/a7-package.mjs --nupkg <file> --sha256 <hex> --backup <dir> [--apply]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createDataverseClient } from './lib/dataverse-client.mjs';
import { loadContract } from './lib/registration-contract.mjs';

const PACKAGE_UNIQUE_NAME = 'qdb_EdpRuleRuntime';
const argument = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function readPackage(client) {
  const rows = (await client.get(`pluginpackages?$select=pluginpackageid,uniquename,version,modifiedon&$filter=uniquename eq '${PACKAGE_UNIQUE_NAME}'`)).value;
  if (rows.length !== 1) throw new Error(`expected exactly one ${PACKAGE_UNIQUE_NAME} package record, found ${rows.length}`);
  return rows[0];
}

async function readAssembly(client, contract) {
  const name = contract.runtime.active.assemblyName;
  const rows = (await client.get(`pluginassemblies?$select=pluginassemblyid,name,version,_packageid_value,modifiedon&$filter=name eq '${name}'`)).value;
  if (rows.length !== 1) throw new Error(`expected exactly one ${name} assembly, found ${rows.length}`);
  return rows[0];
}

/** The stored package file; the content column reads back empty, the file column does not. */
async function downloadContent(client, packageId) {
  return client.getBytes(`pluginpackages(${packageId})/package/$value`);
}

async function main() {
  const file = argument('--nupkg');
  const expected = argument('--sha256');
  const backupDirectory = argument('--backup');
  if (!file || !expected || !backupDirectory) throw new Error('usage: --nupkg <file> --sha256 <hex> --backup <dir> [--apply]');
  const content = readFileSync(file);
  if (sha256(content) !== expected) throw new Error(`refused: ${path.basename(file)} is ${sha256(content)}, not the reviewed ${expected}`);

  const contract = loadContract();
  const client = await createDataverseClient();
  const record = await readPackage(client);
  const before = await readAssembly(client, contract);
  const current = await downloadContent(client, record.pluginpackageid);
  mkdirSync(backupDirectory, { recursive: true });
  const backupFile = path.join(backupDirectory, `${PACKAGE_UNIQUE_NAME}-before-${sha256(current).slice(0, 12)}.nupkg`);
  writeFileSync(backupFile, current);
  console.log(`package ${record.pluginpackageid} v${record.version}; current content ${sha256(current)} backed up to ${backupFile}`);
  console.log(`assembly ${before.name} ${before.version} → upload ${path.basename(file)} ${expected}`);
  if (!process.argv.includes('--apply')) return console.log('DRY RUN — nothing written.');

  await client.patch(`pluginpackages(${record.pluginpackageid})`, { content: content.toString('base64') });
  const after = await readAssembly(client, contract);
  const stored = await downloadContent(client, record.pluginpackageid);
  console.log(`updated: stored content ${sha256(stored)}; assembly ${after.name} ${after.version} (id ${after.pluginassemblyid === before.pluginassemblyid ? 'unchanged' : 'CHANGED'})`);
  if (sha256(stored) !== expected || after.pluginassemblyid !== before.pluginassemblyid) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
