/**
 * probe-legal-contract.mts
 * WP9 discovery — the actual Litigation Request contract, read from the organisation.
 *
 * Read-only. It creates nothing and changes nothing.
 *
 * WP1 established the shape of `qdb_qdblegal` and QDB answered the two questions the sandbox
 * could not (Legal is raised only in BFD CRM, and its process runs on-premises). This probe asks
 * the questions WP9 cannot proceed without:
 *
 *   1. What must actually be supplied to create one — required fields, and the **real option
 *      values** behind the three business-required picklists. A hand-off that hard-codes a
 *      picklist value is inventing QDB's legal taxonomy.
 *   2. What the status contract is, and which transitions exist.
 *   3. **How an HL customer resolves to a BFD account** — the critical unknown. Matching on name,
 *      mobile or email is forbidden, so this looks for an authoritative shared identifier and
 *      reports honestly if it finds none.
 *   4. Whether anything already links a Litigation Request back to collections.
 *   5. What existing rows look like, so the hand-off matches how the process is really fed.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/probe-legal-contract.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const LEGAL = 'qdb_qdblegal';

interface Config { apiBase: string; orgUrl: string }

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const heading = (text: string): void => console.log(`\n─── ${text} ───`);

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}  (read-only probe)`);

  await requiredContract(cfg, token);
  await statusContract(cfg, token);
  await customerIdentity(cfg, token);
  await businessIdReach(cfg, token);
  await linkBackToCollections(cfg, token);
  await existingRows(cfg, token);
}

/** What the platform will refuse a create without, and what the business picklists really offer. */
async function requiredContract(cfg: Config, token: string): Promise<void> {
  heading('1. What a Litigation Request requires on create');
  const attributes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/EntityDefinitions(LogicalName='${LEGAL}')/Attributes`
    + '?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate,IsCustomAttribute');

  const required = attributes.value.filter(a =>
    (a['RequiredLevel'] as { Value?: string })?.Value === 'ApplicationRequired'
    && a['IsValidForCreate'] === true);
  console.log(`  ${attributes.value.length} attributes; ${required.length} application-required on create:`);
  for (const a of required) console.log(`    ${a['LogicalName']}  (${a['AttributeType']})`);

  heading('1b. The business picklists — their REAL option values');
  for (const name of ['qdb_casetype', 'qdb_caseagainst', 'qdb_caseinitiatedby']) {
    try {
      const meta = await get<Record<string, unknown>>(cfg, token,
        `/EntityDefinitions(LogicalName='${LEGAL}')/Attributes(LogicalName='${name}')`
        + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet');
      const options = (meta['OptionSet'] as { Options?: OptionRow[] })?.Options ?? [];
      console.log(`  ${name}: ${options.length} option(s)`);
      for (const option of options.slice(0, 12)) {
        console.log(`    ${option.Value}  ${label(option)}`);
      }
    } catch (error) {
      console.log(`  ${name}: could not be read — ${(error as Error).message}`);
    }
  }
}

interface OptionRow { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } }; State?: number }
const label = (option: OptionRow): string => option.Label?.UserLocalizedLabel?.Label ?? '(no label)';

async function statusContract(cfg: Config, token: string): Promise<void> {
  heading('2. The status contract');
  for (const [name, type] of [['statecode', 'StateAttributeMetadata'],
    ['statuscode', 'StatusAttributeMetadata']] as const) {
    const meta = await get<Record<string, unknown>>(cfg, token,
      `/EntityDefinitions(LogicalName='${LEGAL}')/Attributes(LogicalName='${name}')`
      + `/Microsoft.Dynamics.CRM.${type}?$select=LogicalName&$expand=OptionSet`);
    const options = (meta['OptionSet'] as { Options?: OptionRow[] })?.Options ?? [];
    console.log(`  ${name}:`);
    for (const option of options) {
      console.log(`    ${option.Value}${option.State !== undefined ? ` state=${option.State}` : ''}  ${label(option)}`);
    }
  }
}

/**
 * The critical unknown: can an HL contact be resolved to a BFD account authoritatively?
 *
 * Reports what identifying columns exist on both sides and whether any value actually matches
 * across them. It deliberately does **not** attempt a name, mobile or email match — a probe that
 * demonstrated one would invite exactly the mechanism the authorisation forbids.
 */
async function customerIdentity(cfg: Config, token: string): Promise<void> {
  heading('3. HL contact → BFD account: what authoritative identifier exists?');

  for (const entity of ['contact', 'account', 'qdb_collectioncase']) {
    const attributes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
      `/EntityDefinitions(LogicalName='${entity}')/Attributes`
      + '?$select=LogicalName,AttributeType&$filter=IsValidForRead eq true');
    const identifying = attributes.value
      .map(a => String(a['LogicalName']))
      .filter(name => /qid|nationalid|national_id|cif|crnumber|commercial|customernumber|customerid|businessid|passport|establishment|licen[cs]e|tradelicen/i.test(name));
    console.log(`  ${entity}: ${identifying.join(', ') || '(no identifying column matched)'}`);
  }

  heading('3b. Is there a cross-system mapping table already?');
  const entities = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/EntityDefinitions?$select=LogicalName,DisplayName'
    + '&$filter=IsCustomEntity eq true');
  const candidates = entities.value
    .map(e => String(e['LogicalName']))
    .filter(name => /mapping|crosswalk|xref|identity|master|customerlink|integration/i.test(name));
  console.log(`  ${candidates.length} candidate table(s): ${candidates.join(', ') || 'none'}`);

  const ours = candidates.filter(name => /^(qdb_|msst_|adx_)/.test(name));
  console.log(`  ${ours.length} of them belong to QDB/MSS/portal rather than the platform.`);
  for (const candidate of ours) {
    try {
      const count = await get<{ '@odata.count'?: number }>(cfg, token,
        `/${await entitySet(cfg, token, candidate)}?$select=${candidate}id&$count=true&$top=1`);
      console.log(`    ${candidate}: ${count['@odata.count'] ?? '?'} row(s)`);
    } catch (error) {
      console.log(`    ${candidate}: not readable — ${(error as Error).message.slice(0, 80)}`);
    }
  }
}

async function entitySet(cfg: Config, token: string, logicalName: string): Promise<string> {
  const meta = await get<{ EntitySetName: string }>(cfg, token,
    `/EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`);
  return meta.EntitySetName;
}

/**
 * Whether the business id the collection case carries reaches an account at all.
 *
 * `qdb_collectioncase.qdb_customerbusinessid` is the only shared-looking identifier the sweep
 * found. This asks the two questions that decide whether it can resolve an HL customer to a BFD
 * account: does any *account* carry the same value in any column, and does a BFD collection case
 * for the same business id already point at one?
 */
async function businessIdReach(cfg: Config, token: string): Promise<void> {
  heading('3c. Does the case\'s customer business id reach an account?');

  const accountColumns = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata"
    + '?$select=LogicalName');
  const candidates = accountColumns.value
    .map(a => String(a['LogicalName']))
    .filter(name => /businessid|customernumber|accountnumber|cif|qid|nationalid|crnumber|customercode/i.test(name));
  console.log(`  account columns that could hold it: ${candidates.join(', ') || 'none'}`);

  const hl = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_casenumber,qdb_customerbusinessid,_qdb_customerid_value'
    + "&$filter=qdb_organizationcode eq 100000140 and qdb_customerbusinessid ne null&$top=3");
  console.log(`  ${hl.value.length} HL case(s) sampled:`);
  for (const row of hl.value) {
    const table = row['_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] ?? 'none';
    console.log(`    ${row['qdb_casenumber']} businessId=${row['qdb_customerbusinessid']} customer→${table}`);
  }

  const bfd = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_casenumber,qdb_customerbusinessid,_qdb_customerid_value'
    + "&$filter=qdb_organizationcode ne 100000140 and qdb_customerbusinessid ne null&$top=3");
  console.log(`  ${bfd.value.length} non-HL case(s) sampled:`);
  for (const row of bfd.value) {
    const table = row['_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] ?? 'none';
    console.log(`    ${row['qdb_casenumber']} businessId=${row['qdb_customerbusinessid']} customer→${table}`);
  }

  // The decisive question: does ONE business id appear on both an HL case and an account-backed case?
  const shared = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_customerbusinessid,qdb_organizationcode,_qdb_customerid_value'
    + '&$filter=qdb_customerbusinessid ne null&$top=200');
  const byBusinessId = new Map<string, Set<string>>();
  for (const row of shared.value) {
    const id = String(row['qdb_customerbusinessid']);
    const table = String(row['_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] ?? 'none');
    if (!byBusinessId.has(id)) byBusinessId.set(id, new Set());
    byBusinessId.get(id)!.add(table);
  }
  const spanning = [...byBusinessId.entries()].filter(([, tables]) =>
    tables.has('contact') && tables.has('account'));
  console.log(`  ${byBusinessId.size} distinct business id(s) across ${shared.value.length} cases; `
    + `${spanning.length} of them reach BOTH a contact and an account.`);
}

async function linkBackToCollections(cfg: Config, token: string): Promise<void> {
  heading('4. Does anything already link a Litigation Request to collections?');
  const relationships = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/EntityDefinitions(LogicalName='${LEGAL}')/ManyToOneRelationships`
    + '?$select=SchemaName,ReferencedEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName');
  const collectionSide = relationships.value.filter(r =>
    /qdb_collection|qdb_strategy|qdb_delinquency/i.test(String(r['ReferencedEntity'])));
  console.log(`  ${relationships.value.length} lookups on the Legal entity; `
    + `${collectionSide.length} point at a collections table.`);
  for (const r of collectionSide) {
    console.log(`    ${r['ReferencingAttribute']} → ${r['ReferencedEntity']} `
      + `(bind via ${r['ReferencingEntityNavigationPropertyName']})`);
  }

  const reverse = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/EntityDefinitions(LogicalName='qdb_collectionactivity')/ManyToOneRelationships"
    + '?$select=ReferencedEntity,ReferencingAttribute,ReferencingEntityNavigationPropertyName'
    + `&$filter=ReferencedEntity eq '${LEGAL}'`);
  console.log(`  And ${reverse.value.length} lookup(s) from a collection activity to Legal.`);
  for (const r of reverse.value) {
    console.log(`    ${r['ReferencingAttribute']} (bind via ${r['ReferencingEntityNavigationPropertyName']})`);
  }

  heading('4b. Free-text columns that could carry a reference without a schema change');
  const attributes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/EntityDefinitions(LogicalName='${LEGAL}')/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata`
    + '?$select=LogicalName,MaxLength');
  const referenceish = attributes.value.filter(a =>
    /reference|source|origin|external|oldlegal|remark|note/i.test(String(a['LogicalName'])));
  for (const a of referenceish) {
    console.log(`    ${a['LogicalName']}  (max ${a['MaxLength']})`);
  }
}

async function existingRows(cfg: Config, token: string): Promise<void> {
  heading('5. What existing Litigation Requests look like');
  const rows = await get<{ '@odata.count'?: number; value: Record<string, unknown>[] }>(cfg, token,
    `/qdb_qdblegals?$select=qdb_qdblegalid,qdb_name,statecode,statuscode,qdb_casetype,`
    + 'qdb_caseagainst,qdb_caseinitiatedby,_qdb_customer_value,_qdb_cif_value,createdon'
    + '&$count=true&$top=5&$orderby=createdon desc');
  console.log(`  ${rows['@odata.count'] ?? 0} Litigation Request(s) on this organisation.`);
  for (const row of rows.value) {
    console.log(`    ${row['qdb_name']} | state=${row['statecode']} status=${row['statuscode']} `
      + `| type=${row['qdb_casetype']} against=${row['qdb_caseagainst']} by=${row['qdb_caseinitiatedby']} `
      + `| customer=${row['_qdb_customer_value'] ?? 'none'}`);
  }

  heading('5b. Is any Legal automation registered here at all?');
  const steps = await get<{ '@odata.count'?: number; value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=name,statecode&$count=true'
    + `&$filter=contains(name,'${LEGAL}')&$top=40`);
  const custom = steps.value.filter(s => !/ObjectModel|Archive|Retain|Microsoft/i.test(String(s['name'])));
  console.log(`  ${steps['@odata.count'] ?? 0} registered step(s) naming the entity; `
    + `${custom.length} are not Microsoft platform internals.`);
  for (const step of custom.slice(0, 10)) console.log(`    ${step['name']}`);

  const workflows = await get<{ '@odata.count'?: number }>(cfg, token,
    `/workflows?$select=name&$count=true&$top=1&$filter=primaryentity eq '${LEGAL}'`);
  console.log(`  ${workflows['@odata.count'] ?? 0} workflow(s)/action(s) with Legal as primary entity.`);

  console.log('\n  Reminder: this organisation is a Cloud design/config environment. An empty result '
    + 'here is NOT evidence that QDB has no Legal process — QDB has confirmed it runs on-premises.');
}

await main();
