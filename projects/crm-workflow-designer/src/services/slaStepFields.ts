import type { WorkflowStep, SlaDurationUnit, EscalationAction } from '@/types/WorkflowTypes';
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

/** The Dataverse annotation that carries a lookup/option-set's display text. */
export const ODATA_FORMATTED_VALUE_ANNOTATION = '@OData.Community.Display.V1.FormattedValue';
const FMT = ODATA_FORMATTED_VALUE_ANNOTATION;

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
    escalationUserId: (raw['_qdb_escalationuser_value'] as string | null) ?? null,
    escalationUserName: (raw[`_qdb_escalationuser_value${FMT}`] as string | null) ?? null,
    escalationTeamId: (raw['_qdb_escalationteam_value'] as string | null) ?? null,
    escalationTeamName: (raw[`_qdb_escalationteam_value${FMT}`] as string | null) ?? null,
    escalationRoleId: (raw['_qdb_escalationrole_value'] as string | null) ?? null,
    escalationRoleName: (raw[`_qdb_escalationrole_value${FMT}`] as string | null) ?? null,
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
): { attribute: 'qdb_escalationuser' | 'qdb_escalationteam' | 'qdb_escalationrole'; id: string } | null {
  if (!data.slaEnabled || !data.escalationEnabled) return null;
  if (data.escalationTargetType === 'SpecificUser' && data.escalationUserId) {
    return { attribute: 'qdb_escalationuser', id: data.escalationUserId };
  }
  if (data.escalationTargetType === 'SpecificTeam' && data.escalationTeamId) {
    return { attribute: 'qdb_escalationteam', id: data.escalationTeamId };
  }
  if (data.escalationTargetType === 'Role' && data.escalationRoleId) {
    return { attribute: 'qdb_escalationrole', id: data.escalationRoleId };
  }
  return null;
}

/** OData entity-set names for the three escalation lookup targets. */
export interface EscalationLookupSets {
  user: string;
  team: string;
  role: string;
}

/**
 * Builds the `{navProp}@odata.bind` patches for the escalation lookups: binds the
 * active target and clears the other two (a Dataverse lookup can only be nulled
 * through its nav-prop bind, never its `_x_value` — see R-2). Shared by both
 * adapters; each passes its own `resolveNavProp` and entity-set names.
 */
export async function buildEscalationBindPatches(
  data: Partial<WorkflowStep>,
  resolveNavProp: (entity: string, attribute: string) => Promise<string>,
  entity: string,
  sets: EscalationLookupSets
): Promise<Record<string, string | null>> {
  if (data.slaEnabled === undefined) return {};
  const active = activeEscalationLookup(data);
  const lookups = [
    { attribute: 'qdb_escalationuser' as const, set: sets.user },
    { attribute: 'qdb_escalationteam' as const, set: sets.team },
    { attribute: 'qdb_escalationrole' as const, set: sets.role },
  ];
  const patches: Record<string, string | null> = {};
  for (const { attribute, set } of lookups) {
    const nav = await resolveNavProp(entity, attribute);
    if (!nav) continue;
    patches[`${nav}@odata.bind`] =
      active && active.attribute === attribute ? `/${set}(${active.id})` : null;
  }
  return patches;
}

const SLA_UNIT_LABELS: Record<SlaDurationUnit, string> = {
  Hours: 'Hours',
  CalendarDays: 'Calendar Days',
  BusinessDays: 'Business Days',
};

const ESCALATION_ACTION_LABELS: Record<EscalationAction, string> = {
  Reassign: 'Reassign',
  Notify: 'Notify',
  Flag: 'Flag',
  ReassignAndNotify: 'Reassign & Notify',
};

/** A short "SLA: 2 Business Days | Notify" summary for badges, or null when SLA is off. */
export function slaSummaryText(
  step: Pick<WorkflowStep, 'slaEnabled' | 'slaDuration' | 'slaDurationUnit' | 'escalationEnabled' | 'escalationAction'>
): string | null {
  if (!step.slaEnabled) return null;
  const unit = step.slaDurationUnit ? SLA_UNIT_LABELS[step.slaDurationUnit] : '';
  const sla = `SLA: ${step.slaDuration ?? '?'} ${unit}`.trim();
  if (!step.escalationEnabled || !step.escalationAction) return sla;
  return `${sla} | ${ESCALATION_ACTION_LABELS[step.escalationAction]}`;
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
  '_qdb_escalationuser_value',
  '_qdb_escalationteam_value',
  '_qdb_escalationrole_value',
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
