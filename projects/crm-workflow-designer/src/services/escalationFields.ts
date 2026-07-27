import type { WorkflowStep, EscalationFields, EscalationConfigOption } from '@/types/WorkflowTypes';

// Escalation mapping for BOTH adapters — CWFD-005 reconciliation.
//
// `QDBCatalog.CRM.TatAndEscalations.CreateEscalationRecord` reads exactly two
// columns from a work item step:
//
//     config = step.qdb_escalation
//           ?? (step.qdb_applyescalationfilter ? resolveByCondition(...) : null)
//
// Everything else about a deadline lives on the escalation configuration record
// the step points at. This module replaces slaStepFields.ts, whose eleven
// qdb_sla_* / qdb_escalation_* columns nothing ever read.

/** The Dataverse annotation that carries a lookup's display text. */
export const ODATA_FORMATTED_VALUE_ANNOTATION = '@OData.Community.Display.V1.FormattedValue';
const FMT = ODATA_FORMATTED_VALUE_ANNOTATION;

/** Defaults for a freshly-built step: no escalation. */
export function emptyEscalationFields(): EscalationFields {
  return {
    escalationConfigId: null,
    escalationConfigName: null,
    applyEscalationFilter: false,
  };
}

/**
 * One-time copy of a step's escalation setup — used when a process is derived
 * from a SOP template, so the derived step starts with the template's policy and
 * is independently editable afterwards.
 */
export function copyEscalationFields(source: Partial<EscalationFields>): EscalationFields {
  return {
    escalationConfigId: source.escalationConfigId ?? null,
    escalationConfigName: source.escalationConfigName ?? null,
    applyEscalationFilter: source.applyEscalationFilter ?? false,
  };
}

/** Maps the escalation columns of a raw Dataverse step row. */
export function mapEscalationFields(raw: Record<string, unknown>): EscalationFields {
  return {
    escalationConfigId: (raw['_qdb_escalation_value'] as string | null) ?? null,
    escalationConfigName: (raw[`_qdb_escalation_value${FMT}`] as string | null) ?? null,
    applyEscalationFilter: (raw['qdb_applyescalationfilter'] as boolean) ?? false,
  };
}

/**
 * Scalar escalation columns for a step write. The configuration lookup is bound
 * separately, because clearing a Dataverse lookup only works through its
 * navigation property.
 */
export function buildEscalationBody(data: Partial<WorkflowStep>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data.applyEscalationFilter !== undefined) {
    body['qdb_applyescalationfilter'] = data.applyEscalationFilter;
  }
  return body;
}

/**
 * The `{navProp}@odata.bind` patch for the escalation configuration lookup:
 * binds the chosen configuration, or clears it with an explicit null.
 */
export async function buildEscalationConfigBindPatch(
  data: Partial<WorkflowStep>,
  resolveNavProp: (entity: string, attribute: string) => Promise<string>,
  entity: string,
  configSet: string
): Promise<Record<string, string | null>> {
  if (data.escalationConfigId === undefined) return {};
  const nav = await resolveNavProp(entity, 'qdb_escalation');
  if (!nav) return {};
  return {
    [`${nav}@odata.bind`]: data.escalationConfigId ? `/${configSet}(${data.escalationConfigId})` : null,
  };
}

/** True when the step escalates at all — by naming a configuration or by condition. */
export function hasEscalation(step: Partial<EscalationFields>): boolean {
  return Boolean(step.escalationConfigId) || step.applyEscalationFilter === true;
}

/**
 * A short "Escalates: Overdue Credit Review" badge, or null when the step does
 * not escalate. Naming the configuration matters more than any number, because
 * the numbers live on the configuration and are shared across every step using it.
 */
export function escalationSummaryText(step: Partial<EscalationFields>): string | null {
  if (step.escalationConfigId) {
    return `Escalates: ${step.escalationConfigName ?? 'configured'}`;
  }
  return step.applyEscalationFilter ? 'Escalates: by condition' : null;
}

/** The escalation columns to request in a getSteps `$select`. */
export const ESCALATION_SELECT_COLUMNS = [
  '_qdb_escalation_value',
  'qdb_applyescalationfilter',
].join(',');

// Dataverse names for the escalation configuration table the step points at.
// The misspelling is the platform's, not ours — the entity really is
// "coniguration". Correcting it here would simply fail to resolve.
export const ESCALATION_CONFIG_ENTITY = 'qdb_escalationconiguration';
export const ESCALATION_CONFIG_SET = 'qdb_escalationconigurations';
export const ESCALATION_CONFIG_ID = 'qdb_escalationconigurationid';

/** Escalation value units, as the engine's `EscalationValueUnit` defines them. */
const ESCALATION_VALUE_UNIT_LABELS: Record<number, string> = {
  100000000: 'Minutes',
  100000001: 'Hours',
  100000002: 'Days',
};

/** Maps an escalation configuration row to a picker option. */
export function mapEscalationConfig(raw: Record<string, unknown>): EscalationConfigOption {
  const value = raw['qdb_escalationvalue'] as number | null | undefined;
  const unitCode = raw['qdb_escalationvalueunit'] as number | null | undefined;
  const unit = typeof unitCode === 'number' ? ESCALATION_VALUE_UNIT_LABELS[unitCode] : undefined;
  return {
    id: (raw[ESCALATION_CONFIG_ID] as string) ?? '',
    name: (raw['qdb_name'] as string) ?? '',
    summary: typeof value === 'number' && unit ? `${value} ${unit}` : null,
  };
}
