import { describe, expect, it } from 'vitest';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  assemble, channelOfMessage, historyColumnsFor, historyRoutes, resolveMessagingConfiguration, routeFor,
} from '../data/messagingConfiguration.js';
import {
  communicationMappings, configurationRow, FAX_COLUMN_MAP, FAX_MESSAGING, LETTER_CHANNEL_VALUES, LETTER_COLUMN_MAP,
  LETTER_MESSAGING, TYPED_LETTER_MESSAGING,
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
      adapterReturning([configurationRow('cfg-hl', 'letter', null)], communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP)), 'HL');
    expect([messaging.sms?.entitySet, messaging.sms?.columns.recipientNumber, messaging.sms?.columns.messageBody, messaging.sms?.regardingToCase, messaging.whatsApp])
      .toEqual(['letters', 'vrp_address', 'vrp_descriptions', 'regardingobjectid_qdb_collectioncase_letter', undefined]);
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
    expect(historyRoutes(TYPED_LETTER_MESSAGING).map(route => route.table)).toEqual(['letter']);
  });

  it('historyColumnsFor_SharedLetterWithChannelType_ReadsTheMarkerColumn', () => {
    expect(historyColumnsFor(TYPED_LETTER_MESSAGING, TYPED_LETTER_MESSAGING.sms!)).toContain('vrp_type');
  });
});

describe('a WhatsApp that would be indistinguishable from SMS', () => {
  it('assemble_SharedLetterWithNoChannelMarker_LeavesWhatsAppUnavailable', () => {
    expect([LETTER_MESSAGING.sms?.table, LETTER_MESSAGING.whatsApp, LETTER_MESSAGING.problems[0]])
      .toEqual(['letter', undefined, expect.stringContaining('nothing marks which is which')]);
  });

  it('assemble_SharedLetterWithChannelType_EnablesWhatsAppWithItsMarker', () => {
    expect(TYPED_LETTER_MESSAGING.whatsApp?.channelMarker).toEqual({ column: 'vrp_type', value: LETTER_CHANNEL_VALUES.WhatsApp });
  });

  it('assemble_SharedLetterWithChannelType_MarksSmsToo', () => {
    expect(TYPED_LETTER_MESSAGING.sms?.channelMarker).toEqual({ column: 'vrp_type', value: LETTER_CHANNEL_VALUES.SMS });
  });

  it('assemble_ChannelTypeMappedButNoValues_LeavesWhatsAppUnavailable', () => {
    const messaging = assemble('HL', configurationRow('cfg-hl', 'letter', 'letter'),
      communicationMappings('cfg-hl', 'letter', { ...LETTER_COLUMN_MAP, channelType: 'vrp_type' }));
    expect(messaging.whatsApp).toBeUndefined();
  });

  it('assemble_UnreadableFeatureFlags_LeavesWhatsAppUnavailable', () => {
    const messaging = assemble('HL', { ...configurationRow('cfg-hl', 'letter', 'letter'), qdb_featureflags: '{not json' },
      communicationMappings('cfg-hl', 'letter', { ...LETTER_COLUMN_MAP, channelType: 'vrp_type' }));
    expect(messaging.whatsApp).toBeUndefined();
  });

  it('assemble_UnreadableFeatureFlags_SaysSo', () => {
    const messaging = assemble('HL', { ...configurationRow('cfg-hl', 'letter', null), qdb_featureflags: '{not json' },
      communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP));
    expect(messaging.problems[0]).toContain('not readable JSON');
  });

  it('assemble_FaxWithWhatsAppTemplate_KeepsWhatsAppAvailable', () => {
    expect(FAX_MESSAGING.whatsApp?.table).toBe('fax');
  });
});

describe('channelOfMessage', () => {
  it('channelOfMessage_FaxWithWhatsAppTemplate_IsWhatsApp', () => {
    expect(channelOfMessage(FAX_MESSAGING, FAX_MESSAGING.sms!, { qdb_whatsapptemplate: 'reminder' })).toBe('WhatsApp');
  });

  it('channelOfMessage_FaxWithoutTemplate_IsSms', () => {
    expect(channelOfMessage(FAX_MESSAGING, FAX_MESSAGING.sms!, {})).toBe('SMS');
  });

  it('channelOfMessage_SharedLetterWithNoMarker_IsSms', () => {
    // Nothing marks a WhatsApp letter, so WhatsApp is not enabled and every letter is an SMS.
    expect(channelOfMessage(LETTER_MESSAGING, LETTER_MESSAGING.sms!, {})).toBe('SMS');
  });

  it('channelOfMessage_LetterMarkedWhatsApp_IsWhatsApp', () => {
    expect(channelOfMessage(TYPED_LETTER_MESSAGING, TYPED_LETTER_MESSAGING.sms!, { vrp_type: LETTER_CHANNEL_VALUES.WhatsApp })).toBe('WhatsApp');
  });

  it('channelOfMessage_LetterMarkedSms_IsSms', () => {
    expect(channelOfMessage(TYPED_LETTER_MESSAGING, TYPED_LETTER_MESSAGING.sms!, { vrp_type: LETTER_CHANNEL_VALUES.SMS })).toBe('SMS');
  });

  it('channelOfMessage_LetterWrittenBeforeTheMarker_IsSms', () => {
    expect(channelOfMessage(TYPED_LETTER_MESSAGING, TYPED_LETTER_MESSAGING.sms!, { vrp_type: null })).toBe('SMS');
  });

  it('channelOfMessage_LetterWithAnUnconfiguredValue_SaysItCannotTell', () => {
    expect(channelOfMessage(TYPED_LETTER_MESSAGING, TYPED_LETTER_MESSAGING.sms!, { vrp_type: 42 })).toBe('SMS or WhatsApp');
  });

  it('channelOfMessage_TableCarryingOnlySms_IsSms', () => {
    const smsOnly = assemble('HL', configurationRow('cfg-hl', 'letter', null), communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP));
    expect(channelOfMessage(smsOnly, smsOnly.sms!, {})).toBe('SMS');
  });
});
