/**
 * The VISITOR bundle, per ADR-CMS-004: our own renderer, no Puck.
 * Same block library, same page — only the rendering path differs.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { reyadaConfig } from '../reyada.config';
import { reyadaData } from '../reyada.data';

const h = React.createElement;

// The ~60-line renderer proven byte-identical to Puck's <Render>.
function renderTree(config: any, data: any, metadata: Record<string, unknown>) {
  const slot = (blocks: any[] | undefined) => (p: any = {}) =>
    h('div', { className: p.className, style: p.style },
      (blocks ?? []).map((b, i) => block(b, i)));
  const resolve = (def: any, props: any) => {
    const out = { ...props };
    for (const [n, f] of Object.entries<any>(def?.fields ?? {}))
      if (f?.type === 'slot') out[n] = slot(props[n]);
    return out;
  };
  function block(b: any, key: number) {
    const def = config.components[b.type];
    if (!def) return h('div', { key }, `Unknown block: ${b.type}`);
    return h(def.render, { key, ...resolve(def, b.props ?? {}), puck: { isEditing: false, metadata } });
  }
  return h(config.root.render, {
    ...resolve(config.root, data.root?.props ?? {}), puck: { isEditing: false, metadata },
  });
}

const el = document.getElementById('root');
if (el) createRoot(el).render(renderTree(reyadaConfig, reyadaData, { locale: 'en' }));
