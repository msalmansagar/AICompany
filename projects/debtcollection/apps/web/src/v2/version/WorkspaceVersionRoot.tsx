import { Component, createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  browserStorage, readUrlVersion, rememberVersion, resolveWorkspaceVersion, type WorkspaceVersion,
} from './workspaceVersion.js';
import '../styles/v2-tokens.css';
import '../styles/v2-base.css';

/**
 * The one place the workspace decides between V1 and V2.
 *
 * Both versions render under the same CRM session, adapter and providers — this component sits
 * inside them and chooses only the presentation. Switching re-renders in place: no reload, no second
 * web resource, no second session.
 *
 * **V2 cannot take V1 down with it.** A V2 render failure is caught here and V1 is shown instead,
 * with one line saying why.
 */

interface VersionContextValue {
  version: WorkspaceVersion;
  switchTo: (version: WorkspaceVersion) => void;
}

const VersionContext = createContext<VersionContextValue | null>(null);

/** The current version and the switch. Outside a version root the workspace is V1 and fixed. */
export function useWorkspaceVersion(): VersionContextValue {
  return useContext(VersionContext) ?? FIXED_V1;
}

const FIXED_V1: VersionContextValue = { version: 'v1', switchTo: () => {} };

export function WorkspaceVersionRoot({ renderV1, renderV2, search, storage }: {
  renderV1: () => ReactNode;
  renderV2: () => ReactNode;
  /** The page's query string; injectable so tests do not depend on the test runner's URL. */
  search?: string;
  storage?: Storage;
}) {
  const query = search ?? currentSearch();
  const store = storage ?? browserStorage();
  const [version, setVersion] = useState<WorkspaceVersion>(() => {
    const resolved = resolveWorkspaceVersion({ search: query, ...(store ? { storage: store } : {}) });
    // An explicit URL request is also remembered, so a refresh without it keeps the same view.
    if (readUrlVersion(query)) rememberVersion(resolved, store);
    return resolved;
  });

  const switchTo = useCallback((next: WorkspaceVersion) => {
    rememberVersion(next, store);
    setVersion(next);
  }, [store]);

  const value = useMemo(() => ({ version, switchTo }), [version, switchTo]);

  return (
    <VersionContext.Provider value={value}>
      {version === 'v2'
        ? <V2Boundary fallback={renderV1}>{renderV2()}</V2Boundary>
        : renderV1()}
    </VersionContext.Provider>
  );
}

function currentSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

interface BoundaryState { failure: Error | null }

/** Catches a V2 render failure and shows V1 instead. It never catches V1's own failures. */
class V2Boundary extends Component<{ fallback: () => ReactNode; children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failure: error instanceof Error ? error : new Error(String(error)) };
  }

  override render() {
    if (!this.state.failure) return this.props.children;
    return (
      <>
        <div className="dcp-v2 v2-fallback" role="status" data-testid="v2-fallback-notice">
          Workspace V2 could not be shown, so the current workspace (V1) is open instead.
        </div>
        {this.props.fallback()}
      </>
    );
  }
}
