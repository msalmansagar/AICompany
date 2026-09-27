/**
 * qa-synthetic-mobile.mts
 * Gives the DEMO contact a synthetic mobile number, so the SMS journey can be runtime-validated.
 *
 * **Why this is needed.** Phase 7 runtime validation found that **not one of the 3,842 contacts on
 * `org5869857f` has a mobile number**. The eligibility gate correctly refused every SMS with "…has
 * no mobile number on file", which is the gate working — and which made the SMS path impossible to
 * exercise. That is a gap in sandbox test data, not a QDB business decision.
 *
 * **Why this number.** `+97400000000` is all zeros after the country code. It is not assignable to
 * a subscriber, so it cannot reach a person even if something tried. It is applied to a contact
 * already marked `(DEMO)` and already linked to the `DEMO-HL-1001` validation case — no real
 * customer is touched, and no real customer's number is used.
 *
 * **Nothing can send it.** QDB's SMS dispatcher is not installed on this Cloud organisation, so a
 * created Fax row is inert. The phase's status is unchanged by this script:
 * **Native Record Creation Proven — External Delivery Unproven.**
 *
 * `--revert` removes the number again.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/qa-synthetic-mobile.mts [--revert]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** Not assignable to any subscriber. Chosen so it cannot reach a person under any circumstances. */
const SYNTHETIC_MOBILE = '+97400000000';

/** The contact this applies to — already `(DEMO)` marked and already on the validation case. */
const CONTACT_MARKER = '(DEMO)';

const reverting = process.argv.includes('--revert');

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised for ${AUTHORISED_ORG} only, connected to ${host}`);
  }
  console.log(`=== ${reverting ? 'Removing' : 'Applying'} the synthetic QA mobile on ${host} ===\n`);

  const token = await acquireToken(cfg);

  const found = await apiGet(cfg, token, SOLUTION_NAME,
    `/contacts?$select=contactid,fullname,mobilephone&$filter=contains(fullname,'${CONTACT_MARKER}')&$top=5`);
  const contacts = (found?.value ?? []) as Record<string, unknown>[];

  check('exactly one DEMO contact to act on', contacts.length === 1,
    contacts.map(c => String(c['fullname'])).join(', ') || 'none found');
  if (contacts.length !== 1) process.exit(1);

  const contact = contacts[0]!;
  const id = String(contact['contactid']);
  console.log(`  contact: ${String(contact['fullname'])}`);
  console.log(`  mobile before: ${JSON.stringify(contact['mobilephone'])}\n`);

  await patch(cfg, token, `/contacts(${id})`, {
    mobilephone: reverting ? null : SYNTHETIC_MOBILE,
  });

  // Read back. A PATCH returning 204 says the request was accepted, not that the value is there.
  const after = await apiGet(cfg, token, SOLUTION_NAME,
    `/contacts(${id})?$select=contactid,fullname,mobilephone,donotfax,donotemail`);
  const mobile = after?.mobilephone ?? null;

  if (reverting) {
    check('the synthetic mobile is gone', mobile === null, JSON.stringify(mobile));
  } else {
    check('the synthetic mobile is in place', mobile === SYNTHETIC_MOBILE, String(mobile));
    check('it is the non-assignable test value, not a real number',
      String(mobile) === SYNTHETIC_MOBILE);
    check('the contact carries no channel restriction that would mask the test',
      after?.donotfax === false && after?.donotemail === false,
      `donotfax=${after?.donotfax} donotemail=${after?.donotemail}`);
  }

  // No other contact gained a number as a side effect.
  const withMobile = await apiGet(cfg, token, SOLUTION_NAME,
    '/contacts?$select=contactid&$count=true&$top=1&$filter=mobilephone ne null');
  check('exactly the intended number of contacts hold a mobile',
    withMobile?.['@odata.count'] === (reverting ? 0 : 1),
    `${withMobile?.['@odata.count']} contact(s)`);

  console.log('\n  Nothing can send from this organisation: QDB\'s dispatcher is not installed here.');
  console.log('  Phase status is unchanged — Native Record Creation Proven, External Delivery Unproven.');

  const failed = results.filter(r => !r.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length > 0) process.exit(1);
}

async function patch(
  cfg: { apiBase: string }, token: string, path: string, body: unknown,
): Promise<void> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 300)}`);
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
