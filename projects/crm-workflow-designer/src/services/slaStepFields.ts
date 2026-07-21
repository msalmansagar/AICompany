import type { WorkflowStep } from '@/types/WorkflowTypes';
import {
  SLA_DURATION_UNIT_CODES,
  SLA_DURATION_UNIT_FROM_CODE,
  SLA_BASIS_CODES,
  SLA_BASIS_FROM_CODE,
  ESCALATION_ACTION_CODES,
  ESCALATION_ACTION_FROM_CODE,
  ESCALATION_TARGET_TYPE_CODES,
  ESCALATION_TARGET_TYPE_FROM_CODE,
} from '@/types/WorkflowTypes';

// Shared SLA/escalation field mapping used by BOTH adapters (DataverseAdapter +
// ODataAdapter). Keeping it in one place removes the dual-adapter drift risk the
// architecture flagged (R-1): one source of truth, one set of unit tests. The
// lookup navigation-property binds stay per-adapter (they need resolveNavProp).

const FMT = '@OData.Community.Display.V1.FormattedValue';

/** The SLA/escalation slice of a WorkflowStep. */
export type SlaStepFields = Pick<
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
  | 'escalationUserName'
  | 'escalationTeamId'
  | 'escalationTeamName'
  | 'escalationRoleId'
  | 'escalationRoleName'
>;

/** Default SLA fields for a freshly-built step (SLA off, everything null). */
export function emptySlaFields(): SlaStepFields {
  return {
    slaEnabled: false,
    slaDuration: null,
    slaDurationUnit: null,
    slaBasis: null,
    slaWarningPct: null,
    escalationEnabled: false,
    escalationAction: null,
    escalationTargetType: null,
    escalationUserId: null,
    escalationUserName: null,
    escalationTeamId: null,
    escalationTeamName: null,
    escalationRoleId: null,
    escalationRoleName: null,
  };
}

/** Maps the SLA/escalation columns of a raw Dataverse step row to typed fields. */
export function mapSlaFields(raw: Record<string, unknown>): SlaStepFields {
  return {
    slaEnabled: (raw['qdb_sla_enabled'] as boolean) ?? false,
    slaDuration: (raw['qdb_sla_duration'] as number | null) ?? null,
    slaDurationUnit: fromCode(SLA_DURATION_UNIT_FROM_CODE, raw['qdb_sla_duration_unit']),
    slaBasis: fromCode(SLA_BASIS_FROM_CODE, raw['qdb_sla_basis']),
    slaWarningPct: (raw['qdb_sla_warning_pct'] as number | null) ?? null,
    escalationEnabled: (raw['qdb_escalation_enabled'] as boolean) ?? false,
    escalationAction: fromCode(ESCALATION_ACTION_FROM_CODE, raw['qdb_escalation_action']),
    escalationTargetType: fromCode(ESCALATION_TARGET_TYPE_FROM_CODE, raw['qdb_escalation_target_type']),
    escalationUserId: (raw['_qdb_escalation_user_value'] as string | null) ?? null,
    escalationUserName: (raw[`_qdb_escalation_user_value${FMT}`] as string | null) ?? null,
    escalationTeamId: (raw['_qdb_escalation_team_value'] as string | null) ?? null,
    escalationTeamName: (raw[`_qdb_escalation_team_value${FMT}`] as string | null) ?? null,
    escalationRoleId: (raw['_qdb_escalation_role_value'] as string | null) ?? null,
    escalationRoleName: (raw[`_qdb_escalation_role_value${FMT}`] as string | null) ?? null,
  };
}

/**
 * Builds the scalar + option-set SLA columns for a step write body. When SLA is
 * disabled, writes explicit nulls to clear any previously-persisted config.
 * Returns `{}` when the write does not touch SLA at all (slaEnabled undefined).
 * The three escalation lookups are bound separately by each adapter's resolved
 * builder (they need navigation-property resolution).
 */
export function buildSlaBody(data: Partial<WorkflowStep>): Record<string, unknown> {
  if (data.slaEnabled === undefined) return {};
  if (!data.slaEnabled) return clearedSlaBody();

  const body: Record<string, unknown> = {
    qdb_sla_enabled: true,
    qdb_sla_warning_pct: data.slaWarningPct ?? null,
    qdb_escalation_enabled: data.escalationEnabled ?? false,
  };
  if (data.slaDuration !== undefined) body['qdb_sla_duration'] = data.slaDuration;
  if (data.slaDurationUnit) body['qdb_sla_duration_unit'] = SLA_DURATION_UNIT_CODES[data.slaDurationUnit];
  if (data.slaBasis) body['qdb_sla_basis'] = SLA_BASIS_CODES[data.slaBasis];
  if (data.escalationEnabled) {
    if (data.escalationAction) body['qdb_escalation_action'] = ESCALATION_ACTION_CODES[data.escalationAction];
    if (data.escalationTargetType) body['qdb_escalation_target_type'] = ESCALATION_TARGET_TYPE_CODES[data.escalationTargetType];
  } else {
    body['qdb_escalation_action'] = null;
    body['qdb_escalation_target_type'] = null;
  }
  return body;
}

/** Which escalation lookup (if any) is active for the given target type. */
export function activeEscalationLookup(
  data: Partial<WorkflowStep>
): { attribute: 'qdb_escalation_user' | 'qdb_escalation_team' | 'qdb_escalation_role'; id: string } | null {
  if (!data.slaEnabled || !data.escalationEnabled) return null;
  if (data.escalationTargetType === 'SpecificUser' && data.escalationUserId) {
    return { attribute: 'qdb_escalation_user', id: data.escalationUserId };
  }
  if (data.escalationTargetType === 'SpecificTeam' && data.escalationTeamId) {
    return { attribute: 'qdb_escalation_team', id: data.escalationTeamId };
  }
  if (data.escalationTargetType === 'Role' && data.escalationRoleId) {
    return { attribute: 'qdb_escalation_role', id: data.escalationRoleId };
  }
  return null;
}

/** The SLA/escalation columns to request in a getSteps `$select`. */
export const SLA_SELECT_COLUMNS = [
  'qdb_sla_enabled',
  'qdb_sla_duration',
  'qdb_sla_duration_unit',
  'qdb_sla_basis',
  'qdb_sla_warning_pct',
  'qdb_escalation_enabled',
  'qdb_escalation_action',
  'qdb_escalation_target_type',
  '_qdb_escalation_user_value',
  '_qdb_escalation_team_value',
  '_qdb_escalation_role_value',
].join(',');

function clearedSlaBody(): Record<string, unknown> {
  return {
    qdb_sla_enabled: false,
    qdb_sla_duration: null,
    qdb_sla_duration_unit: null,
    qdb_sla_basis: null,
    qdb_sla_warning_pct: null,
    qdb_escalation_enabled: false,
    qdb_escalation_action: null,
    qdb_escalation_target_type: null,
  };
}

function fromCode<T extends string>(map: Record<number, T>, raw: unknown): T | null {
  return typeof raw === 'number' ? map[raw] ?? null : null;
}
