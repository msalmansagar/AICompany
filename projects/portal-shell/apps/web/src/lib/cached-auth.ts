import { cache } from 'react';
import { auth } from './auth';

/**
 * Memoized wrapper around NextAuth's auth() using React's cache().
 *
 * React.cache() deduplicates calls within a single server render pass,
 * so auth() is invoked at most once per request even when called from
 * multiple server components (layout, page, serverGet, etc.).
 */
export const getCachedAuth = cache(auth);
