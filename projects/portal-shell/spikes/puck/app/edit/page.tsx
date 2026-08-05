'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Puck } from '@puckeditor/core';
import { config } from '../../puck.config';
import { sampleData } from '../../data';
import { TokenRoot, useResolvedTokens } from '../TokenRoot';

/**
 * Attempts to force the canvas iframe's document into RTL.
 * An iframe document does NOT inherit `dir` from its parent, so this
 * probes whether direction can be injected after mount.
 */
function useForcedIframeDir(enabled: boolean, dir: 'rtl' | 'ltr') {
  const [report, setReport] = useState('not attempted');

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      const frame = document.querySelector('iframe#preview-frame, iframe');
      if (!(frame instanceof HTMLIFrameElement)) return;
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;

      doc.documentElement.dir = dir;
      doc.documentElement.lang = dir === 'rtl' ? 'ar' : 'en';
      if (doc.body) doc.body.dir = dir;
      setReport(`injected dir=${dir} into iframe document`);
      window.clearInterval(timer);
    }, 250);

    return () => window.clearInterval(timer);
  }, [enabled, dir]);

  return report;
}

export default function EditPage() {
  const params = useSearchParams();
  const dir = params.get('dir') === 'ltr' ? 'ltr' : 'rtl';
  const iframeEnabled = params.get('iframe') !== '0';
  const force = params.get('force') === '1';

  const forceReport = useForcedIframeDir(force, dir);
  const [probe, setProbe] = useState('probing…');

  // Read back what the iframe document actually reports, so the verdict is
  // measured rather than eyeballed.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const frame = document.querySelector('iframe');
      if (!(frame instanceof HTMLIFrameElement)) {
        setProbe(iframeEnabled ? 'no iframe found yet' : 'iframe disabled — inline canvas');
        return;
      }
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      const computed = doc.defaultView?.getComputedStyle(doc.body)?.direction;
      setProbe(
        `iframe <html dir="${doc.documentElement.dir || '(empty)'}"> · computed body direction: ${computed}`,
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [iframeEnabled]);

  const locale = dir === 'rtl' ? 'ar' : 'en';
  const tokens = useResolvedTokens(locale);

  return (
    <TokenRoot locale={locale}>
      <div
        style={{
          padding: '8px 12px',
          background: '#111',
          color: '#0f0',
          fontFamily: 'monospace',
          fontSize: 12,
          position: 'sticky',
          top: 0,
          zIndex: 9999,
        }}
      >
        host dir={dir} · iframe={String(iframeEnabled)} · force={String(force)} · {forceReport}
        <br />
        PROBE: {probe}
        <br />
        --font-family-base: {tokens['font-family-base']}
      </div>
      <div style={{ height: 'calc(100vh - 46px)' }}>
        <Puck
          config={config}
          data={sampleData}
          iframe={{ enabled: iframeEnabled }}
          onPublish={(d) => console.log('[spike] published', JSON.stringify(d).length, 'bytes')}
        />
      </div>
    </TokenRoot>
  );
}
