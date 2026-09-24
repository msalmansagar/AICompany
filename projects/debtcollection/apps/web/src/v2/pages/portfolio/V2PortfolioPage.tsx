import { useEffect, useMemo, useRef, useState } from 'react';
import { createStrategyActionQuery, createStrategyQuery, type StrategyActionRow, type StrategyRow } from '../../../data/configurationQueries.js';
import { formatCount, formatDate, formatMoney } from '../../../components/primitives.js';
import { useCrmSession, useOrg, type OrganizationScope } from '../../../shell/context.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { Card, EmptyState, ErrorState, LoadingSkeleton } from '../../components/primitives.js';
import { FILTER_SEGMENT, encodeCaseListFilters } from '../../data/caseListFilterUrl.js';
import {
  BUCKET_ROWS, STRATEGY_NOT_ASSIGNED, cellKey, compactArrears, describeArrears, describeCell, loadFreshness,
  loadMatrix, shadeStep, type CellFigure, type Freshness, type MatrixCell, type MatrixColumn, type MatrixResult,
} from '../../data/portfolioMatrix.js';

/**
 * Portfolio & Strategy — where the delinquent book sits, and which strategy governs it.
 *
 * Three sections with three meanings, kept apart on purpose:
 *   **Portfolio distribution** — open cases by MIS bucket and resolved strategy, from one platform
 *   aggregate. What exists.
 *   **Strategies** — what QDB has configured. Read-only here; edited in CRM configuration.
 *   **Cases governed** — how many open cases each strategy is actually resolved on. What has happened.
 * Nothing on this page runs, applies or evaluates a strategy.
 *
 * Every populated cell opens Collection Cases under the same filter the cell was counted with.
 */

const LAST_CELL_KEY = 'dcp.v2.portfolio.lastCell';
const STRATEGY_PAGE = 200;

type MatrixState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; matrix: MatrixResult & { unbucketed: CellFigure } };

export function V2PortfolioPage() {
  const { adapter } = useCrmSession();
  const { scope } = useOrg();
  const { go } = useV2Shell();
  const [strategies, setStrategies] = useState<readonly StrategyRow[] | null>(null);
  const [state, setState] = useState<MatrixState>({ status: 'loading' });
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lastCell, setLastCell] = useState<string | null>(() => readLastCell());
  // A scope change asks a new question; an answer to the old one must not repaint the new matrix.
  const sequence = useRef(0);

  const fetchStrategies = useMemo(() => createStrategyQuery(adapter), [adapter]);

  useEffect(() => {
    let cancelled = false;
    fetchStrategies({ pageSize: STRATEGY_PAGE })
      .then(page => { if (!cancelled) setStrategies(page.items); })
      .catch(() => { if (!cancelled) setStrategies([]); });
    return () => { cancelled = true; };
  }, [fetchStrategies]);

  useEffect(() => {
    if (!strategies) return undefined;
    const mine = ++sequence.current;
    setState({ status: 'loading' });
    const options = strategies.map(s => ({ id: s.id, label: s.isActive ? s.name : `${s.name} (inactive)`, priority: s.priority }));
    void Promise.all([loadMatrix(adapter, scope, options), loadFreshness(adapter, scope)]).then(([matrix, fresh]) => {
      if (mine !== sequence.current) return;
      setFreshness(fresh);
      setState(matrix ? { status: 'ready', matrix } : { status: 'unavailable' });
    });
  }, [adapter, scope, strategies, attempt]);

  const openCell = (cell: MatrixCell, column: MatrixColumn) => {
    const key = cellKey(cell.bucket, cell.strategy);
    writeLastCell(key);
    setLastCell(key);
    go('cases', FILTER_SEGMENT, encodeCaseListFilters({
      bucket: cell.bucket,
      strategy: cell.strategy,
      ...(cell.strategy !== STRATEGY_NOT_ASSIGNED ? { strategyLabel: column.label } : {}),
      scope,
      from: 'portfolio',
    }));
  };

  return (
    <div className="v2-portfolio" data-testid="v2-portfolio">
      <Card
        title="Portfolio distribution"
        subtitle="Open cases by MIS delinquency bucket and resolved collection strategy. One case is one delinquent facility."
        actions={<FreshnessLine freshness={freshness} />}
        flush
        testId="v2-portfolio-matrix-card"
      >
        {state.status === 'loading' && <LoadingSkeleton rows={8} label="Aggregating the portfolio" testId="v2-portfolio-loading" />}
        {state.status === 'unavailable' && (
          <Unavailable columns={strategyColumns(strategies ?? [])} scope={scope} onOpen={openCell} onRetry={() => setAttempt(a => a + 1)} lastCell={lastCell} />
        )}
        {state.status === 'ready' && state.matrix.grandTotal.cases === 0 && state.matrix.unbucketed.cases === 0 && (
          <EmptyState
            title="No open cases are readable in this session."
            message="Either there are none in this CRM scope, or your security role does not allow reading them."
            testId="v2-portfolio-empty"
          />
        )}
        {state.status === 'ready' && (state.matrix.grandTotal.cases > 0 || state.matrix.unbucketed.cases > 0) && (
          <Matrix matrix={state.matrix} scope={scope} onOpen={openCell} lastCell={lastCell} />
        )}
      </Card>

      <Strategies strategies={strategies} matrix={state.status === 'ready' ? state.matrix : null} />
    </div>
  );
}

function FreshnessLine({ freshness }: { freshness: Freshness | null }) {
  if (!freshness?.asOf) return <span className="v2-freshness" data-testid="v2-portfolio-freshness">Stored MIS position — not a live MIS read</span>;
  const window = freshness.syncedFrom && freshness.syncedTo && freshness.syncedFrom.slice(0, 10) !== freshness.syncedTo.slice(0, 10)
    ? ` · synchronised ${formatDate(freshness.syncedFrom)} to ${formatDate(freshness.syncedTo)}`
    : freshness.syncedTo ? ` · synchronised ${formatDate(freshness.syncedTo)}` : '';
  return (
    <span className="v2-freshness" data-testid="v2-portfolio-freshness">
      Stored MIS position as of {formatDate(freshness.asOf)}{window} — not a live MIS read
    </span>
  );
}

function strategyColumns(strategies: readonly StrategyRow[]): MatrixColumn[] {
  const sorted = [...strategies].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
  return [
    ...sorted.map(s => ({ key: s.id, label: s.isActive ? s.name : `${s.name} (inactive)`, priority: s.priority })),
    { key: STRATEGY_NOT_ASSIGNED, label: 'Strategy Not Assigned' },
  ];
}

/** The platform did not answer. Cells stay openable — the list pages regardless — but no figure is claimed. */
function Unavailable({ columns, scope, onOpen, onRetry, lastCell }: {
  columns: readonly MatrixColumn[]; scope: OrganizationScope; onOpen: (cell: MatrixCell, column: MatrixColumn) => void;
  onRetry: () => void; lastCell: string | null;
}) {
  return (
    <>
      <ErrorState
        title="The portfolio could not be aggregated."
        message="The platform did not answer the count — it may have refused an aggregate over this many cases. Counts are unavailable, not zero; each cell still opens its cases, which are paged."
        onRetry={onRetry}
        testId="v2-portfolio-unavailable"
      />
      <MatrixTable columns={columns} scope={scope} onOpen={onOpen} lastCell={lastCell} figureOf={() => undefined} totals={null} />
    </>
  );
}

function Matrix({ matrix, scope, onOpen, lastCell }: {
  matrix: MatrixResult & { unbucketed: CellFigure }; scope: OrganizationScope;
  onOpen: (cell: MatrixCell, column: MatrixColumn) => void; lastCell: string | null;
}) {
  const maxArrears = Math.max(0, ...[...matrix.cells.values()].map(f => f.arrears));
  return (
    <>
      <MatrixTable
        columns={matrix.columns} scope={scope} onOpen={onOpen} lastCell={lastCell}
        figureOf={(bucket, key) => matrix.cells.get(cellKey(bucket, key)) ?? { cases: 0, arrears: 0 }}
        totals={matrix}
        maxArrears={maxArrears}
      />
      <div className="v2-matrix-foot">
        <span className="v2-legend" aria-label="Shade shows current arrears, from none to the largest cell">
          <span className="v2-legend-label">Shade = current arrears</span>
          {[1, 2, 3, 4, 5].map(step => <span key={step} className="v2-legend-swatch" data-shade={step} />)}
          <span className="v2-legend-max">up to {compactArrears(maxArrears)}</span>
        </span>
        {matrix.unbucketed.cases > 0 && (
          <span className="v2-muted" data-testid="v2-portfolio-unbucketed">
            {formatCount(matrix.unbucketed.cases)} open {matrix.unbucketed.cases === 1 ? 'case carries' : 'cases carry'} no MIS bucket and cannot be placed in a row.
          </span>
        )}
      </div>
    </>
  );
}

function MatrixTable({ columns, scope, onOpen, lastCell, figureOf, totals, maxArrears = 0 }: {
  columns: readonly MatrixColumn[];
  scope: OrganizationScope;
  onOpen: (cell: MatrixCell, column: MatrixColumn) => void;
  lastCell: string | null;
  /** The figure for a cell, or `undefined` when it is not known. */
  figureOf: (bucket: MatrixCell['bucket'], columnKey: string) => CellFigure | undefined;
  totals: MatrixResult | null;
  maxArrears?: number;
}) {
  return (
    <div className="v2-matrix-scroll">
      <table className="v2-matrix" data-testid="v2-portfolio-matrix">
        <thead>
          <tr>
            <th scope="col" className="v2-matrix-corner">DPD bucket</th>
            {columns.map(column => (
              <th key={column.key} scope="col" className="v2-matrix-col" data-column={column.key}>{column.label}</th>
            ))}
            <th scope="col" className="v2-matrix-col v2-matrix-total-col">Total</th>
          </tr>
        </thead>
        <tbody>
          {BUCKET_ROWS.map(bucket => (
            <tr key={bucket} data-testid={`v2-matrix-row-${bucket}`}>
              <th scope="row" className="v2-matrix-rowhead">{bucket} DPD</th>
              {columns.map(column => {
                const cell: MatrixCell = { bucket, strategy: column.key, scope };
                return (
                  <td key={column.key} className="v2-matrix-td">
                    <Cell cell={cell} column={column} figure={figureOf(bucket, column.key)} maxArrears={maxArrears}
                      isLast={lastCell === cellKey(bucket, column.key)} onOpen={onOpen} />
                  </td>
                );
              })}
              <td className="v2-matrix-td v2-matrix-total-col">
                <TotalCell figure={totals?.rowTotals.get(bucket) ?? (totals ? { cases: 0, arrears: 0 } : undefined)} />
              </td>
            </tr>
          ))}
          <tr className="v2-matrix-total-row" data-testid="v2-matrix-row-total">
            <th scope="row" className="v2-matrix-rowhead">Total</th>
            {columns.map(column => (
              <td key={column.key} className="v2-matrix-td">
                <TotalCell figure={totals?.columnTotals.get(column.key) ?? (totals ? { cases: 0, arrears: 0 } : undefined)} />
              </td>
            ))}
            <td className="v2-matrix-td v2-matrix-total-col"><TotalCell figure={totals?.grandTotal} isGrand /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell, column, figure, maxArrears, isLast, onOpen }: {
  cell: MatrixCell; column: MatrixColumn; figure: CellFigure | undefined; maxArrears: number; isLast: boolean;
  onOpen: (cell: MatrixCell, column: MatrixColumn) => void;
}) {
  const testId = `v2-cell-${cell.bucket}-${cell.strategy}`;
  if (figure === undefined) {
    return (
      <button
        type="button" className="v2-matrix-cell v2-matrix-cell-unknown" onClick={() => onOpen(cell, column)} data-testid={testId} data-state="unknown"
        aria-label={`${cell.bucket} DPD, ${column.label}, count unavailable. Open cases.`} title="Count unavailable — the platform did not answer. Opens the cases, which are paged."
      >
        <span className="v2-matrix-cell-count">—</span>
        <span className="v2-matrix-cell-sub">Count unavailable</span>
      </button>
    );
  }
  if (figure.cases === 0) {
    return (
      <span className="v2-matrix-cell v2-matrix-cell-zero" data-testid={testId} data-state="zero" aria-label={`${cell.bucket} DPD, ${column.label}, no cases`}>
        <span className="v2-matrix-cell-count">0</span>
      </span>
    );
  }
  return (
    <button
      type="button" className="v2-matrix-cell v2-matrix-cell-live" onClick={() => onOpen(cell, column)} data-testid={testId} data-state="populated"
      data-shade={shadeStep(figure.arrears, maxArrears)} aria-pressed={isLast}
      aria-label={describeCell(cell, column.label, figure)} title={`${formatCount(figure.cases)} cases · ${describeArrears(figure.arrears)} current arrears`}
    >
      <span className="v2-matrix-cell-count">{formatCount(figure.cases)}</span>
      <span className="v2-matrix-cell-sub">{compactArrears(figure.arrears)}</span>
      <span className="v2-matrix-cell-unit">arrears</span>
    </button>
  );
}

function TotalCell({ figure, isGrand = false }: { figure: CellFigure | undefined; isGrand?: boolean }) {
  if (!figure) return <span className="v2-matrix-cell v2-matrix-cell-total" data-state="unknown"><span className="v2-matrix-cell-count">—</span></span>;
  return (
    <span className={isGrand ? 'v2-matrix-cell v2-matrix-cell-total v2-matrix-cell-grand' : 'v2-matrix-cell v2-matrix-cell-total'} data-testid={isGrand ? 'v2-matrix-grand-total' : undefined}>
      <span className="v2-matrix-cell-count">{formatCount(figure.cases)}</span>
      <span className="v2-matrix-cell-sub">{compactArrears(figure.arrears)}</span>
    </span>
  );
}

// ── Strategies — configuration, and coverage from the same aggregate ─────────

function Strategies({ strategies, matrix }: { strategies: readonly StrategyRow[] | null; matrix: MatrixResult | null }) {
  const governed = (id: string) => matrix?.columnTotals.get(id);
  return (
    <Card
      title="Strategies"
      subtitle="What QDB has configured, in the priority that decides which one wins. Read-only here; edited in CRM configuration. Nothing on this page applies a strategy."
      flush
      testId="v2-strategies"
    >
      {strategies === null && <LoadingSkeleton rows={3} label="Loading strategies" />}
      {strategies !== null && strategies.length === 0 && (
        <EmptyState title="No collection strategy is configured in this organisation." message="Every open case is shown under Strategy Not Assigned." />
      )}
      {strategies !== null && strategies.length > 0 && (
        <table className="v2-strategy-table" data-testid="v2-strategy-table">
          <thead>
            <tr>
              <th scope="col">Priority</th><th scope="col">Strategy</th><th scope="col">Conditions</th><th scope="col">Gated on</th>
              <th scope="col">Effective</th><th scope="col">State</th><th scope="col" className="v2-num">Cases governed</th>
            </tr>
          </thead>
          <tbody>
            {[...strategies].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity)).map(strategy => (
              <StrategyRowView key={strategy.id} strategy={strategy} governed={governed(strategy.id)} matrixKnown={matrix !== null} />
            ))}
            <tr className="v2-strategy-unassigned" data-testid="v2-strategy-unassigned">
              <td>—</td>
              <td><span className="v2-strategy-name">Strategy Not Assigned</span><span className="v2-strategy-code">No resolved collection strategy is recorded for these cases.</span></td>
              <td colSpan={4} className="v2-muted">Not a strategy: the open cases no strategy is resolved on.</td>
              <td className="v2-num">{matrix ? formatCount(matrix.columnTotals.get(STRATEGY_NOT_ASSIGNED)?.cases ?? 0) : '—'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  );
}

function StrategyRowView({ strategy, governed, matrixKnown }: { strategy: StrategyRow; governed: CellFigure | undefined; matrixKnown: boolean }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <tr data-testid={`v2-strategy-${strategy.code}`}>
        <td className="v2-num">{formatCount(strategy.priority)}</td>
        <td>
          <button type="button" className="v2-strategy-toggle" aria-expanded={isOpen} onClick={() => setOpen(o => !o)} data-testid={`v2-strategy-toggle-${strategy.code}`}>
            <span className="v2-strategy-name">{strategy.name}</span>
            <span className="v2-strategy-code">{strategy.code}</span>
          </button>
        </td>
        <td className="v2-strategy-conditions">{describeConditions(strategy)}</td>
        <td>{strategy.ruleCode ?? '—'}</td>
        <td>{effective(strategy)}</td>
        <td>{strategy.isActive ? 'Active' : 'Inactive'}</td>
        <td className="v2-num" data-testid={`v2-strategy-governed-${strategy.code}`}>{matrixKnown ? formatCount(governed?.cases ?? 0) : '—'}</td>
      </tr>
      {isOpen && (
        <tr className="v2-strategy-actions-row">
          <td colSpan={7}><StrategyActions strategyId={strategy.id} code={strategy.code} /></td>
        </tr>
      )}
    </>
  );
}

const range = (from: number | undefined, to: number | undefined, format: (n: number | undefined) => string): string | undefined => {
  if (from === undefined && to === undefined) return undefined;
  return `${from === undefined ? '…' : format(from)} – ${to === undefined ? '…' : format(to)}`;
};

/** The configured conditions, each named only where configured. "Any" is said, never assumed. */
function describeConditions(strategy: StrategyRow): string {
  const parts = [
    range(strategy.dpdFrom, strategy.dpdTo, formatCount) && `DPD ${range(strategy.dpdFrom, strategy.dpdTo, formatCount)}`,
    range(strategy.arrearsFrom, strategy.arrearsTo, formatMoney) && `arrears ${range(strategy.arrearsFrom, strategy.arrearsTo, formatMoney)}`,
    strategy.customerType && `customer type ${strategy.customerType}`,
    strategy.riskLevel && `risk level ${strategy.riskLevel}`,
    strategy.nplFlag && 'NPL',
    strategy.brokenPtpCountFrom !== undefined && `broken promises ≥ ${strategy.brokenPtpCountFrom}`,
  ].filter((part): part is string => typeof part === 'string');
  return parts.length > 0 ? parts.join(' · ') : 'Any case';
}

function effective(strategy: StrategyRow): string {
  if (!strategy.effectiveFrom && !strategy.effectiveTo) return 'Always';
  return `${strategy.effectiveFrom ? formatDate(strategy.effectiveFrom) : '…'} – ${strategy.effectiveTo ? formatDate(strategy.effectiveTo) : '…'}`;
}

function StrategyActions({ strategyId, code }: { strategyId: string; code: string }) {
  const { adapter } = useCrmSession();
  const fetchActions = useMemo(() => createStrategyActionQuery(adapter), [adapter]);
  const [actions, setActions] = useState<readonly StrategyActionRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchActions({ strategyId, pageSize: STRATEGY_PAGE })
      .then(page => { if (!cancelled) setActions(page.items); })
      .catch(() => { if (!cancelled) setActions([]); });
    return () => { cancelled = true; };
  }, [fetchActions, strategyId]);

  if (actions === null) return <LoadingSkeleton rows={2} label="Loading actions" />;
  if (actions.length === 0) return <p className="v2-muted">No action is configured for this strategy.</p>;
  return (
    <table className="v2-actions-table" data-testid={`v2-strategy-actions-${code}`}>
      <thead>
        <tr><th scope="col">Seq</th><th scope="col">Action</th><th scope="col">Trigger</th><th scope="col">Day</th><th scope="col">Channel</th><th scope="col">Activity type</th><th scope="col">State</th></tr>
      </thead>
      <tbody>
        {[...actions].sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity)).map(action => (
          <tr key={action.id}>
            <td className="v2-num">{formatCount(action.sequence)}</td>
            <td>{action.name}</td>
            <td>{action.triggerEvent ?? '—'}</td>
            <td className="v2-num">{formatCount(action.dayOffset)}</td>
            <td>{action.channel ?? '—'}</td>
            {/* Absent means absent (KI-106). Nothing infers a type from the action's name or channel. */}
            <td>{action.activityType ?? <span className="v2-muted">Not configured</span>}</td>
            <td>{action.isActive ? 'Active' : 'Inactive'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function readLastCell(): string | null {
  try { return window.sessionStorage.getItem(LAST_CELL_KEY); } catch { return null; }
}

function writeLastCell(key: string): void {
  try { window.sessionStorage.setItem(LAST_CELL_KEY, key); } catch { /* a per-tab convenience only */ }
}
