import { useEffect, useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createStrategyActionQuery, createStrategyQuery,
  type StrategyActionQuery, type StrategyActionRow, type StrategyQuery, type StrategyRow,
} from '../data/configurationQueries.js';
import { loadActionPlan, type ActionPlan } from '../data/followUpQueries.js';
import {
  toPlanItem, toUnattributedItem, type CaseContext, type UnattributedItem,
} from '../data/actionPlanRows.js';
import { describeOriginLabel, type ActionPlanItem } from '@dcp/domain';
import {
  Card, EmptyState, Icon, InfoBanner, KpiRow, PendingPhaseNotice, formatCount, formatMoney, formatDate,
} from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';
import type { ViewDefinition } from '../shell/routes.js';

/**
 * Segmentation Matrix, Strategy Rules and Action Plan — the configuration, read.
 *
 * All three screens show the same underlying records from different angles, and all three are
 * read-only on purpose. **The thresholds are not here.** A strategy's DPD range, arrears band and
 * exposure band are shown as the organisation holds them; the decision they feed belongs to the QDB
 * Rule Engine, and the rule builder is preserved disabled rather than reimplemented in React.
 */

// ── Shared columns ───────────────────────────────────────────────────────────

const RANGE = (from: number | undefined, to: number | undefined, format: (v: number | undefined) => string) => {
  if (from === undefined && to === undefined) return 'any';
  return `${from === undefined ? '…' : format(from)} – ${to === undefined ? '…' : format(to)}`;
};

const STRATEGY_COLUMNS: readonly DataGridColumn<StrategyRow>[] = [
  { key: 'priority', header: 'Priority', width: '80px', render: r => formatCount(r.priority) },
  { key: 'code', header: 'Code', width: '130px', render: r => r.code },
  { key: 'name', header: 'Strategy', render: r => r.name },
  { key: 'dpd', header: 'DPD', width: '120px', render: r => RANGE(r.dpdFrom, r.dpdTo, formatCount) },
  { key: 'arrears', header: 'Arrears', width: '210px', render: r => RANGE(r.arrearsFrom, r.arrearsTo, formatMoney) },
  { key: 'exposure', header: 'Exposure', width: '210px', render: r => RANGE(r.exposureFrom, r.exposureTo, formatMoney) },
  { key: 'segment', header: 'Segment', width: '130px', render: r => r.customerType ?? 'any' },
  { key: 'risk', header: 'Risk', width: '110px', render: r => r.riskLevel ?? 'any' },
  { key: 'rule', header: 'Gated on', width: '150px', render: r => r.ruleCode ?? '—' },
  { key: 'state', header: 'State', width: '90px', render: r => (r.isActive ? 'Active' : 'Inactive') },
];

function useStrategies() {
  const { adapter } = useCrmSession();
  return useMemo(() => createStrategyQuery(adapter), [adapter]);
}

// ── Segmentation Matrix ──────────────────────────────────────────────────────

export function SegmentationView() {
  const fetchPage = useStrategies();
  const [activeOnly, setActiveOnly] = useState(true);
  const query = useMemo<StrategyQuery>(() => ({ activeOnly }), [activeOnly]);

  return (
    <div data-testid="view-buckets">
      <InfoBanner icon="strategy">
        Each row is one collection strategy and the portfolio segment it covers. <b>The criteria are
        configuration</b>, read from the organisation — no bucket, band or threshold is written into
        this application.
      </InfoBanner>
      <KpiRow items={[
        { label: 'Active strategies', value: '—', hint: 'Counted by the grid below' },
        { label: 'Buckets in use', value: '—', hint: 'Derived from published criteria (Phase 8)' },
        { label: 'Cases governed', value: '—', hint: 'Requires strategy resolution per case (Phase 8)' },
        { label: 'Uncovered combinations', value: '—', hint: 'A published-matrix analysis (Phase 8)' },
        { label: 'Last published', value: '—', hint: 'Publishing is Phase 8' },
      ]} />
      <Card
        title="Segmentation"
        subtitle="Strategy criteria as the organisation holds them, ordered by the priority that decides which one wins."
        actions={
          <label className="chip">
            <input
              type="checkbox" checked={activeOnly} data-testid="segmentation-active-only"
              onChange={event => setActiveOnly(event.target.checked)}
            />
            Active only
          </label>
        }
      >
        <DataGrid<StrategyRow, StrategyQuery>
          columns={STRATEGY_COLUMNS} fetchPage={fetchPage} query={query}
          rowKey={row => row.id} pageSize={50}
          emptyMessage="No collection strategy is configured in this organisation."
          data-testid="segmentation-grid"
        />
      </Card>
    </div>
  );
}

// ── Strategy Rules ───────────────────────────────────────────────────────────

const ACTION_COLUMNS: readonly DataGridColumn<StrategyActionRow>[] = [
  { key: 'sequence', header: 'Seq', width: '60px', render: r => formatCount(r.sequence) },
  { key: 'name', header: 'Action', render: r => r.name },
  { key: 'strategy', header: 'Strategy', width: '180px', render: r => r.strategyName ?? '—' },
  { key: 'trigger', header: 'Trigger', width: '140px', render: r => r.triggerEvent ?? '—' },
  { key: 'offset', header: 'Day', width: '70px', render: r => formatCount(r.dayOffset) },
  { key: 'channel', header: 'Channel', width: '120px', render: r => r.channel ?? '—' },
  { key: 'queue', header: 'Queue', width: '150px', render: r => r.queueName ?? '—' },
  { key: 'approval', header: 'Approval', width: '90px', render: r => (r.requiresApproval ? 'Required' : '—') },
  { key: 'state', header: 'State', width: '90px', render: r => (r.isActive ? 'Active' : 'Inactive') },
];

export function StrategyRulesView({ view }: { view: ViewDefinition }) {
  const { adapter } = useCrmSession();
  const fetchStrategies = useStrategies();
  const fetchActions = useMemo(() => createStrategyActionQuery(adapter), [adapter]);
  const [selected, setSelected] = useState<StrategyRow | undefined>(undefined);

  const strategyQuery = useMemo<StrategyQuery>(() => ({}), []);
  const actionQuery = useMemo<StrategyActionQuery>(
    () => (selected ? { strategyId: selected.id } : {}),
    [selected],
  );

  return (
    <div data-testid="view-rules">
      <PendingPhaseNotice view={view} />
      <Card title="Strategies" subtitle="Select a strategy to see the actions it resolves to.">
        <DataGrid<StrategyRow, StrategyQuery>
          columns={STRATEGY_COLUMNS} fetchPage={fetchStrategies} query={strategyQuery}
          rowKey={row => row.id} pageSize={50} height={320}
          onRowClick={row => setSelected(row)}
          emptyMessage="No collection strategy is configured in this organisation."
          data-testid="rules-grid"
        />
      </Card>

      <Card
        title={selected ? `Actions — ${selected.name}` : 'Actions — all strategies'}
        subtitle="What the strategy does once it applies. Authoring these is Phase 8."
        actions={selected ? <button type="button" className="btn" onClick={() => setSelected(undefined)}>Show all</button> : undefined}
      >
        <DataGrid<StrategyActionRow, StrategyActionQuery>
          columns={ACTION_COLUMNS} fetchPage={fetchActions} query={actionQuery}
          rowKey={row => row.id} pageSize={50} height={320}
          emptyMessage="No strategy action is configured for this selection."
          data-testid="rule-actions-grid"
        />
      </Card>

      <RuleBuilderPlaceholder />
    </div>
  );
}

/**
 * The approved rule builder, preserved and disabled.
 *
 * It stays visible because removing it would quietly shrink the approved design, and it stays
 * disabled because a threshold edited here would put collection policy in two places. Phase 8 wires
 * it to the Rule Engine, which is where the thresholds actually live.
 */
function RuleBuilderPlaceholder() {
  return (
    <Card title="Rule builder" subtitle="Preserved from the approved design and deliberately disabled.">
      <fieldset className="field-grid" disabled data-testid="rule-builder">
        <legend>When all of these are true</legend>
        <div className="action-row">
          <select className="fluent-select"><option>Bucket</option></select>
          <select className="fluent-select"><option>is</option></select>
          <input className="fluent-input" type="text" placeholder="value" />
        </div>
        <legend>Then do this</legend>
        <div className="action-row">
          <select className="fluent-select"><option>Action</option></select>
          <select className="fluent-select"><option>Channel</option></select>
        </div>
      </fieldset>
      <p className="hint">
        Authoring belongs to Phase 8. The thresholds a rule compares against live in the QDB Rule
        Engine, never in this application.
      </p>
    </Card>
  );
}

// ── Action Plan ──────────────────────────────────────────────────────────────

const PLAN_COLUMNS: readonly DataGridColumn<StrategyActionRow>[] = [
  { key: 'sequence', header: 'Seq', width: '60px', render: r => formatCount(r.sequence) },
  { key: 'name', header: 'Recommended action', render: r => r.name },
  { key: 'strategy', header: 'Strategy', width: '180px', render: r => r.strategyName ?? '—' },
  { key: 'trigger', header: 'Trigger', width: '140px', render: r => r.triggerEvent ?? '—' },
  { key: 'channel', header: 'Channel', width: '120px', render: r => r.channel ?? '—' },
  { key: 'mandatory', header: 'Mandatory', width: '90px', render: r => (r.isMandatory ? 'Yes' : '—') },
  { key: 'sla', header: 'Escalate after', width: '120px', render: r => (r.escalationHours === undefined ? '—' : `${r.escalationHours} h`) },
];

/**
 * The plan for one case: what the strategy asked for, and the work that answers it.
 *
 * **Answering is proven.** An activity appears against a planned action only when it carries that
 * action's id. Phase 6 matched by Activity Type and said so on the screen, because no link existed;
 * the link exists now (**KI-71 closed**), so the screen states what the record establishes instead
 * of hedging about what it cannot.
 *
 * Work created before Phase 8 records no origin. It is shown below the plan as history, described
 * as *not recorded* — never as manual, which would be a claim about a person that nobody made.
 *
 * Due dates are shown only where QDB's turn-around-time policy can produce one. No start point is
 * configured on this organisation (KI-101), so the screen says the due date is not configured
 * rather than showing a date it invented or a blank that reads as a fault.
 */
export function CaseActionPlan({ caseId, strategyId, strategyName, episodeNumber }: {
  caseId: string;
  strategyId?: string | undefined;
  strategyName?: string | undefined;
  episodeNumber?: number | undefined;
}) {
  const { adapter } = useCrmSession();
  const [plan, setPlan] = useState<ActionPlan>({ rows: [], unattributed: [] });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    loadActionPlan(adapter, { caseId, ...(strategyId ? { strategyId } : {}) })
      .then(result => { if (!cancelled) { setPlan(result); setState('ready'); } })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(failure instanceof Error ? failure.message : String(failure));
        setState('error');
      });
    return () => { cancelled = true; };
  }, [adapter, caseId, strategyId]);

  const context = useMemo<CaseContext>(() => ({
    caseId,
    ...(episodeNumber !== undefined ? { episodeNumber } : {}),
    now: new Date(),
    formatDate,
  }), [caseId, episodeNumber]);

  const items = useMemo(
    () => plan.rows.map(row => toPlanItem(row, context)), [plan.rows, context]);
  const history = useMemo(
    () => plan.unattributed.map(
      activity => toUnattributedItem(activity, describeOriginLabel, formatDate)),
    [plan.unattributed]);

  if (state === 'loading') return <div className="empty-state" data-testid="actionplan-loading">Loading the plan…</div>;
  if (state === 'error') {
    return (
      <Card title="Action plan">
        <div className="info-banner bad" data-testid="actionplan-error">
          <Icon name="warn" />
          <div><b>The plan could not be read.</b><p>{error}</p></div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="Action plan"
        subtitle={strategyName ? `Resolved from ${strategyName}.` : 'Resolved from this case’s strategy.'}
      >
        {!strategyId
          ? (
            <EmptyState
              icon="strategy"
              message="No strategy has been resolved for this case, so there is no plan to show."
            />
          )
          : <PlanTable items={items} />}
      </Card>
      <UnattributedActivities items={history} />
    </>
  );
}

/** The plan, in an officer's words. Every cell is composed; none is derived in the markup. */
function PlanTable({ items }: { items: readonly ActionPlanItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon="check" message="This strategy defines no active actions." />;
  }
  return (
    <table className="grid" data-testid="case-actionplan">
      <thead>
        <tr>
          <th>Planned action</th>
          <th style={{ width: '170px' }}>Status</th>
          <th style={{ width: '190px' }}>Raised by</th>
          <th style={{ width: '150px' }}>With</th>
          <th style={{ width: '170px' }}>Due</th>
          <th style={{ width: '200px' }}>According to the strategy</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.key} data-testid={`plan-row-${item.key}`} data-current={String(item.isCurrent)}>
            <td>
              {item.action}
              {item.work && <span className="cell-sub">{item.work}</span>}
            </td>
            <td><span className={stateTone(item.state)}>{item.state}</span></td>
            <td>{item.origin}</td>
            <td>{item.owner}</td>
            <td>{item.due}</td>
            <td>{item.applicability}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Colour follows meaning, and an assignment problem is not an officer running late.
 *
 * "Assignment requires attention" is deliberately not the same tone as "Overdue": one is a routing
 * gap a supervisor fixes, the other is work somebody holds. Rendering them alike would hide the
 * first behind the second.
 */
function stateTone(state: string): string {
  if (state === 'Overdue' || state === 'Escalated') return 'pill bad';
  if (state === 'Assignment requires attention' || state === 'Awaiting assignment') return 'pill warn';
  if (state === 'Completed') return 'pill ok';
  if (state === 'No longer required' || state === 'Cancelled') return 'pill muted';
  return 'pill info';
}

/**
 * The case's other work, kept visible and attributed to nothing.
 *
 * These activities name no planned action. Most predate Phase 8 and record no origin at all, and
 * the screen says exactly that — the alternative, matching them to a planned action by type, is
 * the defect this release removed.
 */
function UnattributedActivities({ items }: { items: readonly UnattributedItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card
      title="Other recorded work"
      subtitle="Activity on this case that no planned action claims."
    >
      <table className="grid" data-testid="case-unattributed">
        <thead>
          <tr>
            <th>Activity</th>
            <th style={{ width: '220px' }}>Raised by</th>
            <th style={{ width: '140px' }}>Recorded</th>
            <th style={{ width: '140px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.key}>
              <td>{item.subject}</td>
              <td>{item.origin}</td>
              <td>{item.recordedOn}</td>
              <td>{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function ActionPlanView({ view }: { view: ViewDefinition }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createStrategyActionQuery(adapter), [adapter]);
  const query = useMemo<StrategyActionQuery>(() => ({ activeOnly: true }), []);

  return (
    <div data-testid="view-actionplan">
      <PendingPhaseNotice view={view} />
      <KpiRow items={[
        { label: 'Cases with a plan', value: '—', hint: 'Needs per-case strategy resolution (Phase 8)' },
        { label: 'Contact suppressed', value: '—', hint: 'Pending confirmation of the contact-hold source' },
        { label: 'Escalation advised', value: '—', hint: 'Phase 8' },
        { label: 'Reminders queued', value: '—', hint: 'Phase 6' },
      ]} />
      <Card
        title="Active plan actions"
        subtitle="Every action an active strategy can resolve to. Accepting and executing one is Phase 8."
      >
        <DataGrid<StrategyActionRow, StrategyActionQuery>
          columns={PLAN_COLUMNS} fetchPage={fetchPage} query={query}
          rowKey={row => row.id} pageSize={50}
          emptyMessage="No active strategy action is configured."
          data-testid="actionplan-grid"
        />
      </Card>
    </div>
  );
}

export { formatDate };
