import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, ORG_CODES, PLATFORM_CONFIGURATION_COLUMNS } from './schema.js';

/**
 * Raising a complaint in QDB's existing BFD Case Management, from a Collection Case.
 *
 * The browser never writes to Case Management. HL CRM and Case Management (QDB1) are separate
 * organisations, so the complaint goes through the Integration Service, which derives every Case
 * value on the server and acts as the signed-in user in both organisations. The browser sends the
 * officer's description and a request id — nothing else.
 */

/** Key in the HL organisation's `qdb_platformconfiguration.qdb_featureflags` JSON. */
export const CASE_MANAGEMENT_SERVICE_FLAG = 'caseManagementServiceUrl';

/** The Case Management record, as Case Management reported it after creation. */
export interface RaisedComplaint {
  caseManagementCaseId: string;
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

/** The service refused, with its own code and message — shown to the officer as given. */
export class ComplaintServiceError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus: number) {
    super(message);
    this.name = 'ComplaintServiceError';
  }
}

export type ComplaintServiceAvailability =
  | { kind: 'available'; client: ComplaintServiceClient }
  | { kind: 'unavailable'; reason: string };

export interface ComplaintServiceOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

export function createComplaintServiceClient(options: ComplaintServiceOptions): ComplaintServiceClient {
  const send = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  return {
    async raiseComplaint(collectionCaseId, submission) {
      const response = await send(`${baseUrl}/collection-cases/${encodeURIComponent(collectionCaseId)}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await options.getAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new ComplaintServiceError(String(body['code'] ?? 'request_failed'), String(body['message'] ?? `The service answered ${response.status}`), response.status);
      }
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
    throw new ComplaintServiceError('unexpected_response', 'The service did not say which Case it created.', 502);
  }
  const optional = (key: keyof RaisedComplaint) => (text(key) !== undefined ? { [key]: text(key) } : {});
  return {
    caseManagementCaseId, openUrl, isRepeatSubmission: body['isRepeatSubmission'] === true,
    ...optional('caseNumber'), ...optional('status'), ...optional('createdOn'), ...optional('assignedTo'), ...optional('owner'),
  };
}

/** The service address from the organisation's flags, only if it is an https URL. */
export function readComplaintServiceUrl(featureFlags: unknown): string | undefined {
  const raw = String(featureFlags ?? '').trim();
  if (!raw) return undefined;
  const parsed = safeParse(raw);
  const url = parsed?.[CASE_MANAGEMENT_SERVICE_FLAG];
  return typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url) ? url : undefined;
}

function safeParse(raw: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  } catch {
    // Unparseable flags configure nothing; the caller reports the service as unavailable.
    return undefined;
  }
}

/**
 * Whether a complaint can be raised from this organisation's cases, and if not, why — in words an
 * officer or an administrator can act on. HL only: the BFD mapping has not been approved.
 */
export async function resolveComplaintService(
  adapter: XrmCrmAdapter,
  organization: string,
  getAccessToken: (() => Promise<string>) | undefined,
): Promise<ComplaintServiceAvailability> {
  if (organization !== 'HL') return unavailable('Complaints can be raised from Housing Loan cases only; the BFD mapping is not approved yet.');
  const rows = await adapter.retrieveMultiple(ENTITY_SETS.platformConfiguration, {
    select: [...PLATFORM_CONFIGURATION_COLUMNS], filter: `qdb_organizationcode eq ${ORG_CODES['HL']} and qdb_isactive eq true`, top: 2,
  });
  if (rows.length !== 1) return unavailable('The Housing Loan platform configuration is missing or ambiguous.');
  const baseUrl = readComplaintServiceUrl(rows[0]!['qdb_featureflags']);
  if (!baseUrl) return unavailable('The Case Management integration address is not configured for Housing Loan.');
  if (!getAccessToken) return unavailable('Sign-in to the Integration Service is not set up in this workspace yet.');
  return { kind: 'available', client: createComplaintServiceClient({ baseUrl, getAccessToken }) };
}

function unavailable(reason: string): ComplaintServiceAvailability {
  return { kind: 'unavailable', reason };
}
