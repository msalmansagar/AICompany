import { describe, it, expect } from 'vitest';
import { validateSopForPublish } from '@/validators/sopValidator';
import { emptySlaFields } from '@/services/slaStepFields';
import type { SopDesignerState } from '@/store/sopStore';
import type { SopStep } from '@/types/SopTypes';

function makeStep(overrides: Partial<SopStep>): SopStep {
  return {
    id: 'step-1',
    name: 'Review',
    description: '',
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

// Minimal state that passes VS-02..VS-06 so a VS-07 SLA violation is isolated.
function stateWith(step: SopStep): SopDesignerState {
  return {
    stepOrder: [step.id],
    steps: { [step.id]: step },
    outcomes: {},
    outcomeOrder: {},
  } as unknown as SopDesignerState;
}

describe('validateSopForPublish — VS-07 SLA config', () => {
  it('blocks publish when a step has SLA enabled but no duration', () => {
    const step = makeStep({ slaEnabled: true, slaDurationUnit: 'Hours', slaBasis: 'TaskCreated' });
    const results = validateSopForPublish(stateWith(step));

    const vs07 = results.filter((r) => r.code === 'VS-07');
    expect(vs07).toHaveLength(1);
    expect(vs07[0].severity).toBe('error');
    expect(vs07[0].affectedNodeId).toBe(step.id);
  });

  it('passes a fully-configured SLA step', () => {
    const step = makeStep({
      slaEnabled: true, slaDuration: 8, slaDurationUnit: 'Hours', slaBasis: 'TaskCreated',
    });
    const results = validateSopForPublish(stateWith(step));

    expect(results.filter((r) => r.code === 'VS-07')).toHaveLength(0);
  });

  it('ignores SLA config on a step whose SLA is disabled', () => {
    const step = makeStep({ slaEnabled: false, slaDuration: null });
    const results = validateSopForPublish(stateWith(step));

    expect(results.filter((r) => r.code === 'VS-07')).toHaveLength(0);
  });
});
