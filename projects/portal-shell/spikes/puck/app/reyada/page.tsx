'use client';

import { useSearchParams } from 'next/navigation';
import { Puck, Render } from '@puckeditor/core';
import { reyadaConfig } from '../../reyada.config';
import { reyadaData } from '../../reyada.data';
import { TokenRoot } from '../TokenRoot';

/**
 * Reyada Advisory dashboard.
 *
 * ?dir=ltr → English   ?dir=rtl → Arabic (default)   &mode=edit → editable
 *
 * The floating switch sits outside the Puck tree so it is available in both
 * view and edit modes; the portal's own in-page language control would live
 * in the header component in production.
 */
export default function ReyadaPage() {
  const params = useSearchParams();
  const locale = params.get('dir') === 'ltr' ? 'en' : 'ar';
  const isEdit = params.get('mode') === 'edit';
  const metadata = { locale };

  const other = locale === 'ar' ? 'ltr' : 'rtl';
  const switchHref = `?dir=${other}${isEdit ? '&mode=edit' : ''}`;

  return (
    <TokenRoot locale={locale}>
      <a
        href={switchHref}
        style={{
          position: 'fixed',
          insetBlockEnd: 20,
          insetInlineEnd: 20,
          zIndex: 10000,
          background: '#1b3a63',
          color: '#fff',
          padding: '11px 20px',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
        }}
        lang={locale === 'ar' ? 'en' : 'ar'}
      >
        {locale === 'ar' ? 'English' : 'العربية'}
      </a>

      {isEdit ? (
        <div style={{ height: '100vh' }}>
          <Puck config={reyadaConfig} data={reyadaData} metadata={metadata} iframe={{ enabled: true }} />
        </div>
      ) : (
        <Render config={reyadaConfig} data={reyadaData} metadata={metadata} />
      )}
    </TokenRoot>
  );
}
