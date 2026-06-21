// ---------------------------------------------------------------------------
// Component Registry domain types — DXP-P1-001
// ---------------------------------------------------------------------------

export interface ComponentDefinitionSummary {
  id: string;
  name: string;
  displayName: string;
  displayNameAr: string | null;
  category: number;
  renderTargets: string[];
  createdOn: string;
  modifiedOn: string;
}

export interface ComponentDefinitionDetail extends ComponentDefinitionSummary {
  descriptionEn: string | null;
  descriptionAr: string | null;
  isActive: boolean;
}

export interface ComponentVersionSummary {
  id: string;
  versionNumber: string;
  isLatest: boolean;
  changeLog: string | null;
  bundleUrl: string | null;
  deprecatedOn: string | null;
  createdOn: string;
  definitionId: string;
}

export interface ComponentVersionDetail extends ComponentVersionSummary {
  propsSchema: string | null;
  defaultProps: string | null;
}

// ---------------------------------------------------------------------------
// Category lookup — value set matches Dataverse option set codes
// ---------------------------------------------------------------------------

export const COMPONENT_CATEGORIES: Record<number, { en: string; ar: string }> = {
  860004001: { en: 'Dashboard Widget',   ar: 'عنصر واجهة لوحة التحكم' },
  860004002: { en: 'Form Component',     ar: 'مكوّن النموذج'           },
  860004003: { en: 'Navigation Element', ar: 'عنصر التنقل'            },
  860004004: { en: 'Data Display',       ar: 'عرض البيانات'           },
  860004005: { en: 'Action Button',      ar: 'زر الإجراء'             },
};

// ---------------------------------------------------------------------------
// API list response envelope
// ---------------------------------------------------------------------------

export interface ComponentDefinitionListResponse {
  items: ComponentDefinitionSummary[];
  total: number;
  top: number;
  skip: number;
}

export interface ComponentVersionListResponse {
  items: ComponentVersionSummary[];
  total: number;
  top: number;
  skip: number;
}
