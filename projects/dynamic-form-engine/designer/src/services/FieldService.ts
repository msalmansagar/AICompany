import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  FORM_FIELD_ATTRS,
  FIELD_TYPE_TO_PICKLIST,
  PICKLIST_TO_FIELD_TYPE,
  COLUMN_SPAN_TO_PICKLIST,
  PICKLIST_TO_COLUMN_SPAN,
  PLACEMENT_TO_PICKLIST,
  PICKLIST_TO_PLACEMENT,
  BOOL_RENDER_STYLE_TO_PICKLIST,
  PICKLIST_TO_BOOL_RENDER_STYLE,
  INFO_CARD_STYLE_TO_PICKLIST,
  PICKLIST_TO_INFO_CARD_STYLE,
  GRID_MODE_TO_PICKLIST,
  PICKLIST_TO_GRID_MODE,
  GRID_SELECTION_MODE_TO_PICKLIST,
  PICKLIST_TO_GRID_SELECTION_MODE,
} from '@/constants/attributeNames';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { withRetry } from './crmRetry';

// DFE-INFOLIST-001: validate the info-card list style strings read from Dataverse.
function mapInfoCardListType(v: unknown): DesignerFieldModel['infoCardListType'] {
  return v === 'bullet' || v === 'numbered-arabic' || v === 'numbered-roman' ? v : null;
}
function mapInfoCardListMarker(v: unknown): DesignerFieldModel['infoCardListMarker'] {
  return v === 'circle' || v === 'plain' || v === 'none' ? v : null;
}

export interface CreateFieldDto {
  sectionId: string;
  label: string;
  code: string;
  fieldType: string;
  placeholder: string;
  helpText: string;
  isRequired: boolean;
  isReadOnly: boolean;
  isHidden?: boolean;
  defaultValue: string | null;
  sortOrder: number;
  columnSpan: 1 | 2 | 3;
  // DFE-TABZONE-001 — tab header/footer placement (tabId set for header/footer).
  placement?: 'header' | 'footer' | 'body' | null;
  tabId?: string | null;
  currencyCode?: string | null;
  decimalPlaces?: number | null;
  maxRows?: number | null;
  // Sprint 3
  componentKey?: string | null;
  // Sprint 4
  boolRenderStyle?: 'toggle' | 'radio' | null;
  trueLabel?: string | null;
  falseLabel?: string | null;
  infoCardStyle?: 'info' | 'warning' | 'success' | 'error' | null;
  infoCardTitle?: string | null;
  infoCardBody?: string | null;
  infoCardIcon?: string | null;
  infoCardListType?: 'bullet' | 'numbered-arabic' | 'numbered-roman' | null;
  infoCardListMarker?: 'circle' | 'plain' | 'none' | null;
  infoCardDownloadUrl?: string | null;
  infoCardDownloadLabel?: string | null;
  infoCardDownloadIcon?: string | null;
  fileDownloadLabel?: string | null;
  fileDownloadIcon?: string | null;
  uploadDocumentSetting?: string | null;
  downloadDocumentSetting?: string | null;
  // Prefix / suffix
  prefix?: string | null;
  suffix?: string | null;
  // DFE-FBE-001 — Label field
  staticContent?: string | null;
  sourceFieldSchemaName?: string | null;
  // Sprint 5 — grid config
  gridMode?: 'selection' | 'entry' | null;
  gridEntityName?: string | null;
  gridSelectionMode?: 'single' | 'multi' | null;
  gridMinRows?: number | null;
  gridSavedViewId?: string | null;
  gridFilterExpression?: string | null;
  gridDependsOnFieldId?: string | null;
  gridDependsOnFilterTemplate?: string | null;
  // DFE-GRIDSRC-001: grid data source + display config
  gridDataSource?: 'entity' | 'json' | null;
  gridJsonData?: string | null;
  gridDisplayMode?: 'columns' | 'infocard' | null;
  gridCardLayout?: 'grid' | 'row' | null;
  gridSelectable?: boolean | null;
  gridCardIcon?: string | null;
}

export interface UpdateFieldDto {
  label?: string;
  code?: string;
  placeholder?: string;
  helpText?: string;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isHidden?: boolean;
  defaultValue?: string | null;
  sortOrder?: number;
  columnSpan?: 1 | 2 | 3;
  // DFE-TABZONE-001 — tab header/footer placement (tabId set for header/footer).
  placement?: 'header' | 'footer' | 'body' | null;
  tabId?: string | null;
  currencyCode?: string | null;
  decimalPlaces?: number | null;
  maxRows?: number | null;
  // Sprint 3
  componentKey?: string | null;
  // Sprint 4
  boolRenderStyle?: 'toggle' | 'radio' | null;
  trueLabel?: string | null;
  falseLabel?: string | null;
  infoCardStyle?: 'info' | 'warning' | 'success' | 'error' | null;
  infoCardTitle?: string | null;
  infoCardBody?: string | null;
  infoCardIcon?: string | null;
  infoCardListType?: 'bullet' | 'numbered-arabic' | 'numbered-roman' | null;
  infoCardListMarker?: 'circle' | 'plain' | 'none' | null;
  infoCardDownloadUrl?: string | null;
  infoCardDownloadLabel?: string | null;
  infoCardDownloadIcon?: string | null;
  fileDownloadLabel?: string | null;
  fileDownloadIcon?: string | null;
  uploadDocumentSetting?: string | null;
  downloadDocumentSetting?: string | null;
  // Prefix / suffix
  prefix?: string | null;
  suffix?: string | null;
  // DFE-FBE-001 — Label field
  staticContent?: string | null;
  sourceFieldSchemaName?: string | null;
  // Sprint 5 — grid config
  gridMode?: 'selection' | 'entry' | null;
  gridEntityName?: string | null;
  gridSelectionMode?: 'single' | 'multi' | null;
  gridMinRows?: number | null;
  gridSavedViewId?: string | null;
  gridFilterExpression?: string | null;
  gridDependsOnFieldId?: string | null;
  gridDependsOnFilterTemplate?: string | null;
  // DFE-GRIDSRC-001: grid data source + display config
  gridDataSource?: 'entity' | 'json' | null;
  gridJsonData?: string | null;
  gridDisplayMode?: 'columns' | 'infocard' | null;
  gridCardLayout?: 'grid' | 'row' | null;
  gridSelectable?: boolean | null;
  gridCardIcon?: string | null;
}

export class FieldService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createField(dto: CreateFieldDto): Promise<string> {
    const fieldTypeCode = FIELD_TYPE_TO_PICKLIST[dto.fieldType] ?? FIELD_TYPE_TO_PICKLIST['text'];
    const columnSpanCode = COLUMN_SPAN_TO_PICKLIST[dto.columnSpan] ?? COLUMN_SPAN_TO_PICKLIST[1];

    const payload: Record<string, unknown> = {
      [`${FORM_FIELD_ATTRS.SECTION_ID}@odata.bind`]: `/qdb_form_sections(${dto.sectionId})`,
      [FORM_FIELD_ATTRS.LABEL]: dto.label,
      [FORM_FIELD_ATTRS.CODE]: dto.code,
      [FORM_FIELD_ATTRS.FIELD_TYPE]: fieldTypeCode,
      [FORM_FIELD_ATTRS.PLACEHOLDER]: dto.placeholder,
      [FORM_FIELD_ATTRS.HELP_TEXT]: dto.helpText,
      [FORM_FIELD_ATTRS.IS_REQUIRED]: dto.isRequired,
      [FORM_FIELD_ATTRS.IS_READ_ONLY]: dto.isReadOnly,
      [FORM_FIELD_ATTRS.IS_HIDDEN]: dto.isHidden ?? false,
      [FORM_FIELD_ATTRS.SORT_ORDER]: dto.sortOrder,
      [FORM_FIELD_ATTRS.COLUMN_SPAN]: columnSpanCode,
    };

    if (dto.placement != null) payload[FORM_FIELD_ATTRS.PLACEMENT] = PLACEMENT_TO_PICKLIST[dto.placement] ?? PLACEMENT_TO_PICKLIST.body;
    if (dto.tabId) payload[`${FORM_FIELD_ATTRS.TAB_ID}@odata.bind`] = `/qdb_form_tabs(${dto.tabId})`;
    if (dto.defaultValue != null) payload[FORM_FIELD_ATTRS.DEFAULT_VALUE] = dto.defaultValue;
    if (dto.currencyCode != null) payload[FORM_FIELD_ATTRS.CURRENCY_CODE] = dto.currencyCode;
    if (dto.decimalPlaces != null) payload[FORM_FIELD_ATTRS.DECIMAL_PLACES] = dto.decimalPlaces;
    if (dto.maxRows != null) payload[FORM_FIELD_ATTRS.MAX_ROWS] = dto.maxRows;
    if (dto.componentKey != null) payload[FORM_FIELD_ATTRS.COMPONENT_KEY] = dto.componentKey;
    if (dto.boolRenderStyle != null) payload[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE] = BOOL_RENDER_STYLE_TO_PICKLIST[dto.boolRenderStyle];
    if (dto.trueLabel != null) payload[FORM_FIELD_ATTRS.TRUE_LABEL] = dto.trueLabel;
    if (dto.falseLabel != null) payload[FORM_FIELD_ATTRS.FALSE_LABEL] = dto.falseLabel;
    if (dto.infoCardStyle != null) payload[FORM_FIELD_ATTRS.INFO_CARD_STYLE] = INFO_CARD_STYLE_TO_PICKLIST[dto.infoCardStyle];
    if (dto.infoCardTitle != null) payload[FORM_FIELD_ATTRS.INFO_CARD_TITLE] = dto.infoCardTitle;
    if (dto.infoCardBody != null) payload[FORM_FIELD_ATTRS.INFO_CARD_BODY] = dto.infoCardBody;
    if (dto.infoCardIcon != null) payload[FORM_FIELD_ATTRS.INFO_CARD_ICON] = dto.infoCardIcon;
    if (dto.infoCardListType != null) payload[FORM_FIELD_ATTRS.INFO_CARD_LIST_TYPE] = dto.infoCardListType;
    if (dto.infoCardListMarker != null) payload[FORM_FIELD_ATTRS.INFO_CARD_LIST_MARKER] = dto.infoCardListMarker;
    if (dto.infoCardDownloadUrl != null) payload[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_URL] = dto.infoCardDownloadUrl;
    if (dto.infoCardDownloadLabel != null) payload[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_LABEL] = dto.infoCardDownloadLabel;
    if (dto.infoCardDownloadIcon != null) payload[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_ICON] = dto.infoCardDownloadIcon;
    if (dto.fileDownloadLabel != null) payload[FORM_FIELD_ATTRS.FILE_DOWNLOAD_LABEL] = dto.fileDownloadLabel;
    if (dto.fileDownloadIcon != null) payload[FORM_FIELD_ATTRS.FILE_DOWNLOAD_ICON] = dto.fileDownloadIcon;
    if (dto.uploadDocumentSetting != null) payload[FORM_FIELD_ATTRS.UPLOAD_DOCUMENT_SETTING] = dto.uploadDocumentSetting;
    if (dto.downloadDocumentSetting != null) payload[FORM_FIELD_ATTRS.DOWNLOAD_DOCUMENT_SETTING] = dto.downloadDocumentSetting;
    if (dto.prefix != null) payload[FORM_FIELD_ATTRS.PREFIX] = dto.prefix;
    if (dto.suffix != null) payload[FORM_FIELD_ATTRS.SUFFIX] = dto.suffix;
    if (dto.staticContent != null) payload[FORM_FIELD_ATTRS.STATIC_CONTENT] = dto.staticContent;
    if (dto.sourceFieldSchemaName != null) payload[FORM_FIELD_ATTRS.SOURCE_FIELD_SCHEMA_NAME] = dto.sourceFieldSchemaName;
    if (dto.gridMode != null) payload[FORM_FIELD_ATTRS.GRID_MODE] = GRID_MODE_TO_PICKLIST[dto.gridMode];
    if (dto.gridEntityName != null) payload[FORM_FIELD_ATTRS.GRID_ENTITY_NAME] = dto.gridEntityName;
    if (dto.gridSelectionMode != null) payload[FORM_FIELD_ATTRS.GRID_SELECTION_MODE] = GRID_SELECTION_MODE_TO_PICKLIST[dto.gridSelectionMode];
    if (dto.gridMinRows != null) payload[FORM_FIELD_ATTRS.GRID_MIN_ROWS] = dto.gridMinRows;
    if (dto.gridSavedViewId != null) payload[FORM_FIELD_ATTRS.GRID_SAVED_VIEW_ID] = dto.gridSavedViewId;
    if (dto.gridFilterExpression != null) payload[FORM_FIELD_ATTRS.GRID_FILTER_EXPRESSION] = dto.gridFilterExpression;
    if (dto.gridDependsOnFieldId != null) payload[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_FIELD] = dto.gridDependsOnFieldId;
    if (dto.gridDependsOnFilterTemplate != null) payload[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_TEMPLATE] = dto.gridDependsOnFilterTemplate;
    if (dto.gridDataSource != null) payload[FORM_FIELD_ATTRS.GRID_DATA_SOURCE] = dto.gridDataSource;
    if (dto.gridJsonData != null) payload[FORM_FIELD_ATTRS.GRID_JSON_DATA] = dto.gridJsonData;
    if (dto.gridDisplayMode != null) payload[FORM_FIELD_ATTRS.GRID_DISPLAY_MODE] = dto.gridDisplayMode;
    if (dto.gridCardLayout != null) payload[FORM_FIELD_ATTRS.GRID_CARD_LAYOUT] = dto.gridCardLayout;
    if (dto.gridSelectable != null) payload[FORM_FIELD_ATTRS.GRID_SELECTABLE] = dto.gridSelectable;
    if (dto.gridCardIcon != null) payload[FORM_FIELD_ATTRS.GRID_CARD_ICON] = dto.gridCardIcon;

    const result = await withRetry(
      () => this.webApi.createRecord(ENTITY_NAMES.FORM_FIELD, payload),
      'createField'
    );
    return result.id;
  }

  async updateField(id: string, dto: UpdateFieldDto): Promise<void> {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data[FORM_FIELD_ATTRS.LABEL] = dto.label;
    if (dto.code !== undefined) data[FORM_FIELD_ATTRS.CODE] = dto.code;
    if (dto.placeholder !== undefined) data[FORM_FIELD_ATTRS.PLACEHOLDER] = dto.placeholder;
    if (dto.helpText !== undefined) data[FORM_FIELD_ATTRS.HELP_TEXT] = dto.helpText;
    if (dto.isRequired !== undefined) data[FORM_FIELD_ATTRS.IS_REQUIRED] = dto.isRequired;
    if (dto.isReadOnly !== undefined) data[FORM_FIELD_ATTRS.IS_READ_ONLY] = dto.isReadOnly;
    if (dto.isHidden !== undefined) data[FORM_FIELD_ATTRS.IS_HIDDEN] = dto.isHidden;
    if (dto.defaultValue !== undefined) data[FORM_FIELD_ATTRS.DEFAULT_VALUE] = dto.defaultValue;
    if (dto.sortOrder !== undefined) data[FORM_FIELD_ATTRS.SORT_ORDER] = dto.sortOrder;
    if (dto.columnSpan !== undefined) {
      data[FORM_FIELD_ATTRS.COLUMN_SPAN] = COLUMN_SPAN_TO_PICKLIST[dto.columnSpan] ?? COLUMN_SPAN_TO_PICKLIST[1];
    }
    if (dto.placement !== undefined) data[FORM_FIELD_ATTRS.PLACEMENT] = dto.placement != null ? PLACEMENT_TO_PICKLIST[dto.placement] : PLACEMENT_TO_PICKLIST.body;
    if (dto.tabId) data[`${FORM_FIELD_ATTRS.TAB_ID}@odata.bind`] = `/qdb_form_tabs(${dto.tabId})`;
    if (dto.currencyCode !== undefined) data[FORM_FIELD_ATTRS.CURRENCY_CODE] = dto.currencyCode;
    if (dto.decimalPlaces !== undefined) data[FORM_FIELD_ATTRS.DECIMAL_PLACES] = dto.decimalPlaces;
    if (dto.maxRows !== undefined) data[FORM_FIELD_ATTRS.MAX_ROWS] = dto.maxRows;
    if (dto.componentKey !== undefined) data[FORM_FIELD_ATTRS.COMPONENT_KEY] = dto.componentKey ?? null;
    if (dto.boolRenderStyle !== undefined) data[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE] = dto.boolRenderStyle != null ? BOOL_RENDER_STYLE_TO_PICKLIST[dto.boolRenderStyle] : null;
    if (dto.trueLabel !== undefined) data[FORM_FIELD_ATTRS.TRUE_LABEL] = dto.trueLabel ?? null;
    if (dto.falseLabel !== undefined) data[FORM_FIELD_ATTRS.FALSE_LABEL] = dto.falseLabel ?? null;
    if (dto.infoCardStyle !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_STYLE] = dto.infoCardStyle != null ? INFO_CARD_STYLE_TO_PICKLIST[dto.infoCardStyle] : null;
    if (dto.infoCardTitle !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_TITLE] = dto.infoCardTitle ?? null;
    if (dto.infoCardBody !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_BODY] = dto.infoCardBody ?? null;
    if (dto.infoCardIcon !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_ICON] = dto.infoCardIcon ?? null;
    if (dto.infoCardListType !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_LIST_TYPE] = dto.infoCardListType ?? null;
    if (dto.infoCardListMarker !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_LIST_MARKER] = dto.infoCardListMarker ?? null;
    if (dto.infoCardDownloadUrl !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_URL] = dto.infoCardDownloadUrl ?? null;
    if (dto.infoCardDownloadLabel !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_LABEL] = dto.infoCardDownloadLabel ?? null;
    if (dto.infoCardDownloadIcon !== undefined) data[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_ICON] = dto.infoCardDownloadIcon ?? null;
    if (dto.fileDownloadLabel !== undefined) data[FORM_FIELD_ATTRS.FILE_DOWNLOAD_LABEL] = dto.fileDownloadLabel ?? null;
    if (dto.fileDownloadIcon !== undefined) data[FORM_FIELD_ATTRS.FILE_DOWNLOAD_ICON] = dto.fileDownloadIcon ?? null;
    if (dto.uploadDocumentSetting !== undefined) data[FORM_FIELD_ATTRS.UPLOAD_DOCUMENT_SETTING] = dto.uploadDocumentSetting ?? null;
    if (dto.downloadDocumentSetting !== undefined) data[FORM_FIELD_ATTRS.DOWNLOAD_DOCUMENT_SETTING] = dto.downloadDocumentSetting ?? null;
    if (dto.prefix !== undefined) data[FORM_FIELD_ATTRS.PREFIX] = dto.prefix ?? null;
    if (dto.suffix !== undefined) data[FORM_FIELD_ATTRS.SUFFIX] = dto.suffix ?? null;
    if (dto.staticContent !== undefined) data[FORM_FIELD_ATTRS.STATIC_CONTENT] = dto.staticContent ?? null;
    if (dto.sourceFieldSchemaName !== undefined) data[FORM_FIELD_ATTRS.SOURCE_FIELD_SCHEMA_NAME] = dto.sourceFieldSchemaName ?? null;
    if (dto.gridMode !== undefined) data[FORM_FIELD_ATTRS.GRID_MODE] = dto.gridMode != null ? GRID_MODE_TO_PICKLIST[dto.gridMode] : null;
    if (dto.gridEntityName !== undefined) data[FORM_FIELD_ATTRS.GRID_ENTITY_NAME] = dto.gridEntityName ?? null;
    if (dto.gridSelectionMode !== undefined) data[FORM_FIELD_ATTRS.GRID_SELECTION_MODE] = dto.gridSelectionMode != null ? GRID_SELECTION_MODE_TO_PICKLIST[dto.gridSelectionMode] : null;
    if (dto.gridMinRows !== undefined) data[FORM_FIELD_ATTRS.GRID_MIN_ROWS] = dto.gridMinRows ?? null;
    if (dto.gridSavedViewId !== undefined) data[FORM_FIELD_ATTRS.GRID_SAVED_VIEW_ID] = dto.gridSavedViewId ?? null;
    if (dto.gridFilterExpression !== undefined) data[FORM_FIELD_ATTRS.GRID_FILTER_EXPRESSION] = dto.gridFilterExpression ?? null;
    if (dto.gridDependsOnFieldId !== undefined) data[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_FIELD] = dto.gridDependsOnFieldId ?? null;
    if (dto.gridDependsOnFilterTemplate !== undefined) data[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_TEMPLATE] = dto.gridDependsOnFilterTemplate ?? null;
    if (dto.gridDataSource !== undefined) data[FORM_FIELD_ATTRS.GRID_DATA_SOURCE] = dto.gridDataSource ?? null;
    if (dto.gridJsonData !== undefined) data[FORM_FIELD_ATTRS.GRID_JSON_DATA] = dto.gridJsonData ?? null;
    if (dto.gridDisplayMode !== undefined) data[FORM_FIELD_ATTRS.GRID_DISPLAY_MODE] = dto.gridDisplayMode ?? null;
    if (dto.gridCardLayout !== undefined) data[FORM_FIELD_ATTRS.GRID_CARD_LAYOUT] = dto.gridCardLayout ?? null;
    if (dto.gridSelectable !== undefined) data[FORM_FIELD_ATTRS.GRID_SELECTABLE] = dto.gridSelectable ?? null;
    if (dto.gridCardIcon !== undefined) data[FORM_FIELD_ATTRS.GRID_CARD_ICON] = dto.gridCardIcon ?? null;

    if (Object.keys(data).length === 0) return;

    await withRetry(
      () => this.webApi.updateRecord(ENTITY_NAMES.FORM_FIELD, id, data),
      'updateField'
    );
  }

  async deleteField(id: string): Promise<void> {
    await withRetry(
      () => this.webApi.deleteRecord(ENTITY_NAMES.FORM_FIELD, id),
      'deleteField'
    );
  }

  async listFieldsForSection(sectionId: string): Promise<DesignerFieldModel[]> {
    // Core columns — always present in Dataverse.
    const CORE_SELECT = [
      FORM_FIELD_ATTRS.ID,
      FORM_FIELD_ATTRS.SECTION_ID_VALUE,
      FORM_FIELD_ATTRS.LABEL,
      FORM_FIELD_ATTRS.CODE,
      FORM_FIELD_ATTRS.FIELD_TYPE,
      FORM_FIELD_ATTRS.PLACEHOLDER,
      FORM_FIELD_ATTRS.HELP_TEXT,
      FORM_FIELD_ATTRS.IS_REQUIRED,
      FORM_FIELD_ATTRS.IS_READ_ONLY,
      FORM_FIELD_ATTRS.IS_HIDDEN,
      FORM_FIELD_ATTRS.DEFAULT_VALUE,
      FORM_FIELD_ATTRS.SORT_ORDER,
      FORM_FIELD_ATTRS.COLUMN_SPAN,
      FORM_FIELD_ATTRS.CURRENCY_CODE,
      FORM_FIELD_ATTRS.DECIMAL_PLACES,
      FORM_FIELD_ATTRS.MAX_ROWS,
      FORM_FIELD_ATTRS.COMPONENT_KEY,
    ];

    // Extended columns added in Sprint 4/5 — only available after schema deployment.
    const EXTENDED_SELECT = [
      FORM_FIELD_ATTRS.PLACEMENT,
      FORM_FIELD_ATTRS.TAB_ID_VALUE,
      FORM_FIELD_ATTRS.BOOL_RENDER_STYLE,
      FORM_FIELD_ATTRS.TRUE_LABEL,
      FORM_FIELD_ATTRS.FALSE_LABEL,
      FORM_FIELD_ATTRS.INFO_CARD_STYLE,
      FORM_FIELD_ATTRS.INFO_CARD_TITLE,
      FORM_FIELD_ATTRS.INFO_CARD_BODY,
      FORM_FIELD_ATTRS.INFO_CARD_ICON,
      FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_URL,
      FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_LABEL,
      FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_ICON,
      FORM_FIELD_ATTRS.INFO_CARD_LIST_TYPE,
      FORM_FIELD_ATTRS.INFO_CARD_LIST_MARKER,
      FORM_FIELD_ATTRS.FILE_DOWNLOAD_LABEL,
      FORM_FIELD_ATTRS.FILE_DOWNLOAD_ICON,
      FORM_FIELD_ATTRS.UPLOAD_DOCUMENT_SETTING,
      FORM_FIELD_ATTRS.DOWNLOAD_DOCUMENT_SETTING,
      FORM_FIELD_ATTRS.PREFIX,
      FORM_FIELD_ATTRS.SUFFIX,
      FORM_FIELD_ATTRS.STATIC_CONTENT,
      FORM_FIELD_ATTRS.SOURCE_FIELD_SCHEMA_NAME,
      FORM_FIELD_ATTRS.GRID_MODE,
      FORM_FIELD_ATTRS.GRID_ENTITY_NAME,
      FORM_FIELD_ATTRS.GRID_SELECTION_MODE,
      FORM_FIELD_ATTRS.GRID_MIN_ROWS,
      FORM_FIELD_ATTRS.GRID_SAVED_VIEW_ID,
      FORM_FIELD_ATTRS.GRID_FILTER_EXPRESSION,
      FORM_FIELD_ATTRS.GRID_DEPENDS_ON_FIELD,
      FORM_FIELD_ATTRS.GRID_DEPENDS_ON_TEMPLATE,
      FORM_FIELD_ATTRS.GRID_DATA_SOURCE,
      FORM_FIELD_ATTRS.GRID_JSON_DATA,
      FORM_FIELD_ATTRS.GRID_DISPLAY_MODE,
      FORM_FIELD_ATTRS.GRID_CARD_LAYOUT,
      FORM_FIELD_ATTRS.GRID_SELECTABLE,
      FORM_FIELD_ATTRS.GRID_CARD_ICON,
    ];

    const filter = `${FORM_FIELD_ATTRS.SECTION_ID_VALUE} eq ${sectionId}`;
    const orderBy = `${FORM_FIELD_ATTRS.SORT_ORDER} asc`;

    const buildQuery = (columns: string[]) =>
      this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.FORM_FIELD,
        `?$select=${columns.join(',')}&$filter=${filter}&$orderby=${orderBy}`
      );

    let result;
    try {
      result = await withRetry(
        () => buildQuery([...CORE_SELECT, ...EXTENDED_SELECT]),
        'listFieldsForSection'
      );
    } catch {
      // Extended columns not yet deployed to this environment — fall back to core only.
      result = await withRetry(
        () => buildQuery(CORE_SELECT),
        'listFieldsForSection'
      );
    }

    return result.entities.map(record => this.mapRecordToModel(record));
  }

  private mapRecordToModel(record: Record<string, unknown>): DesignerFieldModel {
    const rawFieldType = Number(record[FORM_FIELD_ATTRS.FIELD_TYPE] ?? FIELD_TYPE_TO_PICKLIST['text']);
    const fieldType = PICKLIST_TO_FIELD_TYPE[rawFieldType] ?? 'text';

    const rawColumnSpan = Number(record[FORM_FIELD_ATTRS.COLUMN_SPAN] ?? COLUMN_SPAN_TO_PICKLIST[1]);
    const columnSpan = PICKLIST_TO_COLUMN_SPAN[rawColumnSpan] ?? 1;

    return {
      id: String(record[FORM_FIELD_ATTRS.ID] ?? ''),
      sectionId: String(record[FORM_FIELD_ATTRS.SECTION_ID_VALUE] ?? ''),
      // DFE-TABZONE-001 — placement/tab (default body; legacy records have no code).
      placement: PICKLIST_TO_PLACEMENT[Number(record[FORM_FIELD_ATTRS.PLACEMENT])] ?? 'body',
      tabId: record[FORM_FIELD_ATTRS.TAB_ID_VALUE]
        ? String(record[FORM_FIELD_ATTRS.TAB_ID_VALUE])
        : null,
      label: String(record[FORM_FIELD_ATTRS.LABEL] ?? ''),
      code: String(record[FORM_FIELD_ATTRS.CODE] ?? ''),
      fieldType,
      placeholder: String(record[FORM_FIELD_ATTRS.PLACEHOLDER] ?? ''),
      helpText: String(record[FORM_FIELD_ATTRS.HELP_TEXT] ?? ''),
      isRequired: Boolean(record[FORM_FIELD_ATTRS.IS_REQUIRED]),
      isReadOnly: Boolean(record[FORM_FIELD_ATTRS.IS_READ_ONLY]),
      isHidden: Boolean(record[FORM_FIELD_ATTRS.IS_HIDDEN]),
      defaultValue: record[FORM_FIELD_ATTRS.DEFAULT_VALUE]
        ? String(record[FORM_FIELD_ATTRS.DEFAULT_VALUE])
        : null,
      currencyCode: record[FORM_FIELD_ATTRS.CURRENCY_CODE]
        ? String(record[FORM_FIELD_ATTRS.CURRENCY_CODE])
        : null,
      decimalPlaces: record[FORM_FIELD_ATTRS.DECIMAL_PLACES] != null
        ? Number(record[FORM_FIELD_ATTRS.DECIMAL_PLACES])
        : null,
      maxRows: record[FORM_FIELD_ATTRS.MAX_ROWS] != null
        ? Number(record[FORM_FIELD_ATTRS.MAX_ROWS])
        : null,
      sortOrder: Number(record[FORM_FIELD_ATTRS.SORT_ORDER] ?? 0),
      columnSpan,
      options: [],
      lookupConfig: null,
      componentKey: record[FORM_FIELD_ATTRS.COMPONENT_KEY] != null
        ? String(record[FORM_FIELD_ATTRS.COMPONENT_KEY])
        : null,
      boolRenderStyle: record[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE] != null
        ? (PICKLIST_TO_BOOL_RENDER_STYLE[Number(record[FORM_FIELD_ATTRS.BOOL_RENDER_STYLE])] ?? null)
        : null,
      trueLabel: record[FORM_FIELD_ATTRS.TRUE_LABEL] != null ? String(record[FORM_FIELD_ATTRS.TRUE_LABEL]) : null,
      falseLabel: record[FORM_FIELD_ATTRS.FALSE_LABEL] != null ? String(record[FORM_FIELD_ATTRS.FALSE_LABEL]) : null,
      infoCardStyle: record[FORM_FIELD_ATTRS.INFO_CARD_STYLE] != null
        ? (PICKLIST_TO_INFO_CARD_STYLE[Number(record[FORM_FIELD_ATTRS.INFO_CARD_STYLE])] ?? null)
        : null,
      infoCardTitle: record[FORM_FIELD_ATTRS.INFO_CARD_TITLE] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_TITLE]) : null,
      infoCardBody: record[FORM_FIELD_ATTRS.INFO_CARD_BODY] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_BODY]) : null,
      infoCardIcon: record[FORM_FIELD_ATTRS.INFO_CARD_ICON] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_ICON]) : null,
      infoCardListType: mapInfoCardListType(record[FORM_FIELD_ATTRS.INFO_CARD_LIST_TYPE]),
      infoCardListMarker: mapInfoCardListMarker(record[FORM_FIELD_ATTRS.INFO_CARD_LIST_MARKER]),
      infoCardDownloadUrl: record[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_URL] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_URL]) : null,
      infoCardDownloadLabel: record[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_LABEL] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_LABEL]) : null,
      infoCardDownloadIcon: record[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_ICON] != null ? String(record[FORM_FIELD_ATTRS.INFO_CARD_DOWNLOAD_ICON]) : null,
      fileDownloadLabel: record[FORM_FIELD_ATTRS.FILE_DOWNLOAD_LABEL] != null ? String(record[FORM_FIELD_ATTRS.FILE_DOWNLOAD_LABEL]) : null,
      fileDownloadIcon: record[FORM_FIELD_ATTRS.FILE_DOWNLOAD_ICON] != null ? String(record[FORM_FIELD_ATTRS.FILE_DOWNLOAD_ICON]) : null,
      uploadDocumentSetting: record[FORM_FIELD_ATTRS.UPLOAD_DOCUMENT_SETTING] != null ? String(record[FORM_FIELD_ATTRS.UPLOAD_DOCUMENT_SETTING]) : null,
      downloadDocumentSetting: record[FORM_FIELD_ATTRS.DOWNLOAD_DOCUMENT_SETTING] != null ? String(record[FORM_FIELD_ATTRS.DOWNLOAD_DOCUMENT_SETTING]) : null,
      prefix: record[FORM_FIELD_ATTRS.PREFIX] != null ? String(record[FORM_FIELD_ATTRS.PREFIX]) : null,
      suffix: record[FORM_FIELD_ATTRS.SUFFIX] != null ? String(record[FORM_FIELD_ATTRS.SUFFIX]) : null,
      staticContent: record[FORM_FIELD_ATTRS.STATIC_CONTENT] != null ? String(record[FORM_FIELD_ATTRS.STATIC_CONTENT]) : null,
      sourceFieldSchemaName: record[FORM_FIELD_ATTRS.SOURCE_FIELD_SCHEMA_NAME] != null ? String(record[FORM_FIELD_ATTRS.SOURCE_FIELD_SCHEMA_NAME]) : null,
      gridMode: record[FORM_FIELD_ATTRS.GRID_MODE] != null
        ? (PICKLIST_TO_GRID_MODE[Number(record[FORM_FIELD_ATTRS.GRID_MODE])] ?? null)
        : null,
      gridEntityName: record[FORM_FIELD_ATTRS.GRID_ENTITY_NAME] != null ? String(record[FORM_FIELD_ATTRS.GRID_ENTITY_NAME]) : null,
      gridSelectionMode: record[FORM_FIELD_ATTRS.GRID_SELECTION_MODE] != null
        ? (PICKLIST_TO_GRID_SELECTION_MODE[Number(record[FORM_FIELD_ATTRS.GRID_SELECTION_MODE])] ?? null)
        : null,
      gridMinRows: record[FORM_FIELD_ATTRS.GRID_MIN_ROWS] != null ? Number(record[FORM_FIELD_ATTRS.GRID_MIN_ROWS]) : null,
      gridSavedViewId: record[FORM_FIELD_ATTRS.GRID_SAVED_VIEW_ID] != null ? String(record[FORM_FIELD_ATTRS.GRID_SAVED_VIEW_ID]) : null,
      gridFilterExpression: record[FORM_FIELD_ATTRS.GRID_FILTER_EXPRESSION] != null ? String(record[FORM_FIELD_ATTRS.GRID_FILTER_EXPRESSION]) : null,
      gridDependsOnFieldId: record[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_FIELD] != null ? String(record[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_FIELD]) : null,
      gridDependsOnFilterTemplate: record[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_TEMPLATE] != null ? String(record[FORM_FIELD_ATTRS.GRID_DEPENDS_ON_TEMPLATE]) : null,
      gridDataSource: (record[FORM_FIELD_ATTRS.GRID_DATA_SOURCE] as 'entity' | 'json' | undefined) ?? null,
      gridJsonData: record[FORM_FIELD_ATTRS.GRID_JSON_DATA] != null ? String(record[FORM_FIELD_ATTRS.GRID_JSON_DATA]) : null,
      gridDisplayMode: (record[FORM_FIELD_ATTRS.GRID_DISPLAY_MODE] as 'columns' | 'infocard' | undefined) ?? null,
      gridCardLayout: (record[FORM_FIELD_ATTRS.GRID_CARD_LAYOUT] as 'grid' | 'row' | undefined) ?? null,
      gridSelectable: record[FORM_FIELD_ATTRS.GRID_SELECTABLE] != null ? Boolean(record[FORM_FIELD_ATTRS.GRID_SELECTABLE]) : null,
      gridCardIcon: record[FORM_FIELD_ATTRS.GRID_CARD_ICON] != null ? String(record[FORM_FIELD_ATTRS.GRID_CARD_ICON]) : null,
      gridColumns: [],
    };
  }
}
