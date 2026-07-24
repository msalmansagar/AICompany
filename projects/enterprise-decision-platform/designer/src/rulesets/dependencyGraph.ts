// Builds the rule dependency graph: rule sets reference member rules, so the edges are
// set → rule. Pure — no I/O — and unit-tested. The loader that fetches the inputs lives in
// the dataverse client.

export interface GraphRule { ruleId: string; name: string; status: string; }
export interface GraphMemberRef { ruleId: string; key: string; order: number; }
export interface GraphSet { id: string; name: string; policy: string; members: GraphMemberRef[]; }

export interface DepMember { ruleId: string; name: string; key: string; order: number; missing: boolean; }
export interface DepSet { id: string; name: string; policy: string; members: DepMember[]; }
export interface DepRule { ruleId: string; name: string; status: string; usedBy: { id: string; name: string }[]; orphan: boolean; }
export interface DependencyGraph {
  sets: DepSet[];
  rules: DepRule[];
  stats: { setCount: number; ruleCount: number; orphanCount: number; danglingCount: number };
}

export function buildDependencyGraph(rules: GraphRule[], sets: GraphSet[]): DependencyGraph {
  const ruleById = new Map(rules.map((r) => [r.ruleId, r]));
  const usedBy = new Map<string, { id: string; name: string }[]>();
  let danglingCount = 0;

  const depSets: DepSet[] = sets.map((set) => ({
    id: set.id,
    name: set.name,
    policy: set.policy,
    members: [...set.members]
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const rule = ruleById.get(m.ruleId);
        if (!rule) danglingCount++;
        else (usedBy.get(m.ruleId) ?? usedBy.set(m.ruleId, []).get(m.ruleId)!).push({ id: set.id, name: set.name });
        return { ruleId: m.ruleId, name: rule?.name ?? '(missing rule)', key: m.key, order: m.order, missing: !rule };
      }),
  }));

  const depRules: DepRule[] = rules
    .map((r) => {
      const consumers = usedBy.get(r.ruleId) ?? [];
      return { ruleId: r.ruleId, name: r.name, status: r.status, usedBy: consumers, orphan: consumers.length === 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    sets: depSets,
    rules: depRules,
    stats: {
      setCount: sets.length,
      ruleCount: rules.length,
      orphanCount: depRules.filter((r) => r.orphan).length,
      danglingCount,
    },
  };
}
