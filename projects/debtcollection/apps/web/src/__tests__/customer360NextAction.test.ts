import { describe, expect, it } from 'vitest';
import type { ActionPlanItem } from '@dcp/domain';
import type { NextPlannedAction } from '../data/customerNextActions.js';
import { describeDue, describeNext } from '../views/customer360/FinancialUnitList.js';

/**
 * The next planned action, in the words an officer reads on Customer 360. The plan's due value is a
 * date or a sentence explaining there is none; only a date is shown as a due date.
 */

const planned = (due: string): NextPlannedAction =>
  ({ kind: 'planned', item: { action: 'Courtesy call', due } as ActionPlanItem, outstanding: 1 });
const UNDATED = 'Due date not configured';

describe('describeNext', () => {
  it('describeNext_datedAction_namesTheDueDate', () => {
    expect(describeNext(planned('12-Oct-2026'), 'ready')).toBe('Courtesy call · due 12-Oct-2026');
  });

  it('describeNext_undatedAction_saysNoDueDate', () => {
    expect(describeNext(planned(UNDATED), 'ready')).toBe('Courtesy call (no due date)');
  });
});

describe('describeDue', () => {
  it('describeDue_datedAction_showsTheDate', () => {
    expect(describeDue(planned('12-Oct-2026'))).toBe('12-Oct-2026');
  });

  it('describeDue_undatedAction_saysNotSetYet', () => {
    expect(describeDue(planned(UNDATED))).toBe('Not set yet');
  });

  it('describeDue_noPlan_showsADash', () => {
    expect(describeDue({ kind: 'noPlan' })).toBe('—');
  });
});
