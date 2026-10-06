import { useMemo } from 'react';
import type { CaseDetail } from '../../data/caseQueries.js';
import { loadCaseWork, type CaseWork } from '../../data/followUpQueries.js';
import { groupCaseWork, type GroupedWork } from '../../data/caseWorkPlan.js';
import type { CaseContext } from '../../data/actionPlanRows.js';
import { useSectionData, type SectionState } from '../../components/SectionBoundary.js';
import { formatDate } from '../../components/primitives.js';
import { useCrmSession } from '../../shell/context.js';
import { loadHistoryContext, type HistoryContext } from '../customer360/useCustomer360Sections.js';

/**
 * The Case Workspace's read model: everything the page shows above the record tabs, from two reads.
 *
 * `work` is the case's activities (with their promise columns) and its strategy's actions — three
 * bounded requests made together — and it answers the overview, the Action Plan, the promise panel,
 * Complete follow-up and the resolution summary. `history` is the organisation's activity types and
 * message tables, which the timeline and the resolution summary share. No panel reads on its own,
 * so there is no request per section and none per record.
 */
export interface CaseWorkspaceData {
  work: { state: SectionState<CaseWork>; retry: () => void };
  groups: GroupedWork | undefined;
  history: { state: SectionState<HistoryContext>; retry: () => void };
}

export function useCaseWorkspace(detail: CaseDetail, reloadKey: number): CaseWorkspaceData {
  const { adapter } = useCrmSession();
  const query = useMemo(() => ({ caseId: detail.id, ...(detail.strategyId ? { strategyId: detail.strategyId } : {}) }), [detail.id, detail.strategyId]);
  const work = useSectionData(() => loadCaseWork(adapter, query), [adapter, query, reloadKey]);
  const history = useSectionData(() => loadHistoryContext(adapter, detail.organization), [adapter, detail.organization]);
  // "Now" is taken again on every reload, so a page left open past midnight regroups on the next save.
  const context = useMemo<CaseContext>(() => ({
    caseId: detail.id,
    ...(detail.episodeNumber !== undefined ? { episodeNumber: detail.episodeNumber } : {}),
    now: new Date(),
    formatDate,
    // `reloadKey` is the trigger for taking "now" again; it is deliberately not read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [detail.id, detail.episodeNumber, reloadKey]);
  const groups = useMemo(() => (work.state.status === 'ready' ? groupCaseWork(work.state.data, context) : undefined), [work.state, context]);
  return { work, groups, history };
}
