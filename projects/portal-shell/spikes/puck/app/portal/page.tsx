'use client';

import { useSearchParams } from 'next/navigation';
import { Puck, Render } from '@puckeditor/core';
import { portalConfig } from '../../portal.config';
import { portalData } from '../../portal.data';
import { TokenRoot } from '../TokenRoot';

/**
 * Bilingual portal shell.
 *
 * ?dir=rtl (default) → Arabic   ?dir=ltr → English
 * &mode=edit         → the same shell, editable
 *
 * The locale travels into components through Puck's `metadata`, so ONE tree
 * renders in both languages. The in-header language toggle simply flips the
 * `dir` query param.
 */
export default function PortalPage() {
  const params = useSearchParams();
  const locale = params.get('dir') === 'ltr' ? 'en' : 'ar';
  const isEdit = params.get('mode') === 'edit';

  // Same object shape for both surfaces — the runtime and the editor must not
  // disagree about what locale they are rendering.
  const metadata = { locale };

  if (!isEdit) {
    return (
      <TokenRoot locale={locale}>
        <Render config={portalConfig} data={portalData} metadata={metadata} />
      </TokenRoot>
    );
  }

  return (
    <TokenRoot locale={locale}>
      <div style={{ height: '100vh' }}>
        <Puck
          config={portalConfig}
          data={portalData}
          metadata={metadata}
          iframe={{ enabled: true }}
          onPublish={(d) => console.log('[portal] published', JSON.stringify(d).length, 'bytes')}
        />
      </div>
    </TokenRoot>
  );
}
