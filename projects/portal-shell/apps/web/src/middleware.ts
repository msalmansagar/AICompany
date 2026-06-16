import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * next-intl locale routing middleware.
 *
 * Routing behaviour (ADR-PORT-003):
 *   /en/...  → lang=en, dir=ltr
 *   /ar/...  → lang=ar, dir=rtl
 *   /...     → middleware redirects to /en/...
 */
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
