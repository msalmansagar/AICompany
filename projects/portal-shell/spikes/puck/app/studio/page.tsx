'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  listPages, createPage, deletePage, slugify, type PageRecord,
} from '../../studio.store';
import { TokenRoot } from '../TokenRoot';

/**
 * Studio — page management.
 *
 * Create a page, open it in the editor, publish it, view it. This is the half
 * of a CMS that a component demo leaves out, and the half that decides whether
 * the thing is usable.
 */
export default function StudioPage() {
  const params = useSearchParams();
  const locale = params.get('dir') === 'rtl' ? 'ar' : 'en';
  const isAr = locale === 'ar';

  const [pages, setPages] = useState<PageRecord[]>([]);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');

  // localStorage is unavailable during SSR, so the list loads after mount.
  useEffect(() => setPages(listPages()), []);

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    const finalSlug = slugify(slug || title);
    if (!finalSlug) {
      setError(isAr ? 'العنوان مطلوب' : 'A title is required');
      return;
    }
    const created = createPage({
      slug: finalSlug,
      titleEn: title || finalSlug,
      titleAr: title || finalSlug,
      now: new Date().toISOString(),
    });
    if (!created) {
      setError(isAr ? 'هذا المعرّف مستخدم بالفعل' : 'That slug already exists');
      return;
    }
    setError('');
    setTitle('');
    setSlug('');
    setPages(listPages());
  }

  function handleDelete(target: string) {
    deletePage(target);
    setPages(listPages());
  }

  return (
    <TokenRoot locale={locale}>
      <div className="st-shell">
        <header className="st-bar">
          <div className="st-bar__inner">
            <h1>{isAr ? 'استوديو الصفحات' : 'Page Studio'}</h1>
            <span className="st-page-row__slug">
              {pages.length} {isAr ? 'صفحة' : 'pages'}
            </span>
            <span className="st-bar__spacer" />
            <Link className="rey-btn" data-variant="outline" data-auto="true" href={`?dir=${isAr ? 'ltr' : 'rtl'}`}>
              {isAr ? 'English' : 'العربية'}
            </Link>
          </div>
        </header>

        <main className="st-main">
          <form className="st-new" onSubmit={handleCreate}>
            <div className="st-field">
              <label htmlFor="title">{isAr ? 'عنوان الصفحة' : 'Page title'}</label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isAr ? 'مثال: من نحن' : 'e.g. About Us'}
              />
            </div>
            <div className="st-field">
              <label htmlFor="slug">{isAr ? 'المعرّف (اختياري)' : 'Slug (optional)'}</label>
              <input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugify(title) || 'about-us'}
                dir="ltr"
              />
            </div>
            <div>
              <button className="rey-btn" data-variant="primary" type="submit">
                {isAr ? 'إنشاء صفحة' : 'Create page'}
              </button>
            </div>
          </form>

          {error ? (
            <p style={{ color: '#c0392b', fontSize: 13, marginBlockEnd: 16 }}>{error}</p>
          ) : null}

          {pages.length === 0 ? (
            <div className="st-empty">
              {isAr
                ? 'لا توجد صفحات بعد. أنشئ واحدة للبدء.'
                : 'No pages yet. Create one to get started.'}
            </div>
          ) : (
            <div className="st-pages">
              {pages.map((page) => (
                <div className="st-page-row" key={page.slug}>
                  <div>
                    <div className="st-page-row__title">{page.titleEn}</div>
                    <div className="st-page-row__slug">/{page.slug}</div>
                  </div>
                  <span className="st-chip" data-state={page.published ? 'published' : 'draft'}>
                    {page.published
                      ? isAr ? 'منشورة' : 'Published'
                      : isAr ? 'مسودة' : 'Draft'}
                  </span>
                  <div className="st-page-row__actions">
                    <Link
                      className="rey-btn"
                      data-variant="primary"
                      data-auto="true"
                      href={`/studio/${page.slug}?mode=edit&dir=${isAr ? 'rtl' : 'ltr'}`}
                    >
                      {isAr ? 'تحرير' : 'Edit'}
                    </Link>
                    <Link
                      className="rey-btn"
                      data-variant="outline"
                      data-auto="true"
                      href={`/studio/${page.slug}?dir=${isAr ? 'rtl' : 'ltr'}`}
                    >
                      {isAr ? 'عرض' : 'View'}
                    </Link>
                    <button
                      className="rey-btn"
                      data-variant="outline"
                      data-auto="true"
                      type="button"
                      onClick={() => handleDelete(page.slug)}
                    >
                      {isAr ? 'حذف' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </TokenRoot>
  );
}
