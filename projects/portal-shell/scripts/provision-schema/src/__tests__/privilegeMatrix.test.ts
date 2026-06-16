import { describe, it, expect } from 'vitest';
import { PRIVILEGE_MATRIX, APPEND_ONLY_LOGICAL_NAMES } from '../security/privilegeMatrix.js';

const APPEND_ONLY_SET = new Set(APPEND_ONLY_LOGICAL_NAMES);

describe('PRIVILEGE_MATRIX', () => {
  describe('TC-PRIV-001: privilege name format', () => {
    it('should produce valid Dataverse privilege names using prv{Action}{logicalName} format', () => {
      // AppendTo must come before Append in alternation to avoid partial match
      const ACTION_PATTERN = /^prv(AppendTo|Create|Read|Write|Delete|Append)qdb_/;
      const STRIP_ACTION = /^prv(AppendTo|Create|Read|Write|Delete|Append)/;

      for (const entitySpec of PRIVILEGE_MATRIX) {
        for (const action of entitySpec.actions) {
          const privilegeName = `prv${action}${entitySpec.logicalName}`;

          expect(privilegeName).toMatch(ACTION_PATTERN);

          const logicalNamePart = privilegeName.replace(STRIP_ACTION, '');
          expect(logicalNamePart).toMatch(/^qdb_[a-z_]+$/);
        }
      }
    });
  });

  describe('TC-PRIV-002: C-SCHEMA-003 — qdb_portal_revoked_tokens has no Write', () => {
    it('should not include Write in qdb_portal_revoked_tokens actions (append-only)', () => {
      const spec = PRIVILEGE_MATRIX.find((e) => e.logicalName === 'qdb_portal_revoked_tokens');
      expect(spec).toBeDefined();
      expect(spec?.actions).not.toContain('Write');
    });
  });

  describe('TC-PRIV-003: C-SCHEMA-003 — qdb_portal_revoked_tokens has no Delete', () => {
    it('should not include Delete in qdb_portal_revoked_tokens actions (append-only)', () => {
      const spec = PRIVILEGE_MATRIX.find((e) => e.logicalName === 'qdb_portal_revoked_tokens');
      expect(spec).toBeDefined();
      expect(spec?.actions).not.toContain('Delete');
    });
  });

  describe('TC-PRIV-004: C-SCHEMA-003 — qdb_portal_request_timelines has no Write or Delete', () => {
    it('should not include Write in qdb_portal_request_timelines actions (append-only)', () => {
      const spec = PRIVILEGE_MATRIX.find((e) => e.logicalName === 'qdb_portal_request_timelines');
      expect(spec).toBeDefined();
      expect(spec?.actions).not.toContain('Write');
    });

    it('should not include Delete in qdb_portal_request_timelines actions (append-only)', () => {
      const spec = PRIVILEGE_MATRIX.find((e) => e.logicalName === 'qdb_portal_request_timelines');
      expect(spec).toBeDefined();
      expect(spec?.actions).not.toContain('Delete');
    });
  });

  describe('TC-PRIV-005: C-SCHEMA-003 — qdb_cms_revisions has no Write or Delete', () => {
    it('should not include Write in qdb_cms_revisions actions (append-only)', () => {
      const spec = PRIVILEGE_MATRIX.find((e) => e.logicalName === 'qdb_cms_revisions');
      expect(spec).toBeDefined();
      expect(spec?.actions).not.toContain('Write');
    });

    it('should not include Delete in qdb_cms_revisions actions (append-only)', () => {
      const spec = PRIVILEGE_MATRIX.find((e) => e.logicalName === 'qdb_cms_revisions');
      expect(spec).toBeDefined();
      expect(spec?.actions).not.toContain('Delete');
    });
  });

  describe('TC-PRIV-006: APPEND_ONLY_LOGICAL_NAMES completeness', () => {
    it('should contain exactly the 3 append-only entities defined in C-SCHEMA-003', () => {
      expect(APPEND_ONLY_LOGICAL_NAMES).toHaveLength(3);
      expect(APPEND_ONLY_LOGICAL_NAMES).toContain('qdb_portal_revoked_tokens');
      expect(APPEND_ONLY_LOGICAL_NAMES).toContain('qdb_portal_request_timelines');
      expect(APPEND_ONLY_LOGICAL_NAMES).toContain('qdb_cms_revisions');
    });

    it('should have no Write or Delete for any append-only entity in the matrix', () => {
      for (const logicalName of APPEND_ONLY_LOGICAL_NAMES) {
        const spec = PRIVILEGE_MATRIX.find((e) => e.logicalName === logicalName);
        expect(spec).toBeDefined();
        expect(spec?.actions).not.toContain('Write');
        expect(spec?.actions).not.toContain('Delete');
      }
    });
  });

  describe('TC-PRIV-007: all 15 portal entities are represented in the matrix', () => {
    const EXPECTED_LOGICAL_NAMES = [
      'qdb_portal_users',
      'qdb_portal_reset_tokens',
      'qdb_portal_revoked_tokens',
      'qdb_portal_configs',
      'qdb_portal_nav_items',
      'qdb_portal_widget_configs',
      'qdb_portal_services',
      'qdb_portal_service_tabs',
      'qdb_portal_requests',
      'qdb_portal_request_timelines',
      'qdb_portal_request_documents',
      'qdb_portal_notifications',
      'qdb_cms_contents',
      'qdb_cms_revisions',
      'qdb_portal_user_entities',
    ];

    it('should have exactly 15 entries in the privilege matrix', () => {
      expect(PRIVILEGE_MATRIX).toHaveLength(15);
    });

    it('should contain every expected entity logical name', () => {
      const matrixNames = PRIVILEGE_MATRIX.map((e) => e.logicalName);
      for (const expectedName of EXPECTED_LOGICAL_NAMES) {
        expect(matrixNames).toContain(expectedName);
      }
    });
  });
});
