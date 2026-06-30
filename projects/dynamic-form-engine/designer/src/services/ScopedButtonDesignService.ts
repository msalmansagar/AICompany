// ScopedButtonDesignService — DFE-BTN-001 designer write path.
//
// CRUD for qdb_form_scoped_button records (tab/section scoped buttons) via the
// WebApi adapter. Immediate persistence (create/update/delete hit Dataverse
// directly), consistent with other child-entity editors in the designer.

import type { IWebApiAdapter, WebApiRecord } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { SCOPED_BUTTON_ATTRS, SCOPED_BUTTON_NAV, SCOPED_BUTTON_BIND_SETS } from '@/constants/buttonAttributeNames';
import type { ScopedButtonActionType, ButtonPlacementScope } from '@qdb/shared';

export interface ScopedButtonRecord {
  id: string;
  label: string;
  placementScope: ButtonPlacementScope;
  displayOrder: number;
  isPrimary: boolean;
  isVisible: boolean;
  actionType: ScopedButtonActionType;
  actionConfigJson: string;
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
}

export interface UpdateScopedButtonInput {
  label?: string;
  displayOrder?: number;
  isPrimary?: boolean;
  isVisible?: boolean;
  actionType?: ScopedButtonActionType;
  actionConfigJson?: string;
}

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
    await this.webApi.updateRecord(ENTITY_NAMES.FORM_SCOPED_BUTTON, id, data);
  }

  async remove(id: string): Promise<void> {
    await this.webApi.deleteRecord(ENTITY_NAMES.FORM_SCOPED_BUTTON, id);
  }
}

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
  };
}
