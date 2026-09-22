import { useEffect, useMemo, useState } from 'react';
import { describeFailure } from '../platform/errors.js';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createStrategyActionQuery, createStrategyQuery,
  type StrategyActionQuery, type StrategyActionRow, type StrategyQuery, type StrategyRow,
} from '../data/configurationQueries.js';
import { loadActionPlan, type ActionPlan } from '../data/followUpQueries.js';
import {
  toPlanItem, toUnattributedItem, type CaseContext, type UnattributedItem,
} from '../data/actionPlanRows.js';
import {
  describeOriginLabel, litigationExists,
  type ActionPlanItem, type ConcernRow, type DeceasedReviewRow,
  type LegalWorkState, type LegalWorkStateName,
} from '@dcp/domain';
import { loadCaseLegalTraces, type LegalTraceRow } from '../data/caseLegalTraces.js';
import { loadCaseConcerns, type CaseConcerns as CaseConcernsData } from '../data/caseConcerns.js';
import { findDeceasedTypeId, loadDeceasedReviewRow, recordDeceasedReview } from '../data/deceasedQueries.js';
import {
  Card, EmptyState, Icon, InfoBanner, KpiRow, PartialCapabilityNotice, formatCount, formatMoney, formatDate,
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
      <PartialCapabilityNotice view={view} />
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
export function CaseActionPlan({ caseId, strategyId, strategyName, episodeNumber, customer }: {
  caseId: string;
  strategyId?: string | undefined;
  strategyName?: string | undefined;
  episodeNumber?: number | undefined;
  customer?: { table?: 'account' | 'contact'; id?: string } | undefined;
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
        setError(describeFailure(failure));
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
      <CaseLegalTrace caseId={caseId} episodeNumber={episodeNumber} customer={customer} />
      <CaseConcerns caseId={caseId} />
      <CaseDeceasedReview caseId={caseId} />
    </>
  );
}

/**
 * The QCB deceased indication, and whether anyone has reviewed it.
 *
 * **It never says a customer is deceased.** The indication arrives from the Qatar Central Bank
 * through the MIS extract, and nothing establishes whether it means a verified death, a reported
 * one, or an operational marker (KI-124). So the card says *verification required* and shows who,
 * if anyone, is looking — which is all DCP actually knows.
 *
 * **There is no insurance here.** The configured activity type is labelled *Deceased / Insurance*,
 * but WP15 found no credit-life, death-benefit or mortgage-protection process anywhere; the claims
 * entities that exist are credit guarantees and trade insurance, a different product family
 * (KI-125). The word in the label is not evidence, and nothing on this card names a policy, an
 * insurer, a claim or an eligibility.
 *
 * **Seeing it changes nothing.** No collection is paused, no message suppressed, no Legal touched,
 * no delinquency altered and no case closed — every one of those is an open QDB policy question
 * (KI-127), and the card is a view, not a trigger.
 */
export function CaseDeceasedReview({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const [row, setRow] = useState<DeceasedReviewRow | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setRow(null);
    loadDeceasedReviewRow(adapter, caseId)
      .then(result => { if (!cancelled) { setRow(result); setState('ready'); } })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(describeFailure(failure));
        setState('error');
      });
    // Cancelling on a case change is what stops a slow read painting one case's indication over
    // another's — the most dangerous stale value on this screen.
    return () => { cancelled = true; };
  }, [adapter, caseId, reload]);

  /**
   * Starts the review, and asks the card to read itself again.
   *
   * The write is idempotent at a derived id, so a second click — or two officers at once — reaches
   * the same record and the platform refuses the duplicate. Nothing is assumed about the outcome:
   * the card re-reads rather than patching its own state from what it hoped happened.
   */
  const startReview = async (facilityNumber: string): Promise<void> => {
    setStarting(true);
    try {
      const activityTypeId = await findDeceasedTypeId(adapter);
      if (!activityTypeId) {
        setError('No activity type is configured for deceased reviews, so one cannot be recorded.');
        setState('error');
        return;
      }
      await recordDeceasedReview(adapter, { caseId, facilityNumber, activityTypeId });
      setReload(previous => previous + 1);
    } catch (failure: unknown) {
      setError(describeFailure(failure));
      setState('error');
    } finally {
      setStarting(false);
    }
  };

  if (state === 'loading') {
    return <div className="empty-state" data-testid="deceased-loading">Loading…</div>;
  }
  if (state === 'error') {
    return (
      <Card title="Deceased review">
        <div className="info-banner bad" data-testid="deceased-error">
          <Icon name="warn" />
          <div><b>This could not be read.</b><p>{error}</p></div>
        </div>
      </Card>
    );
  }
  // Nothing to show where there is no indication and no review. An empty card would imply the
  // question had been asked and answered.
  if (!row || row.state === 'NoIndication') return null;

  return (
    <Card
      title="Deceased review"
      subtitle="An indication from the Qatar Central Bank that needs checking. It changes nothing about collection by itself."
    >
      <table className="grid" data-testid="case-deceased">
        <thead>
          <tr>
            <th>Indication</th>
            <th style={{ width: '230px' }}>Source</th>
            <th style={{ width: '110px' }}>As of</th>
            <th style={{ width: '160px' }}>Review</th>
            <th style={{ width: '150px' }}>With</th>
            <th style={{ width: '190px' }}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr data-testid="deceased-row" data-state={row.state}
            data-can-start-review={String(row.canStartReview)}>
            <td>{row.indication}</td>
            <td>{row.source}</td>
            <td>{row.asOf}</td>
            <td><span className={deceasedTone(row.state)}>{row.label}</span></td>
            <td>{row.ownerName}</td>
            <td>{row.reviewOutcome}</td>
          </tr>
        </tbody>
      </table>
      {row.canStartReview && row.facilityNumber && (
        <div className="row-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="deceased-start-review"
            disabled={starting}
            onClick={() => { void startReview(row.facilityNumber!); }}
          >
            {starting ? 'Recording…' : 'Record deceased review'}
          </button>
        </div>
      )}
      <InfoBanner>
        Check who this customer is with before contacting them. There is no agreed handling rule
        for this indication yet, so collection, messages and legal action are unchanged. Recording
        a review says someone is checking — never that the customer has died.
      </InfoBanner>
    </Card>
  );
}

/**
 * Tone follows how settled the question is.
 *
 * An unreviewed indication is deliberately **not** muted: it is the state that most needs an
 * officer to stop and check, and muting it would make it look like housekeeping.
 */
function deceasedTone(state: DeceasedReviewRow['state']): string {
  if (state === 'AwaitingReview') return 'pill warn';
  if (state === 'UnderReview') return 'pill info';
  if (state === 'ReviewRecorded') return 'pill ok';
  return 'pill muted';
}

/**
 * Collection Disputes and formal Customer Complaints, on one screen and never in one list.
 *
 * QDB treats these as different business concepts, and the screen makes the difference obvious:
 * two tables, two headings, two vocabularies. A dispute names the collection information the
 * customer contests; a Complaint names Case Management's own Case number and status.
 *
 * **There is no combined "Complaint / Dispute" action**, even though the underlying activity type
 * still carries that label (KI-118). The label is configuration; it is not the model.
 *
 * Nothing here pauses collection, suppresses a message, touches delinquency or changes the case —
 * recording either concern changes no collection behaviour, because no QDB policy says it should
 * (KI-119).
 */
export function CaseConcerns({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const [concerns, setConcerns] = useState<CaseConcernsData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setConcerns(null);
    loadCaseConcerns(adapter, caseId)
      .then(result => { if (!cancelled) { setConcerns(result); setState('ready'); } })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(describeFailure(failure));
        setState('error');
      });
    // Cancelling on a case change is what stops a slow read painting the previous case's
    // complaints over the new one.
    return () => { cancelled = true; };
  }, [adapter, caseId]);

  if (state === 'loading') {
    return <div className="empty-state" data-testid="concerns-loading">Loading disputes…</div>;
  }
  if (state === 'error') {
    return (
      <Card title="Disputes and complaints">
        <div className="info-banner bad" data-testid="concerns-error">
          <Icon name="warn" />
          <div><b>This could not be read.</b><p>{error}</p></div>
        </div>
      </Card>
    );
  }
  if (!concerns || (concerns.disputes.length === 0 && concerns.complaints.length === 0)) return null;

  return (
    <>
      {concerns.disputes.length > 0 && (
        <Card
          title="Collection disputes"
          subtitle="Collection information this customer contests. Recording one changes nothing about collection."
        >
          <ConcernTable
            rows={concerns.disputes}
            firstHeading="Disputed information"
            secondHeading="Detail"
            testId="case-disputes"
          />
        </Card>
      )}
      {concerns.complaints.length > 0 && (
        <Card
          title="Customer complaints"
          subtitle="Formal complaints raised for this customer. The complaints team owns these; this is a view of them."
        >
          <ConcernTable
            rows={concerns.complaints}
            firstHeading="Complaint"
            secondHeading="Kind"
            testId="case-complaints"
          />
        </Card>
      )}
    </>
  );
}

/**
 * A complaint's status is Case Management's; a dispute's is DCP's own.
 *
 * Kept out of the `className` expression deliberately. A comparison inline there reads as a class
 * name to anything scanning the source — the style contract flagged `CustomerComplaint` as a
 * class with no rule behind it, which was fair.
 */
function concernTone(concern: ConcernRow['concern']): string {
  return concern === 'CustomerComplaint' ? 'pill info' : 'pill muted';
}

/** One concern list. The same shape twice, with different headings, never merged into one table. */
function ConcernTable({ rows, firstHeading, secondHeading, testId }: {
  rows: readonly ConcernRow[];
  firstHeading: string;
  secondHeading: string;
  testId: string;
}) {
  return (
    <table className="grid" data-testid={testId}>
      <thead>
        <tr>
          <th>{firstHeading}</th>
          <th>{secondHeading}</th>
          <th style={{ width: '130px' }}>Recorded</th>
          <th style={{ width: '220px' }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key} data-testid={`concern-${row.concern}`} data-concern={row.concern}>
            <td>{row.heading}</td>
            <td>{row.detail}</td>
            <td>{row.recordedOn}</td>
            <td><span className={concernTone(row.concern)}>{row.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What QDB's Legal process says about this case.
 *
 * **A read-only window onto another process.** There is no control here that starts, advances,
 * approves, settles, closes, reassigns or escalates a Litigation Request — Legal owns its
 * lifecycle, and the Collection Workspace is not a second Legal application.
 *
 * There is also, deliberately, **no "Send to Legal" control**. WP9 proved a hand-off is technically
 * possible; nothing has established what qualifies a recommendation for one. A button here would
 * settle that question by shipping.
 *
 * The distinction the card exists to preserve is between *no Litigation Request* and *a Litigation
 * Request you cannot see*. On this organisation the second is what a real Collection Officer gets,
 * because no DCP security role holds read permission on the Legal entity.
 */
export function CaseLegalTrace({ caseId, episodeNumber, customer }: {
  caseId: string;
  episodeNumber?: number | undefined;
  /** The case's own customer. An account resolves for Legal; a contact does not (KI-108). */
  customer?: { table?: 'account' | 'contact'; id?: string } | undefined;
}) {
  const { adapter } = useCrmSession();
  const [rows, setRows] = useState<readonly LegalTraceRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setRows([]);
    loadCaseLegalTraces(adapter, caseId, episodeNumber, customer ?? {})
      .then(result => { if (!cancelled) { setRows(result); setState('ready'); } })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(describeFailure(failure));
        setState('error');
      });
    // Cancelling on a case change is what stops a slow read painting the previous case's Legal
    // information over the new one.
    return () => { cancelled = true; };
  }, [adapter, caseId, episodeNumber, customer?.table, customer?.id]);

  if (state === 'loading') {
    return <div className="empty-state" data-testid="legal-loading">Loading Legal…</div>;
  }
  if (state === 'error') {
    return (
      <Card title="Legal">
        <div className="info-banner bad" data-testid="legal-error">
          <Icon name="warn" />
          <div><b>Legal information could not be read.</b><p>{error}</p></div>
        </div>
      </Card>
    );
  }
  if (rows.length === 0) return null;

  return (
    <Card
      title="Legal"
      subtitle="What the Legal process records for this case. Legal owns these requests; this is a view of them."
    >
      <table className="grid" data-testid="case-legal">
        <thead>
          <tr>
            <th>Legal recommendation</th>
            <th style={{ width: '120px' }}>Recorded</th>
            <th style={{ width: '150px' }}>With</th>
            <th style={{ width: '180px' }}>Raised by</th>
            <th style={{ width: '250px' }}>Legal hand-off</th>
            <th style={{ width: '240px' }}>Legal request</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} data-testid={`legal-row-${row.key}`}
              data-current={String(row.trace.isCurrent)}
              data-handoff-available={String(row.trace.handoffAvailable)}>
              <td>
                {row.recommendation}
                <span className="cell-sub">{row.activityStatus}</span>
              </td>
              <td>{row.recordedOn}</td>
              <td>{row.ownerName}</td>
              <td>{row.origin}</td>
              <td><span className={legalTone(row.trace.state)}>{row.trace.label}</span></td>
              <td><LitigationCell trace={row.trace} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/**
 * The Litigation Request's own details, or an honest blank.
 *
 * The status shown is the Legal process's own label, passed through from the platform. Nothing
 * here maps, groups or re-interprets it — a second copy of Legal's 25 stages would drift the first
 * time Legal added one.
 */
function LitigationCell({ trace }: { trace: LegalWorkState }) {
  if (!trace.litigation) {
    return <span className="pill muted">{litigationExists(trace.state) ? 'Not shown' : '—'}</span>;
  }
  const { reference, status, customerName } = trace.litigation;
  return (
    <>
      <b>{reference}</b>
      <span className="cell-sub">{status ?? 'Status not recorded'}</span>
      {customerName && <span className="cell-sub">{customerName}</span>}
    </>
  );
}

/**
 * Colour follows meaning, and "cannot be seen" is not "does not exist".
 *
 * An inaccessible request is deliberately not muted like an absent one: muting it would make the
 * most dangerous state on this screen look like the most ordinary.
 */
function legalTone(state: LegalWorkStateName): string {
  if (state === 'LitigationVisible' || state === 'ReadyForHandoff') return 'pill ok';
  if (state === 'LitigationNotVisible' || state === 'LitigationLinkBroken'
    || state === 'LitigationUnavailable') return 'pill warn';
  if (state === 'CustomerResolutionRequired' || state === 'QualificationPending') return 'pill info';
  return 'pill muted';
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
      <PartialCapabilityNotice view={view} />
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
