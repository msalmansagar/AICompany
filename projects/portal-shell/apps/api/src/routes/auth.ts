import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  LoginSchema,
  RefreshTokenSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  RegisterSchema,
  type AuthResult,
} from '@portal/types';
import type { AuthService } from '../services/AuthService.js';
import { InvalidCredentialsError } from '@portal/auth-adapters';
import { AUTH_MAX_REQUESTS_PER_MINUTE } from '../plugins/rate-limit.js';

interface AuthRouteOptions {
  authService: AuthService;
}

const AUTH_RATE_LIMIT = {
  max: AUTH_MAX_REQUESTS_PER_MINUTE,
  timeWindow: '1 minute',
};

/**
 * Auth routes — /api/auth/*
 *
 * All routes are public (no JWT required). The AuthService delegates to
 * the configured IAuthAdapter (B2C / Entra / Custom).
 */
export async function authRoutes(
  app: FastifyInstance,
  { authService }: AuthRouteOptions,
): Promise<void> {
  // POST /api/auth/login
  app.post<{ Body: z.infer<typeof LoginSchema>; Reply: { data: AuthResult } }>(
    '/api/auth/login',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: { tags: ['Auth'], summary: 'Authenticate with email and password' },
    },
    async (request, reply) => {
      const body = LoginSchema.parse(request.body);
      try {
        const result = await authService.login(body.email, body.password);
        return reply.status(200).send({ data: result });
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          return reply.status(401).send({
            code: 'invalid_credentials',
            message: 'Invalid email or password',
          });
        }
        throw error;
      }
    },
  );

  // POST /api/auth/refresh
  app.post<{ Body: z.infer<typeof RefreshTokenSchema>; Reply: { data: AuthResult } }>(
    '/api/auth/refresh',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: { tags: ['Auth'], summary: 'Refresh access token' },
    },
    async (request, reply) => {
      const body = RefreshTokenSchema.parse(request.body);
      const result = await authService.refresh(body.refreshToken);
      return reply.status(200).send({ data: result });
    },
  );

  // POST /api/auth/logout
  app.post<{ Reply: void }>(
    '/api/auth/logout',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Auth'], summary: 'Revoke tokens and end session' },
    },
    async (request, reply) => {
      const authHeader = request.headers.authorization ?? '';
      const token = authHeader.replace('Bearer ', '');
      await authService.logout(token);
      return reply.status(204).send();
    },
  );

  // POST /api/auth/forgot-password
  app.post<{ Body: z.infer<typeof ForgotPasswordSchema> }>(
    '/api/auth/forgot-password',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: { tags: ['Auth'], summary: 'Initiate password reset flow' },
    },
    async (request, reply) => {
      const body = ForgotPasswordSchema.parse(request.body);
      // Always return 200 — do not leak whether the email exists
      await authService.forgotPassword(body.email);
      return reply.status(200).send({
        data: { message: 'If an account exists, a reset link has been sent' },
      });
    },
  );

  // POST /api/auth/reset-password
  app.post<{ Body: z.infer<typeof ResetPasswordSchema> }>(
    '/api/auth/reset-password',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: { tags: ['Auth'], summary: 'Complete password reset' },
    },
    async (request, reply) => {
      const body = ResetPasswordSchema.parse(request.body);
      await authService.resetPassword(body.token, body.newPassword);
      return reply.status(200).send({ data: { message: 'Password updated successfully' } });
    },
  );

  // POST /api/auth/register — only valid when authProvider is 'custom'
  app.post<{ Body: z.infer<typeof RegisterSchema> }>(
    '/api/auth/register',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: { tags: ['Auth'], summary: 'Register a new account (custom provider only)' },
    },
    async (request, reply) => {
      // Zod validates the shape; the adapter decides whether registration
      // is supported for the configured provider.
      RegisterSchema.parse(request.body);
      return reply.status(501).send({
        code: 'not_implemented',
        message: 'Registration via API is available with the custom auth provider only',
      });
    },
  );
}
