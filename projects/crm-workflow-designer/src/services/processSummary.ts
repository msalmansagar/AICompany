import type { CrmStep, CrmOutcome, CrmRoute, CrmProcess } from '@/types/ViewTypes';
import { getAssignToLabel } from '@/types/ViewTypes';
import { conditionLabel } from '@/services/WorkflowGraphBuilder';
import { hasRealCondition } from '@/services/routeFilter';

/**
 * The whole process as text: what it contains, who does each step, what each
 * decision is, and where every route goes.
 *
 * Pure and view-model shaped so the screen only renders. The canvases answer
 * "what does this look like"; this answers "what does this actually say",
 * which is the question a reviewer, an auditor or a handover asks.
 */

export interface SummaryRoute {
  name: string;
  condition: string;
  isDefault: boolean;
  target: string;
}

export interface SummaryDecision {
  name: string;
  target: string;
  isConditional: boolean;
  isReturn: boolean;
  isTerminal: boolean;
  routes: SummaryRoute[];
}

export interface SummaryStep {
  id: string;
  sequenceNo: number;
  name: string;
  assignMode: string;
  assignee: string;
  taskSubject: string;
  taskEntity: string;
  concurrency: string | null;
  decisions: SummaryDecision[];
}

export interface ProcessSummary {
  name: string;
  taskEntity: string;
  parentEntity: string;
  regardingField: string;
  workflowState: string;
  totals: {
    steps: number;
    decisions: number;
    conditionalDecisions: number;
    routes: number;
    returnPaths: number;
    endings: number;
    unassignedSteps: number;
  };
  steps: SummaryStep[];
}

const NOT_SET = '—';

function assigneeOf(step: CrmStep): string {
  const label = getAssignToLabel(step.assignToCode);
  if (label === 'Team') return step.teamName?.trim() || 'No team selected';
  if (label === 'Round Robin') return step.roundRobinTeamName?.trim() || 'No team selected';
  if (label === 'Read From Parent') return step.parentEntityName?.trim() || 'From the parent record';
  return step.assignedUserName?.trim() || 'No user selected';
}

function isUnassigned(step: CrmStep): boolean {
  const label = getAssignToLabel(step.assignToCode);
  if (label === 'Team') return !step.teamName?.trim();
  if (label === 'Round Robin') return !step.roundRobinTeamName?.trim();
  if (label === 'Read From Parent') return false;
  return !step.assignedUserName?.trim();
}

function concurrencyOf(step: CrmStep, steps: CrmStep[]): string | null {
  const children = steps.filter((s) => s.parentStepId === step.id);
  if (step.parentStepId) {
    const parent = steps.find((s) => s.id === step.parentStepId);
    const conditional = step.applyBranchFilter ? ', when its condition is met' : '';
    return `Runs at the same time as "${parent?.name ?? step.parentStepName ?? 'another step'}"${conditional}`;
  }
  if (children.length > 0) {
    return `${children.length} step${children.length === 1 ? '' : 's'} run at the same time as this one`;
  }
  return null;
}

export function buildProcessSummary(
  process: CrmProcess,
  steps: CrmStep[],
  outcomes: CrmOutcome[],
  routes: CrmRoute[]
): ProcessSummary {
  const ordered = [...steps].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stepById = new Map(ordered.map((s) => [s.id, s]));
  const routesByOutcome = new Map<string, CrmRoute[]>();
  for (const route of routes) {
    const list = routesByOutcome.get(route.outcomeId) ?? [];
    list.push(route);
    routesByOutcome.set(route.outcomeId, list);
  }
  for (const list of routesByOutcome.values()) {
    list.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  let conditionalDecisions = 0;
  let returnPaths = 0;
  let endings = 0;

  const summarySteps: SummaryStep[] = ordered.map((step) => {
    const decisions: SummaryDecision[] = outcomes
      .filter((o) => o.stepId === step.id)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map((outcome) => {
        const target = outcome.nextStepId ? stepById.get(outcome.nextStepId) : undefined;
        const isReturn = Boolean(target && target.sequenceNo < step.sequenceNo);
        const isTerminal = !outcome.nextStepId;
        if (outcome.applyFilter) conditionalDecisions += 1;
        if (isReturn) returnPaths += 1;
        if (isTerminal) endings += 1;

        const outcomeRoutes: SummaryRoute[] = (routesByOutcome.get(outcome.id) ?? []).map((route) => ({
          name: route.name || 'Unnamed route',
          condition: hasRealCondition(route.filter) ? conditionLabel(route.filter) : 'No condition set',
          isDefault: route.isDefault,
          target: route.nextStepId
            ? stepById.get(route.nextStepId)?.name ?? 'Unknown step'
            : 'Ends the process',
        }));

        return {
          name: outcome.name || 'Unnamed decision',
          target: isTerminal ? 'Ends the process' : target?.name ?? 'Unknown step',
          isConditional: outcome.applyFilter,
          isReturn,
          isTerminal,
          routes: outcomeRoutes,
        };
      });

    return {
      id: step.id,
      sequenceNo: step.sequenceNo,
      name: step.name || 'Unnamed step',
      assignMode: getAssignToLabel(step.assignToCode),
      assignee: assigneeOf(step),
      taskSubject: step.taskSubject?.trim() || NOT_SET,
      taskEntity: step.recordEntityName?.trim() || NOT_SET,
      concurrency: concurrencyOf(step, ordered),
      decisions,
    };
  });

  return {
    name: process.name,
    taskEntity: process.recordEntityName?.trim() || NOT_SET,
    parentEntity: process.parentEntityName?.trim() || NOT_SET,
    regardingField: process.regardingFieldName?.trim() || NOT_SET,
    workflowState: process.workflowState ?? 'draft',
    totals: {
      steps: ordered.length,
      decisions: outcomes.length,
      conditionalDecisions,
      routes: routes.length,
      returnPaths,
      endings,
      unassignedSteps: ordered.filter(isUnassigned).length,
    },
    steps: summarySteps,
  };
}
