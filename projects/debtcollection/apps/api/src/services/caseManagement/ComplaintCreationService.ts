import { CrmApiError, type DataverseClient } from '@dcp/dataverse-client';
import type { UserClaims } from '@dcp/auth-adapters';
import { complaintCaseId, type OrganizationCode } from '@dcp/domain';
import { buildHlComplaintPayload } from './buildHlComplaintPayload.js';
import { resolveCaseManagementReferences } from './CaseManagementReferenceResolver.js';
import { ComplaintAccessError, ComplaintRequestClosedError } from './ComplaintErrors.js';
import { complaintIdFor } from './complaintIdentity.js';
import { resolveCrmUserId } from './CrmUserDirectory.js';
import { externalRecordUrl } from './externalRecordLink.js';
import { cancelHandOff, completeHandOff, openHandOff, resolveConcernTypeId, type HandOffState } from './HandOffActivityWriter.js';
import { readHlComplaintContext } from './HlComplaintContextReader.js';

/** What the officer submits. Every other value is derived here. */
export interface ComplaintCreationRequest {
  collectionCaseId: string;
  requestId: string;
  description: string;
  user: UserClaims;
}

/** The Case Management record as Case Management reports it, and the activity that references it. */
export interface CreatedComplaint {
  targetOrganization: OrganizationCode;
  caseManagementCaseId: string;
  collectionActivityId: string;
  caseNumber?: string;
  status?: string;
  createdOn?: string;
  assignedTo?: string;
  owner?: string;
  openUrl: string;
  /** True when this submission had already created the record (a retry). */
  isRepeatSubmission: boolean;
}

export interface ComplaintCreationDependencies {
  hlClient: DataverseClient;
  caseManagementClient: DataverseClient;
  caseManagementBaseUrl: string;
  nonCustomerAccountId: string;
  now: () => Date;
}

interface PreparedComplaint {
  activityId: string;
  caseId: string;
  hlUserId: string;
  ownerUserId: string;
  activityTypeId: string;
  payload: Record<string, unknown>;
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const PRECONDITION_FAILED = 412;

/**
 * Raises an HL complaint in QDB's existing Case Management and records it on the Collection Case.
 *
 * Order matters and is what keeps DCP truthful:
 *   1. everything is resolved and checked first — users, context, configuration — so a refusal
 *      for a missing manager or product leaves no trace;
 *   2. the Collection Activity records the request (In Progress) in HL CRM;
 *   3. the Case is created in Case Management, create-only, at an id derived from the activity;
 *   4. the activity is completed with the Case's id and number.
 * Every write is create-only or idempotent, so a retry after a timeout finishes whichever step is
 * missing and never duplicates one. DCP never shows a complaint the owning module did not create.
 */
export class ComplaintCreationService {
  constructor(private readonly dependencies: ComplaintCreationDependencies) {}

  /** Creates the complaint, or completes and reports the one this same submission started. */
  async create(request: ComplaintCreationRequest): Promise<CreatedComplaint> {
    const prepared = await this.prepare(request);
    const state = await openHandOff(this.dependencies.hlClient, {
      activityId: prepared.activityId, collectionCaseId: request.collectionCaseId, activityTypeId: prepared.activityTypeId,
      process: 'Complaint', userId: prepared.hlUserId, now: this.dependencies.now(),
    });
    if (state === 'cancelled') throw new ComplaintRequestClosedError();
    const caseExisted = state === 'completed' || await this.insertCase(prepared);
    const complaint = await this.readBack(prepared, isRepeat(state, caseExisted));
    if (state !== 'completed') {
      await completeHandOff(this.dependencies.hlClient, prepared.activityId, {
        recordId: prepared.caseId, userId: prepared.hlUserId, ...(complaint.caseNumber ? { recordNumber: complaint.caseNumber } : {}),
      });
    }
    return complaint;
  }

  /** Resolves and checks everything before the first write. */
  private async prepare(request: ComplaintCreationRequest): Promise<PreparedComplaint> {
    const { hlClient, caseManagementClient, nonCustomerAccountId } = this.dependencies;
    const hlUserId = await resolveCrmUserId(hlClient, request.user.email, 'HL CRM');
    const context = await readHlComplaintContext(hlClient, request.collectionCaseId, hlUserId);
    const activityTypeId = await resolveConcernTypeId(hlClient);
    const ownerUserId = await resolveCrmUserId(caseManagementClient, request.user.email, 'Case Management');
    const references = await resolveCaseManagementReferences(caseManagementClient, nonCustomerAccountId);
    const activityId = complaintIdFor({ collectionCaseId: request.collectionCaseId, requestId: request.requestId, userId: request.user.sub });
    const payload = buildHlComplaintPayload({
      ownerUserId, references, context, description: request.description, receivedOn: this.dependencies.now(),
    });
    return { activityId, caseId: complaintCaseId(activityId), hlUserId, ownerUserId, activityTypeId, payload };
  }

  /**
   * Creates the Case as its owner, create-only. Returns true when it already existed (a retry).
   * A definite refusal closes the request so it is never shown as pending; an uncertain failure
   * (network, 5xx) leaves it open for the retry to finish.
   */
  private async insertCase(prepared: PreparedComplaint): Promise<boolean> {
    try {
      const outcome = await this.dependencies.caseManagementClient.createWithId('incidents', prepared.caseId, prepared.payload, { callerId: prepared.ownerUserId });
      return outcome === 'alreadyExists';
    } catch (error) {
      if (!isDefiniteRefusal(error)) throw error;
      await cancelHandOff(this.dependencies.hlClient, prepared.activityId, prepared.hlUserId);
      if (error.httpStatus === 403) throw new ComplaintAccessError('Case Management does not allow this user to create a Case');
      throw error;
    }
  }

  private async readBack(prepared: PreparedComplaint, isRepeatSubmission: boolean): Promise<CreatedComplaint> {
    const row = await this.dependencies.caseManagementClient.getById<Record<string, unknown>>('incidents', prepared.caseId, {
      select: ['ticketnumber', 'statuscode', 'createdon', '_ownerid_value', '_qdb_assigned_to_user_value'],
    }, { callerId: prepared.ownerUserId });
    const text = (key: string) => (typeof row[key] === 'string' && row[key] !== '' ? String(row[key]) : undefined);
    return {
      targetOrganization: 'BFD',
      caseManagementCaseId: prepared.caseId,
      collectionActivityId: prepared.activityId,
      ...optional('caseNumber', text('ticketnumber')),
      ...optional('status', text(`statuscode${FORMATTED}`)),
      ...optional('createdOn', text('createdon')),
      ...optional('assignedTo', text(`_qdb_assigned_to_user_value${FORMATTED}`)),
      ...optional('owner', text(`_ownerid_value${FORMATTED}`)),
      openUrl: externalRecordUrl(this.dependencies.caseManagementBaseUrl, 'incident', prepared.caseId),
      isRepeatSubmission,
    };
  }
}

function isRepeat(state: HandOffState, caseExisted: boolean): boolean {
  return state === 'completed' || caseExisted;
}

/** A 4xx answer is the platform's decision and will not change on retry; 412 is handled before. */
function isDefiniteRefusal(error: unknown): error is CrmApiError {
  return error instanceof CrmApiError && error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== PRECONDITION_FAILED;
}

function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
