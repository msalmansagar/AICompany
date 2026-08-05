'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Puck, Render, type Data } from '@puckeditor/core';
import { studioConfig } from '../../../studio.config';
import { getPage, saveDraft, publishPage, type PageRecord } from '../../../studio.store';
import { TokenRoot } from '../../TokenRoot';

/**
 * Studio — one page, edited or viewed.
 *
 * ?mode=edit loads the DRAFT into Puck; publishing copies draft → published.
 * View mode reads `published`, falling back to the draft with a visible banner
 * so an unpublished page is never silently shown as if it were live.
 *
 * That draft/published split is the same separation `qdb_PublishPage` enforces
 * against the render cache — an admin mid-edit must not change what a citizen
 * is reading.
 */
export default function StudioSlugPage() {
  const routeParams = useParams();
  const params = useSearchParams();
  const slug = String(routeParams?.['slug'] ?? '');
  const locale = params.get('dir') === 'rtl' ? 'ar' : 'en';
  const isEdit = params.get('mode') === 'edit';
  const isAr = locale === 'ar';

  const [record, setRecord] = useState<PageRecord | null | undefined>(undefined);
  const [status, setStatus] = useState('');

  useEffect(() => setRecord(getPage(slug) ?? null), [slug]);

  if (record === undefined) return null; // pre-mount; localStorage not readable yet

  if (record === null) {
    return (
      <TokenRoot locale={locale}>
        <div className="st-shell">
          <div className="st-empty">
            <p>{isAr ? 'الصفحة غير موجودة' : 'Page not found'}</p>
            <Link className="rey-btn" data-variant="primary" data-auto="true" href="/studio">
              {isAr ? 'العودة إلى الاستوديو' : 'Back to Studio'}
            </Link>
          </div>
        </div>
      </TokenRoot>
    );
  }

  const metadata = { locale };

  if (isEdit) {
    return (
      <TokenRoot locale={locale}>
        <div style={{ height: '100vh' }}>
          <Puck
            config={studioConfig}
            data={record.draft}
            metadata={metadata}
            iframe={{ enabled: true }}
            onChange={(data: Data) => saveDraft(slug, data, new Date().toISOString())}
            onPublish={(data: Data) => {
              publishPage(slug, data, new Date().toISOString());
              setStatus(isAr ? 'تم النشر' : 'Published');
              window.setTimeout(() => setStatus(''), 2500);
            }}
            headerPath={record.titleEn}
          />
          {status ? (
            <div
              style={{
                position: 'fixed', insetBlockEnd: 20, insetInlineStart: 20, zIndex: 10000,
                background: '#2f7d68', color: '#fff', padding: '10px 18px',
                borderRadius: 999, fontSize: 14, fontWeight: 600,
              }}
            >
              {status}
            </div>
          ) : null}
        </div>
      </TokenRoot>
    );
  }

  const isUnpublished = !record.published;
  const tree = record.published ?? record.draft;

  return (
    <TokenRoot locale={locale}>
      <div className="st-shell">
        <header className="st-bar">
          <div className="st-bar__inner">
            <h1>{record.titleEn}</h1>
            <span className="st-chip" data-state={isUnpublished ? 'draft' : 'published'}>
              {isUnpublished
                ? isAr ? 'مسودة — غير منشورة' : 'Draft — not published'
                : isAr ? 'منشورة' : 'Published'}
            </span>
            <span className="st-bar__spacer" />
            <Link className="rey-btn" data-variant="outline" data-auto="true" href="/studio">
              {isAr ? 'الاستوديو' : 'Studio'}
            </Link>
            <Link
              className="rey-btn"
              data-variant="primary"
              data-auto="true"
              href={`/studio/${slug}?mode=edit&dir=${isAr ? 'rtl' : 'ltr'}`}
            >
              {isAr ? 'تحرير' : 'Edit'}
            </Link>
          </div>
        </header>
        <Render config={studioConfig} data={tree} metadata={metadata} />
      </div>
    </TokenRoot>
  );
}
