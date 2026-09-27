/* Reads back the schema provision-multi-dataset-schema.mjs claims to have created, then publishes.
 *
 * Separate from the provisioning script on purpose: a script reporting its own success is not
 * evidence that the organisation agrees. This one asks the org.
 *
 * Usage: node verify-multi-dataset-schema.mjs <path-to-.env>
 */
import { connect } from './lib/dataverse.mjs';

const ENTITY = 'qdb_reportdatasource';
const EXPECTED = ['qdb_compositionmode', 'qdb_joinfromkey', 'qdb_jointokey', 'qdb_isenabled', 'qdb_rowlimit'];

async function attributeType(dv, name) {
  const attribute = await dv.fetchJson(
    `EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${name}')?$select=LogicalName,AttributeType`);
  return attribute.AttributeType;
}

/* The option LABELS matter more than the column existing: the engine switches on the label, and
   "Joined" must also be what an absent value means, or every report saved before this feature would
   change behaviour. */
async function compositionOptions(dv) {
  const attribute = await dv.fetchJson(
    `EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='qdb_compositionmode')`
    + `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet`);
  return (attribute.OptionSet && attribute.OptionSet.Options || [])
    .map(option => `${option.Value}=${option.Label.UserLocalizedLabel.Label}`);
}

async function main() {
  const dv = await connect(process.argv[2]);
  console.log(`Verifying ADD-002 Phase A schema on ${dv.baseUrl}\n`);

  let missing = 0;
  for (const name of EXPECTED) {
    try {
      console.log(`  present ${name}  (${await attributeType(dv, name)})`);
    } catch (error) {
      console.log(`  MISSING ${name} — ${error.message}`);
      missing++;
    }
  }

  console.log(`\n  composition options: ${(await compositionOptions(dv)).join(', ') || 'NONE'}`);

  if (missing) {
    console.log(`\n${missing} attribute(s) missing — do NOT deploy the build; every report run would fail.`);
    process.exit(1);
  }

  console.log('\nPublishing customisations…');
  await dv.fetchJson('PublishAllXml', { method: 'POST', body: '{}' });
  console.log('Published. The org is now ready for the build to be deployed.');
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
