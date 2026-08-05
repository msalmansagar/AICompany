import type { Config } from '@puckeditor/core';
import { Icon } from './reyada.icons';

/**
 * Reyada Advisory portal — bilingual Puck configuration.
 *
 * One tree, localised props (`…En` / `…Ar`), locale delivered through Puck
 * `metadata`. Structure is shared by construction so Arabic and English can
 * never drift apart.
 *
 * Photography is represented by CSS gradients. In production these become
 * image URLs served from Dataverse/CMS — the prop is already a plain string,
 * so swapping `background` for `url(...)` is a data change, not a code change.
 */

type Locale = 'en' | 'ar';

function localeOf(meta: Record<string, unknown> | undefined): Locale {
  return meta?.['locale'] === 'en' ? 'en' : 'ar';
}

function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Localised string with fallback to the other language when blank. */
function t(locale: Locale, en: string, ar: string): string {
  const primary = locale === 'en' ? en : ar;
  return primary?.trim() ? primary : locale === 'en' ? ar : en;
}

/** Renders the calendar / clock / pin metadata rows shared by several cards. */
function MetaList({
  rows,
  dir,
}: {
  rows: { icon: string; text: string }[];
  dir: 'rtl' | 'ltr';
}) {
  return (
    <div className="rey-meta__list">
      {rows.map((row, i) => (
        <div className="rey-meta" key={i}>
          <Icon name={row.icon} dir={dir} />
          {/* <bdi> isolates the value from the surrounding paragraph direction.
              Without it a Latin string such as "10:00 AM - 6:00 PM" inside an
              Arabic paragraph is reordered by the bidi algorithm and renders as
              "AM - 6:00 PM 10:00" — wrong, and easy to miss in review. */}
          <bdi>{row.text}</bdi>
        </div>
      ))}
    </div>
  );
}

const BADGE_ICON: Record<string, string> = {
  green: 'exhibition',
  navy: 'matchmaking',
  purple: 'workshop',
  sme: 'exhibition',
};

export const reyadaConfig: Config = {
  root: {
    fields: {
      aside: { type: 'slot' },
      welcome: { type: 'slot' },
      heading: { type: 'slot' },
      mainColumn: { type: 'slot' },
      sideColumn: { type: 'slot' },
    },
    render: ({
      aside: Aside,
      welcome: Welcome,
      heading: Heading,
      mainColumn: MainColumn,
      sideColumn: SideColumn,
    }) => (
      <div className="rey-shell">
        <aside className="rey-shell__aside">
          <Aside />
        </aside>
        <div className="rey-shell__body">
          <Welcome />
          <Heading />
          <div className="rey-shell__main">
            <div className="rey-grid">
              <MainColumn className="rey-col" />
              <SideColumn className="rey-col" />
            </div>
          </div>
        </div>
      </div>
    ),
  },

  components: {
    // ------------------------------------------------------------- sidebar
    Sidebar: {
      label: 'الشريط الجانبي (Sidebar)',
      fields: {
        items: {
          type: 'array',
          label: 'عناصر القائمة',
          arrayFields: {
            labelEn: { type: 'text', label: 'التسمية (EN)' },
            labelAr: { type: 'text', label: 'التسمية (AR)' },
            icon: { type: 'text', label: 'الأيقونة' },
            active: { type: 'radio', options: [{ label: 'نعم', value: 'yes' }, { label: 'لا', value: 'no' }] },
            hasChevron: { type: 'radio', options: [{ label: 'نعم', value: 'yes' }, { label: 'لا', value: 'no' }] },
          },
        },
      },
      render: ({ items, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <>
            <div className="rey-brand">
              <div className="rey-brand__mark">
                <span className="rey-brand__ar">ريادة</span>
                <span className="rey-brand__en">REYADA</span>
                <span className="rey-brand__chip">ADVISORY</span>
              </div>
              <div className="rey-brand__divider" />
              <div className="rey-brand__powered">
                <span className="rey-brand__powered-label">
                  {t(locale, 'POWERED BY', 'بدعم من')}
                </span>
                <span className="rey-brand__qdb">QDB</span>
                <span className="rey-brand__qdb-sub">
                  {t(locale, 'Qatar Development Bank', 'بنك قطر للتنمية')}
                </span>
              </div>
            </div>

            <nav className="rey-nav">
              {(items ?? []).map((item: Record<string, string>, i: number) => (
                <a
                  key={i}
                  href="#"
                  className="rey-nav__link"
                  data-active={item.active === 'yes'}
                >
                  <Icon name={item.icon} size={19} dir={dir} />
                  <span>{t(locale, item.labelEn, item.labelAr)}</span>
                  {item.hasChevron === 'yes' && (
                    <Icon name="chevron" size={17} dir={dir} className="rey-nav__chevron" />
                  )}
                </a>
              ))}
            </nav>

            <div className="rey-aside__pattern" />
            <button
              className="rey-aside__collapse"
              aria-label={t(locale, 'Collapse menu', 'طي القائمة')}
              type="button"
            >
              <Icon name="doubleChevron" size={18} dir={dir} />
            </button>
          </>
        );
      },
    },

    // -------------------------------------------------------- welcome bar
    WelcomeBar: {
      label: 'شريط الترحيب (Welcome)',
      fields: {
        greetingEn: { type: 'text', label: 'الترحيب (EN)' },
        greetingAr: { type: 'text', label: 'الترحيب (AR)' },
        roleEn: { type: 'text', label: 'الصفة (EN)' },
        roleAr: { type: 'text', label: 'الصفة (AR)' },
        supportEn: { type: 'text', label: 'الدعم (EN)' },
        supportAr: { type: 'text', label: 'الدعم (AR)' },
        initials: { type: 'text', label: 'الأحرف الأولى' },
      },
      render: ({ greetingEn, greetingAr, roleEn, roleAr, supportEn, supportAr, initials, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <div className="rey-welcome">
            <div className="rey-welcome__icon">
              <Icon name="rocket" size={22} dir={dir} />
            </div>
            <div>
              <div className="rey-welcome__name">{t(locale, greetingEn, greetingAr)}</div>
              <div className="rey-welcome__role">{t(locale, roleEn, roleAr)}</div>
            </div>
            <div className="rey-welcome__actions">
              <a className="rey-welcome__support" href="#">
                <Icon name="help" size={20} dir={dir} />
                <span>{t(locale, supportEn, supportAr)}</span>
              </a>
              <div className="rey-avatar">{initials}</div>
            </div>
          </div>
        );
      },
    },

    // ------------------------------------------------------- page heading
    PageHeading: {
      label: 'عنوان الصفحة',
      fields: {
        titleEn: { type: 'text', label: 'العنوان (EN)' },
        titleAr: { type: 'text', label: 'العنوان (AR)' },
        subtitleEn: { type: 'text', label: 'الوصف (EN)' },
        subtitleAr: { type: 'text', label: 'الوصف (AR)' },
      },
      render: ({ titleEn, titleAr, subtitleEn, subtitleAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <div className="rey-heading">
            <h1>{t(locale, titleEn, titleAr)}</h1>
            <p>{t(locale, subtitleEn, subtitleAr)}</p>
          </div>
        );
      },
    },

    // ------------------------------------------------ growth opportunities
    GrowthOpportunities: {
      label: 'فرص النمو (Growth)',
      fields: {
        titleEn: { type: 'text', label: 'العنوان (EN)' },
        titleAr: { type: 'text', label: 'العنوان (AR)' },
        subtitleEn: { type: 'text', label: 'الوصف (EN)' },
        subtitleAr: { type: 'text', label: 'الوصف (AR)' },
        viewAllEn: { type: 'text', label: 'عرض الكل (EN)' },
        viewAllAr: { type: 'text', label: 'عرض الكل (AR)' },
        learnMoreEn: { type: 'text', label: 'زر (EN)' },
        learnMoreAr: { type: 'text', label: 'زر (AR)' },
        events: {
          type: 'array',
          label: 'الفعاليات',
          arrayFields: {
            media: { type: 'text', label: 'الصورة (CSS)' },
            tone: { type: 'text', label: 'اللون' },
            badgeEn: { type: 'text', label: 'التصنيف (EN)' },
            badgeAr: { type: 'text', label: 'التصنيف (AR)' },
            titleEn: { type: 'text', label: 'العنوان (EN)' },
            titleAr: { type: 'text', label: 'العنوان (AR)' },
            dateEn: { type: 'text', label: 'التاريخ (EN)' },
            dateAr: { type: 'text', label: 'التاريخ (AR)' },
            timeEn: { type: 'text', label: 'الوقت (EN)' },
            timeAr: { type: 'text', label: 'الوقت (AR)' },
            venueEn: { type: 'text', label: 'المكان (EN)' },
            venueAr: { type: 'text', label: 'المكان (AR)' },
            regEn: { type: 'text', label: 'التسجيل (EN)' },
            regAr: { type: 'text', label: 'التسجيل (AR)' },
          },
        },
      },
      render: ({
        titleEn, titleAr, subtitleEn, subtitleAr, viewAllEn, viewAllAr,
        learnMoreEn, learnMoreAr, events, puck,
      }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="rey-card">
            <div className="rey-card__head">
              <h2 className="rey-card__title">{t(locale, titleEn, titleAr)}</h2>
              <a className="rey-card__viewall" href="#">{t(locale, viewAllEn, viewAllAr)}</a>
            </div>
            <p className="rey-card__sub">{t(locale, subtitleEn, subtitleAr)}</p>
            <div className="rey-events">
              {(events ?? []).map((e: Record<string, string>, i: number) => (
                <article className="rey-event" key={i}>
                  <div className="rey-event__media" style={{ background: e.media }} />
                  <span className="rey-badge" data-tone={e.tone}>
                    <Icon name={BADGE_ICON[e.tone] ?? 'exhibition'} size={14} dir={dir} />
                    {t(locale, e.badgeEn, e.badgeAr)}
                  </span>
                  <h3 className="rey-event__title">{t(locale, e.titleEn, e.titleAr)}</h3>
                  <MetaList
                    dir={dir}
                    rows={[
                      { icon: 'calendar', text: t(locale, e.dateEn, e.dateAr) },
                      { icon: 'clock', text: t(locale, e.timeEn, e.timeAr) },
                      { icon: 'pin', text: t(locale, e.venueEn, e.venueAr) },
                    ]}
                  />
                  <div className="rey-event__reg">{t(locale, e.regEn, e.regAr)}</div>
                  <a className="rey-btn" data-variant="outline" href="#">
                    {t(locale, learnMoreEn, learnMoreAr)}
                  </a>
                </article>
              ))}
            </div>
          </section>
        );
      },
    },

    // ------------------------------------------------------ reyada academy
    ReyadaAcademy: {
      label: 'أكاديمية ريادة (Academy)',
      fields: {
        titleEn: { type: 'text', label: 'العنوان (EN)' },
        titleAr: { type: 'text', label: 'العنوان (AR)' },
        subtitleEn: { type: 'text', label: 'الوصف (EN)' },
        subtitleAr: { type: 'text', label: 'الوصف (AR)' },
        media: { type: 'text', label: 'الصورة (CSS)' },
        programEn: { type: 'text', label: 'البرنامج (EN)' },
        programAr: { type: 'text', label: 'البرنامج (AR)' },
        descEn: { type: 'textarea', label: 'النص (EN)' },
        descAr: { type: 'textarea', label: 'النص (AR)' },
        timeEn: { type: 'text', label: 'الوقت (EN)' },
        timeAr: { type: 'text', label: 'الوقت (AR)' },
        venueEn: { type: 'text', label: 'المكان (EN)' },
        venueAr: { type: 'text', label: 'المكان (AR)' },
        learnMoreEn: { type: 'text', label: 'زر ١ (EN)' },
        learnMoreAr: { type: 'text', label: 'زر ١ (AR)' },
        portalEn: { type: 'text', label: 'زر ٢ (EN)' },
        portalAr: { type: 'text', label: 'زر ٢ (AR)' },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="rey-card">
            <h2 className="rey-card__title">{t(locale, p.titleEn, p.titleAr)}</h2>
            <p className="rey-card__sub" style={{ marginBlockStart: 6 }}>
              {t(locale, p.subtitleEn, p.subtitleAr)}
            </p>
            <div className="rey-academy__item">
              <div className="rey-academy__media" style={{ background: p.media }} />
              <div>
                <h3 className="rey-academy__title">{t(locale, p.programEn, p.programAr)}</h3>
                <p className="rey-academy__desc">{t(locale, p.descEn, p.descAr)}</p>
                <MetaList
                  dir={dir}
                  rows={[
                    { icon: 'clock', text: t(locale, p.timeEn, p.timeAr) },
                    { icon: 'pin', text: t(locale, p.venueEn, p.venueAr) },
                  ]}
                />
                <div className="rey-academy__actions">
                  <a className="rey-btn" data-variant="outline-green" data-auto="true" href="#">
                    {t(locale, p.learnMoreEn, p.learnMoreAr)}
                  </a>
                  <a className="rey-btn" data-variant="primary" data-auto="true" href="#">
                    {t(locale, p.portalEn, p.portalAr)}
                  </a>
                </div>
              </div>
            </div>
            <div className="rey-dots">
              {[0, 1, 2, 3, 4].map((d) => (
                <i key={d} data-active={d === 2} />
              ))}
            </div>
          </section>
        );
      },
    },

    // ----------------------------------------------------- explore services
    ExploreServices: {
      label: 'خدمات ريادة (Services)',
      fields: {
        titleEn: { type: 'text', label: 'العنوان (EN)' },
        titleAr: { type: 'text', label: 'العنوان (AR)' },
        subtitleEn: { type: 'text', label: 'الوصف (EN)' },
        subtitleAr: { type: 'text', label: 'الوصف (AR)' },
        viewAllEn: { type: 'text', label: 'عرض الكل (EN)' },
        viewAllAr: { type: 'text', label: 'عرض الكل (AR)' },
        services: {
          type: 'array',
          label: 'الخدمات',
          arrayFields: {
            media: { type: 'text', label: 'الصورة (CSS)' },
            titleEn: { type: 'text', label: 'العنوان (EN)' },
            titleAr: { type: 'text', label: 'العنوان (AR)' },
            badgeEn: { type: 'text', label: 'الشارة (EN)' },
            badgeAr: { type: 'text', label: 'الشارة (AR)' },
          },
        },
      },
      render: ({ titleEn, titleAr, subtitleEn, subtitleAr, viewAllEn, viewAllAr, services, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="rey-card">
            <div className="rey-card__head">
              <h2 className="rey-card__title">{t(locale, titleEn, titleAr)}</h2>
              <a className="rey-card__viewall" href="#">{t(locale, viewAllEn, viewAllAr)}</a>
            </div>
            <p className="rey-card__sub">{t(locale, subtitleEn, subtitleAr)}</p>
            <div className="rey-services">
              {(services ?? []).map((s: Record<string, string>, i: number) => (
                <article className="rey-service" key={i}>
                  <div className="rey-service__media" style={{ background: s.media }} />
                  {s.badgeEn ? (
                    <span className="rey-badge" data-tone="sme">
                      <Icon name="exhibition" size={13} dir={dir} />
                      {t(locale, s.badgeEn, s.badgeAr)}
                    </span>
                  ) : null}
                  <h3 className="rey-service__title">{t(locale, s.titleEn, s.titleAr)}</h3>
                </article>
              ))}
            </div>
          </section>
        );
      },
    },

    // -------------------------------------------------------- advisory promo
    AdvisoryPromo: {
      label: 'الاستشارات الفورية (Promo)',
      fields: {
        media: { type: 'text', label: 'الصورة (CSS)' },
        titleEn: { type: 'text', label: 'العنوان (EN)' },
        titleAr: { type: 'text', label: 'العنوان (AR)' },
        bodyEn: { type: 'textarea', label: 'النص (EN)' },
        bodyAr: { type: 'textarea', label: 'النص (AR)' },
        ctaEn: { type: 'text', label: 'الزر (EN)' },
        ctaAr: { type: 'text', label: 'الزر (AR)' },
      },
      render: ({ media, titleEn, titleAr, bodyEn, bodyAr, ctaEn, ctaAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="rey-card">
            <div className="rey-promo__media" style={{ background: media }}>
              <h2 className="rey-promo__title">{t(locale, titleEn, titleAr)}</h2>
              <Icon name="headset" size={54} dir={dir} className="rey-promo__icon" />
            </div>
            <p className="rey-promo__body">{t(locale, bodyEn, bodyAr)}</p>
            <a className="rey-btn" data-variant="primary" href="#">
              {t(locale, ctaEn, ctaAr)}
              <Icon name="chevron" size={17} dir={dir} />
            </a>
          </section>
        );
      },
    },

    // ------------------------------------------------------ registered events
    RegisteredEvents: {
      label: 'الفعاليات المسجلة (Registered)',
      fields: {
        titleEn: { type: 'text', label: 'العنوان (EN)' },
        titleAr: { type: 'text', label: 'العنوان (AR)' },
        subtitleEn: { type: 'text', label: 'الوصف (EN)' },
        subtitleAr: { type: 'text', label: 'الوصف (AR)' },
        allEn: { type: 'text', label: 'الرابط (EN)' },
        allAr: { type: 'text', label: 'الرابط (AR)' },
        items: {
          type: 'array',
          label: 'العناصر',
          arrayFields: {
            tone: { type: 'text', label: 'اللون' },
            badgeEn: { type: 'text', label: 'التصنيف (EN)' },
            badgeAr: { type: 'text', label: 'التصنيف (AR)' },
            titleEn: { type: 'text', label: 'العنوان (EN)' },
            titleAr: { type: 'text', label: 'العنوان (AR)' },
            dateEn: { type: 'text', label: 'التاريخ (EN)' },
            dateAr: { type: 'text', label: 'التاريخ (AR)' },
            timeEn: { type: 'text', label: 'الوقت (EN)' },
            timeAr: { type: 'text', label: 'الوقت (AR)' },
            venueEn: { type: 'text', label: 'المكان (EN)' },
            venueAr: { type: 'text', label: 'المكان (AR)' },
          },
        },
      },
      render: ({ titleEn, titleAr, subtitleEn, subtitleAr, allEn, allAr, items, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="rey-card">
            <h2 className="rey-card__title">{t(locale, titleEn, titleAr)}</h2>
            <p className="rey-card__sub" style={{ marginBlockStart: 6 }}>
              {t(locale, subtitleEn, subtitleAr)}
            </p>
            <div className="rey-reg">
              {(items ?? []).map((e: Record<string, string>, i: number) => (
                <div className="rey-reg__item" data-tone={e.tone} key={i}>
                  <span className="rey-badge" data-tone={e.tone}>
                    <Icon name={BADGE_ICON[e.tone] ?? 'exhibition'} size={14} dir={dir} />
                    {t(locale, e.badgeEn, e.badgeAr)}
                  </span>
                  <h3 className="rey-reg__title">{t(locale, e.titleEn, e.titleAr)}</h3>
                  <MetaList
                    dir={dir}
                    rows={[
                      { icon: 'calendar', text: t(locale, e.dateEn, e.dateAr) },
                      { icon: 'clock', text: t(locale, e.timeEn, e.timeAr) },
                      { icon: 'pin', text: t(locale, e.venueEn, e.venueAr) },
                    ]}
                  />
                </div>
              ))}
            </div>
            <a className="rey-reg__all" href="#">{t(locale, allEn, allAr)}</a>
          </section>
        );
      },
    },

    // ------------------------------------------------------ CR registration
    BusinessRegistration: {
      label: 'تسجيل الشركة (CR)',
      fields: {
        titleEn: { type: 'text', label: 'العنوان (EN)' },
        titleAr: { type: 'text', label: 'العنوان (AR)' },
        bodyEn: { type: 'text', label: 'النص (EN)' },
        bodyAr: { type: 'text', label: 'النص (AR)' },
        ctaEn: { type: 'text', label: 'الزر (EN)' },
        ctaAr: { type: 'text', label: 'الزر (AR)' },
        noteEn: { type: 'text', label: 'ملاحظة (EN)' },
        noteAr: { type: 'text', label: 'ملاحظة (AR)' },
      },
      render: ({ titleEn, titleAr, bodyEn, bodyAr, ctaEn, ctaAr, noteEn, noteAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="rey-card">
            <h2 className="rey-card__title">{t(locale, titleEn, titleAr)}</h2>
            <p className="rey-card__sub" style={{ marginBlockStart: 8, marginBlockEnd: 18 }}>
              {t(locale, bodyEn, bodyAr)}
            </p>
            <a className="rey-btn" data-variant="navy" href="#">
              <Icon name="lock" size={18} dir={dir} />
              {t(locale, ctaEn, ctaAr)}
            </a>
            <p className="rey-cr__note">
              <span>{t(locale, noteEn, noteAr)}</span>
              <Icon name="external" size={15} dir={dir} />
            </p>
          </section>
        );
      },
    },
  },
};

export default reyadaConfig;
