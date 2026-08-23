import { useWorkflowStore } from '@/store/workflowStore';
import { computeEditLayout } from '@/services/EditGraphLayout';
import { emptyEscalationFields } from '@/services/escalationFields';
import { emptyAssignmentFields } from '@/services/taskAssignment';
import { emptyBranchFields, emptyOutcomeConcurrency } from '@/services/branchFields';
import { emptyWorkflowHooks, STEP_HOOKS, OUTCOME_HOOKS } from '@/services/workflowHooks';
import type { WorkflowStep, WorkflowOutcome, WorkflowProcess } from '@/types/WorkflowTypes';
import { emptyWorkflowHooks as emptyHooks, PROCESS_HOOKS } from '@/services/workflowHooks';

/**
 * The guided build the demo mode replays: a small approval process assembled
 * one narrated beat at a time, the way FlowOn's Process Orchestrator demo
 * shows its designer. Every beat is an ordinary store mutation on the open
 * draft — undoable, discardable, never saved by the demo itself.
 */
export interface DemoBeat {
  narration: string;
  /** How long the beat stays on screen before the next one runs. */
  holdMs: number;
  run(): void;
}

const DEMO_IDS = {
  submit: 'tmp_demo_step_submit',
  review: 'tmp_demo_step_review',
  approval: 'tmp_demo_step_approval',
} as const;

function demoProcess(): WorkflowProcess {
  return {
    crmId: 'tmp_demo_process',
    name: 'Demo — Loan Approval (unsaved)',
    recordEntity: '',
    recordEntityName: null,
    regardingField: '',
    parentEntity: '',
    parentEntityName: null,
    versionMajor: 1,
    versionMinor: 0,
    workflowHooks: emptyHooks(PROCESS_HOOKS),
    workflowState: 'draft',
    snapshot: null,
  } as WorkflowProcess;
}

function demoStep(crmId: string, name: string, sequenceNo: number, assigneeName: string): WorkflowStep {
  const processId = useWorkflowStore.getState().process?.crmId ?? '';
  return {
    ...emptyEscalationFields(),
    ...emptyBranchFields(),
    ...emptyAssignmentFields(),
    workflowHooks: emptyWorkflowHooks(STEP_HOOKS),
    crmId,
    name,
    sequenceNo,
    schemaName: '',
    taskSubject: name,
    taskDescription: '',
    allowBulkApproval: false,
    recordEntityId: null,
    recordEntityName: null,
    regardingFieldId: null,
    regardingFieldName: null,
    parentEntityId: null,
    parentEntityName: null,
    processId,
    assignTo: 'user',
    assignedUserId: `tmp_demo_user_${sequenceNo}`,
    assignedUserName: assigneeName,
  } as WorkflowStep;
}

function demoOutcome(
  crmId: string,
  name: string,
  sequenceNumber: number,
  stepId: string,
  nextStepId: string | null,
  applyFilter = false
): WorkflowOutcome {
  return {
    ...emptyOutcomeConcurrency(),
    workflowHooks: emptyWorkflowHooks(OUTCOME_HOOKS),
    crmId,
    name,
    sequenceNumber,
    applyFilter,
    stepId,
    nextStepId,
  } as WorkflowOutcome;
}

function relayout(): void {
  const { stepOrder, outcomes, setNodePositions } = useWorkflowStore.getState();
  setNodePositions(computeEditLayout(stepOrder, Object.values(outcomes)));
}

export function buildDemoBeats(): DemoBeat[] {
  const s = () => useWorkflowStore.getState();
  return [
    {
      narration: 'Starting a fresh demo draft — nothing is saved unless you save it.',
      holdMs: 2200,
      run: () => {
        s().loadWorkflow(demoProcess(), [], [], [], {});
      },
    },
    {
      narration: "Adding the first step: 'Submit Application', assigned to a specific user.",
      holdMs: 2400,
      run: () => {
        s().addStep(demoStep(DEMO_IDS.submit, 'Submit Application', 1, 'Dana (demo)'));
        relayout();
        s().selectNode(`step_${DEMO_IDS.submit}`);
      },
    },
    {
      narration: "Adding 'Credit Review' — the second pair of eyes.",
      holdMs: 2200,
      run: () => {
        s().addStep(demoStep(DEMO_IDS.review, 'Credit Review', 2, 'Rami (demo)'));
        relayout();
        s().selectNode(`step_${DEMO_IDS.review}`);
      },
    },
    {
      narration: "Wiring them: the 'Submit' outcome moves the case to Credit Review.",
      holdMs: 2400,
      run: () => {
        s().addOutcome(demoOutcome('tmp_demo_o_submit', 'Submit', 1, DEMO_IDS.submit, DEMO_IDS.review));
        relayout();
      },
    },
    {
      narration: "Adding 'Manager Approval' — the decision step.",
      holdMs: 2200,
      run: () => {
        s().addStep(demoStep(DEMO_IDS.approval, 'Manager Approval', 3, 'Noor (demo)'));
        relayout();
        s().selectNode(`step_${DEMO_IDS.approval}`);
      },
    },
    {
      narration: "'Approve' carries the case forward…",
      holdMs: 2200,
      run: () => {
        s().addOutcome(demoOutcome('tmp_demo_o_approve', 'Approve', 2, DEMO_IDS.review, DEMO_IDS.approval));
        relayout();
      },
    },
    {
      narration: "…and 'Request changes' loops back to the start — the dashed return path.",
      holdMs: 2600,
      run: () => {
        s().addOutcome(
          demoOutcome('tmp_demo_o_rework', 'Request changes', 3, DEMO_IDS.approval, DEMO_IDS.submit)
        );
        relayout();
      },
    },
    {
      narration: "A conditional outcome: 'Fast-track' skips review for small amounts (◈).",
      holdMs: 2600,
      run: () => {
        s().addOutcome(
          demoOutcome('tmp_demo_o_fasttrack', 'Fast-track', 4, DEMO_IDS.submit, DEMO_IDS.approval, true)
        );
        relayout();
      },
    },
    {
      narration: "'Disburse' ends the process — the card earns its Terminating badge.",
      holdMs: 2600,
      run: () => {
        s().addOutcome(demoOutcome('tmp_demo_o_disburse', 'Disburse', 5, DEMO_IDS.approval, null));
        relayout();
        s().selectNode(`step_${DEMO_IDS.approval}`);
      },
    },
    {
      narration: 'Live validation has been watching the whole time — the ◈ outcome still needs its condition.',
      holdMs: 3000,
      run: () => {
        s().selectNode('outcome_tmp_demo_o_fasttrack');
      },
    },
    {
      narration: 'Done. This draft is a sandbox — explore it, undo it beat by beat, or Discard it.',
      holdMs: 3200,
      run: () => {
        s().clearSelection();
        relayout();
      },
    },
  ];
}
