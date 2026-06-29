import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { SECTION_DESIGN_ATTRS } from '@/constants/designAttributeNames';
import { SECTION_DESIGN_STYLE_ATTRS } from '@/constants/styleAttributeNames';
import type { SectionDesign } from '@qdb/shared';
import { withRetry } from './crmRetry';
import { fromPicklist, toPicklist } from './picklistCodec';

// Org-verified Option Set codes (qdb_column_layout, qdb_card_style, qdb_collapsible_style, qdb_visibility_animation).
const COLUMN_TO_PICKLIST: Record<string, number> = { '1': 100000001, '2': 100000002, '3': 100000003, '4': 100000004 };
const CARD_TO_PICKLIST: Record<string, number> = { Flat: 100000001, Elevated: 100000002, Outlined: 100000003 };
const COLLAPSIBLE_TO_PICKLIST: Record<string, number> = { None: 100000001, Animated: 100000002, Instant: 100000003 };
const VISIBILITY_TO_PICKLIST: Record<string, number> = { None: 100000001, Fade: 100000002, Slide: 100000003 };
const PICKLIST_TO_COLUMN: Record<number, 1 | 2 | 3 | 4> = { 100000001: 1, 100000002: 2, 100000003: 3, 100000004: 4 };
const PICKLIST_TO_CARD: Record<number, SectionDesign['cardStyle']> = { 100000001: 'Flat', 100000002: 'Elevated', 100000003: 'Outlined' };
const PICKLIST_TO_COLLAPSIBLE: Record<number, SectionDesign['collapsibleStyle']> = { 100000001: 'None', 100000002: 'Animated', 100000003: 'Instant' };
const PICKLIST_TO_VISIBILITY: Record<number, SectionDesign['visibilityAnimation']> = { 100000001: 'None', 100000002: 'Fade', 100000003: 'Slide' };

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
      [SECTION_DESIGN_STYLE_ATTRS.COLUMN_LAYOUT]: toPicklist(dto.columnLayout ?? 1, COLUMN_TO_PICKLIST, 100000001),
      [SECTION_DESIGN_STYLE_ATTRS.CARD_STYLE]: toPicklist(dto.cardStyle ?? 'Flat', CARD_TO_PICKLIST, 100000001),
      [SECTION_DESIGN_STYLE_ATTRS.COLLAPSIBLE_STYLE]: toPicklist(dto.collapsibleStyle ?? 'None', COLLAPSIBLE_TO_PICKLIST, 100000001),
      [SECTION_DESIGN_STYLE_ATTRS.VISIBILITY_ANIMATION]: toPicklist(dto.visibilityAnimation ?? 'None', VISIBILITY_TO_PICKLIST, 100000001),
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
      columnLayout: fromPicklist(record[SECTION_DESIGN_STYLE_ATTRS.COLUMN_LAYOUT], PICKLIST_TO_COLUMN, 1),
      cardStyle: fromPicklist(record[SECTION_DESIGN_STYLE_ATTRS.CARD_STYLE], PICKLIST_TO_CARD, 'Flat'),
      collapsibleStyle: fromPicklist(record[SECTION_DESIGN_STYLE_ATTRS.COLLAPSIBLE_STYLE], PICKLIST_TO_COLLAPSIBLE, 'None'),
      visibilityAnimation: fromPicklist(record[SECTION_DESIGN_STYLE_ATTRS.VISIBILITY_ANIMATION], PICKLIST_TO_VISIBILITY, 'None'),
      isActive: true,
    };
  }
}
