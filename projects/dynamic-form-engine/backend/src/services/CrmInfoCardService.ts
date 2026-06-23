import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';
import { CrmApiError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

// ── Types ──────────────────────────────────────────────────────

export interface InfoCardItem {
  itemId: string;
  displayOrder: number;
  itemTitle: string;
  itemDescription: string | null;
  iconReference: string | null;
  downloadUrl: string | null;
}

export interface InfoCardSection {
  sectionId: string;
  displayOrder: number;
  sectionTitle: string | null;
  sectionType: 'numbered-steps' | 'icon-list' | 'download-list';
  noteText: string | null;
  items: InfoCardItem[];
}

export interface InfoCardScreen {
  screenId: string;
  displayOrder: number;
  iconUrl: string | null;
  iconAltText: string | null;
  heading: string;
  subHeading: string | null;
  sections: InfoCardSection[];
}

interface ODataCollection<T> {
  value: T[];
}

interface RawInfoCardScreen {
  qdb_info_card_screenid: string;
  qdb_display_order: number;
  qdb_icon_url?: string;
  qdb_icon_alt_text?: string;
  qdb_heading: string;
  qdb_sub_heading?: string;
}

interface RawInfoCardSection {
  qdb_info_card_sectionid: string;
  _qdb_info_card_screen_id_value: string;
  qdb_display_order: number;
  qdb_section_title?: string;
  qdb_section_type: number;
  qdb_note_text?: string;
}

interface RawInfoCardItem {
  qdb_info_card_itemid: string;
  _qdb_info_card_section_id_value: string;
  qdb_display_order: number;
  qdb_item_title: string;
  qdb_item_description?: string;
  qdb_icon_reference?: string;
  qdb_download_url?: string;
}

// ── Duplicate-key error code returned by Dataverse on alternate-key violation ──
// CEO condition BC-006: treat this as a success — concurrent-open race condition.
const DATAVERSE_DUPLICATE_ALTERNATE_KEY_CODE = '0x80060892';

export class CrmInfoCardService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async fetchInfoCardScreens(
    formDefinitionId: string,
    correlationId: string,
  ): Promise<InfoCardScreen[]> {
    const screensResponse = await this.crmFetch<ODataCollection<RawInfoCardScreen>>(
      `/qdb_info_card_screens?$filter=_qdb_form_definition_id_value eq '${formDefinitionId}' and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const screens = screensResponse.value;
    if (screens.length === 0) return [];

    const screenIds = screens.map((s) => s.qdb_info_card_screenid);
    const sectionsMap = await this.fetchSectionsWithItems(screenIds, correlationId);

    return screens.map((screen) => ({
      screenId: screen.qdb_info_card_screenid,
      displayOrder: screen.qdb_display_order,
      iconUrl: screen.qdb_icon_url ?? null,
      iconAltText: screen.qdb_icon_alt_text ?? null,
      heading: screen.qdb_heading,
      subHeading: screen.qdb_sub_heading ?? null,
      sections: sectionsMap.get(screen.qdb_info_card_screenid) ?? [],
    }));
  }

  private async fetchSectionsWithItems(
    screenIds: string[],
    correlationId: string,
  ): Promise<Map<string, InfoCardSection[]>> {
    const filter = screenIds.map((id) => `_qdb_info_card_screen_id_value eq '${id}'`).join(' or ');
    const sectionsResponse = await this.crmFetch<ODataCollection<RawInfoCardSection>>(
      `/qdb_info_card_sections?$filter=(${filter}) and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const sections = sectionsResponse.value;
    if (sections.length === 0) return new Map();

    const sectionIds = sections.map((s) => s.qdb_info_card_sectionid);
    const itemsMap = await this.fetchItemsBySectionIds(sectionIds, correlationId);

    const result = new Map<string, InfoCardSection[]>();
    for (const section of sections) {
      const screenId = section._qdb_info_card_screen_id_value;
      const existing = result.get(screenId) ?? [];
      existing.push({
        sectionId: section.qdb_info_card_sectionid,
        displayOrder: section.qdb_display_order,
        sectionTitle: section.qdb_section_title ?? null,
        sectionType: this.mapSectionType(section.qdb_section_type),
        noteText: section.qdb_note_text ?? null,
        items: itemsMap.get(section.qdb_info_card_sectionid) ?? [],
      });
      result.set(screenId, existing);
    }

    return result;
  }

  private async fetchItemsBySectionIds(
    sectionIds: string[],
    _correlationId: string,
  ): Promise<Map<string, InfoCardItem[]>> {
    const filter = sectionIds.map((id) => `_qdb_info_card_section_id_value eq '${id}'`).join(' or ');
    const itemsResponse = await this.crmFetch<ODataCollection<RawInfoCardItem>>(
      `/qdb_info_card_items?$filter=(${filter}) and statecode eq 0&$orderby=qdb_display_order asc`,
    );

    const result = new Map<string, InfoCardItem[]>();
    for (const item of itemsResponse.value) {
      const sectionId = item._qdb_info_card_section_id_value;
      const existing = result.get(sectionId) ?? [];
      existing.push({
        itemId: item.qdb_info_card_itemid,
        displayOrder: item.qdb_display_order,
        itemTitle: item.qdb_item_title,
        itemDescription: item.qdb_item_description ?? null,
        iconReference: item.qdb_icon_reference ?? null,
        downloadUrl: item.qdb_download_url ?? null,
      });
      result.set(sectionId, existing);
    }

    return result;
  }

  // Fire-and-forget: record is async; errors are logged but not rethrown.
  // CEO condition BC-006: duplicate alternate key (0x80060892) is treated as success.
  async recordInfoCardView(
    userAadObjectId: string,
    formDefinitionId: string,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.crmFetch('/qdb_info_card_view_records', {
        method: 'POST',
        body: JSON.stringify({
          qdb_user_aad_object_id: userAadObjectId,
          'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formDefinitionId})`,
          qdb_viewed_on: new Date().toISOString(),
        }),
      });

      logger.info(
        { correlationId, formDefinitionId, operation: 'recordInfoCardView' },
        'info_card_view_recorded',
      );
    } catch (error) {
      if (this.isDuplicateAlternateKeyError(error)) {
        // Race condition: another concurrent request already created the record.
        // Per CEO condition BC-006, this is not an error.
        logger.info(
          { correlationId, formDefinitionId, operation: 'recordInfoCardView' },
          'info_card_view_record_already_exists — treating as success',
        );
        return;
      }

      logger.error(
        { correlationId, formDefinitionId, error, operation: 'recordInfoCardView' },
        'Failed to record info card view — continuing (fire-and-forget)',
      );
    }
  }

  async hasUserViewedInfoCard(
    userAadObjectId: string,
    formDefinitionId: string,
    correlationId: string,
  ): Promise<boolean> {
    const filter = [
      `qdb_user_aad_object_id eq '${userAadObjectId}'`,
      `_qdb_form_definition_id_value eq '${formDefinitionId}'`,
    ].join(' and ');

    const response = await this.crmFetch<ODataCollection<{ qdb_info_card_view_recordid: string }>>(
      `/qdb_info_card_view_records?$filter=${encodeURIComponent(filter)}&$top=1&$select=qdb_info_card_view_recordid`,
    );

    const hasViewed = response.value.length > 0;

    logger.info(
      { correlationId, formDefinitionId, hasViewed, operation: 'hasUserViewedInfoCard' },
      'info_card_view_status_check',
    );

    return hasViewed;
  }

  private mapSectionType(code: number): 'numbered-steps' | 'icon-list' | 'download-list' {
    const map: Record<number, 'numbered-steps' | 'icon-list' | 'download-list'> = {
      100000000: 'numbered-steps',
      100000001: 'icon-list',
      100000002: 'download-list',
    };
    return map[code] ?? 'numbered-steps';
  }

  private isDuplicateAlternateKeyError(error: unknown): boolean {
    if (!(error instanceof CrmApiError)) return false;
    return (
      error.message.includes(DATAVERSE_DUPLICATE_ALTERNATE_KEY_CODE) ||
      error.crmStatusCode === 412
    );
  }
}
