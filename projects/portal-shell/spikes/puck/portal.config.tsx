import type { Config } from '@puckeditor/core';

/**
 * Bilingual portal shell composed entirely inside Puck.
 *
 * ONE TREE, LOCALISED PROPS — not two trees per language.
 *
 * Every text prop exists as an `…En` / `…Ar` pair, mirroring the Dataverse
 * convention already used by the component registry (`qdb_displayname` /
 * `qdb_displaynamear`). The active language is passed through Puck's
 * `metadata` and read via `puck.metadata.locale`.
 *
 * Why one tree: with two trees an admin can add a card to Arabic and forget
 * English, and the layouts silently diverge. With one tree the STRUCTURE is
 * shared by construction and only the strings vary — a missing translation is
 * visible as a missing string, not as a different page.
 *
 * Layout/responsive rules live in app/portal.css (inline styles cannot express
 * media or container queries). RTL comes from CSS logical properties.
 */

type Locale = 'en' | 'ar';

/** Reads the active locale out of Puck metadata, defaulting to Arabic. */
function localeOf(meta: Record<string, unknown> | undefined): Locale {
  return meta?.['locale'] === 'en' ? 'en' : 'ar';
}

/** Picks the localised string, falling back to the other language if empty. */
function pick(locale: Locale, en: string, ar: string): string {
  const primary = locale === 'en' ? en : ar;
  const fallback = locale === 'en' ? ar : en;
  return primary?.trim() ? primary : fallback;
}

export type PortalProps = {
  HeaderBar: { titleEn: string; titleAr: string; subtitleEn: string; subtitleAr: string; userNameEn: string; userNameAr: string };
  NavMenu: { headingEn: string; headingAr: string; items: { labelEn: string; labelAr: string; icon: string; badge: string }[] };
  FooterBar: { copyrightEn: string; copyrightAr: string; links: { labelEn: string; labelAr: string }[] };
  PageTitle: { textEn: string; textAr: string; captionEn: string; captionAr: string };
  StatCard: { labelEn: string; labelAr: string; value: string; trendEn: string; trendAr: string };
  CardRow: { cards: unknown };
  RichCard: { headingEn: string; headingAr: string; bodyEn: string; bodyAr: string };
};

export const portalConfig: Config<PortalProps> = {
  root: {
    fields: {
      header: { type: 'slot' },
      nav: { type: 'slot' },
      content: { type: 'slot' },
      footer: { type: 'slot' },
    },
    render: ({ header: Header, nav: Nav, content: Content, footer: Footer }) => (
      <div className="qdb-shell">
        <div className="qdb-shell__header">
          <Header />
        </div>
        <aside className="qdb-shell__nav">
          <Nav />
        </aside>
        <main className="qdb-shell__main">
          <Content />
        </main>
        <div className="qdb-shell__footer">
          <Footer />
        </div>
      </div>
    ),
  },

  components: {
    HeaderBar: {
      label: 'شريط الرأس (Header)',
      fields: {
        titleEn: { type: 'text', label: 'اسم الجهة (EN)' },
        titleAr: { type: 'text', label: 'اسم الجهة (AR)' },
        subtitleEn: { type: 'text', label: 'الوصف (EN)' },
        subtitleAr: { type: 'text', label: 'الوصف (AR)' },
        userNameEn: { type: 'text', label: 'اسم المستخدم (EN)' },
        userNameAr: { type: 'text', label: 'اسم المستخدم (AR)' },
      },
      defaultProps: {
        titleEn: 'Qatar Development Bank',
        titleAr: 'بنك قطر للتنمية',
        subtitleEn: 'Digital Services Portal',
        subtitleAr: 'بوابة الخدمات الإلكترونية',
        userNameEn: 'Mohammed Salman',
        userNameAr: 'محمد سلمان',
      },
      render: ({ titleEn, titleAr, subtitleEn, subtitleAr, userNameEn, userNameAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <header className="qdb-header">
            <div className="qdb-header__logo">QDB</div>
            <div className="qdb-header__titles">
              <div className="qdb-header__title">{pick(locale, titleEn, titleAr)}</div>
              <div className="qdb-header__subtitle">{pick(locale, subtitleEn, subtitleAr)}</div>
            </div>
            <div className="qdb-header__user">
              {/* The language switcher is a real portal feature, so it lives in
                  the header component rather than in spike chrome. */}
              <a
                className="qdb-lang-toggle"
                href={locale === 'ar' ? '?dir=ltr' : '?dir=rtl'}
                aria-label={locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
                lang={locale === 'ar' ? 'en' : 'ar'}
              >
                {locale === 'ar' ? 'English' : 'العربية'}
              </a>
              <span className="qdb-header__username">{pick(locale, userNameEn, userNameAr)}</span>
              <div className="qdb-header__avatar" />
            </div>
          </header>
        );
      },
    },

    NavMenu: {
      label: 'قائمة التنقل (Nav)',
      fields: {
        headingEn: { type: 'text', label: 'عنوان القائمة (EN)' },
        headingAr: { type: 'text', label: 'عنوان القائمة (AR)' },
        items: {
          type: 'array',
          label: 'العناصر',
          arrayFields: {
            labelEn: { type: 'text', label: 'التسمية (EN)' },
            labelAr: { type: 'text', label: 'التسمية (AR)' },
            icon: { type: 'text', label: 'الأيقونة' },
            badge: { type: 'text', label: 'شارة' },
          },
        },
      },
      defaultProps: {
        headingEn: 'Main menu',
        headingAr: 'القائمة الرئيسية',
        items: [{ labelEn: 'Dashboard', labelAr: 'لوحة المعلومات', icon: '▦', badge: '' }],
      },
      render: ({ headingEn, headingAr, items, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <nav aria-label={pick(locale, headingEn, headingAr)}>
            <div className="qdb-nav__heading">{pick(locale, headingEn, headingAr)}</div>
            <ul className="qdb-nav__list">
              {(items ?? []).map((item, i) => (
                <li key={i}>
                  <a href="#" className="qdb-nav__link" data-active={i === 0}>
                    <span aria-hidden>{item.icon}</span>
                    <span>{pick(locale, item.labelEn, item.labelAr)}</span>
                    {item.badge ? <span className="qdb-nav__badge">{item.badge}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        );
      },
    },

    FooterBar: {
      label: 'التذييل (Footer)',
      fields: {
        copyrightEn: { type: 'text', label: 'حقوق النشر (EN)' },
        copyrightAr: { type: 'text', label: 'حقوق النشر (AR)' },
        links: {
          type: 'array',
          label: 'روابط',
          arrayFields: {
            labelEn: { type: 'text', label: 'التسمية (EN)' },
            labelAr: { type: 'text', label: 'التسمية (AR)' },
          },
        },
      },
      defaultProps: {
        copyrightEn: '© 2026 Qatar Development Bank',
        copyrightAr: '© 2026 بنك قطر للتنمية',
        links: [{ labelEn: 'Privacy Policy', labelAr: 'سياسة الخصوصية' }],
      },
      render: ({ copyrightEn, copyrightAr, links, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <footer className="qdb-footer">
            <span>{pick(locale, copyrightEn, copyrightAr)}</span>
            <span className="qdb-footer__links">
              {(links ?? []).map((l, i) => (
                <a key={i} href="#" style={{ color: 'inherit' }}>
                  {pick(locale, l.labelEn, l.labelAr)}
                </a>
              ))}
            </span>
          </footer>
        );
      },
    },

    PageTitle: {
      label: 'عنوان الصفحة',
      fields: {
        textEn: { type: 'text', label: 'العنوان (EN)' },
        textAr: { type: 'text', label: 'العنوان (AR)' },
        captionEn: { type: 'text', label: 'الوصف (EN)' },
        captionAr: { type: 'text', label: 'الوصف (AR)' },
      },
      defaultProps: {
        textEn: 'Dashboard',
        textAr: 'لوحة المعلومات',
        captionEn: 'Overview of your requests and services',
        captionAr: 'نظرة عامة على طلباتك وخدماتك',
      },
      render: ({ textEn, textAr, captionEn, captionAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <div className="qdb-page-title">
            <h1>{pick(locale, textEn, textAr)}</h1>
            <p>{pick(locale, captionEn, captionAr)}</p>
          </div>
        );
      },
    },

    CardRow: {
      label: 'صف البطاقات',
      fields: { cards: { type: 'slot' } },
      render: ({ cards: Cards }) => <Cards className="qdb-card-row" />,
    },

    StatCard: {
      label: 'بطاقة إحصائية',
      fields: {
        labelEn: { type: 'text', label: 'التسمية (EN)' },
        labelAr: { type: 'text', label: 'التسمية (AR)' },
        value: { type: 'text', label: 'القيمة' },
        trendEn: { type: 'text', label: 'التغيير (EN)' },
        trendAr: { type: 'text', label: 'التغيير (AR)' },
      },
      defaultProps: {
        labelEn: 'Active requests',
        labelAr: 'الطلبات النشطة',
        value: '12',
        trendEn: '+3 this month',
        trendAr: '+3 هذا الشهر',
      },
      render: ({ labelEn, labelAr, value, trendEn, trendAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <div className="qdb-card">
            <div className="qdb-card__label">{pick(locale, labelEn, labelAr)}</div>
            {/* Digits stay Latin in both locales — QDB financial figures are
                read by both audiences and Arabic-Indic numerals are a separate
                brand decision, not a translation one. */}
            <div className="qdb-card__value">{value}</div>
            <div className="qdb-card__trend">{pick(locale, trendEn, trendAr)}</div>
          </div>
        );
      },
    },

    RichCard: {
      label: 'بطاقة محتوى',
      fields: {
        headingEn: { type: 'text', label: 'العنوان (EN)' },
        headingAr: { type: 'text', label: 'العنوان (AR)' },
        bodyEn: { type: 'textarea', label: 'النص (EN)' },
        bodyAr: { type: 'textarea', label: 'النص (AR)' },
      },
      defaultProps: { headingEn: 'Heading', headingAr: 'عنوان', bodyEn: 'Text', bodyAr: 'نص' },
      render: ({ headingEn, headingAr, bodyEn, bodyAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <article className="qdb-rich-card">
            <h2>{pick(locale, headingEn, headingAr)}</h2>
            <p>{pick(locale, bodyEn, bodyAr)}</p>
          </article>
        );
      },
    },
  },
};

export default portalConfig;
