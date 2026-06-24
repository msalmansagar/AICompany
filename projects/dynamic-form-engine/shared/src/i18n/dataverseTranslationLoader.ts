/**
 * dataverseTranslationLoader
 *
 * DFE architecture note (AG-003): the backend resolves all translations server-side
 * and returns a fully resolved FormDefinition. i18next is used only for static UI
 * chrome strings (toggle labels, loading text, error banners) in the frontend packages.
 *
 * This loader adapter is the parse callback for i18next-http-backend when the frontend
 * needs to load static namespace strings from the backend. For form content strings,
 * the frontend calls GET /api/forms/:code/metadata?lang=XX and uses the resolved DTO
 * directly — it does not route form strings through i18next namespaces.
 */

export function parseDataverseTranslationResponse(
  data: string,
  _url: string,
): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(data);
    if (isTranslationRecord(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function isTranslationRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}
