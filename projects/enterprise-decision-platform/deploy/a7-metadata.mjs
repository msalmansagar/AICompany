#!/usr/bin/env node
// Register the Custom API request parameters and response properties the contract declares
// but the org lacks. DEFAULT IS A DRY RUN. It only adds; an existing definition whose type,
// optionality or direction differs is reported as incompatible and nothing is written.
//
//   node deploy/a7-metadata.mjs            dry run
//   node deploy/a7-metadata.mjs --apply    create the missing metadata
//
// a7-repoint.mjs --apply runs this same step first; use this tool on its own to register
// metadata ahead of a re-point, or for a later contract change once its BRD is approved.

import { createDataverseClient } from './lib/dataverse-client.mjs';
import { loadContract } from './lib/registration-contract.mjs';
import { takeInventory } from './lib/registration-inventory.mjs';
import { planMetadata } from './lib/metadata-plan.mjs';
import { applyMetadataCreates, createChangeLog } from './lib/repoint-executor.mjs';
import { describeFinding } from './lib/surface-parity.mjs';

async function main() {
  const contract = loadContract();
  const client = await createDataverseClient();
  const plan = planMetadata(contract, await takeInventory(client, contract));
  plan.creates.forEach((c) => console.log(`+ ${c.operation} ${c.direction} ${c.name}: ${c.definition.type}${c.direction === 'request' ? (c.definition.optional ? ' (optional)' : ' (required)') : ''}`));
  plan.incompatibilities.forEach((f) => console.log(`! ${describeFinding(f)}`));
  if (plan.incompatibilities.length > 0) { console.error('Incompatible definitions exist — nothing will be written.'); process.exitCode = 1; return; }
  if (!process.argv.includes('--apply')) { console.log(`DRY RUN — ${plan.creates.length} item(s) would be created.`); return; }
  const changeLog = createChangeLog((entry) => console.log(JSON.stringify(entry)));
  await applyMetadataCreates(client, plan.creates, changeLog);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
