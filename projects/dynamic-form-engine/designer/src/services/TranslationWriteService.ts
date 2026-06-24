// TranslationWriteService — read/write qdb_translation records.
//
// Two operating modes, selected at construction time:
//   CRM mode  — uses IWebApiAdapter (Xrm.WebApi on-prem or Dataverse online).
//               No Node backend required. Works inside any UCI web resource.
//   REST mode — forwards to the Node backend translation API via fetch.
//               Used for standalone dev when VITE_USE_REST_API=true.
//
// WHY split: the Node backend exposes an alternate-key PATCH endpoint that the
// on-prem Xrm.WebApi cannot replicate directly, so on-prem upsert is
// implemented as a query-first-then-create-or-update pattern.

import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { TRANSLATION_ATTRS } from '@/constants/attributeNames';

// ── Public types (shared between both modes) ──────────────────────────────────

export interface UpsertTranslationRequest {
  entityName: string;
  recordId: string;
  fieldName: string;
  languageCode: string;
  value: string;
}

export interface SavedTranslation {
  translationId: string;
  entityName: string;
  recordId: string;
  fieldName: string;
  languageCode: string;
  value: string;
}

export class TranslationWriteServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TranslationWriteServiceError';
  }
}

// ── CRM-mode implementation ───────────────────────────────────────────────────

const TRANSLATION_SELECT = [
  TRANSLATION_ATTRS.ID,
  TRANSLATION_ATTRS.ENTITY_NAME,
  TRANSLATION_ATTRS.RECORD_ID,
  TRANSLATION_ATTRS.FIELD_NAME,
  TRANSLATION_ATTRS.LANGUAGE_CODE,
  TRANSLATION_ATTRS.TRANSLATED_VALUE,
].join(',');

export class CrmTranslationWriteService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async fetchTranslationsForRecord(
    entityName: string,
    recordId: string,
  ): Promise<SavedTranslation[]> {
    const safeEntity = entityName.replace(/'/g, "''");
    const safeRecord = recordId.replace(/'/g, "''");
    const filter =
      `${TRANSLATION_ATTRS.ENTITY_NAME} eq '${safeEntity}' and ` +
      `${TRANSLATION_ATTRS.RECORD_ID} eq '${safeRecord}' and ` +
      `${TRANSLATION_ATTRS.IS_ACTIVE} eq true`;

    const result = await this.webApi.retrieveMultipleRecords(
      ENTITY_NAMES.TRANSLATION,
      `?$select=${TRANSLATION_SELECT}&$filter=${encodeURIComponent(filter)}`,
    );

    return result.entities.map(mapRawTranslation);
  }

  async upsertTranslation(req: UpsertTranslationRequest): Promise<SavedTranslation> {
    const existing = await this.findExistingTranslation(req);
    if (existing !== null) {
      await this.webApi.updateRecord(ENTITY_NAMES.TRANSLATION, existing.translationId, {
        [TRANSLATION_ATTRS.TRANSLATED_VALUE]: req.value,
        [TRANSLATION_ATTRS.IS_ACTIVE]: true,
      });
      return { ...existing, value: req.value };
    }

    const created = await this.webApi.createRecord(ENTITY_NAMES.TRANSLATION, {
      [TRANSLATION_ATTRS.ENTITY_NAME]: req.entityName,
      [TRANSLATION_ATTRS.RECORD_ID]: req.recordId,
      [TRANSLATION_ATTRS.FIELD_NAME]: req.fieldName,
      [TRANSLATION_ATTRS.LANGUAGE_CODE]: req.languageCode,
      [TRANSLATION_ATTRS.TRANSLATED_VALUE]: req.value,
      [TRANSLATION_ATTRS.IS_ACTIVE]: true,
    });

    return {
      translationId: created.id,
      entityName: req.entityName,
      recordId: req.recordId,
      fieldName: req.fieldName,
      languageCode: req.languageCode,
      value: req.value,
    };
  }

  async deleteTranslation(translationId: string): Promise<void> {
    await this.webApi.deleteRecord(ENTITY_NAMES.TRANSLATION, translationId);
  }

  private async findExistingTranslation(
    req: UpsertTranslationRequest,
  ): Promise<SavedTranslation | null> {
    const safeEntity = req.entityName.replace(/'/g, "''");
    const safeRecord = req.recordId.replace(/'/g, "''");
    const safeField = req.fieldName.replace(/'/g, "''");
    const safeLang = req.languageCode.replace(/'/g, "''");

    const filter =
      `${TRANSLATION_ATTRS.ENTITY_NAME} eq '${safeEntity}' and ` +
      `${TRANSLATION_ATTRS.RECORD_ID} eq '${safeRecord}' and ` +
      `${TRANSLATION_ATTRS.FIELD_NAME} eq '${safeField}' and ` +
      `${TRANSLATION_ATTRS.LANGUAGE_CODE} eq '${safeLang}'`;

    const result = await this.webApi.retrieveMultipleRecords(
      ENTITY_NAMES.TRANSLATION,
      `?$select=${TRANSLATION_SELECT}&$filter=${encodeURIComponent(filter)}&$top=1`,
    );

    if (result.entities.length === 0) return null;
    return mapRawTranslation(result.entities[0]);
  }
}

// ── REST-mode implementation (standalone dev / Node backend path) ─────────────

const TRANSLATIONS_BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/design/translations`;

export class TranslationWriteService {
  constructor(private readonly authToken: string | null = null) {}

  async fetchTranslationsForRecord(
    entityName: string,
    recordId: string,
  ): Promise<SavedTranslation[]> {
    const params = new URLSearchParams({ entityName, recordId });
    return this.apiRequest<SavedTranslation[]>(`?${params.toString()}`, { method: 'GET' });
  }

  async upsertTranslation(req: UpsertTranslationRequest): Promise<SavedTranslation> {
    return this.apiRequest<SavedTranslation>('', {
      method: 'PUT',
      body: JSON.stringify(req),
    });
  }

  async deleteTranslation(translationId: string): Promise<void> {
    await this.apiRequest<void>(`/${translationId}`, { method: 'DELETE' });
  }

  private async apiRequest<T>(path: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${TRANSLATIONS_BASE}${path}`, { ...init, headers });

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new TranslationWriteServiceError(
        `Translations API ${init.method ?? 'GET'} failed: ${response.status} ${body}`,
        response.status,
      );
    }

    const envelope = await response.json() as { success: boolean; data: T; error?: { message: string } };
    if (!envelope.success) {
      throw new TranslationWriteServiceError(
        envelope.error?.message ?? 'Translations API returned error',
        response.status,
      );
    }

    return envelope.data;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function mapRawTranslation(raw: Record<string, unknown>): SavedTranslation {
  return {
    translationId: String(raw[TRANSLATION_ATTRS.ID] ?? ''),
    entityName: String(raw[TRANSLATION_ATTRS.ENTITY_NAME] ?? ''),
    recordId: String(raw[TRANSLATION_ATTRS.RECORD_ID] ?? ''),
    fieldName: String(raw[TRANSLATION_ATTRS.FIELD_NAME] ?? ''),
    languageCode: String(raw[TRANSLATION_ATTRS.LANGUAGE_CODE] ?? ''),
    value: String(raw[TRANSLATION_ATTRS.TRANSLATED_VALUE] ?? ''),
  };
}
