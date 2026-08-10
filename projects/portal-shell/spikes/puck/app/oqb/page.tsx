'use client';

import { useEffect, useRef, useState } from 'react';
import React from 'react';
import { Render } from '@puckeditor/core';
import { reyadaConfig } from '../../reyada.config';
import { reyadaData } from '../../reyada.data';
import { TokenRoot } from '../TokenRoot';
import { renderTree, normaliseHtml as normalise } from '../../runtime/renderTree';

/**
 * OQ-B — should the RUNTIME renderer be Puck's, or our own?
 *
 * Answered: ours. See ADR-CMS-004.
 *
 * This page renders the SAME tree twice — once through Puck's <Render>, once
 * through our renderer — and diffs the result, in a real browser.
 *
 * The renderer itself now lives in runtime/renderTree.tsx and is imported
 * here, by the CI parity gate, and by the bundle measurement. One
 * implementation: a harness testing its own private copy would prove nothing
 * about what ships.
 *
 * The headless equivalent of this page runs on every push —
 * runtime/renderTree.parity.test.tsx — over four pages in both locales.
 * This page remains useful for eyeballing a divergence the diff reports.
 */

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
