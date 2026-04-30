import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { readCrmContext } from './hooks/useCrmContext';
import { useWorkflowStore } from './store/workflowStore';

export function App() {
  const setCrmContext = useWorkflowStore((s) => s.setCrmContext);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const context = readCrmContext();
      setCrmContext(context);
      setReady(true);
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Failed to read CRM context.');
    }
  }, [setCrmContext]);

  if (initError) {
    return (
      <div style={errorScreen}>
        <div style={errorCard}>
          <div style={errorTitle}>Workflow Designer — Initialisation Error</div>
          <div style={errorMsg}>{initError}</div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div style={loadingScreen}>Loading Workflow Designer…</div>;
  }

  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}

const errorScreen: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100%', height: '100%', background: '#f8fafc',
};
const errorCard: React.CSSProperties = {
  background: '#fff', border: '1px solid #fecaca', borderRadius: 10,
  padding: 32, maxWidth: 440, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};
const errorTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: '#991b1b', marginBottom: 12 };
const errorMsg: React.CSSProperties = { fontSize: 13, color: '#64748b', lineHeight: 1.6 };
const loadingScreen: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100%', height: '100%', fontSize: 14, color: '#64748b',
};
