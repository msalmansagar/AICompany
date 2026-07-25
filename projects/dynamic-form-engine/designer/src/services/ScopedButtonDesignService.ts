// ScopedButtonDesignService — DFE-BTN-001 / DFE-CBTN-001 designer write path.
//
// CRUD for qdb_form_scoped_button records (tab/section scoped buttons) via the
// WebApi adapter. Immediate persistence (create/update/delete hit Dataverse
// directly), consistent with other child-entity editors in the designer.
//
// DFE-CBTN-001 adds visibleWhen / enabledWhen: ButtonConditionSet fields that
// round-trip as JSON memo columns (qdb_visible_conditions_json /
// qdb_enabled_conditions_json). Validation is enforced before every write.

import type { IWebApiAdapter, WebApiRecord } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { SCOPED_BUTTON_ATTRS, SCOPED_BUTTON_NAV, SCOPED_BUTTON_BIND_SETS } from '@/constants/buttonAttributeNames';
import type { ScopedButtonActionType, ButtonPlacementScope, ButtonConditionSet, ConditionOperator } from '@qdb/shared';

// ── Validation ─────────────────────────────────────────────────────────────────

/** Operators that produce a boolean answer without comparing against a value. */
const VALUE_FREE_OPERATORS: ReadonlySet<ConditionOperator> = new Set<ConditionOperator>(['isEmpty', 'isNotEmpty']);

export interface ConditionSetValidationError {
  message: string;
}

/**
 * Validates a ButtonConditionSet before any Dataverse write (CEO condition C-01).
 * Returns an error descriptor when invalid, null when the set is well-formed.
 */
export function validateButtonConditionSet(set: ButtonConditionSet): ConditionSetValidationError | null {
  if (set.conditions.length === 0) {
    return { message: 'A condition set must have at least one condition row.' };
  }
  for (let i = 0; i < set.conditions.length; i++) {
    const cond = set.conditions[i];
    if (!cond.fieldId || cond.fieldId.trim() === '') {
      return { message: `Condition ${i + 1}: a field is required.` };
    }
    if (!cond.operator) {
      return { message: `Condition ${i + 1}: an operator is required.` };
    }
    const requiresValue = !VALUE_FREE_OPERATORS.has(cond.operator);
    if (requiresValue) {
      const hasValue =
        cond.value !== undefined &&
        cond.value !== null &&
        cond.value !== '' &&
        !(Array.isArray(cond.value) && cond.value.length === 0);
      if (!hasValue) {
        return { message: `Condition ${i + 1}: a value is required for operator "${cond.operator}".` };
      }
    }
  }
  return null;
}

// ── Codec helpers ──────────────────────────────────────────────────────────────

function serializeConditionSet(set: ButtonConditionSet | undefined): string | undefined {
  if (set === undefined) return undefined;
  const err = validateButtonConditionSet(set);
  if (err) throw new Error(err.message);
  return JSON.stringify(set);
}

function parseConditionSet(raw: unknown): ButtonConditionSet | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  try {
    const parsed = JSON.parse(String(raw)) as ButtonConditionSet;
    // Sanity check: must have conditions array and a logic field.
    if (!Array.isArray(parsed.conditions) || (parsed.logic !== 'AND' && parsed.logic !== 'OR')) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

// ── DTOs ───────────────────────────────────────────────────────────────────────

export interface ScopedButtonRecord {
  id: string;
  label: string;
  placementScope: ButtonPlacementScope;
  displayOrder: number;
  isPrimary: boolean;
  isVisible: boolean;
  actionType: ScopedButtonActionType;
  actionConfigJson: string;
  /** DFE-CBTN-001: optional conditional visibility set. */
  visibleWhen?: ButtonConditionSet;
  /** DFE-CBTN-001: optional conditional enablement set. */
  enabledWhen?: ButtonConditionSet;
}

export interface CreateScopedButtonInput {
  formDefinitionId: string;
  placementScope: ButtonPlacementScope;
  placementId: string;
  label: string;
  displayOrder: number;
  isPrimary: boolean;
  isVisible: boolean;
  actionType: ScopedButtonActionType;
  actionConfigJson: string;
  /** DFE-CBTN-001 */
  visibleWhen?: ButtonConditionSet;
  /** DFE-CBTN-001 */
  enabledWhen?: ButtonConditionSet;
}

/**
 * Fields for a partial update. `null` for visibleWhen / enabledWhen means
 * "clear the column in Dataverse" (remove the condition set).
 */
export interface UpdateScopedButtonInput {
  label?: string;
  displayOrder?: number;
  isPrimary?: boolean;
  isVisible?: boolean;
  actionType?: ScopedButtonActionType;
  actionConfigJson?: string;
  /** DFE-CBTN-001: provide a set to save, null to clear, undefined to leave unchanged. */
  visibleWhen?: ButtonConditionSet | null;
  /** DFE-CBTN-001: provide a set to save, null to clear, undefined to leave unchanged. */
  enabledWhen?: ButtonConditionSet | null;
}

// ── Service ────────────────────────────────────────────────────────────────────

export class ScopedButtonDesignService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async listByPlacement(scope: ButtonPlacementScope, placementId: string): Promise<ScopedButtonRecord[]> {
    const valueField = scope === 'section' ? SCOPED_BUTTON_ATTRS.SECTION_VALUE : SCOPED_BUTTON_ATTRS.TAB_VALUE;
    const options = `?$filter=${valueField} eq ${placementId} and statecode eq 0&$orderby=${SCOPED_BUTTON_ATTRS.DISPLAY_ORDER} asc`;
    const result = await this.webApi.retrieveMultipleRecords(ENTITY_NAMES.FORM_SCOPED_BUTTON, options);
    return result.entities.map(mapRecord);
  }

  async create(input: CreateScopedButtonInput): Promise<string> {
    const placementNav = input.placementScope === 'section' ? SCOPED_BUTTON_NAV.SECTION : SCOPED_BUTTON_NAV.TAB;
    const placementSet = input.placementScope === 'section' ? SCOPED_BUTTON_BIND_SETS.SECTION : SCOPED_BUTTON_BIND_SETS.TAB;

    const data: WebApiRecord = {
      [SCOPED_BUTTON_ATTRS.LABEL]: input.label,
      [SCOPED_BUTTON_ATTRS.PLACEMENT_SCOPE]: input.placementScope,
      [SCOPED_BUTTON_ATTRS.DISPLAY_ORDER]: input.displayOrder,
      [SCOPED_BUTTON_ATTRS.IS_PRIMARY]: input.isPrimary,
      [SCOPED_BUTTON_ATTRS.IS_VISIBLE]: input.isVisible,
      [SCOPED_BUTTON_ATTRS.CONFIRM_REQUIRED]: false,
      [SCOPED_BUTTON_ATTRS.ACTION_TYPE]: input.actionType,
      [SCOPED_BUTTON_ATTRS.ACTION_CONFIG_JSON]: input.actionConfigJson,
      [SCOPED_BUTTON_ATTRS.IS_ACTIVE]: true,
      [`${SCOPED_BUTTON_NAV.FORM_DEFINITION}@odata.bind`]: `/${SCOPED_BUTTON_BIND_SETS.FORM_DEFINITION}(${input.formDefinitionId})`,
      [`${placementNav}@odata.bind`]: `/${placementSet}(${input.placementId})`,
    };

    const visibleJson = serializeConditionSet(input.visibleWhen);
    if (visibleJson !== undefined) {
      data[SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON] = visibleJson;
    }

    const enabledJson = serializeConditionSet(input.enabledWhen);
    if (enabledJson !== undefined) {
      data[SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON] = enabledJson;
    }

    const result = await this.webApi.createRecord(ENTITY_NAMES.FORM_SCOPED_BUTTON, data);
    return result.id;
  }

  async update(id: string, patch: UpdateScopedButtonInput): Promise<void> {
    const data: WebApiRecord = {};
    if (patch.label !== undefined) data[SCOPED_BUTTON_ATTRS.LABEL] = patch.label;
    if (patch.displayOrder !== undefined) data[SCOPED_BUTTON_ATTRS.DISPLAY_ORDER] = patch.displayOrder;
    if (patch.isPrimary !== undefined) data[SCOPED_BUTTON_ATTRS.IS_PRIMARY] = patch.isPrimary;
    if (patch.isVisible !== undefined) data[SCOPED_BUTTON_ATTRS.IS_VISIBLE] = patch.isVisible;
    if (patch.actionType !== undefined) data[SCOPED_BUTTON_ATTRS.ACTION_TYPE] = patch.actionType;
    if (patch.actionConfigJson !== undefined) data[SCOPED_BUTTON_ATTRS.ACTION_CONFIG_JSON] = patch.actionConfigJson;

    if (patch.visibleWhen !== undefined) {
      data[SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON] = patch.visibleWhen === null
        ? ''
        : serializeConditionSet(patch.visibleWhen) ?? '';
    }

    if (patch.enabledWhen !== undefined) {
      data[SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON] = patch.enabledWhen === null
        ? ''
        : serializeConditionSet(patch.enabledWhen) ?? '';
    }

    await this.webApi.updateRecord(ENTITY_NAMES.FORM_SCOPED_BUTTON, id, data);
  }

  async remove(id: string): Promise<void> {
    await this.webApi.deleteRecord(ENTITY_NAMES.FORM_SCOPED_BUTTON, id);
  }
}

// ── Private mapper ─────────────────────────────────────────────────────────────

function mapRecord(record: WebApiRecord): ScopedButtonRecord {
  return {
    id: String(record[SCOPED_BUTTON_ATTRS.ID] ?? ''),
    label: String(record[SCOPED_BUTTON_ATTRS.LABEL] ?? ''),
    placementScope: (record[SCOPED_BUTTON_ATTRS.PLACEMENT_SCOPE] as ButtonPlacementScope) ?? 'tab',
    displayOrder: Number(record[SCOPED_BUTTON_ATTRS.DISPLAY_ORDER] ?? 0),
    isPrimary: Boolean(record[SCOPED_BUTTON_ATTRS.IS_PRIMARY] ?? false),
    isVisible: Boolean(record[SCOPED_BUTTON_ATTRS.IS_VISIBLE] ?? true),
    actionType: (record[SCOPED_BUTTON_ATTRS.ACTION_TYPE] as ScopedButtonActionType) ?? 'navigate',
    actionConfigJson: String(record[SCOPED_BUTTON_ATTRS.ACTION_CONFIG_JSON] ?? '{}'),
    visibleWhen: parseConditionSet(record[SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]),
    enabledWhen: parseConditionSet(record[SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON]),
  };
}
