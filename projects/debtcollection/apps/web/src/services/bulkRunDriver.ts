import type {
  CommunicationRequest, EligibilityContext, TemplateChannel,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { retrieveCase, retrieveCustomer, type CaseDetail } from '../data/caseQueries.js';
import { resolveContactHoldPolicy, type ContactHoldResolution } from '../data/contactHoldPolicy.js';
import { BulkCommunicationService, type CommunicationRun } from './bulkCommunicationService.js';
import { CommunicationService } from './communicationService.js';

/**
 * What the executor needs to know about one recipient, resolved from the organisation.
 *
 * The bulk engine is deliberately ignorant of cases, customers and configuration: it takes a
 * recipient id, asks for a request and an eligibility context, and does the rest. This is the one
 * place that knows a recipient id is a **collection case**, that a case's customer lives in contact
 * or account depending on the organisation, and that Contact Hold resolves by organisation code.
 *
 * **Eligibility is re-evaluated here, at send time.** The population was frozen at confirmation and
 * the world was not: a customer marked "do not fax" since then is refused now. That is why this
 * object is constructed per batch and thrown away — a resolver that outlived its batch would be
 * answering with yesterday's customer.
 */
export class RecipientResolver {
  /**
   * The case just resolved, and nothing older.
   *
   * The executor asks for the request and then the eligibility of the *same* recipient, one after
   * the other. A one-entry memo turns that into a single read without ever holding state across
   * recipients — a map would save more reads and would quietly become a cache of stale customers.
   */
  private memo: { recipientId: string; detail: CaseDetail | null } | null = null;

  /** Contact Hold is a configuration answer per organisation, so it cannot vary within a batch. */
  private readonly holds = new Map<string, ContactHoldResolution>();

  constructor(private readonly adapter: XrmCrmAdapter) {}

  /** Assembles the message for one recipient. `null` means there is nobody to send to. */
  async buildRequest(recipientId: string, run: CommunicationRun): Promise<CommunicationRequest | null> {
    const detail = await this.caseFor(recipientId);
    if (!detail?.customerTable || !detail.customerId) return null;

    const customer = await retrieveCustomer(this.adapter, detail.customerTable, detail.customerId);
    if (!customer?.id) return null;

    return {
      channel: run.channel,
      caseId: recipientId,
      body: run.body,
      ...(run.channel === 'Email' ? { subject: run.subject } : {}),
      recipient: {
        table: customer.table,
        id: customer.id,
        displayName: customer.displayName,
        ...(customer.mobile ? { mobile: customer.mobile } : {}),
        ...(customer.email ? { email: customer.email } : {}),
        restrictions: customer.restrictions,
      },
    };
  }

  /** The eligibility context for one recipient, keyed by its case's own organisation (KI-88). */
  async eligibility(recipientId: string): Promise<EligibilityContext> {
    const detail = await this.caseFor(recipientId);
    const organization = detail?.organization ?? '';
    const hold = await this.holdFor(organization);
    return { contactHold: hold.verdict, contactHoldPolicy: hold.policy };
  }

  private async caseFor(recipientId: string): Promise<CaseDetail | null> {
    if (this.memo?.recipientId === recipientId) return this.memo.detail;
    const detail = await retrieveCase(this.adapter, recipientId);
    this.memo = { recipientId, detail };
    return detail;
  }

  private async holdFor(organization: string): Promise<ContactHoldResolution> {
    const cached = this.holds.get(organization);
    if (cached) return cached;
    const resolved = await resolveContactHoldPolicy(this.adapter, organization);
    this.holds.set(organization, resolved);
    return resolved;
  }
}

/**
 * The logical name and column the executor's capacity refusal is sized against.
 *
 * Read from metadata rather than written down, because the refusal must describe the column that
 * exists. The two names are here so the caller does not have to know them.
 */
export const FROZEN_POPULATION_COLUMN = {
  entity: 'qdb_communicationrun',
  attribute: 'qdb_frozenpopulation',
} as const;

export type BulkServiceOutcome =
  | { status: 'ready'; service: BulkCommunicationService }
  | { status: 'unavailable'; message: string };

const CAPACITY_UNREADABLE =
  'Bulk sending is unavailable on this organisation because its configuration could not be read. '
  + 'Nothing has been started. Report this to your administrator.';

/**
 * Builds the bulk service, or explains why it cannot be built.
 *
 * It refuses rather than guessing a capacity. A guessed ceiling that is too high produces a run
 * whose population is silently cut off at the column boundary, which is a campaign sent to a
 * population nobody chose — the failure this whole design exists to prevent.
 */
export async function createBulkService(adapter: XrmCrmAdapter): Promise<BulkServiceOutcome> {
  // A metadata read can reject as well as answer badly — the platform rejects with a plain object
  // rather than an Error, and the network rejects with neither (KI-90). Both mean the same thing
  // here: the capacity is unknown, so bulk is unavailable.
  const capacity = await adapter
    .readMemoCapacity(FROZEN_POPULATION_COLUMN.entity, FROZEN_POPULATION_COLUMN.attribute)
    .catch(() => null);

  if (capacity === null || capacity <= 0) {
    return { status: 'unavailable', message: CAPACITY_UNREADABLE };
  }

  return {
    status: 'ready',
    service: new BulkCommunicationService(adapter, new CommunicationService(adapter), capacity),
  };
}

/** The channels a bulk run may use. WhatsApp is out of scope for bulk and is not offered. */
export const BULK_CHANNELS: readonly { value: Extract<TemplateChannel, 'SMS' | 'Email'>; label: string }[] = [
  { value: 'SMS', label: 'SMS' },
  { value: 'Email', label: 'Email' },
];
