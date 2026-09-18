import { useMemo } from 'react';
import { AppShell, Command } from './shell/AppShell.js';
import { CrmSessionProvider, OrgProvider, RoleProvider, type CrmSession } from './shell/context.js';
import { useHashRoute } from './shell/useHashRoute.js';
import { isPending, type ViewDefinition } from './shell/routes.js';
import { findXrm, readCrmContext, CrmContextError } from './platform/crmContext.js';
import { XrmCrmAdapter } from './platform/XrmCrmAdapter.js';
import { AuditView, CasesView, MyDayView, PendingView, QueuesView, SimpleReadView } from './views/index.js';
import './styles/tokens.css';
import './styles/components.css';
import './styles/uci.css';

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
    <AppShell commands={<Commands view={route.view} />}>
      <ViewHost view={route.view} onOpenCase={id => route.go('case', id)} />
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
function ViewHost({ view, onOpenCase }: { view: ViewDefinition; onOpenCase: (id: string) => void }) {
  if (isPending(view)) return <PendingView view={view} />;

  switch (view.id) {
    case 'myday': return <MyDayView onOpenCase={onOpenCase} />;
    case 'queues': return <QueuesView onOpenCase={onOpenCase} />;
    case 'cases': return <CasesView onOpenCase={onOpenCase} />;
    case 'audit': return <AuditView />;
    default:
      return <SimpleReadView view={view} description={describeBacking(view)} />;
  }
}

function describeBacking(view: ViewDefinition): string {
  const backing: Record<string, string> = {
    customer: 'Aggregated around the CRM customer — contact for Housing Loan, account for BFD. Not a separate customer master.',
    case: 'The Collection Case and its related records.',
    intake: 'Delinquency snapshots, identity exceptions and synchronisation run reports.',
    buckets: 'Collection Strategy criteria, read as configuration.',
    rules: 'Collection Strategy and Strategy Action configuration.',
    actionplan: 'The strategy actions resolved for a case.',
    ptp: 'Promise-to-Pay activities.',
    dashboards: 'Bounded operational counts.',
    admin: 'Platform configuration and mapping.',
  };
  return backing[view.id] ?? 'Reads the approved configuration for this area.';
}

/** The approved command bar. Later-phase commands stay visible and disabled rather than vanishing. */
function Commands({ view }: { view: ViewDefinition }) {
  return (
    <>
      <Command icon="refresh" label="Refresh" onClick={() => window.location.reload()} />
      <Command icon="add" label="Log action" pendingPhase={6} />
      <Command icon="promise" label="Capture PTP" pendingPhase={6} />
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
      <p className="host-missing-note">
        Open it from the Dynamics sitemap, or at
        <code> main.aspx?pagetype=webresource&amp;webresourceName=…</code> — the raw
        <code> /WebResources/ </code> path has no CRM context.
      </p>
    </div>
  );
}
