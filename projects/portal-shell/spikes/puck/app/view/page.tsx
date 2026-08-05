'use client';

import { useSearchParams } from 'next/navigation';
import { Render } from '@puckeditor/core';
import { config } from '../../puck.config';
import { sampleData } from '../../data';
import { TokenRoot, useResolvedTokens } from '../TokenRoot';

/**
 * F1 — the runtime path every citizen sees. No editor bundle.
 */
export default function ViewPage() {
  const params = useSearchParams();
  const locale = params.get('dir') === 'ltr' ? 'en' : 'ar';
  const tokens = useResolvedTokens(locale);

  return (
    <TokenRoot locale={locale}>
      <div style={{ padding: '8px 12px', background: '#111', color: '#0f0', fontFamily: 'monospace', fontSize: 12 }}>
        F1 runtime &lt;Render&gt; · locale={locale}
        <br />
        --font-family-base: {tokens['font-family-base']}
        <br />
        --text-direction: {tokens['text-direction']}
      </div>
      <main style={{ maxWidth: 860, marginInline: 'auto', padding: 24 }}>
        <Render config={config} data={sampleData} />
      </main>
    </TokenRoot>
  );
}
