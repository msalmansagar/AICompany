import { useMemo } from 'react';
import { AppShell, Command } from './shell/AppShell.js';
import { CrmSessionProvider, OrgProvider, RoleProvider, type CrmSession } from './shell/context.js';
import { useHashRoute } from './shell/useHashRoute.js';
import { isPending, type ViewDefinition } from './shell/routes.js';
import { findXrm, readCrmContext, CrmContextError } from './platform/crmContext.js';
import { XrmCrmAdapter } from './platform/XrmCrmAdapter.js';
import { AuditView, CasesView, MyDayView, PendingView, QueuesView } from './views/index.js';
import { CaseWorkspaceView } from './views/CaseWorkspace.js';
import { Customer360View } from './views/Customer360.js';
import { ActionPlanView, SegmentationView, StrategyRulesView } from './views/strategyViews.js';
import { DashboardsView, DelinquencyIntakeView, PromiseToPayView } from './views/operationsViews.js';
import { ConfigurationView } from './views/ConfigurationView.js';
import './styles/tokens.css';
import './styles/components.css';
import './styles/uci.css';
import './styles/phase5.css';
import './styles/phase6.css';

/**
 * The workspace root.
 *
 * It resolves the CRM session once and refuses clearly if there is not one, because this application
 * has no standalone mode: it reads through the signed-in user's CRM session, which is also what makes
 * CRM's own security authoritative rather than decorative.
 */
export function App() {
  const session = useMemo<CrmSession | Error>(() => {
    try {
      const xrm = findXrm();
      const context = readCrmContext(xrm);
      return { context, adapter: new XrmCrmAdapter(xrm!) };
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, []);

  if (session instanceof Error) return <HostMissing error={session} />;

  return (
    <CrmSessionProvider value={session}>
      <RoleProvider>
        <OrgProvider>
          <Workspace />
        </OrgProvider>
      </RoleProvider>
    </CrmSessionProvider>
  );
}

function Workspace() {
  const route = useHashRoute();
  return (
    <AppShell commands={<Commands view={route.view} recordId={route.recordId} go={route.go} />}>
      <ViewHost
        view={route.view}
        {...(route.recordId !== undefined ? { recordId: route.recordId } : {})}
        {...(route.tab !== undefined ? { tab: route.tab } : {})}
        onOpenCase={id => route.go('case', id)}
        onOpenCustomer={customerBusinessId => route.go('customer', customerBusinessId)}
      />
    </AppShell>
  );
}

/**
 * Routes a view id to its implementation.
 *
 * A view owned by a later phase resolves to `PendingView`, which keeps the screen present and says
 * so. That is the UI Requirements Matrix enforced at runtime: every route resolves to something, and
 * nothing resolves to invented data.
 */
function ViewHost({ view, recordId, tab, onOpenCase, onOpenCustomer }: {
  view: ViewDefinition;
  recordId?: string | undefined;
  tab?: string | undefined;
  onOpenCase: (id: string) => void;
  onOpenCustomer: (customerBusinessId: string) => void;
}) {
  if (isPending(view)) return <PendingView view={view} />;

  switch (view.id) {
    case 'myday': return <MyDayView onOpenCase={onOpenCase} />;
    case 'queues': return <QueuesView onOpenCase={onOpenCase} />;
    case 'cases': return <CasesView onOpenCase={onOpenCase} />;
    case 'case': return <CaseWorkspaceView caseId={recordId} initialTab={tab} onOpenCustomer={onOpenCustomer} />;
    case 'customer': return <Customer360View customerBusinessId={recordId} onOpenCase={onOpenCase} />;
    case 'intake': return <DelinquencyIntakeView />;
    case 'buckets': return <SegmentationView />;
    case 'rules': return <StrategyRulesView view={view} />;
    case 'actionplan': return <ActionPlanView view={view} />;
    case 'ptp': return <PromiseToPayView view={view} onOpenCase={onOpenCase} />;
    case 'dashboards': return <DashboardsView view={view} />;
    case 'admin': return <ConfigurationView view={view} />;
    case 'audit': return <AuditView />;
    default:
      // Every Phase 5 view above resolves to an implementation, and every later-phase view resolved
      // to `PendingView` at the top. A route reaching here would mean the route table and this switch
      // disagree, which is a defect rather than a screen — a test asserts it cannot happen.
      return <UnroutedView view={view} />;
  }
}

/** A Phase 5 view with no implementation. It should be unreachable, and it says so rather than hiding. */
function UnroutedView({ view }: { view: ViewDefinition }) {
  return (
    <div className="host-missing" data-testid="unrouted-view" data-view={view.id}>
      <h1>{view.label}</h1>
      <p>
        This view is declared as Phase 5 in the route table but has no implementation bound to it.
        That is a defect in the router, not a screen that is still to come.
      </p>
    </div>
  );
}

/**
 * The approved command bar. Later-phase commands stay visible and disabled rather than vanishing.
 *
 * **Log action and Capture PTP act on a case, and the command bar is global**, so they are enabled
 * only where a case is open and they take the user to the tab that does the work. Enabling them
 * everywhere would mean either picking a case for the user or opening a form with nowhere to save
 * to; disabling them on the case view, where the capability plainly exists, would be the opposite
 * lie. The tooltip says which it is.
 */
function Commands({ view, recordId, go }: {
  view: ViewDefinition;
  recordId?: string | undefined;
  go: (viewId: string, recordId?: string, tab?: string) => void;
}) {
  const onCase = view.id === 'case' && Boolean(recordId);
  return (
    <>
      <Command icon="refresh" label="Refresh" onClick={() => window.location.reload()} />
      <Command
        icon="add" label="Log action"
        {...(onCase
          ? { onClick: () => go('case', recordId, 'actions') }
          : { disabledReason: 'Open a case to log an action against it' })}
      />
      <Command
        icon="promise" label="Capture PTP"
        {...(onCase
          ? { onClick: () => go('case', recordId, 'ptp') }
          : { disabledReason: 'Open a case to capture a promise against it' })}
      />
      <Command icon="send" label="Send message" pendingPhase={7} />
      <Command icon="restructure" label="Propose restructure" pendingPhase={9} />
      <Command icon="legal" label="Refer to legal" pendingPhase={9} />
      <Command icon="escalate" label="Escalate" pendingPhase={8} />
      <Command icon="copilot" label="Copilot" pendingPhase={10} />
      {view.id === 'cases' && <Command icon="excel" label="Export" pendingPhase={10} />}
    </>
  );
}

/**
 * What the user sees when the workspace is opened outside Dynamics.
 *
 * It says so plainly rather than rendering an empty shell. The Form Engine lost an on-premises
 * release to exactly this confusion: the page worked at the raw `/WebResources/` URL and failed at
 * `main.aspx`, which is the only place a user ever opens it.
 */
function HostMissing({ error }: { error: Error }) {
  const kind = error instanceof CrmContextError ? error.kind : 'Unknown';
  return (
    <div className="host-missing" data-testid="host-missing" data-kind={kind}>
      <h1>Debt Collection Workspace</h1>
      <p>{error.message}</p>
      <p className="hint">
        Open it from the Dynamics sitemap, or at
        <code> main.aspx?pagetype=webresource&amp;webresourceName=…</code> — the raw
        <code> /WebResources/ </code> path has no CRM context.
      </p>
    </div>
  );
}
