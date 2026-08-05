import type { Config } from '@puckeditor/core';
import { Icon } from './reyada.icons';

/**
 * Landing page + login, composed entirely in Puck.
 *
 * Every section below is a draggable, editable component — headings, body
 * copy, nav links, service cards, steps, providers, benefits and footer
 * columns are all Puck fields, not hardcoded JSX.
 *
 * Bilingual by the pattern validated earlier: `…En` / `…Ar` prop pairs, locale
 * delivered through Puck `metadata`, one tree for both languages.
 *
 * Layout/visuals reuse app/landing.css unchanged — because that CSS was
 * written against classNames rather than inline styles, converting these pages
 * from React to Puck required no styling changes at all.
 */

type Locale = 'en' | 'ar';

const localeOf = (m: Record<string, unknown> | undefined): Locale =>
  m?.['locale'] === 'en' ? 'en' : 'ar';

const dirOf = (l: Locale): 'rtl' | 'ltr' => (l === 'ar' ? 'rtl' : 'ltr');

const t = (l: Locale, en: string, ar: string): string => {
  const primary = l === 'en' ? en : ar;
  return primary?.trim() ? primary : l === 'en' ? ar : en;
};

/** Bilingual text field pair, so field definitions stay readable. */
const pair = (label: string) => ({
  [`${label}En`]: { type: 'text' as const, label: `${label} (EN)` },
  [`${label}Ar`]: { type: 'text' as const, label: `${label} (AR)` },
});

const TAG_TONE: Record<string, string> = {
  SME: 'sme', Investor: 'investor', Expert: 'expert', Startup: 'startup',
  'المنشآت الصغيرة': 'sme', مستثمر: 'investor', خبير: 'expert', 'شركة ناشئة': 'startup',
};

/** Tags are a comma-separated string rather than a nested array — one less
 *  level of nesting for an editor to navigate, and they are always short. */
const splitTags = (value: string): string[] =>
  (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function BrandMark() {
  return (
    <div className="rey-brand" style={{ padding: 0, gap: 10 }}>
      <div className="rey-brand__mark">
        <span className="rey-brand__ar" style={{ fontSize: 17 }}>ريادة</span>
        <span className="rey-brand__en" style={{ fontSize: 7 }}>REYADA</span>
      </div>
      <div className="rey-brand__divider" style={{ alignSelf: 'center', blockSize: 26 }} />
      <span className="rey-brand__qdb" style={{ fontSize: 15 }}>QDB</span>
    </div>
  );
}

const BUBBLES = [
  { icon: 'exhibition', top: '18%', start: '11%' },
  { icon: 'book', top: '40%', start: '5%' },
  { icon: 'award', top: '62%', start: '13%' },
  { icon: 'rocket', top: '20%', end: '12%' },
  { icon: 'users', top: '44%', end: '5%' },
  { icon: 'briefcase', top: '64%', end: '14%' },
];

export const landingConfig: Config = {
  root: {
    fields: { sections: { type: 'slot' } },
    render: ({ sections: Sections }) => (
      <div className="lp">
        <Sections />
      </div>
    ),
  },

  components: {
    // ------------------------------------------------------------- top nav
    TopNav: {
      label: 'شريط التنقل (Top Nav)',
      fields: {
        links: {
          type: 'array',
          label: 'الروابط',
          arrayFields: { ...pair('label') },
        },
        ...pair('lang'),
        ...pair('cta'),
        ctaHref: { type: 'text', label: 'رابط الزر' },
      },
      defaultProps: {
        links: [{ labelEn: 'Services', labelAr: 'الخدمات' }],
        langEn: 'عربي', langAr: 'English',
        ctaEn: 'Button title', ctaAr: 'تسجيل الدخول',
        ctaHref: '/login',
      },
      render: ({ links, langEn, langAr, ctaEn, ctaAr, ctaHref, puck }) => {
        const locale = localeOf(puck?.metadata);
        const other = locale === 'ar' ? 'ltr' : 'rtl';
        return (
          <header className="lp-nav">
            <BrandMark />
            <nav className="lp-nav__links">
              {(links ?? []).map((l: Record<string, string>, i: number) => (
                <a href="#" key={i}>{t(locale, l.labelEn, l.labelAr)}</a>
              ))}
            </nav>
            <div className="lp-nav__right">
              <a className="lp-nav__lang" href={`?dir=${other}`}>{t(locale, langEn, langAr)}</a>
              <a
                className="rey-btn"
                data-variant="primary"
                data-auto="true"
                href={`${ctaHref}?dir=${dirOf(locale)}`}
              >
                {t(locale, ctaEn, ctaAr)}
              </a>
            </div>
          </header>
        );
      },
    },

    // ---------------------------------------------------------------- hero
    Hero: {
      label: 'القسم الرئيسي (Hero)',
      fields: {
        ...pair('lead'), ...pair('highlight1'), ...pair('middle'),
        ...pair('highlight2'), ...pair('tail'),
        subEn: { type: 'textarea', label: 'الوصف (EN)' },
        subAr: { type: 'textarea', label: 'الوصف (AR)' },
        ...pair('placeholder'), ...pair('search'),
      },
      defaultProps: {
        leadEn: 'Find the Perfect ', leadAr: 'اعثر على ',
        highlight1En: 'Service', highlight1Ar: 'الخدمة',
        middleEn: ' for Your ', middleAr: ' المثالية لاحتياجات ',
        highlight2En: 'Business', highlight2Ar: 'عملك',
        tailEn: ' Needs', tailAr: '',
        subEn: 'Connect with trusted advisors and discover services tailored to your business needs.',
        subAr: 'تواصل مع مستشارين موثوقين واكتشف خدمات مصممة خصيصاً لاحتياجات عملك.',
        placeholderEn: 'Service title or keyword...', placeholderAr: 'اسم الخدمة أو كلمة مفتاحية...',
        searchEn: 'Search', searchAr: 'بحث',
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="lp-hero">
            {BUBBLES.map((b, i) => (
              <span
                key={i}
                className="lp-bubble"
                style={{ insetBlockStart: b.top, insetInlineStart: b.start, insetInlineEnd: b.end }}
              >
                <Icon name={b.icon} size={19} dir={dir} />
              </span>
            ))}
            <h1>
              {t(locale, p.leadEn, p.leadAr)}
              <span className="lp__hi">{t(locale, p.highlight1En, p.highlight1Ar)}</span>
              {t(locale, p.middleEn, p.middleAr)}
              <span className="lp__hi">{t(locale, p.highlight2En, p.highlight2Ar)}</span>
              {t(locale, p.tailEn, p.tailAr)}
            </h1>
            <p>{t(locale, p.subEn, p.subAr)}</p>
            <div className="lp-search">
              <Icon name="services" size={18} dir={dir} style={{ color: '#8b98a5' }} />
              <input
                type="search"
                placeholder={t(locale, p.placeholderEn, p.placeholderAr)}
                aria-label={t(locale, p.searchEn, p.searchAr)}
              />
              <span className="rey-btn" data-variant="primary" data-auto="true">
                {t(locale, p.searchEn, p.searchAr)}
              </span>
            </div>
          </section>
        );
      },
    },

    // --------------------------------------------------------- service rail
    ServiceRail: {
      label: 'شريط الخدمات (Service Rail)',
      fields: {
        cards: {
          type: 'array',
          label: 'البطاقات',
          arrayFields: {
            ...pair('title'),
            tagsEn: { type: 'text', label: 'الوسوم (EN, comma-separated)' },
            tagsAr: { type: 'text', label: 'الوسوم (AR)' },
            ...pair('sub'), ...pair('providers'),
            media: { type: 'text', label: 'الخلفية (CSS)' },
          },
        },
        activeDot: { type: 'number', label: 'النقطة النشطة' },
      },
      render: ({ cards, activeDot, puck }) => {
        const locale = localeOf(puck?.metadata);
        const list = cards ?? [];
        return (
          <>
            <div className="lp-rail">
              {list.map((c: Record<string, string>, i: number) => (
                <article className="lp-service" key={i} style={{ background: c.media }}>
                  <div className="lp-service__tags">
                    {splitTags(t(locale, c.tagsEn, c.tagsAr)).map((tag) => (
                      <span className="lp-tag" data-tone={TAG_TONE[tag]} key={tag}>{tag}</span>
                    ))}
                  </div>
                  <h3 className="lp-service__title">{t(locale, c.titleEn, c.titleAr)}</h3>
                  {t(locale, c.subEn, c.subAr) ? (
                    <span className="lp-service__meta">{t(locale, c.subEn, c.subAr)}</span>
                  ) : null}
                  <span className="lp-service__meta">{t(locale, c.providersEn, c.providersAr)}</span>
                </article>
              ))}
            </div>
            <div className="lp-dots">
              {list.map((_: unknown, i: number) => (
                <i key={i} data-active={i === (activeDot ?? 0)} />
              ))}
            </div>
          </>
        );
      },
    },

    // -------------------------------------------------------- how it works
    HowItWorks: {
      label: 'كيف يعمل (How It Works)',
      fields: {
        ...pair('lead'), ...pair('highlight'), ...pair('tail'),
        descEn: { type: 'textarea', label: 'الوصف (EN)' },
        descAr: { type: 'textarea', label: 'الوصف (AR)' },
        steps: {
          type: 'array',
          label: 'الخطوات',
          arrayFields: {
            ...pair('step'), ...pair('title'),
            art: { type: 'text', label: 'لون الرسم' },
            accent: { type: 'radio', options: [{ label: 'نعم', value: 'yes' }, { label: 'لا', value: 'no' }] },
          },
        },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        return (
          <section className="lp-works">
            <div className="lp__wrap">
              <div className="lp-works__head">
                <h2>
                  {t(locale, p.leadEn, p.leadAr)}
                  <span className="lp__hi">{t(locale, p.highlightEn, p.highlightAr)}</span>
                  {t(locale, p.tailEn, p.tailAr)}
                </h2>
                <p>{t(locale, p.descEn, p.descAr)}</p>
              </div>
              <div className="lp-steps">
                {(p.steps ?? []).map((s: Record<string, string>, i: number) => (
                  <div className="lp-step" key={i}>
                    <span className="lp-step__label" data-accent={s.accent === 'yes'}>
                      {t(locale, s.stepEn, s.stepAr)}
                    </span>
                    <span className="lp-step__title">{t(locale, s.titleEn, s.titleAr)}</span>
                    <span className="lp-step__num">{i + 1}</span>
                    <span className="lp-step__art" style={{ background: s.art }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      },
    },

    // ---------------------------------------------------------- choose path
    ChoosePath: {
      label: 'اختر مسارك (Choose Path)',
      fields: {
        ...pair('title'), ...pair('sub'),
        cards: {
          type: 'array',
          label: 'البطاقات',
          arrayFields: {
            ...pair('title'),
            descEn: { type: 'textarea', label: 'الوصف (EN)' },
            descAr: { type: 'textarea', label: 'الوصف (AR)' },
            items: { type: 'array', label: 'النقاط', arrayFields: { ...pair('label') } },
            ...pair('cta'),
            variant: { type: 'radio', options: [{ label: 'Navy', value: 'navy' }, { label: 'Green', value: 'primary' }] },
            icon: { type: 'text', label: 'الأيقونة' },
          },
        },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="lp-path">
            <div className="lp__wrap">
              <h2>{t(locale, p.titleEn, p.titleAr)}</h2>
              <p>{t(locale, p.subEn, p.subAr)}</p>
              <div className="lp-path__cards">
                {(p.cards ?? []).map((c: Record<string, any>, i: number) => (
                  <div className="lp-path__card" key={i}>
                    <span className="lp-path__icon">
                      <Icon name={c.icon || 'help'} size={20} dir={dir} />
                    </span>
                    <h3>{t(locale, c.titleEn, c.titleAr)}</h3>
                    <p>{t(locale, c.descEn, c.descAr)}</p>
                    {(c.items ?? []).map((item: Record<string, string>, j: number) => (
                      <span className="lp-check" key={j}>
                        <Icon name="check" size={15} dir={dir} />
                        {t(locale, item.labelEn, item.labelAr)}
                      </span>
                    ))}
                    <span
                      className="rey-btn"
                      data-variant={c.variant || 'primary'}
                      style={{ marginBlockStart: 'auto' }}
                    >
                      {t(locale, c.ctaEn, c.ctaAr)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      },
    },

    // -------------------------------------------------------- top providers
    TopProviders: {
      label: 'أفضل المزودين (Top Providers)',
      fields: {
        ...pair('lead'), ...pair('highlight'), ...pair('viewAll'),
        providers: {
          type: 'array',
          label: 'المزودون',
          arrayFields: {
            ...pair('name'),
            tagsEn: { type: 'text', label: 'الوسوم (EN)' },
            tagsAr: { type: 'text', label: 'الوسوم (AR)' },
            descEn: { type: 'textarea', label: 'الوصف (EN)' },
            descAr: { type: 'textarea', label: 'الوصف (AR)' },
          },
        },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="lp-providers">
            <div className="lp__wrap">
              <h2>
                {t(locale, p.leadEn, p.leadAr)}
                <span className="lp__hi">{t(locale, p.highlightEn, p.highlightAr)}</span>
              </h2>
              <div className="lp-providers__grid">
                {(p.providers ?? []).map((pr: Record<string, string>, i: number) => (
                  <article className="lp-provider" key={i}>
                    <div className="lp-provider__head">
                      <span className="lp-provider__logo">
                        <Icon name="briefcase" size={16} dir={dir} />
                      </span>
                      <span className="lp-provider__name">{t(locale, pr.nameEn, pr.nameAr)}</span>
                    </div>
                    <div className="lp-provider__tags">
                      {splitTags(t(locale, pr.tagsEn, pr.tagsAr)).map((tg) => <span key={tg}>{tg}</span>)}
                    </div>
                    <p>{t(locale, pr.descEn, pr.descAr)}</p>
                  </article>
                ))}
              </div>
              <span className="rey-btn" data-variant="primary" data-auto="true">
                {t(locale, p.viewAllEn, p.viewAllAr)}
              </span>
            </div>
          </section>
        );
      },
    },

    // --------------------------------------------------------- academy band
    AcademyBand: {
      label: 'أكاديمية ريادة (Academy)',
      fields: {
        ...pair('title'),
        descEn: { type: 'textarea', label: 'الوصف (EN)' },
        descAr: { type: 'textarea', label: 'الوصف (AR)' },
        ...pair('cta'),
        cards: {
          type: 'array',
          label: 'البطاقات',
          arrayFields: {
            ...pair('title'),
            descEn: { type: 'textarea', label: 'الوصف (EN)' },
            descAr: { type: 'textarea', label: 'الوصف (AR)' },
            icon: { type: 'text', label: 'الأيقونة' },
          },
        },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="lp-academy">
            <div className="lp__wrap">
              <div className="rey-brand__mark" style={{ marginInline: 'auto' }}>
                <span className="rey-brand__ar" style={{ color: '#fff' }}>ريادة</span>
                <span className="rey-brand__en" style={{ color: '#fff' }}>REYADA</span>
              </div>
              <h2>{t(locale, p.titleEn, p.titleAr)}</h2>
              <p>{t(locale, p.descEn, p.descAr)}</p>
              <div className="lp-academy__grid">
                {(p.cards ?? []).map((c: Record<string, string>, i: number) => (
                  <div className="lp-academy__card" key={i}>
                    <span className="lp-icon-circle">
                      <Icon name={c.icon || 'award'} size={18} dir={dir} />
                    </span>
                    <h3>{t(locale, c.titleEn, c.titleAr)}</h3>
                    <p>{t(locale, c.descEn, c.descAr)}</p>
                  </div>
                ))}
              </div>
              <span className="rey-btn" data-variant="primary" data-auto="true">
                {t(locale, p.ctaEn, p.ctaAr)}
              </span>
            </div>
          </section>
        );
      },
    },

    // ------------------------------------------------------ become provider
    BecomeProvider: {
      label: 'انضم كمزود (Become Provider)',
      fields: {
        ...pair('lead'), ...pair('highlight'),
        descEn: { type: 'textarea', label: 'الوصف (EN)' },
        descAr: { type: 'textarea', label: 'الوصف (AR)' },
        ...pair('primaryCta'), ...pair('secondaryCta'),
        benefits: {
          type: 'array',
          label: 'المزايا',
          arrayFields: {
            ...pair('title'),
            descEn: { type: 'textarea', label: 'الوصف (EN)' },
            descAr: { type: 'textarea', label: 'الوصف (AR)' },
            icon: { type: 'text', label: 'الأيقونة' },
          },
        },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        return (
          <section className="lp-become">
            <div className="lp__wrap lp-become__grid">
              <div>
                <h2>
                  {t(locale, p.leadEn, p.leadAr)}
                  <br />
                  <span className="lp__hi">{t(locale, p.highlightEn, p.highlightAr)}</span>
                </h2>
                <p>{t(locale, p.descEn, p.descAr)}</p>
                <div className="lp-become__actions">
                  <span className="rey-btn" data-variant="primary" data-auto="true">
                    {t(locale, p.primaryCtaEn, p.primaryCtaAr)}
                  </span>
                  <span className="rey-btn" data-variant="outline" data-auto="true">
                    {t(locale, p.secondaryCtaEn, p.secondaryCtaAr)}
                  </span>
                </div>
              </div>
              <div className="lp-benefits">
                {(p.benefits ?? []).map((b: Record<string, string>, i: number) => (
                  <div className="lp-benefit" key={i}>
                    <span className="lp-icon-circle">
                      <Icon name={b.icon || 'wrench'} size={17} dir={dir} />
                    </span>
                    <h3>{t(locale, b.titleEn, b.titleAr)}</h3>
                    <p>{t(locale, b.descEn, b.descAr)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      },
    },

    // ------------------------------------------------------------ ready CTA
    ReadyCta: {
      label: 'دعوة للتسجيل (Ready CTA)',
      fields: {
        ...pair('title'),
        descEn: { type: 'textarea', label: 'الوصف (EN)' },
        descAr: { type: 'textarea', label: 'الوصف (AR)' },
        ...pair('cta'),
        ctaHref: { type: 'text', label: 'رابط الزر' },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        return (
          <section className="lp-ready">
            <div className="lp__wrap">
              <h2>{t(locale, p.titleEn, p.titleAr)}</h2>
              <p>{t(locale, p.descEn, p.descAr)}</p>
              <a
                className="rey-btn"
                data-variant="primary"
                data-auto="true"
                href={`${p.ctaHref || '/login'}?dir=${dirOf(locale)}`}
              >
                {t(locale, p.ctaEn, p.ctaAr)}
              </a>
            </div>
          </section>
        );
      },
    },

    // -------------------------------------------------------------- footer
    SiteFooter: {
      label: 'التذييل (Footer)',
      fields: {
        ...pair('tagline'), ...pair('connect'), ...pair('contact'),
        phone: { type: 'text', label: 'الهاتف' },
        email: { type: 'text', label: 'البريد' },
        ...pair('address'), ...pair('rights'),
        columns: {
          type: 'array',
          label: 'الأعمدة',
          arrayFields: {
            ...pair('head'),
            links: { type: 'array', label: 'الروابط', arrayFields: { ...pair('label') } },
            ...pair('more'),
          },
        },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        return (
          <footer className="lp-footer">
            <div className="lp__wrap lp-footer__grid">
              <div>
                <span className="rey-brand__qdb" style={{ color: '#fff', fontSize: 22 }}>QDB</span>
                <p style={{ marginBlockStart: 12, lineHeight: 1.6 }}>
                  {t(locale, p.taglineEn, p.taglineAr)}
                </p>
              </div>
              {(p.columns ?? []).map((col: Record<string, any>, i: number) => (
                <div key={i}>
                  <h4>{t(locale, col.headEn, col.headAr)}</h4>
                  {(col.links ?? []).map((l: Record<string, string>, j: number) => (
                    <a href="#" key={j}>{t(locale, l.labelEn, l.labelAr)}</a>
                  ))}
                  {t(locale, col.moreEn, col.moreAr) ? (
                    <a href="#" className="lp-footer__more">{t(locale, col.moreEn, col.moreAr)} ›</a>
                  ) : null}
                </div>
              ))}
              <div>
                <h4>{t(locale, p.connectEn, p.connectAr)}</h4>
                <div className="lp-footer__social">
                  <Icon name="users" size={17} dir={dir} />
                  <Icon name="briefcase" size={17} dir={dir} />
                  <Icon name="book" size={17} dir={dir} />
                </div>
                <h4>{t(locale, p.contactEn, p.contactAr)}</h4>
                <div className="lp-footer__contact">
                  <Icon name="phone" size={15} dir={dir} /><bdi>{p.phone}</bdi>
                </div>
                <div className="lp-footer__contact">
                  <Icon name="mail" size={15} dir={dir} /><bdi>{p.email}</bdi>
                </div>
                <div className="lp-footer__contact">
                  <Icon name="pin" size={15} dir={dir} />
                  <span>{t(locale, p.addressEn, p.addressAr)}</span>
                </div>
              </div>
            </div>
            <div className="lp-footer__bar">{t(locale, p.rightsEn, p.rightsAr)}</div>
          </footer>
        );
      },
    },
  },
};

// ===========================================================================
// Login — separate config because its root layout is a two-panel split, not a
// stack of sections. Same component model, same bilingual pattern.
// ===========================================================================

export const loginConfig: Config = {
  root: {
    fields: { brand: { type: 'slot' }, form: { type: 'slot' } },
    render: ({ brand: Brand, form: Form }) => (
      <div className="lg">
        <aside className="lg__aside"><Brand /></aside>
        <main className="lg__panel"><Form /></main>
      </div>
    ),
  },

  components: {
    LoginBrandPanel: {
      label: 'لوحة العلامة (Brand Panel)',
      fields: {
        ...pair('title'),
        descEn: { type: 'textarea', label: 'الوصف (EN)' },
        descAr: { type: 'textarea', label: 'الوصف (AR)' },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        return (
          <>
            <div className="rey-brand__mark" style={{ alignItems: 'flex-start' }}>
              <span className="rey-brand__ar" style={{ color: '#fff', fontSize: 30 }}>ريادة</span>
              <span className="rey-brand__en" style={{ color: '#fff', fontSize: 11 }}>REYADA ADVISORY</span>
            </div>
            <h2>{t(locale, p.titleEn, p.titleAr)}</h2>
            <p>{t(locale, p.descEn, p.descAr)}</p>
          </>
        );
      },
    },

    LoginForm: {
      label: 'نموذج الدخول (Login Form)',
      fields: {
        ...pair('title'), ...pair('sub'), ...pair('emailLabel'),
        ...pair('passwordLabel'), ...pair('remember'), ...pair('forgot'),
        ...pair('cta'), ...pair('noAccount'), ...pair('register'),
        ...pair('note'),
        redirectTo: { type: 'text', label: 'الوجهة بعد الدخول' },
      },
      render: (p) => {
        const locale = localeOf(p.puck?.metadata);
        const dir = dirOf(locale);
        const isEditing = p.puck?.isEditing;
        const target = `${p.redirectTo || '/reyada'}?dir=${dir}`;

        return (
          <form
            className="lg__form"
            onSubmit={(e) => {
              e.preventDefault();
              // Inert while the admin is editing the page, so clicking the
              // button in the canvas does not navigate away from the editor.
              if (!isEditing) window.location.href = target;
            }}
          >
            <h1>{t(locale, p.titleEn, p.titleAr)}</h1>
            <p>{t(locale, p.subEn, p.subAr)}</p>

            <div className="lg__field">
              <label htmlFor="email">{t(locale, p.emailLabelEn, p.emailLabelAr)}</label>
              <input id="email" type="email" dir="ltr" autoComplete="username" defaultValue="jassim@example.qa" required />
            </div>

            <div className="lg__field">
              <label htmlFor="password">{t(locale, p.passwordLabelEn, p.passwordLabelAr)}</label>
              <input id="password" type="password" dir="ltr" autoComplete="current-password" defaultValue="demo1234" required />
            </div>

            <div className="lg__row">
              <label><input type="checkbox" defaultChecked />{t(locale, p.rememberEn, p.rememberAr)}</label>
              <a href="#">{t(locale, p.forgotEn, p.forgotAr)}</a>
            </div>

            <button className="rey-btn" data-variant="primary" type="submit">
              {t(locale, p.ctaEn, p.ctaAr)}
              <Icon name="chevron" size={16} dir={dir} />
            </button>

            <p className="lg__foot">
              {t(locale, p.noAccountEn, p.noAccountAr)} <a href="#">{t(locale, p.registerEn, p.registerAr)}</a>
            </p>
            <p className="lg__note">{t(locale, p.noteEn, p.noteAr)}</p>
          </form>
        );
      },
    },
  },
};
