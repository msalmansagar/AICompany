import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CrmEnvironmentService } from './services/CrmEnvironmentService';
import { WorkflowDataService } from './services/WorkflowDataService';
import { createAdapter } from './services/CrmAdapterFactory';
import { useWorkflowView } from './hooks/useWorkflowView';
import { useWorkflowStore } from './store/workflowStore';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { EditCanvas } from './components/edit/EditCanvas';
import { NewProcessDialog } from './components/edit/NewProcessDialog';
import { CrmAdapterProvider } from './app/CrmAdapterContext';
import type { ICrmAdapter } from './services/ICrmAdapter';

type AppMode = 'view' | 'edit';

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
        <DesignerRoot service={service} adapter={adapter} isDevMode={isDevMode} />
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
  const [appMode, setAppMode] = useState<AppMode>('view');
  const [showNewProcessDialog, setShowNewProcessDialog] = useState(false);
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
        regardingField: regardingFieldId,
        parentEntity: parentEntityId,
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
    setAppMode('edit');
  };

  const handleEditProcess = () => {
    setAppMode('edit');
  };

  const handleExitEdit = () => {
    setAppMode('view');
  };

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {isDevMode && (
        <div style={devBanner}>
          LOCAL DEV — data via Dataverse proxy (org5869857f.crm4.dynamics.com)
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        {appMode === 'edit' ? (
          <EditCanvas adapter={adapter} onExitEdit={handleExitEdit} />
        ) : (
          <WorkflowCanvas
            view={view}
            onNewProcess={handleNewProcess}
            onEditProcess={view.data ? handleEditProcess : undefined}
          />
        )}
      </div>

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
