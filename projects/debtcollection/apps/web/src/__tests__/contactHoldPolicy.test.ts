import { describe, expect, it } from 'vitest';
import { resolveContactHoldPolicy } from '../data/contactHoldPolicy.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Configuration resolution, and why it needs a key.
 *
 * HL and BFD share one Dataverse, so **two active `qdb_platformconfiguration` rows is the normal
 * shape**, not a fault. That makes "read the active configuration" an ambiguous instruction: which
 * one? The service side has always answered by `qdb_organizationcode`, one active row per
 * organisation, refusing when that is not true — and the workspace did not, which is the assumption
 * these tests exist to pin.
 *
 * Two failures were possible and both are covered below.
 *
 * **Leakage.** A Contact Hold exception recorded for HL must not permit sending on a BFD case. With
 * no key, a fold over every active row would have permitted it, and on the sandbox — where both
 * rows carry the flag — nothing would have looked wrong.
 *
 * **Order dependence.** Where two rows could both match, whichever the platform returned first
 * would decide. A test that supplies the rows in both orders and demands the same verdict is the
 * only way to hold that down, because the real platform's order is not ours to choose.
 */

const HL = 100000140;
const BFD = 100000141;

const PERMISSIVE = JSON.stringify({ contactHoldPolicy: 'allow-when-unverifiable' });

function configuration(code: number, overrides: Record<string, unknown> = {}) {
  return {
    qdb_platformconfigurationid: `cfg-${code}`,
    qdb_name: `Configuration ${code}`,
    qdb_organizationcode: code,
    qdb_isactive: true,
    qdb_contactholdrulesetcode: null,
    qdb_featureflags: null,
    ...overrides,
  };
}

/**
 * An adapter over rows the platform would return, **honouring the filter**.
 *
 * It really parses `qdb_organizationcode eq <n>` rather than returning everything, because a fake
 * that ignores the filter would let a resolver with no key pass — which is the exact defect.
 */
function adapterFor(rows: Record<string, unknown>[], reverse = false): XrmCrmAdapter {
  const xrm = {
    Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://x/', getVersion: () => '9.2.0.0', userSettings: { userId: '{1}', userName: 't', languageId: 1033 } }) },
    WebApi: {
      async retrieveRecord() { throw { status: 404 }; },
      async retrieveMultipleRecords(_logical: string, options = '') {
        const key = /qdb_organizationcode eq (\d+)/.exec(String(options))?.[1];
        const active = rows.filter(row => row['qdb_isactive'] === true);
        // No organisation in the filter means the caller asked for "the active configuration" —
        // so it gets all of them, which is what the platform would really return. Modelled this way
        // on purpose: a fake that returned nothing would make a keyless resolver fail for the wrong
        // reason, and the leakage below would go unproven.
        const matched = key === undefined
          ? active
          : active.filter(row => Number(row['qdb_organizationcode']) === Number(key));
        const top = Number(/\$top=(\d+)/.exec(String(options))?.[1] ?? matched.length);
        const ordered = reverse ? [...matched].reverse() : matched;
        return { entities: ordered.slice(0, top) };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  } as unknown as XrmLike;
  return new XrmCrmAdapter(xrm);
}

describe('a decision recorded for one organisation does not reach the other', () => {
  const rows = [
    configuration(HL, { qdb_featureflags: PERMISSIVE }),
    configuration(BFD),
  ];

  it('permits sending on the organisation that recorded the exception', async () => {
    const resolved = await resolveContactHoldPolicy(adapterFor(rows), 'HL');
    expect(resolved.policy).toBe('allow-when-unverifiable');
    expect(resolved.blocked).toBe(false);
  });

  it('blocks sending on the organisation that did not', async () => {
    const resolved = await resolveContactHoldPolicy(adapterFor(rows), 'BFD');
    expect(resolved.policy).toBe('refuse-when-unverifiable');
    expect(resolved.blocked).toBe(true);
  });

  it('still reports the hold as unavailable where it permits sending', async () => {
    // Permission is not knowledge. The exception says "proceed anyway", never "we checked".
    const resolved = await resolveContactHoldPolicy(adapterFor(rows), 'HL');
    expect(resolved.verdict.available).toBe(false);
    expect(resolved.verdict.reason).toMatch(/KI-79/);
  });
});

describe('the verdict does not depend on the order rows come back in', () => {
  const rows = [
    configuration(HL, { qdb_featureflags: PERMISSIVE }),
    configuration(BFD, { qdb_featureflags: JSON.stringify({ contactHoldPolicy: 'something-else' }) }),
  ];

  it('gives the same answer whichever order the platform returns', async () => {
    for (const organization of ['HL', 'BFD']) {
      const forward = await resolveContactHoldPolicy(adapterFor(rows), organization);
      const backward = await resolveContactHoldPolicy(adapterFor(rows, true), organization);
      expect(backward.policy, organization).toBe(forward.policy);
      expect(backward.blocked, organization).toBe(forward.blocked);
    }
  });
});

describe('an ambiguous deployment is refused, never resolved by guessing', () => {
  it('blocks when two active rows claim the same organisation', async () => {
    const rows = [
      configuration(HL, { qdb_platformconfigurationid: 'a', qdb_featureflags: PERMISSIVE }),
      configuration(HL, { qdb_platformconfigurationid: 'b', qdb_featureflags: PERMISSIVE }),
    ];
    const resolved = await resolveContactHoldPolicy(adapterFor(rows), 'HL');

    // Both rows say "permit". It is still refused, because a deployment whose shape nobody
    // confirmed is not a deployment to send from.
    expect(resolved.blocked).toBe(true);
    expect(resolved.verdict.reason).toMatch(/more than one/i);
  });

  it('tells the officer it is a configuration problem, without naming a table', async () => {
    const rows = [configuration(HL, { qdb_platformconfigurationid: 'a' }), configuration(HL, { qdb_platformconfigurationid: 'b' })];
    const resolved = await resolveContactHoldPolicy(adapterFor(rows), 'HL');

    expect(resolved.explanation).toMatch(/more than one active configuration/i);
    expect(resolved.explanation).not.toMatch(/qdb_|platformconfiguration/i);
  });
});

describe('every unexpected state fails closed', () => {
  it('blocks when the organisation has no active configuration', async () => {
    const resolved = await resolveContactHoldPolicy(adapterFor([configuration(BFD)]), 'HL');
    expect(resolved.blocked).toBe(true);
  });

  it('blocks when the only configuration is inactive', async () => {
    const rows = [configuration(HL, { qdb_isactive: false, qdb_featureflags: PERMISSIVE })];
    const resolved = await resolveContactHoldPolicy(adapterFor(rows), 'HL');

    // A retired configuration granting permission is the loophole this exists to close.
    expect(resolved.blocked).toBe(true);
  });

  it('blocks when the case names an organisation with no configuration key', async () => {
    const resolved = await resolveContactHoldPolicy(adapterFor([configuration(HL, { qdb_featureflags: PERMISSIVE })]), '');
    expect(resolved.blocked).toBe(true);
  });

  it('blocks when the recorded flags are not readable JSON', async () => {
    const rows = [configuration(HL, { qdb_featureflags: '{not json' })];
    expect((await resolveContactHoldPolicy(adapterFor(rows), 'HL')).blocked).toBe(true);
  });

  it('blocks when the flag carries a value nobody defined', async () => {
    const rows = [configuration(HL, { qdb_featureflags: JSON.stringify({ contactHoldPolicy: 'maybe' }) })];
    expect((await resolveContactHoldPolicy(adapterFor(rows), 'HL')).blocked).toBe(true);
  });

  it('blocks when no flag is recorded at all', async () => {
    expect((await resolveContactHoldPolicy(adapterFor([configuration(HL)]), 'HL')).blocked).toBe(true);
  });
});

describe('a configured ruleset is reported differently from no ruleset at all', () => {
  it('names the ruleset it cannot evaluate, so the fix is obvious', async () => {
    const rows = [configuration(HL, {
      qdb_contactholdrulesetcode: 'QDB-HOLD-V1',
      qdb_featureflags: PERMISSIVE,
    })];
    const resolved = await resolveContactHoldPolicy(adapterFor(rows), 'HL');

    expect(resolved.verdict.reason).toMatch(/QDB-HOLD-V1/);
    expect(resolved.verdict.reason).not.toMatch(/KI-79/);
  });

  it('still refuses a configured ruleset when no exception is recorded', async () => {
    const rows = [configuration(HL, { qdb_contactholdrulesetcode: 'QDB-HOLD-V1' })];
    expect((await resolveContactHoldPolicy(adapterFor(rows), 'HL')).blocked).toBe(true);
  });
});
