'use client';

import { useSearchParams } from 'next/navigation';
import { Puck, Render } from '@puckeditor/core';
import { landingConfig } from '../../landing.puck';
import { landingData } from '../../landing.puck.data';
import { TokenRoot } from '../TokenRoot';

/**
 * Landing page, composed in Puck.
 *
 * ?mode=edit opens the editor: every section, heading, link, card and footer
 * column is a Puck field. `/landing` is the hand-written React equivalent kept
 * alongside for comparison.
 */
export default function LandingPuckPage() {
  const params = useSearchParams();
  const locale = params.get('dir') === 'rtl' ? 'ar' : 'en';
  const isEdit = params.get('mode') === 'edit';
  const metadata = { locale };

  if (isEdit) {
    return (
      <TokenRoot locale={locale}>
        <div style={{ height: '100vh' }}>
          <Puck
            config={landingConfig}
            data={landingData}
            metadata={metadata}
            iframe={{ enabled: true }}
            onPublish={(d) => console.log('[landing] published', JSON.stringify(d).length, 'bytes')}
          />
        </div>
      </TokenRoot>
    );
  }

  return (
    <TokenRoot locale={locale}>
      <Render config={landingConfig} data={landingData} metadata={metadata} />
    </TokenRoot>
  );
}
