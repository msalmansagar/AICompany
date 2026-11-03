'use server';

import { AuthError } from 'next-auth';
import { signIn } from '../lib/auth';

export interface LoginActionResult {
  error: string;
}

/**
 * Server action for credentials login.
 *
 * Auth.js v5 best practice: use a server action rather than the client-side
 * signIn() to avoid CSRF complexity and ensure reliable redirects.
 *
 * On success: calls redirect() which throws NEXT_REDIRECT — Next.js handles
 * the navigation; the action never returns.
 * On failure: returns { error } so the client form can display it.
 */
export async function loginAction(
  email: string,
  password: string,
  callbackUrl: string,
): Promise<LoginActionResult | undefined> {
  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password' };
        default:
          return { error: 'Authentication failed. Please try again.' };
      }
    }
    // Re-throw NEXT_REDIRECT and other framework errors so Next.js handles them
    throw error;
  }
}
