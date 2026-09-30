import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExternalProcessReference } from '@dcp/domain';
import { createReferenceSummariser } from '../data/externalReferenceService.js';

const SERVICE = 'https://dcp-integration.qdb.example';
const endpoint = { baseUrl: SERVICE, getAccessToken: async () => 'user-token' };
const reference = (index: number): ExternalProcessReference => ({
  process: 'Complaint', organization: 'BFD', recordId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, recordNumber: `BFD-${index}`,
});

function serviceAnswering(transform: (ids: string[]) => unknown[] = ids => ids.map(recordId => ({ recordId, availability: 'found', openUrl: `${SERVICE}/x` }))) {
  const bodies: Array<{ references: Array<Record<string, unknown>> }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { references: Array<{ recordId: string }> };
    bodies.push(body);
    return new Response(JSON.stringify({ summaries: transform(body.references.map(r => r.recordId)) }), { status: 200 });
  }));
  return bodies;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('createReferenceSummariser', () => {
  it('createReferenceSummariser_sixtyReferences_asksInPagesOfFifty', async () => {
    const bodies = serviceAnswering();

    await createReferenceSummariser(endpoint)(Array.from({ length: 60 }, (_, index) => reference(index)));

    expect(bodies.map(body => body.references.length)).toEqual([50, 10]);
  });

  it('createReferenceSummariser_repeatedReference_isAskedOnce', async () => {
    const bodies = serviceAnswering();

    await createReferenceSummariser(endpoint)([reference(1), reference(1)]);

    expect(bodies[0]!.references).toHaveLength(1);
  });

  it('createReferenceSummariser_request_sendsOnlyTheReferenceIdentity', async () => {
    const bodies = serviceAnswering();

    await createReferenceSummariser(endpoint)([reference(1)]);

    expect(Object.keys(bodies[0]!.references[0]!).sort()).toEqual(['organization', 'process', 'recordId']);
  });

  it('createReferenceSummariser_malformedSummary_isIgnored', async () => {
    serviceAnswering(() => [{ recordId: 'x' }, { recordId: 'y', availability: 'found', openUrl: 'https://ok' }]);

    const summaries = await createReferenceSummariser(endpoint)([reference(1)]);

    expect([...summaries.keys()]).toEqual(['y']);
  });
});
