import type { ContactHoldPolicy, ContactHoldVerdict } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, ORG_CODES, PLATFORM_CONFIGURATION_COLUMNS } from './schema.js';

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
 * configured source would be named by. On `org5869857f` it is null on both rows, which is why KI-79
 * is open: there is nothing to consult. Absence is reported as absence rather than read as "nobody
 * is on hold".
 *
 * **What does this deployment do about that?** A deliberate, recorded choice — not a constant in a
 * component and not a default that quietly permits. It is read from the configuration's own
 * `qdb_featureflags`, so an organisation that has decided to permit unverified sending (a sandbox,
 * say) has *written that decision down* where an auditor can find it. Anything else, including a
 * missing or unreadable flag, refuses.
 *
 * ## One configuration, chosen by one key
 *
 * HL and BFD share a Dataverse, so **two active configuration rows is the normal shape** — one per
 * `qdb_organizationcode`. The resolution key is therefore the organisation code, exactly as
 * `PlatformConfigurationService` resolves it on the service side, and for the same reason: reading
 * "the active configuration" without a key makes the answer depend on the order the platform
 * happened to return rows in, and lets a decision recorded for HL silently permit sending on a BFD
 * case.
 *
 * Zero matching rows and more than one both **fail closed**. More than one is not resolved by
 * picking: a deployment whose shape is ambiguous is a deployment nobody has confirmed, and guessing
 * which row wins is how a customer gets contacted under a policy no one chose.
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

const NO_CONFIGURATION =
  'This organisation has no active configuration, so messages are not sent.';

const AMBIGUOUS =
  'This organisation has more than one active configuration, so it is not clear which rules apply. '
  + 'Messages are not sent until that is resolved.';

/** Always refuses. The one construction that is safe to reach from an unexpected state. */
function failClosed(reason: string, explanation: string): ContactHoldResolution {
  return {
    verdict: { available: false, reason },
    policy: 'refuse-when-unverifiable',
    blocked: true,
    explanation,
  };
}

/**
 * Resolves the hold for one organisation.
 *
 * Deliberately not per-recipient. Nothing here can say whether *this* customer is on hold — that is
 * what an authoritative source would do — so the answer is about whether the question can be
 * answered at all. Pretending to a per-customer verdict would be the invention this must not make.
 */
export async function resolveContactHoldPolicy(
  adapter: XrmCrmAdapter,
  organization: string,
): Promise<ContactHoldResolution> {
  const code = ORG_CODES[organization];
  if (code === undefined) {
    return failClosed(
      `The case names organisation "${organization}", which has no configuration key.`,
      NO_CONFIGURATION);
  }

  // `top: 2` is enough to detect ambiguity without reading a set. Asking for one row would hide the
  // second, which is the state that must be refused rather than resolved.
  const rows = await adapter.retrieveMultiple(ENTITY_SETS.platformConfiguration, {
    select: [...PLATFORM_CONFIGURATION_COLUMNS],
    filter: `qdb_organizationcode eq ${code} and qdb_isactive eq true`,
    top: 2,
  });

  if (rows.length === 0) {
    return failClosed(
      `No active platform configuration for organisation ${organization}.`, NO_CONFIGURATION);
  }
  if (rows.length > 1) {
    return failClosed(
      `More than one active platform configuration for organisation ${organization}. `
      + 'Exactly one must be active, or the shape of the deployment is ambiguous.',
      AMBIGUOUS);
  }

  const configuration = rows[0]!;
  const policy = readPolicy(configuration);
  const ruleset = String(configuration['qdb_contactholdrulesetcode'] ?? '').trim();

  if (!ruleset) {
    return {
      verdict: { available: false, reason: `No Contact Hold ruleset is configured for ${organization} (KI-79).` },
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
      reason: `Contact Hold ruleset "${ruleset}" is configured for ${organization} but cannot be `
        + 'evaluated from the workspace.',
    },
    policy,
    blocked: policy === 'refuse-when-unverifiable',
    explanation: policy === 'refuse-when-unverifiable'
      ? 'Contact Hold is configured but cannot be checked from this screen, so messages are not sent.'
      : '',
  };
}

/**
 * Reads the recorded policy from **this organisation's** configuration, defaulting to refusal.
 *
 * Every failure mode lands on refuse: no flag, unparseable JSON, an unrecognised value. That is the
 * point — the permissive answer is only ever reached by a deployment explicitly writing it down,
 * for the organisation it applies to.
 */
function readPolicy(configuration: Record<string, unknown>): ContactHoldPolicy {
  const raw = String(configuration['qdb_featureflags'] ?? '').trim();
  if (!raw) return 'refuse-when-unverifiable';
  try {
    const flags = JSON.parse(raw) as Record<string, unknown>;
    return flags[CONTACT_HOLD_POLICY_FLAG] === 'allow-when-unverifiable'
      ? 'allow-when-unverifiable'
      : 'refuse-when-unverifiable';
  } catch {
    // Unparseable configuration is not permission.
    return 'refuse-when-unverifiable';
  }
}
