import { describe, it, expect, vi, type MockedFunction } from 'vitest';
import {
  buildExistingValueIndex,
  detectConflicts,
  runPicklistConflictCheck,
  PicklistConflictError,
} from '../preflight/PicklistConflictCheck.js';
import type { GlobalOptionSetRecord } from '../types/DataverseMetadata.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';

function makeOptionSet(name: string, values: number[]): GlobalOptionSetRecord {
  return {
    Name: name,
    Options: values.map((v) => ({ Value: v, Label: { LocalizedLabels: [] } })),
  };
}

describe('buildExistingValueIndex', () => {
  describe('TC-PICKLIST-001: excludes planned option sets from index', () => {
    it('should not index values that belong to option sets we plan to create', () => {
      const optionSets: GlobalOptionSetRecord[] = [
        makeOptionSet('qdb_request_status', [860000001, 860000002]),   // planned — must be excluded
        makeOptionSet('some_other_solution_status', [860000001]),        // foreign — must be included
      ];

      const index = buildExistingValueIndex(optionSets);

      expect(index.has(860000001)).toBe(true);
      expect(index.get(860000001)).toBe('some_other_solution_status');
    });

    it('should return empty index when all option sets are planned sets', () => {
      const optionSets: GlobalOptionSetRecord[] = [
        makeOptionSet('qdb_preferred_language', [100000001, 100000002]),
        makeOptionSet('qdb_auth_provider', [860000001, 860000002, 860000003]),
      ];

      const index = buildExistingValueIndex(optionSets);

      expect(index.size).toBe(0);
    });
  });
});

describe('detectConflicts', () => {
  describe('TC-PICKLIST-002: returns empty when no conflicts', () => {
    it('should return empty array when existing values do not overlap with planned values', () => {
      const index = new Map<number, string>([
        [999999, 'unrelated_option_set'],
      ]);

      const conflicts = detectConflicts(index);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('TC-PICKLIST-003: returns conflict entries when values overlap', () => {
    it('should return one entry per conflicting value', () => {
      // 860000001 appears in qdb_nav_layout (planned) and some existing set
      const index = new Map<number, string>([
        [860000001, 'crm_some_existing_status'],
      ]);

      const conflicts = detectConflicts(index);

      expect(conflicts.length).toBeGreaterThan(0);
      const matchingConflict = conflicts.find((c) => c.value === 860000001);
      expect(matchingConflict).toBeDefined();
      expect(matchingConflict?.existingOptionSet).toBe('crm_some_existing_status');
    });

    it('should identify the planned option set name in each conflict entry', () => {
      const index = new Map<number, string>([
        [100000001, 'foreign_set_a'],
      ]);

      const conflicts = detectConflicts(index);

      const conflict = conflicts.find((c) => c.value === 100000001);
      expect(conflict).toBeDefined();
      // 100000001 is used by qdb_preferred_language and qdb_cms_content_type
      expect(['qdb_preferred_language', 'qdb_cms_content_type']).toContain(conflict?.plannedOptionSet);
    });
  });
});

describe('runPicklistConflictCheck', () => {
  function mockHttp(optionSets: GlobalOptionSetRecord[]): DataverseHttpClient {
    return {
      fetchAllPages: vi.fn().mockResolvedValue(optionSets),
    } as unknown as DataverseHttpClient;
  }

  describe('TC-PICKLIST-004: passes when no conflicts exist', () => {
    it('should return a passed CheckResult when no value overlaps are detected', async () => {
      const http = mockHttp([
        makeOptionSet('some_foreign_set', [999999, 888888]),
      ]);

      const result = await runPicklistConflictCheck(http);

      expect(result.passed).toBe(true);
    });
  });

  describe('TC-PICKLIST-005: throws PicklistConflictError when conflict detected', () => {
    it('should throw PicklistConflictError with conflict details', async () => {
      const http = mockHttp([
        makeOptionSet('crm_conflicting_status', [860000001]),
      ]);

      await expect(runPicklistConflictCheck(http)).rejects.toBeInstanceOf(PicklistConflictError);
    });

    it('should include conflict count in the error message', async () => {
      const http = mockHttp([
        makeOptionSet('crm_conflicting_status', [860000001]),
      ]);

      try {
        await runPicklistConflictCheck(http);
        expect.fail('Expected PicklistConflictError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PicklistConflictError);
        expect((error as PicklistConflictError).conflicts.length).toBeGreaterThan(0);
      }
    });
  });
});
