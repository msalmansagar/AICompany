import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  IntegrationServiceError, postToIntegrationService, resolveIntegrationEndpoint, type IntegrationEndpoint,
} from './integrationEndpoint.js';

/**
 * Raising a complaint in QDB's existing BFD Case Management, from a Collection Case.
 *
 * The browser never writes to Case Management. It sends the officer's description and a request id
 * to the Integration Service, which derives every Case value on the server, records the request on
 * the Collection Case, creates the Case and returns what Case Management reports.
 */

/** The Case Management record, as Case Management reported it after creation. */
export interface RaisedComplaint {
  caseManagementCaseId: string;
  collectionActivityId?: string;
  caseNumber?: string;
  status?: string;
  createdOn?: string;
  assignedTo?: string;
  owner?: string;
  openUrl: string;
  isRepeatSubmission: boolean;
}

export interface ComplaintSubmission {
  requestId: string;
  description: string;
}

export interface ComplaintServiceClient {
  raiseComplaint(collectionCaseId: string, submission: ComplaintSubmission): Promise<RaisedComplaint>;
}

export { IntegrationServiceError as ComplaintServiceError };

export type ComplaintServiceAvailability =
  | { kind: 'available'; client: ComplaintServiceClient }
  | { kind: 'unavailable'; reason: string };

export function createComplaintServiceClient(endpoint: IntegrationEndpoint): ComplaintServiceClient {
  return {
    async raiseComplaint(collectionCaseId, submission) {
      const body = await postToIntegrationService(endpoint, `/collection-cases/${encodeURIComponent(collectionCaseId)}/complaints`, submission);
      return toRaisedComplaint(body);
    },
  };
}

/** The service's success body, checked rather than trusted: an id and a link are the minimum. */
function toRaisedComplaint(body: Record<string, unknown>): RaisedComplaint {
  const text = (key: string) => (typeof body[key] === 'string' && body[key] !== '' ? String(body[key]) : undefined);
  const caseManagementCaseId = text('caseManagementCaseId');
  const openUrl = text('openUrl');
  if (!caseManagementCaseId || !openUrl?.startsWith('https://')) {
    throw new IntegrationServiceError('unexpected_response', 'The service did not say which Case it created.', 502);
  }
  const optional = (key: keyof RaisedComplaint) => (text(key) !== undefined ? { [key]: text(key) } : {});
  return {
    caseManagementCaseId, openUrl, isRepeatSubmission: body['isRepeatSubmission'] === true,
    ...optional('collectionActivityId'), ...optional('caseNumber'), ...optional('status'), ...optional('createdOn'),
    ...optional('assignedTo'), ...optional('owner'),
  };
}

/** Whether a complaint can be raised from this organisation's cases. HL only: BFD's mapping is not approved. */
export async function resolveComplaintService(
  adapter: XrmCrmAdapter,
  organization: string,
  getAccessToken: (() => Promise<string>) | undefined,
): Promise<ComplaintServiceAvailability> {
  if (organization !== 'HL') {
    return { kind: 'unavailable', reason: 'Complaints can be raised from Housing Loan cases only; the BFD mapping is not approved yet.' };
  }
  const resolved = await resolveIntegrationEndpoint(adapter, organization, getAccessToken);
  return resolved.kind === 'available' ? { kind: 'available', client: createComplaintServiceClient(resolved.endpoint) } : resolved;
}
