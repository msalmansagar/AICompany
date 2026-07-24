import { describe, it, expect } from 'vitest';
import { buildDependencyGraph, type GraphRule, type GraphSet } from './dependencyGraph';

const rules: GraphRule[] = [
  { ruleId: 'r1', name: 'Affordability', status: 'Published' },
  { ruleId: 'r2', name: 'Sanctions', status: 'Published' },
  { ruleId: 'r3', name: 'Unused', status: 'Draft' },
];
const sets: GraphSet[] = [
  { id: 's1', name: 'Onboarding', policy: 'Collect', members: [
    { ruleId: 'r2', key: 'a', order: 2 }, { ruleId: 'r1', key: 'b', order: 1 },
  ] },
  { id: 's2', name: 'Renewal', policy: 'FirstMatch', members: [
    { ruleId: 'r1', key: 'c', order: 1 }, { ruleId: 'rX', key: 'd', order: 2 }, // rX = missing rule
  ] },
];

describe('buildDependencyGraph', () => {
  const g = buildDependencyGraph(rules, sets);

  it('orders a set members by order and resolves names', () => {
    expect(g.sets[0].members.map((m) => m.name)).toEqual(['Affordability', 'Sanctions']);
  });

  it('flags a member that references a missing rule', () => {
    const dangling = g.sets[1].members.find((m) => m.ruleId === 'rX')!;
    expect(dangling.missing).toBe(true);
    expect(dangling.name).toBe('(missing rule)');
  });

  it('computes reverse usage (used-by)', () => {
    const r1 = g.rules.find((r) => r.ruleId === 'r1')!;
    expect(r1.usedBy.map((s) => s.name).sort()).toEqual(['Onboarding', 'Renewal']);
    expect(r1.orphan).toBe(false);
  });

  it('marks a rule used by no set as an orphan', () => {
    expect(g.rules.find((r) => r.ruleId === 'r3')!.orphan).toBe(true);
  });

  it('reports stats including orphans and dangling references', () => {
    expect(g.stats).toEqual({ setCount: 2, ruleCount: 3, orphanCount: 1, danglingCount: 1 });
  });
});
