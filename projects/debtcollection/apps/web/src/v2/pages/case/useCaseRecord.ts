import { useEffect, useState } from 'react';
import { retrieveCase, retrieveCustomer, type CaseDetail, type CustomerProfile } from '../../../data/caseQueries.js';
import { toError } from '../../../platform/errors.js';
import { useCrmSession } from '../../../shell/context.js';

/**
 * One case and its customer, read the way V1 reads them.
 *
 * The customer is optional context: a case whose customer lookup is empty, or whose customer cannot be
 * read, still opens — the header then shows the business id instead of a name, and says nothing it
 * does not know. `reloadKey` re-reads after a save.
 */
export type CaseRecordState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; detail: CaseDetail; customer?: CustomerProfile | undefined };

export function useCaseRecord(caseId: string | undefined, reloadKey: number): CaseRecordState {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<CaseRecordState>({ status: caseId ? 'loading' : 'missing' });

  useEffect(() => {
    if (!caseId) { setState({ status: 'missing' }); return; }
    let cancelled = false;
    setState(previous => (previous.status === 'ready' && previous.detail.id === caseId ? previous : { status: 'loading' }));
    loadCaseRecord(adapter, caseId)
      .then(next => { if (!cancelled) setState(next); })
      .catch((error: unknown) => { if (!cancelled) setState({ status: 'error', error: toError(error) }); });
    return () => { cancelled = true; };
  }, [adapter, caseId, reloadKey]);

  return state;
}

async function loadCaseRecord(
  adapter: Parameters<typeof retrieveCase>[0],
  caseId: string,
): Promise<CaseRecordState> {
  const detail = await retrieveCase(adapter, caseId);
  if (!detail) return { status: 'missing' };
  const customer = await readCustomer(adapter, detail);
  return { status: 'ready', detail, ...(customer ? { customer } : {}) };
}

/** A customer that cannot be read is context lost, not a case that cannot open. */
async function readCustomer(
  adapter: Parameters<typeof retrieveCase>[0],
  detail: CaseDetail,
): Promise<CustomerProfile | undefined> {
  if (!detail.customerTable || !detail.customerId) return undefined;
  try {
    return (await retrieveCustomer(adapter, detail.customerTable, detail.customerId)) ?? undefined;
  } catch {
    // Deliberately tolerated: the header falls back to the business id, which MIS always supplies.
    return undefined;
  }
}
