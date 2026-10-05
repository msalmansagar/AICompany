import { useMemo, useRef } from 'react';
import { isConcernTypeCode, type HistoryEntry } from '@dcp/domain';
import type { CustomerAggregate, FinancialUnit, PromisePerformance } from '../../data/customerAggregate.js';
import { loadPromisePerformance } from '../../data/customerAggregate.js';
import { loadNextPlannedActions, type NextPlannedAction } from '../../data/customerNextActions.js';
import { loadHistoryCounts, loadOpenProcesses, type CategoryTypes, type HistoryCounts } from '../../data/customerHistoryQueries.js';
import { loadActivityTypes } from '../../data/configurationCatalog.js';
import { isLegalRecommendationCode } from '../../data/legalTraceRows.js';
import { isDeceasedTypeCode } from '../../data/deceasedQueries.js';
import { loadUnitSnapshots, type UnitSnapshots } from '../../data/unitSnapshots.js';
import { resolveMessagingConfiguration, type MessagingConfiguration } from '../../data/messagingConfiguration.js';
import { useSectionData, type SectionState } from '../../components/SectionBoundary.js';
import { useCrmSession } from '../../shell/context.js';

/**
 * The reads behind Customer 360 once the customer is known, each its own section so one failing
 * source never takes the others with it. Customer-wide reads run once per customer and reload key;
 * the selected unit's reads run only when the selection changes, and a unit's snapshots are kept
 * once read, so returning to a unit reads nothing again.
 */
/**
 * What the history needs to know about the customer's organisation: the configured activity type
 * codes per category, and the table that organisation records SMS / WhatsApp in (Fax on BFD,
 * Letter on Housing Loan).
 */
export interface HistoryContext {
  types: CategoryTypes;
  messaging: MessagingConfiguration;
}

export interface Customer360Sections {
  promises: SectionState<PromisePerformance>;
  nextActions: { state: SectionState<ReadonlyMap<string, NextPlannedAction>>; retry: () => void };
  history: { state: SectionState<HistoryContext>; retry: () => void };
  counts: SectionState<HistoryCounts | undefined>;
  snapshots: { state: SectionState<UnitSnapshots>; retry: () => void };
  openProcesses: { state: SectionState<readonly HistoryEntry[]>; retry: () => void };
}

export function useCustomer360Sections(aggregate: CustomerAggregate, selected: FinancialUnit | undefined, reloadKey: number): Customer360Sections {
  const { adapter } = useCrmSession();
  const caseIds = useMemo(() => aggregate.cases.map(c => c.id), [aggregate.cases]);
  const openCases = useMemo(() => aggregate.financialUnits.filter(unit => unit.case.isOpen).map(unit => ({
    id: unit.case.id, ...(unit.case.strategyId ? { strategyId: unit.case.strategyId } : {}), ...(unit.case.episodeNumber !== undefined ? { episodeNumber: unit.case.episodeNumber } : {}),
  })), [aggregate.financialUnits]);

  const promises = useSectionData(() => loadPromisePerformance(adapter, caseIds), [adapter, caseIds, reloadKey]);
  const nextActions = useSectionData(() => loadNextPlannedActions(adapter, openCases), [adapter, openCases, reloadKey]);
  // A customer is a contact (HL) or an account (BFD), so every case they hold is in one organisation.
  const organization = aggregate.financialUnits[0]?.organization ?? '';
  const history = useSectionData(() => loadHistoryContext(adapter, organization), [adapter, organization]);
  const context = history.state.status === 'ready' ? history.state.data : undefined;
  // Counts are shown only when exact. A refused count is not an error to report: the filters work
  // without them, and the timeline simply shows none.
  const counts = useSectionData(context ? () => loadHistoryCounts(adapter, { caseIds, ...context }).catch(() => undefined) : undefined, [adapter, caseIds, context, reloadKey]);
  const snapshots = useUnitSnapshots(aggregate.customerBusinessId, selected);
  const openProcesses = useSectionData(
    selected?.case.isOpen && context ? () => loadOpenProcesses(adapter, selected.case.id, context.types) : undefined,
    [adapter, selected?.case.id, context, reloadKey],
  );
  return { promises: promises.state, nextActions, history, counts: counts.state, snapshots, openProcesses };
}

async function loadHistoryContext(adapter: Parameters<typeof loadActivityTypes>[0], organization: string): Promise<HistoryContext> {
  const [types, messaging] = await Promise.all([loadCategoryTypes(adapter), resolveMessagingConfiguration(adapter, organization)]);
  return { types, messaging };
}

/** A unit's snapshots, read once per unit and remembered for the life of the screen. */
function useUnitSnapshots(customerBusinessId: string, selected: FinancialUnit | undefined) {
  const { adapter } = useCrmSession();
  const remembered = useRef(new Map<string, Promise<UnitSnapshots>>());
  const key = selected ? `${selected.sourceSystem}|${selected.unitNumber}` : undefined;
  return useSectionData(selected && key ? () => {
    const cached = remembered.current.get(key);
    if (cached) return cached;
    const loading = loadUnitSnapshots(adapter, { customerBusinessId, unitNumber: selected.unitNumber, sourceSystem: selected.sourceSystem });
    remembered.current.set(key, loading);
    loading.catch(() => remembered.current.delete(key));
    return loading;
  } : undefined, [adapter, customerBusinessId, key]);
}

/** The configured activity types each history category recognises, by code. */
async function loadCategoryTypes(adapter: Parameters<typeof loadActivityTypes>[0]): Promise<CategoryTypes> {
  const types = await loadActivityTypes(adapter);
  const pick = (matches: (code: string | undefined) => boolean) => types.filter(type => matches(type.code)).map(type => type.id);
  return { legal: pick(isLegalRecommendationCode), deceased: pick(isDeceasedTypeCode), concern: pick(isConcernTypeCode) };
}
