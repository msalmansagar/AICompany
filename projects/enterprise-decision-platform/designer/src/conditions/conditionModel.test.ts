import { describe, it, expect } from 'vitest';
import { conditionsToPcrm, emptyConditions, type ConditionModel, type Clause, type Group, type Quantifier } from './conditionModel';

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

// ---- quantifiers (EDP-FACT-001 F1 authoring) --------------------------------------------

describe('quantifiers', () => {
  const beneficiaryPresent = (): Group => ({
    op: 'and',
    clauses: [{ field: 'beneficiaryName', fieldType: 'Text', operator: 'IsNotEmpty' }],
    groups: [],
  });

  const withQuantifier = (q: Partial<Quantifier> = {}): ConditionModel => ({
    ...emptyConditions(),
    when: {
      op: 'and',
      clauses: [],
      groups: [],
      quantifiers: [{ kind: 'all', collection: 'invoices', where: beneficiaryPresent(), ...q }],
    },
  });

  const logicOf = (m: ConditionModel) => (conditionsToPcrm(m, { name: 'g1', targetEntity: 'qdb_disbursement' }) as any).logic;
  const inputsOf = (m: ConditionModel) => (conditionsToPcrm(m, { name: 'g1', targetEntity: 'qdb_disbursement' }) as any).inputs;

  it('emits a quantifier onto the group', () => {
    const quantifiers = logicOf(withQuantifier()).rules[0].when.quantifiers;
    expect(quantifiers).toHaveLength(1);
    expect(quantifiers[0].kind).toBe('all');
    expect(quantifiers[0].collection).toBe('invoices');
    expect(quantifiers[0].where.conditions[0].field).toBe('beneficiaryName');
  });

  it('declares the collection as an input with NO binding, since no anchor attribute holds it', () => {
    const collection = inputsOf(withQuantifier()).find((i: any) => i.name === 'invoices');
    expect(collection).toBeDefined();
    expect(collection.binding).toBeUndefined();
  });

  it('does NOT declare element fields as inputs — they belong to the element, not the anchor', () => {
    // Declaring beneficiaryName as an input would bind it to the disbursement record, which is
    // the wrong record entirely.
    expect(inputsOf(withQuantifier()).some((i: any) => i.name === 'beneficiaryName')).toBe(false);
  });

  it('drops a quantifier with no collection named', () => {
    expect(logicOf(withQuantifier({ collection: '  ' })).rules[0].when.quantifiers).toHaveLength(0);
  });

  it('drops a quantifier whose body tests nothing', () => {
    const empty: Group = { op: 'and', clauses: [], groups: [] };
    expect(logicOf(withQuantifier({ where: empty })).rules[0].when.quantifiers).toHaveLength(0);
  });

  it('still emits quantifiers as an empty array when there are none', () => {
    expect(logicOf(emptyConditions()).rules[0].when.quantifiers).toEqual([]);
  });

  it('collects a collection quantified inside another quantifier', () => {
    const nested = withQuantifier({
      where: { op: 'and', clauses: [], groups: [], quantifiers: [{ kind: 'some', collection: 'lines', where: beneficiaryPresent() }] },
    });
    expect(inputsOf(nested).some((i: any) => i.name === 'lines')).toBe(true);
  });
});
