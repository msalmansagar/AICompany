import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import type { AuthResult } from '@portal/types';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Shape added to the JWT by our callbacks */
interface PortalToken {
  accessToken?: string;
  refreshToken?: string;
  /** Unix epoch seconds — used to detect expiry and trigger silent refresh */
  expiresAt?: number;
  userId?: string;
  roles?: string[];
  displayName?: string;
  avatarUrl?: string;
}

async function refreshAccessToken(refreshToken: string): Promise<PortalToken> {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:4001';
  try {
    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return {};

    const body = (await response.json()) as { data: AuthResult };
    const { data } = body;
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
    };
  } catch {
    return {};
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env['MICROSOFT_CLIENT_ID'] ?? '',
      clientSecret: process.env['MICROSOFT_CLIENT_SECRET'] ?? '',
      tenantId: process.env['MICROSOFT_TENANT_ID'] ?? '',
    }),
    Google({
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const apiUrl = process.env['API_URL'] ?? 'http://localhost:4001';

        let response: Response;
        try {
          response = await fetch(`${apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
        } catch {
          return null;
        }

        if (!response.ok) return null;

        // A-003 fix: correctly parse { data: AuthResult } envelope
        const body = (await response.json()) as { data: AuthResult };
        const { data } = body;

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.displayName,
          image: data.user.avatarUrl ?? null,
          // Pass through token fields so jwt() callback can persist them
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          roles: data.user.roles,
        };
      },
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    async jwt({ token, user, account }) {
      // On first sign-in, persist all token fields
      if (user) {
        const portalUser = user as typeof user & PortalToken;
        token['accessToken'] = portalUser.accessToken;
        token['refreshToken'] = portalUser.refreshToken;
        token['expiresAt'] = portalUser.expiresAt;
        token['userId'] = user.id;
        token['roles'] = portalUser.roles ?? [];
        token['displayName'] = user.name ?? '';
        token['avatarUrl'] = user.image ?? '';
      }

      // Persist OAuth provider access token for SSO flows
      if (account?.access_token) {
        token['providerAccessToken'] = account.access_token;
      }

      // A-003 fix: silent token refresh when access token has expired
      const expiresAt = token['expiresAt'] as number | undefined;
      if (expiresAt && Date.now() / 1000 > expiresAt) {
        const storedRefreshToken = token['refreshToken'] as string | undefined;
        if (storedRefreshToken) {
          const refreshed = await refreshAccessToken(storedRefreshToken);
          if (refreshed.accessToken) {
            token['accessToken'] = refreshed.accessToken;
            token['refreshToken'] = refreshed.refreshToken;
            token['expiresAt'] = refreshed.expiresAt;
          } else {
            // Refresh failed — clear tokens to force re-login on next request
            token['accessToken'] = undefined;
            token['refreshToken'] = undefined;
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      const portalToken = token as typeof token & PortalToken;
      session.user.id = portalToken.userId ?? '';
      (session as unknown as Record<string, unknown>)['accessToken'] = portalToken.accessToken;
      (session as unknown as Record<string, unknown>)['roles'] = portalToken.roles ?? [];
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  secret: process.env['AUTH_SECRET'],
});
