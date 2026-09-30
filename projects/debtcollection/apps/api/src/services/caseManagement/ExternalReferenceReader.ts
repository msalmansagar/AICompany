import { CrmApiError, type DataverseClient } from '@dcp/dataverse-client';
import { EXTERNAL_PROCESS_RECORD_TYPES, type ExternalProcess, type OrganizationCode } from '@dcp/domain';
import { ComplaintConfigurationError } from './ComplaintErrors.js';
import { resolveCrmUserId } from './CrmUserDirectory.js';
import { externalRecordUrl } from './externalRecordLink.js';

/** What a Collection Activity's reference names. */
export interface ReferenceQuery {
  process: ExternalProcess;
  organization: OrganizationCode;
  recordId: string;
}

/** The owning module's current summary of one record — read, never stored by DCP. */
export interface ExternalRecordSummary extends ReferenceQuery {
  availability: 'found' | 'notFound' | 'forbidden';
  recordNumber?: string;
  status?: string;
  statusReason?: string;
  owner?: string;
  assignedTo?: string;
  createdOn?: string;
  modifiedOn?: string;
  openUrl: string;
}

/** One organisation DCP can read references from: its client and the base URL links are built on. */
export interface ReferenceOrganisation {
  client: DataverseClient;
  baseUrl: string;
}

/**
 * The columns each process is summarised from. Complaint: Case Management's own case number and
 * assignee. Legal: the Legal record's name, which is how the Legal module and the Phase 9 queue
 * already identify a litigation request; no other Legal field is assumed.
 */
const SUMMARY_COLUMNS: Readonly<Record<ExternalProcess, { number: string; extra: readonly string[] }>> = {
  Complaint: { number: 'ticketnumber', extra: ['_qdb_assigned_to_user_value'] },
  Legal: { number: 'qdb_name', extra: [] },
};
const COMMON_COLUMNS = ['statecode', 'statuscode', '_ownerid_value', 'createdon', 'modifiedon'];
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

/**
 * Summarises references for one signed-in user. Each is read in its own organisation **as that
 * user**, so the owning module's security decides what DCP may show: a refused read comes back as
 * `forbidden`, a missing record as `notFound` — never as an error that hides the rest of the page.
 */
export async function summariseReferences(
  organisations: Readonly<Partial<Record<OrganizationCode, ReferenceOrganisation>>>,
  queries: readonly ReferenceQuery[],
  email: string | undefined,
): Promise<ExternalRecordSummary[]> {
  const userIds = new Map<OrganizationCode, string>();
  const summaries: ExternalRecordSummary[] = [];
  for (const query of queries) {
    const organisation = organisations[query.organization];
    if (!organisation) throw new ComplaintConfigurationError(`Organisation ${query.organization} is not configured in this deployment`);
    if (!userIds.has(query.organization)) userIds.set(query.organization, await resolveCrmUserId(organisation.client, email, query.organization));
    summaries.push(await summarise(organisation, query, userIds.get(query.organization)!));
  }
  return summaries;
}

async function summarise(organisation: ReferenceOrganisation, query: ReferenceQuery, userId: string): Promise<ExternalRecordSummary> {
  const recordType = EXTERNAL_PROCESS_RECORD_TYPES[query.process];
  const columns = SUMMARY_COLUMNS[query.process];
  const base = { ...query, openUrl: externalRecordUrl(organisation.baseUrl, recordType, query.recordId) };
  try {
    const row = await organisation.client.getById<Record<string, unknown>>(`${entitySetOf(recordType)}`, query.recordId, {
      select: [columns.number, ...columns.extra, ...COMMON_COLUMNS],
    }, { callerId: userId });
    return { ...base, availability: 'found', ...describe(row, columns.number) };
  } catch (error) {
    if (error instanceof CrmApiError && error.httpStatus === 404) return { ...base, availability: 'notFound' };
    if (error instanceof CrmApiError && error.httpStatus === 403) return { ...base, availability: 'forbidden' };
    throw error;
  }
}

function describe(row: Record<string, unknown>, numberColumn: string): Partial<ExternalRecordSummary> {
  const text = (key: string) => (typeof row[key] === 'string' && row[key] !== '' ? String(row[key]) : undefined);
  const entries: Array<[keyof ExternalRecordSummary, string | undefined]> = [
    ['recordNumber', text(numberColumn)],
    ['status', text(`statecode${FORMATTED}`)],
    ['statusReason', text(`statuscode${FORMATTED}`)],
    ['owner', text(`_ownerid_value${FORMATTED}`)],
    ['assignedTo', text(`_qdb_assigned_to_user_value${FORMATTED}`)],
    ['createdOn', text('createdon')],
    ['modifiedOn', text('modifiedon')],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

/** Entity set names of the two process tables (platform pluralisation, identical on 9.1 and cloud). */
function entitySetOf(recordType: string): string {
  return recordType === 'incident' ? 'incidents' : `${recordType}s`;
}
