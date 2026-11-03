/**
 * What a collection officer may send, and what makes a send permissible.
 *
 * Pure decisions, exactly as `activityOperations.ts` is: these take what the officer composed and
 * what configuration says, and answer "is this allowed, and what should be written". They touch no
 * CRM, so every rule is testable without an organisation, and React cannot compose a communication.
 *
 * **DCP creates a record and stops.** QDB's existing Custom Workflow Activity sends SMS and WhatsApp
 * from the Fax activity, and QDB's existing mechanism sends Email. There is no dispatcher here, no
 * provider integration and no gateway — building one would replace the mechanism that owns delivery
 * (ADR-DCP-21, KI-83).
 *
 * The field contracts below are **QDB's, confirmed from the existing production/on-prem solution**.
 * They are deliberately narrow: the Fax entity carries thirty-one `qdb_` columns, and DCP populates
 * only the ones QDB named. Writing a field because it exists is how a contract drifts away from the
 * implementation that consumes it.
 */

import { z } from 'zod';

export const CommunicationChannel = {
  SMS: 'SMS',
  WhatsApp: 'WhatsApp',
  Email: 'Email',
} as const;
export type CommunicationChannel = (typeof CommunicationChannel)[keyof typeof CommunicationChannel];

/**
 * The native table that carries SMS and WhatsApp in an organisation.
 *
 * **Configuration, not design.** BFD / QDB1 sends both as `fax`; Housing Loan CRM sends both as
 * `letter` (user, 2026-10-05). The organisation's `qdb_platformconfiguration` names the table and
 * its `qdb_platformmapping` rows name the columns; this module never assumes either.
 */
export type MessageTable = 'fax' | 'letter';

/**
 * The native "do not" preference that governs a message, by the table that carries it.
 *
 * The same reasoning the Fax design always used — the restriction of the table the message leaves
 * through — applied to whichever table that is. On a Housing Loan organisation an SMS is a Letter,
 * so the customer's "do not send postal mail" governs it.
 */
export const MESSAGE_TABLE_RESTRICTION: Readonly<Record<MessageTable, { flag: 'doNotFax' | 'doNotPostalMail'; wording: string }>> = {
  fax: { flag: 'doNotFax', wording: 'do not fax' },
  letter: { flag: 'doNotPostalMail', wording: 'do not send postal mail' },
};

/**
 * The customer, resolved from the case's own context.
 *
 * Housing Loan customers are **contacts** and BFD customers are **accounts** — one polymorphic
 * lookup, two tables. The asymmetry that matters for SMS is that `account` has **no `mobilephone`**;
 * it carries `telephone1`/`telephone2` only. The resolver absorbs that so no component branches on
 * the organisation, which is the same discipline `bindLookup()` applies to writes.
 */
export interface CommunicationRecipient {
  table: 'contact' | 'account';
  id: string;
  displayName: string;
  /** Best available mobile number. Absent is a legitimate state, not an error. */
  mobile?: string;
  email?: string;
  /** Native Dynamics channel restrictions, read as the platform stores them. */
  restrictions: {
    doNotFax: boolean;
    doNotPostalMail: boolean;
    doNotEmail: boolean;
    doNotPhone: boolean;
  };
}

export interface CommunicationRequest {
  channel: CommunicationChannel;
  caseId: string;
  recipient: CommunicationRecipient;
  /** The rendered message. Templates produce it; free text produces it; the domain only checks it. */
  body: string;
  /** Email only. */
  subject?: string;
  /** The `qdb_sender` option value. Configuration's, never a constant here. */
  senderCode?: number;
  /** WhatsApp only — the three fields QDB confirmed are WhatsApp-specific. */
  language?: string;
  whatsAppTemplate?: string;
  otp?: string;
  /** The collection activity this was initiated from, where there is one. */
  activityId?: string;
  /**
   * The table this organisation sends SMS / WhatsApp through, from its configuration. Absent means
   * the organisation has not configured the channel, and the message is refused rather than guessed.
   */
  messageTable?: MessageTable;
}

// ── Eligibility ──────────────────────────────────────────────────────────────

export interface EligibilityRefusal {
  code:
    | 'RecipientMissing' | 'MobileMissing' | 'EmailMissing' | 'BodyMissing' | 'SubjectMissing'
    | 'ChannelRestricted' | 'ContactHoldUnverifiable' | 'WhatsAppTemplateMissing' | 'SenderMissing'
    | 'CaseMissing' | 'ChannelNotConfigured';
  message: string;
  field?: string;
}

export type CommunicationEligibilityOutcome =
  | { eligible: true }
  | { eligible: false; refusals: readonly EligibilityRefusal[] };

/**
 * Whether QDB's authoritative Collection Contact Hold is available, and what it said.
 *
 * **Deliberately an injected port, not a lookup.** No authoritative source exists on the
 * organisation — `qdb_stopcontact`, `qdb_deceasedflag` and `qdb_specialhandling` are absent from
 * contact and account, and `qdb_contactholdrulesetcode` is null (**KI-79**). When QDB names the
 * source, an implementation of this interface drops in and **no call site changes**.
 *
 * `available: false` is honest about not knowing. What the caller does with that is a policy
 * decision, and `contactHoldPolicy` below is where it is made once rather than at each call.
 */
export interface ContactHoldVerdict {
  available: boolean;
  held?: boolean;
  /** The rule that held it, when a source can say. */
  reason?: string;
}

/** Deployment's choice about an unverifiable hold. Neither value is invented by this module. */
export type ContactHoldPolicy = 'refuse-when-unverifiable' | 'allow-when-unverifiable';

export interface EligibilityContext {
  contactHold: ContactHoldVerdict;
  contactHoldPolicy: ContactHoldPolicy;
}

/**
 * The one eligibility gate, used by **single and bulk alike**.
 *
 * A bulk run must not bypass a restriction that applies to one send, so there is exactly one
 * implementation and both paths call it per recipient. Two implementations would drift, and the one
 * that drifted would be the one sending thousands of messages.
 *
 * The native `donot*` flags are honoured as a **necessary** condition. They are Dynamics contact
 * *preferences*, and this module never calls them QDB Collection Contact Hold — that policy does not
 * exist yet (KI-79). `creditonhold` is deliberately **not** consulted: it is a credit state, and
 * there is no evidence it was ever meant to stop communication.
 */
export function evaluateEligibility(
  request: CommunicationRequest,
  context: EligibilityContext,
): CommunicationEligibilityOutcome {
  const refusals: EligibilityRefusal[] = [];

  if (!request.caseId) {
    refusals.push({ code: 'CaseMissing', message: 'A communication must belong to a case.' });
  }
  if (!request.recipient?.id) {
    refusals.push({ code: 'RecipientMissing', message: 'No customer could be resolved for this case.' });
  }
  if (!request.body?.trim()) {
    refusals.push({ code: 'BodyMissing', message: 'There is no message to send.', field: 'body' });
  }

  refusals.push(...channelRefusals(request));
  refusals.push(...contactHoldRefusals(context));

  return refusals.length === 0 ? { eligible: true } : { eligible: false, refusals };
}

/** What each channel needs of its recipient, and which native restriction applies to it. */
function channelRefusals(request: CommunicationRequest): EligibilityRefusal[] {
  const { channel, recipient } = request;
  const refusals: EligibilityRefusal[] = [];
  if (!recipient) return refusals;

  if (channel === 'Email') {
    if (!recipient.email) {
      refusals.push({ code: 'EmailMissing', message: `${recipient.displayName} has no email address on file.`, field: 'recipient' });
    }
    if (recipient.restrictions.doNotEmail) {
      refusals.push({ code: 'ChannelRestricted', message: `${recipient.displayName} is marked "do not email" in CRM.`, field: 'recipient' });
    }
    if (!request.subject?.trim()) {
      refusals.push({ code: 'SubjectMissing', message: 'An email needs a subject.', field: 'subject' });
    }
    return refusals;
  }

  if (!request.messageTable) {
    refusals.push({ code: 'ChannelNotConfigured', message: `${channel} is not configured for this organisation, so nothing was sent.` });
    return refusals;
  }
  if (!recipient.mobile) {
    refusals.push({ code: 'MobileMissing', message: `${recipient.displayName} has no mobile number on file.`, field: 'recipient' });
  }
  // SMS and WhatsApp leave through the configured table, so that table's native restriction governs them.
  const restriction = MESSAGE_TABLE_RESTRICTION[request.messageTable];
  if (recipient.restrictions[restriction.flag]) {
    refusals.push({ code: 'ChannelRestricted', message: `${recipient.displayName} is marked "${restriction.wording}" in CRM, which governs SMS and WhatsApp here.`, field: 'recipient' });
  }
  if (channel === 'WhatsApp' && !request.whatsAppTemplate?.trim()) {
    refusals.push({ code: 'WhatsAppTemplateMissing', message: 'A WhatsApp message needs its registered template name.', field: 'whatsAppTemplate' });
  }
  return refusals;
}

function contactHoldRefusals(context: EligibilityContext): EligibilityRefusal[] {
  const { contactHold, contactHoldPolicy } = context;

  if (contactHold.available) {
    return contactHold.held
      ? [{ code: 'ContactHoldUnverifiable', message: contactHold.reason ?? 'A contact hold applies to this customer.' }]
      : [];
  }
  // No authoritative source. Refusing is the safe direction and the deployment's choice, not this
  // module's — but the message never claims a hold exists, only that none could be checked.
  return contactHoldPolicy === 'refuse-when-unverifiable'
    ? [{
      code: 'ContactHoldUnverifiable',
      message: 'Collection contact rules could not be checked for this customer, so the message was not sent.',
    }]
    : [];
}

// ── The write plan ───────────────────────────────────────────────────────────

/**
 * Canonical field names, translated to `qdb_`/native columns by the service layer.
 *
 * Same separation as Phase 6: the domain names a field, the service knows the column. It is what
 * lets this module be tested with no platform and run unchanged against on-premise.
 */
export interface CommunicationWritePlan {
  /** The native table: the organisation's configured message table, or `email`. */
  entity: MessageTable | 'email';
  fields: Record<string, unknown>;
  binds: { lookup: 'regardingCase'; id: string }[];
  /** The party to attach as the recipient. Native activities use ActivityParty, not a lookup. */
  recipientParty: { table: 'contact' | 'account'; id: string };
}

export const CommunicationRequestSchema = z.object({
  channel: z.enum(['SMS', 'WhatsApp', 'Email']),
  caseId: z.string().min(1),
  body: z.string().min(1),
});

/**
 * Plans the native record for one communication.
 *
 * **The field sets are deliberately minimal**, named canonically; the organisation's mapping turns
 * each into its column (BFD Fax: `faxnumber`, `qdb_message_body`…; HL Letter: `vrp_address`, …).
 *
 * | Channel | Canonical fields written |
 * |---|---|
 * | SMS | `recipientNumber`, `messageBody`, `sender` when given |
 * | WhatsApp | those **plus** `language`, `whatsAppTemplate`, `otp` |
 * | Email | native `subject`, `description`, recipient party |
 *
 * Call only after `evaluateEligibility` has passed — it is what guarantees `messageTable` is set.
 */
export function planCommunication(request: CommunicationRequest): CommunicationWritePlan {
  const binds: CommunicationWritePlan['binds'] = [{ lookup: 'regardingCase', id: request.caseId }];
  const recipientParty = { table: request.recipient.table, id: request.recipient.id };

  if (request.channel === 'Email') {
    return {
      entity: 'email',
      fields: {
        subject: request.subject?.trim() ?? '',
        description: request.body.trim(),
      },
      binds,
      recipientParty,
    };
  }

  if (!request.messageTable) {
    throw new Error(`${request.channel} has no configured message table; evaluateEligibility refuses this request.`);
  }
  const isWhatsApp = request.channel === 'WhatsApp';
  return {
    entity: request.messageTable,
    fields: {
      // `subject` is native context rather than part of QDB's send contract; it is what makes the
      // row legible in a timeline and in Communication History.
      subject: subjectFor(request),
      recipientNumber: request.recipient.mobile ?? '',
      messageBody: request.body.trim(),
      ...(request.senderCode !== undefined ? { sender: request.senderCode } : {}),
      // The three WhatsApp-only fields. An SMS row carries none of them; on BFD Fax that absence is
      // the discriminator QDB confirmed, so it is expressed by omission rather than by a flag.
      ...(isWhatsApp && request.language ? { language: request.language } : {}),
      ...(isWhatsApp && request.whatsAppTemplate ? { whatsAppTemplate: request.whatsAppTemplate } : {}),
      ...(isWhatsApp && request.otp ? { otp: request.otp } : {}),
    },
    binds,
    recipientParty,
  };
}

/** A short, human subject for the timeline. Never the message body, which may be long and personal. */
function subjectFor(request: CommunicationRequest): string {
  return `${request.channel} to ${request.recipient.displayName}`;
}
