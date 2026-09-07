// The OData emitter ships in @qdb/shared for the in-CRM engine; it is exercised here
// because the backend workspace owns the shared package's test runner.
import { describe, it, expect } from 'vitest';
import { buildODataFilter } from '@qdb/shared';

describe('buildODataFilter', () => {
  describe('lookup values', () => {
    it('emits a lookup GUID unquoted, keeping the navigation form', () => {
      const result = buildODataFilter(
        "_parentcustomerid_value eq '{demo_company}'",
        { demo_company: '11111111-1111-1111-1111-111111111111' },
      );
      expect(result).toBe('_parentcustomerid_value eq 11111111-1111-1111-1111-111111111111');
    });

    it('strips the braces Dataverse sometimes wraps a GUID in', () => {
      const result = buildODataFilter(
        "_parentcustomerid_value eq '{demo_company}'",
        { demo_company: '{11111111-1111-1111-1111-111111111111}' },
      );
      expect(result).toBe('_parentcustomerid_value eq 11111111-1111-1111-1111-111111111111');
    });
  });

  describe('text matching', () => {
    it('translates a both-sides wildcard to contains()', () => {
      expect(buildODataFilter("fullname like '%{name}%'", { name: 'Al' })).toBe("contains(fullname,'Al')");
    });

    it('translates a trailing wildcard to startswith()', () => {
      expect(buildODataFilter("fullname like '{name}%'", { name: 'Al' })).toBe("startswith(fullname,'Al')");
    });

    it('translates a leading wildcard to endswith()', () => {
      expect(buildODataFilter("fullname like '%{name}'", { name: 'Al' })).toBe("endswith(fullname,'Al')");
    });

    it('treats a wildcard-free pattern as an exact match', () => {
      expect(buildODataFilter("fullname like '{name}'", { name: 'Al' })).toBe("fullname eq 'Al'");
    });

    it('negates a not-like pattern', () => {
      expect(buildODataFilter("fullname not-like '%{name}%'", { name: 'Al' })).toBe("not contains(fullname,'Al')");
    });

    it('doubles embedded single quotes', () => {
      expect(buildODataFilter("fullname like '%{name}%'", { name: "O'Brien" })).toBe("contains(fullname,'O''Brien')");
    });
  });

  describe('numeric values', () => {
    it('emits a bare placeholder unquoted', () => {
      expect(buildODataFilter('gendercode eq {type}', { type: '2' })).toBe('gendercode eq 2');
    });

    it('drops the condition when the value is not numeric', () => {
      expect(buildODataFilter('gendercode eq {type}', { type: 'abc' })).toBe('');
    });
  });

  describe('composition and pruning', () => {
    it('joins satisfied conditions with and, parenthesised', () => {
      const result = buildODataFilter(
        "fullname like '%{name}%' and gendercode eq {type} and _parentcustomerid_value eq '{company}'",
        { name: 'Al', type: '1', company: '22222222-2222-2222-2222-222222222222' },
      );
      expect(result).toBe(
        "(contains(fullname,'Al') and gendercode eq 1 and _parentcustomerid_value eq 22222222-2222-2222-2222-222222222222)",
      );
    });

    it('collapses to the single satisfied condition when the others are empty', () => {
      const result = buildODataFilter(
        "fullname like '%{name}%' and gendercode eq {type}",
        { name: 'Al', type: '' },
      );
      expect(result).toBe("contains(fullname,'Al')");
    });

    it('returns empty when nothing is filled in', () => {
      const result = buildODataFilter(
        "fullname like '%{name}%' and gendercode eq {type}",
        { name: '', type: '' },
      );
      expect(result).toBe('');
    });

    it('preserves an or group inside an and expression', () => {
      const result = buildODataFilter(
        "statuscode eq {status} and (gendercode eq {a} or gendercode eq {b})",
        { status: '1', a: '1', b: '2' },
      );
      expect(result).toBe('(statuscode eq 1 and (gendercode eq 1 or gendercode eq 2))');
    });

    it('emits a null comparison without a value', () => {
      expect(buildODataFilter('parentcustomerid ne null', {})).toBe('parentcustomerid ne null');
    });

    it('returns empty for an empty template', () => {
      expect(buildODataFilter('', { name: 'Al' })).toBe('');
    });
  });
});
