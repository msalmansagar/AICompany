import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import '@xyflow/react/dist/style.css';
import { App } from './App';

enableMapSet();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

// FluentProvider supplies the theme tokens Fluent components need — without it
// the FetchXML builder's <Dialog> renders unstyled (no backdrop, no centered
// surface). height:100% keeps the full-height #root layout intact.
createRoot(rootElement).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme} style={{ height: '100%' }}>
      <App />
    </FluentProvider>
  </StrictMode>
);
