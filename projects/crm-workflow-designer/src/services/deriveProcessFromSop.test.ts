import { describe, it, expect } from 'vitest';
import { deriveProcessFromSop } from '@/services/deriveProcessFromSop';
import { emptySlaFields } from '@/services/slaStepFields';
import type { ISopAdapter } from '@/services/ISopAdapter';
import type { SopStep } from '@/types/SopTypes';
import type { SlaFields, WorkflowStep } from '@/types/WorkflowTypes';
import type { CreateProcessFromSopRequest } from '@/types/SopTypes';

// The defining promise of DP-2b: a SOP step's SLA/escalation config is snapshotted
// (copied, not linked — ADR-2b-002) onto each process step derived from it.

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
    ...emptySlaFields(),
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

function pickSla(step: SlaFields): SlaFields {
  return {
    slaEnabled: step.slaEnabled,
    slaDuration: step.slaDuration,
    slaDurationUnit: step.slaDurationUnit,
    slaBasis: step.slaBasis,
    slaWarningPct: step.slaWarningPct,
    escalationEnabled: step.escalationEnabled,
    escalationAction: step.escalationAction,
    escalationTargetType: step.escalationTargetType,
    escalationUserId: step.escalationUserId,
    escalationUserName: step.escalationUserName,
    escalationTeamId: step.escalationTeamId,
    escalationTeamName: step.escalationTeamName,
    escalationRoleId: step.escalationRoleId,
    escalationRoleName: step.escalationRoleName,
  };
}

describe('deriveProcessFromSop — SLA inheritance', () => {
  it('copies a fully-configured SLA/escalation onto the derived process step', async () => {
    const sopStep = makeSopStep({
      slaEnabled: true,
      slaDuration: 8,
      slaDurationUnit: 'Hours',
      slaBasis: 'TaskAssigned',
      slaWarningPct: 75,
      escalationEnabled: true,
      escalationAction: 'Notify',
      escalationTargetType: 'SpecificUser',
      escalationUserId: 'user-1',
      escalationUserName: 'Amina',
    });
    const { adapter, createdSteps } = makeRecordingAdapter([sopStep]);

    await deriveProcessFromSop(adapter, makeRequest([sopStep]));

    expect(createdSteps).toHaveLength(1);
    expect(pickSla(createdSteps[0])).toEqual(pickSla(sopStep));
  });

  it('propagates a disabled SLA as disabled defaults (no accidental enable)', async () => {
    const sopStep = makeSopStep({ slaEnabled: false });
    const { adapter, createdSteps } = makeRecordingAdapter([sopStep]);

    await deriveProcessFromSop(adapter, makeRequest([sopStep]));

    expect(createdSteps[0].slaEnabled).toBe(false);
    expect(createdSteps[0].slaDuration).toBeNull();
    expect(createdSteps[0].escalationEnabled).toBe(false);
    expect(pickSla(createdSteps[0])).toEqual(emptySlaFields());
  });

  it('inherits SLA per-step across a mixed SOP (some steps SLA-on, some off)', async () => {
    const withSla = makeSopStep({
      id: 'sop-step-1', sequenceNo: 1,
      slaEnabled: true, slaDuration: 3, slaDurationUnit: 'BusinessDays', slaBasis: 'TaskCreated',
    });
    const withoutSla = makeSopStep({ id: 'sop-step-2', sequenceNo: 2, name: 'Approve' });
    const { adapter, createdSteps } = makeRecordingAdapter([withSla, withoutSla]);

    await deriveProcessFromSop(adapter, makeRequest([withSla, withoutSla]));

    expect(createdSteps).toHaveLength(2);
    expect(pickSla(createdSteps[0])).toEqual(pickSla(withSla));
    expect(createdSteps[0].slaDuration).toBe(3);
    expect(pickSla(createdSteps[1])).toEqual(emptySlaFields());
  });
});
