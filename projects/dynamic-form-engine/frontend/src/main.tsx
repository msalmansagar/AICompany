import React from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './auth/msalConfig';
import { App } from './App';
import { AppearanceProvider } from './theme/AppearanceProvider';
// The token layer is shared with the designer, so the two cannot drift. The
// '@qdb/shared' alias resolves to a single barrel file rather than a directory,
// which is why this reaches for the stylesheet by path.
import '../../shared/src/theme/tokens.css';
import './styles/components.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" not found in document');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      {/*
       * Base theme for the whole portal (LTR by default). AppearanceProvider
       * carries the chosen appearance into both halves of the design system —
       * data-theme for the token stylesheet and a Fluent Theme for Fluent's own
       * components.
       * Language/RTL is scoped to the form view only (OQ-001): App wraps
       * the form renderer in LanguageProvider, so the portal shell and the
       * form-selection catalogue always stay English/LTR.
       */}
      <AppearanceProvider>
        <App />
      </AppearanceProvider>
    </MsalProvider>
  </React.StrictMode>,
);
