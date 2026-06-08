import { CrmBaseService } from './CrmBaseService.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';

// ── Types ──────────────────────────────────────────────────────

export interface CreateInfoCardItemInput {
  infoCardSectionId: string;
  displayOrder: number;
  itemTitle: string;
  itemDescription?: string;
  iconReference?: string;
  downloadUrl?: string;
}

export type UpdateInfoCardItemInput = Partial<Omit<CreateInfoCardItemInput, 'infoCardSectionId'>>;

export class CrmInfoCardAdminService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async createInfoCardItem(
    input: CreateInfoCardItemInput,
    userId: string,
    correlationId: string,
  ): Promise<string> {
    validateDownloadUrl(input.downloadUrl);

    const payload: Record<string, unknown> = {
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${input.infoCardSectionId})`,
      qdb_display_order: input.displayOrder,
      qdb_item_title: input.itemTitle,
    };

    if (input.itemDescription !== undefined) payload.qdb_item_description = input.itemDescription;
    if (input.iconReference !== undefined) payload.qdb_icon_reference = input.iconReference;
    if (input.downloadUrl !== undefined) payload.qdb_download_url = input.downloadUrl;

    const result = await this.crmFetch<{ qdb_info_card_itemid: string }>(
      '/qdb_info_card_items',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { Prefer: 'return=representation' },
      },
    );

    logger.info(
      { correlationId, userId, itemId: result.qdb_info_card_itemid, operation: 'createInfoCardItem' },
      'Admin created info card item',
    );

    return result.qdb_info_card_itemid;
  }

  async updateInfoCardItem(
    itemId: string,
    input: UpdateInfoCardItemInput,
    userId: string,
    correlationId: string,
  ): Promise<void> {
    validateDownloadUrl(input.downloadUrl);

    const payload: Record<string, unknown> = {};
    if (input.displayOrder !== undefined) payload.qdb_display_order = input.displayOrder;
    if (input.itemTitle !== undefined) payload.qdb_item_title = input.itemTitle;
    if (input.itemDescription !== undefined) payload.qdb_item_description = input.itemDescription;
    if (input.iconReference !== undefined) payload.qdb_icon_reference = input.iconReference;
    if (input.downloadUrl !== undefined) payload.qdb_download_url = input.downloadUrl;

    await this.crmFetch(`/qdb_info_card_items(${itemId})`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    logger.info(
      { correlationId, userId, itemId, operation: 'updateInfoCardItem' },
      'Admin updated info card item',
    );
  }
}

/**
 * Validates that a downloadUrl, when provided, is an absolute HTTPS URL.
 * CEO condition ADD-001-C3: HTTP URLs, relative paths, and malformed strings all fail.
 */
function validateDownloadUrl(value: string | undefined | null): void {
  if (!value) return;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ValidationError(
      'downloadUrl is not a valid absolute URL. Provide a full HTTPS URL (e.g. https://example.com/file.pdf).',
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new ValidationError(
      'downloadUrl must use the HTTPS protocol. HTTP URLs and non-HTTPS schemes are not permitted.',
    );
  }
}
