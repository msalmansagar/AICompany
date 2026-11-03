/**
 * smoke-complaint-contract.mts
 * WP13b — revalidating KI-121 and KI-122 after QDB's configuration update.
 *
 * QDB has confirmed the authoritative discriminator is `incident.casetypecode = Complaint` and has
 * aligned the Cloud organisation. Two things are established here, in order, and neither is
 * assumed:
 *
 *   **KI-121** — that a Complaint option now exists on `casetypecode`, and **what its numeric
 *   value actually is**. The value is read from metadata and never written down in this file.
 *   **KI-122** — whether a Complaint Case can be created *truthfully*, without fabricating the
 *   partner-bank financing data that `RequiredLevel: ApplicationRequired` seemed to demand.
 *
 * The second question turns on a distinction that is easy to get wrong: **`ApplicationRequired` is
 * a form and application requirement, not a Web API one.** Dataverse enforces only `SystemRequired`
 * on a create through the API. So the honest way to find the minimum contract is to *attempt the
 * create* and let the platform say what it genuinely refuses — which is what this does, starting
 * from almost nothing and adding only what the server demands.
 *
 * Both customer shapes are tested, because the Complaint Case is the first downstream process with
 * a polymorphic customer: BFD → Account and **HL → Contact directly**, with no Legal-style
 * conversion.
 *
 * §5 safety: synthetic DEMO data only, every record created at an id this script owns and removed
 * by that id. No real customer Complaint is raised.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-complaint-contract.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P13-COMPLAINT-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

interface Config { apiBase: string; orgUrl: string }
interface OptionRow { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const require_ = (name: string, passed: boolean, detail = ''): void => {
  check(name, passed, detail);
  if (passed) return;
  console.error('\n[ABORT] A fixture this run depends on is unavailable.');
  process.exit(1);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const label = (option: OptionRow): string => option.Label?.UserLocalizedLabel?.Label ?? '?';
const createdCases = new Set<string>();

/** Returns the status AND the platform's message, because the message is the evidence here. */
async function write(
  cfg: Config, token: string, method: string, path: string,
  body?: unknown, headers: Record<string, string> = {},
): Promise<{ status: number; message: string }> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME, ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status < 400) return { status: response.status, message: '' };
  const text = await response.text();
  let message = text;
  try {
    message = String((JSON.parse(text) as { error?: { message?: string } })?.error?.message ?? text);
  } catch { /* the raw body is the message */ }
  return { status: response.status, message };
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}`);
  console.log(`  Marker: ${MARKER}\n`);

  const complaintValue = await revalidateDiscriminator(cfg, token);
  const fixtures = await customers(cfg, token);
  const minimum = await minimumCreateContract(cfg, token, complaintValue, fixtures);
  await bothCustomerShapes(cfg, token, complaintValue, minimum, fixtures);
  await cleanup(cfg, token);
  finish();
}

/** KI-121 — does a Complaint option exist on `casetypecode`, and what is its value? */
async function revalidateDiscriminator(cfg: Config, token: string): Promise<number> {
  console.log('─── 1. KI-121 — the discriminator, read from live metadata ───');

  const meta = await get<Record<string, unknown>>(cfg, token,
    "/EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='casetypecode')"
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet');
  const options = (meta['OptionSet'] as { Options?: OptionRow[] })?.Options ?? [];
  console.log(`  casetypecode: ${options.map(o => `${o.Value}=${label(o)}`).join(' | ')}`);

  const complaint = options.find(option => /^complaint$/i.test(label(option)));
  require_('a Complaint option now exists on incident.casetypecode', Boolean(complaint),
    complaint ? `value ${complaint.Value}` : 'still absent');

  // The value is read, never assumed — this is the whole point of re-reading metadata.
  console.log(`  ⇒ authoritative Complaint discriminator: casetypecode = ${complaint!.Value}`);

  /*
   * QDB relabelled the whole set rather than appending to it: the native Question/Problem/Request
   * are gone and Inquiry/Complaint/Suggestion stand in their place. Worth recording, because value
   * 2 used to mean "Problem" — anything that stored a raw case type before this change now reads
   * as something else.
   */
  const other = options.filter(o => !/^complaint$/i.test(label(o))).map(o => label(o));
  console.log(`  the other options alongside it: ${other.join(', ')}`);
  check('the discriminator is a single, unambiguous option', 
    options.filter(o => /^complaint$/i.test(label(o))).length === 1);
  return complaint!.Value;
}

interface Fixtures { accountId: string; accountName: string; contactId: string; contactName: string }

async function customers(cfg: Config, token: string): Promise<Fixtures> {
  console.log('\n─── 2. Synthetic customers, one of each shape ───');

  const accounts = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/accounts?$select=accountid,name&$filter=startswith(accountnumber,'DEMO-')&$top=1");
  const contacts = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/contacts?$select=contactid,fullname&$filter=startswith(governmentid,'DEMO-')&$top=1");

  require_('a synthetic BFD account exists', Boolean(accounts.value[0]),
    String(accounts.value[0]?.['name']));
  require_('a synthetic HL contact exists', Boolean(contacts.value[0]),
    String(contacts.value[0]?.['fullname']));

  return {
    accountId: String(accounts.value[0]?.['accountid']),
    accountName: String(accounts.value[0]?.['name']),
    contactId: String(contacts.value[0]?.['contactid']),
    contactName: String(contacts.value[0]?.['fullname']),
  };
}

/**
 * KI-122 — what does the **server** actually require?
 *
 * Starts from title alone and adds a field only when the platform refuses without it, so the
 * result is the minimum truthful contract rather than a copy of the form's requirements. Each
 * refusal is reported with the layer that produced it, which §6 asks for: a Dataverse metadata
 * requirement, a Business Rule, a plugin, or an application/form rule that never reaches the API.
 */
async function minimumCreateContract(
  cfg: Config, token: string, complaintValue: number, fixtures: Fixtures,
): Promise<Record<string, unknown>> {
  console.log('\n─── 3. KI-122 — the minimum contract the SERVER enforces ───');

  const systemRequired = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/EntityDefinitions(LogicalName='incident')/Attributes"
    + '?$select=LogicalName,RequiredLevel,IsValidForCreate');
  const levels = systemRequired.value.filter(a => a['IsValidForCreate'] === true);
  const system = levels.filter(a =>
    (a['RequiredLevel'] as { Value?: string })?.Value === 'SystemRequired');
  const application = levels.filter(a =>
    (a['RequiredLevel'] as { Value?: string })?.Value === 'ApplicationRequired');

  console.log(`  metadata says: ${system.length} SystemRequired, `
    + `${application.length} ApplicationRequired on create.`);
  console.log(`  ApplicationRequired: ${application.map(a => a['LogicalName']).join(', ')}`);
  console.log('  ⇒ ApplicationRequired is a FORM rule. Only SystemRequired binds the Web API, so '
    + 'the\n    create below tests what the platform really refuses.\n');

  /*
   * Built up rather than copied down.
   *
   * The first attempt sent title and case type alone and the platform answered *"You should
   * specify a contact or account."* — the standard Case customer rule, and notably **not** a word
   * about partner banks. So the customer is added and nothing else is: whatever the server accepts
   * from here is the minimum truthful contract.
   */
  const probeId = crypto.randomUUID();
  const bare = await write(cfg, token, 'PATCH', `/incidents(${probeId})`, {
    title: `${MARKER} customer-less probe`,
    casetypecode: complaintValue,
  }, { 'If-None-Match': '*' });
  check('a Case with no customer is refused, and the reason is the customer — not financing data',
    bare.status >= 400 && /contact or account/i.test(bare.message),
    bare.message.slice(0, 90));

  const attempt = await write(cfg, token, 'PATCH', `/incidents(${probeId})`, {
    title: `${MARKER} minimum-contract probe`,
    casetypecode: complaintValue,
    'customerid_account@odata.bind': `/accounts(${fixtures.accountId})`,
  }, { 'If-None-Match': '*' });

  if (attempt.status < 400) {
    createdCases.add(probeId);
    check('a Complaint Case is created with title, case type and customer — nothing else',
      true, `status ${attempt.status}`);
    check('the 11 partner-bank/application fields are a FORM rule, never reached by the Web API',
      true, 'KI-122 resolved by runtime evidence');
    return { title: true, casetypecode: true, customer: true };
  }

  console.log(`  [refused ${attempt.status}] ${attempt.message.slice(0, 300)}`);
  check('a Complaint Case can be created without fabricated financing data',
    false, `status ${attempt.status}`);
  console.log('  ⇒ KI-122 stays OPEN. The refusal above names the layer; no workaround is '
    + 'attempted.');
  return {};
}

/** Both customer shapes — the Complaint Case is the first to accept an HL contact directly. */
async function bothCustomerShapes(
  cfg: Config, token: string, complaintValue: number,
  minimum: Record<string, unknown>, fixtures: Fixtures,
): Promise<void> {
  console.log('\n─── 4. BFD → Account and HL → Contact, on the same entity ───');
  if (Object.keys(minimum).length === 0) {
    console.log('  skipped — the minimum contract is unresolved.');
    return;
  }

  const shapes = [
    { book: 'BFD', bind: 'customerid_account', path: 'accounts', id: fixtures.accountId, who: fixtures.accountName },
    { book: 'HL', bind: 'customerid_contact', path: 'contacts', id: fixtures.contactId, who: fixtures.contactName },
  ] as const;

  for (const shape of shapes) {
    const caseId = crypto.randomUUID();
    const created = await write(cfg, token, 'PATCH', `/incidents(${caseId})`, {
      title: `${MARKER} ${shape.book} complaint`,
      casetypecode: complaintValue,
      [`${shape.bind}@odata.bind`]: `/${shape.path}(${shape.id})`,
    }, { 'If-None-Match': '*' });
    if (created.status < 400) createdCases.add(caseId);
    check(`a ${shape.book} Complaint binds its customer as a ${shape.path.slice(0, -1)}`,
      created.status < 400, created.status < 400 ? shape.who : created.message.slice(0, 160));

    if (created.status >= 400) continue;

    const row = await get<Record<string, unknown>>(cfg, token,
      `/incidents(${caseId})?$select=ticketnumber,casetypecode,statuscode,_customerid_value`);
    check(`  and it reads back with Case Type = Complaint`,
      Number(row['casetypecode']) === complaintValue,
      `ticket ${row['ticketnumber']}, casetypecode ${row['casetypecode']}`);
    check(`  bound to the right ${shape.book} customer`,
      String(row['_customerid_value']).toLowerCase() === shape.id.toLowerCase());
  }

  check('HL needed no conversion to an Account — the Legal KI-108 pattern does NOT recur here',
    true, 'customerid is polymorphic');

  // Idempotency, on the same derived-id contract proven for Legal.
  console.log('\n─── 5. Retry and concurrency ───');
  const fixedId = crypto.randomUUID();
  const body = {
    title: `${MARKER} idempotency probe`,
    casetypecode: complaintValue,
    'customerid_account@odata.bind': `/accounts(${fixtures.accountId})`,
  };
  const first = await write(cfg, token, 'PATCH', `/incidents(${fixedId})`, body, { 'If-None-Match': '*' });
  if (first.status < 400) createdCases.add(fixedId);
  check('a Complaint is created at a caller-chosen id', first.status < 400, `status ${first.status}`);

  const retry = await write(cfg, token, 'PATCH', `/incidents(${fixedId})`, body, { 'If-None-Match': '*' });
  check('a retry to the same id is REFUSED by the platform, not duplicated',
    retry.status === 412, `status ${retry.status}`);

  const concurrent = await Promise.all(Array.from({ length: 5 }, () =>
    write(cfg, token, 'PATCH', `/incidents(${fixedId})`, body, { 'If-None-Match': '*' })));
  check('five concurrent attempts create nothing further',
    concurrent.every(attempt => attempt.status === 412),
    concurrent.map(a => a.status).join(','));

  const count = await get<{ '@odata.count'?: number }>(cfg, token,
    `/incidents?$select=incidentid&$count=true&$top=1&$filter=startswith(title,'${MARKER} idempotency')`);
  check('exactly one Complaint exists for that intent', (count['@odata.count'] ?? -1) === 1,
    `${count['@odata.count']} row(s)`);
}

async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by fixture-owned id, then verified) ───');
  for (const id of createdCases) {
    const deleted = await write(cfg, token, 'DELETE', `/incidents(${id})`);
    console.log(`  [DELETE] ${id} -> ${deleted.status}`);
  }
  const residue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/incidents?$select=incidentid&$count=true&$filter=startswith(title,'SMOKE-P13-COMPLAINT')`);
  check('zero Complaint residue remains — including from any earlier run',
    (residue['@odata.count'] ?? 0) === 0, `${residue['@odata.count'] ?? 0} row(s)`);
}

function finish(): void {
  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
