import type { WorkflowStep, WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

/**
 * A selected step's relationships, computed from the designer store
 * (CWFD-017 PR3). One derivation feeds two consumers: the Overview tab of
 * the step panel says it in words, and Focus Mode says it in light — so the
 * two can never disagree about what "related" means.
 */

export type RelationKind = 'plain' | 'conditional' | 'return' | 'terminal' | 'parallel';

export interface StepRelation {
  /** The decision or route carrying the relationship. */
  label: string;
  /** The step on the other end; null when the relationship ends the process. */
  stepId: string | null;
  stepName: string;
  kind: RelationKind;
  /** Conditional decisions list where each of their routes leads. */
  routes: Array<{ label: string; stepId: string | null; stepName: string; isDefault: boolean }>;
}

export interface StepRelationships {
  incoming: StepRelation[];
  outgoing: StepRelation[];
  parallelParent: { stepId: string; stepName: string } | null;
  parallelChildren: Array<{ stepId: string; stepName: string }>;
  counts: {
    decisions: number;
    conditionalDecisions: number;
    returns: number;
    parallel: number;
  };
}

const ENDS = 'Ends the process';

function kindOf(
  source: WorkflowStep,
  target: WorkflowStep | null,
  outcome: WorkflowOutcome
): RelationKind {
  if (outcome.applyFilter) return 'conditional';
  if (!target) return 'terminal';
  if (target.sequenceNo <= source.sequenceNo) return 'return';
  return 'plain';
}

/**
 * Everything connected to one step: where work arrives from (decisions and
 * conditional routes on other steps), where its own decisions can send it,
 * and what runs alongside it. Pure over the store's records.
 */
export function computeStepRelationships(
  stepId: string,
  steps: Record<string, WorkflowStep>,
  outcomes: Record<string, WorkflowOutcome>,
  routes: Record<string, WorkflowRoute>
): StepRelationships {
  const step = steps[stepId];
  const empty: StepRelationships = {
    incoming: [],
    outgoing: [],
    parallelParent: null,
    parallelChildren: [],
    counts: { decisions: 0, conditionalDecisions: 0, returns: 0, parallel: 0 },
  };
  if (!step) return empty;

  const routesByOutcome = new Map<string, WorkflowRoute[]>();
  for (const route of Object.values(routes)) {
    const list = routesByOutcome.get(route.outcomeId) ?? [];
    list.push(route);
    routesByOutcome.set(route.outcomeId, list);
  }
  for (const list of routesByOutcome.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  const outgoing: StepRelation[] = Object.values(outcomes)
    .filter((outcome) => outcome.stepId === stepId)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((outcome) => {
      const target = outcome.nextStepId ? (steps[outcome.nextStepId] ?? null) : null;
      return {
        label: outcome.name,
        stepId: target?.crmId ?? null,
        stepName: target?.name ?? ENDS,
        kind: kindOf(step, target, outcome),
        routes: (outcome.applyFilter ? (routesByOutcome.get(outcome.crmId) ?? []) : []).map(
          (route) => {
            const routeTarget = route.nextStepId ? (steps[route.nextStepId] ?? null) : null;
            return {
              label: route.name,
              stepId: routeTarget?.crmId ?? null,
              stepName: routeTarget?.name ?? ENDS,
              isDefault: route.isDefault,
            };
          }
        ),
      };
    });

  const incoming: StepRelation[] = [];
  for (const outcome of Object.values(outcomes)) {
    if (outcome.stepId === stepId) continue;
    const source = steps[outcome.stepId];
    if (!source) continue;
    if (outcome.nextStepId === stepId) {
      incoming.push({
        label: outcome.name,
        stepId: source.crmId,
        stepName: source.name,
        kind: kindOf(source, step, outcome),
        routes: [],
      });
    }
    // A conditional decision reaches this step through its routes.
    for (const route of routesByOutcome.get(outcome.crmId) ?? []) {
      if (route.nextStepId !== stepId) continue;
      incoming.push({
        label: route.name || outcome.name,
        stepId: source.crmId,
        stepName: source.name,
        kind: 'conditional',
        routes: [],
      });
    }
  }
  incoming.sort((a, b) => a.stepName.localeCompare(b.stepName));

  const parallelChildren = Object.values(steps)
    .filter((candidate) => candidate.parentStepId === stepId)
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .map((child) => ({ stepId: child.crmId, stepName: child.name }));
  const parent = step.parentStepId ? steps[step.parentStepId] : undefined;
  const parallelParent = parent ? { stepId: parent.crmId, stepName: parent.name } : null;

  return {
    incoming,
    outgoing,
    parallelParent,
    parallelChildren,
    counts: {
      decisions: outgoing.length,
      conditionalDecisions: outgoing.filter((relation) => relation.kind === 'conditional').length,
      returns: outgoing.filter((relation) => relation.kind === 'return').length,
      parallel: parallelChildren.length + (parallelParent ? 1 : 0),
    },
  };
}

/**
 * The step ids Focus Mode keeps at full strength: the selection plus every
 * step its relationships name — incoming sources, outgoing targets, route
 * destinations, and the concurrency family.
 */
export function collectFocusStepIds(stepId: string, relationships: StepRelationships): Set<string> {
  const ids = new Set<string>([stepId]);
  for (const relation of relationships.incoming) {
    if (relation.stepId) ids.add(relation.stepId);
  }
  for (const relation of relationships.outgoing) {
    if (relation.stepId) ids.add(relation.stepId);
    for (const route of relation.routes) {
      if (route.stepId) ids.add(route.stepId);
    }
  }
  for (const child of relationships.parallelChildren) ids.add(child.stepId);
  if (relationships.parallelParent) ids.add(relationships.parallelParent.stepId);
  return ids;
}
