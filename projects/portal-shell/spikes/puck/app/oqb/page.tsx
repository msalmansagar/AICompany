'use client';

import { useEffect, useRef, useState } from 'react';
import React from 'react';
import { Render } from '@puckeditor/core';
import { reyadaConfig } from '../../reyada.config';
import { reyadaData } from '../../reyada.data';
import { TokenRoot } from '../TokenRoot';

/**
 * OQ-B — should the RUNTIME renderer be Puck's, or our own?
 *
 * If ours, visitors never load Puck at all and the 0.x dependency is confined
 * to the admin surface. That is a materially smaller risk than carrying it on
 * every page a citizen opens.
 *
 * This page renders the SAME tree twice — once through Puck's <Render>, once
 * through the hand-written renderer below — and diffs the resulting HTML. If
 * the output is identical, the question is answered by evidence rather than
 * preference.
 */

/* =====================================================================
   Hand-written renderer.

   Everything it needs to do: walk the tree, look up each block's definition
   by type, resolve named slots into render-prop components, and pass props.

   Deliberately NOT reimplemented, because the CMS does not use them:
     resolveAllData   async/dynamic prop resolution (Puck's resolveData)
     transformProps   field-level prop transforms
     useRichtextProps rich text (blocked on OQ-1 anyway)
     walkTree/zones   Puck's legacy zones mechanism — we use slots only
     migrate          Puck's shape-sniffing migrations; ours is schemaVersion
   ===================================================================== */

type Block = { type: string; props: Record<string, any> };

function renderTree(
  config: any,
  data: any,
  metadata: Record<string, unknown>,
): React.ReactNode {
  /**
   * A slot value is an array of blocks. The component expects to call it as a
   * component — `<Content />` — so each slot becomes a render-prop that accepts
   * the same className/style props Puck's slots accept.
   */
  const slotComponent = (blocks: Block[] | undefined) => {
    const Slot = (slotProps: any = {}) =>
      React.createElement(
        'div',
        { className: slotProps.className, style: slotProps.style },
        (blocks ?? []).map((b, i) => renderBlock(b, i)),
      );
    return Slot;
  };

  /** Replaces any slot-valued prop with its render-prop equivalent. */
  const resolveSlots = (definition: any, props: Record<string, any>) => {
    const out: Record<string, any> = { ...props };
    const fields = definition?.fields ?? {};
    for (const [name, field] of Object.entries<any>(fields)) {
      if (field?.type === 'slot') out[name] = slotComponent(props[name]);
    }
    return out;
  };

  function renderBlock(block: Block, key: number): React.ReactNode {
    const definition = config.components[block.type];
    // A missing definition must be visible, not silently skipped — the same
    // rule as the unknown-icon placeholder.
    if (!definition) {
      return React.createElement(
        'div',
        { key, style: { border: '1px dashed #c0392b', padding: 8, fontSize: 12 } },
        `Unknown block: ${block.type}`,
      );
    }
    const props = resolveSlots(definition, block.props ?? {});
    return React.createElement(definition.render, {
      key,
      ...props,
      puck: { isEditing: false, metadata },
    });
  }

  const rootDefinition = config.root;
  const rootProps = resolveSlots(rootDefinition, data.root?.props ?? {});
  return React.createElement(rootDefinition.render, {
    ...rootProps,
    puck: { isEditing: false, metadata },
  });
}

/* ------------------------------------------------------------------ page */

/** Strips attributes React generates non-deterministically before comparing. */
function normalise(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/ data-rfd-[a-z-]+="[^"]*"/g, '')
    .replace(/ id="[^"]*"/g, '')
    .trim();
}

export default function OqbPage() {
  const puckRef = useRef<HTMLDivElement>(null);
  const oursRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<string>('measuring…');

  useEffect(() => {
    const t = setTimeout(() => {
      const a = normalise(puckRef.current?.innerHTML ?? '');
      const b = normalise(oursRef.current?.innerHTML ?? '');

      let firstDiff = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { firstDiff = i; break; }
      }

      setResult(JSON.stringify({
        puckChars: a.length,
        oursChars: b.length,
        identical: a === b,
        firstDifferenceAt: firstDiff,
        puckAround: firstDiff >= 0 ? a.slice(Math.max(0, firstDiff - 60), firstDiff + 60) : null,
        oursAround: firstDiff >= 0 ? b.slice(Math.max(0, firstDiff - 60), firstDiff + 60) : null,
      }, null, 1));
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  const metadata = { locale: 'en' };

  return (
    <TokenRoot locale="en">
      <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12 }}>
        <pre id="oqbResult" style={{ background: '#0f1b28', color: '#cfe3f5', padding: 14, borderRadius: 8 }}>
          {result}
        </pre>
      </div>
      <div ref={puckRef} data-which="puck">
        <Render config={reyadaConfig} data={reyadaData} metadata={metadata} />
      </div>
      <div ref={oursRef} data-which="ours">
        {renderTree(reyadaConfig, reyadaData, metadata)}
      </div>
    </TokenRoot>
  );
}
