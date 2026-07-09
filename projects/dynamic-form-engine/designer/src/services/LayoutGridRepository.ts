import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { LAYOUT_GRID_ATTRS } from '@/constants/styleAttributeNames';
import type { LayoutGrid } from '@qdb/shared';
import { withRetry } from './crmRetry';

export interface UpsertLayoutGridDto {
  formDesignId: string;
  fieldId: string;
  columnsTotal: number;
  spanMobile: number;
  spanTablet: number;
  spanDesktop: number;
}

export class LayoutGridRepository {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async upsertLayoutGrid(dto: UpsertLayoutGridDto): Promise<string> {
    const existingId = await this.findExistingLayoutGridId(dto.formDesignId, dto.fieldId);
    const payload = this.buildPayload(dto);

    if (existingId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.LAYOUT_GRID, existingId, payload),
        'updateLayoutGrid'
      );
      return existingId;
    }

    payload[`${LAYOUT_GRID_ATTRS.FORM_DESIGN_ID}@odata.bind`] = `/qdb_form_designs(${dto.formDesignId})`;
    payload[`${LAYOUT_GRID_ATTRS.FORM_FIELD_ID}@odata.bind`] = `/qdb_form_fields(${dto.fieldId})`;
    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.LAYOUT_GRID, payload),
      'createLayoutGrid'
    );
    return result.id;
  }

  async getLayoutGrids(formDesignId: string): Promise<LayoutGrid[]> {
    const select = [
      LAYOUT_GRID_ATTRS.ID, LAYOUT_GRID_ATTRS.FORM_DESIGN_ID,
      LAYOUT_GRID_ATTRS.FORM_FIELD_ID, LAYOUT_GRID_ATTRS.COLUMNS_TOTAL,
      LAYOUT_GRID_ATTRS.SPAN_MOBILE, LAYOUT_GRID_ATTRS.SPAN_TABLET,
      LAYOUT_GRID_ATTRS.SPAN_DESKTOP,
    ].join(',');

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.LAYOUT_GRID,
        `?$select=${select}&$filter=${LAYOUT_GRID_ATTRS.FORM_DESIGN_ID} eq ${formDesignId}`
      ),
      'getLayoutGrids'
    );

    return result.entities.map(r => this.mapRecordToLayoutGrid(r));
  }

  private buildPayload(dto: UpsertLayoutGridDto): Record<string, unknown> {
    return {
      [LAYOUT_GRID_ATTRS.COLUMNS_TOTAL]: dto.columnsTotal,
      [LAYOUT_GRID_ATTRS.SPAN_MOBILE]: dto.spanMobile,
      [LAYOUT_GRID_ATTRS.SPAN_TABLET]: dto.spanTablet,
      [LAYOUT_GRID_ATTRS.SPAN_DESKTOP]: dto.spanDesktop,
    };
  }

  private async findExistingLayoutGridId(formDesignId: string, fieldId: string): Promise<string | null> {
    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.LAYOUT_GRID,
        `?$select=${LAYOUT_GRID_ATTRS.ID}&$filter=${LAYOUT_GRID_ATTRS.FORM_DESIGN_ID_VALUE} eq ${formDesignId} and ${LAYOUT_GRID_ATTRS.FORM_FIELD_ID_VALUE} eq ${fieldId}&$top=1`
      ),
      'findLayoutGrid'
    );
    if (result.entities.length === 0) return null;
    return String(result.entities[0][LAYOUT_GRID_ATTRS.ID] ?? '');
  }

  private mapRecordToLayoutGrid(record: Record<string, unknown>): LayoutGrid {
    return {
      id: String(record[LAYOUT_GRID_ATTRS.ID] ?? ''),
      formDesignId: String(record[LAYOUT_GRID_ATTRS.FORM_DESIGN_ID_VALUE] ?? ''),
      fieldId: String(record[LAYOUT_GRID_ATTRS.FORM_FIELD_ID_VALUE] ?? ''),
      columnsTotal: Number(record[LAYOUT_GRID_ATTRS.COLUMNS_TOTAL] ?? 12),
      spanMobile: Number(record[LAYOUT_GRID_ATTRS.SPAN_MOBILE] ?? 12),
      spanTablet: Number(record[LAYOUT_GRID_ATTRS.SPAN_TABLET] ?? 6),
      spanDesktop: Number(record[LAYOUT_GRID_ATTRS.SPAN_DESKTOP] ?? 4),
    };
  }
}
