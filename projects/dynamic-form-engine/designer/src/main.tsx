import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in DOM');

// Dev-only visual feedback tool (import.meta.env.DEV is statically false in
// production builds, so the chunk is eliminated from the CRM bundle).
// The cast bridges the workspace's duplicated @types/react: agentation hoists
// to the root (@types/react 19, required by mobile) while the designer
// compiles against its own @types/react 18.
const AgentationDevTool = import.meta.env.DEV
  ? React.lazy(async () => {
      const { Agentation } = await import('agentation');
      return { default: Agentation as unknown as React.ComponentType };
    })
  : null;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
    {AgentationDevTool && (
      <React.Suspense fallback={null}>
        <AgentationDevTool />
      </React.Suspense>
    )}
  </React.StrictMode>
);
