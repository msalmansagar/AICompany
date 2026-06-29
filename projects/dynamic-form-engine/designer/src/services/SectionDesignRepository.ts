import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { SECTION_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { SECTION_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { SectionDesign } from '@qdb/shared';
import { withRetry } from './crmRetry';

export interface UpsertSectionDesignDto {
  sectionId: string;
  cssClass?: string;
  customCss?: string;
  backgroundColor?: string;
  borderStyle?: string;
  padding?: string;
  margin?: string;
  columnLayout?: number;
  cardStyle?: string;
  collapsibleStyle?: string;
  visibilityAnimation?: string;
  headerStyleJson?: string;
}

export class SectionDesignRepository {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertSectionDesign(dto: UpsertSectionDesignDto): Promise<string> {
    const existingId = await this.findExistingSectionDesignId(dto.sectionId);
    const payload = this.buildPayload(dto);

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.SECTION_DESIGN, existingId, payload),
        'updateSectionDesign'
      );
      return existingId;
    }

    payload[SECTION_DESIGN_ATTRS.SECTION_ID] = dto.sectionId;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.SECTION_DESIGN, payload),
      'createSectionDesign'
    );
    return result.id;
  }

  // TODO(DFE-STYLE-001): filter by formDesignId once section_design adds the FK column
  async getSectionDesigns(_formDesignId: string): Promise<SectionDesign[]> {
    const select = [
      SECTION_DESIGN_ATTRS.ID, SECTION_DESIGN_ATTRS.SECTION_ID,
      SECTION_DESIGN_ATTRS.CSS_CLASS, SECTION_DESIGN_ATTRS.CUSTOM_CSS,
      SECTION_DESIGN_STYLE_ATTRS.BACKGROUND_COLOR, SECTION_DESIGN_STYLE_ATTRS.BORDER_STYLE,
      SECTION_DESIGN_STYLE_ATTRS.PADDING, SECTION_DESIGN_STYLE_ATTRS.MARGIN,
      SECTION_DESIGN_STYLE_ATTRS.COLUMN_LAYOUT, SECTION_DESIGN_STYLE_ATTRS.CARD_STYLE,
      SECTION_DESIGN_STYLE_ATTRS.COLLAPSIBLE_STYLE, SECTION_DESIGN_STYLE_ATTRS.VISIBILITY_ANIMATION,
      SECTION_DESIGN_STYLE_ATTRS.HEADER_STYLE_JSON, SECTION_DESIGN_STYLE_ATTRS.CSS_CLASS,
    ].join(',');

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.SECTION_DESIGN,
        `?$select=${select}&$filter=${SECTION_DESIGN_ATTRS.SECTION_ID} ne null`
      ),
      'getSectionDesigns'
    );

    return result.entities.map(r => this.mapRecordToSectionDesign(r));
  }

  private buildPayload(dto: UpsertSectionDesignDto): Record<string, unknown> {
    return {
      [SECTION_DESIGN_ATTRS.CSS_CLASS]: dto.cssClass ?? '',
      [SECTION_DESIGN_ATTRS.CUSTOM_CSS]: dto.customCss ?? '',
      [SECTION_DESIGN_STYLE_ATTRS.BACKGROUND_COLOR]: dto.backgroundColor ?? null,
      [SECTION_DESIGN_STYLE_ATTRS.BORDER_STYLE]: dto.borderStyle ?? null,
      [SECTION_DESIGN_STYLE_ATTRS.PADDING]: dto.padding ?? null,
      [SECTION_DESIGN_STYLE_ATTRS.MARGIN]: dto.margin ?? null,
      [SECTION_DESIGN_STYLE_ATTRS.COLUMN_LAYOUT]: dto.columnLayout ?? 1,
      [SECTION_DESIGN_STYLE_ATTRS.CARD_STYLE]: dto.cardStyle ?? 'Flat',
      [SECTION_DESIGN_STYLE_ATTRS.COLLAPSIBLE_STYLE]: dto.collapsibleStyle ?? 'None',
      [SECTION_DESIGN_STYLE_ATTRS.VISIBILITY_ANIMATION]: dto.visibilityAnimation ?? 'None',
      [SECTION_DESIGN_STYLE_ATTRS.HEADER_STYLE_JSON]: dto.headerStyleJson ?? null,
    };
  }

  private async findExistingSectionDesignId(sectionId: string): Promise<string | null> {
    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.SECTION_DESIGN,
        `?$select=${SECTION_DESIGN_ATTRS.ID}&$filter=${SECTION_DESIGN_ATTRS.SECTION_ID} eq ${sectionId}&$top=1`
      ),
      'findSectionDesign'
    );
    if (result.entities.length === 0) return null;
    return String(result.entities[0][SECTION_DESIGN_ATTRS.ID] ?? '');
  }

  private mapRecordToSectionDesign(record: Record<string, unknown>): SectionDesign {
    return {
      id: String(record[SECTION_DESIGN_ATTRS.ID] ?? ''),
      sectionId: String(record[SECTION_DESIGN_ATTRS.SECTION_ID] ?? ''),
      backgroundColor: record[SECTION_DESIGN_STYLE_ATTRS.BACKGROUND_COLOR] != null
        ? String(record[SECTION_DESIGN_STYLE_ATTRS.BACKGROUND_COLOR]) : undefined,
      borderStyle: record[SECTION_DESIGN_STYLE_ATTRS.BORDER_STYLE] != null
        ? String(record[SECTION_DESIGN_STYLE_ATTRS.BORDER_STYLE]) : undefined,
      padding: record[SECTION_DESIGN_STYLE_ATTRS.PADDING] != null
        ? String(record[SECTION_DESIGN_STYLE_ATTRS.PADDING]) : undefined,
      margin: record[SECTION_DESIGN_STYLE_ATTRS.MARGIN] != null
        ? String(record[SECTION_DESIGN_STYLE_ATTRS.MARGIN]) : undefined,
      columnLayout: (Number(record[SECTION_DESIGN_STYLE_ATTRS.COLUMN_LAYOUT] ?? 1) as 1 | 2 | 3 | 4),
      cardStyle: (record[SECTION_DESIGN_STYLE_ATTRS.CARD_STYLE] as SectionDesign['cardStyle']) ?? 'Flat',
      collapsibleStyle: (record[SECTION_DESIGN_STYLE_ATTRS.COLLAPSIBLE_STYLE] as SectionDesign['collapsibleStyle']) ?? 'None',
      visibilityAnimation: (record[SECTION_DESIGN_STYLE_ATTRS.VISIBILITY_ANIMATION] as SectionDesign['visibilityAnimation']) ?? 'None',
      isActive: true,
    };
  }
}
