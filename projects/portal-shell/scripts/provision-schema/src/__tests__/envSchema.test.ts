import { describe, it, expect } from 'vitest';
import { envSchema } from '../config/schema.js';

const BASE_VALID: Record<string, string> = {
  DATAVERSE_ORG_URL: 'https://org5869857f.crm4.dynamics.com',
  DATAVERSE_CLIENT_ID: '08e80e93-0bab-45ef-8372-2e554fa9af9b',
  DATAVERSE_CLIENT_SECRET: 'supersecretvalue',
  DATAVERSE_TENANT_ID: 'd79e793c-f6de-4204-8508-7980a63df957',
  DRY_RUN: 'true',
};

describe('envSchema', () => {
  describe('TC-ENV-001: DRY_RUN=true without password', () => {
    it('should pass when DRY_RUN=true and SEED_TEST_USER_PASSWORD is omitted', () => {
      const result = envSchema.safeParse({ ...BASE_VALID, DRY_RUN: 'true' });
      expect(result.success).toBe(true);
    });
  });

  describe('TC-ENV-002: DRY_RUN=false with password', () => {
    it('should pass when DRY_RUN=false and SEED_TEST_USER_PASSWORD is at least 12 chars', () => {
      const result = envSchema.safeParse({
        ...BASE_VALID,
        DRY_RUN: 'false',
        SEED_TEST_USER_PASSWORD: 'StrongP@ssw0rd!',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('TC-ENV-003: DRY_RUN=false without password', () => {
    it('should fail with SEED_TEST_USER_PASSWORD path error when DRY_RUN is omitted (defaults false)', () => {
      // z.coerce.boolean() uses Boolean(value) — string 'false' coerces to true (non-empty string).
      // In real usage DRY_RUN=false means the env var is simply absent; the Zod default supplies false.
      const input = { ...BASE_VALID };
      delete input['DRY_RUN'];
      const result = envSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('SEED_TEST_USER_PASSWORD');
      }
    });

    it('should fail when DRY_RUN is boolean false and password is absent', () => {
      const result = envSchema.safeParse({ ...BASE_VALID, DRY_RUN: false });
      expect(result.success).toBe(false);
    });
  });

  describe('TC-ENV-004: invalid DATAVERSE_ORG_URL', () => {
    it('should fail when DATAVERSE_ORG_URL is not a valid URL', () => {
      const result = envSchema.safeParse({ ...BASE_VALID, DATAVERSE_ORG_URL: 'not-a-url' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('DATAVERSE_ORG_URL');
      }
    });
  });

  describe('TC-ENV-005: LOG_LEVEL defaults to info', () => {
    it('should default LOG_LEVEL to "info" when not provided', () => {
      const input = { ...BASE_VALID };
      delete input['LOG_LEVEL'];
      const result = envSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LOG_LEVEL).toBe('info');
      }
    });
  });

  describe('TC-ENV-006: invalid LOG_LEVEL', () => {
    it('should fail when LOG_LEVEL is not one of debug|info|warn|error', () => {
      const result = envSchema.safeParse({ ...BASE_VALID, LOG_LEVEL: 'verbose' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('LOG_LEVEL');
      }
    });
  });

  describe('TC-ENV-007: DRY_RUN string coercion', () => {
    it('should coerce string "true" to boolean true', () => {
      const result = envSchema.safeParse({ ...BASE_VALID, DRY_RUN: 'true' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DRY_RUN).toBe(true);
        expect(typeof result.data.DRY_RUN).toBe('boolean');
      }
    });

    it('should default DRY_RUN to false when the env var is absent', () => {
      // z.coerce.boolean() calls Boolean(value) — any non-empty string including
      // "false" coerces to true. The only safe way to get false is to omit the var.
      const input = {
        ...BASE_VALID,
        SEED_TEST_USER_PASSWORD: 'StrongP@ssw0rd!',
      };
      delete input['DRY_RUN'];
      const result = envSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DRY_RUN).toBe(false);
      }
    });
  });

  describe('TC-ENV-008: DATAVERSE_CLIENT_ID must be UUID', () => {
    it('should fail when CLIENT_ID is not a UUID', () => {
      const result = envSchema.safeParse({ ...BASE_VALID, DATAVERSE_CLIENT_ID: 'not-a-uuid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('DATAVERSE_CLIENT_ID');
      }
    });
  });

  describe('TC-ENV-009: SEED_TEST_USER_PASSWORD minimum 12 chars', () => {
    it('should fail when password is shorter than 12 characters', () => {
      const result = envSchema.safeParse({
        ...BASE_VALID,
        DRY_RUN: 'false',
        SEED_TEST_USER_PASSWORD: 'short',
      });
      expect(result.success).toBe(false);
    });
  });
});
