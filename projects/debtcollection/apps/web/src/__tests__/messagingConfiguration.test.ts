import { describe, expect, it } from 'vitest';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  assemble, channelOfMessage, historyRoutes, resolveMessagingConfiguration, routeFor,
} from '../data/messagingConfiguration.js';
import {
  communicationMappings, configurationRow, FAX_COLUMN_MAP, FAX_MESSAGING, LETTER_COLUMN_MAP, LETTER_MESSAGING,
} from './messagingFixtures.js';

/**
 * Which table carries SMS / WhatsApp, read from each organisation's configuration.
 *
 * The rule under test: nothing defaults to Fax. A missing, ambiguous or incomplete configuration
 * leaves the channel unavailable with a reason an administrator can act on.
 */

function adapterReturning(configurations: Record<string, unknown>[], mappings: Record<string, unknown>[]): XrmCrmAdapter {
  return {
    async retrieveMultiple(entitySet: string) {
      return entitySet === 'qdb_platformconfigurations' ? configurations : mappings;
    },
  } as unknown as XrmCrmAdapter;
}

describe('resolveMessagingConfiguration', () => {
  it('resolveMessagingConfiguration_HousingLoanLetter_RoutesSmsToLetterColumns', async () => {
    const messaging = await resolveMessagingConfiguration(
      adapterReturning([configurationRow('cfg-hl', 'letter', 'letter')], communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP)), 'HL');
    expect([messaging.sms?.entitySet, messaging.sms?.columns.recipientNumber, messaging.sms?.columns.messageBody, messaging.sms?.regardingToCase, messaging.problems])
      .toEqual(['letters', 'vrp_address', 'vrp_descriptions', 'regardingobjectid_qdb_collectioncase_letter', []]);
  });

  it('resolveMessagingConfiguration_NoActiveConfiguration_LeavesBothChannelsUnavailable', async () => {
    const messaging = await resolveMessagingConfiguration(adapterReturning([], []), 'HL');
    expect([messaging.sms, messaging.whatsApp, messaging.problems.length]).toEqual([undefined, undefined, 1]);
  });

  it('resolveMessagingConfiguration_TwoActiveConfigurations_RefusesToPick', async () => {
    const messaging = await resolveMessagingConfiguration(adapterReturning([configurationRow('a', 'fax', 'fax'), configurationRow('b', 'letter', 'letter')], []), 'BFD');
    expect([messaging.sms, messaging.problems[0]]).toEqual([undefined, expect.stringContaining('more than one active platform configuration')]);
  });

  it('resolveMessagingConfiguration_UnknownOrganisation_IsUnavailableWithoutReading', async () => {
    const messaging = await resolveMessagingConfiguration({} as XrmCrmAdapter, 'XYZ');
    expect(messaging.problems[0]).toContain('no configuration key');
  });
});

describe('assemble', () => {
  it('assemble_NoSmsTable_NeverFallsBackToFax', () => {
    const messaging = assemble('HL', configurationRow('cfg-hl', null, null), communicationMappings('cfg-hl', 'fax', FAX_COLUMN_MAP));
    expect([messaging.sms, messaging.problems[0]]).toEqual([undefined, expect.stringContaining('qdb_smsentity')]);
  });

  it('assemble_TableTheWorkspaceCannotSendThrough_IsUnavailable', () => {
    const messaging = assemble('HL', configurationRow('cfg-hl', 'phonecall', null), []);
    expect(messaging.problems[0]).toContain('"phonecall"');
  });

  it('assemble_LetterWithoutAMessageBodyMapping_IsUnavailable', () => {
    const messaging = assemble('HL', configurationRow('cfg-hl', 'letter', null), communicationMappings('cfg-hl', 'letter', { recipientNumber: 'vrp_address' }));
    expect([messaging.sms, messaging.problems[0]]).toEqual([undefined, expect.stringContaining('messageBody')]);
  });

  it('assemble_MappingForAnotherTable_IsNotUsed', () => {
    // A Fax mapping says nothing about Letter columns.
    const messaging = assemble('HL', configurationRow('cfg-hl', 'letter', null), communicationMappings('cfg-hl', 'fax', FAX_COLUMN_MAP));
    expect(messaging.sms).toBeUndefined();
  });
});

describe('routeFor and historyRoutes', () => {
  it('routeFor_Email_HasNoMessageRoute', () => {
    expect(routeFor(FAX_MESSAGING, 'Email')).toBeUndefined();
  });

  it('historyRoutes_SmsAndWhatsAppShareATable_ReadsItOnce', () => {
    expect(historyRoutes(LETTER_MESSAGING).map(route => route.table)).toEqual(['letter']);
  });
});

describe('channelOfMessage', () => {
  it('channelOfMessage_FaxWithWhatsAppTemplate_IsWhatsApp', () => {
    expect(channelOfMessage(FAX_MESSAGING, FAX_MESSAGING.sms!, { qdb_whatsapptemplate: 'reminder' })).toBe('WhatsApp');
  });

  it('channelOfMessage_FaxWithoutTemplate_IsSms', () => {
    expect(channelOfMessage(FAX_MESSAGING, FAX_MESSAGING.sms!, {})).toBe('SMS');
  });

  it('channelOfMessage_SharedLetterWithNoDiscriminator_SaysItCannotTell', () => {
    // Housing Loan maps no WhatsApp template column, so an SMS and a WhatsApp letter look alike.
    expect(channelOfMessage(LETTER_MESSAGING, LETTER_MESSAGING.sms!, {})).toBe('SMS or WhatsApp');
  });

  it('channelOfMessage_TableCarryingOnlySms_IsSms', () => {
    const smsOnly = assemble('HL', configurationRow('cfg-hl', 'letter', null), communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP));
    expect(channelOfMessage(smsOnly, smsOnly.sms!, {})).toBe('SMS');
  });
});
