import { useState } from 'react';
import { definitionByCode, restrictScope, type ReportDefinitionEntry, type ReportingDimension, type ReportingScope } from '@dcp/domain';
import { DCP_DASHBOARDS, type DashboardPanel, type DcpDashboard } from '../../../reporting/dcpDashboards.js';
import { datasetsOf, type ReportResult, type ReportRow } from '../../../reporting/reportEngineContracts.js';
import {
  countsOf, describeDroppedDimension, describeReportState, drillLabelOf, drillScopeOf, formatCell, isNumericColumn,
} from '../../../reporting/reportPresentation.js';
import type { IReportingService } from '../../../reporting/ReportingService.js';
import { resolutionFor, useDefinitionIndex, type IndexState, type PanelResolution } from '../../../reporting/useDefinitionIndex.js';
import { useReport, type ReportState } from '../../../reporting/useReport.js';
import { useCrmSession, useOrg, useReportingService } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { BucketDot, Card, EmptyState, ErrorState, LoadingSkeleton, MetricTile, StatusBadge, Tabs, rowActivation } from '../../components/primitives.js';
import { FILTER_SEGMENT, caseListFiltersFromScope, encodeCaseListFilters } from '../../data/caseListFilterUrl.js';

/**
 * Dashboards V2 — the four DCP dashboards, each a composition of Report Engine reports.
 *
 * The Engine owns the definition, the dataset, the aggregation and the semantics; V2 owns how the
 * answer is laid out and where a row leads. Every figure is one `qdb_RunReport` run as the signed-in
 * user in the workspace's CRM scope, read through the same reporting integration V1 uses — one
 * adapter, one catalogue, one set of compositions, one way of formatting a cell. A case-grain row
 * opens V2's Collection Cases with the very filters the row was counted in, so the list is the
 * population the figure describes; the way back is kept.
 */
export function V2DashboardsPage({ request }: { request: ViewRequest }) {
  const { adapter } = useCrmSession();
  const reporting = useReportingService();
  const { scope: organisation } = useOrg();
  const { go } = useV2Shell();
  const [activeCode, setActiveCode] = useState(request.tab && DCP_DASHBOARDS.some(d => d.code === request.tab) ? request.tab : DCP_DASHBOARDS[0]?.code ?? '');
  const index = useDefinitionIndex(adapter);
  const scope: ReportingScope = organisation === 'all' ? {} : { sourceSystem: organisation };
  const dashboard = DCP_DASHBOARDS.find(candidate => candidate.code === activeCode) ?? DCP_DASHBOARDS[0];
  const openCases = (drill: ReportingScope, labels: { strategyLabel?: string; ownerLabel?: string }) =>
    go('cases', FILTER_SEGMENT, encodeCaseListFilters(caseListFiltersFromScope(drill, 'dashboard', labels)));

  return (
    <div className="v2-dashboards" data-testid="v2-dashboards">
      <p className="v2-page-note" data-testid="v2-dashboards-note">
        Run by the QDB Report Engine as you, for <b>{organisation === 'all' ? 'both CRMs' : organisation === 'HL' ? 'Housing Loan' : 'BFD'}</b>.
        Every figure is one Engine report; a case row opens Collection Cases with the same filters.
      </p>
      {index.status === 'failed' && (
        <ErrorState title="Reporting service unavailable." message="The report definitions could not be read. The rest of the workspace is unaffected." testId="v2-reporting-unavailable" />
      )}
      <Tabs label="Dashboards" tabs={DCP_DASHBOARDS.map(d => ({ id: d.code, label: d.title }))} active={activeCode} onSelect={setActiveCode} testId="v2-dashboard-tabs" />
      {dashboard && <DashboardPanels dashboard={dashboard} scope={scope} index={index} reporting={reporting} onOpenCases={openCases} />}
    </div>
  );
}

function DashboardPanels({ dashboard, scope, index, reporting, onOpenCases }: {
  dashboard: DcpDashboard; scope: ReportingScope; index: IndexState; reporting: IReportingService;
  onOpenCases: (scope: ReportingScope, labels: { strategyLabel?: string; ownerLabel?: string }) => void;
}) {
  return (
    <div className="v2-report-panels" data-testid={`v2-dashboard-${dashboard.code}`} role="tabpanel">
      <p className="v2-muted v2-report-audience">For {dashboard.audience.toLowerCase()} · {dashboard.code}</p>
      {dashboard.panels.map(panel => {
        const definition = definitionByCode(panel.report);
        if (!definition) return <ErrorState key={panel.report} title={`${panel.report} is not in the DCP reporting catalogue.`} testId={`v2-unknown-${panel.report}`} />;
        const narrowed = restrictScope(scope, definition.dimensions);
        return (
          <V2ReportPanel
            key={panel.report} panel={panel} definition={definition} scope={narrowed.scope} dropped={narrowed.dropped}
            reporting={reporting} resolution={resolutionFor(index, panel.report)}
            onDrill={definition.drillDown === 'cases' ? onOpenCases : undefined}
          />
        );
      })}
    </div>
  );
}

function V2ReportPanel({ panel, definition, scope, dropped, reporting, resolution, onDrill }: {
  panel: DashboardPanel; definition: ReportDefinitionEntry; scope: ReportingScope; dropped: readonly ReportingDimension[];
  reporting: IReportingService; resolution: PanelResolution;
  onDrill: ((scope: ReportingScope, labels: { strategyLabel?: string; ownerLabel?: string }) => void) | undefined;
}) {
  const state = useReport(reporting, { reportId: resolution.isResolved ? resolution.reportId : undefined, scope, isResolved: resolution.isResolved });
  const isDropped = dropped.length > 0;
  const isTable = panel.kind === 'table';
  return (
    <div className={isTable ? 'v2-report-panel' : 'v2-report-panel v2-report-wide'} data-testid={`v2-panel-${panel.report}`} data-state={state.status}>
      <Card
        title={panel.title}
        subtitle={definition.purpose}
        actions={isDropped ? <StatusBadge tone="warning" testId={`v2-dropped-${panel.report}`}>Not narrowed by {dropped.map(describeDroppedDimension).join(', ')}</StatusBadge> : undefined}
        flush={isTable}
      >
        <PanelBody panel={panel} state={state} scope={scope} onDrill={onDrill} />
        <p className="v2-report-footer v2-muted">
          {definition.freshness}.
          {isDropped && <span> This report's grain does not carry the {dropped.map(describeDroppedDimension).join(', ')}, so the figures are for both CRMs.</span>}
          {panel.note && <span> {panel.note}</span>}
          <span> {panel.report}</span>
        </p>
      </Card>
    </div>
  );
}

function PanelBody({ panel, state, scope, onDrill }: {
  panel: DashboardPanel; state: ReportState; scope: ReportingScope;
  onDrill: ((scope: ReportingScope, labels: { strategyLabel?: string; ownerLabel?: string }) => void) | undefined;
}) {
  const sentence = describeReportState(state, panel.report);
  if (state.status === 'idle' || state.status === 'loading') return <LoadingSkeleton rows={3} label={sentence ?? 'Running'} testId="v2-report-loading" />;
  if (state.status !== 'ok') return <ErrorState title={sentence ?? 'This could not be loaded.'} testId="v2-report-failed" />;
  if (panel.kind === 'kpis') return <KpiPanel panel={panel} result={state.result} />;
  if (panel.kind === 'counts') return <CountsPanel result={state.result} />;
  return <TablePanel panel={panel} result={state.result} scope={scope} onDrill={onDrill} />;
}

function KpiPanel({ panel, result }: { panel: DashboardPanel; result: ReportResult }) {
  const row = datasetsOf(result)[0]?.rows[0];
  return (
    <div className="v2-metrics">
      {panel.columns.map(column => <MetricTile key={column.alias} label={column.label} value={row ? formatCell(column, row) : '—'} testId={`v2-kpi-${column.alias}`} />)}
    </div>
  );
}

function CountsPanel({ result }: { result: ReportResult }) {
  return (
    <div className="v2-metrics">
      {countsOf(datasetsOf(result)).map(item => <MetricTile key={item.label} label={item.label} value={item.value} />)}
    </div>
  );
}

function TablePanel({ panel, result, scope, onDrill }: {
  panel: DashboardPanel; result: ReportResult; scope: ReportingScope;
  onDrill: ((scope: ReportingScope, labels: { strategyLabel?: string; ownerLabel?: string }) => void) | undefined;
}) {
  const dataset = datasetsOf(result)[0];
  const rows = dataset?.rows ?? [];
  if (rows.length === 0) return <EmptyState title="Nothing in this scope." testId="v2-report-empty" />;
  const drillColumn = panel.columns.find(column => column.drill !== undefined);
  return (
    <>
      <table className="v2-report-table">
        <thead><tr>{panel.columns.map(column => <th key={column.alias} scope="col" className={isNumericColumn(column) ? 'v2-num' : ''}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const drill = onDrill ? drillScopeOf(panel, row, scope) : undefined;
            const open = drill ? () => onDrill?.(drill, labelsFor(panel, row, drillColumn?.drill)) : undefined;
            return (
              <tr key={rowIndex} className={open ? 'v2-report-row v2-report-drill' : 'v2-report-row'} data-testid="v2-report-row" {...(open ? { ...rowActivation(open), title: 'Open these cases' } : {})}>
                {panel.columns.map(column => (
                  <td key={column.alias} className={isNumericColumn(column) ? 'v2-num' : ''}>
                    {column.drill === 'bucket' && row.cells[column.alias]?.text ? <BucketDot bucket={row.cells[column.alias]?.text ?? undefined} /> : null}
                    {formatCell(column, row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {dataset?.truncated && <p className="v2-muted v2-report-footer">The Engine capped this answer; the rows above are the first {rows.length}.</p>}
    </>
  );
}

function labelsFor(panel: DashboardPanel, row: ReportRow, drill: keyof ReportingScope | undefined): { strategyLabel?: string; ownerLabel?: string } {
  const label = drillLabelOf(panel, row);
  if (!label) return {};
  if (drill === 'strategy') return { strategyLabel: label };
  if (drill === 'owner') return { ownerLabel: label };
  return {};
}
