import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('Editor host element is missing.');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
