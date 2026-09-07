/**
 * Bundling proof for the on-premise web resource.
 *
 * A hardened CRM blocks CDN loads by CSP, so the editor must ship as one
 * self-contained file with zero network requests at runtime. This entry pulls
 * in everything a real designer web resource would: React, ReactDOM, the Puck
 * editor, and our own renderer.
 *
 * The question is not "does it work" — it is whether the bundle is
 * self-contained, how big it is, and whether anything Node-only survives into
 * browser code.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Puck, Render } from '@puckeditor/core';
import { reyadaConfig } from '../reyada.config';
import { reyadaData } from '../reyada.data';

const h = React.createElement;

function App() {
  return h('div', null,
    h(Puck, { config: reyadaConfig as any, data: reyadaData, metadata: { locale: 'en' } }));
}

const el = document.getElementById('root');
if (el) createRoot(el).render(h(App));

// Referenced so the runtime path is included in the measurement too.
export { Render };
