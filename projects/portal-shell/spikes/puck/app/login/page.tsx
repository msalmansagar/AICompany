'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { COPY, type Locale } from '../../landing.copy';
import { Icon } from '../../reyada.icons';
import { TokenRoot } from '../TokenRoot';

/**
 * Sign-in page.
 *
 * This is a SPIKE stub, not an auth implementation: it validates nothing and
 * stores nothing. Submitting navigates to the dashboard so the landing →
 * login → dashboard flow can be demonstrated end to end.
 *
 * Real portal-shell auth is Auth.js v5 → JWT → Fastify → msal-node → Dataverse
 * (ADR-PORT-005). Do not grow this file into a login implementation — wire it
 * to that instead.
 */
export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const locale: Locale = params.get('dir') === 'rtl' ? 'ar' : 'en';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const c = COPY[locale];
  const other = locale === 'ar' ? 'ltr' : 'rtl';

  const [email, setEmail] = useState('jassim@example.qa');
  const [password, setPassword] = useState('demo1234');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/reyada?dir=${dir}`);
  }

  return (
    <TokenRoot locale={locale}>
      <div className="lg">
        <aside className="lg__aside">
          <div className="rey-brand__mark" style={{ alignItems: 'flex-start' }}>
            <span className="rey-brand__ar" style={{ color: '#fff', fontSize: 30 }}>ريادة</span>
            <span className="rey-brand__en" style={{ color: '#fff', fontSize: 11 }}>REYADA ADVISORY</span>
          </div>
          <h2>{c.loginTitle}</h2>
          <p>{c.academyDesc}</p>
        </aside>

        <main className="lg__panel">
          <form className="lg__form" onSubmit={handleSubmit}>
            <h1>{c.loginTitle}</h1>
            <p>{c.loginSub}</p>

            <div className="lg__field">
              <label htmlFor="email">{c.emailLabel}</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="lg__field">
              <label htmlFor="password">{c.passwordLabel}</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="lg__row">
              <label>
                <input type="checkbox" defaultChecked />
                {c.remember}
              </label>
              <a href="#">{c.forgot}</a>
            </div>

            <button className="rey-btn" data-variant="primary" type="submit">
              {c.loginCta}
              <Icon name="chevron" size={16} dir={dir} />
            </button>

            <p className="lg__foot">
              {c.noAccount} <a href="#">{c.register}</a>
            </p>

            <p className="lg__foot" style={{ marginBlockStart: 10 }}>
              <Link href={`/landing?dir=${dir}`}>{c.backHome}</Link>
              {' · '}
              <Link href={`/login?dir=${other}`} lang={locale === 'ar' ? 'en' : 'ar'}>
                {c.langSwitch}
              </Link>
            </p>

            <p className="lg__note">{c.demoNote}</p>
          </form>
        </main>
      </div>
    </TokenRoot>
  );
}
