import type {
  DesignPayload,
  ThemeDefinition,
  FormDesign,
  SectionDesign,
  FieldDesign,
  ButtonDesign,
  ButtonType,
  LayoutGrid,
} from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';
import {
  FORM_HIERARCHY_ATTRS,
  THEME_ATTRS,
  FORM_DESIGN_ATTRS,
  SECTION_DESIGN_ATTRS,
  FIELD_DESIGN_ATTRS,
  BUTTON_DESIGN_ATTRS,
  LAYOUT_GRID_ATTRS,
} from '../constants/styleAttributeNames.js';
import type { CrmAuthService } from './CrmAuthService.js';
import {
  mapTheme,
  mapFormDesign,
  mapSectionDesign,
  mapFieldDesign,
  mapButtonDesign,
  mapLayoutGrid,
  mapButtonType,
  type RawFormDesign,
  type RawSectionDesign,
  type RawFieldDesign,
  type RawButtonDesign,
  type RawLayoutGrid,
  type RawTheme,
} from './DesignPicklistMappers.js';

const DESIGN_PAYLOAD_SIZE_CAP = 512 * 1024;
const THEME_EXPAND_NAVIGATION_PROPERTY = 'qdb_theme_id';

const THEME_SELECT = Object.values(THEME_ATTRS).join(',');
const FORM_DESIGN_SELECT = Object.values(FORM_DESIGN_ATTRS).join(',');
const SECTION_DESIGN_SELECT = Object.values(SECTION_DESIGN_ATTRS).join(',');
const FIELD_DESIGN_SELECT = Object.values(FIELD_DESIGN_ATTRS).join(',');
const BUTTON_DESIGN_SELECT = Object.values(BUTTON_DESIGN_ATTRS).join(',');
const LAYOUT_GRID_SELECT = Object.values(LAYOUT_GRID_ATTRS).join(',');

const DEFAULT_LIGHT_THEME: ThemeDefinition = {
  id: 'default-light',
  themeCode: 'light',
  themeName: 'Default Light',
  primaryColor: '#0078d4',
  backgroundColor: '#ffffff',
  surfaceColor: '#f5f5f5',
  textPrimaryColor: '#242424',
  textSecondaryColor: '#616161',
  borderColor: '#d1d1d1',
  errorColor: '#d13438',
  successColor: '#107c10',
  warningColor: '#ca5010',
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  baseFontSize: '14px',
  borderRadius: '4px',
  shadowStyle: 'Subtle',
  spacingScale: 'Normal',
  isDarkMode: false,
  isActive: true,
};

const DEFAULT_FORM_DESIGN: FormDesign = {
  id: 'default',
  layoutType: 'SingleColumn',
  labelPosition: 'Top',
  sectionStyle: 'Card',
  tabStyle: 'Tabs',
  buttonStyle: 'Primary',
  animationEnabled: true,
  alignment: 'Left',
  stickyActionBar: false,
  skeletonLoaderEnabled: true,
  isActive: true,
};

export const DEFAULT_DESIGN_PAYLOAD: DesignPayload = {
  theme: DEFAULT_LIGHT_THEME,
  formDesign: DEFAULT_FORM_DESIGN,
  sectionDesigns: {},
  fieldDesigns: {},
  buttonDesigns: { Submit: undefined, SaveDraft: undefined, Cancel: undefined },
  layoutGrid: [],
};

interface ODataCollection<T> {
  value: T[];
}

export class DesignAssembler extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async assembleDesignPayload(formDefinitionId: string): Promise<DesignPayload> {
    // Defense-in-depth: the id is interpolated into OData $filter strings, so reject
    // anything that is not a GUID before it reaches a query (SEC-10).
    if (!GUID_PATTERN.test(formDefinitionId)) {
      throw new InvalidFormDefinitionIdError(formDefinitionId);
    }
    const rawFormDesign = await this.fetchFormDesignWithTheme(formDefinitionId);
    if (!rawFormDesign) {
      logger.debug({ formDefinitionId }, 'No form design in Dataverse — returning DEFAULT_DESIGN_PAYLOAD');
      return { ...DEFAULT_DESIGN_PAYLOAD };
    }

    const formDesign = mapFormDesign(rawFormDesign);
    const theme = rawFormDesign.qdb_theme_id
      ? mapTheme(rawFormDesign.qdb_theme_id)
      : DEFAULT_LIGHT_THEME;

    const { sectionIds, fieldIds } = await this.resolveFormHierarchyIds(formDefinitionId);

    const [sectionResults, fieldResults, buttonResults, gridResults] = await Promise.allSettled([
      this.fetchSectionDesigns(sectionIds),
      this.fetchFieldDesigns(fieldIds),
      this.fetchButtonDesigns(formDefinitionId),
      this.fetchLayoutGrid(rawFormDesign.qdb_form_designid),
    ]);

    const payload: DesignPayload = {
      theme,
      formDesign,
      sectionDesigns: this.extractOrDefault(sectionResults, {}, 'sectionDesigns', formDefinitionId),
      fieldDesigns: this.extractOrDefault(fieldResults, {}, 'fieldDesigns', formDefinitionId),
      buttonDesigns: this.extractOrDefault(
        buttonResults,
        buildEmptyButtonDesigns(),
        'buttonDesigns',
        formDefinitionId,
      ),
      layoutGrid: this.extractOrDefault(gridResults, [], 'layoutGrid', formDefinitionId),
    };

    enforcePayloadSizeCap(payload, formDefinitionId);
    return payload;
  }

  private async fetchFormDesignWithTheme(
    formDefinitionId: string,
  ): Promise<RawFormDesign | undefined> {
    const response = await this.crmFetch<ODataCollection<RawFormDesign>>(
      `/qdb_form_designs?$select=${FORM_DESIGN_SELECT}` +
      `&$expand=${THEME_EXPAND_NAVIGATION_PROPERTY}($select=${THEME_SELECT})` +
      `&$filter=${FORM_DESIGN_ATTRS.FORM_DEFINITION_ID_VALUE} eq '${formDefinitionId}'` +
      ` and ${FORM_DESIGN_ATTRS.IS_ACTIVE} eq true&$top=1`,
    );
    return response.value[0];
  }

  private async fetchTabIds(formDefinitionId: string): Promise<string[]> {
    const tabAttr = FORM_HIERARCHY_ATTRS.TAB_FORM_DEFINITION_ID_VALUE;
    const tabs = await this.crmFetch<ODataCollection<{ qdb_form_tabid: string }>>(
      `/qdb_form_tabs?$filter=${tabAttr} eq '${formDefinitionId}'&$select=${FORM_HIERARCHY_ATTRS.TAB_ID}`,
    );
    return tabs.value.map((t) => t.qdb_form_tabid);
  }

  private async fetchSectionIds(tabIds: string[]): Promise<string[]> {
    if (tabIds.length === 0) return [];
    const filter = tabIds
      .map((id) => `${FORM_HIERARCHY_ATTRS.SECTION_TAB_ID_VALUE} eq '${id}'`)
      .join(' or ');
    const sections = await this.crmFetch<ODataCollection<{ qdb_form_sectionid: string }>>(
      `/qdb_form_sections?$filter=(${filter})&$select=${FORM_HIERARCHY_ATTRS.SECTION_ID}`,
    );
    return sections.value.map((s) => s.qdb_form_sectionid);
  }

  private async fetchFieldIds(sectionIds: string[]): Promise<string[]> {
    if (sectionIds.length === 0) return [];
    const filter = sectionIds
      .map((id) => `${FORM_HIERARCHY_ATTRS.FIELD_SECTION_ID_VALUE} eq '${id}'`)
      .join(' or ');
    const fields = await this.crmFetch<ODataCollection<{ qdb_form_fieldid: string }>>(
      `/qdb_form_fields?$filter=(${filter})&$select=${FORM_HIERARCHY_ATTRS.FIELD_ID}`,
    );
    return fields.value.map((f) => f.qdb_form_fieldid);
  }

  private async resolveFormHierarchyIds(
    formDefinitionId: string,
  ): Promise<{ sectionIds: string[]; fieldIds: string[] }> {
    const tabIds = await this.fetchTabIds(formDefinitionId);
    const sectionIds = await this.fetchSectionIds(tabIds);
    const fieldIds = await this.fetchFieldIds(sectionIds);
    return { sectionIds, fieldIds };
  }

  private async fetchSectionDesigns(sectionIds: string[]): Promise<Record<string, SectionDesign>> {
    if (sectionIds.length === 0) return {};
    const sectionFilter = sectionIds
      .map((id) => `${SECTION_DESIGN_ATTRS.FORM_SECTION_ID_VALUE} eq '${id}'`)
      .join(' or ');
    const response = await this.crmFetch<ODataCollection<RawSectionDesign>>(
      `/qdb_section_designs?$select=${SECTION_DESIGN_SELECT}` +
      `&$filter=(${sectionFilter}) and ${SECTION_DESIGN_ATTRS.IS_ACTIVE} eq true`,
    );
    return Object.fromEntries(
      response.value.map((s) => [s._qdb_form_section_id_value, mapSectionDesign(s)]),
    );
  }

  private async fetchFieldDesigns(fieldIds: string[]): Promise<Record<string, FieldDesign>> {
    if (fieldIds.length === 0) return {};
    const fieldFilter = fieldIds
      .map((id) => `${FIELD_DESIGN_ATTRS.FORM_FIELD_ID_VALUE} eq '${id}'`)
      .join(' or ');
    const response = await this.crmFetch<ODataCollection<RawFieldDesign>>(
      `/qdb_field_designs?$select=${FIELD_DESIGN_SELECT}` +
      `&$filter=(${fieldFilter}) and ${FIELD_DESIGN_ATTRS.IS_ACTIVE} eq true`,
    );
    return Object.fromEntries(
      response.value.map((f) => [f._qdb_form_field_id_value, mapFieldDesign(f)]),
    );
  }

  private async fetchButtonDesigns(
    formDefinitionId: string,
  ): Promise<Record<ButtonType, ButtonDesign | undefined>> {
    const response = await this.crmFetch<ODataCollection<RawButtonDesign>>(
      `/qdb_button_designs?$select=${BUTTON_DESIGN_SELECT}` +
      `&$filter=${BUTTON_DESIGN_ATTRS.FORM_DEFINITION_ID_VALUE} eq '${formDefinitionId}'` +
      ` and ${BUTTON_DESIGN_ATTRS.IS_ACTIVE} eq true`,
    );
    const result = buildEmptyButtonDesigns();
    for (const raw of response.value) {
      const buttonType = mapButtonType(raw.qdb_button_type);
      result[buttonType] = mapButtonDesign(raw);
    }
    return result;
  }

  private async fetchLayoutGrid(formDesignId: string): Promise<LayoutGrid[]> {
    const response = await this.crmFetch<ODataCollection<RawLayoutGrid>>(
      `/qdb_layout_grids?$select=${LAYOUT_GRID_SELECT}` +
      `&$filter=${LAYOUT_GRID_ATTRS.FORM_DESIGN_ID_VALUE} eq '${formDesignId}'`,
    );
    return response.value.map(mapLayoutGrid);
  }

  private extractOrDefault<T>(
    result: PromiseSettledResult<T>,
    fallback: T,
    label: string,
    formDefinitionId: string,
  ): T {
    if (result.status === 'fulfilled') return result.value;
    logger.warn({ formDefinitionId, label, error: result.reason }, 'Design sub-query failed — using fallback');
    return fallback;
  }
}

function buildEmptyButtonDesigns(): Record<ButtonType, ButtonDesign | undefined> {
  return { Submit: undefined, SaveDraft: undefined, Cancel: undefined };
}

/** Accepts a standard GUID, optionally brace-wrapped (Dataverse record id). */
const GUID_PATTERN = /^\{?[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\}?$/;

/** Thrown when assembleDesignPayload is called with a non-GUID form definition id (SEC-10). */
export class InvalidFormDefinitionIdError extends Error {
  constructor(public readonly value: string) {
    super(`Invalid form definition id (expected GUID): ${value}`);
    this.name = 'InvalidFormDefinitionIdError';
  }
}

/** Thrown when an assembled DesignPayload exceeds the render-cache size cap (NFR-004). */
export class PayloadSizeExceededError extends Error {
  constructor(public readonly formDefinitionId: string, public readonly byteLength: number) {
    super(`DesignPayload for form ${formDefinitionId} exceeds 512 KB cap (${byteLength} bytes)`);
    this.name = 'PayloadSizeExceededError';
  }
}

function enforcePayloadSizeCap(payload: DesignPayload, formDefinitionId: string): void {
  const byteLength = JSON.stringify(payload).length;
  if (byteLength > DESIGN_PAYLOAD_SIZE_CAP) {
    throw new PayloadSizeExceededError(formDefinitionId, byteLength);
  }
}
