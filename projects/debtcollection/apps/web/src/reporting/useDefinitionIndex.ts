import { useEffect, useState } from 'react';
import { describeFailure } from '../platform/errors.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { resolveDcpDefinitions, type DefinitionIndex } from './reportCatalogueResolver.js';

/**
 * The organisation's DCP report definitions, read once per screen, and what a panel may conclude
 * from them: nothing until the index is read; "not provisioned" when the code has no record here;
 * otherwise the id `qdb_RunReport` takes.
 */
export type IndexState =
  | { status: 'loading' }
  | { status: 'ok'; definitions: DefinitionIndex }
  | { status: 'failed'; message: string };

export type PanelResolution = { isResolved: false } | { isResolved: true; reportId: string | undefined };

export function useDefinitionIndex(adapter: XrmCrmAdapter): IndexState {
  const [state, setState] = useState<IndexState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    resolveDcpDefinitions(adapter)
      .then(definitions => { if (!cancelled) setState({ status: 'ok', definitions }); })
      .catch((failure: unknown) => { if (!cancelled) setState({ status: 'failed', message: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter]);
  return state;
}

export function resolutionFor(index: IndexState, code: string): PanelResolution {
  if (index.status === 'loading') return { isResolved: false };
  if (index.status === 'failed') return { isResolved: true, reportId: undefined };
  return { isResolved: true, reportId: index.definitions.get(code)?.id };
}
