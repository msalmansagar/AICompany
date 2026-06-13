import { useEffect, useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CrmEnvironmentService } from './services/CrmEnvironmentService';
import { WorkflowDataService } from './services/WorkflowDataService';
import { createAdapter } from './services/CrmAdapterFactory';
import { useWorkflowView } from './hooks/useWorkflowView';
import { useWorkflowStore } from './store/workflowStore';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { EditCanvas } from './components/edit/EditCanvas';
import { NewProcessDialog } from './components/edit/NewProcessDialog';
import { ProcessListScreen } from './components/ProcessListScreen';
import { SopListScreen } from './components/SopListScreen/SopListScreen';
import { RolesScreen } from './components/RolesScreen/RolesScreen';
import { CrmAdapterProvider } from './app/CrmAdapterContext';
import { SopAdapterContext } from './app/SopAdapterContext';
import { isSopAdapter } from './services/ISopAdapter';
import type { ICrmAdapter } from './services/ICrmAdapter';
import type { ISopAdapter } from './services/ISopAdapter';
import type { WorkflowProcess, WorkflowStep, WorkflowOutcome } from './types/WorkflowTypes';

type AppMode = 'list' | 'view' | 'edit' | 'sop-list' | 'roles';

export function App() {
  const [service, setService] = useState<WorkflowDataService | null>(null);
  const [adapter, setAdapter] = useState<ICrmAdapter | null>(null);
  const [isDevMode, setIsDevMode] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const env = new CrmEnvironmentService();
      setIsDevMode(env.isDevMode);
      setService(new WorkflowDataService(env));
      setAdapter(createAdapter(env));
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
          <DesignerRoot service={service} adapter={adapter} isDevMode={isDevMode} />
        </SopAdapterContext.Provider>
      </CrmAdapterProvider>
    </ReactFlowProvider>
  );
}

interface DesignerRootProps {
  service: WorkflowDataService;
  adapter: ICrmAdapter;
  isDevMode: boolean;
}

function DesignerRoot({ service, adapter, isDevMode }: DesignerRootProps) {
  const [appMode, setAppMode] = useState<AppMode>('list');
  const [previousMode, setPreviousMode] = useState<'list' | 'view'>('list');
  const sopAdapter = isSopAdapter(adapter) ? (adapter as ISopAdapter) : null;
  const [showNewProcessDialog, setShowNewProcessDialog] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const view = useWorkflowView(service);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);

  const handleNewProcess = () => setShowNewProcessDialog(true);

  const handleNewProcessConfirm = ({
    name,
    taskEntityId,
    regardingFieldId,
    parentEntityId,
  }: {
    name: string;
    taskEntityId: string;
    taskEntityName: string;
    regardingFieldId: string;
    regardingFieldName: string;
    parentEntityId: string;
    parentEntityName: string;
  }) => {
    const tmpId = `tmp_${crypto.randomUUID()}`;
    loadWorkflow(
      {
        crmId: tmpId,
        name,
        recordEntity: taskEntityId,
        recordEntityName: null,
        regardingField: regardingFieldId,
        parentEntity: parentEntityId,
        parentEntityName: null,
        versionMajor: 1,
        versionMinor: 0,
        workflowState: 'draft',
        snapshot: null,
      },
      [],
      [],
      [],
      {}
    );
    setShowNewProcessDialog(false);
    setPreviousMode('list');
    setAppMode('edit');
  };

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
      const [process, steps] = await Promise.all([
        adapter.getProcess(processId),
        adapter.getSteps(processId),
      ]);
      const outcomeArrays = await Promise.all(steps.map((s) => adapter.getOutcomes(s.crmId)));
      const allOutcomes: WorkflowOutcome[] = outcomeArrays.flat();

      loadWorkflow(process as WorkflowProcess, steps as WorkflowStep[], allOutcomes, [], {});
      setPreviousMode(appMode === 'view' ? 'view' : 'list');
      setAppMode('edit');
    } finally {
      setLoadingMessage(null);
    }
  }, [adapter, appMode, loadWorkflow]);

  // Called from the view toolbar "Edit" button — edits currently-viewed process
  const handleEditCurrentProcess = useCallback(() => {
    if (!view.data) return;
    void handleEditProcess(view.data.process.id);
  }, [view.data, handleEditProcess]);

  const handleExitEdit = useCallback(() => {
    if (previousMode === 'view' && view.data) {
      void view.refresh();
      setAppMode('view');
    } else {
      setAppMode('list');
    }
  }, [previousMode, view]);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {isDevMode && (
        <div style={devBanner}>
          LOCAL DEV — data via Dataverse proxy (org5869857f.crm4.dynamics.com)
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {appMode === 'edit' ? (
          <EditCanvas adapter={adapter} onExitEdit={handleExitEdit} />
        ) : appMode === 'view' ? (
          <WorkflowCanvas
            view={view}
            onNewProcess={handleNewProcess}
            onEditProcess={view.data ? handleEditCurrentProcess : undefined}
            onBackToList={() => setAppMode('list')}
          />
        ) : appMode === 'sop-list' && sopAdapter ? (
          <SopListScreen
            adapter={sopAdapter}
            onBack={() => setAppMode('list')}
            onManageRoles={() => setAppMode('roles')}
          />
        ) : appMode === 'roles' && sopAdapter ? (
          <RolesScreen
            adapter={sopAdapter}
            onBack={() => setAppMode('sop-list')}
          />
        ) : (
          <ProcessListScreen
            adapter={adapter}
            onNewProcess={handleNewProcess}
            onOpenProcess={(id) => void handleOpenProcess(id)}
            onEditProcess={(id) => void handleEditProcess(id)}
            onOpenSopDesigner={sopAdapter ? () => setAppMode('sop-list') : undefined}
          />
        )}
      </div>

      {loadingMessage && <LoadingOverlay message={loadingMessage} />}
      {showNewProcessDialog && (
        <NewProcessDialog
          adapter={adapter}
          onConfirm={handleNewProcessConfirm}
          onClose={() => setShowNewProcessDialog(false)}
        />
      )}
    </div>
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
  background: '#f8fafc',
};

const errorCard: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #fecaca',
  borderRadius: 10,
  padding: 32,
  maxWidth: 500,
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};

const errorTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#991b1b',
  marginBottom: 12,
};

const errorMsg: React.CSSProperties = {
  fontSize: 13,
  color: '#374151',
  lineHeight: 1.6,
  marginBottom: 8,
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
};

const errorHint: React.CSSProperties = {
  fontSize: 12,
  color: '#9ca3af',
  lineHeight: 1.6,
};

const loadingScreen: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100vw',
  height: '100vh',
  fontSize: 14,
  color: '#64748b',
};

const devBanner: React.CSSProperties = {
  background: '#92400e',
  color: '#fef3c7',
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
  background: '#ffffff',
  border: '1px solid #edebe9',
  borderRadius: 4,
  padding: '28px 36px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
};

const overlaySpinner: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '3px solid #edebe9',
  borderTopColor: '#0078d4',
  borderRadius: '50%',
  animation: 'ppSpin 0.7s linear infinite',
};

const overlayLabel: React.CSSProperties = {
  fontSize: 13,
  color: '#605e5c',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};
