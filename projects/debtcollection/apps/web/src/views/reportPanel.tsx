import type { ReportDefinitionEntry, ReportingDimension, ReportingScope } from '@dcp/domain';
import { KpiRow, formatCount, formatDate, formatMoney, type Kpi } from '../components/primitives.js';
import type { DashboardPanel, PanelColumn } from '../reporting/dcpDashboards.js';
import { datasetsOf, type ReportCell, type ReportDataset, type ReportResult, type ReportRow } from '../reporting/reportEngineContracts.js';
import type { IReportingService } from '../reporting/ReportingService.js';
import { useReport, type ReportState } from '../reporting/useReport.js';
import type { PanelResolution } from './ReportingDashboardsView.js';

/**
 * One Report Engine report as a dashboard panel.
 *
 * The panel formats what the Engine answered and nothing more: a Money cell through the workspace's
 * own money format (the Engine's text carries the running user's currency symbol), a count through
 * the count format, a label as the Engine labelled it. A row whose drill column has a value opens the
 * Cases list in the scope the row was counted in, so the list and the figure agree by construction.
 */
export function ReportPanel({ panel, definition, scope, dropped, reporting, resolution, onDrill }: {
  panel: DashboardPanel;
  definition: ReportDefinitionEntry;
  scope: ReportingScope;
  dropped: readonly ReportingDimension[];
  reporting: IReportingService;
  resolution: PanelResolution;
  onDrill?: ((scope: ReportingScope) => void) | undefined;
}) {
  const state = useReport(reporting, { reportId: resolution.isResolved ? resolution.reportId : undefined, scope, isResolved: resolution.isResolved });
  const isFullWidth = panel.kind !== 'table';
  return (
    <section className={isFullWidth ? 'section-card report-panel wide' : 'section-card report-panel'} data-testid={`panel-${panel.report}`} data-state={state.status}>
      <h3>{panel.title}</h3>
      <div className="hint">{definition.purpose}</div>
      <PanelBody panel={panel} state={state} scope={scope} onDrill={onDrill} />
      <div className="report-footer hint">
        <span>{definition.freshness}.</span>
        {dropped.length > 0 && <span data-testid={`dropped-${panel.report}`}> Not narrowed by {dropped.map(describeDimension).join(', ')}: this report's grain does not carry it.</span>}
        {panel.note && <span> {panel.note}</span>}
        <span> {panel.report}</span>
      </div>
    </section>
  );
}

function describeDimension(dimension: ReportingDimension): string {
  return dimension === 'sourceSystem' ? 'CRM' : dimension;
}

function PanelBody({ panel, state, scope, onDrill }: { panel: DashboardPanel; state: ReportState; scope: ReportingScope; onDrill: ((scope: ReportingScope) => void) | undefined }) {
  if (state.status === 'idle' || state.status === 'loading') return <div className="report-state" data-testid="report-loading">Running in the Report Engine…</div>;
  if (state.status === 'missing') return <div className="report-state unavailable">Definition {panel.report} is not provisioned on this organisation.</div>;
  if (state.status === 'accessDenied') return <div className="report-state denied">You do not have permission to run this report. {state.message}</div>;
  if (state.status !== 'ok') return <div className="report-state unavailable" data-testid="report-failed">Reporting service {describeFailure(state.status)}. {state.message}</div>;
  if (panel.kind === 'kpis') return <KpiPanel panel={panel} result={state.result} />;
  if (panel.kind === 'counts') return <CountsPanel result={state.result} />;
  return <TablePanel panel={panel} result={state.result} scope={scope} onDrill={onDrill} />;
}

function describeFailure(status: ReportState['status']): string {
  if (status === 'timeout') return 'did not answer in time';
  if (status === 'malformed') return 'answered in a shape DCP does not recognise';
  if (status === 'refused') return 'refused the request';
  return 'unavailable';
}

function KpiPanel({ panel, result }: { panel: DashboardPanel; result: ReportResult }) {
  const row = datasetsOf(result)[0]?.rows[0];
  const items: Kpi[] = panel.columns.map(column => ({ label: column.label, value: row ? formatCell(column, row) : '—' }));
  return <KpiRow items={items} />;
}

/** A multi-dataset answer: one labelled count per dataset, in the Engine's order. */
function CountsPanel({ result }: { result: ReportResult }) {
  const items: Kpi[] = datasetsOf(result).map(dataset => ({
    label: dataset.columns[0]?.label ?? dataset.name ?? '—',
    value: countOf(dataset),
  }));
  return <KpiRow items={items} />;
}

function countOf(dataset: ReportDataset): string {
  const value = dataset.rows[0]?.cells[dataset.columns[0]?.alias ?? '']?.value;
  return typeof value === 'number' ? formatCount(value) : '—';
}

function TablePanel({ panel, result, scope, onDrill }: { panel: DashboardPanel; result: ReportResult; scope: ReportingScope; onDrill: ((scope: ReportingScope) => void) | undefined }) {
  const dataset = datasetsOf(result)[0];
  const rows = dataset?.rows ?? [];
  if (rows.length === 0) return <div className="report-state" data-testid="report-empty">Nothing in this scope.</div>;
  return (
    <>
      <table className="grid report-table">
        <thead><tr>{panel.columns.map(column => <th key={column.alias} className={isNumeric(column) ? 'num' : ''}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const drill = onDrill ? drillScopeOf(panel, row, scope) : undefined;
            return (
              <tr key={rowIndex} className={drill ? 'drill' : ''} data-testid="report-row" {...(drill ? { onClick: () => onDrill?.(drill), title: 'Open these cases' } : {})}>
                {panel.columns.map(column => <td key={column.alias} className={isNumeric(column) ? 'num' : ''}>{formatCell(column, row)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      {dataset?.truncated && <div className="hint">The Engine capped this answer; the rows above are the first {rows.length}.</div>}
    </>
  );
}

function isNumeric(column: PanelColumn): boolean {
  return column.format === 'count' || column.format === 'money' || column.format === 'decimal';
}

/** The scope a row was counted in plus the row's own dimension; `undefined` when the row has none to add. */
export function drillScopeOf(panel: DashboardPanel, row: ReportRow, scope: ReportingScope): ReportingScope | undefined {
  const column = panel.columns.find(candidate => candidate.drill !== undefined);
  if (!column?.drill) return undefined;
  const cell = row.cells[column.alias];
  const own = cell ? drillValueOf(column, cell) : undefined;
  if (own === undefined) return undefined;
  return { ...scope, [column.drill]: own };
}

function drillValueOf(column: PanelColumn, cell: ReportCell): string | undefined {
  const isEmpty = cell.value === null || cell.value === undefined;
  if (isEmpty) return column.emptyDrillValue;
  return column.drillBy === 'value' ? String(cell.value) : (cell.text ?? undefined);
}

export function formatCell(column: PanelColumn, row: ReportRow): string {
  const cell = row.cells[column.alias];
  const value = cell?.value;
  switch (column.format) {
    case 'count': return typeof value === 'number' ? formatCount(value) : '—';
    case 'money': return typeof value === 'number' ? formatMoney(value) : '—';
    case 'decimal': return typeof value === 'number' ? new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value) : '—';
    case 'boolean': return cell?.text ?? (value === true ? 'Yes' : value === false ? 'No' : '—');
    case 'yearWeek': return typeof value === 'number' ? `${value} · week ${numberIn(row, 'week')}` : '—';
    case 'yearMonth': return monthLabel(value, numberIn(row, 'month'));
    case 'yearMonthDay': return dayLabel(value, numberIn(row, 'month'), numberIn(row, 'day'));
    default: return cell?.text ?? (value !== null && value !== undefined ? String(value) : column.emptyLabel ?? '—');
  }
}

function numberIn(row: ReportRow, alias: string): number | undefined {
  const value = row.cells[alias]?.value;
  return typeof value === 'number' ? value : undefined;
}

function monthLabel(year: unknown, month: number | undefined): string {
  if (typeof year !== 'number' || month === undefined) return '—';
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dayLabel(year: unknown, month: number | undefined, day: number | undefined): string {
  if (typeof year !== 'number' || month === undefined || day === undefined) return '—';
  return formatDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
