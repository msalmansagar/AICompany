/**
 * probe-incident-schema.mts
 * WP13 — the complete Case (`incident`) contract, read from the organisation.
 *
 * Read-only. It creates nothing and changes nothing.
 *
 * QDB has decided that a formal Customer Complaint is a native Case with **Case Type = Complaint**,
 * and that a Collection Dispute stays a `qdb_collectionactivity`. Before a single field is
 * provisioned or a Complaint is created, this establishes the authoritative contract:
 *
 *   **Where does "Case Type = Complaint" actually live?** Native `casetypecode` offers only
 *   Question, Problem and Request. The global option set `qdb_casetype` carries
 *   `751090001 = Complaint`, and the attribute bound to it has to be found rather than assumed —
 *   the WP9 lesson (`qdb_Customer`, capitalised) is that names in this family are never derivable.
 *   **What must be supplied on create**, and nothing beyond it.
 *   **Is there already a source/reference field or alternate key** that could carry DCP's identity?
 *   §7 says to reuse one if it exists, and §4 says to prefer changing DCP over Case Management.
 *   **What automation is registered**, so nothing bypasses QDB's SLA or escalation.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/probe-incident-schema.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const CASE = 'incident';

interface Config { apiBase: string; orgUrl: string }
interface OptionRow { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } }; State?: number }

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const heading = (text: string): void => console.log(`\n─── ${text} ───`);
const label = (option: OptionRow): string => option.Label?.UserLocalizedLabel?.Label ?? '?';

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}  (read-only)`);

  const attributes = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/EntityDefinitions(LogicalName='${CASE}')/Attributes`
    + '?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate,'
    + 'IsCustomAttribute,IsPrimaryId,IsPrimaryName');

  await whereIsComplaint(cfg, token, attributes.value);
  await requiredContract(cfg, token, attributes.value);
  await identityAndLookups(cfg, token);
  await sourceReferenceCandidates(cfg, token, attributes.value);
  await automation(cfg, token);
}

/**
 * The decisive question: which attribute expresses "Case Type = Complaint"?
 *
 * Every picklist on the entity is read and its options inspected for the label, rather than
 * guessing a column name. This is the only way to be sure — `qdb_casetype` is a *global option
 * set*, and a global set may be bound to an attribute with an entirely different name.
 */
async function whereIsComplaint(
  cfg: Config, token: string, attributes: Record<string, unknown>[],
): Promise<void> {
  heading('1. Where "Case Type = Complaint" lives');

  const picklists = attributes.filter(a =>
    a['AttributeType'] === 'Picklist' || a['AttributeType'] === 'Virtual');
  console.log(`  ${picklists.length} picklist-shaped attributes to inspect.`);

  const found: string[] = [];
  for (const attribute of picklists) {
    const name = String(attribute['LogicalName']);
    try {
      const meta = await get<Record<string, unknown>>(cfg, token,
        `/EntityDefinitions(LogicalName='${CASE}')/Attributes(LogicalName='${name}')`
        + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata'
        + '?$select=LogicalName&$expand=OptionSet($select=Name,IsGlobal,Options)');
      const set = meta['OptionSet'] as
        { Name?: string; IsGlobal?: boolean; Options?: OptionRow[] } | undefined;
      const options = set?.Options ?? [];
      const complaint = options.filter(option => /complaint/i.test(label(option)));
      if (complaint.length === 0) continue;

      found.push(name);
      console.log(`    ◄── ${name}  [set ${set?.Name}${set?.IsGlobal ? ', GLOBAL' : ', local'}]`);
      for (const option of options) {
        const mark = /complaint/i.test(label(option)) ? '  ◄' : '';
        console.log(`          ${option.Value} = ${label(option)}${mark}`);
      }
    } catch { /* not a picklist on this organisation */ }
  }

  if (found.length === 0) {
    console.log('    NONE. No picklist on `incident` offers a "Complaint" option.');
    console.log('    ⇒ Case Type = Complaint cannot be set through a picklist on this entity as it '
      + 'stands.');
  }

  const native = await get<Record<string, unknown>>(cfg, token,
    `/EntityDefinitions(LogicalName='${CASE}')/Attributes(LogicalName='casetypecode')`
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet');
  const nativeOptions = (native['OptionSet'] as { Options?: OptionRow[] })?.Options ?? [];
  console.log(`  native casetypecode: ${nativeOptions.map(o => `${o.Value}=${label(o)}`).join(' | ')}`);
}

async function requiredContract(
  cfg: Config, token: string, attributes: Record<string, unknown>[],
): Promise<void> {
  heading('2. What a Case requires on create');

  const required = attributes.filter(a =>
    (a['RequiredLevel'] as { Value?: string })?.Value === 'ApplicationRequired'
    && a['IsValidForCreate'] === true);
  const recommended = attributes.filter(a =>
    (a['RequiredLevel'] as { Value?: string })?.Value === 'Recommended'
    && a['IsValidForCreate'] === true);

  console.log(`  ${attributes.length} attributes total `
    + `(${attributes.filter(a => a['IsCustomAttribute']).length} custom).`);
  console.log(`  application-required on create: `
    + `${required.map(a => `${a['LogicalName']} (${a['AttributeType']})`).join(', ') || 'none'}`);
  console.log(`  business-recommended: `
    + `${recommended.map(a => a['LogicalName']).join(', ') || 'none'}`);

  const primaryId = attributes.find(a => a['IsPrimaryId']);
  const primaryName = attributes.find(a => a['IsPrimaryName']);
  console.log(`  primary id: ${primaryId?.['LogicalName']}   primary name: ${primaryName?.['LogicalName']}`);

  const meta = await get<Record<string, unknown>>(cfg, token,
    `/EntityDefinitions(LogicalName='${CASE}')`
    + '?$select=EntitySetName,OwnershipType,IsAuditEnabled,PrimaryIdAttribute,PrimaryNameAttribute');
  console.log(`  entity set: ${meta['EntitySetName']}   ownership: ${meta['OwnershipType']}`);

  for (const attribute of ['statecode', 'statuscode', 'prioritycode', 'caseorigincode']) {
    try {
      const type = attribute === 'statecode' ? 'StateAttributeMetadata'
        : attribute === 'statuscode' ? 'StatusAttributeMetadata' : 'PicklistAttributeMetadata';
      const picked = await get<Record<string, unknown>>(cfg, token,
        `/EntityDefinitions(LogicalName='${CASE}')/Attributes(LogicalName='${attribute}')`
        + `/Microsoft.Dynamics.CRM.${type}?$select=LogicalName&$expand=OptionSet`);
      const options = (picked['OptionSet'] as { Options?: OptionRow[] })?.Options ?? [];
      console.log(`  ${attribute}: ${options.map(o =>
        `${o.Value}${o.State !== undefined ? `(s${o.State})` : ''}=${label(o)}`).join(' | ')}`);
    } catch { /* absent */ }
  }
}

async function identityAndLookups(cfg: Config, token: string): Promise<void> {
  heading('3. Customer identity, ownership and every lookup that matters');

  const relationships = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/EntityDefinitions(LogicalName='${CASE}')/ManyToOneRelationships`
    + '?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName');

  const interesting = relationships.value.filter(r =>
    /account|contact|systemuser|team|businessunit|queue|subject|qdb_/i
      .test(String(r['ReferencedEntity'])));
  console.log(`  ${relationships.value.length} lookups; ${interesting.length} relevant:`);
  for (const r of interesting) {
    console.log(`    ${r['ReferencingAttribute']} → ${r['ReferencedEntity']}  `
      + `(bind "${r['ReferencingEntityNavigationPropertyName']}")`);
  }

  const keys = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/EntityDefinitions(LogicalName='${CASE}')/Keys?$select=LogicalName,KeyAttributes,EntityKeyIndexStatus`);
  console.log(`  alternate keys: ${keys.value.length === 0 ? 'NONE' : ''}`);
  for (const key of keys.value) {
    console.log(`    ${key['LogicalName']} on ${JSON.stringify(key['KeyAttributes'])} `
      + `[${key['EntityKeyIndexStatus']}]`);
  }
}

/**
 * Anything that could already carry DCP's identity — §7 says reuse before provisioning.
 *
 * An existing "source system" or "external reference" column would let a Complaint be created
 * retry-safely without touching Case Management at all.
 */
async function sourceReferenceCandidates(
  cfg: Config, token: string, attributes: Record<string, unknown>[],
): Promise<void> {
  heading('4. Existing source/reference fields — reuse before provisioning');

  const candidates = attributes.filter(a => {
    const name = String(a['LogicalName']);
    if (name.endsWith('name') || name.endsWith('yominame')) return false;
    return /source|external|reference|origin|upstream|integration|correlat|srcid|legacy|import/i
      .test(name);
  });
  for (const a of candidates) {
    console.log(`    ${a['LogicalName']}  (${a['AttributeType']}, `
      + `create=${a['IsValidForCreate']}, custom=${a['IsCustomAttribute']})`);
  }
  if (candidates.length === 0) console.log('    none');

  // Does anything on the Case already point at collections?
  const backLinks = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/EntityDefinitions(LogicalName='${CASE}')/ManyToOneRelationships`
    + '?$select=ReferencingAttribute,ReferencedEntity');
  const collections = backLinks.value.filter(r =>
    /qdb_collection|qdb_delinquency|qdb_strategy/i.test(String(r['ReferencedEntity'])));
  console.log(`  lookups from the Case to any collections table: `
    + `${collections.length === 0 ? 'NONE' : collections.map(r => r['ReferencingAttribute']).join(', ')}`);

  const forward = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/EntityDefinitions(LogicalName='qdb_collectionactivity')/ManyToOneRelationships"
    + `?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName`
    + `&$filter=ReferencedEntity eq '${CASE}'`);
  console.log('  lookups from a collection activity to the Case:');
  for (const r of forward.value) {
    console.log(`    ${r['ReferencingAttribute']}  (bind "${r['ReferencingEntityNavigationPropertyName']}")`);
  }
}

async function automation(cfg: Config, token: string): Promise<void> {
  heading('5. What automation is registered — nothing may bypass it');

  const steps = await get<{ '@odata.count'?: number; value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=name,stage,statecode&$count=true&$top=200'
    + `&$filter=contains(name,'${CASE}')`);
  const custom = steps.value.filter(s =>
    !/ObjectModel|Archive|Retain|Microsoft\.|Dynamics\./i.test(String(s['name'])));
  console.log(`  ${steps['@odata.count'] ?? 0} registered steps naming the entity; `
    + `${custom.length} are not platform internals:`);
  for (const step of custom.slice(0, 20)) {
    console.log(`    ${step['name']}  [stage ${step['stage']}, state ${step['statecode']}]`);
  }

  const workflows = await get<{ '@odata.count'?: number; value: Record<string, unknown>[] }>(
    cfg, token, '/workflows?$select=name,category,statecode&$count=true&$top=100'
    + `&$filter=primaryentity eq '${CASE}'`);
  console.log(`  ${workflows['@odata.count'] ?? 0} workflow(s)/BPF(s) with the Case as primary entity:`);
  for (const w of workflows.value.slice(0, 20)) {
    console.log(`    [cat ${w['category']}, state ${w['statecode']}] ${w['name']}`);
  }

  const apis = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/customapis?$select=uniquename&$filter=boundentitylogicalname eq '${CASE}'`);
  console.log(`  Custom APIs bound to the Case: `
    + `${apis.value.map(a => a['uniquename']).join(', ') || 'none'}`);

  const slas = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/slas?$select=name,objecttypecode,statecode,applicablefrom');
  const caseSlas = slas.value.filter(s => String(s['objecttypecode']) === '112');
  console.log(`  SLAs targeting the Case: ${caseSlas.map(s =>
    `${s['name']} (state ${s['statecode']})`).join(', ') || 'none'}`);
}

await main();
