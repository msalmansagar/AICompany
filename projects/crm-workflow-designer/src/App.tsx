import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { CrmEnvironmentService } from './services/CrmEnvironmentService';
import { WorkflowDataService } from './services/WorkflowDataService';
import { useWorkflowView } from './hooks/useWorkflowView';
import { WorkflowCanvas } from './components/WorkflowCanvas';

export function App() {
  const [service, setService] = useState<WorkflowDataService | null>(null);
  const [isDevMode, setIsDevMode] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const env = new CrmEnvironmentService();
      setIsDevMode(env.isDevMode);
      setService(new WorkflowDataService(env));
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

  if (!service) {
    return <div style={loadingScreen}>Initialising Workflow Designer…</div>;
  }

  return (
    <ReactFlowProvider>
      <DesignerRoot service={service} isDevMode={isDevMode} />
    </ReactFlowProvider>
  );
}

function DesignerRoot({
  service,
  isDevMode,
}: {
  service: WorkflowDataService;
  isDevMode: boolean;
}) {
  const view = useWorkflowView(service);
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {isDevMode && (
        <div style={devBanner}>
          LOCAL DEV — data via Dataverse proxy (org5869857f.crm4.dynamics.com)
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorkflowCanvas view={view} />
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
