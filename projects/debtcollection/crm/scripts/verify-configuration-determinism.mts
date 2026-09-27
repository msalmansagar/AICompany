/**
 * verify-configuration-determinism.mts
 * Asks the organisation whether configuration resolution can be ambiguous.
 *
 * Two active `qdb_platformconfiguration` rows is not automatically a problem — the platform's rule
 * is **one active row per `qdb_organizationcode`**, and HL and BFD are two organisations sharing one
 * Dataverse. It *is* a problem if two active rows claim the same organisation code, because then
 * "the configuration" has no single answer and whichever row the platform happened to return first
 * would decide how a case behaves.
 *
 * So this reads the rows back and checks the invariant the services rely on, rather than assuming it.
 *
 * Read-only. It changes nothing.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/verify-configuration-determinism.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** The organisation codes, as provisioned. */
const ORGANIZATION = new Map<number, string>([[100000140, 'HL'], [100000141, 'BFD']]);

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: connected to ${host}`);
  console.log(`=== Configuration determinism on ${host} ===\n`);

  const token = await acquireToken(cfg);
  const rows = ((await apiGet(cfg, token, SOLUTION_NAME,
    '/qdb_platformconfigurations?$select=qdb_name,qdb_organizationcode,qdb_platformtype,'
    + 'qdb_isactive,qdb_featureflags,qdb_contactholdrulesetcode&$top=50'))?.value ?? []
  ) as Record<string, unknown>[];

  const active = rows.filter(row => row['qdb_isactive'] === true);
  console.log(`  ${rows.length} configuration row(s), ${active.length} active:\n`);
  for (const row of active) {
    const code = Number(row['qdb_organizationcode']);
    console.log(`    ${String(row['qdb_name'])}`);
    console.log(`      organisation = ${ORGANIZATION.get(code) ?? `UNKNOWN(${code})`}`);
    console.log(`      contactHoldRuleset = ${JSON.stringify(row['qdb_contactholdrulesetcode'])}`);
    console.log(`      featureFlags = ${String(row['qdb_featureflags'] ?? '')}`);
  }
  console.log('');

  // ── The invariant every service resolves by ────────────────────────────────
  const byOrganisation = new Map<number, Record<string, unknown>[]>();
  for (const row of active) {
    const code = Number(row['qdb_organizationcode']);
    byOrganisation.set(code, [...(byOrganisation.get(code) ?? []), row]);
  }

  const duplicated = [...byOrganisation.entries()].filter(([, group]) => group.length > 1);
  check(
    'no organisation code has more than one active configuration',
    duplicated.length === 0,
    duplicated.length === 0
      ? [...byOrganisation.keys()].map(code => ORGANIZATION.get(code) ?? `UNKNOWN(${code})`).join(', ')
      : duplicated.map(([code, group]) =>
        `${ORGANIZATION.get(code) ?? code}: ${group.map(r => String(r['qdb_name'])).join(' + ')}`).join('; '),
  );

  const unknown = active.filter(row => !ORGANIZATION.has(Number(row['qdb_organizationcode'])));
  check(
    'every active configuration names a known organisation',
    unknown.length === 0,
    unknown.map(r => `${String(r['qdb_name'])} = ${String(r['qdb_organizationcode'])}`).join(', ')
      || 'HL and BFD only',
  );

  // ── The flag, per organisation ─────────────────────────────────────────────
  // A Contact Hold exception recorded for one organisation must not silently permit sending for the
  // other. Whether it does is a property of the resolver, not of the data — but if the data records
  // the flag inconsistently, the two organisations behave differently and that is worth seeing.
  const withFlag = active.filter(row => readFlag(String(row['qdb_featureflags'] ?? '')));
  check(
    'the Contact Hold exception is recorded consistently across active organisations',
    withFlag.length === 0 || withFlag.length === active.length,
    `${withFlag.length} of ${active.length} carry it`,
  );

  const ruleset = active.filter(row => String(row['qdb_contactholdrulesetcode'] ?? '').trim());
  check('no Contact Hold ruleset is configured, so KI-79 is still correctly open',
    ruleset.length === 0, ruleset.length === 0 ? 'none' : 'a ruleset now exists');

  console.log('\n  The rule the services resolve by: ONE active row per qdb_organizationcode.');
  console.log('  Two active rows are correct where they are HL and BFD — that is the designed');
  console.log('  shape of a shared Dataverse, not an ambiguity.');

  const failed = results.filter(r => !r.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length > 0) process.exit(1);
}

function readFlag(raw: string): boolean {
  if (!raw.trim()) return false;
  try {
    return (JSON.parse(raw) as Record<string, unknown>)['contactHoldPolicy'] === 'allow-when-unverifiable';
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
