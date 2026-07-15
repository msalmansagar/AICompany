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

export interface TemplateGraph {
  steps: WorkflowStep[];
  outcomes: WorkflowOutcome[];
  routes: WorkflowRoute[];
}

export interface ProcessTemplate {
  id: string;
  name: string;
  description: string;
  stepCount: number;
  build: (processId: string) => TemplateGraph;
}

function tmpId(): string {
  return `tmp_${crypto.randomUUID()}`;
}

function buildStep(processId: string, name: string, sequenceNo: number): WorkflowStep {
  return {
    crmId: tmpId(),
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
  };
}

function buildBlank(processId: string): TemplateGraph {
  return { steps: [buildStep(processId, 'Step 1', 1)], outcomes: [], routes: [] };
}

function buildTwoStepApproval(processId: string): TemplateGraph {
  const submit = buildStep(processId, 'Submit Request', 1);
  const approval = buildStep(processId, 'Manager Approval', 2);

  const submitted = outcome(submit.crmId, 'Submitted', 1, approval.crmId);
  const approved = outcome(approval.crmId, 'Approved', 1, null); // terminal branch
  const rejected = outcome(approval.crmId, 'Rejected', 2, submit.crmId); // loops back

  return {
    steps: [submit, approval],
    outcomes: [submitted, approved, rejected],
    // A visible edge needs a route; the terminal "Approved" branch has none.
    routes: [route(submitted.crmId, 'Submitted', 1, approval.crmId),
             route(rejected.crmId, 'Rejected', 1, submit.crmId)],
  };
}

function outcome(stepId: string, name: string, sequenceNumber: number, nextStepId: string | null): WorkflowOutcome {
  return { crmId: tmpId(), name, sequenceNumber, applyFilter: false, stepId, nextStepId };
}

function route(outcomeId: string, name: string, sequenceNumber: number, nextStepId: string): WorkflowRoute {
  return { crmId: tmpId(), name, subject: name, sequenceNumber, filter: '', outcomeId, nextStepId };
}

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    id: 'blank',
    name: 'Blank process',
    description: 'Start from scratch with a single step.',
    stepCount: 1,
    build: buildBlank,
  },
  {
    id: 'two-step-approval',
    name: 'Two-step approval',
    description: 'Submit → Manager Approval, with an Approved / Rejected decision that loops back on reject.',
    stepCount: 2,
    build: buildTwoStepApproval,
  },
];

export function getTemplate(id: string): ProcessTemplate | undefined {
  return PROCESS_TEMPLATES.find((t) => t.id === id);
}
