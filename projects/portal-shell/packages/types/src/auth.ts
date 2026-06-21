import { z } from 'zod';

// ---------------------------------------------------------------------------
// Auth domain types
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roles: string[];
  /** IDs of company/entity records this user is linked to (entity switcher) */
  linkedEntityIds: string[];
  preferredLanguage: 'en' | 'ar';
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** Unix epoch seconds */
  expiresAt: number;
  user: UserProfile;
}

export interface TokenClaims {
  sub: string;
  email: string;
  roles: string[];
  /** JWT ID — used to check the revocation blocklist */
  jti?: string;
  /**
   * Monotonically increasing RBAC version for this user.
   * Incremented on every role assignment or revocation.
   * Used as the NodeCache invalidation key (ADR-RBAC-001).
   */
  rbac_version?: number;
  /** Issued-at (Unix epoch) */
  iat: number;
  /** Expiry (Unix epoch) */
  exp: number;
}

// ---------------------------------------------------------------------------
// Zod schemas for auth request bodies
// ---------------------------------------------------------------------------

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(12)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/,
      'Password must contain uppercase, lowercase, digit, and special character',
    ),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/,
      'Password must contain uppercase, lowercase, digit, and special character',
    ),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  preferredLanguage: z.enum(['en', 'ar']).default('en'),
});

export type LoginBody = z.infer<typeof LoginSchema>;
export type RefreshTokenBody = z.infer<typeof RefreshTokenSchema>;
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof ResetPasswordSchema>;
export type RegisterBody = z.infer<typeof RegisterSchema>;
