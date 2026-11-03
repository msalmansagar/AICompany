/**
 * seed-messaging-configuration.mjs — tells one organisation's DCP which table carries SMS / WhatsApp
 * and which columns hold what (docs: apps/web/src/data/messagingConfiguration.ts).
 *
 *   node crm/scripts/seed-messaging-configuration.mjs --organization=HL --table=letter \
 *     --map=recipientNumber:vrp_address,messageBody:vrp_descriptions [--execute]
 *
 *   --organization   HL or BFD — the active qdb_platformconfiguration row is chosen by its code
 *   --table          fax | letter — written to qdb_smsentity and qdb_whatsappentity
 *   --map            canonical:column pairs: recipientNumber and messageBody required; sender,
 *                    language, whatsAppTemplate, otp, channelType optional
 *   --sms-only       leave qdb_whatsappentity empty, so WhatsApp is not offered (HL until its
 *                    gateway sends WhatsApp)
 *   --channel-values SMS:<value>,WhatsApp:<value> — what channelType holds for each channel (HL's
 *                    vrp_type), merged into qdb_featureflags.messageChannelValues
 *   --execute        write; without it the script only reports what it would do
 *
 * Enabling HL WhatsApp later: map channelType:vrp_type and whatsAppTemplate, pass --channel-values,
 * and drop --sms-only. Until channelType has values, the workspace keeps WhatsApp unavailable on a
 * table SMS also uses — a WhatsApp nobody can tell from an SMS would be sent as one.
 *
 * Idempotent: a mapping row is matched by (configuration, canonical field, table) and only updated
 * when its column differs. Every column is checked against the table's metadata BEFORE anything is
 * written — a mapping to a column the organisation does not have is how HL came to read
 * fax.qdb_message_body. Changes configuration rows only; never schema.
 */
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const ORG_CODES = { HL: 100000140, BFD: 100000141 };
const COMMUNICATION = 100000384;
const ACCESS_WRITE = 100000401;
const SOURCE_CRM = 100000420;
const FIELDS = ['recipientNumber', 'messageBody', 'sender', 'language', 'whatsAppTemplate', 'otp', 'channelType'];
const REQUIRED = ['recipientNumber', 'messageBody'];
const CHANNELS = ['SMS', 'WhatsApp'];
const argument = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const isExecute = process.argv.includes('--execute');
const isSmsOnly = process.argv.includes('--sms-only');
const parsePairs = text => (text ?? '').split(',').filter(Boolean).map(pair => pair.split(':').map(s => s.trim()));

const organization = argument('organization');
const table = argument('table');
const whatsAppTable = isSmsOnly ? null : table;
const map = Object.fromEntries(parsePairs(argument('map')));
// A numeric value is written as a number, so it matches a choice column's integer.
const channelValues = Object.fromEntries(parsePairs(argument('channel-values')).map(([channel, value]) => [channel, /^\d+$/.test(value) ? Number(value) : value]));
const fail = message => { console.error(`[STOP] ${message}`); process.exit(2); };
if (!ORG_CODES[organization]) fail('--organization must be HL or BFD');
if (table !== 'fax' && table !== 'letter') fail('--table must be fax or letter');
for (const field of Object.keys(map)) if (!FIELDS.includes(field)) fail(`unknown canonical field "${field}"`);
for (const field of REQUIRED) if (!map[field]) fail(`--map must name ${field}`);
for (const channel of Object.keys(channelValues)) if (!CHANNELS.includes(channel)) fail(`--channel-values names unknown channel "${channel}"`);
if (Object.keys(channelValues).length > 0 && !map.channelType) fail('--channel-values needs a channelType column in --map');

const cfg = loadConfig();
const token = await acquireToken(cfg);
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
async function call(method, path, body) {
  const response = await fetch(cfg.apiBase + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function assertColumnsExist() {
  const attributes = (await call('GET', `/EntityDefinitions(LogicalName='${table}')/Attributes?$select=LogicalName`)).value.map(a => a.LogicalName);
  const missing = Object.values(map).filter(column => !attributes.includes(column));
  if (missing.length > 0) fail(`${table} has no column(s) ${missing.join(', ')} in ${cfg.orgUrl}`);
}

async function activeConfiguration() {
  const filter = encodeURIComponent(`qdb_organizationcode eq ${ORG_CODES[organization]} and qdb_isactive eq true`);
  const rows = (await call('GET', `/qdb_platformconfigurations?$select=qdb_platformconfigurationid,qdb_name,qdb_smsentity,qdb_whatsappentity,qdb_featureflags&$filter=${filter}`)).value;
  if (rows.length !== 1) fail(`${organization} has ${rows.length} active platform configuration rows; exactly one is required`);
  return rows[0];
}

async function setTables(configuration) {
  const described = `SMS = ${table}, WhatsApp = ${whatsAppTable ?? '(not offered)'}`;
  if (configuration.qdb_smsentity === table && (configuration.qdb_whatsappentity ?? null) === whatsAppTable) return console.log(`  [KEEP] ${configuration.qdb_name}: ${described}`);
  console.log(`  [SET] ${configuration.qdb_name}: SMS ${configuration.qdb_smsentity ?? '(none)'} / WhatsApp ${configuration.qdb_whatsappentity ?? '(none)'} → ${described}`);
  if (isExecute) await call('PATCH', `/qdb_platformconfigurations(${configuration.qdb_platformconfigurationid})`, { qdb_smsentity: table, qdb_whatsappentity: whatsAppTable });
}

/** Merges the channel values into the feature flags, keeping every other flag (e.g. contactHoldPolicy). */
async function setChannelValues(configuration) {
  if (Object.keys(channelValues).length === 0) return;
  let flags = {};
  try { flags = JSON.parse(configuration.qdb_featureflags || '{}'); } catch { fail(`${configuration.qdb_name} has unreadable qdb_featureflags; fix it before adding channel values`); }
  if (JSON.stringify(flags.messageChannelValues ?? {}) === JSON.stringify(channelValues)) return console.log(`  [KEEP] channel values ${JSON.stringify(channelValues)}`);
  console.log(`  [SET] channel values ${JSON.stringify(flags.messageChannelValues ?? {})} → ${JSON.stringify(channelValues)}`);
  if (isExecute) await call('PATCH', `/qdb_platformconfigurations(${configuration.qdb_platformconfigurationid})`, { qdb_featureflags: JSON.stringify({ ...flags, messageChannelValues: channelValues }) });
}

async function upsertMapping(configuration, field, column) {
  const filter = `_qdb_platformconfigurationid_value eq ${configuration.qdb_platformconfigurationid} and qdb_canonicalfield eq '${field}' and qdb_crmentitylogicalname eq '${table}'`;
  const existing = (await call('GET', `/qdb_platformmappings?$select=qdb_platformmappingid,qdb_crmfieldlogicalname&$filter=${encodeURIComponent(filter)}`)).value[0];
  if (existing?.qdb_crmfieldlogicalname === column) return console.log(`  [KEEP] ${field} → ${table}.${column}`);
  const row = {
    qdb_name: `${organization} ${table} ${field}`, qdb_businessobject: COMMUNICATION, qdb_canonicalfield: field,
    qdb_crmentitylogicalname: table, qdb_crmfieldlogicalname: column, qdb_datatype: 'String', qdb_isrequired: REQUIRED.includes(field),
    qdb_accessmode: ACCESS_WRITE, qdb_source: SOURCE_CRM, qdb_isactive: true,
    'qdb_platformconfigurationid@odata.bind': `/qdb_platformconfigurations(${configuration.qdb_platformconfigurationid})`,
  };
  console.log(`  [${existing ? 'UPDATE' : 'CREATE'}] ${field} → ${table}.${column}`);
  if (!isExecute) return;
  if (existing) await call('PATCH', `/qdb_platformmappings(${existing.qdb_platformmappingid})`, { qdb_crmfieldlogicalname: column });
  else await call('POST', '/qdb_platformmappings', row);
}

console.log(`${isExecute ? 'EXECUTE' : 'DRY RUN'} — ${cfg.orgUrl} — ${organization} sends SMS / WhatsApp as ${table}`);
await assertColumnsExist();
const configuration = await activeConfiguration();
await setTables(configuration);
await setChannelValues(configuration);
for (const [field, column] of Object.entries(map)) await upsertMapping(configuration, field, column);
console.log(isExecute ? '[DONE]' : '[DRY RUN] nothing was written');
