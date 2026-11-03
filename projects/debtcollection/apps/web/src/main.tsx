import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const host = document.getElementById('dcp-root');
if (!host) throw new Error('The workspace host element #dcp-root is missing from the page.');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
