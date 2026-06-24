/**
 * Client for GET /api/languages.
 * Returns the list of supported languages configured in Dataverse.
 * No auth required (public endpoint per FR-025 / AG-003).
 *
 * The apiClient interceptor unwraps the { success, data } envelope, so
 * callers receive LanguageConfig[] directly (same pattern as formApi).
 */
import type { LanguageConfig } from '@qdb/shared';
import apiClient from './apiClient';

export const languageApi = {
  list: () => apiClient.get<LanguageConfig[]>('/languages'),
};
