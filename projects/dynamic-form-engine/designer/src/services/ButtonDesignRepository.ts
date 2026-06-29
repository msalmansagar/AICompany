import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { BUTTON_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { BUTTON_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { ButtonDesign, ButtonType } from '@qdb/shared';
import { withRetry } from './crmRetry';

export interface UpsertButtonDesignDto {
  formId: string;
  buttonType: ButtonType;
  style?: string;
  label?: string;
  color?: string;
  size?: string;
  borderRadius?: string;
  alignment?: string;
  icon?: string;
  hoverEffect?: string;
  loadingStyle?: string;
}

const BUTTON_TYPE_TO_PICKLIST: Record<string, number> = {
  Submit: 100000001, SaveDraft: 100000002, Cancel: 100000003,
};
const PICKLIST_TO_BUTTON_TYPE: Record<number, ButtonType> = {
  100000001: 'Submit', 100000002: 'SaveDraft', 100000003: 'Cancel',
};

export class ButtonDesignRepository {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertButtonDesign(dto: UpsertButtonDesignDto): Promise<string> {
    const existingId = await this.findExistingButtonDesignId(dto.formId, dto.buttonType);
    const payload = this.buildPayload(dto);

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.BUTTON_DESIGN, existingId, payload),
        'updateButtonDesign'
      );
      return existingId;
    }

    payload[BUTTON_DESIGN_ATTRS.FORM_ID] = dto.formId;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.BUTTON_DESIGN, payload),
      'createButtonDesign'
    );
    return result.id;
  }

  async getButtonDesigns(formId: string): Promise<ButtonDesign[]> {
    const select = [
      BUTTON_DESIGN_ATTRS.ID, BUTTON_DESIGN_ATTRS.FORM_ID, BUTTON_DESIGN_ATTRS.BUTTON_TYPE,
      BUTTON_DESIGN_ATTRS.STYLE, BUTTON_DESIGN_ATTRS.LABEL,
      BUTTON_DESIGN_STYLE_ATTRS.COLOR, BUTTON_DESIGN_STYLE_ATTRS.SIZE,
      BUTTON_DESIGN_STYLE_ATTRS.BORDER_RADIUS, BUTTON_DESIGN_STYLE_ATTRS.ALIGNMENT,
      BUTTON_DESIGN_STYLE_ATTRS.ICON, BUTTON_DESIGN_STYLE_ATTRS.HOVER_EFFECT,
      BUTTON_DESIGN_STYLE_ATTRS.LOADING_STYLE,
    ].join(',');

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.BUTTON_DESIGN,
        `?$select=${select}&$filter=${BUTTON_DESIGN_ATTRS.FORM_ID} eq ${formId}`
      ),
      'getButtonDesigns'
    );

    return result.entities.map(r => this.mapRecordToButtonDesign(r, formId));
  }

  private buildPayload(dto: UpsertButtonDesignDto): Record<string, unknown> {
    return {
      [BUTTON_DESIGN_ATTRS.BUTTON_TYPE]: BUTTON_TYPE_TO_PICKLIST[dto.buttonType] ?? 100000001,
      [BUTTON_DESIGN_ATTRS.STYLE]: dto.style ?? null,
      [BUTTON_DESIGN_ATTRS.LABEL]: dto.label ?? null,
      [BUTTON_DESIGN_STYLE_ATTRS.COLOR]: dto.color ?? null,
      [BUTTON_DESIGN_STYLE_ATTRS.SIZE]: dto.size ?? 'Medium',
      [BUTTON_DESIGN_STYLE_ATTRS.BORDER_RADIUS]: dto.borderRadius ?? null,
      [BUTTON_DESIGN_STYLE_ATTRS.ALIGNMENT]: dto.alignment ?? 'Right',
      [BUTTON_DESIGN_STYLE_ATTRS.ICON]: dto.icon ?? null,
      [BUTTON_DESIGN_STYLE_ATTRS.HOVER_EFFECT]: dto.hoverEffect ?? 'None',
      [BUTTON_DESIGN_STYLE_ATTRS.LOADING_STYLE]: dto.loadingStyle ?? 'Spinner',
    };
  }

  private async findExistingButtonDesignId(formId: string, buttonType: ButtonType): Promise<string | null> {
    const typePicklist = BUTTON_TYPE_TO_PICKLIST[buttonType];
    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.BUTTON_DESIGN,
        `?$select=${BUTTON_DESIGN_ATTRS.ID}&$filter=${BUTTON_DESIGN_ATTRS.FORM_ID} eq ${formId} and ${BUTTON_DESIGN_ATTRS.BUTTON_TYPE} eq ${typePicklist}&$top=1`
      ),
      'findButtonDesign'
    );
    if (result.entities.length === 0) return null;
    return String(result.entities[0][BUTTON_DESIGN_ATTRS.ID] ?? '');
  }

  private mapRecordToButtonDesign(record: Record<string, unknown>, formId: string): ButtonDesign {
    const typePicklist = Number(record[BUTTON_DESIGN_ATTRS.BUTTON_TYPE] ?? 100000001);
    return {
      id: String(record[BUTTON_DESIGN_ATTRS.ID] ?? ''),
      formDefinitionId: formId,
      buttonType: PICKLIST_TO_BUTTON_TYPE[typePicklist] ?? 'Submit',
      color: record[BUTTON_DESIGN_STYLE_ATTRS.COLOR] != null
        ? String(record[BUTTON_DESIGN_STYLE_ATTRS.COLOR]) : undefined,
      size: (record[BUTTON_DESIGN_STYLE_ATTRS.SIZE] as ButtonDesign['size']) ?? 'Medium',
      borderRadius: record[BUTTON_DESIGN_STYLE_ATTRS.BORDER_RADIUS] != null
        ? String(record[BUTTON_DESIGN_STYLE_ATTRS.BORDER_RADIUS]) : undefined,
      alignment: (record[BUTTON_DESIGN_STYLE_ATTRS.ALIGNMENT] as ButtonDesign['alignment']) ?? 'Right',
      icon: record[BUTTON_DESIGN_STYLE_ATTRS.ICON] != null
        ? String(record[BUTTON_DESIGN_STYLE_ATTRS.ICON]) : undefined,
      hoverEffect: (record[BUTTON_DESIGN_STYLE_ATTRS.HOVER_EFFECT] as ButtonDesign['hoverEffect']) ?? 'None',
      loadingStyle: (record[BUTTON_DESIGN_STYLE_ATTRS.LOADING_STYLE] as ButtonDesign['loadingStyle']) ?? 'Spinner',
      isActive: true,
    };
  }
}
