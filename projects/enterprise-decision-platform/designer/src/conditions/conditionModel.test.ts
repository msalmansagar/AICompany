import { describe, it, expect } from 'vitest';
import { conditionsToPcrm, emptyConditions, type ConditionModel, type Clause } from './conditionModel';

const clause = (field: string, operator: string, value?: string, fieldType = 'Decimal'): Clause => ({ field, fieldType, operator, value });
const meta = { name: 'Risk', targetEntity: 'account' };

function model(over: Partial<ConditionModel>): ConditionModel {
  return { ...emptyConditions(), ...over };
}

describe('conditionsToPcrm', () => {
  it('emits a conditionSet with the right logic type', () => {
    const pcrm: any = conditionsToPcrm(emptyConditions(), meta);
    expect(pcrm.logic.type).toBe('conditionSet');
    expect(pcrm.logic.rules).toHaveLength(1);
  });

  it('emits an AND group of two clauses', () => {
    const m = model({
      when: { op: 'and', clauses: [clause('revenue', 'GreaterThan', '1000'), clause('score', 'GreaterThanOrEqual', '700')], groups: [] },
      then: { result: 'Approve' },
    });
    const pcrm: any = conditionsToPcrm(m, meta);
    const when = pcrm.logic.rules[0].when;
    expect(when.op).toBe('and');
    expect(when.conditions.map((c: any) => c.field)).toEqual(['revenue', 'score']);
    expect(when.conditions[0]).toMatchObject({ field: 'revenue', operator: 'GreaterThan', value: 1000 });
    expect(pcrm.logic.rules[0].then).toEqual({ result: 'Approve' });
  });

  it('emits a nested OR of a group and a clause: (A AND B) OR C', () => {
    const m = model({
      when: {
        op: 'or', clauses: [clause('vip', 'Equals', 'true', 'Boolean')],
        groups: [{ op: 'and', clauses: [clause('revenue', 'GreaterThan', '1000'), clause('score', 'GreaterThan', '700')], groups: [] }],
      },
      then: { result: 'Refer' },
    });
    const when: any = (conditionsToPcrm(m, meta) as any).logic.rules[0].when;
    expect(when.op).toBe('or');
    expect(when.conditions).toHaveLength(1);           // vip
    expect(when.groups).toHaveLength(1);               // (revenue AND score)
    expect(when.groups[0].op).toBe('and');
    expect(when.groups[0].conditions).toHaveLength(2);
  });

  it('carries the NOT (negate) flag', () => {
    const m = model({ when: { op: 'and', negate: true, clauses: [clause('blocked', 'Equals', 'true', 'Boolean')], groups: [] }, then: { result: 'OK' } });
    expect((conditionsToPcrm(m, meta) as any).logic.rules[0].when.negate).toBe(true);
  });

  it('declares an input per referenced field', () => {
    const m = model({ when: { op: 'and', clauses: [clause('revenue', 'GreaterThan', '1000'), clause('score', 'GreaterThan', '700')], groups: [] }, then: {} });
    const inputs = (conditionsToPcrm(m, meta) as any).inputs;
    expect(inputs.map((i: any) => i.name).sort()).toEqual(['revenue', 'score']);
    expect(inputs.every((i: any) => i.binding === i.name)).toBe(true);
  });

  it('includes otherwise only when an else outcome is set', () => {
    const base = model({ when: { op: 'and', clauses: [clause('x', 'GreaterThan', '1')], groups: [] }, then: { result: 'A' } });
    expect((conditionsToPcrm(base, meta) as any).logic.otherwise).toBeUndefined();
    const withElse = model({ ...base, otherwise: { result: 'B' } });
    expect((conditionsToPcrm(withElse, meta) as any).logic.otherwise).toEqual({ result: 'B' });
  });
});
