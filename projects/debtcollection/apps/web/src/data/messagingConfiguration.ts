import type { CommunicationChannel, MessageTable } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  BUSINESS_OBJECT_CODES, ENTITY_SETS, MESSAGE_BASE_COLUMNS, NAVIGATION_PROPERTIES, ORG_CODES, PARTY_COLLECTIONS,
  PLATFORM_CONFIGURATION_COLUMNS, PLATFORM_MAPPING_COLUMNS,
} from './schema.js';
import { escapeOData } from './collectionQueries.js';
import { describeFailure } from '../platform/errors.js';

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

/**
 * The column that says which channel a row is, and this channel's value in it — HL's `vrp_type` on
 * Letter. Named by a `channelType` mapping; the values come from `qdb_featureflags`, because a
 * mapping row has no column for a value: `{"messageChannelValues": {"SMS": 1, "WhatsApp": 2}}`.
 */
export interface ChannelMarker { column: string; value: string | number }

/** The canonical field a mapping row uses to name the channel-type column. Not a message value. */
export const CHANNEL_TYPE_FIELD = 'channelType';
const CHANNEL_VALUES_FLAG = 'messageChannelValues';

/** Everything needed to write or read one channel's messages in one organisation. */
export interface MessageRoute {
  table: MessageTable;
  entitySet: string;
  partyCollection: string;
  regardingToCase: string;
  columns: Readonly<Partial<Record<MessageField, string>>>;
  /** Written on every message this channel sends, and read back to tell the channels apart. */
  channelMarker?: ChannelMarker;
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
  const { channelValues, problem: flagsProblem } = readChannelValues(organization, configuration);
  const sms = buildRoute({ organization, channel: 'SMS', tableName: configuration['qdb_smsentity'], mappings, channelValues });
  const built = buildRoute({ organization, channel: 'WhatsApp', tableName: configuration['qdb_whatsappentity'], mappings, channelValues });
  const whatsApp = sms.route && built.route ? requireDistinguishable(organization, sms.route, built.route) : built;
  const problems = [flagsProblem, sms.problem, whatsApp.problem].filter((problem): problem is string => problem !== undefined);
  return { organization, ...(sms.route ? { sms: sms.route } : {}), ...(whatsApp.route ? { whatsApp: whatsApp.route } : {}), problems };
}

type Channel = 'SMS' | 'WhatsApp';
interface RouteSource { organization: string; channel: Channel; tableName: unknown; mappings: readonly CrmRow[]; channelValues: ChannelValues }
type BuiltRoute = { route?: MessageRoute; problem?: string };

/** One channel's route, or the reason it has none. */
function buildRoute(source: RouteSource): BuiltRoute {
  const { organization, channel, tableName, mappings } = source;
  const table = String(tableName ?? '').trim().toLowerCase();
  const setting = channel === 'SMS' ? 'qdb_smsentity' : 'qdb_whatsappentity';
  if (!table) return { problem: `${channel} has no table configured for ${organization} (${setting}).` };
  if (!isMessageTable(table)) return { problem: `${channel} is configured to use "${table}" for ${organization}, which this workspace cannot send through (fax or letter).` };
  const columns = columnsFor(table, mappings);
  const missing = REQUIRED_FIELDS.filter(field => !columns[field]);
  if (missing.length > 0) return { problem: `${channel} on ${table} for ${organization} has no Communication mapping for ${missing.join(', ')}.` };
  const channelMarker = markerFor(table, source);
  return { route: { table, ...MESSAGE_TABLES[table], columns, ...(channelMarker ? { channelMarker } : {}) } };
}

/**
 * WhatsApp sharing SMS's table is only usable when something on the row says which it is: a channel
 * marker, or a WhatsApp template column. Without one, a WhatsApp written by DCP would be read — and
 * delivered — as an SMS, so the channel is unavailable until the organisation configures one.
 */
function requireDistinguishable(organization: string, sms: MessageRoute, whatsApp: MessageRoute): BuiltRoute {
  if (sms.table !== whatsApp.table || whatsApp.channelMarker || whatsApp.columns.whatsAppTemplate) return { route: whatsApp };
  return {
    problem: `WhatsApp shares the ${whatsApp.table} table with SMS for ${organization}, and nothing marks which is which. `
      + `Map ${CHANNEL_TYPE_FIELD} and record its values in ${CHANNEL_VALUES_FLAG}, or map whatsAppTemplate.`,
  };
}

type ChannelValues = Readonly<Partial<Record<Channel, string | number>>>;

/**
 * The channel-type values recorded in the configuration's feature flags. Unreadable flags configure
 * no marker — the channels then fall back to the distinguishability rule — and are reported as a
 * problem, so an administrator can tell a malformed value from an absent one.
 */
function readChannelValues(organization: string, configuration: CrmRow): { channelValues: ChannelValues; problem?: string } {
  const raw = String(configuration['qdb_featureflags'] ?? '').trim();
  if (!raw) return { channelValues: {} };
  try {
    const flags: unknown = JSON.parse(raw);
    const values: unknown = isRecord(flags) ? flags[CHANNEL_VALUES_FLAG] : undefined;
    return { channelValues: isRecord(values) ? { ...channelValue(values, 'SMS'), ...channelValue(values, 'WhatsApp') } : {} };
  } catch (error) {
    return { channelValues: {}, problem: `The feature flags for ${organization} are not readable JSON (${describeFailure(error)}), so no channel values apply.` };
  }
}

function channelValue(values: Record<string, unknown>, channel: Channel): ChannelValues {
  const value = values[channel];
  return typeof value === 'number' || (typeof value === 'string' && value.trim()) ? { [channel]: value } : {};
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The marker for one channel: the mapped channel-type column on this table, and the channel's value. */
function markerFor(table: MessageTable, source: RouteSource): ChannelMarker | undefined {
  const value = source.channelValues[source.channel];
  const row = source.mappings.find(mapping => String(mapping['qdb_canonicalfield'] ?? '').trim() === CHANNEL_TYPE_FIELD
    && String(mapping['qdb_crmentitylogicalname'] ?? '').trim().toLowerCase() === table);
  const column = String(row?.['qdb_crmfieldlogicalname'] ?? '').trim().toLowerCase();
  return column && value !== undefined ? { column, value } : undefined;
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
  const discriminator = sharedTableWhatsApp(messaging, route);
  const column = discriminator?.channelMarker?.column ?? discriminator?.columns.whatsAppTemplate;
  return column ? [...MESSAGE_BASE_COLUMNS, column] : [...MESSAGE_BASE_COLUMNS];
}

/**
 * Which channel a message row is.
 *
 * A table that carries one channel needs no discriminator. When SMS and WhatsApp share one, the
 * channel marker decides (HL's `vrp_type`) — an empty marker is a row written before it existed,
 * when everything on the table was SMS — or else the WhatsApp template column (QDB's Fax
 * convention). A value nobody configured is labelled as unknown rather than guessed.
 */
export function channelOfMessage(messaging: MessagingConfiguration, route: MessageRoute, row: CrmRow): string {
  const carriesSms = messaging.sms?.table === route.table;
  const whatsApp = sharedTableWhatsApp(messaging, route);
  if (carriesSms && !whatsApp) return 'SMS';
  if (!whatsApp) return messaging.whatsApp?.table === route.table ? 'WhatsApp' : 'SMS';
  if (whatsApp.channelMarker) return channelByMarker(whatsApp.channelMarker, messaging.sms?.channelMarker, row);
  return String(row[whatsApp.columns.whatsAppTemplate ?? ''] ?? '').trim() ? 'WhatsApp' : 'SMS';
}

/** The WhatsApp route when it shares this table with SMS; undefined when the table carries one channel. */
function sharedTableWhatsApp(messaging: MessagingConfiguration, route: MessageRoute): MessageRoute | undefined {
  const isShared = messaging.sms?.table === route.table && messaging.whatsApp?.table === route.table;
  return isShared ? messaging.whatsApp : undefined;
}

function channelByMarker(whatsApp: ChannelMarker, sms: ChannelMarker | undefined, row: CrmRow): string {
  const value = String(row[whatsApp.column] ?? '').trim();
  if (value === String(whatsApp.value)) return 'WhatsApp';
  if (!value || value === String(sms?.value ?? '')) return 'SMS';
  return 'SMS or WhatsApp';
}
