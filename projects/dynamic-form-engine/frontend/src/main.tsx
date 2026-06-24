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
      {/*
       * Base Fluent theme for the whole portal (LTR by default).
       * Language/RTL is scoped to the form view only (OQ-001): App wraps
       * the form renderer in LanguageProvider, so the portal shell and the
       * form-selection catalogue always stay English/LTR.
       */}
      <FluentProvider theme={webLightTheme}>
        <App />
      </FluentProvider>
    </MsalProvider>
  </React.StrictMode>,
);
