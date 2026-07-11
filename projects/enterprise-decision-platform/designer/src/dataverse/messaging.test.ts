import { describe, it, expect } from 'vitest';
import { functionRequest } from './messaging';

describe('functionRequest — cloud (Custom API Function, GET)', () => {
  it('builds the OData function-call syntax for one param', () => {
    const r = functionRequest('customapi', 'qdb_edp_GetRuleAnalytics', { PeriodDays: '30' });
    expect(r.method).toBe('GET');
    expect(r.path).toBe("/qdb_edp_GetRuleAnalytics(PeriodDays=@PeriodDays)?@PeriodDays=%2730%27");
    expect(r.body).toBeUndefined();
  });

  it('joins multiple params with comma and &', () => {
    const r = functionRequest('customapi', 'qdb_edp_GetRuleAnalytics', { RuleId: 'abc', PeriodDays: '7' });
    expect(r.path).toBe("/qdb_edp_GetRuleAnalytics(RuleId=@RuleId,PeriodDays=@PeriodDays)?@RuleId=%27abc%27&@PeriodDays=%277%27");
  });

  it('emits empty parens for a no-arg function', () => {
    const r = functionRequest('customapi', 'qdb_edp_GetRuleTemplates', {});
    expect(r.path).toBe('/qdb_edp_GetRuleTemplates()');
  });
});

describe('functionRequest — on-prem (Custom Action, POST)', () => {
  it('POSTs the plain message with a params body', () => {
    const r = functionRequest('action', 'qdb_edp_GetRuleAnalytics', { RuleId: 'abc', PeriodDays: '7' });
    expect(r.method).toBe('POST');
    expect(r.path).toBe('/qdb_edp_GetRuleAnalytics');
    expect(r.body).toEqual({ RuleId: 'abc', PeriodDays: '7' });
  });

  it('POSTs even with no params', () => {
    const r = functionRequest('action', 'qdb_edp_GetRuleTemplates', {});
    expect(r).toEqual({ method: 'POST', path: '/qdb_edp_GetRuleTemplates', body: {} });
  });
});
