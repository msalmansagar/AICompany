'use client';

import { useSearchParams } from 'next/navigation';
import { Puck, Render } from '@puckeditor/core';
import { loginConfig } from '../../landing.puck';
import { loginData } from '../../landing.puck.data';
import { TokenRoot } from '../TokenRoot';

/**
 * Login page, composed in Puck.
 *
 * ?mode=edit opens the editor. Submitting the form in view mode navigates to
 * the dashboard; inside the editor the submit is inert so the admin is not
 * navigated away from the canvas.
 */
export default function LoginPuckPage() {
  const params = useSearchParams();
  const locale = params.get('dir') === 'rtl' ? 'ar' : 'en';
  const isEdit = params.get('mode') === 'edit';
  const metadata = { locale };

  if (isEdit) {
    return (
      <TokenRoot locale={locale}>
        <div style={{ height: '100vh' }}>
          <Puck
            config={loginConfig}
            data={loginData}
            metadata={metadata}
            iframe={{ enabled: true }}
            onPublish={(d) => console.log('[login] published', JSON.stringify(d).length, 'bytes')}
          />
        </div>
      </TokenRoot>
    );
  }

  return (
    <TokenRoot locale={locale}>
      <Render config={loginConfig} data={loginData} metadata={metadata} />
    </TokenRoot>
  );
}
