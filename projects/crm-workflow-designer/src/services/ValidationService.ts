import type { WorkflowDesignerState } from '@/store/workflowStore';
import { validateSlaConfig } from '@/validators/slaValidator';

export type ViolationCode =
  | 'NO_PROCESS'
  | 'NO_STEPS'
  | 'MISSING_STEP_NAME'
  | 'ORPHAN_STEP'
  | 'NO_OUTCOMES'
  | 'NO_TERMINAL_OUTCOME'
  | 'DUPLICATE_SEQUENCE'
  | 'INVALID_ASSIGNMENT'
  | 'MISSING_FETCHXML'
  | 'DEAD_LOOP'
  | 'MISSING_START'
  | 'MISSING_END'
  | 'INVALID_NEXT_STEP'
  | 'MISSING_TASK_SUBJECT'
  | 'DUPLICATE_OUTCOME_NAME'
  | 'TOO_MANY_OUTCOMES'
  | 'MISSING_FALLBACK_ROUTE'
  | 'INVALID_SLA';

export interface Violation {
  code: ViolationCode;
  message: string;
  /** Primary affected node ID (step.crmId or outcome.crmId). */
  nodeId?: string;
  /** 'step' | 'outcome' — used to build canvas selection IDs. Defaults to 'step'. */
  nodeType?: 'step' | 'outcome';
  /** All node IDs affected by this violation (e.g. all steps in a dead loop). */
  affectedNodeIds?: string[];
  severity: 'error' | 'warning';
}

export class ValidationService {
  private static readonly MAX_OUTCOMES_PER_STEP = 5;
  validate(state: Pick<WorkflowDesignerState, 'process' | 'steps' | 'outcomes' | 'routes' | 'stepOrder' | 'outcomeOrder'>): Violation[] {
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

    this.checkMissingStepNames(steps, violations);
    this.checkStartNode(steps, violations);
    this.checkEndNodes(state, violations);
    this.checkOrphanSteps(state, violations);
    this.checkNoOutcomes(state, violations);
    this.checkNoTerminalOutcome(state, violations);
    this.checkDuplicateSequence(steps, violations);
    this.checkInvalidAssignment(steps, violations);
    this.checkInvalidSlaConfig(steps, violations);
    this.checkMissingFetchXml(state, violations);
    this.checkInvalidNextStep(state, violations);
    this.checkDeadLoops(state, violations);
    this.checkMissingTaskSubject(steps, violations);
    this.checkDuplicateOutcomeNames(state, violations);
    this.checkTooManyOutcomes(state, violations);
    this.checkMissingFallbackRoute(state, violations);

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

  private buildReachableStepIds(
    state: Pick<WorkflowDesignerState, 'outcomes' | 'routes'>
  ): Set<string> {
    const reachable = new Set<string>();
    for (const outcome of Object.values(state.outcomes)) {
      if (!outcome.applyFilter && outcome.nextStepId !== null) {
        reachable.add(outcome.nextStepId);
      }
    }
    for (const route of Object.values(state.routes)) {
      if (route.nextStepId) reachable.add(route.nextStepId);
    }
    return reachable;
  }

  private checkEndNodes(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'routes'>,
    violations: Violation[]
  ): void {
    const allNextStepIds = this.buildReachableStepIds(state);
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
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'routes'>,
    violations: Violation[]
  ): void {
    const allNextStepIds = this.buildReachableStepIds(state);
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

  private checkInvalidSlaConfig(
    steps: WorkflowDesignerState['steps'][string][],
    violations: Violation[]
  ): void {
    for (const step of steps) {
      if (!step.slaEnabled) continue;
      const errors = validateSlaConfig(step);
      const firstError = Object.values(errors)[0];
      if (firstError) {
        violations.push({
          code: 'INVALID_SLA',
          message: `Step "${step.name || `#${step.sequenceNo}`}" has an incomplete SLA configuration: ${firstError}`,
          nodeId: step.crmId,
          nodeType: 'step',
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

  private checkMissingStepNames(
    steps: WorkflowDesignerState['steps'][string][],
    violations: Violation[]
  ): void {
    for (const step of steps) {
      if (!step.name?.trim()) {
        violations.push({
          code: 'MISSING_STEP_NAME',
          message: `Step ${step.sequenceNo} is missing a name.`,
          nodeId: step.crmId,
          nodeType: 'step',
          severity: 'error',
        });
      }
    }
  }

  private checkNoTerminalOutcome(
    state: Pick<WorkflowDesignerState, 'outcomes'>,
    violations: Violation[]
  ): void {
    const hasTerminal = Object.values(state.outcomes).some((o) => o.nextStepId === null);
    if (!hasTerminal) {
      violations.push({
        code: 'NO_TERMINAL_OUTCOME',
        message: 'No outcome leads to the End node — the process can never complete.',
        severity: 'error',
      });
    }
  }

  /**
   * Replaces the old CIRCULAR_ROUTE check. A cycle is only a dead loop when
   * no member of the cycle can exit — either via a terminal outcome (→ End)
   * or via a route/outcome pointing to a step outside the cycle.
   */
  private checkDeadLoops(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'routes'>,
    violations: Violation[]
  ): void {
    const stepNextIds = this.buildStepNextMap(state);

    const visited = new Set<string>();
    const inStack = new Set<string>();
    const deadLoopIds = new Set<string>();

    const dfs = (stepId: string, stackPath: string[]): void => {
      visited.add(stepId);
      inStack.add(stepId);
      stackPath.push(stepId);

      for (const nextId of stepNextIds.get(stepId) ?? []) {
        if (nextId === null) continue; // terminal — valid exit

        if (!visited.has(nextId)) {
          dfs(nextId, stackPath);
        } else if (inStack.has(nextId)) {
          const cycleStart = stackPath.indexOf(nextId);
          const cycleMembers = stackPath.slice(cycleStart);
          const cycleSet = new Set(cycleMembers);

          const hasExit = cycleMembers.some((sid) => {
            const nexts = stepNextIds.get(sid) ?? new Set<string | null>();
            return [...nexts].some((n) => n === null || !cycleSet.has(n as string));
          });

          if (!hasExit) {
            for (const sid of cycleMembers) deadLoopIds.add(sid);
          }
        }
      }

      inStack.delete(stepId);
      stackPath.pop();
    };

    for (const stepId of Object.keys(state.steps)) {
      if (!visited.has(stepId)) dfs(stepId, []);
    }

    if (deadLoopIds.size === 0) return;

    const names = [...deadLoopIds]
      .map((id) => state.steps[id]?.name ?? id)
      .join(', ');

    violations.push({
      code: 'DEAD_LOOP',
      severity: 'error',
      message: `Dead-end loop — these steps cycle forever with no path to the End node: ${names}.`,
      nodeId: [...deadLoopIds][0],
      nodeType: 'step',
      affectedNodeIds: [...deadLoopIds],
    });
  }

  private buildStepNextMap(
    state: Pick<WorkflowDesignerState, 'outcomes' | 'routes'>
  ): Map<string, Set<string | null>> {
    const map = new Map<string, Set<string | null>>();

    for (const o of Object.values(state.outcomes)) {
      if (!map.has(o.stepId)) map.set(o.stepId, new Set());
      if (!o.applyFilter) {
        map.get(o.stepId)!.add(o.nextStepId); // null = terminal
      } else {
        const stepRoutes = Object.values(state.routes).filter((r) => r.outcomeId === o.crmId);
        for (const r of stepRoutes) {
          map.get(o.stepId)!.add(r.nextStepId);
        }
      }
    }

    return map;
  }

  private checkMissingTaskSubject(
    steps: WorkflowDesignerState['steps'][string][],
    violations: Violation[]
  ): void {
    for (const step of steps) {
      if (!step.taskSubject?.trim()) {
        violations.push({
          code: 'MISSING_TASK_SUBJECT',
          message: `Step "${step.name || `#${step.sequenceNo}`}" has no task subject — the CRM task created for this step will have a blank title.`,
          nodeId: step.crmId,
          nodeType: 'step',
          severity: 'warning',
        });
      }
    }
  }

  private checkDuplicateOutcomeNames(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'outcomeOrder'>,
    violations: Violation[]
  ): void {
    for (const stepId of Object.keys(state.steps)) {
      const outcomeIds = state.outcomeOrder[stepId] ?? [];
      const seen = new Map<string, string>();
      for (const oid of outcomeIds) {
        const name = state.outcomes[oid]?.name?.trim().toLowerCase() ?? '';
        if (!name) continue;
        if (seen.has(name)) {
          violations.push({
            code: 'DUPLICATE_OUTCOME_NAME',
            message: `Step "${state.steps[stepId]?.name}" has two outcomes both named "${state.outcomes[oid]?.name}" — outcome names must be unique within a step.`,
            nodeId: stepId,
            nodeType: 'step',
            severity: 'warning',
          });
          break;
        }
        seen.set(name, oid);
      }
    }
  }

  private checkTooManyOutcomes(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'outcomeOrder'>,
    violations: Violation[]
  ): void {
    for (const stepId of Object.keys(state.steps)) {
      const count = (state.outcomeOrder[stepId] ?? []).length;
      if (count >= ValidationService.MAX_OUTCOMES_PER_STEP) {
        violations.push({
          code: 'TOO_MANY_OUTCOMES',
          message: `Step "${state.steps[stepId]?.name}" has ${count} outcomes — consider simplifying or splitting the step.`,
          nodeId: stepId,
          nodeType: 'step',
          severity: 'warning',
        });
      }
    }
  }

  private checkMissingFallbackRoute(
    state: Pick<WorkflowDesignerState, 'steps' | 'outcomes' | 'routes'>,
    violations: Violation[]
  ): void {
    for (const outcome of Object.values(state.outcomes)) {
      if (!outcome.applyFilter) continue;
      const outcomeRoutes = Object.values(state.routes).filter((r) => r.outcomeId === outcome.crmId);
      if (outcomeRoutes.length < 2) continue; // single route — missing FetchXML caught elsewhere
      const hasFallback = outcomeRoutes.some((r) => !r.filter.trim());
      if (!hasFallback) {
        const stepName = state.steps[outcome.stepId]?.name ?? outcome.stepId;
        violations.push({
          code: 'MISSING_FALLBACK_ROUTE',
          message: `Outcome "${outcome.name}" on step "${stepName}" has ${outcomeRoutes.length} conditional routes but no fallback (else) route — records not matching any condition will be stranded.`,
          nodeId: outcome.crmId,
          nodeType: 'outcome',
          severity: 'warning',
        });
      }
    }
  }
}
