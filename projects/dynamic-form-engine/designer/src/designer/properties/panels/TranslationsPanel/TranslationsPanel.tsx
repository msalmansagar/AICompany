// TranslationsPanel — render translatable string fields for a given CRM record.
//
// Mode selection:
//   CRM mode  — language list read from qdb_language_config via Xrm.WebApi.
//               Translation CRUD via CrmTranslationWriteService (IWebApiAdapter).
//               Cache invalidation is a no-op (no Node backend to invalidate).
//   REST mode — language list and translation CRUD via the Node backend API.
//               Cache invalidation calls POST /api/internal/cache/invalidate.

import React, { useCallback, useContext, useEffect, useState } from 'react';
import { MessageBar, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { TRANSLATABLE_FIELDS, FIELD_LABEL } from '@/constants/translatableFields';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { LANGUAGE_CONFIG_ATTRS } from '@/constants/attributeNames';
import { CrmTranslationWriteService, TranslationWriteService } from '@/services/TranslationWriteService';
import type { SavedTranslation } from '@/services/TranslationWriteService';
import { TranslatableStringRow } from './TranslatableStringRow';
import type { LanguageConfig, TranslationEntry } from './TranslatableStringRow';
import { CrmContext } from '@/app/App';

const LANGUAGES_ENDPOINT = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/languages`;

interface TranslationsPanelProps {
  entityName: string;
  recordId: string;
  entityLabel: string;
  formCode: string;
}

type TranslationsMap = Map<string, Map<string, TranslationEntry>>;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  completionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  emptyState: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  fieldList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
});

export function TranslationsPanel({
  entityName,
  recordId,
  formCode,
}: TranslationsPanelProps): React.ReactElement {
  const styles = useStyles();
  const crmContext = useContext(CrmContext);

  const [languages, setLanguages] = useState<LanguageConfig[]>([]);
  const [translationsMap, setTranslationsMap] = useState<TranslationsMap>(new Map());
  const [loadingState, setLoadingState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const translatableFields = TRANSLATABLE_FIELDS[entityName] ?? [];

  // Build the appropriate write service based on the active context mode.
  const isCrmMode = crmContext !== null;
  const crmWriteService = isCrmMode && crmContext
    ? new CrmTranslationWriteService(crmContext.getWebApi())
    : null;
  const restWriteService = !isCrmMode ? new TranslationWriteService(null) : null;

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, recordId]);

  async function loadData(): Promise<void> {
    setLoadingState('loading');
    setErrorMessage(null);

    try {
      const [loadedLangs, savedTranslations] = await Promise.all([
        fetchLanguages(),
        fetchTranslationsForRecord(entityName, recordId),
      ]);

      setLanguages(loadedLangs);
      setTranslationsMap(buildTranslationsMap(savedTranslations));
      setLoadingState('loaded');
    } catch {
      setErrorMessage('Failed to load translations. Please try again.');
      setLoadingState('error');
    }
  }

  async function fetchLanguages(): Promise<LanguageConfig[]> {
    if (isCrmMode && crmContext) {
      return fetchLanguagesFromCrm(crmContext.getWebApi());
    }
    return fetchLanguagesFromBackend();
  }

  async function fetchTranslationsForRecord(
    entity: string,
    record: string,
  ): Promise<SavedTranslation[]> {
    if (crmWriteService) {
      return crmWriteService.fetchTranslationsForRecord(entity, record);
    }
    if (restWriteService) {
      return restWriteService.fetchTranslationsForRecord(entity, record);
    }
    return [];
  }

  const handleSave = useCallback(
    async (fieldName: string, languageCode: string, value: string, _existingId?: string): Promise<void> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        let saved: SavedTranslation;
        if (crmWriteService) {
          saved = await crmWriteService.upsertTranslation({
            entityName,
            recordId,
            fieldName,
            languageCode,
            value,
          });
        } else if (restWriteService) {
          saved = await restWriteService.upsertTranslation({
            entityName,
            recordId,
            fieldName,
            languageCode,
            value,
          });
          // Cache invalidation only applies in REST/backend mode — no-op in CRM mode.
          await triggerRestCacheInvalidation(formCode);
        } else {
          return;
        }
        setTranslationsMap((prev) => updateTranslationsMap(prev, fieldName, languageCode, saved));
      } catch {
        setSaveError(`Could not save the ${languageCode.toUpperCase()} translation. Please try again.`);
      } finally {
        setIsSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityName, recordId, formCode, crmWriteService, restWriteService],
  );

  const handleDelete = useCallback(
    async (fieldName: string, translationId: string): Promise<void> => {
      setIsSaving(true);
      setSaveError(null);
      try {
        if (crmWriteService) {
          await crmWriteService.deleteTranslation(translationId);
        } else if (restWriteService) {
          await restWriteService.deleteTranslation(translationId);
          await triggerRestCacheInvalidation(formCode);
        }
        setTranslationsMap((prev) => removeFromTranslationsMap(prev, fieldName, translationId));
      } catch {
        setSaveError('Could not remove the translation. Please try again.');
      } finally {
        setIsSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formCode, crmWriteService, restWriteService],
  );

  if (loadingState === 'loading') {
    return <Spinner size="tiny" label="Loading translations..." />;
  }

  if (loadingState === 'error') {
    return <MessageBar intent="error">{errorMessage}</MessageBar>;
  }

  if (translatableFields.length === 0) {
    return (
      <Text size={200} className={styles.emptyState}>
        No translatable fields for this entity.
      </Text>
    );
  }

  const nonDefaultLangs = languages.filter((l) => !l.isDefault);
  const completionCount = countTranslated(translationsMap, nonDefaultLangs);
  const totalCount = translatableFields.length * nonDefaultLangs.length;

  return (
    <div className={styles.root}>
      {saveError && (
        <MessageBar intent="error">{saveError}</MessageBar>
      )}
      {nonDefaultLangs.length > 0 && (
        <div className={styles.completionBar}>
          <Text size={200}>
            {completionCount} of {totalCount} strings translated
          </Text>
        </div>
      )}
      <div className={styles.fieldList}>
        {translatableFields.map((fieldName) => (
          <TranslatableStringRow
            key={fieldName}
            fieldName={fieldName}
            fieldLabel={FIELD_LABEL[fieldName] ?? fieldName}
            languages={languages}
            translations={translationsMap.get(fieldName) ?? new Map()}
            onSave={(langCode, value, existingId) =>
              handleSave(fieldName, langCode, value, existingId)
            }
            onDelete={(translationId) => handleDelete(fieldName, translationId)}
            isSaving={isSaving}
          />
        ))}
      </div>
    </div>
  );
}

// ── Language fetching ─────────────────────────────────────────────────────────

import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

async function fetchLanguagesFromCrm(webApi: IWebApiAdapter): Promise<LanguageConfig[]> {
  const select = [
    LANGUAGE_CONFIG_ATTRS.LANGUAGE_CODE,
    LANGUAGE_CONFIG_ATTRS.DISPLAY_NAME,
    LANGUAGE_CONFIG_ATTRS.DISPLAY_NAME_NATIVE,
    LANGUAGE_CONFIG_ATTRS.IS_DEFAULT,
    LANGUAGE_CONFIG_ATTRS.RTL_DIRECTION,
    LANGUAGE_CONFIG_ATTRS.DISPLAY_ORDER,
    LANGUAGE_CONFIG_ATTRS.IS_ACTIVE,
  ].join(',');

  const filter = encodeURIComponent(`${LANGUAGE_CONFIG_ATTRS.IS_ACTIVE} eq true`);
  const orderBy = encodeURIComponent(`${LANGUAGE_CONFIG_ATTRS.DISPLAY_ORDER} asc`);

  try {
    const result = await webApi.retrieveMultipleRecords(
      ENTITY_NAMES.LANGUAGE_CONFIG,
      `?$select=${select}&$filter=${filter}&$orderby=${orderBy}`,
    );
    return result.entities.map(mapRawLanguageConfig);
  } catch {
    // WHY: language config query failure must not block the panel — fall back to
    // English-only so the designer remains functional even on minimal installs.
    return [englishFallback()];
  }
}

async function fetchLanguagesFromBackend(): Promise<LanguageConfig[]> {
  const response = await fetch(LANGUAGES_ENDPOINT);
  if (!response.ok) throw new Error(`Failed to fetch languages: ${response.status}`);
  const envelope = await response.json() as { success: boolean; data: LanguageConfig[] };
  return envelope.data;
}

// ── Cache invalidation (REST / backend mode only) ─────────────────────────────

async function triggerRestCacheInvalidation(formCode: string): Promise<void> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  await fetch(`${base}/api/internal/cache/invalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formCode }),
  }).catch(() => {
    // WHY: cache invalidation is best-effort; 5-min TTL is the backstop (AG-002).
    // In CRM mode this function is never called — the Node backend cache does not
    // exist on-prem so there is nothing to invalidate.
  });
}

// ── Map helpers ───────────────────────────────────────────────────────────────

function mapRawLanguageConfig(raw: Record<string, unknown>): LanguageConfig {
  return {
    code: String(raw[LANGUAGE_CONFIG_ATTRS.LANGUAGE_CODE] ?? ''),
    displayName: String(raw[LANGUAGE_CONFIG_ATTRS.DISPLAY_NAME] ?? ''),
    isDefault: Boolean(raw[LANGUAGE_CONFIG_ATTRS.IS_DEFAULT] ?? false),
    isRtl: Boolean(raw[LANGUAGE_CONFIG_ATTRS.RTL_DIRECTION] ?? false),
  };
}

function englishFallback(): LanguageConfig {
  return { code: 'en', displayName: 'English', isDefault: true, isRtl: false };
}

function buildTranslationsMap(translations: SavedTranslation[]): TranslationsMap {
  const map: TranslationsMap = new Map();
  for (const t of translations) {
    if (!map.has(t.fieldName)) {
      map.set(t.fieldName, new Map());
    }
    map.get(t.fieldName)!.set(t.languageCode, { value: t.value, translationId: t.translationId });
  }
  return map;
}

function updateTranslationsMap(
  prev: TranslationsMap,
  fieldName: string,
  languageCode: string,
  saved: SavedTranslation,
): TranslationsMap {
  const next = new Map(prev);
  if (!next.has(fieldName)) next.set(fieldName, new Map());
  const fieldMap = new Map(next.get(fieldName)!);
  fieldMap.set(languageCode, { value: saved.value, translationId: saved.translationId });
  next.set(fieldName, fieldMap);
  return next;
}

function removeFromTranslationsMap(
  prev: TranslationsMap,
  fieldName: string,
  translationId: string,
): TranslationsMap {
  const next = new Map(prev);
  const fieldMap = next.get(fieldName);
  if (!fieldMap) return next;
  const newFieldMap = new Map(fieldMap);
  for (const [code, entry] of newFieldMap) {
    if (entry.translationId === translationId) {
      newFieldMap.delete(code);
      break;
    }
  }
  next.set(fieldName, newFieldMap);
  return next;
}

function countTranslated(map: TranslationsMap, nonDefaultLangs: LanguageConfig[]): number {
  let count = 0;
  for (const fieldMap of map.values()) {
    for (const lang of nonDefaultLangs) {
      if (fieldMap.has(lang.code)) count++;
    }
  }
  return count;
}
