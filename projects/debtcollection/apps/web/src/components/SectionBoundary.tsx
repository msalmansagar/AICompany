import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { describeFailure } from '../platform/errors.js';
import { Icon } from './primitives.js';

/**
 * One section of a screen, loading, failing and retrying on its own.
 *
 * A failure in one source — MIS, the history, the snapshots — is contained to its section, which
 * says what failed and offers Retry; the rest of the screen keeps working. Each section brings its
 * own skeleton of a stable height, so nothing jumps when data arrives, and there is no page spinner.
 */
export type SectionState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T };

/**
 * Loads a section's data and keeps only the latest answer: a slower, older request that resolves
 * after a newer one is dropped, never painted over it.
 */
export function useSectionData<T>(load: (() => Promise<T>) | undefined, dependencies: readonly unknown[]): { state: SectionState<T>; retry: () => void } {
  const [state, setState] = useState<SectionState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    if (!load) return;
    const request = ++latest.current;
    setState({ status: 'loading' });
    load()
      .then(data => { if (request === latest.current) setState({ status: 'ready', data }); })
      .catch((error: unknown) => { if (request === latest.current) setState({ status: 'error', error: describeFailure(error) }); });
    // The dependencies are the caller's; `load` is recreated with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { state, retry };
}

export function SectionBoundary<T>({ label, state, onRetry, skeleton, testId, children }: {
  label: string;
  state: SectionState<T>;
  onRetry: () => void;
  skeleton: ReactNode;
  testId: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return <div className="c360-skeleton-wrap" aria-busy="true" aria-label={`Loading ${label}`} data-testid={`${testId}-loading`}>{skeleton}</div>;
  }
  if (state.status === 'error') {
    return (
      <div className="info-banner bad c360-section-error" role="alert" data-testid={`${testId}-error`}>
        <Icon name="warn" />
        <div>
          <b>{label} could not be loaded.</b>
          <p>{state.error}</p>
          <button type="button" className="btn" onClick={onRetry} data-testid={`${testId}-retry`}>Retry</button>
        </div>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

/** Grey bars of a fixed shape, so the section keeps its height while it loads. */
export function SkeletonLines({ lines, height = 14 }: { lines: number; height?: number }) {
  return (
    <div className="c360-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} className="c360-skeleton-line" style={{ height }} />)}
    </div>
  );
}
