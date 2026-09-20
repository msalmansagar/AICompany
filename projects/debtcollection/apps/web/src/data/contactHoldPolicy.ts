import type { ContactHoldPolicy, ContactHoldVerdict } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, PLATFORM_CONFIGURATION_COLUMNS } from './schema.js';

/**
 * Whether this organisation can establish a Contact Hold, and what to do when it cannot.
 *
 * The Phase 7 authorisation is unambiguous: Contact Hold must be **server-side authoritative**, and
 * where the authoritative source cannot be established the communication path **fails closed** —
 * refuse, record it, and never default to allow.
 *
 * So this module answers two separate questions, and never lets one stand in for the other.
 *
 * **Is there a source?** `qdb_platformconfiguration.qdb_contactholdrulesetcode` is the pointer a
 * configured source would be named by. On `org5869857f` it is null on both rows and both rows are
 * inactive, which is why KI-79 is open: there is nothing to consult. Absence is reported as absence
 * rather than read as "nobody is on hold".
 *
 * **What does this deployment do about that?** A deliberate, recorded choice — not a constant in a
 * component and not a default that quietly permits. It is read from the configuration's own
 * `qdb_featureflags`, so an organisation that has decided to permit unverified sending (a sandbox,
 * say) has *written that decision down* where an auditor can find it. Anything else, including a
 * missing or unreadable flag, refuses.
 */

/** The flag a deployment writes to record its decision. Named so it cannot be mistaken for a rule. */
export const CONTACT_HOLD_POLICY_FLAG = 'contactHoldPolicy';

export interface ContactHoldResolution {
  verdict: ContactHoldVerdict;
  policy: ContactHoldPolicy;
  /** True when sending is blocked because the hold cannot be established. */
  blocked: boolean;
  /** What to tell the officer, in their terms. Empty when nothing needs saying. */
  explanation: string;
}

const UNVERIFIABLE =
  'Contact Hold cannot be checked on this organisation, so messages are not sent. '
  + 'A Contact Hold ruleset must be configured before sending is permitted.';

/**
 * Resolves the hold for this organisation.
 *
 * Deliberately not per-recipient. Nothing here can say whether *this* customer is on hold — that is
 * what an authoritative source would do — so the answer is about whether the question can be
 * answered at all. Pretending to a per-customer verdict would be the invention this must not make.
 */
export async function resolveContactHoldPolicy(
  adapter: XrmCrmAdapter,
): Promise<ContactHoldResolution> {
  const rows = await adapter.retrieveMultiple(ENTITY_SETS.platformConfiguration, {
    select: [...PLATFORM_CONFIGURATION_COLUMNS],
    filter: 'qdb_isactive eq true',
    top: 10,
  });

  const configured = rows.find(row => String(row['qdb_contactholdrulesetcode'] ?? '').trim() !== '');
  const policy = readPolicy(rows);

  if (!configured) {
    return {
      verdict: { available: false, reason: 'No Contact Hold ruleset is configured (KI-79).' },
      policy,
      blocked: policy === 'refuse-when-unverifiable',
      explanation: policy === 'refuse-when-unverifiable'
        ? UNVERIFIABLE
        : 'Contact Hold cannot be checked on this organisation. This deployment has recorded that '
          + 'sending may proceed without it.',
    };
  }

  /**
   * A ruleset is named, and the browser still cannot evaluate it.
   *
   * Evaluating a QDB ruleset is a server-side operation; a workspace running as the signed-in user
   * has no path to it. Reporting `available: false` here is the honest answer and is **not** the
   * same as the case above — the reason distinguishes "nothing is configured" from "something is
   * configured that this client cannot reach", and they call for different fixes.
   */
  return {
    verdict: {
      available: false,
      reason: `Contact Hold ruleset "${String(configured['qdb_contactholdrulesetcode'])}" is configured `
        + 'but cannot be evaluated from the workspace.',
    },
    policy,
    blocked: policy === 'refuse-when-unverifiable',
    explanation: policy === 'refuse-when-unverifiable'
      ? 'Contact Hold is configured but cannot be checked from this screen, so messages are not sent.'
      : '',
  };
}

/**
 * Reads the recorded policy, defaulting to refusal.
 *
 * Every failure mode lands on refuse: no configuration, no flag, unparseable JSON, an unrecognised
 * value. That is the point — the permissive answer is only ever reached by a deployment explicitly
 * writing it down.
 */
function readPolicy(rows: readonly Record<string, unknown>[]): ContactHoldPolicy {
  for (const row of rows) {
    const raw = String(row['qdb_featureflags'] ?? '').trim();
    if (!raw) continue;
    try {
      const flags = JSON.parse(raw) as Record<string, unknown>;
      if (flags[CONTACT_HOLD_POLICY_FLAG] === 'allow-when-unverifiable') {
        return 'allow-when-unverifiable';
      }
    } catch {
      // Unparseable configuration is not permission. Falling through to refuse is the whole design.
    }
  }
  return 'refuse-when-unverifiable';
}
