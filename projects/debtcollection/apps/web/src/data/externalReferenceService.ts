import type { ExternalProcess, ExternalProcessReference, OrganizationCode } from '@dcp/domain';
import { postToIntegrationService, type IntegrationEndpoint } from './integrationEndpoint.js';

/**
 * The current state of Complaint and Legal records, as their owning module reports it.
 *
 * DCP stores only the reference on the Collection Activity. Status, owner and dates are read from
 * Case Management or Legal through the Integration Service, as the signed-in user, one call per
 * page of references — so there is one source of truth and no per-row round trip.
 */
export interface ExternalRecordSummary {
  process: ExternalProcess;
  organization: OrganizationCode;
  recordId: string;
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

/** Reads summaries for a page of references; resolves to a map by record id. */
export type ReferenceSummariser = (references: readonly ExternalProcessReference[]) => Promise<ReadonlyMap<string, ExternalRecordSummary>>;

/** The Integration Service accepts one page — fifty references — per call. */
const MAX_REFERENCES_PER_CALL = 50;

export function createReferenceSummariser(endpoint: IntegrationEndpoint): ReferenceSummariser {
  return async references => {
    const unique = [...new Map(references.map(reference => [reference.recordId, reference])).values()];
    const summaries = new Map<string, ExternalRecordSummary>();
    for (let start = 0; start < unique.length; start += MAX_REFERENCES_PER_CALL) {
      const page = unique.slice(start, start + MAX_REFERENCES_PER_CALL)
        .map(reference => ({ process: reference.process, organization: reference.organization, recordId: reference.recordId }));
      const body = await postToIntegrationService(endpoint, '/external-references/summaries', { references: page });
      for (const summary of readSummaries(body)) summaries.set(summary.recordId, summary);
    }
    return summaries;
  };
}

function readSummaries(body: Record<string, unknown>): ExternalRecordSummary[] {
  const summaries = body['summaries'];
  if (!Array.isArray(summaries)) return [];
  return summaries.filter(isSummary);
}

function isSummary(value: unknown): value is ExternalRecordSummary {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['recordId'] === 'string' && typeof candidate['openUrl'] === 'string'
    && ['found', 'notFound', 'forbidden'].includes(String(candidate['availability']));
}
