import type { WorkflowDesignerState } from '@/store/workflowStore';

export type ViolationCode =
  | 'NO_PROCESS'
  | 'NO_STEPS'
  | 'ORPHAN_STEP'
  | 'NO_OUTCOMES'
  | 'DUPLICATE_SEQUENCE'
  | 'INVALID_ASSIGNMENT'
  | 'MISSING_FETCHXML'
  | 'CIRCULAR_ROUTE'
  | 'MISSING_START'
  | 'MISSING_END'
  | 'INVALID_NEXT_STEP';

export interface Violation {
  code: ViolationCode;
  message: string;
  nodeId?: string;
  severity: 'error' | 'warning';
}

export class ValidationService {
  validate(state: Pick<WorkflowDesignerState, 'process' | 'steps' | 'outcomes' | 'routes' | 'stepOrder'>): Violation[] {
    const violations: Violation[] = [];

    if (!state.process) {
      violations.push({ code: 'NO_PROCESS', message: 'No process is loaded.', severity: 'error' });
      return violations;
    }

    const steps = Object.values(state.steps);
    if (steps.length === 0) {
      violations.push({ code: 'NO_STEPS', message: 'The workflow has no steps.', severity: 'error' });
      return violations;
    }

    this.checkStartNode(steps, violations);
    this.checkEndNodes(state, violations);
    this.checkOrphanSteps(state, violations);
    this.checkNoOutcomes(state, violations);
    this.checkDuplicateSequence(steps, violations);
    this.checkInvalidAssignment(steps, violations);
    this.checkMissingFetchXml(state, violations);
    this.checkInvalidNextStep(state, violations);
    this.checkCircularRoutes(state, violations);

    return violations;
  }

  private checkStartNode(
    steps: WorkflowDesignerState['steps'][string][],
    violations: Violation[]
  ): void {
    const hasStart = steps.some((s) => s.sequenceNo === 1);
    if (!hasStart) {
      violations.push({
        code: 'MISSING_START',
        message: 'No step has sequence number 1 (start step).',
        severity: 'error',
      });
    }
  }

  private checkEndNodes(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'routes'>,
    violations: Violation[]
  ): void {
    const allNextStepIds = new Set(Object.values(state.routes).map((r) => r.nextStepId));
    const stepsWithOutcomes = new Set(Object.values(state.outcomes).map((o) => o.stepId));

    for (const step of Object.values(state.steps)) {
      const hasOutcome = stepsWithOutcomes.has(step.crmId);
      const isReachableAsNext = allNextStepIds.has(step.crmId);
      const isStartStep = step.sequenceNo === 1;

      if (!hasOutcome && !isStartStep && !isReachableAsNext) {
        violations.push({
          code: 'MISSING_END',
          message: `Step "${step.name}" has no outcomes and is not reachable — it may be a dead end.`,
          nodeId: step.crmId,
          severity: 'warning',
        });
      }
    }
  }

  private checkOrphanSteps(
    state: Pick<WorkflowDesignerState, 'steps' | 'routes'>,
    violations: Violation[]
  ): void {
    const allNextStepIds = new Set(Object.values(state.routes).map((r) => r.nextStepId));
    const steps = Object.values(state.steps);

    for (const step of steps) {
      const isStart = step.sequenceNo === 1;
      if (!isStart && !allNextStepIds.has(step.crmId)) {
        violations.push({
          code: 'ORPHAN_STEP',
          message: `Step "${step.name}" is unreachable — no route leads to it.`,
          nodeId: step.crmId,
          severity: 'warning',
        });
      }
    }
  }

  private checkNoOutcomes(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes'>,
    violations: Violation[]
  ): void {
    const stepsWithOutcomes = new Set(Object.values(state.outcomes).map((o) => o.stepId));

    for (const step of Object.values(state.steps)) {
      if (!stepsWithOutcomes.has(step.crmId)) {
        violations.push({
          code: 'NO_OUTCOMES',
          message: `Step "${step.name}" has no outcomes defined.`,
          nodeId: step.crmId,
          severity: 'error',
        });
      }
    }
  }

  private checkDuplicateSequence(
    steps: WorkflowDesignerState['steps'][string][],
    violations: Violation[]
  ): void {
    const seen = new Map<number, string>();
    for (const step of steps) {
      const existing = seen.get(step.sequenceNo);
      if (existing) {
        violations.push({
          code: 'DUPLICATE_SEQUENCE',
          message: `Steps "${existing}" and "${step.name}" have the same sequence number (${step.sequenceNo}).`,
          nodeId: step.crmId,
          severity: 'error',
        });
      } else {
        seen.set(step.sequenceNo, step.name);
      }
    }
  }

  private checkInvalidAssignment(
    steps: WorkflowDesignerState['steps'][string][],
    violations: Violation[]
  ): void {
    for (const step of steps) {
      if (step.assignTo === 'user' && !step.assignedUserId) {
        violations.push({
          code: 'INVALID_ASSIGNMENT',
          message: `Step "${step.name}" is assigned to "Specific User" but no user is selected.`,
          nodeId: step.crmId,
          severity: 'error',
        });
      }
      if (step.assignTo === 'team' && !step.teamId) {
        violations.push({
          code: 'INVALID_ASSIGNMENT',
          message: `Step "${step.name}" is assigned to "Team" but no team is selected.`,
          nodeId: step.crmId,
          severity: 'error',
        });
      }
      if (step.assignTo === 'roundRobin' && !step.roundRobinTeamId) {
        violations.push({
          code: 'INVALID_ASSIGNMENT',
          message: `Step "${step.name}" is assigned to "Round Robin" but no round robin team is selected.`,
          nodeId: step.crmId,
          severity: 'error',
        });
      }
    }
  }

  private checkMissingFetchXml(
    state: Pick<WorkflowDesignerState, 'outcomes' | 'routes'>,
    violations: Violation[]
  ): void {
    for (const outcome of Object.values(state.outcomes)) {
      if (!outcome.applyFilter) continue;
      const hasFilter = Object.values(state.routes).some(
        (r) => r.outcomeId === outcome.crmId && r.filter.trim().length > 0
      );
      if (!hasFilter) {
        violations.push({
          code: 'MISSING_FETCHXML',
          message: `Outcome "${outcome.name}" has "Apply Filter" enabled but no FetchXML filter is set on its routes.`,
          nodeId: outcome.crmId,
          severity: 'error',
        });
      }
    }
  }

  private checkInvalidNextStep(
    state: Pick<WorkflowDesignerState, 'steps' | 'routes'>,
    violations: Violation[]
  ): void {
    const stepIds = new Set(Object.keys(state.steps));
    for (const route of Object.values(state.routes)) {
      if (route.nextStepId && !stepIds.has(route.nextStepId)) {
        violations.push({
          code: 'INVALID_NEXT_STEP',
          message: `Route "${route.name}" points to a step that no longer exists.`,
          nodeId: route.crmId,
          severity: 'error',
        });
      }
    }
  }

  private checkCircularRoutes(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'routes'>,
    violations: Violation[]
  ): void {
    // Build adjacency: stepId -> list of nextStepIds via outcomes/routes
    const adjacency = new Map<string, string[]>();
    for (const step of Object.values(state.steps)) {
      adjacency.set(step.crmId, []);
    }

    for (const outcome of Object.values(state.outcomes)) {
      const routes = Object.values(state.routes).filter((r) => r.outcomeId === outcome.crmId);
      for (const route of routes) {
        const existing = adjacency.get(outcome.stepId) ?? [];
        existing.push(route.nextStepId);
        adjacency.set(outcome.stepId, existing);
      }
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const detectCycle = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      inStack.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (detectCycle(neighbor)) return true;
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const stepId of adjacency.keys()) {
      if (!visited.has(stepId)) {
        if (detectCycle(stepId)) {
          violations.push({
            code: 'CIRCULAR_ROUTE',
            message: 'The workflow contains a circular route — at least one step loops back to itself or a previous step.',
            nodeId: stepId,
            severity: 'error',
          });
          break;
        }
      }
    }
  }
}
