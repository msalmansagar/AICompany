import { useCallback, useEffect, useState } from 'react';
import {
  describePosition, findEligible, requestRestore, workContextFor, writeWorkContext,
  type StepResult, type WorkContext,
} from '../../data/workContext.js';
import { navigateTo } from '../../shell/RecordLinks.js';
import { useCrmSession } from '../../shell/context.js';

/**
 * Moving through the list a case was opened from: Previous, Next, Complete & Next, and Back.
 *
 * A step revalidates before it moves (`findEligible`), so it never lands on work that was completed
 * elsewhere, reassigned or no longer matches the list. One step at a time: while a step is checking,
 * the controls are disabled, so two quick clicks cannot race each other to two different cases.
 * What a step skipped is written into the context and said on the case it lands on.
 */
export interface WorkNavigation {
  context: WorkContext | undefined;
  position: string;
  /** What the last step passed over or found, for the officer to read once. */
  note: string;
  isBusy: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  step: (direction: 1 | -1) => void;
  backToOrigin: () => void;
}

export function useWorkNavigation(caseId: string): WorkNavigation {
  const [context, setContext] = useState<WorkContext | undefined>(() => workContextFor(caseId));
  const [note, setNote] = useState(() => context?.note ?? '');
  // The arrival note is shown once: removed from storage after the first render, not during it.
  useEffect(() => { if (context?.note) clearNote(context); }, [context]);
  const { step, isBusy } = useStep(context, { setContext, setNote });
  const backToOrigin = useCallback(() => {
    if (!context) return;
    requestRestore(context);
    window.location.hash = context.returnHash;
  }, [context]);
  return { context, note, isBusy, step, backToOrigin, ...positionOf(context) };
}

interface Landing {
  setContext: (context: WorkContext) => void;
  setNote: (note: string) => void;
}

function useStep(context: WorkContext | undefined, landing: Landing): { step: (direction: 1 | -1) => void; isBusy: boolean } {
  const { adapter } = useCrmSession();
  const [isBusy, setBusy] = useState(false);
  const { setContext, setNote } = landing;
  const step = useCallback((direction: 1 | -1) => {
    if (!context || isBusy) return;
    setBusy(true);
    findEligible({ adapter, now: new Date() }, context, direction)
      .then(result => land(context, { result, direction }, { setContext, setNote }))
      .catch(() => setNote('The next item could not be checked. Try again.'))
      .finally(() => setBusy(false));
  }, [adapter, context, isBusy, setContext, setNote]);
  return { step, isBusy };
}

function positionOf(context: WorkContext | undefined): Pick<WorkNavigation, 'position' | 'canGoBack' | 'canGoForward'> {
  return {
    position: context ? describePosition(context) : '',
    canGoBack: Boolean(context && context.index > 0),
    canGoForward: Boolean(context && context.index < context.items.length - 1),
  };
}

/** Moves to what the step found, carrying what it skipped; or stays and says why. */
function land(context: WorkContext, outcome: { result: StepResult; direction: 1 | -1 }, landing: Landing): void {
  const skippedNote = describeSkipped(outcome.result);
  if (outcome.result.index === undefined) {
    landing.setNote(skippedNote || endOfList(context, outcome.direction));
    return;
  }
  const next = { ...context, index: outcome.result.index, ...(skippedNote ? { note: skippedNote } : {}) };
  writeWorkContext(next);
  const target = next.items[next.index]!;
  if (target.caseId !== context.items[context.index]?.caseId) {
    navigateTo('case', target.caseId);
    return;
  }
  // The same case again (two follow-ups on one case): no navigation, just the new position.
  landing.setContext(next);
  landing.setNote(skippedNote);
}

function endOfList(context: WorkContext, direction: 1 | -1): string {
  return direction === 1 ? `That was the last item in ${context.originLabel}.` : `That was the first item in ${context.originLabel}.`;
}

function describeSkipped(result: StepResult): string {
  const parts = result.skipped.map(item => `${item.label} (${item.reason})`);
  const passed = parts.length > 0 ? `Skipped ${parts.length}: ${parts.join('; ')}.` : '';
  const stopped = result.stoppedEarly ? ' Too many items have changed — go back to the list to see it as it is now.' : '';
  return (passed + stopped).trim();
}

function clearNote(context: WorkContext): void {
  const { note: _shown, ...rest } = context;
  writeWorkContext(rest);
}
