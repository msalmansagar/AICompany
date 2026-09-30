import { CrmApiError, type DataverseClient } from '@dcp/dataverse-client';
import {
  ACTIVITY_ORIGIN_CODES, ACTIVITY_STATE_CODES, ACTIVITY_STATUS_CODES, EXTERNAL_PROCESS_HOSTS, EXTERNAL_PROCESS_RECORD_TYPES,
  isConcernTypeCode, type ExternalProcess,
} from '@dcp/domain';
import { ACTIVITY, ORGANIZATION_CODE_VALUES } from '../collection/qdbBindings.js';
import { ComplaintAccessError, ComplaintConfigurationError } from './ComplaintErrors.js';

/**
 * The Collection Activity that records a hand-off to a centralised process, written in the
 * organisation that holds the Collection Case, as the signed-in user.
 *
 * Its lifecycle is the activity's own — no second status model:
 *   In Progress — requested; the reference names the process and organisation, no record yet;
 *   Completed   — the record exists; the reference carries its id and number;
 *   Cancelled   — the owning module refused it; nothing was created.
 * A timeout leaves it In Progress, and the retry of the same submission completes it.
 */
export type HandOffState = 'requested' | 'completed' | 'cancelled';

const ACTIVITIES = 'qdb_collectionactivities';
const SUBJECTS: Readonly<Record<ExternalProcess, string>> = {
  Complaint: 'Complaint raised in Case Management',
  Legal: 'Legal hand-off to the Legal module',
};

/** The one active activity type whose code marks a concern (KI-118); none or several refuses. */
export async function resolveConcernTypeId(client: DataverseClient): Promise<string> {
  const types = await client.getList<{ qdb_collectionactivitytypeid: string; qdb_code?: string }>('qdb_collectionactivitytypes', {
    select: ['qdb_collectionactivitytypeid', 'qdb_code'], filter: 'qdb_isactive eq true',
  });
  const concern = types.value.filter(type => isConcernTypeCode(type.qdb_code));
  if (concern.length !== 1) {
    throw new ComplaintConfigurationError(`Expected one active complaint/dispute activity type, found ${concern.length}`);
  }
  return concern[0]!.qdb_collectionactivitytypeid;
}

export interface OpenHandOff {
  activityId: string;
  collectionCaseId: string;
  activityTypeId: string;
  process: ExternalProcess;
  userId: string;
  now: Date;
}

/** Records the request, create-only. Returns the state of the activity that now exists. */
export async function openHandOff(client: DataverseClient, handOff: OpenHandOff): Promise<HandOffState> {
  const outcome = await client.createWithId(ACTIVITIES, handOff.activityId, {
    [ACTIVITY.subject]: SUBJECTS[handOff.process],
    [ACTIVITY.activityDate]: handOff.now.toISOString(),
    [ACTIVITY.origin]: ACTIVITY_ORIGIN_CODES.Manual,
    [ACTIVITY.statusCode]: ACTIVITY_STATUS_CODES.InProgress,
    [ACTIVITY.relatedRecordType]: EXTERNAL_PROCESS_RECORD_TYPES[handOff.process],
    [ACTIVITY.relatedRecordOrganization]: ORGANIZATION_CODE_VALUES[EXTERNAL_PROCESS_HOSTS[handOff.process]],
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${handOff.collectionCaseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${handOff.activityTypeId})`,
  }, { callerId: handOff.userId }).catch(refusedAsAccess);
  return outcome === 'created' ? 'requested' : readHandOffState(client, handOff.activityId, handOff.userId);
}

async function readHandOffState(client: DataverseClient, activityId: string, userId: string): Promise<HandOffState> {
  const row = await client.getById<Record<string, unknown>>(ACTIVITIES, activityId, { select: [ACTIVITY.stateCode] }, { callerId: userId });
  if (row[ACTIVITY.stateCode] === ACTIVITY_STATE_CODES.Completed) return 'completed';
  if (row[ACTIVITY.stateCode] === ACTIVITY_STATE_CODES.Cancelled) return 'cancelled';
  return 'requested';
}

/** Records the created record's identity and closes the request. */
export async function completeHandOff(
  client: DataverseClient,
  activityId: string,
  record: { recordId: string; recordNumber?: string; userId: string },
): Promise<void> {
  await client.update(ACTIVITIES, activityId, {
    [ACTIVITY.relatedRecordId]: record.recordId,
    ...(record.recordNumber ? { [ACTIVITY.relatedRecordNumber]: record.recordNumber } : {}),
    [ACTIVITY.stateCode]: ACTIVITY_STATE_CODES.Completed,
    [ACTIVITY.statusCode]: ACTIVITY_STATUS_CODES.Completed,
  }, { callerId: record.userId });
}

/** Closes a request the owning module refused, so DCP never shows it as pending or created. */
export async function cancelHandOff(client: DataverseClient, activityId: string, userId: string): Promise<void> {
  await client.update(ACTIVITIES, activityId, {
    [ACTIVITY.stateCode]: ACTIVITY_STATE_CODES.Cancelled,
    [ACTIVITY.statusCode]: ACTIVITY_STATUS_CODES.Cancelled,
  }, { callerId: userId });
}

function refusedAsAccess(error: unknown): never {
  if (error instanceof CrmApiError && error.httpStatus === 403) {
    throw new ComplaintAccessError('HL CRM does not allow this user to record an action on the Collection Case');
  }
  throw error;
}
