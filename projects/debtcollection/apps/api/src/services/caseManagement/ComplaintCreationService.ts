import { CrmApiError, type DataverseClient } from '@dcp/dataverse-client';
import type { UserClaims } from '@dcp/auth-adapters';
import { buildHlComplaintPayload } from './buildHlComplaintPayload.js';
import { resolveCaseManagementReferences } from './CaseManagementReferenceResolver.js';
import { ComplaintAccessError } from './ComplaintErrors.js';
import { complaintIdFor } from './complaintIdentity.js';
import { resolveCrmUserId } from './CrmUserDirectory.js';
import { readHlComplaintContext } from './HlComplaintContextReader.js';

/** What the officer submits. Every other value is derived here. */
export interface ComplaintCreationRequest {
  collectionCaseId: string;
  requestId: string;
  description: string;
  user: UserClaims;
}

/** The Case Management record as Case Management reports it after creation. */
export interface CreatedComplaint {
  caseManagementCaseId: string;
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

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

/**
 * Raises an HL complaint in QDB's existing Case Management and reports the record it created.
 *
 * HL CRM decides whether the user may see the Collection Case; Case Management decides whether the
 * user may create the complaint — both by acting as that user. Case Management's own workflows,
 * business process flow and assignment run exactly as they do for any other Case. Nothing is
 * written back to HL CRM, so a failure here cannot leave the Collection Case half-changed.
 */
export class ComplaintCreationService {
  constructor(private readonly dependencies: ComplaintCreationDependencies) {}

  /** Creates the complaint, or finds the one this same submission already created. */
  async create(request: ComplaintCreationRequest): Promise<CreatedComplaint> {
    const { hlClient, caseManagementClient, nonCustomerAccountId } = this.dependencies;
    const hlUserId = await resolveCrmUserId(hlClient, request.user.email, 'HL CRM');
    const context = await readHlComplaintContext(hlClient, request.collectionCaseId, hlUserId);
    const ownerUserId = await resolveCrmUserId(caseManagementClient, request.user.email, 'Case Management');
    const references = await resolveCaseManagementReferences(caseManagementClient, nonCustomerAccountId);
    const complaintId = complaintIdFor({ collectionCaseId: request.collectionCaseId, requestId: request.requestId, userId: request.user.sub });
    const payload = buildHlComplaintPayload({
      ownerUserId, references, context, description: request.description, receivedOn: this.dependencies.now(),
    });
    const isRepeatSubmission = await this.insert(complaintId, payload, ownerUserId);
    return this.readBack(complaintId, ownerUserId, isRepeatSubmission);
  }

  /**
   * Creates as the owner, create-only: the platform refuses a second record under the same id with
   * 412, which is how a retried submission is recognised. Returns true for that retry.
   */
  private async insert(complaintId: string, payload: Record<string, unknown>, ownerUserId: string): Promise<boolean> {
    try {
      const outcome = await this.dependencies.caseManagementClient.createWithId('incidents', complaintId, payload, { callerId: ownerUserId });
      return outcome === 'alreadyExists';
    } catch (error) {
      if (error instanceof CrmApiError && error.httpStatus === 403) {
        throw new ComplaintAccessError('Case Management does not allow this user to create a Case');
      }
      throw error;
    }
  }

  private async readBack(complaintId: string, ownerUserId: string, isRepeatSubmission: boolean): Promise<CreatedComplaint> {
    const row = await this.dependencies.caseManagementClient.getById<Record<string, unknown>>('incidents', complaintId, {
      select: ['ticketnumber', 'statuscode', 'createdon', '_ownerid_value', '_qdb_assigned_to_user_value'],
    }, { callerId: ownerUserId });
    const text = (key: string) => (typeof row[key] === 'string' && row[key] !== '' ? String(row[key]) : undefined);
    return {
      caseManagementCaseId: complaintId,
      ...optional('caseNumber', text('ticketnumber')),
      ...optional('status', text(`statuscode${FORMATTED}`)),
      ...optional('createdOn', text('createdon')),
      ...optional('assignedTo', text(`_qdb_assigned_to_user_value${FORMATTED}`)),
      ...optional('owner', text(`_ownerid_value${FORMATTED}`)),
      openUrl: `${this.dependencies.caseManagementBaseUrl.replace(/\/$/, '')}/main.aspx?etn=incident&pagetype=entityrecord&id=${complaintId}`,
      isRepeatSubmission,
    };
  }
}

function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
