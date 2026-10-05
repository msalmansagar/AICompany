import {
  evaluateEligibility, planCommunication,
  type CommunicationRequest, type CommunicationWritePlan, type EligibilityContext, type EligibilityRefusal,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, NAVIGATION_PROPERTIES, PARTY_COLLECTIONS, bindLookup } from '../data/schema.js';
import { routeFor, type MessageRoute, type MessagingConfiguration } from '../data/messagingConfiguration.js';
import { describeFailure } from '../platform/errors.js';

/**
 * Turns a communication decision into the native record QDB's mechanism consumes.
 *
 * The same three layers as Phase 6: `@dcp/domain` decides, this translates, the adapter writes.
 * React never names a column, never composes a binding and never learns that an SMS is a Fax.
 *
 * **DCP creates the record and stops.** QDB's Custom Workflow Activity sends SMS and WhatsApp from
 * the Fax row; QDB's existing mechanism sends Email. No dispatcher, no provider, no SMTP. On the
 * Cloud development organisation that Custom Workflow Activity is not installed, so a created Fax
 * row is inert — which is why the phase reports **Native Record Creation Proven — External Delivery
 * Unproven** rather than anything about delivery (KI-83).
 */

/**
 * Where one communication is written: the table, its columns and its two relationship names.
 *
 * SMS and WhatsApp come from the organisation's messaging configuration — BFD Fax with QDB's `qdb_`
 * columns, Housing Loan Letter with `vrp_address` / `vrp_description` — so this file names no
 * message column. Email is standard Dynamics everywhere and DCP adds nothing to it.
 */
interface WriteTarget {
  entitySet: string;
  partyCollection: string;
  regardingToCase: string;
  columns: Readonly<Record<string, string>>;
}

const EMAIL_TARGET: WriteTarget = {
  entitySet: ENTITY_SETS.email,
  partyCollection: PARTY_COLLECTIONS.email,
  regardingToCase: NAVIGATION_PROPERTIES.emailToCase,
  columns: { subject: 'subject', description: 'description' },
};

/** A message route as a write target. `subject` is native to every activity, so it is always there. */
function messageTarget(route: MessageRoute): WriteTarget {
  return {
    entitySet: route.entitySet,
    partyCollection: route.partyCollection,
    regardingToCase: route.regardingToCase,
    columns: { subject: 'subject', ...route.columns },
  };
}

/** The native participation type for a recipient. The platform sets the sender itself, as mask 9. */
export const RECIPIENT_PARTY_MASK = 2;

/** Eligibility plus the organisation's messaging configuration, which decides where a message goes. */
export interface SendContext extends EligibilityContext {
  messaging: MessagingConfiguration;
}

/**
 * A communication is the native row **and** its required structure.
 *
 * The live platform forced this distinction into the model. A Fax or Email row can be created
 * perfectly while its recipient ActivityParty fails, and the result is a record nobody can receive.
 * Reporting that as sent — or, worse, as `alreadySent` on the next retry because the id exists —
 * would be a message silently not delivered to a real customer (KI-85).
 *
 * So `sent` means complete. `incomplete` means the row is there and the structure is not, and it is
 * **retryable**: the repair is idempotent and the next attempt completes it.
 */
export type SendOutcome =
  | { status: 'sent'; activityId: string; created: boolean; repaired: boolean }
  | { status: 'incomplete'; activityId: string; reason: string }
  | { status: 'refused'; refusals: readonly EligibilityRefusal[] };

export class CommunicationService {
  constructor(private readonly adapter: XrmCrmAdapter) {}

  /**
   * Sends one communication — that is, creates the native record for it.
   *
   * `activityId` is supplied by the caller, never generated here. For a single send a form mints it
   * when it opens; for a bulk run it is `uuidv5(runId | recipientId | channel)`. Either way the id
   * is the idempotency key, and generating one here would make every retry a new record.
   *
   * Eligibility runs **inside** this method rather than before it, so no caller can reach a send
   * without passing the gate — a bulk run and a single send are the same code path.
   */
  async send(
    activityId: string,
    request: CommunicationRequest,
    context: SendContext,
  ): Promise<SendOutcome> {
    const route = routeFor(context.messaging, request.channel);
    const routed: CommunicationRequest = route ? { ...request, messageTable: route.table } : request;
    const eligibility = evaluateEligibility(routed, context);
    if (!eligibility.eligible) {
      return { status: 'refused', refusals: eligibility.refusals };
    }

    const target = route ? messageTarget(route) : EMAIL_TARGET;
    const plan = planCommunication(routed);
    const unmapped = unmappedFields(plan, target);
    if (unmapped.length > 0) {
      // A value with nowhere to go is a configuration gap: refuse with the reason, write nothing.
      return { status: 'refused', refusals: [{
        code: 'ChannelNotConfigured',
        message: `This organisation has no ${plan.entity} column mapped for ${unmapped.join(', ')}, so nothing was sent. Add a Communication mapping for it.`,
      }] };
    }
    const result = await this.adapter.createIdempotent(target.entitySet, activityId, toNativePayload(plan, target));

    /**
     * The row exists. Now make sure the **communication** does.
     *
     * `created: false` is deliberately not read as "already sent". It says the id is taken, which is
     * true whether the previous attempt finished or died between creating the row and attaching the
     * recipient. Only inspecting the structure can tell those apart, and the difference is a
     * customer who was contacted versus one who was not.
     */
    try {
      const addedParty = await this.ensureRecipient(`${target.entitySet}(${activityId})/${target.partyCollection}`, plan.recipientParty);
      // Repaired means the ROW already existed and its recipient did not — a previous attempt that
      // died half-made. A fresh send also adds a party, but that is not a repair.
      return { status: 'sent', activityId, created: result.created, repaired: addedParty && !result.created };
    } catch (error) {
      // The row is there and its structure is not. Retryable rather than fatal: the repair is
      // idempotent, so the next attempt finishes it — and never creates a second row to do so.
      return {
        status: 'incomplete',
        activityId,
        reason: describeFailure(error),
      };
    }
  }

  /**
   * Makes sure the activity carries its recipient, adding it only if it is missing.
   *
   * Returns whether it **added** the party. The caller combines that with whether it created the
   * row to tell a first-time send from the completion of one that died half-made — the platform
   * attaches a sender party itself, so the collection being non-empty proves nothing.
   *
   * Reading before writing is what keeps this idempotent. The party collection has no natural key to
   * lean on the way a record id does, so a blind POST on every retry would give one message two
   * identical recipients — which the platform would happily accept.
   */
  private async ensureRecipient(
    collection: string,
    party: { table: 'contact' | 'account'; id: string },
  ): Promise<boolean> {
    const existing = await this.adapter.readRelated(
      collection, ['activitypartyid', 'participationtypemask', '_partyid_value']);

    const alreadyThere = existing.some(row =>
      Number(row['participationtypemask']) === RECIPIENT_PARTY_MASK
      && String(row['_partyid_value'] ?? '').toLowerCase() === party.id.toLowerCase());
    if (alreadyThere) return false;

    await this.attachRecipient(collection, party);
    return true;
  }

  /**
   * Attaches the recipient as a native ActivityParty.
   *
   * It has to be a second request, and the shape is not obvious — both facts were established
   * against the organisation rather than assumed:
   *
   * | Attempt | Result |
   * |---|---|
   * | `to: [...]` inside the upsert create | **400** — payload rejected |
   * | `to: [...]` in a PATCH after the record exists | **400** — same |
   * | `POST /faxes(id)/fax_activity_parties` | **204** — the party lands with mask 2 |
   *
   * So the party goes to the **collection-valued navigation property**, whose name is read from
   * metadata (`fax_activity_parties`, `letter_activity_parties`, `email_activity_parties`) rather
   * than derived — the same rule KI-69 established for lookups, applied to relationships. On a
   * Housing Loan Letter this is the native **To** party that links the HL contact to the SMS.
   *
   * `participationtypemask: 2` is the native "To" value. The platform adds the sender itself.
   */
  private async attachRecipient(
    collection: string,
    party: { table: 'contact' | 'account'; id: string },
  ): Promise<void> {
    const partySet = party.table === 'contact' ? ENTITY_SETS.contact : ENTITY_SETS.account;
    await this.adapter.appendToCollection(
      collection,
      {
        [`partyid_${party.table}@odata.bind`]: `/${partySet}(${party.id})`,
        participationtypemask: RECIPIENT_PARTY_MASK,
      },
    );
  }
}

/**
 * Translates a plan into the native payload.
 *
 * A canonical name with no column mapped for this entity is a programming error, not a value to pass
 * through — the platform would reject it with a message about an undeclared property, which is a
 * slow way to learn about a typo.
 */
/** The plan's fields this target has no column for. `send` refuses on any, before writing. */
function unmappedFields(plan: CommunicationWritePlan, target: WriteTarget): readonly string[] {
  return Object.keys(plan.fields).filter(name => !target.columns[name]);
}

export function toNativePayload(plan: CommunicationWritePlan, target: WriteTarget): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(plan.fields)) {
    const column = target.columns[name];
    // A value with nowhere to go is a configuration gap — say so rather than drop it silently.
    if (!column) throw new Error(`No ${plan.entity} column is mapped for the field "${name}". Add a Communication mapping for it.`);
    payload[column] = value;
  }

  for (const bind of plan.binds) {
    if (bind.lookup !== 'regardingCase') continue;
    Object.assign(payload, bindLookup(target.regardingToCase, ENTITY_SETS.collectionCase, bind.id));
  }

  return payload;
}
