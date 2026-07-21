import type { WorkflowStep } from '@/types/WorkflowTypes';

/** Field key -> human-readable error message. Empty map means the config is valid. */
export type FieldErrorMap = Record<string, string>;

/** The subset of a step this validator inspects — lets callers/tests pass a slice. */
export type SlaConfigInput = Pick<
  WorkflowStep,
  | 'slaEnabled'
  | 'slaDuration'
  | 'slaDurationUnit'
  | 'slaBasis'
  | 'slaWarningPct'
  | 'escalationEnabled'
  | 'escalationAction'
  | 'escalationTargetType'
  | 'escalationUserId'
  | 'escalationTeamId'
  | 'escalationRoleId'
>;

const MESSAGES = {
  duration: 'Duration must be a positive whole number.',
  unit: 'Select a duration unit.',
  basis: 'Select when the SLA clock starts.',
  warningPct: 'Warning threshold must be between 1 and 99.',
  escalationAction: 'Select an escalation action.',
  escalationTargetType: 'Select an escalation target.',
  escalationUser: 'Select an escalation user.',
  escalationTeam: 'Select an escalation team.',
  escalationRole: 'Select an escalation role.',
  escalationWithoutSla: 'Escalation requires SLA to be enabled.',
} as const;

/**
 * Validates a step's SLA/escalation configuration. Pure — returns a map of
 * field key to error message ({} when valid). Only meaningful for the design-time
 * config; enforcement is the CWFD-005 runtime's concern.
 */
export function validateSlaConfig(step: SlaConfigInput): FieldErrorMap {
  const errors: FieldErrorMap = {};
  if (!step.slaEnabled) {
    if (step.escalationEnabled) errors.escalationEnabled = MESSAGES.escalationWithoutSla;
    return errors;
  }
  validateSlaFields(step, errors);
  validateEscalation(step, errors);
  return errors;
}

function validateSlaFields(step: SlaConfigInput, errors: FieldErrorMap): void {
  if (!isPositiveInteger(step.slaDuration)) errors.slaDuration = MESSAGES.duration;
  if (!step.slaDurationUnit) errors.slaDurationUnit = MESSAGES.unit;
  if (!step.slaBasis) errors.slaBasis = MESSAGES.basis;
  if (step.slaWarningPct !== null && !isInRange(step.slaWarningPct, 1, 99)) {
    errors.slaWarningPct = MESSAGES.warningPct;
  }
}

function validateEscalation(step: SlaConfigInput, errors: FieldErrorMap): void {
  if (!step.escalationEnabled) return;
  if (!step.escalationAction) errors.escalationAction = MESSAGES.escalationAction;
  if (!step.escalationTargetType) {
    errors.escalationTargetType = MESSAGES.escalationTargetType;
    return;
  }
  validateEscalationTarget(step, errors);
}

function validateEscalationTarget(step: SlaConfigInput, errors: FieldErrorMap): void {
  if (step.escalationTargetType === 'SpecificUser' && !step.escalationUserId) {
    errors.escalationUserId = MESSAGES.escalationUser;
  }
  if (step.escalationTargetType === 'SpecificTeam' && !step.escalationTeamId) {
    errors.escalationTeamId = MESSAGES.escalationTeam;
  }
  if (step.escalationTargetType === 'Role' && !step.escalationRoleId) {
    errors.escalationRoleId = MESSAGES.escalationRole;
  }
  // ManagerOfAssignee needs no lookup — resolved by the runtime.
}

function isPositiveInteger(value: number | null): boolean {
  return value !== null && Number.isInteger(value) && value > 0;
}

function isInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
