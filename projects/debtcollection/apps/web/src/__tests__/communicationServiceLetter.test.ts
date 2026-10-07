import { describe, expect, it } from 'vitest';
import type { CommunicationRequest } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { CommunicationService, RECIPIENT_PARTY_MASK, type SendContext } from '../services/communicationService.js';
import { assemble } from '../data/messagingConfiguration.js';
import {
  communicationMappings, configurationRow, FAX_MESSAGING, LETTER_CHANNEL_VALUES, LETTER_COLUMN_MAP, LETTER_MESSAGING,
  TYPED_LETTER_MESSAGING,
} from './messagingFixtures.js';

/**
 * A Housing Loan SMS is a Letter: written to `letters`, its mobile in `vrp_address`, its text in
 * `vrp_descriptions`, linked to the Collection Case through Letter's own Regarding property, and
 * to the HL contact through Letter's native **To** party. The BFD SMS still lands on Fax.
 */

function recordingAdapter() {
  const creates: { entitySet: string; id: string; payload: Record<string, unknown> }[] = [];
  const parties: { collection: string; body: Record<string, unknown> }[] = [];
  const adapter = {
    async createIdempotent(entitySet: string, id: string, payload: Record<string, unknown>) { creates.push({ entitySet, id, payload }); return { created: true }; },
    async readRelated() { return []; },
    async appendToCollection(collection: string, body: Record<string, unknown>) { parties.push({ collection, body }); },
  } as unknown as XrmCrmAdapter;
  return { adapter, creates, parties };
}

const SMS: CommunicationRequest = {
  channel: 'SMS', caseId: 'case-1', body: 'Your instalment is overdue.',
  recipient: {
    table: 'contact', id: 'contact-1', displayName: 'Aisha', mobile: '+97455501234',
    restrictions: { doNotFax: false, doNotPostalMail: false, doNotEmail: false, doNotPhone: false },
  },
};

const context = (messaging: SendContext['messaging']): SendContext => ({
  contactHold: { available: true, held: false }, contactHoldPolicy: 'refuse-when-unverifiable', messaging,
});

describe('CommunicationService.send — Housing Loan Letter', () => {
  it('send_HousingLoanSms_CreatesALetterWithTheConfiguredColumns', async () => {
    const { adapter, creates } = recordingAdapter();
    await new CommunicationService(adapter).send('act-1', SMS, context(LETTER_MESSAGING));
    expect(creates[0]).toEqual({
      entitySet: 'letters', id: 'act-1',
      payload: {
        subject: 'SMS to Aisha', vrp_address: '+97455501234', vrp_descriptions: 'Your instalment is overdue.',
        'regardingobjectid_qdb_collectioncase_letter@odata.bind': '/qdb_collectioncases(case-1)',
      },
    });
  });

  it('send_HousingLoanSms_AttachesTheContactAsTheLettersToParty', async () => {
    const { adapter, parties } = recordingAdapter();
    await new CommunicationService(adapter).send('act-1', SMS, context(LETTER_MESSAGING));
    expect(parties).toEqual([{
      collection: 'letters(act-1)/letter_activity_parties',
      body: { 'partyid_contact@odata.bind': '/contacts(contact-1)', participationtypemask: RECIPIENT_PARTY_MASK },
    }]);
  });

  it('send_HousingLoanSms_NeverWritesQdbFaxColumns', async () => {
    const { adapter, creates } = recordingAdapter();
    await new CommunicationService(adapter).send('act-1', SMS, context(LETTER_MESSAGING));
    expect(Object.keys(creates[0]!.payload).filter(column => column.startsWith('qdb_') || column === 'faxnumber')).toEqual([]);
  });

  it('send_UnconfiguredOrganisation_RefusesAndWritesNothing', async () => {
    const { adapter, creates } = recordingAdapter();
    const outcome = await new CommunicationService(adapter).send('act-1', SMS, context({ organization: 'HL', problems: ['SMS has no table configured for HL (qdb_smsentity).'] }));
    expect([outcome.status, creates.length]).toEqual(['refused', 0]);
  });
});

describe('CommunicationService.send — the Letter channel marker (vrp_type)', () => {
  const WHATSAPP: CommunicationRequest = { ...SMS, channel: 'WhatsApp', whatsAppTemplate: 'overdue_reminder', language: 'en' };
  const WHATSAPP_READY = assemble(
    'HL',
    { ...configurationRow('cfg-hl', 'letter', 'letter'), qdb_featureflags: JSON.stringify({ messageChannelValues: LETTER_CHANNEL_VALUES }) },
    communicationMappings('cfg-hl', 'letter', { ...LETTER_COLUMN_MAP, channelType: 'vrp_type', whatsAppTemplate: 'vrp_template', language: 'vrp_language' }));

  it('send_SmsWithChannelType_StampsTheSmsValue', async () => {
    const { adapter, creates } = recordingAdapter();
    await new CommunicationService(adapter).send('act-4', SMS, context(TYPED_LETTER_MESSAGING));
    expect(creates[0]!.payload['vrp_type']).toBe(LETTER_CHANNEL_VALUES.SMS);
  });

  it('send_SmsWithoutChannelType_WritesNoMarker', async () => {
    const { adapter, creates } = recordingAdapter();
    await new CommunicationService(adapter).send('act-5', SMS, context(LETTER_MESSAGING));
    expect(creates[0]!.payload).not.toHaveProperty('vrp_type');
  });

  it('send_WhatsAppWhereNothingMarksIt_RefusesAndWritesNothing', async () => {
    const { adapter, creates } = recordingAdapter();
    const outcome = await new CommunicationService(adapter).send('act-6', WHATSAPP, context(LETTER_MESSAGING));
    expect([outcome.status, creates.length]).toEqual(['refused', 0]);
  });

  it('send_WhatsAppWithNoTemplateColumn_RefusesWithTheReason', async () => {
    const { adapter, creates } = recordingAdapter();
    const outcome = await new CommunicationService(adapter).send('act-7', WHATSAPP, context(TYPED_LETTER_MESSAGING));
    expect([outcome, creates.length]).toEqual([
      { status: 'refused', refusals: [expect.objectContaining({ message: expect.stringContaining('whatsAppTemplate') })] }, 0,
    ]);
  });

  it('send_WhatsAppFullyConfigured_StampsTheWhatsAppValue', async () => {
    const { adapter, creates } = recordingAdapter();
    await new CommunicationService(adapter).send('act-8', WHATSAPP, context(WHATSAPP_READY));
    expect([creates[0]!.entitySet, creates[0]!.payload['vrp_type'], creates[0]!.payload['vrp_template']])
      .toEqual(['letters', LETTER_CHANNEL_VALUES.WhatsApp, 'overdue_reminder']);
  });
});

describe('CommunicationService.send — a field with no column', () => {
  it('send_HousingLoanSmsWithSenderButNoSenderMapping_RefusesWithTheReasonAndWritesNothing', async () => {
    const { adapter, creates } = recordingAdapter();
    const outcome = await new CommunicationService(adapter).send('act-3', { ...SMS, senderCode: 100000001 }, context(LETTER_MESSAGING));
    expect([outcome.status, outcome.status === 'refused' ? outcome.refusals[0]!.message : '', creates.length])
      .toEqual(['refused', expect.stringContaining('no letter column mapped for sender'), 0]);
  });
});

describe('CommunicationService.send — BFD Fax', () => {
  it('send_BfdSms_StillCreatesAFaxWithQdbsContract', async () => {
    const { adapter, creates } = recordingAdapter();
    await new CommunicationService(adapter).send('act-2', SMS, context(FAX_MESSAGING));
    expect([creates[0]!.entitySet, creates[0]!.payload['faxnumber'], creates[0]!.payload['qdb_message_body']])
      .toEqual(['faxes', '+97455501234', 'Your instalment is overdue.']);
  });
});
