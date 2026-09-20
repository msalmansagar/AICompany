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

/** Which native entity carries each channel. SMS and WhatsApp share Fax; that is QDB's design. */
export const CHANNEL_ENTITY: Readonly<Record<CommunicationChannel, 'fax' | 'email'>> = {
  SMS: 'fax',
  WhatsApp: 'fax',
  Email: 'email',
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
}

// ── Eligibility ──────────────────────────────────────────────────────────────

export interface EligibilityRefusal {
  code:
    | 'RecipientMissing' | 'MobileMissing' | 'EmailMissing' | 'BodyMissing' | 'SubjectMissing'
    | 'ChannelRestricted' | 'ContactHoldUnverifiable' | 'WhatsAppTemplateMissing' | 'SenderMissing'
    | 'CaseMissing';
  message: string;
  field?: string;
}

export type EligibilityOutcome =
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
): EligibilityOutcome {
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

  // SMS and WhatsApp both leave through the Fax activity, so `donotfax` is the native restriction
  // that governs them. That is a consequence of QDB's design, not a choice made here.
  if (!recipient.mobile) {
    refusals.push({ code: 'MobileMissing', message: `${recipient.displayName} has no mobile number on file.`, field: 'recipient' });
  }
  if (recipient.restrictions.doNotFax) {
    refusals.push({ code: 'ChannelRestricted', message: `${recipient.displayName} is marked "do not fax" in CRM, which governs SMS and WhatsApp.`, field: 'recipient' });
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
  entity: 'fax' | 'email';
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
 * **The field sets are QDB's confirmed contract and are deliberately minimal.**
 *
 * | Channel | Written |
 * |---|---|
 * | SMS | `faxnumber`, `qdb_message_body`, `qdb_sender` |
 * | WhatsApp | those three **plus** `qdb_language`, `qdb_whatsapptemplate`, `qdb_otp` |
 * | Email | native `subject`, `description`, recipient party |
 *
 * `qdb_sms_id`, `qdb_sendernumber`, `qdb_smssendto`, `qdb_message_length` and the recipient lookups
 * exist on Fax and are **not** written: they belong to QDB's own mechanism and to other modules.
 */
export function planCommunication(request: CommunicationRequest): CommunicationWritePlan {
  const entity = CHANNEL_ENTITY[request.channel];
  const binds: CommunicationWritePlan['binds'] = [{ lookup: 'regardingCase', id: request.caseId }];
  const recipientParty = { table: request.recipient.table, id: request.recipient.id };

  if (request.channel === 'Email') {
    return {
      entity,
      fields: {
        subject: request.subject?.trim() ?? '',
        description: request.body.trim(),
      },
      binds,
      recipientParty,
    };
  }

  const isWhatsApp = request.channel === 'WhatsApp';
  return {
    entity,
    fields: {
      // `subject` is native context rather than part of QDB's send contract; it is what makes the
      // row legible in a timeline and in Communication History.
      subject: subjectFor(request),
      faxNumber: request.recipient.mobile ?? '',
      messageBody: request.body.trim(),
      ...(request.senderCode !== undefined ? { sender: request.senderCode } : {}),
      // The three WhatsApp-only fields. An SMS row carries none of them, and that absence is the
      // discriminator QDB confirmed — so it is expressed by omission rather than by a flag.
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
