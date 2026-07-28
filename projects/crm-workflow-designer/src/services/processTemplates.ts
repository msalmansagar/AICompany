import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from './workflowHooks';
// Starter templates for the "Create Process" launcher. Each template builds an
// in-memory graph (steps + outcomes + routes) using temporary ids, which the
// canvas loads and the user saves like any hand-built process. Entity bindings
// live on the process and are inherited by steps at save time, so the template
// steps start with null entity refs — mirroring App.buildInitialStep.
import type {
  WorkflowStep,
  WorkflowOutcome,
  WorkflowRoute,
} from '@/types/WorkflowTypes';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyBranchFields, emptyOutcomeConcurrency } from '@/services/branchFields';

export interface TemplateGraph {
  steps: WorkflowStep[];
  outcomes: WorkflowOutcome[];
  routes: WorkflowRoute[];
}

export interface ProcessTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  stepCount: number;
  build: (processId: string) => TemplateGraph;
}

function generateTemporaryId(): string {
  return `tmp_${crypto.randomUUID()}`;
}

function buildStep(processId: string, name: string, sequenceNo: number): WorkflowStep {
  return {
    crmId: generateTemporaryId(),
    name,
    schemaName: '',
    sequenceNo,
    taskSubject: '',
    taskDescription: '',
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    assignTo: 'user',
    assignedUserId: null,
    assignedUserName: null,
    teamId: null,
    teamName: null,
    roundRobinTeamId: null,
    roundRobinTeamName: null,
    processId,
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
  };
}

/** A branch that advances to another step — produces both the outcome (label on
 * the source step) and the route (the visible edge). */
function transition(fromStepId: string, toStepId: string, label: string, seq: number): {
  outcome: WorkflowOutcome;
  route: WorkflowRoute;
} {
  const outcome: WorkflowOutcome = { crmId: generateTemporaryId(), name: label, sequenceNumber: seq, applyFilter: false, ...emptyOutcomeConcurrency(),
      workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS), stepId: fromStepId, nextStepId: toStepId };
  const route: WorkflowRoute = { crmId: generateTemporaryId(), name: label, subject: label, sequenceNumber: seq, filter: '', outcomeId: outcome.crmId, nextStepId: toStepId };
  return { outcome, route };
}

/** A terminal branch — a labelled outcome that ends the process (no edge). */
function terminal(fromStepId: string, label: string, seq: number): WorkflowOutcome {
  return { crmId: generateTemporaryId(), name: label, sequenceNumber: seq, applyFilter: false, ...emptyOutcomeConcurrency(),
      workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS), stepId: fromStepId, nextStepId: null };
}

function graphFrom(steps: WorkflowStep[], parts: (WorkflowOutcome | { outcome: WorkflowOutcome; route: WorkflowRoute })[]): TemplateGraph {
  const outcomes: WorkflowOutcome[] = [];
  const routes: WorkflowRoute[] = [];
  for (const part of parts) {
    if ('route' in part) { outcomes.push(part.outcome); routes.push(part.route); }
    else outcomes.push(part);
  }
  return { steps, outcomes, routes };
}

function buildBlank(processId: string): TemplateGraph {
  return { steps: [buildStep(processId, 'Step 1', 1)], outcomes: [], routes: [] };
}

function buildTwoStepApproval(processId: string): TemplateGraph {
  const submit = buildStep(processId, 'Submit Request', 1);
  const approval = buildStep(processId, 'Manager Approval', 2);
  return graphFrom([submit, approval], [
    transition(submit.crmId, approval.crmId, 'Submitted', 1),
    terminal(approval.crmId, 'Approved', 1),
    transition(approval.crmId, submit.crmId, 'Rejected', 2),
  ]);
}

function buildThreeStepReview(processId: string): TemplateGraph {
  const prepare = buildStep(processId, 'Prepare', 1);
  const review = buildStep(processId, 'Review', 2);
  const approve = buildStep(processId, 'Approve', 3);
  return graphFrom([prepare, review, approve], [
    transition(prepare.crmId, review.crmId, 'Submitted', 1),
    transition(review.crmId, approve.crmId, 'Accepted', 1),
    transition(review.crmId, prepare.crmId, 'Returned', 2),
    terminal(approve.crmId, 'Approved', 1),
    transition(approve.crmId, review.crmId, 'Rejected', 2),
  ]);
}

function buildEscalationApproval(processId: string): TemplateGraph {
  const submit = buildStep(processId, 'Submit Request', 1);
  const manager = buildStep(processId, 'Manager Approval', 2);
  const senior = buildStep(processId, 'Senior Approval', 3);
  return graphFrom([submit, manager, senior], [
    transition(submit.crmId, manager.crmId, 'Submitted', 1),
    transition(manager.crmId, senior.crmId, 'Approved', 1),
    transition(manager.crmId, submit.crmId, 'Rejected', 2),
    terminal(senior.crmId, 'Approved', 1),
    transition(senior.crmId, submit.crmId, 'Rejected', 2),
  ]);
}

function buildRequestFulfillment(processId: string): TemplateGraph {
  const log = buildStep(processId, 'Log Request', 1);
  const work = buildStep(processId, 'Work Request', 2);
  const close = buildStep(processId, 'Confirm & Close', 3);
  return graphFrom([log, work, close], [
    transition(log.crmId, work.crmId, 'Assigned', 1),
    transition(work.crmId, close.crmId, 'Resolved', 1),
    terminal(close.crmId, 'Closed', 1),
  ]);
}

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    id: 'blank',
    name: 'Blank process',
    description: 'Start from scratch with a single step.',
    icon: '📄',
    stepCount: 1,
    build: buildBlank,
  },
  {
    id: 'two-step-approval',
    name: 'Two-step approval',
    description: 'Submit → Manager Approval, with an Approved / Rejected decision that loops back on reject.',
    icon: '✅',
    stepCount: 2,
    build: buildTwoStepApproval,
  },
  {
    id: 'three-step-review',
    name: 'Three-step review',
    description: 'Maker → Checker → Approver governance chain; each stage can return the item to the previous one.',
    icon: '🔎',
    stepCount: 3,
    build: buildThreeStepReview,
  },
  {
    id: 'escalation-approval',
    name: 'Two-level approval',
    description: 'Submit → Manager → Senior approval escalation; a rejection at any level returns to the submitter.',
    icon: '🏛️',
    stepCount: 3,
    build: buildEscalationApproval,
  },
  {
    id: 'request-fulfillment',
    name: 'Request fulfilment',
    description: 'Log → Work → Confirm & Close — a linear service-request flow with no approval gate.',
    icon: '🛠️',
    stepCount: 3,
    build: buildRequestFulfillment,
  },
];

export function getTemplate(id: string): ProcessTemplate | undefined {
  return PROCESS_TEMPLATES.find((t) => t.id === id);
}
