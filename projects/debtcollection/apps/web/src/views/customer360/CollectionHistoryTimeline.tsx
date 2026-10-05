import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { HistoryCategory, HistoryEntry } from '@dcp/domain';
import {
  nextCustomerHistoryPage, startCustomerHistory, supportedCategories,
  type CustomerHistoryCursor, type HistoryCounts, type HistoryFilter,
} from '../../data/customerHistoryQueries.js';
import type { HistoryContext } from './useCustomer360Sections.js';
import { StatusBadge, statusBadgeTone, type BadgeTone } from '../../components/StatusBadge.js';
import { SkeletonLines } from '../../components/SectionBoundary.js';
import { formatMoney } from '../../components/primitives.js';
import { describeFailure } from '../../platform/errors.js';
import { useCrmSession } from '../../shell/context.js';
import { OwnerLabel } from './OwnerLabel.js';

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

/**
 * Everything recorded across the customer's cases, newest first, filtered and paged by the
 * platform. Changing the filter starts a new request and resets the list; an answer to an earlier
 * request — a slower page, or a page for the filter just left — is dropped, never shown.
 */
export function CollectionHistoryTimeline({ caseIds, history, counts, contextOf }: {
  caseIds: readonly string[]; history: HistoryContext; counts: HistoryCounts | undefined; contextOf: CaseContextLookup;
}) {
  const { adapter } = useCrmSession();
  const { types, messaging } = history;
  const filters = FILTER_ORDER.filter(filter => filter === 'all' || supportedCategories(types).includes(filter as HistoryCategory));
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [state, setState] = useState<HistoryState>({ entries: [], cursor: startCustomerHistory(messaging, 'all'), complete: false, status: 'loading' });
  const request = useRef(0);

  const load = useCallback((from: Loaded, chosen: HistoryFilter) => {
    const id = ++request.current;
    setState({ ...from, status: 'loading' });
    nextCustomerHistoryPage(adapter, { caseIds, filter: chosen, types, messaging }, from.cursor, HISTORY_PAGE)
      .then(page => { if (id === request.current) setState({ entries: [...from.entries, ...page.entries], cursor: page.cursor, complete: page.complete, status: 'ready' }); })
      .catch((error: unknown) => { if (id === request.current) setState({ ...from, status: 'error', error: describeFailure(error) }); });
  }, [adapter, caseIds, types, messaging]);

  useEffect(() => { load({ entries: [], cursor: startCustomerHistory(messaging, filter), complete: false }, filter); }, [load, filter, messaging]);

  return (
    <section className="section-card c360-history" aria-labelledby="c360-history-title" data-testid="c360-history-card">
      <h3 id="c360-history-title">Collection History</h3>
      <FilterTabs filters={filters} active={filter} counts={counts} onChoose={setFilter} />
      <ol className="c360-timeline" data-testid="c360-history" aria-live="polite">
        {state.entries.map(entry => <HistoryRow key={entry.id} entry={entry} context={contextOf(entry.caseId)} />)}
      </ol>
      {state.status === 'loading' && <div aria-busy="true" data-testid="c360-history-loading"><SkeletonLines lines={3} height={18} /></div>}
      {state.status === 'error' && (
        <div className="info-banner bad" role="alert" data-testid="c360-history-error">
          <div><b>The history could not be loaded.</b><p>{state.error}</p>
            <button type="button" className="btn" onClick={() => load(state, filter)} data-testid="c360-history-retry">Retry</button></div>
        </div>
      )}
      {state.status === 'ready' && state.entries.length === 0 && <p className="c360-empty" data-testid="c360-history-empty">{emptyMessage(filter)}</p>}
      {state.status === 'ready' && !state.complete && (
        <button type="button" className="btn c360-more" onClick={() => load(state, filter)} data-testid="c360-history-more">Load more</button>
      )}
      {state.status === 'ready' && state.complete && state.entries.length > 0 && <p className="c360-hint" data-testid="c360-history-end">End of history</p>}
    </section>
  );
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

/** Line 1: when · type · outcome badge. Line 2: what happened. Line 3: detail. Line 4: unit · case · who. */
function HistoryRow({ entry, context }: { entry: HistoryEntry; context: { unit: string; caseNumber: string } | undefined }) {
  const badge = badgeFor(entry);
  return (
    <li className="c360-entry" data-testid="c360-history-item" data-category={entry.category}>
      <div className="c360-entry-line">
        <time dateTime={entry.occurredAt}>{momentOf(entry.occurredAt)}</time>
        <span className="c360-entry-type">{typeOf(entry)}</span>
        {badge && <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
      </div>
      <p className="c360-entry-what">{whatHappened(entry)}</p>
      {detailOf(entry) && <p className="c360-entry-detail">{detailOf(entry)}</p>}
      <p className="c360-entry-where">
        {context ? `${context.unit} · ${context.caseNumber}` : 'Case not recorded'}
        {' · '}<OwnerLabel ownerId={entry.recordedById} ownerName={entry.recordedBy} />
      </p>
    </li>
  );
}

const MOMENT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const momentOf = (iso: string) => (Number.isNaN(Date.parse(iso)) ? '—' : MOMENT.format(new Date(iso)));

function typeOf(entry: HistoryEntry): string {
  if (entry.category === 'communications') return entry.channel;
  if (entry.externalReference) return entry.externalReference.process === 'Complaint' ? 'Complaint / Dispute' : 'Legal';
  return entry.channel;
}

/** A hand-off says where it went; everything else says what the record says. */
function whatHappened(entry: HistoryEntry): string {
  if (entry.externalReference?.process === 'Complaint') return 'Referred to BFD Case Management';
  if (entry.externalReference?.process === 'Legal') return 'Referred to BFD Legal';
  return entry.subject || entry.channel;
}

function detailOf(entry: HistoryEntry): string | undefined {
  const reference = entry.externalReference;
  if (reference) {
    const owner = reference.process === 'Complaint' ? 'BFD Case Management' : 'BFD Legal';
    return `External reference ${reference.recordNumber ?? 'not yet issued'} · Lifecycle owned by ${owner}`;
  }
  const parts = [entry.detail, entry.amount !== undefined && !entry.detail ? formatMoney(entry.amount) : undefined, entry.outcome && entry.status ? `Activity ${entry.status}` : undefined];
  return parts.filter(Boolean).join(' · ') || undefined;
}

/** The recorded outcome is the badge; the activity's own status goes to the detail line. */
function badgeFor(entry: HistoryEntry): { text: string; tone: BadgeTone } | undefined {
  if (entry.externalReference) return { text: entry.externalReference.process === 'Complaint' ? 'Complaint referral' : 'Legal referral', tone: 'referral' };
  if (entry.outcome) return { text: entry.outcome, tone: statusBadgeTone(entry.outcome) };
  if (entry.status) return { text: entry.status, tone: statusBadgeTone(entry.status) };
  return undefined;
}
