import type { CommunicationChannel, MessageTable } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  BUSINESS_OBJECT_CODES, ENTITY_SETS, MESSAGE_BASE_COLUMNS, NAVIGATION_PROPERTIES, ORG_CODES, PARTY_COLLECTIONS,
  PLATFORM_CONFIGURATION_COLUMNS, PLATFORM_MAPPING_COLUMNS,
} from './schema.js';
import { escapeOData } from './collectionQueries.js';

/**
 * Which table carries SMS and WhatsApp in an organisation, and which columns hold what.
 *
 * The two organisations model a message differently: BFD / QDB1 writes SMS and WhatsApp as `fax`
 * with QDB's `qdb_` columns, Housing Loan CRM as `letter` with `vrp_address` (mobile) and
 * `vrp_description` (text) — and the cloud sandbox spells the latter `vrp_descriptions`. So nothing
 * here is a constant: `qdb_platformconfiguration.qdb_smsentity` / `qdb_whatsappentity` name the
 * table, and the organisation's `qdb_platformmapping` rows of business object *Communication* name
 * each column. A channel the configuration does not complete is **unavailable**, with the reason —
 * never a fallback to Fax, which is how HL came to read a column it does not have.
 */

/** The canonical message fields a mapping row can name, by `qdb_canonicalfield`. */
export type MessageField = 'recipientNumber' | 'messageBody' | 'sender' | 'language' | 'whatsAppTemplate' | 'otp';
const MESSAGE_FIELDS: readonly MessageField[] = ['recipientNumber', 'messageBody', 'sender', 'language', 'whatsAppTemplate', 'otp'];
const REQUIRED_FIELDS: readonly MessageField[] = ['recipientNumber', 'messageBody'];

/** The platform names of each table a message can travel in — read from metadata, never derived. */
const MESSAGE_TABLES: Readonly<Record<MessageTable, { entitySet: string; partyCollection: string; regardingToCase: string }>> = {
  fax: { entitySet: ENTITY_SETS.fax, partyCollection: PARTY_COLLECTIONS.fax, regardingToCase: NAVIGATION_PROPERTIES.faxToCase },
  letter: { entitySet: ENTITY_SETS.letter, partyCollection: PARTY_COLLECTIONS.letter, regardingToCase: NAVIGATION_PROPERTIES.letterToCase },
};

/** Everything needed to write or read one channel's messages in one organisation. */
export interface MessageRoute {
  table: MessageTable;
  entitySet: string;
  partyCollection: string;
  regardingToCase: string;
  columns: Readonly<Partial<Record<MessageField, string>>>;
}

export interface MessagingConfiguration {
  organization: string;
  sms?: MessageRoute;
  whatsApp?: MessageRoute;
  /** Why a channel is unavailable, in an administrator's words. Empty when both are configured. */
  problems: readonly string[];
}

type CrmRow = Record<string, unknown>;

/**
 * Reads one organisation's messaging configuration.
 *
 * Zero or several active configuration rows leave both channels unavailable — the same rule Contact
 * Hold applies, for the same reason: picking a row would choose a table nobody confirmed.
 */
export async function resolveMessagingConfiguration(adapter: XrmCrmAdapter, organization: string): Promise<MessagingConfiguration> {
  const code = ORG_CODES[organization];
  if (code === undefined) return unavailable(organization, `The case names organisation "${organization}", which has no configuration key.`);
  const rows = await adapter.retrieveMultiple(ENTITY_SETS.platformConfiguration, {
    select: [...PLATFORM_CONFIGURATION_COLUMNS], filter: `qdb_organizationcode eq ${code} and qdb_isactive eq true`, top: 2,
  });
  if (rows.length !== 1) {
    return unavailable(organization, rows.length === 0
      ? `${organization} has no active platform configuration, so SMS and WhatsApp are not configured.`
      : `${organization} has more than one active platform configuration, so it is not clear which messaging tables apply.`);
  }
  const configuration = rows[0]!;
  const mappings = await readCommunicationMappings(adapter, String(configuration['qdb_platformconfigurationid']));
  return assemble(organization, configuration, mappings);
}

/** The configuration's active Communication mappings. A few rows by nature, so not paged. */
async function readCommunicationMappings(adapter: XrmCrmAdapter, configurationId: string): Promise<readonly CrmRow[]> {
  return adapter.retrieveMultiple(ENTITY_SETS.platformMapping, {
    select: [...PLATFORM_MAPPING_COLUMNS],
    filter: `_qdb_platformconfigurationid_value eq ${escapeOData(configurationId)} `
      + `and qdb_businessobject eq ${BUSINESS_OBJECT_CODES.Communication} and qdb_isactive eq true`,
    top: 50,
  });
}

/** Builds both routes from the configuration row and its mappings, collecting every problem. */
export function assemble(organization: string, configuration: CrmRow, mappings: readonly CrmRow[]): MessagingConfiguration {
  const sms = buildRoute({ organization, channel: 'SMS', tableName: configuration['qdb_smsentity'], mappings });
  const whatsApp = buildRoute({ organization, channel: 'WhatsApp', tableName: configuration['qdb_whatsappentity'], mappings });
  const problems = [sms.problem, whatsApp.problem].filter((problem): problem is string => problem !== undefined);
  return { organization, ...(sms.route ? { sms: sms.route } : {}), ...(whatsApp.route ? { whatsApp: whatsApp.route } : {}), problems };
}

interface RouteSource { organization: string; channel: 'SMS' | 'WhatsApp'; tableName: unknown; mappings: readonly CrmRow[] }

/** One channel's route, or the reason it has none. */
function buildRoute(source: RouteSource): { route?: MessageRoute; problem?: string } {
  const { organization, channel, tableName, mappings } = source;
  const table = String(tableName ?? '').trim().toLowerCase();
  const setting = channel === 'SMS' ? 'qdb_smsentity' : 'qdb_whatsappentity';
  if (!table) return { problem: `${channel} has no table configured for ${organization} (${setting}).` };
  if (!isMessageTable(table)) return { problem: `${channel} is configured to use "${table}" for ${organization}, which this workspace cannot send through (fax or letter).` };
  const columns = columnsFor(table, mappings);
  const missing = REQUIRED_FIELDS.filter(field => !columns[field]);
  if (missing.length > 0) return { problem: `${channel} on ${table} for ${organization} has no Communication mapping for ${missing.join(', ')}.` };
  return { route: { table, ...MESSAGE_TABLES[table], columns } };
}

const isMessageTable = (name: string): name is MessageTable => name === 'fax' || name === 'letter';
const isMessageField = (name: string): name is MessageField => (MESSAGE_FIELDS as readonly string[]).includes(name);

/** The canonical-to-column map for one table, from mapping rows naming that table. */
function columnsFor(table: MessageTable, mappings: readonly CrmRow[]): Partial<Record<MessageField, string>> {
  const columns: Partial<Record<MessageField, string>> = {};
  for (const row of mappings) {
    const field = String(row['qdb_canonicalfield'] ?? '').trim();
    const entity = String(row['qdb_crmentitylogicalname'] ?? '').trim().toLowerCase();
    const column = String(row['qdb_crmfieldlogicalname'] ?? '').trim().toLowerCase();
    if (entity === table && column && isMessageField(field)) columns[field] = column;
  }
  return columns;
}

function unavailable(organization: string, problem: string): MessagingConfiguration {
  return { organization, problems: [problem] };
}

/** The route a channel is sent through, or undefined when the organisation has not configured it. */
export function routeFor(messaging: MessagingConfiguration, channel: CommunicationChannel): MessageRoute | undefined {
  if (channel === 'SMS') return messaging.sms;
  if (channel === 'WhatsApp') return messaging.whatsApp;
  return undefined;
}

/** The distinct tables a history must read for this organisation's messages. */
export function historyRoutes(messaging: MessagingConfiguration): readonly MessageRoute[] {
  const routes = [messaging.sms, messaging.whatsApp].filter((route): route is MessageRoute => route !== undefined);
  return routes.filter((route, index) => routes.findIndex(other => other.table === route.table) === index);
}

/** The columns a history reads from a message table: native context plus the channel discriminator. */
export function historyColumnsFor(messaging: MessagingConfiguration, route: MessageRoute): readonly string[] {
  const template = discriminatorOf(messaging, route);
  return template ? [...MESSAGE_BASE_COLUMNS, template] : [...MESSAGE_BASE_COLUMNS];
}

/**
 * Which channel a message row is.
 *
 * When SMS and WhatsApp share a table, the WhatsApp template column tells them apart (QDB's Fax
 * convention). Where the organisation maps no template column, the row cannot be told apart and is
 * labelled as such rather than guessed.
 */
export function channelOfMessage(messaging: MessagingConfiguration, route: MessageRoute, row: CrmRow): string {
  const carriesSms = messaging.sms?.table === route.table;
  const carriesWhatsApp = messaging.whatsApp?.table === route.table;
  if (carriesSms && !carriesWhatsApp) return 'SMS';
  if (carriesWhatsApp && !carriesSms) return 'WhatsApp';
  const template = discriminatorOf(messaging, route);
  if (!template) return 'SMS or WhatsApp';
  return String(row[template] ?? '').trim() ? 'WhatsApp' : 'SMS';
}

function discriminatorOf(messaging: MessagingConfiguration, route: MessageRoute): string | undefined {
  return messaging.whatsApp?.table === route.table ? messaging.whatsApp.columns.whatsAppTemplate : undefined;
}
