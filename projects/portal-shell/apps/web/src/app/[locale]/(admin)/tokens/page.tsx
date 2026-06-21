import React from 'react';
import type { Metadata } from 'next';
import { TokensClient } from './TokensClient';

export const metadata: Metadata = {
  title: 'Theme Tokens — Admin',
};

/**
 * Server Component shell for the admin token management page.
 *
 * Data fetching and interactivity are delegated to TokensClient (Client Component).
 * This shell exists to satisfy the Next.js App Router convention: page.tsx must be
 * a Server Component unless explicitly marked 'use client'. By keeping the shell
 * server-side we preserve the option of future server-side data prefetching without
 * restructuring the route.
 */
export default function TokensPage() {
  return <TokensClient />;
}
