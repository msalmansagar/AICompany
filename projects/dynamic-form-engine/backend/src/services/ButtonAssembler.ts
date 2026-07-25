// ButtonAssembler — DFE-BTN-001 Theme A (backend read path).
//
// Maps raw qdb_form_scoped_button OData records into ScopedButton domain objects
// and indexes them by their placement (tab id / section id) so the metadata
// service can embed them into the published FormDefinition. The action config is
// stored as a JSON memo on the record (ADR-BTN-001) and parsed here. Malformed or
// inactive records are dropped (and logged) rather than failing the whole form —
// a single bad button must never break form rendering.

import type {
  ScopedButton,
  ScopedButtonAction,
  ScopedButtonActionType,
  ButtonPlacementScope,
  NavigationTargetType,
  ButtonConditionSet,
} from '@qdb/shared';
import { logger } from '../utils/logger.js';

/** Logical name of the scoped-button entity (OData collection adds the trailing 's'). */
export const SCOPED_BUTTON_ENTITY = 'qdb_form_scoped_button';

/** OData read-shape of a qdb_form_scoped_button record. */
export interface RawScopedButton {
  qdb_form_scoped_buttonid: string;
  qdb_placement_scope?: string; // 'tab' | 'section'
  _qdb_tab_id_value?: string | null;
  _qdb_section_id_value?: string | null;
  _qdb_form_definition_id_value?: string | null;
  qdb_label?: string;
  qdb_display_order?: number;
  qdb_is_primary?: boolean;
  qdb_is_visible?: boolean;
  qdb_confirm_required?: boolean;
  qdb_confirm_message?: string | null;
  qdb_action_type?: string;
  qdb_action_config_json?: string | null;
  qdb_visible_conditions_json?: string | null;
  qdb_enabled_conditions_json?: string | null;
  statecode?: number;
}

const VALID_ACTION_TYPES: ReadonlySet<ScopedButtonActionType> = new Set<ScopedButtonActionType>([
  'navigate',
  'finalSubmit',
  'saveDraft',
  'callApi',
]);

const VALID_NAV_TARGETS: ReadonlySet<NavigationTargetType> = new Set<NavigationTargetType>([
  'tab',
  'section',
  'nextStep',
  'previousStep',
  'externalUrl',
  'anotherForm',
]);

/** Buttons indexed by the tab id or section id they are placed on. */
export interface IndexedButtons {
  byTabId: Map<string, ScopedButton[]>;
  bySectionId: Map<string, ScopedButton[]>;
}

export class ButtonAssembler {
  /** Maps a raw record to a ScopedButton, or null if it is inactive/invalid. */
  static mapRawButton(raw: RawScopedButton): ScopedButton | null {
    if (raw.statecode !== undefined && raw.statecode !== 0) return null;

    const scope: ButtonPlacementScope = raw.qdb_placement_scope === 'section' ? 'section' : 'tab';
    const placementId = scope === 'section' ? raw._qdb_section_id_value : raw._qdb_tab_id_value;
    if (!placementId) {
      logger.warn({ buttonId: raw.qdb_form_scoped_buttonid, scope }, 'Scoped button has no placement id — skipping');
      return null;
    }

    const action = ButtonAssembler.parseAction(raw.qdb_action_type, raw.qdb_action_config_json);
    if (!action) {
      logger.warn({ buttonId: raw.qdb_form_scoped_buttonid }, 'Scoped button has an invalid action config — skipping');
      return null;
    }

    const visibleWhen = ButtonAssembler.parseConditionSet(
      raw.qdb_visible_conditions_json ?? undefined,
      raw.qdb_form_scoped_buttonid,
      'qdb_visible_conditions_json',
    );
    const enabledWhen = ButtonAssembler.parseConditionSet(
      raw.qdb_enabled_conditions_json ?? undefined,
      raw.qdb_form_scoped_buttonid,
      'qdb_enabled_conditions_json',
    );
    return {
      id: raw.qdb_form_scoped_buttonid,
      placementScope: scope,
      placementId,
      label: raw.qdb_label ?? '',
      displayOrder: raw.qdb_display_order ?? 0,
      isPrimary: raw.qdb_is_primary ?? false,
      isVisible: raw.qdb_is_visible ?? true,
      confirmationRequired: raw.qdb_confirm_required ?? false,
      confirmationMessage: raw.qdb_confirm_message ?? undefined,
      action,
      isActive: true,
      ...(visibleWhen !== undefined && { visibleWhen }),
      ...(enabledWhen !== undefined && { enabledWhen }),
    };
  }

  /** Maps and indexes a batch of raw records by placement, preserving display order. */
  static assemble(rawButtons: RawScopedButton[]): IndexedButtons {
    const index: IndexedButtons = { byTabId: new Map(), bySectionId: new Map() };

    const buttons = rawButtons
      .map((raw) => ButtonAssembler.mapRawButton(raw))
      .filter((button): button is ScopedButton => button !== null)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    for (const button of buttons) {
      const target = button.placementScope === 'section' ? index.bySectionId : index.byTabId;
      const existing = target.get(button.placementId) ?? [];
      existing.push(button);
      target.set(button.placementId, existing);
    }
    return index;
  }

  // Parses and validates the action JSON memo into a typed action, returning null
  // for any parseable-but-malformed config (validation at the read boundary).
  private static parseAction(
    actionType: string | undefined,
    actionConfigJson: string | null | undefined,
  ): ScopedButtonAction | null {
    if (!actionType || !VALID_ACTION_TYPES.has(actionType as ScopedButtonActionType)) return null;
    if (actionType === 'saveDraft') return { type: 'saveDraft' };
    if (!actionConfigJson) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(actionConfigJson);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;

    const config = parsed as Record<string, unknown>;
    // The stored config is authoritative for shape; force type to the record's action type.
    config['type'] = actionType;
    if (actionType === 'finalSubmit' && !Array.isArray(config['extraParams'])) {
      config['extraParams'] = [];
    }
    if (!ButtonAssembler.isValidActionConfig(actionType, config)) return null;
    return config as unknown as ScopedButtonAction;
  }

  // Per-type shape validation — the required fields the renderer/backend depend on.
  private static isValidActionConfig(actionType: string, config: Record<string, unknown>): boolean {
    const isStr = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
    switch (actionType) {
      case 'navigate': {
        const target = config['target'];
        if (!isStr(target) || !VALID_NAV_TARGETS.has(target as NavigationTargetType)) return false;
        if (target === 'tab') return isStr(config['targetTabId']);
        if (target === 'section') return isStr(config['targetSectionId']);
        if (target === 'externalUrl') return isStr(config['externalUrlKey']);
        if (target === 'anotherForm') return isStr(config['targetFormCode']);
        return true; // nextStep / previousStep need no extra field
      }
      case 'finalSubmit':
        return Array.isArray(config['extraParams']);
      case 'callApi':
        return isStr(config['endpointKey']) && (config['method'] === 'GET' || config['method'] === 'POST');
      default:
        return true;
    }
  }

  // Parses and validates a ButtonConditionSet from a Dataverse Memo column JSON.
  // Returns undefined for empty/absent columns, or when the JSON is invalid/wrong-shaped,
  // so the renderer falls back to the static isVisible/isActive flag (defensive drop).
  private static parseConditionSet(
    json: string | undefined,
    buttonId: string,
    column: string,
  ): ButtonConditionSet | undefined {
    if (!json) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      logger.warn({ buttonId, column }, 'Scoped button condition set has invalid JSON — ignoring');
      return undefined;
    }
    if (!ButtonAssembler.isValidConditionSet(parsed)) {
      logger.warn({ buttonId, column }, 'Scoped button condition set has wrong shape — ignoring');
      return undefined;
    }
    return parsed;
  }

  // Type guard: validates that value conforms to ButtonConditionSet —
  // { logic: 'AND'|'OR', conditions: Array<{ fieldId: string, operator: string }> }.
  private static isValidConditionSet(value: unknown): value is ButtonConditionSet {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    if (candidate['logic'] !== 'AND' && candidate['logic'] !== 'OR') return false;
    if (!Array.isArray(candidate['conditions'])) return false;
    return (candidate['conditions'] as unknown[]).every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>)['fieldId'] === 'string' &&
        typeof (item as Record<string, unknown>)['operator'] === 'string',
    );
  }
}
