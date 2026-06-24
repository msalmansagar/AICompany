export interface LanguageConfig {
  code: string;
  displayName: string;
  displayNameNative?: string;
  lcid?: number;
  isDefault: boolean;
  isRtl: boolean;
  displayOrder: number;
}

// key format: `${entityName}:${recordId}:${fieldName}`
export type TranslationMapKey = `${string}:${string}:${string}`;
export type TranslationMap = Map<TranslationMapKey, string>;
