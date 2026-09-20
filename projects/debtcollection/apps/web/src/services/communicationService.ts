import {
  evaluateEligibility, planCommunication,
  type CommunicationRequest, type EligibilityContext, type EligibilityRefusal,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, NAVIGATION_PROPERTIES, PARTY_COLLECTIONS, bindLookup } from '../data/schema.js';

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
 * Canonical field name → physical column, per entity.
 *
 * Split by entity because `fax` and `email` are different tables with different vocabularies, and a
 * single flat map would let an email field reach a fax row. **The Fax set is exactly QDB's confirmed
 * contract and nothing more** — `qdb_sms_id`, `qdb_sendernumber`, `qdb_smssendto`,
 * `qdb_message_length`, `qdb_totalsmsmessages` and the four recipient lookups all exist on the
 * entity and are deliberately absent here: they belong to QDB's mechanism and to other modules.
 */
const COLUMNS: Readonly<Record<'fax' | 'email', Readonly<Record<string, string>>>> = {
  fax: {
    subject: 'subject',
    faxNumber: 'faxnumber',
    messageBody: 'qdb_message_body',
    sender: 'qdb_sender',
    // WhatsApp only. An SMS row carries none of these three, and that absence is the discriminator.
    language: 'qdb_language',
    whatsAppTemplate: 'qdb_whatsapptemplate',
    otp: 'qdb_otp',
  },
  email: {
    subject: 'subject',
    description: 'description',
  },
};

/** The `regardingobjectid` navigation property per entity — polymorphic, so never derived (KI-69). */
const REGARDING_CASE: Readonly<Record<'fax' | 'email', string>> = {
  fax: NAVIGATION_PROPERTIES.faxToCase,
  email: NAVIGATION_PROPERTIES.emailToCase,
};

/** The native participation type for a recipient. The platform sets the sender itself, as mask 9. */
export const RECIPIENT_PARTY_MASK = 2;

const ENTITY_SET: Readonly<Record<'fax' | 'email', string>> = {
  fax: ENTITY_SETS.fax,
  email: ENTITY_SETS.email,
};

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
    context: EligibilityContext,
  ): Promise<SendOutcome> {
    const eligibility = evaluateEligibility(request, context);
    if (!eligibility.eligible) {
      return { status: 'refused', refusals: eligibility.refusals };
    }

    const plan = planCommunication(request);
    const payload = toNativePayload(plan);
    const result = await this.adapter.createIdempotent(ENTITY_SET[plan.entity], activityId, payload);

    /**
     * The row exists. Now make sure the **communication** does.
     *
     * `created: false` is deliberately not read as "already sent". It says the id is taken, which is
     * true whether the previous attempt finished or died between creating the row and attaching the
     * recipient. Only inspecting the structure can tell those apart, and the difference is a
     * customer who was contacted versus one who was not.
     */
    try {
      const addedParty = await this.ensureRecipient(plan.entity, activityId, plan.recipientParty);
      // Repaired means the ROW already existed and its recipient did not — a previous attempt that
      // died half-made. A fresh send also adds a party, but that is not a repair.
      return { status: 'sent', activityId, created: result.created, repaired: addedParty && !result.created };
    } catch (error) {
      // The row is there and its structure is not. Retryable rather than fatal: the repair is
      // idempotent, so the next attempt finishes it — and never creates a second row to do so.
      return {
        status: 'incomplete',
        activityId,
        reason: error instanceof Error ? error.message : String(error),
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
    entity: 'fax' | 'email',
    activityId: string,
    party: { table: 'contact' | 'account'; id: string },
  ): Promise<boolean> {
    const collection = `${ENTITY_SET[entity]}(${activityId})/${PARTY_COLLECTIONS[entity]}`;
    const existing = await this.adapter.readRelated(
      collection, ['activitypartyid', 'participationtypemask', '_partyid_value']);

    const alreadyThere = existing.some(row =>
      Number(row['participationtypemask']) === RECIPIENT_PARTY_MASK
      && String(row['_partyid_value'] ?? '').toLowerCase() === party.id.toLowerCase());
    if (alreadyThere) return false;

    await this.attachRecipient(entity, activityId, party);
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
   * metadata (`fax_activity_parties`, `email_activity_parties`) rather than derived — the same rule
   * KI-69 established for lookups, applied to relationships.
   *
   * `participationtypemask: 2` is the native "To" value. The platform adds the sender itself.
   */
  private async attachRecipient(
    entity: 'fax' | 'email',
    activityId: string,
    party: { table: 'contact' | 'account'; id: string },
  ): Promise<void> {
    const partySet = party.table === 'contact' ? ENTITY_SETS.contact : ENTITY_SETS.account;
    await this.adapter.appendToCollection(
      `${ENTITY_SET[entity]}(${activityId})/${PARTY_COLLECTIONS[entity]}`,
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
export function toNativePayload(plan: ReturnType<typeof planCommunication>): Record<string, unknown> {
  const columns = COLUMNS[plan.entity];
  const payload: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(plan.fields)) {
    const column = columns[name];
    if (!column) throw new Error(`No ${plan.entity} column is mapped for the field "${name}".`);
    payload[column] = value;
  }

  for (const bind of plan.binds) {
    if (bind.lookup !== 'regardingCase') continue;
    Object.assign(payload, bindLookup(REGARDING_CASE[plan.entity], ENTITY_SETS.collectionCase, bind.id));
  }

  return payload;
}
