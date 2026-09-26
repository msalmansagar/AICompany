import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCOPE, REPORTING_DIMENSIONS, ReportingScopeSchema, activeDimensions, restrictScope, scopeKey,
} from './reportingScope.js';
import {
  MEASURES, REPORT_DEFINITIONS, computableMeasuresOf, definitionByCode, measureByCode,
} from './reportingCatalogue.js';

describe('ReportingScope', () => {
  it('accepts only the ten MIS buckets and the two source systems', () => {
    expect(ReportingScopeSchema.safeParse({ bucket: '61-90', sourceSystem: 'HL' }).success).toBe(true);
    expect(ReportingScopeSchema.safeParse({ bucket: '180+' }).success).toBe(false);
    expect(ReportingScopeSchema.safeParse({ sourceSystem: 'ALL' }).success).toBe(false);
  });

  it('refuses a dimension it does not know, so a typo never silently widens a question', () => {
    expect(ReportingScopeSchema.safeParse({ riskGrade: 'high' }).success).toBe(false);
  });

  it('names the dimensions in force', () => {
    expect(activeDimensions({ bucket: '1-30', owner: 'u-1' })).toEqual(['bucket', 'owner']);
    expect(activeDimensions(EMPTY_SCOPE)).toEqual([]);
  });

  it('drops the dimensions a definition cannot honour and says which', () => {
    const { scope, dropped } = restrictScope({ bucket: '1-30', owner: 'u-1', dateFrom: '2026-09-01' }, ['bucket']);

    expect([scope, dropped]).toEqual([{ bucket: '1-30' }, ['owner', 'dateFrom']]);
  });

  it('fingerprints by content in a fixed order', () => {
    expect(scopeKey({ owner: 'u-1', bucket: '1-30' })).toBe(scopeKey({ bucket: '1-30', owner: 'u-1' }));
    expect(scopeKey({ bucket: '1-30', owner: 'u-1' })).toBe('bucket=1-30&owner=u-1');
    expect(REPORTING_DIMENSIONS.length).toBe(9);
  });
});

describe('the reporting catalogue', () => {
  it('names every measure a definition uses', () => {
    const missing = REPORT_DEFINITIONS.flatMap(d => d.measures.filter(code => measureByCode(code) === undefined));
    expect(missing).toEqual([]);
  });

  it('lets no definition show a KPI whose definition QDB has not confirmed', () => {
    const offenders = REPORT_DEFINITIONS.flatMap(d => d.measures.filter(code => {
      const classification = measureByCode(code)?.classification;
      return classification === 'definition-pending' || classification === 'deferred';
    }));
    expect(offenders).toEqual([]);
  });

  it('registers the textbook KPIs as pending, not as measures', () => {
    const pending = MEASURES.filter(m => m.classification === 'definition-pending').map(m => m.code);
    expect(pending).toEqual(expect.arrayContaining([
      'K-CURE-RATE', 'K-ROLL-RATE', 'K-RECOVERY-RATE', 'K-COLLECTION-EFFECTIVENESS', 'K-PTP-KEPT-RATE',
      'K-PTP-BROKEN-RATE', 'K-CONTACT-RATE', 'K-RIGHT-PARTY-CONTACT', 'K-LIQUIDATION-RATE', 'K-COLLECTOR-PRODUCTIVITY', 'K-SLA-COMPLIANCE',
    ]));
    expect(pending.every(code => MEASURES.find(m => m.code === code)?.note?.includes('Definition Pending QDB Confirmation'))).toBe(true);
  });

  it('gives every definition a grain, a source, a security requirement and a freshness statement', () => {
    const incomplete = REPORT_DEFINITIONS.filter(d => !d.grain || !d.source || !d.security || !d.freshness);
    expect(incomplete).toEqual([]);
  });

  it('never calls a case an account, and never says exposure', () => {
    const text = JSON.stringify([MEASURES, REPORT_DEFINITIONS]).toLowerCase();
    expect([/\baccounts? in collection\b/.test(text), /\bexposure\b/.test(text.replace('never called exposure (ki-32)', ''))]).toEqual([false, false]);
  });

  it('uses unique codes', () => {
    const codes = [...MEASURES.map(m => m.code), ...REPORT_DEFINITIONS.map(d => d.code)];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('answers a definition\'s computable measures without the pending ones', () => {
    const portfolio = definitionByCode('DCP-DB-001')!;
    expect(computableMeasuresOf(portfolio).map(m => m.code)).toEqual(['M-OPEN-CASES', 'M-CURRENT-ARREARS', 'M-LOAN-BALANCE', 'M-DISTINCT-CUSTOMERS']);
  });
});
