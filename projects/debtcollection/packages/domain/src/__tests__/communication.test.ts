import { describe, expect, it } from 'vitest';
import {
  evaluateEligibility, planCommunication,
  type CommunicationRequest, type EligibilityContext,
} from '../communication.js';

/**
 * Where an SMS goes is the organisation's configuration, never this module's assumption.
 *
 * BFD / QDB1 sends SMS and WhatsApp as Fax; Housing Loan CRM as Letter. The request carries the
 * configured table; without one the message is refused, and the native "do not" preference that
 * governs it is the one of the table it leaves through.
 */

const CLEAR: EligibilityContext = { contactHold: { available: true, held: false }, contactHoldPolicy: 'refuse-when-unverifiable' };

const request = (overrides: Partial<CommunicationRequest> = {}): CommunicationRequest => ({
  channel: 'SMS',
  caseId: 'case-1',
  body: 'Your instalment is overdue.',
  recipient: {
    table: 'contact', id: 'contact-1', displayName: 'Aisha', mobile: '+97455501234',
    restrictions: { doNotFax: false, doNotPostalMail: false, doNotEmail: false, doNotPhone: false },
  },
  messageTable: 'letter',
  ...overrides,
});

const refusalCodes = (outcome: ReturnType<typeof evaluateEligibility>) => (outcome.eligible ? [] : outcome.refusals.map(r => r.code));
const restricted = (flags: Partial<CommunicationRequest['recipient']['restrictions']>) =>
  ({ ...request().recipient, restrictions: { ...request().recipient.restrictions, ...flags } });

describe('evaluateEligibility — the configured message table', () => {
  it('evaluateEligibility_SmsWithNoConfiguredTable_IsRefusedAsNotConfigured', () => {
    const { messageTable: _omitted, ...unconfigured } = request();
    expect(refusalCodes(evaluateEligibility(unconfigured, CLEAR))).toEqual(['ChannelNotConfigured']);
  });

  it('evaluateEligibility_LetterRecipientMarkedDoNotPostalMail_IsRestricted', () => {
    expect(refusalCodes(evaluateEligibility(request({ recipient: restricted({ doNotPostalMail: true }) }), CLEAR))).toEqual(['ChannelRestricted']);
  });

  it('evaluateEligibility_LetterRecipientMarkedOnlyDoNotFax_IsNotRestricted', () => {
    // On Housing Loan the SMS is a Letter, so "do not fax" is not the preference that governs it.
    expect(evaluateEligibility(request({ recipient: restricted({ doNotFax: true }) }), CLEAR).eligible).toBe(true);
  });

  it('evaluateEligibility_FaxRecipientMarkedDoNotFax_IsRestricted', () => {
    expect(refusalCodes(evaluateEligibility(request({ messageTable: 'fax', recipient: restricted({ doNotFax: true }) }), CLEAR))).toEqual(['ChannelRestricted']);
  });

  it('evaluateEligibility_EmailWithNoMessageTable_IsUnaffected', () => {
    const { messageTable: _omitted, ...email } = request({ channel: 'Email', subject: 'Overdue', recipient: { ...request().recipient, email: 'a@example.test' } });
    expect(evaluateEligibility(email, CLEAR).eligible).toBe(true);
  });
});

describe('planCommunication — the native record', () => {
  it('planCommunication_HousingLoanSms_WritesALetterWithCanonicalFields', () => {
    const plan = planCommunication(request());
    expect([plan.entity, plan.fields['recipientNumber'], plan.fields['messageBody']]).toEqual(['letter', '+97455501234', 'Your instalment is overdue.']);
  });

  it('planCommunication_BfdSms_WritesAFax', () => {
    expect(planCommunication(request({ messageTable: 'fax' })).entity).toBe('fax');
  });

  it('planCommunication_SmsWithNoTable_Throws', () => {
    const { messageTable: _omitted, ...unconfigured } = request();
    expect(() => planCommunication(unconfigured)).toThrow(/no configured message table/);
  });

  it('planCommunication_Email_WritesAnEmailWhateverTheMessageTable', () => {
    expect(planCommunication(request({ channel: 'Email', subject: 'Overdue' })).entity).toBe('email');
  });
});
