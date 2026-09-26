import type { ReportDefinitionEntry, ReportingDimension, ReportingScope } from '@dcp/domain';
import { KpiRow, type Kpi } from '../components/primitives.js';
import type { DashboardPanel } from '../reporting/dcpDashboards.js';
import { datasetsOf, type ReportResult } from '../reporting/reportEngineContracts.js';
import {
  countsOf, describeDroppedDimension, describeReportState, drillScopeOf, formatCell, isNumericColumn,
} from '../reporting/reportPresentation.js';
import type { IReportingService } from '../reporting/ReportingService.js';
import { useReport, type ReportState } from '../reporting/useReport.js';
import type { PanelResolution } from '../reporting/useDefinitionIndex.js';

/**
 * One Report Engine report as a V1 dashboard panel.
 *
 * The panel draws what the Engine answered and nothing more. How a cell is read, which row drills
 * where and how a failure is worded are shared with the V2 skin in `reportPresentation.ts`, so the
 * two presentations cannot disagree about one report.
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
        {dropped.length > 0 && <span data-testid={`dropped-${panel.report}`}> Not narrowed by {dropped.map(describeDroppedDimension).join(', ')}: this report's grain does not carry it.</span>}
        {panel.note && <span> {panel.note}</span>}
        <span> {panel.report}</span>
      </div>
    </section>
  );
}

function PanelBody({ panel, state, scope, onDrill }: { panel: DashboardPanel; state: ReportState; scope: ReportingScope; onDrill: ((scope: ReportingScope) => void) | undefined }) {
  const sentence = describeReportState(state, panel.report);
  if (sentence !== undefined || state.status !== 'ok') return <StateLine state={state} sentence={sentence ?? ''} />;
  if (panel.kind === 'kpis') return <KpiPanel panel={panel} result={state.result} />;
  if (panel.kind === 'counts') return <KpiRow items={countsOf(datasetsOf(state.result))} />;
  return <TablePanel panel={panel} result={state.result} scope={scope} onDrill={onDrill} />;
}

function StateLine({ state, sentence }: { state: ReportState; sentence: string }) {
  if (state.status === 'idle' || state.status === 'loading') return <div className="report-state" data-testid="report-loading">{sentence}</div>;
  if (state.status === 'accessDenied') return <div className="report-state denied">{sentence}</div>;
  if (state.status === 'missing') return <div className="report-state unavailable">{sentence}</div>;
  return <div className="report-state unavailable" data-testid="report-failed">{sentence}</div>;
}

function KpiPanel({ panel, result }: { panel: DashboardPanel; result: ReportResult }) {
  const row = datasetsOf(result)[0]?.rows[0];
  const items: Kpi[] = panel.columns.map(column => ({ label: column.label, value: row ? formatCell(column, row) : '—' }));
  return <KpiRow items={items} />;
}

function TablePanel({ panel, result, scope, onDrill }: { panel: DashboardPanel; result: ReportResult; scope: ReportingScope; onDrill: ((scope: ReportingScope) => void) | undefined }) {
  const dataset = datasetsOf(result)[0];
  const rows = dataset?.rows ?? [];
  if (rows.length === 0) return <div className="report-state" data-testid="report-empty">Nothing in this scope.</div>;
  return (
    <>
      <table className="grid report-table">
        <thead><tr>{panel.columns.map(column => <th key={column.alias} className={isNumericColumn(column) ? 'num' : ''}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const drill = onDrill ? drillScopeOf(panel, row, scope) : undefined;
            return (
              <tr key={rowIndex} className={drill ? 'drill' : ''} data-testid="report-row" {...(drill ? { onClick: () => onDrill?.(drill), title: 'Open these cases' } : {})}>
                {panel.columns.map(column => <td key={column.alias} className={isNumericColumn(column) ? 'num' : ''}>{formatCell(column, row)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      {dataset?.truncated && <div className="hint">The Engine capped this answer; the rows above are the first {rows.length}.</div>}
    </>
  );
}
