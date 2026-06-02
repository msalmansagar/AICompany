import { useState, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { CrmEnvironmentService } from './services/CrmEnvironmentService';
import { createAdapter } from './services/CrmAdapterFactory';
import { CrmAdapterProvider } from './app/CrmAdapterContext';
import type { ICrmAdapter } from './services/ICrmAdapter';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 5 * 60 * 1000 } },
});

export function App() {
  const [adapter, setAdapter] = useState<ICrmAdapter | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const envService = new CrmEnvironmentService();
      const crmAdapter = createAdapter(envService);
      setAdapter(crmAdapter);
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
            Ensure this web resource is loaded inside Dynamics CRM, or set VITE_USE_REST_API=true for local development.
          </div>
        </div>
      </div>
    );
  }

  if (!adapter) {
    return <div style={loadingScreen}>Initialising Workflow Designer…</div>;
  }

  return (
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <CrmAdapterProvider adapter={adapter}>
          <ReactFlowProvider>
            <WorkflowCanvas />
          </ReactFlowProvider>
        </CrmAdapterProvider>
      </QueryClientProvider>
    </FluentProvider>
  );
}

const errorScreen: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100vw', height: '100vh', background: '#f8fafc',
};
const errorCard: React.CSSProperties = {
  background: '#fff', border: '1px solid #fecaca', borderRadius: 10,
  padding: 32, maxWidth: 480, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
};
const errorTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: '#991b1b', marginBottom: 12,
};
const errorMsg: React.CSSProperties = {
  fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 8,
};
const errorHint: React.CSSProperties = {
  fontSize: 12, color: '#9ca3af', lineHeight: 1.6,
};
const loadingScreen: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100vw', height: '100vh', fontSize: 14, color: '#64748b',
};
