import { useEffect, useMemo, useState } from 'react';
import type { ActionPlanItem } from '@dcp/domain';
import { loadActionPlan } from './followUpQueries.js';
import { toPlanItem, type CaseContext } from './actionPlanRows.js';
import { formatDate } from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';

/**
 * The next planned action on one case: the first current item of its action plan, in the strategy's
 * own sequence — the same answer the Case Workspace gives. It is a planned action from the
 * existing Action Plan, never a recommendation: no rule, no reasoning, no override lives here.
 *
 * Shared by the case preview and Customer 360, so both say the same thing about the same case.
 */
export type NextActionState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; next?: ActionPlanItem; outstanding: number };

export function useNextAction(
  caseId: string,
  strategyId: string | undefined,
  episodeNumber: number | undefined,
  reloadKey = 0,
): NextActionState {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<NextActionState>({ status: 'loading' });
  const context = useMemo<CaseContext>(() => ({
    caseId,
    ...(episodeNumber !== undefined ? { episodeNumber } : {}),
    now: new Date(),
    formatDate,
  }), [caseId, episodeNumber]);

  useEffect(() => {
    if (!strategyId) { setState({ status: 'ready', outstanding: 0 }); return undefined; }
    let cancelled = false;
    setState({ status: 'loading' });
    loadActionPlan(adapter, { caseId, strategyId })
      .then(plan => {
        if (cancelled) return;
        const outstanding = plan.rows.map(row => toPlanItem(row, context)).filter(item => item.isCurrent);
        setState({ status: 'ready', outstanding: outstanding.length, ...(outstanding[0] ? { next: outstanding[0] } : {}) });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [adapter, caseId, strategyId, context, reloadKey]);

  return state;
}
