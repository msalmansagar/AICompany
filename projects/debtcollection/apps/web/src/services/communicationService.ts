import {
  evaluateEligibility, planCommunication,
  type CommunicationRequest, type EligibilityContext, type EligibilityRefusal,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, NAVIGATION_PROPERTIES, bindLookup } from '../data/schema.js';

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

/**
 * The collection-valued navigation property that carries an activity's parties.
 *
 * Read from metadata, never derived. The party cannot go in the create payload at all — see
 * `attachRecipient` for what the platform accepts and what it refuses.
 */
const PARTY_COLLECTION: Readonly<Record<'fax' | 'email', string>> = {
  fax: 'fax_activity_parties',
  email: 'email_activity_parties',
};

const ENTITY_SET: Readonly<Record<'fax' | 'email', string>> = {
  fax: ENTITY_SETS.fax,
  email: ENTITY_SETS.email,
};

export type SendOutcome =
  | { status: 'sent'; activityId: string; created: boolean }
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

    // Only for a record this call actually created. A repeat already carries its recipient from the
    // first attempt, and adding another party would give one message two recipients.
    if (result.created) {
      await this.attachRecipient(plan.entity, activityId, plan.recipientParty);
    }

    return { status: 'sent', activityId, created: result.created };
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
      `${ENTITY_SET[entity]}(${activityId})/${PARTY_COLLECTION[entity]}`,
      {
        [`partyid_${party.table}@odata.bind`]: `/${partySet}(${party.id})`,
        participationtypemask: 2,
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
