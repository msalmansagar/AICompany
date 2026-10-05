import { assemble, type MessagingConfiguration } from '../data/messagingConfiguration.js';
import { BUSINESS_OBJECT_CODES } from '../data/schema.js';

/**
 * The two organisations' messaging configuration, as rows, for tests.
 *
 * Built through `assemble` — the same function that reads the organisation — so a test exercises
 * the real mapping rules rather than a hand-made route. BFD writes SMS and WhatsApp as Fax with
 * QDB's confirmed `qdb_` columns; Housing Loan writes them as Letter with `vrp_address` and
 * `vrp_descriptions` (the cloud sandbox's spelling).
 */
export const FAX_COLUMN_MAP = {
  recipientNumber: 'faxnumber', messageBody: 'qdb_message_body', sender: 'qdb_sender',
  language: 'qdb_language', whatsAppTemplate: 'qdb_whatsapptemplate', otp: 'qdb_otp',
} as const;

export const LETTER_COLUMN_MAP = { recipientNumber: 'vrp_address', messageBody: 'vrp_descriptions' } as const;

/** A platform configuration row naming the message tables. */
export function configurationRow(id: string, smsTable: string | null, whatsAppTable: string | null): Record<string, unknown> {
  return { qdb_platformconfigurationid: id, qdb_smsentity: smsTable, qdb_whatsappentity: whatsAppTable, qdb_isactive: true };
}

/** Communication mapping rows for one table, under one configuration. */
export function communicationMappings(configurationId: string, table: string, columns: Readonly<Record<string, string>>): Record<string, unknown>[] {
  return Object.entries(columns).map(([field, column]) => ({
    qdb_platformmappingid: `${configurationId}-${field}`,
    qdb_canonicalfield: field,
    qdb_crmentitylogicalname: table,
    qdb_crmfieldlogicalname: column,
    qdb_businessobject: BUSINESS_OBJECT_CODES.Communication,
    qdb_isactive: true,
    _qdb_platformconfigurationid_value: configurationId,
  }));
}

export const FAX_MESSAGING: MessagingConfiguration = assemble(
  'BFD', configurationRow('cfg-bfd', 'fax', 'fax'), communicationMappings('cfg-bfd', 'fax', FAX_COLUMN_MAP));

export const LETTER_MESSAGING: MessagingConfiguration = assemble(
  'HL', configurationRow('cfg-hl', 'letter', 'letter'), communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP));
