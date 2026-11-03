import { useEffect, useState } from 'react';
import { describeFailure } from '../platform/errors.js';
import { useCrmSession } from '../shell/context.js';
import { createReferenceSummariser, type ReferenceSummariser } from './externalReferenceService.js';
import { resolveIntegrationEndpoint } from './integrationEndpoint.js';

export interface ReferenceSummariserState {
  summarise?: ReferenceSummariser;
  isResolved: boolean;
  /**
   * Why current status cannot be read, when the reason is a failure rather than configuration —
   * shown on the card, so "not set up" and "could not be checked" are never confused.
   */
  failure?: string;
}

/**
 * The summariser for one organisation's workspace, once the Integration Service is known to be
 * reachable. Without it, screens show the stored reference and say the current status is in the
 * owning module; the reference itself is always shown, so no state hides that a hand-off exists.
 */
export function useReferenceSummariser(organization: string | undefined): ReferenceSummariserState {
  const { adapter, integrationServiceToken } = useCrmSession();
  const [state, setState] = useState<ReferenceSummariserState>({ isResolved: false });
  useEffect(() => {
    let cancelled = false;
    if (!organization) { setState({ isResolved: true }); return; }
    resolveIntegrationEndpoint(adapter, organization, integrationServiceToken)
      .then(result => {
        if (cancelled) return;
        setState(result.kind === 'available' ? { summarise: createReferenceSummariser(result.endpoint), isResolved: true } : { isResolved: true });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ isResolved: true, failure: describeFailure(error) });
      });
    return () => { cancelled = true; };
  }, [adapter, integrationServiceToken, organization]);
  return state;
}
