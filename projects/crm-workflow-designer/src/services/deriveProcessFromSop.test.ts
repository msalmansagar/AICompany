import { describe, it, expect } from 'vitest';
import { deriveProcessFromSop } from '@/services/deriveProcessFromSop';
import { emptyEscalationFields } from '@/services/escalationFields';
import type { ISopAdapter } from '@/services/ISopAdapter';
import type { SopStep } from '@/types/SopTypes';
import type { EscalationFields, WorkflowStep } from '@/types/WorkflowTypes';
import type { CreateProcessFromSopRequest } from '@/types/SopTypes';

// The defining promise of DP-2b, re-based by CWFD-005: a SOP step's escalation
// policy is snapshotted (copied, not linked — ADR-2b-002) onto each derived step.

function makeSopStep(overrides: Partial<SopStep>): SopStep {
  return {
    id: 'sop-step-1',
    name: 'Review',
    description: 'Review the request',
    sequenceNo: 1,
    sopId: 'sop-1',
    roleId: null,
    roleName: null,
    roleStatus: null,
    stepType: 'step',
    executionChannel: null,
    decisionLabel: null,
    ...emptyEscalationFields(),
    ...overrides,
  };
}

/** Records every createStep payload so tests can assert what the process step inherited. */
function makeRecordingAdapter(sopSteps: SopStep[]): {
  adapter: ISopAdapter;
  createdSteps: Array<Omit<WorkflowStep, 'crmId'>>;
} {
  const createdSteps: Array<Omit<WorkflowStep, 'crmId'>> = [];
  const adapter = {
    getSopSteps: async () => sopSteps,
    getSopOutcomes: async () => [],
    createProcess: async () => 'process-1',
    createStep: async (data: Omit<WorkflowStep, 'crmId'>) => {
      createdSteps.push(data);
      return `wf-${createdSteps.length}`;
    },
    createOutcome: async () => 'outcome-1',
    createRoute: async () => 'route-1',
  } as unknown as ISopAdapter;
  return { adapter, createdSteps };
}

function makeRequest(sopSteps: SopStep[]): CreateProcessFromSopRequest {
  return {
    sopId: 'sop-1',
    processName: 'Derived process',
    processDescription: '',
    taskEntity: 'qdb_task',
    regardingField: 'qdb_regarding',
    parentEntity: 'qdb_parent',
    stepAssignments: sopSteps.map((s) => ({
      sopStepId: s.id,
      taskSubject: s.name,
      assignToType: null,
      enableRoundRobin: false,
    })),
  };
}

function pickEscalation(step: EscalationFields): EscalationFields {
  return {
    escalationConfigId: step.escalationConfigId,
    escalationConfigName: step.escalationConfigName,
    applyEscalationFilter: step.applyEscalationFilter,
  };
}

describe('deriveProcessFromSop — escalation inheritance', () => {
  it('copies a named escalation policy onto the derived process step', async () => {
    const sopStep = makeSopStep({
      escalationConfigId: 'config-1',
      escalationConfigName: 'Overdue Credit Review',
    });
    const { adapter, createdSteps } = makeRecordingAdapter([sopStep]);

    await deriveProcessFromSop(adapter, makeRequest([sopStep]));

    expect(createdSteps).toHaveLength(1);
    expect(pickEscalation(createdSteps[0])).toEqual(pickEscalation(sopStep));
  });

  it('copies a by-condition policy without inventing a named one', async () => {
    const sopStep = makeSopStep({ applyEscalationFilter: true });
    const { adapter, createdSteps } = makeRecordingAdapter([sopStep]);

    await deriveProcessFromSop(adapter, makeRequest([sopStep]));

    expect(createdSteps[0].applyEscalationFilter).toBe(true);
    expect(createdSteps[0].escalationConfigId).toBeNull();
  });

  it('propagates a non-escalating step as defaults, never accidentally enabling one', async () => {
    const sopStep = makeSopStep({});
    const { adapter, createdSteps } = makeRecordingAdapter([sopStep]);

    await deriveProcessFromSop(adapter, makeRequest([sopStep]));

    expect(pickEscalation(createdSteps[0])).toEqual(emptyEscalationFields());
  });

  it('inherits escalation per-step across a mixed SOP', async () => {
    const escalating = makeSopStep({
      id: 'sop-step-1',
      sequenceNo: 1,
      escalationConfigId: 'config-1',
      escalationConfigName: 'Overdue Credit Review',
    });
    const plain = makeSopStep({ id: 'sop-step-2', sequenceNo: 2, name: 'Approve' });
    const { adapter, createdSteps } = makeRecordingAdapter([escalating, plain]);

    await deriveProcessFromSop(adapter, makeRequest([escalating, plain]));

    expect(createdSteps).toHaveLength(2);
    expect(createdSteps[0].escalationConfigId).toBe('config-1');
    expect(pickEscalation(createdSteps[1])).toEqual(emptyEscalationFields());
  });
});
