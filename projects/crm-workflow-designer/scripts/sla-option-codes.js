'use strict';

/**
 * Single source of truth for the DP-2 SLA/escalation option-set INTEGER CODES.
 *
 * Consumed by `add-sla-fields.js` (provisioning) and cross-checked against the
 * TypeScript maps in `src/types/WorkflowTypes.ts` by `slaOptionCodes.test.ts`.
 * Keeping the codes in one place removes the silent-drift / data-corruption risk
 * flagged in the DP-2 audit (SEC-01 / GA-3): if the two declarations diverge,
 * Dataverse stores an integer the runtime decodes as a different value.
 */
module.exports = {
  SLA_DURATION_UNIT: { Hours: 100000000, CalendarDays: 100000001, BusinessDays: 100000002 },
  SLA_BASIS: { TaskCreated: 100000000, TaskAssigned: 100000001, PreviousStepCompleted: 100000002 },
  ESCALATION_ACTION: { Reassign: 100000000, Notify: 100000001, Flag: 100000002, ReassignAndNotify: 100000003 },
  ESCALATION_TARGET_TYPE: { SpecificUser: 100000000, SpecificTeam: 100000001, ManagerOfAssignee: 100000002, Role: 100000003 },
};
