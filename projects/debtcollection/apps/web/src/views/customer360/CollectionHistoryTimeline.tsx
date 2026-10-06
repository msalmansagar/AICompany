import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { HistoryCategory, HistoryEntry } from '@dcp/domain';
import {
  nextCustomerHistoryPage, startCustomerHistory, supportedCategories,
  type CustomerHistoryCursor, type HistoryCounts, type HistoryFilter,
} from '../../data/customerHistoryQueries.js';
import type { HistoryContext } from './useCustomer360Sections.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import { SkeletonLines } from '../../components/SectionBoundary.js';
import { describeFailure } from '../../platform/errors.js';
import { useCrmSession } from '../../shell/context.js';
import { OwnerLabel } from '../../components/OwnerLabel.js';
import { badgeFor, detailOf, momentOf, typeOf, whatHappened } from './historyEntryText.js';
import { HistoryEntryPane } from './HistoryEntryPane.js';

export const HISTORY_PAGE = 20;

const FILTER_LABELS: Readonly<Record<HistoryFilter, string>> = {
  all: 'All', actions: 'Actions', ptp: 'PTP', communications: 'Communications',
  complaint: 'Complaint / Dispute', legal: 'Legal', deceased: 'Deceased / Insurance',
};
const FILTER_ORDER: readonly HistoryFilter[] = ['all', 'actions', 'ptp', 'communications', 'complaint', 'legal', 'deceased'];

type Loaded = { entries: readonly HistoryEntry[]; cursor: CustomerHistoryCursor; complete: boolean };
type HistoryState = Loaded & { status: 'loading' | 'ready' | 'error'; error?: string };

/** Where each entry happened: its Loan Account or Facility and its Collection Case. */
export type CaseContextLookup = (caseId: string | undefined) => { unit: string; caseNumber: string } | undefined;
type EntryContext = ReturnType<CaseContextLookup>;

/**
 * Everything recorded across the customer's cases, newest first, filtered and paged by the
 * platform. Changing the filter starts a new request and resets the list; an answer to an earlier
 * request — a slower page, or a page for the filter just left — is dropped, never shown.
 */
export function CollectionHistoryTimeline({ caseIds, history, counts, contextOf, title = 'Collection History', onEntries }: {
  caseIds: readonly string[]; history: HistoryContext; counts: HistoryCounts | undefined; contextOf: CaseContextLookup;
  /** The Case Workspace calls it the case's timeline; Customer 360 its Collection History. */
  title?: string;
  /** Told what the unfiltered list holds once it answers — the Case Workspace's "last contact". */
  onEntries?: (entries: readonly HistoryEntry[]) => void;
}) {
  const { adapter } = useCrmSession();
  const { types, messaging, activityTypes } = history;
  const filters = FILTER_ORDER.filter(filter => filter === 'all' || supportedCategories(types).includes(filter as HistoryCategory));
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [activityTypeId, setActivityTypeId] = useState('');
  const [state, setState] = useState<HistoryState>({ entries: [], cursor: startCustomerHistory(messaging, 'all'), complete: false, status: 'loading' });
  const request = useRef(0);
  // A message has no activity type, so the type choice does not apply under Communications.
  const typeApplies = filter !== 'communications';
  const chosenType = typeApplies && activityTypeId ? activityTypeId : undefined;

  const load = useCallback((from: Loaded, chosen: HistoryFilter) => {
    const id = ++request.current;
    setState({ ...from, status: 'loading' });
    nextCustomerHistoryPage(adapter, { caseIds, filter: chosen, types, messaging, activityTypeId: chosenType }, from.cursor, HISTORY_PAGE)
      .then(page => { if (id === request.current) setState({ entries: [...from.entries, ...page.entries], cursor: page.cursor, complete: page.complete, status: 'ready' }); })
      .catch((error: unknown) => { if (id === request.current) setState({ ...from, status: 'error', error: describeFailure(error) }); });
  }, [adapter, caseIds, types, messaging, chosenType]);

  const [opened, setOpened] = useState<HistoryEntry>();
  // A save in the opened pane re-reads the list from the top, so the row shows what was saved.
  const [reloadKey, setReloadKey] = useState(0);
  const savedFromPane = useCallback(() => { setOpened(undefined); setReloadKey(key => key + 1); }, []);

  useEffect(() => { load({ entries: [], cursor: startCustomerHistory(messaging, filter, chosenType), complete: false }, filter); }, [load, filter, messaging, chosenType, reloadKey]);
  const isUnfiltered = filter === 'all' && !chosenType;
  useEffect(() => { if (isUnfiltered && state.status === 'ready') onEntries?.(state.entries); }, [isUnfiltered, state.status, state.entries, onEntries]);

  return (
    <section className="section-card c360-history" aria-labelledby="c360-history-title" data-testid="c360-history-card">
      <h3 id="c360-history-title">{title}</h3>
      <div className="c360-history-controls">
        <FilterTabs filters={filters} active={filter} counts={counts} onChoose={setFilter} />
        <ActivityTypeFilter types={activityTypes} chosen={chosenType ?? ''} isApplicable={typeApplies} onChoose={setActivityTypeId} />
      </div>
      <ol className="c360-timeline" data-testid="c360-history" aria-live="polite">
        {state.entries.map(entry => <HistoryRow key={entry.id} entry={entry} context={contextOf(entry.caseId)} onOpen={() => setOpened(entry)} />)}
      </ol>
      <HistoryFooter state={state} filter={filter} onLoadFrom={from => load(from, filter)} />
      {opened && <HistoryEntryPane entry={opened} context={contextOf(opened.caseId)} onClose={() => setOpened(undefined)} onSaved={savedFromPane} />}
    </section>
  );
}

function ActivityTypeFilter({ types, chosen, isApplicable, onChoose }: {
  types: HistoryContext['activityTypes']; chosen: string; isApplicable: boolean; onChoose: (typeId: string) => void;
}) {
  return (
    <label className="c360-type-filter">
      <span>Activity type</span>
      <select
        value={chosen} disabled={!isApplicable} onChange={event => onChoose(event.target.value)}
        title={isApplicable ? undefined : 'Messages have no activity type.'} data-testid="c360-history-type"
      >
        <option value="">All types</option>
        {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
    </label>
  );
}

/** Loading, failure with Retry, empty, Load more or end — whichever the list is in. */
function HistoryFooter({ state, filter, onLoadFrom }: { state: HistoryState; filter: HistoryFilter; onLoadFrom: (from: Loaded) => void }) {
  if (state.status === 'loading') return <div aria-busy="true" data-testid="c360-history-loading"><SkeletonLines lines={3} height={18} /></div>;
  if (state.status === 'error') {
    return (
      <div className="info-banner bad" role="alert" data-testid="c360-history-error">
        <div><b>The history could not be loaded.</b><p>{state.error}</p>
          <button type="button" className="btn" onClick={() => onLoadFrom(state)} data-testid="c360-history-retry">Retry</button></div>
      </div>
    );
  }
  const empty = state.entries.length === 0 && <p className="c360-empty" data-testid="c360-history-empty">{emptyMessage(filter)}</p>;
  if (!state.complete) {
    return <>{empty}<button type="button" className="btn c360-more" onClick={() => onLoadFrom(state)} data-testid="c360-history-more">Load more</button></>;
  }
  return empty || <p className="c360-hint" data-testid="c360-history-end">End of history</p>;
}

function FilterTabs({ filters, active, counts, onChoose }: { filters: readonly HistoryFilter[]; active: HistoryFilter; counts: HistoryCounts | undefined; onChoose: (filter: HistoryFilter) => void }) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next = filters[(index + (event.key === 'ArrowRight' ? 1 : filters.length - 1)) % filters.length]!;
    onChoose(next);
    (event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-filter="${next}"]`))?.focus();
  };
  return (
    <div className="c360-filters" role="tablist" aria-label="History filters" data-testid="c360-history-filters">
      {filters.map((filter, index) => (
        <button
          key={filter} type="button" role="tab" aria-selected={filter === active} tabIndex={filter === active ? 0 : -1}
          className={filter === active ? 'c360-filter active' : 'c360-filter'} onClick={() => onChoose(filter)} onKeyDown={event => move(event, index)}
          data-filter={filter} data-testid={`c360-filter-${filter}`}
        >
          {FILTER_LABELS[filter]}{counts?.[filter] !== undefined ? ` · ${counts[filter]}` : ''}
        </button>
      ))}
    </div>
  );
}

function emptyMessage(filter: HistoryFilter): string {
  const messages: Readonly<Record<HistoryFilter, string>> = {
    all: 'No collection activity has been recorded for this customer.',
    actions: 'No collection action has been recorded.',
    ptp: 'No Promise to Pay has been recorded.',
    communications: 'No SMS, WhatsApp or email has been recorded.',
    complaint: 'No Complaint or Dispute has been recorded.',
    legal: 'No Legal hand-off has been recorded.',
    deceased: 'No Deceased / Insurance review has been recorded.',
  };
  return messages[filter];
}

/**
 * One timeline entry: a dot on the line coloured by the badge's tone, then what happened · badge ·
 * when, the detail, and where (type · unit · case · who). The whole entry is one button that opens
 * the record in the side pane.
 */
function HistoryRow({ entry, context, onOpen }: { entry: HistoryEntry; context: EntryContext; onOpen: () => void }) {
  const badge = badgeFor(entry);
  const detail = detailOf(entry);
  return (
    <li className="c360-entry" data-testid="c360-history-item" data-category={entry.category} data-tone={badge?.tone ?? 'neutral'}>
      <button type="button" className="c360-entry-open" onClick={onOpen} aria-haspopup="dialog" data-testid="c360-history-open">
        <span className="c360-entry-line">
          <span className="c360-entry-what">{whatHappened(entry)}</span>
          {badge && <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
          <time dateTime={entry.occurredAt}>{momentOf(entry.occurredAt)}</time>
        </span>
        {detail && <span className="c360-entry-detail">{detail}</span>}
        <span className="c360-entry-where">
          <span className="c360-entry-type">{typeOf(entry)}</span>
          {' · '}{context ? `${context.unit} · ${context.caseNumber}` : 'Case not recorded'}
          {' · '}<OwnerLabel ownerId={entry.recordedById} ownerName={entry.recordedBy} />
        </span>
      </button>
    </li>
  );
}
