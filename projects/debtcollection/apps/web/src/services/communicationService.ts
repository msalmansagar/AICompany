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

    // The recipient is an ActivityParty, which the platform will not accept in the same request as
    // the record itself — so it is attached after, and only for a record this call created. A
    // repeat already has its party from the first attempt.
    if (result.created) {
      await this.attachRecipientParty(plan.entity, activityId, plan.recipientParty);
    }

    return { status: 'sent', activityId, created: result.created };
  }

  /**
   * Attaches the recipient as an activity party.
   *
   * Native Dynamics semantics, preserved rather than replaced: `to` is a PartyList on both `fax` and
   * `email`, and a customer is a `contact` for Housing Loan or an `account` for BFD. The party
   * therefore points at whichever table the recipient resolver returned — one code path, two
   * customer masters, no branch on the organisation.
   *
   * A failure here is deliberately not fatal to the send. The record exists and carries the
   * recipient's number or address; a missing party makes it less legible in CRM, not undelivered.
   */
  private async attachRecipientParty(
    entity: 'fax' | 'email',
    activityId: string,
    party: { table: 'contact' | 'account'; id: string },
  ): Promise<void> {
    const partyTargetSet = party.table === 'contact' ? ENTITY_SETS.contact : ENTITY_SETS.account;
    await this.adapter.create('activityparties', {
      'activityid_activitypointer@odata.bind': `/activitypointers(${activityId})`,
      [`partyid_${party.table}@odata.bind`]: `/${partyTargetSet}(${party.id})`,
      // 2 = "To" in the native participation type mask.
      participationtypemask: 2,
    });
    void entity;
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
