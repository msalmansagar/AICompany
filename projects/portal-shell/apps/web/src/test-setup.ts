import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/dashboard',
  redirect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock next-auth/react
// ---------------------------------------------------------------------------

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------------------------------------------------------------------------
// Mock next-intl
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

// ---------------------------------------------------------------------------
// Mock @fluentui/react-components makeStyles
// makeStyles returns a function that returns className strings.
// Mocking it prevents the Fluent UI CSS-in-JS runtime from failing in jsdom.
// ---------------------------------------------------------------------------

vi.mock('@fluentui/react-components', async () => {
  const actual = await vi.importActual<typeof import('@fluentui/react-components')>(
    '@fluentui/react-components',
  );
  return {
    ...actual,
    makeStyles: () => () => ({}),
    tokens: new Proxy(
      {},
      {
        get: (_target, prop) => String(prop),
      },
    ),
  };
});
