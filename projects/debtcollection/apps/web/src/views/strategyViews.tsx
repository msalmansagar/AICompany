import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createStrategyActionQuery, createStrategyQuery,
  type StrategyActionQuery, type StrategyActionRow, type StrategyQuery, type StrategyRow,
} from '../data/configurationQueries.js';
import {
  Card, InfoBanner, KpiRow, PendingPhaseNotice, formatCount, formatMoney, formatDate,
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
          <label className="inline-toggle">
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
        actions={selected ? <button type="button" className="cmd-button" onClick={() => setSelected(undefined)}>Show all</button> : undefined}
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
      <fieldset className="rule-builder" disabled data-testid="rule-builder">
        <legend>When all of these are true</legend>
        <div className="rule-builder-row">
          <select><option>Bucket</option></select>
          <select><option>is</option></select>
          <input type="text" placeholder="value" />
        </div>
        <legend>Then do this</legend>
        <div className="rule-builder-row">
          <select><option>Action</option></select>
          <select><option>Channel</option></select>
        </div>
      </fieldset>
      <p className="pending-phase-note">
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

export function ActionPlanView({ view }: { view: ViewDefinition }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createStrategyActionQuery(adapter), [adapter]);
  const query = useMemo<StrategyActionQuery>(() => ({ activeOnly: true }), []);

  return (
    <div data-testid="view-actionplan">
      <PendingPhaseNotice view={view} />
      <KpiRow items={[
        { label: 'Cases with a plan', value: '—', hint: 'Needs per-case strategy resolution (Phase 8)' },
        { label: 'Contact suppressed', value: '—', hint: 'Pending QDB confirmation of the contact-hold source (KI-44)' },
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
