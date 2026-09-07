'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { COPY, type Locale } from '../../landing.copy';
import { Icon } from '../../reyada.icons';
import { TokenRoot } from '../TokenRoot';

/**
 * Reyada Advisory Marketplace — public landing page.
 *
 * Plain React rather than a Puck tree: a marketing page has no admin-editable
 * structure worth modelling as components. The dashboard at /reyada is the
 * Puck-composed surface.
 *
 * Sign-in sends the visitor to /login, which on submit lands on the dashboard.
 */

const RAIL_MEDIA = [
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#5b6b7a,#8d9aa6)',
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#8a6a3f,#c2a274)',
  'linear-gradient(rgba(20,34,48,.6),rgba(20,34,48,.6)), linear-gradient(135deg,#2a3f55,#4f6f8c)',
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#6b7f8f,#a8bac6)',
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#4a6270,#7d95a3)',
];

const STEP_ART = ['#e4f2ec', '#e7ecf5', '#f2ead8', '#f3e9f7'];

const TAG_TONE: Record<string, string> = {
  SME: 'sme',
  Investor: 'investor',
  Expert: 'expert',
  Startup: 'startup',
  'المنشآت الصغيرة': 'sme',
  مستثمر: 'investor',
  خبير: 'expert',
  'شركة ناشئة': 'startup',
};

const BUBBLES = [
  { icon: 'exhibition', top: '18%', inlineStart: '11%' },
  { icon: 'book', top: '40%', inlineStart: '5%' },
  { icon: 'award', top: '62%', inlineStart: '13%' },
  { icon: 'rocket', top: '20%', inlineEnd: '12%' },
  { icon: 'users', top: '44%', inlineEnd: '5%' },
  { icon: 'briefcase', top: '64%', inlineEnd: '14%' },
];

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

export default function LandingPage() {
  const params = useSearchParams();
  const locale: Locale = params.get('dir') === 'rtl' ? 'ar' : 'en';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const c = COPY[locale];
  const other = locale === 'ar' ? 'ltr' : 'rtl';

  return (
    <TokenRoot locale={locale}>
      <div className="lp">
        {/* ---------------------------------------------------------- nav */}
        <header className="lp-nav">
          <BrandMark />
          <nav className="lp-nav__links">
            {c.nav.map((item) => (
              <a key={item} href="#">{item}</a>
            ))}
          </nav>
          <div className="lp-nav__right">
            <a className="lp-nav__lang" href={`?dir=${other}`} lang={locale === 'ar' ? 'en' : 'ar'}>
              {c.langSwitch}
            </a>
            <Link
              className="rey-btn"
              data-variant="primary"
              data-auto="true"
              href={`/login?dir=${dir}`}
            >
              {c.signIn}
            </Link>
          </div>
        </header>

        {/* --------------------------------------------------------- hero */}
        <section className="lp-hero">
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="lp-bubble"
              style={{
                insetBlockStart: b.top,
                insetInlineStart: b.inlineStart,
                insetInlineEnd: b.inlineEnd,
              }}
            >
              <Icon name={b.icon} size={19} dir={dir} />
            </span>
          ))}
          <h1>
            {c.heroA}
            <span className="lp__hi">{c.heroHi1}</span>
            {c.heroB}
            <span className="lp__hi">{c.heroHi2}</span>
            {c.heroC}
          </h1>
          <p>{c.heroSub}</p>
          <form className="lp-search" onSubmit={(e) => e.preventDefault()} role="search">
            <Icon name="services" size={18} dir={dir} style={{ color: '#8b98a5' }} />
            <input type="search" placeholder={c.searchPlaceholder} aria-label={c.search} />
            <button className="rey-btn" data-variant="primary" data-auto="true" type="submit">
              {c.search}
            </button>
          </form>
        </section>

        {/* ------------------------------------------------- service rail */}
        <div className="lp-rail">
          {c.cards.map((card, i) => (
            <article className="lp-service" key={i} style={{ background: RAIL_MEDIA[i] }}>
              <div className="lp-service__tags">
                {card.tags.map((tag) => (
                  <span className="lp-tag" data-tone={TAG_TONE[tag]} key={tag}>{tag}</span>
                ))}
              </div>
              <h3 className="lp-service__title">{card.title}</h3>
              {card.sub ? <span className="lp-service__meta">{card.sub}</span> : null}
              <span className="lp-service__meta">{card.providers}</span>
            </article>
          ))}
        </div>
        <div className="lp-dots">
          {[0, 1, 2, 3, 4].map((d) => <i key={d} data-active={d === 0} />)}
        </div>

        {/* -------------------------------------------------------- works */}
        <section className="lp-works">
          <div className="lp__wrap">
            <div className="lp-works__head">
              <h2>
                {c.worksA}
                <span className="lp__hi">{c.worksHi}</span>
                {c.worksB}
              </h2>
              <p>{c.worksDesc}</p>
            </div>
            <div className="lp-steps">
              {c.steps.map((s, i) => (
                <div className="lp-step" key={i}>
                  <span className="lp-step__label" data-accent={i === 2}>{s.step}</span>
                  <span className="lp-step__title">{s.title}</span>
                  <span className="lp-step__num">{i + 1}</span>
                  <span className="lp-step__art" style={{ background: STEP_ART[i] }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- path */}
        <section className="lp-path">
          <div className="lp__wrap">
            <h2>{c.pathTitle}</h2>
            <p>{c.pathSub}</p>
            <div className="lp-path__cards">
              {[c.pathA, c.pathB].map((p, idx) => (
                <div className="lp-path__card" key={idx}>
                  <span className="lp-path__icon">
                    <Icon name={idx === 0 ? 'help' : 'services'} size={20} dir={dir} />
                  </span>
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                  {p.items.map((item) => (
                    <span className="lp-check" key={item}>
                      <Icon name="check" size={15} dir={dir} />
                      {item}
                    </span>
                  ))}
                  <a
                    className="rey-btn"
                    data-variant={idx === 0 ? 'navy' : 'primary'}
                    href="#"
                    style={{ marginBlockStart: 'auto' }}
                  >
                    {p.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- providers */}
        <section className="lp-providers">
          <div className="lp__wrap">
            <h2>
              {c.topA}
              <span className="lp__hi">{c.topHi}</span>
            </h2>
            <div className="lp-providers__grid">
              {[0, 1, 2].map((i) => (
                <article className="lp-provider" key={i}>
                  <div className="lp-provider__head">
                    <span className="lp-provider__logo">
                      <Icon name="briefcase" size={16} dir={dir} />
                    </span>
                    <span className="lp-provider__name">{c.providerName}</span>
                  </div>
                  <div className="lp-provider__tags">
                    {c.providerTags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <p>{c.providerDesc}</p>
                </article>
              ))}
            </div>
            <a className="rey-btn" data-variant="primary" data-auto="true" href="#">{c.viewAll}</a>
          </div>
        </section>

        {/* ------------------------------------------------------ academy */}
        <section className="lp-academy">
          <div className="lp__wrap">
            <div className="rey-brand__mark" style={{ marginInline: 'auto' }}>
              <span className="rey-brand__ar" style={{ color: '#fff' }}>ريادة</span>
              <span className="rey-brand__en" style={{ color: '#fff' }}>REYADA</span>
            </div>
            <h2>{c.academyTitle}</h2>
            <p>{c.academyDesc}</p>
            <div className="lp-academy__grid">
              {c.academyCards.map((card, i) => (
                <div className="lp-academy__card" key={i}>
                  <span className="lp-icon-circle">
                    <Icon name={['users', 'award', 'clock'][i]} size={18} dir={dir} />
                  </span>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                </div>
              ))}
            </div>
            <a className="rey-btn" data-variant="primary" data-auto="true" href="#">{c.learnMore}</a>
          </div>
        </section>

        {/* ------------------------------------------------------- become */}
        <section className="lp-become">
          <div className="lp__wrap lp-become__grid">
            <div>
              <h2>
                {c.providerA}
                <br />
                <span className="lp__hi">{c.providerHi}</span>
              </h2>
              <p>{c.providerJoinDesc}</p>
              <div className="lp-become__actions">
                <a className="rey-btn" data-variant="primary" data-auto="true" href="#">{c.joinCta}</a>
                <a className="rey-btn" data-variant="outline" data-auto="true" href="#">{c.learnMoreAlt}</a>
              </div>
            </div>
            <div className="lp-benefits">
              {c.benefits.map((b, i) => (
                <div className="lp-benefit" key={i}>
                  <span className="lp-icon-circle">
                    <Icon name={['services', 'wrench', 'book'][i]} size={17} dir={dir} />
                  </span>
                  <h3>{b.title}</h3>
                  <p>{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- ready */}
        <section className="lp-ready">
          <div className="lp__wrap">
            <h2>{c.readyTitle}</h2>
            <p>{c.readyDesc}</p>
            <Link className="rey-btn" data-variant="primary" data-auto="true" href={`/login?dir=${dir}`}>
              {c.getStarted}
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------------- footer */}
        <footer className="lp-footer">
          <div className="lp__wrap lp-footer__grid">
            <div>
              <span className="rey-brand__qdb" style={{ color: '#fff', fontSize: 22 }}>QDB</span>
              <p style={{ marginBlockStart: 12, lineHeight: 1.6 }}>{c.footerTagline}</p>
            </div>
            {c.footerCols.map((col) => (
              <div key={col.head}>
                <h4>{col.head}</h4>
                {col.links.map((l) => <a href="#" key={l}>{l}</a>)}
                {col.more ? <a href="#" className="lp-footer__more">{col.more} ›</a> : null}
              </div>
            ))}
            <div>
              <h4>{c.connect}</h4>
              <div className="lp-footer__social">
                <Icon name="users" size={17} dir={dir} />
                <Icon name="briefcase" size={17} dir={dir} />
                <Icon name="book" size={17} dir={dir} />
              </div>
              <h4>{c.contactUs}</h4>
              <div className="lp-footer__contact">
                <Icon name="phone" size={15} dir={dir} />
                <bdi>{c.phone}</bdi>
              </div>
              <div className="lp-footer__contact">
                <Icon name="mail" size={15} dir={dir} />
                <bdi>{c.email}</bdi>
              </div>
              <div className="lp-footer__contact">
                <Icon name="pin" size={15} dir={dir} />
                <span>{c.address}</span>
              </div>
            </div>
          </div>
          <div className="lp-footer__bar">{c.rights}</div>
        </footer>
      </div>
    </TokenRoot>
  );
}
