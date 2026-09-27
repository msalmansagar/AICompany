import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { ProcessSummaryScreen } from '@/components/ProcessSummaryScreen';
import { clearUndoHistorySoon } from '@/services/undoHistory';
import { parseDesignerLayout } from '@/services/designerLayout';
import { parseDesignerState, withDesignerState } from '@/services/designerState';
import { ReactFlowProvider } from '@xyflow/react';
import { CrmEnvironmentService } from './services/CrmEnvironmentService';
import { WorkflowDataService } from './services/WorkflowDataService';
import { createAdapter } from './services/CrmAdapterFactory';
import { useWorkflowView } from './hooks/useWorkflowView';
import { useWorkflowStore } from './store/workflowStore';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { EditCanvas } from './components/edit/EditCanvas';
import { ProcessWizard } from './components/edit/ProcessWizard';
import { ProcessListScreen } from './components/ProcessListScreen';
import { SopListScreen } from './components/SopListScreen/SopListScreen';
import { RolesScreen } from './components/RolesScreen/RolesScreen';
import { CrmAdapterProvider } from './app/CrmAdapterContext';
import { SopAdapterContext } from './app/SopAdapterContext';
import { isSopAdapter } from './services/ISopAdapter';
import { ConfirmDialogHost } from './components/ui/ConfirmDialog';
import { NotifyHost, notify } from './components/ui/Notify';
import { confirm } from './components/ui/ConfirmDialog';
import { AppShell } from './components/shell/AppShell';
import type { NavDestination } from './components/shell/SitemapNav';
import type { ProcessStatusFilter } from './components/ProcessListScreen';
import type { ICrmAdapter } from './services/ICrmAdapter';
import type { ISopAdapter } from './services/ISopAdapter';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome, WorkflowRoute } from './types/WorkflowTypes';

// Dev-only visual feedback tool (CWFD-012): click elements in the running
// designer, add notes, and paste the structured selector markdown into an AI
// coding agent. Gated on import.meta.env.DEV through a dynamic import, so the
// production CRM web resource provably never carries it. License note:
// PolyForm Shield 1.0.0 — internal tooling use only, see dependencies.md.
const AgentationDevTool = import.meta.env.DEV
  ? lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null;

type AppMode = 'list' | 'view' | 'edit' | 'summary' | 'sop-list' | 'roles';

/** Environment identity for the app bar, resolved once at start-up. */
interface HostContext {
  environmentLabel: string;
  userInitials: string;
}

const EMPTY_HOST: HostContext = { environmentLabel: '', userInitials: '' };

export function App() {
  const [service, setService] = useState<WorkflowDataService | null>(null);
  const [adapter, setAdapter] = useState<ICrmAdapter | null>(null);
  const [isDevMode, setIsDevMode] = useState(false);
  const [host, setHost] = useState<HostContext>(EMPTY_HOST);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const env = new CrmEnvironmentService();
      setIsDevMode(env.isDevMode);
      setService(new WorkflowDataService(env));
      setAdapter(createAdapter(env));
      setHost(readHostContext(env));
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Failed to initialise CRM context.');
    }
  }, []);

  if (initError) {
    return (
      <div style={errorScreen}>
        <div style={errorCard}>
          <div style={errorTitle}>Workflow Designer — Initialisation Error</div>
          <div style={errorMsg}>{initError}</div>
          <div style={errorHint}>
            This web resource must be loaded inside Dynamics 365 / Dataverse / CRM.
          </div>
        </div>
      </div>
    );
  }

  if (!service || !adapter) {
    return <div style={loadingScreen}>Initialising Workflow Designer…</div>;
  }

  return (
    <ReactFlowProvider>
      <CrmAdapterProvider adapter={adapter}>
        <SopAdapterContext.Provider value={adapter}>
          <DesignerRoot service={service} adapter={adapter} isDevMode={isDevMode} host={host} />
        </SopAdapterContext.Provider>
      </CrmAdapterProvider>
      {AgentationDevTool && (
        <Suspense fallback={null}>
          <AgentationDevTool />
        </Suspense>
      )}
    </ReactFlowProvider>
  );
}

/**
 * Reads who and where we are for the app bar. Dataverse can refuse the user
 * context in some hosting modes, and an unnamed environment is not a reason to
 * fail to start, so this degrades to blanks rather than throwing.
 */
function readHostContext(env: CrmEnvironmentService): HostContext {
  try {
    const { userName, orgName } = env.getUserContext();
    return {
      environmentLabel: environmentLabelFrom(env.getClientUrl(), orgName),
      userInitials: toInitials(userName),
    };
  } catch {
    return EMPTY_HOST;
  }
}

/**
 * Names the environment the way a person does. `getOrgUniqueName()` returns the
 * internal unique name — "unq8e28c4d88f8f4c42aa0a31a680cc0" — which nobody
 * recognises; the host they typed to get here is the name they know it by.
 */
function environmentLabelFrom(clientUrl: string, orgName: string): string {
  try {
    const [subdomain] = new URL(clientUrl).hostname.split('.');
    return subdomain || orgName;
  } catch {
    return orgName;
  }
}

function toInitials(userName: string): string {
  const words = userName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

/** The sitemap destination each process status filter corresponds to. */
const STATUS_BY_DESTINATION: Partial<Record<NavDestination, ProcessStatusFilter>> = {
  'processes-all': 'all',
  'processes-draft': 'draft',
  'processes-published': 'published',
};

interface DesignerRootProps {
  service: WorkflowDataService;
  adapter: ICrmAdapter;
  isDevMode: boolean;
  host: HostContext;
}

function DesignerRoot({ service, adapter, isDevMode, host }: DesignerRootProps) {
  const [appMode, setAppMode] = useState<AppMode>('list');
  const [previousMode, setPreviousMode] = useState<'list' | 'view'>('list');
  const sopAdapter = isSopAdapter(adapter) ? (adapter as ISopAdapter) : null;
  const [showWizard, setShowWizard] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [destination, setDestination] = useState<NavDestination>('processes-all');
  const [search, setSearch] = useState('');
  const [sopResetToken, setSopResetToken] = useState(0);
  const view = useWorkflowView(service, adapter);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  // The sitemap owns which screen is showing, and stays visible everywhere —
  // including the editor — so there is one way to navigate rather than a back
  // button per screen. Leaving unsaved work is the one case worth interrupting.
  const handleNavigate = useCallback(async (next: NavDestination) => {
    if (appMode === 'edit' && useWorkflowStore.getState().isDirty) {
      const leave = await confirm({
        title: 'Unsaved changes',
        message: 'This process has unsaved changes. Leave without saving?',
        confirmLabel: 'Leave',
        tone: 'danger',
      });
      if (!leave) return;
    }
    // Returning to the SOP library must also close an open SOP, which the SOP
    // screen tracks itself; the token tells it to.
    if (next === 'sop-library') setSopResetToken((token) => token + 1);
    setDestination(next);
    if (next === 'sop-library') setAppMode('sop-list');
    else if (next === 'roles') setAppMode('roles');
    else setAppMode('list');
  }, [appMode]);

  const handleNewProcess = () => setShowWizard(true);

  // The summary is its own screen: it loads what is stored, so it reads the
  // same from the viewer and the editor.
  const [summaryProcessId, setSummaryProcessId] = useState<string | null>(null);
  const openSummary = useCallback((processId: string) => {
    setSummaryProcessId(processId);
    setAppMode('summary');
  }, []);

  // Wizard "Blank" / template path: build the process graph in memory and open
  // it in the editor. Nothing is persisted until the user clicks Save Draft.
  const handleCreateInMemory = useCallback((
    process: WorkflowProcess,
    steps: WorkflowStep[],
    outcomes: WorkflowOutcome[],
    routes: WorkflowRoute[],
  ) => {
    loadWorkflow(process, steps, outcomes, routes, {});
    clearUndoHistorySoon();
    setShowWizard(false);
    setPreviousMode('list');
    setAppMode('edit');
  }, [loadWorkflow]);

  // Opens a process in view mode (from the list screen)
  const handleOpenProcess = useCallback(async (processId: string) => {
    setLoadingMessage('Opening process…');
    try {
      await view.loadWorkflow(processId);
      setAppMode('view');
    } finally {
      setLoadingMessage(null);
    }
  }, [view]);

  // Loads a process into workflowStore then switches to edit mode
  const handleEditProcess = useCallback(async (processId: string) => {
    setLoadingMessage('Loading process for editing…');
    try {
      const [process, steps, layoutJson, stateJson] = await Promise.all([
        adapter.getProcess(processId),
        adapter.getSteps(processId),
        adapter.loadDesignerLayout(processId).catch(() => null),
        adapter.loadDesignerState(processId).catch(() => null),
      ]);
      const outcomeArrays = await Promise.all(steps.map((s) => adapter.getOutcomes(s.crmId)));
      const allOutcomes: WorkflowOutcome[] = outcomeArrays.flat();

      const conditionalOutcomes = allOutcomes.filter((o) => o.applyFilter);
      const routeArrays = await Promise.all(conditionalOutcomes.map((o) => adapter.getRoutes(o.crmId)));
      const allRoutes: WorkflowRoute[] = routeArrays.flat();

      const layout = parseDesignerLayout(layoutJson);
      loadWorkflow(
        withDesignerState(process as WorkflowProcess, parseDesignerState(stateJson)),
        steps as WorkflowStep[],
        allOutcomes,
        allRoutes,
        layout?.nodePositions ?? {}
      );
      if (layout) useWorkflowStore.getState().applyDesignerLayout(layout);
      clearUndoHistorySoon();
      setPreviousMode(appMode === 'view' ? 'view' : 'list');
      setAppMode('edit');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Failed to load process for editing: ${msg}`, 'error');
    } finally {
      setLoadingMessage(null);
    }
  }, [adapter, appMode, loadWorkflow]);

  // Called from the view toolbar "Edit" button — edits currently-viewed process
  const handleEditCurrentProcess = useCallback(() => {
    if (!view.data) return;
    void handleEditProcess(view.data.process.id);
  }, [view.data, handleEditProcess]);

  // Wizard "Clone existing" path: server-side copy, then open the copy in edit.
  const handleCloneFromWizard = useCallback(async (sourceProcessId: string) => {
    setShowWizard(false);
    setLoadingMessage('Cloning process…');
    try {
      const newProcessId = await adapter.cloneProcess(sourceProcessId);
      await handleEditProcess(newProcessId);
    } catch (err) {
      notify(`Clone failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoadingMessage(null);
    }
  }, [adapter, handleEditProcess]);

  // Wizard "From SOP" path: hand off to the existing SOP designer flow.
  const handleStartFromSop = useCallback(() => {
    setShowWizard(false);
    setAppMode('sop-list');
  }, []);

  const handleExitEdit = useCallback(() => {
    if (previousMode === 'view' && view.data) {
      void view.refresh();
      setAppMode('view');
    } else {
      setAppMode('list');
    }
  }, [previousMode, view]);

  return (
    <AppShell
      environmentLabel={host.environmentLabel}
      userInitials={host.userInitials}
      active={destination}
      onNavigate={(next) => void handleNavigate(next)}
      sopEnabled={!!sopAdapter}
      search={search}
      onSearchChange={setSearch}
      banner={
        isDevMode ? (
          <div style={devBanner}>
            LOCAL DEV — data via Dataverse proxy (org5869857f.crm4.dynamics.com)
          </div>
        ) : undefined
      }
    >
      {/* A column, so a screen can stack a command bar, its page and a status
          strip as siblings the way the design system expects. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {appMode === 'summary' && summaryProcessId ? (
          <ProcessSummaryScreen
            processId={summaryProcessId}
            service={service}
            adapter={adapter}
            onBack={() => setAppMode(previousMode === 'view' ? 'view' : 'list')}
          />
        ) : appMode === 'edit' ? (
          <EditCanvas
            adapter={adapter}
            onExitEdit={handleExitEdit}
            onOpenSummary={() => {
              const current = useWorkflowStore.getState().process;
              if (current) openSummary(current.crmId);
            }}
          />
        ) : appMode === 'view' ? (
          <WorkflowCanvas
            view={view}
            adapter={adapter}
            onNewProcess={handleNewProcess}
            onEditProcess={view.data ? handleEditCurrentProcess : undefined}
            onOpenSummary={view.data ? () => openSummary(view.data!.process.id) : undefined}
          />
        ) : appMode === 'sop-list' && sopAdapter ? (
          <SopListScreen
            resetToken={sopResetToken}
            adapter={sopAdapter}
            onManageRoles={() => void handleNavigate('roles')}
          />
        ) : appMode === 'roles' && sopAdapter ? (
          <RolesScreen
            adapter={sopAdapter}
          />
        ) : (
          <ProcessListScreen
            adapter={adapter}
            onNewProcess={handleNewProcess}
            onOpenProcess={(id) => void handleOpenProcess(id)}
            onEditProcess={(id) => void handleEditProcess(id)}
            search={search}
            onSearchChange={setSearch}
            statusFilter={STATUS_BY_DESTINATION[destination] ?? 'all'}
          />
        )}
      </div>

      {loadingMessage && <LoadingOverlay message={loadingMessage} />}
      {showWizard && (
        <ProcessWizard
          adapter={adapter}
          sopEnabled={!!sopAdapter}
          onCreateInMemory={handleCreateInMemory}
          onClone={(id) => void handleCloneFromWizard(id)}
          onStartFromSop={handleStartFromSop}
          onClose={() => setShowWizard(false)}
        />
      )}
      <ConfirmDialogHost />
      <NotifyHost />
    </AppShell>
  );
}

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div style={overlayBackdrop}>
      <style>{`@keyframes ppSpin { to { transform: rotate(360deg); } }`}</style>
      <div style={overlayCard}>
        <div style={overlaySpinner} />
        <span style={overlayLabel}>{message}</span>
      </div>
    </div>
  );
}

const errorScreen: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100vw',
  height: '100vh',
  background: 'var(--surface-alt)',
};

const errorCard: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--error)',
  borderRadius: 10,
  padding: 32,
  maxWidth: 500,
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};

const errorTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--error)',
  marginBottom: 12,
};

const errorMsg: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text)',
  lineHeight: 1.6,
  marginBottom: 8,
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
};

const errorHint: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-disabled)',
  lineHeight: 1.6,
};

const loadingScreen: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100vw',
  height: '100vh',
  fontSize: 14,
  color: 'var(--text-secondary)',
};

const devBanner: React.CSSProperties = {
  background: 'var(--warning-bg)',
  color: 'var(--warning)',
  fontSize: 11,
  fontWeight: 600,
  textAlign: 'center',
  padding: '3px 0',
  letterSpacing: '0.04em',
  flexShrink: 0,
};

const overlayBackdrop: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(255,255,255,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 500,
  backdropFilter: 'blur(2px)',
};

const overlayCard: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '28px 36px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
};

const overlaySpinner: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '3px solid var(--border)',
  borderTopColor: 'var(--primary)',
  borderRadius: '50%',
  animation: 'ppSpin 0.7s linear infinite',
};

const overlayLabel: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};
