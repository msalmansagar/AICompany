import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import '@xyflow/react/dist/style.css';
import './styles/tokens.css';
import './styles/components.css';
import { App } from './App';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';

enableMapSet();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

/**
 * Keeps Fluent's own components on the same side of light and dark as the rest
 * of the app. FluentProvider supplies the tokens Fluent needs — without it the
 * FetchXML builder's <Dialog> renders unstyled — but it does not read our
 * `data-theme`, so the bridge hands it the matching Fluent palette.
 */
function FluentThemeBridge({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();
  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme} style={{ height: '100%' }}>
      {children}
    </FluentProvider>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <FluentThemeBridge>
        <App />
      </FluentThemeBridge>
    </ThemeProvider>
  </StrictMode>
);
