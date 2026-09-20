/**
 * record-contact-hold-exception.mts
 * Records this sandbox's decision to permit sending while Contact Hold cannot be verified (KI-79).
 *
 * **This is a policy decision, written down, on one organisation.** The Phase 7 authorisation says
 * to fail closed where the authoritative Contact Hold source cannot be established, and the
 * workspace does. The one way past that is a deployment explicitly recording the exception — which
 * is what this script does, so the permission lives in the organisation's own configuration where
 * an auditor can find it, rather than in a default nobody chose.
 *
 * Two safeguards are deliberate:
 *
 *   • **Only `org5869857f`.** The guard below refuses anywhere else. Production must fail closed.
 *   • **Merged, never replaced.** `qdb_featureflags` may already carry flags that matter to
 *     something else, and overwriting them to record one decision would be a silent change.
 *
 * `qdb_isactive` is set alongside, because the workspace reads the policy only from an **active**
 * configuration. A retired configuration granting permission is exactly the loophole this must not
 * open, so the row that carries the decision has to be the one the organisation is really running.
 *
 * To reverse it, run with `--revoke`: the flag is removed and sending fails closed again.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/record-contact-hold-exception.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const FLAG = 'contactHoldPolicy';
const PERMISSIVE = 'allow-when-unverifiable';

const revoking = process.argv.includes('--revoke');

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(
      `Refusing to run: this exception is authorised for ${AUTHORISED_ORG} only, and this is ${host}. `
      + 'Every other organisation must fail closed.');
  }
  console.log(`=== ${revoking ? 'Revoking' : 'Recording'} the Contact Hold exception on ${host} ===\n`);

  const token = await acquireToken(cfg);

  const existing = await apiGet(cfg, token, SOLUTION_NAME,
    '/qdb_platformconfigurations?$select=qdb_platformconfigurationid,qdb_name,qdb_featureflags,'
    + 'qdb_isactive,qdb_contactholdrulesetcode&$top=20');
  const rows = (existing?.value ?? []) as Record<string, unknown>[];

  if (rows.length === 0) {
    throw new Error('This organisation has no platform configuration to record the decision on.');
  }

  for (const row of rows) {
    const id = String(row['qdb_platformconfigurationid']);
    const flags = parseFlags(String(row['qdb_featureflags'] ?? ''));

    if (revoking) delete flags[FLAG];
    else flags[FLAG] = PERMISSIVE;

    await patch(cfg, token, `/qdb_platformconfigurations(${id})`, {
      qdb_featureflags: Object.keys(flags).length > 0 ? JSON.stringify(flags) : null,
      // Only activation is forced, and only when recording. Revoking leaves the row's activation
      // alone — withdrawing a permission must not also change what else the row governs.
      ...(revoking ? {} : { qdb_isactive: true }),
    });
    console.log(`  ${revoking ? 'revoked on' : 'recorded on'} ${String(row['qdb_name'])}`);
  }

  await verify(cfg, token);

  const failed = results.filter(r => !r.passed);
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exit(1);

  console.log(revoking
    ? '\n  Sending now fails closed again on this organisation.'
    : '\n  Sending is now permitted on THIS SANDBOX ONLY, as a recorded decision.'
      + '\n  Run with --revoke to withdraw it.');
}

/** Existing flags, or an empty set. Unparseable configuration is replaced, never merged blindly. */
function parseFlags(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? { ...parsed as Record<string, unknown> } : {};
  } catch {
    console.log('  NOTE: existing feature flags were not readable JSON and are being replaced.');
    return {};
  }
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

/**
 * Reads the organisation back and answers the question the workspace will ask it.
 *
 * Not "did the PATCH return 204" — that proves the request was accepted, not that the screen will
 * now behave differently. The assertion below is the same condition `resolveContactHoldPolicy`
 * evaluates: an **active** row whose flags parse and carry the permissive value.
 */
async function verify(cfg: unknown, token: string): Promise<void> {
  console.log('');
  const rows = ((await apiGet(cfg, token, SOLUTION_NAME,
    '/qdb_platformconfigurations?$select=qdb_name,qdb_featureflags,qdb_isactive,'
    + 'qdb_contactholdrulesetcode&$filter=qdb_isactive eq true&$top=20'))?.value ?? []
  ) as Record<string, unknown>[];

  const permissive = rows.some(row => {
    try {
      return (JSON.parse(String(row['qdb_featureflags'] ?? '{}')) as Record<string, unknown>)[FLAG]
        === PERMISSIVE;
    } catch { return false; }
  });

  if (revoking) {
    check('no active configuration now permits unverified sending', !permissive);
    return;
  }

  check('an ACTIVE configuration carries the recorded decision', permissive,
    `${rows.length} active row(s)`);

  // The exception is about an *unverifiable* hold. If a ruleset had appeared, the exception would be
  // the wrong instrument and should be withdrawn rather than left standing.
  const configured = rows.filter(row => String(row['qdb_contactholdrulesetcode'] ?? '').trim());
  check('no Contact Hold ruleset exists, so the exception is still the right instrument',
    configured.length === 0,
    configured.length === 0 ? 'none configured (KI-79 open)' : 'a ruleset now exists — revoke this');
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
