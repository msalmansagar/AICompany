import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HistoryEntry } from '@dcp/domain';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  loadCustomerAggregate, loadPromisePerformance,
  type CustomerAggregate, type FinancialUnit, type PromisePerformance,
} from '../data/customerAggregate.js';
import { nextCustomerHistoryPage, startCustomerHistory, type CustomerHistoryCursor } from '../data/customerHistoryQueries.js';
import { describeFinancialUnit, financialUnitTerms, financialUnitsHeading } from '../data/financialUnit.js';
import { createSnapshotQuery, type SnapshotQuery, type SnapshotRow } from '../data/caseQueries.js';
import { useNextAction } from '../data/useNextAction.js';
import { StoredPositionNotice } from '../components/Freshness.js';
import { Dialog } from '../components/forms.js';
import {
  BucketBar, BucketPill, Card, EmptyState, FieldList, Icon, InfoBanner, KpiRow, OrgBadge, StatusPill,
  formatCount, formatDate, formatDay, formatMoney,
} from '../components/primitives.js';
import { describeFailure } from '../platform/errors.js';
import { useCrmSession } from '../shell/context.js';
import { CaseCommandDialogs, type CaseCommandDialog } from './CaseCommandDialogs.js';
import { CustomersView } from './CustomersView.js';

/**
 * Customer 360 — one customer across Housing Loan and BFD, as a read model over records that exist
 * (user instruction, 2026-09-28). One screen serves both workspaces: V1 hosts it directly, V2 hosts
 * it inside its frame, and the business semantics are identical.
 *
 * A Housing Loan customer is a CRM contact whose delinquency sits on **loan accounts**; a BFD
 * customer is a CRM account whose delinquency sits on **facilities**. The screen aggregates the
 * customer's position across both kinds of unit while never collapsing them: each unit keeps its
 * own DPD and bucket, its own collection case and its own next planned action.
 *
 * What is shown is what the platform holds. There is no risk score, no KYC status, no eligibility
 * decision, no recommendation and no contact policy here, because none of those has a source. The
 * financial position is the last synchronised MIS position and is labelled as such: a live MIS read
 * is not integrated, and nothing this screen does writes collection state.
 */

const HISTORY_PAGE = 20;

export function Customer360View({ customerBusinessId, onOpenCase, onOpenCustomer }: {
  customerBusinessId?: string | undefined;
  onOpenCase?: (caseId: string) => void;
  onOpenCustomer?: (customerBusinessId: string) => void;
}) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; aggregate?: CustomerAggregate; error?: string }>({ status: customerBusinessId ? 'loading' : 'idle' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!customerBusinessId) { setState({ status: 'idle' }); return; }
    let cancelled = false;
    setState({ status: 'loading' });
    loadCustomerAggregate(adapter, customerBusinessId)
      .then(aggregate => { if (!cancelled) setState({ status: 'ready', aggregate }); })
      .catch((failure: unknown) => { if (!cancelled) setState({ status: 'error', error: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter, customerBusinessId, reloadKey]);

  if (!customerBusinessId) {
    return <CustomersView onOpenCustomer={id => onOpenCustomer?.(id)} onOpenCase={id => onOpenCase?.(id)} />;
  }
  if (state.status === 'loading') return <div className="empty-state" data-testid="customer-loading">Loading customer…</div>;
  if (state.status === 'error') {
    return <Card title="Customer 360"><EmptyState icon="warn" message={state.error ?? 'The customer could not be read.'} /></Card>;
  }
  if (!state.aggregate || state.aggregate.cases.length === 0) {
    return (
      <Card title="Customer 360">
        <EmptyState icon="users" message={`No collection case names customer ${customerBusinessId}, so there is nothing to aggregate.`} />
      </Card>
    );
  }
  return <Customer360 aggregate={state.aggregate} reloadKey={reloadKey} onSaved={() => setReloadKey(key => key + 1)} onOpenCase={id => onOpenCase?.(id)} />;
}

// ── The screen ───────────────────────────────────────────────────────────────

function Customer360({ aggregate, reloadKey, onSaved, onOpenCase }: {
  aggregate: CustomerAggregate; reloadKey: number; onSaved: () => void; onOpenCase: (caseId: string) => void;
}) {
  const [dialog, setDialog] = useState<CaseCommandDialog>(null);
  const [boundCaseId, setBoundCaseId] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState<CaseCommandDialog>(null);
  const openUnits = aggregate.financialUnits.filter(unit => unit.case.isOpen);

  /**
   * A case-bound command from the customer header: one open case is chosen for the officer; several
   * open cases ask the officer which loan account or facility the action concerns. Never a silent pick.
   */
  const command = (kind: CaseCommandDialog, caseId?: string) => {
    if (caseId) { setBoundCaseId(caseId); setDialog(kind); return; }
    if (openUnits.length === 1) { setBoundCaseId(openUnits[0]!.case.id); setDialog(kind); return; }
    setPicking(kind);
  };
  const noOpenCase = openUnits.length === 0 ? 'This customer has no open collection case.' : undefined;

  return (
    <div className="c360" data-testid="view-customer" data-customer-id={aggregate.customerBusinessId}>
      <CustomerHeader
        aggregate={aggregate}
        actions={(
          <>
            <HeaderCommand icon="add" label="Log action" onClick={() => command('activity')} disabledReason={noOpenCase} testId="c360-log-action" />
            <HeaderCommand icon="promise" label="Capture PTP" onClick={() => command('promise')} disabledReason={noOpenCase} testId="c360-capture-ptp" />
          </>
        )}
      />
      <div className="c360-grid">
        <div className="c360-main">
          <UnitsCard aggregate={aggregate} reloadKey={reloadKey} onOpenCase={onOpenCase} onCommand={command} />
          <HistoryCard aggregate={aggregate} reloadKey={reloadKey} />
        </div>
        <aside className="c360-side" aria-label="Supporting information">
          <ChannelPreferencesCard aggregate={aggregate} />
          <SnapshotsCard customerBusinessId={aggregate.customerBusinessId} />
        </aside>
      </div>

      {picking && (
        <CasePicker units={openUnits} onClose={() => setPicking(null)} onPick={unit => { setPicking(null); command(picking, unit.case.id); }} />
      )}
      <CaseCommandDialogs caseId={boundCaseId} dialog={dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onSaved(); }} />
    </div>
  );
}

function HeaderCommand({ icon, label, onClick, disabledReason, testId }: { icon: string; label: string; onClick: () => void; disabledReason?: string | undefined; testId: string }) {
  return (
    <button type="button" className="btn" onClick={disabledReason ? undefined : onClick} disabled={Boolean(disabledReason)} title={disabledReason ?? label} data-testid={testId}>
      <Icon name={icon} />{label}
    </button>
  );
}

// ── Identity and position ────────────────────────────────────────────────────

function CustomerHeader({ aggregate, actions }: { aggregate: CustomerAggregate; actions: ReactNode }) {
  const { adapter } = useCrmSession();
  const profile = aggregate.profile;
  const name = profile?.displayName ?? aggregate.customerBusinessId;
  const identifierLabel = profile?.table === 'contact' ? 'QID' : profile?.table === 'account' ? 'CR number' : 'Customer id';
  // The CRM tag already names the customer's own source; the source tags add information only when
  // the customer's units span more than one system, or when there is no CRM record to name one.
  const sources = [...new Set(aggregate.financialUnits.map(unit => financialUnitTerms(unit.organization).source))];
  const showSources = !profile || sources.length > 1;
  const caseIds = useMemo(() => aggregate.cases.map(c => c.id), [aggregate.cases]);
  const promises = usePromisePerformance(adapter, caseIds);
  const partial = aggregate.position.source === 'rows' && !aggregate.isComplete ? ' (partial)' : '';

  return (
    <section className="section-card c360-head" data-testid="c360-head">
      <div className="c360-identity">
        <span className="c360-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div className="c360-names">
          <h2 className="c360-name" data-testid="c360-name">{name}</h2>
          <div className="row-actions c360-tags" data-testid="c360-tags">
            {profile && <span className="pill plain info">{profile.table === 'contact' ? 'Housing Loan · contact' : 'BFD · account'}</span>}
            {!profile && <span className="pill plain warn">No linked CRM record</span>}
            {aggregate.segments.map(segment => <span key={segment} className="pill plain muted">{segment}</span>)}
            {showSources && sources.map(source => <span key={source} className="pill plain muted">{source}</span>)}
          </div>
          <p className="c360-sub" data-testid="c360-sub">
            {identifierLabel} {aggregate.customerBusinessId}
            {profile?.mobile ? ` · ${profile.mobile}` : ''}{profile?.phone ? ` · ${profile.phone}` : ''}{profile?.email ? ` · ${profile.email}` : ''}{profile?.city ? ` · ${profile.city}` : ''}
          </p>
        </div>
        <div className="c360-actions" role="toolbar" aria-label="Customer commands">{actions}</div>
      </div>
      <KpiRow items={[
        { label: `Total exposure${partial}`, value: formatMoney(aggregate.position.totalExposure), hint: 'Over open cases, summed by the platform' },
        { label: `Total overdue${partial}`, value: formatMoney(aggregate.position.totalOverdue), tone: 'warn' },
        { label: 'Worst DPD', value: formatCount(aggregate.position.worstDpd), hint: 'Across loan accounts and facilities' },
        { label: 'Open cases', value: formatCount(aggregate.position.openCases) },
        {
          label: 'Recorded PTP performance', value: describePromises(promises).value,
          hint: `${describePromises(promises).hint}Based on recorded Promise to Pay outcomes. Payment verification is not currently integrated.`,
          title: 'Based on recorded Promise to Pay outcomes. Payment verification is not currently integrated.',
        },
      ]} />
      <StoredPositionNotice asOf={aggregate.misAsOfDate} syncedOn={aggregate.lastMisSyncOn} />
    </section>
  );
}

function usePromisePerformance(adapter: Parameters<typeof loadPromisePerformance>[0], caseIds: readonly string[]): PromisePerformance | undefined {
  const [performance, setPerformance] = useState<PromisePerformance | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setPerformance(undefined);
    loadPromisePerformance(adapter, caseIds)
      .then(loaded => { if (!cancelled) setPerformance(loaded); })
      .catch(() => { if (!cancelled) setPerformance({}); });
    return () => { cancelled = true; };
  }, [adapter, caseIds]);
  return performance;
}

/** "1 of 3" with "recorded as kept" beside it; none recorded and unknown are said as themselves, never as zero. */
export function describePromises(performance: PromisePerformance | undefined): { value: string; hint: string } {
  if (!performance) return { value: '—', hint: '' };
  if (performance.recorded === undefined) return { value: 'Unknown', hint: '' };
  if (performance.recorded === 0) return { value: 'None recorded', hint: '' };
  return { value: `${formatCount(performance.kept)} of ${formatCount(performance.recorded)}`, hint: 'recorded as kept. ' };
}

// ── Loan accounts and facilities ─────────────────────────────────────────────

function UnitsCard({ aggregate, reloadKey, onOpenCase, onCommand }: {
  aggregate: CustomerAggregate; reloadKey: number; onOpenCase: (caseId: string) => void; onCommand: (kind: CaseCommandDialog, caseId: string) => void;
}) {
  return (
    <Card
      title={financialUnitsHeading(aggregate.financialUnits.map(unit => unit.kind))}
      subtitle="The last synchronised MIS position of each unit, with its collection case and the next planned action from that case's action plan."
    >
      {!aggregate.isComplete && (
        <InfoBanner icon="warn">This customer has more cases than one read returns, so the units below are those read.</InfoBanner>
      )}
      <ul className="c360-units" data-testid="c360-units">
        {aggregate.financialUnits.map(unit => (
          <UnitCard key={`${unit.sourceSystem}|${unit.unitNumber}`} unit={unit} reloadKey={reloadKey} onOpenCase={onOpenCase} onCommand={onCommand} />
        ))}
      </ul>
    </Card>
  );
}

function UnitCard({ unit, reloadKey, onOpenCase, onCommand }: {
  unit: FinancialUnit; reloadKey: number; onOpenCase: (caseId: string) => void; onCommand: (kind: CaseCommandDialog, caseId: string) => void;
}) {
  const terms = financialUnitTerms(unit.organization);
  const closed = unit.case.isOpen ? undefined : 'This case is closed.';
  return (
    <li className="c360-unit" data-testid="c360-unit" data-unit={unit.unitNumber} data-kind={unit.kind}>
      <div className="c360-unit-head">
        <BucketBar bucket={unit.bucket} />
        <div className="c360-unit-names">
          <p className="c360-unit-eyebrow"><OrgBadge org={unit.organization} /> {terms.source} · {terms.noun}</p>
          <h3 className="c360-unit-title">{unit.productDescription ?? terms.noun}</h3>
          <p className="c360-unit-number" data-testid="c360-unit-number">{terms.noun}: {unit.unitNumber}</p>
        </div>
        <BucketPill bucket={unit.bucket} />
      </div>
      <FieldList testId="c360-unit-position" fields={[
        { label: terms.balanceLabel, value: formatMoney(unit.loanBalance) },
        { label: 'Overdue', value: formatMoney(unit.totalArrears) },
        { label: 'DPD', value: formatCount(unit.dpd) },
        { label: 'Bucket', value: unit.bucket ?? '—' },
        { label: 'Case', value: <span className="row-actions"><button type="button" className="link-cell c360-link" onClick={() => onOpenCase(unit.case.id)} data-testid="c360-unit-case">{unit.case.caseNumber}</button><StatusPill status={unit.case.status} /></span> },
        { label: 'Owner', value: unit.case.ownerName ?? '—' },
      ]} />
      <NextPlannedAction unit={unit} reloadKey={reloadKey} />
      <div className="action-row c360-unit-actions" role="toolbar" aria-label={`Commands for ${terms.noun} ${unit.unitNumber}`}>
        <button type="button" className="btn primary" onClick={() => onOpenCase(unit.case.id)} data-testid="c360-unit-open">Open case</button>
        <button type="button" className="btn" onClick={closed ? undefined : () => onCommand('activity', unit.case.id)} disabled={Boolean(closed)} title={closed ?? 'Log action'} data-testid="c360-unit-log-action"><Icon name="add" />Log action</button>
        <button type="button" className="btn" onClick={closed ? undefined : () => onCommand('promise', unit.case.id)} disabled={Boolean(closed)} title={closed ?? 'Capture PTP'} data-testid="c360-unit-capture-ptp"><Icon name="promise" />Capture PTP</button>
      </div>
    </li>
  );
}

/** From the case's action plan, in the strategy's sequence — a planned action, not a recommendation. */
function NextPlannedAction({ unit, reloadKey }: { unit: FinancialUnit; reloadKey: number }) {
  const state = useNextAction(unit.case.id, unit.case.strategyId, unit.case.episodeNumber, reloadKey);
  return (
    <div className="c360-next" data-testid="c360-next">
      <span className="c360-next-label">Next planned action</span>
      {state.status === 'loading' && <span className="hint">Reading the action plan…</span>}
      {state.status === 'error' && <span className="hint">The action plan could not be read.</span>}
      {state.status === 'ready' && state.next && (
        <span className="c360-next-value">
          <b>{state.next.action}</b> · {state.next.state} · due: {state.next.due}{state.next.owner ? ` · ${state.next.owner}` : ''}
          {state.outstanding > 1 ? ` · ${state.outstanding - 1} more outstanding` : ''}
        </span>
      )}
      {state.status === 'ready' && !state.next && (
        <span className="hint">{unit.case.strategyId ? 'No planned action is outstanding on this case.' : 'No strategy has been resolved for this case.'}</span>
      )}
    </div>
  );
}

// ── Choosing the case a customer-level command concerns ──────────────────────

function CasePicker({ units, onClose, onPick }: { units: readonly FinancialUnit[]; onClose: () => void; onPick: (unit: FinancialUnit) => void }) {
  return (
    <Dialog title="Which case?" subtitle="This customer has more than one open collection case. Choose the loan account or facility the action concerns." onClose={onClose} testId="c360-case-picker" footer={<button type="button" className="btn" onClick={onClose}>Cancel</button>}>
      <ul className="c360-picker" data-testid="c360-case-options">
        {units.map(unit => {
          const terms = financialUnitTerms(unit.organization);
          return (
            <li key={unit.case.id}>
              <button type="button" className="c360-picker-option" onClick={() => onPick(unit)} data-testid={`c360-pick-${unit.case.id}`}>
                <span className="two-line">
                  <span className="two-line-main">{terms.source} {terms.noun} {unit.unitNumber}</span>
                  <span className="two-line-sub">{unit.case.caseNumber} · {formatMoney(unit.totalArrears)} overdue · {formatCount(unit.dpd)} DPD</span>
                </span>
                <Icon name="forward" />
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

// ── Collection history across the customer's cases ───────────────────────────

type HistoryState = { entries: readonly HistoryEntry[]; cursor: CustomerHistoryCursor; complete: boolean; status: 'loading' | 'ready' | 'error' };

function HistoryCard({ aggregate, reloadKey }: { aggregate: CustomerAggregate; reloadKey: number }) {
  const { adapter } = useCrmSession();
  const caseIds = useMemo(() => aggregate.cases.map(c => c.id), [aggregate.cases]);
  const unitOf = useMemo(() => new Map(aggregate.cases.map(c => [c.id, { caseNumber: c.caseNumber, unit: describeFinancialUnit(c.organization, c.facilityNumber) }])), [aggregate.cases]);
  const [history, setHistory] = useState<HistoryState>({ entries: [], cursor: startCustomerHistory(), complete: false, status: 'loading' });

  const loadMore = (from: HistoryState) => {
    setHistory({ ...from, status: 'loading' });
    return nextCustomerHistoryPage(adapter, caseIds, from.cursor, HISTORY_PAGE)
      .then(page => setHistory({ entries: [...from.entries, ...page.entries], cursor: page.cursor, complete: page.complete, status: 'ready' }))
      .catch(() => setHistory({ ...from, status: 'error' }));
  };

  useEffect(() => {
    let cancelled = false;
    const fresh: HistoryState = { entries: [], cursor: startCustomerHistory(), complete: false, status: 'loading' };
    setHistory(fresh);
    nextCustomerHistoryPage(adapter, caseIds, fresh.cursor, HISTORY_PAGE)
      .then(page => { if (!cancelled) setHistory({ entries: page.entries, cursor: page.cursor, complete: page.complete, status: 'ready' }); })
      .catch(() => { if (!cancelled) setHistory({ ...fresh, status: 'error' }); });
    return () => { cancelled = true; };
  }, [adapter, caseIds, reloadKey]);

  return (
    <Card title="Collection history" subtitle="Every recorded action, promise and message across this customer's cases, newest first. Each entry names the loan account or facility it concerns.">
      {history.status === 'error' && <InfoBanner icon="warn">The history could not be read. Try again.</InfoBanner>}
      {history.status === 'ready' && history.entries.length === 0 && <EmptyState icon="history" message="No collection activity has been recorded for this customer." />}
      <ol className="timeline c360-timeline" data-testid="c360-history">
        {history.entries.map(entry => <HistoryItem key={entry.id} entry={entry} context={entry.caseId ? unitOf.get(entry.caseId) : undefined} />)}
      </ol>
      <div className="action-row">
        {history.status === 'loading' && <span className="hint" data-testid="c360-history-loading">Loading history…</span>}
        {history.status !== 'loading' && !history.complete && (
          <button type="button" className="btn" onClick={() => loadMore(history)} data-testid="c360-history-more">Load more</button>
        )}
        {history.complete && history.entries.length > 0 && <span className="hint" data-testid="c360-history-end">{history.entries.length} shown — end of history</span>}
      </div>
    </Card>
  );
}

function HistoryItem({ entry, context }: { entry: HistoryEntry; context?: { caseNumber: string; unit: string } | undefined }) {
  const tone = entry.source === 'activity' && /kept/i.test(entry.detail ?? '') ? 'ok' : entry.source === 'activity' && /broken/i.test(entry.detail ?? '') ? 'bad' : entry.source === 'activity' ? 'warn' : 'info';
  return (
    <li className="tl-item" data-testid="c360-history-item" data-source={entry.source}>
      <span className={`tl-dot ${tone}`} aria-hidden="true"><Icon name={entry.source === 'activity' ? 'check' : entry.source === 'email' ? 'mail' : 'sms'} /></span>
      <div className="tl-body">
        <div className="tl-head">
          <span className="tl-title">{entry.channel}{entry.subject ? ` — ${entry.subject}` : ''}</span>
          {entry.status && <span className="pill plain muted">{entry.status}</span>}
          <span className="tl-when">{formatMoment(entry.occurredAt)}</span>
        </div>
        {entry.detail && <div className="tl-meta c360-detail">{entry.detail}</div>}
        <div className="tl-meta">
          {context ? `Case ${context.caseNumber} · ${context.unit}` : 'Case not recorded'}
          {entry.recordedBy ? ` · ${entry.recordedBy}` : ''}
          {entry.direction !== 'unknown' ? ` · ${entry.direction}` : ''}
        </div>
      </div>
    </li>
  );
}

// ── Supporting information ───────────────────────────────────────────────────

function ChannelPreferencesCard({ aggregate }: { aggregate: CustomerAggregate }) {
  const profile = aggregate.profile;
  return (
    <Card title="Channel preferences" subtitle="The CRM's own do-not-contact settings. These are not a collections contact hold.">
      {!profile && <EmptyState icon="users" message="No linked CRM record, so no channel preferences are recorded." />}
      {profile && (
        <FieldList testId="c360-prefs" fields={[
          { label: 'Phone', value: profile.restrictions.doNotPhone ? 'Do not phone' : 'Allowed' },
          { label: 'Email', value: profile.restrictions.doNotEmail ? 'Do not email' : 'Allowed' },
          { label: 'SMS / WhatsApp channel', value: profile.restrictions.doNotFax ? 'Do not use' : 'Allowed' },
        ]} />
      )}
    </Card>
  );
}

const SNAPSHOT_COLUMNS: readonly DataGridColumn<SnapshotRow>[] = [
  { key: 'date', header: 'As of', width: '110px', render: r => <span className="row-lead"><BucketBar bucket={r.bucket} />{formatDate(r.snapshotDate)}</span> },
  { key: 'unit', header: 'Unit', render: r => describeFinancialUnit(r.sourceSystem, r.facilityNumber) },
  { key: 'dpd', header: 'DPD', width: '64px', numeric: true, render: r => formatCount(r.dpd) },
  { key: 'bucket', header: 'Bucket', width: '100px', render: r => <BucketPill bucket={r.bucket} /> },
  { key: 'arrears', header: 'Arrears', width: '120px', numeric: true, render: r => formatMoney(r.totalArrears) },
  { key: 'balance', header: 'Balance', width: '120px', numeric: true, render: r => formatMoney(r.loanBalance) },
];

/** The MIS delinquency history — financial observations, kept apart from the collection history. */
function SnapshotsCard({ customerBusinessId }: { customerBusinessId: string }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createSnapshotQuery(adapter), [adapter]);
  const query = useMemo<SnapshotQuery>(() => ({ customerBusinessId }), [customerBusinessId]);
  return (
    <Card title="Delinquency history" subtitle="Positions MIS reported for this customer's loan accounts and facilities. Stored values, not a live MIS read.">
      <DataGrid<SnapshotRow, SnapshotQuery>
        columns={SNAPSHOT_COLUMNS} fetchPage={fetchPage} query={query}
        rowKey={row => row.id} pageSize={25} height={300}
        emptyMessage="No MIS snapshot has been recorded for this customer."
        data-testid="customer-snapshots"
      />
    </Card>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

const MOMENT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "29 Sept 2026 · 14:45", in the officer's time zone; an absent or unreadable moment is an em dash. */
export function formatMoment(value: string | undefined): string {
  if (!value) return '—';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '—';
  return MOMENT.format(at).replace(/ /g, ' ').replace(/, /, ' · ');
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '·';
}

export { formatDay };
