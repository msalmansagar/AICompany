import { describe, it, expect } from 'vitest';
import { buildDependsOnFilter } from './gridFilterExpression.js';

describe('buildDependsOnFilter', () => {
  describe('single condition (backward compatibility)', () => {
    it('substitutes a quoted placeholder and strips the lookup nav prefix', () => {
      const result = buildDependsOnFilter(
        "_parentcustomerid_value eq '{dependsOnValue}'",
        { dependsOnValue: '11111111-1111-1111-1111-111111111111' },
      );
      expect(result).toBe('<condition attribute="parentcustomerid" operator="eq" value="11111111-1111-1111-1111-111111111111"/>');
    });

    it('handles a like template with surrounding wildcards', () => {
      const result = buildDependsOnFilter("fullname like '%{dependsOnValue}%'", { dependsOnValue: 'Al' });
      expect(result).toBe('<condition attribute="fullname" operator="like" value="%Al%"/>');
    });

    it('emits an unquoted numeric condition for a bare placeholder', () => {
      const result = buildDependsOnFilter('gendercode eq {dependsOnValue}', { dependsOnValue: '2' });
      expect(result).toBe('<condition attribute="gendercode" operator="eq" value="2"/>');
    });

    it('drops the condition when the referenced value is empty', () => {
      expect(buildDependsOnFilter("fullname like '%{dependsOnValue}%'", { dependsOnValue: '' })).toBe('');
    });

    it('drops a numeric condition when the value is not numeric', () => {
      expect(buildDependsOnFilter('gendercode eq {dependsOnValue}', { dependsOnValue: 'abc' })).toBe('');
    });
  });

  describe('multiple fields joined by AND', () => {
    it('emits an and-filter over every satisfied condition', () => {
      const result = buildDependsOnFilter(
        "_qdb_serviceref_value eq '{_qdb_serviceref_value}' and statuscode eq {statuscode}",
        { _qdb_serviceref_value: 'abc', statuscode: '1' },
      );
      expect(result).toBe(
        '<filter type="and">' +
        '<condition attribute="qdb_serviceref" operator="eq" value="abc"/>' +
        '<condition attribute="statuscode" operator="eq" value="1"/>' +
        '</filter>',
      );
    });

    it('collapses to the single remaining condition when one field is empty', () => {
      const result = buildDependsOnFilter(
        "_qdb_serviceref_value eq '{_qdb_serviceref_value}' and _qdb_region_value eq '{_qdb_region_value}'",
        { _qdb_serviceref_value: 'abc', _qdb_region_value: '' },
      );
      expect(result).toBe('<condition attribute="qdb_serviceref" operator="eq" value="abc"/>');
    });

    it('returns empty when every field is empty', () => {
      const result = buildDependsOnFilter(
        "a eq '{a}' and b eq '{b}'",
        { a: '', b: '' },
      );
      expect(result).toBe('');
    });
  });

  describe('OR and grouping', () => {
    it('compiles nested and/or with parentheses into nested filters', () => {
      const result = buildDependsOnFilter(
        "a eq '{a}' and ( b eq '{b}' or c eq '{c}' )",
        { a: '1', b: '2', c: '3' },
      );
      expect(result).toBe(
        '<filter type="and">' +
        '<condition attribute="a" operator="eq" value="1"/>' +
        '<filter type="or">' +
        '<condition attribute="b" operator="eq" value="2"/>' +
        '<condition attribute="c" operator="eq" value="3"/>' +
        '</filter>' +
        '</filter>',
      );
    });

    it('prunes an empty branch inside an OR group', () => {
      const result = buildDependsOnFilter(
        "( b eq '{b}' or c eq '{c}' )",
        { b: '2', c: '' },
      );
      expect(result).toBe('<condition attribute="b" operator="eq" value="2"/>');
    });
  });

  describe('null and safety', () => {
    it('maps eq null and ne null to null / not-null operators', () => {
      expect(buildDependsOnFilter('a eq null', {})).toBe('<condition attribute="a" operator="null"/>');
      expect(buildDependsOnFilter('a ne null', {})).toBe('<condition attribute="a" operator="not-null"/>');
    });

    it('xml-escapes user-supplied values', () => {
      const result = buildDependsOnFilter("name eq '{name}'", { name: 'A & B <x>"y"' });
      expect(result).toBe('<condition attribute="name" operator="eq" value="A &amp; B &lt;x&gt;&quot;y&quot;"/>');
    });

    it('returns empty on an unparseable template instead of throwing', () => {
      expect(buildDependsOnFilter('a eq eq eq', { a: '1' })).toBe('');
      expect(buildDependsOnFilter("a eq '{a}' and", { a: '1' })).toBe('');
    });
  });
});
