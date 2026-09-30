import { useEffect, useState } from 'react';
import { useCrmSession } from '../shell/context.js';
import { createReferenceSummariser, type ReferenceSummariser } from './externalReferenceService.js';
import { resolveIntegrationEndpoint } from './integrationEndpoint.js';

/**
 * The summariser for one organisation's workspace, once the Integration Service is known to be
 * reachable — or undefined, in which case screens show the stored reference and say that the
 * current status is in the owning module. `undefined` while resolving and when unavailable alike:
 * the reference itself is always shown, so neither state hides that a hand-off exists.
 */
export function useReferenceSummariser(organization: string | undefined): { summarise?: ReferenceSummariser; isResolved: boolean } {
  const { adapter, integrationServiceToken } = useCrmSession();
  const [state, setState] = useState<{ summarise?: ReferenceSummariser; isResolved: boolean }>({ isResolved: false });
  useEffect(() => {
    let cancelled = false;
    if (!organization) { setState({ isResolved: true }); return; }
    resolveIntegrationEndpoint(adapter, organization, integrationServiceToken)
      .then(result => {
        if (cancelled) return;
        setState(result.kind === 'available' ? { summarise: createReferenceSummariser(result.endpoint), isResolved: true } : { isResolved: true });
      })
      .catch(() => { if (!cancelled) setState({ isResolved: true }); });
    return () => { cancelled = true; };
  }, [adapter, integrationServiceToken, organization]);
  return state;
}
