import React from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { msalInstance } from './auth/msalConfig';
import { App } from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" not found in document');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <FluentProvider theme={webLightTheme}>
        <App />
      </FluentProvider>
    </MsalProvider>
  </React.StrictMode>,
);
