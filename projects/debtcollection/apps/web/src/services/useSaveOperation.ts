import { useCallback, useMemo, useRef, useState } from 'react';
import type { OperationRefusal } from '@dcp/domain';
import type { SaveOutcome } from './activityService.js';
import { describeFailure } from '../platform/errors.js';

/**
 * What a save looks like to a form.
 *
 * The three failure states are separate because they call for three different things from the user,
 * and a form that cannot tell them apart offers the wrong one:
 *
 * | State | What happened | What the user should do |
 * |---|---|---|
 * | `refused` | The domain declined — a missing field, a transition the matrix forbids | Fix the field and save again |
 * | `conflict` | Someone else changed the record between the read and the write | Reload the latest, then decide |
 * | `failed` | Anything else — a lifecycle refusal from the server, no permission, a dropped connection | Try again, or get help |
 *
 * Collapsing `conflict` into `failed` produces a retry button that cannot succeed, because the stale
 * version will be refused every time. Collapsing a server-side refusal into `conflict` sends the user
 * to reload a record that has not moved. Both are worse than the plain error they replace.
 */
export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; message: string }
  | { kind: 'refused'; refusals: readonly OperationRefusal[] }
  | { kind: 'conflict'; message: string }
  | { kind: 'failed'; message: string };

export interface SaveOperation<T> {
  state: SaveState;
  /** True while a request is in flight — what a Save button disables on. */
  busy: boolean;
  /**
   * Runs one save.
   *
   * Resolves with the result when it saved and `undefined` otherwise, so a caller can close a dialog
   * or refresh a list on success without re-inspecting the state.
   */
  run: (operation: () => Promise<SaveOutcome<T>>) => Promise<T | undefined>;
  /** Clears the outcome, e.g. when the user edits the field a refusal pointed at. */
  reset: () => void;
  /** The refusal for one field, so a form can render it beside the input rather than in a list. */
  refusalFor: (field: string) => OperationRefusal | undefined;
}

/**
 * Runs one save at a time and turns its outcome into form state.
 *
 * **Re-entry is refused while a request is in flight**, which is what makes a double-click harmless
 * from the user's point of view. It is deliberately *not* the duplicate-submission protection:
 * that is ADR-DCP-19's client-chosen primary key, and it lives in the service layer where a retry
 * after a lost response is also covered. This guard only stops a second request leaving the browser;
 * it can do nothing about the first one having already arrived.
 *
 * The flag is a ref rather than state because the check has to be correct **within one event loop
 * turn**. Two clicks 20ms apart both read the same rendered `busy` prop, so a state-based guard lets
 * the second through — the exact race it was added to prevent.
 */
export function useSaveOperation<T>(): SaveOperation<T> {
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const inFlight = useRef(false);

  const run = useCallback(async (operation: () => Promise<SaveOutcome<T>>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setState({ kind: 'saving' });

    try {
      const outcome = await operation();
      if (outcome.status === 'saved') {
        setState({ kind: 'saved', message: 'Saved.' });
        return outcome.result;
      }
      if (outcome.status === 'refused') {
        setState({ kind: 'refused', refusals: outcome.refusals });
        return undefined;
      }
      setState({ kind: 'conflict', message: outcome.message });
      return undefined;
    } catch (error) {
      // Everything the service did not classify. The message is the platform's own, which for a
      // lifecycle refusal from the plugin is the sentence a supervisor needs to see.
      setState({ kind: 'failed', message: describeFailure(error) });
      return undefined;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  const refusalFor = useCallback(
    (field: string) => (state.kind === 'refused' ? state.refusals.find(r => r.field === field) : undefined),
    [state],
  );

  // Memoised because callers put it in effect dependencies. A fresh object every render turned an
  // effect that reads a record into an infinite loop — the form re-read on every render it caused.
  return useMemo(
    () => ({ state, busy: state.kind === 'saving', run, reset, refusalFor }),
    [state, run, reset, refusalFor],
  );
}

/** Refusals with no field of their own — rendered together rather than silently dropped. */
export function generalRefusals(state: SaveState): readonly OperationRefusal[] {
  return state.kind === 'refused' ? state.refusals.filter(r => !r.field) : [];
}
