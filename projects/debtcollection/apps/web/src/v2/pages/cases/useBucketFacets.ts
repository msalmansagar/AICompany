import { useEffect, useRef, useState } from 'react';
import type { CaseQuery } from '../../../data/collectionQueries.js';
import type { XrmCrmAdapter } from '../../../platform/XrmCrmAdapter.js';
import { loadBucketFacets, type BucketFacets } from '../../data/caseFacets.js';

/**
 * The bucket counts for whatever the case list is currently asking, minus the bucket itself — a
 * chip counts its own bucket against every other filter in force. Re-read when the question
 * changes; an older answer arriving after a newer question is dropped.
 */
export type FacetState =
  | { status: 'loading' }
  | { status: 'ready'; facets: BucketFacets }
  | { status: 'unknown' };

export function useBucketFacets(adapter: XrmCrmAdapter, query: CaseQuery, reloadKey = 0): FacetState {
  const [state, setState] = useState<FacetState>({ status: 'loading' });
  const sequence = useRef(0);
  const { bucket: _bucket, sort: _sort, ...narrowing } = query;
  const fingerprint = JSON.stringify(narrowing);

  useEffect(() => {
    const mine = ++sequence.current;
    setState({ status: 'loading' });
    loadBucketFacets(adapter, JSON.parse(fingerprint) as CaseQuery)
      .then(facets => {
        if (mine !== sequence.current) return;
        setState(facets === null ? { status: 'unknown' } : { status: 'ready', facets });
      })
      .catch(() => { if (mine === sequence.current) setState({ status: 'unknown' }); });
  }, [adapter, fingerprint, reloadKey]);

  return state;
}
