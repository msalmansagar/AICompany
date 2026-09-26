import { useEffect, useState } from 'react';
import { definitionByCode, restrictScope, type ReportDefinitionEntry, type ReportingDimension, type ReportingScope } from '@dcp/domain';
import { InfoBanner, PartialCapabilityNotice, Pivot } from '../components/primitives.js';
import { describeFailure } from '../platform/errors.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { DCP_DASHBOARDS, type DcpDashboard } from '../reporting/dcpDashboards.js';
import { resolveDcpDefinitions, type DefinitionIndex } from '../reporting/reportCatalogueResolver.js';
import { ReportPanel } from './reportPanel.js';
import { useCrmSession, useOrg, useReportingService } from '../shell/context.js';
import type { ViewDefinition } from '../shell/routes.js';

/**
 * The Dashboards screen: DCP's four dashboards, each a composition of Report Engine reports run as
 * the signed-in user in the workspace's current scope.
 *
 * The screen owns nothing numeric. It resolves which definitions this organisation carries, hands
 * each panel its definition and the scope, and offers the drill-down — the Cases list opened with the
 * very scope a row was counted in. When the Engine cannot be reached the panels say so and the rest
 * of the workspace is untouched: reporting is a consumer of the operational platform, never a
 * dependency of it.
 */
export function ReportingDashboardsView({ view, onOpenCases }: { view: ViewDefinition; onOpenCases: (scope: ReportingScope) => void }) {
  const { adapter } = useCrmSession();
  const reporting = useReportingService();
  const { scope: organisation } = useOrg();
  const [activeCode, setActiveCode] = useState(DCP_DASHBOARDS[0]?.code ?? '');
  const index = useDefinitionIndex(adapter);
  const scope: ReportingScope = organisation === 'all' ? {} : { sourceSystem: organisation };

  return (
    <div data-testid="view-dashboards">
      <PartialCapabilityNotice view={view} />
      <InfoBanner icon="chart">
        Run by the <b>QDB Report Engine</b> as you, for <b>{organisation === 'all' ? 'both organisations' : organisation}</b>.
        Every figure is one Engine report; a row opens the Cases list with the same scope, so the list is the
        population the figure counted.
      </InfoBanner>
      {index.status === 'failed' && (
        <div className="report-state unavailable" data-testid="reporting-unavailable" title={index.message}>
          <strong>Reporting service unavailable.</strong> The report definitions could not be read; the
          operational workspace is unaffected.
        </div>
      )}
      <Pivot
        testId="dashboards"
        activeId={activeCode}
        onSelect={setActiveCode}
        tabs={DCP_DASHBOARDS.map(dashboard => ({
          id: dashboard.code,
          label: dashboard.title,
          render: () => <DashboardPanels dashboard={dashboard} scope={scope} index={index} onOpenCases={onOpenCases} reporting={reporting} />,
        }))}
      />
    </div>
  );
}

function DashboardPanels({ dashboard, scope, index, onOpenCases, reporting }: {
  dashboard: DcpDashboard; scope: ReportingScope; index: IndexState; onOpenCases: (scope: ReportingScope) => void; reporting: ReturnType<typeof useReportingService>;
}) {
  return (
    <div className="report-panels" data-testid={`dashboard-${dashboard.code}`}>
      <div className="hint report-audience">For {dashboard.audience.toLowerCase()} · {dashboard.code}</div>
      {dashboard.panels.map(panel => {
        const definition = definitionByCode(panel.report);
        if (!definition) return <UnknownDefinition key={panel.report} code={panel.report} />;
        const narrowed = restrictScope(scope, definition.dimensions);
        return (
          <ReportPanel
            key={panel.report}
            panel={panel}
            definition={definition}
            scope={narrowed.scope}
            dropped={narrowed.dropped}
            reporting={reporting}
            resolution={resolutionFor(index, panel.report)}
            onDrill={definition.drillDown === 'cases' ? onOpenCases : undefined}
          />
        );
      })}
    </div>
  );
}

/** A panel naming a code the catalogue does not know is a build defect, and says so rather than hiding. */
function UnknownDefinition({ code }: { code: string }) {
  return <div className="report-state" data-testid={`unknown-${code}`}>{code} is not in the DCP reporting catalogue.</div>;
}

export type PanelResolution = { isResolved: false } | { isResolved: true; reportId: string | undefined };

function resolutionFor(index: IndexState, code: string): PanelResolution {
  if (index.status === 'loading') return { isResolved: false };
  if (index.status === 'failed') return { isResolved: true, reportId: undefined };
  return { isResolved: true, reportId: index.definitions.get(code)?.id };
}

type IndexState =
  | { status: 'loading' }
  | { status: 'ok'; definitions: DefinitionIndex }
  | { status: 'failed'; message: string };

/** The organisation's DCP definitions, read once per session. */
function useDefinitionIndex(adapter: XrmCrmAdapter): IndexState {
  const [state, setState] = useState<IndexState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    resolveDcpDefinitions(adapter)
      .then(definitions => { if (!cancelled) setState({ status: 'ok', definitions }); })
      .catch((failure: unknown) => { if (!cancelled) setState({ status: 'failed', message: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter]);
  return state;
}

export type { ReportDefinitionEntry, ReportingDimension };
