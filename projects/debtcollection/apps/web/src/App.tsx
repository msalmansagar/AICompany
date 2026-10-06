import { useEffect, useMemo, useState } from 'react';
import type { ReportingScope } from '@dcp/domain';
import { AppShell, Command } from './shell/AppShell.js';
import { CrmSessionProvider, OrgProvider, RoleProvider, type CrmSession } from './shell/context.js';
import { useHashRoute } from './shell/useHashRoute.js';
import { isPending, type ViewDefinition } from './shell/routes.js';
import { BULK_SEGMENT, CommunicationCenterView } from './views/CommunicationCenter.js';
import { findXrm, readCrmContext, CrmContextError, type XrmLike } from './platform/crmContext.js';
import { createWebApiHost } from './platform/webApiHost.js';
import { XrmCrmAdapter } from './platform/XrmCrmAdapter.js';
import { SameOriginWriteTransport } from './platform/writeTransport.js';
import { XrmReportingService } from './reporting/XrmReportingService.js';
import { CoordinatedReportingService } from './reporting/CoordinatedReportingService.js';
import { AuditView, CasesView, MyDayView, PendingView, QueuesView } from './views/index.js';
import { CaseWorkspaceView } from './views/CaseWorkspace.js';
import { Customer360View } from './views/Customer360.js';
import { ActionPlanView, SegmentationView, StrategyRulesView } from './views/strategyViews.js';
import { DelinquencyIntakeView, PromiseToPayView } from './views/operationsViews.js';
import { ReportingDashboardsView } from './views/ReportingDashboardsView.js';
import { ConfigurationView } from './views/ConfigurationView.js';
import { WorkoutQueueView } from './views/workoutQueueView.js';
import './styles/tokens.css';
import './styles/components.css';
import './styles/uci.css';
import './styles/phase5.css';
import './styles/phase6.css';
import './styles/phase7.css';
import './styles/phase10.css';
import './styles/lists.css';
import './styles/sidebar.css';
import './styles/customer360.css';
import { toError } from './platform/errors.js';
import { SCOPE_SEGMENT, decodeScope, encodeScope } from './data/caseListScopeUrl.js';
import { WorkspaceVersionRoot, useWorkspaceVersion } from './v2/version/WorkspaceVersionRoot.js';
import { V2Workspace } from './v2/V2Workspace.js';

/**
 * Builds the session the whole workspace runs on.
 *
 * Extracted from the component so it can be tested directly, because the defect it once carried was
 * invisible from a component test: the adapter was constructed **without a write transport**, which
 * left every read working and every write — and every versioned read — failing at runtime with
 * "this adapter was built without a write transport". Nothing caught it, because every test built
 * its own adapter and passed one in. The one place that builds the real thing had no test at all.
 *
 * The transport is same-origin against the host's own API base. A web resource is served from the
 * organisation's host, so the user's session authenticates it and CRM's security applies exactly as
 * it does to `Xrm.WebApi` — the identity is the same, only the ability to attach a header differs
 * (ADR-DCP-18). `apiBase` is read from the host rather than composed here, so on-premises `9.1` and
 * Dataverse `9.2` both work without a branch (KI-02).
 */
export function createCrmSession(xrm: XrmLike | null = findXrm()): CrmSession {
  const context = readCrmContext(xrm);
  const transport = new SameOriginWriteTransport(context.apiBase);
  return { context, adapter: new XrmCrmAdapter(xrm!, undefined, transport), reporting: new CoordinatedReportingService(new XrmReportingService(xrm!)) };
}

/**
 * The session when no model-driven app surrounds the page: the organisation's own Web API on the
 * same origin, spoken as the client API would be. The identity is still the signed-in user and the
 * security is still CRM's — only the channel differs (user instruction, 2026-09-27).
 */
export async function createStandaloneSession(): Promise<CrmSession> {
  return createCrmSession(await createWebApiHost());
}

type SessionState = { status: 'connecting' } | { status: 'ready'; session: CrmSession } | { status: 'failed'; error: Error };

/**
 * The workspace root.
 *
 * It resolves the CRM session once. Inside an app the client API answers at once; at the raw web
 * resource URL the organisation is asked over its Web API first, and the page says so while it
 * waits. Either way every read and write is the signed-in user's, which is what makes CRM's own
 * security authoritative rather than decorative.
 */
export function App() {
  const hosted = useMemo<CrmSession | null>(() => (findXrm() ? createCrmSession() : null), []);
  const [standalone, setStandalone] = useState<SessionState>({ status: 'connecting' });

  useEffect(() => {
    if (hosted) return undefined;
    let cancelled = false;
    createStandaloneSession()
      .then(session => { if (!cancelled) setStandalone({ status: 'ready', session }); })
      .catch((failure: unknown) => { if (!cancelled) setStandalone({ status: 'failed', error: toError(failure) }); });
    return () => { cancelled = true; };
  }, [hosted]);

  const session = hosted ?? (standalone.status === 'ready' ? standalone.session : null);
  if (!session) {
    if (standalone.status === 'failed') return <HostMissing error={standalone.error} />;
    return <Connecting />;
  }

  return (
    <CrmSessionProvider value={session}>
      <RoleProvider>
        <OrgProvider>
          {/* V1 stays the default; V2 is chosen only by an explicit, recognised request. */}
          <WorkspaceVersionRoot renderV1={() => <Workspace />} renderV2={() => <V2Workspace renderView={request => <ViewHost {...request} />} />} />
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
        onOpenActionPlan={id => route.go('case', id, 'actions')}
        onOpenCases={scope => route.go('cases', SCOPE_SEGMENT, encodeScope(scope))}
        onOpenCustomer={customerBusinessId => route.go('customer', customerBusinessId)}
        onOpenComms={id => route.go('comms', id)}
        onNavigateComms={(recordId, tab) => route.go('comms', recordId, tab)}
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
function ViewHost({
  view, recordId, tab, onOpenCase, onOpenActionPlan, onOpenCases, onOpenCustomer, onOpenComms, onNavigateComms,
}: {
  view: ViewDefinition;
  recordId?: string | undefined;
  tab?: string | undefined;
  onOpenCase: (id: string) => void;
  /** A case opened on its Action Plan. Each workspace knows which of its tabs that is. */
  onOpenActionPlan: (id: string) => void;
  /** The Cases list in a reporting scope — a dashboard row's drill-down. */
  onOpenCases: (scope: ReportingScope) => void;
  onOpenCustomer: (customerBusinessId: string) => void;
  onOpenComms: (caseId: string) => void;
  onNavigateComms: (recordId?: string, tab?: string) => void;
}) {
  if (isPending(view)) return <PendingView view={view} />;

  switch (view.id) {
    case 'myday': return <MyDayView onOpenCase={onOpenCase} />;
    case 'queues': return <QueuesView onOpenCase={onOpenCase} />;
    case 'cases': return <CasesView onOpenCase={onOpenCase} scope={recordId === SCOPE_SEGMENT ? decodeScope(tab) : {}} />;
    case 'case':
      return (
        <CaseWorkspaceView
          caseId={recordId} initialTab={tab} onOpenCustomer={onOpenCustomer}
          onOpenComms={onOpenComms} onNavigateComms={onNavigateComms}
        />
      );
    case 'customer': return <Customer360View customerBusinessId={recordId} onOpenCase={onOpenCase} onOpenActionPlan={onOpenActionPlan} onOpenCustomer={onOpenCustomer} />;
    case 'intake': return <DelinquencyIntakeView />;
    case 'buckets': return <SegmentationView />;
    case 'rules': return <StrategyRulesView view={view} />;
    case 'actionplan': return <ActionPlanView view={view} onOpenCases={onOpenCases} />;
    case 'ptp': return <PromiseToPayView view={view} onOpenCase={onOpenCase} />;
    case 'dashboards': return <ReportingDashboardsView view={view} onOpenCases={onOpenCases} />;
    case 'admin': return <ConfigurationView view={view} />;
    case 'audit': return <AuditView />;
    case 'disputes':
    case 'legal':
    case 'claims':
      return <WorkoutQueueView viewId={view.id} onOpenCase={onOpenCase} />;
    case 'comms': {
      // `#comms/bulk` and `#comms/bulk/<runId>` are the bulk tab; anything else in that position is
      // a case id. A case id is always a GUID, so the two can never be confused.
      const onBulk = recordId === BULK_SEGMENT;
      return (
        <CommunicationCenterView
          mode={onBulk ? 'bulk' : 'single'}
          {...(onBulk ? {} : recordId !== undefined ? { caseId: recordId } : {})}
          {...(onBulk && tab !== undefined ? { runId: tab } : {})}
          onSelectCase={onOpenComms}
          onNavigate={onNavigateComms}
        />
      );
    }
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
        This view is declared in the route table but has no screen bound to it. That is a defect in
        the workspace, not a screen that is still to come.
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
      <Command
        icon="send" label="Send message"
        {...(onCase
          ? { onClick: () => go('case', recordId, 'comms') }
          : { disabledReason: 'Open a case to message its customer' })}
      />
      {/*
        * No "Propose restructure" or "Refer to legal" here (Phase 9). Restructuring is parked by QDB
        * and a Legal hand-off waits on QDB's qualification rule, so both would be controls for
        * functionality that does not exist. The Workout & Legal tab says why.
        */}
      <Command icon="escalate" label="Escalate" pendingPhase={8} />
      <Command icon="copilot" label="Copilot" pendingPhase={10} />
      {view.id === 'cases' && <Command icon="excel" label="Export" pendingPhase={10} />}
      <SwitchToV2Command />
    </>
  );
}

/**
 * The temporary way from V1 to the redesigned workspace under review. It changes the presentation
 * only, in place, and is remembered in this browser.
 */
function SwitchToV2Command() {
  const { switchTo } = useWorkspaceVersion();
  return <Command icon="popout" label="Workspace V2" onClick={() => switchTo('v2')} />;
}

/** Shown while the organisation is being asked who is signed in, at the raw web resource URL. */
function Connecting() {
  return (
    <div className="host-missing" data-testid="host-connecting" role="status" aria-live="polite">
      <h1>Debt Collection Workspace</h1>
      <p>Connecting to the organisation…</p>
    </div>
  );
}

/**
 * What the user sees when the workspace can reach no organisation at all.
 *
 * It says so plainly rather than rendering an empty shell. Inside an app the client API is the
 * host; at the raw `/WebResources/` URL the organisation's Web API is; when neither answers, the
 * page is not on an organisation host or the browser is not signed in to it.
 */
function HostMissing({ error }: { error: Error }) {
  const kind = error instanceof CrmContextError ? error.kind : 'Unknown';
  return (
    <div className="host-missing" data-testid="host-missing" data-kind={kind}>
      <h1>Debt Collection Workspace</h1>
      <p>{error.message}</p>
      <p className="hint">
        Open it from the Dynamics sitemap, at
        <code> main.aspx?pagetype=webresource&amp;webresourceName=…</code>, or at its
        <code> /WebResources/ </code> URL while signed in to the organisation in this browser.
      </p>
    </div>
  );
}
