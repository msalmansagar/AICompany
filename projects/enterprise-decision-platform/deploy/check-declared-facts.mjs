#!/usr/bin/env node
// READ-ONLY. Run at deploy time (FR-B1-10, R-3): lists every rule version whose declared fact shares
// its name with a real column on the rule's target. Such a rule read that column before 1.1.0 and
// will not after it. An empty result means 1.1.0 changes no rule's behaviour this way.
//
//   node deploy/check-declared-facts.mjs

import { createDataverseClient, getAll } from './lib/dataverse-client.mjs';
import { findCoincidences, targetsWithDeclaredFacts } from './lib/declared-fact-check.mjs';

async function columnsOf(client, entity) {
  const rows = (await client.get(`EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName`)).value;
  return new Set(rows.map((a) => a.LogicalName));
}

async function main() {
  const client = await createDataverseClient();
  const versions = (await getAll(client, 'qdb_edp_ruleversions?$select=qdb_edp_ruleversionid,qdb_edp_pcrmjson'))
    .filter((v) => v.qdb_edp_pcrmjson).map((v) => ({ ruleVersionId: v.qdb_edp_ruleversionid, pcrm: v.qdb_edp_pcrmjson }));
  const targets = targetsWithDeclaredFacts(versions);
  const columnsByEntity = new Map(await Promise.all(targets.map(async (t) => [t, await columnsOf(client, t)])));
  const coincidences = findCoincidences(versions, columnsByEntity);
  coincidences.forEach((c) => console.log(`! ${c.ruleVersionId} on ${c.targetEntity}: declared fact "${c.input}" matches a column`));
  console.log(`${versions.length} rule version(s) checked; ${coincidences.length} coincidence(s).`);
  if (coincidences.length > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
